/**
 * P1-A：Context Manifest 解析器 + 上下文注册表取件（纯函数，零业务依赖，便于单测）。
 *
 * 目标：把「每个分块重复携带大段固定规范 + 全量业务上下文」改为
 * 「按分块类型声明所需契约（required/optional/excluded），只注入必要内容」。
 *
 * 本模块只定义 schema、解析校验、默认 manifest 与按需取件，
 * 不直接组装具体 Prompt 正文（那是各分块 Prompt 构建器的职责）。
 */

// 支持的分块类型
export const MANIFEST_TARGETS = ['template', 'script', 'subcomponent', 'style', 'declare']

// 各分块类型允许引用的上下文 key（白名单，超出即视为未知 key）
export const TARGET_CONTEXT_KEYS = {
  template: ['layout-summary', 'text-resource-map', 'class-naming', 'subcomponent-boundary', 'event-names', 'panel-type', 'header-slots'],
  script: ['runtime-contract', 'template-contract', 'events', 'models', 'components', 'bindings', 'charts', 'requirement-business'],
  subcomponent: ['section-contract', 'props-emits', 'parent-import', 'resources', 'visual-mapping'],
  style: ['class-list', 'dom-tree', 'third-party-usage', 'element-style-map', 'theme-dimension', 'ant-table-dark'],
  declare: ['component-meta', 'events-decl', 'statuses-decl'],
}

// 全量合法上下文 key（excluded 中可引用的也须在其中）
export const CONTEXT_KEYS = [...new Set(Object.values(TARGET_CONTEXT_KEYS).flat().concat([
  'figma-raw-tree', 'less-naming', 'declare-schema', 'style-guide',
]))]

// 各分块类型的默认 manifest（约定俗成的最小集）
export const DEFAULT_MANIFESTS = {
  template: {
    target: 'template',
    required: ['layout-summary', 'text-resource-map', 'class-naming', 'subcomponent-boundary', 'event-names'],
    optional: ['panel-type', 'header-slots'],
    excluded: ['style-guide', 'less-naming', 'declare-schema', 'figma-raw-tree'],
  },
  script: {
    target: 'script',
    required: ['runtime-contract', 'template-contract', 'events', 'models', 'components', 'bindings'],
    optional: ['charts', 'requirement-business'],
    excluded: ['less-naming', 'declare-schema', 'style-guide', 'figma-raw-tree'],
  },
  subcomponent: {
    target: 'subcomponent',
    required: ['section-contract', 'props-emits', 'parent-import'],
    optional: ['resources', 'visual-mapping'],
    excluded: ['style-guide', 'less-naming', 'declare-schema', 'figma-raw-tree'],
  },
  style: {
    target: 'style',
    required: ['class-list', 'dom-tree', 'third-party-usage', 'element-style-map', 'theme-dimension'],
    optional: ['ant-table-dark'],
    excluded: ['figma-raw-tree', 'declare-schema', 'runtime-contract'],
  },
  declare: {
    target: 'declare',
    required: ['component-meta', 'events-decl', 'statuses-decl'],
    optional: [],
    excluded: ['style-guide', 'less-naming', 'figma-raw-tree'],
  },
}

function toArray(value) {
  if (Array.isArray(value)) return value
  if (value == null) return []
  return [value]
}

/**
 * 解析并规范化 manifest。
 * 宽松策略：未知 key 记 warning（不报错），required 与 excluded 冲突时 required 优先。
 *
 * @param {object} manifest - { target, required, optional, excluded }
 * @returns {{ valid: boolean, target: string|null, required: string[], optional: string[], excluded: string[], errors: string[], warnings: string[] }}
 */
export function parseManifest(manifest) {
  const errors = []
  const warnings = []
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, target: null, required: [], optional: [], excluded: [], errors: ['manifest 缺失或非对象'], warnings }
  }
  const target = manifest.target
  if (!MANIFEST_TARGETS.includes(target)) {
    errors.push(`未知分块类型: ${target}（支持 ${MANIFEST_TARGETS.join(' / ')}）`)
  }
  const allowed = target && TARGET_CONTEXT_KEYS[target] ? TARGET_CONTEXT_KEYS[target] : []
  const required = toArray(manifest.required)
  const optional = toArray(manifest.optional)
  const excluded = toArray(manifest.excluded)

  const checkKeys = (keys, label) => keys.forEach((key) => {
    if (typeof key !== 'string') {
      warnings.push(`${label} 含非字符串 key: ${JSON.stringify(key)}`)
      return
    }
    if (!CONTEXT_KEYS.includes(key)) {
      warnings.push(`${label} 含未知上下文 key: ${key}`)
    }
    if (target && allowed.length && !allowed.includes(key) && label !== 'excluded') {
      warnings.push(`key ${key} 不在分块 ${target} 的推荐白名单中`)
    }
  })
  checkKeys(required, 'required')
  checkKeys(optional, 'optional')
  checkKeys(excluded, 'excluded')

  // required 与 excluded 冲突：required 优先（剔除 excluded 中的冲突项）
  const excludedSet = new Set(excluded)
  required.forEach((key) => excludedSet.delete(key))

  return {
    valid: errors.length === 0,
    target,
    required: [...new Set(required)],
    optional: [...new Set(optional)],
    excluded: [...excludedSet],
    errors,
    warnings,
  }
}

/**
 * 返回某分块类型的默认 manifest。
 */
export function defaultManifestFor(target) {
  const def = DEFAULT_MANIFESTS[target]
  if (!def) return parseManifest({ target })
  return parseManifest({ ...def, required: [...def.required], optional: [...def.optional], excluded: [...def.excluded] })
}

/**
 * 按 manifest 从注册表取件。
 * includedKeys = required ∪ optional − excluded。
 *
 * @param {object} manifest - 已解析（或原始）的 manifest
 * @param {object} registry - { [key]: string | (() => string) }
 * @returns {{ sections: Array<{key: string, content: string}>, chars: number, includedKeys: string[], missingKeys: string[], excludedKeys: string[] }}
 */
export function selectContext(manifest, registry) {
  const parsed = manifest && manifest.required !== undefined && manifest.target ? parseManifest(manifest) : manifest
  const includedKeys = []
  const seen = new Set()
  for (const key of [...(parsed.required || []), ...(parsed.optional || [])]) {
    if (seen.has(key)) continue
    seen.add(key)
    if ((parsed.excluded || []).includes(key)) continue
    includedKeys.push(key)
  }

  const sections = []
  const missingKeys = []
  for (const key of includedKeys) {
    let content = registry[key]
    if (typeof content === 'function') content = content()
    if (content == null || content === '') {
      missingKeys.push(key)
      continue
    }
    sections.push({ key, content: String(content) })
  }

  const chars = sections.reduce((sum, s) => sum + s.content.length, 0)
  return { sections, chars, includedKeys, missingKeys, excludedKeys: [...(parsed.excluded || [])] }
}
