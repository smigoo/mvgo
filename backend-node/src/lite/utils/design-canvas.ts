/**
 * 🛡️ Lite 设计画布尺寸裁定 + 栅格倍率（2026-10-30 治本）
 *
 * 真实病灶：mc-lite-1793331286822-99dd9b08（= c-equipment-monitor-99dd9b08）
 * 「产物所有尺寸 = 原组件一半」。根因不是字号守卫，是**画布口径**：
 *   lite.service.ts 对 sourceType==='screenshot' 无条件 `Math.round(栅格 / 2)`
 *   （HiDPI/Retina 假说），又把**折半后**的宽高当 logicalWidth/Height 回喂
 *   buildAnalysisPrompt 的「尺寸标定铁律」，于是 prompt 输出「2.0 倍导出，
 *   观测像素必须 ÷2」。画布 ÷2 与倍率 ÷2 同源自洽 ⇒ 产物整体恰好缩到一半，
 *   且任何一致性检查都发现不了（两处互相印证）。
 *
 * 铁证（同图两条路径差 2 倍）：
 *   c-123（figma 源，10-20）与 10-30 三个截图产物的源图**逐像素同源**
 *   —— 510×665，PIL diff 仅 0.148%（编码噪声）。
 *   · figma 路径：getNode.absoluteBoundingBox = 510×665（Figma 权威逻辑尺寸）
 *   · screenshot 路径：栅格 ÷2 = 255×333
 *   而 figma 导出已是 `scale: FIGMA_EXPORT_SCALE (=1)`，栅格 510 = 逻辑 510
 *   ⇒ 该截图就是 1x，「2x 假设」越权；`sips` dpiWidth=72、PNG 无 pHYs，
 *   docs / 前端上传页 / 图片元数据三处均无「截图须 2x」契约。
 *
 * 本模块的唯一职责（治本三铁律）：
 *   ① 倍率是**显式输入**（rasterScale），不是对栅格像素的猜测；
 *   ② 画布尺寸与 prompt 换算倍率**由本函数一次派生**（同一个 scale 值），
 *      断掉「画布错 ⇒ 倍率同步错 ⇒ 互相印证」的死循环；
 *   ③ Figma 导出倍率与「图源默认倍率」**共用同一常量**，避免注释与实现再次打架
 *      （ebc7976 把导出 2→1 却漏改截图的 ÷2，就是这么裂开的）。
 */

/** Figma 图片导出的倍率：唯一来源。exportImage 调用与本模块口径必须引用同一常量。 */
export const FIGMA_EXPORT_SCALE = 1;

/**
 * 截图 / HTML 等「图源」的默认栅格倍率。
 * 1 = 设备像素即 CSS px（Figma scale=1 导出图、1x 截图、HTML 渲染图）。
 * 2 = Retina/HiDPI 2x 截图 —— 必须由调用方**显式**给出（dto.rasterScale），不得推断。
 */
export const DEFAULT_RASTER_SCALE = 1;

/** 画布口径来源，用于日志与判据定位（不参与计算）。 */
export type DesignCanvasOrigin =
  | 'preview' // figma：前端确认的节点逻辑尺寸（dto.previewWidth/Height）
  | 'figma-node' // figma：getNode.absoluteBoundingBox
  | 'raster-scale' // 栅格 / rasterScale
  | 'html-raster'; // html 渲染图，恒 1:1

export interface DesignCanvas {
  width: number;
  height: number;
  /** 本画布对应的栅格→CSS 换算倍率；prompt 的尺寸标定必须取同一值。 */
  rasterScale: number;
  origin: DesignCanvasOrigin;
}

export interface ResolveDesignCanvasInput {
  sourceType: string;
  rasterWidth: number;
  rasterHeight: number;
  previewWidth?: number | null;
  previewHeight?: number | null;
  logicalWidth?: number | null;
  logicalHeight?: number | null;
  rasterScale?: number | null;
}

/**
 * 归一化倍率：非有限数 / ≤0 / 非数字一律回退 fallback。
 * 不做「猜」——只做「非法输入的确定性兜底」，保证画布不会因脏字段崩成 NaN。
 */
export function normalizeRasterScale(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * 裁定设计画布尺寸。**画布与倍率同源**：返回值里的 rasterScale 就是该画布
 * 对应的栅格换算倍率，调用方不得另行反推（旧实现 `栅格 / 画布` 即病灶）。
 *
 * 优先级：
 *   figma : previewWidth/Height（前端确认） > absoluteBoundingBox > 栅格 / FIGMA_EXPORT_SCALE
 *   html  : 栅格原尺寸（恒 1:1，不受 rasterScale 影响）
 *   其他  : 栅格 / rasterScale（默认 DEFAULT_RASTER_SCALE = 1）
 */
export function resolveDesignCanvas(input: ResolveDesignCanvasInput): DesignCanvas {
  const { sourceType, rasterWidth, rasterHeight } = input;
  const positive = (v: unknown) => Number.isFinite(Number(v)) && Number(v) > 0;

  if (sourceType === 'figma') {
    const scale = normalizeRasterScale(input.rasterScale, FIGMA_EXPORT_SCALE);
    if (positive(input.previewWidth) && positive(input.previewHeight)) {
      return {
        width: Math.round(Number(input.previewWidth)),
        height: Math.round(Number(input.previewHeight)),
        rasterScale: scale,
        origin: 'preview',
      };
    }
    if (positive(input.logicalWidth) && positive(input.logicalHeight)) {
      return {
        width: Math.round(Number(input.logicalWidth)),
        height: Math.round(Number(input.logicalHeight)),
        rasterScale: scale,
        origin: 'figma-node',
      };
    }
    return {
      width: Math.round(rasterWidth / scale),
      height: Math.round(rasterHeight / scale),
      rasterScale: scale,
      origin: 'raster-scale',
    };
  }

  if (sourceType === 'html') {
    // HTML 渲染图与 CSS 像素恒等，任何倍率声明都不该折它（阴性对照：不得误伤）
    return {
      width: rasterWidth,
      height: rasterHeight,
      rasterScale: 1,
      origin: 'html-raster',
    };
  }

  const scale = normalizeRasterScale(input.rasterScale, DEFAULT_RASTER_SCALE);
  return {
    width: Math.round(rasterWidth / scale),
    height: Math.round(rasterHeight / scale),
    rasterScale: scale,
    origin: 'raster-scale',
  };
}

/**
 * 画布与栅格是否自洽：`栅格 / 画布` 应等于声明的 rasterScale。
 * 不自洽说明「画布口径」与「倍率口径」被两处独立推导（历史病灶的形态），
 * 调用方须告警而非静默——这正是旧实现「永远发现不了」的那个缺口。
 */
export function isCanvasScaleConsistent(
  canvas: Pick<DesignCanvas, 'width' | 'rasterScale'>,
  rasterWidth: number,
  tolerance = 0.05,
): boolean {
  if (!Number.isFinite(canvas.width) || canvas.width <= 0) return false;
  const observed = rasterWidth / canvas.width;
  return Math.abs(observed - canvas.rasterScale) <= tolerance;
}
