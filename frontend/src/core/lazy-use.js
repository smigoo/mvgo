/*
 * @Author: smigoo(xsmigoo@gmail.com)
 * @Date: 2024-04-12 16:24:14
 * @LastEditors: 潘强 panqiang1111
 * @LastEditTime: 2026-06-30 13:38:22
 * @Description:
 */
import '@microcode/microcode-framework/dist/style.css'
import '@microcode/designer/dist/designer.css'
import '@/assets/styles/index.less'
import 'dayjs/locale/zh-cn'
import dayjs from 'dayjs'
import '@/utils/rem.js'
import { setupFramework } from '@microcode/microcode-framework'
import { setupPageDesign } from '@microcode/designer'
// 全引入局配置
import config from '@/config'
import MvComponent from 'microvideo-component'
import { microcodeConfig, setupBusiness } from '../config/microcode-config'
import MvMap from 'microvideo-map'
import 'microvideo-map/dist/lib/style.css'
import mapIconConfig from '@/layer-config/map-icon-config.js'
import directive from './directive'
export default {
  install: async (app) => {
    setupPageDesign(app, { ...microcodeConfig, ...config })
    app
      .use(MvComponent)
      .use(MvMap, {
        initMapConfig: {},
        mapIconConfig
      })
      .use(directive)
    /**
     * 框架的配置
     * */

    // TODO: 一体化加载要注册全局组件
    // if (!$isWujie) {
    setupFramework(app, {
      ...microcodeConfig,
      pxtorem: config.pxtorem
    })
    // }
    /**
     * 业务组件主题自定义
     *
     * */
    setupBusiness({
      thme: {
        //自定义主题
        event: microcodeConfig.event
      }
    })

    // 工具类相关
    app.config.globalProperties.$dayjs = dayjs
    app.config.globalProperties.$config = config
    app.config.globalProperties.$setGlobalProperties = (key, value) => {
      app.config.globalProperties[key] = value
    }

    app.config.globalProperties.getGlobalVue = () => app
    $message.config({ top: '60px' })
  }
}
