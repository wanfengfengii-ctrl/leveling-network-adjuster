import type { AdjustmentResult, ParsedPoint } from '../types';
import { formatFixed3 } from './format';

/**
 * 复制文本：先按点表顺序输出“名称,高程”（每行 2 列），
 * 再按观测顺序输出“起点,终点,残差”（每行 3 列）；
 * 数值一律保留三位小数（恰半远离零）。点行与观测行以列数区分。
 */
export function buildCopyText(points: ParsedPoint[], result: AdjustmentResult): string {
  const lines: string[] = [];
  points.forEach((p, i) => {
    lines.push(`${p.name},${formatFixed3(result.elevations[i])}`);
  });
  result.observations.forEach((r) => {
    lines.push(`${r.from},${r.end},${formatFixed3(r.residual)}`);
  });
  return lines.join('\n');
}

/** 优先使用剪贴板 API，非安全上下文下回退到 execCommand。 */
export async function copyText(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // 继续尝试回退方案
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}
