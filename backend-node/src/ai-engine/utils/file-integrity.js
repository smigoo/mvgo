/**
 * 文件写盘完整性校验（单一真相源）
 *
 * 用途：所有「生成 / refiner 写盘」路径在 writeFileSync 之前统一调用本函数，
 * 拦截被 LLM / 截断破坏的文件，避免坏文件落入临时目录与 workspace，
 * 导致前端编译报错或反复重试（如 48 分钟跑空、LESS 截断）。
 *
 * 设计原则（与历史约定一致）：
 *   - 仅做 skip + warn，不 throw（不阻塞 refiner 流水线，坏文件留待上游补）。
 *   - 覆盖 .vue / .less / .css / .json 四类关键产物。
 *
 * 历史问题：
 *   - 微码 common.less 被 refiner 截断到 96 行（open 16 / close 15），旧校验只在
 *     初始生成阶段跑，三个 refiner 写 .less 时完全无括号/注释平衡检查 → 漏网。
 *   - 本文件把校验集中到一处，初始生成与所有 refiner 共用，消除「阶段间漂移」。
 */

import { validateVueSFCCompleteness } from './sfc-validation.js'

/**
 * 校验单文件内容完整性。
 * @param {string} content 待写盘内容
 * @param {string} relativePath 相对组件根目录的路径（如 resources/styles/common.less）
 * @returns {{ complete: boolean, reason?: string }}
 */
export function checkFileIntegrity(content, relativePath) {
  if (!content || typeof content !== 'string') return { complete: true }

  // ── .vue / .jsx：SFC 闭合校验 ──
  if (relativePath.endsWith('.vue') || relativePath.endsWith('.jsx')) {
    const r = validateVueSFCCompleteness(content, relativePath)
    if (!r.complete) {
      return { complete: false, reason: r.detail || 'SFC 不完整（缺闭合标签）' }
    }
    return { complete: true }
  }

  // ── .less / .css：大括号 + 注释块平衡（截断最易发生在此两类）──
  if (relativePath.endsWith('.less') || relativePath.endsWith('.css')) {
    const openBraces = (content.match(/{/g) || []).length
    const closeBraces = (content.match(/}/g) || []).length
    if (openBraces !== closeBraces) {
      return {
        complete: false,
        reason: `大括号不匹配（{=${openBraces} }=${closeBraces}），可能被截断`,
      }
    }
    const openComment = (content.match(/\/\*/g) || []).length
    const closeComment = (content.match(/\*\//g) || []).length
    if (openComment !== closeComment) {
      return {
        complete: false,
        reason: `注释块不匹配（/*=${openComment} */=${closeComment}），可能被截断`,
      }
    }
    return { complete: true }
  }

  // ── .json：合法 JSON ──
  if (relativePath.endsWith('.json')) {
    try {
      JSON.parse(content)
    } catch (e) {
      return { complete: false, reason: `JSON 解析失败（可能被截断）: ${e.message.substring(0, 80)}` }
    }
    return { complete: true }
  }

  return { complete: true }
}
