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

    default: {
      // 未知类型：降级为扁平列表
      const actorNames = a.map(n).filter(Boolean).join('、');
      return [actorNames && `人物:${actorNames}`, loc].filter(Boolean).join('，');
    }
  }
}

// ── 月度 prompt ───────────────────────────────────────────

const MONTH_SYSTEM = `你是一名精通《新旧唐书》、《资治通鉴》体例的"起居注官"。任务：将玩家提供的本月游戏事件，撰写为古朴简练的编年体文言文起居注。

【核心法则】
1. 词句锤炼：用单字动词、四字短语，精准使用古代政军动词（制罢、徙、潜越、薄城、乞降等）。剔除"然后/接着/因为所以"等现代连词。
2. 叙事骨相：事实白描，恪守史官中立笔法。战术写阵型开合、军心向背、斩获数量，不写"打得很激烈"。
3. 去游戏化：数值→符合晚唐逻辑的史书表达（兵力暴增→"附者如云"；特质→具体行事评价如"性矜急""多猜忌"）。
4. 人物忠实：所有人物信息严格依据事件及其上下文卡片。上下文卡片里没有的事迹绝对不写，不要从历史上"借"同名人物的事迹。
5. 每条事件后的 [角色] 行是该人物的背景信息，用于辅助你理解人物关系和性格，不需要逐条罗列，自然融入叙事即可。
6. 允许适当发挥细节与延展：基于事件事实和人物背景，可以补充合理的场景描写、人物心理、朝堂反应等，使叙事更加生动丰满。但不可虚构不存在的事件或人物。

【输出要求】
- 直接输出文言文起居注正文，不超过 400 字。
- 不要"以下是""本月"等开场白或结尾废话。`;

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
const YEAR_SYSTEM = `你是一名精通《新旧唐书》、《资治通鉴》体例的"史官"。任务：基于起居注官已撰写的本年逐月起居注，汇总、整理、润色为一卷完整的编年体文言文年史。

【核心法则】
1. 基于起居注：起居注已是文言文，你的工作是汇总整理而非重新翻译。合并同一事件的跨月叙述，理清因果脉络，删除重复，统一文风。
2. 体例规制：开头用"○○年（干支）"开篇。整体编年体，按时序叙事。遇关键人物可在条目末加"史臣注：xx 传"形式的纪传切片。
3. 主线提炼：从逐月流水中识别年度主线（如某势力崛起、某战争始末、某人物沉浮），围绕主线组织篇章，次要事件简略带过。
4. 人物忠实：起居注中未提及的事迹绝对不写，不要从历史上"借"同名人物的事迹。
5. 史官按语：正文末附一段不超过 200 字的"史官按语"，总结本年大势、评点得失。

【输出要求】
- 直接输出格式化好的文言文年史。
- 不要在开头或结尾说"以下是""希望您喜欢"等废话。`;

/** 方向 3：跨年记忆，由 service 在生成下一年史时从上一年 YearChronicle 提取后传入 */
export interface PriorYearMemory {
  year: number;
  /** 上一年的史官按语（content 末段提取） */
  afterword: string;
  /** 上一年的关键人物档案，用于跨年称呼一致性 */
  dossiers: CharacterDossier[];
}

export function buildYearPrompt(
  year: number,
  drafts: MonthDraft[],
  _snapshot: WorldSnapshot,
  priorMemory?: PriorYearMemory,
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

  lines.push('【本年逐月起居注】');
  for (const d of drafts) {
    if (!d.summary || !d.summary.trim()) continue;
    lines.push(`◇ ${d.month}月：${d.summary.trim()}`);
  }

  lines.push('');
  lines.push('请据上述起居注，汇总整理为本年年史一卷。');

  return {
    system: YEAR_SYSTEM,
    user: lines.join('\n'),
  };
}
