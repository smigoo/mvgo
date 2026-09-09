/**
 * @Description: 自研 NestJS 后端（/api/*）统一请求封装
 *
 * 与 core/request.js 的分工：
 * - core/request.js  → microvideo-request（axios），面向微码平台服务，
 *                      响应格式固定为 { code, message, detail }，并会注入
 *                      projectId / operatorCode / pageId 等平台公共参数。
 * - core/http.js（本文件）→ 面向自研 NestJS 后端，响应格式自由（如 { success, data }），
 *                      且需支持 SSE 流式、blob 下载、FormData 上传等原生能力，
 *                      因此基于 fetch 封装而非复用 axios 那套拦截器。
 *
 * 统一职责：
 * 1. 注入门户 Token 头（实时取值，避免门户注入晚于模块初始化）
 * 2. 统一携带 cookie 凭证（后端 SessionGuard 依赖 session）
 * 3. 统一解析 JSON、统一抛出带状态码的 HttpError
 * 4. 401 统一提示（去重防抖，避免并行请求刷屏）
 */
import { getAuthToken } from '@/utils/api-token'

/** 后端接口统一前缀 */
const API_PREFIX = '/api'

/** 401 提示防抖窗口（毫秒）：并行请求同时失效时只提示一次 */
const UNAUTHORIZED_NOTICE_INTERVAL = 3000
let lastUnauthorizedAt = 0

/**
 * 统一请求异常
 * @property {number} status HTTP 状态码，网络异常时为 0
 * @property {*} data 后端返回的响应体（解析成功时）
 * @property {string} url 请求地址
 */
export class HttpError extends Error {
  constructor(message, { status = 0, data = null, url = '' } = {}) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.data = data
    this.url = url
  }
}

/**
 * 预览路由豁免鉴权提示（与 core/request.js 保持一致的判定）
 * @returns {boolean}
 */
const isPreviewRoute = () => {
  if (typeof window === 'undefined') return false
  const hash = window.location.hash || ''
  const path = hash.startsWith('#') ? hash.slice(1) : window.location.pathname || ''
  return path.startsWith('/preview/')
}

/**
 * 401 统一提示：只提示，不主动刷新父窗口。
 * 门户 iframe 场景下主动 reload 容易触发刷新风暴，交由调用方按需处理。
 * @param {string} message
 */
const notifyUnauthorized = (message) => {
  if (isPreviewRoute()) return
  const now = Date.now()
  if (now - lastUnauthorizedAt < UNAUTHORIZED_NOTICE_INTERVAL) return
  lastUnauthorizedAt = now
  if (typeof $message !== 'undefined' && $message?.error) {
    $message.error(message || '登录已过期，请刷新页面重试')
  }
}

/**
 * 补全接口前缀。
 * 绝对地址与以 / 开头的路径一律原样透传，避免误伤 /__raw/ 等非接口路径；
 * 仅对相对写法（如 'tasks/recent'）补 /api 前缀。
 * @param {string} url
 * @returns {string}
 */
const resolveUrl = (url) => {
  if (/^https?:\/\//i.test(url) || url.startsWith('/')) return url
  return `${API_PREFIX}/${url}`
}

/**
 * 判断是否同源。跨域请求不强制携带 cookie，
 * 否则会因后端未配置 Access-Control-Allow-Credentials 而直接被 CORS 拦截。
 * @param {string} url
 * @returns {boolean}
 */
const isSameOrigin = (url) => {
  try {
    return new URL(url, window.location.origin).origin === window.location.origin
  } catch (e) {
    return true
  }
}

/**
 * 拼接查询参数，自动跳过 undefined / null
 * @param {string} url
 * @param {Object} [params]
 * @returns {string}
 */
const appendParams = (url, params) => {
  if (!params) return url
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return
    search.append(key, value)
  })
  const query = search.toString()
  if (!query) return url
  return url.includes('?') ? `${url}&${query}` : `${url}?${query}`
}

/**
 * 构造带鉴权的 fetch 配置
 * @param {Object} options
 * @param {string} [options.method]
 * @param {*} [options.body] 普通对象自动 JSON 序列化；FormData / Blob / 字符串原样透传
 * @param {Object} [options.headers]
 * @param {AbortSignal} [options.signal]
 * @returns {RequestInit}
 */
const buildInit = ({ method = 'GET', body, headers, signal, ...rest } = {}, finalUrl = '') => {
  const finalHeaders = new Headers(headers || {})

  // 门户 token 实时注入，后端 SessionGuard 读 headers['token']
  const token = getAuthToken()
  if (token && !finalHeaders.has('Token')) finalHeaders.set('Token', token)

  const init = {
    method,
    headers: finalHeaders,
    // 后端依赖 session cookie，同源场景显式携带；跨域交由调用方决定，避免 CORS 拦截
    credentials: isSameOrigin(finalUrl) ? 'include' : 'same-origin',
    signal,
    ...rest
  }

  if (body === undefined || body === null) return init

  const isRawBody =
    typeof body === 'string' ||
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    body instanceof URLSearchParams

  if (isRawBody) {
    // FormData 必须由浏览器自行设置 boundary，不能手动指定 Content-Type
    init.body = body
  } else {
    if (!finalHeaders.has('Content-Type')) {
      finalHeaders.set('Content-Type', 'application/json;charset=UTF-8')
    }
    init.body = JSON.stringify(body)
  }

  return init
}

/**
 * 从响应体中提取错误描述
 * @param {Response} response
 * @param {*} data
 * @returns {string}
 */
const resolveErrorMessage = (response, data) => {
  if (data && typeof data === 'object') {
    // NestJS 异常对象 { statusCode, message: string[], error } 需要扁平化
    const raw = data.detail || data.message || data.error || `请求失败(${response.status})`
    return typeof raw === 'string' ? raw : String(raw)
  }
  if (typeof data === 'string' && data.trim()) return data
  return `请求失败(${response.status})`
}

/**
 * 发起请求并返回原始 Response，不做任何解析。
 * 适用于需要自行处理响应流、状态码的场景。
 * @param {string} url
 * @param {Object} [options] 同 buildInit，额外支持 params
 * @returns {Promise<Response>}
 */
export const raw = (url, options = {}) => {
  const { params, ...rest } = options
  const finalUrl = appendParams(resolveUrl(url), params)
  return window.fetch(finalUrl, buildInit(rest, finalUrl))
}

/**
 * 发起请求并解析 JSON，非 2xx 抛出 HttpError
 * @param {string} url
 * @param {Object} [options]
 * @returns {Promise<*>} 后端响应体
 */
export const request = async (url, options = {}) => {
  const finalUrl = appendParams(resolveUrl(url), options.params)
  let response

  try {
    response = await raw(url, options)
  } catch (error) {
    // 网络层失败（断网、跨域、被中断）
    if (error?.name === 'AbortError') throw error
    throw new HttpError(error?.message || '网络请求失败', { status: 0, url: finalUrl })
  }

  // 204 / 205 无响应体
  if (response.status === 204 || response.status === 205) {
    if (!response.ok) throw new HttpError(`请求失败(${response.status})`, { status: response.status, url: finalUrl })
    return null
  }

  const contentType = response.headers.get('content-type') || ''
  let data = null

  try {
    data = contentType.includes('application/json') ? await response.json() : await response.text()
  } catch (error) {
    // 响应体为空或格式异常，成功状态下按 null 处理
    data = null
  }

  if (!response.ok) {
    const message = resolveErrorMessage(response, data)
    if (response.status === 401) notifyUnauthorized(message)
    throw new HttpError(message, { status: response.status, data, url: finalUrl })
  }

  return data
}

/**
 * 非 2xx 响应统一转为 HttpError。
 * 会尝试解析响应体，保留后端返回的错误描述（下载/流式接口失败时通常返回 JSON 错误）。
 * @param {Response} response
 * @param {string} url
 * @param {string} fallback 无法解析出描述时的兜底文案
 * @returns {Promise<never>}
 */
const throwFromResponse = async (response, url, fallback) => {
  let data = null
  try {
    const contentType = response.headers.get('content-type') || ''
    data = contentType.includes('application/json') ? await response.json() : await response.text()
  } catch (e) {
    data = null
  }
  const detail =
    data && typeof data === 'object'
      ? data.error || data.detail || data.message
      : typeof data === 'string' && data.trim()
        ? data.trim().slice(0, 200)
        : ''
  const message = detail || `${fallback}(${response.status})`
  if (response.status === 401) notifyUnauthorized(message)
  throw new HttpError(message, { status: response.status, data, url })
}

/**
 * SSE / 流式响应：返回原始 Response，由调用方通过 response.body.getReader() 消费
 * @param {string} url
 * @param {*} [body]
 * @param {Object} [options]
 * @returns {Promise<Response>}
 */
export const stream = async (url, body, options = {}) => {
  const response = await raw(url, { method: 'POST', body, ...options })
  if (!response.ok) await throwFromResponse(response, resolveUrl(url), '流式请求失败')
  return response
}

/**
 * 文件下载：返回 Blob
 * @param {string} url
 * @param {Object} [options]
 * @returns {Promise<Blob>}
 */
export const download = async (url, options = {}) => {
  const response = await raw(url, options)
  if (!response.ok) await throwFromResponse(response, resolveUrl(url), '下载失败')
  return response.blob()
}

/**
 * 文件上传：FormData 原样透传，浏览器自动设置 multipart 边界
 * @param {string} url
 * @param {FormData} formData
 * @param {Object} [options]
 * @returns {Promise<*>}
 */
export const upload = (url, formData, options = {}) =>
  request(url, { method: 'POST', body: formData, ...options })

const withMethod =
  (method) =>
  /**
   * @param {string} url
   * @param {*} [body]
   * @param {Object} [options]
   */
  (url, body, options = {}) =>
    request(url, { method, body, ...options })

export const http = {
  /**
   * @param {string} url
   * @param {Object} [params] 查询参数
   * @param {Object} [options]
   */
  get: (url, params, options = {}) => request(url, { method: 'GET', params, ...options }),
  post: withMethod('POST'),
  put: withMethod('PUT'),
  patch: withMethod('PATCH'),
  delete: withMethod('DELETE'),
  raw,
  request,
  stream,
  download,
  upload
}

export default http
