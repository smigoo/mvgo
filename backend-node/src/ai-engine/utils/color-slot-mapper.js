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

/**
 * 🔍 语义推断槽位审计（2026-10-19，c-aiot-dpjh-bsjd-c27cb2eb 实锤）
 *
 * `less-variable-checker#addMissingVariables` 补缺失变量时用的是 `safeLessVarValue`
 * **按名字 + 明暗猜测**（落盘带 `// 自动添加（语义推断）` 注释），不是 Figma 真值。
 * 这类槽位一旦被 common.less 实际引用，该处颜色就**不跟随副稿设计** ——
 * 正是「深色设计稿版本 ≈ 默认 dark」的观感来源（@color-card-bg #ffffff/#2b2b2b
 * 这类中性灰，而不是副稿的 #123259/#98c2f6）。
 *
 * 只报不改（fail-open、零副作用）：供调用方 logger.warn / meta 留痕。
 *
 * @param {Object} opts
 * @param {string} [opts.themeVarsContent] theme-vars.less 全文
 * @param {string} [opts.commonLessContent] common.less 全文
 * @returns {{guessed:string[], risky:string[], riskCount:number}}
 */
export function auditSemanticGuessSlots({ themeVarsContent, commonLessContent } = {}) {
  const GUESS_RE = /@([a-zA-Z0-9_-]+)\s*:\s*[^;]+;\s*\/\/[^\n]*语义推断/g
  const guessed = new Set()
  let gm
  const tv = String(themeVarsContent || '')
  while ((gm = GUESS_RE.exec(tv)) !== null) guessed.add(gm[1])
  if (guessed.size === 0) return { guessed: [], risky: [], riskCount: 0 }

  // common.less 里的**引用**（先剔掉本文件内的定义行 `@x: v;`，避免把定义算成引用）
  const common = String(commonLessContent || '').replace(/^\s*@[a-zA-Z0-9_-]+\s*:[^;]+;/gm, '')
  const risky = []
  let riskCount = 0
  for (const name of guessed) {
    const refRe = new RegExp(`(^|[^@\\w-])@${name}(?![\\w-])`, 'g')
    const n = (common.match(refRe) || []).length
    if (n > 0) {
      risky.push(name)
      riskCount += n
    }
  }
  return { guessed: [...guessed], risky, riskCount }
}

/** 树路径压缩：只保留末 2 段（全路径太长，且节点名常为 r/Frame 等无意义值） */
function shortenTreePath(path) {
  const segs = String(path || '').split('/').filter(Boolean)
  if (segs.length <= 2) return segs.join('/') || '(root)'
  return `…/${segs.slice(-2).join('/')}`
}

/**
 * 🌗 跨主题配色真值（2026-10-19，c-aiot-dpjh-bsjd-c27cb2eb 实锤）
 *
 * 病灶：多主题（N 稿）生成时，分块 prompt 只带**主稿** Figma 树，theme-vars.less
 *   的业务槽位（@color-card-bg / @color-node-name …）在副主题 mixin 里**没有真值
 *   可依** ⇒ LLM 按明暗语义猜通用灰阶（#2b2b2b / #e6e6e6）⇒ 深色设计稿版本观感
 *   ≈ 系统默认 dark，「列表背景与文字色没按设计」。
 *
 * 本函数把「同一树路径在各稿的实测色值」对齐成表，供 prompt 直接下发。
 * 纯函数、无 IO；单稿 / 无 nodeData ⇒ 返回 null（零回归）。
 *
 * @param {Object} opts
 * @param {Array<{key:string, nodeData:object}>} opts.themes dualTruth.themes（[0] 主稿）
 * @param {string} [opts.primaryKey] 主稿 key（缺省取 themes[0]）
 * @param {number} [opts.maxRows=40] 对齐行上限（按面积降序）
 * @param {number} [opts.paletteTop=14] 每稿色板取样上限
 * @returns {null|{primaryKey:string, themeKeys:string[], rows:Array, palettes:Object, truncated:boolean}}
 */
export function buildCrossThemeColorFacts({ themes, primaryKey, maxRows = 40, paletteTop = 14 } = {}) {
  const entries = Array.isArray(themes) ? themes.filter((t) => t?.nodeData) : []
  if (entries.length < 2) return null
  const primary = entries.find((t) => t.key === primaryKey) || entries[0]
  const secondaries = entries.filter((t) => t.key !== primary.key)
  if (secondaries.length === 0) return null

  const primaryTree = flattenTree(primary.nodeData)
  const secTrees = secondaries.map((t) => ({ key: t.key, tree: flattenTree(t.nodeData) }))

  // 1) 路径对齐的色值对（只留「至少一稿与主稿不同」的 —— 无差异色不随主题变，不该进表）
  const seen = new Set()
  const rows = []
  for (const [path, pInfo] of Object.entries(primaryTree)) {
    const mainHex = normalizeHex(pInfo.hex)
    const perTheme = {}
    let differs = false
    for (const st of secTrees) {
      const hit = st.tree[path]
      if (!hit) continue
      const h = normalizeHex(hit.hex)
      perTheme[st.key] = h
      if (h !== mainHex) differs = true
    }
    if (!differs || Object.keys(perTheme).length === 0) continue
    // 同一「色值组合」只留第一条（同色在多条路径重复 ⇒ 表里几十行噪声）
    const sig = `${mainHex}|${Object.entries(perTheme)
      .map(([k, v]) => `${k}:${v}`)
      .join(',')}`
    if (seen.has(sig)) continue
    seen.add(sig)
    rows.push({ path: shortenTreePath(path), primary: mainHex, perTheme, area: pInfo.area || 0 })
  }
  rows.sort((a, b) => b.area - a.area)
  const top = rows.slice(0, maxRows)

  // 2) 每稿实测主色板（按覆盖面积降序）—— 兜底：对齐表未覆盖时也能看出该稿真实调性
  const palettes = {}
  for (const t of entries) {
    const tree = t.key === primary.key ? primaryTree : (secTrees.find((s) => s.key === t.key) || {}).tree
    if (!tree) continue
    const freq = new Map()
    for (const v of Object.values(tree)) {
      const h = normalizeHex(v.hex)
      freq.set(h, (freq.get(h) || 0) + (v.area || 1))
    }
    palettes[t.key] = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, paletteTop)
      .map((e) => e[0])
  }

  return {
    primaryKey: primary.key,
    themeKeys: [primary.key, ...secondaries.map((t) => t.key)],
    rows: top,
    palettes,
    truncated: rows.length > maxRows,
  }
}

/**
 * 把 buildCrossThemeColorFacts 的结果渲染成 prompt 段落（无数据 ⇒ 空串，零注入）。
 * @param {null|Object} facts
 * @returns {string}
 */
export function formatCrossThemeColorFacts(facts) {
  if (!facts || !Array.isArray(facts.rows) || facts.rows.length === 0) return ''
  const themeKeys = Array.isArray(facts.themeKeys) ? facts.themeKeys : []
  const secKeys = themeKeys.filter((k) => k !== facts.primaryKey)
  const header = `| 主稿 \`${facts.primaryKey}\` | ${secKeys.map((k) => `\`${k}\``).join(' | ')} | 节点 |`
  const sep = `| --- | ${secKeys.map(() => '---').join(' | ')} | --- |`
  const body = facts.rows
    .map(
      (r) =>
        `| \`${r.primary}\` | ${secKeys.map((k) => (r.perTheme[k] ? `\`${r.perTheme[k]}\`` : '—')).join(' | ')} | ${r.path} |`,
    )
    .join('\n')
  const palettes = Object.entries(facts.palettes || {})
    .map(([k, hexes]) => `- \`${k}\`：${hexes.map((h) => `\`${h}\``).join('、')}`)
    .join('\n')
  return `\n## 🌗 跨主题配色真值（${themeKeys.length} 份设计稿实测对齐 · 最高优先级）

同一节点在各主题设计稿中的实测色值（主稿 = \`${facts.primaryKey}\`${facts.truncated ? `，已按面积取 Top ${facts.rows.length} 条` : ''}）：

${header}
${sep}
${body}

各稿实测主色板（按覆盖面积降序）：

${palettes}

⚠️ **硬约束（违反即「深色设计稿版本看着和默认 dark 一样」）**：
1. 业务槽位（\`@color-card-bg\` / \`@color-node-name\` / \`@color-stat-*\` 等）在每个 \`.theme-*()\` mixin 中的值，**必须取自上表该主题列的实测色**。
2. **严禁**用「语义推断」或通用深浅灰阶顶替 —— \`#2b2b2b\`/\`#e6e6e6\`/\`#333333\` 这类**中性灰是典型错误**：真实深色稿多为带品牌色相的深蓝/深青（如 \`#123259\` 配 \`#98c2f6\`）。
3. 上表未覆盖的颜色才允许按主题明暗自行补齐；补齐时也必须贴合该稿主色板的色相与明度。
4. common.less 中凡引用这些槽位的类，**不要**再写 hex 字面量兜底（字面量会把颜色锁死成主稿色）。
`
}

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
    // 🛡️ 2026-10-19（c-aiot-dpjh-bsjd-c27cb2eb 实锤）：同一主稿色在多条树路径上重复出现
    //   时，旧实现**每条路径都新建**一个 color-custom-N（#10ba27→#26ce3c 一档色值对
    //   被重复建成 custom-3/5/7/10/12 五个同值孤儿槽位）。同一色值对应同一槽位：
    //   已建过 ⇒ 直接复用（幂等去重），slotValues 已在首轮写全各稿值。
    if (replacements.has(mainHex)) {
      const reused = replacements.get(mainHex)
      if (typeof reused === 'string' && reused.startsWith('color-custom-')) statCustom++
      else statCanonical++
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
