# 晚唐风云 × CK3 地图数据补充方案（初步版）

> 基于 CK3 原版文件（`02_china.txt`、`e_china.txt` 等）梳理
> 
> 映射关系：**帝国(e_) → 国(guo) | 王国(k_) → 道(dao) | 公爵领(d_) → 州(zhou)**
> 
> 注：CK3 的县(c_) 在晚唐语境下实际等同于传统"州"，因此在补充数据中作为州的子区域（地块/男爵领）处理。

## 一、CK3 中国地区数据概览

| CK3 帝国 | 中文对应 | 王国数 | 公爵领数 | 县数 | Province 数 |
|----------|----------|--------|----------|------|-------------|
| e_zhongyuan | 中原帝国（华北） | 6 | 24 | 86 | 283 |
| e_yongliang | 雍凉帝国（关陇） | 3 | 19 | 73 | 208 |
| e_jingyang | 荆扬帝国（江淮） | 7 | 17 | 80 | 308 |
| e_liangyi | 梁益帝国（巴蜀） | 6 | 21 | 89 | 261 |
| e_lingnan | 岭南帝国 | 3 | 12 | 52 | 177 |

## 二、现有 49 州与 CK3 数据对应表

| 晚唐州 ID | 州名 | CK3 County | CK3 Duchy | CK3 Kingdom | Province 数 | 867年主流文化 | 867年主流宗教 | 要塞配置 |
|-----------|------|------------|-----------|-------------|-------------|---------------|---------------|----------|
| zhou-changan | 长安 | jingzhao | yongxing | guannei | 5 | han | jingxue | castle:3, city:1, church:1 |
| zhou-fengxiang | 凤翔 | fengxiang | fengxiang | guannei | 3 | han | sukhavati | castle:1, city:1, church:1 |
| zhou-binzhou | 邠州 | binzhou | binning | guannei | 3 | han | sukhavati | castle:1, city:1, church:1 |
| zhou-fangzhou | 坊州 | fangzhou | fufang | guannei | 3 | han | yogacara | castle:1, church:2 |
| zhou-tongzhou | 同州 | tongzhou | yongxing | guannei | 3 | han | jingxue | castle:2, city:1 |
| zhou-lingzhou | 灵州 | lingzhou | shuofang | xia | 4 | tangut | mantrayana | castle:1, city:1, church:1, none:1 |
| zhou-xiazhou | 夏州 | xiazhou | xiasui | xia | 4 | tangut | melieism | castle:1, city:1, church:1, none:1 |
| zhou-luoyang | 洛阳 | henan | dongji | henan | 5 | han | dhyana | castle:1, city:1, none:2, church:1 |
| zhou-shanzhou | 陕州 | shanzhou | biansong | henan | 2 | han | dhyana | castle:1, city:1 |
| zhou-taiyuan | 太原 | taiyuan | hedong | hedong | 5 | han | sukhavati | castle:1, city:1, church:1, none:2 |
| zhou-luzhou | 潞州 | luzhou_2 | wuxin | dongchuan | 3 | han | zhengyi | castle:1, city:1, church:1 |
| zhou-hezhong | 河中 | hezhong | hezhong | hedong | 4 | han | sukhavati | castle:1, city:1, church:1, none:1 |
| zhou-yunzhou | 云州 | yunzhou | yuncao | qingxu | 4 | han | jingxue | castle:1, city:1, church:1, none:1 |
| zhou-youzhou | 幽州 | youzhou | youzhou | youji | 5 | han | dhyana | castle:2, city:1, church:1, none:1 |
| zhou-yingzhou | 瀛州 | yingzhou | biansong | henan | 4 | han | maitreya | castle:1, city:1, church:1, none:1 |
| zhou-dingzhou | 定州 | dingzhou | yideng | youji | 2 | han | vinaya | castle:1, city:1 |
| zhou-zhenzhou | 镇州 | zhenzhou | chengde | hebei | 3 | han | dhyana | castle:2, city:1 |
| zhou-jizhou | 冀州 | jizhou | chengde | hebei | 2 | han | vinaya | castle:1, city:1 |
| zhou-weizhou | 魏州 | weizhou | weibo | hebei | 3 | han | dhyana | castle:1, city:1, church:1 |
| zhou-xiangzhou | 相州 | xiangzhou | xingming | hebei | 3 | han | vinaya | castle:2, city:1 |
| zhou-bianzhou | 汴州 | bianzhou | biansong | henan | 4 | han | dhyana | castle:1, city:1, church:1, none:1 |
| zhou-huazhou | 滑州 | huazhou | zhenghua | henan | 3 | han | dhyana | castle:1, city:1, church:1 |
| zhou-yunzhou-sd | 郓州 | yunzhou | yuncao | qingxu | 4 | han | jingxue | castle:1, city:1, church:1, none:1 |
| zhou-yanzhou | 兖州 | yanzhou | yanhai | qingxu | 5 | han | jingxue | castle:1, city:1, church:2, none:1 |
| zhou-xuzhou | 徐州 | xuzhou_1 | xusi | qingxu | 4 | han | dhyana | castle:1, city:1, church:1, none:1 |
| zhou-qingzhou | 青州 | qingzhou | ziqing | qingxu | 4 | han | sukhavati | castle:1, city:1, church:1, none:1 |
| zhou-xuchang | 许州 | yingchuan | chenxu | henan | 4 | han | dhyana | castle:2, city:1, church:1 |
| zhou-caizhou | 蔡州 | caizhou | chenxu | henan | 4 | han | maitreya | castle:1, city:1, church:1, none:1 |
| zhou-xiangyang | 襄州 | xiangyang | xiangdeng | shannan | 5 | han | pundarika | castle:1, city:1, church:1, none:2 |
| zhou-jiangling | 江陵 | jiangling | jingnan | shannan | 5 | han | pundarika | castle:1, city:1, church:1, none:2 |
| zhou-ezhou | 鄂州 | ezhou | eyue | shannan | 5 | han | dhyana | castle:2, city:1, church:1, none:1 |
| zhou-xingyuan | 兴元 | xingyuan | xingyuan | xingyuan | 4 | han | jingxue | castle:1, city:1, church:1, none:1 |
| zhou-suizhou | 遂州 | suizhou | xiasui | xia | 3 | tangut | mantrayana | castle:1, city:1, church:1 |
| zhou-yangzhou | 扬州 | yangzhou | huainan | huainan | 4 | han | vinaya | castle:2, city:1, church:1 |
| zhou-runzhou | 润州 | runzhou | jiangdong | jiangdong | 3 | han | dhyana | castle:1, city:1, church:1 |
| zhou-yuezhou | 越州 | yuezhou | zhedong | liangzhe | 4 | han | pundarika | castle:1, city:1, church:1, none:1 |
| zhou-fuzhou | 福州 | fuzhou | xinan | daibei | 2 | sogdian | khurmazta | castle:1, city:1 |
| zhou-xuanzhou | 宣州 | xuanzhou | xuanshe | jiangdong | 5 | han | vinaya | castle:1, city:1, church:1, none:2 |
| zhou-hongzhou | 洪州 | hongzhou | jiangxi | jiangxi | 5 | han | sukhavati | castle:1, city:1, church:1, none:2 |
| zhou-tanzhou | 潭州 | tanzhou | hunan | hunan | 5 | han | dhyana | castle:1, city:1, church:2, none:1 |
| zhou-chengdu | 成都 | chengdu | xichuan | xichuan | 3 | han | dhyana | castle:1, city:1, church:1 |
| zhou-zizhou | 梓州 | zizhou_2 | dongchuan | dongchuan | 2 | han | mantrayana | castle:1, city:1 |
| zhou-guangzhou | 广州 | guangzhou | huaixi | huainan | 4 | han | vinaya | castle:1, city:1, church:1, none:1 |
| zhou-yongzhou | 邕州 | yongzhou | lingling | hunan | 3 | hmong | dab_qhuas | castle:1, city:1, church:1 |
| zhou-guizhou | 桂州 | guizhou | jingnan | shannan | 3 | yi | bimoism | castle:1, city:1 |
| zhou-jiaozhou | 交州 | hai_dong, nghe_an | hai_dong | viet | 7 | viet | dhyana | castle:2, city:2, none:3 |
| zhou-jingzhou-ly | 泾州 | jingzhou | jingyuan | guannei | 3 | han | mantrayana | castle:1, city:1, church:1 |
| zhou-qinzhou | 秦州 | qinzhou_1, qinzhou_2 | qincheng | guannei | 7 | han | sukhavati | castle:2, city:2, church:2, none:1 |
| zhou-shazhou | 沙州 | shazhou | guasha | hexi | 2 | han | yogacara | castle:1, city:1 |

## 三、层级映射详细说明

### 3.1 国级映射（帝国 → 国）

由于 CK3 帝国范围往往跨越大片地理区域，与晚唐十道的"国"划分并不完全重合，以下按地理核心区域做近似对应：

- **e_zhongyuan (中原帝国)** → 主要对应 `guo-zhongyuan`（中原国）+ `guo-hebei`（河北国）东部
  - 包含 k_henan（河南）、k_qingxu（青徐）、k_hebei（河北）、k_hedong（河东）、k_youji（幽蓟）、k_daibei（代北）
- **e_yongliang (雍凉帝国)** → 对应 `guo-guanlong`（关陇国）
  - 包含 k_guannei（关内）、k_hexi（河西）、k_xia（夏/定难）
- **e_jingyang (荆扬帝国)** → 主要对应 `guo-zhongyuan`（淮南/山南部分）+ `guo-dongnan`（东南国）北部
  - 包含 k_huainan（淮南）、k_jiangdong（江东）、k_liangzhe（两浙）、k_jiangxi（江西）、k_shannan（山南）、k_hunan（湖南）、k_fujian（福建）
- **e_liangyi (梁益帝国)** → 对应 `guo-bashu`（巴蜀国）+ 部分黔中、大理地区
  - 包含 k_xichuan（西川）、k_xingyuan（兴元/山南西）、k_dongchuan（东川）、k_kuizhou（夔州）、k_qianzhong（黔中）、k_dali（大理）
- **e_lingnan (岭南帝国)** → 对应 `guo-dongnan`（东南国）南部
  - 包含 k_lingnan（岭南）、k_lingxi（岭西）、k_viet（交趾）

### 3.2 道级映射（王国 → 道）

CK3 王国(k_) 在规模上与晚唐"道"大致相当。大部分现有道可以直接对应到 CK3 王国，少部分需要合并或拆分：

| 现有道 | 对应 CK3 王国 | 说明 |
|--------|----------------|------|
| dao-jingji (京畿道) | k_guannei 南部 | 长安、凤翔一带属于 k_guannei |
| dao-guannei (关内道) | k_guannei 中北部 | 邠宁、朔方等节度使辖区 |
| dao-duji (都畿道) | k_henan 西部 | 洛阳、陕州属于 k_henan |
| dao-hedong (河东道) | k_hedong | 完全对应 |
| dao-youzhou (河北道·幽州) | k_youji | 幽州、瀛州、定州 |
| dao-chengde (河北道·成德) | k_hebei 中南部 | 对应 d_xingming 等 |
| dao-weibo (河北道·魏博) | k_hebei 南部 | 魏州、相州 |
| dao-henan (河南道) | k_henan 东部 + k_qingxu | 汴州、滑州、郓州等 |
| dao-shannan-e (山南东道) | k_shannan | 襄阳、江陵、鄂州 |
| dao-shannan-w (山南西道) | k_xingyuan | 兴元、遂州 |
| dao-huainan (淮南道) | k_huainan | 扬州 |
| dao-jiangnan-e (江南东道) | k_jiangdong + k_liangzhe + k_fujian | 润州、越州、福州等 |
| dao-jiangnan-w (江南西道) | k_jiangxi + k_hunan | 洪州、潭州 |
| dao-jiannan (剑南道) | k_xichuan + k_dongchuan | 成都、梓州 |
| dao-lingnan (岭南道) | k_lingnan + k_lingxi + k_viet | 广州、邕州、桂州、交州 |
| dao-longyou (陇右道) | k_hexi 东部 + k_guannei 西部 | 泾州、秦州 |
| dao-hexi (河西道) | k_hexi 西部 | 沙州、瓜州 |

### 3.3 州级映射（公爵领 → 州）

按用户要求，CK3 公爵领(d_) 对应州(zhou)。这意味着现有游戏中的 49 个州需要对应到 CK3 的约 100 个公爵领。
实际对应中，我们发现：**现有游戏的"州"名大多与 CK3 的县(c_) 同名**（如 c_bianzhou → 汴州、 c_weizhou → 魏州）。
这说明 CK3 的县(c_) 在行政级别上更接近晚唐的"州"。而 CK3 的公爵领(d_) 更接近晚唐的**藩镇/节度使辖区**（如 d_weibo 管辖魏州、博州、相州）。
为保持与现有数据结构兼容，建议采取以下两种方案之一：

**方案 A（用户要求）**：将公爵领(d_) 提升为州，县(c_) 降为县/地块。这会增加州的数量，但更符合 CK3 数据粒度。
**方案 B（建议）**：保持现有 49 州不变，将 CK3 县(c_) 直接对应为州，公爵领(d_) 数据作为"州群/藩镇"参考。这样可以在不动层级的前提下补充 province 数据。

## 四、867 年初始数据统计

基于 CK3 `e_china.txt`、`e_viet.txt`、`e_dali.txt` 的 867.1.1 历史数据。

### 4.1 各州 Province 数量分布

- Province 数 ≥ 5 的州（大型州）：长安、洛阳、太原、幽州、兖州、襄州、江陵、鄂州、宣州、洪州、潭州、交州、秦州
- Province 数 = 4 的州（标准州）：灵州、夏州、河中、云州、瀛州、汴州、郓州、徐州、青州、许州、蔡州、兴元、扬州、越州、广州
- Province 数 = 3 的州（小型州）：凤翔、邠州、坊州、同州、潞州、镇州、魏州、相州、滑州、遂州、润州、成都、邕州、桂州、泾州
- Province 数 = 2 的州（极小型/边疆州）：陕州、定州、冀州、福州、梓州、沙州

### 4.2 文化分布

| 文化 | 覆盖州数 |
|------|----------|
| han | 42 |
| tangut | 3 |
| sogdian | 1 |
| hmong | 1 |
| yi | 1 |
| viet | 1 |

### 4.3 宗教分布

| 宗教 | 覆盖州数 |
|------|----------|
| dhyana | 14 |
| sukhavati | 7 |
| jingxue | 6 |
| vinaya | 6 |
| mantrayana | 4 |
| pundarika | 3 |
| yogacara | 2 |
| maitreya | 2 |
| melieism | 1 |
| zhengyi | 1 |
| khurmazta | 1 |
| dab_qhuas | 1 |
| bimoism | 1 |

## 五、缺失与补充建议

### 5.1 当前游戏中缺失的 CK3 地区

CK3 中国地区共有约 **100 个公爵领、380 个县**。现有游戏只覆盖了其中约 49 个核心州。以下 CK3 公爵领/县尚未在游戏中体现：

**完全未覆盖的公爵领（共 93 个）**：

- `d_dongji` (k_henan / e_zhongyuan) → 包含 c_ruzhou
- `d_biansong` (k_henan / e_zhongyuan) → 包含 c_songzhou, c_bozhou
- `d_shanguo` (k_henan / e_zhongyuan) → 包含 c_shanzhou_2, c_guozhou
- `d_zhenghua` (k_henan / e_zhongyuan) → 包含 c_zhengzhou
- `d_chenxu` (k_henan / e_zhongyuan) → 包含 c_huaining, c_shenzhou
- `d_ziqing` (k_qingxu / e_zhongyuan) → 包含 c_zichuan, c_weizhou_4, c_dengzhou, c_laizhou
- `d_yanhai` (k_qingxu / e_zhongyuan) → 包含 c_langya, c_mizhou, c_haizhou
- `d_xusi` (k_qingxu / e_zhongyuan) → 包含 c_huaiyang, c_suzhou, c_sizhou_2
- `d_yuncao` (k_qingxu / e_zhongyuan) → 包含 c_qizhou, c_puzhou_2, c_caozhou
- `d_weibo` (k_hebei / e_zhongyuan) → 包含 c_bozhou_1, c_beizhou
- `d_xingming` (k_hebei / e_zhongyuan) → 包含 c_xingzhou, c_mingzhou
- `d_chengde` (k_hebei / e_zhongyuan) → 包含 c_zhaozhou, c_shenzhou_1
- `d_cangjing` (k_hebei / e_zhongyuan) → 包含 c_cangzhou, c_dezhou, c_dizhou
- `d_heyang` (k_hebei / e_zhongyuan) → 包含 c_huaizhou, c_weizhou_1
- `d_hedong` (k_hedong / e_zhongyuan) → 包含 c_liaozhou, c_lanzhou, c_shizhou, c_fenzhou
- `d_yanmen` (k_hedong / e_zhongyuan) → 包含 c_daizhou, c_xinzhou
- `d_hezhong` (k_hedong / e_zhongyuan) → 包含 c_jiangzhou_2, c_xizhou, c_pingyang, c_cizhou
- `d_zelu` (k_hedong / e_zhongyuan) → 包含 c_longde, c_zezhou, c_yangcheng
- `d_youzhou` (k_youji / e_zhongyuan) → 包含 c_zhuozhou, c_jizhou_1, c_tanzhou_2, c_pinzhou, c_guizhou_2
- `d_yideng` (k_youji / e_zhongyuan) → 包含 c_yizhou_1
- `d_yingmo` (k_youji / e_zhongyuan) → 包含 c_hejian, c_mozhou
- `d_yunshuo` (k_daibei / e_zhongyuan) → 包含 c_datong_2, c_shuozhou, c_yuzhou, c_yingzhou_5, c_hongzhou_2
- `d_sanggan` (k_daibei / e_zhongyuan) → 包含 c_yongxing, c_rouyuan, c_jiushijiuquan, c_huaian
- `d_xinan` (k_daibei / e_zhongyuan) → 包含 c_lxj_yunneizhou, c_qingshan, c_shengzhou, c_linzhou
- `d_yongxing` (k_guannei / e_yongliang) → 包含 c_huayin, c_yaozhou
- `d_fengxiang` (k_guannei / e_yongliang) → 包含 c_longzhou_2
- `d_jinshang` (k_guannei / e_yongliang) → 包含 c_jinzhou_1, c_shangzhou
- `d_binning` (k_guannei / e_yongliang) → 包含 c_jinzhou, c_qingyang, c_huanzhou
- `d_fufang` (k_guannei / e_yongliang) → 包含 c_fuzhou_5, c_yan_an, c_danzhou
- `d_jingyuan` (k_guannei / e_yongliang) → 包含 c_yuanzhou_2, c_xiaoguan
- ... 还有 63 个未列出

### 5.2 具体补充建议

1. **人口与发展度**：可根据 CK3 867 年的 holding 数量来校准现有州的 `basePopulation` 和 `development`。CK3 中 holding 越多的 county，对应州的开发度应越高。
2. **文化与宗教字段**：现有 `territories.json` 中没有 `culture` 和 `religion` 字段。建议新增 `ck3Culture`、`ck3Religion` 字段，用于后续事件和叛乱系统。
3. **Province 边界数据**：每个州可以记录其对应的 CK3 province ID 列表（已整理在 `ck3_to_zhous_mapping.json` 中），未来如需精细地图渲染可直接使用。
4. **关隘补充**：CK3 的 `major_rivers.png` / `provinces.png` 地形数据可以用于识别自然边界（黄河、长江、秦岭），补充更多 `passName`。
5. **新增州/县**：河北地区（邢洺、深冀等）、剑南地区（邛南、武信等）、江南地区（宣歙各州）有大量未覆盖的 CK3 公爵领，可作为 Phase 3 扩展内容。

## 六、数据文件清单

本次梳理生成的文件（位于项目根目录）：

- `wantang/ck3_china_hierarchy.json` — CK3 中国完整层级（帝国→王国→公爵领→县→Province）
- `wantang/ck3_to_zhous_mapping.json` — 现有 49 州与 CK3 County/Province 的精确对应表
- `docs/ck3_map_supplement.md` — 本报告
