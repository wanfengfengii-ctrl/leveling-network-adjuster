import type {
  AdjustmentResult,
  ObservationResult,
  ParsedObservation,
  ParsedPoint,
} from '../types';
import * as dd from './dd';
import type { DD } from './dd';
import { qrPivotedDD, solveRSTDD } from './matrix-dd';

/**
 * 加权间接平差（自行实现，不调用现成求解器），内部全程 double-double
 * 高精度算术（约 106 位有效数字）。
 *
 * 观测方程：H终 − H起 ≈ h，残差 v = (H终 − H起) − h。
 * 按点表顺序为未知点建列，基准高程作为已知量移入右端项；权 w=1/σ²。
 * 求解行权取相对尺度 σmin/σ（公共常数 σmin 不改变极小化解，
 * 且避免 1/σ 在 σ 极小时溢出）；残差与加权残差平方仍按绝对权
 * 在 DD 下计算（先除后平方，σ=v=1e-200 时得精确的 1）。
 *
 * 使用 DD 的原因：高差接近 1e9 时 double 的 ULP≈1.2e-7，普通 QR 解
 * 不同减法路径会产生 ~1e-7 噪声，使数学上相等的并列残差出现假差异；
 * DD 将该噪声压到 1e-23 以下。
 */

const PIVOT_RATIO = 1e-10;
const Z = dd.zero;

export function adjust(
  points: ParsedPoint[],
  observations: ParsedObservation[],
): AdjustmentResult {
  const pointIndex = new Map<string, number>();
  points.forEach((p, i) => pointIndex.set(p.name, i));

  // 未知点列严格按点表顺序建立。
  const unknownColumns = new Array<number>(points.length).fill(-1);
  let u = 0;
  points.forEach((p, i) => {
    if (p.type === 'unknown') unknownColumns[i] = u++;
  });

  const m = observations.length;
  // σmin（DD 精确比较）
  let sigmaMin: DD = Z;
  observations.forEach((o, i) => {
    if (i === 0 || dd.cmp(o.sigmaDD, sigmaMin) < 0) sigmaMin = o.sigmaDD;
  });
  if (m === 0) sigmaMin = dd.one;

  const A: DD[][] = Array.from({ length: m }, () =>
    Array.from({ length: u }, () => [0, 0] as DD),
  );
  const b: DD[] = Array.from({ length: m }, () => Z);

  observations.forEach((o, r) => {
    const fi = pointIndex.get(o.from)!;
    const ei = pointIndex.get(o.end)!;
    const scale = dd.div(sigmaMin, o.sigmaDD);
    b[r] = dd.mul(o.dhDD, scale);
    if (unknownColumns[ei] >= 0) A[r][unknownColumns[ei]] = scale;
    else b[r] = dd.sub(b[r], dd.mul(points[ei].elevationDD!, scale));
    if (unknownColumns[fi] >= 0) A[r][unknownColumns[fi]] = dd.negate(scale);
    else b[r] = dd.add(b[r], dd.mul(points[fi].elevationDD!, scale));
  });

  // 高程（DD）：基准为已知值，未知待解
  const elevDD: DD[] = points.map((p) => (p.elevationDD ? [p.elevationDD[0], p.elevationDD[1]] : Z));

  if (u > 0) {
    const qr = qrPivotedDD(A);
    const { R, perm } = qr;

    // 秩亏判据（唯一判据），在 DD 下比较：|Rkk| ≤ 1e-10·|R11|。
    const r11 = m > 0 ? dd.abs(R[0][perm[0]]) : Z;
    for (let k = 0; k < u; k++) {
      const rkk = k < m ? dd.abs(R[k][perm[k]]) : Z;
      const rhs = dd.mul(dd.fromNumber(PIVOT_RATIO), r11);
      if (dd.cmp(rkk, rhs) <= 0) {
        return {
          elevations: [],
          observations: [],
          weightedSumOfSquares: NaN,
          unknownCount: u,
          rankDeficient: true,
          reason:
            `整网秩亏：第 ${k + 1} 个主元 |R${k + 1}${k + 1}| = ${dd.toNumber(rkk).toExponential(3)} ` +
            `不大于 1e-10 × |R11|（|R11| = ${dd.toNumber(r11).toExponential(3)}）。` +
            `存在未获得基准控制的无基准支网（或观测数不足），请将该支网通过观测连接到基准点。`,
        };
      }
    }

    const x = solveRSTDD(qr, b);
    points.forEach((p, i) => {
      if (p.type === 'unknown') elevDD[i] = x[unknownColumns[i]];
    });
  }

  // 同一批未舍入 DD 高程复算残差（DD），展示值转回 double。
  const results: ObservationResult[] = observations.map((o) => {
    const fi = pointIndex.get(o.from)!;
    const ei = pointIndex.get(o.end)!;
    const adjustedDhDD = dd.sub(elevDD[ei], elevDD[fi]);
    const residualDD = dd.sub(adjustedDhDD, o.dhDD);
    const q = dd.div(residualDD, o.sigmaDD); // v/σ（先除，避免极端尺度下溢）
    const weightedDD = dd.mul(q, q);
    return {
      from: o.from,
      end: o.end,
      dh: o.dh,
      sigma: o.sigma,
      adjustedDh: dd.toNumber(adjustedDhDD),
      residual: dd.toNumber(residualDD),
      residualDD,
      // 仅在 (v/σ)² 超出 double 范围时钳为 MAX_VALUE，保持有限、不产生 Inf
      weightedSquaredResidual: dd.safeToNumber(weightedDD),
    };
  });

  // 加权残差平方和 Σ(v/σ)²：先除后平方，极端尺度（σ=v=1e-200）下仍精确。
  let wssDD: DD = Z;
  observations.forEach((o, i) => {
    const q = dd.div(results[i].residualDD, o.sigmaDD);
    wssDD = dd.add(wssDD, dd.mul(q, q));
  });

  return {
    elevations: elevDD.map((v) => dd.toNumber(v)),
    observations: results,
    weightedSumOfSquares: dd.safeToNumber(wssDD),
    unknownCount: u,
    rankDeficient: false,
  };
}

/** 未舍入（DD）绝对残差最大值。 */
export function maxAbsResidualDD(result: AdjustmentResult): DD {
  let mx: DD = Z;
  for (const o of result.observations) {
    const a = dd.abs(o.residualDD);
    if (dd.cmp(a, mx) > 0) mx = a;
  }
  return mx;
}

/**
 * 并列容差：DD 下求解/相减噪声为 O(εdd·操作数量级)，εdd≈2^-104。
 * 取 64 个该单位；操作数为亚正常值时容差下溢为 0，零不与极小非零并列。
 */
export function residualTieToleranceDD(result: AdjustmentResult): number {
  let scale = 0;
  for (const o of result.observations) {
    scale = Math.max(scale, Math.abs(o.adjustedDh) + Math.abs(o.dh));
  }
  const EPS_DD = Math.pow(2, -104);
  return 64 * EPS_DD * scale;
}

/** 是否与最大未舍入残差并列（均为 DD 值）。 */
export function isTiedMaxResidualDD(residual: DD, maxAbs: DD, tol: number): boolean {
  const diff = dd.toNumber(dd.sub(dd.abs(residual), maxAbs));
  if (tol === 0) return diff === 0;
  return Math.abs(diff) <= tol;
}
