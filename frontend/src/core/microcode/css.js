/*
 * @Description: 微码核心-css方法处理
 * @Author: 朱琦 1972662943@qq.com
 * @Date: 2025-07-07 13:45:24
 * @LastEditors: 朱琦 1972662943@qq.com
 * @LastEditTime: 2025-07-07 14:23:09
 * @FilePath: /src/core/microcode/css.js
 */
import { theme } from '@/config/theme-config'
const { pxtorem, defaultCssVars } = theme

// 基准字体大小
const baseFontSize = defaultCssVars.baseFontSize

/**
 * @description: 获取微码CSS 尺寸（根据基准值计算）
 * @param {*} realFontSize
 * @return {*}
 */
const getCssSize = (realSize) => {
  const value = realSize || baseFontSize
  return pxtorem.open ? value / pxtorem.baseSize + 'rem' : value + 'px'
}

/**
 * @description: 获取微码CSS em值
 * @param {*} realSize 真实尺寸
 * @param {*} base 基础尺寸（默认为基准字体大小）
 * @return {*}
 */
const getCssEm = (realSize, base = baseFontSize) => {
  return realSize / base + 'em'
}

/**
 * @description: 获取配置
 * @param {*} key
 * @return {*}
 */
const getConfig = (key) => {
  return key ? defaultCssVars[key] : defaultCssVars
}

/**
 * @description: 微码css构造器
 * @return {*}
 */
const mcCssBuilder = {
  getCssSize,
  getCssEm,
  getConfig
}
export { defaultCssVars, mcCssBuilder }
