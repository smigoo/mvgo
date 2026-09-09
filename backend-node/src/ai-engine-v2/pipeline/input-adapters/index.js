/**
 * 输入适配器 —— 把不同来源归一到同一份 IR，交给下游共享 DAG
 *
 * 这是「1 个管线而非 2 个」的支点：
 *   截图  → ScreenshotAdapter ─┐
 *                              ├─→ 统一 IR ─→ 同一套 spec 敏感节点
 *   Figma → FigmaAdapter     ─┘
 *
 * 下游 code-engineer / refiners / adv-checker 只与 spec 有关、与来源无关，
 * 所以来源差异必须在此处被完全吸收，不允许泄漏到下游节点。
 *
 * IR 契约（适配器必须产出的字段）：
 *   sourceType    'screenshot' | 'figma'
 *   imagePath     本地图片路径（视觉分析输入）
 *   imageBase64   图片 base64（可选，二选一即可）
 *   figmaData     Figma 节点树（仅 figma 来源，截图来源为 null）
 *   componentName 组件名
 *   meta          来源侧信息，仅用于日志与产物标注，下游不得依赖
 */

import { screenshotAdapter } from './screenshot-adapter.js'
import { figmaAdapter } from './figma-adapter.js'

export const INPUT_ADAPTERS = {
  screenshot: screenshotAdapter,
  figma: figmaAdapter
}

export const SUPPORTED_SOURCE_TYPES = Object.keys(INPUT_ADAPTERS)

export function resolveInputAdapter(sourceType) {
  const adapter = INPUT_ADAPTERS[sourceType]
  if (!adapter) {
    throw new Error(
      `不支持的输入源 "${sourceType}"，可用：${SUPPORTED_SOURCE_TYPES.join(', ')}`
    )
  }
  return adapter
}

/** IR 契约校验：适配器输出必须满足下游最低要求 */
export function validateIR(ir, sourceType) {
  const errors = []
  if (!ir.imagePath && !ir.imageBase64) {
    errors.push('缺少 imagePath 或 imageBase64（视觉分析无输入）')
  }
  if (sourceType === 'figma' && !ir.figmaData) {
    errors.push('figma 来源必须产出 figmaData')
  }
  if (errors.length) {
    throw new Error(`输入适配器 "${sourceType}" 产出的 IR 不合契约：\n  - ${errors.join('\n  - ')}`)
  }
  return true
}

export default { INPUT_ADAPTERS, SUPPORTED_SOURCE_TYPES, resolveInputAdapter, validateIR }
