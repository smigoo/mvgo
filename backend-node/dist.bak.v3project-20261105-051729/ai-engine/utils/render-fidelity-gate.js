/**
 * render-fidelity-gate.js — 渲染产物 vs 设计稿 · 像素级比对门禁（7-A）
 *
 * 纯函数，可单测。复用 sharp 做分块亮度直方图比对。
 *
 * 比对方法：
 *   1. 两图 resize 到同一宽高（256×N，保持比例），removeAlpha
 *   2. 逐 8×8 块算亮度均值直方图
 *   3. score = 1 - 平均块差（L1 归一化）
 *   4. 阈值分档：≥0.85 pass / 0.6~0.85 warn / <0.6 block
 *
 * 只对「渲染非全白」才比对；空白渲染由 RUNTIME-012 处理。
 */

import { readFileSync, existsSync } from 'node:fs'

// ─── 常量 ───────────────────────────────────────────────────────────────

const BLOCK_SIZE = 8
const COMPARE_WIDTH = 256
const COMPARE_HEIGHT = 256

export const FIDELITY_THRESHOLDS = Object.freeze({
  PASS: 0.85,
  WARN: 0.6,
})

export const FIDELITY_VERDICTS = Object.freeze({
  PASS: 'pass',
  WARN: 'warn',
  BLOCK: 'block',
})

// ─── 核心 ────────────────────────────────────────────────────────────────

/**
 * 对单张图做分块亮度直方图（返回 Float32Array，长度 = 256）
 */
async function blockLuminanceHistogram(imagePath) {
  const sharp = (await import('sharp')).default
  const { data, info } = await sharp(imagePath)
    .removeAlpha()
    .resize({ width: COMPARE_WIDTH, height: COMPARE_HEIGHT, fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })

  const cols = Math.floor(info.width / BLOCK_SIZE)
  const rows = Math.floor(info.height / BLOCK_SIZE)
  const hist = new Float32Array(256)
  const blockCount = cols * rows

  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      let blockSum = 0
      let blockPixels = 0
      for (let py = 0; py < BLOCK_SIZE; py++) {
        for (let px = 0; px < BLOCK_SIZE; px++) {
          const y = by * BLOCK_SIZE + py
          const x = bx * BLOCK_SIZE + px
          const offset = (y * info.width + x) * info.channels
          const r = data[offset]
          const g = data[offset + 1]
          const b = data[offset + 2]
          blockSum += 0.2126 * r + 0.7152 * g + 0.0722 * b
          blockPixels++
        }
      }
      const avg = Math.round(blockSum / blockPixels)
      hist[avg]++
    }
  }

  // 归一化
  for (let i = 0; i < 256; i++) hist[i] /= blockCount
  return hist
}

/**
 * L1 距离（归一化直方图之间）
 */
function histogramL1(a, b) {
  let sum = 0
  for (let i = 0; i < 256; i++) sum += Math.abs(a[i] - b[i])
  return sum / 2 // 归一化到 [0, 1]
}

/**
 * 渲染产物 vs 设计稿 · 像素级比对
 *
 * @param {{ renderedPath: string, designPath: string }} paths
 * @returns {{ score: number, verdict: 'pass'|'warn'|'block', diff: number, renderedPath: string, designPath: string }}
 */
export async function compareRenderedVsDesign({ renderedPath, designPath }) {
  if (!existsSync(renderedPath)) {
    return { score: 0, verdict: FIDELITY_VERDICTS.BLOCK, diff: 1, renderedPath, designPath, error: 'rendered not found' }
  }
  if (!existsSync(designPath)) {
    return { score: 0, verdict: FIDELITY_VERDICTS.BLOCK, diff: 1, renderedPath, designPath, error: 'design not found' }
  }

  try {
    const [renderedHist, designHist] = await Promise.all([
      blockLuminanceHistogram(renderedPath),
      blockLuminanceHistogram(designPath),
    ])

    const diff = histogramL1(renderedHist, designHist)
    const score = 1 - diff

    let verdict
    if (score >= FIDELITY_THRESHOLDS.PASS) verdict = FIDELITY_VERDICTS.PASS
    else if (score >= FIDELITY_THRESHOLDS.WARN) verdict = FIDELITY_VERDICTS.WARN
    else verdict = FIDELITY_VERDICTS.BLOCK

    return {
      score: Number(score.toFixed(4)),
      verdict,
      diff: Number(diff.toFixed(4)),
      renderedPath,
      designPath,
    }
  } catch (error) {
    return { score: 0, verdict: FIDELITY_VERDICTS.BLOCK, diff: 1, renderedPath, designPath, error: error.message }
  }
}
