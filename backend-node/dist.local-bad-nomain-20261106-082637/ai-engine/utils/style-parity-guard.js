/**
 * 🎨 style-parity-guard（2026-10-08 · WP2 · 13.2 评审修正）
 *
 * 治「主题覆盖层对非令牌化字面量失效」：THEME_WRAPPER_TEMPLATES 把整个 common.less
 * 复制进 &.dark/&.light（仅换 CSS 变量），color 走 var() 可随主题切换，
 * 但 text-shadow 等硬字面量两主题同值（d9a0ab7d 实锤：深色稿投影在浅色面板突兀）。
 *
 * 扫描编译产物 CSS（package/resources/styles/*.css）中 `.dark .X` / `.light .X`
 * 规则对：同一选择器、同一属性、两侧取值相同且都不含 var() → 留痕违规。
 * 只留痕不阻断（fail-open）；纯函数、无 IO。
 */

const DARK_LIGHT_RX = /^\s*(?:&)?\.(dark|light)\s+([^{/]+)\s*\{/gm

/**
 * 视觉类属性白名单：主题包装层会把 common.less 整体复制进 .dark/.light，
 * display/width/flex 等机制属性两主题同值是**正常**的（d9a0ab7d 重放 143 条误报实锤），
 * 只有「视觉字面量」（阴影/背景/颜色类）同值非 var 才是缺陷信号。
 */
const VISUAL_PROPS = new Set([
  'text-shadow', 'box-shadow', 'background', 'background-color', 'background-image',
  'color', 'border', 'border-color', 'border-top-color', 'border-bottom-color',
  'border-left-color', 'border-right-color', 'opacity', 'filter', 'fill', 'stroke',
])

/** 逐条 CSS 规则抽取：选择器 → 声明表 */
function _extractRules(css) {
  const rules = []
  const rx = /([^{}]+)\{([^{}]*)\}/g
  let m
  while ((m = rx.exec(css))) {
    const sel = m[1].replace(/\s+/g, ' ').trim()
    const decls = m[2]
    rules.push({ sel, body: decls })
  }
  return rules
}

function _parseDecls(body) {
  const out = new Map()
  for (const part of body.split(';')) {
    const idx = part.indexOf(':')
    if (idx <= 0) continue
    const prop = part.slice(0, idx).trim().toLowerCase()
    const val = part.slice(idx + 1).trim()
    if (prop && val) out.set(prop, val)
  }
  return out
}

/**
 * 扫描主题变体值一致性。
 * @param {Array<{path:string, content:string}>} files - 产物文件
 * @returns {{checked:number, violations:Array<{file:string, selector:string, prop:string, value:string, hint:string}>}}
 */
export function scanThemeVariantParity(files) {
  const result = { checked: 0, violations: [] }
  if (!Array.isArray(files)) return result

  for (const f of files) {
    if (!f || typeof f.path !== 'string' || typeof f.content !== 'string') continue
    if (!/\.css$/.test(f.path)) continue
    // 只看含 .dark 与 .light 双变体的文件（fail-open：无主题分层零开销）
    if (!f.content.includes('.dark') || !f.content.includes('.light')) continue
    result.checked += 1

    const dark = new Map()
    const light = new Map()
    for (const { sel, body } of _extractRules(f.content)) {
      const mDark = /(?:^|\s)\.dark\s+(.+)$/.exec(sel) || /^\.dark$/.test(sel) ? sel : null
      if (!mDark) continue
      // 选择器须以 .dark 作用域开头（.dark .x 或 .dark.x）
      if (!/(^|\s)\.dark[\s.]/.test(sel) && sel !== '.dark') continue
      dark.set(sel.replace(/(^|\s)\.dark\s?/, '').trim(), _parseDecls(body))
    }
    for (const { sel, body } of _extractRules(f.content)) {
      if (!/(^|\s)\.light[\s.]/.test(sel) && sel !== '.light') continue
      light.set(sel.replace(/(^|\s)\.light\s?/, '').trim(), _parseDecls(body))
    }

    for (const [sel, dDecls] of dark) {
      const lDecls = light.get(sel)
      if (!lDecls) continue
      for (const [prop, dVal] of dDecls) {
        if (!VISUAL_PROPS.has(prop)) continue
        const lVal = lDecls.get(prop)
        if (lVal === undefined) continue
        if (dVal === lVal && !/var\(/i.test(dVal)) {
          result.violations.push({
            file: f.path,
            selector: sel,
            prop,
            value: dVal.slice(0, 80),
            hint: `.dark/.light 两主题该属性同值且非 var() —— 主题切换对该声明无效（d9a0ab7d 实锤：深色稿 text-shadow 硬字面量在浅色面板突兀）。请令牌化或按主题分档`,
          })
        }
      }
    }
  }
  return result
}

/**
 * 扫描「已下载但未被产物实际使用」的孤儿资源。
 * 两种形态（d9a0ab7d 实锤：bg-124 被 index.vue import 却零使用 → 卡片裸底）：
 *   - unused-import：import 了变量但变量在 import 行之外零使用（死 import，视觉缺失）；
 *   - never-referenced：变量与文件名在产物中完全无引用。
 * @param {Array} resourceDomMapping - 资源映射
 * @param {Array<{path:string, content:string}>} files - 产物文件
 * @returns {{checked:number, orphans:Array<{varName:string, file:string, sectionId:string, kind:string, hint:string}>}}
 */
export function scanOrphanResources(resourceDomMapping, files) {
  const result = { checked: 0, orphans: [] }
  if (!Array.isArray(resourceDomMapping) || !Array.isArray(files) || files.length === 0) return result

  const escapeRe = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const corpus = files.map((f) => (typeof f?.content === 'string' ? f.content : '')).join('\n')
  if (!corpus) return result
  // 剥离 import 行后的语料：变量的「真实使用」（:src 绑定/inline :style/模板插值）都发生在非 import 行
  const corpusNoImports = corpus.replace(/^\s*import\s[^;\n]+['"][^'"]+['"];?[^\S\n]*$/gm, '')

  for (const m of resourceDomMapping) {
    if (!m || m.downloadStatus !== 'success' || !m.assignedVarName) continue
    result.checked += 1
    const varName = String(m.assignedVarName)
    const varRx = new RegExp(`\\b${escapeRe(varName)}\\b`)
    const base = String(m.resourceFile || '').split('/').pop()
    const baseRx = base ? new RegExp(escapeRe(base)) : null
    if (varRx.test(corpusNoImports) || (baseRx && baseRx.test(corpusNoImports))) continue
    const kind = varRx.test(corpus) ? 'unused-import' : 'never-referenced'
    result.orphans.push({
      varName,
      file: base,
      sectionId: m.ownerSectionId || '',
      kind,
      hint:
        kind === 'unused-import'
          ? `资源 ${varName}(${base}) 被 import 但变量零使用（死 import，d9a0ab7d 实锤：bg-124 挂了 import 卡片仍裸底）——多卡多 bg 应逐卡绑定到卡片根容器`
          : `已下载资源 ${varName}(${base}) 未被任何产物文件引用（孤儿）——多卡多 bg 应 1:1 全引用`,
    })
  }
  return result
}
