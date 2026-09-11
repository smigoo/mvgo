// resources/config/css-vars.js
// 环境监测组件（environment-monitor）CSS 变量配置
// 微码规范要求：
//   1. 本文件必须导出 cssVars，供平台按主题注入到组件根节点；
//   2. 本文件必须导出 dark 对象（深色主题变量）；（M4-8）
//   3. 本文件必须导出 common 对象（各主题通用变量）；
// resources/styles/index.less 中的 var(--mc-*) 变量即由此提供默认值。

// 通用变量（不随主题变化，light / dark 共用）
export const common = {
  '--mc-radius': '4px',
  '--mc-spacing-xs': '4px',
  '--mc-spacing-sm': '8px',
  '--mc-spacing-md': '12px',
  '--mc-spacing-lg': '16px'
}

// 浅色主题（默认），与 resources/styles/themes/light.less 保持一致
export const light = {
  '--mc-primary': '#4A90E2',
  '--mc-text': '#3D4852',
  '--mc-border': '#8A9199',
  '--mc-bg': '#E4EEF5',
  '--mc-panel-bg': '#FFFFFF',
  '--mc-title-color': '#4A90E2',
  '--mc-success': '#40D9A0',
  '--mc-danger': '#E74C3C',
  '--mc-warning': '#E74C3C',
  '--mc-radius': '4px',
  '--mc-spacing-xs': '4px',
  '--mc-spacing-sm': '8px',
  '--mc-spacing-md': '12px',
  '--mc-spacing-lg': '16px',
  '--mc-font-size-xs': '9px',
  '--mc-font-size-sm': '11px',
  '--mc-font-size-md': '14px',
  '--mc-font-size-lg': '16px'
}

// 深色主题（M4-8 要求：必须显式导出 dark 对象），与 resources/styles/themes/dark.less 保持一致
export const dark = {
  '--mc-primary': '#5AA9FF',
  '--mc-text': '#D6DCE3',
  '--mc-border': '#4A5560',
  '--mc-bg': '#1E2833',
  '--mc-panel-bg': '#141A21',
  '--mc-title-color': '#5AA9FF',
  '--mc-success': '#40D9A0',
  '--mc-danger': '#FF6B5B',
  '--mc-warning': '#FF6B5B',
  '--mc-radius': '4px',
  '--mc-spacing-xs': '4px',
  '--mc-spacing-sm': '8px',
  '--mc-spacing-md': '12px',
  '--mc-spacing-lg': '16px',
  '--mc-font-size-xs': '9px',
  '--mc-font-size-sm': '11px',
  '--mc-font-size-md': '14px',
  '--mc-font-size-lg': '16px'
}

// 按主题 key 聚合并导出，供平台注入（key 与 declare.json 的 themeConfig.list 一一对应）
// 使用显式键值（dark: dark）而非对象简写，确保 dark 对象被稳定识别与导出
export const cssVars = {
  common: common,
  light: light,
  dark: dark
}

export default cssVars
