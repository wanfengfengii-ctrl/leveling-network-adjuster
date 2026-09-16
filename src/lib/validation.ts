import type {
  ObservationRow,
  ParsedObservation,
  ParsedPoint,
  PointRow,
  TableError,
} from '../types';
import { parseDecimal, toNumber as ddToNumber } from './dd';

const POINT_FIELD_ORDER = ['name', 'type', 'elevation'] as const;
const OBS_FIELD_ORDER = ['from', 'end', 'row', 'dh', 'sigma'] as const;

/**
 * 校验点表与观测表，错误“按表、行号、字段顺序”稳定汇总。
 * 只要返回的 errors 非空，调用方必须清空旧成果，不得平差。
 */
export function validateAll(
  pointRows: PointRow[],
  obsRows: ObservationRow[],
): { errors: TableError[]; points: ParsedPoint[]; observations: ParsedObservation[] } {
  const errors: TableError[] = [];
  const pushPoint = (
    row: number,
    field: 'name' | 'type' | 'elevation' | 'row',
    message: string,
  ) => errors.push({ table: 'points', row, field, message });

  // ---- 点表 ----
  const seenNames = new Map<string, number>(); // 名称 -> 首次出现行号
  const parsedPoints: (ParsedPoint | null)[] = [];

  pointRows.forEach((r, i) => {
    const row = i + 1;
    const name = r.name.trim();
    if (name === '') {
      pushPoint(row, 'name', '名称不能为空');
    } else if (seenNames.has(name)) {
      pushPoint(row, 'name', `名称与第 ${seenNames.get(name)} 行重复`);
    } else {
      seenNames.set(name, row);
    }

    let type: ParsedPoint['type'] | null = null;
    if (r.type === 'benchmark' || r.type === 'unknown') {
      type = r.type;
    } else {
      pushPoint(row, 'type', '类型必须为“基准”或“未知”');
    }

    let elevation: number | null = null;
    let elevationDD: ParsedPoint['elevationDD'] = null;
    const elevRaw = r.elevation.trim();
    if (type === 'benchmark') {
      if (elevRaw === '') {
        pushPoint(row, 'elevation', '基准点必须填写高程');
      } else {
        const vDD = parseDecimal(elevRaw);
        if (vDD === null) pushPoint(row, 'elevation', '基准点高程必须是有限数值');
        else {
          elevationDD = vDD;
          elevation = ddToNumber(vDD);
        }
      }
    } else if (type === 'unknown' && elevRaw !== '') {
      // 未知点填了任何内容都不允许（即便内容不是合法数值）。
      pushPoint(row, 'elevation', '未知点不得填写高程');
    }

    parsedPoints.push(name !== '' && type !== null ? { name, type, elevation, elevationDD } : null);
  });

  // ---- 观测表 ----
  const knownNames = new Set(seenNames.keys());
  const parsedObs: (ParsedObservation | null)[] = [];

  const pushObs = (
    row: number,
    field: 'from' | 'end' | 'dh' | 'sigma' | 'row',
    message: string,
  ) => errors.push({ table: 'observations', row, field, message });

  obsRows.forEach((r, i) => {
    const row = i + 1;
    const from = r.from.trim();
    const end = r.end.trim();

    if (from === '') pushObs(row, 'from', '起点不能为空');
    else if (!knownNames.has(from)) pushObs(row, 'from', `起点“${from}”未在点表中声明`);

    if (end === '') pushObs(row, 'end', '终点不能为空');
    else if (!knownNames.has(end)) pushObs(row, 'end', `终点“${end}”未在点表中声明`);

    // 自环：两端同名即报，不依赖引用是否合法。
    if (from !== '' && from === end) {
      pushObs(row, 'row', '起点与终点不能为同一点（自环观测）');
    }

    let dh: number | null = null;
    let dhDD: ParsedObservation['dhDD'] | null = null;
    if (r.dh.trim() === '') pushObs(row, 'dh', '高差不能为空');
    else {
      const vDD = parseDecimal(r.dh);
      if (vDD === null) pushObs(row, 'dh', '高差必须是有限数值');
      else {
        dhDD = vDD;
        dh = ddToNumber(vDD);
      }
    }

    let sigma: number | null = null;
    let sigmaDD: ParsedObservation['sigmaDD'] | null = null;
    if (r.sigma.trim() === '') {
      pushObs(row, 'sigma', '标准差不能为空');
    } else {
      const vDD = parseDecimal(r.sigma);
      const v = vDD === null ? NaN : ddToNumber(vDD);
      if (vDD === null || !Number.isFinite(v)) {
        pushObs(row, 'sigma', '标准差必须是数值');
      } else if (!(v > 0 && v <= 100)) {
        pushObs(row, 'sigma', '标准差必须在开区间 (0, 100] 内');
      } else {
        sigma = v;
        sigmaDD = vDD;
      }
    }

    parsedObs.push(
      from !== '' && end !== '' && knownNames.has(from) && knownNames.has(end) &&
        from !== end && dh !== null && sigma !== null
        ? { from, end, dh, sigma, dhDD: dhDD!, sigmaDD: sigmaDD! }
        : null,
    );
  });

  // 稳定排序：先点表后观测表，表内按行号，行内按固定字段顺序。
  const fieldRank = (e: TableError): number =>
    e.table === 'points'
      ? POINT_FIELD_ORDER.indexOf(e.field as (typeof POINT_FIELD_ORDER)[number])
      : OBS_FIELD_ORDER.indexOf(e.field as (typeof OBS_FIELD_ORDER)[number]);
  errors.sort((a, b) => {
    const tableRank = a.table === 'points' ? 0 : 1;
    const tableRankB = b.table === 'points' ? 0 : 1;
    if (tableRank !== tableRankB) return tableRank - tableRankB;
    if (a.row !== b.row) return a.row - b.row;
    return fieldRank(a) - fieldRank(b);
  });

  return {
    errors,
    points: errors.length === 0 ? (parsedPoints as ParsedPoint[]) : [],
    observations: errors.length === 0 ? (parsedObs as ParsedObservation[]) : [],
  };
}
