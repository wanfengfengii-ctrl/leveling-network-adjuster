import type { ObservationRow, PointRow, PointType, TableError } from '../types';

interface PointTableProps {
  rows: PointRow[];
  errors: TableError[];
  onChange: (id: string, patch: Partial<PointRow>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}

const pointErrorFields = (errors: TableError[], row: number) =>
  new Set(
    errors
      .filter((e) => e.table === 'points' && e.row === row)
      .map((e) => e.field as string),
  );

export function PointTable({ rows, errors, onChange, onAdd, onRemove }: PointTableProps) {
  return (
    <section className="card" data-testid="point-table">
      <div className="card-head">
        <h2>点表</h2>
        <button type="button" className="btn-add" onClick={onAdd}>
          ＋ 增加点
        </button>
      </div>
      <div className="table-scroll">
        <table className="grid">
          <thead>
            <tr>
              <th className="col-row">行</th>
              <th>名称（唯一、非空）</th>
              <th>类型</th>
              <th>高程（仅基准填）</th>
              <th className="col-op" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const bad = pointErrorFields(errors, i + 1);
              return (
                <tr key={r.id} className={bad.size ? 'row-error' : ''}>
                  <td className="row-no">{i + 1}</td>
                  <td>
                    <input
                      className={bad.has('name') ? 'invalid' : ''}
                      value={r.name}
                      aria-label={`第 ${i + 1} 行点名称`}
                      onChange={(e) => onChange(r.id, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      className={bad.has('type') ? 'invalid' : ''}
                      value={r.type}
                      aria-label={`第 ${i + 1} 行点类型`}
                      onChange={(e) =>
                        onChange(r.id, { type: e.target.value as PointType | '' })
                      }
                    >
                      <option value="" disabled>
                        请选择
                      </option>
                      <option value="benchmark">基准</option>
                      <option value="unknown">未知</option>
                    </select>
                  </td>
                  <td>
                    <input
                      className={bad.has('elevation') ? 'invalid' : ''}
                      value={r.elevation}
                      placeholder={r.type === 'unknown' ? '不得填写' : '有限数值'}
                      aria-label={`第 ${i + 1} 行高程`}
                      onChange={(e) => onChange(r.id, { elevation: e.target.value })}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn-del"
                      aria-label={`删除第 ${i + 1} 行点`}
                      onClick={() => onRemove(r.id)}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface ObservationTableProps {
  rows: ObservationRow[];
  errors: TableError[];
  onChange: (id: string, patch: Partial<ObservationRow>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}

const obsErrorFields = (errors: TableError[], row: number) =>
  new Set(
    errors
      .filter((e) => e.table === 'observations' && e.row === row)
      .map((e) => e.field as string),
  );

export function ObservationTable({
  rows,
  errors,
  onChange,
  onAdd,
  onRemove,
}: ObservationTableProps) {
  return (
    <section className="card" data-testid="observation-table">
      <div className="card-head">
        <h2>观测表</h2>
        <button type="button" className="btn-add" onClick={onAdd}>
          ＋ 增加观测
        </button>
      </div>
      <p className="hint">观测方程：H终 − H起 ≈ 高差；标准差 σ ∈ (0, 100]。</p>
      <div className="table-scroll">
        <table className="grid">
          <thead>
            <tr>
              <th className="col-row">行</th>
              <th>起点</th>
              <th>终点</th>
              <th>高差</th>
              <th>标准差 σ</th>
              <th className="col-op" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const bad = obsErrorFields(errors, i + 1);
              return (
                <tr key={r.id} className={bad.size ? 'row-error' : ''}>
                  <td className="row-no">{i + 1}</td>
                  <td>
                    <input
                      className={bad.has('from') ? 'invalid' : ''}
                      value={r.from}
                      list="point-names"
                      aria-label={`第 ${i + 1} 行起点`}
                      onChange={(e) => onChange(r.id, { from: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className={bad.has('end') ? 'invalid' : ''}
                      value={r.end}
                      list="point-names"
                      aria-label={`第 ${i + 1} 行终点`}
                      onChange={(e) => onChange(r.id, { end: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className={bad.has('dh') ? 'invalid' : ''}
                      value={r.dh}
                      aria-label={`第 ${i + 1} 行高差`}
                      onChange={(e) => onChange(r.id, { dh: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className={bad.has('sigma') ? 'invalid' : ''}
                      value={r.sigma}
                      aria-label={`第 ${i + 1} 行标准差`}
                      onChange={(e) => onChange(r.id, { sigma: e.target.value })}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn-del"
                      aria-label={`删除第 ${i + 1} 行观测`}
                      onClick={() => onRemove(r.id)}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
