const fs = require('fs');

const hierarchy = JSON.parse(fs.readFileSync('D:/桌面/Github上传/Wantangfengyun/wantang/ck3_china_hierarchy.json', 'utf-8'));
const zhouMapping = JSON.parse(fs.readFileSync('D:/桌面/Github上传/Wantangfengyun/wantang/ck3_to_zhous_mapping.json', 'utf-8'));
const existingTerritories = JSON.parse(fs.readFileSync('D:/桌面/Github上传/Wantangfengyun/wantang/src/data/territories.json', 'utf-8'));

// Build empire-kingdom-duchy tree from CK3 for report
const empireStats = [];
for (const e of hierarchy) {
  const eStat = { id: e.id, kingdoms: [] };
  for (const k of e.children) {
    const kStat = { id: k.id, duchies: [] };
    for (const d of k.children) {
      const dStat = { id: d.id, counties: d.children.map(c => c.id), provinceCount: d.children.reduce((sum, c) => sum + c.provinces.length, 0) };
      kStat.duchies.push(dStat);
    }
    eStat.kingdoms.push(kStat);
  }
  empireStats.push(eStat);
}

// Build report markdown
let md = '# 晚唐风云 × CK3 地图数据补充方案（初步版）\n\n';
md += '> 基于 CK3 原版文件（`02_china.txt`、`e_china.txt` 等）梳理\n> \n';
md += '> 映射关系：**帝国(e_) → 国(guo) | 王国(k_) → 道(dao) | 公爵领(d_) → 州(zhou)**\n> \n';
md += '> 注：CK3 的县(c_) 在晚唐语境下实际等同于传统"州"，因此在补充数据中作为州的子区域（地块/男爵领）处理。\n\n';

md += '## 一、CK3 中国地区数据概览\n\n';
md += '| CK3 帝国 | 中文对应 | 王国数 | 公爵领数 | 县数 | Province 数 |\n';
md += '|----------|----------|--------|----------|------|-------------|\n';
for (const e of empireStats) {
  const duchyCount = e.kingdoms.reduce((s, k) => s + k.duchies.length, 0);
  const countyCount = e.kingdoms.reduce((s, k) => s + k.duchies.reduce((s2, d) => s2 + d.counties.length, 0), 0);
  const provCount = e.kingdoms.reduce((s, k) => s + k.duchies.reduce((s2, d) => s2 + d.provinceCount, 0), 0);
  let cnName = '';
  switch(e.id) {
    case 'e_zhongyuan': cnName = '中原帝国（华北）'; break;
    case 'e_yongliang': cnName = '雍凉帝国（关陇）'; break;
    case 'e_jingyang': cnName = '荆扬帝国（江淮）'; break;
    case 'e_liangyi': cnName = '梁益帝国（巴蜀）'; break;
    case 'e_lingnan': cnName = '岭南帝国'; break;
  }
  md += '| ' + e.id + ' | ' + cnName + ' | ' + e.kingdoms.length + ' | ' + duchyCount + ' | ' + countyCount + ' | ' + provCount + ' |\n';
}

md += '\n## 二、现有 49 州与 CK3 数据对应表\n\n';
md += '| 晚唐州 ID | 州名 | CK3 County | CK3 Duchy | CK3 Kingdom | Province 数 | 867年主流文化 | 867年主流宗教 | 要塞配置 |\n';
md += '|-----------|------|------------|-----------|-------------|-------------|---------------|---------------|----------|\n';
for (const z of zhouMapping) {
  const ck3Counties = z.ck3Matches.map(m => m.county.replace('c_', '')).join(', ');
  const ck3Duchy = z.ck3Matches[0]?.duchy.replace('d_', '') || '';
  const ck3Kingdom = z.ck3Matches[0]?.kingdom.replace('k_', '') || '';
  const holdingsStr = Object.entries(z.holdings).map(([k,v]) => k.replace('_holding','') + ':' + v).join(', ');
  md += '| ' + z.zhouId + ' | ' + z.zhouName + ' | ' + ck3Counties + ' | ' + ck3Duchy + ' | ' + ck3Kingdom + ' | ' + z.totalProvinces + ' | ' + z.dominantCulture + ' | ' + z.dominantReligion + ' | ' + holdingsStr + ' |\n';
}

md += '\n## 三、层级映射详细说明\n\n';
md += '### 3.1 国级映射（帝国 → 国）\n\n';
md += '由于 CK3 帝国范围往往跨越大片地理区域，与晚唐十道的"国"划分并不完全重合，以下按地理核心区域做近似对应：\n\n';
md += '- **e_zhongyuan (中原帝国)** → 主要对应 `guo-zhongyuan`（中原国）+ `guo-hebei`（河北国）东部\n';
md += '  - 包含 k_henan（河南）、k_qingxu（青徐）、k_hebei（河北）、k_hedong（河东）、k_youji（幽蓟）、k_daibei（代北）\n';
md += '- **e_yongliang (雍凉帝国)** → 对应 `guo-guanlong`（关陇国）\n';
md += '  - 包含 k_guannei（关内）、k_hexi（河西）、k_xia（夏/定难）\n';
md += '- **e_jingyang (荆扬帝国)** → 主要对应 `guo-zhongyuan`（淮南/山南部分）+ `guo-dongnan`（东南国）北部\n';
md += '  - 包含 k_huainan（淮南）、k_jiangdong（江东）、k_liangzhe（两浙）、k_jiangxi（江西）、k_shannan（山南）、k_hunan（湖南）、k_fujian（福建）\n';
md += '- **e_liangyi (梁益帝国)** → 对应 `guo-bashu`（巴蜀国）+ 部分黔中、大理地区\n';
md += '  - 包含 k_xichuan（西川）、k_xingyuan（兴元/山南西）、k_dongchuan（东川）、k_kuizhou（夔州）、k_qianzhong（黔中）、k_dali（大理）\n';
md += '- **e_lingnan (岭南帝国)** → 对应 `guo-dongnan`（东南国）南部\n';
md += '  - 包含 k_lingnan（岭南）、k_lingxi（岭西）、k_viet（交趾）\n';

md += '\n### 3.2 道级映射（王国 → 道）\n\n';
md += 'CK3 王国(k_) 在规模上与晚唐"道"大致相当。大部分现有道可以直接对应到 CK3 王国，少部分需要合并或拆分：\n\n';
md += '| 现有道 | 对应 CK3 王国 | 说明 |\n';
md += '|--------|----------------|------|\n';
md += '| dao-jingji (京畿道) | k_guannei 南部 | 长安、凤翔一带属于 k_guannei |\n';
md += '| dao-guannei (关内道) | k_guannei 中北部 | 邠宁、朔方等节度使辖区 |\n';
md += '| dao-duji (都畿道) | k_henan 西部 | 洛阳、陕州属于 k_henan |\n';
md += '| dao-hedong (河东道) | k_hedong | 完全对应 |\n';
md += '| dao-youzhou (河北道·幽州) | k_youji | 幽州、瀛州、定州 |\n';
md += '| dao-chengde (河北道·成德) | k_hebei 中南部 | 对应 d_xingming 等 |\n';
md += '| dao-weibo (河北道·魏博) | k_hebei 南部 | 魏州、相州 |\n';
md += '| dao-henan (河南道) | k_henan 东部 + k_qingxu | 汴州、滑州、郓州等 |\n';
md += '| dao-shannan-e (山南东道) | k_shannan | 襄阳、江陵、鄂州 |\n';
md += '| dao-shannan-w (山南西道) | k_xingyuan | 兴元、遂州 |\n';
md += '| dao-huainan (淮南道) | k_huainan | 扬州 |\n';
md += '| dao-jiangnan-e (江南东道) | k_jiangdong + k_liangzhe + k_fujian | 润州、越州、福州等 |\n';
md += '| dao-jiangnan-w (江南西道) | k_jiangxi + k_hunan | 洪州、潭州 |\n';
md += '| dao-jiannan (剑南道) | k_xichuan + k_dongchuan | 成都、梓州 |\n';
md += '| dao-lingnan (岭南道) | k_lingnan + k_lingxi + k_viet | 广州、邕州、桂州、交州 |\n';
md += '| dao-longyou (陇右道) | k_hexi 东部 + k_guannei 西部 | 泾州、秦州 |\n';
md += '| dao-hexi (河西道) | k_hexi 西部 | 沙州、瓜州 |\n';

md += '\n### 3.3 州级映射（公爵领 → 州）\n\n';
md += '按用户要求，CK3 公爵领(d_) 对应州(zhou)。这意味着现有游戏中的 49 个州需要对应到 CK3 的约 100 个公爵领。\n';
md += '实际对应中，我们发现：**现有游戏的"州"名大多与 CK3 的县(c_) 同名**（如 c_bianzhou → 汴州、 c_weizhou → 魏州）。\n';
md += '这说明 CK3 的县(c_) 在行政级别上更接近晚唐的"州"。而 CK3 的公爵领(d_) 更接近晚唐的**藩镇/节度使辖区**（如 d_weibo 管辖魏州、博州、相州）。\n';
md += '为保持与现有数据结构兼容，建议采取以下两种方案之一：\n\n';
md += '**方案 A（用户要求）**：将公爵领(d_) 提升为州，县(c_) 降为县/地块。这会增加州的数量，但更符合 CK3 数据粒度。\n';
md += '**方案 B（建议）**：保持现有 49 州不变，将 CK3 县(c_) 直接对应为州，公爵领(d_) 数据作为"州群/藩镇"参考。这样可以在不动层级的前提下补充 province 数据。\n';

md += '\n## 四、867 年初始数据统计\n\n';
md += '基于 CK3 `e_china.txt`、`e_viet.txt`、`e_dali.txt` 的 867.1.1 历史数据。\n\n';

md += '### 4.1 各州 Province 数量分布\n\n';
md += '- Province 数 ≥ 5 的州（大型州）：' + zhouMapping.filter(z => z.totalProvinces >= 5).map(z => z.zhouName).join('、') + '\n';
md += '- Province 数 = 4 的州（标准州）：' + zhouMapping.filter(z => z.totalProvinces === 4).map(z => z.zhouName).join('、') + '\n';
md += '- Province 数 = 3 的州（小型州）：' + zhouMapping.filter(z => z.totalProvinces === 3).map(z => z.zhouName).join('、') + '\n';
md += '- Province 数 = 2 的州（极小型/边疆州）：' + zhouMapping.filter(z => z.totalProvinces <= 2).map(z => z.zhouName).join('、') + '\n';

md += '\n### 4.2 文化分布\n\n';
const cultureCounts = {};
for (const z of zhouMapping) {
  if (z.dominantCulture && z.dominantCulture !== 'unknown') {
    cultureCounts[z.dominantCulture] = (cultureCounts[z.dominantCulture] || 0) + 1;
  }
}
md += '| 文化 | 覆盖州数 |\n';
md += '|------|----------|\n';
for (const [c, n] of Object.entries(cultureCounts).sort((a,b) => b[1]-a[1])) {
  md += '| ' + c + ' | ' + n + ' |\n';
}

md += '\n### 4.3 宗教分布\n\n';
const religionCounts = {};
for (const z of zhouMapping) {
  if (z.dominantReligion && z.dominantReligion !== 'unknown') {
    religionCounts[z.dominantReligion] = (religionCounts[z.dominantReligion] || 0) + 1;
  }
}
md += '| 宗教 | 覆盖州数 |\n';
md += '|------|----------|\n';
for (const [r, n] of Object.entries(religionCounts).sort((a,b) => b[1]-a[1])) {
  md += '| ' + r + ' | ' + n + ' |\n';
}

md += '\n## 五、缺失与补充建议\n\n';
md += '### 5.1 当前游戏中缺失的 CK3 地区\n\n';
md += 'CK3 中国地区共有约 **100 个公爵领、380 个县**。现有游戏只覆盖了其中约 49 个核心州。以下 CK3 公爵领/县尚未在游戏中体现：\n\n';

// Find unmatched CK3 counties
const matchedCK3Counties = new Set();
for (const z of zhouMapping) {
  for (const m of z.ck3Matches) {
    matchedCK3Counties.add(m.county);
  }
}
const unmatchedDuchies = [];
for (const e of hierarchy) {
  for (const k of e.children) {
    for (const d of k.children) {
      const unmatchedCounties = d.children.filter(c => !matchedCK3Counties.has(c.id));
      if (unmatchedCounties.length > 0) {
        unmatchedDuchies.push({
          duchy: d.id,
          kingdom: k.id,
          empire: e.id,
          counties: unmatchedCounties.map(c => c.id)
        });
      }
    }
  }
}

md += '**完全未覆盖的公爵领（共 ' + unmatchedDuchies.length + ' 个）**：\n\n';
for (const d of unmatchedDuchies.slice(0, 30)) {
  md += '- `' + d.duchy + '` (' + d.kingdom + ' / ' + d.empire + ') → 包含 ' + d.counties.join(', ') + '\n';
}
if (unmatchedDuchies.length > 30) {
  md += '- ... 还有 ' + (unmatchedDuchies.length - 30) + ' 个未列出\n';
}

md += '\n### 5.2 具体补充建议\n\n';
md += '1. **人口与发展度**：可根据 CK3 867 年的 holding 数量来校准现有州的 `basePopulation` 和 `development`。CK3 中 holding 越多的 county，对应州的开发度应越高。\n';
md += '2. **文化与宗教字段**：现有 `territories.json` 中没有 `culture` 和 `religion` 字段。建议新增 `ck3Culture`、`ck3Religion` 字段，用于后续事件和叛乱系统。\n';
md += '3. **Province 边界数据**：每个州可以记录其对应的 CK3 province ID 列表（已整理在 `ck3_to_zhous_mapping.json` 中），未来如需精细地图渲染可直接使用。\n';
md += '4. **关隘补充**：CK3 的 `major_rivers.png` / `provinces.png` 地形数据可以用于识别自然边界（黄河、长江、秦岭），补充更多 `passName`。\n';
md += '5. **新增州/县**：河北地区（邢洺、深冀等）、剑南地区（邛南、武信等）、江南地区（宣歙各州）有大量未覆盖的 CK3 公爵领，可作为 Phase 3 扩展内容。\n';

md += '\n## 六、数据文件清单\n\n';
md += '本次梳理生成的文件（位于项目根目录）：\n\n';
md += '- `wantang/ck3_china_hierarchy.json` — CK3 中国完整层级（帝国→王国→公爵领→县→Province）\n';
md += '- `wantang/ck3_to_zhous_mapping.json` — 现有 49 州与 CK3 County/Province 的精确对应表\n';
md += '- `docs/ck3_map_supplement.md` — 本报告\n';

fs.writeFileSync('D:/桌面/Github上传/Wantangfengyun/docs/ck3_map_supplement.md', md);
console.log('Report written to docs/ck3_map_supplement.md');
