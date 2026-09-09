import packageConfig from '../../../package.json'
/**
 * @description: 获取样式配置
 * @return {*}
 */
export function getCssVarsConfig(config, themeVars) {
  const prefix = '--'
  const cssConfig = { styles: {}, cssVars: {} }
  const cssVars = config.cssVars || {}
  const unit = config.unitDataVars || {}

  Object.keys(themeVars).forEach((key) => {
    const stylesKey = prefix + key
    if ($radash.isEmpty(cssVars[key])) {
      // 取默认预设值
      cssConfig.cssVars[key] = themeVars[key]
      cssConfig.styles[stylesKey] = themeVars[key]
    } else {
      // 取配置值
      if (unit[key]) {
        cssConfig.cssVars[key] = cssVars[key] + unit[key]
        cssConfig.styles[stylesKey] = cssVars[key] + unit[key]
      } else {
        cssConfig.cssVars[key] = cssVars[key]
        cssConfig.styles[stylesKey] = cssVars[key]
      }
    }
  })

  return cssConfig
}

/**
 * @description: 获取主题对应变量配置
 * @param {*} themeType 主题类型
 * @param {*} declareInfo 配置文件
 * @return {*} themeType 主题类型 themeVars 主题变量
 */
export function getThemeConfig(themeType, declareInfo, pageCssVars = {}) {
  const { cssVars = {}, themeConfig } = declareInfo

  const theme = themeType || themeConfig?.default

  return {
    themeVars: { ...cssVars.common, ...cssVars[theme], ...pageCssVars },
    themeType: theme
  }
}

export function getBusinessConfig(config, declareInfo) {
  let businessConfig = {}
  if (config && config.businessConfig && JSON.stringify(config.businessConfig) === '{}') {
    declareInfo?.businessConfig?.forEach((item) => {
      businessConfig[item.key] = item.default || ''
    })
  } else {
    businessConfig = config.businessConfig
  }
  return businessConfig
}

/**
 * @description: 获取提示词配置
 * @param {*} config 组件配置
 * @param {*} declareInfo 配置文件
 * @return {*}
 */
export function getPromptConfig(config, declareInfo) {
  const _prompts = {}
  const { prompts = {} } = config
  const { promptConfig } = declareInfo

  // 以配置文件为准
  if (Array.isArray(promptConfig)) {
    promptConfig.forEach((item) => {
      _prompts[item.key] = Object.hasOwn(prompts, item.key) ? prompts[item.key] : item.value
    })
  }

  return { prompts: _prompts }
}

/**
 * @description: 获取微码组件相对图片地址
 * @param {*} name
 * @param {*} metaUrl
 * @return {*}
 */
export function getMcImgUrl(name, metaUrl) {
  const url = new URL(`./resources/images/${name}`, metaUrl).href
  return url.includes('undefined') ? '' : url
}

/**
 * 获取微码组件相对图片地址
 * @param {*} name
 * @param {*} declareInfo
 * @returns
 */
let businessComponentPreview = null
const regex = /-v[0-9]+(?:\.[0-9]+)*/g

export function getComponentImagePath(name, declareInfo) {
  if (!businessComponentPreview) {
    businessComponentPreview = import.meta.glob(`@/**/mc-preview*.png`, { eager: true })
  }
  const matched = Object.entries(businessComponentPreview).find(([path]) => {
    const componentId = path.split('/')[path.split('/').length - 4]
    const urlId = path.split('/')[path.split('/').length - 1]
    let id = componentId
    if (regex.test(componentId)) {
      // 重新设置 lastIndex 以确保正确匹配
      regex.lastIndex = 0
      // 截取版本号之前的部分
      id = componentId.replace(regex, '')
    }
    return id === declareInfo?.componentId && urlId === name
  })
  if (matched) {
    if (/^(https?:)/.test(matched[1].default)) {
      return matched
    } else {
      return (window?.__WUJIE_PUBLIC_PATH__ || '') + matched[1].default
    }
  } else {
    return (window?.__WUJIE_PUBLIC_PATH__ || '') + `/${packageConfig.publicPath}/static/png/${name}`
  }
}
/**
 * 显示数据源配置缺失的错误消息对话框
 * @param {string} dsName - 数据源名称
 * @returns {object} 返回错误消息对象
 */
export function messageDailog(dsName) {
  return $message.error(
    '未找到:【' + dsName + '】本地请求数据配置,请在/api/dev-api-request.js中添加'
  )
}
/**
 * 根据数据源名称和组件ID获取开发环境API请求配置
 * @param {Array} devApiRequest - 开发环境API请求配置数组
 * @param {string} dsName - 数据源名称
 * @param {string} componentId - 组件ID
 * @returns {Object|undefined} 匹配的开发请求配置数据，如果未找到则返回undefined
 */
export function getDevApiRequestConfig(devApiRequest, dsName, componentId) {
  const devRequestData = devApiRequest.find(
    (i) => i.dsName === dsName && i.componentId === componentId
  )
  return devRequestData
}
