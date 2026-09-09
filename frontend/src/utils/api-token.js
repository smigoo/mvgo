/**
 * @Description: 门户 token 统一取值
 *
 * 后端 SessionGuard 要求请求带 Token 头或已建立 session，首屏并行请求若不带 Token
 * 会因 session 尚未建立而全部 401。Token 的实际注入由 core/http.js 统一完成，
 * 本模块只负责「向门户实时索取 token 并缓存」这一件事。
 *
 * 注意：token 必须实时取，不能依赖模块初始化时的快照——门户注入 getToken 的时机
 * 可能晚于前端模块加载。
 */
import portlet from '@/utils/portlet'

// 门户注入 getToken 可能晚于 store 初始化，用缓存兜住已取到的值
let cachedToken = null

/**
 * 实时获取门户 token：优先向门户索取，取不到再用缓存
 * @returns {string|null}
 */
export function getAuthToken() {
  try {
    const fromSearch = new URLSearchParams(window.location.search).get('token')
    const hashQuery = window.location.hash.includes('?') ? window.location.hash.split('?').slice(1).join('?') : ''
    const fromHash = hashQuery ? new URLSearchParams(hashQuery).get('token') : null
    const urlToken = fromSearch || fromHash
    if (urlToken) {
      cachedToken = urlToken
      return urlToken
    }
  } catch (e) {
    // 当前环境不支持 URLSearchParams 或无法访问 location，继续回落
  }
  try {
    const fresh = portlet.getParentInfo('getToken')
    if (fresh && typeof fresh === 'string') {
      cachedToken = fresh
      // 首次成功取到门户 token，说明一次性 ticket 已被消费，摘掉父页 URL 的 ticket 防死票刷新
      portlet.stripTicketFromParent()
      return fresh
    }
  } catch (e) {
    // 门户方法缺失/跨域，回落缓存
  }
  return cachedToken
}

/**
 * 外部（如登录流程）主动写入 token
 * @param {string} token
 */
export function setAuthToken(token) {
  if (token && typeof token === 'string') cachedToken = token
}

