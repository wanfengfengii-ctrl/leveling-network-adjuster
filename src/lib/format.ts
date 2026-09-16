/**
 * 三位小数格式化：恰半一律远离零（half away from zero）。
 * 例如 0.0025 → 0.003（银行家舍入会给 0.002）、-1.2345 → -1.235。
 *
 * 二进制浮点下 1.2345 实际存为 1.2344999999999998…，直接 Math.round 会误舍；
 * 这里显式检测“小数部分与 0.5 的距离在双精度舍入容差内”即视为恰半并进位，
 * 真正小于半（差距远超容差）的值不受影响。
 */
export function formatFixed3(x: number): string {
  if (!Number.isFinite(x)) return String(x);
  const sign = x < 0 ? -1 : 1;
  const scaled = Math.abs(x) * 1000;

  let rounded: number;
  const floor = Math.floor(scaled);
  const frac = scaled - floor;
  const tol = 1e-10 * Math.max(1, scaled);
  if (Math.abs(frac - 0.5) <= tol) {
    rounded = floor + 1; // 恰半：绝对值方向进位（远离零）
  } else {
    rounded = Math.round(scaled);
  }

  const intPart = Math.floor(rounded / 1000);
  const frac3 = rounded % 1000;
  const fracStr = String(frac3).padStart(3, '0');
  return (sign < 0 && (intPart !== 0 || frac3 !== 0) ? '-' : '') + intPart + '.' + fracStr;
}
