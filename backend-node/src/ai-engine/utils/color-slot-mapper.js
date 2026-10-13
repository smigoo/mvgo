// ══════════════════════════════════════════════════════════════
// 多主题业务样式颜色 → 槽位变量 映射（2026-10-13 批次二 · 映射规则 v2）
//
// 解决的瑕疵（真机 fca166e8）：LLM 生成的 common.less 业务样式颜色大量
// 硬编码（卡片 #fff / 文字 #333…），N 主题覆盖层（&.theme_x 重新展开
// common.less）里这些颜色**不跟随主题** ⇒ 主题2 切了没视觉变化。
//
// 映射规则 v2（用户已确认，纯确定性、零启发式）：
//   1. 主通道：多稿 Figma frame 为同源复制（子树路径一致），按树路径对齐后
//      「同位置两稿色值对」中，主稿 hex **精确匹配**某既有槽位的主稿值
//      ⇒ 业务样式里该 hex 替换为对应 less 变量（@color-text-base 等）。
//   2. 扩展通道：有跨稿差异但匹配不到既有槽位 ⇒ 自动生成自定义槽位
//      `@color-custom-N`（值按稿写入各主题 mixin —— 与 @color-error 等
//      自定义槽位同模式，无新机制）。
//   3. 兜底：无跨稿差异 / 单稿 ⇒ 保留字面量，不强行变量化。
//
// ⚠️ 与 multi-theme.js / style-tokens.js 的「白名单构造不透传就静默丢弃」
//    同类风险：本模块输入一律显式取字段，不做深 spread。
// ══════════════════════════════════════════════════════════════

/** 单稿树展平：路径 → 该路径主色值（同节点多填充取第一个 SOLID） */
function flattenTree(nodeData) {
  const out = {}
  const walk = (node, path) => {
    if (!node || typeof node !== 'object') return
    const name = String(node.name || '')
    const key = path ? `${path}/${name}` : name
    const fills = Array.isArray(node.fills) ? node.fills : []
    for (const f of fills) {
      if (f?.type !== 'SOLID' || f.visible === false) continue
      const c = f.color || {}
      const rgb = [c.r, c.g, c.b].map((x) => Math.round((x || 0) * 255))
      const hex = `#${rgb.map((x) => x.toString(16).padStart(2, '0')).join('')}`
      const alpha = f.opacity === undefined ? 1 : f.opacity
      if (alpha <= 0.5) break // 高透明填充不参与
      const bb = node.absoluteBoundingBox || {}
      out[key] = { hex, area: (bb.width || 0) * (bb.height || 0) }
      break
    }
    for (const ch of node.children || []) walk(ch, key)
  }
  walk(nodeData, '')
  return out
}

const normalizeHex = (hex) => String(hex || '').trim().toLowerCase()

/**
 * 构建颜色 → 槽位变量映射表。
 *
 * @param {Object} opts
 * @param {Array<{key:string, nodeData:object}>} opts.themeEntries
 *        fetchThemeNodes 产出的逐稿数据（[0] 视为主稿）——**至少 2 稿**才有映射
 * @param {Object} opts.themeSlots
 *        styleTokens.themeSlots（key → { [kebabSlotName]: value }）—— 槽位真值
 * @param {string} opts.primaryKey
 *        主稿 key（themeMeta[0].key）
 * @returns {{ replacements: Map<string,string>, customSlots: Object, stats: Object }}
 *          replacements: 主稿 hex(小写) → less 变量名（不含 @）
 *          customSlots:  varName(不含 @) → { [themeKey]: value }
 */
export function buildColorSlotMapping({ themeEntries, themeSlots, primaryKey }) {
  const EMPTY = { replacements: new Map(), customSlots: {}, stats: { pairs: 0, canonical: 0, custom: 0, unmatched: 0 } }
  const entries = Array.isArray(themeEntries) ? themeEntries.filter((t) => t?.nodeData) : []
  if (entries.length < 2) return EMPTY
  const primary = entries.find((t) => t.key === primaryKey) || entries[0]
  const secondaries = entries.filter((t) => t.key !== primary.key)
  const primarySlots = {}
  for (const [k, v] of Object.entries(themeSlots?.[primary.key] || {})) {
    primarySlots[normalizeHex(v)] = k // hex 小写 → 槽位 kebab 名
  }

  const primaryTree = flattenTree(primary.nodeData)
  const secondaryTrees = secondaries.map((t) => ({ key: t.key, tree: flattenTree(t.nodeData) }))

  const replacements = new Map()
  const customSlots = {}
  let customSeq = 0
  let statCanonical = 0
  let statCustom = 0
  let statUnmatched = 0

  for (const [path, pInfo] of Object.entries(primaryTree)) {
    const mainHex = normalizeHex(pInfo.hex)
    // 每个副稿在同路径的色值（取第一个命中）
    const perSecondary = []
    for (const st of secondaryTrees) {
      const hit = st.tree[path]
      if (hit) perSecondary.push({ themeKey: st.key, hex: normalizeHex(hit.hex) })
    }
    if (perSecondary.length === 0) {
      statUnmatched++
      continue
    }
    // 有「任一副稿与主稿不同」才算有效色值对（全同 ⇒ 该色值不随主题变，保留字面量）
    const differs = perSecondary.some((p) => p.hex !== mainHex)
    if (!differs) {
      statUnmatched++
      continue
    }

    if (primarySlots[mainHex]) {
      // 主通道：精确命中既有槽位
      replacements.set(mainHex, primarySlots[mainHex])
      statCanonical++
      continue
    }
    // 扩展通道：自动生成自定义槽位
    //   命名 color-custom-N（语义命名无法自动化，先序号；与 @color-error 等自定义槽位同模式）
    customSeq++
    const varName = `color-custom-${customSeq}`
    replacements.set(mainHex, varName)
    const slotValues = { [primary.key]: pInfo.hex }
    for (const p of perSecondary) {
      if (!(p.themeKey in slotValues)) slotValues[p.themeKey] = p.hex
    }
    customSlots[varName] = slotValues
    statCustom++
  }

  return {
    replacements,
    customSlots,
    stats: {
      pairs: Object.keys(primaryTree).length,
      canonical: statCanonical,
      custom: statCustom,
      unmatched: statUnmatched,
    },
  }
}

/**
 * 把映射应用到产物（确定性后处理，LESS 编译门禁之前调用）：
 *   1. 自定义槽位写入 theme-vars.less 各主题 mixin（缺失才补，幂等）
 *   2. common.less 里主稿 hex 字面量（大小写不敏感、精确匹配）替换为 less 变量引用
 *
 * ⚠️ 只处理 common.less —— 覆盖层（themes/*.less）与 css-vars.js 是「定义处」
 *    不参与替换；.vue style 规范上不写业务颜色（在 common.less），暂不扫。
 *
 * @param {Object} opts
 * @param {string} opts.outputPath 组件产物目录
 * @param {Object} opts.mapping    buildColorSlotMapping 的返回
 * @param {import('fs')} fsMod     注入 fs（便于测试）
 * @param {Object} pathMod         注入 path
 * @returns {{customSlotsInjected: string[], replacedCount: number}}
 */
export function applyColorSlotMapping({ outputPath, mapping, fsMod, pathMod }) {
  const { readFileSync, writeFileSync, existsSync } = fsMod
  const { join } = pathMod
  const result = { customSlotsInjected: [], replacedCount: 0 }
  if (!mapping || !(mapping.replacements instanceof Map) || mapping.replacements.size === 0) {
    return result
  }

  // 1) 自定义槽位 → theme-vars.less 各主题 mixin（缺失才补写，幂等）
  const themeVarsPath = join(outputPath, 'resources', 'styles', 'themes', 'theme-vars.less')
  if (existsSync(themeVarsPath) && Object.keys(mapping.customSlots || {}).length > 0) {
    let tv = readFileSync(themeVarsPath, 'utf-8')
    let tvChanged = false
    for (const [varName, perTheme] of Object.entries(mapping.customSlots)) {
      for (const [themeKey, value] of Object.entries(perTheme)) {
        const mixinName = `theme-${themeKey}`
        // 三段式 replace（head/body/tail）—— 与 less-variable-checker#appendVarsToMixin
        //   同款；直接拼 `all` 会把新变量插到闭括号之后（不在 mixin 内）。
        const re = new RegExp(`(\\.${mixinName}\\s*\\(\\s*\\)\\s*\\{)([^}]*)(\\})`)
        const m = tv.match(re)
        if (!m) continue // 该主题 mixin 不存在：跳过（不制造半成品）
        const varRe = new RegExp(`@${varName}\\s*:`)
        if (varRe.test(m[2])) continue // 已声明，幂等（m[2] = body 组；m[1] 是 head）
        tv = tv.replace(re, (all, head, body, tail) => {
          const trimmed = body.replace(/\s+$/, '')
          return `${head}${trimmed}\n  @${varName}: ${value}; // 自愈：跨稿色值对自动槽位\n${tail}`
        })
        tvChanged = true
        const tag = `@${varName}→.${mixinName}()`
        if (!result.customSlotsInjected.includes(tag)) result.customSlotsInjected.push(tag)
      }
    }
    if (tvChanged) writeFileSync(themeVarsPath, tv, 'utf-8')
  }

  // 2) common.less 色值字面量 → less 变量引用
  const commonPath = join(outputPath, 'resources', 'styles', 'common.less')
  if (!existsSync(commonPath)) return result
  let common = readFileSync(commonPath, 'utf-8')
  let replacedCount = 0
  for (const [hex, varName] of mapping.replacements) {
    // 精确 6 位 hex（大小写不敏感）；变量引用形如 @color-text-base（less 变量作用域：
    // common.less 由 index.less / themes/*.less @import，调用方已 .common()/.theme-X() ⇒ 变量可见）
    const re = new RegExp(`#${hex.replace('#', '')}\\b`, 'gi')
    common = common.replace(re, () => {
      replacedCount++
      return `@${varName}`
    })
  }
  if (replacedCount > 0) {
    writeFileSync(commonPath, common, 'utf-8')
    result.replacedCount = replacedCount
  }
  return result
}
