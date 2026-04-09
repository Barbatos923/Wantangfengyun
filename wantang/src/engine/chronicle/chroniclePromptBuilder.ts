// ===== Chronicle Prompt Builder（纯函数） =====
//
// 不读任何 store。所有需要的数据由 service 在调用前 freeze 好快照传入。
// 月度 prompt 走白话归纳；年度 prompt 复用 docs/reference/CK3-史书撰写.txt 的史官人格。

import type { GameEvent } from '@engine/types';
import type { LlmPrompt } from './llm/LlmProvider';
import type { MonthDraft } from './types';
import type { CharacterDossier } from './chronicleDossier';

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

// ── 月度 prompt ───────────────────────────────────────────

const MONTH_SYSTEM = `你是一位历史事件归纳助手。任务：把玩家给出的本月游戏事件压缩为一段不超过 200 字的中性白话叙述，保留人物姓名、地点、时间、结果与因果，不加文学修饰，不要主观抒情。直接输出叙述正文，不要"本月发生"等开场白。`;

export function buildMonthPrompt(
  year: number,
  month: number,
  events: GameEvent[],
  names: NameTable,
): LlmPrompt {
  const lines: string[] = [`时间：${year}年${month}月`, ''];
  for (const e of events) {
    const date = `${e.date.year}/${e.date.month}/${e.date.day}`;
    const actorNames = e.actors
      .map((id) => names.characters[id] ?? id)
      .filter(Boolean)
      .join('、');
    const terrNames = e.territories
      .map((id) => names.territories[id] ?? id)
      .filter(Boolean)
      .join('、');
    const tags = [actorNames && `人物:${actorNames}`, terrNames && `地点:${terrNames}`]
      .filter(Boolean)
      .join('，');
    lines.push(`- [${date}] [${e.type}] ${e.description}${tags ? `（${tags}）` : ''}`);

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
const YEAR_SYSTEM = `你是一名精通《新旧唐书》、《资治通鉴》体例的"史官"。任务：将玩家提供的现代白话沙盘事件，翻译并润色为高度严谨、古朴简练的编年体文言文正史。

【核心修史法则】
1. 词句锤炼（古朴简练）：要单字动词，不要现代白话。剔除"然后/接着/因为所以"等连词。多用单音节词、四字短语。精准使用古代政军动词（如：制罢、徙、潜越、伪遁、邀击、薄城、乞降）。
2. 叙事骨相（冷峻客观）：要事实白描，不要主观抒情。恪守史官中立笔法。战术描写不写"打得很激烈"，专写"阵型开合""军心向背""斩首/俘获数量"。
3. 体例规制（主从分明）：要干支纪年，不要一锅乱炖。整体以编年体通史的体例记录。如记录其他人的详细事迹，应当以"史臣注+纪传体"的形式呈现。
4. 去游戏化：把数值变化转化为符合晚唐政治逻辑的史书表达（数值暴增→"附者如云""威震塞北"；游戏拉拢→"厚赂""交通内臣""结为外援"；游戏特质→具体行事评价如"性矜急""多猜忌，御下严苛"）。
5. 人物忠实（关键，不可违反）：所有人物的姓名、字、年龄、官职、性格、亲属关系必须严格依据【本年关键人物】档案。游戏内"高骈"未必是真实历史的高骈——史官只看档案，不调用对同名历史人物的记忆。档案里没有的事迹绝对不写（不写"屡破黄巢"，不写"幽州人"，不写父子兄弟若档案未提）。若某人物未在档案中，史臣注请绕开，不要从历史上"借"。

【输出要求】
- 直接输出格式化好的文言文史料，开头用"○○年（干支）"开篇。
- 整体编年体，按月叙事；遇到关键人物可在条目末加"史臣注：xx 传"形式的纪传切片（一年最多 2 段）。
- 正文末可附一段不超过 200 字的"史官按语"作为该年总结。
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
  snapshot: WorldSnapshot,
  priorMemory?: PriorYearMemory,
): LlmPrompt {
  const lines: string[] = [`【纪年】${year}年`, ''];

  // ── 跨年记忆（方向 3）：放最前面，让 LLM 进入"接续叙事"心态 ──
  if (priorMemory) {
    lines.push(`【前情提要：${priorMemory.year}年史官按语】`);
    lines.push(priorMemory.afterword);
    lines.push('');
    if (priorMemory.dossiers.length > 0) {
      lines.push(`【${priorMemory.year}年遗留人物档案】（用于跨年称呼一致；本年仍涉及者另见下方"本年关键人物"）`);
      for (const d of priorMemory.dossiers) {
        const parts: string[] = [d.name];
        if (d.courtesy) parts.push(`字${d.courtesy}`);
        if (d.mainPostName) parts.push(`时任${d.mainPostName}`);
        lines.push(`- ${parts.join('，')}`);
      }
      lines.push('');
    }
    lines.push('请承接上年叙事脉络，对同一人物使用一致的称呼与字号。');
    lines.push('');
  }

  if (snapshot.topPowers.length > 0) {
    lines.push('【本年世界格局】');
    for (const p of snapshot.topPowers) {
      lines.push(`- ${p.name}：辖境 ${p.territoryCount} 州`);
    }
    lines.push('');
  }
  if (snapshot.newTitles.length > 0) {
    lines.push(`【本年新建头衔】${snapshot.newTitles.join('、')}`);
  }
  if (snapshot.destroyedTitles.length > 0) {
    lines.push(`【本年覆灭头衔】${snapshot.destroyedTitles.join('、')}`);
  }
  if (snapshot.newTitles.length > 0 || snapshot.destroyedTitles.length > 0) {
    lines.push('');
  }

  // ── 关键人物档案（方向 2） ──
  if (snapshot.dossiers.length > 0) {
    lines.push('【本年关键人物】（史臣注/纪传切片务必基于此档案，禁止套用同名历史原型的事迹）');
    for (const d of snapshot.dossiers) {
      const parts: string[] = [];
      parts.push(d.name);
      if (d.courtesy) parts.push(`字${d.courtesy}`);
      if (d.clan) parts.push(`${d.clan}人`);
      parts.push(`${d.age}岁${d.isAlive ? '' : '（已薨）'}`);
      if (d.mainPostName) parts.push(`现任${d.mainPostName}`);
      if (d.rankName) parts.push(d.rankName);
      if (d.traitNames.length > 0) parts.push(`性${d.traitNames.join('、')}`);
      if (d.fatherName) parts.push(`父${d.fatherName}`);
      if (d.childrenNames.length > 0) parts.push(`子${d.childrenNames.join('、')}`);
      if (d.isPlayer) parts.push('（本朝今上/玩家本尊）');
      lines.push(`- ${parts.join('，')}`);
    }
    lines.push('');
  }

  lines.push('【本年逐月白话纪要】');
  for (const d of drafts) {
    if (!d.summary || !d.summary.trim()) continue;
    lines.push(`◇ ${year}年${d.month}月：${d.summary.trim()}`);
  }

  lines.push('');
  lines.push('请据上述材料，撰写本年正史一卷。');

  return {
    system: YEAR_SYSTEM,
    user: lines.join('\n'),
  };
}
