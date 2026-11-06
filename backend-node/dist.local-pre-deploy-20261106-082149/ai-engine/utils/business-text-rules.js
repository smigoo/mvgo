/**
 * 🛡️ 业务术语规则引擎（2026-10-19 建立）
 *
 * ── 需求 ──────────────────────────────────────────────────────────────────
 * 用户点单：「不要货车卡车，只要小汽车」——且要求**管线侧根治**（拒绝产物直改），
 * 并明确「**按组件/项目可配，默认关闭**」。
 *
 * 关键事实（全量语料实测）：Figma 真值里**根本没有「小汽车」**（0/123 份组件），
 *   只有「客车」19 份、「货车」19 份、「卡车」0 份 ⇒ 想得到「小汽车」只能靠
 *   **别名映射**（客车→小汽车）+ **白名单过滤**（删货车/卡车），不能靠"照抄真值"。
 *
 * ── 设计（零硬编码）────────────────────────────────────────────────────────
 * 本模块**不含任何业务词**（没有"客车/货车/小汽车"常量）。规则全部来自配置：
 *
 * ```json
 * {
 *   "rewrite": { "客车": "小汽车" },
 *   "drop":    ["货车", "卡车"]
 * }
 * ```
 *
 * 语义顺序：**先 rewrite（改名）→ 再 drop（过滤）**。这样「客车→小汽车」之后
 *   小汽车不会被 drop 误删，而「货车」无映射则直接被过滤。
 *
 * ── ⚠️ 三个必须知道的架构冲突（接线时需同步处理，缺一不可）──────────────────
 * ① **TEXT-TRUTH 门禁冲突**：产物写「小汽车」而 Figma 真值是「客车」⇒ 现有 TEXT-TRUTH
 *    判据会判「臆造」并 BLOCK。规则**必须同时**作用于文本真值白名单，否则自相矛盾。
 * ② **与 T1 的边界**：T1（文本优先配额）保证事实层 TEXT 全保留；本规则是**业务层**过滤，
 *    必须发生在**下发/产物层**，绝不能改事实层（`buildSectionStyleFacts` 之前）⇒ 否则推翻 T1。
 * ③ **透传坑**：新入参要穿过 phase2 service → graph → 节点 → initialState → engineer 多层，
 *    任一层未显式解构/未进 initialState 都会**静默丢失**（既有实锤教训）。
 *
 * 纯函数、fail-open（规则缺失/非法 ⇒ 原样返回，绝不猜）。
 */

/**
 * 规范化配置 → 规则对象；非法/空 ⇒ null（fail-open）。
 *
 * @param {Object|null} raw `{ rewrite?: Record<string,string>, drop?: string[] }`
 * @returns {{rewrite: Map<string,string>, drop: Set<string>}|null}
 */
export function parseBusinessTextRules(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const rewrite = new Map()
  const drop = new Set()
  const rw = raw.rewrite
  if (rw && typeof rw === 'object' && !Array.isArray(rw)) {
    for (const [from, to] of Object.entries(rw)) {
      const f = String(from ?? '').trim()
      const t = String(to ?? '').trim()
      if (f && t && f !== t) rewrite.set(f, t)
    }
  }
  if (Array.isArray(raw.drop)) {
    for (const d of raw.drop) {
      const s = String(d ?? '').trim()
      if (s) drop.add(s)
    }
  }
  if (rewrite.size === 0 && drop.size === 0) return null
  return { rewrite, drop }
}

/**
 * 是否**已解析**的规则对象（Map/Set 形态）。
 * ⚠️ 不能用 `'rewrite' in rules` 判定——原始配置 `{rewrite:{...},drop:[...]}` 同样有这些键，
 *   会被误认成解析态 ⇒ 迭代普通对象报错（实测踩到）。
 */
export function isParsedRules(rules) {
  return !!(
    rules &&
    typeof rules === 'object' &&
    rules.rewrite instanceof Map &&
    rules.drop instanceof Set
  )
}

/**
 * 对单条文本应用规则。
 *
 * @param {string} text
 * @param {{rewrite:Map<string,string>, drop:Set<string>}|null} rules
 * @returns {{text:string, dropped:boolean, rewrittenFrom:string|null, changed:boolean}}
 */
export function applyBusinessTextRule(text, rules) {
  const src = String(text ?? '')
  if (!rules) return { text: src, dropped: false, rewrittenFrom: null, changed: false }
  // ① 改名（精确匹配原文；改写后的值不再二次改写，避免链式漂移）
  if (rules.rewrite.has(src)) {
    const to = rules.rewrite.get(src)
    // 改名后的值若命中 drop，仍要被过滤（配置自洽性由调用方保证，此处如实执行）
    if (rules.drop.has(to)) {
      return { text: '', dropped: true, rewrittenFrom: src, changed: true }
    }
    return { text: to, dropped: false, rewrittenFrom: src, changed: true }
  }
  // ② 过滤
  if (rules.drop.has(src)) {
    return { text: '', dropped: true, rewrittenFrom: null, changed: true }
  }
  return { text: src, dropped: false, rewrittenFrom: null, changed: false }
}

/**
 * 批量应用（保持顺序；被过滤的项不出现在结果里）。
 *
 * @param {string[]} texts
 * @param {*} rules `parseBusinessTextRules` 的结果（或原始配置，内部自动规范化）
 * @returns {{texts:string[], dropped:string[], rewritten:Array<{from:string,to:string}>}}
 */
export function applyBusinessTextRules(texts, rules) {
  const parsed = isParsedRules(rules) ? rules : parseBusinessTextRules(rules)
  const list = Array.isArray(texts) ? texts : []
  if (!parsed) {
    return { texts: list.slice(), dropped: [], rewritten: [] }
  }
  const out = []
  const dropped = []
  const rewritten = []
  for (const t of list) {
    const r = applyBusinessTextRule(t, parsed)
    if (r.dropped) {
      dropped.push(String(t))
      continue
    }
    if (r.rewrittenFrom) rewritten.push({ from: r.rewrittenFrom, to: r.text })
    out.push(r.text)
  }
  return { texts: out, dropped, rewritten }
}

/**
 * 🛡️ 产物/下发层禁用词扫描（门禁用）。
 *
 * ⚠️ 判据要点：**必须先 rewrite 再判 drop** —— 否则「客车」被改成「小汽车」后，
 *   若配置里同时把「小汽车」列进 drop（配置自洽性问题）会误报；更重要的是反过来的
 *   场景：产物里合法的「小汽车」若被当成 drop 词命中就会假红。这里只按**原始禁用词**
 *   判命中，且跳过「该词正是某条 rewrite 的目标值」的情况（那说明它是业务口径词）。
 *
 * @param {string[]} artifactTexts 产物里出现的文本集合
 * @param {*} rules
 * @returns {string[]} 命中的禁用词（去重，保持配置顺序）
 */
export function findForbiddenTexts(artifactTexts, rules) {
  const parsed = isParsedRules(rules) ? rules : parseBusinessTextRules(rules)
  if (!parsed || parsed.drop.size === 0) return []
  const targets = new Set()
  for (const [, to] of parsed.rewrite) targets.add(to)
  const hit = []
  for (const raw of artifactTexts || []) {
    const t = String(raw ?? '')
    if (!t) continue
    for (const d of parsed.drop) {
      if (targets.has(d)) continue // 该词是 rewrite 的目标 ⇒ 属业务口径，不算禁用
      if (t.includes(d) && !hit.includes(d)) hit.push(d)
    }
  }
  return hit
}

/* ────────────────────────────────────────────────────────────────────────────
 * 下发层（prompt）：对「事实文本块」逐行应用规则 + 生成业务口径指令
 *
 * ⚠️ 为什么必须在**这一层**（而不是事实层）：`buildSectionStyleFacts` 的输出是
 *   「Figma 原始真值」，直接改它会污染所有下游判据（T1 文本优先配额、QUOTA 审计、
 *   TEXT-TRUTH 真值比对全都以它为基准）。规则只改**喂给 LLM 的那一副本**。
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 对单条**任意文本**（如事实表的一行、产物的一个文本节点）应用规则（子串级）。
 *
 * 与 `applyBusinessTextRule` 的区别：后者是**整串精确匹配**（用于文本清单数组）；
 * 这里是**子串级**，用于「一行里还带有尺寸/颜色等附加信息」的场景。
 *
 * @param {string} text
 * @param {*} rules
 * @returns {{text:string, dropped:boolean, changed:boolean, hits:string[]}}
 */
export function applyRulesToLine(text, rules) {
  const src = String(text ?? '')
  const parsed = isParsedRules(rules) ? rules : parseBusinessTextRules(rules)
  if (!parsed) return { text: src, dropped: false, changed: false, hits: [] }
  const hits = []
  // ① 改名（rewrite）：一次性替换所有出现的别名
  let out = src
  for (const [from, to] of parsed.rewrite) {
    if (out.includes(from)) {
      out = out.split(from).join(to)
      hits.push(`${from}→${to}`)
    }
  }
  // ② 过滤（drop）：改名**之后**再判 ⇒ 「客车→小汽车」不会被 drop 误删
  for (const d of parsed.drop) {
    if (out.includes(d)) return { text: '', dropped: true, changed: true, hits: [...hits, `-${d}`] }
  }
  return { text: out, dropped: false, changed: out !== src, hits }
}

/**
 * 对「样式/布局事实文本块」逐行应用规则。
 *
 * @param {string} block `buildSectionStyleFacts(...)` 的输出
 * @param {*} rules
 * @returns {{text:string, rewrittenLines:number, droppedLines:number, hits:string[]}}
 */
export function applyRulesToFactsBlock(block, rules) {
  const src = String(block ?? '')
  const parsed = isParsedRules(rules) ? rules : parseBusinessTextRules(rules)
  if (!parsed || !src) return { text: src, rewrittenLines: 0, droppedLines: 0, hits: [] }
  const out = []
  const hits = []
  let rewrittenLines = 0
  let droppedLines = 0
  for (const line of src.split('\n')) {
    const r = applyRulesToLine(line, parsed)
    if (r.dropped) {
      droppedLines += 1
      hits.push(...r.hits)
      continue
    }
    if (r.changed) {
      rewrittenLines += 1
      hits.push(...r.hits)
    }
    out.push(r.text)
  }
  return { text: out.join('\n'), rewrittenLines, droppedLines, hits }
}

/**
 * 生成喂给 LLM 的「业务术语口径」指令段（无规则 ⇒ 空串，零回归）。
 *
 * 为什么必须显式告诉 LLM：只把真值表里的「客车」改成「小汽车」，LLM 仍可能在
 *   图例/标题/图表 series 名里自行拼出「客车」或保留「货车」（它看得见 Figma 图层名
 *   与其它真值段）⇒ 必须给一条**显式、带正反例**的口径，并声明它是硬性约束。
 *
 * @param {*} rules
 * @returns {string}
 */
export function buildBusinessTextDirective(rules) {
  const parsed = isParsedRules(rules) ? rules : parseBusinessTextRules(rules)
  if (!parsed) return ''
  const rw = [...parsed.rewrite.entries()].map(([f, t]) => `- 「${f}」必须写作「${t}」`).join('\n')
  const dp = [...parsed.drop].map((d) => `- 「${d}」`).join('、')
  return `
## 🏷️ 业务术语口径（最高优先级 · 硬性约束）

本项目有**业务口径要求**，它**高于一切设计稿原文/图层名**。即使下文的真值表、图层名、
视觉分析里出现了左侧的词，也必须按下述规则输出；违反即判生成失败。

${rw ? `**术语改写（必须改名，不得保留原文）：**\n${rw}\n` : ''}${dp ? `**禁用术语（不得出现在任何产物文本中：模板文案、图表 series/legend 名、标题、tooltip、aria 标签一律禁止）：**\n${dp}\n` : ''}
⚠️ 执行要点：
- 改写得**彻底**：同一词在「模板文本」「图表 series[].name」「legend.data」「title.text」
  tooltip 里都要用改写后的值，禁止一处改一处漏。
- 禁用词是**移除**而不是改名：相关的数据项/图例项/卡片**整体不渲染**（不要留空标签，
  也不要用「其他」之类的替代词占位）。
- 业务口径**不改变数量以外的任何事实**：颜色、尺寸、顺序、布局仍严格按真值表执行。
`
}

/**
 * 供文本真值校验使用：给定产物文本，判断它在「规则生效后」是否算合法。
 *
 * 冲突 ① 的解：产物写 `小汽车` 时，真值里只有 `客车` ⇒ 反向查 rewrite 得到原词，
 *   只要原词在真值集合里即合法。
 *
 * @param {string} artifactText 产物里的文本
 * @param {Set<string>|string[]} truthTexts Figma 真值文本集合
 * @param {*} rules
 * @returns {boolean} true = 合法（命中真值，或命中某条 rewrite 的原词）
 */
export function isTextAllowedByRules(artifactText, truthTexts, rules) {
  const parsed = isParsedRules(rules) ? rules : parseBusinessTextRules(rules)
  const txt = String(artifactText ?? '')
  const truth = truthTexts instanceof Set ? truthTexts : new Set((truthTexts || []).map(String))
  if (truth.has(txt)) return true
  if (!parsed || parsed.rewrite.size === 0) return false
  for (const [from, to] of parsed.rewrite) {
    if (to === txt && truth.has(from)) return true
  }
  return false
}
