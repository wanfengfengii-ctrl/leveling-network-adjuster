import { describe, expect, it } from 'vitest';
import { validateAll } from '../../src/lib/validation';
import type { ObservationRow, PointRow } from '../../src/types';

let seq = 0;
const pid = () => `p${seq++}`;
const point = (name: string, type: string = '', elevation = ''): PointRow => ({
  id: pid(),
  name,
  type: type as PointRow['type'],
  elevation,
});
const obs = (from: string, end: string, dh = '', sigma = ''): ObservationRow => ({
  id: pid(),
  from,
  end,
  dh,
  sigma,
});

describe('validateAll 校验', () => {
  it('合法数据无错误', () => {
    seq = 0;
    const r = validateAll(
      [point('A', 'benchmark', '100.0'), point('B', 'unknown')],
      [obs('A', 'B', '1.5', '2')],
    );
    expect(r.errors).toHaveLength(0);
    expect(r.points).toHaveLength(2);
    expect(r.observations).toHaveLength(1);
  });

  it('点表：空名称、重复名称、错误类型', () => {
    seq = 0;
    const r = validateAll(
      [point('', 'benchmark', '1'), point('A', 'xxx', '1'), point('A', 'unknown')],
      [],
    );
    const msgs = r.errors.map((e) => `${e.table}:${e.row}:${e.field}`);
    expect(msgs).toContain('points:1:name');
    expect(msgs).toContain('points:2:type');
    expect(msgs).toContain('points:3:name');
  });

  it('基准高程必填且有限，未知点不得填', () => {
    seq = 0;
    const r = validateAll(
      [
        point('A', 'benchmark', ''),
        point('B', 'benchmark', 'abc'),
        point('C', 'benchmark', 'Infinity'),
        point('D', 'unknown', '5'),
        point('E', 'unknown', 'xyz'),
      ],
      [],
    );
    const fields = r.errors.filter((e) => e.table === 'points').map((e) => `${e.row}:${e.field}`);
    expect(fields).toContain('1:elevation');
    expect(fields).toContain('2:elevation');
    expect(fields).toContain('3:elevation');
    expect(fields).toContain('4:elevation');
    expect(fields).toContain('5:elevation');
  });

  it('观测：未知引用、自环、字段错误、标准差范围', () => {
    seq = 0;
    const r = validateAll(
      [point('A', 'benchmark', '0')],
      [
        obs('Z', 'A', '1', '1'),
        obs('A', 'Y', '1', '1'),
        obs('A', 'A', '1', '1'),
        obs('A', 'Z', '', '1'),
        obs('A', 'Z', '1', ''),
        obs('A', 'Z', '1', '0'),
        obs('A', 'Z', '1', '-2'),
        obs('A', 'Z', '1', '100.1'),
        obs('A', 'Z', 'NaN', '1'),
      ],
    );
    const f = r.errors.map((e) => `${e.table === 'observations' ? 'obs' : 'pts'}:${e.row}:${e.field}`);
    expect(f).toContain('obs:1:from');
    expect(f).toContain('obs:2:end');
    expect(f).toContain('obs:3:row');
    expect(f).toContain('obs:4:dh');
    expect(f).toContain('obs:5:sigma');
    expect(f).toContain('obs:6:sigma');
    expect(f).toContain('obs:7:sigma');
    expect(f).toContain('obs:8:sigma');
    expect(f).toContain('obs:9:dh');
  });

  it('标准差边界 100 合法、趋近 0 非法', () => {
    seq = 0;
    const ok = validateAll(
      [point('A', 'benchmark', '0'), point('B', 'unknown')],
      [obs('A', 'B', '1', '100')],
    );
    expect(ok.errors).toHaveLength(0);

    seq = 0;
    const bad = validateAll(
      [point('A', 'benchmark', '0'), point('B', 'unknown')],
      [obs('A', 'B', '1', '0.0')],
    );
    expect(bad.errors.some((e) => e.row === 1 && e.field === 'sigma')).toBe(true);
  });

  it('错误稳定排序：先点表后观测，行号升序，字段固定次序', () => {
    seq = 0;
    const r = validateAll(
      [point('A', 'benchmark'), point('', 'unknown', '9')],
      [obs('A', 'A'), obs('X', 'Y', 'bad', '-1')],
    );
    expect(r.errors.length).toBeGreaterThanOrEqual(6);
    // 所有点表错误排在观测表之前
    const firstObsIdx = r.errors.findIndex((e) => e.table === 'observations');
    const lastPointIdx = r.errors.map((e) => e.table).lastIndexOf('points');
    expect(lastPointIdx).toBeLessThan(firstObsIdx);
    // 行号单调不减
    const pointRows = r.errors.filter((e) => e.table === 'points').map((e) => e.row);
    expect(pointRows).toEqual([...pointRows].sort((a, b) => a - b));
  });
});
