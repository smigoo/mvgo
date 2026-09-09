/*
 * @Description 微码组件核心方法
 * @Author: 朱琦 1972662943@qq.com
 * @Date: 2025-06-04 20:15:46
 * @LastEditors: 潘强 panqiang1111
 * @LastEditTime: 2026-05-20 11:46:01
 * @FilePath: \src\core\microcode\core.js
 */
import { RuntimeBuilderKey, componentStore, createDeclare } from '@microcode/microcode-framework'

import { getThemeConfig, getCssVarsConfig, getPromptConfig, getComponentImagePath, getBusinessConfig } from './utils'

import { defaultCssVars, mcCssBuilder } from './css'
import { getComponentApi } from '@/core/microcode/mc-request-api'
import { mcMapLegend } from '@/hooks/mc-map-legend'

// 默认预览前缀
const defaultMcPreviewPrefix = 'mc-preview'
const DEFAULT_VALUE = Symbol()

// 构造器默认值配置
const runtimeBuilderDefault = {
  publishEvent: () => { },
  listenEvent: () => { },
  removeListener: () => { },
  mcFrameworkPublishEvent: () => { },
  mcFrameworkListenEvent: () => { },
  removemcFrameworkListener: () => { },
  _removeEventStatusEnums: () => { },
  mcFrameworkLayoutListenEvent: () => { },
  hasMcFrameworkEmitter: () => { },
  subscribeWebsocket: () => { },
  openLoadingEffect: () => { },
  closeLoadingEffect: () => { }
}

// 默认配置
const defaultConfig = {
  ...defaultCssVars
}

/**
 * 获取全局样式配置数据
 * @returns
 */
const setPageStyleConfig = () => {
  let pageStyle = {}
  let pageCssVars = {}
  const pageData = inject('PageStyleConfig', DEFAULT_VALUE)
  if (pageData && pageData !== DEFAULT_VALUE) {
    pageStyle.panelType = pageData.pageConfig?.panelType
    pageStyle.themeType = pageData.pageConfig?.themeType
    pageCssVars = { ...pageData.pageConfig }
  }
  return { pageStyle, pageCssVars }
}
/**
 * @description: 设置组件属性
 * @param {*} config
 * @param {*} declareInfo
 * @return {*}
 */
function setComponentProps(config, declareInfo) {
  const { pageStyle, pageCssVars } = setPageStyleConfig()

  const { layoutConfig, componentName } = declareInfo

  const { themeType, themeVars } = getThemeConfig(
    config.themeType || pageStyle.themeType,
    declareInfo,
    pageCssVars
  )

  const { styles, cssVars } = getCssVarsConfig(config, themeVars)

  const { prompts } = getPromptConfig(config, declareInfo)

  const businessConfig = getBusinessConfig(config, declareInfo)

  // 微码基础地图组件不需要有任何面板样式存在
  config.componentId === 'c-mc-map' && delete pageStyle.panelType

  return {
    ...config,
    // 唯一id
    id: config.id,
    // 组件是否隐藏
    hide: config.hide,
    // 组件名称（优先用 config 传入的，否则用 declare 中的）
    componentName: config.componentName || componentName,
    // 组件是否激活
    // active: config.active,
    // 组件布局类型
    panelType: config.panelType || pageStyle.panelType,
    // 组件布局类型
    layoutType: config.layoutType || layoutConfig?.default,
    // 组件主题类型
    themeType: config.themeType || pageStyle.themeType || themeType,
    // 业务属性字段
    businessConfig,
    // css 变量
    cssVars,
    // style样式
    style: styles,
    // 提示词信息
    prompts: prompts
  }
}

/**
 * @description: 获取组件事件实例名
 * @param {*} instanceId
 * @param {*} eventName
 * @return {*}
 */
const getEventInstanceName = (instanceId, eventName) => {
  return `${instanceId}_AIOMC_${eventName}`
}

/**
 * 获取运行时组件的事件总线
 * @returns eventBus
 */
export const getRuntimeBuilder = (instanceId) => {
  if (window.$wujie) {
    // wujie模式
    const props = window.$wujie.props

    const mainAppData = props.mainAppData

    onUnmounted(() => {
      window.$wujie.bus.$off('Mc2AioPublishEvent')
    })

    return {
      ...runtimeBuilderDefault,
      publishEvent: (eventName, data) => {
        window.$wujie.bus.$emit('Mc2AioPublishEvent', getEventInstanceName(instanceId, eventName), {
          ...data,
          mainAppData
        })
      },
      listenEvent: (eventName, fun) => {
        window.$wujie.bus.$on(getEventInstanceName(instanceId, eventName), fun)
      },
      removeListener: (eventName, fun) => {
        window.$wujie.bus.$off(getEventInstanceName(instanceId, eventName), fun)
      }
    }
  } else {
    // 微码框架模式
    const bus = inject(RuntimeBuilderKey, DEFAULT_VALUE)
    if (bus === DEFAULT_VALUE) {
      return runtimeBuilderDefault
    }

    return bus
  }
}

/**
 * 微码组件构造器
 * @returns {runtimeBuilder, componentProps, businessProps, componentDeclareInfo}
 */
export const mcComponentBuilder = (options = {}) => {
  // console.log('[MicroCode] $mcComponentBuilder', options)

  const currentInstance = getCurrentInstance()
  const { proxy } = currentInstance
  const attrs = proxy.$attrs

  // 组件id
  // TODO: attrs.businessProps?.componentId 需要优化
  const componentId = options.id || attrs.businessProps?.componentId || attrs.componentId

  // 是否是业务组件
  const isMcComponent = componentId && componentId !== 'base-panel'

  // 当前组件
  let currentComponent = {
    // 声明信息
    declareInfo: {},
    // 组件实例
    asyncComponent: {}
  }

  // 业务传参
  let businessProps = reactive({})
  // 组件传参 (响应式)
  let componentProps = reactive({})

  // 设置组件名
  currentInstance.type.__name = componentId

  // 业务组件
  Object.assign(
    currentComponent,
    componentStore().getComponent(isMcComponent ? componentId : attrs.componentId)
  )
  if (window.$wujie) {
    // wujie环境下
    Object.assign(businessProps, window.$wujie.props?.businessProps)
    Object.assign(
      componentProps,
      setComponentProps(window.$wujie.props?.childAppData, currentComponent.declareInfo)
    )

    // 监听props变化
    window.$wujie.bus.$on('update:props', (newProps) => {
      const nComponentProps = newProps.childAppData
      if (nComponentProps.id === componentProps.id) {
        Object.assign(businessProps, newProps.businessProps)
        Object.assign(
          componentProps,
          setComponentProps(newProps.childAppData, currentComponent.declareInfo)
        )
        // console.log(
        //   '[wujie] 子应用 businessProps 更新',
        //   options?.name,
        //   new Date().getTime(),
        //   componentProps.id,
        //   businessProps,
        // )
      }
    })

    if (window.$wujie.props?.childAppData?.portlet?.token) {
      useUserStore().setToken(window.$wujie.props?.childAppData?.portlet?.token)
    }
    if (window.$wujie.props?.childAppData?.portlet?.userInfo) {
      useUserStore().setUserInfo(window.$wujie.props?.childAppData?.portlet?.userInfo)
    }
    if (isMcComponent) {
      window.$wujie.props.init({
        // 提供组件事件
        mcEvent: options?.mcEvent,
        mcDeclareInfo: currentComponent.declareInfo
      })

      // 设置 api 请求头配置，用于一体化平台鉴权
      useConfigStore().setApiConfig({
        apiHeaders: window.$wujie.props?.childAppData?.apiHeaders
      })
      onMounted(() => { })
    }

    onUnmounted(() => {
      window.$wujie.bus.$off('update:props')
    })
  } else {
    // 微码环境下
    businessProps = {
      // 业务传参，业务组件自定义的配置信息，无需框架处理
      ...attrs.businessProps,
      // 事件交互传参
      payload: attrs.payload
      // …… 框架处理的业务操作
    }
    // 通过页面配置的组件属性
    componentProps = reactive(setComponentProps(attrs, currentComponent.declareInfo))
  }
  provide('componentProps', componentProps)
  const componentInfo = {
    ...currentComponent.declareInfo,
    componentSerialNumber: componentProps.componentSerialNumber
  }
  return {
    // 组件id
    componentId: componentId,
    // 组件声明信息
    componentDeclareInfo: currentComponent.declareInfo,
    // 组件的事件总线
    runtimeBuilder: getRuntimeBuilder(componentProps.id),
    // componentProps: inject(ComponentProp),
    // componentLayout: inject(Container),
    // 组件业务传参
    businessProps,
    // 组件配置传参
    componentProps,
    // 组件api请求
    componentApi: getComponentApi(componentInfo, componentProps.containerId)
  }
}

/**
 * @description: 设置微码声明信息
 * @param {*} declareInfo
 * @param {*} metaUrl
 * @return {*}
 */
export const createMcDeclare = ({ declareConfig, metaUrl, cssVars }) => {
  // 创建声明信息对象
  let declareInfo = createDeclare(declareConfig)

  // 将CSS变量添加到声明信息对象中
  declareInfo.cssVars = cssVars

  // 确保 attribute 字段存在（兼容旧组件）
  if (!declareInfo.attribute) {
    declareInfo.attribute = {}
  }

  // 统一使用getMcImgUrl，并确保生产环境路径正确
  if (!declareInfo.attribute.imgUrl) {
    declareInfo.attribute.imgUrl = getComponentImagePath(
      `${defaultMcPreviewPrefix}.png`,
      declareInfo
    )
  }
  // 布局配置扩展
  if (declareInfo.layoutConfig && declareInfo.layoutConfig.list?.length) {
    // 如果声明信息对象中有布局配置且列表不为空
    // 获取预览图片地址
    declareInfo.layoutConfig.list = declareInfo.layoutConfig.list.map((item) => {
      // 为每个列表项设置预览图片地址
      item.previewUrl = getComponentImagePath(item.previewName, declareInfo)
      return item
    })
  }
  return declareInfo
}

/**
 * @description: 获取微码默认配置
 * @param {*} key
 * @return {*}
 */
export const getMcDefaultConfig = (key) => {
  return defaultConfig[key]
}
export { mcCssBuilder }

export { mcMapLegend }
