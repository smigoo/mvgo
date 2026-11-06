/**
 * 🛡️ R24（2026-10-21 · mc-1792560692909-07ae49a2 实锤）：**空 `<img>` 补齐资源 src**。
 *
 * ── 病灶 ────────────────────────────────────────────────────────────────────
 * 产物里出现 4 个**完全没有 src** 的 img：
 *   `ContentSection.vue`（data-section-id=38:3260）、`ContentSection5.vue`（38:3282）、
 *   `ContentIcon2.vue`、`HeaderText2.vue`。
 * 而资源真值明明在：`resources/images/icon-262.png / icon-263.png / icon-战略厂商-3160.png / …`，
 * `resource-dom-mapping.json` 里每条都带 `assignedVarName` + `ownerSectionId`。
 *
 * 为什么 `injectResourceImports` 救不了：它的口径是「**代码里真实出现的资源变量**才注入」
 *   （见 resource-import-guard 注释：forceAll 已删，只剩这一种口径）。模型写 `<img>` 时
 *   一个变量都没引用 ⇒ 无可注入 ⇒ 静默留空。
 * 为什么门禁也没拦住：`validateSubcomponentResourceDeps` 只查「用了资源变量却没声明」，
 *   对「有 img 但既无变量也无 src」是**零命中**（判据缺口，不是判据错）。
 *
 * ── 本模块的判据（可辩驳、fail-open）─────────────────────────────────────────
 *   ① 只认 `<template>` 区内的 `<img>`，且 `src` / `:src` / `v-bind:src` **全部缺失**；
 *   ② 组件所属 section：模板里出现的 `data-section-id` **不同值必须恰好 1 个**
 *      （多个 ⇒ 该文件是装配层，跳过，避免张冠李戴）；
 *   ③ 候选资源 = `resourceFile` 非空 且 `ownerSectionId === 该 section`
 *      （支持派生 id：`38:3162-tail-text` → `38:3162`，按「owner 前缀 + 分隔符」匹配）；
 *   ④ 候选**恰好 1 个**才注入；0 个（无资源）/ ≥2 个（歧义）一律不动并给 reason；
 *   ⑤ 注入用 mapping 的 `assignedVarName`（没有则 `semanticVarName`），路径用调用方给的
 *      `relBase` + 文件名（与 injectResourceImports 同一相对基准）。
 *
 * 幂等：第二次运行已无空 img ⇒ 原样返回。
 *
 * ── 刀 43（2026-10-22 · mc-1792635919906-88b9c3a5 实锤）：两个新缺口 ──────────────
 * 真机三个标题组件的图标**全部破图**，但成因各不相同：
 *   · `HeaderText.vue`  `<img class="…-icon" alt="战略合作厂商" />`（裸 img）
 *     —— 该文件模板里**有** `data-section-id="38:3137-tail-text"`，离线跑本模块能修成 `icon4`，
 *        但管线里被后续重生成覆盖 ⇒ 必须挂到 `pre-write-self-healing`（落盘前最后一道）。
 *   · `HeaderText2.vue` `<img class="…-icon" alt="优质厂商" />`（裸 img）
 *     —— 模板里**没有** `data-section-id`（同一份产物里另两个标题组件都有）⇒ 旧判据 ②
 *        直接 `no-section-id` 放弃。新增 `opts.ownerSectionId`：由调用方按**装配层父子关系**
 *        （组件标签最近的 section 祖先）推断后传入。
 *   · `HeaderText3.vue` `<img :src="icon普通厂商" …>` —— 有绑定，但 `<script setup>` 里
 *        **零 import**，模型自造了中文变量名 ⇒ 运行时 `is not defined`，同样破图。
 *        旧判据把 `hasSrc` 一律当「已完成」⇒ 零命中。新增 B 类口径：未声明变量且名字与
 *        候选的权威名（`assignedVarName` / `semanticVarName`）**归一后相同** ⇒ 替换为权威名
 *        并注入 import。名字对不上的一律不动（可能是别的变量，宁可漏不可错配）。
 */

/** 模板区（无 <template> 时返回 null —— 不判，避免 SFC 片段误伤） */
export function templateRange(code) {
  const m = /<template>([\s\S]*?)<\/template>/.exec(code)
  if (!m) return null
  const start = m.index + '<template>'.length
  return { start, end: start + m[1].length, body: m[1] }
}

/** 模板内所有 `<img …>` 标签（返回绝对偏移） */
export function findImgTags(code) {
  const range = templateRange(code)
  if (!range) return []
  const out = []
  const rx = /<img\b[^>]*>/gi
  let m
  while ((m = rx.exec(range.body)) !== null) {
    const absStart = range.start + m.index
    const tag = m[0]
    out.push({
      tag,
      start: absStart,
      end: absStart + tag.length,
      hasSrc: /\b(:src|v-bind:src|src)\s*=/i.test(tag),
      // 刀 43：`:src="X"` / `v-bind:src="X"` 里的**简单标识符**（复杂表达式如 `item.icon`
      //   或函数调用不在此列 —— 它们不是资源变量，判不了就不改）
      srcVar: simpleBindingName(tag),
    })
  }
  return out
}

/** 取 `:src` / `v-bind:src` 的简单标识符绑定名；非简单标识符 ⇒ '' */
export function simpleBindingName(tagText) {
  const m = /(?::src|v-bind:src)\s*=\s*["']([^"']*)["']/i.exec(String(tagText || ''))
  if (!m) return ''
  const v = m[1].trim()
  // 允许 Unicode 标识符（模型会自造中文变量名，如 icon普通厂商）
  return /^[A-Za-z_$\u4e00-\u9fa5][\w$\u4e00-\u9fa5]*$/.test(v) ? v : ''
}

/** 模板内的 data-section-id 取值集合 */
export function collectSectionIds(code) {
  const range = templateRange(code)
  if (!range) return []
  const ids = new Set()
  const rx = /data-section-id\s*=\s*["']([^"']+)["']/g
  let m
  while ((m = rx.exec(range.body)) !== null) ids.add(m[1].trim())
  return [...ids]
}

/**
 * section → 该 section 名下的资源候选。三条匹配口径（顺序即优先级）：
 *   ① `ownerSectionId === section`（最常见的归属关系）；
 *   ② `figmaNodeId === section`（组件本身就是那个资源节点，如 `187:263` 的 icon 组件）；
 *   ③ 派生 id：`section` 以 `owner + '-'` 开头（`38:3162-tail-text` → `38:3162`）。
 *
 * 🔴 唯一实现：R24（补 `:src`）与刀 45（补缺失的 `<img>` 元素）共用，
 *    不得各写一份（同判据 2 份 = 事故温床）。
 */
export function candidatesForSection(mappings, sectionId) {
  const sid = String(sectionId || '').trim()
  if (!sid) return []
  const pool = (Array.isArray(mappings) ? mappings : []).filter(
    (m) => m && m.resourceFile && (m.ownerSectionId || m.figmaNodeId),
  )
  let hit = pool.filter((m) => String(m.ownerSectionId) === sid)
  if (hit.length === 0) {
    hit = pool.filter((m) => String(m.figmaNodeId) === sid)
  }
  if (hit.length === 0) {
    hit = pool.filter((m) => sid.startsWith(String(m.ownerSectionId) + '-'))
  }
  return hit
}

/** 变量名：assignedVarName 优先，其次 semanticVarName（唯一实现，R24 与刀 45 共用） */
export function varNameOf(mapping) {
  const v = mapping?.assignedVarName || mapping?.semanticVarName
  return typeof v === 'string' && v.trim() ? v.trim() : ''
}

/** 该变量是否已在 script 里具名声明（import / const|let|var）；Unicode 标识符安全 */
export function isDeclared(code, varName) {
  const n = String(varName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (!n) return false
  const rx = new RegExp(`(?:import\\s+${n}(?:\\s|,)|(?:const|let|var)\\s+${n}\\s*=)`)
  return rx.test(code)
}

/**
 * 定位 `<const|let|var> NAME = <rhs>` 这条声明语句的边界（括号/引号/模板串安全）。
 * `rhsStart` 指向 `=` 之后（右侧起点），`end` 指向语句末尾（`;` **之前**，分号保留在原位）。
 * 判不出来返 null（调用方一律 fail-open）。
 */
export function findDeclStatement(code, varName) {
  const n = String(varName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (!n) return null
  const rx = new RegExp(`(?:const|let|var)\\s+${n}\\s*=`)
  const m = rx.exec(code)
  if (!m) return null
  let rhsStart = m.index + m[0].length
  // 跳过 `=` 后的行内空白，让 slice(0, rhsStart) 保留原始间距（`= 'x'` 而不是 `= 'x'`）
  while (rhsStart < code.length && (code[rhsStart] === ' ' || code[rhsStart] === '\t')) rhsStart += 1
  let depth = 0
  let quote = null
  for (let i = rhsStart; i < code.length; i += 1) {
    const ch = code[i]
    if (quote) {
      if (ch === '\\') {
        i += 1
        continue
      }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      continue
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      depth += 1
      continue
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth -= 1
      if (depth < 0) return null
      continue
    }
    if (depth === 0 && ch === ';') return { start: m.index, end: i, rhsStart }
    if (depth === 0 && ch === '\n') {
      const next = /^\s*([^\s])/.exec(code.slice(i + 1))
      const nx = next ? next[1] : ''
      // 续行符开头 ⇒ 语句未结束
      if (!nx || !'.,?+:)]}'.includes(nx)) return { start: m.index, end: i, rhsStart }
    }
  }
  return null
}

/**
 * 🛡️ 刀 46（2026-10-22 · mc-1792640936339-f6660c71 实锤）：**伪兜底声明**。
 *
 * `HeaderText2.vue` 写成
 * ```js
 * const iconzh1 = computed(() => (typeof window !== 'undefined' ? window.iconzh1 : null))
 * ```
 * 模板 `<img v-if="iconzh1" :src="iconzh1">`。看起来「已声明」（`isDeclared` 通过），
 * 但运行时**没有任何地方把资源挂到 `window`**（后端/前端均无该注入，已 grep 全仓确证）
 * ⇒ 值恒 `undefined` ⇒ `v-if` 假 ⇒ 图标永不渲染，且比裸 `<img>` 更隐蔽。
 *
 * @returns {{rhs:string, start:number, end:number, rhsStart:number}|null}
 */
export function findGlobalFallbackDecl(code, varName) {
  const stmt = findDeclStatement(code, varName)
  if (!stmt) return null
  const rhs = code.slice(stmt.rhsStart, stmt.end)
  const n = String(varName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rx = new RegExp(`\\b(?:window|globalThis|self)\\s*\\.\\s*${n}\\b`)
  if (!rx.test(rhs)) return null
  return { ...stmt, rhs }
}

/**
 * 变量名归一（去分隔符/大小写）——用于「模型自造名 vs 权威名」的等价判断 */
export function normVarName(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}

/**
 * 装配层推断（刀 43）：`组件名 → 最近祖先 section id`。
 * 为什么需要：标题类组件的模板常常**不带** `data-section-id`（真机 `HeaderText2.vue`
 * 就是），只靠单文件判据拿不到归属。组件标签在 index.vue 里出现的位置（嵌套在哪个
 * `data-section-id` 容器内）是可证的结构事实。
 *
 * @param {Record<string,string>} files 产物文件集
 * @returns {Map<string,string>} PascalCase 组件名 → section id（同一组件出现多处且归属不同 ⇒ 不收录）
 */
export function buildComponentOwnerMap(files) {
  const out = new Map()
  const ambiguous = new Set()
  for (const [p, c] of Object.entries(files || {})) {
    if (typeof c !== 'string' || !/\.vue$/.test(p)) continue
    const range = templateRange(c)
    if (!range) continue
    const stack = [] // { tag, sectionId }
    const rx = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g
    let m
    while ((m = rx.exec(range.body)) !== null) {
      const closing = m[1] === '/'
      const tag = m[2]
      const attrs = m[3] || ''
      const selfClose = m[4] === '/'
      if (closing) {
        for (let i = stack.length - 1; i >= 0; i -= 1) {
          if (stack[i].tag === tag) {
            stack.length = i
            break
          }
        }
        continue
      }
      const parentSectionId = stack.length ? stack[stack.length - 1].sectionId : ''
      if (/^[A-Z]/.test(tag)) {
        // 组件标签（PascalCase）：归属 = 最近祖先 section（不含自身）
        if (parentSectionId) {
          if (out.has(tag) && out.get(tag) !== parentSectionId) {
            ambiguous.add(tag)
          } else if (!ambiguous.has(tag)) {
            out.set(tag, parentSectionId)
          }
        }
      }
      if (!selfClose) {
        const sidM = /data-section-id\s*=\s*["']([^"']+)["']/.exec(attrs)
        stack.push({ tag, sectionId: sidM ? sidM[1].trim() : parentSectionId })
      }
    }
  }
  for (const t of ambiguous) out.delete(t)
  return out
}

/**
 * 文件路径 → 组件名（`package/components/header-text2.vue` 与 `HeaderText2.vue` 同归一）。
 * 真机产物是 PascalCase，但不假设 —— kebab / snake 一并归一，避免「名字对不上 ⇒ 静默拿不到归属」。
 */
export function componentNameOf(relPath) {
  const base = String(relPath || '')
    .split('/')
    .pop()
    .replace(/\.vue$/i, '')
  if (!base) return ''
  if (/^[A-Z]/.test(base)) return base
  return (
    base
      .split(/[-_.]+/)
      .filter(Boolean)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join('') || base
  )
}

/**
 * 由归属表取某文件的 `ownerSectionId`。
 * 🔴 唯一实现：`microcode-engineer`（生成内阶段）与 `pre-write-self-healing`（落盘前终验）
 *    两处调用点**不得**各自再写一遍「文件名 → 组件名」的换算（同判据 2 份 = 事故温床）。
 */
export function ownerSectionIdForFile(ownerMap, relPath) {
  if (!ownerMap || typeof ownerMap.get !== 'function' || !relPath) return ''
  const want = componentNameOf(relPath).toLowerCase()
  if (!want) return ''
  for (const [k, v] of ownerMap) {
    if (String(k).toLowerCase() === want) return v
  }
  return ''
}

/** 在 `<script setup>` 之后插入 import（无 script setup ⇒ 不插，视为无法注入） */
export function insertImport(code, varName, relPath) {
  const m = /<script\b[^>]*\bsetup\b[^>]*>/.exec(code)
  if (!m) return null
  const at = m.index + m[0].length
  const line = `\nimport ${varName} from '${relPath}'`
  return code.slice(0, at) + line + code.slice(at)
}

// ─────────────────── C 类：数据对象空图字段（v-for 列表） ───────────────────

const IDENT = '[A-Za-z_$\\u4e00-\\u9fa5][\\w$\\u4e00-\\u9fa5]*'

/** `:src="obj.field"` 的成员绑定（两级成员访问；更深的表达式一律不认） */
export function memberBindingOf(tagText) {
  const m = /(?::src|v-bind:src)\s*=\s*["']([^"']+)["']/i.exec(String(tagText || ''))
  if (!m) return null
  const v = m[1].trim()
  const mm = new RegExp(`^(${IDENT})\\.(${IDENT})$`).exec(v)
  return mm ? { obj: mm[1], field: mm[2] } : null
}

/** 字符串/模板串感知的括号配对：返回与 `code[openIdx]` 配对的闭合下标；失败 -1 */
function matchBracket(code, openIdx, open = '[', close = ']') {
  let depth = 0
  for (let i = openIdx; i < code.length; i += 1) {
    const ch = code[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      // 跳过整段字符串（含转义）
      const q = ch
      i += 1
      while (i < code.length) {
        if (code[i] === '\\') {
          i += 2
          continue
        }
        if (code[i] === q) break
        i += 1
      }
      continue
    }
    if (ch === open) depth += 1
    else if (ch === close) {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/** 定位 `const|let|var X = [ … ]` 的数组字面量区间（绝对偏移，`bodyStart` 指向 `[` 之后） */
export function findArrayLiteral(code, name) {
  const esc = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (!esc) return null
  const rx = new RegExp(`(?:const|let|var)\\s+${esc}\\s*=\\s*\\[`)
  const m = rx.exec(code)
  if (!m) return null
  const openIdx = m.index + m[0].length - 1
  const closeIdx = matchBracket(code, openIdx, '[', ']')
  if (closeIdx < 0) return null
  return { openIdx, closeIdx, bodyStart: openIdx + 1, bodyEnd: closeIdx }
}

/** 数组体内顶层 `{ … }` 元素区间（绝对偏移） */
export function splitTopLevelObjects(code, bodyStart, bodyEnd) {
  const out = []
  let i = bodyStart
  while (i < bodyEnd) {
    const ch = code[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      const q = ch
      i += 1
      while (i < bodyEnd) {
        if (code[i] === '\\') {
          i += 2
          continue
        }
        if (code[i] === q) break
        i += 1
      }
      i += 1
      continue
    }
    if (ch === '{') {
      const closeIdx = matchBracket(code, i, '{', '}')
      if (closeIdx < 0 || closeIdx > bodyEnd) return out
      out.push({ start: i, end: closeIdx + 1 })
      i = closeIdx + 1
      continue
    }
    i += 1
  }
  return out
}

/** 对象字面量里某字段的**空值**位置（`icon: ''` / `icon: ""` / `` icon: `` ``） */
export function emptyFieldSpan(code, objStart, objEnd, field) {
  const slice = code.slice(objStart, objEnd)
  const rx = new RegExp(`\\b${String(field).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*(['"\`])\\1`)
  const m = rx.exec(slice)
  if (!m) return null
  return { start: objStart + m.index, end: objStart + m.index + m[0].length }
}

/** 候选资源按视觉顺序（左→右、上→下）排序；缺 figmaBox 的保持原序垫后 */
function sortByVisualOrder(cands) {
  const withBox = []
  const without = []
  for (const c of cands) {
    const b = c?.figmaBox
    if (b && typeof b.x === 'number' && typeof b.y === 'number') withBox.push({ c, b })
    else without.push(c)
  }
  withBox.sort((p, q) => p.b.x - q.b.x || p.b.y - q.b.y)
  return [...withBox.map((x) => x.c), ...without]
}

/** `v-for="item in statList"` / `v-for="(item, i) in list"` → `item` → `statList` */
export function vforListNames(code) {
  const range = templateRange(code)
  const map = new Map()
  if (!range) return map
  const rx = /v-for\s*=\s*["']\s*\(?\s*([A-Za-z_$\u4e00-\u9fa5][\w$\u4e00-\u9fa5]*)[^"']*?\bin\s+([A-Za-z_$\u4e00-\u9fa5][\w$\u4e00-\u9fa5]*)/g
  let m
  while ((m = rx.exec(range.body)) !== null) {
    if (!map.has(m[1])) map.set(m[1], m[2])
  }
  return map
}

/**
 * 段自身的父链签名：`ancestorIds` 去掉首项（自身）后 join。
 * mapping 的 `ancestorIds` 形态是 `[ownerSectionId, 父, 祖父…]`；首项不等于
 * `ownerSectionId`、或长度 <2 时无法判断父子关系 ⇒ 返空串（不参与扩展）。
 */
export function ancestorSig(mapping) {
  const a = Array.isArray(mapping?.ancestorIds) ? mapping.ancestorIds.map(String) : []
  if (a.length < 2) return ''
  const self = String(mapping?.ownerSectionId ?? a[0])
  if (a[0] !== self) return ''
  return a.slice(1).join('/')
}

/** 同排：parentBox 的 y 与 height 都在 1px 容差内（缺任一侧即判否，宁可漏） */
export function sameVisualRow(a, b) {
  const pa = a?.parentBox
  const pb = b?.parentBox
  if (!pa || !pb) return false
  if (typeof pa.y !== 'number' || typeof pb.y !== 'number') return false
  if (Math.abs(pa.y - pb.y) > 1) return false
  if (
    typeof pa.height === 'number' &&
    typeof pb.height === 'number' &&
    Math.abs(pa.height - pb.height) > 1
  ) {
    return false
  }
  return true
}

/**
 * 候选补齐：仅当「本段候选数 < 空字段数」时，把**同父同排的兄弟段候选**并入。
 *
 * ── 为什么需要（真机 c-a3c56-9a3c56bb 实锤）───────────────────────────────
 * Figma 里是 N 个同构兄弟段，LLM 合成一个 `v-for` 后 DOM 只留首个段的
 * `data-section-id`：`187:262`∈`38:3260`、`187:263`∈`38:3282`，
 * 两段同父（`796:3`）同排（`parentBox.y=51483`）⇒ 只认本段永远只见 1 个候选。
 *
 * ── 判据（全部成立才采纳，否则原样返回 base）─────────────────────────────────
 *   ① 本段所有 mapping 的父链签名唯一且非空（父子关系不明确就不猜）；
 *   ② 兄弟候选与 `base[0]` **同排**（`parentBox.y`/`height` 一致，1px 容差）；
 *   ③ 并入后总数 **精确等于** `want`（不等即有歧义，宁可漏）；
 *   ④ 全部候选 `figmaBox.x` 齐备且互不重复（同 x 无法定序）。
 *
 * 注意：同父但不同排的段（真机 `38:3137` / `38:3162` / `38:3206` 各自一行）会被
 * 判据②挡掉，绝不被误并进同一行的 v-for。
 */
export function resolveSiblingCandidates(base, mappings, sectionId, want) {
  if (!Array.isArray(base) || base.length === 0) return base
  if (typeof want !== 'number' || base.length >= want) return base

  const pool = Array.isArray(mappings) ? mappings.filter((m) => m && m.resourceFile) : []
  const sigs = new Set(
    pool
      .filter((m) => String(m.ownerSectionId) === String(sectionId))
      .map(ancestorSig)
      .filter(Boolean),
  )
  if (sigs.size !== 1) return base
  const sig = [...sigs][0]

  const baseIds = new Set(base.map((m) => String(m.figmaNodeId)))
  const extra = []
  for (const m of pool) {
    const id = String(m.figmaNodeId)
    if (baseIds.has(id)) continue
    if (String(m.ownerSectionId) === String(sectionId)) continue
    if (ancestorSig(m) !== sig) continue
    if (!sameVisualRow(m, base[0])) continue
    if (extra.some((x) => String(x.figmaNodeId) === id)) continue
    extra.push(m)
  }
  if (extra.length === 0) return base

  const merged = sortByVisualOrder([...base, ...extra])
  if (merged.length !== want) return base
  const xs = merged.map((m) => m?.figmaBox?.x)
  if (xs.some((v) => typeof v !== 'number')) return base
  if (new Set(xs).size !== xs.length) return base
  return merged
}

/**
 * C 类：**v-for 数据对象里的空图字段**（`{ label:'合作厂商', icon:'' }`）。
 *
 * ── 为什么 A/B 类救不了（真机 mc-max-1793899537377-9a3c56bb 实锤）──────────────
 * `StatsSection.vue` 模板是 `<img :src="item.icon" />`：
 *   · A 类只在「完全没有 src」时触发 ⇒ `hasSrc=true`，跳过；
 *   · B 类只在「变量未声明且名字与权威名归一后相同」时触发 ⇒ `item.icon` 是成员访问，
 *     `simpleBindingName` 直接返回空 ⇒ 跳过；
 *   · `healEmptyImgSrc` 还有一道硬闸 `candidates.length !== 1` ⇒ 本 section
 *     （`38:3260`）下有 **2 个**资源（`187:262` / `187:263`）⇒ 判 `ambiguous-resource` 放弃。
 * 结果：mapping 里 `icon2` / `icon3` 已分配、文件已下载落盘，产物却 `icon: ''` ⇒ 两张统计卡破图。
 *
 * ── 判据（宁可漏，不可错配）────────────────────────────────────────────────
 *   ① 文件内 `data-section-id` 唯一（多值 ⇒ 装配层，跳过）；无则用 `opts.ownerSectionId`；
 *   ② 模板里存在 `:src="obj.field"`，且 script 里能找到 `const obj = [ … ]` 数组字面量；
 *   ③ 候选 = `candidatesForSection`，**数量必须 ≥2**（1 个交给 A/B 类，不抢活）；
 *   ④ **空字段数 === 候选数** 才 zip，否则一律不动（数量不等即有歧义）；
 *   ⑤ 顺序由 `figmaBox`（左→右、上→下）决定，不信任 mapping 数组顺序；
 *   ⑥ 每个候选必须有 `assignedVarName|semanticVarName`，且互不重复；
 *   ⑦ 只填**空串字段**，非空字段说明别的通道已处理，绝不复写。
 *
 * 幂等：第二次运行空字段已消失 ⇒ 原样返回。
 *
 * @param {string} code SFC 源码
 * @param {Array<object>} mappings resourceDomMapping
 * @param {string} relBase 资源相对基准
 * @param {{ownerSectionId?:string}} [opts] 无 data-section-id 时的归属兜底
 * @returns {{code:string, changed:boolean, healed:Array<object>, skipped:Array<object>}}
 */
export function healEmptyDataIconFields(code, mappings, relBase = '../resources/images/', opts = {}) {
  const result = { code, changed: false, healed: [], skipped: [] }
  if (typeof code !== 'string' || code.length === 0) return result

  const imgs = findImgTags(code)
  if (imgs.length === 0) return result

  // 模板里的成员绑定（obj.field）→ 按 obj 分组
  const binds = new Map()
  for (const t of imgs) {
    const b = memberBindingOf(t.tag)
    if (!b) continue
    if (!binds.has(b.obj)) binds.set(b.obj, b.field)
  }
  if (binds.size === 0) return result

  const sectionIds = collectSectionIds(code)
  let sectionId = ''
  if (sectionIds.length === 1) sectionId = sectionIds[0]
  else if (sectionIds.length === 0 && opts?.ownerSectionId) sectionId = String(opts.ownerSectionId)
  else {
    result.skipped.push({
      reason: sectionIds.length === 0 ? 'no-section-id' : 'ambiguous-section',
      sectionIds,
    })
    return result
  }

  const baseCandidates = sortByVisualOrder(candidatesForSection(mappings, sectionId))
  if (baseCandidates.length === 0) {
    result.skipped.push({ reason: 'no-resource', sectionIds: [sectionId], candidates: 0 })
    return result
  }

  let out = code
  let anyFilled = false
  /** 待注入的 import（顺序 = 视觉顺序）；统一在末尾一次性插入，避免逐条插到 script 开头导致倒序 */
  const pendingImports = []
  // 🔴 `:src="item.icon"` 里的 `item` 是 **v-for 别名**，数组名在 `v-for="item in statList"` 里。
  //    直接拿别名当数组名会 `no-array-literal`（真机复刻时踩过）。别名无对应 v-for 时
  //    才把 obj 本身当变量名（单对象形态 `const cfg = { icon: '' }` + `:src="cfg.icon"`）。
  const aliasToList = vforListNames(out)

  for (const [objName, field] of binds) {
    const listName = aliasToList.get(objName) ?? objName
    const arr = findArrayLiteral(out, listName)
    if (!arr) {
      result.skipped.push({ reason: 'no-array-literal', obj: objName, list: listName, sectionIds: [sectionId] })
      continue
    }
    const objs = splitTopLevelObjects(out, arr.bodyStart, arr.bodyEnd)
    const empties = []
    for (const o of objs) {
      const span = emptyFieldSpan(out, o.start, o.end, field)
      if (span) empties.push(span)
    }

    // ③′ 本段候选不够时按「同父兄弟段 + 同一 parentBox.y」扩展：
    //     LLM 常把 Figma 里 **N 个同构兄弟段** 合成一个 `v-for`，DOM 只保留首个段的
    //     `data-section-id`（真机 9a3c56bb：`187:262`∈`38:3260`、`187:263`∈`38:3282`，
    //     两段同父 `796:3`、同排 `parentBox.y=51483`）。只认本段会永远只看到 1 个候选。
    const candidates = resolveSiblingCandidates(baseCandidates, mappings, sectionId, empties.length)
    if (candidates.length < 2) {
      // 0 个：无资源；1 个：交给 healEmptyImgSrc 的 A/B 类，避免两处抢同一处改动
      result.skipped.push({
        reason: candidates.length === 0 ? 'no-resource' : 'single-resource-defer-ab',
        obj: objName,
        sectionIds: [sectionId],
        candidates: candidates.length,
      })
      continue
    }
    const varNames = candidates.map((m) => varNameOf(m))
    if (varNames.some((v) => !v) || new Set(varNames).size !== varNames.length) {
      result.skipped.push({
        reason: 'var-name-missing-or-duplicate',
        obj: objName,
        sectionIds: [sectionId],
        varNames,
      })
      continue
    }

    // ④ 数量精确相等才 zip
    if (empties.length !== candidates.length) {
      result.skipped.push({
        reason: 'count-mismatch',
        obj: objName,
        emptyFields: empties.length,
        candidates: candidates.length,
        sectionIds: [sectionId],
      })
      continue
    }
    // 从后往前替换，偏移不失效
    for (let i = empties.length - 1; i >= 0; i -= 1) {
      const span = empties[i]
      out = `${out.slice(0, span.start)}${field}: ${varNames[i]}${out.slice(span.end)}`
    }
    anyFilled = true
    result.healed.push({
      obj: objName,
      field,
      sectionId,
      fields: empties.length,
      pairs: candidates.map((m, i) => ({
        varName: varNames[i],
        figmaNodeId: m.figmaNodeId,
        x: m.figmaBox?.x,
      })),
    })

    // 收集 import（不立即插入，避免后插入的跑到前面去、顺序与视觉顺序相反）
    for (let i = 0; i < candidates.length; i += 1) {
      const varName = varNames[i]
      if (isDeclared(out, varName)) continue
      if (pendingImports.some((p) => p.varName === varName)) continue
      const fileName = String(candidates[i].resourceFile).split('/').pop()
      const relPath = String(relBase || '').endsWith('/')
        ? `${relBase}${fileName}`
        : `${relBase}/${fileName}`
      pendingImports.push({ varName, relPath })
    }
  }

  // 一次性插入整块（顺序 = 视觉顺序）。
  // 🔴 不能循环调用 insertImport —— 它每次都插在 `<script setup>` 正下方，
  //    第二条会顶到第一条前面 ⇒ 产物 import 顺序与视觉顺序相反（真机复刻时踩过）。
  if (pendingImports.length > 0) {
    const sm = /<script\b[^>]*\bsetup\b[^>]*>/.exec(out)
    if (!sm) {
      result.skipped.push({ reason: 'no-script-setup', sectionIds: [sectionId] })
      return result
    }
    const at = sm.index + sm[0].length
    const block = pendingImports.map((p) => `\nimport ${p.varName} from '${p.relPath}'`).join('')
    out = out.slice(0, at) + block + out.slice(at)
  }

  result.code = out
  result.changed = anyFilled && out !== code
  return result
}

/**
 * 给「无 src / 引用未声明权威变量」的 img 补齐资源绑定。
 *
 * @param {string} code SFC 源码
 * @param {Array<object>} mappings resourceDomMapping（含 resourceFile / ownerSectionId / assignedVarName）
 * @param {string} relBase 资源相对基准（如 `../../resources/images/`）
 * @param {{ownerSectionId?:string}} [opts] 刀 43：文件内无 `data-section-id` 时的归属兜底
 *        （由 `buildComponentOwnerMap` 从装配层父子关系推断而来）
 * @returns {{code:string, changed:boolean, healed:Array<{varName:string,resourceFile:string,sectionId:string,imgs:number}>,
 *            skipped:Array<{reason:string,sectionIds?:string[],candidates?:number}>}}
 */
export function healEmptyImgSrc(code, mappings, relBase = '../resources/images/', opts = {}) {
  const result = { code, changed: false, healed: [], skipped: [] }
  if (typeof code !== 'string' || code.length === 0) return result

  const imgs = findImgTags(code)
  if (imgs.length === 0) return result

  const sectionIds = collectSectionIds(code)
  let sectionId = ''
  if (sectionIds.length === 1) {
    sectionId = sectionIds[0]
  } else if (sectionIds.length === 0 && opts?.ownerSectionId) {
    // 刀 43：无锚点组件的归属兜底（真机 HeaderText2.vue 就是这种）
    sectionId = String(opts.ownerSectionId)
  } else {
    result.skipped.push({
      reason: sectionIds.length === 0 ? 'no-section-id' : 'ambiguous-section',
      sectionIds,
    })
    return result
  }

  const candidates = candidatesForSection(mappings, sectionId)
  if (candidates.length !== 1) {
    result.skipped.push({
      reason: candidates.length === 0 ? 'no-resource' : 'ambiguous-resource',
      sectionIds: [sectionId],
      candidates: candidates.length,
    })
    return result
  }

  const mapping = candidates[0]
  const varName = varNameOf(mapping)
  if (!varName) {
    result.skipped.push({ reason: 'no-var-name', sectionIds: [sectionId] })
    return result
  }

  // 目标三类（其余一律不动 —— 宁可漏，不可错配）：
  //   A「裸 img」：完全没有 src 绑定 ⇒ 补 `:src`
  //   B「未声明权威变量」：`:src="X"` 且 X 未声明，并且 X 归一后 === 候选权威名之一 ⇒ 换成权威名
  //   C「伪兜底声明」（刀 46）：X 已声明，但右侧是从 `window/globalThis/self` 取同名值
  //     ⇒ 运行时恒 undefined（微码运行时无该注入）⇒ 把声明右侧换成资源字面量
  const aliasNames = [mapping?.assignedVarName, mapping?.semanticVarName, varName]
    .map(normVarName)
    .filter(Boolean)
  const targets = []
  for (const t of imgs) {
    if (!t.hasSrc) {
      targets.push({ t, mode: 'missing' })
      continue
    }
    if (!t.srcVar) continue // 字面量 src / 复杂表达式 ⇒ 不是资源变量
    if (isDeclared(code, t.srcVar)) {
      // 已声明 ≠ 已生效：`window.X` 伪兜底要把声明右侧换掉（模板保持原样，`v-if` 也跟着生效）
      if (!findGlobalFallbackDecl(code, t.srcVar)) continue
      targets.push({ t, mode: 'global-fallback', from: t.srcVar })
      continue
    }
    if (!aliasNames.includes(normVarName(t.srcVar))) continue // 名字对不上 ⇒ 可能是别的变量
    targets.push({ t, mode: 'alias', from: t.srcVar })
  }
  if (targets.length === 0) return result

  const fileName = String(mapping.resourceFile).split('/').pop()
  const relPath = String(relBase || '').endsWith('/')
    ? `${relBase}${fileName}`
    : `${relBase}/${fileName}`

  // 1) 模板改写（一个 pass，按偏移升序）。global-fallback 只改 script，模板原样保留。
  let out = ''
  let cursor = 0
  for (const { t, mode } of targets) {
    out += code.slice(cursor, t.start)
    out +=
      mode === 'alias'
        ? t.tag.replace(/((?::src|v-bind:src)\s*=\s*")[^"]*(")/i, `$1${varName}$2`)
        : mode === 'global-fallback'
          ? t.tag
          : t.tag.replace(/^<img\b/i, `<img :src="${varName}"`)
    cursor = t.end
  }
  out += code.slice(cursor)

  // 1b) script：伪兜底声明 ⇒ 右侧换成资源字面量（变量名不变，模板与 v-if 全都不用动）
  const fallbackVars = []
  for (const { mode, from } of targets) {
    if (mode !== 'global-fallback') continue
    const stmt = findGlobalFallbackDecl(out, from)
    if (!stmt) continue
    out = `${out.slice(0, stmt.rhsStart)}'${relPath}'${out.slice(stmt.end)}`
    fallbackVars.push(from)
  }

  // 2) script：补 import（已声明则不重复）。仅当存在 missing/alias 目标时才需要 import
  //    （纯 global-fallback 场景用的是「声明右侧字面量」，不引入新变量）
  const needImport = targets.some((x) => x.mode !== 'global-fallback')
  if (needImport && !isDeclared(out, varName)) {
    const withImport = insertImport(out, varName, relPath)
    if (withImport == null) {
      result.skipped.push({ reason: 'no-script-setup', sectionIds: [sectionId] })
      return result
    }
    out = withImport
  }

  result.code = out
  result.changed = out !== code
  const aliased = targets.filter((x) => x.mode === 'alias').map((x) => x.from)
  result.healed.push({
    varName,
    resourceFile: mapping.resourceFile,
    sectionId,
    imgs: targets.length,
    ...(aliased.length > 0 ? { aliased } : {}),
    ...(fallbackVars.length > 0 ? { globalFallback: fallbackVars } : {}),
  })
  return result
}
