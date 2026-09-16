/**
 * 带列主元的 Householder QR —— double-double 高精度版本（自行实现）。
 *
 * 与普通 double 版同构，但全程约 106 位有效数字：高差在 1e9 量级时，
 * 毫米级残差远低于 double 的 ULP(1e9)≈1.2e-7，普通 QR 解的不同
 * 减法路径会产生 ~1e-7 的舍入噪声，使数学上相等的并列残差出现假差异。
 * 本模块将该噪声压到 ~1e-23 以下，解出后再转回普通 double 展示。
 *
 * 列主元：每步直接重算剩余列主元行以下的二范数平方并取最大者，
 * 同值取原列最靠前；R 列不物理交换，次序记录于 perm。
 */

import * as dd from './dd';

type DD = dd.DD;

export interface PivotedQRD {
  R: DD[][];
  Q: DD[][];
  perm: number[];
  m: number;
  n: number;
}

const Z = dd.zero;

function clone(A: DD[][]): DD[][] {
  return A.map((row) => row.map((v) => [v[0], v[1]] as DD));
}

function identity(m: number): DD[][] {
  const I: DD[][] = [];
  for (let i = 0; i < m; i++) {
    const row: DD[] = Array.from({ length: m }, () => [0, 0] as DD);
    row[i] = [1, 0];
    I.push(row);
  }
  return I;
}

/** M := (I − τ v vᵀ) M（左乘），v 仅 k 以下可能非零。 */
function applyLeft(M: DD[][], v: DD[], tau: DD, k: number): void {
  const m = M.length;
  const n = M[0].length;
  for (let j = 0; j < n; j++) {
    let d: DD = Z;
    for (let i = k; i < m; i++) d = dd.add(d, dd.mul(v[i], M[i][j]));
    const factor = dd.mul(tau, d);
    for (let i = k; i < m; i++) M[i][j] = dd.sub(M[i][j], dd.mul(factor, v[i]));
  }
}

/** M := M (I − τ v vᵀ)（右乘）。 */
function applyRight(M: DD[][], v: DD[], tau: DD, k: number): void {
  const m = M.length;
  const n = M[0].length;
  for (let i = 0; i < m; i++) {
    let d: DD = Z;
    for (let j = k; j < n; j++) d = dd.add(d, dd.mul(M[i][j], v[j]));
    const factor = dd.mul(d, tau);
    for (let j = k; j < n; j++) M[i][j] = dd.sub(M[i][j], dd.mul(v[j], factor));
  }
}

export function qrPivotedDD(A: DD[][]): PivotedQRD {
  const m = A.length;
  const n = A[0]?.length ?? 0;
  const R = clone(A);
  const Q = identity(m);
  const perm: number[] = [];
  const alive: number[] = Array.from({ length: n }, (_, j) => j);

  for (let k = 0; k < n; k++) {
    // 每步直接重算剩余列在主元行以下的二范数平方，取最大者。
    let pickIdx = 0;
    let best: DD | null = null;
    for (let t = 0; t < alive.length; t++) {
      const col = alive[t];
      let s: DD = Z;
      const from = Math.min(k, m);
      for (let i = from; i < m; i++) s = dd.add(s, dd.mul(R[i][col], R[i][col]));
      if (best === null || dd.cmp(s, best) > 0) {
        best = s;
        pickIdx = t;
      }
    }
    const col = alive.splice(pickIdx, 1)[0];
    perm.push(col);

    if (k >= m) continue;

    const v: DD[] = Array.from({ length: m }, () => [0, 0] as DD);
    let normSq: DD = Z;
    for (let i = k; i < m; i++) {
      v[i] = R[i][col];
      normSq = dd.add(normSq, dd.mul(v[i], v[i]));
    }
    const normX = dd.sqrt(normSq);
    if (dd.cmp(normX, Z) === 0) continue; // 零主元列，秩亏由调用方判定

    // alpha 与 R[k][col] 反号
    const negNorm = dd.negate(normX);
    const alpha = R[k][col][0] < 0 ? normX : negNorm;
    v[k] = dd.sub(R[k][col], alpha);

    let vNormSq: DD = Z;
    for (let i = k; i < m; i++) vNormSq = dd.add(vNormSq, dd.mul(v[i], v[i]));
    if (dd.cmp(vNormSq, Z) === 0) continue;
    const tau = dd.div(dd.fromNumber(2), vNormSq);

    applyLeft(R, v, tau, k);
    applyRight(Q, v, tau, k);
  }

  return { R, Q, perm, m, n };
}

/** 回代求解 A[:,perm]=Q R̃ 下的 min‖A x − b‖，返回 DD 解。 */
export function solveRSTDD(qr: PivotedQRD, b: DD[]): DD[] {
  const { R, Q, perm, m, n } = qr;
  const Qtb: DD[] = Array.from({ length: n }, () => Z);
  for (let k = 0; k < n; k++) {
    let s: DD = Z;
    for (let i = 0; i < m; i++) s = dd.add(s, dd.mul(Q[i][k], b[i]));
    Qtb[k] = s;
  }
  const z: DD[] = Array.from({ length: n }, () => Z);
  for (let k = n - 1; k >= 0; k--) {
    let s: DD = Qtb[k];
    for (let j = k + 1; j < n; j++) s = dd.sub(s, dd.mul(R[k][perm[j]], z[j]));
    const pivot = k < m ? R[k][perm[k]] : Z;
    if (dd.cmp(pivot, Z) === 0) throw new Error('ZERO_PIVOT');
    z[k] = dd.div(s, pivot);
  }
  const x: DD[] = Array.from({ length: n }, () => Z);
  for (let k = 0; k < n; k++) x[perm[k]] = z[k];
  return x;
}
