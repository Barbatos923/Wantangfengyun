// ===== 随机角色生成器（填充副岗用） =====

import type { Character } from '@engine/character/types';

// 晚唐常见姓氏（按频率粗略排列）
const SURNAMES = [
  '李', '王', '张', '刘', '陈', '杨', '赵', '周', '吴', '郑',
  '孙', '韩', '朱', '马', '胡', '林', '何', '高', '罗', '郭',
  '梁', '宋', '唐', '许', '邓', '冯', '曹', '彭', '曾', '田',
  '袁', '蒋', '范', '石', '姚', '崔', '董', '程', '沈', '卢',
  '魏', '蔡', '贾', '丁', '薛', '叶', '阎', '余', '潘', '杜',
  '戴', '夏', '钟', '汪', '施', '裴', '萧', '段', '温', '严',
];

// 名字用字（单字或双字组合）
const NAME_CHARS_1 = [
  '远', '承', '延', '景', '守', '德', '彦', '仲', '文', '正',
  '弘', '敬', '崇', '绍', '嗣', '安', '令', '知', '思', '宗',
];
const NAME_CHARS_2 = [
  '恩', '道', '礼', '义', '方', '谦', '翰', '瑜', '璋', '瑞',
  '明', '光', '庆', '和', '容', '朗', '平', '章', '达', '贤',
  '甫', '良', '茂', '谟', '休', '珪', '则', '度', '用', '节',
];

let _nameIdx = 0;

/**
 * 生成一个确定性的名字（避免重复）。
 * 不使用随机数，按序列分配，保证每次加载一致。
 */
function nextName(): { name: string; surname: string; clan: string } {
  const idx = _nameIdx++;
  const surnameIdx = idx % SURNAMES.length;
  const char1Idx = Math.floor(idx / SURNAMES.length) % NAME_CHARS_1.length;
  const char2Idx = Math.floor(idx / (SURNAMES.length * NAME_CHARS_1.length)) % NAME_CHARS_2.length;
  const surname = SURNAMES[surnameIdx];
  const given = NAME_CHARS_1[char1Idx] + NAME_CHARS_2[char2Idx];
  return { name: `${surname}${given}`, surname, clan: surname };
}

/** 重置名字序列（测试用） */
export function resetNameIndex(): void {
  _nameIdx = 0;
}

/**
 * 生成填充角色。
 * 能力值按序列均匀分布（5~18），不使用随机数。
 */
export function generateFillerCharacter(opts: {
  id: string;
  rankLevel: number;
  overlordId: string;
  isCivil: boolean;
  birthYearMin?: number;
  birthYearMax?: number;
}): Character {
  const { name, clan } = nextName();
  const {
    id, rankLevel, overlordId, isCivil,
    birthYearMin = 815, birthYearMax = 840,
  } = opts;

  // 确定性能力分配：用 id 的 hashCode 来分散
  const hash = hashStr(id);
  const abilityBase = 5;
  const abilityRange = 13; // 5~18
  const mil = abilityBase + (hash % abilityRange);
  const adm = abilityBase + ((hash >> 4) % abilityRange);
  const str = abilityBase + ((hash >> 8) % abilityRange);
  const dip = abilityBase + ((hash >> 12) % abilityRange);
  const sch = abilityBase + ((hash >> 16) % abilityRange);

  // 确定性 birthYear
  const birthRange = birthYearMax - birthYearMin;
  const birthYear = birthYearMin + (hash % (birthRange + 1));

  // virtue 基于 rankLevel：品级越高 virtue 越高（基础 + 偏移）
  const virtueBase = 400 + rankLevel * 25;
  const virtueOffset = ((hash >> 20) % 200) - 100; // -100~+99
  const virtue = Math.max(100, Math.min(1000, virtueBase + virtueOffset));

  return {
    id,
    name,
    courtesy: '',
    gender: '男',
    birthYear,
    clan,
    family: { childrenIds: [] },
    abilities: {
      military: mil,
      administration: adm,
      strategy: str,
      diplomacy: dip,
      scholarship: sch,
    },
    traitIds: [],
    health: 80 + (hash % 21), // 80~100
    stress: (hash >> 3) % 30, // 0~29
    alive: true,
    resources: {
      money: 1000 + rankLevel * 500,
      grain: 2000 + rankLevel * 800,
      prestige: rankLevel,
      legitimacy: 0,
    },
    relationships: [],
    overlordId,
    isPlayer: false,
    isRuler: false,
    title: '',
    official: { rankLevel, virtue, isCivil },
  };
}

/** 简单字符串 hash（确定性） */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
