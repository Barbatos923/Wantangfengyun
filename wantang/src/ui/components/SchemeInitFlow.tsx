// ===== 计谋发起向导 =====
//
// 从交互菜单选"计谋"后打开。两种计谋的流程：
//   - 拉拢（basic）: pickType → confirm（直接发起）
//   - 离间（complex）: pickType → pickSecondary → pickMethod → confirm
//   - 离间 + 自拟妙计（v2 AI 方法）：
//       pickType → pickSecondary → pickMethod → writeCustom → waitingLlm → confirmCustom → confirm
//
// 订阅 volatile state（characters / currentDate / schemes），按 execute 契约处理 stale。

import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, ModalHeader, Button } from './base';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTurnManager } from '@engine/TurnManager';
import {
  buildSchemeContext,
  calcSchemeLimit,
  getAllSchemeTypes,
  getSchemeType,
  useSchemeStore,
} from '@engine/scheme';
import { CURRY_FAVOR_COST, calcCurryFavorRate } from '@engine/scheme/types/curryFavor';
import { resolveSpymaster } from '@engine/scheme/spymasterCalc';
import {
  ALIENATION_COST,
  ALIENATION_PHASE_DAYS,
  ALIENATION_PHASES,
  calcAlienationInitialRate,
  getAlienationMethodsForUI,
  getValidSecondaryAlienationTargets,
} from '@engine/scheme/types/alienation';
import { executeInitiateScheme } from '@engine/interaction/schemeAction';
import { evaluateCustomSchemeRate, isAiMethodAvailable } from '@engine/scheme/llm';
import type { Character } from '@engine/character/types';

interface SchemeInitFlowProps {
  targetId: string;
  onClose: () => void;
}

type Phase =
  | 'pickType'
  | 'pickSecondary'
  | 'pickMethod'
  | 'writeCustom'      // v2 AI：输入自拟策略
  | 'waitingLlm'       // v2 AI：等待 LLM 评估
  | 'confirmCustom'    // v2 AI：展示评估结果 + 用 / 退抉择
  | 'confirm'
  | 'result';

/**
 * 自拟妙计评估结果缓存：键为 (primaryId, secondaryId, description)。
 * 任一字段变化都会使缓存失效（避免把旧评估值塞给新局面）。
 */
interface CustomEvaluation {
  primaryId: string;
  secondaryId: string;
  description: string;
  rate: number;
}

export default function SchemeInitFlow({ targetId, onClose }: SchemeInitFlowProps) {
  const playerId = useCharacterStore((s) => s.playerId);
  const player = useCharacterStore((s) => playerId ? s.characters.get(playerId) : undefined);
  const target = useCharacterStore((s) => s.characters.get(targetId));
  // 订阅 volatile state（按 execute 契约：弹窗打开期间外部状态变化要触发 useMemo 重算）
  const currentDate = useTurnManager((s) => s.currentDate);
  const schemes = useSchemeStore((s) => s.schemes);
  void currentDate;
  void schemes;

  const [phase, setPhase] = useState<Phase>('pickType');
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [selectedSecondaryId, setSelectedSecondaryId] = useState<string | null>(null);
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  // v2 AI 方法：输入 + 评估缓存 + LLM 状态
  const [customDescription, setCustomDescription] = useState<string>('');
  const [customEvaluation, setCustomEvaluation] = useState<CustomEvaluation | null>(null);
  const [llmError, setLlmError] = useState<string | null>(null);
  // null = 加载中；true/false = 加载完毕
  const [aiMethodAvailable, setAiMethodAvailable] = useState<boolean | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // mount：异步探测 LLM 配置
  useEffect(() => {
    let cancelled = false;
    isAiMethodAvailable().then((ok) => {
      if (!cancelled) setAiMethodAvailable(ok);
    }).catch(() => {
      if (!cancelled) setAiMethodAvailable(false);
    });
    return () => { cancelled = true; };
  }, []);

  // unmount：abort 任何 pending LLM 请求
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  /** 当前 (primary, secondary, description) 与缓存的 key 是否匹配 */
  function isCustomEvaluationFresh(): boolean {
    if (!customEvaluation) return false;
    if (!selectedSecondaryId) return false;
    return customEvaluation.primaryId === targetId
      && customEvaluation.secondaryId === selectedSecondaryId
      && customEvaluation.description === customDescription.trim();
  }

  // 收集所有可显示的计谋类型
  const availableTypes = useMemo(() => {
    if (!player || !target) return [];
    const ctx = buildSchemeContext();
    return getAllSchemeTypes().filter((def) => def.canShow(player, target, ctx));
  }, [player, target]);

  // 拉拢预览
  const curryFavorPreview = useMemo(() => {
    if (!player || !target) return null;
    const ctx = buildSchemeContext();
    const attackSm = resolveSpymaster(player.id, ctx.spymasters, ctx.characters, ctx.vassalIndex);
    return {
      rate: Math.round(calcCurryFavorRate(attackSm.abilities.strategy, target, player.id, ctx)),
      cost: CURRY_FAVOR_COST,
    };
  }, [player, target]);

  // 离间次要目标候选集
  const alienationSecondaries: Character[] = useMemo(() => {
    if (!player || !target) return [];
    if (selectedTypeId !== 'alienation') return [];
    const ctx = buildSchemeContext();
    return getValidSecondaryAlienationTargets(target, player, ctx);
  }, [player, target, selectedTypeId]);

  // 离间方法 + 模糊预览（每个预设方法的 calcBonus；AI 方法没有预览，rate 由 LLM 评估产出）
  const alienationMethodPreviews = useMemo(() => {
    if (!player || !target || !selectedSecondaryId) return [];
    const ctx = buildSchemeContext();
    const secondary = ctx.characters.get(selectedSecondaryId);
    if (!secondary) return [];
    return getAlienationMethodsForUI().map((m) => {
      if (m.isAI) {
        return { method: m, bonus: 0, rate: null as number | null };
      }
      const bonus = m.calcBonus(target, secondary, player, ctx);
      const attackSm = resolveSpymaster(player.id, ctx.spymasters, ctx.characters, ctx.vassalIndex);
      const defendSm = resolveSpymaster(target.id, ctx.spymasters, ctx.characters, ctx.vassalIndex);
      const rate = Math.round(calcAlienationInitialRate(attackSm.abilities.strategy, defendSm.abilities.strategy, bonus));
      return { method: m, bonus, rate: rate as number | null };
    });
  }, [player, target, selectedSecondaryId]);

  if (!playerId || !player || !target) return null;

  const spymasterForLimit = resolveSpymaster(
    playerId, useSchemeStore.getState().spymasters,
    useCharacterStore.getState().characters, useCharacterStore.getState().vassalIndex,
  );
  const limit = calcSchemeLimit(spymasterForLimit.abilities.strategy);
  const activeCount = useSchemeStore.getState().getActiveSchemeCount(playerId);
  const limitFull = activeCount >= limit;

  function handlePickType(typeId: string) {
    setSelectedTypeId(typeId);
    if (typeId === 'curryFavor') {
      setPhase('confirm');
    } else if (typeId === 'alienation') {
      setPhase('pickSecondary');
    }
  }

  function handlePickSecondary(secondaryId: string) {
    setSelectedSecondaryId(secondaryId);
    setPhase('pickMethod');
  }

  function handlePickMethod(methodId: string) {
    setSelectedMethodId(methodId);
    if (methodId === 'custom') {
      // 自拟妙计：若缓存仍新鲜则直接跳 confirmCustom 复用，否则进输入阶段
      if (isCustomEvaluationFresh()) {
        setPhase('confirmCustom');
      } else {
        setLlmError(null);
        setPhase('writeCustom');
      }
      return;
    }
    setPhase('confirm');
  }

  async function handleSubmitCustom() {
    if (!selectedSecondaryId) return;
    const desc = customDescription.trim();
    if (desc.length < 10) return;

    setLlmError(null);
    setPhase('waitingLlm');

    const controller = new AbortController();
    abortRef.current = controller;

    const result = await evaluateCustomSchemeRate({
      initiatorId: playerId!,
      schemeTypeId: 'alienation',
      rawParams: {
        primaryTargetId: targetId,
        secondaryTargetId: selectedSecondaryId,
        methodId: 'custom',
      },
      customDescription: desc,
      signal: controller.signal,
    });

    // 组件已卸载或被 abort：不写 state
    if (controller.signal.aborted) return;

    if (!result.ok) {
      setLlmError(result.error);
      setPhase('writeCustom');
      return;
    }

    setCustomEvaluation({
      primaryId: targetId,
      secondaryId: selectedSecondaryId,
      description: desc,
      rate: result.rate,
    });
    setPhase('confirmCustom');
  }

  function handleCancelLlm() {
    abortRef.current?.abort();
    setPhase('writeCustom');
  }

  function handleCloseWithAbort() {
    abortRef.current?.abort();
    onClose();
  }

  function handleConfirm() {
    if (!selectedTypeId) return;
    let rawParams: Record<string, unknown>;
    let override: number | undefined = undefined;

    if (selectedTypeId === 'curryFavor') {
      rawParams = { primaryTargetId: targetId };
    } else if (selectedTypeId === 'alienation') {
      if (!selectedSecondaryId || !selectedMethodId) return;

      // AI 方法路径：必须有缓存且键匹配才能发起；不匹配视为 stale
      if (selectedMethodId === 'custom') {
        if (!isCustomEvaluationFresh() || !customEvaluation) {
          setResultMsg('评估结果与当前目标/描述不一致，请重新评议。');
          setPhase('result');
          return;
        }
        override = customEvaluation.rate;
        rawParams = {
          primaryTargetId: targetId,
          secondaryTargetId: selectedSecondaryId,
          methodId: 'custom',
          customDescription: customEvaluation.description,
        };
      } else {
        rawParams = {
          primaryTargetId: targetId,
          secondaryTargetId: selectedSecondaryId,
          methodId: selectedMethodId,
        };
      }
    } else {
      return;
    }
    const ok = executeInitiateScheme(playerId!, selectedTypeId, rawParams, override);
    if (!ok) {
      setResultMsg('局势已发生变化，计谋未能发起。');
    } else {
      const def = getSchemeType(selectedTypeId);
      setResultMsg(`${def?.name ?? '计谋'}已发起。`);
    }
    setPhase('result');
  }

  // ── 渲染 ──

  if (phase === 'result') {
    return (
      <Modal size="sm" onOverlayClick={onClose}>
        <ModalHeader title="计谋" onClose={onClose} />
        <div className="px-5 py-4 flex flex-col gap-3">
          <p className="text-sm text-[var(--color-text)]">{resultMsg}</p>
          <Button variant="default" className="w-full py-2 font-bold" onClick={onClose}>
            关闭
          </Button>
        </div>
      </Modal>
    );
  }

  if (phase === 'pickType') {
    return (
      <Modal size="md" onOverlayClick={onClose}>
        <ModalHeader title={`对 ${target.name} 施展计谋`} onClose={onClose} />
        <div className="px-5 py-4 flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
          <div className="text-xs text-[var(--color-text-muted)]">
            谋力：{activeCount}/{limit}
            {limitFull && (
              <span className="text-[var(--color-accent-red)] ml-2">已达上限</span>
            )}
          </div>
          {availableTypes.length === 0 && (
            <div className="text-xs text-[var(--color-text-muted)]">无可用计谋</div>
          )}
          {availableTypes.map((def) => {
            const disabled = limitFull || player.resources.money < def.costMoney;
            return (
              <button
                key={def.id}
                disabled={disabled}
                onClick={() => handlePickType(def.id)}
                className={`flex flex-col items-start gap-1 rounded p-3 border text-left transition-colors ${
                  disabled
                    ? 'border-[var(--color-border)] opacity-50 cursor-not-allowed'
                    : 'border-[var(--color-border)] hover:border-[var(--color-accent-gold)] hover:bg-[var(--color-bg-surface)]'
                }`}
              >
                <div className="flex items-center gap-2 w-full">
                  <span className="text-xl">{def.icon}</span>
                  <span className="text-sm font-bold text-[var(--color-text)] flex-1">{def.name}</span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {def.costMoney} 金 · {def.isBasic ? `${def.baseDurationDays} 天` : `${def.phaseCount} × ${def.baseDurationDays} 天`}
                  </span>
                </div>
                <div className="text-xs text-[var(--color-text-muted)]">{def.description}</div>
              </button>
            );
          })}
        </div>
      </Modal>
    );
  }

  // ── 离间：选次要目标 ──
  if (phase === 'pickSecondary' && selectedTypeId === 'alienation') {
    return (
      <Modal size="md" onOverlayClick={onClose}>
        <ModalHeader title="离间 — 选择次要目标" onClose={onClose} />
        <div className="px-5 py-4 flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
          <p className="text-xs text-[var(--color-text-muted)] mb-1">
            主目标：<span className="text-[var(--color-text)] font-bold">{target.name}</span>
            <br />
            选择与 {target.name} 有关系的角色作为离间对象：
          </p>
          {alienationSecondaries.length === 0 ? (
            <div className="text-sm text-[var(--color-text-muted)] text-center py-4">
              {target.name} 没有可被离间的关系对象。
            </div>
          ) : (
            alienationSecondaries.map((c) => (
              <button
                key={c.id}
                onClick={() => handlePickSecondary(c.id)}
                className="flex items-center justify-between rounded px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-[var(--color-accent-gold)] text-left"
              >
                <span className="text-sm font-bold text-[var(--color-text)]">{c.name}</span>
                <span className="text-xs text-[var(--color-text-muted)]">{c.title || ''}</span>
              </button>
            ))
          )}
          <div className="flex gap-2 mt-2">
            <Button variant="default" className="flex-1 py-2" onClick={() => setPhase('pickType')}>
              返回
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  // ── 离间：选方法 ──
  if (phase === 'pickMethod' && selectedTypeId === 'alienation' && selectedSecondaryId) {
    const secondary = useCharacterStore.getState().characters.get(selectedSecondaryId);
    const cachedFresh = isCustomEvaluationFresh();
    return (
      <Modal size="md" onOverlayClick={handleCloseWithAbort}>
        <ModalHeader title="离间 — 选择手段" onClose={handleCloseWithAbort} />
        <div className="px-5 py-4 flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
          <p className="text-xs text-[var(--color-text-muted)] mb-1">
            目标：<span className="text-[var(--color-text)] font-bold">{target.name}</span>
            {' ↔ '}
            <span className="text-[var(--color-text)] font-bold">{secondary?.name ?? '?'}</span>
          </p>
          {alienationMethodPreviews.map(({ method, rate }) => {
            const isCustom = method.isAI === true;
            // AI 方法卡片的禁用逻辑：LLM 未配置时 disabled + tooltip 引导
            const aiLoading = isCustom && aiMethodAvailable === null;
            const aiDisabled = isCustom && aiMethodAvailable === false;
            const btnDisabled = aiLoading || aiDisabled;
            const tooltipTitle = aiDisabled
              ? '需先在「设置 → LLM 配置」中配置 API Key'
              : aiLoading
                ? '正在检测 LLM 配置...'
                : undefined;
            return (
              <button
                key={method.id}
                onClick={() => { if (!btnDisabled) handlePickMethod(method.id); }}
                disabled={btnDisabled}
                title={tooltipTitle}
                className={`flex flex-col items-start gap-1 rounded p-3 border text-left transition-colors ${
                  btnDisabled
                    ? 'border-[var(--color-border)] opacity-50 cursor-not-allowed'
                    : 'border-[var(--color-border)] hover:border-[var(--color-accent-gold)] hover:bg-[var(--color-bg-surface)]'
                }`}
              >
                <div className="flex items-center gap-2 w-full">
                  {isCustom && <span className="text-base">🎭</span>}
                  <span className="text-sm font-bold text-[var(--color-text)] flex-1">
                    {method.name}
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {isCustom
                      ? (cachedFresh && customEvaluation
                          ? <>已评估 <span className="text-[var(--color-accent-gold)] font-bold">{customEvaluation.rate}%</span></>
                          : (aiLoading ? '检测配置中...' : aiDisabled ? '未配置 LLM' : '由谋士评议'))
                      : <>初始成功率 <span className="text-[var(--color-accent-gold)] font-bold">{rate}%</span></>
                    }
                  </span>
                </div>
                <div className="text-xs text-[var(--color-text-muted)]">{method.description}</div>
                <div className="text-[11px] text-[var(--color-text-muted)] italic">{method.hint}</div>
              </button>
            );
          })}
          <div className="flex gap-2 mt-2">
            <Button variant="default" className="flex-1 py-2" onClick={() => setPhase('pickSecondary')}>
              返回
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  // ── 离间 · 自拟妙计：输入策略 ──
  if (phase === 'writeCustom' && selectedTypeId === 'alienation' && selectedSecondaryId) {
    const secondary = useCharacterStore.getState().characters.get(selectedSecondaryId);
    const canSubmit = customDescription.trim().length >= 10;
    return (
      <Modal size="md" onOverlayClick={handleCloseWithAbort}>
        <ModalHeader title="自拟妙计 — 构思你的计策" onClose={handleCloseWithAbort} />
        <div className="px-5 py-4 flex flex-col gap-3">
          <p className="text-xs text-[var(--color-text-muted)]">
            目标：<span className="text-[var(--color-text)] font-bold">{target.name}</span>
            {' ↔ '}
            <span className="text-[var(--color-text)] font-bold">{secondary?.name ?? '?'}</span>
            <br />
            详细描述你打算如何让二人反目。谋士将根据三方的性格、能力、关系、身份评估此策略的合理性，给出初始成功率。
          </p>
          <textarea
            value={customDescription}
            onChange={(e) => setCustomDescription(e.target.value.slice(0, 400))}
            maxLength={400}
            rows={7}
            placeholder="例如：察觉甲对乙握兵在外已有猜忌，可借京中某次朝议的奏表传言..."
            className="w-full px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-sm text-[var(--color-text)] font-sans"
            style={{ resize: 'vertical' }}
          />
          <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
            <span>{customDescription.length} / 400</span>
            {customDescription.trim().length > 0 && customDescription.trim().length < 10 && (
              <span className="text-[var(--color-accent-red)]">至少 10 字</span>
            )}
          </div>
          {llmError && (
            <div className="text-xs text-[var(--color-accent-red)] px-2 py-1 bg-[var(--color-bg)] rounded border border-[var(--color-accent-red)]">
              {llmError}
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="default" className="flex-1 py-2" onClick={() => setPhase('pickMethod')}>
              返回
            </Button>
            <Button
              variant="primary"
              className="flex-1 py-2 font-bold"
              disabled={!canSubmit}
              onClick={handleSubmitCustom}
            >
              交谋士评议
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  // ── 离间 · 自拟妙计：等待 LLM ──
  if (phase === 'waitingLlm') {
    return (
      <Modal size="sm">
        <div className="px-5 py-8 flex flex-col items-center gap-4">
          <div
            className="h-10 w-10 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: 'var(--color-accent-gold)', borderTopColor: 'transparent' }}
          />
          <p className="text-sm text-[var(--color-text-muted)] text-center">
            谋士正在评议你的策略<br />
            <span className="text-[11px]">（LLM 响应耗时因服务商而异，可随时取消）</span>
          </p>
          <Button variant="default" onClick={handleCancelLlm}>取消</Button>
        </div>
      </Modal>
    );
  }

  // ── 离间 · 自拟妙计：评估结果 + 用 / 退抉择 ──
  if (phase === 'confirmCustom' && selectedTypeId === 'alienation' && selectedSecondaryId && customEvaluation) {
    const secondary = useCharacterStore.getState().characters.get(selectedSecondaryId);
    // 缓存失效兜底（理论上 pickMethod 进来时已检查，这里防御）
    const fresh = isCustomEvaluationFresh();
    return (
      <Modal size="md" onOverlayClick={handleCloseWithAbort}>
        <ModalHeader title="谋士评议" onClose={handleCloseWithAbort} />
        <div className="px-5 py-4 flex flex-col gap-3">
          <div className="text-xs text-[var(--color-text-muted)]">
            针对 <span className="text-[var(--color-text)] font-bold">{target.name}</span>
            {' ↔ '}
            <span className="text-[var(--color-text)] font-bold">{secondary?.name ?? '?'}</span>
            ，你提交的策略：
          </div>
          <div className="px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-xs text-[var(--color-text)] max-h-40 overflow-y-auto whitespace-pre-wrap">
            {customEvaluation.description}
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-sm text-[var(--color-text-muted)]">初始成功率</span>
            <span className="text-2xl font-bold text-[var(--color-accent-gold)]">
              {customEvaluation.rate}%
            </span>
          </div>
          <div className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
            此数值将作为启动时的初始成功率，{ALIENATION_PHASES} 阶段 × {ALIENATION_PHASE_DAYS} 天，
            每阶段成功率 +8（封顶 100%）。花费：{ALIENATION_COST} 金。<br />
            失败代价：双方对你 -40 好感、你 -20 威望。
          </div>
          {!fresh && (
            <div className="text-xs text-[var(--color-accent-red)]">
              评估结果已与当前目标/描述不符，请返回重新评议。
            </div>
          )}
          <div className="flex gap-2 mt-2">
            <Button variant="default" className="flex-1 py-2" onClick={() => setPhase('pickMethod')}>
              换用其他方法
            </Button>
            <Button
              variant="primary"
              className="flex-1 py-2 font-bold"
              disabled={!fresh}
              onClick={() => {
                setSelectedMethodId('custom');
                setPhase('confirm');
              }}
            >
              就用这个
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  // ── confirm: 拉拢 ──
  if (phase === 'confirm' && selectedTypeId === 'curryFavor') {
    return (
      <Modal size="sm" onOverlayClick={onClose}>
        <ModalHeader title="发起拉拢" onClose={onClose} />
        <div className="px-5 py-4 flex flex-col gap-3">
          <div className="text-sm text-[var(--color-text)]">
            目标：<span className="font-bold">{target.name}</span>
          </div>
          {curryFavorPreview && (
            <div className="text-xs text-[var(--color-text-muted)] space-y-1">
              <div>成功率：<span className="text-[var(--color-text)] font-bold">{curryFavorPreview.rate}%</span></div>
              <div>持续：<span className="text-[var(--color-text)]">90 天</span></div>
              <div>花费：<span className="text-[var(--color-text)]">{curryFavorPreview.cost} 金</span></div>
            </div>
          )}
          <div className="text-[11px] text-[var(--color-text-muted)] mt-1">
            通过宴饮、馈赠和私下结交，增进双方好感。<br />
            成功：双方好感各 +25 / +15。失败：仅 -5 好感。
          </div>
          <div className="flex gap-2 mt-2">
            <Button variant="default" className="flex-1 py-2" onClick={() => setPhase('pickType')}>
              返回
            </Button>
            <Button variant="primary" className="flex-1 py-2 font-bold" onClick={handleConfirm}>
              发起
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  // ── confirm: 离间 ──
  if (phase === 'confirm' && selectedTypeId === 'alienation' && selectedSecondaryId && selectedMethodId) {
    const secondary = useCharacterStore.getState().characters.get(selectedSecondaryId);
    const methodPreview = alienationMethodPreviews.find((p) => p.method.id === selectedMethodId);
    const isCustomMethod = selectedMethodId === 'custom';
    // AI 方法的 rate 来自 customEvaluation 缓存；预设方法来自 preview
    const displayRate = isCustomMethod
      ? (isCustomEvaluationFresh() ? customEvaluation?.rate : null)
      : methodPreview?.rate ?? null;
    return (
      <Modal size="sm" onOverlayClick={handleCloseWithAbort}>
        <ModalHeader title="发起离间" onClose={handleCloseWithAbort} />
        <div className="px-5 py-4 flex flex-col gap-3">
          <div className="text-sm text-[var(--color-text)]">
            离间：<span className="font-bold">{target.name}</span> ↔ <span className="font-bold">{secondary?.name ?? '?'}</span>
          </div>
          <div className="text-xs text-[var(--color-text-muted)]">
            手段：<span className="text-[var(--color-text)] font-bold">{methodPreview?.method.name ?? '?'}</span>
          </div>
          <div className="text-xs text-[var(--color-text-muted)] space-y-1">
            <div>
              初始成功率：
              <span className="text-[var(--color-text)] font-bold">
                {displayRate !== null && displayRate !== undefined ? `${displayRate}%` : '—'}
              </span>
            </div>
            <div>阶段：<span className="text-[var(--color-text)]">{ALIENATION_PHASES} × {ALIENATION_PHASE_DAYS} 天</span>（共 {ALIENATION_PHASES * ALIENATION_PHASE_DAYS} 天，每阶段成功率 +8）</div>
            <div>花费：<span className="text-[var(--color-text)]">{ALIENATION_COST} 金</span></div>
          </div>
          {isCustomMethod && customEvaluation && (
            <div className="text-[11px] text-[var(--color-text-muted)] px-2 py-1 bg-[var(--color-bg)] rounded border border-[var(--color-border)] max-h-24 overflow-y-auto whitespace-pre-wrap">
              {customEvaluation.description}
            </div>
          )}
          <div className="text-[11px] text-[var(--color-text-muted)] mt-1">
            成功：双方互相好感 -30。失败：双方对你各 -40，威望 -20。
          </div>
          <div className="flex gap-2 mt-2">
            <Button variant="default" className="flex-1 py-2" onClick={() => setPhase(isCustomMethod ? 'confirmCustom' : 'pickMethod')}>
              返回
            </Button>
            <Button variant="primary" className="flex-1 py-2 font-bold" onClick={handleConfirm}>
              发起
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return null;
}
