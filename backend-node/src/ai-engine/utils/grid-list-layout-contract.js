/**
 * 🛡️ 刀 41（2026-10-21 · mc-1792578497809-3a5bb639 实锤）：折叠网格「布局契约」判据 + 自愈。
 *
 * ── 事故（为什么既有三道判据全绿却仍然散架）─────────────────────────────
 *
 * 合作厂商弹窗三段（38:3137 / 38:3162 / 38:3206）真值**完全同构**：
 *   4 列 × 126×30 卡、列距 20、行距（gap）20、末行可不满（战略 4+2 / 普通 4+4+4+3）。
 * 产物却是**三套互不相同的实现**，且两轮真机跑出来的方向**正好互换**：
 *   · 第一节 优质 = `row` ✅ / 第二节 普通 = `column` ❌；
 *   · 下一轮反过来（优质 `column` ❌ / 普通 `row` ✅）。
 * ⇒ 方向不是「错」，而是**没人管**：同一份代码两次运行结果不同。
 *
 * 三道既有判据的判据域都不覆盖本例：
 *   · **LAYOUT-001**（layout-direction-guard）：`layout=grid` 时只比「宿主是不是 grid、列数对不对」，
 *     不管**卡宽**与**间距**；而 `display:flex` 那条只比 section.**自身** layout，不看 v-for 角色。
 *   · **T3 方向守卫**（vfor-list-direction-guard）：`truth.isGrid` 直接 `continue`（第 236 行）
 *     ⇒ 网格段**零覆盖**。这不是 bug，是「grid 没有 direction」的必然结果。
 *   · **刀 22-grid**（flex-sibling-guard.healGridContainer）：只在子项写 `width: calc(N% …)`
 *     时把 flex 改 grid；本例子项写的是 `flex: 1 1 calc(25% - 20px)` ⇒ 不命中。
 *
 * ── 本刀判据（纯几何真值，命名无关）───────────────────────────────────
 *
 * 真值来源 = section 树节点自身（`gridColumns` + `items[].absoluteBoundingBox`），不读 figmaRoot：
 *   · cardW / cardH = items 尺寸众数；
 *   · cols = 唯一 x 坐标个数（几何优先于 `gridColumns` 声明）；
 *   · colGap = x 相邻间距 − cardW；rowGap = y 相邻间距 − cardH（单行 ⇒ 不判行距）。
 *   · 任一间距**不等距**（±2px）/ 只有一个 x 坐标（真纵向列表）/ items<2 ⇒ **不判**（fail-open）。
 *
 * 唯一合法契约（两条，渲染等价）：
 *   (a) `display:grid; grid-template-columns: repeat(N, Wpx)` + 列距/行距；
 *   (b) `display:flex; flex-direction:row; flex-wrap:wrap` + 子项 `flex:0 0 Wpx`。
 *   🔴 **禁止 `repeat(N, 1fr)`**：末行不满（items % N ≠ 0）时会把 3 张/2 张卡拉宽
 *      （真值 418 / 272 宽，1fr 会变 174.7 / 264-…）⇒ 与设计稿不符。
 *
 * 判据将 (a) 选为**自愈目标形态**，因为 LAYOUT-001 对 `layout=grid` 的段要求 `display:grid`
 * —— 自愈若改写成 flex，会把 WARN 转成 WARN（两段式铁律：门禁与自愈必须同一世界观）。
 *
 * ⚠️ 严重级：检测出的 issue 交调用方按 WARN 处理；自愈幂等、fail-open、只改布局类声明，
 *    不碰颜色/圆角/字体（那是刀 36/37 的判据域）。
 */

import { collectStyleSources, extractStyleBlocks, targetClassesOf } from './flex-sibling-guard.js'
import { findVForPairs } from './vfor-list-direction-guard.js'

/** 像素容差（Figma 坐标含浮点/取整差异） */
const TOL = 2

function toArray(v) {
  return Array.isArray(v) ? v : []
}

/** 深度遍历 section 树 */
function walkSections(list, fn) {
  for (const s of toArray(list)) {
    if (!s || typeof s !== 'object') continue
    fn(s)
    if (Array.isArray(s.children) && s.children.length) walkSections(s.children, fn)
  }
}

/** section 数组 → { id → section }（首个命中，重复 id 属别的门禁的事） */
export function indexSections(sections) {
  const idx = new Map()
  walkSections(sections, (s) => {
    const id = String(s.id ?? '')
    if (id && !idx.has(id)) idx.set(id, s)
  })
  return idx
}

function modeNumber(nums) {
  const freq = new Map()
  for (const n of nums) {
    if (!Number.isFinite(n)) continue
    freq.set(n, (freq.get(n) || 0) + 1)
  }
  let best = null
  let bestN = 0
  for (const [n, c] of freq) {
    if (c > bestN || (c === bestN && best !== null && n > best)) {
      best = n
      bestN = c
    }
  }
  return best
}

function uniqueSorted(nums) {
  return [...new Set(nums)].sort((a, b) => a - b)
}

/** 相邻差是否等距 ⇒ 返回 pitch，否则 null（不等距 = 乱排，绝不猜） */
function uniformPitch(values) {
  if (values.length < 2) return null
  const diffs = []
  for (let i = 1; i < values.length; i++) diffs.push(values[i] - values[i - 1])
  const p = modeNumber(diffs.map((d) => Math.round(d)))
  if (!Number.isFinite(p) || p <= 0) return null
  if (!diffs.every((d) => Math.abs(d - p) <= TOL)) return null
  return p
}

function boxesOf(sec) {
  // items 有两个落点：planner 直出在 `sec.items`，F1 回填在 `sec.body.items`
  // （见 card-visual-truth-rewriter 注释「含 F1 回填的 body.items」）—— 两处都认。
  const items = toArray(sec?.items).length > 0 ? sec.items : toArray(sec?.body?.items)
  return toArray(items)
    .map((it) => (it && (it.absoluteBoundingBox || it.bbox || it.box)) || null)
    .filter((b) => b && Number(b.width) > 0 && Number(b.height) > 0)
}

/**
 * 从 section 节点推导「行式网格」几何契约。
 *
 * @param {object} sec section 树节点
 * @returns {{id:string, cols:number, cardW:number, cardH:number, colGap:number,
 *            rowGap:number|null, rows:number, itemCount:number, lastRowFull:boolean,
 *            isGrid:boolean, geometryFrom:string} | null}
 *          不可判定（items<2 / 单列 / 不等距 / 无卡尺寸）⇒ null
 */
export function buildGridContract(sec) {
  if (!sec || typeof sec !== 'object') return null
  const layout = String(sec.layout || sec.body?.layout || '').toLowerCase()
  const type = String(sec.type || sec.body?.type || '').toLowerCase()
  const isGrid = layout === 'grid' || type === 'grid'
  const declaredRaw = Number(sec.gridColumns ?? sec.body?.gridColumns)
  const declaredCols = declaredRaw > 0 ? Math.round(declaredRaw) : null

  let boxes = boxesOf(sec)
  let geometryFrom = 'self'

  // 几何兜底：段自身无 items（`layout=grid` 但折叠发生在子 `-list` 上，如战略段 38:3140）
  //   条件**极窄**：子段项数 === 声明列数 且全部同一 y（= 恰好一整行）⇒ 该子段就是本段的网格几何。
  if (boxes.length < 2 && declaredCols >= 2) {
    const child = toArray(sec.children).find((c) => {
      const cb = boxesOf(c)
      if (cb.length !== declaredCols) return false
      const ys = uniqueSorted(cb.map((b) => Math.round(b.y)))
      return ys.length === 1
    })
    if (child) {
      boxes = boxesOf(child)
      geometryFrom = String(child.id ?? '')
    }
  }
  if (boxes.length < 2) return null

  const cardW = modeNumber(boxes.map((b) => Math.round(Number(b.width))))
  const cardH = modeNumber(boxes.map((b) => Math.round(Number(b.height))))
  if (!(cardW > 0) || !(cardH > 0)) return null

  const xs = uniqueSorted(boxes.map((b) => Math.round(Number(b.x))))
  const ys = uniqueSorted(boxes.map((b) => Math.round(Number(b.y))))
  // 只有一个 x 坐标 ⇒ 真·纵向列表（重复单元上下堆叠），不属本刀判据域（交 T3 / LAYOUT-001）
  if (xs.length < 2) return null

  const colPitch = uniformPitch(xs)
  if (colPitch === null) return null // x 不等距 ⇒ 非规则网格，不猜
  const colGap = Math.round(colPitch - cardW)
  if (!(colGap >= 0) || colGap > 200) return null

  const rows = ys.length
  let rowGap = null
  if (rows > 1) {
    const rowPitch = uniformPitch(ys)
    if (rowPitch === null) return null
    const g = Math.round(rowPitch - cardH)
    if (!(g >= 0) || g > 200) return null
    rowGap = g
  }

  // 列数：几何优先（声明与几何冲突时以几何为准；冲突本身由 LAYOUT-001 报列数不符）
  const cols = xs.length
  if (cols < 2) return null
  const itemCount = boxes.length

  return {
    id: String(sec.id ?? ''),
    cols,
    cardW,
    cardH,
    colGap,
    rowGap,
    rows,
    itemCount,
    lastRowFull: itemCount % cols === 0,
    isGrid,
    geometryFrom,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 元素实际声明解析（inline style > class 规则，跨文件层叠）
// ─────────────────────────────────────────────────────────────────────────

/** CSS 声明串 → { prop: value }（只认 `prop: value` 对，`calc(…)`/`url(…)` 不截断） */
export function parseDeclMap(cssText) {
  const out = {}
  const text = String(cssText || '')
  if (!text) return out
  const segs = text.split(';')
  for (const seg of segs) {
    const m = /^\s*([a-zA-Z-]+)\s*:\s*([\s\S]+)$/.exec(seg)
    if (!m) continue
    const prop = m[1].toLowerCase()
    const val = m[2].trim()
    if (!val) continue
    out[prop] = val
  }
  return out
}

/**
 * 选择器是否命中该元素（分组选择器 = 或；同一复合选择器的多个 class = 与）。
 * 复用 `targetClassesOf`（与既有守卫同一套选择器语义），不另写正则。
 */
function selectorMatchesElement(selector, classSet) {
  for (const group of String(selector || '').split(',')) {
    const cls = targetClassesOf(group)
    if (cls.length > 0 && cls.every((c) => classSet.has(c))) return true
  }
  return false
}

/**
 * 元素生效声明：**按样式文件出现顺序**扫全部规则块，命中即覆盖（后写者胜）。
 * ⚠️ 不能按「class 在属性里出现的顺序」合并 —— 实锤：`c-component-vendor-grid--strategic`
 *    （common.less:68，column）在前、`c-component-vendor-grid`（:471，column）在后，
 *    CSS 实际由**文件位置靠后**的那份胜出，按属性顺序会把结论判反。
 * ⚠️ 先剥嵌套块（`:hover`/`&:hover`）—— 否则 hover 里的 background 会覆盖常态值。
 */
function collectElementDecls(sources, classes) {
  const merged = {}
  const classSet = new Set(toArray(classes))
  if (classSet.size === 0) return merged
  for (const src of sources || []) {
    for (const b of extractStyleBlocks(src.content)) {
      if (!selectorMatchesElement(b.selector, classSet)) continue
      const flat = String(b.body || '').replace(/\{[^{}]*\}/g, '')
      Object.assign(merged, parseDeclMap(flat))
    }
  }
  return merged
}

/** 元素声明的生效值：class 规则（按文件顺序）→ inline style 最后覆盖 */
export function resolveElementDecls(sources, classes, inlineStyle = '') {
  const merged = collectElementDecls(sources, classes)
  Object.assign(merged, parseDeclMap(inlineStyle))
  return merged
}

/** 取静态 `class="a b"` 的属性值（排除 `:class` / `v-bind:class`） */
function classAttrOf(attrs) {
  const m = /(?:^|\s)class\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(String(attrs || ''))
  if (!m) return []
  return String(m[1] ?? m[2] ?? '')
    .split(/\s+/)
    .filter(Boolean)
}

/** 取静态 `style="…"`（排除 `:style`） */
function inlineStyleOf(attrs) {
  const m = /(?:^|\s)style\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(String(attrs || ''))
  return m ? String(m[1] ?? m[2] ?? '') : ''
}

function sectionIdOf(attrs) {
  const m = /\bdata-section-id\s*=\s*(?:"([^"]+)"|'([^']+)')/.exec(String(attrs || ''))
  return m ? String(m[1] ?? m[2] ?? '') : ''
}

/**
 * class 在**全部模板**里的出现次数（同名 class 被别的元素复用 ⇒ 不可安全改写）。
 *
 * 实锤：`c-component-frame-2136639905` 同时是 `ContentSection6` 的容器 class 与
 * `CardGridList2` 子项 class（common.less:424）—— 若按「第一个 class」无脑改写，
 * 会把 ContentSection6 的容器改成 30px 高的网格项。
 */
function buildClassUsage(files) {
  const usage = new Map()
  for (const f of toArray(files)) {
    const path = String(f?.path || '')
    if (!/\.vue$/i.test(path) || typeof f?.content !== 'string') continue
    // `.mc-gen/cache/code-chunks/*` 是同一份产物的镜像副本（离线重放会遇到），
    // 计入会把「只用一次」误判成「被复用」⇒ 子项永远不能被改写。
    if (/\.mc-gen\/|\/cache\//.test(path)) continue
    for (const tag of matchAllTags(f.content)) {
      for (const cls of classAttrOf(tag)) usage.set(cls, (usage.get(cls) || 0) + 1)
    }
  }
  return usage
}

/** 全文件模板标签的原始 attrs 串（轻量：只取 `<template>` 段） */
function matchAllTags(content) {
  const text = String(content || '')
  const open = text.indexOf('<template>')
  const close = text.lastIndexOf('</template>')
  const src = open >= 0 && close > open ? text.slice(open + 10, close) : text
  const out = []
  const rx = /<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>])*)>/g
  let m
  while ((m = rx.exec(src)) !== null) out.push(m[2] || '')
  return out
}

/** `126px` → 126；`calc(…)` / `auto` / `25%` → null */
function parsePx(raw) {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*px\s*$/i.exec(String(raw || ''))
  return m ? Number(m[1]) : null
}

const STRETCH_RX = /%|calc\s*\(/i

/** flex 简写 / flex-basis / width 里的**固定像素**基数；流式（%/calc）返回 null */
function fixedBasisOf(decls) {
  const flex = String(decls.flex || '').trim()
  if (flex) {
    const parts = flex.split(/\s+/).filter(Boolean)
    if (parts.length >= 3) {
      const px = parsePx(parts[2])
      if (px !== null) return px
      if (STRETCH_RX.test(parts[2])) return null
    } else if (parts.length === 2) {
      const px = parsePx(parts[1])
      if (px !== null) return px
    }
  }
  const basis = parsePx(decls['flex-basis'])
  if (basis !== null) return basis
  return parsePx(decls.width)
}

/**
 * 唯一判据实现：契约 vs 实际声明 → issue 列表。
 * 检测与自愈共用本函数（两段式铁律：两侧必须同一实现）。
 *
 * @returns {Array<{code:string, prop:string, actual:string, want:string}>}
 */
export function judgeGridContract(contract, wrap = {}, item = {}) {
  const out = []
  if (!contract) return out
  const wantCols = contract.cols
  const wantW = contract.cardW
  const wantH = contract.cardH
  const wantColGap = contract.colGap
  const wantRowGap = contract.rowGap

  const display = String(wrap.display || '').trim().toLowerCase()
  const isGridImpl = display === 'grid'
  const isFlexImpl =
    (display === 'flex' || display === 'inline-flex') &&
    String(wrap['flex-direction'] || 'row').trim().toLowerCase().startsWith('row') &&
    /wrap/.test(String(wrap['flex-wrap'] || ''))

  if (!isGridImpl && !isFlexImpl) {
    out.push({
      code: 'display',
      prop: 'display',
      actual: display || '(未声明)',
      want: 'grid 或 flex+row+wrap',
    })
  }

  // 列数 / 列宽
  if (isGridImpl) {
    const tpl = String(wrap['grid-template-columns'] || '')
    const repeatM = /repeat\(\s*(\d+)\s*,\s*([^)]+)\)/i.exec(tpl)
    if (repeatM) {
      const cols = Number(repeatM[1])
      const track = String(repeatM[2]).trim()
      if (cols !== wantCols) {
        out.push({
          code: 'grid-cols',
          prop: 'grid-template-columns',
          actual: `${cols} 列`,
          want: `${wantCols} 列`,
        })
      }
      const trackPx = parsePx(track)
      if (trackPx === null) {
        // 1fr / minmax() 等流式轨道：末行不满时会把卡拉伸 ⇒ 违反真值
        if (!contract.lastRowFull) {
          out.push({
            code: 'grid-track-fluid',
            prop: 'grid-template-columns',
            actual: track,
            want: `repeat(${wantCols}, ${wantW}px)`,
          })
        }
      } else if (Math.abs(trackPx - wantW) > TOL) {
        out.push({
          code: 'grid-track-width',
          prop: 'grid-template-columns',
          actual: `${trackPx}px`,
          want: `${wantW}px`,
        })
      }
    } else if (tpl.trim()) {
      out.push({
        code: 'grid-cols',
        prop: 'grid-template-columns',
        actual: tpl.trim(),
        want: `repeat(${wantCols}, ${wantW}px)`,
      })
    } else {
      out.push({
        code: 'grid-cols',
        prop: 'grid-template-columns',
        actual: '(未声明)',
        want: `repeat(${wantCols}, ${wantW}px)`,
      })
    }
  }

  // 行高（grid 实现）：必须由容器钉死，否则行高随内容/容器拉伸（单行网格会出「巨型卡」）
  let autoRows = null
  if (isGridImpl) {
    autoRows = parsePx(wrap['grid-auto-rows'])
    if (autoRows === null || Math.abs(autoRows - wantH) > TOL) {
      out.push({
        code: 'grid-auto-rows',
        prop: 'grid-auto-rows',
        actual: autoRows === null ? String(wrap['grid-auto-rows'] ?? '(未声明)') : `${autoRows}px`,
        want: `${wantH}px`,
      })
    }
  }

  // 间距（列距必判；行距仅在多行时判 —— 单行时 row-gap 无视觉影响）
  let rowGap = null
  let colGap = null
  const gapRaw = String(wrap.gap || '').trim()
  if (gapRaw) {
    const parts = gapRaw.split(/\s+/)
    rowGap = parsePx(parts[0])
    colGap = parsePx(parts[1] ?? parts[0])
  }
  if (wrap['row-gap'] != null) rowGap = parsePx(wrap['row-gap'])
  if (wrap['column-gap'] != null) colGap = parsePx(wrap['column-gap'])
  if (colGap === null || Math.abs(colGap - wantColGap) > TOL) {
    out.push({
      code: 'col-gap',
      prop: 'column-gap',
      actual: colGap === null ? String(wrap.gap ?? wrap['column-gap'] ?? '(未声明)') : `${colGap}px`,
      want: `${wantColGap}px`,
    })
  }
  if (contract.rows > 1 && wantRowGap !== null) {
    if (rowGap === null || Math.abs(rowGap - wantRowGap) > TOL) {
      out.push({
        code: 'row-gap',
        prop: 'row-gap',
        actual: rowGap === null ? String(wrap.gap ?? wrap['row-gap'] ?? '(未声明)') : `${rowGap}px`,
        want: `${wantRowGap}px`,
      })
    }
  }

  // 卡宽：flex 实现必须有固定基数；grid 实现不得写「会自算宽」的流式值
  const basis = fixedBasisOf(item)
  // grid 下 `width: 100%` / `flex: 1 1 0` 都是**惰性或等价**的（列宽已定）⇒ 不算违约；
  // 只有百分比基数（`calc(25% …)` / `width: 50%`）会真正改写卡宽 ⇒ 违约。
  const flexRaw = `${item.flex || ''} ${item['flex-basis'] || ''}`
  const flexPercent = STRETCH_RX.test(flexRaw)
  const widthRaw = String(item.width || '').trim()
  const widthPercent = /^(\d{1,3}(?:\.\d+)?)%$/.exec(widthRaw)
  const widthBad = /calc\s*\(/i.test(widthRaw) || (widthPercent && Number(widthPercent[1]) < 100)
  if (isGridImpl) {
    if (flexPercent || widthBad) {
      out.push({
        code: 'item-stretch',
        prop: 'flex/width',
        actual: String(item.flex || item.width || '').trim(),
        want: `flex: 0 0 ${wantW}px 或 width: ${wantW}px`,
      })
    } else if (basis !== null && Math.abs(basis - wantW) > TOL) {
      out.push({
        code: 'item-basis',
        prop: 'flex/width',
        actual: `${basis}px`,
        want: `${wantW}px`,
      })
    }
  } else if (basis === null || Math.abs(basis - wantW) > TOL) {
    out.push({
      code: 'item-basis',
      prop: 'flex/width',
      actual: basis === null ? String(item.flex || item.width || '(未声明)').trim() : `${basis}px`,
      want: `${wantW}px`,
    })
  }

  // 卡高：grid 实现下行高已由容器 `grid-auto-rows` 钉死 ⇒ 子项 height 不再判
  //   （子项常是**共享 class**，物理上改不了；判它只会产生永远消不掉的残留）
  if (!isGridImpl) {
    const h = parsePx(item.height)
    if (h === null || Math.abs(h - wantH) > TOL) {
      out.push({
        code: 'item-height',
        prop: 'height',
        actual: String(item.height || '(未声明)').trim(),
        want: `${wantH}px`,
      })
    }
  }

  return out
}

/**
 * 主判据：扫产物里每个「v-for 列表宿主」，按 section 树几何契约判定。
 *
 * @param {Array<{path:string, content:string}>} files 全量产物（需含样式文件）
 * @param {object} opts
 * @param {Array} opts.sections section 树（`layoutStructure.layout.sections` 或 `effectiveSections`）
 * @returns {{issues:Array, stats:Object}}
 */
export function detectGridListLayoutIssues(files, opts = {}) {
  const issues = []
  const stats = {
    vueFiles: 0,
    hosted: 0,
    contracts: 0,
    judged: 0,
    mismatches: 0,
    skippedNoSection: 0,
    skippedNoTruth: 0,
    skippedNoVFor: 0,
    skippedNoClass: 0,
  }
  const sections = toArray(opts.sections)
  if (sections.length === 0) return { issues, stats }
  const byId = indexSections(sections)
  const fileList = toArray(files).filter((f) => f && typeof f.content === 'string' && f.content)
  if (fileList.length === 0) return { issues, stats }
  const sources = collectStyleSources(fileList)
  const usage = buildClassUsage(fileList)
  /** 只保留「不被别的元素复用」的 class（改名/改样式才安全） */
  const unshared = (classes) => toArray(classes).filter((c) => (usage.get(c) || 0) === 1)

  for (const f of fileList) {
    const path = String(f.path || '')
    if (!/\.vue$/i.test(path)) continue
    stats.vueFiles += 1
    const pairs = findVForPairs(f.content, path)
    if (pairs.length === 0) {
      stats.skippedNoVFor += 1
      continue
    }
    let matchedAny = false
    for (const pair of pairs) {
      const hostAttrs = pair.parent?.attrs || ''
      const sid = sectionIdOf(hostAttrs)
      if (!sid) continue
      matchedAny = true
      stats.hosted += 1
      const sec = byId.get(sid)
      if (!sec) {
        stats.skippedNoSection += 1
        continue
      }
      const contract = buildGridContract(sec)
      if (!contract) {
        stats.skippedNoTruth += 1
        continue
      }
      stats.contracts += 1
      const wrapClasses = classAttrOf(hostAttrs)
      const itemClasses = classAttrOf(pair.item?.attrs || '')
      if (wrapClasses.length === 0 || itemClasses.length === 0) {
        stats.skippedNoClass += 1
        continue
      }
      const wrap = resolveElementDecls(sources, wrapClasses, inlineStyleOf(hostAttrs))
      const item = resolveElementDecls(sources, itemClasses, inlineStyleOf(pair.item?.attrs || ''))
      const found = judgeGridContract(contract, wrap, item)
      stats.judged += 1
      if (found.length === 0) continue
      stats.mismatches += 1
      const wrapperTargets = unshared(wrapClasses)
      const itemTargets = unshared(itemClasses)
      if (wrapperTargets.length === 0) {
        stats.skippedNoClass += 1
      }
      issues.push({
        id: 'GRID-CONTRACT-001',
        severity: 'WARN',
        file: path,
        sectionId: sid,
        wrapperClass: wrapperTargets[0] || wrapClasses[0],
        wrapperClasses: wrapperTargets,
        itemClasses: itemTargets,
        contract,
        violations: found,
        message:
          `折叠网格 ${sid}（${wrapClasses[0]}）与设计稿几何契约不符：` +
          found.map((v) => `${v.prop} 实际 ${v.actual}，应 ${v.want}`).join('；') +
          `。真值 ${contract.cols} 列 × ${contract.cardW}×${contract.cardH}，列距 ${contract.colGap}` +
          `${contract.rowGap !== null ? `，行距 ${contract.rowGap}` : ''}（共 ${contract.itemCount} 项）`,
        hint: { suggestion: '按几何契约改写为 grid 固定列宽或 flex+固定基数（见 healGridListLayout）' },
      })
    }
    if (!matchedAny) stats.skippedNoSection += 1
  }
  return { issues, stats }
}

// ─────────────────────────────────────────────────────────────────────────
// 自愈（确定性改写为契约形态）
// ─────────────────────────────────────────────────────────────────────────

/** 从 `bodyStart` 处 `{` 的**前一位**开始找匹配的 `}`（支持嵌套） */
function findMatchingBrace(text, openIndex) {
  let depth = 0
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * 块体拆成「顶层声明区 head」+「嵌套规则区 tail」。
 * `&:hover { … }` 等嵌套 selector 文本属 tail，绝不当声明处理。
 */
function splitTopLevel(body) {
  const open = String(body || '').indexOf('{')
  if (open < 0) return { head: String(body || ''), tail: '' }
  let i = open - 1
  while (i >= 0 && !/[};]/.test(body[i])) i--
  const cut = i + 1
  return { head: body.slice(0, cut), tail: body.slice(cut) }
}

/** 在顶层声明区做「删属性 / 条件删 / 前置插入」（保留无法解析的片段，如注释） */
function editDeclHead(head, { removeProps = [], removeWhen = null, add = [] } = {}) {
  const segs = String(head || '').split(';')
  const tailSeg = segs.pop() ?? ''
  const kept = []
  for (const seg of segs) {
    const m = /^\s*([a-zA-Z-]+)\s*:\s*([\s\S]*)$/.exec(seg)
    if (!m) {
      if (seg.trim()) kept.push(seg) // 注释等原样保留
      continue
    }
    const prop = m[1].toLowerCase()
    const val = m[2].trim()
    if (removeProps.includes(prop)) continue
    if (removeWhen && removeWhen(prop, val)) continue
    kept.push(seg)
  }
  let tailKept = tailSeg
  const tm = /^\s*([a-zA-Z-]+)\s*:\s*([\s\S]*)$/.exec(tailSeg)
  if (tm) {
    const prop = tm[1].toLowerCase()
    if (removeProps.includes(prop) || (removeWhen && removeWhen(prop, tm[2].trim()))) tailKept = ''
  }
  const addTxt = add.filter(Boolean).map((d) => `\n  ${d};`).join('')
  const bodyTxt = kept.length ? `${kept.join(';')};` : ''
  // 保留原有尾部空白（含换行）——丢了会写出 `width: 100%;}`，块尾与 `}` 粘连（可读性 + 正则锚点双重受损）
  const trail = /[ \t\r\n]*$/.exec(String(head || ''))[0]
  return addTxt + bodyTxt + (tailKept.trim() ? tailKept : trail)
}

/**
 * 改写某个 class 的全部**顶级规则块**（跳过 `:hover`/`&`/后代/子选择器）。
 * @returns {string} 新文本（未改返回原引用值）
 */
function rewriteClassBlocks(cssText, cls, fn) {
  const text = String(cssText || '')
  if (!text || !cls) return cssText
  const esc = String(cls).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const headRx = new RegExp(`\\.${esc}(?![\\w-])[^{};]*\\{`, 'g')
  let out = ''
  let cursor = 0
  let changed = false
  let m
  while ((m = headRx.exec(text)) !== null) {
    const sel = m[0].slice(0, -1)
    // 伪类/嵌套/后代/子选择器一律跳过（它们不是「该元素的常态声明」）
    if (/[:&>+~]/.test(sel)) continue
    const bodyStart = m.index + m[0].length
    const bodyEnd = findMatchingBrace(text, bodyStart - 1)
    if (bodyEnd < 0) continue
    const body = text.slice(bodyStart, bodyEnd)
    const { head, tail } = splitTopLevel(body)
    const newHead = fn(head)
    if (newHead !== head) {
      const newBody = newHead + tail
      out += text.slice(cursor, bodyStart) + newBody
      cursor = bodyEnd
      changed = true
    }
    headRx.lastIndex = bodyEnd
  }
  if (!changed) return cssText
  return out + text.slice(cursor)
}

/** 只在样式区改（.less/.css 全文；.vue 仅 `<style>` 内部） */
function mapStyleRegions(content, path, fn) {
  if (typeof content !== 'string' || !content) return content
  if (/\.(less|css)$/i.test(path)) return fn(content)
  if (/\.vue$/i.test(path)) {
    return content.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (w, a, b, c) => a + fn(b) + c)
  }
  return content
}

function clampInt(n) {
  return Number.isFinite(n) ? Math.round(n) : 0
}

function canonicalWrapperDecls(contract) {
  const decls = [
    'display: grid',
    `grid-template-columns: repeat(${clampInt(contract.cols)}, ${clampInt(contract.cardW)}px)`,
    // 🔴 真机实测（mc-1792580393960-e326a910 截图）：缺 `grid-auto-rows` 时行高由内容决定
    //   ⇒ 子项上的 `height: 30px` 无法表达（子项若是**共享 class** 更压根改不了），
    //   而单行网格（战略段）会把行拉伸到容器高度 ⇒ 出现「巨型卡」。
    //   行高必须由容器钉死，卡高才与设计稿一致。
    `grid-auto-rows: ${clampInt(contract.cardH)}px`,
    `column-gap: ${clampInt(contract.colGap)}px`,
  ]
  if (contract.rows > 1 && contract.rowGap !== null) {
    decls.push(`row-gap: ${clampInt(contract.rowGap)}px`)
  } else {
    decls.push('row-gap: 0px')
  }
  decls.push('align-content: start')
  return decls
}

const WRAPPER_DROP = [
  'display',
  'flex-direction',
  'flex-wrap',
  'flex-flow',
  'gap',
  'row-gap',
  'column-gap',
  'grid-template-columns',
  'grid-auto-columns',
  'grid-auto-rows',
  'align-content',
  'justify-content',
]

/**
 * 主自愈：把违约的折叠网格宿主/子项确定性改写为几何契约形态（幂等）。
 *
 * @param {Array<{path:string, content:string}>} files
 * @param {Array} issues detectGridListLayoutIssues 的 issues
 * @returns {{files:Array, healed:Array, failed:Array, unchanged:Array}}
 */
/** 样式文本里是否存在该 class 的**顶级规则块**（`:hover` 等不算） */
function hasClassBlock(cssText, cls) {
  const text = String(cssText || '')
  if (!text || !cls) return false
  const esc = String(cls).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rx = new RegExp(`\\.${esc}(?![\\w-])[^{};]*\\{`, 'g')
  let m
  while ((m = rx.exec(text)) !== null) {
    if (!/[:&>+~]/.test(m[0].slice(0, -1))) return true
  }
  return false
}

export function healGridListLayout(files, issues) {
  const out = toArray(files).map((f) => ({ ...f }))
  const healed = []
  const failed = []
  const unchanged = []
  const list = toArray(issues).filter((i) => i && i.contract)

  for (const issue of list) {
    const contract = issue.contract
    const wrapClasses = toArray(issue.wrapperClasses).length
      ? toArray(issue.wrapperClasses)
      : toArray([issue.wrapperClass]).filter(Boolean)
    const itemClasses = toArray(issue.itemClasses)
    const codes = new Set(toArray(issue.violations).map((v) => v.code))
    if (wrapClasses.length === 0) {
      failed.push({ sectionId: issue.sectionId, reason: 'no-wrapper-class' })
      continue
    }
    // 契约声明写进**第一个未被复用的宿主 class**；其余宿主 class 只删冲突声明（防层叠后写者胜）
    const canonicalCls = wrapClasses[0]
    const wrapperAdd = canonicalWrapperDecls(contract)
    const itemHeightBad = codes.has('item-height')
    const itemStretch = codes.has('item-stretch') || codes.has('item-basis')

    let touched = 0
    let anyBlockFound = false
    for (const f of out) {
      const p = String(f.path || '')
      const before = f.content
      f.content = mapStyleRegions(f.content, p, (css) => {
        if (!anyBlockFound && wrapClasses.some((cls) => hasClassBlock(css, cls))) {
          anyBlockFound = true
        }
        let next = css
        for (const cls of wrapClasses) {
          next = rewriteClassBlocks(next, cls, (head) =>
            editDeclHead(head, {
              removeProps: WRAPPER_DROP,
              add: cls === canonicalCls ? wrapperAdd : [],
            }),
          )
        }
        for (const cls of itemClasses) {
          next = rewriteClassBlocks(next, cls, (head) =>
            editDeclHead(head, {
              removeProps: itemHeightBad ? ['height'] : [],
              removeWhen: (prop, val) => {
                if (!itemStretch) return false
                // 改 grid 后列宽由 `grid-template-columns` 接管 ⇒ 子项的 flex/width 一律删除
                // （`flex: 1 1 0` 在 grid 里本就惰性，留着只会让后来人误判成 flex 布局）
                return prop === 'flex' || prop === 'flex-basis' || prop === 'width'
              },
              add: itemHeightBad ? [`height: ${clampInt(contract.cardH)}px`] : [],
            }),
          )
        }
        return next
      })
      if (f.content !== before) touched += 1
    }

    if (touched > 0) {
      healed.push({
        sectionId: issue.sectionId,
        wrapperClass: canonicalCls,
        wrapperClasses: wrapClasses,
        itemClasses,
        codes: [...codes],
        files: touched,
      })
    } else if (anyBlockFound) {
      // 已是契约形态（或本刀改不动）⇒ 幂等无变更，不算失败
      unchanged.push({ sectionId: issue.sectionId, wrapperClasses: wrapClasses, codes: [...codes] })
    } else {
      failed.push({
        sectionId: issue.sectionId,
        reason: 'no-rule-block',
        wrapperClasses: wrapClasses,
        itemClasses,
      })
    }
  }

  return { files: out, healed, failed, unchanged }
}

export default detectGridListLayoutIssues
