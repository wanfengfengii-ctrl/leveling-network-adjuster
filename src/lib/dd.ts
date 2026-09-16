/**
 * 双精度扩展（double-double）算术：用两个 double 表示约 106 位有效数字。
 *
 * 背景：高差/高程接近 1e9 时，其毫米级残差落在 double 的最后一位
 * （ULP(1e9)≈1.19e-7），普通 double 最小二乘中“数学上相等的并列残差”
 * 会因 QR 与相减路径产生 ~1e-7 的舍入噪声，无法与真实的微小差异区分。
 * 内部平差全程使用本模块（约 30 位十进制精度），输入十进制字符串按
 * 精确值读入，彻底消除该量级的噪声；展示时再转回普通 double。
 *
 * 参考：Dekker/Knuth 的 double-double 算法（two_sum / Veltkamp 拆分 /
 * Newton 除法与平方根）。全部自行实现，不依赖任何外部数值库。
 */

export type DD = readonly [number, number]; // [hi, lo]，满足 value = hi + lo

const SPLITTER = 134217729; // 2^27 + 1

export const zero: DD = [0, 0];
export const one: DD = [1, 0];

function quickTwoSum(a: number, b: number): DD {
  // 要求 |a| >= |b|
  const s = a + b;
  return [s, b - (s - a)];
}

function twoSum(a: number, b: number): DD {
  const s = a + b;
  const bb = s - a;
  return [s, (a - (s - bb)) + (b - bb)];
}

function twoProd(a: number, b: number): DD {
  // Veltkamp 拆分（不依赖 FMA 指令）
  const ta = SPLITTER * a;
  const tb = SPLITTER * b;
  const ah = ta - (ta - a);
  const bh = tb - (tb - b);
  const al = a - ah;
  const bl = b - bh;
  const p = a * b;
  const e = ((ah * bh - p) + ah * bl + al * bh) + al * bl;
  return [p, e];
}

export function fromNumber(n: number): DD {
  return quickTwoSum(n, 0);
}

export function add(a: DD, b: DD): DD {
  const [sh, sl] = twoSum(a[0], b[0]);
  return quickTwoSum(sh, sl + a[1] + b[1]);
}

export function sub(a: DD, b: DD): DD {
  const [sh, sl] = twoSum(a[0], -b[0]);
  return quickTwoSum(sh, sl + a[1] - b[1]);
}

export function mul(a: DD, b: DD): DD {
  const [p, e0] = twoProd(a[0], b[0]);
  const e = e0 + a[0] * b[1] + a[1] * b[0];
  return quickTwoSum(p, e);
}

export function div(a: DD, b: DD): DD {
  // 三次余项修正的双精度除法
  const q1 = a[0] / b[0];
  let r = sub(a, mul([q1, 0], b));
  const q2 = r[0] / b[0];
  r = sub(r, mul([q2, 0], b));
  const q3 = (r[0] + r[1]) / b[0];
  return add([q1, q2], [q3, 0]);
}

export function sqrt(a: DD): DD {
  if ((a[0] < 0 || (a[0] === 0 && a[1] < 0))) {
    return [NaN, NaN];
  }
  if (a[0] === 0 && a[1] === 0) return zero;
  let x: DD = [Math.sqrt(a[0]), 0];
  for (let i = 0; i < 3; i++) {
    // x := x + (a − x²)/(2x)
    const corr = div(sub(a, mul(x, x)), mul(x, [2, 0]));
    x = add(x, corr);
  }
  return x;
}

export function negate(a: DD): DD {
  return [-a[0], -a[1]];
}

export function abs(a: DD): DD {
  return a[0] < 0 || (a[0] === 0 && a[1] < 0) ? negate(a) : a;
}

/** -1 / 0 / 1 */
export function cmp(a: DD, b: DD): -1 | 0 | 1 {
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
  if (a[1] === b[1]) return 0;
  return a[1] < b[1] ? -1 : 1;
}

/** 转回普通 double（丢失扩展精度，仅用于展示）。 */
export function toNumber(a: DD): number {
  return a[0] + a[1];
}

/** 转回普通 double；超出 double 范围时钳到 ±MAX_VALUE（保持有限，不产生 Inf）。 */
export function safeToNumber(a: DD): number {
  const x = a[0] + a[1];
  if (Number.isFinite(x)) return x;
  return a[0] < 0 || (a[0] === 0 && a[1] < 0) ? -Number.MAX_VALUE : Number.MAX_VALUE;
}

const DECIMAL_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * 精确解析有限十进制字符串为 double-double。
 * 非法（含 Infinity/NaN 等）返回 null。逐位累加整数、再按 10 的幂
 * DD 乘除，输入有多少有效位就保留多少（远超 double 的 ~16 位）。
 */
export function parseDecimal(raw: string): DD | null {
  const s = raw.trim();
  if (!DECIMAL_RE.test(s) || !Number.isFinite(Number(s))) return null;

  let neg = false;
  let t = s;
  if (t[0] === '+' || t[0] === '-') {
    neg = t[0] === '-';
    t = t.slice(1);
  }
  let exp = 0;
  const eIdx = t.search(/[eE]/);
  if (eIdx >= 0) {
    exp = parseInt(t.slice(eIdx + 1), 10);
    t = t.slice(0, eIdx);
  }
  const dot = t.indexOf('.');
  const intPart = dot >= 0 ? t.slice(0, dot) : t;
  const fracPart = dot >= 0 ? t.slice(dot + 1) : '';
  const digits = intPart + fracPart;
  exp -= fracPart.length;

  // 数字按位累加：value = value*10 + digit（DD 下对这些尺度精确）
  let v: DD = zero;
  const ten: DD = [10, 0];
  for (const ch of digits) {
    v = add(mul(v, ten), [ch.charCodeAt(0) - 48, 0]);
  }
  if (exp >= 0) {
    for (let i = 0; i < exp; i++) v = mul(v, ten);
  } else {
    for (let i = 0; i < -exp; i++) v = div(v, ten);
  }
  return neg ? negate(v) : v;
}
