/**
 * 钱粮数字格式化：≥10000 显示为"X.XX万"，否则 toLocaleString。
 * 自动处理负数。小数四舍五入到 2 位，整万去掉小数。
 */
export function formatAmount(n: number): string {
  const v = Math.floor(n);
  const abs = Math.abs(v);
  if (abs < 10000) return v.toLocaleString();
  const wan = v / 10000;
  // 整万显示无小数；否则保留 1-2 位
  if (Math.abs(wan - Math.round(wan)) < 0.005) return `${Math.round(wan)}万`;
  return `${wan.toFixed(2)}万`;
}

/** 带符号格式化（正数前缀 +，负数自然带 -）。0 显示 "0"。 */
export function formatAmountSigned(n: number): string {
  const v = Math.floor(n);
  if (v > 0) return `+${formatAmount(v)}`;
  return formatAmount(v);
}
