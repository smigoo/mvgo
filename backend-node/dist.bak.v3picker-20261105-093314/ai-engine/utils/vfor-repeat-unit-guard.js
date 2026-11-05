/**
 * 🛡️ vfor-repeat-unit-guard.js —— v-for 重复单元「几何真值」纠偏（检出 + 确定性自愈）。
 *
 * ## 病灶（2026-10-20 · mc-max-1792459868164-47647fae 实锤，同族第三起）
 *
 * 设计 = 6 张卡**纵向**列表（真值树 6 个同名 `Group 2136638414` 实例：同 x、y 递增 92，
 * 单卡 430×41）。产物：
 *   · wrapper（子组件根，锚定**卡原型**段 48:5801）`flex-direction: row` ⇒ 6 卡横排；
 *   · item（v-for 元素，无 data-section-id）`width:100%; height:100%` ⇒ 每项占满容器宽；
 *   ⇒ 总宽 600% 横向溢出，「只见第一卡」。
 *
 * **既有两道防线为什么都没拦住**：
 *   · vfor-list-direction-guard（刀 30）：真值源是 section 树。E1 未折叠出 `-list` 段时
 *     走「集合段」分支——wrapper 期望错取为叶子段自身 layout（row = 卡**内**方向）⇒
 *     产物 row 碰巧匹配 ⇒ 零告警（判定域 ≠ 事实落点，第三次同型）。
 *   · percent-height-resolver（⑪）：判定域是「类名三明治」（-card/-list-…-con 等），
 *     `group-2136638414` 这类 Figma 原名类不在域内；且 v-for item 无 sid ⇒ NO_TRUTH。
 *
 * ## 本守卫判据（几何真值，命名无关）
 *
 * 与 section 树/类名模式**完全解耦**，直接用 figma 原始树的**重复实例几何**：
 *   1. 锚定：v-for 元素自身 sid ⇒ 否则 DOM 最近祖先 sid。
 *   2. 重复组发现（两级）：
 *      甲·锚节点有 ≥2 个**同名同尺寸兄弟**（锚即 item 原型，47647fae 形态）；
 *      乙·锚节点的 children 里有 ≥2 个同名同尺寸子节点（锚即列表容器）。
 *   3. 方向真值：重复组实例 x 相同（±2）且 y 递增 ⇒ vertical；反之 horizontal；否则不判。
 *   4. 判定（窄条件，fail-open）：
 *      · vertical + item `height:100%` ⇒ HIT（每项都想要容器全高 ⇒ 溢出只见一项）；
 *      · horizontal + item `width:100%` ⇒ HIT（同理横向）；
 *      · 交叉方向（vertical+width:100% / horizontal+height:100%）= 合法，不判；
 *      · wrapper 实际方向 ≠ 几何方向真值 ⇒ HIT（仅当方向可解析）。
 *
 * ## heal（确定性，幂等，翻转全部出现点）
 *
 *   · item：该 class 全部规则体（common.less + 各 SFC <style>，跨文件）+ 静态 style 里的
 *     `height:100%` → `height:<真值h>px`（或横向时 width 同理）。真值即 Figma px 定值。
 *   · wrapper：`flex-direction` 翻转为几何真值方向（全部出现点，与刀 30 同纪律）。
 *
 * 纯函数、零运行时依赖（只 import vfor-list-direction-guard 的模板解析），可独立单测。
 */

import { findVForPairs } from './vfor-list-direction-guard.js'

/** 几何容差（px）：同名实例「同尺寸/同 x/y」判定。 */
const GEO_EPS = 2
/** 重复组最少实例数。 */
const MIN_GROUP = 2

const H100_RE = /height\s*:\s*100%/
const W100_RE = /width\s*:\s*100%/
const CLS_RE = /(?<![:\w-])class\s*=\s*(["'])([\s\S]*?)\1/
const STYLE_RE = /(?<![:\w-])style\s*=\s*(["'])([\s\S]*?)\1/
const SID_RE = /(?<![:\w-])data-section-id\s*=\s*(["'])([^"']+)\1/
const FLEX_DIR_RE = /flex-direction\s*:\s*(row-reverse|column-reverse|row|column)/

// 🛡️ 2026-10-20（ee06ee24 实锤）：LESS 嵌套规则体盲区治本（detect/heal 同源）。
//   旧实现 `[^{}]*` 规则体正则不兼容 `&:first-child{}` 等嵌套块 ⇒ 嵌套规则整段失配：
//   detect 在 SFC-only 输入下零检出（运行时尚无 index.css 扁平产物兜底），
//   heal 只打到编译产物、漏 SFC 源。以下三函数 brace 配对，detect/heal 共用。

/** 类规则块提取（brace 配对，支持嵌套）：返回 [{cls, bodyStart, bodyEnd}] */
const findClassRuleBlocks = (content) => {
  const blocks = []
  const re = /\.([\w-]+)\s*\{/g
  let m
  while ((m = re.exec(content)) !== null) {
    const bodyStart = m.index + m[0].length
    let depth = 1
    let i = bodyStart
    while (i < content.length && depth > 0) {
      if (content[i] === '{') depth++
      else if (content[i] === '}') depth--
      i++
    }
    if (depth === 0) blocks.push({ cls: m[1], bodyStart, bodyEnd: i - 1 })
  }
  return blocks
}

/** 指定 class 的规则块（边界 (?!\w|-) 防 .cls-2 误配） */
const findRuleBlocks = (content, cls) => {
  const blocks = []
  const re = new RegExp(`\\.${escRe(cls)}(?!\\w|-)\\s*\\{`, 'g')
  let m
  while ((m = re.exec(content)) !== null) {
    const bodyStart = m.index + m[0].length
    let depth = 1
    let i = bodyStart
    while (i < content.length && depth > 0) {
      if (content[i] === '{') depth++
      else if (content[i] === '}') depth--
      i++
    }
    if (depth === 0) blocks.push({ bodyStart, bodyEnd: i - 1 })
  }
  return blocks
}

/** 只保留深度 0 的顶层声明段（嵌套块剔除）——detect 信号只认顶层声明 */
const topLevelOnly = (text) => {
  let out = ''
  let i = 0
  let segStart = 0
  while (i < text.length) {
    if (text[i] === '{') {
      out += text.slice(segStart, i)
      let depth = 1
      let j = i + 1
      while (j < text.length && depth > 0) {
        if (text[j] === '{') depth++
        else if (text[j] === '}') depth--
        j++
      }
      i = j
      segStart = j
      continue
    }
    i++
  }
  out += text.slice(segStart)
  return out
}

/** 仅在深度 0 片段上跑 replacer（嵌套块原样保留）；返回 {out, hits} */
const replaceDepthZero = (text, re, replacer) => {
  let out = ''
  let segStart = 0
  let i = 0
  let hits = 0
  const flush = (end) => {
    const span = text.slice(segStart, end)
    re.lastIndex = 0
    out += span.replace(re, (...args) => {
      hits++
      return replacer(...args)
    })
  }
  while (i < text.length) {
    if (text[i] === '{') {
      flush(i)
      let depth = 1
      let j = i + 1
      while (j < text.length && depth > 0) {
        if (text[j] === '{') depth++
        else if (text[j] === '}') depth--
        j++
      }
      out += text.slice(i, j) // 嵌套块原样
      i = j
      segStart = j
      continue
    }
    i++
  }
  flush(text.length)
  return { out, hits }
}

/**
 * 从 figma 原始树建几何索引：id → {name, width, height, parentId}，parentId → children[]。
 * @param {object} figmaRoot {document:…} 或裸根
 */
export function buildGeometryIndex(figmaRoot) {
  const byId = new Map()
  const byParent = new Map()
  const doc = figmaRoot?.document || figmaRoot?.node || figmaRoot
  if (!doc || typeof doc !== 'object') return { byId, byParent }
  const walk = (node, parentId) => {
    if (!node || typeof node !== 'object') return
    const id = node.id != null ? String(node.id) : null
    if (id) {
      const bb = node.absoluteBoundingBox || {}
      byId.set(id, {
        name: String(node.name || ''),
        width: typeof bb.width === 'number' ? bb.width : null,
        height: typeof bb.height === 'number' ? bb.height : null,
        parentId,
      })
      if (parentId) {
        if (!byParent.has(parentId)) byParent.set(parentId, [])
        byParent.get(parentId).push(id)
      }
    }
    for (const c of node.children || []) walk(c, id)
  }
  walk(doc, null)
  return { byId, byParent }
}

/**
 * 重复组发现：返回 { instances:[{id,width,height,x,y}], direction:'vertical'|'horizontal'|null,
 * itemWidth, itemHeight, mode:'siblings'|'children' } 或 null。
 * 需要 absoluteBoundingBox 的 x/y —— 建索引时没存 x/y，这里重查树（锚定后局部查找，量小）。
 */
function discoverRepeatGroup(anchorId, figmaRoot) {
  const doc = figmaRoot?.document || figmaRoot?.node || figmaRoot
  if (!doc || !anchorId) return null
  // 找锚节点与其父
  let anchor = null
  let anchorParent = null
  const find = (n, parent) => {
    if (!n || typeof n !== 'object' || anchor) return
    if (String(n.id) === String(anchorId)) {
      anchor = n
      anchorParent = parent
      return
    }
    for (const c of n.children || []) find(c, n)
  }
  find(doc, null)
  if (!anchor) return null

  const geo = (n) => {
    const b = n?.absoluteBoundingBox || {}
    return { id: String(n.id), x: b.x, y: b.y, width: b.width, height: b.height }
  }

  // 甲：全局同名同尺寸组（锚 = item 原型，47647fae 真实形态——6 张卡的同名节点
  //   分散在 6 个**不同名**卡框父下，「同名兄弟」判不出来，必须跨父全局收集；
  //   散乱同名由下方方向判定过滤：x 同 y 递增 / y 同 x 递增 才成组，否则 null）。
  let group = null
  let mode = null
  const anchorBB = anchor.absoluteBoundingBox || {}
  const anchorName = String(anchor.name || '')
  if (anchorName) {
    const same = []
    const collect = (n) => {
      if (!n || typeof n !== 'object') return
      if (
        String(n.name || '') === anchorName &&
        Math.abs((n.absoluteBoundingBox?.width || 0) - (anchorBB.width || 0)) <= GEO_EPS &&
        Math.abs((n.absoluteBoundingBox?.height || 0) - (anchorBB.height || 0)) <= GEO_EPS
      ) {
        same.push(n)
      }
      for (const c of n.children || []) collect(c)
    }
    collect(doc)
    if (same.length >= MIN_GROUP) {
      group = same
      mode = 'siblings'
    }
  }
  // 乙：锚 children 里的同名同尺寸子组（锚 = 列表容器）
  if (!group) {
    const byName = new Map()
    for (const c of anchor.children || []) {
      const key = `${c.name}|${Math.round(c.absoluteBoundingBox?.width || 0)}|${Math.round(c.absoluteBoundingBox?.height || 0)}`
      if (!byName.has(key)) byName.set(key, [])
      byName.get(key).push(c)
    }
    for (const arr of byName.values()) {
      if (arr.length >= MIN_GROUP && String(arr[0].name || '') !== '') {
        group = arr
        mode = 'children'
        break
      }
    }
  }
  if (!group) return null

  const inst = group.map(geo).filter((g) => g.width != null && g.height != null && g.x != null && g.y != null)
  if (inst.length < MIN_GROUP) return null

  // 方向：x 全同（±eps）且 y 严格递增 ⇒ vertical；反之 horizontal
  const byY = [...inst].sort((a, b) => a.y - b.y)
  const xSame = byY.every((g) => Math.abs(g.x - byY[0].x) <= GEO_EPS)
  const yStrict = byY.every((g, i) => i === 0 || g.y - byY[i - 1].y > GEO_EPS)
  const byX = [...inst].sort((a, b) => a.x - b.x)
  const ySame = byX.every((g) => Math.abs(g.y - byX[0].y) <= GEO_EPS)
  const xStrict = byX.every((g, i) => i === 0 || g.x - byX[i - 1].x > GEO_EPS)
  let direction = null
  if (xSame && yStrict) direction = 'vertical'
  else if (ySame && xStrict) direction = 'horizontal'
  if (!direction) return null

  // item 尺寸：众数（重复组理应同尺寸，取首个即代表）
  return {
    instances: inst,
    direction,
    itemWidth: Math.round(inst[0].width),
    itemHeight: Math.round(inst[0].height),
    count: inst.length,
    mode,
  }
}

/** 收集元素全部 class 的所有规则体（跨文件 .less/.css/.vue style 段）+ 静态 style。 */
function collectSignals(attrs, corpusBodies) {
  const clsM = (attrs || '').match(CLS_RE)
  const styleM = (attrs || '').match(STYLE_RE)
  const classes = clsM ? clsM[2].split(/\s+/).filter(Boolean) : []
  const staticStyle = styleM ? styleM[2] : ''
  let h100 = H100_RE.test(staticStyle)
  let w100 = W100_RE.test(staticStyle)
  for (const c of classes) {
    for (const body of corpusBodies.get(c) || []) {
      if (H100_RE.test(body)) h100 = true
      if (W100_RE.test(body)) w100 = true
    }
  }
  return { classes, h100, w100 }
}

/**
 * 检出 v-for 重复单元几何矛盾。
 *
 * @param {Record<string,string>} files path → content
 * @param {object} ctx { figmaRoot }
 * @returns {{issues: Array, stats: object}}
 */
export function detectRepeatUnitIssues(files, ctx = {}) {
  const issues = []
  const stats = {
    vforElements: 0,
    anchored: 0,
    groupFound: 0,
    hits: 0,
    skippedNoAnchor: 0,
    skippedNoGroup: 0,
    skippedNoSignal: 0,
  }
  if (!files || typeof files !== 'object' || !ctx.figmaRoot) return { issues, stats }

  // 样式语料：class → 全部规则体（跨文件聚合，同名多份全收；brace 配对 + 只取顶层声明段）
  const corpusBodies = new Map()
  const pushLess = (text) => {
    if (typeof text !== 'string' || text.indexOf('{') < 0) return
    for (const b of findClassRuleBlocks(text)) {
      if (!corpusBodies.has(b.cls)) corpusBodies.set(b.cls, [])
      corpusBodies.get(b.cls).push(topLevelOnly(text.slice(b.bodyStart, b.bodyEnd)))
    }
  }
  for (const [fp, fc] of Object.entries(files)) {
    if (typeof fc !== 'string') continue
    if (/\.(less|css)$/.test(fp)) pushLess(fc)
    else if (/\.vue$/i.test(fp)) {
      for (const sm of fc.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) pushLess(sm[1])
    }
  }

  for (const [fp, fc] of Object.entries(files)) {
    if (!/\.vue$/i.test(fp) || typeof fc !== 'string') continue
    const pairs = findVForPairs(fc, fp)
    for (const { item, parent: wrapperTag } of pairs) {
      stats.vforElements++
      // 锚：item 自身 sid ⇒ wrapper（DOM 父）sid ⇒ 不判
      const itemSidM = (item.attrs || '').match(SID_RE)
      const wrapSidM = wrapperTag ? (wrapperTag.attrs || '').match(SID_RE) : null
      const anchorSid = itemSidM?.[2] || wrapSidM?.[2] || null
      if (!anchorSid) {
        stats.skippedNoAnchor++
        continue
      }
      stats.anchored++
      const group = discoverRepeatGroup(anchorSid, ctx.figmaRoot)
      if (!group) {
        stats.skippedNoGroup++
        continue
      }
      stats.groupFound++

      const sig = collectSignals(item.attrs, corpusBodies)
      const base = {
        file: fp,
        anchorSid,
        direction: group.direction,
        itemCount: group.count,
        itemWidth: group.itemWidth,
        itemHeight: group.itemHeight,
        classes: sig.classes,
      }
      let hit = false

      // ① item 100% 尺寸（方向感知窄条件）
      if (group.direction === 'vertical' && sig.h100) {
        hit = true
        issues.push({
          ...base,
          id: 'VFOR-UNIT-HEIGHT',
          role: 'item',
          prop: 'height',
          truthPx: group.itemHeight,
          detail:
            `v-for 重复单元 height:100%（真值：${group.count} 项纵向重复、单项高 ${group.itemHeight}px）` +
            `⇒ 每项占满容器高、整体溢出只见首项`,
        })
      } else if (group.direction === 'horizontal' && sig.w100) {
        hit = true
        issues.push({
          ...base,
          id: 'VFOR-UNIT-WIDTH',
          role: 'item',
          prop: 'width',
          truthPx: group.itemWidth,
          detail:
            `v-for 重复单元 width:100%（真值：${group.count} 项横向重复、单项宽 ${group.itemWidth}px）` +
            `⇒ 每项占满容器宽、整体溢出只见首项`,
        })
      }

      // ② wrapper 方向与几何真值矛盾（E1 未折叠时 direction-guard 的兜底）
      if (wrapperTag) {
        const wSig = collectSignals(wrapperTag.attrs, corpusBodies)
        const dirs = new Set()
        for (const c of wSig.classes) {
          for (const body of corpusBodies.get(c) || []) {
            const dm = body.match(FLEX_DIR_RE)
            if (dm) dirs.add(dm[1])
          }
        }
        const expected = group.direction === 'vertical' ? 'column' : 'row'
        if (dirs.size === 1 && !dirs.has(expected)) {
          hit = true
          issues.push({
            ...base,
            classes: wSig.classes, // 覆盖 base 里的 item 类名（heal 与日志都以 wrapper 类为准）
            id: 'VFOR-UNIT-WRAPPER-DIR',
            role: 'wrapper',
            prop: 'flex-direction',
            expected,
            actual: [...dirs][0],
            wrapperClasses: wSig.classes,
            detail:
              `v-for 容器方向与设计不符（真值：${group.count} 项${group.direction === 'vertical' ? '纵向' : '横向'}重复 ` +
              `⇒ 容器应为 ${expected}，产物为 ${[...dirs][0]}）`,
          })
        }
      }

      if (!hit) stats.skippedNoSignal++
      else stats.hits++
    }
  }
  return { issues, stats }
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * 确定性自愈：按 issues 改写产物文件（幂等；翻转全部出现点）。
 *
 * @param {Record<string,string>} files path → content（返回新对象，不改入参）
 * @param {Array} issues detectRepeatUnitIssues 的 issues
 * @returns {{files: Record<string,string>, healed: Array, failed: Array}}
 */
export function healRepeatUnitIssues(files, issues = []) {
  const out = { ...(files || {}) }
  const healed = []
  const failed = []
  const styleBearer = (p) => /\.(less|css|vue)$/i.test(p)

  // 🛡️ 2026-10-20（ee06ee24 实锤）：LESS 嵌套规则体盲区修复。
  //   旧实现 `(\.cls\s*\{)([^{}]*)(\})` 的 body 不容任何花括号 ⇒ 含 `&:first-child{}`/
  //   `&:hover{}` 嵌套的 SFC 规则**整段失配** ⇒ heal 只打到编译产物 index.css（扁平无嵌套）、
  //   漏掉 SFC 源（特异性更高、重编译后还会覆盖回来）——「检出能治、改的是假目标」。
  //   治本：模块级 findRuleBlocks（brace 配对）+ replaceDepthZero（仅顶层声明改写），
  //   与 detect 的语料提取同源。

  for (const it of issues) {
    if (it.role === 'item' && (it.prop === 'height' || it.prop === 'width')) {
      const prop = it.prop
      const target = `${it.truthPx}px`
      let done = false
      // 类规则体：brace 配对 + 仅顶层声明改写（全部 class、全部出现点、含嵌套块）
      for (const cls of it.classes || []) {
        const declRe = new RegExp(`${prop}\\s*:\\s*100%`, 'g')
        for (const p of Object.keys(out)) {
          if (!styleBearer(p)) continue
          let src = out[p]
          const blocks = findRuleBlocks(src, cls)
          if (blocks.length === 0) continue
          let hits = 0
          // 从后往前改写防位移
          for (const { bodyStart, bodyEnd } of [...blocks].sort((a, b) => b.bodyStart - a.bodyStart)) {
            const r = replaceDepthZero(src.slice(bodyStart, bodyEnd), declRe, () => `${prop}: ${target}`)
            if (r.hits > 0) {
              src = src.slice(0, bodyStart) + r.out + src.slice(bodyEnd)
              hits += r.hits
            }
          }
          if (hits > 0) {
            out[p] = src
            done = true
            healed.push({ id: it.id, file: p, class: cls, prop, to: target, occurrences: hits })
          }
        }
      }
      // 静态 style 属性（item 无 class 或声明在内联时的兜底）：只改该文件模板里的
      // `style="...height:100%..."` 静态属性。窄：文件级替换会误伤非 item 元素 ⇒
      // 仅当 item 没有任何 class 时才走这条（无 class 定位手段，宁缺毋滥）。
      if (!done && (it.classes || []).length === 0) {
        const p = it.file
        const src = out[p]
        // ⚠️ /g 正则 test 推进 lastIndex：用前清零（幽灵漏修纪律保留）
        const staticRe = new RegExp(`${prop}\\s*:\\s*100%`, 'g')
        if (src && staticRe.test(src)) {
          staticRe.lastIndex = 0
          const next = src.replace(staticRe, `${prop}: ${target}`)
          if (next !== src) {
            out[p] = next
            done = true
            healed.push({ id: it.id, file: p, prop, to: target, via: 'static-style' })
          }
        }
      }
      if (!done) failed.push({ id: it.id, file: it.file, reason: 'rule-not-found' })
    } else if (it.role === 'wrapper' && it.prop === 'flex-direction') {
      let done = false
      for (const cls of it.wrapperClasses || []) {
        const dirRe = /flex-direction\s*:\s*(row-reverse|column-reverse|row|column)/g
        for (const p of Object.keys(out)) {
          if (!styleBearer(p)) continue
          let src = out[p]
          // 同 item 分支：brace 配对找规则块，仅顶层声明翻转（嵌套块不动）
          const blocks = findRuleBlocks(src, cls)
          if (blocks.length === 0) continue
          let hits = 0
          for (const { bodyStart, bodyEnd } of [...blocks].sort((a, b) => b.bodyStart - a.bodyStart)) {
            let changed = 0
            const r = replaceDepthZero(src.slice(bodyStart, bodyEnd), dirRe, (all, dir) => {
              if (dir === it.expected) return all // 已正确：不动、不计数（幂等）
              changed++
              return all.slice(0, all.length - dir.length) + it.expected
            })
            if (changed > 0) {
              src = src.slice(0, bodyStart) + r.out + src.slice(bodyEnd)
              hits += changed
            }
          }
          if (hits > 0) {
            out[p] = src
            done = true
            healed.push({ id: it.id, file: p, class: cls, to: it.expected, occurrences: hits })
          }
        }
      }
      if (!done) failed.push({ id: it.id, file: it.file, reason: 'rule-not-found' })
    }
  }
  return { files: out, healed, failed }
}

export default detectRepeatUnitIssues
