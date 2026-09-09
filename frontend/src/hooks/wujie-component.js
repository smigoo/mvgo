/**
 * wujie组件hooks
 * @returns {Object} 返回init函数
 */
export const wujieComponent = () => {
  // 获取父应用属性
  const wujieProps = window.$wujie?.props

  /**
   *
   * @param {Object} config 配置信息
   * config.layoutConfig 布局配置
   * config.event 事件信息
   */
  // 初始化函数
  function init({ config = {}, event = {} }) {
    // 布局配置初始化
    if (config.layoutConfig) {
      // 如果没有默认布局，则设置第一个布局为默认布局
      if (!config.layoutConfig.default) {
        config.layoutConfig.default = config.layoutConfig.list[0].value
      }
      // 设置当前布局类型
      config.currentLayoutType = config.layoutConfig.default
    }
    // wujie 初始化
    if (wujieProps.init) {
      wujieProps.init({ config, event })
    }
  }
  // 返回init函数
  return { init }
}
