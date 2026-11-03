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
