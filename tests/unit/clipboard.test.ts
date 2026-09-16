import { describe, expect, it } from 'vitest';
import { buildCopyText } from '../../src/lib/clipboard';
import { adjust } from '../../src/lib/adjustment';
import { validateAll } from '../../src/lib/validation';
import type { ObservationRow, PointRow } from '../../src/types';

let seq = 0;
const pid = () => `p${seq++}`;

describe('buildCopyText', () => {
  it('按点表、观测顺序输出，逗号分隔且三位小数', () => {
    seq = 0;
    const pointRows: PointRow[] = [
      { id: pid(), name: 'A', type: 'benchmark', elevation: '10' },
      { id: pid(), name: 'B', type: 'unknown', elevation: '' },
    ];
    const obsRows: ObservationRow[] = [
      { id: pid(), from: 'A', end: 'B', dh: '2.0005', sigma: '1' },
    ];
    const { points, observations } = validateAll(pointRows, obsRows);
    const result = adjust(points, observations);
    const text = buildCopyText(points, result);
    const lines = text.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('A,10.000');
    expect(lines[1]).toMatch(/^B,-?\d+\.\d{3}$/);
    // 观测残差为 0（单观测唯一确定 B），负零不得出现
    expect(lines[2]).toBe('A,B,0.000');
  });
});
