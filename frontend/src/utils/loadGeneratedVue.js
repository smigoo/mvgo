/**
 * 运行时编译加载 v3 项目管线 S4 生成的真·Vue 页面（GenViewNN.vue + 其 @/components 依赖）。
 *
 * 与 loadVue3Runtime.js 同一套 vue3-sfc-loader 机制，但数据源是后端 /api/v3/project 的
 * `artifact` 端点（白名单 generated/**），而非 workspace / __raw。@/ 别名映射到
 * generated/frontend/src/ —— 即 S4 产物的前端源码根。
 *
 * 用途：在 project-lab 实验台把「契约 → 冻结 → S3 骨架 → S4 真·Vue 页面」最后一环
 * 在浏览器里真渲染出来（此前 STEP5 只做源码查看 + zip 下载，并非真渲染）。
 *
 * 依赖假定（来自 s4-vuegen.ts 的确定性产物约定）：
 *   - 页面入口：generated/frontend/src/views/GenViewNN.vue
 *   - 组件依赖：generated/frontend/src/components/*.vue（@/components/ 别名）
 *   - 仅 import 自 'vue' 与 @/components/*；无 echarts / 无二进制资源 import
 *     （若有，loader 也有兜底分支，但当前 S4 产物不触发）
 */
import { BINARY_EXTS, extOf } from './sfc-loader-binary.js'
import { resolveJsModuleTypeOverride } from './sfc-loader-esm-js'
import { getAuthToken } from '@/utils/api-token'
import {
  injectVueAutoImports,
  precompileVueLess,
  normalizeObjectStringKeysInVue,
  applyScopeToPreviewStyles,
} from './loadVue3Runtime.js'

const API_BASE = '/api/v3/project'

function authHeaders(extra = {}) {
  const headers = { ...extra }
  const token = getAuthToken()
  if (token) headers.Token = token
  return headers
}

/** 解包全局响应信封（与 project-lab/index.vue 的 request 同逻辑）。 */
function unwrapEnvelope(data) {
  if (data && typeof data === 'object' && 'data' in data && 'code' in data && 'source' in data) {
    return data.data
  }
  return data
}

/**
 * 取 S4 产物文本源码。runId + 相对 generated/ 的路径 → artifact 端点。
 * @returns {Promise<{content: string, isImage?: boolean, dataUrl?: string}>}
 */
async function fetchGeneratedSource(runId, rel) {
  const url =
    `${API_BASE}/runs/${encodeURIComponent(runId)}/artifact?name=` +
    encodeURIComponent('generated/' + rel)
  const res = await fetch(url, { method: 'GET', headers: authHeaders(), credentials: 'include' })
  if (!res.ok) {
    throw new Error(`取源失败 HTTP ${res.status}：${rel}`)
  }
  const json = await res.json().catch(() => ({}))
  const payload = unwrapEnvelope(json)
  const artifact = payload && payload.artifact ? payload.artifact : payload
  if (artifact && artifact.isImage) {
    return { content: '', isImage: true, dataUrl: artifact.dataUrl }
  }
  return { content: (artifact && artifact.content) || '' }
}

/**
 * 把 import 说明符归一到 generated/frontend/src 下的相对路径。
 * @param {string|undefined} refPath  导入方已解析路径（如 frontend/src/views/GenView01.vue）
 * @param {string} relPath            import 语句里的原始说明符
 * @returns {string}
 */
function normalizeGeneratedPath(refPath, relPath) {
  const s = String(relPath)
  // @/ 别名 → generated/frontend/src/
  if (s.startsWith('@/')) {
    let p = 'frontend/src/' + s.slice(2)
    if (!/\.[a-z0-9]+$/i.test(p)) p += '.vue'
    return p
  }
  // 相对路径 → 基于导入方目录 posix 归一
  if (s.startsWith('.')) {
    const base = refPath ? refPath.split('/').slice(0, -1).join('/') : 'frontend/src/views'
    const parts = []
    for (const seg of (base + '/' + s).split('/')) {
      if (seg === '' || seg === '.') continue
      if (seg === '..') parts.pop()
      else parts.push(seg)
    }
    let p = parts.join('/')
    if (!/\.[a-z0-9]+$/i.test(p)) p += '.vue'
    return p
  }
  // 裸模块（vue 等）→ 原样返回，交给 moduleCache
  return s
}

/**
 * 运行时编译并加载一个 S4 生成的 Vue 页面组件。
 * @param {string} runId
 * @param {string} rel   相对 frontend/src/views/ 的文件名，如 'GenView01.vue'
 * @param {{scopeKey?: string}} [opts] 样式作用域 key（与外层容器 data-preview-scope 一致）
 * @returns {Promise<any>} 编译后的组件定义（可直接 <component :is> 挂载）
 */
export async function loadGeneratedVue(runId, rel, { scopeKey } = {}) {
  const loaderDeps = await Promise.all([
    import('vue3-sfc-loader'),
    import('vue'),
    import('less'),
  ])
  const [{ loadModule }, Vue, lessMod] = loaderDeps
  const less = lessMod.default || lessMod

  const options = {
    moduleCache: { vue: Vue },
    // 与 vue3-sfc-loader 的 pathResolver 签名一致：({ refPath, relPath }, options)
    pathResolver({ refPath, relPath }) {
      return normalizeGeneratedPath(refPath, relPath)
    },
    async getFile(pathArg) {
      const rel = String(pathArg)
      const ext = extOf(rel)
      if (BINARY_EXTS.has(ext)) return ''
      const { content } = await fetchGeneratedSource(runId, rel)
      let src = content || ''
      // ── import.meta 重写（与 loadVue3Runtime 同款，防沙箱 `import.meta` 报错）──
      const fileUrl =
        `${location.origin}${API_BASE}/runs/${encodeURIComponent(runId)}/artifact?name=` +
        encodeURIComponent('generated/' + rel)
      src = src.replace(/\bimport\s*\.?\s*meta\b/g, `({ url: ${JSON.stringify(fileUrl)} })`)
      // ── 确定性修复：对象字面量裸 key 漏引号 ──
      src = normalizeObjectStringKeysInVue(src)
      // ── 补齐运行时编译缺失的 Vue API（绕过 Vite AutoImport）──
      src = injectVueAutoImports(src)
      // ── 预编译 LESS → 纯 CSS（去掉 lang，避免 sfc-loader 请求 getFile('less')）──
      src = await precompileVueLess(src, less, fileUrl)
      // ── ESM 形式的 .js 覆写分派 ──
      const esmTypeOverride = resolveJsModuleTypeOverride(rel, src)
      if (esmTypeOverride) {
        return { type: esmTypeOverride, getContentData: async () => src }
      }
      return src
    },
    addStyle(textContent) {
      const style = document.createElement('style')
      style.setAttribute('data-preview-style-scope', scopeKey)
      style.textContent = textContent
      document.head.appendChild(style)
    },
    async handleModule(type, getContentData, modulePath) {
      if (type === '.json') {
        return JSON.parse(String(await getContentData(false)))
      }
      if (BINARY_EXTS.has(type)) {
        // 当前 S4 产物不含二进制 import；兜底返回 artifact URL（供 <img :src>）
        return (
          `${API_BASE}/runs/${encodeURIComponent(runId)}/artifact?name=` +
          encodeURIComponent('generated/' + String(modulePath || ''))
        )
      }
      return undefined
    },
  }

  return await loadModule('frontend/src/views/' + rel, options)
}

/** 重新导出，供调用方在挂载后补做样式作用域化（与外层容器 data-preview-scope 配合）。 */
export { applyScopeToPreviewStyles }
