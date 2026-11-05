/**
 * Agent Builder 工具节点模板库
 * 每类模板 = 一个渲染函数：根据用户定义（name/inputs/outputs/params）生成完整代码。
 * 生成的代码写入 roles/custom/{name}.js，统一导出 DynamicAgent（简化动态 import）。
 * 安全边界：用户输入只进字段名/参数值，逻辑本体由模板写死；字段名强制 camelCase 白名单。
 */

/** 字段名校验：仅允许 a-z0-9_，不能以数字开头 */
export function sanitizeKey(key = '', fallback = 'value') {
  const k = String(key || '').trim().replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]+/, '')
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k) ? k : fallback
}

function buildHeader(def, hasLlm = false) {
  const { name, description } = def
  const skipLlm = hasLlm ? '' : 'skipLLM: true, // 纯确定性，无 LLM 依赖\n      '
  return `/**
 * ${def.label}（Agent Builder 自动生成，请勿手改）
 * 模板: ${def.templateId} | 创建: ${new Date().toISOString()}
 * 输入: ${def.inputs.map((i) => i.key).join(', ') || '(无)'}
 * 输出: ${def.outputs.map((o) => o.key).join(', ') || '(无)'}
 */

import { BaseAgent } from '../../agents/base-agent.js'
import { createLogger } from '../../logger/index.js'

const logger = createLogger({ name: '${name}' })

export class DynamicAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: '${name}',
      description: '${(description || '').replace(/'/g, "\\'")}',
      ${skipLlm}...config,
    })
  }

  async execute(params) {
    const onProgress = params.onProgress || null
    onProgress?.({
      stage: '${name}',
      message: '${def.label} 执行中...',
      status: 'running',
    })
    try {
      const result = await this._run(params)
      onProgress?.({ stage: '${name}', message: '✅ ${def.label} 完成', status: 'completed' })
      return result
    } catch (e) {
      logger.warn('${name} 执行失败（容错返回）: ' + e.message)
      onProgress?.({ stage: '${name}', message: '⚠️ ${def.label} 失败: ' + e.message, status: 'failed' })
      return { ${def.outputs.map((o) => `${o.key}: null`).join(', ') || 'ok: false'}, error: e.message }
    }
  }

  async _run(params) {
`
}

function buildFooter() {
  return `  }

  parseOutput(rawOutput) {
    return rawOutput
  }
}
`
}

/** 工具节点模板：解析 URL（含 fileKey/nodeId） */
export function renderUrlParser(def) {
  return buildHeader(def) + `    const { figmaUrl, onProgress } = params
    if (!figmaUrl) return { ${def.outputs.map((o) => `${o.key}: null`).join(', ')}, ok: false, error: '缺少 figmaUrl' }
    try {
      const u = new URL(figmaUrl)
      const m = u.pathname.match(/\\/(file|design)\\/([^/]+)/)
      const fileKey = m ? m[2] : null
      const raw = u.searchParams.get('node-id') || u.searchParams.get('nodeId') || ''
      const nodeId = raw ? decodeURIComponent(raw) : null
      return { fileKey, nodeId, cleanUrl: fileKey ? \`https://www.figma.com/file/\${fileKey}?node-id=\${encodeURIComponent(nodeId || '')}\` : null, ok: !!fileKey && !!nodeId }
    } catch (e) {
      return { ${def.outputs.map((o) => `${o.key}: null`).join(', ')}, ok: false, error: e.message }
    }
` + buildFooter()
}

/** 工具节点模板：字段映射（重命名/选择字段） */
export function renderFieldMapper(def) {
  const map = def.params?.map || {}
  return buildHeader(def) + `    const map = ${JSON.stringify(map)}
    const out = {}
    for (const [from, to] of Object.entries(map)) {
      out[to] = params[from]
    }
    return { mapped: out, ${def.outputs.map((o) => `${o.key}: out[${JSON.stringify(o.key)}] ?? null`).join(', ')} }
` + buildFooter()
}

/** 工具节点模板：JSON 转换（stringify/parse） */
export function renderJsonTransform(def) {
  const mode = def.params?.mode || 'stringify'
  return buildHeader(def) + `    const { ${def.inputs.map((i) => sanitizeKey(i.key)).join(', ')}, onProgress } = params
    const input = ${def.inputs.map((i) => sanitizeKey(i.key)).join(' ?? ') || 'null'}
    if (input == null) return { ${def.outputs.map((o) => `${o.key}: null`).join(', ')}, ok: false, error: '输入为空' }
    try {
      const value = ${mode === 'parse' ? 'JSON.parse(String(input))' : 'JSON.stringify(input, null, 2)'}
      return { ${def.outputs.map((o) => `${o.key}: value`).join(', ')}, ok: true }
    } catch (e) {
      return { ${def.outputs.map((o) => `${o.key}: null`).join(', ')}, ok: false, error: e.message }
    }
` + buildFooter()
}

/** 工具节点模板：校验器（必填字段 + 数值阈值） */
export function renderValidator(def) {
  const required = (def.params?.required || []).map((r) => `'${String(r).replace(/'/g, '')}'`)
  const minValue = def.params?.minValue
  const minField = def.params?.minField ? sanitizeKey(def.params.minField) : null
  return buildHeader(def) + `    const required = [${required.join(', ')}]
    const missing = required.filter((k) => params[k] == null || params[k] === '')
    const errors = []
    if (missing.length) errors.push('缺少必填字段: ' + missing.join(', '))
    ${minField && minValue != null ? `if (typeof params.${minField} === 'number' && params.${minField} < ${minValue}) errors.push('${minField} 低于阈值 ${minValue}')` : ''}
    const ok = errors.length === 0
    return { ok, valid: ok, errors, passed: ok, ${def.outputs.map((o) => `${o.key}: ok`).join(', ')} }
` + buildFooter()
}

/** 工具节点模板：聚合器（合并多路输入） */
export function renderAggregator(def) {
  const fields = def.inputs.map((i) => sanitizeKey(i.key))
  return buildHeader(def) + `    const items = []
    ${fields.map((f) => `if (params.${f} != null) items.push({ source: '${f}', value: params.${f} })`).join('\n    ')}
    const total = items.length
    return { items, total, ${def.outputs.map((o) => `${o.key}: items`).join(', ')} }
` + buildFooter()
}

/** 工具节点模板：路由器（按字段阈值决策，供 condition 边消费） */
export function renderRouter(def) {
  const field = sanitizeKey(def.params?.field || 'value', 'value')
  const threshold = def.params?.threshold ?? 0
  return buildHeader(def) + `    const v = params.${field}
    const _decision = typeof v === 'number' ? (v >= ${threshold} ? 'pass' : 'fail') : (v ? 'pass' : 'fail')
    return { _decision, decision: _decision, value: v, threshold: ${threshold} }
` + buildFooter()
}

/** 工具节点模板：格式化器（模板字符串输出，支持 {name} 与 {{name}} 两种占位符） */
export function renderFormatter(def) {
  const template = def.params?.template || '{{value}}'
  return buildHeader(def) + `    const tpl = ${JSON.stringify(template)}
    const filled = tpl.replace(/\\{?\\{\\s*(\\w+)\\s*\\}?\\}/g, (_, k) => params[k] != null ? String(params[k]) : '')
    return { ${def.outputs.map((o) => `${o.key}: filled`).join(', ')}, text: filled }
` + buildFooter()
}

/** 工具节点模板：透传（原样返回输入） */
export function renderPassthrough(def) {
  const build = def.inputs.map((i) => `${i.key}: params.${sanitizeKey(i.key)}`).join(',\n      ')
  return buildHeader(def) + `    return {
      ${build || 'ok: true'}
    }
` + buildFooter()
}

/** SSRF 防护 helpers（生成代码顶层函数：禁止请求本地/内网地址） */
function httpHelpers() {
  return `
function _blockedUrl(u) {
  try {
    const host = new URL(u).hostname
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') return true
    if (host.endsWith('.local') || host.endsWith('.internal')) return true
    if (/^(10|127)\\./.test(host) || /^192\\.168\\./.test(host) || /^172\\.(1[6-9]|2\\d|3[01])\\./.test(host)) return true
  } catch { return true }
  return false
}
`
}

/** 工具节点模板：读取本地文件/组件代码（仅限 workspace 路径，防任意读） */
export function renderFileRead(def) {
  const nullOut = def.outputs.map((o) => `${o.key}: null`).join(', ') || 'ok: false'
  return buildHeader(def) + `    const { filePath, sourcePath } = params
    const path = filePath || sourcePath
    if (!path) return { ${nullOut}, ok: false, error: '缺少 filePath/sourcePath' }
    if (!path.includes('/workspace/')) return { ${nullOut}, ok: false, error: '安全限制: 仅允许读取 workspace 下的组件文件' }
    try {
      const fs = await import('node:fs')
      const stat = fs.statSync(path)
      if (stat.size > 200 * 1024) return { ${nullOut}, ok: false, error: '文件超过 200KB，请直接指定子文件' }
      const content = fs.readFileSync(path, 'utf-8')
      const name = path.split('/').pop() || ''
      const out = { content, name, size: stat.size, ok: true }
      return { ${def.outputs.map((o) => `${o.key}: out[${JSON.stringify(o.key)}]`).join(', ')} }
    } catch (e) {
      return { ${nullOut}, ok: false, error: '读取失败: ' + e.message }
    }
` + buildFooter()
}

/** 工具节点模板：写入文件（生成代码/文档落盘，仅限 workspace 路径，自动建目录） */
export function renderTextWriter(def) {
  const nullOut = def.outputs.map((o) => `${o.key}: null`).join(', ') || 'ok: false'
  return buildHeader(def) + `    const { filePath, content = '', outputPath } = params
    const target = filePath || outputPath
    if (!target) return { ${nullOut}, ok: false, error: '缺少 filePath/outputPath' }
    if (!target.includes('/workspace/')) return { ${nullOut}, ok: false, error: '安全限制: 仅允许写入 workspace 下的文件' }
    try {
      const fs = await import('node:fs')
      const path = await import('node:path')
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, String(content), 'utf-8')
      const out = { written: true, size: String(content).length, path: target, ok: true }
      return { ${def.outputs.map((o) => `${o.key}: out[${JSON.stringify(o.key)}]`).join(', ')} }
    } catch (e) {
      return { ${nullOut}, ok: false, error: '写入失败: ' + e.message }
    }
` + buildFooter()
}

/** 工具节点模板：通用 HTTP 请求（调第三方 API，SSRF 防护 + 超时 + JSON 解析） */
export function renderHttpRequest(def) {
  const mapOut = (expr) =>
    def.outputs.map((o) => `${o.key}: ${expr}[${JSON.stringify(o.key)}]`).join(', ') || 'ok: false'
  return buildHeader(def) + `    const { url, method = 'GET', headers = {}, body, timeout = 10000 } = params
    if (!url) return { ${def.outputs.map((o) => `${o.key}: null`).join(', ') || 'ok: false'}, ok: false, error: '缺少 url' }
    if (_blockedUrl(url)) return { ${def.outputs.map((o) => `${o.key}: null`).join(', ') || 'ok: false'}, ok: false, error: 'SSRF 防护: 禁止请求本地/内网地址' }
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), Number(timeout) || 10000)
    try {
      const m = String(method || 'GET').toUpperCase()
      const hdrs = typeof headers === 'string' ? (JSON.parse(headers) || {}) : (headers || {})
      const res = await fetch(url, {
        method: m,
        headers: hdrs,
        body: body != null && m !== 'GET' && m !== 'HEAD' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
        signal: ctrl.signal,
      })
      const text = await res.text()
      let data = text
      try { data = JSON.parse(text) } catch { /* 非 JSON 保留原文 */ }
      const out = { status: res.status, ok: res.ok, data, headers: Object.fromEntries(res.headers.entries()) }
      return { ${def.outputs.map((o) => `${o.key}: out[${JSON.stringify(o.key)}]`).join(', ')} }
    } catch (e) {
      return { ${def.outputs.map((o) => `${o.key}: null`).join(', ') || 'ok: false'}, ok: false, error: '请求失败: ' + e.message }
    } finally {
      clearTimeout(timer)
    }
` + httpHelpers() + buildFooter()
}

/** 工具节点模板：Excel 解析（本地 xlsx/xls → 行数据 + 工作表清单） */
export function renderExcelParse(def) {
  const nullOut = def.outputs.map((o) => `${o.key}: null`).join(', ') || 'ok: false'
  return buildHeader(def) + `    const { filePath } = params
    if (!filePath) return { ${nullOut}, ok: false, error: '缺少 filePath（服务器本地文件路径）' }
    try {
      const mod = await import('xlsx')
      const XLSX = mod.default && mod.default.readFile ? mod.default : mod
      const wb = XLSX.readFile(filePath)
      const sheetNames = wb.SheetNames
      const first = sheetNames[0] || ''
      const rows = first ? XLSX.utils.sheet_to_json(wb.Sheets[first], { defval: '' }) : []
      const out = { rows, sheetNames, sheetCount: sheetNames.length, ok: true }
      return { ${def.outputs.map((o) => `${o.key}: out[${JSON.stringify(o.key)}]`).join(', ')} }
    } catch (e) {
      return { ${nullOut}, ok: false, error: '解析失败: ' + e.message }
    }
` + buildFooter()
}

/** 工具节点模板：网络文档抓取（URL → 去 HTML 标签的文本，供 AI 节点参考） */
export function renderWebFetch(def) {
  const mapOut = (expr) =>
    def.outputs.map((o) => `${o.key}: ${expr}[${JSON.stringify(o.key)}]`).join(', ') || 'ok: false'
  return buildHeader(def) + `    const { url, maxLength = 20000 } = params
    if (!url) return { ${def.outputs.map((o) => `${o.key}: null`).join(', ') || 'ok: false'}, ok: false, error: '缺少 url' }
    if (_blockedUrl(url)) return { ${def.outputs.map((o) => `${o.key}: null`).join(', ') || 'ok: false'}, ok: false, error: 'SSRF 防护: 禁止请求本地/内网地址' }
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'mvgo-web-fetch/1.0' },
      })
      if (!res.ok) return { ${def.outputs.map((o) => `${o.key}: null`).join(', ') || 'ok: false'}, ok: false, error: 'HTTP ' + res.status }
      const html = await res.text()
      const title = (html.match(/<title[^>]*>([^<]*)<\\/title>/i) || [])[1] || ''
      const text = html
        .replace(/<script[\\s\\S]*?<\\/script>/gi, ' ')
        .replace(/<style[\\s\\S]*?<\\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
        .replace(/\\s+/g, ' ').trim()
      const out = { title, text: text.slice(0, Number(maxLength) || 20000), url, ok: true, status: res.status }
      return { ${def.outputs.map((o) => `${o.key}: out[${JSON.stringify(o.key)}]`).join(', ')} }
    } catch (e) {
      return { ${def.outputs.map((o) => `${o.key}: null`).join(', ') || 'ok: false'}, ok: false, error: '抓取失败: ' + e.message }
    }
` + httpHelpers() + buildFooter()
}

// ============================================================
// P1-1 特定工具模板（管线2 基建节点：init / figma-fetch / screenshot / complete / l0b-fail / do-not-invent）
// ============================================================

/** 基建模板：init 初始化（准备 state：组件名/目标/面板/输出路径） */
export function renderInit(def) {
  return buildHeader(def) + `    const componentName = params.componentName || params.name || ('dyn-' + Date.now())
    const target = params.target || 'microcode'
    const panelType = params.panelType || 'default-panel'
    const outputPath = params.outputPath || null
    const initResult = { componentName, target, panelType, timestamp: Date.now(), mode: 'generate' }
    return { componentName, target, panelType, outputPath, initResult }
` + buildFooter()
}

/** 基建模板：figma-fetch 数据取数（调 Figma API 拿节点数据，无 token 优雅降级） */
export function renderFigmaFetch(def) {
  return buildHeader(def) + `    const { fileKey, nodeId, figmaUrl, figmaToken, onProgress } = params
    let fk = fileKey
    let nid = nodeId
    if (!fk && figmaUrl) {
      try {
        const u = new URL(figmaUrl)
        const m = u.pathname.match(/\\/(file|design)\\/([^/]+)/)
        if (m) fk = m[2]
        const raw = u.searchParams.get('node-id') || u.searchParams.get('nodeId') || ''
        if (raw) nid = decodeURIComponent(raw)
      } catch (e) { /* ignore */ }
    }
    if (!fk || !nid) return { fetchResult: { ok: false, error: '缺少 fileKey/nodeId' }, fileKey: null, nodeId: null }
    const token = figmaToken || process.env.FIGMA_ACCESS_TOKEN || process.env.FIGMA_TOKEN || ''
    if (!token) return { fetchResult: { ok: false, error: '缺少 Figma token（参数 figmaToken 或环境变量）' }, fileKey: fk, nodeId: nid }
    try {
      const url = 'https://api.figma.com/v1/files/' + encodeURIComponent(fk) + '/nodes?ids=' + encodeURIComponent(nid)
      const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } })
      if (!res.ok) return { fetchResult: { ok: false, error: 'Figma API HTTP ' + res.status }, fileKey: fk, nodeId: nid }
      const data = await res.json()
      const nodes = (data && data.nodes) || {}
      return { fetchResult: { ok: true, nodeCount: Object.keys(nodes).length }, figmaNodeData: data, fileKey: fk, nodeId: nid }
    } catch (e) {
      return { fetchResult: { ok: false, error: e.message }, fileKey: fk, nodeId: nid }
    }
` + buildFooter()
}

/** 基建模板：screenshot 截图渲染（复用系统 screenshot-renderer） */
export function renderScreenshotTpl(def) {
  return buildHeader(def) + `    const { componentName, outputPath, target, onProgress } = params
    if (!componentName) return { screenshotResult: { skipped: true, reason: '缺少 componentName' }, screenshotPath: null }
    try {
      const { renderScreenshot } = await import('../screenshot-renderer.js')
      const result = await renderScreenshot({
        componentName,
        sessionId: params.sessionId || ('dyn-' + Date.now()),
        groupId: params.groupId || 'custom',
        target: target || 'microcode',
        outputPath,
      })
      return { screenshotResult: result || {}, screenshotPath: (result && result.screenshotPath) || null }
    } catch (e) {
      return { screenshotResult: { skipped: true, error: e.message }, screenshotPath: null }
    }
` + buildFooter()
}

/** 基建模板：complete 产物发布（复制 package 到目标 workspace） */
export function renderComplete(def) {
  return buildHeader(def) + `    const { outputPath, componentName, onProgress } = params
    if (!outputPath) return { finalizeResult: { ok: false, error: '缺少 outputPath' }, publishedPath: null }
    try {
      const fs = await import('node:fs')
      const path = await import('node:path')
      const src = path.join(outputPath, 'package')
      if (!fs.existsSync(src)) return { finalizeResult: { ok: false, error: '产物 package 目录不存在: ' + src }, publishedPath: null }
      const destRoot = params.targetWorkspace || path.join(outputPath, '..', '..', 'workspace')
      const dest = path.join(destRoot, componentName || ('comp-' + Date.now()))
      fs.cpSync(src, dest, { recursive: true })
      return { finalizeResult: { ok: true, publishedPath: dest }, publishedPath: dest }
    } catch (e) {
      return { finalizeResult: { ok: false, error: e.message }, publishedPath: null }
    }
` + buildFooter()
}

/** 基建模板：l0b-fail 失败阻断（fail-closed，自定义头部无容错——失败必须抛错） */
export function renderL0bFail(def) {
  const { name, description } = def
  return `/**
 * ${def.label}（Agent Builder 自动生成，请勿手改）
 * 模板: ${def.templateId} | 创建: ${new Date().toISOString()}
 * fail-closed：校验不通过时抛错阻断管线，禁止发布坏产物。
 */

import { BaseAgent } from '../../agents/base-agent.js'
import { createLogger } from '../../logger/index.js'

const logger = createLogger({ name: '${name}' })

export class DynamicAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: '${name}',
      description: '${(description || '').replace(/'/g, "\\'")}',
      skipLLM: true,
      ...config,
    })
  }

  async execute(params) {
    const onProgress = params.onProgress || null
    const check = params.checkResult || params.check || {}
    const failed =
      check.pass === false ||
      check.ok === false ||
      check.valid === false ||
      (check.blockCount || 0) > 0
    onProgress?.({
      stage: '${name}',
      message: failed ? '❌ 校验未通过，阻断发布（fail-closed）' : '✅ 校验通过',
      status: failed ? 'failed' : 'completed',
    })
    if (failed) {
      const raw = check.errors || check.issues || []
      const detail = raw.slice(0, 5).map((e) => (typeof e === 'string' ? e : (e.message || JSON.stringify(e)))).join('; ')
      logger.warn('L0 校验未通过，阻断发布: ' + detail)
      throw new Error('L0 校验未通过，已阻断发布: ' + (detail || '未知原因'))
    }
    return { gate: 'passed', blockCount: 0, checkResult: check }
  }

  parseOutput(rawOutput) {
    return rawOutput
  }
}
`
}

/** 基建模板：do-not-invent 臆造检查（生成内容 vs 设计稿元素清单对照） */
export function renderDoNotInvent(def) {
  return buildHeader(def) + `    const contentField = params.contentField || 'content'
    const knownField = params.knownItemsField || 'knownItems'
    const content = params[contentField]
    const knownRaw = params[knownField]
    if (!content || !knownRaw) return { doNotInventResult: { skipped: true, reason: '缺少内容或已知元素清单' }, ok: true, inventedItems: [] }
    try {
      const known = Array.isArray(knownRaw) ? knownRaw : (typeof knownRaw === 'string' ? JSON.parse(knownRaw) : [])
      const knownItems = known.map((k) => String(k).trim()).filter(Boolean)
      if (knownItems.length === 0) return { doNotInventResult: { ok: true, skipped: true, reason: '已知清单为空' }, ok: true, inventedItems: [] }
      const contentStr = typeof content === 'string' ? content : JSON.stringify(content)
      // 提取标识符（中文词组/英文单词），过滤高频虚词（含/包含/和/的/与… 作为子串命中即过滤）
      const STOP_WORDS = ['含', '包含', '包括', '以及', '和', '的', '与', '或', '及', '有', '为', '对', '在', '个', '一个', '组件', '内容']
      const tokens = (contentStr.match(/[\\u4e00-\\u9fa5]{2,}|[a-zA-Z_][a-zA-Z0-9_]{2,}/g) || [])
        .filter((t) => !STOP_WORDS.some((s) => t.includes(s)))
      // 子串匹配：known 元素是 token 的子串（或反之）即视为已知，避免句子片段误报
      const invented = [...new Set(tokens)].filter(
        (t) => !knownItems.some((k) => t.includes(k) || k.includes(t)),
      )
      return { doNotInventResult: { ok: invented.length === 0, inventedCount: invented.length }, ok: invented.length === 0, inventedItems: invented.slice(0, 20) }
    } catch (e) {
      return { doNotInventResult: { ok: true, skipped: true, error: e.message }, ok: true, inventedItems: [] }
    }
` + buildFooter()
}

/**
 * 资源清单（前端"新建节点"展示该类型需要准备什么）
 * inputs/outputs: 建议字段（optional 表示可留空，required 表示至少填一个）
 * params: 模板参数说明 [{ key, label, type, required, desc, example }]
 * requires: { model: bool, prompt: bool }
 */
function resources(def) {
  return {
    inputs: def.inputs || [],
    outputs: def.outputs || [],
    params: def.params || [],
    requires: { model: false, prompt: false },
  }
}

/** 基建模板：code-structure 代码结构校验（内置 L0-B 基础规则：scoped less / @import / c- 前缀） */
export function renderCodeStructure(def) {
  return buildHeader(def) + `    const { code, classPrefix, onProgress } = params
    if (!code) return { validationResult: { pass: false, blockCount: 1, errors: [{ message: '缺少 code（组件代码）' }] }, pass: false, blockCount: 1, errors: [{ message: '缺少 code' }] }
    const errors = []
    // 规则1: <style lang="less" scoped>（主组件/有 style 块的子组件）
    if (/<style[^>]*>/i.test(code)) {
      if (!/<style[^>]*lang=["']less["'][^>]*scoped/i.test(code) && !/<style[^>]*scoped[^>]*lang=["']less["']/i.test(code)) {
        errors.push({ message: 'CODE-001: style 块必须为 <style lang="less" scoped>' })
      }
    }
    // 规则2: @import index.less
    if (/<style/i.test(code) && (!/@import/.test(code) || !/index\\.less/.test(code))) {
      errors.push({ message: 'CODE-002: style 块必须 @import ...index.less' })
    }
    // 规则3: class 前缀 c-（classPrefix 参数可指定）
    const prefix = classPrefix || 'c-'
    const classes = code.match(/class=["'][^"']+["']/g) || []
    const badClasses = classes
      .map((c) => c.replace(/class=["']/, '').replace(/["']$/, '').split(/\\s+/).filter(Boolean))
      .flat()
      .filter((cls) => cls.startsWith('c-') && prefix !== 'c-' ? !cls.startsWith(prefix) : false)
      .slice(0, 5)
    if (prefix !== 'c-' && badClasses.length > 0) {
      errors.push({ message: 'CODE-003: 类名必须以 ' + prefix + ' 为前缀: ' + badClasses.join(', ') })
    }
    const pass = errors.length === 0
    return { validationResult: { pass, blockCount: errors.length, errors }, pass, blockCount: errors.length, errors }
` + buildFooter()
}

/** 基建模板：generate-runtime-verify 运行时验证（产物存在性/非空检查） */
export function renderRuntimeVerify(def) {
  return buildHeader(def) + `    const { outputPath, files, onProgress } = params
    const errors = []
    try {
      const fs = await import('node:fs')
      const path = await import('node:path')
      const pkgDir = outputPath ? path.join(outputPath, 'package') : null
      if (pkgDir && !fs.existsSync(pkgDir)) errors.push('产物 package 目录不存在: ' + pkgDir)
      const checkList = Array.isArray(files) && files.length > 0 ? files : (pkgDir ? ['index.vue'] : [])
      for (const f of checkList) {
        const fp = pkgDir ? path.join(pkgDir, f) : f
        try {
          const st = fs.statSync(fp)
          if (st.size === 0) errors.push('产物为空文件: ' + f)
        } catch {
          if (pkgDir) errors.push('缺少产物文件: ' + f)
        }
      }
    } catch (e) {
      errors.push('运行时验证失败: ' + e.message)
    }
    const pass = errors.length === 0
    return { runtimeVerifyResult: { pass, errors }, pass, errors, valid: pass }
` + buildFooter()
}

/** 工具模板注册表（每个模板含 resources 资源清单） */
export const TOOL_TEMPLATES = {
  'url-parser': {
    id: 'url-parser', label: 'URL 解析',
    description: '解析链接提取 fileKey/nodeId 等参数',
    render: renderUrlParser,
    resources: resources({
      inputs: [{ key: 'figmaUrl', type: 'string', required: true, desc: 'Figma 链接' }],
      outputs: [{ key: 'fileKey', type: 'string' }, { key: 'nodeId', type: 'string' }, { key: 'cleanUrl', type: 'string' }],
      params: [],
    }),
  },
  'field-mapper': {
    id: 'field-mapper', label: '字段映射',
    description: '字段重命名/选择，输出 mapped 对象',
    render: renderFieldMapper,
    resources: resources({
      inputs: [{ key: '任意上游字段', type: 'any', required: false, desc: '被映射的源字段' }],
      outputs: [{ key: 'mapped', type: 'object' }],
      params: [{ key: 'map', label: '映射表 map', type: 'object', required: true, desc: '{"源字段":"目标字段"}', example: '{"title":"name"}' }],
    }),
  },
  'json-transform': {
    id: 'json-transform', label: 'JSON 转换',
    description: 'JSON stringify / parse',
    render: renderJsonTransform,
    resources: resources({
      inputs: [{ key: 'data', type: 'any', required: true, desc: '要转换的 JSON/字符串' }],
      outputs: [{ key: 'value', type: 'any' }, { key: 'ok', type: 'boolean' }],
      params: [{ key: 'mode', label: '模式', type: 'string', required: false, desc: 'stringify（默认）| parse', example: 'stringify' }],
    }),
  },
  'validator': {
    id: 'validator', label: '校验器',
    description: '必填字段 + 数值阈值校验，输出 ok/errors',
    render: renderValidator,
    resources: resources({
      inputs: [{ key: '待校验字段', type: 'any', required: false, desc: '被校验的上游输出' }],
      outputs: [{ key: 'ok', type: 'boolean' }, { key: 'errors', type: 'array' }],
      params: [
        { key: 'required', label: '必填字段', type: 'array', required: false, desc: '必须存在的字段名列表', example: '["score"]' },
        { key: 'minValue', label: '最小阈值', type: 'number', required: false, desc: '数值下限' },
        { key: 'minField', label: '阈值字段', type: 'string', required: false, desc: '被比较的数值字段', example: 'score' },
      ],
    }),
  },
  'aggregator': {
    id: 'aggregator', label: '聚合器',
    description: '合并多路输入为 items 数组',
    render: renderAggregator,
    resources: resources({
      inputs: [{ key: '多路字段（每个输入一路）', type: 'any', required: false, desc: '每个输入字段合入 items' }],
      outputs: [{ key: 'items', type: 'array' }, { key: 'total', type: 'number' }],
      params: [],
    }),
  },
  'router': {
    id: 'router', label: '路由器',
    description: '按字段阈值决策，输出 _decision 供条件边',
    render: renderRouter,
    resources: resources({
      inputs: [{ key: '决策字段', type: 'number|any', required: true, desc: '用于比较的字段' }],
      outputs: [{ key: '_decision', type: 'string' }, { key: 'decision', type: 'string' }],
      params: [
        { key: 'field', label: '决策字段', type: 'string', required: true, desc: '比较的输入字段名', example: 'score' },
        { key: 'threshold', label: '阈值', type: 'number', required: false, desc: '>= 阈值 → pass，否则 fail' },
      ],
    }),
  },
  'formatter': {
    id: 'formatter', label: '格式化器',
    description: '模板字符串填充输出',
    render: renderFormatter,
    resources: resources({
      inputs: [{ key: '模板变量字段', type: 'any', required: false, desc: '被 {name} 占位符引用的字段' }],
      outputs: [{ key: 'text', type: 'string' }],
      params: [{ key: 'template', label: '模板', type: 'string', required: true, desc: '含 {field} 或 {{field}} 占位符', example: '组件 {name} 共 {count} 个' }],
    }),
  },
  'passthrough': {
    id: 'passthrough', label: '透传',
    description: '输入原样返回',
    render: renderPassthrough,
    resources: resources({
      inputs: [{ key: '任意字段', type: 'any', required: false, desc: '原样透传的字段' }],
      outputs: [{ key: '同输入字段', type: 'any' }],
      params: [],
    }),
  },
  'http-request': {
    id: 'http-request', label: 'HTTP 请求',
    description: '通用调第三方 API：url/method/headers/body → status/data（SSRF 防护+超时+JSON 解析）',
    render: renderHttpRequest,
    resources: resources({
      inputs: [
        { key: 'url', type: 'string', required: true, desc: '请求地址（http/https，禁止本地/内网）' },
        { key: 'method', type: 'string', required: false, desc: 'GET/POST/PUT/DELETE，默认 GET' },
        { key: 'headers', type: 'object', required: false, desc: '请求头（JSON 对象，如 {"Authorization":"Bearer x"}）' },
        { key: 'body', type: 'any', required: false, desc: '请求体（非 GET 时 JSON 自动序列化）' },
      ],
      outputs: [{ key: 'status', type: 'number' }, { key: 'data', type: 'any' }, { key: 'ok', type: 'boolean' }, { key: 'headers', type: 'object' }],
      params: [{ key: 'timeout', label: '超时(ms)', type: 'number', required: false, desc: '默认 10000' }],
    }),
  },
  'web-fetch': {
    id: 'web-fetch', label: '网络文档抓取',
    description: 'URL → 去 HTML 标签的纯文本，供 AI 节点做参考（SSRF 防护+截断）',
    render: renderWebFetch,
    resources: resources({
      inputs: [{ key: 'url', type: 'string', required: true, desc: '网页地址（http/https，禁止本地/内网）' }],
      outputs: [{ key: 'text', type: 'string' }, { key: 'title', type: 'string' }, { key: 'url', type: 'string' }, { key: 'ok', type: 'boolean' }],
      params: [{ key: 'maxLength', label: '截断长度', type: 'number', required: false, desc: '默认 20000 字符' }],
    }),
  },
  'excel-parse': {
    id: 'excel-parse', label: 'Excel 解析',
    description: '解析本地 xlsx/xls 文件 → 行数据数组 + 工作表清单（用户反馈新增）',
    render: renderExcelParse,
    resources: resources({
      inputs: [{ key: 'filePath', type: 'string', required: true, desc: '服务器本地 xlsx/xls 文件路径' }],
      outputs: [{ key: 'rows', type: 'array' }, { key: 'sheetNames', type: 'array' }, { key: 'sheetCount', type: 'number' }, { key: 'ok', type: 'boolean' }],
      params: [],
    }),
  },
  'file-read': {
    id: 'file-read', label: '读取文件',
    description: '读取本地组件/代码文件内容（仅限 workspace 路径，≤200KB）',
    render: renderFileRead,
    resources: resources({
      inputs: [{ key: 'filePath', type: 'string', required: true, desc: '组件文件绝对路径（须含 /workspace/）' }],
      outputs: [{ key: 'content', type: 'string' }, { key: 'name', type: 'string' }, { key: 'size', type: 'number' }, { key: 'ok', type: 'boolean' }],
      params: [],
    }),
  },
  'text-writer': {
    id: 'text-writer', label: '写入文件',
    description: '把生成内容写为文件（代码/文档落盘，仅限 workspace 路径，自动建目录）',
    render: renderTextWriter,
    resources: resources({
      inputs: [
        { key: 'filePath', type: 'string', required: true, desc: '目标文件绝对路径（须含 /workspace/）' },
        { key: 'content', type: 'string', required: true, desc: '要写入的内容' },
      ],
      outputs: [{ key: 'written', type: 'boolean' }, { key: 'path', type: 'string' }, { key: 'size', type: 'number' }, { key: 'ok', type: 'boolean' }],
      params: [],
    }),
  },
  // ── P1-1 特定基建模板（对应 phase2 真实节点）──
  'init': {
    id: 'init', label: '初始化（管线起点）',
    description: '准备运行状态：组件名/目标/面板/输出路径（对应 phase2 init）',
    render: renderInit,
    resources: resources({
      inputs: [{ key: 'figmaUrl', type: 'string', required: false, desc: '可从中提取 fileKey/nodeId（可选）' }, { key: 'componentName', type: 'string', required: false, desc: '组件名（不填自动生成）' }],
      outputs: [{ key: 'componentName', type: 'string' }, { key: 'target', type: 'string' }, { key: 'panelType', type: 'string' }, { key: 'initResult', type: 'object' }],
      params: [{ key: 'target', label: '目标类型', type: 'string', required: false, desc: 'microcode（默认）| vue3', example: 'microcode' }, { key: 'panelType', label: '面板类型', type: 'string', required: false, desc: 'base-panel 类型' }],
    }),
  },
  'figma-fetch': {
    id: 'figma-fetch', label: 'Figma 数据取数',
    description: '调 Figma API 获取节点数据（对应 phase2 figma-connector）',
    render: renderFigmaFetch,
    resources: resources({
      inputs: [{ key: 'fileKey', type: 'string', required: false, desc: 'Figma 文件 key' }, { key: 'nodeId', type: 'string', required: false, desc: '节点 id' }, { key: 'figmaUrl', type: 'string', required: false, desc: '链接（无 fileKey/nodeId 时自动解析）' }],
      outputs: [{ key: 'figmaNodeData', type: 'object' }, { key: 'fetchResult', type: 'object' }],
      params: [{ key: 'figmaToken', label: 'Figma Token', type: 'string', required: false, desc: '不填则用环境变量 FIGMA_ACCESS_TOKEN' }],
    }),
  },
  'screenshot': {
    id: 'screenshot', label: '截图渲染（质检拍照）',
    description: '渲染组件截图（复用系统渲染器，对应 phase2 screenshot-renderer）',
    render: renderScreenshotTpl,
    resources: resources({
      inputs: [{ key: 'componentName', type: 'string', required: true, desc: '组件名' }, { key: 'outputPath', type: 'string', required: false, desc: '产物目录（含 package/）' }],
      outputs: [{ key: 'screenshotPath', type: 'string' }, { key: 'screenshotResult', type: 'object' }],
      params: [],
    }),
  },
  'complete': {
    id: 'complete', label: '产物发布（出货）',
    description: '复制 package 到目标 workspace（对应 phase2 complete）',
    render: renderComplete,
    resources: resources({
      inputs: [{ key: 'outputPath', type: 'string', required: true, desc: '产物目录（含 package/）' }, { key: 'componentName', type: 'string', required: true, desc: '组件名（目标目录名）' }],
      outputs: [{ key: 'publishedPath', type: 'string' }, { key: 'finalizeResult', type: 'object' }],
      params: [{ key: 'targetWorkspace', label: '目标 workspace', type: 'string', required: false, desc: '默认 outputPath 上级 ../workspace' }],
    }),
  },
  'l0b-fail': {
    id: 'l0b-fail', label: '失败阻断（fail-closed）',
    description: '校验不通过时抛错终止管线（对应 phase2 l0b-fail，无容错）',
    render: renderL0bFail,
    resources: resources({
      inputs: [{ key: 'checkResult', type: 'object', required: true, desc: '上游校验结果（含 pass/ok/blockCount/errors）' }],
      outputs: [{ key: 'gate', type: 'string' }],
      params: [],
    }),
  },
  'do-not-invent': {
    id: 'do-not-invent', label: '臆造检查（防造假）',
    description: '生成内容 vs 已知元素清单对照（对应 phase2 do-not-invent-check）',
    render: renderDoNotInvent,
    resources: resources({
      inputs: [{ key: 'content', type: 'any', required: true, desc: '生成内容（文本/JSON）' }, { key: 'knownItems', type: 'array', required: true, desc: '设计稿已知元素清单' }],
      outputs: [{ key: 'ok', type: 'boolean' }, { key: 'inventedItems', type: 'array' }],
      params: [{ key: 'contentField', label: '内容字段名', type: 'string', required: false, desc: '默认 content' }, { key: 'knownItemsField', label: '清单字段名', type: 'string', required: false, desc: '默认 knownItems' }],
    }),
  },
  'code-structure': {
    id: 'code-structure', label: '代码结构校验（L0-B）',
    description: '内置基础规则：scoped less / @import index.less / 类名前缀（对应 phase2 code-structure-validator）',
    render: renderCodeStructure,
    resources: resources({
      inputs: [{ key: 'code', type: 'string', required: true, desc: '组件代码（.vue 内容）' }],
      outputs: [{ key: 'pass', type: 'boolean' }, { key: 'errors', type: 'array' }, { key: 'blockCount', type: 'number' }],
      params: [{ key: 'classPrefix', label: '类名前缀', type: 'string', required: false, desc: '默认 c-（所有 c- 前缀类校验前缀一致）' }],
    }),
  },
  'runtime-verify': {
    id: 'runtime-verify', label: '运行时验证（产物检查）',
    description: '验证产物存在且非空（对应 phase2 generate-runtime-verify）',
    render: renderRuntimeVerify,
    resources: resources({
      inputs: [{ key: 'outputPath', type: 'string', required: true, desc: '产物目录（含 package/）' }, { key: 'files', type: 'array', required: false, desc: '待检查文件清单（默认 index.vue）' }],
      outputs: [{ key: 'pass', type: 'boolean' }, { key: 'errors', type: 'array' }],
      params: [],
    }),
  },
}
