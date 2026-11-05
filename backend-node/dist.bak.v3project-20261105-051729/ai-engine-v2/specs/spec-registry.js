'use strict'

/**
 * SpecRegistry — 代码规范注册表（ai-engine-v2）
 *
 * 把"代码规范"从硬编码的 `componentType === 'vue3'` 分支，
 * 升级为可插拔、可继承、可上传的规范包（Skill 包）。
 * 管线各节点从 spec.xxx 读取值，不再做 componentType 判断。
 *
 * 双源加载：
 *   - builtin: ./definitions/<id>.json      内置规范，随代码发布
 *   - user:    ./user/<packageId>/skill.json 用户规范包，运行时可增删（P0 落文件系统，P1 迁 Java+MongoDB）
 *
 * 继承：user 包可声明 baseSpec 继承内置或其他用户规范，
 *       团队规范 = 社区规范 + 若干内部约定，不必从零编写。
 *
 * 合并优先级（低 → 高）：
 *   继承链祖先 → 规范自身字段 → resolveSpec(id, overrides) 的请求级覆盖
 *
 * ⚠️ 本模块完全独立于 src/ai-engine/（旧管线），不被其引用，也不引用其代码。
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import * as skillLoader from './skill-loader.js'
import * as promptResolver from './prompt-resolver.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const DEFINITIONS_DIR = path.join(__dirname, 'definitions')
const USER_SPECS_DIR = skillLoader.USER_SPECS_DIR

/** 原始定义（未展开继承） @type {Map<string, Object>} */
const rawRegistry = new Map()
/** 展开继承后的定义 @type {Map<string, Object>} */
const registry = new Map()
/** 加载期的非致命告警 @type {string[]} */
let loadWarnings = []

/** 继承链最大深度，防御恶意深链 */
const MAX_INHERIT_DEPTH = 8

/**
 * 启动时加载全部规范（builtin + user）并自检
 * @param {Object} [opts]
 * @param {boolean} [opts.includeUser=true] 是否加载用户规范包
 * @param {boolean} [opts.strictUser=false] 用户包加载失败时是否抛错（默认降级为告警，坏包不拖垮服务）
 * @returns {{specs: string[], builtin: string[], user: string[], warnings: string[]}}
 */
function loadSpecRegistry(opts = {}) {
  const { includeUser = true, strictUser = false } = opts

  rawRegistry.clear()
  registry.clear()
  loadWarnings = []

  const errors = []
  const builtinIds = []
  const userIds = []

  // ---- 1. 内置规范 ----
  if (!fs.existsSync(DEFINITIONS_DIR)) {
    throw new Error(`[SpecRegistry] 定义目录不存在: ${DEFINITIONS_DIR}`)
  }
  const files = fs.readdirSync(DEFINITIONS_DIR).filter((f) => f.endsWith('.json'))
  if (files.length === 0) {
    throw new Error('[SpecRegistry] 未找到任何内置规范定义 (*.json)')
  }
  for (const file of files) {
    const abs = path.join(DEFINITIONS_DIR, file)
    let def
    try {
      def = JSON.parse(fs.readFileSync(abs, 'utf-8'))
    } catch (e) {
      errors.push(`${file}: JSON 解析失败 - ${e.message}`)
      continue
    }
    if (!def.id) {
      errors.push(`${file}: 缺少 id 字段`)
      continue
    }
    if (rawRegistry.has(def.id)) {
      errors.push(`${file}: 重复规范 id "${def.id}"`)
      continue
    }
    def.__source = 'builtin'
    def.__file = file
    rawRegistry.set(def.id, def)
    builtinIds.push(def.id)
  }

  if (errors.length > 0) {
    throw new Error('[SpecRegistry] 内置规范加载失败:\n  ' + errors.join('\n  '))
  }
  // 硬约束：microcode 必须存在（默认规范，向后兼容）
  if (!rawRegistry.has('microcode')) {
    throw new Error('[SpecRegistry] 缺失默认规范 "microcode"')
  }

  // ---- 2. 用户规范包 ----
  if (includeUser) {
    const { specs, errors: userErrors } = skillLoader.loadUserSpecs(USER_SPECS_DIR)
    if (userErrors.length > 0) {
      if (strictUser) {
        throw new Error('[SpecRegistry] 用户规范包加载失败:\n  ' + userErrors.join('\n  '))
      }
      loadWarnings.push(...userErrors)
    }
    for (const def of specs) {
      if (rawRegistry.has(def.id)) {
        loadWarnings.push(
          `用户规范包 "${def.__packageId}" 的 id "${def.id}" 与已有规范冲突，已跳过（内置规范不可被覆盖）`
        )
        continue
      }
      rawRegistry.set(def.id, def)
      userIds.push(def.id)
    }
  }

  // ---- 3. 展开继承链 + 派生字段 ----
  for (const id of rawRegistry.keys()) {
    try {
      registry.set(id, expandInheritance(id))
    } catch (e) {
      if (rawRegistry.get(id).__source === 'builtin') throw e
      loadWarnings.push(`用户规范 "${id}" 继承解析失败，已跳过: ${e.message}`)
    }
  }

  return {
    specs: [...registry.keys()],
    builtin: builtinIds,
    user: userIds.filter((id) => registry.has(id)),
    warnings: loadWarnings
  }
}

/**
 * 展开 baseSpec 继承链
 * @param {string} id
 * @param {string[]} [seen=[]] 用于循环检测
 * @returns {Object}
 */
function expandInheritance(id, seen = []) {
  if (seen.includes(id)) {
    throw new Error(`检测到 baseSpec 循环继承: ${[...seen, id].join(' → ')}`)
  }
  if (seen.length >= MAX_INHERIT_DEPTH) {
    throw new Error(`baseSpec 继承层级超过 ${MAX_INHERIT_DEPTH} 层上限`)
  }

  const raw = rawRegistry.get(id)
  if (!raw) throw new Error(`未知规范 "${id}"`)

  let merged
  if (raw.baseSpec) {
    const base = expandInheritance(raw.baseSpec, [...seen, id])
    merged = skillLoader.deepMerge(base, raw)
    // 继承来的元字段不能污染子规范身份
    merged.id = raw.id
    merged.__source = raw.__source
    merged.__packageId = raw.__packageId
    merged.__packageDir = raw.__packageDir
    merged.__inheritedFrom = [...(base.__inheritedFrom || []), raw.baseSpec]

    // promptInjection 默认「整节点替换」；声明 extendsPromptInjection 时改为「基座在前去重追加」
    if (raw.extendsPromptInjection === true) {
      merged.promptInjection = mergeInjectionAppend(base.promptInjection, raw.promptInjection)
    }
  } else {
    merged = { ...raw }
  }

  // 派生字段：promptModules 由 promptInjection 自动汇总，避免双份维护不一致
  merged.promptModules = promptResolver.derivePromptModules(merged)
  return merged
}

function mergeInjectionAppend(baseInjection = {}, childInjection = {}) {
  const out = {}
  const nodes = new Set([...Object.keys(baseInjection), ...Object.keys(childInjection)])
  for (const node of nodes) {
    const b = Array.isArray(baseInjection[node]) ? baseInjection[node] : []
    const c = Array.isArray(childInjection[node]) ? childInjection[node] : []
    out[node] = [...new Set([...b, ...c])]
  }
  return out
}

/**
 * 解析规范定义，支持运行时局部覆盖
 * @param {string} id
 * @param {Object} [overrides] 请求级局部覆盖（如 specOverrides.naming.componentDir）
 * @returns {Object} SpecDefinition（已展开继承）
 */
function resolveSpec(id, overrides) {
  const base = registry.get(id)
  if (!base) {
    const available = [...registry.keys()].join(', ') || '(空)'
    throw new Error(`[SpecRegistry] 未知规范 "${id}"，可用: ${available}`)
  }
  if (overrides && typeof overrides === 'object') {
    const merged = skillLoader.deepMerge(base, overrides)
    merged.id = base.id // 覆盖不得改变规范身份
    merged.promptModules = promptResolver.derivePromptModules(merged)
    return merged
  }
  return base
}

/**
 * 全量注入自检：逐规范检查文档存在性与节点覆盖率
 * @returns {{ok: boolean, reports: Object[], warnings: string[]}}
 */
function auditRegistry() {
  const reports = []
  for (const spec of registry.values()) {
    reports.push(promptResolver.auditPromptInjection(spec))
  }
  return {
    ok: reports.every((r) => r.ok),
    reports,
    warnings: loadWarnings
  }
}

/**
 * 规范清单（供配置页下拉展示）
 * @returns {Array<{id:string,label:string,version:string,source:string,baseSpec?:string}>}
 */
function listSpecs() {
  return [...registry.values()].map((s) => ({
    id: s.id,
    label: s.label,
    version: s.version,
    source: s.__source,
    ...(s.baseSpec ? { baseSpec: s.baseSpec } : {})
  }))
}

function listSpecIds() {
  return [...registry.keys()]
}

function hasSpec(id) {
  return registry.has(id)
}

export {
  loadSpecRegistry,
  resolveSpec,
  auditRegistry,
  listSpecs,
  listSpecIds,
  hasSpec,
  DEFINITIONS_DIR,
  USER_SPECS_DIR
}
