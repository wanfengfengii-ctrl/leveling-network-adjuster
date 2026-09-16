import { useMemo, useState } from 'react';
import type { AdjustmentResult, ParsedObservation, ParsedPoint } from '../types';
import { formatFixed3 } from '../lib/format';
import {
  isTiedMaxResidualDD,
  maxAbsResidualDD,
  residualTieToleranceDD,
} from '../lib/adjustment';
import { layoutGraph } from '../lib/layout';

interface Props {
  points: ParsedPoint[];
  observations: ParsedObservation[];
  result: AdjustmentResult;
}

const R = 0.22; // 节点绘制半径（布局坐标单位）

/** 可缩放水准网拓扑：基准点为方块、未知点为圆点，箭头为观测方向。 */
export function Topology({ points, observations, result }: Props) {
  const [zoom, setZoom] = useState(1);
  const nodes = useMemo(() => layoutGraph(points, observations), [points, observations]);
  const maxRes = useMemo(() => maxAbsResidualDD(result), [result]);
  const tieTol = useMemo(() => residualTieToleranceDD(result), [result]);

  if (nodes.length === 0) {
    return <p className="empty-hint">点表为空，暂无可显示的拓扑。</p>;
  }

  // 视图范围
  const xs = nodes.map((p) => p.x);
  const ys = nodes.map((p) => p.y);
  const minX = Math.min(...xs) - 1.2;
  const maxX = Math.max(...xs) + 1.2;
  const minY = Math.min(...ys) - 1.0;
  const maxY = Math.max(...ys) + 1.0;
  const w = maxX - minX;
  const h = maxY - minY;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  // 以中心为锚缩放视图窗
  const vw = w / zoom;
  const vh = h / zoom;

  const idx = new Map(nodes.map((p, i) => [p.name, i]));

  return (
    <div className="topology-wrap">
      <div className="zoom-bar">
        <button type="button" onClick={() => setZoom((z) => Math.min(8, z * 1.2))}>
          ＋
        </button>
        <button type="button" onClick={() => setZoom((z) => Math.max(0.3, z / 1.2))}>
          －
        </button>
        <button type="button" onClick={() => setZoom(1)}>
          复位
        </button>
        <span className="zoom-value">{Math.round(zoom * 100)}%</span>
      </div>
      <svg
        className="topology-svg"
        data-testid="topology-svg"
        viewBox={`${cx - vw / 2} ${cy - vh / 2} ${vw} ${vh}`}
        role="img"
        aria-label="水准网拓扑图"
        onWheel={(e) => {
          setZoom((z) =>
            Math.min(8, Math.max(0.3, z * (e.deltaY < 0 ? 1.1 : 1 / 1.1))),
          );
        }}
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#577590" />
          </marker>
          <marker
            id="arrow-red"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#d62828" />
          </marker>
        </defs>

        {result.observations.map((o, k) => {
          const a = nodes[idx.get(o.from)!];
          const b = nodes[idx.get(o.end)!];
          if (!a || !b) return null;
          // 缩短到节点边缘
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.max(1e-9, Math.hypot(dx, dy));
          const ux = dx / d;
          const uy = dy / d;
          const sx = a.x + ux * R;
          const sy = a.y + uy * R;
          const tx = b.x - ux * R;
          const ty = b.y - uy * R;
          const tie = isTiedMaxResidualDD(o.residualDD, maxRes, tieTol);
          return (
            <g key={k}>
              <line
                x1={sx}
                y1={sy}
                x2={tx}
                y2={ty}
                className={tie ? 'edge edge-max' : 'edge'}
                markerEnd={tie ? 'url(#arrow-red)' : 'url(#arrow)'}
              />
              <text
                x={(sx + tx) / 2}
                y={(sy + ty) / 2 - 0.08}
                className={tie ? 'edge-label edge-label-max' : 'edge-label'}
                textAnchor="middle"
              >
                v={formatFixed3(o.residual)}
              </text>
            </g>
          );
        })}

        {nodes.map((node) => {
          const pi = points.findIndex((p) => p.name === node.name);
          const label = `${node.name} ${formatFixed3(result.elevations[pi])}`;
          return (
            <g key={node.name}>
              {node.benchmark ? (
                <rect
                  x={node.x - R}
                  y={node.y - R}
                  width={R * 2}
                  height={R * 2}
                  className="node node-benchmark"
                />
              ) : (
                <circle cx={node.x} cy={node.y} r={R} className="node node-unknown" />
              )}
              <text x={node.x} y={node.y - R - 0.12} className="node-label" textAnchor="middle">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
