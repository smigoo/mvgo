/**
 * WP4 收缩守卫（2026-10-08，治 RC2 直因）——纯函数静态扫描，只留痕不阻断。
 *
 * 背景（RC2 实锤链）：
 *   - 8db2b3b7 统计行压至 9px：.c-8db2b3-stat-row 是 flex column 容器 .c-8db2b3-stats-left 的
 *     子项，仅声明 min-height: 0（放弃下限），无 flex-shrink:0 / 显式高度 / overflow 保护
 *     → 父高度不足时被压塌。
 *   - feb1f87a header-right 槽 8px：同类「百分比尺寸落在无保护 flex 子项」形态。
 *
 * 判据 A（方案文档第 7 节口径）：百分比尺寸落在无保护 flex 子项——
 *   模板元素 e 的类/内联声明了 height/width:100%（或百分比 flex-basis），
 *   沿模板父链找最近 flex 容器 F；F 的 flex 子项层 fc 若无任一收缩保护 → 记 issue。
 *
 * 判据 B（8db2b3b7 stat-row 9px 实锤形态，判据 A 覆盖不到）：
 *   容器 F = flex + column + justify-content:space-between/around 且高度依赖外部（height 为
 *   %/flex 简写/未声明）；F 的直接子项 ≥2 且子项 fc「解除 min-content floor」（显式
 *   min-{axis}:0 或 overflow 非 visible）且无真保护（flex-shrink:0 / 显式 {axis} 尺寸）
 *   → space-between 的分布意图 + floor 被解除 = 容器受压时子项必然被压塌 → 记 issue。
 *   注意：未解除 floor 的子项有 min-content 兜底，只会溢出不会塌缩 → 不判（降误报）。
 *
 * 四条「真保护」（判据 A/B 共用）：
 *     ① flex-shrink: 0（含 flex: n n 0 / flex: n 0 / flex: none 简写）
 *     ② {axis} 显式尺寸（px/em/rem/%/vh/vw 等，含 100%——显式声明即认定作者已知高度链）
 *     ③ min-{axis} 数值 > 0
 *     （④ overflow hidden/clip 只在判据 A 充当保护；判据 B 里它恰是 floor 解除信号）
 *
 * 设计约束：
 *   - 纯函数：无 fs/path/logger 依赖，输入 [{path, content}] 输出 { issues }，可离线重放。
 *   - 只认 class 与内联 style；@media/@supports/@layer/@container 外壳剥除后规则照常收编。
 *   - 未加 class 的中间层元素不参与判定（无法从 CSS 取 decls），该形态留待 WP3 运行时探针兜底。
 *   - 首版只留痕（升级 BLOCK 后议）；误报面评审走「纯函数 A/B：只答有没有用，不答该不该判」。
 */

const NUMERIC_SIZE_RX = /^\s*[-\d.]+(?:px|em|rem|%|vh|vw|vmin|vmax)?\s*;?$/i
const AT_SHELL_RX = /@(?:media|supports|layer|container)[^{]*\{/

/** 解析声明块文本 → { prop: value }（小写 prop；浅层） */
function parseDecls(block) {
  const decls = {}
  for (const raw of String(block || '').split(';')) {
    const idx = raw.indexOf(':')
    if (idx <= 0) continue
    const prop = raw.slice(0, idx).trim().toLowerCase()
    const value = raw.slice(idx + 1).trim()
    if (!prop || !value) continue
    decls[prop] = value
  }
  return decls
}

/** 剥 @media/@supports/@layer/@container 外壳（内容提出来拼回，循环至无外壳） */
function stripAtShells(text) {
  let out = String(text || '')
  let guard = 0
  let m
  while ((m = AT_SHELL_RX.exec(out)) !== null && guard++ < 32) {
    const start = m.index + m[0].length
    let d = 1
    let j = start
    for (; j < out.length && d > 0; j++) {
      if (out[j] === '{') d++
      else if (out[j] === '}') d--
    }
    const inner = out.slice(start, j - 1)
    out = out.slice(0, m.index) + inner + out.slice(j)
  }
  return out
}

/** 剥注释与 @import，收集所有平铺 selector{decls} 规则（@keyframes/@font-face 等整块丢弃） */
function collectCssRules(cssText) {
  let text = String(cssText || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*@import[^;]+;/gim, '')
  text = stripAtShells(text)
  const rules = []
  const rx = /([^{}]+)\{([^{}]*)\}/g
  let m
  while ((m = rx.exec(text)) !== null) {
    const selector = m[1].trim()
    if (!selector || selector.startsWith('@')) continue
    rules.push({ selector, decls: parseDecls(m[2]) })
  }
  return rules
}

/**
 * 规则列表 → 类名 decls 合并表。
 * 仅收编「单类段」：选择器按空白/>/~/+ 切分，只有最右复合段是单个 .class 时才收编
 * （.a .b 的 decls 只作用于 b）；.a.b 复合类不收编（微码产物单类为主，fail-open）。
 * 同类多规则按出现顺序合并（后者覆盖）。
 */
function buildClassDeclMap(rules) {
  const map = {}
  for (const rule of rules) {
    const segments = String(rule.selector || '')
      .replace(/\s*([>+~])\s*/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
    const last = segments[segments.length - 1]
    if (!last) continue
    const m = last.match(/^\.([A-Za-z0-9_-]+)(?:::{1,2}[A-Za-z-]+)*$/)
    if (!m) continue
    const cls = m[1]
    map[cls] = { ...(map[cls] || {}), ...rule.decls }
  }
  return map
}

/** 提取 <template> 内容（取首个 <template> 到最后一个 </template>） */
function extractTemplate(vueContent) {
  const s = String(vueContent || '')
  const start = s.search(/<template[\s>]/i)
  if (start < 0) return ''
  const lastEnd = s.toLowerCase().lastIndexOf('</template>')
  if (lastEnd < 0) return ''
  return s.slice(start, lastEnd + '</template>'.length)
}

const VOID_TAGS = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'area', 'base', 'col', 'embed', 'track', 'wbr'])

/**
 * 模板 → 节点树。节点 { tag, classes, style, children }。
 * 简化解析：逐标签正则推进 + 栈式配平；忽略注释/自闭合/void 标签；闭合找不到同名开标签则忽略。
 */
function parseTemplateTree(templateText) {
  const text = String(templateText || '').replace(/<!--[\s\S]*?-->/g, '')
  const root = { tag: '#root', classes: [], style: '', children: [] }
  const stack = [root]
  const tagRx = /<\/?([A-Za-z][A-Za-z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g
  let m
  while ((m = tagRx.exec(text)) !== null) {
    const rawTag = m[1]
    const attrs = m[2] || ''
    const closing = m[0][1] === '/'
    const selfClosing = /\/\s*>$/.test(m[0])
    const lower = rawTag.toLowerCase()
    if (lower === 'style' || lower === 'script') continue
    if (closing) {
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].tag === rawTag) {
          stack.length = k
          break
        }
      }
      continue
    }
    // 只取静态 class/style；排除 :class/:style/v-bind:style 等动态绑定（值是 JS 表达式非 CSS）
    const classAttr = (attrs.match(/(?<![-\w:])class\s*=\s*"([^"]*)"/) || attrs.match(/(?<![-\w:])class\s*=\s*'([^']*)'/) || [])[1] || ''
    const styleAttr = (attrs.match(/(?<![-\w:])style\s*=\s*"([^"]*)"/) || attrs.match(/(?<![-\w:])style\s*=\s*'([^']*)'/) || [])[1] || ''
    const node = {
      tag: rawTag,
      classes: classAttr.split(/\s+/).filter(Boolean),
      style: styleAttr,
      children: [],
      // v-for 节点运行时展开为多实例——静态树单节点也按「多子项」对待（判据 B）
      hasVFor: /\bv-for\s*=/.test(attrs),
    }
    stack[stack.length - 1].children.push(node)
    if (!selfClosing && !VOID_TAGS.has(lower)) stack.push(node)
  }
  return root
}

/** 合并某元素的 decls：类 decls（多类合并）+ 内联 style（内联优先） */
function elementDecls(node, classDeclMap) {
  let merged = {}
  for (const cls of node.classes) {
    if (classDeclMap[cls]) merged = { ...merged, ...classDeclMap[cls] }
  }
  if (node.style) merged = { ...merged, ...parseDecls(node.style) }
  return merged
}

/** 收缩保护判定：flex 子项层的合并 decls 有无任一保护 */
function hasShrinkProtection(decls, axis) {
  if (!decls || typeof decls !== 'object') return false
  // ① flex 简写第二值（纯数字形态）为 0 → flex-shrink: 0
  //    CSS flex 简写：<grow> <shrink?> <basis?>——第二值才是 shrink；flex: 1 1 0 的第三值是 basis！
  const flexParts = String(decls.flex || '').split(/\s+/).filter(Boolean)
  if (flexParts[0] === 'none') return true // flex: none ≡ 0 0 auto（不收缩）
  if (flexParts.length >= 2 && /^\d*\.?\d+$/.test(flexParts[1]) && parseFloat(flexParts[1]) === 0) return true
  // ① flex-shrink: 0
  const shrink = String(decls['flex-shrink'] || '')
  if (shrink && parseFloat(shrink) === 0) return true
  // ② {axis} 显式尺寸（NUMERIC_SIZE_RX 允许无单位数值，% 含在内；显式声明即保护）
  const sizeVal = String(decls[axis] || '')
  if (sizeVal && NUMERIC_SIZE_RX.test(sizeVal + ';')) return true
  // ③ min-{axis} 数值 > 0（0 是「允许收缩」不是保护）
  const minVal = String(decls['min-' + axis] || '')
  if (minVal && NUMERIC_SIZE_RX.test(minVal + ';') && parseFloat(minVal) > 0) return true
  // ④ overflow hidden/clip
  const overflow = String(decls.overflow || '') + ' ' + String(decls['overflow-x'] || '') + ' ' + String(decls['overflow-y'] || '')
  if (/(^|\s)(hidden|clip)(\s|$)/.test(overflow)) return true
  return false
}

/** 触发条件：元素在 axis 方向上声明了百分比尺寸（{axis} 含 % 或 flex-basis 含 %） */
function hasPercentTrigger(decls, axis) {
  if (!decls) return false
  const v = String(decls[axis] || '')
  if (v && /[\d.]+%/.test(v)) return true
  const basis = String(decls['flex-basis'] || '')
  if (basis && /[\d.]+%/.test(basis)) return true
  const flexParts = String(decls.flex || '').split(/\s+/).filter(Boolean)
  if (flexParts.length === 3 && /%$/.test(flexParts[2])) return true
  return false
}

/** 真保护（判据 A/B 共用）：flex-shrink:0 或 {axis} 显式尺寸或 min-{axis}>0（不含 overflow） */
function hasHardProtection(decls, axis) {
  if (!decls || typeof decls !== 'object') return false
  const flexParts = String(decls.flex || '').split(/\s+/).filter(Boolean)
  if (flexParts[0] === 'none') return true
  if (flexParts.length >= 2 && /^\d*\.?\d+$/.test(flexParts[1]) && parseFloat(flexParts[1]) === 0) return true
  const shrink = String(decls['flex-shrink'] || '')
  if (shrink && parseFloat(shrink) === 0) return true
  const sizeVal = String(decls[axis] || '')
  if (sizeVal && NUMERIC_SIZE_RX.test(sizeVal + ';')) return true
  const minVal = String(decls['min-' + axis] || '')
  if (minVal && NUMERIC_SIZE_RX.test(minVal + ';') && parseFloat(minVal) > 0) return true
  return false
}

/** floor 解除判定（判据 B）：显式 min-{axis}:0 或 overflow 非 visible 会使 automatic minimum size 归零 */
function isFloorReleased(decls, axis) {
  if (!decls || typeof decls !== 'object') return false
  const minVal = String(decls['min-' + axis] || '')
  if (minVal && /^\s*0(?:px)?\s*;?$/.test(minVal + ';')) return true
  const overflow = String(decls.overflow || '') + ' ' + String(decls['overflow-x'] || '') + ' ' + String(decls['overflow-y'] || '')
  if (/(^|\s)(hidden|clip|auto|scroll|overlay)(\s|$)/.test(overflow)) return true
  return false
}

/** 容器高度是否依赖外部（判据 B）：height 为 %/flex 简写/未声明 → 依赖外部分配 */
function isHeightExternallyDependent(decls) {
  if (!decls || typeof decls !== 'object') return false
  const h = String(decls.height || '')
  if (!h) return true // 未声明 → 依赖 flex/stretch
  if (h.includes('%')) return true
  const flexParts = String(decls.flex || '').split(/\s+/).filter(Boolean)
  if (flexParts.length >= 1 && flexParts[0] !== 'none') return true // flex: 1 1 0 等
  return false
}

/**
 * 主入口：扫描文件集，输出收缩风险 issues。
 * @param {Array<{path:string, content:string}>} files .vue（含 template+style）与 .css/.less
 * @returns {{ issues: Array<object> }}
 */
export function scanFlexShrinkRisk(files) {
  const issues = []
  if (!Array.isArray(files)) return { issues }
  const rules = []
  for (const file of files) {
    if (!file || typeof file.content !== 'string') continue
    if (/\.vue$/i.test(file.path || '')) {
      const styleMatch = file.content.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || []
      for (const sm of styleMatch) {
        const inner = sm.replace(/^<style[^>]*>/i, '').replace(/<\/style>$/i, '')
        rules.push(...collectCssRules(inner))
      }
    } else if (/\.(css|less)$/i.test(file.path || '')) {
      rules.push(...collectCssRules(file.content))
    }
  }
  const classDeclMap = buildClassDeclMap(rules)

  for (const file of files) {
    if (!file || typeof file.content !== 'string' || !/\.vue$/i.test(file.path || '')) continue
    const root = parseTemplateTree(extractTemplate(file.content))
    const walk = (node, ancestors) => {
      const chain = [...ancestors, node]
      // ── 判据 B：flex column + space-between/around 容器 + 子项 floor 被解除（8db2b3b7 stat-row 形态）──
      if (node.classes.length > 0) {
        const bDecls = elementDecls(node, classDeclMap)
        if (String(bDecls.display || '').trim() === 'flex'
          && String(bDecls['flex-direction'] || 'row').trim().toLowerCase() === 'column'
          && /^(space-between|space-around)$/i.test(String(bDecls['justify-content'] || ''))
          && isHeightExternallyDependent(bDecls)
          && (node.children.length >= 2 || node.children.some((c) => c.hasVFor))) {
          for (const fc of node.children) {
            if (!fc.classes.length && !fc.style) continue
            const fcDecls = elementDecls(fc, classDeclMap)
            if (!hasHardProtection(fcDecls, 'height') && isFloorReleased(fcDecls, 'height')) {
              issues.push({
                file: file.path,
                el: fc.classes.join('.') || fc.tag,
                axis: 'height',
                flexParent: node.classes.join('.') || node.tag,
                flexChild: fc.classes.join('.') || fc.tag,
                reason: 'space-between-child-floor-released',
                evidence: { flexChildDecls: fcDecls },
              })
            }
          }
        }
      }
      // ── 判据 A：百分比尺寸落在无保护 flex 子项 ──
      // 沿父链找最近 flex 容器（k>=1 跳过 #root）
      let flexIdx = -1
      let flexDir = 'row'
      for (let k = chain.length - 2; k >= 1; k--) {
        const decls = elementDecls(chain[k], classDeclMap)
        if (String(decls.display || '').trim() === 'flex') {
          flexIdx = k
          flexDir = String(decls['flex-direction'] || 'row').trim().toLowerCase() === 'column' ? 'column' : 'row'
          break
        }
      }
      if (flexIdx > 0) {
        const flexParent = chain[flexIdx]
        const flexChild = chain[flexIdx + 1] // F 的直接子层
        const axis = flexDir === 'column' ? 'height' : 'width'
        // flex 子项层无 class 且无 style → decls 不可知，fail-open 不判（留待 WP3 运行时探针）
        const childKnown = flexChild.classes.length > 0 || !!flexChild.style
        if (childKnown
          && hasPercentTrigger(elementDecls(node, classDeclMap), axis)
          && !hasShrinkProtection(elementDecls(flexChild, classDeclMap), axis)) {
          issues.push({
            file: file.path,
            el: node.classes.join('.') || node.tag,
            axis,
            flexParent: flexParent.classes.join('.') || flexParent.tag,
            flexChild: flexChild.classes.join('.') || flexChild.tag,
            reason: 'percent-size-on-unprotected-flex-child',
            evidence: {
              elDecls: elementDecls(node, classDeclMap),
              flexChildDecls: elementDecls(flexChild, classDeclMap),
            },
          })
        }
      }
      for (const child of node.children) walk(child, chain)
    }
    for (const child of root.children) walk(child, [root])
  }
  return { issues }
}

/** 留痕摘要（供日志/meta 摘要；首版不注入 prompt） */
export function summarizeFlexShrinkIssues(issues) {
  return (issues || []).map(
    (i) => `${i.file} .${i.el} → ${i.axis} 依赖落在无保护 flex 子项 .${i.flexChild}（容器 .${i.flexParent}）`,
  )
}
