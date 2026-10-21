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
 */

/** 模板区（无 <template> 时返回 null —— 不判，避免 SFC 片段误伤） */
function templateRange(code) {
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
    out.push({
      tag: m[0],
      start: absStart,
      end: absStart + m[0].length,
      hasSrc: /\b(:src|v-bind:src|src)\s*=/i.test(m[0]),
    })
  }
  return out
}

/** 模板内的 data-section-id 取值集合 */
function collectSectionIds(code) {
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
 */
function candidatesForSection(mappings, sectionId) {
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

/** 变量名：assignedVarName 优先，其次 semanticVarName */
function varNameOf(mapping) {
  const v = mapping?.assignedVarName || mapping?.semanticVarName
  return typeof v === 'string' && v.trim() ? v.trim() : ''
}

/** 该变量是否已在 script 里具名声明（import / const|let|var） */
function isDeclared(code, varName) {
  const rx = new RegExp(
    `(?:\\bimport\\s+${varName}\\b|\\b(?:const|let|var)\\s+${varName}\\s*=)`,
  )
  return rx.test(code)
}

/** 在 `<script setup>` 之后插入 import（无 script setup ⇒ 不插，视为无法注入） */
function insertImport(code, varName, relPath) {
  const m = /<script\b[^>]*\bsetup\b[^>]*>/.exec(code)
  if (!m) return null
  const at = m.index + m[0].length
  const line = `\nimport ${varName} from '${relPath}'`
  return code.slice(0, at) + line + code.slice(at)
}

/**
 * 给「无 src 的 img」补齐资源绑定。
 *
 * @param {string} code SFC 源码
 * @param {Array<object>} mappings resourceDomMapping（含 resourceFile / ownerSectionId / assignedVarName）
 * @param {string} relBase 资源相对基准（如 `../../resources/images/`）
 * @returns {{code:string, changed:boolean, healed:Array<{varName:string,resourceFile:string,sectionId:string,imgs:number}>,
 *            skipped:Array<{reason:string,sectionIds?:string[],candidates?:number}>}}
 */
export function healEmptyImgSrc(code, mappings, relBase = '../resources/images/') {
  const result = { code, changed: false, healed: [], skipped: [] }
  if (typeof code !== 'string' || code.length === 0) return result

  const imgs = findImgTags(code)
  const emptyImgs = imgs.filter((t) => !t.hasSrc)
  if (emptyImgs.length === 0) return result

  const sectionIds = collectSectionIds(code)
  if (sectionIds.length !== 1) {
    result.skipped.push({
      reason: sectionIds.length === 0 ? 'no-section-id' : 'ambiguous-section',
      sectionIds,
    })
    return result
  }
  const sectionId = sectionIds[0]

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

  // 1) 模板：所有空 img 补 :src
  let out = ''
  let cursor = 0
  for (const t of emptyImgs) {
    out += code.slice(cursor, t.start)
    out += t.tag.replace(/^<img\b/i, `<img :src="${varName}"`)
    cursor = t.end
  }
  out += code.slice(cursor)

  // 2) script：补 import（已声明则不重复）
  const fileName = String(mapping.resourceFile).split('/').pop()
  const relPath = String(relBase || '').endsWith('/')
    ? `${relBase}${fileName}`
    : `${relBase}/${fileName}`
  if (!isDeclared(out, varName)) {
    const withImport = insertImport(out, varName, relPath)
    if (withImport == null) {
      result.skipped.push({ reason: 'no-script-setup', sectionIds: [sectionId] })
      return result
    }
    out = withImport
  }

  result.code = out
  result.changed = out !== code
  result.healed.push({
    varName,
    resourceFile: mapping.resourceFile,
    sectionId,
    imgs: emptyImgs.length,
  })
  return result
}
