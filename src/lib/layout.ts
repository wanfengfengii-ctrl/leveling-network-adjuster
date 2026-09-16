import type { ParsedObservation, ParsedPoint } from '../types';

export interface NodePosition {
  name: string;
  x: number;
  y: number;
  benchmark: boolean;
}

/**
 * 确定性力导向布局（无随机数，结果可复现）：
 * 节点初始均匀置于圆周，观测边作为弹簧，全节点间库仑斥力，
 * 配弱向心力避免漂移；基准点额外固定倾向（稍强向心）。
 * 纯数值迭代，不依赖任何外部库。
 */
export function layoutGraph(
  points: ParsedPoint[],
  observations: ParsedObservation[],
): NodePosition[] {
  const n = points.length;
  if (n === 0) return [];
  const idx = new Map<string, number>();
  points.forEach((p, i) => idx.set(p.name, i));

  // 圆周初值
  const pos = points.map((p, i) => {
    const a = (i / Math.max(1, n)) * 2 * Math.PI - Math.PI / 2;
    return {
      name: p.name,
      benchmark: p.type === 'benchmark',
      x: Math.cos(a) * (n > 1 ? 1 : 0),
      y: Math.sin(a) * (n > 1 ? 1 : 0),
    };
  });

  const edges = observations
    .map((o) => [idx.get(o.from)!, idx.get(o.end)!] as const)
    .filter(([a, b]) => a !== undefined && b !== undefined && a !== b);

  const iterations = 300;
  const idealLen = 1.6;
  for (let it = 0; it < iterations; it++) {
    const fx = new Array<number>(n).fill(0);
    const fy = new Array<number>(n).fill(0);

    // 斥力
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1e-6) {
          dx = 1e-3 * (i - j);
          dy = 1e-3 * ((i + j) % 2 === 0 ? 1 : -1);
          d2 = dx * dx + dy * dy;
        }
        const d = Math.sqrt(d2);
        const rep = 1.2 / d2;
        fx[i] += (rep * dx) / d;
        fy[i] += (rep * dy) / d;
        fx[j] -= (rep * dx) / d;
        fy[j] -= (rep * dy) / d;
      }
    }

    // 弹簧
    for (const [a, b] of edges) {
      const dx = pos[b].x - pos[a].x;
      const dy = pos[b].y - pos[a].y;
      const d = Math.max(1e-6, Math.hypot(dx, dy));
      const force = (d - idealLen) * 0.15;
      const ux = (dx / d) * force;
      const uy = (dy / d) * force;
      fx[a] += ux;
      fy[a] += uy;
      fx[b] -= ux;
      fy[b] -= uy;
    }

    // 向心力
    for (let i = 0; i < n; i++) {
      fx[i] -= pos[i].x * 0.02;
      fy[i] -= pos[i].y * 0.02;
    }

    const t = 0.1 * (1 - it / iterations) + 0.02;
    for (let i = 0; i < n; i++) {
      // 基准点锚定稍强，未知点自由移动
      const damp = pos[i].benchmark ? 0.35 : 1;
      pos[i].x += fx[i] * t * damp;
      pos[i].y += fy[i] * t * damp;
    }
  }

  return pos;
}
