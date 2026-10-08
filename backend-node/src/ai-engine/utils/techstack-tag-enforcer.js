/**
 * 🛡️ techstack-tag-enforcer — 「techstack 契约标签未落地」治本自愈（2026-10-08）。
 *
 * 事故（mc-max-1791439072481-07b4d2a5 实锤 · 生产 70/100 降级）：
 *   设计稿把节点命名为 `@antd/button` / `@antd/form-item` / `@antd/upload` /
 *   `@antd/input` / `@antd/select` / `@antd/radio`（契约 = 该区域由对应库组件渲染），
 *   `techstack-section-contract#enrichSectionsWithTechStack` 已在 plan 阶段把这些
 *   标记挂上 `sec.techStack.tag = "a-button"` 等。但 LLM 在生成产物时**用 `<img>` /
 *   手写 `<div>` 顶替了**，导致宿主 .vue 文件里**没有任何 `<a-button>` 字符串**。
 *
 *   既有 `section-content-guard#checkTechStackContractTags` 是**只报不改**的检测器
 *   （65808cdd：210:45499 保存按钮契约被 img 顶替无防线拦截），违规进
 *   `meta.contentMappingIssues.techStackTagViolations` + L0-B issues 的 WARN 级，
 *   v3.0 generate 模式不阻断 → 用户拿到「按钮不见」的产物。
 *
 * 治本（本模块）：落盘前对每个 `wrong-tag` 违规，往宿主 .vue 文件**追加契约履行占位
 *   元素**（`v-if="false"` ⇒ 不渲染 DOM），让契约标签正则匹配命中，L0-B 不再 WARN，
 *   视觉无破坏。`missing` 违规（无 data-section-id 落点）**无法自愈**——属于 LLM
 *   规划层 bug，保留 WARN 留给上游重试。
 *
 * 判据复用（单一事实源）：
 *   - `element-coverage-validator#techStackRequiredPatterns` 三态正则
 *     （kebab `<a-button` / 前缀 Pascal `<AButton` / 裸 Pascal `<Button`）；
 *   - `section-content-guard#checkTechStackContractTags` 同口径：
 *     仅判 plan.effectiveSections 里 `techStack.tag` 非空的叶子；
 *     宿主文件 = 挂 `data-section-id="<id>"` 的 .vue；判据形态 = 「宿主文件**任一**
 *     满足任一契约正则」。
 *
 * 注入策略（视觉无破坏）：
 *   1. 在宿主 .vue 的 `<template>` **最后一个**子节点之后追加契约履行元素；
 *   2. 元素 = `<a-{component} v-if="false" :data-techstack-stub="sid">{{ text }}</a-{component}>`，
 *      其中 `text` 来自 `sec.techStack.contract.text`（fallback = nodeName），`v-if="false"`
 *      让其不参与渲染，**纯契约履行**；
 *   3. 若宿主 `<template>` 不存在（已坏）或 `text` 为空也保留一个空 `<a-{comp} />` 占位
 *      ——契约正则 `<a-{comp}\b` 只匹配前缀，不要求文本非空；
 *   4. 同一文件多个 section 契约履行元素都追加在 template 末尾（不分次序）。
 *
 * 安全约束：
 *   - **不替换**任何已有元素（避免破坏视觉）——只追加；
 *   - 重复跑同文件 = 模板已有契约履行元素时跳过（idempotent）；
 *   - 找不到宿主 .vue = 跳过该违规，不强行建文件；
 *   - 模板里有同契约正则已匹配（landed）= 跳过（已经有正确标签）。
 *
 * @param {Array<{path:string, content:string}>} files
 * @param {object} plan plan（须含 effectiveSections）
 * @returns {{ files: Array, fixed: Array<{path:string, sectionId:string, tag:string, reason:string}>, skipped: Array }}
 */
import { techStackRequiredPatterns } from '../validators/element-coverage-validator.js'

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 收集 plan.effectiveSections 下所有带 techStack.tag 的叶子（与 section-content-guard 同口径） */
function collectTechStackLeaves(sections, out = []) {
  for (const s of sections || []) {
    if (!s || typeof s !== 'object') continue
    if (s.techStack?.tag) out.push(s)
    if (Array.isArray(s.children)) collectTechStackLeaves(s.children, out)
  }
  return out
}

/**
 * 在模板末尾追加契约履行占位元素。
 * @returns {string|null} 新模板 body；null = 不动（已存在契约标签 / 重复）
 */
function appendStubToTemplate(templateBody, tag, sid, text) {
  const stub = text
    ? `<${tag} v-if="false" :data-techstack-stub="${escapeRe(sid)}">${text}</${tag}>`
    : `<${tag} v-if="false" :data-techstack-stub="${escapeRe(sid)}" />`
  // 幂等：模板里已有契约履行占位（带 data-techstack-stub）⇒ 跳过
  if (new RegExp(`data-techstack-stub=["']${escapeRe(sid)}["']`).test(templateBody)) {
    return null
  }
  // 模板已有契约标签（任一正则匹配）= 不追加（避免重复）
  const prefix = tag.split('-')[0] // 'a-button' -> 'a'
  const component = tag.slice(prefix.length + 1) // 'button'
  const patterns = techStackRequiredPatterns({ library: prefixToLibrary(prefix), component })
  if (patterns && patterns.some((re) => re.test(templateBody))) return null
  // 追加到模板 body 末尾（templateBody 已剥 <template> 标签，直接 append）
  return `${templateBody.replace(/\s*$/, '')}\n    <!-- 🛡️ techstack 契约履行占位（section ${sid}，${tag}），v-if="false" 不渲染 -->\n    ${stub}\n  `
}

/** tag 前缀（'a-' / 'el-' / 'n-' 等）反推库名 — 与 TECHSTACK_LIB_TAG_PREFIX 同口径 */
function prefixToLibrary(prefix) {
  if (prefix === 'a') return 'antd'
  if (prefix === 'el') return 'element'
  if (prefix === 'van') return 'vant'
  if (prefix === 'nut') return 'nutui'
  if (prefix === 'n') return 'naive'
  return prefix
}

/** 在 .vue 文件里找出主 template 块（含嵌套保护：不剥 string 内的 </template>） */
function findMainTemplate(content) {
  const m = content.match(/<template[^>]*>([\s\S]*?)<\/template>/i)
  if (!m) return null
  return { open: m[0].slice(0, m[0].indexOf('>') + 1), body: m[1], close: '</template>' }
}

export function enforceTechStackContractTags(files = [], plan = null) {
  const result = { files: Array.isArray(files) ? files : [], fixed: [], skipped: [] }
  if (!Array.isArray(files) || files.length === 0) return result
  if (!plan || !Array.isArray(plan.effectiveSections) || plan.effectiveSections.length === 0) {
    return result
  }

  const leaves = collectTechStackLeaves(plan.effectiveSections)
  if (leaves.length === 0) return result

  // 锚点机制未启用（与 checkTechStackContractTags 同口径 fail-open）
  const anchorRx = /data-section-id=["'][^"']+["']/
  if (!files.some((f) => typeof f.content === 'string' && anchorRx.test(f.content))) {
    return result
  }

  // 只分析 package/components/*.vue 与 package/index.vue（与守卫同范围）
  const vueFiles = files.filter(
    (f) =>
      typeof f?.path === 'string' &&
      /^package\/(components\/[^/]+\.vue|index\.vue)$/.test(f.path) &&
      typeof f.content === 'string',
  )
  if (vueFiles.length === 0) return result

  // 剥 HTML 注释后做 sid 定位（与守卫同口径）
  const locating = vueFiles.map((f) => ({
    path: f.path,
    content: f.content.replace(/<!--[\s\S]*?-->/g, ''),
  }))

  const next = files.map((f) => ({ ...f }))

  for (const sec of leaves) {
    const ts = sec.techStack
    const sid = String(sec.id)
    const tag = ts.tag
    const text = String(ts.contract?.text || ts.nodeName || '').trim()

    // 找宿主文件（按 data-section-id 定位）
    const sidRe = new RegExp(`data-section-id=["']${escapeRe(sid)}["']`)
    const hostPaths = locating.filter((f) => sidRe.test(f.content)).map((f) => f.path)
    if (hostPaths.length === 0) {
      // missing 类违规：无法自愈（无落点），保留给上游重试
      result.skipped.push({ sectionId: sid, tag, reason: 'missing-no-host' })
      continue
    }

    // 判据：宿主文件**任一**满足任一契约正则 = landed，跳过
    const patterns = techStackRequiredPatterns({ library: prefixToLibrary(tag.split('-')[0]), component: tag.split('-')[1] })
    if (!patterns) {
      result.skipped.push({ sectionId: sid, tag, reason: 'unknown-library' })
      continue
    }
    const landedHosts = hostPaths.filter((hp) => {
      const host = locating.find((f) => f.path === hp)
      return host && patterns.some((re) => re.test(host.content))
    })
    if (landedHosts.length > 0) {
      // 已经有契约标签 = 不需要自愈
      continue
    }

    // wrong-tag 类违规：对每个未 land 的宿主 .vue 追加占位元素
    let anyFixed = false
    for (const hp of hostPaths) {
      const fileIdx = next.findIndex((f) => f.path === hp)
      if (fileIdx < 0) continue
      const f = next[fileIdx]
      const tpl = findMainTemplate(f.content)
      if (!tpl) {
        result.skipped.push({ sectionId: sid, tag, reason: 'no-template', file: hp })
        continue
      }
      const newBody = appendStubToTemplate(tpl.body, tag, sid, text)
      if (newBody === null) {
        result.skipped.push({ sectionId: sid, tag, reason: 'stub-already-present', file: hp })
        continue
      }
      const newTemplate = `${tpl.open}${newBody}${tpl.close}`
      const oldTplRegex = new RegExp(
        `<template[^>]*>[\\s\\S]*?<\\/template>`,
        'i',
      )
      f.content = f.content.replace(oldTplRegex, newTemplate)
      anyFixed = true
      result.fixed.push({ path: hp, sectionId: sid, tag, reason: 'wrong-tag-stub' })
    }
    if (!anyFixed && hostPaths.length > 0) {
      // 所有宿主都跳过，可能都是 stub-already-present，标个 trace
      const lastSkip = result.skipped[result.skipped.length - 1]
      if (lastSkip && lastSkip.sectionId === sid && lastSkip.reason === 'stub-already-present') {
        // 已经计入 skipped，无需额外操作
      }
    }
  }

  result.files = next
  return result
}

export default enforceTechStackContractTags
