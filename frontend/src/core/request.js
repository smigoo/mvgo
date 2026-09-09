import { setRequestConfig, setInterceptor } from 'microvideo-request'
import { useConfigStore, useUserStore } from '@/store/modules'
import portletUtils from '@/utils/portlet'

/**
 * @description 处理code异常
 * @param {*} code
 * @param {*} msg
 */
const isPreviewRoute = () => {
  if (typeof window === 'undefined') return false
  const hash = window.location.hash || ''
  const path = hash.startsWith('#') ? hash.slice(1) : window.location.pathname || ''
  return path.startsWith('/preview/')
}

const handleCode = (code, msg) => {
  switch (code) {
    case 400:
      $message.error(msg || `请求参数错误`)
      break
    case 401:
      if (!isPreviewRoute()) {
        portletUtils.isPermission(1)
      }
      $message.error(msg || `授权未通过`)
      break
    case 406:
      $message.error(msg || `权限认证未通过`)
      break
    case 500:
      $message.error(msg || `服务器意外错误`)
      break
    case 501:
      $message.error(msg || `服务器不支持该请求功能`)
      break
    case 600:
      $message.error(msg || `服务器意外错误`)
      break
    default:
      $message.error(msg || `后端接口${code || ''}异常`)
      break
  }
}
/**
 * 请求配置
 * 基本配置，多服务配置，拦截器配置
 **/
export const requestConfig = {
  /**
   * 基本配置
   */
  config: {
    timeout: 100000,
    withCredentials: true, // 携带cookie，支持session验证
    headers: {
      'Content-Type': 'application/json;charset=UTF-8'
    },
    successStatus: $config.successStatus
  },
  /**
   * 多服务配置
   * 若无多服务配置，config.baseURL 必传
   * 若有多服务配置，config.baseURL 可不传，第一个服务配置为默认服务
   */
  servers: [
    {
      // 基础服务
      name: 'BASE_SERVER',
      url: $processEnv.VITE_APP_BASE_API
    },
    {
      // SBDS 组件服务
      name: 'SBDS_SERVER',
      url: $processEnv.VITE_APP_SBDS_API
    },
    {
      // 本地开发服务
      name: 'DEV_SERVER',
      url: '/dev'
    }
  ],
  /**
   * 请求之前回调
   * @param {Object} res
   */
  before: (res, resolve, reject) => {
    // 添加token：store 为空时向门户实时索取，避免门户注入晚于 store 初始化导致发空头
    const token = useUserStore().ensureToken()
    if (token) res.headers[$processEnv.tokenKey] = token
    try {
      const { apiHeaders, getApiCommonParams } = useConfigStore()
      // 添加headers 参数
      Object.keys(apiHeaders).forEach((key) => {
        res.headers[key] = apiHeaders[key]
      })
      /**
       * 统一传参
       * projectId 项目标识
       * operatorCode 当前操作人标识
       */
      const params = getApiCommonParams
      const dataKey = res.method === 'GET' ? 'params' : 'data'
      // 页面管理 以及 页面设计 需要传pageId来操作数据，如请求中pageId有内容的话 则取请求中的pageId 如没有的话则使用params内的pageId
      res[dataKey] = {
        ...res[dataKey],
        ...params,
        pageId: res[dataKey].pageId ? res[dataKey].pageId : params.pageId,
        pageElementSerial: res[dataKey].pageElementSerial
          ? res[dataKey].pageElementSerial
          : params.pageElementSerial
      }
    } catch (error) {
      console.log(error)
    }
  },
  /**
   * 请求成功回调
   * @param {Object} res
   */
  success: ({ data, config }, resolve, reject) => {
    if (config.responseType === 'blob') return resolve(data)
    // 统一响应契约兼容层: 含 code(数字) + success(布尔) 视为标准结构 { success, code, message, data }
    if (data && typeof data === 'object' && typeof data.code === 'number' && typeof data.success === 'boolean') {
      if (data.success) return resolve(data.data)
      handleCode(data.code, data.message)
      return reject('请求异常拦截:' + JSON.stringify({ detail: data.detail, code: data.code, message: data.message }))
    }
    const { code, message, detail } = data
    // 操作正常Code数组
    const codeVerificationArray = $radash.isArray($config.successCode)
      ? [...$config.successCode]
      : [...[$config.successCode]]
    // 是否操作正常
    if (codeVerificationArray.includes(code)) {
      resolve(data)
    } else {
      handleCode(code, message)
      reject('请求异常拦截:' + JSON.stringify({ detail, code, message }) || 'Error')
    }
  },

  /**
   * 请求失败回调
   * @param {Object} res
   */
  /**
   * 请求失败回调
   * @param {Object} res
   */
  error: ({ response }) => {
    const { status, data = {} } = response
    // 统一响应契约: 优先 message,兼容旧 detail 文本; 网关 401 统一归并为 401
    const code = status === 401 ? 401 : data.code || status
    const message = data?.message || (typeof data?.detail === 'string' ? data.detail : undefined)
    handleCode(code, message)
  }
}

/**
 * 初始化request请求配置
 * 配置默认的请求方式
 * */
setRequestConfig(requestConfig.config, requestConfig.servers)
// 请求之前拦截器
setInterceptor(requestConfig.before, 'BEFORE')
// 请求成功拦截器
setInterceptor(requestConfig.success, 'SUCCESS')
// 请求失败拦截器
setInterceptor(requestConfig.error, 'ERROR')
