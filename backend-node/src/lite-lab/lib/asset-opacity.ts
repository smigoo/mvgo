/**
 * 资源图像素统计（判「整块底图」还是「半透明叠加层」的唯一依据）
 *
 * 🔴 为什么必须看像素：Figma 里的 IMAGE fill 有两种语义
 *   ① 整块底图：图本身不透明，直接当容器背景
 *   ② 叠加层（sheen / 高光 / 纹理）：图大面积透明，真正的底色是它下面的渐变/纯色
 *   真机实锤（mc-lab-1793890392882）：设备卡 `bg-8439.png` 平均 alpha = 11/255（≈4.5%），
 *   却被当成整块底图 ⇒ 把 CSS 底色整条删掉 ⇒ 卡片变白、白字看不见。
 *   两个资源的 alpha 完全不同（`bg-8788`≈193、`bg-8807`≈57），所以必须**逐图测**，
 *   不能按文件名或尺寸猜。
 *
 * 用 pngjs（纯 JS，无原生依赖）；任何异常一律返回 undefined 让调用方退回旧行为。
 */
import { readFileSync } from 'fs';
import { PNG } from 'pngjs';

export interface AssetOpacityInfo {
  /** 平均 alpha（0-255） */
  meanAlpha: number;
  /** 可见像素的平均亮度（0-255） */
  meanLum: number;
  /** alpha > 8 的像素占比 */
  visibleRatio: number;
}

/** 平均 alpha ≥ 此值视为**不透明整块底图**（可直接替换底色）；低于则视为叠加层（必须保留底色） */
export const OPAQUE_BG_ALPHA = 180;

export function readPngStats(filePath: string): AssetOpacityInfo | undefined {
  try {
    const png = PNG.sync.read(readFileSync(filePath));
    const { width, height, data } = png;
    const total = width * height;
    if (!total) return undefined;
    let sumA = 0;
    let visible = 0;
    let sumLum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      sumA += a;
      if (a > 8) {
        visible += 1;
        sumLum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }
    }
    return {
      meanAlpha: Math.round(sumA / total),
      meanLum: visible > 0 ? Math.round(sumLum / visible) : 0,
      visibleRatio: Math.round((visible / total) * 100) / 100,
    };
  } catch {
    return undefined;
  }
}

/** 批量读一批资源（只对需要判底图的 bg-* 调用，避免无谓解码） */
export function readPngStatsMap(
  dir: string,
  fileNames: string[],
): Record<string, AssetOpacityInfo> {
  const out: Record<string, AssetOpacityInfo> = {};
  for (const n of fileNames) {
    if (!n) continue;
    const info = readPngStats(`${dir}/${n}`);
    if (info) out[n] = info;
  }
  return out;
}
