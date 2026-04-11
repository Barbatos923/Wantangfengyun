// ===== 计谋类型注册入口 =====
//
// import 该模块即触发所有 SchemeTypeDef 的 self-register。
// main.tsx 启动时 import 一次即可。
//
// 新增计谋类型：在 engine/scheme/types/ 下加文件，然后在此 import 一行。

import '@engine/scheme/types/curryFavor';
import '@engine/scheme/types/alienation';
