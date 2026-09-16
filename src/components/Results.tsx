import { useMemo } from 'react';
import type { AdjustmentResult, ParsedObservation, ParsedPoint } from '../types';
import { formatFixed3 } from '../lib/format';
import * as dd from '../lib/dd';
import { maxAbsResidualDD } from '../lib/adjustment';
import { Topology } from './Topology';

interface Props {
  points: ParsedPoint[];
  observations: ParsedObservation[];
  result: AdjustmentResult;
}

/** 平差成果：点高程、观测残差（并列最大未舍入绝对残差标红）、加权残差平方和与拓扑。 */
export function Results({ points, observations, result }: Props) {
  const maxRes = useMemo(() => maxAbsResidualDD(result), [result]);

  return (
    <div className="results">
      <section className="card">
        <div className="card-head">
          <h2>平差点高程</h2>
          <span className="stat">未知点 {result.unknownCount} 个</span>
        </div>
        <div className="table-scroll">
          <table className="grid result-grid" data-testid="point-results">
            <thead>
              <tr>
                <th className="col-row">序</th>
                <th>点名称</th>
                <th>类型</th>
                <th>高程（m）</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={p.name}>
                  <td className="row-no">{i + 1}</td>
                  <td>{p.name}</td>
                  <td>{p.type === 'benchmark' ? '基准' : '未知'}</td>
                  <td className="num">{formatFixed3(result.elevations[i])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>观测残差</h2>
          <span className="stat">
            v = 平差高差 − 观测高差；最大 |v| = {formatFixed3(dd.toNumber(maxRes))}（未舍入判定，红色标出）
          </span>
        </div>
        <div className="table-scroll">
          <table className="grid result-grid" data-testid="obs-results">
            <thead>
              <tr>
                <th className="col-row">行</th>
                <th>起点</th>
                <th>终点</th>
                <th>观测高差</th>
                <th>平差高差</th>
                <th>残差 v</th>
                <th>σ</th>
              </tr>
            </thead>
            <tbody>
              {result.observations.map((o, i) => {
                const tie = o.maxTied;
                return (
                  <tr key={i} className={tie ? 'residual-max' : ''}>
                    <td className="row-no">{i + 1}</td>
                    <td>{o.from}</td>
                    <td>{o.end}</td>
                    <td className="num">{formatFixed3(o.dh)}</td>
                    <td className="num">{formatFixed3(o.adjustedDh)}</td>
                    <td className="num residual-cell">{formatFixed3(o.residual)}</td>
                    <td className="num">{formatFixed3(o.sigma)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="wss" data-testid="wss">
          加权残差平方和 Σ(v/σ)² ={' '}
          <strong>
            {Math.abs(result.weightedSumOfSquares) >= 1e12
              ? result.weightedSumOfSquares.toExponential(6)
              : result.weightedSumOfSquares.toFixed(6)}
          </strong>
          <span className="note">（由未舍入结果计算）</span>
        </p>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>水准网拓扑</h2>
          <span className="stat">滚轮或按钮缩放；■ 基准点　● 未知点</span>
        </div>
        <Topology points={points} observations={observations} result={result} />
      </section>
    </div>
  );
}
