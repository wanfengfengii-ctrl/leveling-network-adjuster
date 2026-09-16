/** 核心数据模型与错误结构 */

import type { DD } from './lib/dd';

/** 点类型：基准点 / 未知点 */
export type PointType = 'benchmark' | 'unknown';

/** 点表一行（界面行模型，字段为原始字符串） */
export interface PointRow {
  /** 点表内唯一行标识 */
  id: string;
  /** 唯一非空名称 */
  name: string;
  /** 点类型：基准 / 未知 */
  type: PointType | '';
  /** 基准点必须填写有限高程；未知点不得填写 */
  elevation: string;
}

/** 观测表一行（界面行模型，字段为原始字符串） */
export interface ObservationRow {
  id: string;
  /** 起点名称（必须引用点表中的点） */
  from: string;
  /** 终点名称（必须引用点表中的点） */
  end: string;
  /** 高差 h：H终 − H起 ≈ h */
  dh: string;
  /** 标准差 σ（单位与高差一致），取值范围 (0, 100] */
  sigma: string;
}

export interface PointError {
  table: 'points';
  /** 数据行号，从 1 开始（不含表头） */
  row: number;
  field: 'name' | 'type' | 'elevation' | 'row';
  message: string;
}

export interface ObservationError {
  table: 'observations';
  row: number;
  field: 'from' | 'end' | 'dh' | 'sigma' | 'row';
  message: string;
}

export type TableError = PointError | ObservationError;

/** 归一化后的点 */
export interface ParsedPoint {
  name: string;
  type: PointType;
  /** 仅基准点有高程（double，兼容旧字段） */
  elevation: number | null;
  /** 精确高程（double-double），仅基准点有 */
  elevationDD: DD | null;
}

/** 归一化后的观测 */
export interface ParsedObservation {
  from: string;
  end: string;
  /** 观测高差（double） */
  dh: number;
  /** 标准差（double） */
  sigma: number;
  /** 观测高差（double-double，精确读入） */
  dhDD: DD;
  /** 标准差（double-double，精确读入） */
  sigmaDD: DD;
}

/** 单个观测的平差结果 */
export interface ObservationResult {
  from: string;
  end: string;
  dh: number;
  sigma: number;
  /** 平差后高差（两端点平差高程之差），展示用 double */
  adjustedDh: number;
  /** 残差 = 平差高差 − 观测高差，展示用 double */
  residual: number;
  /** 未舍入残差（double-double，用于并列判定） */
  residualDD: DD;
  /** 加权残差平方 (v/σ)²（先除后平方） */
  weightedSquaredResidual: number;
}

/** 整网平差结果 */
export interface AdjustmentResult {
  /** 按点表顺序的点高程（基准为已知值，未知为解算值） */
  elevations: number[];
  observations: ObservationResult[];
  /** 加权残差平方和 Σ(v/σ)²，未舍入 */
  weightedSumOfSquares: number;
  /** 参与解算的未知点个数 */
  unknownCount: number;
  rankDeficient: boolean;
  /** rankDeficient 为 true 时的说明 */
  reason?: string;
}
