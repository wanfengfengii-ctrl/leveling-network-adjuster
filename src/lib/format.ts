/**
 * 三位小数格式化：恰半一律远离零（half away from zero）。
 * 例如 0.0025 → 0.003（银行家舍入会给 0.002）、-1.2345 → -1.235。
 *
 * 十进制恰半值在二进制下可能存成略小于半的数（如 1.2345 的 ×1000
 * 为 1234.4999999999998），直接 Math.round 会误舍。故显式检测
 * “小数部分与 0.5 的差距不超过该尺度下的双精度舍入量级（约半 ULP）”，
 * 命中即按恰半进位；真正未到半位的值距 0.5 远大于此容差，绝不受影响。
 */
export function formatFixed3(x: number): string {
  if (!Number.isFinite(x)) return String(x);
  const sign = x < 0 ? -1 : 1;
  const scaled = Math.abs(x) * 1000;

  let rounded: number;
  const floor = Math.floor(scaled);
  const frac = scaled - floor;
  // 双精度 ULP 约为 2^-52·scaled ≈ 2.3e-16·scaled，2e-12 在此量级内。
  const tol = 2e-12 * Math.max(1, scaled);
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
