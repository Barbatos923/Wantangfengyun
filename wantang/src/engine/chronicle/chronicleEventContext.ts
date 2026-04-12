// ===== 事件驱动上下文卡片引擎（纯函数） =====
//
// 按事件类型为每个 actor 选取不同的字段，避免给 LLM 灌无关信息。
// 不读任何 store，所有数据由 service 冻结快照后传入。

import type { Character, Abilities } from '@engine/character/types';
import type { Territory, Post } from '@engine/territory/types';
import type { Army, Battalion, War } from '@engine/military/types';
import type { GameEvent } from '@engine/types';
import { positionMap } from '@data/positions';
import { traitMap } from '@data/traits';
import { CASUS_BELLI_NAMES } from '@engine/military/types';
import { findEmperorId } from '@engine/official/postQueries';

// ── 快照接口 ─────────────────────────────────────────────

export interface EventContextSnapshot {
  characters: Map<string, Character>;
  territories: Map<string, Territory>;
  centralPosts: Post[];
  controllerIndex: Map<string, Set<string>>;
  vassalIndex: Map<string, Set<string>>;
  armies: Map<string, Army>;
  battalions: Map<string, Battalion>;
  wars: Map<string, War>;
  currentYear: number;
}

// ── 字段标签 ─────────────────────────────────────────────

type FieldKey =
  | 'mainPost'
  | 'age'
  | 'traits'
  | 'abilities'
  | 'territory'
  | 'military'
  | 'allegiance'
  | 'vassals'
  | 'wars'
  | 'family';

// ── 字段渲染器 ───────────────────────────────────────────

function renderMainPost(charId: string, snap: EventContextSnapshot): string {
  // 皇帝特判
  const emperor = findEmperorId(snap.territories, snap.centralPosts);
  if (emperor === charId) return '皇帝';

  let bestRank = -1;
  let bestName = '';
  for (const terr of snap.territories.values()) {
    for (const post of terr.posts) {
      if (post.holderId !== charId) continue;
      const tpl = positionMap.get(post.templateId);
      if (!tpl?.grantsControl) continue;
      if (tpl.minRank > bestRank) {
        bestRank = tpl.minRank;
        bestName = `${terr.name}${tpl.name}`;
      }
    }
  }
  return bestName || '';
}

function renderAge(charId: string, snap: EventContextSnapshot): string {
  const c = snap.characters.get(charId);
  if (!c) return '';
  const age = snap.currentYear - c.birthYear;
  return `${age}岁`;
}

function renderTraits(charId: string, snap: EventContextSnapshot): string {
  const c = snap.characters.get(charId);
  if (!c) return '';
  const names: string[] = [];
  for (const tid of c.traitIds) {
    const t = traitMap.get(tid);
    if (!t) continue;
    if (t.category !== 'innate' && t.category !== 'personality') continue;
    names.push(t.name);
  }
  return names.length > 0 ? `性${names.join('、')}` : '';
}

const ABILITY_LABELS: Record<string, string> = {
  military: '善战',
  administration: '善治',
  strategy: '善谋',
  diplomacy: '善交',
  scholarship: '博学',
};

function renderAbilities(charId: string, snap: EventContextSnapshot): string {
  const c = snap.characters.get(charId);
  if (!c) return '';
  const tags: string[] = [];
  for (const [key, label] of Object.entries(ABILITY_LABELS)) {
    if (c.abilities[key as keyof Abilities] >= 7) tags.push(label);
  }
  return tags.join('、');
}

function renderTerritory(charId: string, snap: EventContextSnapshot): string {
  const set = snap.controllerIndex.get(charId);
  if (!set || set.size === 0) return '无领地';
  return `辖${set.size}州`;
}

function renderMilitary(charId: string, snap: EventContextSnapshot): string {
  let total = 0;
  for (const army of snap.armies.values()) {
    if (army.ownerId !== charId) continue;
    for (const bat of snap.battalions.values()) {
      if (bat.armyId === army.id) total += bat.currentStrength;
    }
  }
  if (total === 0) return '';
  return `兵力约${total}`;
}

function renderAllegiance(charId: string, snap: EventContextSnapshot): string {
  const c = snap.characters.get(charId);
  if (!c) return '';
  if (!c.overlordId) return '独立';
  const overlord = snap.characters.get(c.overlordId);
  return `臣属于${overlord?.name ?? '?'}`;
}

function renderVassals(charId: string, snap: EventContextSnapshot): string {
  const set = snap.vassalIndex.get(charId);
  if (!set || set.size === 0) return '';
  const names: string[] = [];
  for (const vid of set) {
    if (names.length >= 3) break;
    const v = snap.characters.get(vid);
    if (v?.alive) names.push(v.name);
  }
  if (names.length === 0) return '';
  const suffix = set.size > 3 ? `等${set.size}人` : '';
  return `臣属：${names.join('、')}${suffix}`;
}

function renderWars(charId: string, snap: EventContextSnapshot): string {
  const parts: string[] = [];
  for (const war of snap.wars.values()) {
    if (war.status !== 'active') continue;
    const isAttacker = war.attackerId === charId || war.attackerParticipants.includes(charId);
    const isDefender = war.defenderId === charId || war.defenderParticipants.includes(charId);
    if (!isAttacker && !isDefender) continue;

    const enemyId = isAttacker ? war.defenderId : war.attackerId;
    const enemyName = snap.characters.get(enemyId)?.name ?? '?';
    const cbName = CASUS_BELLI_NAMES[war.casusBelli] ?? war.casusBelli;
    parts.push(`正与${enemyName}交战（${cbName}）`);
  }
  return parts.join('；');
}

function renderFamily(charId: string, snap: EventContextSnapshot): string {
  const c = snap.characters.get(charId);
  if (!c) return '';
  const parts: string[] = [];
  if (c.family.fatherId) {
    const father = snap.characters.get(c.family.fatherId);
    if (father) parts.push(`父${father.name}`);
  }
  const childNames: string[] = [];
  for (const cid of c.family.childrenIds) {
    if (childNames.length >= 3) break;
    const child = snap.characters.get(cid);
    if (child?.alive) childNames.push(child.name);
  }
  if (childNames.length > 0) parts.push(`子${childNames.join('、')}`);
  return parts.join('，');
}

// ── 字段渲染分派 ─────────────────────────────────────────

const FIELD_RENDERERS: Record<FieldKey, (charId: string, snap: EventContextSnapshot) => string> = {
  mainPost: renderMainPost,
  age: renderAge,
  traits: renderTraits,
  abilities: renderAbilities,
  territory: renderTerritory,
  military: renderMilitary,
  allegiance: renderAllegiance,
  vassals: renderVassals,
  wars: renderWars,
  family: renderFamily,
};

function renderCharCard(
  charId: string,
  roleLabel: string,
  fields: FieldKey[],
  snap: EventContextSnapshot,
): string {
  const c = snap.characters.get(charId);
  if (!c) return '';
  const parts: string[] = [];
  for (const key of fields) {
    const val = FIELD_RENDERERS[key](charId, snap);
    if (val) parts.push(val);
  }
  if (parts.length === 0) return '';
  return `    [${roleLabel}] ${c.name}：${parts.join('，')}`;
}

// ── 事件类型 → actor 字段映射 ────────────────────────────

interface ActorFieldSpec {
  roleLabel: string;
  fields: FieldKey[];
}

// 按 actor 数组位置定义；部分事件的 actor 含义参见 formatActorRoles
type EventFieldMapping = ActorFieldSpec[];

const EVENT_FIELD_MAP: Record<string, EventFieldMapping> = {
  // ── 军事 ──
  '宣战': [
    { roleLabel: '宣战方', fields: ['mainPost', 'territory', 'military', 'allegiance'] },
    { roleLabel: '被攻方', fields: ['mainPost', 'territory', 'military', 'allegiance'] },
  ],
  '野战': [], // 野战特殊处理：从 payload 取 commanderId
  '城破': [
    { roleLabel: '攻城方', fields: ['mainPost', 'territory', 'military'] },
    { roleLabel: '守方', fields: ['mainPost', 'allegiance'] },
  ],
  '战争结束': [
    { roleLabel: '攻方', fields: ['territory', 'military'] },
    { roleLabel: '守方', fields: ['territory', 'military'] },
  ],
  '兵变': [
    { roleLabel: '所属势力', fields: ['mainPost', 'traits'] },
  ],
  '战争接续': [
    { roleLabel: '阵亡', fields: ['mainPost', 'age'] },
    { roleLabel: '继任', fields: ['age', 'traits', 'abilities'] },
    { roleLabel: '敌方', fields: ['mainPost'] },
  ],

  // ── 继承 ──
  '继位': [
    { roleLabel: '薨者', fields: ['age', 'mainPost', 'traits'] },
    { roleLabel: '继位者', fields: ['age', 'traits', 'abilities'] },
  ],
  '绝嗣': [
    { roleLabel: '薨者', fields: ['age', 'mainPost', 'traits'] },
  ],
  '王朝覆灭': [
    { roleLabel: '薨者', fields: ['age', 'mainPost'] },
  ],

  // ── 人事 ──
  '任命': [
    { roleLabel: '任命者', fields: ['mainPost'] },
    { roleLabel: '被任命', fields: ['abilities', 'traits'] },
  ],
  '罢免': [
    { roleLabel: '罢免者', fields: ['mainPost'] },
    { roleLabel: '被罢免', fields: ['traits'] },
  ],
  '剥夺': [
    { roleLabel: '剥夺者', fields: ['mainPost', 'territory'] },
    { roleLabel: '被剥夺', fields: ['territory', 'allegiance'] },
  ],
  '抗命': [
    { roleLabel: '抗命者', fields: ['traits', 'military', 'territory'] },
    { roleLabel: '上级', fields: ['mainPost', 'military'] },
  ],
  '调任': [
    { roleLabel: '调任者', fields: ['mainPost'] },
    { roleLabel: '被调入朝', fields: ['traits', 'territory'] },
    { roleLabel: '接任者', fields: ['abilities'] },
  ],
  '转移臣属': [
    { roleLabel: '转出方', fields: ['mainPost'] },
    { roleLabel: '臣属', fields: ['territory'] },
    { roleLabel: '接收方', fields: ['mainPost'] },
  ],

  // ── 外交 ──
  '归附': [
    { roleLabel: '归附者', fields: ['territory', 'military', 'vassals'] },
    { roleLabel: '受附', fields: ['territory', 'mainPost'] },
  ],
  '要求效忠': [
    { roleLabel: '要求方', fields: ['mainPost', 'territory', 'military'] },
    { roleLabel: '臣服方', fields: ['territory', 'military'] },
  ],
  '逼迫授权': [
    { roleLabel: '逼迫方', fields: ['territory', 'military', 'traits'] },
    { roleLabel: '被迫方', fields: ['mainPost'] },
  ],
  '议定进奉': [
    { roleLabel: '请求方', fields: ['territory'] },
    { roleLabel: '领主', fields: ['mainPost'] },
  ],
  '留后指定': [
    { roleLabel: '指定者', fields: ['mainPost'] },
    { roleLabel: '留后', fields: ['age', 'abilities', 'traits', 'family'] },
  ],

  // ── 头衔 ──
  '篡夺头衔': [
    { roleLabel: '篡夺者', fields: ['territory', 'military', 'allegiance'] },
    { roleLabel: '原持有', fields: ['territory', 'allegiance'] },
  ],
  '称王': [
    { roleLabel: '主事者', fields: ['territory', 'mainPost'] },
  ],
  '建镇': [
    { roleLabel: '主事者', fields: ['territory', 'mainPost'] },
  ],
  '称帝': [
    { roleLabel: '主事者', fields: ['territory', 'mainPost'] },
  ],
  '销毁头衔': [
    { roleLabel: '主事者', fields: ['territory', 'mainPost'] },
  ],

  // ── 同盟 ──
  '缔结同盟': [
    { roleLabel: '盟主一', fields: ['mainPost', 'traits', 'territory', 'military'] },
    { roleLabel: '盟主二', fields: ['mainPost', 'traits', 'territory', 'military'] },
  ],
  '解除同盟': [
    { roleLabel: '解约方', fields: ['mainPost', 'allegiance'] },
    { roleLabel: '原盟友', fields: ['mainPost', 'allegiance'] },
  ],
  '同盟到期': [
    { roleLabel: '原盟主一', fields: ['mainPost'] },
    { roleLabel: '原盟主二', fields: ['mainPost'] },
  ],
  '同盟参战': [
    { roleLabel: '履约方', fields: ['mainPost', 'military', 'allegiance'] },
    { roleLabel: '召唤方', fields: ['mainPost', 'wars'] },
    { roleLabel: '敌方', fields: ['mainPost'] },
  ],
  '同盟反戈': [
    { roleLabel: '反戈方', fields: ['mainPost', 'traits', 'military', 'territory'] },
    { roleLabel: '原领主', fields: ['mainPost', 'military'] },
    { roleLabel: '召唤方', fields: ['mainPost', 'military'] },
  ],
  '两盟相绞': [
    { roleLabel: '困局方', fields: ['mainPost', 'traits', 'allegiance'] },
    { roleLabel: '涉方一', fields: ['mainPost'] },
    { roleLabel: '涉方二', fields: ['mainPost'] },
  ],
  '背盟宣战': [
    { roleLabel: '背盟方', fields: ['mainPost', 'traits', 'military'] },
    { roleLabel: '受害方', fields: ['mainPost', 'military', 'allegiance'] },
  ],
  '背盟拒援': [
    { roleLabel: '背盟方', fields: ['mainPost', 'traits', 'military'] },
    { roleLabel: '受害方', fields: ['mainPost', 'allegiance'] },
  ],

  // ── 计谋 ──
  '发起离间': [
    { roleLabel: '主谋', fields: ['mainPost', 'traits', 'abilities'] },
    { roleLabel: '直接目标', fields: ['mainPost', 'traits', 'allegiance'] },
    { roleLabel: '次要目标', fields: ['mainPost', 'traits', 'allegiance'] },
  ],
  '离间成功': [
    { roleLabel: '主谋', fields: ['mainPost', 'traits', 'abilities'] },
    { roleLabel: '直接目标', fields: ['mainPost', 'traits', 'allegiance'] },
    { roleLabel: '次要目标', fields: ['mainPost', 'traits', 'allegiance'] },
  ],
  '离间失败': [
    { roleLabel: '主谋', fields: ['mainPost', 'traits', 'abilities'] },
    { roleLabel: '直接目标', fields: ['mainPost', 'traits', 'abilities'] },
    { roleLabel: '次要目标', fields: ['mainPost', 'allegiance'] },
  ],
  '离间暴露': [
    { roleLabel: '主谋', fields: ['mainPost', 'traits', 'abilities'] },
    { roleLabel: '直接目标', fields: ['mainPost', 'traits', 'abilities'] },
    { roleLabel: '次要目标', fields: ['mainPost', 'allegiance'] },
  ],
};

// ── 主入口 ───────────────────────────────────────────────

/**
 * 为一条游戏事件生成上下文卡片行（0~N 行）。
 * 返回的每行已缩进，可直接拼到事件行后面。
 */
export function buildEventContext(
  event: GameEvent,
  snap: EventContextSnapshot,
): string[] {
  const lines: string[] = [];

  // 野战特殊处理：从 payload 取主将 ID
  if (event.type === '野战') {
    const p = event.payload as {
      attackerCommanderId?: string;
      defenderCommanderId?: string;
    } | undefined;
    if (p?.attackerCommanderId) {
      const line = renderCharCard(p.attackerCommanderId, '攻方主将', ['traits', 'abilities', 'allegiance'], snap);
      if (line) lines.push(line);
    }
    if (p?.defenderCommanderId) {
      const line = renderCharCard(p.defenderCommanderId, '守方主将', ['traits', 'abilities', 'allegiance'], snap);
      if (line) lines.push(line);
    }
    return lines;
  }

  // 通用路径：按映射表渲染
  const mapping = EVENT_FIELD_MAP[event.type];
  if (!mapping) return lines;

  for (let i = 0; i < mapping.length; i++) {
    const spec = mapping[i];
    const charId = event.actors[i];
    if (!charId) continue;
    const line = renderCharCard(charId, spec.roleLabel, spec.fields, snap);
    if (line) lines.push(line);
  }

  // 城破特殊：actor[1+] 都是守方，只取第一个
  // （mapping 只定义了 [0] 和 [1]，多余的守方 actor 忽略）

  return lines;
}
