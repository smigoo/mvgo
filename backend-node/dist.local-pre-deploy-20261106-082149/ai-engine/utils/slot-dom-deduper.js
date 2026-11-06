/**
 * 🛡️ Loop 2.1.D（2026-09-10）：重叠删 DOM（不只删合约）。
 *
 * 旧行为：T09 在契约层（headerSlots 数组）剔除与子组件重叠的 slot，但 LLM/缓存恢复的
 * <template #header-right> DOM 仍留在主组件里 → 子组件已渲染 + 主组件又挂一次 → 双份渲染。
 * P5 已做文本重叠 DOM 清理，但只在 T09 注入内部；本模块把「按 node 去重删 DOM」独立成纯函数，
 * 供 2.1.C 互斥裁决（resolveNodeExclusivity 只动契约与 sections）之后、T09 注入之前统一执行。
 *
 * 规则：
 *   - 仅当存在 <base-panel> 宿主时生效（无宿主不处理）。
 *   - 对每个 header/title slot 模板：内部非注释文本与 subcomponentTexts 重叠 → 整段移除模板。
 *   - 空/仅注释插槽 → 保留（只清重叠内容，不误删结构）。
 *
 * 纯函数、零依赖、无 import.meta，便于 jest 单测；返回新字符串，不修改入参。
 *
 * @param {string} code - 组件源码（SFC 字符串）
 * @param {Object} opts
 * @param {Set<string>} opts.subcomponentTexts - 子组件已渲染的文本内容集合
 * @returns {{code:string, removed:number}}
 */
function extractTextFragments(content) {
  if (!content || typeof content !== 'string') return [];
  // 先剥 HTML 标签与插值花括号，只留可读文本（<span>当日总流量</span> → 当日总流量）
  const textOnly = content
    .replace(/<[^>]*>/g, ' ')
    .replace(/[{}]/g, ' ')
    .trim();
  if (!textOnly) return [];
  const fragments = []
  if (textOnly.length >= 2) fragments.push(textOnly)
  const words = textOnly
    .split(/[\s,，。.;；:：!！?？]+/)
    .filter((w) => w.length >= 2)
  fragments.push(...words)
  const numbers = textOnly.match(/\d{2,}/g)
  if (numbers) fragments.push(...numbers)
  return Array.from(new Set(fragments))
}

const SLOT_TYPES = ['header-right', 'title-left', 'title-right']

export function removeOverlappingSlotDom(code, opts = {}) {
  if (!code || typeof code !== 'string') return { code, removed: 0 }
  if (!/<base-panel/i.test(code)) return { code, removed: 0 }
  const subcomponentTexts = opts.subcomponentTexts instanceof Set ? opts.subcomponentTexts : new Set()

  let removed = 0
  let out = code
  for (const st of SLOT_TYPES) {
    const tmplRe = new RegExp(`<template\\s+#${st}\\s*>([\\s\\S]*?)</template>`, 'gi')
    out = out.replace(tmplRe, (match, inner) => {
      const cleanInner = inner.replace(/<!--[\s\S]*?-->/g, '').trim()
      if (!cleanInner) return match // 空/仅注释插槽 → 保留
      const fragments = extractTextFragments(cleanInner)
      for (const frag of fragments) {
        if (subcomponentTexts.has(frag)) {
          removed += 1
          return '' // 重叠 → 整段移除
        }
      }
      return match
    })
  }
  return { code: out, removed }
}
