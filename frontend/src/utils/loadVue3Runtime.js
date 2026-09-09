/**
 * Vue3 组件运行时编译加载器（iframe 沙箱隔离核心）
 *
 * 为什么需要它：
 *   Playground / 组件预览 iframe 早年直接用 Vite `import()` 加载 workspace 下的 .vue 文件，
 *   Vite 会对这些文件做 SFC + LESS 编译。一旦某个 AI 生成的组件有语法错误（如 LESS `Unrecognized input`），
 *   Vite 的 transform 失败会把错误通过 HMR WebSocket **广播到所有已连接的客户端**——
 *   包括父窗口 Playground，于是「外层报错」。
 *
 * 本加载器做法：
 *   - dev：从 Vite 新增的 `/__raw/workspace/vue3-components/{groupId}/{id}/...` 端点拉取「原始 .vue 源码」
 *          （该端点绕过 Vite transform 管线，Vite 不会对文件做 SFC/LESS 编译）。
 *   - prod：从后端 `/api/preview/{groupId}/{id}/...` 拉取原始源码（同样不进 Vite 管线）。
 *   二者都交给 vue3-sfc-loader 在「浏览器内」运行时编译。
 *
 * 效果：
 *   workspace 中损坏的 .vue 绝不会进入 Vite 的 transform → 不会触发 HMR 错误广播 →
 *   父窗口 Playground 永远干净；编译错误只会在 iframe 内以运行时异常形式被 ErrorBoundary 捕获。
 *
 * 注意：本文件本身也被 Vite 编译，但它是「加载器代码」而非「被预览的组件」，不含用户组件源码，
 *       不会被 workspace 中的错误影响。
 */

import { BINARY_EXTS, extOf } from './sfc-loader-binary.js'
import { buildSnapshotFileUrl } from './preview-resolver'
import http from '@/core/http'

/**
 * 收集可能的 groupId 候选（不依赖 import.meta.glob 静态扫描）
 * @param {string} componentId
 * @param {string|null} explicitGroupId  路由/query 显式传入的 groupId（prod 用）
 * @returns {string[]}
 */
function getCandidateGroupIds(componentId, explicitGroupId) {
  const candidates = new Set()
  if (explicitGroupId) candidates.add(explicitGroupId)
  candidates.add('default-group')
  try {
    const stored = localStorage.getItem('currentGroupId')
    if (stored) candidates.add(stored)
  } catch {}
  return Array.from(candidates)
}

/**
 * 按 SFC 相对组件根目录的层级修正资源路径：
 * - index.vue -> ./resources/
 * - components/*.vue 或 package/index.vue -> ../resources/
 * - package/components/*.vue -> ../../resources/
 * @param {string} src
 * @param {string} rel  相对组件根目录的文件路径
 * @returns {string}
 */
function fixResourcePaths(src, rel) {
  if (!rel.endsWith('.vue')) return src

  const depth = Math.max(0, rel.split('/').length - 1)
  const expectedPrefix = depth === 0 ? './resources/' : `${'../'.repeat(depth)}resources/`

  return src.replace(
    /['"](?:\.\.\/)+resources\/|['"]\.\/resources\//g,
    (matched) => `${matched.charAt(0)}${expectedPrefix}`,
  )
}

function resolveSnapshotRelativePath(fromRel, requestPath) {
  const clean = String(requestPath || '').split(/[?#]/, 1)[0].replaceAll('\\', '/')
  if (!clean || /^(?:data:|https?:|blob:|\/)/i.test(clean)) return null
  const base = fromRel.split('/').slice(0, -1)
  for (const segment of clean.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') base.pop()
    else base.push(segment)
  }
  return base.join('/')
}

async function preprocessSnapshotStyles(src, rel, snapshotFileUrl) {
  const seen = new Set()

  const inlineLess = async (css, currentRel, depth = 0) => {
    if (depth > 10) throw new Error(`LESS @import 层级过深: ${currentRel}`)
    const importPattern = /@import\s+(?:\([^)]*\)\s*)?["']([^"']+)["']\s*;/g
    const chunks = []
    let cursor = 0
    let match
    while ((match = importPattern.exec(css))) {
      chunks.push(css.slice(cursor, match.index))
      const importedRel = resolveSnapshotRelativePath(currentRel, match[1])
      if (!importedRel || !importedRel.endsWith('.less')) {
        chunks.push(match[0])
      } else if (!seen.has(importedRel)) {
        seen.add(importedRel)
        const response = await http.raw(snapshotFileUrl(importedRel))
        if (!response.ok) throw new Error(`找不到 LESS 文件: ${importedRel}`)
        chunks.push(await inlineLess(await response.text(), importedRel, depth + 1))
      }
      cursor = match.index + match[0].length
    }
    chunks.push(css.slice(cursor))

    return chunks.join('').replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (full, _quote, assetPath) => {
      const assetRel = resolveSnapshotRelativePath(currentRel, assetPath)
      return assetRel ? `url(${JSON.stringify(snapshotFileUrl(assetRel))})` : full
    })
  }

  const stylePattern = /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi
  let output = ''
  let cursor = 0
  let match
  while ((match = stylePattern.exec(src))) {
    output += src.slice(cursor, match.index)
    output += match[1] + await inlineLess(match[2], rel) + match[3]
    cursor = match.index + match[0].length
  }
  return output + src.slice(cursor)
}

// workspace 组件经 /__raw 交给 vue3-sfc-loader，不会经过 Vite 的 AutoImport 插件。
// 这里仅补齐源码实际使用且未显式声明的 Vue API，使运行时预览与正式 Vite 编译保持一致。
const VUE_AUTO_IMPORT_CANDIDATES = [
  'computed',
  'createApp',
  'customRef',
  'defineAsyncComponent',
  'defineComponent',
  'effectScope',
  'getCurrentInstance',
  'h',
  'inject',
  'isProxy',
  'isReactive',
  'isReadonly',
  'isRef',
  'markRaw',
  'nextTick',
  'onActivated',
  'onBeforeMount',
  'onBeforeUnmount',
  'onBeforeUpdate',
  'onDeactivated',
  'onErrorCaptured',
  'onMounted',
  'onRenderTracked',
  'onRenderTriggered',
  'onScopeDispose',
  'onServerPrefetch',
  'onUnmounted',
  'onUpdated',
  'provide',
  'reactive',
  'readonly',
  'ref',
  'resolveComponent',
  'resolveDirective',
  'shallowReactive',
  'shallowReadonly',
  'shallowRef',
  'toRaw',
  'toRef',
  'toRefs',
  'toValue',
  'triggerRef',
  'unref',
  'useAttrs',
  'useId',
  'useSlots',
  'useTemplateRef',
  'watch',
  'watchEffect',
  'watchPostEffect',
  'watchSyncEffect',
]

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function collectVueImportedLocals(script) {
  const imported = new Set()
  const importPattern = /import\s*\{([^}]*)\}\s*from\s*['"]vue['"]/g
  let match
  while ((match = importPattern.exec(script))) {
    for (const specifier of match[1].split(',')) {
      const parts = specifier.trim().split(/\s+as\s+/)
      const localName = parts[1] || parts[0]
      if (localName) imported.add(localName.trim())
    }
  }
  return imported
}

/**
 * 确定性修复：对象字面量「裸 key 漏引号」（与后端 sfc-semantics.normalizeObjectStringKeysInVue 同逻辑）。
 * 例：`ref({ c-monitor-beijing: true })` → `ref({ 'c-monitor-beijing': true })`。
 * 只处理 <script> 块，绝不碰 <style>（background-color 是合法 CSS 属性）与 template。
 * 作用：对已生成/历史产物在预览编译前自动修复，消除 `[vue/compiler-sfc] Unexpected token` 加载失败。
 */
function normalizeObjectStringKeysInVue(source) {
  if (!source || typeof source !== 'string') return source
  return source.replace(
    /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi,
    (whole, open, body, close) => {
      const fixedBody = body.replace(
        /([{,]\s*)([A-Za-z_$][\w$]*(?:[-.][\w$-]+)+)(\s*:)/g,
        (_m, pre, key, post) => `${pre}'${key}'${post}`,
      )
      return open + fixedBody + close
    },
  )
}

export function injectVueAutoImports(src) {
  const scriptSetupMatch = src.match(/<script\s+setup(?:\s[^>]*)?>([\s\S]*?)<\/script>/i)
  if (!scriptSetupMatch) return src

  const script = scriptSetupMatch[1]
  const imported = collectVueImportedLocals(script)
  const missing = VUE_AUTO_IMPORT_CANDIDATES.filter((name) => {
    if (imported.has(name)) return false
    const escapedName = escapeRegExp(name)
    const isUsed = new RegExp(`\\b${escapedName}\\s*\\(`).test(script)
    const isLocallyDeclared = new RegExp(`\\b(?:const|let|var|function|class)\\s+${escapedName}\\b`).test(script)
    return isUsed && !isLocallyDeclared
  })

  if (missing.length === 0) return src
  const injectedImport = `\nimport { ${missing.join(', ')} } from 'vue'\n`
  return src.replace(scriptSetupMatch[0], scriptSetupMatch[0].replace(script, injectedImport + script))
}

/**
 * 把 <style lang="less"> 块预编译成纯 CSS，并去掉 lang 属性。
 * 原因：vue3-sfc-loader 遇到 lang="less" 会调用 getFile('less') 去拉 less 编译器，
 *       但 dev/prod 都没有该资源（会 404 → "找不到文件: less"）。
 *       这里用 app 内置的 less 在浏览器内先编译好，vue3-sfc-loader 只处理纯 CSS。
 * 同时：LESS 语法错误（如 `color: ;`）会在这里抛出，被上层捕获后显示为 iframe 内错误卡片，
 *       而不会触发 Vite 编译错误广播到父窗口。
 * @param {string} src
 * @param {object} lessCompiler  app 内置 less（less.render）
 * @param {string} [baseUrl='']  当前组件文件 URL（如 /__raw/workspace/custom-components/{id}/package/index.vue），
 *                               作为 less 外部 @import 的相对路径解析基准（less.render 的 filename 参数）。
 *                               不传则浏览器端无法解析 <style> 内的 @import '../resources/...' 外部文件。
 * @returns {Promise<string>}
 */
async function precompileVueLess(src, lessCompiler, baseUrl = '', ignoreStyles = false) {
  if (ignoreStyles) {
    return src.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '<style data-structure-preview>/* 无样式结构预览 */</style>')
  }
  if (!/lang\s*=\s*["']less["']/.test(src)) return src
  const re = /(<style\b[^>]*\blang=["']less["'][^>]*>)([\s\S]*?)(<\/style>)/g
  let out = ''
  let last = 0
  let m
  while ((m = re.exec(src))) {
    out += src.slice(last, m.index)
    const open = m[1]
    const css = m[2]
    const close = m[3]
    const openNoLang = open.replace(/\s*\blang=["']less["']/, '')
    try {
      const { css: compiled } = await lessCompiler.render(css, {
        rewriteUrls: false,
        filename: baseUrl || undefined,
      })
      out += openNoLang + compiled + close
    } catch (e) {
      const styleStartLine = src.slice(0, m.index + open.length).split('\n').length
      const diagnostic = {
        id: 'LESS-COMPILE-001',
        severity: 'BLOCK',
        sourceType: 'sfc-style',
        file: baseUrl || 'index.vue',
        line: styleStartLine + Math.max(0, (Number(e?.line) || 1) - 1),
        column: (Number(e?.column) || 0) + 1,
        message: e?.message || String(e),
        extract: e?.extract || [],
      }
      const error = new Error(`[LESS 编译失败] ${diagnostic.file}:${diagnostic.line}:${diagnostic.column} ${diagnostic.message}`)
      error.code = 'LESS_COMPILE_GATE_BLOCKED'
      error.lessCompileGate = { pass: false, blockCount: 1, diagnostics: [diagnostic] }
      throw error
    }
    last = m.index + m[0].length
  }
  out += src.slice(last)
  return out
}

/**
 * 运行时编译加载一个 Vue3 组件（也支持微码组件的沙箱化加载）。
 * @param {string} componentId
 * @param {object} [opts]
 * @param {boolean} [opts.isProd=false]  true=从后端 /api/preview 拉取（prod），false=从 Vite /__raw 拉取（dev）
 * @param {string|null} [opts.explicitGroupId=null] 显式 groupId（prod 路由传入）
 * @param {object|null} [opts.instance=null] 当前组件 getCurrentInstance()，用于注册 base-panel
 * @param {string} [opts.workspacePath='vue3-components'] workspace 子目录名（'vue3-components' 或 'custom-components'）
 * @param {{sessionId: string, revision: string}|null} [opts.snapshotSource=null] 任务不可变快照来源
 * @returns {Promise<any>} 编译后的组件定义
 */
export async function loadVue3FromWorkspace(
  componentId,
  {
    isProd = false,
    explicitGroupId = null,
    instance = null,
    styleScopeId = null,
    ignoreStyles = false,
    workspacePath = 'vue3-components',
    snapshotSource = null,
  } = {},
) {
  const [{ loadModule }, Vue, echarts, requestRuntime, common, BasePanel, lessMod, antDesignVue] = await Promise.all([
    import('vue3-sfc-loader'),
    import('vue'),
    import('echarts'),
    import('microvideo-request'),
    import('@/utils/auto-import/common.js'),
    import('@/components/base-components/base-panel/index.vue'),
    import('less'),
    import('ant-design-vue'),
  ])
  // 内置 less 编译器：用于把组件 <style lang="less"> 预编译成纯 CSS，
  // 避免 vue3-sfc-loader 走 getFile('less') 去拉 less 编译器（dev/prod 都没有该资源，会 404）。
  const less = lessMod.default || lessMod

  // 注入全局 $mcComponentBuilder（源码里是自由变量，原靠 auto-import）
  // 🛡️ common.js 只有具名导出（$mcComponentBuilder/$createMcDeclare/$runtimeBuilder/$mcCssBuilder/$getMcDefaultConfig），
  // 没有 default —— 旧写法 `common.default || common` 会把整个 module namespace 对象赋给全局，
  // 组件调用 `$mcComponentBuilder()` 即抛 "$mcComponentBuilder is not a function"。
  // 正确做法：遍历 namespace，把所有 $ 前缀的具名函数逐一注入全局（幂等，不覆盖已有）。
  for (const [key, value] of Object.entries(common)) {
    if (key.startsWith('$') && typeof value === 'function' && !(key in globalThis)) {
      globalThis[key] = value
    }
  }
  // 兜底：确保 $mcComponentBuilder 一定存在（即便上述遍历未命中，也赋 namespace 中同名导出）
  if (typeof globalThis.$mcComponentBuilder !== 'function' && typeof common.$mcComponentBuilder === 'function') {
    globalThis.$mcComponentBuilder = common.$mcComponentBuilder
  }

  // 全局注册 base-panel 与 Ant Design Vue（运行时编译组件共享当前 appContext 即可 resolveComponent）
  const app = instance?.appContext?.app
  if (app && !app.component('base-panel')) {
    app.component('base-panel', BasePanel.default || BasePanel)
  }
  if (app && !app.config.globalProperties.__mvgoAntDesignVueInstalled) {
    app.use(antDesignVue.default || antDesignVue)
    app.config.globalProperties.__mvgoAntDesignVueInstalled = true
  }

  // 入口统一：组件使用 package/index.vue；页面骨架使用根目录 index.vue
  const entryCandidates = workspacePath === 'vue3-pages' ? ['index.vue'] : ['package/index.vue']
  let resolvedGroupId = null
  let resolvedEntry = null

  const snapshotFileUrl = (rel) => snapshotSource
    ? buildSnapshotFileUrl(snapshotSource.sessionId, snapshotSource.revision, rel, true)
    : ''
  const snapshotBase = snapshotSource
    ? `/api/tasks/${encodeURIComponent(snapshotSource.sessionId)}/code-snapshots/${encodeURIComponent(snapshotSource.revision)}/file`
    : ''

  if (snapshotSource) {
    for (const rel of entryCandidates) {
      try {
        const res = await http.raw(snapshotFileUrl(rel))
        if (res.ok) {
          resolvedGroupId = '__snapshot'
          resolvedEntry = rel
          break
        }
      } catch {
        // 继续尝试其他入口，保持与 workspace 加载器相同的错误归类。
      }
    }
  } else if (isProd) {
    // prod：使用显式 groupId（路由/query 传入）
    const g = explicitGroupId || 'default-group'
    // 页面骨架走专用路由 /api/preview/page/:groupId/:pageId/*path
    // （与 dev 分支、base 计算保持一致；通用 /api/preview/:groupId/:id 只查 custom/vue3-components，不含 vue3-pages）
    const probeBase = workspacePath === 'vue3-pages' ? `/api/preview/page/${g}/${componentId}` : `/api/preview/${g}/${componentId}`
    for (const rel of entryCandidates) {
      // 先走 ?exists=1 探测，避免浏览器控制台记录 404 噪音；命中后再由 loadModule 读取内容
      try {
        // 预览端点 servePageFile 用 @Res() 返回 raw {exists:true}（不走全局信封），
        // http.get 亦不解包，故直接判 data?.exists（与普通 vue3 分支 fetch+data.exists 一致）
        const data = await http.get(`${probeBase}/${rel}`, { exists: 1 })
        if (data?.exists) {
          resolvedGroupId = g
          resolvedEntry = rel
          break
        }
      } catch {
        // 探测失败按「不存在」处理，继续尝试下一个候选入口
      }
    }
  } else {
    // dev
    if (workspacePath === 'custom-components') {
      // 微码组件：无 groupId 层级，直接 custom-components/${componentId}/
      resolvedGroupId = '__microcode'
      resolvedEntry = 'package/index.vue'
      const check = await fetch(
        `/__raw/workspace/custom-components/${componentId}/package/index.vue?exists=1`
      )
      if (check.ok) {
        const data = await check.json().catch(() => ({ exists: false }))
        if (!data.exists) resolvedGroupId = null
      } else {
        resolvedGroupId = null
      }
    } else if (workspacePath === 'vue3-pages') {
      // 页面骨架：dev 也走后端 /api/preview/page（产物只落在 backend-node/workspace）
      const g = explicitGroupId || 'default-group'
      for (const rel of entryCandidates) {
        try {
          // 预览端点 servePageFile 用 @Res() 返回 raw {exists:true}（不走全局信封），
          // http.get 亦不解包，故直接判 data?.exists（与普通 vue3 分支 fetch+data.exists 一致）
          const data = await http.get(`/api/preview/page/${g}/${componentId}/${rel}`, { exists: 1 })
          if (data?.exists) {
            resolvedGroupId = g
            resolvedEntry = rel
            break
          }
        } catch {
          // 探测失败按不存在处理
        }
      }
    } else {
      // Vue3：尝试多个候选 groupId
      const candidateGroupIds = getCandidateGroupIds(componentId, explicitGroupId)
      for (const g of candidateGroupIds) {
        for (const rel of entryCandidates) {
          const res = await fetch(`/__raw/workspace/vue3-components/${g}/${componentId}/${rel}?exists=1`)
          if (res.ok) {
            const data = await res.json().catch(() => ({ exists: false }))
            if (data.exists) {
              resolvedGroupId = g
              resolvedEntry = rel
              break
            }
          }
        }
        if (resolvedGroupId) break
      }
    }
  }

  if (!resolvedGroupId) {
    const tried =
      workspacePath === 'custom-components'
        ? [`custom-components/${componentId}`]
        : isProd
          ? [explicitGroupId || 'default-group']
          : getCandidateGroupIds(componentId, explicitGroupId)
    throw new Error(`未找到组件：${componentId}（已尝试 ${tried.join(', ')}）`)
  }

  const base = snapshotSource
    ? snapshotBase
    : isProd
      ? (workspacePath === 'vue3-pages'
          ? `/api/preview/page/${resolvedGroupId}/${componentId}`
          : `/api/preview/${resolvedGroupId}/${componentId}`)
      : workspacePath === 'custom-components'
        ? `/__raw/workspace/custom-components/${componentId}`
        : workspacePath === 'vue3-pages'
          ? `/api/preview/page/${resolvedGroupId}/${componentId}`
          : `/__raw/workspace/vue3-components/${resolvedGroupId}/${componentId}`

  // 二进制资源扩展名集合（图片 / 字体等）—— 单一真相源见 sfc-loader-binary.js
  // 这些文件不能用 res.text() 读取，否则二进制数据被强制转文本后内容被破坏，导致图片显示为 broken image
  // （BINARY_EXTS 已从共享模块导入，避免与微码生产路径扩展名列表漂移）

  /**
   * 将 vue3-sfc-loader 传入的路径归一化为相对于组件根目录的路径。
   * 统一处理三种形式：
   *   - './resources/...' → 去掉 './'
   *   - '../resources/...' → 去掉 '../'（SFC 在 package/ 下，../ 实际指向组件根）
   *   - 已包含 componentId 的完整路径 → 提取 componentId 之后的部分
   */
  function resolveRelPath(p) {
    const m = p.match(new RegExp(`${componentId}/(.+)$`))
    if (m) return m[1]
    // vue3-sfc-loader 可能保留 ../ 前缀，SFC 在 package/ 下时 ../ 等价于组件根
    return p.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '')
  }

  // 运行时组件只能访问明确允许的裸模块。未列入 moduleCache 的依赖会由
  // vue3-sfc-loader 拒绝，避免生成代码在浏览器中任意加载第三方模块。
  const previewStyleScope = styleScopeId || `preview-${componentId}`

  const options = {
    moduleCache: {
      vue: Vue,
      echarts,
      'microvideo-request': requestRuntime,
      'ant-design-vue': antDesignVue,
    },
    async getFile(pathArg) {
      const p = String(pathArg)
      const rel = resolveRelPath(p)
      //  二进制资源（图片等）：不读取内容，返回空字符串占位
      // 实际 URL 由 handleModule 返回，浏览器直接 fetch 二进制文件
      const ext = extOf(rel)
      if (BINARY_EXTS.has(ext)) return ''
      // snapshot 通过固定 revision 文件接口读取；workspace 仍走原有来源。
      const res = await http.raw(snapshotSource ? snapshotFileUrl(rel) : `${base}/${rel}`)
      if (!res.ok) throw new Error(`找不到文件: ${rel}`)
      let src = await res.text()
      // ── 修复 vue3-sfc-loader 不支持 import.meta 的根因 ──
      // vue3-sfc-loader 在「类 CommonJS」作用域中求值模块，组件源码里的
      // `new URL('../resources/x.png', import.meta.url)` 会因 import.meta 不存在而抛
      // "Cannot use 'import.meta' outside a module"。这里把 import.meta 重写为「当前源文件的
      // 绝对 URL 对象」，使 new URL(relative, import.meta.url) 在沙箱内仍能解析成资源绝对地址。
      // 覆盖 dev(/__raw) 与 prod(/api/preview) 两条链路，对已有/未来组件一律生效。
      // 组件源码本身保持标准 Vite/ESM 写法（真实 Vite 构建时 import.meta.url 原生可用，无需改动）。
      const fileUrl = snapshotSource
        ? `${location.origin}${snapshotFileUrl(rel)}`
        : `${location.origin}${base}/${rel}`
      if (snapshotSource) {
        src = src.replace(
          /new\s+URL\(\s*(["'])([^"']+)\1\s*,\s*import\.meta\.url\s*\)/g,
          (_full, _quote, assetPath) => {
            const assetRel = resolveSnapshotRelativePath(rel, assetPath)
            return assetRel
              ? `new URL(${JSON.stringify(`${location.origin}${snapshotFileUrl(assetRel)}`)})`
              : _full
          },
        )
      }
      // 🛡️ 正则兼容 `import .meta` 空格变体（LLM 偶发拼写，mv-max-1787576934056 实锤）：
      // 严格 `import\.meta` 匹配不到变体 → 该行在沙箱中成为语法/求值错误 → 资源全挂。
      src = src.replace(/\bimport\s*\.?\s*meta\b/g, `({ url: ${JSON.stringify(fileUrl)} })`)
      // 镜像 vite.config workspace-css-guard：修正资源路径。
      // snapshot URL 使用 query 传 path，LESS 的相对 @import / url() 必须先改写到同 revision。
      src = fixResourcePaths(src, rel)
      if (snapshotSource) src = await preprocessSnapshotStyles(src, rel, snapshotFileUrl)
      // 🛡️ 确定性修复：对象字面量裸 key 漏引号（如 { c-monitor-beijing: true }），
      // 预览编译前自动补齐，消除 compiler-sfc Unexpected token 加载失败（历史产物同样生效）。
      src = normalizeObjectStringKeysInVue(src)
      // 运行时编译绕过 Vite AutoImport，补齐源码依赖的 Vue API。
      src = injectVueAutoImports(src)
      //  预编译 LESS → 纯 CSS（去掉 lang，避免 vue3-sfc-loader 请求 getFile('less')）
      // filename 传当前文件完整 URL，使 <style> 内的 @import '../resources/...' 能基于该 URL 解析
      src = await precompileVueLess(src, less, `${base}/${rel}`, ignoreStyles)
      return src
    },
    addStyle(textContent) {
      const style = document.createElement('style')
      style.setAttribute('data-preview-style-scope', previewStyleScope)
      style.textContent = textContent
      document.head.appendChild(style)
      // 🛡️ P2（2026-09-03）：所有注入的组件 CSS 统一作用域化——
      // 剥离失效的 [data-v-*]（修复 sfc-loader scopeId 失配）+ 加预览容器前缀（跨组件隔离）。
      scopeStyleSheet(style, previewStyleScope)
    },
    // handleModule 参数：(type, getContentData, path, options)
    // 返回值会成为该 import 语句的模块默认导出值
    async handleModule(type, getContentData, modulePath) {
      if (type === '.json') {
        return JSON.parse(String(await getContentData(false)))
      }
      // ️ 图片资源：将 import xxx from '...png' 解析为绝对 URL 字符串
      // vue3-sfc-loader 无法原生处理二进制图片，这里返回 Vite /__raw/ 可访问的绝对路径
      // 组件中 :src="bg1" 即可正常加载图片（浏览器直接 fetch 二进制文件）
      if (BINARY_EXTS.has(type)) {
        const rel = resolveRelPath(String(modulePath || ''))
        return snapshotSource ? snapshotFileUrl(rel) : `${base}/${rel}`
      }
      return undefined
    },
  }

  // ── 🛡️ 管线级治本（2026-09-03）：预览样式确定性通道 ──
  // 背景：vue3-sfc-loader 运行时编译的 <style scoped> 会出现「元素 data-v 与规则 [data-v] 失配」
  // （agent-browser 实测 c-env-monitor：元素 data-v-5d1d… vs 规则 [data-v-38a6…]）→ scoped 类样式全失效：
  //   icon 按 PNG 原始尺寸渲染(104px，应 24px)、root 高度坍塌(150px)、chart 容器 405×0
  //   → echarts init 因 clientHeight=0 跳过 → canvas 0 → 图表空白。
  // 治本：产物自带"生成管线确定性编译"的 resources/styles/index.css（index-css-recompiler 产出，
  //   无 scoped、含全部类规则），此处以**全局样式**注入——类样式不再依赖运行时 scoped 编译，
  //   稳定生效且与生成态同源（正常组件此前"看起来正常"仅因 LLM 写了大量行内尺寸掩盖本缺陷）。
  // 🛡️ 2026-09-03 补充：styles/index.css 是 Max 管线确定性编译产物，Lite/其他管线组件目录下
  //   本就无此文件（SFC 内嵌 scoped 样式即可渲染）。必须先探测存在再注入——直接 fetch 会让
  //   缺 styles 的组件产生一次 404，被运行时截图门禁记为 RUNTIME-007「HTTP 资源加载错误」→
  //   bind-api 真实运行时检查误判 BLOCK 回滚。
  if (!ignoreStyles) {
    await injectGlobalIndexCssIfExists({
      cssUrl: snapshotSource
        ? snapshotFileUrl('resources/styles/index.css')
        : `${base}/resources/styles/index.css`,
      existsProbeUrl: snapshotSource
        ? snapshotFileUrl('resources/styles/index.css')
        : `${base}/resources/styles/index.css`,
      scopeKey: previewStyleScope,
    }).catch(() => {}) // 失败不阻塞加载（退化为原 scoped 行为）
  }

  return await loadModule(resolvedEntry, options)
}

/**
 * 对已注入的 style 做「作用域化」改写（CSSOM 层，零文本解析风险）：
 *  ① **剥离 [data-v-xxx]**：修复 vue3-sfc-loader scopeId 失配（元素 data-v-A vs 规则 [data-v-B]）
 *     → 让原本全部失效的 scoped 类样式重新生效；
 *  ② **加 [data-preview-scope="<key>"] 前缀**：把样式限定在当前预览容器，
 *     → 避免不同组件同名类（如两个组件的 .c-monitor-root）互相污染（全局注入的固有风险）。
 *
 * 仅在「页面存在该 scope 属性元素」时执行（否则保持原样，避免选择器无处匹配导致样式全丢）。
 * @param {HTMLStyleElement} styleEl 已插入文档的 style 元素
 * @param {string} scopeKey 作用域标识
 * @returns {number} 改写成功的规则数
 */
function scopeStyleSheet(styleEl, scopeKey) {
  if (!scopeKey || !styleEl || !styleEl.sheet) return 0
  const scopeAttr = `[data-preview-scope="${scopeKey}"]`
  // 安全兜底：页面尚无该作用域容器时不改写（否则加前缀后选择器无处匹配 → 样式全丢）
  try {
    if (!document.querySelector(scopeAttr)) return 0
  } catch {
    return 0
  }
  let changed = 0
  const walk = (rules) => {
    for (const rule of rules) {
      try {
        // @media / @supports / @layer 等条件组：递归处理内层规则
        if (rule.cssRules && rule.cssRules.length) {
          walk(rule.cssRules)
          continue
        }
        if (!rule.selectorText) continue
        let sel = rule.selectorText
        // ① 剥离失效的 scoped 属性选择器
        sel = sel.replace(/\[data-v-[0-9a-f]+\]/gi, '')
        // ①b 剥离 sanitizeLess 的 `:root` 包裹（phase2 把根级 mixin 调用包进 :root 的产物）。
        // 若不剥离：`:root .a .b`（全局、特异性更高）会压过 scope 内的 `.b` 规则 →
        // 子组件定义（24px）被 common.less 的 100% 覆盖，收敛/隔离双双失效。
        sel = sel.replace(/:root\s+/gi, '')
        // ② 跳过已加过前缀的（幂等），逐段（逗号分隔）加作用域前缀
        const scopedSel = sel
          .split(',')
          .map((part) => {
            const p = part.trim()
            if (!p) return p
            if (p.startsWith(scopeAttr)) return p
            // :root / html / body 等无容器可挂的选择器：不可加前缀，否则永不匹配
            if (/^(:root|html|body)\b/i.test(p)) return p
            return `${scopeAttr} ${p}`
          })
          .filter(Boolean)
          .join(', ')
        if (scopedSel && scopedSel !== rule.selectorText) {
          rule.selectorText = scopedSel
          changed += 1
        }
      } catch {
        /* 单条规则改写失败（浏览器不支持的选择器）→ 跳过，不影响其余 */
      }
    }
  }
  try {
    walk(styleEl.sheet.cssRules)
  } catch {
    return 0 // 跨域/不可读样式表 → 原样保留
  }
  return changed
}

/**
 * 注入组件级全局 CSS（幂等）：产物 resources/styles/index.css。
 * 与 sfc-loader 的 scoped 样式互补——scoped 命中时二者一致；scoped 失配时本通道兜底保证还原度。
 * @param {{cssUrl: string, scopeKey: string}} opts
 * @returns {Promise<boolean>} 是否注入成功
 */
async function injectGlobalIndexCss({ cssUrl, scopeKey }) {
  const attr = 'data-preview-global-css'
  const existing = document.head.querySelector(`style[${attr}="${scopeKey}"]`)
  if (existing) return true // 幂等：同一预览实例只注入一次
  const res = await fetch(cssUrl)
  if (!res.ok) return false
  const css = await res.text()
  if (!css || !css.trim()) return false
  const style = document.createElement('style')
  style.setAttribute(attr, scopeKey)
  style.setAttribute('data-preview-style-scope', scopeKey)
  style.textContent = css
  document.head.appendChild(style)
  // 与 addStyle 同规则：存在作用域容器时统一隔离（幂等）
  scopeStyleSheet(style, scopeKey)
  return true
}

/**
 * 🛡️ 2026-09-03：探测存在后才注入全局 CSS（styles/index.css 仅 Max 管线产物有）。
 * 直接 fetch 不存在的文件会产生 404 → 运行时截图门禁 RUNTIME-007 误判 BLOCK。
 * 复用 `?exists=1` 探测端点（同组件入口探测），存在才发起真实样式请求。
 * @param {{cssUrl: string, existsProbeUrl: string, scopeKey: string}} opts
 * @returns {Promise<boolean>}
 */
async function injectGlobalIndexCssIfExists({ cssUrl, existsProbeUrl, scopeKey }) {
  try {
    const probeUrl = `${existsProbeUrl}${existsProbeUrl.includes('?') ? '&' : '?'}exists=1`
    const probe = await fetch(probeUrl)
    if (!probe.ok) return false
    const data = await probe.json().catch(() => ({ exists: false }))
    if (!data.exists) return false
  } catch {
    return false // 探测失败按「不存在」处理，绝不让 404 进入截图门禁的响应错误收集
  }
  return injectGlobalIndexCss({ cssUrl, scopeKey })
}

/**
 * 组件**挂载后**补做样式作用域化（P2，2026-09-03）。
 *
 * 时序问题：addStyle / injectGlobalIndexCss 发生在 loadModule 编译期，此时组件 DOM 尚未挂载，
 * document.querySelector('[data-preview-scope=...]') 为空 → scopeStyleSheet 会跳过（安全兜底）。
 * 故由预览页在组件渲染完成后调用本函数，对所有本实例注入的 style 补做改写（幂等）。
 *
 * @param {string} scopeKey 与 loadVue3FromWorkspace 的 styleScopeId 一致
 * @returns {number} 本轮改写成功的 style 元素数
 */
export function applyScopeToPreviewStyles(scopeKey) {
  if (!scopeKey) return 0
  let n = 0
  try {
    const styles = document.querySelectorAll(
      `style[data-preview-style-scope="${scopeKey}"]`,
    )
    for (const el of styles) {
      if (scopeStyleSheet(el, scopeKey) > 0) n += 1
    }
  } catch {
    return 0
  }
  return n
}

export default loadVue3FromWorkspace
