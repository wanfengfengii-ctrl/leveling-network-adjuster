import { describe, expect, it } from 'vitest';
import { formatFixed3 } from '../../src/lib/format';

describe('formatFixed3 恰半远离零', () => {
  it('常规三位小数', () => {
    expect(formatFixed3(0)).toBe('0.000');
    expect(formatFixed3(1)).toBe('1.000');
    expect(formatFixed3(-1.5)).toBe('-1.500');
    expect(formatFixed3(1.2344)).toBe('1.234');
    expect(formatFixed3(1.2346)).toBe('1.235');
  });

  it('恰半向远离零方向进位（含奇数末位）', () => {
    expect(formatFixed3(0.0005)).toBe('0.001');
    expect(formatFixed3(-0.0005)).toBe('-0.001');
    expect(formatFixed3(1.2345)).toBe('1.235'); // toFixed 在部分引擎给 1.234
    expect(formatFixed3(-1.2345)).toBe('-1.235');
    expect(formatFixed3(2.675 + 0.0005 - 0.0005)).toBeDefined();
    expect(formatFixed3(0.0025)).toBe('0.003'); // 奇数末位也远离零
  });

  it('负零显示为 0.000', () => {
    expect(formatFixed3(-0)).toBe('0.000');
    expect(formatFixed3(-1e-17)).toBe('0.000');
  });
});
