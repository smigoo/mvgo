/**
 * F3：背景「6 红线」改写的 scaleMode 真值护栏（纯函数）。
 *
 * 精修红线无条件把 `background-size: cover|contain` 改成 `100% 100%` 并删 `center`/`no-repeat`，
 * 会把 `sizeFromScaleMode`（FILL→cover / FIT→contain）给出的真值推翻。本模块让命中真值的声明免于改写。
 * 设计依据与全语料数据口径见 docs/2026-11-05-刀53图表接管与背景缩放高度契约三链治本.md §11.3。
 * 白名单为空（无 scaleMode 真值）时输出与旧实现逐字一致。
 */
import {
  sizeFromScaleMode,
  buildBackgroundResourceIndex,
  buildBgVarToResource,
  resolveBackgroundResourceRef,
} from './background-size-inference.js'

const MAPPING_KEYS = ['resourceDomMapping', 'resourceMapping', 'effectiveMapping']

/**
 * 建「资源 basename → 权威四件套」索引；无 scaleMode 真值 ⇒ 空 Map。
 * @returns {Map<string,{size:string,repeat:string,inferredBy:string}>}
 */
export function buildScaleModeIndex(params) {
  const mapping = MAPPING_KEYS.map((k) => params?.[k]).find(Boolean) || null
  const idx = new Map()
  for (const [res, m] of buildBackgroundResourceIndex(mapping)) {
    const authoritative = sizeFromScaleMode(m)
    if (authoritative) idx.set(res, authoritative)
  }
  return idx
}

/**
 * 取 `offset` 所在的声明作用域原文（规则块 / `:style` 对象）。
 * `${bg4}` 的插值花括号不是块边界 ⇒ 先等长替换成 `$[bg4]`（offset 不漂移、变量名仍可解析）。
 */
export function declarationScopeAt(content, offset) {
  const norm = String(content || '').replace(
    /\$\{([\w$.[\]'"]+)\}/g,
    (_m, inner) => '$[' + inner + ']',
  )
  let depth = 0
  let open = -1
  for (let i = offset - 1; i >= 0; i--) {
    if (norm[i] === '}') depth += 1
    else if (norm[i] === '{') {
      if (depth > 0) { depth -= 1; continue }
      open = i
      break
    }
  }
  if (open < 0) return norm.slice(0, offset)
  let d = 0
  let close = norm.length
  for (let i = open; i < norm.length; i++) {
    if (norm[i] === '{') d += 1
    else if (norm[i] === '}' && --d === 0) { close = i; break }
  }
  return norm.slice(open, close)
}

/**
 * `offset` 处的背景声明是否受 scaleMode 真值管辖（受管 ⇒ 不得改写）。
 * 按作用域而非向前扫窗口取 `backgroundImage` 值：否则相邻规则的图会串味。
 * @returns {{size:string,repeat:string,inferredBy:string}|null}
 */
export function authScaleModeAt(content, offset, varToRes, scaleIndex) {
  if (!scaleIndex || scaleIndex.size === 0 || !varToRes) return null
  const scope = declarationScopeAt(content, offset)
  const re = /backgroundImage\s*:\s*([`'"])|background-image\s*:\s*([^;}]+)/gi
  let m
  let last = null
  while ((m = re.exec(scope)) !== null) last = m
  if (!last) return null
  const raw = last[1]
    ? (() => {
        const tail = scope.slice(last.index + last[0].length)
        const end = tail.indexOf(last[1])
        return end >= 0 ? tail.slice(0, end) : tail
      })()
    : last[2]
  const res = resolveBackgroundResourceRef(raw, varToRes)
  return (res && scaleIndex.get(res)) || null
}

/** 6 红线规则（顺序即改写顺序） */
const BG_RED_LINE_RULES = [
  { re: /background-size\s*:\s*cover/gi, make: () => 'background-size: 100% 100%' },
  { re: /background-size\s*:\s*contain/gi, make: () => 'background-size: 100% 100%' },
  { re: /backgroundSize\s*:\s*['"]cover['"]/gi, make: () => "backgroundSize: '100% 100%'" },
  { re: /[;\s]*background-position\s*:\s*center\s*;?/gi, make: () => '' },
  { re: /,\s*backgroundPosition\s*:\s*['"]center['"]/gi, make: () => '' },
  { re: /backgroundPosition\s*:\s*['"]center['"]\s*,?\s*/gi, make: () => '' },
  { re: /[;\s]*background-repeat\s*:\s*no-repeat\s*;?/gi, make: () => '' },
]

/**
 * 对文件内容执行 6 红线改写，命中真值的声明跳过；无真值时逐字等同旧实现。
 * @param {string} content
 * @param {object} params 精修入参（含资源映射）
 * @returns {{content:string, kept:number, rewritten:number, whitelist:number}}
 */
export function applyBackgroundRedLine(content, params) {
  const src = String(content || '')
  const scaleIndex = buildScaleModeIndex(params)
  const varToRes = scaleIndex.size > 0 ? buildBgVarToResource(src) : null
  let next = src
  let kept = 0
  let rewritten = 0

  for (const rule of BG_RED_LINE_RULES) {
    const cur = next
    next = cur.replace(rule.re, (match, ...rest) => {
      const offset = rest[rest.length - 2]
      if (authScaleModeAt(cur, offset, varToRes, scaleIndex)) {
        kept += 1
        return match
      }
      rewritten += 1
      return rule.make()
    })
  }
  return { content: next, kept, rewritten, whitelist: scaleIndex.size }
}
