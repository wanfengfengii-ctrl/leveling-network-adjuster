import type {
  AdjustmentResult,
  ObservationResult,
  ParsedObservation,
  ParsedPoint,
} from '../types';
import { qrWithColumnPivot, solveRST } from './matrix';

/**
 * 秩亏主元阈值：|Rkk| ≤ 1e-10 × |R11| 即判定整网秩亏。
 * 无基准支网（含无观测的未知点、观测数不足等）仅由该数值判据识别，
 * 不做任何连通性搜索。
 */
const PIVOT_RATIO = 1e-10;

/** 绝对权 1/σ²；σ 小到倒数无法用 double 表示时，钳到最大有限权避免 Inf/NaN。 */
const MAX_FINITE_WEIGHT = Number.MAX_VALUE;
function safeWeight(sigma: number): number {
  if (sigma >= Number.MIN_VALUE) {
    const inv = 1 / sigma;
    const w = inv * inv;
    if (Number.isFinite(w)) return w;
  }
  return MAX_FINITE_WEIGHT;
}

/**
 * 加权间接平差（自行实现，不调用现成求解器）。
 *
 * 观测方程：H终 − H起 ≈ h（观测高差），残差 v = (H终 − H起) − h。
 * 按点表顺序为未知点建列，基准高程作为已知量移入右端项；
 * 权 w = 1/σ²。
 *
 * 求解稳定性：加权目标 Σ(v/σ)² 整体乘以公共常数 σmin² 不改变极小化解，
 * 而 1/σ 在 σ 为合法极小正数（如 1e-200）时会溢出为 Inf 并污染 QR。
 * 故求解时行权取相对尺度 c = σmin/σ ∈ (0,1]；成果（高程、残差）与
 * 报告的加权残差平方和 Σ(v/σ)² 仍按规范的绝对权计算。
 */
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
  // 加权后的设计矩阵与右端项。行权 c = σmin/σ（见文件头说明）。
  const sigmaMin = m > 0 ? Math.min(...observations.map((o) => o.sigma)) : 1;
  const A: number[][] = Array.from({ length: m }, () => new Array<number>(u).fill(0));
  const b = new Array<number>(m).fill(0);

  observations.forEach((o, r) => {
    const fi = pointIndex.get(o.from)!;
    const ei = pointIndex.get(o.end)!;
    const scale = sigmaMin / o.sigma; // 相对行权 ∈ (0,1]，等价于 1/σ 且不会溢出
    b[r] = o.dh * scale;
    if (unknownColumns[ei] >= 0) A[r][unknownColumns[ei]] = scale;
    else b[r] -= (points[ei].elevation as number) * scale; // +H终（基准）移到右端
    if (unknownColumns[fi] >= 0) A[r][unknownColumns[fi]] = -scale;
    else b[r] += (points[fi].elevation as number) * scale; // −H起（基准）移到右端
  });

  const elevations = points.map((p) => p.elevation as number);

  // 未知量为空（全部为基准点）：不建方程求解，直接复算残差。
  if (u > 0) {
    const { R, Q, perm } = qrWithColumnPivot(A);

    // 秩亏判据（唯一判据）：逐主元与 R11 比较，含 n>m 的零主元。
    // R 列未做物理交换，第 k 个主元位于 R[k][perm[k]]。
    const r11 = m > 0 ? Math.abs(R[0][perm[0]]) : 0;
    for (let k = 0; k < u; k++) {
      const rkk = k < m ? Math.abs(R[k][perm[k]]) : 0;
      if (rkk <= PIVOT_RATIO * r11) {
        return {
          elevations: [],
          observations: [],
          weightedSumOfSquares: NaN,
          unknownCount: u,
          rankDeficient: true,
          reason:
            `整网秩亏：第 ${k + 1} 个主元 |R${k + 1}${k + 1}| = ${rkk.toExponential(3)} ` +
            `不大于 1e-10 × |R11|（|R11| = ${r11.toExponential(3)}）。` +
            `存在未获得基准控制的无基准支网（或观测数不足），请将该支网通过观测连接到基准点。`,
        };
      }
    }

    const x = solveRST(R, Q, perm, b); // 内部已按列置换还原
    points.forEach((p, i) => {
      if (p.type === 'unknown') elevations[i] = x[unknownColumns[i]];
    });
  }

  // 由同一批未舍入高程复算每个观测的平差高差与残差。
  // 加权残差平方按规范的绝对权 1/σ² 计算；safeWeight 仅在 σ 小到
  // double 无法表达其倒数时钳到最大有限权，避免溢出为 Inf/NaN。
  const results: ObservationResult[] = observations.map((o) => {
    const fi = pointIndex.get(o.from)!;
    const ei = pointIndex.get(o.end)!;
    const adjustedDh = elevations[ei] - elevations[fi];
    const residual = adjustedDh - o.dh;
    const w = safeWeight(o.sigma);
    return {
      from: o.from,
      end: o.end,
      dh: o.dh,
      sigma: o.sigma,
      adjustedDh,
      residual,
      weightedSquaredResidual: w * residual * residual,
    };
  });

  const weightedSumOfSquares = results.reduce(
    (s, r) => s + r.weightedSquaredResidual,
    0,
  );

  return {
    elevations,
    observations: results,
    weightedSumOfSquares,
    unknownCount: u,
    rankDeficient: false,
  };
}

/** 未舍入绝对残差最大值；并列者由调用方按容差一并标红。 */
export function maxAbsResidual(result: AdjustmentResult): number {
  return result.observations.reduce((mx, r) => Math.max(mx, Math.abs(r.residual)), 0);
}

/**
 * 并列判定容差：残差由“平差高差 − 观测高差”相减得到，其舍入噪声量级
 * 取决于参与运算的操作数（高程、观测高差）而非残差自身（相消时残差可极小）。
 * 故取全网 max(|平差高差| + |观测高差|) 的数个 ULP；
 * 操作数本身就是亚正常值（如 5e-324）时容差同比极小，零不会被误判并列。
 */
export function residualTieTolerance(result: AdjustmentResult): number {
  let scale = 0;
  for (const o of result.observations) {
    scale = Math.max(scale, Math.abs(o.adjustedDh) + Math.abs(o.dh));
  }
  return 8 * Number.EPSILON * scale;
}

/**
 * 判定某残差是否与最大绝对残差并列（均用未舍入值比较）。
 * 最大残差为 0 时仅真正的 0 并列；否则容差取求解/相减舍入噪声量级。
 */
export function isTiedMaxResidual(residual: number, maxAbs: number, tol: number): boolean {
  if (maxAbs === 0) return residual === 0;
  return Math.abs(Math.abs(residual) - maxAbs) <= tol;
}
