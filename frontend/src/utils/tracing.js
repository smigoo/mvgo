import { Resource } from '@opentelemetry/resources'
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
import { WebTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-web'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { trace } from '@opentelemetry/api'
import { useUserStore } from '@/store'
import { getActivePinia } from 'pinia'

function getUser() {
  const activePinia = getActivePinia()
  if (!activePinia) return null
  return useUserStore(activePinia).userInfo
}

// ====================== 配置 ======================
const SERVICE_NAME = $processEnv.SERVICE_NAME
const COLLECTOR_URL = $processEnv.VITE_APP_TRACING_API
const IDLE_TIME = 10 * 1000
const TRACING_ENABLED = $processEnv.TRACING_ENABLED
const ALLOW_CLICK_PAGES = ['/container-page']

// ====================== 智能链路 ======================
let CURRENT_TRACE_ID = generateTraceId()
let idleTimer = null

function generateTraceId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function resetTraceTimer() {
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    CURRENT_TRACE_ID = generateTraceId()
  }, IDLE_TIME)
}

// ====================== 手动埋点 ======================
const NOOP_SPAN = {
  setAttribute() { return this },
  setStatus() { return this },
  recordException() { return this },
  end() { },
  spanContext() { return { traceId: '' } }
}

export function startSpan(name) {
  if (!TRACING_ENABLED || $isWujie) return NOOP_SPAN
  resetTraceTimer()
  const span = trace.getTracer(SERVICE_NAME).startSpan(name)
  span.spanContext().traceId = CURRENT_TRACE_ID
  return span
}

// ====================== OTel 初始化 ======================
if (TRACING_ENABLED && !$isWujie) {
  const resource = new Resource({
    [SEMRESATTRS_SERVICE_NAME]: SERVICE_NAME,
    [SEMRESATTRS_SERVICE_VERSION]: '1.0.0'
  })

  const provider = new WebTracerProvider({ resource })
  provider.register({})
  provider.addSpanProcessor(new BatchSpanProcessor(new OTLPTraceExporter({ url: COLLECTOR_URL })))
  /* ========== 3. 自动注入 ========== */
  // registerInstrumentations({
  //   instrumentations: [
  //     new FetchInstrumentation({
  //       clearTimingResources: true, // 节省内存
  //       propagateTraceHeaderCorsUrls: [/.+/], // 需要跨域携带 trace 头时填域名
  //       applyCustomAttributesOnSpan: (span, request, response) => {
  //         // 自动追加一些通用标签
  //         span.setAttribute('http.request.method', request.method)
  //         span.setAttribute('http.url', request.url)
  //         if (response) {
  //           span.setAttribute('http.status_code', response.status)
  //           const duration =
  //             span.endTime[0] * 1e3 +
  //             span.endTime[1] * 1e-6 -
  //             (span.startTime[0] * 1e3 + span.startTime[1] * 1e-6)
  //           span.setAttribute('http.response_time', duration.toFixed(2))
  //           if (!response.ok) span.setAttribute('error', true)
  //         }
  //       }
  //     }),
  //     new XMLHttpRequestInstrumentation({
  //       propagateTraceHeaderCorsUrls: [/.+/],
  //       applyCustomAttributesOnSpan: (span, request, response) => {
  //         span.setAttribute('http.request.method', request.method)
  //         span.setAttribute('http.url', request.url)
  //         if (response) {
  //           span.setAttribute('http.status_code', response.status)
  //           if (response.status >= 400) span.setAttribute('error', true)
  //         }
  //       }
  //     })
  //   ]
  // })
  /**
   * 全局错误捕获（已绑定链路）
   * @param {*} errorType 
   * @param {*} error 
   * @param {*} source 
   * @param {*} lineno 
   * @param {*} colno 
   */
  function reportGlobalError(errorType, error, source = '', lineno = 0, colno = 0) {
    const span = startSpan(`global.error.${errorType}`)
    const globalUser = getUser()

    try {
      span.setStatus({ code: 2 })
      span.setAttribute('error', true)
      span.setAttribute('error.type', errorType)
      span.setAttribute('error.message', error?.message || String(error))
      span.setAttribute('error.stack', error?.stack || 'no stack')
      span.setAttribute('error.source', source)
      span.setAttribute('error.lineno', lineno)
      span.setAttribute('error.colno', colno)

      // ✅ 强制绑定当前全局链路（必生效）
      span.spanContext().traceId = CURRENT_TRACE_ID

      // 用户信息
      span.setAttribute('user.id', globalUser?.mobile || 'unknown')
      span.setAttribute('user.name', globalUser?.name || 'unknown')
      span.setAttribute('page.href', window.location.href)
      span.setAttribute('page.userAgent', navigator.userAgent)

      // 记录错误
      span.recordException(error)
    } catch (err) { }
    finally {
      span.end()
    }
  }

  window.addEventListener('unhandledrejection', (event) => {
    reportGlobalError('unhandledrejection', event.reason)
    event.preventDefault()
  })

  // ====================== UI 点击埋点（指定页面生效） ======================
  function startUISpan(action, target, event) {
    const el = target
    if (!el || !el.tagName) return

    const span = startSpan("ui." + action)
    try {
      const globalUser = getUser()
      span.setAttribute("ui.action", action)
      span.setAttribute("ui.tag", el.tagName.toLowerCase())
      span.setAttribute("ui.id", el.id || "")
      span.setAttribute("ui.class", el.className || "")
      span.setAttribute("ui.text", (el.innerText || "").trim().substring(0, 100))
      span.setAttribute("ui.clientX", event.clientX || 0)
      span.setAttribute("ui.clientY", event.clientY || 0)
      span.setAttribute("page.href", window.location.href)
      span.setAttribute('user.id', globalUser?.mobile || 'unknown')
      span.setAttribute('user.name', globalUser?.name || 'unknown')

      const currentCtx = trace.getActiveContext()
      const activeSpan = trace.getSpan(currentCtx)
      if (activeSpan) {
        span.setAttribute("parent.traceId", activeSpan.spanContext().traceId)
      }
    } catch (e) { }
    span.end()
  }

  document.addEventListener("click", function (e) {
    const currentPath = window.location.pathname
    const needTrace = ALLOW_CLICK_PAGES.some(page => currentPath.includes(page))
    if (!needTrace) return

    const el = e.target
    if (!el || !el.tagName) return

    // 只获取【当前点击元素自己】的文本和 title，绝不向上找！
    const selfText = (el.innerText || '').trim()
    const selfTitle = (el.getAttribute('title') || '').trim()

    // 自己本身 没有文字 也没有 title → 不触发
    if (!selfText && !selfTitle) return

    startUISpan("click", e.target, e)
  }, true)

  // 初始化计时器
  resetTraceTimer()
  console.log("✅ 前端追踪已启动：点击埋点、错误捕获、链路合并")
} else {
  console.log("⏸️ 前端追踪已关闭（TRACING_ENABLED=false）")
}