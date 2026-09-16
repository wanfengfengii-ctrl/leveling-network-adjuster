import { useMemo, useState } from 'react';
import type { ObservationRow, PointRow, TableError } from './types';
import {
  emptyObservation,
  emptyPoint,
  sampleObservations,
  samplePoints,
} from './data';
import { validateAll } from './lib/validation';
import { adjust } from './lib/adjustment';
import { buildCopyText, copyText } from './lib/clipboard';
import { ObservationTable, PointTable } from './components/Tables';
import { Results } from './components/Results';

export function App() {
  const [points, setPoints] = useState<PointRow[]>(() => samplePoints());
  const [observations, setObservations] = useState<ObservationRow[]>(() =>
    sampleObservations(),
  );
  const [copyState, setCopyState] = useState<'idle' | 'ok'>('idle');

  // 数据变化即重新校验与平差：任一错误存在时不产出成果（等同清空旧成果）。
  const analysis = useMemo(() => {
    if (points.length === 0 && observations.length === 0) {
      return {
        status: 'empty' as const,
        errors: [] as TableError[],
        parsedPoints: null,
        parsedObs: null,
        result: null,
      };
    }
    const { errors, points: parsedPoints, observations: parsedObs } = validateAll(
      points,
      observations,
    );
    if (errors.length > 0) {
      return { status: 'invalid' as const, errors, parsedPoints: null, parsedObs: null, result: null };
    }
    const result = adjust(parsedPoints, parsedObs);
    return {
      status: result.rankDeficient ? ('rank-deficient' as const) : ('ok' as const),
      errors: [] as TableError[],
      parsedPoints,
      parsedObs: parsedObs,
      result,
    };
  }, [points, observations]);

  const patchPoint = (id: string, patch: Partial<PointRow>) =>
    setPoints((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const patchObs = (id: string, patch: Partial<ObservationRow>) =>
    setObservations((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const handleCopy = async () => {
    if (analysis.status !== 'ok') return;
    await copyText(buildCopyText(analysis.parsedPoints!, analysis.result!));
    setCopyState('ok');
    setTimeout(() => setCopyState('idle'), 1500);
  };

  const loadSample = () => {
    setPoints(samplePoints());
    setObservations(sampleObservations());
  };
  const clearAll = () => {
    setPoints([]);
    setObservations([]);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>隧道复测统一平差工作台</h1>
        <p className="subtitle">
          共享观测点统一加权最小二乘平差 · 无基准支网（秩亏）拒绝出成果 · 全部计算在浏览器本地完成
        </p>
      </header>

      <div className="toolbar">
        <button type="button" onClick={loadSample}>
          载入示例
        </button>
        <button type="button" onClick={clearAll}>
          清空全部
        </button>
        <button type="button" onClick={() => setPoints((rs) => [...rs, emptyPoint()])}>
          ＋ 空点行
        </button>
        <button
          type="button"
          onClick={() => setObservations((rs) => [...rs, emptyObservation()])}
        >
          ＋ 空观测行
        </button>
        <div className="spacer" />
        <button
          type="button"
          className="btn-copy"
          data-testid="copy-button"
          disabled={analysis.status !== 'ok'}
          onClick={handleCopy}
          title={
            analysis.status === 'rank-deficient'
              ? '秩亏时禁止复制成果'
              : analysis.status === 'invalid'
                ? '存在输入错误时禁止复制成果'
                : '复制点高程与观测残差（三位小数）'
          }
        >
          {copyState === 'ok' ? '已复制 ✓' : '复制高程与残差'}
        </button>
      </div>

      {/* 点名称候选（仅辅助输入，引用合法性仍严格校验） */}
      <datalist id="point-names">
        {points
          .map((p) => p.name.trim())
          .filter((n) => n !== '')
          .map((n) => (
            <option key={n} value={n} />
          ))}
      </datalist>

      <div className="tables">
        <PointTable
          rows={points}
          errors={analysis.errors}
          onChange={patchPoint}
          onAdd={() => setPoints((rs) => [...rs, emptyPoint()])}
          onRemove={(id) => setPoints((rs) => rs.filter((r) => r.id !== id))}
        />
        <ObservationTable
          rows={observations}
          errors={analysis.errors}
          onChange={patchObs}
          onAdd={() => setObservations((rs) => [...rs, emptyObservation()])}
          onRemove={(id) => setObservations((rs) => rs.filter((r) => r.id !== id))}
        />
      </div>

      {analysis.status === 'empty' && (
        <section className="card empty-panel" data-testid="empty-panel">
          <h2>暂无数据</h2>
          <p className="hint">
            点击“载入示例”快速体验，或用“＋ 空点行 / ＋ 空观测行”开始录入。
            点表须声明完整点集：基准点填有限高程，未知点不填高程。
          </p>
        </section>
      )}

      {analysis.status === 'invalid' && (
        <section className="card error-panel" data-testid="error-panel">
          <h2>输入错误汇总（{analysis.errors.length}）——成果已清空</h2>
          <p className="hint">任一错误存在时不出平差成果；修正全部错误后自动恢复。</p>
          <ErrorList errors={analysis.errors} points={points} observations={observations} />
        </section>
      )}

      {analysis.status === 'rank-deficient' && (
        <section className="card rank-panel" data-testid="rank-panel">
          <h2>秩亏，无平差成果</h2>
          <p className="rank-reason">{analysis.result!.reason}</p>
          <p className="hint">
            判据：未知量非空且存在 |Rkk| ≤ 1e-10 × |R11|。修正观测连接后自动恢复，复制已禁用。
          </p>
        </section>
      )}

      {analysis.status === 'ok' && (
        <Results
          points={analysis.parsedPoints!}
          observations={analysis.parsedObs!}
          result={analysis.result!}
        />
      )}

      <footer className="app-footer">
        纯前端实现（TypeScript + React + Vite），不调用任何外部服务。
      </footer>
    </div>
  );
}

function ErrorList({
  errors,
  points,
  observations,
}: {
  errors: TableError[];
  points: PointRow[];
  observations: ObservationRow[];
}) {
  return (
    <ul className="error-list">
      {errors.map((e, i) => {
        const tableName = e.table === 'points' ? '点表' : '观测表';
        const preview =
          e.table === 'points'
            ? points[e.row - 1]?.name.trim() || '（空名称）'
            : `${observations[e.row - 1]?.from.trim() || '？'}→${
                observations[e.row - 1]?.end.trim() || '？'
              }`;
        return (
          <li key={i} className={e.table === 'points' ? 'err-point' : 'err-obs'}>
            <span className="err-loc">
              {tableName} 第 {e.row} 行（{preview}）
            </span>
            <span className="err-field">[{fieldLabel(e.field)}]</span>
            <span className="err-msg">{e.message}</span>
          </li>
        );
      })}
    </ul>
  );
}

function fieldLabel(field: TableError['field']): string {
  switch (field) {
    case 'name':
      return '名称';
    case 'type':
      return '类型';
    case 'elevation':
      return '高程';
    case 'from':
      return '起点';
    case 'end':
      return '终点';
    case 'dh':
      return '高差';
    case 'sigma':
      return '标准差';
    case 'row':
      return '整行';
  }
}
