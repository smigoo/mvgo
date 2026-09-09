/**
 * Monaco Editor 加载器（CDN 多镜像 fallback，可后台预热）
 *
 * 背景：原实现把 `cdn.jsdelivr.net` 硬编码进 MonacoEditor.vue，
 *      单 CDN 在国内加载不稳定，Playground 首屏 5–15s 才出编辑器。
 *
 * 改造：
 *   1. CDN 候选：cdn.staticfile.org → cdn.bootcdn.net → cdn.jsdelivr.net
 *   2. SPA 内单例：monacoLoadPromise，多个 MonacoEditor 复用同一加载。
 *   3. sessionStorage 热缓存：上次成功的 CDN 优先复用，二次打开 < 1s。
 *   4. preloadMonaco()：路由进入 Playground 前可后台触发。
 */
const CDN_LIST = [
  { name: 'staticfile', base: 'https://cdn.staticfile.org/monaco-editor/0.45.0/min/vs' },
  { name: 'bootcdn', base: 'https://cdn.bootcdn.net/ajax/libs/monaco-editor/0.45.0/min/vs' },
  { name: 'jsdelivr', base: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' }
]

const WARM_CACHE_KEY = 'monaco-last-good-cdn'

let monacoLoadPromise = null

export function getMonacoState() {
  if (typeof window === 'undefined') return 'idle'
  if (window.monaco) return 'ready'
  if (monacoLoadPromise) return 'loading'
  return 'idle'
}

function loadFromCdn(vsBase) {
  return new Promise((resolve, reject) => {
    const tryRequire = () => {
      if (!window.require || !window.require.config) return false
      try {
        window.require.config({
          paths: { vs: vsBase },
          'vs/nls': { availableLanguages: { '*': 'zh-cn' } }
        })
      } catch (e) {
        // 同一 base 已注册时 require.js 抛错可忽略
      }
      window.require(['vs/editor/editor.main'], () => resolve(), reject)
      return true
    }
    if (tryRequire()) return
    const script = document.createElement('script')
    script.src = `${vsBase}/loader.js`
    script.async = true
    script.onload = () => {
      if (!tryRequire()) reject(new Error('loader.js 已注入但 window.require 未生效'))
    }
    script.onerror = () => reject(new Error(`loader.js 加载失败: ${script.src}`))
    document.head.appendChild(script)
  })
}

function resetRequireConfig() {
  try {
    if (window.require && window.require.config) {
      window.require.config({ paths: { vs: 'about:blank' } })
    }
  } catch {}
}

export function loadMonaco() {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR 环境'))
  if (window.monaco) return Promise.resolve()
  if (monacoLoadPromise) return monacoLoadPromise

  monacoLoadPromise = (async () => {
    let warmCdn = ''
    try { warmCdn = sessionStorage.getItem(WARM_CACHE_KEY) || '' } catch {}
    const ordered = warmCdn
      ? [...CDN_LIST.filter((c) => c.base === warmCdn), ...CDN_LIST.filter((c) => c.base !== warmCdn)]
      : CDN_LIST

    let lastErr = null
    for (const cdn of ordered) {
      try {
        await loadFromCdn(cdn.base)
        try { sessionStorage.setItem(WARM_CACHE_KEY, cdn.base) } catch {}
        return
      } catch (e) {
        lastErr = e
        console.warn(`[monaco-loader] CDN ${cdn.name} 失败，尝试下一个`, e)
        try { resetRequireConfig() } catch {}
      }
    }
    throw lastErr || new Error('所有 CDN 镜像均不可达')
  })()
  return monacoLoadPromise
}

/**
 * 后台触发加载（立即返回 promise，让调用方选择 await 或 fire-and-forget）。
 * 已就绪/进行中：返回既有 promise，幂等。
 */
export function preloadMonaco() {
  return loadMonaco().catch(() => {})
}

/** 测试 / 调试用：重置单例（重新选 CDN）。 */
export function resetMonacoLoader() {
  if (window.monaco) return
  monacoLoadPromise = null
  resetRequireConfig()
}
