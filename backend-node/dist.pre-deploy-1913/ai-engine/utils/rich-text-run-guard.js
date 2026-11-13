/**
 * 🛡️ R19 · 行内多段文字样式落位判据（2026-10-21 · c-bb8-304bb8d3 实锤）
 *
 * ── 为什么需要它（现有判据为什么全绿）────────────────────────────────────
 *
 * 产物三个 section 的 chip（126×30，`华为技术` + `8台`）真值是：
 *   name `#333333` 14px/400 ｜ count 段色（战略 `#b9a000` / 优质 `#00ac2e` / 普通 `#0099bb`，
 *   零值统一 `#679bbe`）。
 *
 * 实际产物三套写法各不相同且都错：`@color-product-count:#333`（语义推断补位）、
 * 真值金塞进恒假的 `&--active`、普通段 chip 串优质段色。
 *
 * 现有判据**全部零覆盖**：
 *   · TEXT-TRUTH / TEXT-COVERAGE：只判 `characters` 字符串在不在，不看样式；
 *   · `truth-color-usage-guard`：只判「色值是否出现在子树」；
 *   · 本类判据此前不存在。
 *   ⇒ 与「背景该有但挂错层」同族：**判据只判「存在」，不判「落位」**。
 *
 * ── 🔴 第一版实现被离线回放证伪（务必读，别再走回头路）────────────────
 *
 * 最初的 RICH-TEXT-001 是「该段色在产物颜色语料里零出现就报」。拿真机产物 + 真机
 * Figma 真值离线回放：`judged=33, missingColor=0, issues=0` —— **零命中**。
 * 原因：三段的真值色确实都写在主题变量表里（`@color-*`），只是**没挂到该段的元素上**。
 * 这正是假绿闭环：判据域（全局色板）≠ 事实落点（某个 span 的 color）。
 * ⇒ 判据必须解析到**元素级**：run → 模板元素 → class → 规则块 → color（含变量展开），
 *   再与真值逐段比较。否则不如不做。
 *
 * ── 当前判据（元素级，可证伪，不可解一律 fail-open）────────────────────
 *
 * 映射（run → 元素，两级，全部确定性）：
 *   ① 字面量：模板元素内容去空白后恰好等于该段文本；
 *   ② 绑定：元素内容是 `{{ x.prop }}`，且同文件 script 里存在 `prop: '<该段文本>'` 字面量
 *      （数据数组原样照抄的产物必然命中；拿不到字面量 ⇒ 不映射、不猜）。
 *
 * 取值（元素 → color）：
 *   · inline `style="color:…"` 优先；
 *   · 否则 class → 全部样式文件的规则块（**只取块内顶层声明**，嵌套 `&--active` 里的
 *     color 不算该元素的生效色）→ 变量 `@x` 展开（≤5 跳）。
 *
 *   RICH-TEXT-001（error）：该行各段都映射成功且取到了色，但与真值**逐段不等**
 *     （含"整行统一套色"、"用了别的段的色"、"色挂在恒不命中的条件类里"）。
 *   RICH-TEXT-002（warn）：各段文本以整行连续字面量挤在同一元素内（结构被压平）。
 *
 * 三态 + fail-open：任一段映射不到 / 取不到色 / 真值非多段 ⇒ **该行不判**（stats 留痕）。
 *   宁可不判，也不产出"绿得莫名其妙"的结论。
 */

import { extractTextRuns, hasMixedRunStyles } from './text-runs.js'

const HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i
const HEX6 = /^#([0-9a-f]{6})$/i

/** 任意颜色写法 → `#rrggbb`（仅用于比较；无法归一返回 null）。 */
export function toHexColor(input) {
  if (typeof input !== 'string') return null
  const s = input.trim()
  const h3 = s.match(HEX3)
  if (h3) return `#${h3[1]}${h3[1]}${h3[2]}${h3[2]}${h3[3]}${h3[3]}`.toLowerCase()
  const h6 = s.match(HEX6)
  if (h6) return `#${h6[1]}`.toLowerCase()
  const m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i)
  if (m) {
    const to2 = (v) => Math.max(0, Math.min(255, Math.round(Number(v)))).toString(16).padStart(2, '0')
    return `#${to2(m[1])}${to2(m[2])}${to2(m[3])}`
  }
  return null
}

/** 产物全部文件里出现过的颜色 → Set（保留：供"真值色是否进过产物"的粗查）。 */
export function collectColorPalette(files) {
  const palette = new Set()
  for (const content of Object.values(files || {})) {
    if (typeof content !== 'string') continue
    for (const m of content.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      const hex = toHexColor(m[0])
      if (hex) palette.add(hex)
    }
    for (const m of content.matchAll(/rgba?\([^)]*\)/gi)) {
      const hex = toHexColor(m[0])
      if (hex) palette.add(hex)
    }
  }
  return palette
}

const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// ─────────────────────────────────────────────────────────────────────────────
// 样式索引：规则块（只取块内顶层声明）+ 变量表
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 扫描样式文本，产出 `[{ selector, decls }]`。
 * 关键：**只收块内顶层声明** —— 嵌套块（`&--active {}`、`.a { .b {} }`）的声明不并入父块，
 * 否则"把真值色写进恒不命中的条件类"会被当成已落地（正是本判据要抓的病灶之一）。
 */
function scanRuleBlocks(styleText) {
  const out = []
  const text = String(styleText || '')
  let depth = 0
  let selStart = 0
  let bodyStart = -1
  const stack = [] // { selector, bodyStart, declsStartDepth }
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '{') {
      const selector = text.slice(selStart, i).trim()
      stack.push({ selector, bodyStart: i + 1, depth })
      depth += 1
      selStart = i + 1
    } else if (ch === '}') {
      const top = stack.pop()
      if (top) {
        depth -= 1
        // 该块声明区 = bodyStart..i，但要去掉其中嵌套块的内容
        const body = stripNestedBlocks(text.slice(top.bodyStart, i))
        if (top.selector) out.push({ selector: top.selector, decls: body })
      }
      selStart = i + 1
    } else if (ch === ';' && depth === 0) {
      selStart = i + 1
    }
  }
  return out
}

/** 去掉声明区里的嵌套 `{...}`（含其选择器尾段），只留本层声明。 */
function stripNestedBlocks(body) {
  let out = ''
  let depth = 0
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]
    if (ch === '{') {
      // 回删本层选择器残片（从上一个 ; 或开头到此处）
      const cut = Math.max(out.lastIndexOf(';'), out.lastIndexOf('}')) + 1
      out = out.slice(0, cut)
      depth += 1
      continue
    }
    if (ch === '}') {
      depth = Math.max(0, depth - 1)
      continue
    }
    if (depth === 0) out += ch
  }
  return out
}

/** `@name: value;` 变量表（less 变量；css 自定义属性 `--x: value` 一并收）。
 *  ⚠️ 同一变量在浅/深两套主题里会有**多个不同定义** ⇒ 必须收成集合，
 *  不能"最后一条覆盖"（那会把深色轨的值当成浅色轨的生效色，制造假阳性）。 */
function collectVarTable(files) {
  const vars = new Map() // name -> Set<value>
  const put = (name, value) => {
    if (!vars.has(name)) vars.set(name, new Set())
    vars.get(name).add(String(value).trim())
  }
  for (const content of Object.values(files || {})) {
    if (typeof content !== 'string') continue
    for (const m of content.matchAll(/(^|[;{}\s])(@[\w-]+|--[\w-]+)\s*:\s*([^;{}]+)[;}]/g)) {
      put(m[2], m[3])
    }
  }
  return vars
}

/**
 * 声明值 → 候选颜色集合（**全部可能生效的 hex**）。
 * 主题变量多定义时返回多值；任一命中真值即视为落地，全部不命中才报。
 * 组合爆炸上限 24（超过则只取前 24 种，宁可漏判不误判）。
 */
function expandColorCandidates(decl, vars) {
  const raw = String(decl || '').trim()
  if (!raw) return []
  // 收集引用
  const refs = []
  for (const m of raw.matchAll(/var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/g)) refs.push(m[0])
  for (const m of raw.matchAll(/@[\w-]+/g)) refs.push(m[0])

  const dir = (ref) => {
    if (ref.startsWith('var(')) {
      const name = /--[\w-]+/.exec(ref)?.[0]
      return name ? [...(vars.get(name) || [])] : []
    }
    return [...(vars.get(ref) || [])]
  }

  const combos = new Set([raw])
  for (const ref of refs) {
    const values = dir(ref)
    if (values.length === 0) continue
    const next = new Set()
    for (const base of combos) {
      for (const v of values) {
        next.add(base.split(ref).join(v))
        if (next.size > 24) break
      }
      if (next.size > 24) break
    }
    combos.clear()
    for (const v of next) combos.add(v)
  }

  const hexes = []
  for (const c of combos) {
    const hex = toHexColor(c)
    if (hex && !hexes.includes(hex)) hexes.push(hex)
  }
  return hexes
}

/** 建一次索引：规则块（按出现顺序）+ 变量表。 */
function buildStyleIndex(files) {
  const blocks = []
  const pushStyle = (text) => {
    for (const b of scanRuleBlocks(text)) blocks.push(b)
  }
  for (const [fp, content] of Object.entries(files || {})) {
    if (typeof content !== 'string') continue
    if (/\.(less|css)$/i.test(fp)) pushStyle(content)
    else if (/\.vue$/i.test(fp)) {
      for (const m of content.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) pushStyle(m[1])
    }
  }
  return { blocks, vars: collectVarTable(files) }
}

/**
 * 取某 class 的**全部** color 声明（基础规则 + 主题/伪类变体）。
 *
 * 🔴 不要"最后一条胜出"：产物里同一 class 会有
 *   `.c-x-count{}`、`.light .c-x-count{}`、`.dark .c-x-count{}` 三份，
 *   按出现顺序取最后一条会把**深色轨的值**当默认生效色（离线回放实测：真值 #b9a000
 *   被报成 actual #e6e6e6，误导定位）。这里收成候选集合，任一命中真值即放行。
 */
function resolveClassColorDecls(cls, index) {
  const re = new RegExp(`\\.${escRe(cls)}(?![\\w-])`)
  const out = []
  for (const b of index.blocks) {
    if (!re.test(b.selector)) continue
    // 交互/条件态（hover / first-child / :not 等）不是静态生效色 → 排除。
    // 注意 `.cls--active` 已被 `(?![\w-])` 挡住、`&--active` 在 selector 里没有 `.cls`，天然排除。
    if (/&|:hover|:active|:focus|:visited|:first-child|:last-child|:nth-|:not\(/i.test(b.selector)) continue
    const m = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(b.decls)
    if (m) out.push(m[1].trim())
  }
  return out
}

/** 元素 → 生效色的**候选集合**（inline style 优先，再 class）。无候选返回 null。 */
function resolveElementColor(attrs, index) {
  const styleM = /\bstyle\s*=\s*"([^"]*)"/i.exec(attrs || '')
  if (styleM) {
    const m = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(styleM[1])
    if (m) {
      const hexes = expandColorCandidates(m[1], index.vars)
      if (hexes.length > 0) return { hexes, raw: m[1].trim(), via: 'inline' }
    }
  }
  const clsM = /\bclass\s*=\s*"([^"]*)"/i.exec(attrs || '')
  if (!clsM) return null
  for (const cls of clsM[1].split(/\s+/).filter(Boolean)) {
    const decls = resolveClassColorDecls(cls, index)
    if (decls.length === 0) continue
    const hexes = []
    for (const d of decls) {
      for (const h of expandColorCandidates(d, index.vars)) {
        if (!hexes.includes(h)) hexes.push(h)
      }
    }
    if (hexes.length > 0) return { hexes, raw: decls.join(' / '), via: cls }
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// run → 模板元素 映射
// ─────────────────────────────────────────────────────────────────────────────

/** 扁平文本元素（无子标签）：`<span ...>文本或{{绑定}}</span>`。 */
function findTextElements(template) {
  const out = []
  const re = /<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>([^<]*)<\/\1>/g
  let m
  while ((m = re.exec(template))) {
    out.push({ tag: m[1], attrs: m[2] || '', content: (m[3] || '').trim(), index: m.index })
  }
  return out
}

/** 从 .vue 取 script 段。 */
function scriptOf(content) {
  const m = String(content || '').match(/<script[^>]*>([\s\S]*?)<\/script>/i)
  return m ? m[1] : ''
}

/** 收集 `prop: 'literal'` 与 `prop: "literal"`（含对象/数组项）。 */
function collectScriptStringProps(script) {
  const map = new Map() // value -> Set<prop>
  for (const m of String(script || '').matchAll(/([A-Za-z_$][\w$]*)\s*:\s*(['"`])([^'"`\n]*)\2/g)) {
    const prop = m[1]
    const val = m[3]
    if (!map.has(val)) map.set(val, new Set())
    map.get(val).add(prop)
  }
  return map
}

/**
 * 在该 .vue 内为每段文本找一个**承载元素**。
 * @returns {Array<{attrs:string}|null>} 与 runs 等长；任一为 null 表示映射失败
 */
function mapRunsToElements(vueContent, runs) {
  const tplM = String(vueContent || '').match(/<template[^>]*>([\s\S]*?)<\/template>/i)
  if (!tplM) return runs.map(() => null)
  const elements = findTextElements(tplM[1])
  const props = collectScriptStringProps(scriptOf(vueContent))

  return runs.map((r) => {
    const text = String(r.text || '').trim()
    if (!text) return null
    // ① 字面量
    const literal = elements.find((e) => e.content.replace(/\s+/g, '') === text.replace(/\s+/g, ''))
    if (literal) return literal
    // ② 绑定 + script 字面量（prop 值 == 该段文本）
    const propSet = props.get(text)
    if (!propSet) return null
    for (const e of elements) {
      const b = /^\{\{\s*([A-Za-z_$][\w$.]*)\s*\}\}$/.exec(e.content)
      if (!b) continue
      const last = b[1].split('.').pop()
      if (propSet.has(last)) return e
    }
    return null
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 主判据
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {Object<string,string>} files 产物文件表（path → content）
 * @param {{figmaRoot?:Object, textRuns?:Object, itemTemplatePath?:string}} [ctx]
 * @returns {{issues:Array, stats:Object}}
 */
export function detectRichTextRunIssues(files, ctx = {}) {
  const issues = []
  const stats = {
    truth: ctx.textRuns ? 'passed' : ctx.figmaRoot ? 'built' : 'none',
    containers: 0,
    mixedLines: 0,
    judged: 0,
    mismatch: 0,
    flattened: 0,
    skippedUnmapped: 0,
  }
  if (!files || typeof files !== 'object') return { issues, stats }

  const tr = ctx.textRuns || (ctx.figmaRoot ? extractTextRuns(ctx.figmaRoot) : null)
  if (!tr || !tr.lines) return { issues, stats }

  const index = buildStyleIndex(files)
  const vueFiles = Object.entries(files).filter(
    ([fp, c]) => /\.vue$/i.test(fp) && typeof c === 'string',
  )
  const allTemplates = vueFiles
    .map(([fp, c]) => {
      const m = c.match(/<template[^>]*>([\s\S]*?)<\/template>/i)
      return { fp, content: c, tpl: m ? m[1] : '' }
    })
    .filter((x) => x.tpl)

  for (const [containerId, lines] of tr.lines) {
    stats.containers += 1
    for (const line of lines || []) {
      const runs = Array.isArray(line?.runs) ? line.runs : []
      // 判定域收窄：只有「确实多段且样式确实不同」的行才判
      if (runs.length < 2 || !hasMixedRunStyles(runs)) continue
      stats.mixedLines += 1

      // ① 结构压平：整行连续字面量出现在同一元素内
      const joined = runs.map((r) => r.text).join('')
      if (joined) {
        const flatRe = new RegExp(`>\\s*${escRe(joined)}\\s*<`)
        const host = allTemplates.find((v) => flatRe.test(v.tpl))
        if (host) {
          const eachSplit = runs.every((r) =>
            r.text ? new RegExp(`>\\s*${escRe(r.text)}\\s*<`).test(host.tpl) : true,
          )
          if (!eachSplit) {
            stats.flattened += 1
            issues.push({
              id: 'RICH-TEXT-002',
              severity: 'warn',
              containerId: String(containerId),
              file: host.fp,
              detail:
                `行内多段被压平：容器 ${containerId} 的「${joined}」在 ${host.fp} 中以整行字面量` +
                `出现在同一元素内，应按段拆成 ${runs.length} 个并列元素`,
              runs: runs.map((r) => ({ text: r.text, color: r.color })),
            })
          }
        }
      }

      // ② 段色落位：逐个候选文件试映射，**任一个文件判对即放行**
      //    （同一文本（如 `8台`）会出现在多个子组件里，取首个命中会张冠李戴 ⇒ 用"全错才报"）
      const candidates = []
      for (const v of allTemplates) {
        const els = mapRunsToElements(v.content, runs)
        if (!els.every(Boolean)) continue
        const resolved = els.map((e) => resolveElementColor(e.attrs, index))
        if (resolved.some((x) => !x)) continue
        candidates.push({ file: v.fp, els, resolved })
      }
      if (candidates.length === 0) {
        stats.skippedUnmapped += 1
        continue
      }
      let best = null // 判定"最对"的候选（错得最少）
      for (const c of candidates) {
        const mm = []
        for (let i = 0; i < runs.length; i += 1) {
          const truthHex = toHexColor(runs[i].color)
          if (!truthHex) continue
          // 主题变量多定义 ⇒ 候选多值：**任一命中即视为落地**（避免拿深色轨的值判浅色轨）
          if (!c.resolved[i].hexes.includes(truthHex)) {
            mm.push({
              text: runs[i].text,
              truth: truthHex,
              actual: c.resolved[i].hexes.join('|'),
              via: c.resolved[i].via,
            })
          }
        }
        c.mismatches = mm
        if (!best || mm.length < best.mismatches.length) best = c
      }
      stats.judged += 1
      if (best.mismatches.length > 0) {
        stats.mismatch += 1
        const mm = best.mismatches
        issues.push({
          id: 'RICH-TEXT-001',
          severity: 'error',
          containerId: String(containerId),
          file: best.file,
          missing: mm,
          runs: runs.map((r) => ({ text: r.text, color: r.color })),
          detail:
            `行内多段样式落位错误：容器 ${containerId} 的「${runs.map((r) => r.text).join('')}」` +
            `期望 ${mm.map((m) => `${m.text}=${m.truth}`).join(', ')}，` +
            `实际 ${mm.map((m) => `${m.text}=${m.actual}`).join(', ')}`,
        })
      }
    }
  }

  return { issues, stats }
}

/** 便于日志/诊断：一段话摘要。 */
export function summarizeRichTextRunStats(stats) {
  if (!stats) return 'rich-text: n/a'
  return (
    `rich-text: truth=${stats.truth} containers=${stats.containers} mixed=${stats.mixedLines}` +
    ` judged=${stats.judged} mismatch=${stats.mismatch} flattened=${stats.flattened}` +
    ` skipUnmapped=${stats.skippedUnmapped}`
  )
}

export default { detectRichTextRunIssues, collectColorPalette, toHexColor, summarizeRichTextRunStats }
