/**
 * 🛡️ 段内成员 DOM 真值对账（2026-11-17 · mc-max-1794891630233-96b16ae5 实锤）— 纯函数、零 IO。
 *
 * 病灶：`buildDeterministicIndexTemplate` 只确定性装配 `index.vue`，**子组件内部 DOM 由
 *   LLM 自述**（code-generator.js 原话「LLM 只负责每个子组件内部的 DOM」）⇒ 同一产物里
 *   三个**同构**成员出现三种写法：
 *     · 行1 `ContentSection.vue`：`<img 28×28>` + 空 `<div class="…-icon">` + 两个 span
 *       （label-text / label-time）⇒ ① 多一份臆造图标位；② 容器零 display/flex-direction
 *       ⇒ 两个 span 走 inline 流**横排**，真值两行塌成一行；
 *     · 行2 `ContentSection3.vue`：`<div class="…-icon"><img></div>` + column label ⇒ 正确；
 *     · 行4 `ContentSection4.vue`：`<img>` + 空 `<div class="…-rain-icon">` + 单 div
 *       含 `'降雨量\n15:34'`（class 已 `white-space:pre-line`）⇒ label 正确、空槽仍多余。
 *   Figma 真值（1:377 子树恰 3 叶）：`1:385 FRAME icon-1 28×28` / `1:384 TEXT '环境温度\n15:34'` /
 *   `1:387 TEXT '枫港大桥温度到达55℃'`。逐像素对账：空槽吃掉 `28 + gap 9 = 37px`
 *   ⇒ label 左边界 rel 86，真值 45.4（偏右 40.6，其中 37 来自这个凭空多出的槽）。
 *
 * ── 判据（两条，均无量纲 / 零图层名 / 零类名特判）─────────────────────────────
 *   F3「重复图标载体」= 同时满足：
 *     Ⓐ 子树**无任何可渲染内容** —— 直接复用 icon-truth-conservation 的 `subtreeHasContent`
 *        （含文本 / `{{ }}` / img|svg|canvas / v-* 指令 / **PascalCase 组件标签** ⇒ 有内容）；
 *     Ⓑ 节点自身 inline style 或自身 class 声明了 **width 与 height（px）**，且与**同一父节点下
 *        已渲染 `<img>` 的声明尺寸相等**（同尺寸 = 同一图标位的第二份载体，不是布局占位）；
 *     Ⓒ 带 `ref=` / `id=` 的一律不碰（图表挂载点 / JS 锚点，形状可能恰好是正方形）；
 *     Ⓓ 只取最外层（`<div><i/><i/></div>` 只算一块，不重复计数）。
 *     ⇒ 删除该空槽。真值侧前提由调用方保证：该 section 已有渲染 `<img>`（否则不删，宁留勿丢）。
 *
 *   F2「多行文本被压成一行」= 同时满足：
 *     Ⓐ 容器直接子节点 ≥2，且**每个**子节点都是纯静态文本叶子
 *        （无子元素、无 v-* 指令、无 `{{ }}`、无 img/svg/canvas、非组件标签）；
 *     Ⓑ 子节点静态文本拼接（去全部空白）=== Figma 真值中**同一 section** 某个含 `\n` 的
 *        TEXT 节点的 characters（去全部空白）；
 *     Ⓒ 容器自身（inline style + 自身 class 声明，**不继承、不猜祖先**）没有 `flex-direction:column`；
 *     ⇒ 在开标签上追加元素级 inline `display:flex;flex-direction:column`（inline 恒胜；
 *       **绝不改 class 规则** —— 同名类被多元素复用，改一处污染多处）。
 *   F2b（模板字面量含 `\n` 的纯文本叶子）：自身无 `white-space:pre*` 声明、且无 `nowrap`
 *     ⇒ 追加 `white-space:pre-line`（`\n` 是作者显式换行意图）。
 *
 * 硬约束：
 *   · **fail-open**：无 Figma 树 / 无 `data-section-id` 精确命中 / 尺寸判不出 / 文本含 `{{ }}`
 *     ⇒ 一律原样返回，绝不猜。
 *   · **幂等**：改写后重跑 ⇒ Ⓒ 命中（已 column）、空槽已删 ⇒ 零改动。
 *   · **纯函数、零 IO、原地修改 files**（与写盘出口其它刀同构）。
 *   · 与 P0-d 同向不冲突：`subtreeHasContent` 是**唯一实现**（不复制判据），组件标签永不删。
 */

import { templateRange, collectSectionIds } from './resource-img-src-healer.js'
import {
  parseTemplateTree,
  subtreeHasContent,
  collectRenderedImgVars,
} from './icon-truth-conservation.js'
import { indexFigmaNodes, unwrapFigmaRoot } from './card-inner-layout-truth.js'
import { parseCssRules, classesInFragment } from './css-selector-facts.js'

/* ── 样式事实（class → 声明体；只做采集，不含裁决）────────────────────────── */

/**
 * 从全产物样式文件建 `class → { self, desc }` 事实索引（解析统一走
 * `css-selector-facts.parseCssRules`，判据单一来源，杜绝两份正则漂移）。
 *
 * 🔴 两条归因口径**必须分离**（2026-11-17 实证：旧实现把声明挂给选择器里所有 class，
 *    F3 空槽判据全靠这个缺陷"碰巧"命中 —— 只取 subject 会让 F3 判不出尺寸、静默全失效）：
 *   · `self` = 该 class 作为 **subject**（最后一个复合选择器）出现的声明体 ⇒ flex-direction /
 *     white-space 这类「元素自身事实」只能用它；
 *   · `desc` = 该 class 作为**祖先**出现、且 subject 能判出 px w/h 的声明体 ⇒ 「这个容器承载的
 *     内容位尺寸」。空槽 `.c-monitor-icon` 自身无 width/height，图标位尺寸真值恰恰写在
 *     `.c-monitor-frame .c-monitor-icon .c-monitor-icon-img{28×28}` 的后代上 —— 这里才是它的
 *     正确归属，而不是把 28×28 冒充成 `.c-monitor-icon` 的自身尺寸。
 */
export function buildClassDeclIndex(files) {
  const index = new Map() // class -> { self: string, desc: string }
  const bump = (cls, field, decl) => {
    const cur = index.get(cls) || { self: '', desc: '' }
    cur[field] = cur[field] ? `${cur[field]};${decl}` : decl
    index.set(cls, cur)
  }
  const take = (css) => {
    for (const rule of parseCssRules(css)) {
      const chain = rule.selector
      const decl = String(rule.decl || '').trim()
      if (!chain || chain.length === 0 || !decl) continue
      for (const c of classesInFragment(chain[chain.length - 1])) bump(c, 'self', decl)
      // 祖先归因：只收「该祖先容器内的内容位尺寸」，且必须是可判读的 px 宽高
      if (chain.length >= 2 && pxSizeOfDecl(decl)) {
        const seen = new Set()
        for (let i = 0; i < chain.length - 1; i += 1) {
          for (const c of classesInFragment(chain[i])) {
            if (seen.has(c)) continue
            seen.add(c)
            bump(c, 'desc', decl)
          }
        }
      }
    }
  }
  for (const [p, content] of Object.entries(files || {})) {
    if (typeof content !== 'string') continue
    if (/\.vue$/.test(p)) {
      const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi
      let s
      while ((s = styleRe.exec(content)) !== null) take(s[1])
    } else if (/\.(less|css)$/.test(p)) {
      take(content)
    }
  }
  return index
}

/** class 的**自身**声明体（subject 归因）。 */
function selfDeclOfNodeClass(cls, declIndex) {
  const fact = declIndex.get(cls)
  return (fact && fact.self) || ''
}

/** class 的「祖先容器内容位尺寸」声明体（祖先归因，只用于图标位判据）。 */
function descDeclOfNodeClass(cls, declIndex) {
  const fact = declIndex.get(cls)
  return (fact && fact.desc) || ''
}

/* ── DOM 事实 ───────────────────────────────────────────────────────────── */

/** 元素级 inline style（排除 `:style` / `v-bind:style` 绑定）。 */
function inlineStyleOf(attrs) {
  const m = /(?<![:.\w-])style\s*=\s*["']([^"']*)["']/i.exec(String(attrs || ''))
  return m ? m[1] : ''
}

/** 节点自身声明体 = inline style + 自身 class 的样式规则（不含祖先、不含后代）。 */
function declOf(node, declIndex) {
  const parts = [inlineStyleOf(node.attrs)]
  for (const c of node.classes || []) parts.push(selfDeclOfNodeClass(c, declIndex))
  return parts.join(';')
}

/** 节点 class 承载的「内容位尺寸」声明体（后代归因；仅供 sizeOfNode 兜底）。 */
function descDeclOfNode(node, declIndex) {
  const parts = []
  for (const c of node.classes || []) parts.push(descDeclOfNodeClass(c, declIndex))
  return parts.join(';')
}

const PX_RE = (prop) => new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)px`, 'i')

/** 从声明体取 width/height（只认 px；rem/%/auto/vw 一律判不出）。 */
function pxSizeOfDecl(decl) {
  const wm = PX_RE('width').exec(decl)
  const hm = PX_RE('height').exec(decl)
  if (!wm || !hm) return null
  const w = Number(wm[1])
  const h = Number(hm[1])
  if (!(w > 0) || !(h > 0)) return null
  return { w, h }
}

/**
 * 节点尺寸：自身声明优先；自身判不出时退回「该容器承载的内容位尺寸」。
 * 后者是 F3 的**必要**兜底 —— 真机 `.c-monitor-icon` 自身零尺寸声明，图标位尺寸
 * 写在它的后代 `.c-monitor-icon-img{28×28}` 上（反而旧实现是靠归因缺陷把它算成自身尺寸）。
 */
function sizeOfNode(node, declIndex) {
  return pxSizeOfDecl(declOf(node, declIndex)) || pxSizeOfDecl(descDeclOfNode(node, declIndex))
}

/** 子树是否为「纯静态文本叶子」（F2 Ⓐ）。 */
function isStaticTextLeaf(node) {
  return (
    node.children.length === 0 &&
    node.hasText === true &&
    !node.hasRenderable &&
    !/^[A-Z]/.test(String(node.tag || '')) &&
    !/\bid\s*=|\bref\s*=/.test(node.attrs || '')
  )
}

/** 子树内静态文本（剥标签；含 `{{ }}` 时返回 null ⇒ 调用方 fail-open）。 */
function subtreeStaticText(body, node) {
  if (node.closeStart == null || node.closeEnd == null) return null
  const inner = String(body).slice(node.openEnd, node.closeStart)
  if (/\{\{/.test(inner)) return null
  const text = inner.replace(/<[^>]*>/g, ' ').replace(/\s+/g, '')
  return text || null
}

const squash = (s) => String(s || '').replace(/\s+/g, '')

/* ── 真值侧：同一 section 树里含换行的 TEXT ───────────────────────────────── */

/**
 * @returns {string[]} 归一化（去空白）的 characters 列表
 */
export function collectMultilineTextTruths(figmaRoot, sectionIds) {
  const root = unwrapFigmaRoot(figmaRoot)
  if (!root) return []
  const idx = indexFigmaNodes(root)
  const sids = Array.isArray(sectionIds) ? sectionIds.filter(Boolean) : []
  const scopes = []
  for (const sid of sids) {
    const node = idx.get(String(sid))
    if (node) scopes.push(node)
  }
  // 无 data-section-id 精确命中 ⇒ 不兜全树（跨段字符串相等匹配会误伤），fail-open
  if (scopes.length === 0) return []
  const out = []
  const seen = new Set()
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    if (n.type === 'TEXT') {
      const chars = n.characters
      if (typeof chars === 'string' && /\n/.test(chars)) {
        const k = squash(chars)
        if (k.length >= 2 && !seen.has(k)) {
          seen.add(k)
          out.push(k)
        }
      }
    }
    for (const c of n.children || []) walk(c)
  }
  for (const s of scopes) walk(s)
  return out
}

/* ── F3：重复图标载体（空槽）────────────────────────────────────────────── */

/**
 * 找「与同父 `<img>` 尺寸相同、且自身零内容的空槽」——只取最外层。
 * @param {string} templateBody
 * @param {Map<string,string>} declIndex
 * @returns {Array<{openStart:number,openEnd:number,closeStart:number,closeEnd:number,classes:string[],tag:string,size:{w:number,h:number}}>}
 */
export function findDuplicateIconSlots(templateBody, declIndex) {
  const roots = parseTemplateTree(String(templateBody || ''))
  const hits = []
  const walk = (node) => {
    const parent = node.parent
    if (parent && parent.children.length >= 2 && !subtreeHasContent(node)) {
      const own = sizeOfNode(node, declIndex)
      if (own && !/\b(?:ref|id)\s*=/.test(node.attrs || '')) {
        const imgSizes = parent.children
          .filter((c) => c.tag === 'img')
          .map((c) => sizeOfNode(c, declIndex))
          .filter(Boolean)
        if (
          imgSizes.some(
            (s) => Math.abs(s.w - own.w) <= 0.5 && Math.abs(s.h - own.h) <= 0.5,
          )
        ) {
          hits.push({
            openStart: node.openStart,
            openEnd: node.openEnd,
            closeStart: node.closeStart,
            closeEnd: node.closeEnd,
            classes: node.classes.slice(),
            tag: node.tag,
            size: own,
          })
        }
      }
    }
    for (const c of node.children) walk(c)
  }
  for (const r of roots) walk(r)
  const hitSet = new Set(hits)
  return hits.filter(
    (h) =>
      h.closeEnd != null &&
      h.closeEnd > h.openStart &&
      !hits.some(
        (o) => o !== h && o.openStart < h.openStart && o.closeEnd > h.closeEnd && hitSet.has(o),
      ),
  )
}

/* ── F2：多行文本被压成一行 ─────────────────────────────────────────────── */

/**
 * 找「≥2 个纯静态文本叶子、拼接命中真值含 `\n` 的 TEXT、但容器未 column」的组。
 * @returns {Array<{node:object,openStart:number,openEnd:number,truth:string,attrInsert:number}>}
 */
export function findFlattenedTextGroups(templateBody, truths, declIndex) {
  if (!Array.isArray(truths) || truths.length === 0) return []
  const truthSet = new Set(truths.map(squash).filter((t) => t.length >= 2))
  const roots = parseTemplateTree(String(templateBody || ''))
  const hits = []
  const walk = (node) => {
    const kids = node.children
    if (kids.length >= 2 && kids.every(isStaticTextLeaf)) {
      const joined = kids.map((k) => subtreeStaticText(templateBody, k) || '').join('')
      if (joined && truthSet.has(squash(joined))) {
        const decl = declOf(node, declIndex)
        if (!/flex-direction\s*:\s*column/i.test(decl)) {
          hits.push({ node, openStart: node.openStart, openEnd: node.openEnd, truth: squash(joined) })
        }
      }
    }
    for (const c of kids) walk(c)
  }
  for (const r of roots) walk(r)
  return hits
}

/**
 * F2b：纯文本叶子、模板静态文本含 `\n`、自身无 `white-space:pre*` 且非 nowrap。
 * @returns {Array<{openStart:number,openEnd:number}>}
 */
export function findLiteralNewlineLeaves(templateBody, declIndex) {
  const roots = parseTemplateTree(String(templateBody || ''))
  const hits = []
  const walk = (node) => {
    if (node.children.length === 0 && node.hasText && !node.hasRenderable) {
      if (node.closeStart == null) return
      const inner = String(templateBody).slice(node.openEnd, node.closeStart)
      if (/\{\{/.test(inner)) return
      // 🔴 只认「作者写的换行」：先把首尾纯缩进空白剥掉。
      //    源码格式化的收尾换行（`…55℃\n    </div>`）是缩进，不是换行意图 ——
      //    mc-max-1794893135171-f7db51db 实锤：单行文本被误判成多行，白加
      //    `white-space:pre-line`（真渲染会多出一个空行）。
      const text = inner.trim()
      const lines = text.split('\n').filter((s) => s.trim().length > 0)
      if (lines.length >= 2) {
        const decl = declOf(node, declIndex)
        const hasPre = /white-space\s*:\s*pre(?:-line|-wrap)?\b/i.test(decl)
        const nowrap = /white-space\s*:\s*nowrap/i.test(decl)
        if (!hasPre && !nowrap) hits.push({ openStart: node.openStart, openEnd: node.openEnd })
      }
    }
    for (const c of node.children) walk(c)
  }
  for (const r of roots) walk(r)
  return hits
}

/* ── 编辑应用 ───────────────────────────────────────────────────────────── */

/**
 * 在开标签上合并/追加元素级 inline style（inline 恒胜）。
 * 已有 `style="…"` ⇒ 追加在末尾；只有 `:style` 绑定 ⇒ 新建一个静态 `style`。
 */
export function withInlineStyle(openTag, decl) {
  const tag = String(openTag || '')
  const add = String(decl || '').trim().replace(/;+$/, '')
  if (!add) return tag
  const m = /(?<![:.\w-])style\s*=\s*(["'])([\s\S]*?)\1/i.exec(tag)
  if (m) {
    const prev = m[2].trim().replace(/;+$/, '')
    const next = prev ? `${prev};${add};` : `${add};`
    return tag.slice(0, m.index) + `style="${next}"` + tag.slice(m.index + m[0].length)
  }
  const close = tag.lastIndexOf('>')
  if (close === -1) return tag
  const selfClose = /\/\s*$/.test(tag.slice(0, close))
  const at = selfClose ? tag.lastIndexOf('/', close) : close
  return `${tag.slice(0, at)} style="${add};"${tag.slice(at)}`
}

/* ── 主体 ───────────────────────────────────────────────────────────────── */

/** 恒打计数行的唯一格式来源（0 也打，杜绝「没跑」与「零命中」不可分）。 */
export function formatSectionMemberDomTruthLog(stats) {
  const s = stats || {}
  return {
    message:
      `sectionMemberDomTruth:evaluated=${Number(s.evaluated) || 0},` +
      `files=${Number(s.files) || 0},multilineTruths=${Number(s.multilineTruths) || 0},` +
      `textGroups=${Number(s.textGroups) || 0},textFlips=${Number(s.textFlips) || 0},` +
      `newlineLeaves=${Number(s.newlineLeaves) || 0},` +
      `iconSlots=${Number(s.iconSlots) || 0},slotRemoved=${Number(s.slotRemoved) || 0},` +
      `verdict=${s.verdict || 'no-evidence'}`,
    meta: { skipped: (s.skipped || []).slice(0, 8) },
  }
}

export function mergeSectionMemberDomTruthStats(a, b) {
  if (!a) return { ...b, skipped: [...(b?.skipped || [])] }
  const out = { ...a }
  for (const k of [
    'evaluated',
    'files',
    'multilineTruths',
    'textGroups',
    'textFlips',
    'newlineLeaves',
    'iconSlots',
    'slotRemoved',
  ]) {
    out[k] = (Number(a[k]) || 0) + (Number(b[k]) || 0)
  }
  out.verdict =
    out.textFlips + out.slotRemoved > 0
      ? 'healed'
      : a.verdict === 'healed'
        ? 'healed'
        : b.verdict
  out.skipped = [...(a.skipped || []), ...(b.skipped || [])]
  return out
}

function emptyStats(reason) {
  return {
    evaluated: 0,
    files: 0,
    multilineTruths: 0,
    textGroups: 0,
    textFlips: 0,
    newlineLeaves: 0,
    iconSlots: 0,
    slotRemoved: 0,
    verdict: 'no-evidence',
    skipped: [reason],
  }
}

/**
 * 段内成员 DOM 真值对账。入参 files 会被**原地修改**（与写盘出口其它刀一致）。
 * @param {Record<string,string>} files
 * @param {{figmaRoot?:object, declIndex?:Map<string,string>, logger?:object, silent?:boolean}} [opts]
 *   declIndex 必须由调用方用**全量样式文件**预建后传入（写盘出口逐文件循环里只有单个 .vue，
 *   拿不到 common.less ⇒ 不传就 fail-open 假绿）。
 * @returns {{files:object, stats:object, changes:Array}}
 */
export function healSectionMemberDomTruth(files, opts = {}) {
  if (!files || typeof files !== 'object') return { files, stats: emptyStats('no-files'), changes: [] }
  const { figmaRoot, logger } = opts
  const declIndex = opts.declIndex instanceof Map ? opts.declIndex : buildClassDeclIndex(files)
  const stats = {
    evaluated: 1,
    files: 0,
    multilineTruths: 0,
    textGroups: 0,
    textFlips: 0,
    newlineLeaves: 0,
    iconSlots: 0,
    slotRemoved: 0,
    verdict: 'clean',
    skipped: [],
  }
  const changes = []

  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== 'string' || !/\.vue$/.test(path)) continue
    const range = templateRange(content)
    if (!range) {
      stats.skipped.push(`${path}:no-template`)
      continue
    }
    stats.files += 1

    const sectionIds = collectSectionIds(content)
    const truths = collectMultilineTextTruths(figmaRoot, sectionIds)
    stats.multilineTruths += truths.length
    if (truths.length === 0 && sectionIds.length === 0) {
      stats.skipped.push(`${path}:no-section-scope`)
    }

    const renderedImgs = collectRenderedImgVars(range.body)
    const edits = []

    /* F2 */
    if (truths.length > 0) {
      const groups = findFlattenedTextGroups(range.body, truths, declIndex)
      stats.textGroups += groups.length
      for (const g of groups) {
        const openTag = range.body.slice(g.openStart, g.openEnd)
        const nextTag = withInlineStyle(openTag, 'display:flex;flex-direction:column')
        if (nextTag === openTag) continue
        edits.push({
          start: range.start + g.openStart,
          end: range.start + g.openEnd,
          text: nextTag,
          kind: 'text-direction',
        })
        stats.textFlips += 1
      }
      const leaves = findLiteralNewlineLeaves(range.body, declIndex)
      stats.newlineLeaves += leaves.length
      for (const l of leaves) {
        const openTag = range.body.slice(l.openStart, l.openEnd)
        const nextTag = withInlineStyle(openTag, 'white-space:pre-line')
        if (nextTag === openTag) continue
        edits.push({
          start: range.start + l.openStart,
          end: range.start + l.openEnd,
          text: nextTag,
          kind: 'text-newline',
        })
        stats.textFlips += 1
      }
    }

    /* F3 —— 真值侧前提：本文件确有已渲染 `<img>`（否则不删，宁留勿丢） */
    if (renderedImgs.size > 0) {
      const slots = findDuplicateIconSlots(range.body, declIndex)
      stats.iconSlots += slots.length
      for (const s of slots) {
        edits.push({
          start: range.start + s.openStart,
          end: range.start + s.closeEnd,
          text: '',
          kind: 'dup-icon-slot',
        })
        stats.slotRemoved += 1
      }
    }

    if (edits.length === 0) continue

    edits.sort((a, b) => b.start - a.start)
    let next = content
    for (const e of edits) next = next.slice(0, e.start) + e.text + next.slice(e.end)
    if (next === content) continue
    files[path] = next
    changes.push({ file: path, edits: edits.map((e) => e.kind) })
    if (!opts.silent && logger) {
      logger.warn(`🛡️ 段内成员 DOM 真值对账：${path} 已收口`, {
        edits: edits.map((e) => e.kind),
      })
    }
  }

  if (stats.textFlips + stats.slotRemoved > 0) stats.verdict = 'healed'
  return { files, stats, changes }
}
