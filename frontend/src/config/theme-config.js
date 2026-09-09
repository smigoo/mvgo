/*
 * @Description: 系统主题配置文件
 * @Author: 朱琦 1972662943@qq.com
 * @Date: 2025-07-05 19:20:21
 * @LastEditors: 朱琦 1972662943@qq.com
 * @LastEditTime: 2025-07-05 20:29:11
 * @FilePath: /src/config/theme-config.js
 */

// 主题相关配置
const theme = {
  pxtorem: {
    open: true, // 是否开启px转rem功能
    baseSize: 16, // 结果为：设计稿元素尺寸/16，比如元素宽3.2rem,最终页面会换算成 2000px
    uiSize: 1920, // 当前页面宽度相对于19.2rem屏幕宽的缩放比例，可根据自己需要修改。
    uiHSize: 1080 // 用户处理非正常比例
  },
  // 默认css变量配置
  defaultCssVars: {
    // 基准字体大小
    baseFontSize: 14,
    // 默认字体颜色
    colorTextBase: '#000'
  }
}
export { theme }
