import devConfig from '@/config/dev-config'
// import { title, titleReverse, titleSeparator } from '@/config'
import config from '@/config'


/**
 * @description: 获取父级门户地址query信息
 * @return {*}
 */
function getParentQuery() {
  // 没有父级门户不处理
  if (!window.parent.getToken) return
  const search = window.parent.location.search.substring(1) // 去掉开头的 ?
  if (!search) return {}
  return Object.fromEntries(
    search.split('&').map((pair) => {
      const [key, value] = pair.split('=')
      return [decodeURIComponent(key), decodeURIComponent(value || '')]
    })
  )
}

/**
 * @description: 获取父级容器信息
 * @param {*} key
 * @return {*}
 */
function getParentInfo(key, defaultValue = null) {
  // 开发环境：父级门户优先（支持本地嵌真实门户 iframe 联调拿真 token），
  // 拿不到（纯本地、window.parent === window）再回落到 dev-config 假数据。
  if (import.meta.env.VITE_MODE === 'development') {
    try {
      const fromParent = window.parent?.[key]
      if (typeof fromParent === 'function') {
        const val = fromParent()
        if (val !== undefined && val !== null) {
          try {
            return JSON.parse(val)
          } catch {
            return val
          }
        }
      }
    } catch (e) {
      // 父级调用异常（跨域/方法缺失等），忽略并回落到 dev-config
    }
    return devConfig[key] || defaultValue
  }
  try {
    if (localStorage.getItem('lite' + key)) {
      try {
        return JSON.parse(localStorage.getItem('lite' + key))
      } catch (e) {
        return localStorage.getItem('lite' + key)
      }
    }
    return (window.parent[key] && JSON.parse(window.parent[key]())) || defaultValue
  } catch (e) {
    return (window.parent[key] && window.parent[key]()) || defaultValue
  }
}

function replaceStateHistory(params = {}) {
  // 没有父级门户不处理
  if (!window.parent.getToken) return
  if (window.parent.replaceStateHistory) {
    window.parent.replaceStateHistory(params)
  } else {
    const url = new URL(window.parent.location.origin + window.parent.location.pathname)
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value)
    })
    window.parent.history.replaceState(null, '', url.toString())
  }
}

let ticketStripped = false
/**
 * 消费一次性 CAS ticket 后，把父页 URL 的 ticket 参数摘掉。
 * 门户 ST 票据一次性有效：首次进 iframe 由门户消费并注入 AT；若 URL 里不摘掉，
 * 之后浏览器刷新会带着已失效的死票重发，门户校验失败弹「系统维护中」，形成死循环。
 * 摘掉后刷新不再带死票，门户会重新签发 ST，体验恢复。
 * @returns {void}
 */
function stripTicketFromParent() {
  // 非门户环境（纯本地/独立部署）不处理
  if (window.parent === window) return
  if (typeof window.parent.getToken !== 'function') return
  if (ticketStripped) return
  try {
    const url = new URL(window.parent.location.href)
    if (!url.searchParams.has('ticket')) return
    url.searchParams.delete('ticket')
    window.parent.history.replaceState(null, '', url.toString())
    ticketStripped = true
  } catch (e) {
    // 跨域/异常忽略，不影响主流程
  }
}

function setAioPortlet(data) {
  window.getToken = () => data.token
  window.getUserInfo = () => data
}
/**
 * @description: 获取标题
 * @param {*} pageTitle
 * @returns
 */
function getPageTitle(pageTitle) {
  let newTitles = []
  if (pageTitle) newTitles.push(pageTitle)
  if ($processEnv.title) newTitles.push($processEnv.title)
  if (config.titleReverse) newTitles = newTitles.reverse()
  return newTitles.join(config.titleSeparator)
}
/**
 * @description: 根据路由meta信息设置标题
 * @param {*} route
 * @returns
 */
function applyRouteTitle(route) {
  const pageTitle = route?.meta?.title
  const title = getPageTitle(pageTitle)

  if (!window.parent.setTitle) {
    document.title = title
  } else {
    window.parent?.setTitle?.(title)
  }
}
/**
 * @description: 通知父页面路由变化（用于iframe嵌入场景）
 * @param {*} href
 * @returns
 */
function routeChange(href) {
  if (window.parent !== window) {
    const missage = {
      type: 'routeChange',
      params: {
        route: href
      }
    }
    window.parent.postMessage(missage, '*')
  }
}

/**
 * 是否有权限
 * @param {*} type 1 接口请求判断权限, 2 路由跳转判断权限
 * @returns Boolean
 */
function isPermission(type) {
  // 本地开发环境直接返回无权限拦截
  if (process.env.NODE_ENV === 'development') {
    return false
  }

  // 检查是否在portlet环境中（通过是否存在getToken方法判断）
  const isInPortlet = !!window.parent?.getToken

  // 不在 portlet 环境时交给应用自身登录页处理，避免 /mvgo/login 直访时反复跳转门户。
  if (!isInPortlet) {
    return false
  }

  // 在portlet中且为接口请求为401时，需要权限验证
  if (type === 1) {
    // 触发父页面刷新以重新认证：先摘掉已失效的 ticket，避免带死票 reload 仍弹「系统维护中」
    stripTicketFromParent()
    window.parent?.location?.reload()
    return true
  }

  // 其他情况无需拦截
  return false
}

/**
 * 鉴权失败时，门户内刷新父页面触发门户重新鉴权（token 由门户重新注入）。
 * 用于替代「跳转到应用自身登录页」——门户鉴权模式下登录页不存在。
 * @returns {boolean} 已处理返回 true（门户内）；非门户环境返回 false，由调用方兜底（如跳 /login）
 */
function reloadParentForReauth() {
  if (window.parent !== window && typeof window.parent.getToken === 'function') {
    // 先摘掉已失效的 ticket，避免带死票 reload 仍弹「系统维护中」
    stripTicketFromParent()
    window.parent.location.reload()
    return true
  }
  return false
}

export default {
  getParentQuery,
  getParentInfo,
  replaceStateHistory,
  stripTicketFromParent,
  setAioPortlet,
  applyRouteTitle,
  routeChange,
  isPermission,
  reloadParentForReauth
}
