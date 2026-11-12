// 当前环境类型 dev 开发环境 test 测试环境 prod 生产环境
const CURRENT_ENV = 'prod'

/**
 * 项目配置
 * 当前所属项目的业务配置
 */
const projectConfig = {
  // 运行环境类型
  VUE_APP_CURRENT_MODE: CURRENT_ENV,
  // 是否开启websocket
  isOpenWebsoket: false,
  // 项目名称
  title: '感智｜晓界工坊',
  // 微码日志是否打印
  loggerEnable: true,
  // tokenkey
  tokenKey: 'Token',
  // 链路追踪配置服务名
  SERVICE_NAME: 'mc-framework',
  // 链路追踪是否启用
  TRACING_ENABLED: false
}

/**
 * 区分环境的配置信息
 */
const envConfig = {
  // 开发环境
  dev: {
    // 微码平台基础后端服务
    VITE_APP_BASE_API: '/api',

    // 微码平台websoket服务
    VITE_APP_WEBSOKET_API: 'http://192.168.200.39/websocket-server/websocket',

    // 链路追踪地址
    VITE_APP_TRACING_API: 'http://192.168.200.39/v1/traces',

    // 登录失败跳转地址 #业务侧自填
    VITE_APP_LOGINFAILURL: 'https://mvp.gandongyun.cn/portlet/preview/TDIxMmIyMHZjR0ZuWlMxdFlXNWhaMlZ5THc9PQ==',

    // 微码 SBDS 组件服务
    VITE_APP_SBDS_API: 'https://mvp.gandongyun.cn/gateway/component-sbds',

  },
  // 测试环境
  test: {
    // 微码平台基础后端服务
    VITE_APP_BASE_API: 'http://192.168.200.39/microcode-framework/',
    // VITE_APP_BASE_API: 'http://192.168.200.37:18084/mvom',

    // 微码平台websoket服务
    VITE_APP_WEBSOKET_API: 'http://192.168.200.39/websocket-server/websocket',

    // 链路追踪地址
    VITE_APP_TRACING_API: 'http://192.168.200.39/v1/traces',

    // 登录失败跳转地址 #业务侧自填
    VITE_APP_LOGINFAILURL: 'http://192.168.200.39/portlet/preview/TDIxMmIyMHZjR0ZuWlMxdFlXNWhaMlZ5THc9PQ==',

    // 微码 SBDS 组件服务
    VITE_APP_SBDS_API: 'https://mvp.gandongyun.cn/gateway/component-sbds',

  },
  // 试用环境
  stage: {
    // 微码平台基础后端服务
    VITE_APP_BASE_API: 'https://mvp.gandongyun.cn/gateway/microcode-framework/',

    // 微码平台websoket服务
    VITE_APP_WEBSOKET_API: 'https://mvp.gandongyun.cn/microcode-framework/websocket',

    // 链路追踪地址
    VITE_APP_TRACING_API: 'http://192.168.200.39/v1/traces',

    // 登录失败跳转地址 #业务侧自填
    VITE_APP_LOGINFAILURL: 'https://mvp.gandongyun.cn/portlet/preview/TDIxMmIyMHZjR0ZuWlMxdFlXNWhaMlZ5THc9PQ==',

    // 微码 SBDS 组件服务
    VITE_APP_SBDS_API: 'https://mvp.gandongyun.cn/gateway/component-sbds',
  },
  // 生产环境
  prod: {
    // 微码平台基础后端服务（ECS Node 后端，Nginx 反代 /api/ → :13030）
    VITE_APP_BASE_API: '/api',

    // 微码平台websoket服务
    VITE_APP_WEBSOKET_API: 'wss://go.microvideo.cn/websocket',

    // 链路追踪地址
    VITE_APP_TRACING_API: 'http://192.168.200.37:4318/v1/traces',

    // 登录失败跳转地址 #业务侧自填
    VITE_APP_LOGINFAILURL: 'https://go.microvideo.cn/mvgo/login/',

    // 微码 SBDS 组件服务
    VITE_APP_SBDS_API: 'https://mvp.gandongyun.cn/gateway/component-sbds',
  }
}
// 挂载当前配置信息
$processEnv = Object.assign(projectConfig, envConfig[CURRENT_ENV])

window.document.title = $processEnv.title
window.CURRENT_ENV = CURRENT_ENV
// 为控制台日志系统提供配置信息
window.MC_CONFIG = {
  version: '1.0.0',
  title: $processEnv.title,
  publishTime: Date.now(),
  environment: CURRENT_ENV,
  baseApi: $processEnv.VITE_APP_BASE_API,
  websocketApi: $processEnv.VITE_APP_WEBSOKET_API
}

window.SHARE_CONFIG = {
  title: '查看链路追踪',
  placeHolder: '请输入验证码',
  inputLength: 20,
  btnText: '进入'
}

