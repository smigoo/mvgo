/**
 * 🛡️ LAYOUT-001 布局方向守卫（2026-09-30 复审 §8.10「换证据源」重写）
 *
 * ── 为什么重写（旧实现三个致命缺陷，全部实证）────────────────────────────
 *
 * ① **恒不可达（死代码）**：旧守卫读 `options.layoutStructure.sections`，
 *    而 `state.layoutStructure` 的真实形态是 `{ layout: { sections: [...] } }`
 *    （生产者 `mc-component-graph-phase2.js:1070` 直接透传 visual-parser 的 `result.layoutStructure`；
 *      `visual-parser.js:892-894` 的 `result.layout = result.layoutStructure` 兜底不改变嵌套）。
 *     **全语料 443/443 份 `.checkpoint/visual.json` 均为 `layout.sections`，顶层 `sections` 命中 0**
 *    ⇒ 守卫恒 false、门禁日志 0 次。这正是 `subcomponent-planner.js:1434` 早已统一为
 *    `layoutStructure?.layout?.sections || layoutStructure?.sections` 的原因。
 *
 * ② **证据源错位**：旧守卫拿 `package/index.vue` 的 `<template>` 文本做**全局正则**
 *    （`/flex-direction:\s*column/i.test(整个模板)`），而不是「该 section 宿主元素的真实 CSS」。
 *    后果：多 section 时**任一** section 的 column 会点亮**所有** horizontal section 的判定
 *    ⇒ 与具体 section 无关的随机结论（docs §8.10 实测误判 6/24）。
 *    且 `<template>` 里通常根本不写方向（方向在同文件 `<style scoped>` / `common.less` 的类规则里）
 *    ⇒ 正则实际扫的是「别处偶然出现的字符串」。
 *
 * ③ **`horizontal` 分支最糟**：判据是 `column 存在 && row 不存在` —— 与「本 section 是否横向」毫无关系。
 *
 * ── 新证据源（本文件）────────────────────────────────────────────────────
 *
 * 「真实产物」= **该 section 宿主子组件 `.vue` 的根元素**（带 `data-section-id="<sec.id>"`）
 * 上**实际生效**的方向声明，按 CSS 层叠顺序取值：
 *   1. 根元素 **inline `style`**（层叠优先级最高）
 *   2. 根元素 **class** 在「同文件 `<style>` 块 + `common.less` + 其它 `*.less/*.css`」里的规则
 *
 * 判据（三态 + fail-open，**不猜**）：
 *   · 真值方向为空（`layout` 缺失 / `relative` / `absolute` / …）⇒ **不判**
 *   · `layout` 是 `grid*` ⇒ 方向真值同为 null（网格事实由 `gridColumns` 通道承载，
 *     与 `subcomponent-planner#extractLayoutMetadata` 口径**逐字同源**）；只额外做
 *     「网格 section 被排成 flex」与「列数不符」两项检查
 *   · 宿主未物化（无 `data-section-id` 命中）⇒ **不判**（交 COMP-001 / COMP-001-UNMATERIALIZED）
 *   · 根元素**未显式声明**方向 ⇒ **不判**（可能靠父级/默认，静态无法确证）
 *   · 多 class 命中**互相冲突**的方向 ⇒ **不判**（歧义，宁可漏报不误杀）
 *   · 任何数据缺失/异常 ⇒ **不判**（整函数 try/catch，异常降级为 WARN 不阻断）
 *
 * ── 严重级 ───────────────────────────────────────────────────────────────
 * 本轮按点单**先降为 WARN**（旧为 BLOCK）：换证据源后判据面完全变了，
 * 需真机 A/B 观察误报率再决定是否恢复 BLOCK。
 */

import { extractFlexProps, matchTemplateTags } from './layout-facts-injector.js'

// ─────────────────────────────────────────────────────────────────────────
// 真值口径（与 subcomponent-planner#extractLayoutMetadata 逐字同源）
// ─────────────────────────────────────────────────────────────────────────

/**
 * `layout` 真值 → `{ direction, isGrid }` 三态。
 *
 * 与 `subcomponent-planner.js:559 extractLayoutMetadata` 的 direction 判定**逐字相同**
 * （含字符串/对象双形态、前缀匹配、`grid`/未知 → null），避免同一份 `layout` 在两处判出不同方向。
 *
 * @param {*} rawLayout - `section.layout || section.body.layout`
 * @returns {{direction: 'row'|'column'|null, isGrid: boolean}}
 */
export function resolveTruthLayout(rawLayout) {
  const layoutMode = String(
    (rawLayout && typeof rawLayout === 'object'
      ? rawLayout.layoutMode || rawLayout.direction
      : rawLayout) || '',
  )
    .trim()
    .toUpperCase()
  // 前缀匹配：真实语料含 `horizontal-2-columns` / `horizontal-3-items` / `grid-3x4` 等变体
  //（`subcomponent-planner.js:1029` 的 `/horizontal|grid|row/i` 同口径）
  const direction =
    layoutMode === 'ROW' || layoutMode.startsWith('HORIZONTAL')
      ? 'row'
      : layoutMode === 'COLUMN' || layoutMode.startsWith('VERTICAL')
        ? 'column'
        : null
  // 网格事实独立成旗标：`layout: 'grid'` 时 direction 必为 null（不臆造方向），
  // 但「这是网格容器」本身是事实，供「网格被排成 flex」检查使用。
  const isGrid = layoutMode === 'GRID' || layoutMode.startsWith('GRID')
  return { direction, isGrid }
}

/**
 * `gridColumns` 读取口径统一（#3）。
 *
 * 旧门禁只读 `section.body.gridColumns` ⇒ 全语料命中 **23**；
 * planner（`subcomponent-planner.js`）读 `sec.gridColumns ?? sec.body?.gridColumns` ⇒ 命中 **71**（并集亦 71）
 * ⇒ 旧口径**漏 48 个**。此处统一为 planner 口径。
 *
 * @param {Object} sec - section
 * @returns {number|null}
 */
export function readSectionGridColumns(sec) {
  const raw = sec?.gridColumns ?? sec?.body?.gridColumns
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

// ─────────────────────────────────────────────────────────────────────────
// 宿主定位
// ─────────────────────────────────────────────────────────────────────────

/**
 * section.id → 宿主 `.vue`（`data-section-id` 所在文件）。
 * 一个 id 只记首个命中（同 id 多宿主属异常，交别的门禁）。
 */
export function buildSectionHostIndex(files) {
  const byId = new Map()
  for (const f of files) {
    const path = String(f?.path || '')
    const content = typeof f?.content === 'string' ? f.content : ''
    if (!content || !/\.vue$/i.test(path)) continue
    for (const tag of matchTemplateTags(content)) {
      const m = /\bdata-section-id\s*=\s*"([^"]+)"/.exec(tag.attrs || '')
      if (!m) continue
      if (!byId.has(m[1])) byId.set(m[1], { path, content, tag })
    }
  }
  return byId
}

// ─────────────────────────────────────────────────────────────────────────
// class → 实际生效声明
// ─────────────────────────────────────────────────────────────────────────

/**
 * 样式语料 = 全部 `*.less` / `*.css` 的整文 + 每个 `.vue` 的 `<style>` 块。
 *
 * 必需跨文件：宿主根 class 的方向常写在 **`common.less`**（共享）而非该子组件自己的 `<style>` 里
 * （实测 `c-traffic-monitor-94a6be5e`：`.c-traffic-monitor-card` 的 `flex-direction` 在 `common.less`）。
 */
export function buildStyleCorpus(files) {
  const parts = []
  for (const f of files) {
    const path = String(f?.path || '')
    const content = typeof f?.content === 'string' ? f.content : ''
    if (!content) continue
    if (/\.(less|css)$/i.test(path)) {
      parts.push(content)
    } else if (/\.vue$/i.test(path)) {
      const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi
      let m
      while ((m = re.exec(content))) parts.push(m[1])
    }
  }
  return parts.join('\n')
}

/** 声明块 → `{kind, cols}`；无方向语义返回 null */
function declToKind(decl) {
  if (!decl) return null
  const display = String(decl.display || '').trim().toLowerCase()
  const fd = String(decl.flexDirection || '').trim().toLowerCase()
  const colsM = /grid-template-columns\s*:\s*repeat\(\s*(\d+)/i.exec(decl.blockContent || '')
  if (display === 'grid' || colsM) {
    return { kind: 'grid', cols: colsM ? Number(colsM[1]) : null }
  }
  if (fd === 'row' || fd === 'row-reverse') return { kind: 'row', cols: null }
  if (fd === 'column' || fd === 'column-reverse') return { kind: 'column', cols: null }
  return null
}

/** 静态 `style="..."` → 声明块（只取方向相关三项，其余忽略） */
function parseInlineCss(styleText) {
  const css = String(styleText || '')
  if (!css) return null
  const display = /(?:^|;)\s*display\s*:\s*([^;]+)/i.exec(css)?.[1] || null
  const flexDirection = /(?:^|;)\s*flex-direction\s*:\s*([^;]+)/i.exec(css)?.[1] || null
  const cols = /grid-template-columns\s*:\s*repeat\(\s*(\d+)/i.exec(css)?.[1] || null
  if (!display && !flexDirection && !cols) return null
  return { display, flexDirection, blockContent: cols ? `grid-template-columns: repeat(${cols}` : '' }
}

/**
 * `:style="{...}"` 绑定（JS 对象字面量）→ 声明块。
 * 只做**窄解析**：`flexDirection` / `display` / `gridTemplateColumns` 三种键、单/双引号或裸值。
 * 解析不出方向则返回 null（绝不把 JS 表达式当 CSS 猜）。
 */
function parseStyleBinding(bindingText) {
  const src = String(bindingText || '')
  if (!src) return null
  const fd =
    /flexDirection\s*:\s*['"]?(row-reverse|column-reverse|row|column)['"]?/i.exec(src)?.[1] ||
    null
  const display = /display\s*:\s*['"]?(flex|grid|block|inline-flex)['"]?/i.exec(src)?.[1] || null
  const cols =
    /gridTemplateColumns\s*:\s*['"]?repeat\(\s*(\d+)/i.exec(src)?.[1] ||
    /gridTemplateColumns\s*:\s*['"]?repeat\(\s*(\d+)\s*,/i.exec(src)?.[1] ||
    null
  if (!fd && !display && !cols) return null
  return {
    display,
    flexDirection: fd,
    blockContent: cols ? `grid-template-columns: repeat(${cols}` : '',
  }
}

/**
 * 解析宿主根元素**实际生效**的方向。
 *
 * 取值顺序 = CSS 层叠：inline `style` > `:style` 绑定 > class 规则。
 * @returns {{kind:'row'|'column'|'grid', cols:number|null}|null}  未声明/歧义 ⇒ null
 */
export function resolveActualDirection(tag, corpus) {
  const attrs = String(tag?.attrs || tag?.html || tag || '')

  // 1) 静态 inline style（优先级最高，命中即定案）
  const staticInline = /(?:^|\s)style\s*=\s*"([^"]*)"/.exec(attrs)
  if (staticInline) {
    const k = declToKind(parseInlineCss(staticInline[1]))
    if (k) return k
  }

  // 2) `:style` 绑定
  const bound = /(?::style|v-bind:style)\s*=\s*"([^"]*)"/.exec(attrs)
  if (bound) {
    const k = declToKind(parseStyleBinding(bound[1]))
    if (k) return k
  }

  // 3) class 规则（同文件 <style> + common.less + 其它样式文件）
  const classAttr = /(?:^|\s)class\s*=\s*"([^"]*)"/.exec(attrs)?.[1]
  if (!classAttr) return null
  const found = new Map() // `kind:cols` → {kind, cols}
  for (const cls of classAttr.split(/\s+/)) {
    if (!cls || !/^[a-zA-Z][\w-]*$/.test(cls)) continue
    const kind = declToKind(extractFlexProps(corpus, `.${cls}`))
    if (!kind) continue
    found.set(`${kind.kind}:${kind.cols ?? ''}`, kind)
  }
  // 多个 class 给出**互相冲突**的方向 ⇒ 歧义 ⇒ 不判（fail-open）
  if (found.size !== 1) return null
  return [...found.values()][0]
}

// ─────────────────────────────────────────────────────────────────────────
// 主判据
// ─────────────────────────────────────────────────────────────────────────

/**
 * @param {Array<{path:string,content:string}>} files - **全量**产物文件集（勿传增量子集）
 * @param {Object} layoutStructure - `state.layoutStructure`
 * @returns {{issues: Array, stats: Object}}
 */
export function detectLayoutDirectionMismatch(files, layoutStructure) {
  const issues = []
  const stats = {
    sections: 0,
    truthFact: 0,
    hosts: 0,
    judged: 0,
    skippedNoDecl: 0,
    mismatches: 0,
  }
  try {
    const fileList = (Array.isArray(files) ? files : []).filter(
      (f) => f && typeof f.content === 'string' && f.content,
    )
    if (fileList.length === 0) return { issues, stats }

    // 🛡️ 口径统一（与 subcomponent-planner.js:1434 同源）：这是旧实现的死因①
    const sections = layoutStructure?.layout?.sections || layoutStructure?.sections || []
    if (!Array.isArray(sections) || sections.length === 0) return { issues, stats }

    // 展平整棵树（容器也各有宿主组件：全语料 6468 个 section 中 1658 个容器带 children）
    const list = []
    const walk = (arr) => {
      for (const s of arr) {
        if (!s || typeof s !== 'object') continue
        list.push(s)
        if (Array.isArray(s.children) && s.children.length) walk(s.children)
      }
    }
    walk(sections)
    stats.sections = list.length

    const hostById = buildSectionHostIndex(fileList)
    const corpus = buildStyleCorpus(fileList)

    for (const sec of list) {
      const truth = resolveTruthLayout(sec.layout || sec.body?.layout)
      if (!truth.direction && !truth.isGrid) continue // 无方向/网格事实 ⇒ 不判
      stats.truthFact += 1

      const id = String(sec.id || '')
      if (!id) continue
      const host = hostById.get(id)
      if (!host) continue // 未物化 ⇒ 交 COMP-001
      stats.hosts += 1

      const actual = resolveActualDirection(host.tag, corpus)
      if (!actual) {
        stats.skippedNoDecl += 1
        continue
      }
      stats.judged += 1

      const gridColumns = readSectionGridColumns(sec)
      const label = sec.name || sec.title || sec.responsibility || 'unnamed'
      let message = null
      let suggestion = null

      if (truth.direction) {
        if (actual.kind !== truth.direction) {
          message =
            `section ${id}（${label}）的设计布局是「${truth.direction === 'row' ? '横向' : '纵向'}」` +
            `（layout=${String(sec.layout ?? sec.body?.layout)}），但宿主元素实际是「${describeKind(actual)}」` +
            `⇒ 该 section 内部排列方向与设计不符。`
          suggestion =
            truth.direction === 'row'
              ? `把宿主根元素的 flex-direction 改为 row（子项横向并排）`
              : `把宿主根元素的 flex-direction 改为 column（子项纵向堆叠）`
        }
      } else if (truth.isGrid) {
        if (actual.kind === 'row' || actual.kind === 'column') {
          message =
            `section ${id}（${label}）的设计布局是「网格」（layout=grid` +
            `${gridColumns ? `，${gridColumns} 列` : ''}），但宿主元素实际是「${describeKind(actual)}」` +
            `⇒ 网格被排成了 flex 流，列数事实丢失。`
          suggestion = `宿主根元素改用 display: grid${
            gridColumns ? `; grid-template-columns: repeat(${gridColumns}, 1fr)` : ''
          }`
        } else if (actual.kind === 'grid' && gridColumns && actual.cols && actual.cols !== gridColumns) {
          message =
            `section ${id}（${label}）的设计是 ${gridColumns} 列网格，但宿主元素写的是 ${actual.cols} 列` +
            `⇒ 列数与设计不符。`
          suggestion = `grid-template-columns 改为 repeat(${gridColumns}, 1fr)`
        }
      }

      if (!message) continue
      stats.mismatches += 1
      issues.push({
        id: 'LAYOUT-001',
        severity: 'WARN',
        file: host.path,
        message: `${message} 期望：${expectedText(truth, gridColumns)}`,
        hint: { suggestion },
      })
    }
  } catch (err) {
    issues.push({
      id: 'LAYOUT-001-ERROR',
      severity: 'WARN',
      file: '(layout-direction-guard)',
      message: `LAYOUT-001 布局方向检测异常（非阻断）：${err?.message || String(err)}`,
    })
  }
  return { issues, stats }
}

function describeKind(actual) {
  if (actual.kind === 'grid') return actual.cols ? `网格 ${actual.cols} 列` : '网格'
  return actual.kind === 'row' ? '横向 flex' : '纵向 flex'
}

function expectedText(truth, gridColumns) {
  if (truth.direction) return truth.direction === 'row' ? 'flex-direction: row' : 'flex-direction: column'
  if (truth.isGrid) return `display: grid${gridColumns ? `; grid-template-columns: repeat(${gridColumns}, 1fr)` : ''}`
  return '—'
}

export default { detectLayoutDirectionMismatch, resolveTruthLayout, readSectionGridColumns }
