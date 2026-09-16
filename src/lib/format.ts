/**
 * 三位小数格式化：恰半一律远离零（half away from zero）。
 * 例如 0.0025 → 0.003（银行家舍入会给 0.002）、-1.2345 → -1.235。
 *
 * 十进制恰半值经 double 表示与 ×1000 后可能落在半位下方一点
 * （如 1.2345×1000 得 1234.4999999999998），直接 Math.round 会误舍。
 * 故仅当“距半位不超过 4 个 ULP（2^-52·scaled）”时按恰半进位——
 * 这覆盖了输入舍入与乘法舍入的累计误差（≤约 1 ULP）；
 * 真未到半位的值距 0.5 远大于此容差，绝不会误进位。
 */
export function formatFixed3(x: number): string {
  if (!Number.isFinite(x)) return String(x);
  const sign = x < 0 ? -1 : 1;
  const scaled = Math.abs(x) * 1000;

  let rounded: number;
  const floor = Math.floor(scaled);
  const frac = scaled - floor;
  const tol = 4 * Number.EPSILON * Math.max(1, scaled); // 4 ULP
  if (frac < 0.5 && 0.5 - frac <= tol) {
    rounded = floor + 1; // 本为恰半、被二进制拉低：绝对值方向进位（远离零）
  } else {
    rounded = Math.round(scaled);
  }

  const intPart = Math.floor(rounded / 1000);
  const frac3 = rounded % 1000;
  const fracStr = String(frac3).padStart(3, '0');
  return (sign < 0 && (intPart !== 0 || frac3 !== 0) ? '-' : '') + intPart + '.' + fracStr;
}
