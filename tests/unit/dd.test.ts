import { describe, expect, it } from 'vitest';
import * as dd from '../../src/lib/dd';

const n = (a: dd.DD) => dd.toNumber(a);

describe('double-double 算术', () => {
  it('加减乘除保持 ~30 位十进制精度', () => {
    // (1 + 1e-20) − 1 在 double 下被吃掉，DD 下保留
    const x = dd.add(dd.fromNumber(1), dd.parseDecimal('1e-20')!);
    expect(n(dd.sub(x, dd.one))).toBeCloseTo(1e-20, 35);

    // 大数量级加减不丢毫米以下信息
    const a = dd.parseDecimal('1000000000.0001')!;
    const b = dd.parseDecimal('1000000000.0000')!;
    expect(n(dd.sub(a, b))).toBeCloseTo(0.0001, 15);

    const p = dd.mul(dd.parseDecimal('123456.789')!, dd.parseDecimal('987654.321')!);
    expect(n(p)).toBeCloseTo(123456.789 * 987654.321, 10);

    const q = dd.div(dd.parseDecimal('1')!, dd.parseDecimal('7')!);
    // 1/7 用 double 无法精确表示，DD 下误差 < 1e-30
    expect(Math.abs(n(q) - 1 / 7)).toBeLessThan(1e-30);
  });

  it('sqrt 精度', () => {
    const s = dd.sqrt(dd.parseDecimal('2')!);
    expect(Math.abs(n(s) - Math.SQRT2)).toBeLessThan(1e-30);
    expect(dd.toNumber(dd.sqrt(dd.zero))).toBe(0);
    expect(Number.isNaN(dd.toNumber(dd.sqrt(dd.fromNumber(-1))))).toBe(true);
  });

  it('比较与符号', () => {
    expect(dd.cmp(dd.parseDecimal('1e-300')!, dd.zero)).toBe(1);
    expect(dd.cmp(dd.zero, dd.parseDecimal('1e-300')!)).toBe(-1);
    expect(dd.cmp(dd.parseDecimal('5e-324')!, dd.parseDecimal('5e-324')!)).toBe(0);
    expect(n(dd.abs(dd.fromNumber(-3.5)))).toBe(3.5);
  });

  it('parseDecimal 精确解析十进制（含指数、符号、极端尺度）', () => {
    expect(n(dd.parseDecimal('1000000000.0001')!)).toBe(1000000000.0001);
    expect(n(dd.parseDecimal('-0.0025')!)).toBe(-0.0025);
    expect(n(dd.parseDecimal('1e-200')!)).toBe(1e-200);
    expect(n(dd.parseDecimal('5e-324')!)).toBe(5e-324);
    expect(n(dd.parseDecimal('.5')!)).toBe(0.5);
    expect(n(dd.parseDecimal('+1.25E2')!)).toBe(125);
    expect(dd.parseDecimal('Infinity')).toBeNull();
    expect(dd.parseDecimal('NaN')).toBeNull();
    expect(dd.parseDecimal('0x10')).toBeNull();
    expect(dd.parseDecimal('1.2.3')).toBeNull();
    expect(dd.parseDecimal('')).toBeNull();
  });

  it('极端尺度加权：v=σ=1e-200 时 (v/σ)² = 1', () => {
    const v = dd.parseDecimal('1e-200')!;
    const sigma = dd.parseDecimal('1e-200')!;
    const q = dd.div(v, sigma);
    const wss = dd.mul(q, q);
    expect(n(wss)).toBe(1);

    // v=0.1、σ=2 → 0.0025
    const q2 = dd.div(dd.parseDecimal('0.1')!, dd.parseDecimal('2')!);
    expect(n(dd.mul(q2, q2))).toBeCloseTo(0.0025, 16);
  });
});
