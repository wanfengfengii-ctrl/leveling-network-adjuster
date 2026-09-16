import { describe, expect, it } from 'vitest';
import {
  adjust,
  isTiedMaxResidualDD,
  maxAbsResidualDD,
  residualTieToleranceDD,
} from '../../src/lib/adjustment';
import { validateAll } from '../../src/lib/validation';
import * as dd from '../../src/lib/dd';
import type { AdjustmentResult, ObservationRow, PointRow } from '../../src/types';

let seq = 0;
const pid = () => `p${seq++}`;
const point = (name: string, type: 'benchmark' | 'unknown', elevation = ''): PointRow => ({
  id: pid(),
  name,
  type,
  elevation,
});
const obs = (from: string, end: string, dh: string, sigma = '1'): ObservationRow => ({
  id: pid(),
  from,
  end,
  dh,
  sigma,
});

describe('加权最小二乘平差', () => {
  it('单基准单未知：直接解出高程', () => {
    seq = 0;
    const { errors, points, observations } = validateAll(
      [point('A', 'benchmark', '100'), point('B', 'unknown')],
      [obs('A', 'B', '1.5', '0.5')],
    );
    expect(errors).toHaveLength(0);
    const r = adjust(points, observations);
    expect(r.rankDeficient).toBe(false);
    expect(r.elevations[1]).toBeCloseTo(101.5, 12);
    expect(r.observations[0].residual).toBeCloseTo(0, 12);
    expect(r.weightedSumOfSquares).toBeCloseTo(0, 12);
  });

  it('闭合水准环：等权解与解析解一致', () => {
    // A=10 基准；B、C 未知。观测 A→B=2, B→C=3, A→C=5.1（环闭合差 -0.1）
    seq = 0;
    const { errors, points, observations } = validateAll(
      [point('A', 'benchmark', '10'), point('B', 'unknown'), point('C', 'unknown')],
      [obs('A', 'B', '2'), obs('B', 'C', '3'), obs('A', 'C', '5.1')],
    );
    expect(errors).toHaveLength(0);
    const r = adjust(points, observations);
    // 最小二乘：v1+v2-v3 关系下，闭合差平均分配，v = (2.000…)/3
    // 方程：B=12+v1, C=B+3+v2, C=15.1+v3；极小化 v1²+v2²+v3² 且 v3 = v1+v2-0.1
    // 解 v1=v2=0.1/3≈0.03333, v3=-0.1/3
    expect(r.observations[0].residual).toBeCloseTo(0.1 / 3, 12);
    expect(r.observations[1].residual).toBeCloseTo(0.1 / 3, 12);
    expect(r.observations[2].residual).toBeCloseTo(-0.1 / 3, 12);
    expect(r.weightedSumOfSquares).toBeCloseTo(3 * (0.1 / 3) ** 2, 12);
  });

  it('加权：标准差大的观测残差更大', () => {
    seq = 0;
    // A=0, B 未知，两条观测 A→B：1（σ=1）与 1.1（σ=10）
    const { points, observations } = validateAll(
      [point('A', 'benchmark', '0'), point('B', 'unknown')],
      [obs('A', 'B', '1', '1'), obs('A', 'B', '1.1', '10')],
    );
    const r = adjust(points, observations);
    // 加权均值 B = (1/1²·1 + 1/100·1.1)/(1+0.01)
    const expected = (1 * 1 + 0.01 * 1.1) / 1.01;
    expect(r.elevations[1]).toBeCloseTo(expected, 12);
    expect(Math.abs(r.observations[0].residual)).toBeLessThan(
      Math.abs(r.observations[1].residual),
    );
  });

  it('无基准支网仅由主元判据判为秩亏', () => {
    // A=0 基准连到 B；C-D 构成与基准无关的支网
    seq = 0;
    const { points, observations } = validateAll(
      [
        point('A', 'benchmark', '0'),
        point('B', 'unknown'),
        point('C', 'unknown'),
        point('D', 'unknown'),
      ],
      [obs('A', 'B', '1'), obs('C', 'D', '2')],
    );
    const r = adjust(points, observations);
    expect(r.rankDeficient).toBe(true);
    expect(r.reason).toContain('秩亏');
  });

  it('孤立未知点判秩亏', () => {
    seq = 0;
    const { points, observations } = validateAll(
      [point('A', 'benchmark', '5'), point('X', 'unknown')],
      [],
    );
    const r = adjust(points, observations);
    expect(r.rankDeficient).toBe(true);
  });

  it('全部基准（未知量为空）直接复算残差', () => {
    seq = 0;
    const { points, observations } = validateAll(
      [point('A', 'benchmark', '0'), point('B', 'benchmark', '2')],
      [obs('A', 'B', '1.9')],
    );
    const r = adjust(points, observations);
    expect(r.rankDeficient).toBe(false);
    expect(r.unknownCount).toBe(0);
    expect(r.observations[0].residual).toBeCloseTo(0.1, 12);
    expect(r.weightedSumOfSquares).toBeCloseTo(0.01, 12); // (0.1/1)²
  });

  it('加权残差平方和按绝对权 1/σ²：σ=2、v=0.1 时为 0.0025', () => {
    seq = 0;
    const { points, observations } = validateAll(
      [point('A', 'benchmark', '0'), point('B', 'benchmark', '0.3')],
      [obs('A', 'B', '0.2', '2')],
    );
    const r = adjust(points, observations);
    expect(r.observations[0].residual).toBeCloseTo(0.1, 12);
    expect(r.weightedSumOfSquares).toBeCloseTo(0.0025, 14); // (0.1/2)²
    expect(r.observations[0].weightedSquaredResidual).toBeCloseTo(0.0025, 14);
  });

  it('5e-324 与零残差不得并列，仅非零者标红', () => {
    seq = 0;
    const { points, observations } = validateAll(
      [point('A', 'benchmark', '0'), point('B', 'benchmark', '5e-324')],
      [obs('A', 'B', '5e-324', '1'), obs('A', 'B', '0', '1')],
    );
    const r = adjust(points, observations);
    expect(r.observations[0].residual).toBe(0);
    expect(r.observations[1].residual).toBe(5e-324);
    const mx = maxAbsResidualDD(r);
    expect(dd.toNumber(mx)).toBe(5e-324);
    const tol = residualTieToleranceDD(r);
    expect(tol).toBe(0); // 操作数为亚正常量级，容差下溢为 0
    expect(isTiedMaxResidualDD(dd.fromNumber(0), mx, tol)).toBe(false);
    expect(isTiedMaxResidualDD(dd.fromNumber(5e-324), mx, tol)).toBe(true);
  });

  it('观测少于未知量也判秩亏', () => {
    seq = 0;
    const { points, observations } = validateAll(
      [point('A', 'benchmark', '0'), point('B', 'unknown'), point('C', 'unknown')],
      [obs('A', 'B', '1')],
    );
    expect(adjust(points, observations).rankDeficient).toBe(true);
  });

  it('全网无基准点（整体平移自由）判秩亏', () => {
    seq = 0;
    const { points, observations } = validateAll(
      [point('A', 'unknown'), point('B', 'unknown'), point('C', 'unknown')],
      [obs('A', 'B', '1'), obs('B', 'C', '1')],
    );
    const r = adjust(points, observations);
    expect(r.rankDeficient).toBe(true);
    expect(r.reason).toMatch(/R\d\d/);
  });

  it('极小合法标准差仍给出有限成果（行权不得溢出为 Inf/NaN）', () => {
    seq = 0;
    const { errors, points, observations } = validateAll(
      [point('A', 'benchmark', '100'), point('B', 'unknown'), point('C', 'unknown')],
      [
        obs('A', 'B', '1.5', '1e-200'),
        obs('B', 'C', '2.5', '2e-200'),
        obs('A', 'C', '4.0000000001', '3e-200'),
      ],
    );
    expect(errors).toHaveLength(0);
    const r = adjust(points, observations);
    expect(r.rankDeficient).toBe(false);
    for (const h of r.elevations) expect(Number.isFinite(h)).toBe(true);
    expect(r.elevations[1]).toBeCloseTo(101.5, 8);
    for (const o of r.observations) {
      expect(Number.isFinite(o.residual)).toBe(true);
      expect(Number.isFinite(o.adjustedDh)).toBe(true);
      expect(Number.isFinite(o.weightedSquaredResidual)).toBe(true);
    }
    expect(Number.isFinite(r.weightedSumOfSquares)).toBe(true);
  });

  it('标准差为最小正双精度也不产生 NaN', () => {
    seq = 0;
    const { points, observations } = validateAll(
      [point('A', 'benchmark', '0'), point('B', 'unknown')],
      [obs('A', 'B', '1', Number.MIN_VALUE.toString())],
    );
    const r = adjust(points, observations);
    expect(r.rankDeficient).toBe(false);
    expect(Number.isFinite(r.elevations[1])).toBe(true);
  });

  it('并列判定基于 DD 未舍入残差：常规真并列成立、零与非零不并列', () => {
    const mkResult = (residuals: number[]): AdjustmentResult => ({
      elevations: [],
      observations: residuals.map((v) => ({
        from: 'a', end: 'b', dh: 0, sigma: 1, adjustedDh: v,
        residual: v, residualDD: dd.fromNumber(v), weightedSquaredResidual: v * v,
      })),
      weightedSumOfSquares: 0,
      unknownCount: 0,
      rankDeficient: false,
    });

    const r = mkResult([0.002, -0.002, 0.001]);
    const mx = maxAbsResidualDD(r);
    expect(dd.toNumber(mx)).toBeCloseTo(0.002, 15);
    const tol = residualTieToleranceDD(r);
    expect(isTiedMaxResidualDD(dd.fromNumber(0.002), mx, tol)).toBe(true);
    expect(isTiedMaxResidualDD(dd.fromNumber(-0.002), mx, tol)).toBe(true);
    expect(isTiedMaxResidualDD(dd.fromNumber(0.001), mx, tol)).toBe(false);
  });

  it('十亿级高差下完全相容网（残差即 DD 噪声）一条都不标红', () => {
    // A=0、C=2e9 为基准，B 未知；观测严格相容，数学残差全为 0。
    seq = 0;
    const { points, observations } = validateAll(
      [
        point('A', 'benchmark', '0'),
        point('B', 'unknown'),
        point('C', 'benchmark', '2000000000'),
      ],
      [
        obs('A', 'B', '1000000000', '1'),
        obs('B', 'C', '1000000000', '1'),
        obs('A', 'C', '2000000000', '1'),
      ],
    );
    const r = adjust(points, observations);
    // DD 残差仅为 ~1e-23 的求解噪声，远小于 double 可显示量级
    for (const o of r.observations) expect(Math.abs(o.residual)).toBeLessThan(1e-20);
    const mx = maxAbsResidualDD(r);
    const tol = residualTieToleranceDD(r);
    // 最大残差不超过噪声容差 → 不存在“最大残差”，零残差不被染色
    for (const o of r.observations) {
      expect(isTiedMaxResidualDD(o.residualDD, mx, tol)).toBe(false);
    }
  });

  it('十亿级高差下真实并列的残差（远超噪声）仍同时标红', () => {
    // 闭合差 0.002 三等权分配：v1=v2=v3≈-…/6.67e-4，三条数学上并列
    seq = 0;
    const { points, observations } = validateAll(
      [
        point('A', 'benchmark', '0'),
        point('B', 'unknown'),
        point('C', 'benchmark', '2000000000'),
      ],
      [
        obs('A', 'B', '1000000000.001', '1'),
        obs('B', 'C', '1000000000.001', '1'),
        obs('A', 'C', '2000000000', '1'),
      ],
    );
    const r = adjust(points, observations);
    const mx = maxAbsResidualDD(r);
    const tol = residualTieToleranceDD(r);
    expect(dd.toNumber(mx)).toBeGreaterThan(1e-6);
    const ties = r.observations.map((o) => isTiedMaxResidualDD(o.residualDD, mx, tol));
    // 两条链残差并列 -0.001；直达观测两端皆基准，v3 恒为 0，不参与标红
    expect(ties).toEqual([true, true, false]);
  });

  it('十亿级高差下残差“略有差别”时只标出较大者', () => {
    seq = 0;
    const { points, observations } = validateAll(
      [
        point('A', 'benchmark', '0'),
        point('B', 'unknown'),
        point('C', 'benchmark', '2000000000'),
      ],
      [
        obs('A', 'B', '1000000000', '1'),
        obs('B', 'C', '1000000000.000001', '2'), // 不同 σ 使两链残差不等（-2e-7 与 -8e-7）
        obs('A', 'C', '2000000000', '1'),
      ],
    );
    const r = adjust(points, observations);
    expect(r.observations[0].residual).toBeCloseTo(-2e-7, 12);
    expect(r.observations[1].residual).toBeCloseTo(-8e-7, 12);
    const mx = maxAbsResidualDD(r);
    const tol = residualTieToleranceDD(r);
    expect(tol).toBeLessThan(1e-15); // DD 噪声量级远小于真值差 6e-7
    expect(isTiedMaxResidualDD(r.observations[0].residualDD, mx, tol)).toBe(false);
    expect(isTiedMaxResidualDD(r.observations[1].residualDD, mx, tol)).toBe(true);
  });
});
