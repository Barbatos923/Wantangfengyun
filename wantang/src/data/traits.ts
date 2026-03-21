// ===== 特质定义 =====

import type { Abilities } from '@engine/character/types';

/** 特质类别 */
export type TraitCategory = 'innate' | 'personality' | 'education' | 'event';

/** 八维人格向量（每维范围 -1.0 ~ +1.0） */
export interface Personality {
  boldness: number;       // 胆识：进攻门槛，主动挑衅
  compassion: number;     // 同情心：释放囚犯，抑制暗杀/处决
  greed: number;          // 贪婪：加税索贡掠夺，不愿投资
  honor: number;          // 荣誉：守约不背盟，不屑索贡，抑制暗杀
  rationality: number;    // 理性：长期规划，危机求和
  sociability: number;    // 社交值：主动结盟遣使，行动权重×1.2
  vengefulness: number;   // 复仇心：放大仇恨，驱动暗杀进攻
  energy: number;         // 精力：决定每回合最大行动数(0-3)
}

/** 人格维度键名 */
export type PersonalityKey = keyof Personality;

/** 所有人格维度键列表 */
export const PERSONALITY_KEYS: PersonalityKey[] = [
  'boldness', 'compassion', 'greed', 'honor',
  'rationality', 'sociability', 'vengefulness', 'energy',
];

/** 特质定义 */
export interface TraitDef {
  id: string;
  name: string;
  category: TraitCategory;
  description: string;

  // 能力修正
  abilityModifiers: Partial<Abilities>;

  // 八维人格修正（原始加值，calcPersonality 求和后 clamp 到 [-1,1]）
  personalityModifiers?: Partial<Personality>;

  // 每月健康修正
  monthlyHealth: number;
  // 每月压力修正
  monthlyStress: number;
  // 每月民心修正（控制的州）
  monthlyPopulace: number;

  // 互斥特质ID列表
  exclusiveWith?: string[];

  // 对所有人好感修正
  globalOpinionModifier: number;

  // 教育等级（仅教育特质使用）
  educationLevel?: number;
  // 教育对应能力（仅教育特质使用）
  educationAbility?: keyof Abilities;
}

// ===== 先天特质 =====

const innateTraits: TraitDef[] = [
  {
    id: 'trait-genius',
    name: '天纵奇才',
    category: 'innate',
    description: '天赋异禀，世所罕见，全能力+3',
    abilityModifiers: { military: 3, administration: 3, strategy: 3, diplomacy: 3, scholarship: 3 },
    personalityModifiers: { rationality: 0.10, energy: 0.15 },
    monthlyHealth: 0,
    monthlyStress: 0,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-clever', 'trait-dull'],
    globalOpinionModifier: 5,
  },
  {
    id: 'trait-clever',
    name: '聪慧',
    category: 'innate',
    description: '聪颖过人，博闻强识，全能力+1',
    abilityModifiers: { military: 1, administration: 1, strategy: 1, diplomacy: 1, scholarship: 1 },
    personalityModifiers: { rationality: 0.05, energy: 0.05 },
    monthlyHealth: 0,
    monthlyStress: 0,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-genius', 'trait-dull'],
    globalOpinionModifier: 0,
  },
  {
    id: 'trait-dull',
    name: '愚钝',
    category: 'innate',
    description: '天资驽钝，不堪造就，全能力-2',
    abilityModifiers: { military: -2, administration: -2, strategy: -2, diplomacy: -2, scholarship: -2 },
    personalityModifiers: { rationality: -0.15, energy: -0.10 },
    monthlyHealth: 0,
    monthlyStress: 0,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-genius', 'trait-clever'],
    globalOpinionModifier: 0,
  },
  {
    id: 'trait-strong',
    name: '强壮',
    category: 'innate',
    description: '体魄强健，力能扛鼎，军事+2 每月健康+0.42',
    abilityModifiers: { military: 2 },
    personalityModifiers: { boldness: 0.05, energy: 0.05 },
    monthlyHealth: 0.42,
    monthlyStress: 0,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-frail'],
    globalOpinionModifier: 0,
  },
  {
    id: 'trait-frail',
    name: '体弱',
    category: 'innate',
    description: '体质虚弱，多病多灾，军事-2 每月健康-0.25',
    abilityModifiers: { military: -2 },
    personalityModifiers: { boldness: -0.05, energy: -0.10 },
    monthlyHealth: -0.25,
    monthlyStress: 0,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-strong'],
    globalOpinionModifier: 0,
  },
  {
    id: 'trait-comely',
    name: '俊朗',
    category: 'innate',
    description: '容貌出众，风仪过人，外交+1 对所有人好感+5',
    abilityModifiers: { diplomacy: 1 },
    personalityModifiers: { sociability: 0.10 },
    monthlyHealth: 0,
    monthlyStress: 0,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-ugly'],
    globalOpinionModifier: 5,
  },
  {
    id: 'trait-ugly',
    name: '丑陋',
    category: 'innate',
    description: '容貌不佳，令人生厌，外交-1 对所有人好感-5',
    abilityModifiers: { diplomacy: -1 },
    personalityModifiers: { sociability: -0.10 },
    monthlyHealth: 0,
    monthlyStress: 0,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-comely'],
    globalOpinionModifier: -5,
  },
];

// =========================================================================
//  性格特质（Personality Traits）
//  参照 CK3 全部性格特质，以晚唐历史文化重新命名与设定
//  每个特质均携带 personalityModifiers，数值范围 ±0.05 ~ ±0.50
//  设计原则：单个特质影响 2-4 个人格维度，主维度 ±0.20~0.50，副维度 ±0.05~0.15
// =========================================================================

const personalityTraits: TraitDef[] = [
  // ── 1. 勇武 vs 怯懦 (Brave / Craven) ─────────────
  {
    id: 'trait-brave',
    name: '勇武',
    category: 'personality',
    description: '临阵不惧，身先士卒。军事+3 每月压力-1',
    abilityModifiers: { military: 3 },
    personalityModifiers: { boldness: 0.40, energy: 0.10, sociability: 0.10, rationality: -0.10 },
    monthlyHealth: 0,
    monthlyStress: -1,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-coward'],
    globalOpinionModifier: 0,
  },
  {
    id: 'trait-coward',
    name: '怯懦',
    category: 'personality',
    description: '畏敌如虎，避战求全。军事-2 谋略+2',
    abilityModifiers: { military: -2, strategy: 2 },
    personalityModifiers: { boldness: -0.50, energy: -0.10, sociability: -0.10, rationality: 0.10 },
    monthlyHealth: 0,
    monthlyStress: 0,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-brave'],
    globalOpinionModifier: 0,
  },

  // ── 2. 野心 vs 知足 (Ambitious / Content) ─────────
  {
    id: 'trait-ambitious',
    name: '野心',
    category: 'personality',
    description: '志吞四海，不甘人下。全能力+1 每月压力+1',
    abilityModifiers: { military: 1, administration: 1, strategy: 1, diplomacy: 1, scholarship: 1 },
    personalityModifiers: { energy: 0.35, greed: 0.25, boldness: 0.20, sociability: 0.10, honor: -0.10 },
    monthlyHealth: 0,
    monthlyStress: 1,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-content'],
    globalOpinionModifier: -5,
  },
  {
    id: 'trait-content',
    name: '知足',
    category: 'personality',
    description: '安守本分，不慕荣华。每月压力-2 对上级好感+10',
    abilityModifiers: {},
    personalityModifiers: { energy: -0.35, greed: -0.30, boldness: -0.20, honor: 0.10 },
    monthlyHealth: 0,
    monthlyStress: -2,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-ambitious'],
    globalOpinionModifier: 0,
  },

  // ── 3. 公正 vs 专断 (Just / Arbitrary) ────────────
  {
    id: 'trait-just',
    name: '公正',
    category: 'personality',
    description: '赏罚分明，持法无私。管理+2 每月民心+0.5',
    abilityModifiers: { administration: 2 },
    personalityModifiers: { honor: 0.40, rationality: 0.15, vengefulness: 0.05 },
    monthlyHealth: 0,
    monthlyStress: 0,
    monthlyPopulace: 0.5,
    exclusiveWith: ['trait-arbitrary'],
    globalOpinionModifier: 5,
  },
  {
    id: 'trait-arbitrary',
    name: '专断',
    category: 'personality',
    description: '任性独断，不拘法度。谋略+3 管理-2 每月压力-1',
    abilityModifiers: { strategy: 3, administration: -2 },
    personalityModifiers: { honor: -0.40, rationality: -0.15, boldness: 0.10 },
    monthlyHealth: 0,
    monthlyStress: -1,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-just'],
    globalOpinionModifier: -5,
  },

  // ── 4. 合群 vs 内敛 (Gregarious / Shy) ────────────
  {
    id: 'trait-social',
    name: '合群',
    category: 'personality',
    description: '长袖善舞，交游广阔。外交+3 对所有人好感+5',
    abilityModifiers: { diplomacy: 3 },
    personalityModifiers: { sociability: 0.50, compassion: 0.10, boldness: 0.10 },
    monthlyHealth: 0,
    monthlyStress: 0,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-reclusive'],
    globalOpinionModifier: 5,
  },
  {
    id: 'trait-reclusive',
    name: '内敛',
    category: 'personality',
    description: '沉默寡言，不喜交游。外交-2 学识+2',
    abilityModifiers: { diplomacy: -2, scholarship: 2 },
    personalityModifiers: { sociability: -0.50, boldness: -0.10 },
    monthlyHealth: 0,
    monthlyStress: 0,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-social'],
    globalOpinionModifier: 0,
  },

  // ── 5. 多疑 vs 仁信 (Paranoid / Trusting) ────────
  {
    id: 'trait-suspicious',
    name: '多疑',
    category: 'personality',
    description: '猜忌多疑，事必躬亲。谋略+3 每月压力+2 对所有人好感-10',
    abilityModifiers: { strategy: 3 },
    personalityModifiers: { vengefulness: 0.15, sociability: -0.20, honor: -0.10, rationality: -0.10 },
    monthlyHealth: 0,
    monthlyStress: 2,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-trusting'],
    globalOpinionModifier: -10,
  },
  {
    id: 'trait-trusting',
    name: '仁信',
    category: 'personality',
    description: '推心置腹，用人不疑。外交+2 对所有人好感+10 每月压力-1',
    abilityModifiers: { diplomacy: 2 },
    personalityModifiers: { honor: 0.20, sociability: 0.20, compassion: 0.10, rationality: -0.10, vengefulness: -0.15 },
    monthlyHealth: 0,
    monthlyStress: -1,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-suspicious'],
    globalOpinionModifier: 10,
  },

  // ── 6. 沉稳 vs 暴躁 (Calm / Wrathful) ────────────
  {
    id: 'trait-calm',
    name: '沉稳',
    category: 'personality',
    description: '泰山崩于前而色不变。外交+1 谋略+1 每月压力-1',
    abilityModifiers: { diplomacy: 1, strategy: 1 },
    personalityModifiers: { rationality: 0.30, vengefulness: -0.10, boldness: -0.10 },
    monthlyHealth: 0,
    monthlyStress: -1,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-wrathful'],
    globalOpinionModifier: 0,
  },
  {
    id: 'trait-wrathful',
    name: '暴躁',
    category: 'personality',
    description: '一言不合，拔刀相向。军事+3 外交-1 谋略-1',
    abilityModifiers: { military: 3, diplomacy: -1, strategy: -1 },
    personalityModifiers: { boldness: 0.20, vengefulness: 0.15, energy: 0.10, compassion: -0.15, rationality: -0.25 },
    monthlyHealth: 0,
    monthlyStress: 0,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-calm'],
    globalOpinionModifier: -5,
  },

  // ── 7. 勤勉 vs 懒惰 (Diligent / Lazy) ────────────
  {
    id: 'trait-diligent',
    name: '勤勉',
    category: 'personality',
    description: '夙兴夜寐，励精图治。管理+3 学识+2',
    abilityModifiers: { administration: 3, scholarship: 2 },
    personalityModifiers: { energy: 0.35, boldness: 0.10, rationality: 0.10 },
    monthlyHealth: 0,
    monthlyStress: 0,
    monthlyPopulace: 0.3,
    exclusiveWith: ['trait-lazy'],
    globalOpinionModifier: 0,
  },
  {
    id: 'trait-lazy',
    name: '懒惰',
    category: 'personality',
    description: '怠惰政事，荒于嬉乐。全能力-1 每月压力-2',
    abilityModifiers: { military: -1, administration: -1, strategy: -1, diplomacy: -1, scholarship: -1 },
    personalityModifiers: { energy: -0.40, boldness: -0.10, greed: 0.05, compassion: -0.05 },
    monthlyHealth: 0,
    monthlyStress: -2,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-diligent'],
    globalOpinionModifier: 0,
  },

  // ── 8. 慷慨 vs 贪婪 (Generous / Greedy) ──────────
  {
    id: 'trait-generous',
    name: '慷慨',
    category: 'personality',
    description: '疏财仗义，赏赐丰厚。外交+3 对所有人好感+5',
    abilityModifiers: { diplomacy: 3 },
    personalityModifiers: { compassion: 0.20, honor: 0.10, sociability: 0.10, greed: -0.45 },
    monthlyHealth: 0,
    monthlyStress: 0,
    monthlyPopulace: 0.3,
    exclusiveWith: ['trait-greedy'],
    globalOpinionModifier: 5,
  },
  {
    id: 'trait-greedy',
    name: '贪婪',
    category: 'personality',
    description: '敛财无度，锱铢必较。外交-2 对所有人好感-5',
    abilityModifiers: { diplomacy: -2 },
    personalityModifiers: { greed: 0.50, honor: -0.10, compassion: -0.15 },
    monthlyHealth: 0,
    monthlyStress: 0,
    monthlyPopulace: -0.3,
    exclusiveWith: ['trait-generous'],
    globalOpinionModifier: -5,
  },

  // ── 9. 诚直 vs 狡黠 (Honest / Deceitful) ─────────
  {
    id: 'trait-honest',
    name: '诚直',
    category: 'personality',
    description: '秉性忠直，不事矫饰。外交+2 谋略-4 对所有人好感+5',
    abilityModifiers: { diplomacy: 2, strategy: -4 },
    personalityModifiers: { honor: 0.30, sociability: 0.10, boldness: 0.05, compassion: 0.05 },
    monthlyHealth: 0,
    monthlyStress: 0,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-deceitful'],
    globalOpinionModifier: 5,
  },
  {
    id: 'trait-deceitful',
    name: '狡黠',
    category: 'personality',
    description: '巧言令色，反复无常。谋略+4 外交-2',
    abilityModifiers: { strategy: 4, diplomacy: -2 },
    personalityModifiers: { honor: -0.30, rationality: 0.10, boldness: -0.05, compassion: -0.05 },
    monthlyHealth: 0,
    monthlyStress: 0,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-honest'],
    globalOpinionModifier: -5,
  },

  // ── 10. 谦逊 vs 倨傲 (Humble / Arrogant) ─────────
  {
    id: 'trait-humble',
    name: '谦逊',
    category: 'personality',
    description: '礼贤下士，虚怀若谷。对所有人好感+10',
    abilityModifiers: {},
    personalityModifiers: { compassion: 0.15, honor: 0.10, greed: -0.25, energy: -0.05 },
    monthlyHealth: 0,
    monthlyStress: 0,
    monthlyPopulace: 0.3,
    exclusiveWith: ['trait-arrogant'],
    globalOpinionModifier: 10,
  },
  {
    id: 'trait-arrogant',
    name: '倨傲',
    category: 'personality',
    description: '目中无人，自视甚高。对所有人好感-10',
    abilityModifiers: {},
    personalityModifiers: { boldness: 0.20, greed: 0.15, sociability: 0.10, energy: 0.05, compassion: -0.15, honor: -0.10, rationality: -0.10 },
    monthlyHealth: 0,
    monthlyStress: 0,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-humble'],
    globalOpinionModifier: -10,
  },

  // ── 11. 宽恕 vs 睚眦必报 (Forgiving / Vengeful) ──
  {
    id: 'trait-forgiving',
    name: '宽恕',
    category: 'personality',
    description: '宽仁大度，不念旧恶。外交+2 谋略-2',
    abilityModifiers: { diplomacy: 2, strategy: -2 },
    personalityModifiers: { compassion: 0.20, honor: 0.10, rationality: 0.05, vengefulness: -0.50 },
    monthlyHealth: 0,
    monthlyStress: 0,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-vengeful'],
    globalOpinionModifier: 5,
  },
  {
    id: 'trait-vengeful',
    name: '睚眦必报',
    category: 'personality',
    description: '有仇必报，绝不姑息。谋略+2 外交-2',
    abilityModifiers: { strategy: 2, diplomacy: -2 },
    personalityModifiers: { vengefulness: 0.50, energy: 0.10, honor: -0.05, compassion: -0.15, rationality: -0.05 },
    monthlyHealth: 0,
    monthlyStress: 0,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-forgiving'],
    globalOpinionModifier: -5,
  },

  // ── 12. 持重 vs 急躁 (Patient / Impatient) ────────
  {
    id: 'trait-patient',
    name: '持重',
    category: 'personality',
    description: '沉得住气，善于等待。学识+2 每月压力-1',
    abilityModifiers: { scholarship: 2 },
    personalityModifiers: { rationality: 0.25, vengefulness: 0.05, boldness: -0.10, energy: -0.05 },
    monthlyHealth: 0,
    monthlyStress: -1,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-impatient'],
    globalOpinionModifier: 0,
  },
  {
    id: 'trait-impatient',
    name: '急躁',
    category: 'personality',
    description: '急功近利，不能持久。学识-2 每月压力+1',
    abilityModifiers: { scholarship: -2 },
    personalityModifiers: { boldness: 0.15, energy: 0.10, rationality: -0.25, vengefulness: -0.05 },
    monthlyHealth: 0,
    monthlyStress: 1,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-patient'],
    globalOpinionModifier: 0,
  },

  // ── 13. 节制 vs 纵欲 (Temperate / Gluttonous) ────
  {
    id: 'trait-temperate',
    name: '节制',
    category: 'personality',
    description: '饮食有节，起居有常。管理+2 每月健康+0.25',
    abilityModifiers: { administration: 2 },
    personalityModifiers: { rationality: 0.10, greed: -0.20, energy: 0.05 },
    monthlyHealth: 0.25,
    monthlyStress: 0,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-gluttonous'],
    globalOpinionModifier: 0,
  },
  {
    id: 'trait-gluttonous',
    name: '纵欲',
    category: 'personality',
    description: '沉迷声色，嗜酒贪食。管理-2 每月压力-1',
    abilityModifiers: { administration: -2 },
    personalityModifiers: { greed: 0.20, energy: -0.10, rationality: -0.05 },
    monthlyHealth: 0,
    monthlyStress: -1,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-temperate'],
    globalOpinionModifier: 0,
  },

  // ── 14. 贞守 vs 好色 (Chaste / Lustful) ──────────
  {
    id: 'trait-chaste',
    name: '贞守',
    category: 'personality',
    description: '洁身自好，不近女色。学识+2',
    abilityModifiers: { scholarship: 2 },
    personalityModifiers: { honor: 0.10, energy: 0.05, greed: -0.10, sociability: -0.10 },
    monthlyHealth: 0,
    monthlyStress: 0,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-lustful'],
    globalOpinionModifier: 0,
  },
  {
    id: 'trait-lustful',
    name: '好色',
    category: 'personality',
    description: '渔色无度，纵情声色。谋略+2',
    abilityModifiers: { strategy: 2 },
    personalityModifiers: { sociability: 0.20, greed: 0.10, energy: 0.05, honor: -0.05 },
    monthlyHealth: 0,
    monthlyStress: 0,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-chaste'],
    globalOpinionModifier: -5,
  },

  // ── 15. 崇佛 vs 不信鬼神 (Zealous / Cynical) ─────
  {
    id: 'trait-devout',
    name: '崇佛',
    category: 'personality',
    description: '笃信佛法，悲悯天下。学识+2 军事-1 每月民心+0.3',
    abilityModifiers: { scholarship: 2, military: -1 },
    personalityModifiers: { compassion: 0.15, energy: 0.10, rationality: -0.10 },
    monthlyHealth: 0,
    monthlyStress: 0,
    monthlyPopulace: 0.3,
    exclusiveWith: ['trait-cynical'],
    globalOpinionModifier: 0,
  },
  {
    id: 'trait-cynical',
    name: '不信鬼神',
    category: 'personality',
    description: '不信天命，唯信实利。谋略+2 学识+2',
    abilityModifiers: { strategy: 2, scholarship: 2 },
    personalityModifiers: { rationality: 0.20, compassion: -0.05, energy: -0.10 },
    monthlyHealth: 0,
    monthlyStress: 0,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-devout'],
    globalOpinionModifier: 0,
  },

  // ── 16. 三向互斥：仁厚 / 冷酷 / 嗜杀 ────────────
  // CK3: Compassionate / Callous / Sadistic
  {
    id: 'trait-compassionate',
    name: '仁厚',
    category: 'personality',
    description: '恻隐之心，爱民如子。外交+2 谋略-2 每月民心+0.5',
    abilityModifiers: { diplomacy: 2, strategy: -2 },
    personalityModifiers: { compassion: 0.50, honor: 0.15, sociability: 0.15, greed: -0.10 },
    monthlyHealth: 0,
    monthlyStress: 0,
    monthlyPopulace: 0.5,
    exclusiveWith: ['trait-callous', 'trait-cruel'],
    globalOpinionModifier: 10,
  },
  {
    id: 'trait-callous',
    name: '冷酷',
    category: 'personality',
    description: '铁石心肠，不通人情。谋略+2 外交-2',
    abilityModifiers: { strategy: 2, diplomacy: -2 },
    personalityModifiers: { compassion: -0.40, rationality: 0.10, sociability: -0.10, honor: -0.15 },
    monthlyHealth: 0,
    monthlyStress: 0,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-compassionate', 'trait-cruel'],
    globalOpinionModifier: -5,
  },
  {
    id: 'trait-cruel',
    name: '嗜杀',
    category: 'personality',
    description: '暴虐嗜杀，以杀止杀。军事+2 谋略+2 每月民心-1 每月压力-1',
    abilityModifiers: { military: 2, strategy: 2 },
    personalityModifiers: { compassion: -0.50, honor: -0.30, boldness: 0.15, vengefulness: 0.10 },
    monthlyHealth: 0,
    monthlyStress: -1,
    monthlyPopulace: -1.0,
    exclusiveWith: ['trait-compassionate', 'trait-callous'],
    globalOpinionModifier: -10,
  },

  // ── 17. 三向互斥：善变 / 固执 / 古怪 ─────────────
  // CK3: Fickle / Stubborn / Eccentric
  {
    id: 'trait-fickle',
    name: '善变',
    category: 'personality',
    description: '朝令夕改，出尔反尔。外交+2 管理-2',
    abilityModifiers: { diplomacy: 2, administration: -2 },
    personalityModifiers: { boldness: 0.10, honor: -0.15, rationality: -0.15, vengefulness: -0.10 },
    monthlyHealth: 0,
    monthlyStress: 0,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-stubborn', 'trait-eccentric'],
    globalOpinionModifier: -5,
  },
  {
    id: 'trait-stubborn',
    name: '固执',
    category: 'personality',
    description: '执拗不化，不听人言。管理+3 每月健康+0.17',
    abilityModifiers: { administration: 3 },
    personalityModifiers: { honor: 0.20, vengefulness: 0.15, rationality: -0.05 },
    monthlyHealth: 0.17,
    monthlyStress: 0,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-fickle', 'trait-eccentric'],
    globalOpinionModifier: -5,
  },
  {
    id: 'trait-eccentric',
    name: '古怪',
    category: 'personality',
    description: '行事诡异，不拘常理。学识+3 外交-2',
    abilityModifiers: { scholarship: 3, diplomacy: -2 },
    personalityModifiers: { boldness: 0.25, honor: -0.10, sociability: -0.15, rationality: -0.40 },
    monthlyHealth: 0,
    monthlyStress: 0,
    monthlyPopulace: 0,
    exclusiveWith: ['trait-fickle', 'trait-stubborn'],
    globalOpinionModifier: -5,
  },
];

// ===== 教育特质（20个，5类×4级）=====

function makeEducationTraits(): TraitDef[] {
  const categories: {
    ability: keyof Abilities;
    names: [string, string, string, string];
  }[] = [
    { ability: 'military',       names: ['武略', '武才', '武杰', '武圣'] },
    { ability: 'administration', names: ['吏才', '吏杰', '吏圣', '名臣'] },
    { ability: 'strategy',       names: ['机敏', '谋才', '谋杰', '谋圣'] },
    { ability: 'diplomacy',      names: ['辩才', '纵横', '合纵', '舌辩天下'] },
    { ability: 'scholarship',    names: ['博闻', '鸿儒', '大儒', '经学宗师'] },
  ];

  const abilityLabels: Record<string, string> = {
    military: '军事',
    administration: '管理',
    strategy: '谋略',
    diplomacy: '外交',
    scholarship: '学识',
  };

  const traits: TraitDef[] = [];
  for (const cat of categories) {
    for (let level = 1; level <= 4; level++) {
      const name = cat.names[level - 1];
      const bonus = level * 2;
      traits.push({
        id: `trait-edu-${cat.ability}-${level}`,
        name,
        category: 'education',
        description: `${name}：${abilityLabels[cat.ability]}+${bonus}`,
        abilityModifiers: { [cat.ability]: bonus },
        monthlyHealth: 0,
        monthlyStress: 0,
        monthlyPopulace: 0,
        globalOpinionModifier: 0,
        educationLevel: level,
        educationAbility: cat.ability,
      });
    }
  }
  return traits;
}

// ===== 事件特质 =====

const eventTraits: TraitDef[] = [
  {
    id: 'trait-wounded',
    name: '负伤',
    category: 'event',
    description: '身受重伤，卧榻难起。每月健康-5 军事-3',
    abilityModifiers: { military: -3 },
    personalityModifiers: { boldness: -0.10, energy: -0.15 },
    monthlyHealth: -5,
    monthlyStress: 0,
    monthlyPopulace: 0,
    globalOpinionModifier: 0,
  },
  {
    id: 'trait-maimed',
    name: '残疾',
    category: 'event',
    description: '身有残缺，行动不便。军事-4 每月健康-1',
    abilityModifiers: { military: -4 },
    personalityModifiers: { boldness: -0.15, energy: -0.20 },
    monthlyHealth: -1,
    monthlyStress: 0,
    monthlyPopulace: 0,
    globalOpinionModifier: -5,
  },
  {
    id: 'trait-scarred',
    name: '伤疤',
    category: 'event',
    description: '满身伤痕，乃百战之证。军事+1',
    abilityModifiers: { military: 1 },
    personalityModifiers: { boldness: 0.05 },
    monthlyHealth: 0,
    monthlyStress: 0,
    monthlyPopulace: 0,
    globalOpinionModifier: 0,
  },
  {
    id: 'trait-anxious',
    name: '忧虑',
    category: 'event',
    description: '忧心忡忡，寝食难安。每月压力+3',
    abilityModifiers: {},
    personalityModifiers: { boldness: -0.10, rationality: -0.10, energy: -0.10 },
    monthlyHealth: 0,
    monthlyStress: 3,
    monthlyPopulace: 0,
    globalOpinionModifier: 0,
  },
  {
    id: 'trait-drunkard',
    name: '嗜酒',
    category: 'event',
    description: '沉溺杯中，不能自拔。管理-2 每月健康-0.5 每月压力-2',
    abilityModifiers: { administration: -2 },
    personalityModifiers: { rationality: -0.15, energy: -0.15, boldness: 0.10 },
    monthlyHealth: -0.5,
    monthlyStress: -2,
    monthlyPopulace: 0,
    globalOpinionModifier: -5,
  },
  {
    id: 'trait-ill',
    name: '染疾',
    category: 'event',
    description: '身染恶疾，需要调养。全能力-1 每月健康-3',
    abilityModifiers: { military: -1, administration: -1, strategy: -1, diplomacy: -1, scholarship: -1 },
    personalityModifiers: { energy: -0.25, boldness: -0.10 },
    monthlyHealth: -3,
    monthlyStress: 0,
    monthlyPopulace: 0,
    globalOpinionModifier: 0,
  },
];

// ===== 导出 =====

/** 全部特质定义 */
export const ALL_TRAITS: TraitDef[] = [
  ...innateTraits,
  ...personalityTraits,
  ...makeEducationTraits(),
  ...eventTraits,
];

/** 特质查找表 */
export const traitMap = new Map<string, TraitDef>();
for (const t of ALL_TRAITS) {
  traitMap.set(t.id, t);
}

/** 按类别获取特质 */
export function getTraitsByCategory(category: TraitCategory): TraitDef[] {
  return ALL_TRAITS.filter((t) => t.category === category);
}

/** 获取对应能力的教育特质（给定等级） */
export function getEducationTrait(ability: keyof Abilities, level: number): TraitDef | undefined {
  return traitMap.get(`trait-edu-${ability}-${level}`);
}
