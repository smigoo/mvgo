/**
 * 🛡️ R9-b（2026-11-09 · loop-verify R9 轮）：**横排 flex 兄弟组 `width:100%` 挤压裁切**的确定性修复。
 *
 * ── 病灶（设备监测 49d23fe1 真机实锤）────────────────────────────────────────
 * `switch-con`（89:38，横排 flex 容器）下两张统计卡 `<StatsTunnel flex:1/>` +
 * `<StatsSection flex:1/>`，但两卡 scoped CSS 都是 `width: 100%`——在横排 flex
 * 兄弟组里「各想要容器 100% 宽」⇒ 互相挤压：第二卡（南北接线设备）文字被裁成
 * 「南北接：设备」，StatsTunnel 内容行把 StatsSection 挤出可视区。
 *
 * ── 与既有家族的关系（查重结论）────────────────────────────────────────────
 * flex-shrink-guard 判据 A（percent-size-on-unprotected-flex-child）**已覆盖此形态**
 * 但它是 WP4「只留痕不阻断」（graph check 阶段 WARN），裁切实际发生。
 * flex-sibling-guard FLEX-005 只管「量纲混排」，不管 width:100%。
 * ⇒ 本模块是 shrink-guard 判据 A 的 **heal 形态**：同一形态识别（判据同源），
 *   确定性改写而非告警。
 *
 * ── 改写语义（等价消除挤压）───────────────────────────────────────────────
 * `width: 100%`（横排 flex 子项）≡ 想占满剩余空间 ⇒ 规范写法是 `flex: 1 1 0 +
 * min-width: 0`（可收缩、内容可换行）。改写规则：
 *   - 触发：元素的**最近 flex 容器父级**是横排（flex-direction 未声明或=row），
 *     且元素 CSS 含 `width: 100%`，且无 shrink 保护（flex-shrink:0/显式尺寸/
 *     min-width>0/overflow hidden 任一即豁免——与 shrink-guard hasShrinkProtection
 *     同口径）；
 *   - 改写：`width: 100%` → `flex: 1 1 0; min-width: 0;`（原 width 声明移除）；
 *   - 豁免：竖排（column）容器里 width:100% 是合法语义，绝不动。
 *
 * 纯函数、零依赖注入；判据与 flex-shrink-guard 同源（CSS 规则解析同族）。
 */

const NUMERIC_SIZE_RX = /^\s*(\d*\.?\d+)(px|rem|em|vw|vh|%)?;?\s*$/

/** 从 CSS 文本提取规则块：selector → declarations（与 flex-shrink-guard.collectCssRules 同构） */
function collectCssRules(css) {
  const out = []
  const src = String(css || '').replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    // ⚠️ selector 段可能粘着前置 @ 规则行（LESS 变量/@import 无块结构，正则会
    //   把它们与后续选择器拼进同一捕获）⇒ 取「{ 前最后一个非空段」为真选择器；
    //   该段以 @ 开头（真 at-rule）则跳过本块（width 声明不属于任何 class）。
    const lastSeg = String(m[1])
      .split(/[\n;]|\}\s*/) // @import 以 ; 结尾也应截断
      .map((s) => s.trim())
      .filter(Boolean)
      .pop() || ''
    if (!lastSeg || lastSeg.startsWith('@')) continue
    const selector = lastSeg
    const decls = {}
    for (const d of String(m[2]).split(';')) {
      const ci = d.indexOf(':')
      if (ci === -1) continue
      const k = d.slice(0, ci).trim().toLowerCase()
      const v = d.slice(ci + 1).trim()
      if (k) decls[k] = v
    }
    out.push({ selector, decls })
  }
  return out
}

/**
 * 找 selector 命中 class 列表的规则块 decls（多个时取最后声明——CSS 层叠语义）
 * 供「按 class 名反查声明」类判据复用（本模块 heal 路径不用，保留为单一来源工具）。
 */
export function declsForClass(rules, classes) {
  let found = null
  for (const r of rules) {
    const sel = r.selector
    const hit = classes.some((c) => {
      // 精确单 class 匹配或链中包含（.a.b / .a:hover 视为命中 .a 家族）
      return sel === '.' + c || sel.startsWith('.' + c + '.') || sel.startsWith('.' + c + ':') || sel === '.' + c + '::' || new RegExp('^\\.' + c + '(\\.|:| |$)').test(sel)
    })
    if (hit) found = r.decls
  }
  return found
}

// ── 结构判定：横排 flex 容器的**直接子组件**（R9-b 佐证来源，2026-11-09 修订） ──
// 旧实现：调用侧对 index.vue 跑一次正则，命中任意横排容器就把 bool 置真，再对所有子
// 组件传 `['*']` 通配 ⇒ 「页面有横排」= 「每个子组件父级都是横排」，竖排卡被误改。
// 现实现：结构性解析出**该横排容器的直接子组件名**，只有这些文件才获得佐证。

/** 空元素/自闭合标签集（不参与容器深度配平） */
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

/** 从 `<` 位置找到标签结束（引号内的 `>` 不计），返回 `>` 之后的下标；失败 -1 */
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

/** 取标签上的 style 属性值（双/单引号均支持） */
function readStyleAttr(tagText) {
  const m = tagText.match(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i)
  return m ? (m[2] !== undefined ? m[2] : m[3]) : ''
}

/** 收集容器内**深度 0** 的子组件标签名（大写开头＝组件用法，非原生标签） */
function collectDepth0Components(html, from, containerName) {
  const children = []
  let depth = 0
  let i = from
  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt === -1) break
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt)
      if (end === -1) break
      i = end + 3
      continue
    }
    const end = scanTagEnd(html, lt)
    if (end === -1) break
    const tag = html.slice(lt, end)
    const closing = /^<\s*\//.test(tag)
    const nameM = tag.match(/^<\s*\/?\s*([a-zA-Z][\w-]*)/)
    if (!nameM) { i = end; continue }
    const name = nameM[1]
    const selfClosing = /\/\s*>$/.test(tag)
    if (closing) {
      if (name === containerName && depth === 0) return { children, next: end }
      depth = Math.max(0, depth - 1)
      i = end
      continue
    }
    if (depth === 0 && /^[A-Z]/.test(name)) children.push(name)
    if (!selfClosing && !VOID_TAGS.has(name.toLowerCase())) depth += 1
    i = end
  }
  return { children, next: html.length }
}

/**
 * 从 index.vue 解析「横排 flex 容器的直接子组件名」。
 *
 * 判据只认结构：容器 inline style 含 `display:flex` 且未声明 `flex-direction:column`；
 * 直接子节点为组件标签（大写开头）。零硬编码：不认组件名/路径/任务 id。
 *
 * @param {string} vueContent index.vue 全文（含 `<template>`）
 * @returns {string[]} 去重后的组件标签名（如 ['StatsTunnel','StatsSection']）
 */
export function collectRowFlexChildComponents(vueContent) {
  const content = String(vueContent || '')
  const tplM = content.match(/<template[^>]*>([\s\S]*)<\/template>/i)
  const html = tplM ? tplM[1] : content
  const found = new Set()
  let i = 0
  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt === -1) break
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt)
      if (end === -1) break
      i = end + 3
      continue
    }
    if (/^<\s*\//.test(html.slice(lt, lt + 3))) { i = lt + 2; continue }
    const end = scanTagEnd(html, lt)
    if (end === -1) break
    const tag = html.slice(lt, end)
    const nameM = tag.match(/^<\s*([a-zA-Z][\w-]*)/)
    if (!nameM) { i = end; continue }
    const name = nameM[1]
    const style = readStyleAttr(tag)
    const isRowFlex =
      /display\s*:\s*flex/i.test(style) && !/flex-direction\s*:\s*column/i.test(style)
    const selfClosing = /\/\s*>$/.test(tag)
    if (isRowFlex && !selfClosing && !VOID_TAGS.has(name.toLowerCase())) {
      const { children, next } = collectDepth0Components(html, end, name)
      for (const c of children) found.add(c)
      i = next
      continue
    }
    i = end
  }
  return [...found]
}

/** 与 flex-shrink-guard.hasShrinkProtection 同口径（axis='width'） */
function hasWidthShrinkProtection(decls) {
  if (!decls || typeof decls !== 'object') return false
  const flexParts = String(decls.flex || '').split(/\s+/).filter(Boolean)
  if (flexParts[0] === 'none') return true
  if (flexParts.length >= 2 && /^\d*\.?\d+$/.test(flexParts[1]) && parseFloat(flexParts[1]) === 0)
    return true
  const shrink = String(decls['flex-shrink'] || '')
  if (shrink && parseFloat(shrink) === 0) return true
  const minVal = String(decls['min-width'] || '')
  if (minVal && NUMERIC_SIZE_RX.test(minVal + ';') && parseFloat(minVal) > 0) return true
  const overflow = String(decls.overflow || '') + ' ' + String(decls['overflow-x'] || '')
  if (/(^|\s)(hidden|clip)(\s|$)/.test(overflow)) return true
  return false
}

/**
 * 扫描单个 .vue 文件：找出「scoped CSS 里 width:100% 且无横向收缩保护」的 class 集合，
 * 并改写其 CSS（width:100% → flex:1 1 0; min-width:0）。
 *
 * 边界（宁缺勿错）：
 *  - 只处理**组件自身 scoped style** 内的声明（common.less 全局规则不动——影响面不可控）；
 *  - 仅当该 class 的元素**确实**作为横排 flex 容器的直接子项时改写；佐证由调用方给出：
 *      · `parentIsRowFlex: true` —— 调用方已用 `collectRowFlexChildComponents` 做结构性
 *        判定（本文件同一来源），该组件就是横排容器的直接子组件；
 *      · `parentFlexRowClasses: [...]` —— 显式给出「父容器是横排」的根 class 白名单。
 *    ⚠️ 2026-11-09 修订：不再接受 `'*'` 通配（旧实现以通配代替真实判定 ⇒ 竖排卡误改）。
 *    两种佐证都缺失时保守跳过（防误杀竖排场景）。
 *
 * @param {string} vueContent 组件 .vue 全文
 * @param {{parentFlexRowClasses?: string[], parentIsRowFlex?: boolean}} opts 挂载佐证
 * @returns {{ content: string, changed: boolean, rewritten: string[] }}
 */
export function healHorizontalFlexWidth100(vueContent, opts = {}) {
  const content = String(vueContent || '')
  if (!content.includes('width:') && !content.includes('width :')) {
    return { content, changed: false, rewritten: [] }
  }
  const styleMatch = content.match(/<style[^>]*>([\s\S]*?)<\/style>/i)
  if (!styleMatch) return { content, changed: false, rewritten: [] }
  const styleInner = styleMatch[1]
  const rules = collectCssRules(styleInner)

  // 挂载佐证：根 class 集合（template 根元素的 class）
  const tplMatch = content.match(/<template>([\s\S]*?)<\/template>/i)
  const tpl = tplMatch ? tplMatch[1] : ''
  const rootTagMatch = tpl.match(/<([a-zA-Z][\w-]*)([^>]*)>/)
  const rootClasses = rootTagMatch
    ? [...rootTagMatch[2].matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/))
    : []
  if (rootClasses.length === 0) return { content, changed: false, rewritten: [] }

  const parentRow = Array.isArray(opts.parentFlexRowClasses)
    ? opts.parentFlexRowClasses.filter((c) => c && c !== '*')
    : []
  const structurallyRowFlex = opts.parentIsRowFlex === true
  const rewritten = []
  let styleOut = styleInner

  for (const r of rules) {
    const decls = r.decls
    const w = String(decls.width || '').trim()
    if (w !== '100%') continue
    if (decls.flex || decls['flex-grow'] !== undefined) continue // 已有 flex 声明的不管
    // 命中根 class（本组件根的宽度语义）且调用方佐证「父容器是横排 flex」才改写
    const selClass = r.selector.replace(/^\./, '').split(/[:.[]/)[0]
    if (!rootClasses.includes(selClass)) continue
    // 佐证：结构判定（调用方 collectRowFlexChildComponents）或显式 class 白名单
    if (!structurallyRowFlex && !parentRow.includes(selClass)) continue
    if (hasWidthShrinkProtection(decls)) continue
    // 改写：width:100% → flex:1 1 0; min-width:0（在该声明块内原位替换）
    const declBlock = `${r.selector} { ${Object.entries(decls)
      .map(([k, v]) => (k === 'width' ? 'flex: 1 1 0; min-width: 0' : `${k}: ${v}`))
      .join('; ')} }`
    const oldBlock = new RegExp(
      r.selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
        String.raw`\s*\{[^{}]*\}`,
    )
    if (oldBlock.test(styleOut)) {
      styleOut = styleOut.replace(oldBlock, declBlock)
      rewritten.push(selClass)
    }
  }

  if (rewritten.length === 0) return { content, changed: false, rewritten: [] }
  return {
    content: content.replace(styleInner, styleOut),
    changed: true,
    rewritten,
  }
}

// ── R9-c（2026-11-09 · fe2acd21/54f523ac 实锤）：横排容器子项「定宽真值」注入 ──
// 病灶：@antd/tab 行容器（89:37，flex row）下 tab 列（89:39）真值 46×317（竖排窄条），
// 但 componentPlan 容器分支此前不透传几何（W1 修复位，见 subcomponent-planner container
// 分支注释）⇒ LLM 无真值可依写 `flex: 0 0 auto`，横排文字按钮自撑到 193px，挤占网格
// 空间 ⇒ 列塌 37.5/37.5/117、15 组文本重叠、25 元件越界。
// 与 R9-b 的关系（查重结论）：同一文件、同一结构判定家族；R9-b 治「width:100% 互挤」，
// R9-c 治「无定值语义的自撑」——两者互斥不重叠（width:100% ≠ flex:0 0 auto）。
// 改写语义：**行内注入** `flex: 0 0 <W>px`（元素级恒胜、零波及共享 class，与刀 41
// 元素级内联通道同一思路）；已有 flex 定值语义（grow>0 / basis 数值 / flex:none）或
// width 定值的子项一律跳过（健康单 49d23fe1 的 `flex:0.111;min-width:0` 是阴性对照）。

/** flex 声明是否已有「定值/弹性语义」（有 ⇒ 不注入，防覆盖 LLM 的有意布局） */
function hasFlexSemantics(flexRaw, decls) {
  const flex = String(flexRaw || '').trim()
  const width = String(decls.width || '').trim()
  // width:100% 属 R9-b 契约（flex:1 1 0 改写），本刀不碰（两把刀域互斥）
  if (/^100%$/.test(width)) return true
  if (flex) {
    // `flex: auto` ≡ `1 1 auto`（有弹性语义）；`flex: none` 显式不伸缩——都不动
    if (/^(auto|none)$/i.test(flex)) return true
    const parts = flex.split(/\s+/).filter(Boolean)
    const grow = parseFloat(parts[0])
    if (Number.isFinite(grow) && grow > 0) return true
    const basis = parts.length >= 3 ? parts[2] : parts[1]
    if (basis && /^-?\d+(\.\d+)?(px|%|rem|em)$/i.test(basis)) return true
    // 三值完整声明：仅 `X X auto`（basis 交还内容自撑）才是本刀候选
    if (parts.length >= 3) return !/^auto$/i.test(parts[2])
    return false
  }
  const basis = String(decls['flex-basis'] || '')
  if (basis && /^-?\d+(\.\d+)?(px|rem|em)/i.test(basis)) return true
  if (width && /^-?\d+(\.\d+)?px$/i.test(width)) return true
  return false
}

/**
 * 横排容器直接子项（带 data-section-id）的定宽真值注入。
 *
 * @param {string} indexContent index.vue 全文
 * @param {Array<{path:string,content:string}>} styleSources 全量样式文件（less/css/vue），
 *        用于解析子项 class 的 flex/width 现状（容器判定也认 class 块的 display:flex）
 * @param {{truthWidthOf:(sid:string)=>number|null, logger?:Object}} opts
 *        truthWidthOf：调用方从段树真值取宽度（单一事实源；缺真值 ⇒ 计数跳过，不猜）
 * @returns {{content:string, changed:boolean, healed:Array, stats:Object}}
 */
export function healRowFixedWidthTruth(indexContent, styleSources, opts = {}) {
  const content = String(indexContent || '')
  const stats = { scanned: 0, candidates: 0, healed: 0, noTruth: 0, hasFlexSemantics: 0, notRowFlex: 0 }
  const healed = []
  const truthWidthOf = typeof opts.truthWidthOf === 'function' ? opts.truthWidthOf : () => null
  const tplM = content.match(/<template[^>]*>([\s\S]*)<\/template>/i)
  const html = tplM ? tplM[1] : content
  // 全量规则（一次解析；容器/子项的 class 声明都从这里取）
  const rules = []
  for (const src of styleSources || []) {
    if (!src || typeof src.content !== 'string') continue
    for (const r of collectCssRules(src.content)) rules.push(r)
  }
  const declsFor = (classes) => {
    const merged = {}
    for (const r of rules) {
      const hit = classes.some((c) => {
        const sel = r.selector
        return sel === '.' + c || new RegExp('^\.' + c + '(\\.|:| |$|,)').test(sel) || new RegExp('[\\s,.]' + c + '(\\.|:| |$)').test(sel)
      })
      if (hit) Object.assign(merged, r.decls)
    }
    return merged
  }
  let i = 0
  let out = content
  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt === -1) break
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt)
      if (end === -1) break
      i = end + 3
      continue
    }
    if (/^<\s*\//.test(html.slice(lt, lt + 3))) { i = lt + 2; continue }
    const end = scanTagEnd(html, lt)
    if (end === -1) break
    const tag = html.slice(lt, end)
    const nameM = tag.match(/^<\s*([a-zA-Z][\w-]*)/)
    if (!nameM) { i = end; continue }
    const name = nameM[1]
    const selfClosing = /\/\s*>$/.test(tag)
    if (!selfClosing && !VOID_TAGS.has(name.toLowerCase())) {
      // 容器候选：行内 style 或 class 声明含 display:flex 且未声明 column
      const inline = readStyleAttr(tag)
      const classes = [...tag.matchAll(/\sclass\s*=\s*"([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/))
      const cDecls = classes.length ? declsFor(classes) : {}
      const display = String(inline.match(/display\s*:\s*([\w-]+)/i)?.[1] || cDecls.display || '')
      const dir = String(inline.match(/flex-direction\s*:\s*([\w-]+)/i)?.[1] || cDecls['flex-direction'] || '')
      if (/^flex$/i.test(display) && !/^column$/i.test(dir)) {
        stats.scanned += 1
        // 深度 0 直接子元素（带 data-section-id）
        let depth = 0
        let j = end
        while (j < html.length) {
          const lt2 = html.indexOf('<', j)
          if (lt2 === -1) break
          if (html.startsWith('<!--', lt2)) {
            const e2 = html.indexOf('-->', lt2)
            if (e2 === -1) break
            j = e2 + 3
            continue
          }
          const e2 = scanTagEnd(html, lt2)
          if (e2 === -1) break
          const t2 = html.slice(lt2, e2)
          const m2 = t2.match(/^<\s*\/?(\s*)([a-zA-Z][\w-]*)/)
          if (!m2) { j = e2; continue }
          const closing2 = /^<\s*\//.test(t2)
          const n2 = m2[2]
          const self2 = /\/\s*>$/.test(t2)
          if (closing2) {
            if (n2 === name && depth === 0) break
            depth = Math.max(0, depth - 1)
            j = e2
            continue
          }
          if (depth === 0) {
            const sidM = t2.match(/\sdata-section-id\s*=\s*"([^"]+)"/i)
            if (sidM) {
              stats.candidates += 1
              const sid = sidM[1]
              const truthW = Number(truthWidthOf(sid))
              if (!(truthW > 0)) {
                stats.noTruth += 1
              } else {
                const cls2 = [...t2.matchAll(/\sclass\s*=\s*"([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/))
                const inline2 = readStyleAttr(t2)
                const d2 = declsFor(cls2)
                const flexRaw = String(inline2.match(/(?:^|;)\s*flex\s*:\s*([^;]+)/i)?.[1] || d2.flex || '')
                const mergedDecls = { ...d2 }
                if (flexRaw) mergedDecls.flex = flexRaw
                const wInline = String(inline2.match(/(?:^|;)\s*width\s*:\s*([^;]+)/i)?.[1] || '')
                if (wInline) mergedDecls.width = wInline
                if (hasFlexSemantics(flexRaw, mergedDecls)) {
                  stats.hasFlexSemantics += 1
                } else {
                  // 行内注入（幂等：已含目标声明则跳过）
                  const inject = `flex: 0 0 ${Math.round(truthW)}px`
                  const already = new RegExp(`flex\\s*:\\s*0\\s+0\\s+${Math.round(truthW)}px`).test(inline2)
                  if (already) {
                    // 幂等命中：内容不变
                  } else if (/\sstyle\s*=\s*"/i.test(t2)) {
                    const newTag = t2.replace(/(\sstyle\s*=\s*")([^"]*)(")/i, (mm, a, b, c) => `${a}${b.replace(/;?\s*$/, '')};${inject}${c}`)
                    out = out.replace(tag, newTag)
                    healed.push({ sid, width: Math.round(truthW), cls: cls2[0] || '', where: 'inline-append' })
                    stats.healed += 1
                  } else {
                    const newTag = t2.replace(/>\s*$/, ` style="${inject}">`)
                    out = out.replace(tag, newTag)
                    healed.push({ sid, width: Math.round(truthW), cls: cls2[0] || '', where: 'inline-new' })
                    stats.healed += 1
                  }
                }
              }
            }
          }
          if (!self2 && !VOID_TAGS.has(n2.toLowerCase())) depth += 1
          j = e2
        }
      } else {
        stats.notRowFlex += 1
      }
    }
    i = end
  }
  if (healed.length === 0) return { content, changed: false, healed, stats }
  // html 是 template 内片段：把 out（含注入后的片段）替换回原文
  const finalContent = tplM ? content.replace(tplM[1], out) : out
  return { content: finalContent, changed: finalContent !== content, healed, stats }
}


export default healHorizontalFlexWidth100
