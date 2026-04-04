const fs = require('fs');

const zhouMapping = JSON.parse(fs.readFileSync('D:/桌面/Github上传/Wantangfengyun/wantang/ck3_to_zhous_mapping.json', 'utf-8'));
const existingTerritories = JSON.parse(fs.readFileSync('D:/桌面/Github上传/Wantangfengyun/wantang/src/data/territories.json', 'utf-8'));

// Build supplement keyed by zhouId
const supplement = {};
for (const z of zhouMapping) {
  const allProvinces = [];
  const allCounties = [];
  const allDuchies = new Set();
  const allKingdoms = new Set();
  const allEmpires = new Set();
  
  for (const m of z.ck3Matches) {
    allCounties.push(m.county);
    allProvinces.push(...m.provinces);
    allDuchies.add(m.duchy);
    allKingdoms.add(m.kingdom);
    allEmpires.add(m.empire);
  }

  // Calculate derived development/population proxy from holding counts
  const holdingCount = Object.values(z.holdings || {}).reduce((a, b) => a + b, 0);
  let developmentEstimate = 1;
  if (holdingCount >= 7) developmentEstimate = 5;
  else if (holdingCount >= 5) developmentEstimate = 4;
  else if (holdingCount >= 3) developmentEstimate = 3;
  else if (holdingCount >= 2) developmentEstimate = 2;

  // Base population proxy (very rough: 50k per holding)
  const basePopulationEstimate = holdingCount * 50000;

  supplement[z.zhouId] = {
    ck3Mapping: {
      counties: allCounties,
      duchies: Array.from(allDuchies),
      kingdoms: Array.from(allKingdoms),
      empires: Array.from(allEmpires),
      provinces: allProvinces
    },
    history867: {
      dominantCulture: z.dominantCulture,
      dominantReligion: z.dominantReligion,
      holdings: z.holdings || {},
      holdingCount,
      provinceCount: z.totalProvinces
    },
    gameStatsEstimate: {
      development: developmentEstimate,
      basePopulation: basePopulationEstimate,
      control: 100
    }
  };
}

// Also create a flat array version for easier import
const supplementArray = Object.entries(supplement).map(([zhouId, data]) => ({
  zhouId,
  ...data
}));

fs.writeFileSync('D:/桌面/Github上传/Wantangfengyun/wantang/ck3_supplement_data.json', JSON.stringify({
  version: 'preliminary-867',
  totalZhou: supplementArray.length,
  byId: supplement,
  list: supplementArray
}, null, 2));

console.log('Supplement data written to wantang/ck3_supplement_data.json');
console.log('Total zhou:', supplementArray.length);
