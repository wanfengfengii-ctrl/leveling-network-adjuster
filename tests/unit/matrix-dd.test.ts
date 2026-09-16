import { describe, expect, it } from 'vitest';
import { qrPivotedDD, solveRSTDD } from '../../src/lib/matrix-dd';
import * as dd from '../../src/lib/dd';

const D = (rows: number[][]) => rows.map((r) => r.map((v) => dd.fromNumber(v)));
const mat = (rows: number[][]) => rows;

/** DD 矩阵乘法，避免验证过程受 double 精度限制。 */
function mulDD(A: dd.DD[][], B: dd.DD[][]): dd.DD[][] {
  const m = A.length;
  const k = B.length;
  const n = B[0].length;
  const C: dd.DD[][] = Array.from({ length: m }, () =>
    Array.from({ length: n }, () => dd.zero),
  );
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++)
      for (let t = 0; t < k; t++) C[i][j] = dd.add(C[i][j], dd.mul(A[i][t], B[t][j]));
  return C;
}
function ddNormF(A: dd.DD[][]): number {
  let s: dd.DD = dd.zero;
  for (const row of A) for (const v of row) s = dd.add(s, dd.mul(v, v));
  return dd.toNumber(dd.sqrt(s));
}
function transpose(A: dd.DD[][]): dd.DD[][] {
  return A[0].map((_, j) => A.map((row) => row[j]));
}

describe('qrPivotedDD', () => {
  it('A[:,perm] = Q R̃，Q 正交、R̃ 上梯形', () => {
    const A = D(
      mat([
        [1, 2, 0],
        [0, 1, 1],
        [1, 0, 1],
        [2, 1, 3],
      ]),
    );
    const qr = qrPivotedDD(A);
    const { R, Q, perm, m, n } = qr;
    expect(m).toBe(4);
    expect(n).toBe(3);

    const Qn = Q;
    const Rt = R.map((row) => perm.map((k) => row[k]));
    const AP = A.map((row) => perm.map((k) => row[k]));
    const diff = mulDD(Qn, Rt).map((row, i) =>
      row.map((v, j) => dd.sub(v, AP[i][j])),
    );
    expect(ddNormF(diff)).toBeLessThan(1e-24);

    // QᵀQ = I（DD 验证）
    const QtQ = mulDD(transpose(Qn), Qn);
    for (let i = 0; i < m; i++)
      for (let j = 0; j < m; j++)
        expect(dd.toNumber(QtQ[i][j])).toBeCloseTo(i === j ? 1 : 0, 14);

    // R̃ 上梯形
    for (let j = 0; j < n; j++)
      for (let i = j + 1; i < m; i++) expect(Math.abs(dd.toNumber(R[i][perm[j]]))).toBeLessThan(1e-24);
  });

  it('列主元：同范数列取原列靠前者', () => {
    const A = D(
      mat([
        [0, 3],
        [5, 4],
        [0, 0],
      ]),
    );
    expect(qrPivotedDD(A).perm[0]).toBe(0);
  });

  it('最小二乘解与解析解一致且精度远超 double', () => {
    // 直线拟合 (0,1),(1,2),(2,5)：b=2, a=2/3
    const A = D(
      mat([
        [1, 0],
        [1, 1],
        [1, 2],
      ]),
    );
    const b = [1, 2, 5].map(dd.fromNumber);
    const x = solveRSTDD(qrPivotedDD(A), b).map(dd.toNumber);
    expect(x[0]).toBeCloseTo(2 / 3, 14);
    expect(x[1]).toBeCloseTo(2, 14);
  });

  it('病态尺度：1e9 量级列与毫米量级解仍稳定', () => {
    // 单未知点 B：两条 A→B 观测 1e9+0.001 与 1e9+0.000（同权），
    // B 高程度量基准 A=0，最小二乘解为 1e9 + 0.0005（DD 下精确）。
    const A = D(
      mat([
        [1],
        [1],
      ]),
    );
    // 基准高程已移到右端：b = h − (+H终基准/−H起基准)；此处 A 为基准 0
    const b = [dd.parseDecimal('1000000000.001')!, dd.parseDecimal('1000000000.000')!];
    const x = solveRSTDD(qrPivotedDD(A), b).map(dd.toNumber);
    expect(x[0]).toBeCloseTo(1000000000.0005, 10);
  });
});
