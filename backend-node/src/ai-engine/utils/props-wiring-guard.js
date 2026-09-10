/**
 * @file props-wiring-guard.js — Props 接线校验（CODE-019）
 *
 * 单一事实源：检查主组件调用子组件时是否传入了所有 required props，以及
 * 子组件通过 defineProps 接收并实际使用的资源 props（bg1/icon1/img1/semanticVarName）。
 *
 * 问题形态：
 * - 子组件 defineProps({ foo: { type: String, required: true } })
 * - 主组件 <ChildComponent /> 没有 :foo="..." 或 foo="..."
 * - 子组件 defineProps({ bg2: String })，template/script 实际使用 bg2
 * - 主组件 <ChildComponent /> 未传 :bg2="bg2" → 运行时 undefined，背景/图标静默丢失
 *
 * 检测逻辑：
 * 1. 解析所有子组件（package/components/*.vue）的 defineProps，提取 required props
 * 2. 若传入 resourceDomMapping，提取已注册资源变量名并识别子组件实际使用的资源 props
 * 3. 解析主组件（package/index.vue）template，找到所有子组件调用
 * 4. 检查每个调用是否传入 required/resource props
 *
 * 导出：
 * - extractRequiredProps(subcompContent) → string[]
 * - extractResourceProps(subcompContent, options) → string[]
 * - extractComponentCalls(mainContent) → Map<componentName, Set<propName>>
 * - detectMissingPropsWiring(files, options) → Array<{ id, severity, file, message }>
 */

import { extractResourceVarNames, buildVarToMapping, injectResourceImports } from './resource-import-guard.js'

const NON_PROP_ATTRS = new Set([
  'class',
  'style',
  'ref',
  'key',
  'id',
  'slot',
  'is',
])

function toKebabCase(name) {
  return String(name || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase()
}

function toCamelCase(name) {
  return String(name || '').replace(/-([a-zA-Z0-9])/g, (_, ch) => ch.toUpperCase())
}

function stripLineAndBlockComments(text) {
  return String(text || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function extractBlock(content, tagName) {
  if (!content) return ''
  const re = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'i')
  return String(content).match(re)?.[1] || ''
}

function findMatching(text, openIndex, openChar, closeChar) {
  let depth = 0
  let quote = null
  let escaped = false
  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i]
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === quote) {
        quote = null
      }
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      continue
    }
    if (ch === openChar) depth += 1
    if (ch === closeChar) {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

function splitTopLevel(text) {
  const parts = []
  let start = 0
  let depth = 0
  let quote = null
  let escaped = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === quote) {
        quote = null
      }
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      continue
    }
    if (ch === '{' || ch === '[' || ch === '(') depth += 1
    if (ch === '}' || ch === ']' || ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts.map((p) => p.trim()).filter(Boolean)
}

function extractDefinePropsCalls(scriptContent) {
  const script = String(scriptContent || '')
  const calls = []
  const re = /defineProps\b/g
  let match
  while ((match = re.exec(script)) !== null) {
    const paren = script.indexOf('(', match.index)
    if (paren < 0) continue
    const end = findMatching(script, paren, '(', ')')
    if (end < 0) continue
    const beforeParen = script.slice(match.index + 'defineProps'.length, paren)
    calls.push({
      start: match.index,
      end: end + 1,
      generic: beforeParen,
      args: script.slice(paren + 1, end).trim(),
    })
    re.lastIndex = end + 1
  }
  return calls
}

function parsePropObject(objectLiteral) {
  const props = []
  const trimmed = String(objectLiteral || '').trim()
  if (!trimmed.startsWith('{')) return props
  const end = findMatching(trimmed, 0, '{', '}')
  const body = stripLineAndBlockComments(trimmed.slice(1, end >= 0 ? end : -1))
  for (const part of splitTopLevel(body)) {
    if (!part || part.startsWith('...')) continue
    let name = null
    const quoted = part.match(/^(['"])([^'"]+)\1\s*:/)
    if (quoted) {
      name = quoted[2]
    } else {
      const keyed = part.match(/^([A-Za-z_$][\w$-]*)\s*:/)
      if (keyed) name = keyed[1]
    }
    if (!name) {
      const shorthand = part.match(/^([A-Za-z_$][\w$]*)$/)
      if (shorthand) name = shorthand[1]
    }
    if (!name) continue
    props.push({
      name,
      required: /\brequired\s*:\s*true\b/.test(part),
      source: 'object',
    })
  }
  return props
}

function parsePropArray(arrayLiteral) {
  const props = []
  const trimmed = String(arrayLiteral || '').trim()
  if (!trimmed.startsWith('[')) return props
  const end = findMatching(trimmed, 0, '[', ']')
  const body = trimmed.slice(1, end >= 0 ? end : -1)
  for (const m of body.matchAll(/(['"])([^'"]+)\1/g)) {
    props.push({ name: m[2], required: false, source: 'array' })
  }
  return props
}

function parsePropGeneric(genericText) {
  const props = []
  const generic = String(genericText || '').trim()
  const lt = generic.indexOf('<')
  if (lt < 0) return props
  const gt = generic.lastIndexOf('>')
  if (gt <= lt) return props
  const body = stripLineAndBlockComments(generic.slice(lt + 1, gt))
  for (const m of body.matchAll(/(?:^|[;,{\s])(['"]?)([A-Za-z_$][\w$-]*)\1(\?)?\s*:/g)) {
    props.push({ name: m[2], required: !m[3], source: 'generic' })
  }
  return props
}

function uniqueProps(props) {
  const map = new Map()
  for (const p of props) {
    if (!p?.name) continue
    const prev = map.get(p.name)
    map.set(p.name, {
      name: p.name,
      required: Boolean(prev?.required || p.required),
      source: prev?.source || p.source,
    })
  }
  return [...map.values()]
}

/**
 * 从子组件 <script setup> 提取 defineProps 中定义的 props。
 * @param {string} content 子组件 .vue 文件内容
 * @returns {Array<{name:string, required:boolean, source:string}>}
 */
export function extractDefinedProps(content = '') {
  if (!content) return []
  const scriptContent = extractBlock(content, 'script')
  if (!scriptContent) return []

  const props = []
  for (const call of extractDefinePropsCalls(scriptContent)) {
    if (call.args.startsWith('{')) props.push(...parsePropObject(call.args))
    else if (call.args.startsWith('[')) props.push(...parsePropArray(call.args))
    props.push(...parsePropGeneric(call.generic))
  }
  return uniqueProps(props)
}

/**
 * 从子组件 <script setup> 提取 required props 名称列表。
 *
 * 支持形态：
 * - defineProps({ foo: { type: String, required: true } })
 * - defineProps({ foo: { required: true, type: String } })
 * - const props = defineProps({ ... })
 * - defineProps<{ foo: string; bar?: string }>()
 *
 * @param {string} content 子组件 .vue 文件内容
 * @returns {string[]} required prop 名称列表
 */
export function extractRequiredProps(content = '') {
  return extractDefinedProps(content)
    .filter((p) => p.required)
    .map((p) => p.name)
}

function normalizeResourceOptions(options) {
  if (!options) return { resourceVarNames: [] }
  if (Array.isArray(options)) {
    if (options.every((x) => typeof x === 'string')) return { resourceVarNames: options }
    return { resourceDomMapping: options }
  }
  return options
}

function resolveResourceVarNameSet(options) {
  const opts = normalizeResourceOptions(options)
  const names = new Set()
  for (const n of opts.resourceVarNames || []) {
    if (n) names.add(String(n))
  }
  if (opts.resourceDomMapping) {
    for (const n of extractResourceVarNames(opts.resourceDomMapping)) {
      if (n) names.add(String(n))
    }
  }
  return names
}

function stripDefinePropsFromScript(scriptContent) {
  let script = String(scriptContent || '')
  const calls = extractDefinePropsCalls(script)
  for (let i = calls.length - 1; i >= 0; i -= 1) {
    const call = calls[i]
    script = script.slice(0, call.start) + script.slice(call.end)
  }
  return script
}

function isNameUsed(source, name) {
  if (!source || !name) return false
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`).test(source)
}

/**
 * 🎯 契约改写（P0/D 治本）：子组件本地 `import iconX from '...png'` → defineProps 资源 prop。
 *
 * 根因（env-monitor d2311f17 / 多会话 CODE-019 3×BLOCK 不收敛）：LLM 在子组件里既 `import icon1`
 * 自己用、又 `defineProps({ icon1: required })` 让父传 → 父子双份持有 → 父没传、子本地 import
 * 又和「契约」冲突 → CODE-019 反复触发、重试不收敛。
 *
 * 治本契约：**资源只在主组件 import 一次，子组件只通过 defineProps 接收、由父组件透传**。
 * 因此子组件里出现的资源 import 必须改写为 prop 声明：
 *   - 删除子组件 `<script setup>` 内的 `import bg1 from '...png'`（资源由父级持有）；
 *   - 若 `defineProps` 里已有同名 prop（无论 required 与否）→ 不动；
 *   - 若没有 → 注入 `icon1: { type: String, required: true }` 之类的资源 prop 声明；
 *   - 模板里对 `icon1` 的使用保持原样（父透传后运行时即有值）。
 *
 * 幂等：重复调用零副作用（已无本地 import 即跳过）。纯函数式改写，不依赖 LLM 遵守 prompt。
 *
 * @param {string} content 子组件 .vue 文件内容
 * @param {Array} resourceDomMapping 资源映射（识别哪些是「资源变量」）
 * @returns {{ content: string, changed: boolean, rewritten: string[] }}
 */
export function rewriteSubcomponentResourceImportsToProps(content = '', resourceDomMapping = []) {
  const result = { content, changed: false, rewritten: [] }
  if (typeof content !== 'string' || !content.includes('<script')) return result

  const { varToMapping } = buildVarToMapping(resourceDomMapping)
  if (varToMapping.size === 0) return result

  // 1) 找子组件 script 里「资源变量的本地 import」
  const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/i)
  if (!scriptMatch) return result
  const script = scriptMatch[1]
  const importRe =
    /^[ \t]*import\s+([A-Za-z_$][\w$]*)\s+from\s*['"][^'"]*['"][ \t]*;?[ \t]*$/gm
  const localResourceImports = []
  let im
  while ((im = importRe.exec(script)) !== null) {
    const name = im[1]
    if (varToMapping.has(name)) localResourceImports.push(name)
  }
  if (localResourceImports.length === 0) return result // 已是契约形态，无需改写

  // 2) 收集已有 defineProps 的 prop 名（避免重复声明）
  const definedProps = new Set(
    extractDefinedProps(content).map((p) => p.name),
  )

  // 3) 删除本地 import 行
  let newScript = script
  for (const name of localResourceImports) {
    const delRe = new RegExp(
      `^[ \\t]*import[ \\t]+${name}[ \\t]+from[ \\t]*['"][^'"]*['"][ \\t]*;?[ \\t]*$`,
      'gm',
    )
    newScript = newScript.replace(delRe, '')
  }
  newScript = newScript.replace(/\n{3,}/g, '\n\n')

  // 4) 把缺的 prop 注入 defineProps（对象形态）；没有 defineProps 则新增最小声明
  const toAdd = localResourceImports.filter((n) => !definedProps.has(n))
  if (toAdd.length > 0) {
    const newPropsSrc = toAdd
      .map((n) => `${n}: { type: String, required: true }`)
      .join(',\n  ')
    const dpCall = extractDefinePropsCalls(newScript)
    if (dpCall.length > 0) {
      const call = dpCall[0]
      const args = newScript.slice(call.start, call.end)
      if (call.args.trim().startsWith('{')) {
        // 在对象体首个 `{` 后插入
        const obIndex = newScript.indexOf('{', call.start)
        const insertAt = obIndex + 1
        const before = newScript.slice(0, insertAt)
        const after = newScript.slice(insertAt)
        const trailing = after.trimStart().startsWith('}') && after.trimStart().length > 1 ? '' : ','
        newScript =
          before + (before.endsWith('\n') ? '' : '\n  ') + newPropsSrc + (trailing ? ',' : '') + after
      }
    } else {
      // 无 defineProps：在 script 开头插入
      const head = newScript.match(/<script[^>]*>/i)?.[0] || '<script setup>'
      const headIdx = newScript.indexOf(head) + head.length
      newScript =
        newScript.slice(0, headIdx) +
        `\nconst props = defineProps({\n  ${newPropsSrc}\n})\n` +
        newScript.slice(headIdx)
    }
  }

  const newContent = content.replace(scriptMatch[1], newScript)
  result.content = newContent
  result.changed = newContent !== content
  result.rewritten = localResourceImports
  return result
}

/**
 * 提取子组件中“通过 defineProps 接收、且在模板/脚本实际使用”的资源 prop。
 *
 * 资源名事实源优先来自 resourceDomMapping（assignedVarName + semanticVarName）。若不传
 * resourceDomMapping，则不会凭 bgN/iconN/imgN 形态猜测，避免误杀同名业务 prop。
 *
 * @param {string} content 子组件 .vue 文件内容
 * @param {Object|Array} [options] { resourceDomMapping, resourceVarNames }
 * @returns {string[]}
 */
export function extractResourceProps(content = '', options = {}) {
  const resourceNames = resolveResourceVarNameSet(options)
  if (resourceNames.size === 0) return []
  const props = extractDefinedProps(content)
  if (props.length === 0) return []

  const template = extractBlock(content, 'template')
  const script = stripDefinePropsFromScript(extractBlock(content, 'script'))
  const style = extractBlock(content, 'style')
  const usageSource = `${template}\n${script}\n${style}`

  return props
    .map((p) => p.name)
    .filter((name) => resourceNames.has(name) && isNameUsed(usageSource, name))
}

function addAttrName(propNames, rawName) {
  const attrName = String(rawName || '').trim()
  if (!attrName) return
  if (attrName.startsWith('@') || attrName.startsWith('#')) return
  if (attrName.startsWith('v-') && !attrName.startsWith('v-bind:')) return
  let normalized = attrName
  if (normalized.startsWith(':')) normalized = normalized.slice(1)
  if (normalized.startsWith('v-bind:')) normalized = normalized.slice('v-bind:'.length)
  if (!normalized || NON_PROP_ATTRS.has(normalized)) return
  propNames.add(normalized)
}

function extractPropsFromAttrs(attrs = '') {
  const propNames = new Set()
  const text = String(attrs || '')

  // v-bind="props" / v-bind="{ bg2, icon1 }"：对象形态尽量解析 key，无法静态解析则 wildcard。
  for (const m of text.matchAll(/(?:^|\s)v-bind\s*=\s*(['"])([\s\S]*?)\1/g)) {
    const expr = String(m[2] || '').trim()
    if (expr.startsWith('{')) {
      for (const part of splitTopLevel(expr.slice(1, expr.endsWith('}') ? -1 : undefined))) {
        const key = part.match(/^(['"]?)([A-Za-z_$][\w$-]*)\1\s*(?::|$)/)?.[2]
        if (key) addAttrName(propNames, key)
      }
    } else {
      propNames.add('*')
    }
  }

  const attrPattern = /(?:^|\s)((?::|v-bind:)?[A-Za-z_$][\w$-]*)(?=\s*=|\s|$)/g
  let attrMatch
  while ((attrMatch = attrPattern.exec(text)) !== null) {
    addAttrName(propNames, attrMatch[1])
  }

  return propNames
}

/**
 * 从主组件 template 提取子组件调用及其传入的 props。
 *
 * 返回 Map<子组件名(kebab-case), Set<传入的 prop 名>>。
 * 多次调用同一子组件时取并集，保持旧 API 形态。
 *
 * @param {string} content 主组件 .vue 文件内容
 * @returns {Map<string, Set<string>>}
 */
export function extractComponentCalls(content = '') {
  const calls = new Map()
  if (!content) return calls

  const templateContent = extractBlock(content, 'template')
  if (!templateContent) return calls

  // 匹配所有组件标签（PascalCase 或 kebab-case）
  // 例如：<ChildComponent ...> 或 <child-component ...>
  // 支持自闭合 <ChildComponent /> 和成对标签 <ChildComponent>...</ChildComponent>
  const tagPattern = /<([A-Z][\w-]*|[\w]+-[\w-]+)([^>]*?)(?:\/?>)/g
  let tagMatch
  while ((tagMatch = tagPattern.exec(templateContent)) !== null) {
    const tagName = tagMatch[1]
    const attrs = tagMatch[2]
    const propNames = extractPropsFromAttrs(attrs)
    const normalizedName = toKebabCase(tagName)
    const prev = calls.get(normalizedName) || new Set()
    for (const p of propNames) prev.add(p)
    calls.set(normalizedName, prev)
  }

  return calls
}

function normalizeFiles(files = []) {
  if (Array.isArray(files)) return files
  if (files && typeof files === 'object') {
    return Object.entries(files).map(([path, content]) => ({ path, content }))
  }
  return []
}

function hasPassedProp(passedProps, propName) {
  if (!passedProps || !propName) return false
  if (passedProps.has('*')) return true
  const raw = String(propName)
  return passedProps.has(raw) || passedProps.has(toKebabCase(raw)) || passedProps.has(toCamelCase(raw))
}

function buildMissingIssue(mainComp, compName, propName, subcompPath, reason) {
  const reasonText = reason === 'resource'
    ? `资源 prop "${propName}"（子组件通过 defineProps 接收且在模板/脚本实际使用；资源变量必须由父组件显式传入或改为子组件本地 import，避免运行时 undefined）`
    : `required prop "${propName}"`
  return {
    id: 'CODE-019',
    severity: 'BLOCK',
    file: mainComp.path,
    message: `主组件调用子组件 <${compName}> 时未传入 ${reasonText}（子组件定义在 ${subcompPath || '未知'}）`,
  }
}

/**
 * 检测 props 接线缺失。
 *
 * @param {Array<{ path: string, content: string }>|Record<string,string>} files 生成的文件列表
 * @param {Object|Array} [options] { resourceDomMapping, resourceVarNames }
 * @returns {Array<{ id: string, severity: string, file: string, message: string }>}
 */
export function detectMissingPropsWiring(files = [], options = {}) {
  const issues = []
  const fileList = normalizeFiles(files)
  if (fileList.length === 0) return issues

  const opts = normalizeResourceOptions(options)

  // 1. 提取所有子组件的 required props / 实际使用的资源 props
  // Map<子组件文件名（不含扩展名，kebab-case）, { path, requiredProps, resourceProps }>
  const subcompProps = new Map()
  for (const f of fileList) {
    const path = String(f?.path || '')
    // 仅检查子组件（package/components/*.vue）
    if (!/components\/[^/]+\.vue$/.test(path)) continue
    if (!f?.content) continue

    const requiredProps = extractRequiredProps(f.content)
    const resourceProps = extractResourceProps(f.content, opts)
    if (requiredProps.length === 0 && resourceProps.length === 0) continue

    const fileName = path.split('/').pop().replace(/\.vue$/, '')
    const normalizedName = toKebabCase(fileName)
    subcompProps.set(normalizedName, {
      path,
      requiredProps,
      resourceProps,
    })
  }

  if (subcompProps.size === 0) return issues

  // 2. 找到主组件（package/index.vue）
  const mainComp = fileList.find((f) => /package\/index\.vue$/.test(String(f?.path || '')))
  if (!mainComp?.content) return issues

  // 3. 提取主组件中所有子组件调用
  const componentCalls = extractComponentCalls(mainComp.content)

  // 4. 检查每个子组件调用的 props 接线
  for (const [compName, propInfo] of subcompProps) {
    const calls = componentCalls.get(compName)
    if (!calls) {
      // 子组件定义了但主组件未调用 → 不报 props 缺失（可能是死代码，由其他规则覆盖）
      continue
    }

    const requiredSet = new Set(propInfo.requiredProps)
    for (const requiredProp of propInfo.requiredProps) {
      if (!hasPassedProp(calls, requiredProp)) {
        issues.push(buildMissingIssue(mainComp, compName, requiredProp, propInfo.path, 'required'))
      }
    }

    // 资源 prop 可以不是 required，但只要子组件实际使用，就必须由父级显式接线。
    for (const resourceProp of propInfo.resourceProps) {
      if (requiredSet.has(resourceProp)) continue
      if (!hasPassedProp(calls, resourceProp)) {
        issues.push(buildMissingIssue(mainComp, compName, resourceProp, propInfo.path, 'resource'))
      }
    }
  }

  return issues
}

// ──────────────────────────────────────────────
// ③ 治本（2026-09-09）：Props 接线确定性自愈（auto-heal）
// ──────────────────────────────────────────────
// 根因（c-device-monitor-pyb7ue1h / c-env-monitor-ggtch996-3dc0faa1 实锤）：
// LLM 在主组件写盘时经常漏给子组件传 props —— 资源 props（bg1/icon1/icon2 等，子组件
// defineProps 接收且实际使用）与 required props（chartData/activeTab 等）。CODE-019 检测
// 到即 BLOCK → 触发 L0-B 全量重写重试 → LLM 重写仍漏 → 3×BLOCK 空转不收敛。
//
// 治本：在写盘后处理链中确定性自动接线（与 injectResourceImports 同级的确定性修复，不依赖
// LLM 遵守 prompt）：
//   1. 子组件资源 props → 父组件 template 调用处补 `:name="name"`（资源变量父级 script
//      已有 import，注入后即闭合引用链，运行时不再 undefined）。
//   2. required props → 仅在父组件 script 中确实声明了同名变量时才补（不臆造数据源）；
//      父组件未声明的数据 props（如 chartData 由 API 异步注入）留给 LLM 在重试 prompt 指导中补。
//
// 幂等：只补缺失绑定，绝不删除/改写已有绑定；重复调用零副作用。

/**
 * 解析父组件 <script setup> 中「可接线」的变量集合。
 * 资源变量（bg1/icon1 等经 injectResourceImports 注入的 import）与 const/let/function 声明
 * 均可作为 `:name="name"` 的绑定源；父组件未声明的名称不注入（避免臆造数据源）。
 */
function resolveWirableNames(scriptContent) {
  const names = extractDeclaredNames(scriptContent)
  // defineProps 提取的 prop 名也视为可接线（父组件自身可通过 props 透传）
  return names
}

/**
 * 确定性自动接线：父组件调用子组件漏传的 props 若在父组件作用域可接线，则自动补
 * `:name="name"` 绑定。
 *
 * @param {Array<{ path: string, content: string }>|Record<string,string>} files 生成文件
 * @param {Object|Array} [options] { resourceDomMapping, resourceVarNames }
 * @returns {{ files: Record<string,string>, fixes: Array<{file:string, component:string, prop:string, reason:string}> }}
 */
export function autoWireSubComponentProps(files = [], options = {}) {
  const fixes = []
  const fileList = normalizeFiles(files)
  if (fileList.length === 0) return { files: {}, fixes }

  const opts = normalizeResourceOptions(options)
  // 🆕 Loop 1：契约模式。contracts = [{ file, blockIds, resourceProps, parentMustPass }]
  // 契约内的资源 prop 即使父组件当前未声明，也必须补父级 import + 接线（不臆造、但契约必达）。
  const contracts = Array.isArray(opts.contracts) ? opts.contracts : []
  const contractByFile = new Map()
  for (const c of contracts) {
    if (c && c.file) contractByFile.set(c.file, c)
  }

  // 🛡️ 治本（解 2026-09-10 CODE-019 死锁）：success 资源变量全集。
  // 微码契约规定「资源只归主组件持有、子组件 defineProps + 父透传」，因此子组件实际使用的
  // 资源 prop 必然是 success 资源变量之一。只要该 prop 在 mapping 中是成功资源变量，
  // 父级就必须 import + 接线（不臆造数据源，bg1 是真实下载成功的资源）。
  // 这与 Loop 1 契约归属无关——即便 fileSectionMap 精确归属未命中 bg1 所属 section，
  // 也不应让子组件运行时 undefined。fail-closed 安全：仅对真实 success 资源变量生效。
  const successResourceVars = new Set(
    (opts.resourceDomMapping || [])
      .filter((m) => m && m.downloadStatus === 'success')
      .map((m) => m.assignedVarName || m.semanticVarName)
      .filter(Boolean),
  )

  // 子组件 props 事实（与 detectMissingPropsWiring 同源）
  const subcompProps = new Map()
  for (const f of fileList) {
    const path = String(f?.path || '')
    if (!/components\/[^/]+\.vue$/.test(path)) continue
    if (!f?.content) continue
    const requiredProps = extractRequiredProps(f.content)
    const resourceProps = extractResourceProps(f.content, opts)
    if (requiredProps.length === 0 && resourceProps.length === 0) continue
    const fileName = path.split('/').pop().replace(/\.vue$/, '')
    const normalizedName = toKebabCase(fileName)
    subcompProps.set(normalizedName, { path, requiredProps, resourceProps })
  }
  if (subcompProps.size === 0) return { files: {}, fixes }

  const mainPath = fileList.find((f) => /package\/index\.vue$/.test(String(f?.path || '')))
  if (!mainPath?.content) return { files: {}, fixes }

  const filesOut = {}
  for (const f of fileList) filesOut[f.path] = f.content

  let mainContent = filesOut[mainPath.path]
  const scriptContent = extractBlock(mainContent, 'script')
  const wirable = resolveWirableNames(scriptContent)

  // 只处理「主组件确实调用了」的子组件
  const componentCalls = extractComponentCalls(mainContent)

  const doInject = (mainText, compTagName, propName) => {
    // 匹配主组件 template 中的任意开标签（含自闭合）：`<Tag ...>` / `<tag .../>`，
    // 仅当该标签的 kebab-case 归一化名等于 compTagName 时才处理（PascalCase / kebab 均可）。
    const tagRe = /<([A-Za-z][\w-]*)(?=[\s>])([^<>]*?)(\/?)>/g
    let tagMatch
    let mutated = false
    let lastIndex = 0
    let out = ''
    const propPattern = `(?:^|\\s)(?::|v-bind:)?${propName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?==|\\s|/)`
    while ((tagMatch = tagRe.exec(mainText)) !== null) {
      const tagName = tagMatch[1]
      if (toKebabCase(tagName) !== compTagName) continue
      const full = tagMatch[0]
      const attrs = tagMatch[2]
      // 若已显式传入该 prop（:name / v-bind:name / name= / name 均算）则跳过
      if (new RegExp(propPattern).test(attrs)) continue
      const close = full.endsWith('/>') ? '/>' : '>'
      const head = full.slice(0, full.length - close.length)
      const sep = head.endsWith(' ') ? '' : ' '
      out += mainText.slice(lastIndex, tagMatch.index) + head + sep
      out += `:${propName}="${propName}"` + close
      mutated = true
      lastIndex = tagMatch.index + full.length
    }
    out += mainText.slice(lastIndex)
    return { content: mutated ? out : mainText, mutated }
  }

  // 🆕 Loop 1 + 治本（2026-09-10）：契约内 resource prop 但父未声明 → 先注入父级 import
  // （走 injectResourceImports，用「仅该 var」的 mapping 子集），确保 :prop 有源。
  // 治本放宽：即便无契约（契约精确归属漏命中），只要 propName 是 success 资源变量（successResourceVars），
  // 也强制从 mapping 子集补父级 import——与「资源只归主组件持有」契约一致，且不臆造数据源。
  const ensureParentImport = (propName, contract) => {
    if (wirable.has(propName)) return true
    const isSuccessResource = successResourceVars.has(propName)
    if (!contract && !isSuccessResource) return false
    const mapping = (opts.resourceDomMapping || []).filter(
      (m) =>
        m &&
        m.downloadStatus === 'success' &&
        (m.assignedVarName === propName || m.semanticVarName === propName),
    )
    if (mapping.length === 0) return false
    const relBase = '../resources/images/'
    const before = mainContent
    // 用「仅该 var」的 contractMapping 精确强制注入（默认分支只注入代码里已用到的变量，
    // 而此处 propName 恰恰因父模板漏写而未出现 → 必须用契约模式指定 allowedNames）。
    const injected = injectResourceImports(before, mapping, relBase, null, {
      contractMapping: [{ file: mainPath.path, parentMustPass: [propName] }],
    })
    if (injected !== before) {
      mainContent = injected
      // 注入后 script 已含该 var → 更新 wirable
      const newScript = extractBlock(mainContent, 'script')
      for (const n of resolveWirableNames(newScript)) wirable.add(n)
    }
    return wirable.has(propName)
  }

  for (const [compName, propInfo] of subcompProps) {
    const calls = componentCalls.get(compName)
    if (!calls) continue
    const contract = contractByFile.get(propInfo.path) || null

    const requiredSet = new Set(propInfo.requiredProps)
    const missing = []

    // 资源 props：父级若已声明同名变量（资源 import 注入后必有）→ 可接线；
    // Loop 1 契约内资源 prop OR 该 prop 是真实 success 资源变量 → 父未声明也强制接线（先补 import）。
    // 治本（2026-09-10）：契约归属（fileSectionMap 精确命中）可能漏掉子组件使用的资源，
    // 导致「父模板未写 :bg1 → 父不 import bg1 → autoWire 补不上 → CODE-019」死锁。
    // 只要该资源是 success 资源变量，就强制保证父级持有（与「资源只归主组件持有」契约一致）。
    for (const rp of propInfo.resourceProps) {
      if (requiredSet.has(rp)) continue
      if (hasPassedProp(calls, rp)) continue
      const inContract = !!(contract && (contract.resourceProps || []).includes(rp))
      const force = inContract || successResourceVars.has(rp)
      if (wirable.has(rp) || force) missing.push({ prop: rp, reason: 'resource', force })
    }
    // required props：同样要求父级已声明同名变量才接线（不臆造 chartData/activeTab 数据源）
    for (const rp of propInfo.requiredProps) {
      if (hasPassedProp(calls, rp)) continue
      if (wirable.has(rp)) missing.push({ prop: rp, reason: 'required' })
    }
    if (missing.length === 0) continue

    for (const { prop, reason, force } of missing) {
      if (force) {
        if (!ensureParentImport(prop, contract)) continue
      }
      const { content, mutated } = doInject(mainContent, compName, prop)
      if (mutated) {
        mainContent = content
        fixes.push({ file: mainPath.path, component: compName, prop, reason })
      }
    }
  }

  if (fixes.length > 0) filesOut[mainPath.path] = mainContent
  return { files: fixes.length > 0 ? filesOut : {}, fixes }
}

// ──────────────────────────────────────────────
// P1-2：数据源声明检查（§6.3.1 第2点）
// ──────────────────────────────────────────────

/**
 * 🛡️ P1-2：从 <script setup> 内容提取所有声明的变量/标识符。
 *
 * 覆盖：const/let/var、function、import、defineProps prop 名、defineModel。
 * @param {string} scriptContent <script> 块内容
 * @returns {Set<string>}
 */
function extractDeclaredNames(scriptContent) {
  const names = new Set()
  const text = stripLineAndBlockComments(String(scriptContent || ''))

  // 1. const/let/var 简单声明：const x = ... | const x: Type = ...
  const declRe = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^;={}]*)?\s*[=;]/g
  for (const m of text.matchAll(declRe)) {
    names.add(m[1])
  }

  // 2. function 声明
  const funcRe = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g
  for (const m of text.matchAll(funcRe)) {
    names.add(m[1])
  }

  // 3. import 默认/通配符绑定：import X from / import * as X from
  const importRe = /(?:^|\n)\s*import\s+(?:\*\s+as\s+)?([A-Za-z_$][\w$]*)\s*from/gm
  for (const m of text.matchAll(importRe)) {
    names.add(m[1])
  }
  // import { x, y as z } from
  const importDestRe = /import\s+\{([^}]+)\}\s*from/g
  for (const m of text.matchAll(importDestRe)) {
    for (const part of splitTopLevel(m[1])) {
      const bare = part.replace(/\s+as\s+\w+$/, '').trim()
      if (bare) names.add(bare)
    }
  }

  // 4. defineProps prop 名（<script setup> 中 template 可直接使用）
  for (const call of extractDefinePropsCalls(text)) {
    if (call.args.startsWith('{')) {
      for (const p of parsePropObject(call.args)) names.add(p.name)
    } else if (call.args.startsWith('[')) {
      for (const p of parsePropArray(call.args)) names.add(p.name)
    }
    for (const p of parsePropGeneric(call.generic)) names.add(p.name)
  }

  // 5. defineModel 声明的 v-model 变量
  const modelRe = /defineModel\s*\(\s*['"]([^'"]+)['"]/g
  for (const m of text.matchAll(modelRe)) {
    names.add(m[1])
  }

  return names
}

/** 常见在 prop 绑定中用作绑定的字面量形态 */
const LITERAL_RE = /^(?:[0-9]+(?:\.[0-9]+)?|true|false|null|undefined|".*"|'.*'|`[^`]*`)$/

/**
 * 🛡️ P1-2：检测主组件 template 中 prop 绑定的数据源变量是否在 script 中声明。
 *
 * 场景：主组件 <ChildComponent :chartData="undeclaredVar" /> 而 undeclaredVar
 * 未在任何 const/let/var/function/import 中声明。这通常是拼写错误、遗漏声明、
 * 或数据源尚未定义的信号。
 *
 * @param {Array<{ path: string, content: string }>|Record<string,string>} files
 * @returns {Array<{ id: string, severity: string, file: string, message: string }>}
 */
export function detectUndefinedPropSources(files = []) {
  const issues = []
  const fileList = normalizeFiles(files)
  if (fileList.length === 0) return issues

  const mainComp = fileList.find((f) => /package\/index\.vue$/.test(String(f?.path || '')))
  if (!mainComp?.content) return issues

  const template = extractBlock(mainComp.content, 'template')
  if (!template) return issues

  const script = extractBlock(mainComp.content, 'script')
  const declaredNames = extractDeclaredNames(script)

  // 匹配所有 :propName="expression" 格式的 prop 绑定
  const bindRe = /:\s*([A-Za-z_$][\w$-]*)\s*=\s*"([^"]*)"/g
  let match
  while ((match = bindRe.exec(template)) !== null) {
    const propName = match[1]
    const expr = match[2].trim()
    if (!expr) continue

    // 跳过字面量
    if (LITERAL_RE.test(expr)) continue
    // 跳过对象/数组字面量（以 { 或 [ 起始的简单形态）
    if (/^\s*[\{\[]/.test(expr)) continue

    // 仅检查简单标识符引用（identifier 或 identifier.prop 结构）
    // 含运算符、函数调用、三目等复杂表达式不做声明检查（非笔误场景）
    const simpleRefRe = /^([A-Za-z_$][\w$]*)(?:\.[A-Za-z_$][\w$]*)*$/
    const refMatch = expr.match(simpleRefRe)
    if (!refMatch) continue

    const root = refMatch[1]
    // Vue 内置全局变量
    if (/^\$(?:props|emit|slots|attrs|refs|router|route|store|t|i18n)$/.test(root)) continue

    if (!declaredNames.has(root)) {
      issues.push({
        id: 'CODE-019',
        severity: 'WARNING',
        file: mainComp.path,
        message: `主组件 prop 绑定 \`:${propName}="${expr}"\` 引用了 script 中未声明的变量 "${root}"（可能是拼写错误、遗漏声明、或数据源尚未定义）`,
      })
    }
  }

  return issues
}

// ──────────────────────────────────────────────
// P1-2：optional chaining 兜底检测（§6.3.2）
// ──────────────────────────────────────────────

/** 常见的数组操作方法，当 prop 为 undefined 时调用会引发运行时错误 */
const ARRAY_ACCESS_METHODS = [
  'map', 'filter', 'forEach', 'reduce', 'reduceRight',
  'some', 'every', 'find', 'findIndex', 'findLast', 'findLastIndex',
  'includes', 'indexOf', 'flatMap', 'flat', 'sort',
]

/**
 * 🛡️ P1-2：检测子组件中 prop 的数组方法调用是否缺少 optional chaining 兜底。
 *
 * 场景：子组件 defineProps({ chartData: Array }) 后在 template/script 中直接
 * `chartData.map(...)` 而未用 `chartData?.map(...)`，当父组件未及时传入或数据
 * 异步加载时 chartData 为 undefined → 运行时崩溃。
 *
 * @param {Array<{ path: string, content: string }>|Record<string,string>} files
 * @returns {Array<{ id: string, severity: string, file: string, message: string }>}
 */
export function detectRiskyPropAccessPatterns(files = []) {
  const issues = []
  const fileList = normalizeFiles(files)
  if (fileList.length === 0) return issues

  for (const f of fileList) {
    const path = String(f?.path || '')
    if (!/components\/[^/]+\.vue$/.test(path)) continue
    if (!f?.content) continue

    const props = extractDefinedProps(f.content)
    const propNames = new Set(props.map((p) => p.name))
    if (propNames.size === 0) continue

    const template = extractBlock(f.content, 'template')
    const script = stripDefinePropsFromScript(extractBlock(f.content, 'script'))
    const text = `${template}\n${script}`

    for (const propName of propNames) {
      const escaped = String(propName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

      for (const method of ARRAY_ACCESS_METHODS) {
        // 查找 propName.method( 但没有前置 ?
        // 同时处理 props.propName.method( 和直接 propName.method(
        const re = new RegExp(`(?:\\b${escaped}\\.${method}|props\\.${escaped}\\.${method})\\s*\\(`, 'g')
        let methodMatch
        while ((methodMatch = re.exec(text)) !== null) {
          const pos = methodMatch.index
          // 检查前面是否有 ?（optional chaining 已存在）
          const preceding = pos > 0 ? text[pos - 1] : ''
          if (preceding === '?') continue

          const fullMatch = methodMatch[0]

          const matchText = fullMatch.replace(/\s+/g, ' ').slice(0, 60)
          issues.push({
            id: 'CODE-019',
            severity: 'WARNING',
            file: path,
            message: `子组件 prop "${propName}" 的 .${method}() 调用缺少 optional chaining 兜底（检测到 "${matchText}..."，建议改为 ${propName}?.${method}(...)），当 prop 值为 undefined 时会引发运行时错误`,
          })
        }
      }
    }
  }

  // 去重（同一文件同一 prop+method 可能多次匹配，去重）
  const seen = new Set()
  return issues.filter((i) => {
    const key = `${i.file}|${i.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
