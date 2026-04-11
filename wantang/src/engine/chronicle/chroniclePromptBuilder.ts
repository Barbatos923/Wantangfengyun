// ===== Chronicle Prompt Builder（纯函数） =====
//
// 不读任何 store。所有需要的数据由 service 在调用前 freeze 好快照传入。
// 月度 prompt 走白话归纳；年度 prompt 复用 docs/reference/CK3-史书撰写.txt 的史官人格。

import type { GameEvent } from '@engine/types';
import type { LlmPrompt } from './llm/LlmProvider';
import type { MonthDraft } from './types';
import type { CharacterDossier } from './chronicleDossier';
import { buildEventContext, type EventContextSnapshot } from './chronicleEventContext';

/** 角色/领地 ID → 名称对照表，让 LLM 拼出"姓名 + 地名"而不是 ID。 */
export interface NameTable {
  characters: Record<string, string>;
  territories: Record<string, string>;
}

/** 年史用的世界格局快照（在触发瞬间冻结）。 */
export interface WorldSnapshot {
  year: number;
  topPowers: Array<{ name: string; territoryCount: number }>;
  newTitles: string[];
  destroyedTitles: string[];
  /** 本年关键人物档案（方向 2：让 LLM 写史臣注时基于游戏内事实而非历史原型） */
  dossiers: CharacterDossier[];
}

// ── 按事件类型格式化人物角色标签 ────────────────────────────
//
// 替代原来的"人物:A、B"扁平列表，避免 LLM 误读角色关系。
// n = charId→name, t = terrId→name

function formatActorRoles(
  e: GameEvent,
  n: (id: string) => string,
  t: (id: string) => string,
): string {
  const a = e.actors;
  const terrStr = e.territories.map(t).filter(Boolean).join('、');
  const loc = terrStr ? `地点:${terrStr}` : '';

  switch (e.type) {
    // ── 军事 ──
    case '宣战':
      // actors: [attackerId, targetId]
      return [a[0] && `宣战方:${n(a[0])}`, a[1] && `被攻方:${n(a[1])}`, loc].filter(Boolean).join('，');

    case '野战': {
      // payload 里有 commanderId，优先用；actors 是所有参战 owner（可能重复）
      const p = e.payload as { attackerCommanderId?: string; defenderCommanderId?: string } | undefined;
      const atkCmd = p?.attackerCommanderId ? `攻方主将:${n(p.attackerCommanderId)}` : '';
      const defCmd = p?.defenderCommanderId ? `守方主将:${n(p.defenderCommanderId)}` : '';
      return [atkCmd, defCmd, loc].filter(Boolean).join('，');
    }

    case '城破': {
      // actors: [attackerId, ...defenderOwnerIds]
      const defNames = a.slice(1).map(n).filter(Boolean);
      const defStr = defNames.length > 0 ? `守方:${defNames.join('、')}` : '';
      return [a[0] && `攻城方:${n(a[0])}`, defStr, loc].filter(Boolean).join('，');
    }

    case '战争结束':
      // actors: [attackerId, ...attackerParticipants, defenderId, ...defenderParticipants]
      // 只标主帅，参战者省略
      return [a[0] && `攻方:${n(a[0])}`, a.length > 1 && `守方:${n(a[1])}`, loc].filter(Boolean).join('，');

    case '兵变':
      // actors: [army.ownerId]
      return [a[0] && `所属势力:${n(a[0])}`, loc].filter(Boolean).join('，');

    case '战争接续':
      // actors: [deadId, successorId, enemyId]
      return [a[0] && `阵亡:${n(a[0])}`, a[1] && `继任:${n(a[1])}`, a[2] && `敌方:${n(a[2])}`, loc].filter(Boolean).join('，');

    // ── 人事 ──
    case '任命':
      // actors: [appointerId, appointeeId]
      return [a[0] && `任命者:${n(a[0])}`, a[1] && `被任命:${n(a[1])}`, loc].filter(Boolean).join('，');

    case '罢免':
      // actors: [dismisserId, previousHolderId]
      return [a[0] && `罢免者:${n(a[0])}`, a[1] && `被罢免:${n(a[1])}`, loc].filter(Boolean).join('，');

    case '剥夺':
      // actors: [revokerId, targetId]
      return [a[0] && `剥夺者:${n(a[0])}`, a[1] && `被剥夺:${n(a[1])}`, loc].filter(Boolean).join('，');

    case '抗命':
      // actors: [targetId, revokerId]（注意：反叛者在前）
      return [a[0] && `抗命者:${n(a[0])}`, a[1] && `上级:${n(a[1])}`, loc].filter(Boolean).join('，');

    case '调任':
      // actors: [appointerId, territorialId, replacementId]
      return [a[0] && `调任者:${n(a[0])}`, a[1] && `被调入朝:${n(a[1])}`, a[2] && `接任者:${n(a[2])}`, loc].filter(Boolean).join('，');

    case '转移臣属':
      // actors: [transferrerId, vassalId, newOverlordId]
      return [a[0] && `转出方:${n(a[0])}`, a[1] && `臣属:${n(a[1])}`, a[2] && `接收方:${n(a[2])}`, loc].filter(Boolean).join('，');

    // ── 外交 ──
    case '归附':
      // actors: [playerId, targetId]
      return [a[0] && `归附者:${n(a[0])}`, a[1] && `受附:${n(a[1])}`, loc].filter(Boolean).join('，');

    case '要求效忠':
      // actors: [playerId, targetId]
      return [a[0] && `要求方:${n(a[0])}`, a[1] && `臣服方:${n(a[1])}`, loc].filter(Boolean).join('，');

    case '逼迫授权':
      // actors: [actorId, overlordId]
      return [a[0] && `逼迫方:${n(a[0])}`, a[1] && `被迫方:${n(a[1])}`, loc].filter(Boolean).join('，');

    case '议定进奉':
      // actors: [actorId, overlordId]
      return [a[0] && `请求方:${n(a[0])}`, a[1] && `领主:${n(a[1])}`, loc].filter(Boolean).join('，');

    case '留后指定':
      // actors: [holderId, heirId]
      return [a[0] && `指定者:${n(a[0])}`, a[1] && `留后:${n(a[1])}`, loc].filter(Boolean).join('，');

    // ── 继承 ──
    case '继位':
      // actors: [deadId, heirId]
      return [a[0] && `薨者:${n(a[0])}`, a[1] && `继位者:${n(a[1])}`, loc].filter(Boolean).join('，');

    case '绝嗣':
    case '王朝覆灭':
      // actors: [deadId]
      return [a[0] && `薨者:${n(a[0])}`, loc].filter(Boolean).join('，');

    // ── 头衔 ──
    case '篡夺头衔':
      // actors: [actorId, oldHolderId]
      return [a[0] && `篡夺者:${n(a[0])}`, a[1] && `原持有:${n(a[1])}`, loc].filter(Boolean).join('，');

    case '称王':
    case '建镇':
    case '称帝':
    case '销毁头衔':
      // actors: [actorId]
      return [a[0] && `主事者:${n(a[0])}`, loc].filter(Boolean).join('，');

    // ── 同盟 ──
    case '缔结同盟':
      // actors: [partyA, partyB]
      return [a[0] && `盟主一:${n(a[0])}`, a[1] && `盟主二:${n(a[1])}`, loc].filter(Boolean).join('，');

    case '解除同盟':
      // actors: [actorId, targetId]
      return [a[0] && `解约方:${n(a[0])}`, a[1] && `原盟友:${n(a[1])}`, loc].filter(Boolean).join('，');

    case '同盟到期':
      // actors: [partyA, partyB]
      return [a[0] && `原盟主一:${n(a[0])}`, a[1] && `原盟主二:${n(a[1])}`, loc].filter(Boolean).join('，');

    case '同盟参战':
      // actors: [allyId, summonerId, enemyLeaderId?]
      return [a[0] && `履约方:${n(a[0])}`, a[1] && `召唤方:${n(a[1])}`, a[2] && `敌方:${n(a[2])}`, loc].filter(Boolean).join('，');

    case '同盟反戈':
      // actors: [rebelId, formerOverlordId, summonerId]
      return [a[0] && `反戈方:${n(a[0])}`, a[1] && `原领主:${n(a[1])}`, a[2] && `召唤方:${n(a[2])}`, loc].filter(Boolean).join('，');

    case '两盟相绞':
      // actors: [allyId, chosenLeaderId/attackerId, abandonedLeaderId/defenderId]
      return [a[0] && `困局方:${n(a[0])}`, a[1] && `涉方一:${n(a[1])}`, a[2] && `涉方二:${n(a[2])}`, loc].filter(Boolean).join('，');

    case '背盟宣战':
      // actors: [attackerId, defenderId]
      return [a[0] && `背盟方:${n(a[0])}`, a[1] && `受害方:${n(a[1])}`, loc].filter(Boolean).join('，');

    case '背盟拒援':
      // actors: [betrayerId, summonerId]
      return [a[0] && `背盟方:${n(a[0])}`, a[1] && `受害方:${n(a[1])}`, loc].filter(Boolean).join('，');

    default: {
      // 未知类型：降级为扁平列表
      const actorNames = a.map(n).filter(Boolean).join('、');
      return [actorNames && `人物:${actorNames}`, loc].filter(Boolean).join('，');
    }
  }
}

// ── 月度 prompt ───────────────────────────────────────────

const MONTH_SYSTEM = `你是一名晚唐史官，仿《新旧唐书》、《资治通鉴》笔法，将本月事件撰写为古朴简练的编年体文言文起居注。

要求：
1. 忠于事件与上下文卡片，未提供的信息不得虚构，不得借用历史同名人物事迹。
2. 用词简练、古朴，用史书笔法叙事，避免现代口语、游戏术语和因果套话。
3. 允许适当发挥细节与延展：基于事件事实和人物背景，可以补充合理的场景描写、人物心理、朝堂反应等，使叙事更加生动丰满。
4. 直接输出文言文起居注正文，不超过 400 字，不要开场白和结尾废话。`;

export function buildMonthPrompt(
  year: number,
  month: number,
  events: GameEvent[],
  names: NameTable,
  ctxSnap?: EventContextSnapshot,
): LlmPrompt {
  const lines: string[] = [`时间：${year}年${month}月`, ''];
  for (const e of events) {
    const date = `${e.date.year}/${e.date.month}/${e.date.day}`;
    const n = (id: string) => names.characters[id] ?? id;
    const t = (id: string) => names.territories[id] ?? id;

    // 按事件类型生成带角色标签的人物/地点标注
    const roleTags = formatActorRoles(e, n, t);

    lines.push(`- [${date}] [${e.type}] ${e.description}${roleTags ? `（${roleTags}）` : ''}`);

    // 野战：展开 phases 细节，让 LLM 写得出"前哨遭遇/接战不利/决战翻盘/追击斩获"这类层次
    if (e.type === '野战' && e.payload && typeof e.payload === 'object') {
      const battleResult = (e.payload as { battleResult?: unknown }).battleResult;
      if (battleResult && typeof battleResult === 'object') {
        const phases = (battleResult as { phases?: Array<Record<string, unknown>> }).phases;
        if (Array.isArray(phases) && phases.length > 0) {
          for (const ph of phases) {
            const phaseName = String(ph.phase ?? '?');
            const aStrat = String(ph.attackerStrategyId ?? '?').replace(/^[^-]*-/, '');
            const dStrat = String(ph.defenderStrategyId ?? '?').replace(/^[^-]*-/, '');
            const aLoss = Number(ph.attackerLosses ?? 0);
            const dLoss = Number(ph.defenderLosses ?? 0);
            const result = String(ph.result ?? 'draw');
            const resultLabel =
              result === 'attackerWin' ? '攻方胜' : result === 'defenderWin' ? '守方胜' : '相持';
            lines.push(
              `    · ${phaseName}：攻[${aStrat}] 守[${dStrat}]，攻损${aLoss} 守损${dLoss}，${resultLabel}`,
            );
          }
        }
      }
    }

    // 事件上下文卡片：按事件类型为相关人物补充精准字段
    if (ctxSnap) {
      const ctxLines = buildEventContext(e, ctxSnap);
      for (const cl of ctxLines) lines.push(cl);
    }
  }
  return {
    system: MONTH_SYSTEM,
    user: lines.join('\n'),
  };
}

// ── 年度 prompt ───────────────────────────────────────────

/**
 * 年史 system prompt：直接复用 docs/reference/CK3-史书撰写.txt 的史官人格。
 * 这里把那份文档的核心法则内嵌为字符串常量——文档本身仍是真相源（人类可读），
 * 此常量只是在运行时把它喂给 LLM。
 */
const YEAR_SYSTEM = `你是一名晚唐史官，精通《新旧唐书》、《资治通鉴》笔法，根据本年逐月起居注整理成一卷编年体文言年史。

要求：
1. 合并同一事件的跨月叙述，理清因果，删除重复，统一文风。
2. 围绕年度主线组织篇章，次要事件简述。
3. 忠于所给材料，未提及的信息不得虚构，不得借用历史同名人物事迹。
4. 以"○○年（干支）"开篇，正文末附不超过200字的"史官按语"。
5. 对标注"原始事件记录"的月份，直接据事件整理成同样文风。
6. 直接输出年史正文，不要开场白和结尾废话。`;

/** 方向 3：跨年记忆，由 service 在生成下一年史时从上一年 YearChronicle 提取后传入 */
export interface PriorYearMemory {
  year: number;
  /** 上一年的史官按语（content 末段提取） */
  afterword: string;
  /** 上一年的关键人物档案，用于跨年称呼一致性 */
  dossiers: CharacterDossier[];
}

/**
 * 月度原始事件 fallback：当月稿尚未生成完成时，用结构化事件列表替代。
 * key = month number, value = 已格式化的事件文本行。
 */
export type MonthRawFallback = Map<number, string>;

export function buildYearPrompt(
  year: number,
  drafts: MonthDraft[],
  _snapshot: WorldSnapshot,
  priorMemory?: PriorYearMemory,
  rawFallback?: MonthRawFallback,
): LlmPrompt {
  const lines: string[] = [`【纪年】${year}年`, ''];

  // ── 跨年记忆：上一年的史官按语，让 LLM 承接叙事脉络 ──
  if (priorMemory) {
    lines.push(`【前情提要：${priorMemory.year}年史官按语】`);
    lines.push(priorMemory.afterword);
    lines.push('');
    lines.push('请承接上年叙事脉络，对同一人物使用一致的称呼与字号。');
    lines.push('');
  }

  // 把 drafts 按 month 索引，方便逐月查找
  const draftByMonth = new Map<number, MonthDraft>();
  for (const d of drafts) draftByMonth.set(d.month, d);

  let hasRawFallback = false;
  lines.push('【本年逐月起居注】');
  for (let m = 1; m <= 12; m++) {
    const d = draftByMonth.get(m);
    if (d?.summary?.trim()) {
      lines.push(`◇ ${m}月：${d.summary.trim()}`);
    } else {
      // 月稿缺失：尝试用原始事件 fallback
      const raw = rawFallback?.get(m);
      if (raw) {
        lines.push(`◇ ${m}月（原始事件记录）：`);
        lines.push(raw);
        hasRawFallback = true;
      }
      // 无月稿也无事件 → 跳过该月
    }
  }

  lines.push('');
  if (hasRawFallback) {
    lines.push('注：标注"原始事件记录"的月份未经起居注官整理，请直接据原始事件撰写该月内容。');
  }
  lines.push('请据上述起居注，汇总整理为本年年史一卷。');

  return {
    system: YEAR_SYSTEM,
    user: lines.join('\n'),
  };
}
