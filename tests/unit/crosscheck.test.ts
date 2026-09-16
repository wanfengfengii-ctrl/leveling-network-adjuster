import { describe, expect, it } from 'vitest';
import { adjust } from '../../src/lib/adjustment';
import { validateAll } from '../../src/lib/validation';
import type { ObservationRow, PointRow } from '../../src/types';

/**
 * 独立交叉验证：用与被测代码完全不同的路径——
 * 显式组装法方程 AᵀWA x = AᵀWb 并做高斯消元——核对自研列主元 QR 的解。
 */

// 确定性伪随机
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussianSolve(M: number[][], rhs: number[]): number[] {
  const n = M.length;
  const A = M.map((row, i) => [...row, rhs[i]]);
  // 部分主元消元
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++)
      if (Math.abs(A[i][k]) > Math.abs(A[p][k])) p = i;
    [A[k], A[p]] = [A[p], A[k]];
    for (let i = k + 1; i < n; i++) {
      const f = A[i][k] / A[k][k];
      for (let j = k; j <= n; j++) A[i][j] -= f * A[k][j];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let k = n - 1; k >= 0; k--) {
    let s = A[k][n];
    for (let j = k + 1; j < n; j++) s -= A[k][j] * x[j];
    x[k] = s / A[k][k];
  }
  return x;
}

function buildAndSolveNormal(
  pointRows: PointRow[],
  obsRows: ObservationRow[],
): { elevations: number[]; wss: number } {
  const { points, observations } = validateAll(pointRows, obsRows);
  const unknownIdx = points
    .map((p, i) => (p.type === 'unknown' ? i : -1))
    .filter((i) => i >= 0);
  const colOf = new Map<number, number>();
  unknownIdx.forEach((pi, c) => colOf.set(pi, c));
  const n = unknownIdx.length;
  const N: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const u = new Array<number>(n).fill(0);
  for (const o of observations) {
    const fi = points.findIndex((p) => p.name === o.from);
    const ei = points.findIndex((p) => p.name === o.end);
    const w = 1 / (o.sigma * o.sigma);
    // b = h - (He_known - Hs_known)；未知列系数 +1(终)/-1(起)
    let rhs = o.dh;
    if (points[ei].type === 'benchmark') rhs -= points[ei].elevation!;
    if (points[fi].type === 'benchmark') rhs += points[fi].elevation!;
    const coeff = new Array<number>(n).fill(0);
    if (points[ei].type === 'unknown') coeff[colOf.get(ei)!] += 1;
    if (points[fi].type === 'unknown') coeff[colOf.get(fi)!] -= 1;
    for (let i = 0; i < n; i++) {
      u[i] += w * coeff[i] * rhs;
      for (let j = 0; j < n; j++) N[i][j] += w * coeff[i] * coeff[j];
    }
  }
  const x = n > 0 ? gaussianSolve(N, u) : [];
  const elevations = points.map((p, i) =>
    p.type === 'benchmark' ? p.elevation! : x[colOf.get(i)!],
  );
  let wss = 0;
  for (const o of observations) {
    const fi = points.findIndex((p) => p.name === o.from);
    const ei = points.findIndex((p) => p.name === o.end);
    const v = elevations[ei] - elevations[fi] - o.dh;
    wss += (v / o.sigma) ** 2;
  }
  return { elevations, wss };
}

describe('QR 解与独立法方程解交叉验证', () => {
  it('多个随机连通水准网，两种解法高程与加权残差平方和一致', () => {
    const rnd = mulberry32(20260916);
    for (let trial = 0; trial < 12; trial++) {
      const nUnknown = 2 + Math.floor(rnd() * 6); // 2..7 个未知点
      const pointRows: PointRow[] = [
        { id: 's0', name: 'BM', type: 'benchmark', elevation: '50' },
      ];
      for (let i = 0; i < nUnknown; i++) {
        pointRows.push({ id: `s${i + 1}`, name: `U${i + 1}`, type: 'unknown', elevation: '' });
      }
      // 生成树：每个未知点连到一个更早的点（保证连通基准、满秩）
      const edges: [number, number][] = [];
      const obsRows: ObservationRow[] = [];
      const nameOf = (i: number) => pointRows[i].name;
      for (let i = 1; i <= nUnknown; i++) {
        const parent = Math.floor(rnd() * i); // 0..i-1
        const dir = rnd() < 0.5;
        edges.push(dir ? [parent, i] : [i, parent]);
      }
      // 随机额外观测
      const extra = Math.floor(rnd() * 5);
      for (let k = 0; k < extra; k++) {
        const a = Math.floor(rnd() * (nUnknown + 1));
        let b = Math.floor(rnd() * (nUnknown + 1));
        if (b === a) b = (b + 1) % (nUnknown + 1);
        edges.push([a, b]);
      }
      let seq = 0;
      for (const [a, b] of edges) {
        obsRows.push({
          id: `o${seq++}`,
          from: nameOf(a),
          end: nameOf(b),
          dh: (rnd() * 10 - 5).toFixed(4),
          sigma: (0.2 + rnd() * 5).toFixed(3),
        });
      }

      const { points, observations } = validateAll(pointRows, obsRows);
      const result = adjust(points, observations);
      expect(result.rankDeficient).toBe(false);
      const ref = buildAndSolveNormal(pointRows, obsRows);
      for (let i = 0; i < points.length; i++) {
        expect(result.elevations[i]).toBeCloseTo(ref.elevations[i], 9);
      }
      expect(result.weightedSumOfSquares).toBeCloseTo(ref.wss, 8);
    }
  });
});
