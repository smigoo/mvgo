/**
 * 🧩 CSS/LESS 选择器事实解析（2026-11-17 · mc-max-1794895488047-f785be7f 实锤）
 *    —— 纯函数、零 IO、**单一事实源**：样式事实只在这里解析，消费者不许再写第二份正则。
 *
 * 缺陷背景（旧实现 `/([^{}]+)\{([^{}]*)\}/g` + `/\.cls/g` 抓 class）：
 *   A) **归因错误**：CSS 里声明只作用于 **subject**（最后一个复合选择器），其余是祖先约束。
 *      `.frame-2 .icon .icon-img{width:28px;height:28px}` 的 28px 属于 `.icon-img`，
 *      旧实现却同时挂给 `.frame-2` / `.icon` / `.icon-img` 三个 class。
 *   C) **不懂嵌套**：`[^{}]+` 跨不了 `{`，LESS 嵌套时正则把**上一块的属性体**当成选择器
 *      （`margin-left:9.41px;\n\n .c-monitor-icon {` ⇒ "选择器"里混着属性文本），
 *      既漏采内层规则，又把内层声明的尺寸错挂到外层 class。
 *
 * 实证后果（真机产物，两处都靠缺陷"碰巧"工作，修任一半都会静默失效）：
 *   · 段内成员 DOM 真值对账 F3（重复图标空槽）用 `sizeOfNode` 取「自身声明尺寸」，
 *     空槽 `.c-monitor-icon` 自身**没有** width/height，尺寸全靠缺陷 A 从后代
 *     `.c-monitor-icon-img{28×28}` 错挂过来 ⇒ 只修 A 会让 F3 判不出尺寸、静默零命中；
 *   · 若叠上缺陷 C（LESS 嵌套），错误归因方向不可预测（上一块的属性体当选择器）。
 *
 * 本实现：
 *   ① 引号感知 + 注释感知的大括号**配平扫描**（任意深度嵌套，at-rule 透明穿透）；
 *   ② 逗号分组 + `&` 父链替换 ⇒ 产出**已展开的完整选择器链**；
 *   ③ `splitSelectorChain` 拆 `{ ancestors, subject }`，`classesInFragment` 只从
 *      类选择器取 class（`[attr]` 与 `:not(...)` 参数不算受体）。
 *
 * 消费者口径（刻意分离，别混用）：
 *   · `self`（subject 归因）= 元素**自身**的声明事实 —— flex-direction / white-space 判据；
 *   · `desc`（祖先归因，只收能判出 px 尺寸的规则）= 「该容器承载的内容位尺寸」——
 *     空槽图标位判据。它不是"自身尺寸"，绝不可当自身声明用。
 */

/** 去注释：块注释 + LESS `//` 行注释（保护字符串与 `url(http://…)` 里的 `//`）。 */
export function stripCssComments(css) {
  const src = String(css || '')
  let out = ''
  let quote = ''
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quote) {
      out += ch
      if (ch === '\\') {
        out += src[i + 1] || ''
        i += 1
      } else if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      out += ch
      continue
    }
    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2)
      i = end === -1 ? src.length : end + 1
      continue
    }
    if (ch === '/' && src[i + 1] === '/') {
      // `url(http://…)` 的 `//` 前是 `:` ⇒ 不是注释
      const prev = out.replace(/\s+$/, '').slice(-1)
      if (prev !== ':') {
        const nl = src.indexOf('\n', i + 2)
        i = nl === -1 ? src.length : nl - 1
        continue
      }
    }
    out += ch
  }
  return out
}

/** 按顶层逗号拆选择器组（括号/引号内的逗号不拆）。 */
export function splitCommaGroups(sel) {
  const s = String(sel || '')
  const out = []
  let buf = ''
  let depth = 0
  let quote = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (quote) {
      buf += ch
      if (ch === '\\') {
        buf += s[i + 1] || ''
        i += 1
      } else if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      buf += ch
      continue
    }
    if (ch === '(' || ch === '[') depth += 1
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      const t = buf.trim()
      if (t) out.push(t)
      buf = ''
      continue
    }
    buf += ch
  }
  const tail = buf.trim()
  if (tail) out.push(tail)
  return out
}

/** 把一个复合选择器链切成片段：`.a > .b .c:hover` ⇒ ['.a', '.b', '.c:hover']。 */
export function splitSelectorChain(sel) {
  const s = String(sel || '').trim()
  if (!s) return []
  const parts = []
  let buf = ''
  let depth = 0
  let quote = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (quote) {
      buf += ch
      if (ch === '\\') {
        buf += s[i + 1] || ''
        i += 1
      } else if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      buf += ch
      continue
    }
    if (ch === '(' || ch === '[') depth += 1
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1)
    if (depth === 0 && /[\s>+~]/.test(ch)) {
      const t = buf.trim()
      if (t) parts.push(t)
      buf = ''
      continue
    }
    buf += ch
  }
  const tail = buf.trim()
  if (tail) parts.push(tail)
  return parts
}

/** 从单个复合选择器片段里取 class（剥掉 `[attr]` 与伪类括号参数，它们不是受体）。 */
export function classesInFragment(frag) {
  let s = String(frag || '')
  // `:not(.a)` / `:is(...)` / `:where(...)` 里的类不作用于该元素本身 ⇒ 剥两轮（容忍嵌套一层）
  s = s.replace(/\[[^\]]*\]/g, ' ').replace(/\([^()]*\)/g, ' ')
  s = s.replace(/\([^()]*\)/g, ' ')
  const out = []
  const re = /\.(-?[_a-zA-Z][\w-]*)/g
  let m
  while ((m = re.exec(s)) !== null) if (!out.includes(m[1])) out.push(m[1])
  return out
}

/** 子选择器接父链：含 `&` 时替换为父链文本（LESS 语义），否则直接追加。 */
function joinChains(parentChain, childSel) {
  const child = String(childSel || '').trim()
  if (!child) return parentChain.slice()
  const parentStr = parentChain.join(' ')
  if (child.includes('&')) return splitSelectorChain(child.replace(/&/g, parentStr))
  return [...parentChain, ...splitSelectorChain(child)]
}

/**
 * 大括号配平扫描 → 规则清单（嵌套已展开为完整选择器链）。
 * at-rule（`@media` / `@supports` / `@import` …）**透明穿透**：块本身不产出规则，
 * 内部规则按外层选择器链继承；顶层变量/`@import` 语句（以 `;` 结束）直接丢弃。
 *
 * @param {string} css
 * @returns {Array<{selector: string[], decl: string}>}
 */
export function parseCssRules(css) {
  const src = stripCssComments(css)
  const rules = []
  /** @type {Array<{selectors: string[][]|null, decls: string[], atRule: boolean}>} */
  const stack = []
  let buf = ''
  let quote = ''

  const flushDecl = () => {
    const decl = buf.trim()
    buf = ''
    if (!decl) return
    const top = stack[stack.length - 1]
    if (top && top.selectors) top.decls.push(decl)
  }

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quote) {
      buf += ch
      if (ch === '\\') {
        buf += src[i + 1] || ''
        i += 1
      } else if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      buf += ch
      continue
    }
    if (ch === '{') {
      const prelude = buf.trim()
      buf = ''
      const parent = stack.length ? stack[stack.length - 1] : null
      const parentSelectors = parent && parent.selectors ? parent.selectors : null
      if (/^@/.test(prelude)) {
        stack.push({ selectors: parentSelectors, decls: [], atRule: true })
        continue
      }
      const groups = splitCommaGroups(prelude)
      const expanded = []
      for (const g of groups) {
        if (!parentSelectors) expanded.push(splitSelectorChain(g))
        else for (const p of parentSelectors) expanded.push(joinChains(p, g))
      }
      stack.push({ selectors: expanded, decls: [], atRule: false })
      continue
    }
    if (ch === ';') {
      flushDecl()
      continue
    }
    if (ch === '}') {
      flushDecl()
      const top = stack.pop()
      if (top && !top.atRule && top.selectors && top.selectors.length) {
        const decl = top.decls.join(';')
        for (const chain of top.selectors) rules.push({ selector: chain, decl })
      }
      continue
    }
    buf += ch
  }

  // 容错：源码尾部未闭合的块按已采集内容产出（宁可多采，不静默丢事实）
  while (stack.length) {
    const top = stack.pop()
    if (top && !top.atRule && top.selectors && top.selectors.length) {
      const decl = top.decls.join(';')
      if (decl) for (const chain of top.selectors) rules.push({ selector: chain, decl })
    }
  }
  return rules
}
