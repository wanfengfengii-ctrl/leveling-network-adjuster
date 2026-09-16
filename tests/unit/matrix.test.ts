import { describe, expect, it } from 'vitest';
import { qrWithColumnPivot, solveRST } from '../../src/lib/matrix';

// 简易矩阵工具
const mat = (rows: number[][]) => rows;
const mul = (A: number[][], B: number[][]) => {
  const m = A.length;
  const n = B[0].length;
  const k = B.length;
  const C = Array.from({ length: m }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++)
      for (let t = 0; t < k; t++) C[i][j] += A[i][t] * B[t][j];
  return C;
};
const sub = (A: number[][], B: number[][]) =>
  A.map((row, i) => row.map((v, j) => v - B[i][j]));
const normF = (A: number[][]) =>
  Math.sqrt(A.flat().reduce((s, v) => s + v * v, 0));

describe('qrWithColumnPivot', () => {
  it('满足 A P = Q R，Q 正交、R 上梯形', () => {
    const A = mat([
      [1, 2, 0],
      [0, 1, 1],
      [1, 0, 1],
      [2, 1, 3],
    ]);
    const { R, Q, perm, m, n } = qrWithColumnPivot(A);
    expect(m).toBe(4);
    expect(n).toBe(3);
    expect(perm).toHaveLength(3);

    // R̃：按置换取列，上梯形；QR̃ 应等于按置换取列后的 A
    const AP = A.map((row) => perm.map((k) => row[k]));
    const Rt = R.map((row) => perm.map((k) => row[k]));
    expect(normF(sub(mul(Q, Rt), AP))).toBeLessThan(1e-12);

    // QᵀQ = I
    const QtQ = mul(
      Q.map((r) => Array.from(r)),
      Q[0].map((_, j) => Q.map((row) => row[j])),
    );
    const I = Array.from({ length: m }, (_, i) =>
      Array.from({ length: m }, (_, j) => (i === j ? 1 : 0)),
    );
    expect(normF(sub(QtQ, I))).toBeLessThan(1e-12);

    // R̃ 上三角（R 按 perm 取列后，第 j 列在第 j 行以下为 0）
    for (let j = 0; j < n; j++)
      for (let i = j + 1; i < m; i++) expect(Math.abs(R[i][perm[j]])).toBeLessThan(1e-12);
  });

  it('列主元：首步选二范数最大列，同值取原列靠前者', () => {
    // 两列范数相等（第二列 = 第一列换两行，范数相同），首步应选列 0
    const A = mat([
      [3, 0],
      [4, 5],
      [0, 0],
    ]);
    // 列0范数5，列1范数5 → 选列0
    const { perm } = qrWithColumnPivot(A);
    expect(perm[0]).toBe(0);

    const B = mat([
      [0, 3],
      [5, 4],
      [0, 0],
    ]);
    // 列0范数5（[0,5,0]），列1范数5（[3,4,0]），相等 → 靠前列0
    const qr2 = qrWithColumnPivot(B);
    expect(qr2.perm[0]).toBe(0);
  });

  it('求解超定最小二乘与已知解析解一致', () => {
    // 直线拟合 y = a + b x，点 (0,1),(1,2),(2,5)
    const A = mat([
      [1, 0],
      [1, 1],
      [1, 2],
    ]);
    const b = [1, 2, 5];
    const { R, Q, perm } = qrWithColumnPivot(A);
    const x = solveRST(R, Q, perm, b);
    // 正规方程：3a+3b=8, 3a+5b=12 → b=2, a=2/3
    expect(x[0]).toBeCloseTo(2 / 3, 12);
    expect(x[1]).toBeCloseTo(2, 12);
  });

  it('n > m 时继续给出完整置换', () => {
    const A = mat([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    const { R, perm, n } = qrWithColumnPivot(A);
    expect(perm).toHaveLength(3);
    expect(n).toBe(3);
    expect(perm.slice().sort((a, b) => a - b)).toEqual([0, 1, 2]);
    // 前两个主元非零
    expect(Math.abs(R[0][perm[0]])).toBeGreaterThan(1);
    expect(Math.abs(R[1][perm[1]])).toBeGreaterThan(0);
  });
});
