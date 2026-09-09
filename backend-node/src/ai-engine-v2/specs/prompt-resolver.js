'use strict'

/**
 * PromptResolver — 规范文档的节点级注入解析（ai-engine-v2）
 *
 * 规范包里的「文本知识」（框架用法、代码风格、禁止项）通过 spec.promptInjection
 * 显式声明「哪个节点吃哪几份文档」，带来三个收益：
 *   1. 注入覆盖率可自检（漏配某节点会被发现，而不是静默降级）
 *   2. token 预算可控（按节点装配，不再全量塞给所有角色）
 *   3. 可解释性（能回答"这段代码为什么这么生成"）
 *
 * 路径双根解析：
 *   - 以 `references/` 开头  → 内置文档根（backend-node/references/）
 *   - 其余相对路径          → 规范包自带目录（skill 包内 prompts/xxx.md）
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** 内置文档根：backend-node/references */
const BUILTIN_REFERENCES_ROOT = path.resolve(__dirname, '../../../references')

/**
 * spec 敏感节点：这些节点的产出会随规范不同而不同，应当配置 promptInjection。
 * 缺配不致命（可能该规范确实不需要），但会在自检报告里列出。
 */
const SPEC_SENSITIVE_NODES = Object.freeze([
  'code-engineer',
  'adversarial-checker',
  'style-mapper',
  'style-refiner',
  'layout-refiner'
])

/**
 * spec 无关节点：纯视觉/语义分析，prompt 由节点自身模块系统装配。
 * 例如 visual-parser 有自己的 references/prompts/preview-analysis/ 模块化装配逻辑，
 * spec 只通过结构化字段（panel.stripOuterShell）影响它，不注入文档。
 */
const SPEC_AGNOSTIC_NODES = Object.freeze([
  'visual-parser',
  'layout-reviewer',
  'visual-comparator'
])

/**
 * 解析单个文档引用为绝对路径
 * @param {string} ref 文档引用（'references/xxx.md' 或包内相对路径）
 * @param {string} [packageDir] 规范包根目录（用户包必传）
 * @returns {string} 绝对路径
 */
function resolveDocPath(ref, packageDir) {
  if (typeof ref !== 'string' || ref.length === 0) {
    throw new Error('[PromptResolver] 文档引用必须是非空字符串')
  }
  if (path.isAbsolute(ref)) {
    throw new Error(`[PromptResolver] 禁止绝对路径引用: ${ref}`)
  }

  const isBuiltin = ref.startsWith('references/')
  const root = isBuiltin ? BUILTIN_REFERENCES_ROOT : packageDir
  if (!root) {
    throw new Error(`[PromptResolver] 包内文档引用 "${ref}" 缺少 packageDir 上下文`)
  }

  const rel = isBuiltin ? ref.slice('references/'.length) : ref
  const abs = path.resolve(root, rel)

  // 路径穿越防护：解析结果必须仍在根目录内
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep
  if (!abs.startsWith(rootWithSep)) {
    throw new Error(`[PromptResolver] 检测到路径穿越: ${ref}`)
  }
  return abs
}

/**
 * 派生 promptModules（全量去重合集）—— 单一数据源，避免与 promptInjection 双份维护
 * @param {Object} spec
 * @returns {string[]}
 */
function derivePromptModules(spec) {
  const injection = spec && spec.promptInjection
  if (!injection || typeof injection !== 'object') return []
  const seen = new Set()
  for (const refs of Object.values(injection)) {
    if (!Array.isArray(refs)) continue
    for (const ref of refs) seen.add(ref)
  }
  return [...seen]
}

/**
 * 注入覆盖率自检
 * @param {Object} spec 已解析的 SpecDefinition（含 __packageDir 时按包内根解析）
 * @returns {{ok: boolean, specId: string, coveredNodes: string[], missingNodes: string[], unknownNodes: string[], missingFiles: Array<{node:string,ref:string,reason:string}>, totalDocs: number}}
 */
function auditPromptInjection(spec) {
  const injection = (spec && spec.promptInjection) || {}
  const packageDir = spec && spec.__packageDir
  const declaredNodes = Object.keys(injection)

  const coveredNodes = SPEC_SENSITIVE_NODES.filter(
    (n) => Array.isArray(injection[n]) && injection[n].length > 0
  )
  const missingNodes = SPEC_SENSITIVE_NODES.filter((n) => !coveredNodes.includes(n))
  const unknownNodes = declaredNodes.filter(
    (n) => !SPEC_SENSITIVE_NODES.includes(n) && !SPEC_AGNOSTIC_NODES.includes(n)
  )

  const missingFiles = []
  let totalDocs = 0
  for (const [node, refs] of Object.entries(injection)) {
    if (!Array.isArray(refs)) continue
    for (const ref of refs) {
      totalDocs += 1
      try {
        const abs = resolveDocPath(ref, packageDir)
        if (!fs.existsSync(abs)) {
          missingFiles.push({ node, ref, reason: '文件不存在' })
        }
      } catch (e) {
        missingFiles.push({ node, ref, reason: e.message })
      }
    }
  }

  return {
    ok: missingFiles.length === 0 && unknownNodes.length === 0,
    specId: (spec && spec.id) || '(unknown)',
    coveredNodes,
    missingNodes,
    unknownNodes,
    missingFiles,
    totalDocs
  }
}

/**
 * 装配某个节点的 prompt 文本
 * @param {Object} spec 已解析的 SpecDefinition
 * @param {string} nodeId 节点名（如 'code-engineer'）
 * @param {Object} [opts]
 * @param {boolean} [opts.strict=false] 文档缺失时是否抛错（默认跳过并记 warning）
 * @returns {{nodeId:string, text:string, docs:Array<{ref:string,chars:number}>, warnings:string[]}}
 */
function resolveNodePrompt(spec, nodeId, opts = {}) {
  const { strict = false } = opts
  const refs = (spec && spec.promptInjection && spec.promptInjection[nodeId]) || []
  const packageDir = spec && spec.__packageDir

  const docs = []
  const warnings = []
  const chunks = []

  for (const ref of refs) {
    let abs
    try {
      abs = resolveDocPath(ref, packageDir)
    } catch (e) {
      if (strict) throw e
      warnings.push(`${ref}: ${e.message}`)
      continue
    }
    if (!fs.existsSync(abs)) {
      const msg = `${ref}: 文件不存在`
      if (strict) throw new Error(`[PromptResolver] ${msg}`)
      warnings.push(msg)
      continue
    }
    const content = fs.readFileSync(abs, 'utf-8')
    docs.push({ ref, chars: content.length })
    chunks.push(`<!-- ===== ${ref} ===== -->\n${content}`)
  }

  return {
    nodeId,
    text: chunks.join('\n\n'),
    docs,
    warnings
  }
}

/**
 * 一次性装配全部 spec 敏感节点的 prompt（供管线启动时预热）
 * @param {Object} spec
 * @param {Object} [opts]
 * @returns {Record<string, {text:string, docs:Array, warnings:string[]}>}
 */
function resolveAllNodePrompts(spec, opts = {}) {
  const injection = (spec && spec.promptInjection) || {}
  const out = {}
  for (const nodeId of Object.keys(injection)) {
    out[nodeId] = resolveNodePrompt(spec, nodeId, opts)
  }
  return out
}

export {
  BUILTIN_REFERENCES_ROOT,
  SPEC_SENSITIVE_NODES,
  SPEC_AGNOSTIC_NODES,
  resolveDocPath,
  derivePromptModules,
  auditPromptInjection,
  resolveNodePrompt,
  resolveAllNodePrompts
}
