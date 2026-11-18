/**
 * crop-diff-regions.js — Figma 原图 vs 渲染截图 · 确定性差异区域定位与裁剪
 *
 * 职责（三级校验「截图回灌」步骤 1 · 纯文本三件套的定位件）：
 *   1. 对两张图做分块亮度直方图对比（与 render-fidelity-gate.js 同款 sharp 分块思路，
 *      但输出「分块差异网格」而非单一 score）
 *   2. 将超阈值差异块做连通聚类，产出 region bbox（归一化坐标）
 *   3. 按 bbox 从**渲染截图**裁出差异区域小图落盘（供人工审查 / 后续多模态消费）
 *
 * 判据红线：
 *   - 纯确定性、零 LLM、零 Vision 调用；只产事实（bbox/小图路径/差异比例），不做任何判定
 *   - 坐标基于**归一化比例**（0~1），与原图/截图分辨率解耦（两图尺寸可能不同：
 *     Figma 原图是设计分辨率、截图是 viewport 分辨率，先各自 flatten+resize 到
 *     COMPARE 尺寸再比对，bbox 再映射回渲染截图的真实像素坐标用于裁剪）
 *   - 任何失败（文件缺失/sharp 异常）返回 { evaluated: 0, reason } —— best-effort，
 *     绝不抛异常打断管线（与 chunk-snapshot-pusher 同款非阻断纪律）
 *
 * 消费者：
 *   - roles/visual-comparator.js#formatForRefiner（步骤 1 回灌：bbox 坐标 + 小图路径）
 *   - 后续多模态模型/人工审查（读取裁剪小图）
 *
 * 环境开关：
 *   - MVGO_DIFF_CROP_ENABLED=0 关闭（默认开启，成本 ~2 次 sharp resize，毫秒级）
 *   - MVGO_DIFF_CROP_MAX_REGIONS 上限（默认 5，防止噪点图产出海量小图）
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp' // 顶层静态导入（与 vision-agent.js 同款；jest CJS 环境动态 import 会被吞成失败）

// ─── 常量（单一事实源，消费者不得复制） ──────────────────────────────

const BLOCK = 16 // 比对块边长（在 COMPARE 网格坐标系下）
const COMPARE = 256 // 两图统一 resize 到的比对尺寸
const DIFF_BLOCK_THRESHOLD = 0.18 // 块级 L1 亮度差超过此值算「差异块」（经验值，观察模式首期只记录）
const MIN_CLUSTER_BLOCKS = 2 // 聚类最少块数：单块噪声不成 region
const MERGE_GAP = 1 // 聚类合并间隙（块坐标下相邻/相隔 1 块内都并入同一 region）

export const DIFF_CROP_DEFAULTS = Object.freeze({
  maxRegions: Number(process.env.MVGO_DIFF_CROP_MAX_REGIONS) || 5,
  enabled: process.env.MVGO_DIFF_CROP_ENABLED !== '0',
})

// ─── 内部：分块亮度网格 ──────────────────────────────────────────────

/**
 * 对单张图产出 16×16 块级亮度均值网格（COMPARE/BLOCK = 16 → 16×16 = 256 块）
 * @returns {Promise<{ grid: Float32Array, size: number } | null>} null = 读取失败
 */
async function blockLuminanceGrid(imagePath) {
  if (!imagePath || !existsSync(imagePath)) return null
  try {
    const { data, info } = await sharp(imagePath)
      .flatten({ background: '#ffffff' }) // 与 render-fidelity-gate.js 同口径（alpha 合成白底）
      .resize({ width: COMPARE, height: COMPARE, fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true })

    const gridDim = COMPARE / BLOCK // 16
    const grid = new Float32Array(gridDim * gridDim)

    for (let by = 0; by < gridDim; by++) {
      for (let bx = 0; bx < gridDim; bx++) {
        let sum = 0
        let count = 0
        for (let py = 0; py < BLOCK; py++) {
          for (let px = 0; px < BLOCK; px++) {
            const y = by * BLOCK + py
            const x = bx * BLOCK + px
            const offset = (y * info.width + x) * info.channels
            sum += 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2]
            count++
          }
        }
        grid[by * gridDim + bx] = sum / count
      }
    }
    return { grid, size: gridDim }
  } catch (error) {
    return null
  }
}

// ─── 内部：差异块连通聚类 → region bbox ─────────────────────────────

/**
 * 将差异块网格做 4-连通聚类（BFS），合并 MERGE_GAP 内的近邻块
 * @param {boolean[]} diffMask - gridDim² 布尔掩码
 * @param {number} gridDim
 * @returns {Array<{ bx0,by0,bx1,by1,blocks }>} 块坐标 bbox（含端点）
 */
function clusterDiffBlocks(diffMask, gridDim) {
  const visited = new Uint8Array(diffMask.length)
  const regions = []

  for (let i = 0; i < diffMask.length; i++) {
    if (!diffMask[i] || visited[i]) continue
    // BFS 收集连通块
    const queue = [i]
    visited[i] = 1
    const members = []
    while (queue.length > 0) {
      const cur = queue.shift()
      members.push(cur)
      const cx = cur % gridDim
      const cy = Math.floor(cur / gridDim)
      // 4-邻接 + 对角（8-连通，容忍 MERGE_GAP=1 的近邻由下方 bbox 合并兜）
      for (let dy = -MERGE_GAP; dy <= MERGE_GAP; dy++) {
        for (let dx = -MERGE_GAP; dx <= MERGE_GAP; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = cx + dx
          const ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= gridDim || ny >= gridDim) continue
          const ni = ny * gridDim + nx
          if (diffMask[ni] && !visited[ni]) {
            visited[ni] = 1
            queue.push(ni)
          }
        }
      }
    }
    if (members.length < MIN_CLUSTER_BLOCKS) continue
    // 求块坐标 bbox
    let bx0 = gridDim, by0 = gridDim, bx1 = 0, by1 = 0
    for (const m of members) {
      const mx = m % gridDim
      const my = Math.floor(m / gridDim)
      if (mx < bx0) bx0 = mx
      if (my < by0) by0 = my
      if (mx > bx1) bx1 = mx
      if (my > by1) by1 = my
    }
    regions.push({ bx0, by0, bx1, by1, blocks: members.length })
  }

  // 按差异块数降序：最大的差异区域排前面
  regions.sort((a, b) => b.blocks - a.blocks)
  return regions
}

// ─── 内部：按归一化 bbox 裁剪渲染截图 ───────────────────────────────

/**
 * 从渲染截图裁出 bbox 区域小图并落盘
 * @returns {Promise<{ path: string, bytes: number } | null>}
 */
async function cropRegion(region, renderedPath, outDir, index, actualSize) {
  try {
    // 块坐标 → 归一化 → 渲染截图真实像素坐标
    const x = Math.max(0, Math.floor((region.bx0 * BLOCK / COMPARE) * actualSize.width))
    const y = Math.max(0, Math.floor((region.by0 * BLOCK / COMPARE) * actualSize.height))
    const x1 = Math.min(actualSize.width, Math.ceil(((region.bx1 + 1) * BLOCK / COMPARE) * actualSize.width))
    const y1 = Math.min(actualSize.height, Math.ceil(((region.by1 + 1) * BLOCK / COMPARE) * actualSize.height))
    const width = x1 - x
    const height = y1 - y
    if (width <= 0 || height <= 0) return null

    const outPath = join(outDir, `diff-region-${index + 1}.png`)
    const buf = await sharp(renderedPath)
      .extract({ left: x, top: y, width, height })
      .png()
      .toBuffer()
    mkdirSync(outDir, { recursive: true })
    writeFileSync(outPath, buf)
    return { path: outPath, bytes: buf.length }
  } catch (error) {
    return null
  }
}

// ─── 对外主入口 ──────────────────────────────────────────────────────

/**
 * 定位 Figma 原图 vs 渲染截图的差异区域，裁剪落盘
 *
 * @param {{ figmaImagePath: string, renderedImagePath: string, outDir: string, maxRegions?: number }} params
 * @returns {Promise<{
 *   evaluated: 0|1,
 *   reason?: string,
 *   diffBlockRatio?: number,       // 差异块占全网格比例（0~1，观察指标）
 *   regions?: Array<{
 *     index: number,
 *     bboxNorm: { x, y, w, h },    // 归一化 0~1（相对整图）
 *     bboxPx: { x, y, w, h },      // 渲染截图像素坐标
 *     diffBlocks: number,
 *     cropPath?: string,           // 裁剪小图落盘路径（供人工/多模态消费）
 *     cropBytes?: number
 *   }>
 *   meta?: { gridDim: number, blockThreshold: number }
 * }}
 */
export async function locateDiffRegions({ figmaImagePath, renderedImagePath, outDir, maxRegions } = {}) {
  if (!DIFF_CROP_DEFAULTS.enabled) {
    return { evaluated: 0, reason: 'disabled-by-env' }
  }
  if (!figmaImagePath || !renderedImagePath || !outDir) {
    return { evaluated: 0, reason: 'missing-params' }
  }
  if (!existsSync(figmaImagePath) || !existsSync(renderedImagePath)) {
    return { evaluated: 0, reason: 'image-not-found' }
  }

  const [figma, rendered] = await Promise.all([
    blockLuminanceGrid(figmaImagePath),
    blockLuminanceGrid(renderedImagePath),
  ])
  if (!figma || !rendered) {
    return { evaluated: 0, reason: 'image-read-failed' }
  }

  const gridDim = figma.size
  const diffMask = new Array(gridDim * gridDim).fill(false)
  let diffCount = 0
  for (let i = 0; i < gridDim * gridDim; i++) {
    const l1 = Math.abs(figma.grid[i] - rendered.grid[i]) / 255
    if (l1 > DIFF_BLOCK_THRESHOLD) {
      diffMask[i] = true
      diffCount++
    }
  }

  const diffBlockRatio = diffCount / (gridDim * gridDim)
  // 差异块占比过小 = 两图基本一致；过大 = 结构性不同（如空截图/完全不同组件）——
  // 两种极端都不裁剪（裁了也没信息量），只报 ratio 供观察。
  if (diffCount === 0 || diffBlockRatio > 0.6) {
    return { evaluated: 1, diffBlockRatio: Number(diffBlockRatio.toFixed(4)), regions: [] }
  }

  const clustered = clusterDiffBlocks(diffMask, gridDim)
  const capped = clustered.slice(0, maxRegions || DIFF_CROP_DEFAULTS.maxRegions)

  // 读取渲染截图真实尺寸，用于 bboxPx 换算与裁剪
  let actualSize = { width: 0, height: 0 }
  try {
    const meta = await sharp(renderedImagePath).metadata()
    actualSize = { width: meta.width || 0, height: meta.height || 0 }
  } catch (error) {
    return { evaluated: 0, reason: 'metadata-failed' }
  }
  if (!actualSize.width || !actualSize.height) {
    return { evaluated: 0, reason: 'metadata-missing' }
  }

  const regions = []
  for (let i = 0; i < capped.length; i++) {
    const r = capped[i]
    const norm = {
      x: Number((r.bx0 * BLOCK / COMPARE).toFixed(4)),
      y: Number((r.by0 * BLOCK / COMPARE).toFixed(4)),
      w: Number(((r.bx1 - r.bx0 + 1) * BLOCK / COMPARE).toFixed(4)),
      h: Number(((r.by1 - r.by0 + 1) * BLOCK / COMPARE).toFixed(4)),
    }
    const px = {
      x: Math.round(norm.x * actualSize.width),
      y: Math.round(norm.y * actualSize.height),
      w: Math.round(norm.w * actualSize.width),
      h: Math.round(norm.h * actualSize.height),
    }
    const crop = await cropRegion(r, renderedImagePath, outDir, i, actualSize)
    regions.push({
      index: i + 1,
      bboxNorm: norm,
      bboxPx: px,
      diffBlocks: r.blocks,
      ...(crop ? { cropPath: crop.path, cropBytes: crop.bytes } : {}),
    })
  }

  return {
    evaluated: 1,
    diffBlockRatio: Number(diffBlockRatio.toFixed(4)),
    regions,
    meta: { gridDim, blockThreshold: DIFF_BLOCK_THRESHOLD },
  }
}

/**
 * 把 locateDiffRegions 结果格式化为 refiner 可读的纯文本段（无内容差异时返回空串）
 * 供 formatForRefiner 三件套的第 ② 件（bbox 坐标）与第 ① 件（小图路径）复用。
 * @returns {string} 空串 = 无差异区域可报告
 */
export function formatDiffRegionsForRefiner(diffResult) {
  if (!diffResult || diffResult.evaluated !== 1 || !Array.isArray(diffResult.regions) || diffResult.regions.length === 0) {
    return ''
  }
  const lines = [
    '### 像素级差异区域定位（确定性分块比对，非模型输出）',
    `全图差异块占比: ${((diffResult.diffBlockRatio ?? 0) * 100).toFixed(1)}%（diffBlockRatio）`,
    '',
  ]
  for (const r of diffResult.regions) {
    const { bboxNorm, bboxPx, diffBlocks, cropPath } = r
    const pct = (v) => `${(v * 100).toFixed(1)}%`
    lines.push(
      `- 区域${r.index}: 归一化 bbox x=${pct(bboxNorm.x)} y=${pct(bboxNorm.y)} w=${pct(bboxNorm.w)} h=${pct(bboxNorm.h)} ` +
        `| 渲染图像素 bbox x=${bboxPx.x} y=${bboxPx.y} w=${bboxPx.w} h=${bboxPx.h} ` +
        `| 差异块数=${diffBlocks}` +
        (cropPath ? ` | 差异区域截图已存: ${cropPath}` : ' | (裁剪失败，仅坐标)'),
    )
  }
  lines.push('')
  lines.push('（bbox 为该区域内像素差异集中的位置，供对照代码时定位 DOM 区域；截图文件供人工核对）')
  return lines.join('\n')
}
