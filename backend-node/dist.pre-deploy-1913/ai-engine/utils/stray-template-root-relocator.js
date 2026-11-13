/**
 * 🛡️ R10（2026-11-09 · loop-verify R10 轮）：**template 根游离元素归位**。
 *
 * ── 病灶（重点车辆监测 11bd56c1 真机实锤）────────────────────────────────────
 * index.vue 的 `<template>` 根下第一个子元素是 tabs 块（div.c-…-slot-con-tabs，
 * 含 v-for/@click/activeTab），写在 `<base-panel>` 开标签**之前**——游离于宿主外。
 * 浏览器/Vue 容错后 tabs 渲染到 panel 外部悬空，`ListSection` 还用 margin-top:34px
 * 硬补 tabs 高度 ⇒ 双 tab 渲染路径并存（游离块 + TabsSection 组件都在）。
 *
 * ── 来源判定 ────────────────────────────────────────────────────────────────
 * 游离块引用 index 自身 script 的 tabs/activeTab/handleTabChange（ref 声明在 index）
 * ⇒ 是 **LLM 生成本体**（非 T09 注入错位——T09 不写 ref 数据到 index script）。
 *
 * ── 治本（归位而非判死）──────────────────────────────────────────────────────
 * 判死 ⇒ 随机层重试大概率同错。Vue 3 template 允许多根，但微码宿主契约要求
 * `<base-panel>` 是唯一根容器（prompt 已约束「不要在 base-panel 外生成内容」）。
 * 归位 = 把 base-panel 之前的游离顶层元素移入 base-panel **默认插槽首部**
 * （语义等价于 LLM 本意「tab 行在面板内容顶部」），并保持其余结构零改动。
 *
 * 边界（宁缺勿错）：
 *  - 仅当 template 存在 `<base-panel` 开标签且其前存在**游离顶层元素**才触发；
 *  - `<template #xxx>` 具名插槽块（语法合法）**原位保留不动**（只搬游离元素，
 *    🔴 2026-11-09 修订：旧实现用整段 `before.trim()` 搬运，具名插槽混存时会被
 *    一起搬进默认插槽 ⇒ 与本文档承诺相反；现按顶层节点切分后逐节点筛选）；
 *  - 注释/纯空白不算游离元素；
 *  - 开标签结束位置按「引号感知」扫描（属性值内含 `>` 不会截断，旧实现用
 *    `indexOf('>')` 会切坏标签）；
 *  - 移动后复检 base-panel 仍是首元素（幂等：已归位的不再触发）。
 *
 * 纯函数；挂 pre-write-self-healing（.vue 写盘前统一出口）。
 */

/** 空元素（无闭合标签，不参与配平） */
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

/** 从 `<` 位置找到标签结束（引号内 `>` 不计），返回 `>` 之后下标；失败 -1 */
function scanTagEnd(src, ltIdx) {
  let quote = ''
  for (let i = ltIdx + 1; i < src.length; i += 1) {
    const ch = src[i]
    if (quote) {
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (ch === '>') return i + 1
  }
  return -1
}

/**
 * 把 `[from, to)` 区间切成顶层节点（元素 / 具名插槽模板 / 注释 / 其他文本）。
 * 返回绝对偏移，便于在原串上做删除重建。
 */
function splitTopLevelNodes(src, from, to) {
  const nodes = []
  let i = from
  let textStart = from
  const pushText = (end) => {
    if (end > textStart) {
      const text = src.slice(textStart, end)
      const trimmed = text.trim()
      if (trimmed) {
        nodes.push({
          kind: 'text',
          start: textStart,
          end,
          text,
          namedTemplate: false,
        })
      }
    }
  }
  while (i < to) {
    const lt = src.indexOf('<', i)
    if (lt === -1 || lt >= to) break
    if (src.startsWith('<!--', lt)) {
      const close = src.indexOf('-->', lt)
      if (close === -1 || close >= to) break
      pushText(lt)
      nodes.push({ kind: 'comment', start: lt, end: close + 3, text: src.slice(lt, close + 3), namedTemplate: false })
      i = close + 3
      textStart = i
      continue
    }
    if (/^<\s*\//.test(src.slice(lt, lt + 3))) { i = lt + 2; continue }
    const openEnd = scanTagEnd(src, lt)
    if (openEnd === -1 || openEnd > to) break
    const openTag = src.slice(lt, openEnd)
    const nameM = openTag.match(/^<\s*([a-zA-Z][\w-]*)/)
    if (!nameM) { i = openEnd; continue }
    const name = nameM[1]
    const selfClosing = /\/\s*>$/.test(openTag)
    // 具名插槽模板：<template #x> / <template v-slot:x>
    const isNamedTemplate =
      name.toLowerCase() === 'template' && /\s(?:#|v-slot:)[\w-]/.test(openTag)
    let end = openEnd
    if (!selfClosing && !VOID_TAGS.has(name.toLowerCase())) {
      // 配平到该标签闭合
      let depth = 1
      let j = openEnd
      while (j < to && depth > 0) {
        const nextLt = src.indexOf('<', j)
        if (nextLt === -1 || nextLt >= to) { j = to; break }
        if (src.startsWith('<!--', nextLt)) {
          const close = src.indexOf('-->', nextLt)
          if (close === -1) { j = to; break }
          j = close + 3
          continue
        }
        const nextEnd = scanTagEnd(src, nextLt)
        if (nextEnd === -1) { j = to; break }
        const tag = src.slice(nextLt, nextEnd)
        const nm = tag.match(/^<\s*\/?\s*([a-zA-Z][\w-]*)/)
        if (!nm) { j = nextEnd; continue }
        const closing = /^<\s*\//.test(tag)
        const self = /\/\s*>$/.test(tag)
        if (closing && nm[1].toLowerCase() === name.toLowerCase()) depth -= 1
        else if (!closing && !self && !VOID_TAGS.has(nm[1].toLowerCase())) depth += 1
        j = nextEnd
      }
      end = j
    }
    pushText(lt)
    nodes.push({
      kind: 'element',
      start: lt,
      end,
      text: src.slice(lt, end),
      namedTemplate: isNamedTemplate,
      // 🛡️ S6（2026-11-09 · a7b905d1 实锤）：`<template>` / `<script>` / `<style>` 是 **SFC 顶层块**，
      //   不是 DOM 游离根。真机 moved=["<template>\n  "] 说明旧实现把重复 SFC 骨架当游离节点
      //   整块搬进 `<base-panel>` ⇒ 双 `<script setup>` + 闭合错乱 ⇒ 写盘门禁 BLOCK。
      //   此处按**标签语义**排除（非段名/组件名白名单）。
      isSfcBlock: /^(template|script|style)$/i.test(String(name || '')),
    })
    i = end
    textStart = i
  }
  pushText(to)
  return nodes
}

/**
 * @param {string} vueContent
 * @returns {{ content: string, moved: string[] , changed: boolean }}
 */
export function relocateStrayTemplateRoots(vueContent) {
  const content = String(vueContent || '')
  const tplOpen = content.match(/<template\s*>/)
  if (!tplOpen) return { content, moved: [], changed: false }
  const tplStart = tplOpen.index + tplOpen[0].length

  const panelOpen = content.indexOf('<base-panel', tplStart)
  if (panelOpen === -1) return { content, moved: [], changed: false }

  // base-panel 之前的顶层节点
  const nodes = splitTopLevelNodes(content, tplStart, panelOpen)
  // 游离 = 元素节点且不是具名插槽模板（注释/空白/具名插槽都不算）
  const strayNodes = nodes.filter((n) => n.kind === 'element' && !n.namedTemplate && !n.isSfcBlock)
  if (strayNodes.length === 0) return { content, moved: [], changed: false }

  // 开标签结束位置（引号感知，避免属性值含 '>' 时截断）
  const panelTagEnd = scanTagEnd(content, panelOpen)
  if (panelTagEnd === -1) return { content, moved: [], changed: false }
  const insertAt = panelTagEnd

  // 保留段：template 开标签 → base-panel 开标签之间，剔除游离节点
  let beforeKept = content.slice(tplStart, panelOpen)
  for (const n of [...strayNodes].sort((a, b) => b.start - a.start)) {
    const localStart = n.start - tplStart
    const localEnd = n.end - tplStart
    beforeKept = beforeKept.slice(0, localStart) + beforeKept.slice(localEnd)
  }

  const strayBlock = strayNodes.map((n) => n.text).join('\n    ')
  const openTag = content.slice(panelOpen, insertAt) // "<base-panel ...>"
  const after = content.slice(insertAt) // 开标签之后的一切（含原默认插槽内容）

  const result =
    content.slice(0, tplStart) +
    beforeKept +
    openTag +
    '\n    ' + strayBlock + '\n  ' +
    after

  return { content: result, moved: [strayBlock.slice(0, 60)], changed: true }
}

export default relocateStrayTemplateRoots
