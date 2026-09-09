import { withInstallComponents } from '@microcode/microcode-framework'

import layerConfig from '@/layer-config'

// 获取感动组件库组件 定义文件
const businessComponent = import.meta.glob('@/components/**/declare.{js,ts}', { eager: true })
// 获取项目内正式发布的 Vue3 workspace 组件定义文件；custom-components 仅本地/测试预览使用，不参与生产构建
const workspaceVue3Component = import.meta.glob('@/workspace/vue3-components/**/declare.{js,ts}', {
  eager: true
})
// 合并加载注册
const businessDeclares = { ...businessComponent, ...workspaceVue3Component }


// 感动组件库组件 vue import时不需要{ eager: true } 如果写了会报错loader
const businessComponentAsyncload = import.meta.glob('../components/**/component.{js,ts}')
// 获取项目内正式发布的 Vue3 workspace 组件；custom-components 不参与生产构建
const workspaceVue3ComponentAsyncload = import.meta.glob(
  '../workspace/vue3-components/**/component.{js,ts}'
)
// 合并
const businessComponentAsync = {
  ...businessComponentAsyncload,
  ...workspaceVue3ComponentAsyncload
}


// 感动组件库组件 vue import时不需要{ eager: true } 如果写了会报错loader
const businessPanelComponent = import.meta.glob('@/components/@mv-business-panels/*/*.vue')
// 获取项目内自定义开发组件 vue import时不需要{ eager: true } 如果写了会报错loader
const customPanelComponent = import.meta.glob('@/workspace/custom-panels/*/*.vue')
// 合并
const PanelComponentAsync = { ...businessPanelComponent, ...customPanelComponent }

/**
 * 注册业务组件
 * 图例配置项
 * 面板组件
 * @param {*} config 
 */
export const setupBusiness = (config) => {
  const options = {
    businessDeclares,
    businessComponentAsync,
    PanelComponentAsync,
    isWujie: $isWujie,
    layerConfig,
    loggerEnable: $processEnv.loggerEnable,
  }
  const withInstallComponentsStore = withInstallComponents(options)
  withInstallComponentsStore.setupBusiness(config)
}