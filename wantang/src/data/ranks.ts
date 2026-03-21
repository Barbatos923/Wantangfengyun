// ===== 散官品位定义 =====
// TODO: 待 ../engine/official/types 建立后，改为从该模块导入 RankDef

/** 散官品位定义 */
export interface RankDef {
  level: number;           // 1=从九品下, 29=从一品
  name: string;            // e.g. "从九品下"
  civilTitle: string;      // 文散官称号
  militaryTitle: string;   // 武散官称号
  virtueThreshold: number; // 晋升至此品所需的累计贤能值
  monthlySalary: { money: number; grain: number };
}

export const ALL_RANKS: RankDef[] = [
  // ── 九品 ───────────────────────────────────────────
  {
    level: 1,
    name: '从九品下',
    civilTitle: '将仕郎',
    militaryTitle: '陪戎副尉',
    virtueThreshold: 0,
    monthlySalary: { money: 5, grain: 3 },
  },
  {
    level: 2,
    name: '从九品上',
    civilTitle: '文林郎',
    militaryTitle: '陪戎校尉',
    virtueThreshold: 50,
    monthlySalary: { money: 6, grain: 4 },
  },
  {
    level: 3,
    name: '正九品下',
    civilTitle: '登仕郎',
    militaryTitle: '仁勇副尉',
    virtueThreshold: 100,
    monthlySalary: { money: 8, grain: 5 },
  },
  {
    level: 4,
    name: '正九品上',
    civilTitle: '儒林郎',
    militaryTitle: '仁勇校尉',
    virtueThreshold: 150,
    monthlySalary: { money: 10, grain: 6 },
  },

  // ── 八品 ───────────────────────────────────────────
  {
    level: 5,
    name: '从八品下',
    civilTitle: '承务郎',
    militaryTitle: '御侮副尉',
    virtueThreshold: 200,
    monthlySalary: { money: 12, grain: 8 },
  },
  {
    level: 6,
    name: '从八品上',
    civilTitle: '承奉郎',
    militaryTitle: '御侮校尉',
    virtueThreshold: 250,
    monthlySalary: { money: 15, grain: 10 },
  },
  {
    level: 7,
    name: '正八品下',
    civilTitle: '征事郎',
    militaryTitle: '宣节副尉',
    virtueThreshold: 300,
    monthlySalary: { money: 18, grain: 12 },
  },
  {
    level: 8,
    name: '正八品上',
    civilTitle: '给事郎',
    militaryTitle: '宣节校尉',
    virtueThreshold: 350,
    monthlySalary: { money: 22, grain: 15 },
  },

  // ── 七品 ───────────────────────────────────────────
  {
    level: 9,
    name: '从七品下',
    civilTitle: '宣义郎',
    militaryTitle: '翊麾副尉',
    virtueThreshold: 400,
    monthlySalary: { money: 25, grain: 18 },
  },
  {
    level: 10,
    name: '从七品上',
    civilTitle: '朝散郎',
    militaryTitle: '翊麾校尉',
    virtueThreshold: 450,
    monthlySalary: { money: 30, grain: 22 },
  },
  {
    level: 11,
    name: '正七品下',
    civilTitle: '宣德郎',
    militaryTitle: '致果副尉',
    virtueThreshold: 500,
    monthlySalary: { money: 37, grain: 26 },
  },
  {
    level: 12,
    name: '正七品上',
    civilTitle: '朝请郎',
    militaryTitle: '致果校尉',
    virtueThreshold: 550,
    monthlySalary: { money: 45, grain: 32 },
  },

  // ── 六品 ───────────────────────────────────────────
  {
    level: 13,
    name: '从六品下',
    civilTitle: '通直郎',
    militaryTitle: '振威副尉',
    virtueThreshold: 600,
    monthlySalary: { money: 50, grain: 38 },
  },
  {
    level: 14,
    name: '从六品上',
    civilTitle: '奉议郎',
    militaryTitle: '振威校尉',
    virtueThreshold: 650,
    monthlySalary: { money: 60, grain: 47 },
  },
  {
    level: 15,
    name: '正六品下',
    civilTitle: '承议郎',
    militaryTitle: '昭武副尉',
    virtueThreshold: 700,
    monthlySalary: { money: 72, grain: 56 },
  },
  {
    level: 16,
    name: '正六品上',
    civilTitle: '朝议郎',
    militaryTitle: '昭武校尉',
    virtueThreshold: 750,
    monthlySalary: { money: 85, grain: 65 },
  },

  // ── 五品（六→五品大门槛 +250）─────────────────────
  {
    level: 17,
    name: '从五品下',
    civilTitle: '朝散大夫',
    militaryTitle: '游骑将军',
    virtueThreshold: 1000,
    monthlySalary: { money: 100, grain: 75 },
  },
  {
    level: 18,
    name: '从五品上',
    civilTitle: '朝请大夫',
    militaryTitle: '游击将军',
    virtueThreshold: 1050,
    monthlySalary: { money: 120, grain: 95 },
  },
  {
    level: 19,
    name: '正五品下',
    civilTitle: '朝议大夫',
    militaryTitle: '宁远将军',
    virtueThreshold: 1100,
    monthlySalary: { money: 148, grain: 116 },
  },
  {
    level: 20,
    name: '正五品上',
    civilTitle: '中散大夫',
    militaryTitle: '定远将军',
    virtueThreshold: 1150,
    monthlySalary: { money: 180, grain: 140 },
  },

  // ── 四品 ───────────────────────────────────────────
  {
    level: 21,
    name: '从四品下',
    civilTitle: '中大夫',
    militaryTitle: '明威将军',
    virtueThreshold: 1200,
    monthlySalary: { money: 200, grain: 160 },
  },
  {
    level: 22,
    name: '从四品上',
    civilTitle: '太中大夫',
    militaryTitle: '宣威将军',
    virtueThreshold: 1250,
    monthlySalary: { money: 240, grain: 190 },
  },
  {
    level: 23,
    name: '正四品下',
    civilTitle: '通议大夫',
    militaryTitle: '壮武将军',
    virtueThreshold: 1300,
    monthlySalary: { money: 280, grain: 220 },
  },
  {
    level: 24,
    name: '正四品上',
    civilTitle: '正议大夫',
    militaryTitle: '忠武将军',
    virtueThreshold: 1350,
    monthlySalary: { money: 320, grain: 250 },
  },

  // ── 三品（四→三品门槛 +150）───────────────────────
  {
    level: 25,
    name: '从三品',
    civilTitle: '银青光禄大夫',
    militaryTitle: '云麾将军',
    virtueThreshold: 1500,
    monthlySalary: { money: 380, grain: 300 },
  },
  {
    level: 26,
    name: '正三品',
    civilTitle: '金紫光禄大夫',
    militaryTitle: '冠军大将军',
    virtueThreshold: 1650,
    monthlySalary: { money: 430, grain: 340 },
  },

  // ── 二品 ───────────────────────────────────────────
  {
    level: 27,
    name: '从二品',
    civilTitle: '光禄大夫',
    militaryTitle: '镇军大将军',
    virtueThreshold: 1800,
    monthlySalary: { money: 480, grain: 380 },
  },
  {
    level: 28,
    name: '正二品',
    civilTitle: '特进',
    militaryTitle: '辅国大将军',
    virtueThreshold: 2000,
    monthlySalary: { money: 550, grain: 430 },
  },

  // ── 一品 ───────────────────────────────────────────
  {
    level: 29,
    name: '从一品',
    civilTitle: '开府仪同三司',
    militaryTitle: '骠骑大将军',
    virtueThreshold: 2500,
    monthlySalary: { money: 650, grain: 500 },
  },
];

/** 散官品位查找表（以品级 level 为键） */
export const rankMap = new Map<number, RankDef>();
for (const r of ALL_RANKS) {
  rankMap.set(r.level, r);
}
