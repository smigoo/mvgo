/*
 * @Author: smigoo(xsmigoo@gmail.com)
 * @Date: 2024-04-24 21:50:55
 * @LastEditors: 潘强 panqiang1111
 * @LastEditTime: 2026-03-05 17:07:41
 * @Description:入口文件
 * @Copyright: © 2024 Microvideo
 */
import '@/utils/tracing.js'
import { createApp } from 'vue'
import App from './App.vue'
import { setupRouter, eventComponentAddRoute } from './router'
import { setupStore } from './store'
// import config from './config'
// 动态路由权限
import '@/router/permission.js'
// 按需引入配置
import lazyUse from '@/core/lazy-use'
// 兼容多服务请求配置Microvideo
import '@/core/request'
import 'vue3-colorpicker/style.css'
// 引入 Ant Design Vue 全局样式
import 'ant-design-vue/dist/reset.css'

// 语音转文字插件（仅开发环境加载，生产环境不连接 MVP WebSocket）
import mvRecorder from '@/components/base-components/mv-recorder'
// 功能开关指令 v-feature
import featureDirective from '@/directives/feature'

async function initApp() {
  if (window.__POWERED_BY_WUJIE__) {
    let app
    window.__WUJIE_MOUNT = async () => {
      // 必须在此创建app
      app = createApp(App)
      eventComponentAddRoute()
      await setupRouter(app)
      app.use(lazyUse)
      // 注册功能开关指令
      app.use(featureDirective)
      setupStore(app)
      // 仅开发环境加载录音器（避免生产环境连接 MVP WebSocket）
      if (import.meta.env.DEV) app.use(mvRecorder)

      app.mount('#app')
    }
    window.__WUJIE_UNMOUNT = () => {
      app.unmount()
    }
    window.__WUJIE.mount()
  } else {
    const app = createApp(App)
    eventComponentAddRoute()
    await setupRouter(app)
    setupStore(app)
    app.use(lazyUse)
    // 注册功能开关指令
    app.use(featureDirective)
    // 仅开发环境加载录音器（避免生产环境连接 MVP WebSocket）
    if (import.meta.env.DEV) app.use(mvRecorder)

    app.mount('#app')
  }
}
initApp()
