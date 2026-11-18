/**
 * cheap-shot-probe.js — 中间轮「廉价截图 + 像素探针」（步骤 2 · 二级校验）
 *
 * 职责（管线中段，绕开 Vision 的确定性便宜探针）：
 *   1. 依赖注入调用方已有的 renderScreenshot（**不 import screenshot-renderer.js**——
 *      该文件在他人 WIP 名单且带 Puppeteer 重依赖，import 会污染/拖垮 spec）
 *   2. 对渲染截图做 sharp 像素探针，只产事实：空白 / 超高 / 纵横比异常
 *   3. 恒打一行计数日志供真机核对（判据必挂真机日志计数行纪律）
 *
 * 判据红线：
 *   - 零 Vision、零 LLM、零重试驱动——观察模式首期**只记录不阻断**
 *   - 结果挂独立字段 cheapShotProbe，**绝不写回 state.renderedImage / state._screenshotPromise**
 *     （否则下游 visual-comparator 会误触发完整 Vision 比对，回到 ~3min 贵路径）
 *   - best-effort：任何失败返回 { probed:0, reason }，绝不抛异常打断管线
 *
 * 消费者：
 *   - graphs/mc-component-graph-phase2.js 中间轮分支（mc-max）
 *   - graphs/mc-component-graph-vue3.js Vision 门前（vue3-max，落点不同但同效果）
 *
 * 环境开关：
 *   - MVGO_CHEAP_SHOT=0 关闭（默认开启，观察模式）
 *   - MVGO_CHEAP_SHOT_MAX_HEIGHT px（默认 1400，超过判超高）
 *   - MVGO_CHEAP_SHOT_MIN_RATIO / MAX_RATIO 纵横比容忍区间（默认 0.3~4）
 */

import { existsSync } from 'node:fs'
import sharp from 'sharp' // 顶层静态导入（步骤 1 已实证 jest CJS 下动态 import 会被吞）

export const CHEAP_SHOT_DEFAULTS = Object.freeze({
  enabled: process.env.MVGO_CHEAP_SHOT !== '0',
  maxHeight: Number(process.env.MVGO_CHEAP_SHOT_MAX_HEIGHT) || 1400,
  minRatio: Number(process.env.MVGO_CHEAP_SHOT_MIN_RATIO) || 0.3,
  maxRatio: Number(process.env.MVGO_CHEAP_SHOT_MAX_RATIO) || 4,
  blankVarianceThreshold: 2, // 与 screenshot-renderer.js#analyzeScreenshotPixels 同口径
  blankNonWhiteThreshold: 0.005,
})

/**
 * 对单张渲染截图做确定性像素探针（纯函数，零外部依赖，阴阳对照可直接测）
 *
 * @param {string} imagePath
 * @param {object} [cfg] - 覆盖阈值（测试用）
 * @returns {Promise<{
 *   probed: 0|1, reason?: string,
 *   blank?: boolean, variance?: number, nonWhiteRatio?: number,
 *   width?: number, height?: number, aspectRatio?: number,
 *   tooTall?: boolean, aspectAbnormal?: boolean,
 *   signals?: string[],
 * }>}
 */
export async function analyzeCheapPixels(imagePath, cfg = {}) {
  const {
    maxHeight,
    minRatio,
    maxRatio,
    blankVarianceThreshold,
    blankNonWhiteThreshold,
  } = { ...CHEAP_SHOT_DEFAULTS, ...cfg }
  if (!imagePath || !existsSync(imagePath)) {
    return { probed: 0, reason: 'image-not-found' }
  }
  try {
    // 原图尺寸单独取（resize 后的 info 是 160px 缩略图，拿它判 too-tall 会永远不触发）
    const rawMeta = await sharp(imagePath).metadata();
    const rawWidth = rawMeta.width || 0;
    const rawHeight = rawMeta.height || 0;

    const { data, info } = await sharp(imagePath)
      .removeAlpha()
      .resize({ width: 160, height: 160, fit: 'inside', withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true })

    const pixelCount = info.width * info.height
    if (!pixelCount) {
      return { probed: 0, reason: 'empty-image' }
    }

    let sum = 0
    let sumSquares = 0
    let nonWhitePixels = 0
    for (let offset = 0; offset < data.length; offset += info.channels) {
      const r = data[offset]
      const g = data[offset + 1]
      const b = data[offset + 2]
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
      sum += luminance
      sumSquares += luminance * luminance
      if (r < 248 || g < 248 || b < 248) nonWhitePixels += 1
    }
    const mean = sum / pixelCount
    const variance = Math.max(0, sumSquares / pixelCount - mean * mean)
    const nonWhiteRatio = nonWhitePixels / pixelCount
    const blank = variance < blankVarianceThreshold && nonWhiteRatio < blankNonWhiteThreshold

    // 🛡️ 尺寸/纵横比判据一律用**原图** metadata（缩略图 info 被 resize 压缩，判不出超高）
    const tooTall = rawHeight > maxHeight
    const aspectRatio = rawHeight > 0 ? Number((rawWidth / rawHeight).toFixed(4)) : 0
    const aspectAbnormal = aspectRatio > 0 && (aspectRatio < minRatio || aspectRatio > maxRatio)

    const signals = []
    if (blank) signals.push('blank')
    if (tooTall) signals.push('too-tall')
    if (aspectAbnormal) signals.push('aspect-abnormal')

    return {
      probed: 1,
      blank,
      variance: Number(variance.toFixed(2)),
      nonWhiteRatio: Number(nonWhiteRatio.toFixed(4)),
      width: rawWidth,
      height: rawHeight,
      aspectRatio,
      tooTall,
      aspectAbnormal,
      signals,
    }
  } catch (error) {
    return { probed: 0, reason: `analysis-error:${error.message}` }
  }
}

/**
 * 廉价截图探针主入口（观察模式，只记录不阻断）
 *
 * @param {{
 *   renderScreenshot: Function,   // 调用方注入的现成渲染器（本模块不 import 它）
 *   renderParams: object,         // 原样透传给 renderScreenshot
 *   logger?: object,              // 计数日志出口（可选）
 *   tag?: string,                 // 轮次/图别标记，进日志
 *   cfg?: object,                 // 阈值覆盖（测试用）
 * }} params
 * @returns {Promise<{ probed:0|1, reason?:string, signals?:string[], renderedImage?:string }>}
 *   ⚠️ 返回值只含事实与截图路径；**调用方不得把 renderedImage 写回 state.renderedImage**
 */
export async function probeCheapShot({
  renderScreenshot,
  renderParams,
  logger,
  tag = '',
  cfg = {},
} = {}) {
  if (!CHEAP_SHOT_DEFAULTS.enabled) {
    logger?.info?.(`[cheap-shot] probed=0,reason=disabled-by-env,tag=${tag}`)
    return { probed: 0, reason: 'disabled-by-env' }
  }
  if (typeof renderScreenshot !== 'function' || !renderParams?.outputPath) {
    logger?.info?.(`[cheap-shot] probed=0,reason=missing-params,tag=${tag}`)
    return { probed: 0, reason: 'missing-params' }
  }

  let renderedImage = null
  try {
    const result = await renderScreenshot(renderParams)
    renderedImage = result?.renderedImage || null
  } catch (error) {
    logger?.info?.(`[cheap-shot] probed=0,reason=render-failed,tag=${tag},error=${error.message}`)
    return { probed: 0, reason: `render-failed:${error.message}` }
  }
  if (!renderedImage) {
    logger?.info?.(`[cheap-shot] probed=0,reason=no-rendered-image,tag=${tag}`)
    return { probed: 0, reason: 'no-rendered-image' }
  }

  const analysis = await analyzeCheapPixels(renderedImage, cfg)
  const signals = analysis.signals || []
  // 恒打计数行（真机日志锚）：无论阳性阴性必有一行，判据不靠状态单证
  logger?.info?.(
    `[cheap-shot] probed=${analysis.probed},signals=${signals.join('|') || 'none'},` +
      `blank=${analysis.blank},tooTall=${analysis.tooTall},aspect=${analysis.aspectRatio},` +
      `variance=${analysis.variance},nonWhite=${analysis.nonWhiteRatio},tag=${tag}`,
  )
  return {
    ...analysis,
    renderedImage, // 仅事实透出供落盘核对；调用方禁止写回 state.renderedImage
  }
}

/**
 * 把探针结果格式化为 refiner 可读的纯文本（无信号返回空串，观察模式首期不进 prompt）
 * @returns {string}
 */
export function formatCheapShotForRefiner(probe) {
  if (!probe || probe.probed !== 1 || !Array.isArray(probe.signals) || probe.signals.length === 0) {
    return ''
  }
  const lines = ['### 中间轮渲染探针（确定性像素检查，非模型输出）']
  if (probe.blank) lines.push('- 截图疑似空白（方差与非白像素占比均低于阈值），检查产物是否未挂载')
  if (probe.tooTall) lines.push(`- 截图高度 ${probe.height}px 超出 ${CHEAP_SHOT_DEFAULTS.maxHeight}px，警惕 flex 塌缩/死白`)
  if (probe.aspectAbnormal) lines.push(`- 纵横比 ${probe.aspectRatio} 超出 [${CHEAP_SHOT_DEFAULTS.minRatio}, ${CHEAP_SHOT_DEFAULTS.maxRatio}]，警惕布局异常`)
  return lines.join('\n')
}
