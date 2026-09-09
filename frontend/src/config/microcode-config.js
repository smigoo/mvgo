/*
 * @Description:自定义配置文件
 * @Author: smigoo(xsmigoo@gmail.com)
 * @Date: 2024-04-27 20:11:02
 * @LastEditors: 潘强 panqiang1111
 * @LastEditTime: 2026-04-30 15:16:31
 * @Copyright: © 2024 Microvideo
 */
import { setupBusiness } from '../core/vcf.js'
// 如果需要手动引入import，然后在businessComponentDeclare中定义
// import { defalt as audioPlayerDeclare } from '../workspace/audio-player/declare'
// import { defalt as trafficSituationDeclare } from '../workspace/traffic-situation/declare'
import pinia, { useUserStore } from '@/store'
import packageConfig from '/package.json'

// 注意：不可在模块顶层调用 useUserStore(pinia)。
// 与 hooks/mc-map-legend.js 同源的循环依赖问题：@/store 经 export * 再导出 useUserStore，
// 在模块互相求值的环中顶层调用会命中 const 暂时性死区（TDZ），报 "before initialization"。
// 改用 getter 惰性读取，运行时（所有模块已就绪）才访问 store，规避死区。
const microcodeConfig = {
  // 微码平台相关配置
  logicBaseUrl: 'https://logic.bctools.cn', // 逻辑引擎根目录url
  websoketUrl: $processEnv.VITE_APP_WEBSOKET_API,
  isOpenWebsoket: $isWujie ? false : $processEnv.isOpenWebsoket,
  logger: {
    enable: $processEnv.loggerEnable,
    level: 'debug'
  },
  publicPath: packageConfig.publicPath,
  systemEventBusUrl: 'http://src/workspace/',
  tracing: {
    SERVICE_NAME: $processEnv.SERVICE_NAME,
    COLLECTOR_URL: $processEnv.VITE_APP_TRACING_API,
    TRACING_ENABLED: $processEnv.TRACING_ENABLED
  },
  get userInfo() {
    return useUserStore(pinia).userInfo // 用户信息 用于连接websocket（惰性，避免 TDZ）
  },
  //自定义主题
  event: {
    // cssFile: [import('@/assets/styles/index.less'), import('@/assets/styles/index2.less')],
    // preview: ['../image1.jpg', '../image1.jpg'],
  },
  autoImport: {
    open: true // 是否自动引入workspace下的业务组件，如果false 需要在businessComponentDeclare手动引入
    // businessComponentDeclare: [trafficSituationDeclare, audioPlayerDeclare],
  }
}
export { microcodeConfig, setupBusiness }
