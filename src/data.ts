import type { ObservationRow, PointRow } from './types';

let seq = 0;
export const newPointId = () => `pt-${Date.now()}-${seq++}`;
export const newObsId = () => `ob-${Date.now()}-${seq++}`;

export const emptyPoint = (): PointRow => ({
  id: newPointId(),
  name: '',
  type: '',
  elevation: '',
});

export const emptyObservation = (): ObservationRow => ({
  id: newObsId(),
  from: '',
  end: '',
  dh: '',
  sigma: '',
});

/** 初始内置示例：一条含闭合环的小型水准网（全部计算仍在浏览器本地完成）。 */
export function samplePoints(): PointRow[] {
  return [
    { id: newPointId(), name: 'BM1', type: 'benchmark', elevation: '100.000' },
    { id: newPointId(), name: 'P1', type: 'unknown', elevation: '' },
    { id: newPointId(), name: 'P2', type: 'unknown', elevation: '' },
    { id: newPointId(), name: 'BM2', type: 'benchmark', elevation: '105.000' },
  ];
}

export function sampleObservations(): ObservationRow[] {
  return [
    { id: newObsId(), from: 'BM1', end: 'P1', dh: '2.350', sigma: '1.2' },
    { id: newObsId(), from: 'P1', end: 'P2', dh: '1.870', sigma: '1.0' },
    { id: newObsId(), from: 'P2', end: 'BM2', dh: '0.810', sigma: '1.5' },
    { id: newObsId(), from: 'BM1', end: 'BM2', dh: '5.000', sigma: '2.0' },
  ];
}
