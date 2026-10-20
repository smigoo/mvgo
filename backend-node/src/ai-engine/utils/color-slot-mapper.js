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

  // 🛡️ 2026-10-20：对齐改走 alignTrees（与 buildColorSlotMapping 同源三级降级）。
  //   旧「含根名绝对路径」查表在两稿不同名时 rows 恒空 ⇒ prompt 零真值（静默 fail-open 实锤）。
  const primaryList = flattenTreeList(primary.nodeData, { stripRoot: true })
  const alignedList = secondaries.map((t) => ({
    key: t.key,
    ...alignTrees(primaryList, flattenTreeList(t.nodeData, { stripRoot: true })),
  }))
  const alignment = alignedList.map((a) => ({ theme: a.key, mode: a.mode, matched: a.matched, total: a.total }))

  // 1) 对齐色值对（只留「至少一稿与主稿不同」的 —— 无差异色不随主题变，不该进表）
  const seen = new Set()
  const rows = []
  for (const pInfo of primaryList) {
    const mainHex = normalizeHex(pInfo.hex)
    const perTheme = {}
    let differs = false
    for (const al of alignedList) {
      const hit = al.pairs.get(pInfo)
      if (!hit) continue
      const h = normalizeHex(hit.secondary.hex)
      perTheme[al.key] = h
      if (h !== mainHex) differs = true
    }
    if (!differs || Object.keys(perTheme).length === 0) continue
    // 同一「色值组合」只留第一条（同色在多条路径重复 ⇒ 表里几十行噪声）
    const sig = `${mainHex}|${Object.entries(perTheme)
      .map(([k, v]) => `${k}:${v}`)
      .join(',')}`
    if (seen.has(sig)) continue
    seen.add(sig)
    rows.push({ path: shortenTreePath(pInfo.path), primary: mainHex, perTheme, area: pInfo.area || 0 })
  }
  rows.sort((a, b) => b.area - a.area)
  const top = rows.slice(0, maxRows)

  // 2) 每稿实测主色板（按覆盖面积降序）—— 兜底：对齐表未覆盖时也能看出该稿真实调性
  const palettes = {}
  for (const t of entries) {
    const list = flattenTreeList(t.nodeData, { stripRoot: true })
    const freq = new Map()
    for (const v of list) {
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
    alignment, // 🆕 2026-10-20：对齐模式/命中率（rows 空但 mode!=='none' 时色板仍应下发）
  }
}

/**
 * 把 buildCrossThemeColorFacts 的结果渲染成 prompt 段落。
 * 2026-10-20 修正：rows 为空时**仍下发各稿实测色板**（此前整个函数返回空串，
 *   色板被连带丢掉 ⇒ 对齐失败的稿连「真实调性」都进不了 prompt，等于零兜底）。
 * 仅当 facts 为 null（单稿/无数据）或连色板都空时才返回空串。
 * @param {null|Object} facts
 * @returns {string}
 */
export function formatCrossThemeColorFacts(facts) {
  if (!facts) return ''
  const hasRows = Array.isArray(facts.rows) && facts.rows.length > 0
  const palettes = Object.entries(facts.palettes || {})
    .filter(([, hexes]) => Array.isArray(hexes) && hexes.length > 0)
    .map(([k, hexes]) => `- \`${k}\`：${hexes.map((h) => `\`${h}\``).join('、')}`)
    .join('\n')
  if (!hasRows && !palettes) return ''
  const themeKeys = Array.isArray(facts.themeKeys) ? facts.themeKeys : []
  const secKeys = themeKeys.filter((k) => k !== facts.primaryKey)
  const table = hasRows
    ? (() => {
        const header = `| 主稿 \`${facts.primaryKey}\` | ${secKeys.map((k) => `\`${k}\``).join(' | ')} | 节点 |`
        const sep = `| --- | ${secKeys.map(() => '---').join(' | ')} | --- |`
        const body = facts.rows
          .map(
            (r) =>
              `| \`${r.primary}\` | ${secKeys.map((k) => (r.perTheme[k] ? `\`${r.perTheme[k]}\`` : '—')).join(' | ')} | ${r.path} |`,
          )
          .join('\n')
        return `同一节点在各主题设计稿中的实测色值（主稿 = \`${facts.primaryKey}\`${facts.truncated ? `，已按面积取 Top ${facts.rows.length} 条` : ''}）：

${header}
${sep}
${body}

`
      })()
    : `（跨稿逐节点对齐未命中——两稿图层名/结构不同源；以下色板为各稿**实测主色板**，是最低限度真值，严禁无视。）

`
  return `\n## 🌗 跨主题配色真值（${themeKeys.length} 份设计稿实测对齐 · 最高优先级）

${table}各稿实测主色板（按覆盖面积降序）：

${palettes}

⚠️ **硬约束（违反即「深色设计稿版本看着和默认 dark 一样」）**：
1. 业务槽位（\`@color-card-bg\` / \`@color-node-name\` / \`@color-stat-*\` 等）在每个 \`.theme-*()\` mixin 中的值，**必须取自上表该主题列的实测色**。
2. **严禁**用「语义推断」或通用深浅灰阶顶替 —— \`#2b2b2b\`/\`#e6e6e6\`/\`#333333\` 这类**中性灰是典型错误**：真实深色稿多为带品牌色相的深蓝/深青（如 \`#123259\` 配 \`#98c2f6\`）。
3. 上表未覆盖的颜色才允许按主题明暗自行补齐；补齐时也必须贴合该稿主色板的色相与明度。
4. common.less 中凡引用这些槽位的类，**不要**再写 hex 字面量兜底（字面量会把颜色锁死成主稿色）。
`
}

/** 单稿树展平为**先序列表**（遍历序 = DFS 先序，稳定可作位置对齐依据）。
 * @param {object} nodeData Figma document 节点本体
 * @param {{stripRoot?: boolean}} [opts] stripRoot=true 时根节点名不进路径（跨稿对齐用：
 *   两稿 frame 不同名是常态 —— 绝对路径含根名 ⇒ 同源复制稿也 100% 错位，实测
 *   dpjh-bsjd 双稿 unmatched:35/35、108/108 全灭，2026-10-20 实锤）
 * @returns {Array<{path:string, hex:string, area:number}>}
 */
function flattenTreeList(nodeData, { stripRoot = false } = {}) {
  const out = []
  const walk = (node, path, depth) => {
    if (!node || typeof node !== 'object') return
    const name = String(node.name || '')
    const key = stripRoot && depth === 0 ? '' : path ? `${path}/${name}` : name
    const fills = Array.isArray(node.fills) ? node.fills : []
    for (const f of fills) {
      if (f?.type !== 'SOLID' || f.visible === false) continue
      const c = f.color || {}
      const rgb = [c.r, c.g, c.b].map((x) => Math.round((x || 0) * 255))
      const hex = `#${rgb.map((x) => x.toString(16).padStart(2, '0')).join('')}`
      const alpha = f.opacity === undefined ? 1 : f.opacity
      if (alpha <= 0.5) break // 高透明填充不参与
      const bb = node.absoluteBoundingBox || {}
      out.push({ path: key, hex, area: (bb.width || 0) * (bb.height || 0) })
      break
    }
    for (const ch of node.children || []) walk(ch, key, depth + 1)
  }
  walk(nodeData, '', 0)
  return out
}

/**
 * 跨稿对齐器（三级降级，2026-10-20 治本）。
 *   L1 'path'  ：剥根段相对路径精确匹配（同源复制稿、根名不同 ⇒ 走这里）
 *   L2 'order' ：先序位置对齐（第 i 个有色节点 ↔ 第 i 个；重画稿/层名全不同 ⇒ 兜底）
 *   L3 'none'  ：副稿无有色节点 ⇒ 零对
 * @param {Array} primaryList flattenTreeList 主稿先序列表
 * @param {Array} secondaryList 副稿先序列表
 * @returns {{ pairs: Map<object, {primary:object, secondary:object}>, mode: 'path'|'order'|'none', matched: number, total: number }}
 */
function alignTrees(primaryList, secondaryList) {
  const total = primaryList.length
  if (!total || !secondaryList?.length) {
    return { pairs: new Map(), mode: 'none', matched: 0, total }
  }
  // L1：剥根段路径匹配
  const byPath = new Map(secondaryList.map((e) => [e.path, e]))
  const pairs = new Map()
  for (const p of primaryList) {
    const hit = byPath.get(p.path)
    if (hit) pairs.set(p, { primary: p, secondary: hit })
  }
  if (pairs.size > 0) return { pairs, mode: 'path', matched: pairs.size, total }
  // L2：先序位置兜底（两稿结构同构时有效；不同构则色值对错位 —— 仍优于零真值，
  //   且 mode 记入 stats/日志可观测，误判风险显性化）
  const n = Math.min(primaryList.length, secondaryList.length)
  for (let i = 0; i < n; i++) {
    pairs.set(primaryList[i], { primary: primaryList[i], secondary: secondaryList[i] })
  }
  return { pairs, mode: 'order', matched: n, total }
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
  const EMPTY = { replacements: new Map(), customSlots: {}, perThemeByPrimaryHex: {}, stats: { pairs: 0, canonical: 0, custom: 0, unmatched: 0 } }
  const entries = Array.isArray(themeEntries) ? themeEntries.filter((t) => t?.nodeData) : []
  if (entries.length < 2) return EMPTY
  const primary = entries.find((t) => t.key === primaryKey) || entries[0]
  const secondaries = entries.filter((t) => t.key !== primary.key)
  const primarySlots = {}
  for (const [k, v] of Object.entries(themeSlots?.[primary.key] || {})) {
    primarySlots[normalizeHex(v)] = k // hex 小写 → 槽位 kebab 名
  }

  // 🛡️ 2026-10-20 治本：对齐改走 alignTrees 三级降级（剥根段路径 → 先序位置）。
  //   旧实现用「含根名的绝对路径」查表，两稿 frame 不同名即 100% unmatched（真机实锤）。
  const primaryList = flattenTreeList(primary.nodeData, { stripRoot: true })
  const alignedList = secondaries.map((t) => ({
    key: t.key,
    ...alignTrees(primaryList, flattenTreeList(t.nodeData, { stripRoot: true })),
  }))
  // 可观测：对齐模式与命中率进 stats（logger 消费；全败 ≠ 静默）
  const alignment = alignedList.map((a) => ({ theme: a.key, mode: a.mode, matched: a.matched, total: a.total }))

  const replacements = new Map()
  const customSlots = {}
  // 🆕 2026-10-20（#128 ③）：主稿 hex → 各稿实测色 全量表（canonical/custom 通道共用）。
  //   供 realignThemeVarsSlotValues 做「自造槽位二次矫正」：LLM 自造槽位名不在
  //   replacements 里，但其在主稿 mixin 中的值可作为锚反查本表 ⇒ 矫正副稿 mixin 值。
  const perThemeByPrimaryHex = {}
  let customSeq = 0
  let statCanonical = 0
  let statCustom = 0
  let statUnmatched = 0

  for (const pInfo of primaryList) {
    const mainHex = normalizeHex(pInfo.hex)
    // 每个副稿在同位置的对齐色值（取第一个命中）
    const perSecondary = []
    for (const al of alignedList) {
      const hit = al.pairs.get(pInfo)
      if (hit) perSecondary.push({ themeKey: al.key, hex: normalizeHex(hit.secondary.hex) })
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
    // 先到先得（同 mainHex 多路径只留首条，与 replacements 复用语义一致）
    if (!perThemeByPrimaryHex[mainHex]) {
      const entry = { [primary.key]: mainHex }
      for (const p of perSecondary) if (!(p.themeKey in entry)) entry[p.themeKey] = p.hex
      perThemeByPrimaryHex[mainHex] = entry
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
    perThemeByPrimaryHex, // 🆕 主稿 hex(小写) → { [themeKey]: hex }（含主稿自身）
    stats: {
      pairs: primaryList.length,
      canonical: statCanonical,
      custom: statCustom,
      unmatched: statUnmatched,
      alignment, // 🆕 2026-10-20：逐副稿对齐模式/命中率（全败 ⇒ 调用方应升 WARN）
    },
  }
}

/**
 * 🆕 2026-10-20（#128 ③，84af4f8f 实锤）：theme-vars.less「自造槽位」二次对齐矫正。
 *
 * 病灶：LLM 在 common.less 中引用真值表之外的自造槽位名（如 @color-mask-bg-outer），
 *   theme-vars.less 里这些槽位的值是 LLM 臆造或 addMissingVariables 语义推断猜的
 *   （典型中性灰 #2b2b2b/#e6e6e6）⇒ applyColorSlotMapping 只替换 hex 字面量，
 *   对「变量引用」零作用（replacedCount:0），副稿配色全毁。
 *
 * 矫正逻辑（窄条件，锚定式，幂等）：
 *   以**主稿 mixin**（.theme-<primaryKey>()）中某 @color-* 槽位的 6 位 hex 值为锚，
 *   精确命中 perThemeByPrimaryHex（= 跨稿对齐真值）⇒ 把其余主题 mixin 中**同名槽位**
 *   的值改写为该主题列的实测色。以下情形一律不动：
 *   - 主稿值非 6 位 hex（rgba()/var()/3 位 hex 不锚）
 *   - 主稿值未命中真值表（无锚 ⇒ 不猜）
 *   - 目标主题在真值表中无该色（对齐未覆盖 ⇒ 不动）
 *   - 目标 mixin 未定义该槽位（不新增，边界归 addMissingVariables）
 *   - 现状值非 hex 字面量（可能是刻意写法，不碰）
 *   - 现状值已等于真值（幂等）
 *   被矫正行若带「自动添加（语义推断）」注释，改写为矫正标注（审计不再误报）。
 *
 * @param {Object} opts
 * @param {string} opts.themeVarsContent       theme-vars.less 全文
 * @param {Object} opts.perThemeByPrimaryHex   buildColorSlotMapping 返回的同名字段
 * @param {string} opts.primaryKey             主稿 theme key（如 'light'）
 * @returns {{content: string, corrections: Array<{slot:string, theme:string, from:string, to:string}>}}
 */
export function realignThemeVarsSlotValues({ themeVarsContent, perThemeByPrimaryHex, primaryKey }) {
  const result = { content: themeVarsContent, corrections: [] }
  if (!themeVarsContent || !perThemeByPrimaryHex || !primaryKey) return result
  const table = {}
  for (const [hex, perTheme] of Object.entries(perThemeByPrimaryHex)) {
    table[normalizeHex(hex)] = perTheme
  }
  if (Object.keys(table).length === 0) return result

  // 逐 mixin 解析（与 graph 层 themeSlotsFromArtifact 同款正则，保持解析口径一致）
  const mixinRe = /\.([a-zA-Z0-9_-]+)\s*\(\s*\)\s*\{([^}]*)\}/g
  const mixins = []
  let m
  while ((m = mixinRe.exec(themeVarsContent)) !== null) {
    const name = m[1]
    if (!name.startsWith('theme-')) continue
    const vars = new Map()
    const vr = /@([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g
    let vm
    while ((vm = vr.exec(m[2])) !== null) vars.set(vm[1], vm[2].trim())
    mixins.push({ key: name.slice('theme-'.length), vars })
  }
  const primaryMixin = mixins.find((x) => x.key === primaryKey)
  if (!primaryMixin) return result

  // 矫正计划：themeKey → Map<slot, {from, to}>
  const plan = new Map()
  for (const [slot, v0raw] of primaryMixin.vars) {
    if (!slot.startsWith('color-')) continue // 只矫正颜色槽位（尺寸/字重不碰）
    const v0 = normalizeHex(v0raw)
    if (!/^#[0-9a-f]{6}$/.test(v0)) continue // 仅 6 位 hex 锚
    const perTheme = table[v0]
    if (!perTheme) continue
    for (const mx of mixins) {
      if (mx.key === primaryKey) continue
      const target = perTheme[mx.key]
      if (!target) continue
      const cur = mx.vars.get(slot)
      if (cur === undefined) continue
      if (!/^#[0-9a-f]{6}$/i.test(cur)) continue // 现状非 6 位 hex 字面量不碰
      if (normalizeHex(cur) === normalizeHex(target)) continue // 已是真值（幂等）
      if (!plan.has(mx.key)) plan.set(mx.key, new Map())
      plan.get(mx.key).set(slot, { from: cur, to: target })
    }
  }
  if (plan.size === 0) return result

  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const content = themeVarsContent.replace(
    /(\.([a-zA-Z0-9_-]+)\s*\(\s*\)\s*\{)([^}]*)(\})/g,
    (all, head, name, body, tail) => {
      if (!name.startsWith('theme-')) return all
      const slotPlan = plan.get(name.slice('theme-'.length))
      if (!slotPlan) return all
      let newBody = body
      for (const [slot, { from, to }] of slotPlan) {
        // 行级替换：值 + 同行尾注释（「语义推断」标注改写为矫正标注，防审计误报）
        const re = new RegExp(`(@${slot}\\s*:\\s*)${escRe(from)}(\\s*;)([^\\n]*)`, 'gi')
        newBody = newBody.replace(re, (a, p1, p2, trail) => {
          const note = /语义推断/.test(trail)
            ? ' // 自愈：跨稿真值矫正（原语义推断值被覆盖）'
            : trail
          return `${p1}${to}${p2}${note}`
        })
      }
      return `${head}${newBody}${tail}`
    },
  )
  for (const [themeKey, slotPlan] of plan) {
    for (const [slot, { from, to }] of slotPlan) {
      result.corrections.push({ slot, theme: themeKey, from, to })
    }
  }
  result.content = content
  return result
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
