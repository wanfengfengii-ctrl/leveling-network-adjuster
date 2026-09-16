/**
 * 带列主元的 Householder QR（自行实现，不调用任何现成求解器）。
 *
 * 列主元策略：每一步在剩余列中，直接重新计算其“主元行以下部分”的
 * 欧氏范数并选最大者；范数相同（严格相等）时取原列序号最靠前者。
 * R 的列不做物理交换，列主元次序仅记录于 perm，
 * 分解关系为 A[:,perm] = Q R̃（R̃ 第 k 列即 R 的第 perm[k] 列，为上梯形）。
 */

export interface PivotedQR {
  /** R：m×n，列保持原顺序；按 perm 取列后为上梯形 */
  R: number[][];
  /** Q 以 m×m 显式矩阵给出（本问题规模小，便于回代与调试） */
  Q: number[][];
  /** 列置换，perm[step] = 该步被选中的原列号 */
  perm: number[];
  m: number;
  n: number;
}

function cloneMatrix(A: number[][]): number[][] {
  return A.map((row) => row.slice());
}

function identity(m: number): number[][] {
  const I: number[][] = [];
  for (let i = 0; i < m; i++) {
    const row = new Array<number>(m).fill(0);
    row[i] = 1;
    I.push(row);
  }
  return I;
}

/** 左乘 Householder：M := (I − τ v vᵀ) M = M − τ v (vᵀ M)。 */
function applyHouseholderLeft(M: number[][], v: number[], tau: number): void {
  const m = M.length;
  const n = M[0].length;
  for (let j = 0; j < n; j++) {
    let dot = 0;
    for (let i = 0; i < m; i++) dot += v[i] * M[i][j];
    const factor = tau * dot;
    for (let i = 0; i < m; i++) M[i][j] -= factor * v[i];
  }
}

/** 右乘 Householder：M := M (I − τ v vᵀ) = M − τ (M v) vᵀ。 */
function applyHouseholderRight(M: number[][], v: number[], tau: number): void {
  const m = M.length;
  const n = M[0].length;
  for (let i = 0; i < m; i++) {
    let dot = 0;
    for (let j = 0; j < n; j++) dot += M[i][j] * v[j];
    const factor = tau * dot;
    for (let j = 0; j < n; j++) M[i][j] -= factor * v[j];
  }
}

/**
 * 对 m×n 矩阵 A 做带列主元 QR 分解：A[:,perm] = Q R̃。
 * 允许 n > m（观测少于未知量），此时靠后主元为 0，由调用方判秩亏。
 */
export function qrWithColumnPivot(A: number[][]): PivotedQR {
  const m = A.length;
  const n = A[0]?.length ?? 0;
  const R = cloneMatrix(A);
  const Q = identity(m);
  const perm: number[] = [];
  const alive: number[] = Array.from({ length: n }, (_, j) => j);

  for (let k = 0; k < n; k++) {
    // 每步直接重算各剩余列在主元行 k 以下的二范数平方；
    // alive 保持升序，严格相等时遍历到的首个即原列最靠前者。
    let pickIdx = 0;
    let bestSq = -1;
    for (let t = 0; t < alive.length; t++) {
      const col = alive[t];
      let s = 0;
      const from = Math.min(k, m);
      for (let i = from; i < m; i++) s += R[i][col] * R[i][col];
      if (s > bestSq) {
        bestSq = s;
        pickIdx = t;
      }
    }
    const col = alive.splice(pickIdx, 1)[0];
    perm.push(col);

    if (k >= m) {
      // 已无行可供消元：该列及所有剩余列在 R̃ 中的主元必为 0。
      continue;
    }

    // 取 R[k:m, col]，构造 Householder 向量将其变为 [±‖x‖, 0, …]。
    const v = new Array<number>(m).fill(0);
    let normX = 0;
    for (let i = k; i < m; i++) {
      v[i] = R[i][col];
      normX += v[i] * v[i];
    }
    normX = Math.sqrt(normX);
    if (normX === 0) continue; // 零主元列，无需变换；秩亏由调用方判定
    const alpha = R[k][col] >= 0 ? -normX : normX; // 与对角元反号，数值稳定
    v[k] -= alpha;
    let vNormSq = 0;
    for (let i = k; i < m; i++) vNormSq += v[i] * v[i];
    if (vNormSq === 0) continue;
    const tau = 2 / vNormSq;

    // R := H_k R（左乘，全部列一并更新；已消元列的子对角块本就是 0）；
    // Q := Q H_k（右乘），累计后 A[:,perm] = Q R̃。
    applyHouseholderLeft(R, v, tau);
    applyHouseholderRight(Q, v, tau);
  }

  return { R, Q, perm, m, n };
}

/**
 * 按主元序回代求解最小二乘 min‖A x − b‖（A[:,perm] = Q R̃）。
 * 先解 R̃ z = Qᵀ b，再还原 x[perm[k]] = z[k]。
 * 调用方须先用主元阈值判定满秩；遇零主元抛错（不应发生）。
 */
export function solveRST(R: number[][], Q: number[][], perm: number[], b: number[]): number[] {
  const m = Q.length;
  const n = R[0].length;
  const Qtb = new Array<number>(n).fill(0);
  for (let k = 0; k < n; k++) {
    let s = 0;
    for (let i = 0; i < m; i++) s += Q[i][k] * b[i];
    Qtb[k] = s;
  }
  const z = new Array<number>(n).fill(0);
  for (let k = n - 1; k >= 0; k--) {
    let s = Qtb[k];
    for (let j = k + 1; j < n; j++) s -= R[k][perm[j]] * z[j];
    const pivot = k < m ? R[k][perm[k]] : 0;
    if (pivot === 0) throw new Error('ZERO_PIVOT');
    z[k] = s / pivot;
  }
  const x = new Array<number>(n);
  for (let k = 0; k < n; k++) x[perm[k]] = z[k];
  return x;
}
