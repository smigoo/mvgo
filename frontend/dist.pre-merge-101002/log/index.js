
const version = window.MCServeInfo?.MCVersion || ''
const title = window.MCServeInfo?.title || ''

// 创建渐变文字效果
const gradientText = `%c${title}%c`
const styles = [
  'background: linear-gradient(45deg, #ff6b6b, #4ecdc4, #45b7d1, #96ceb4, #feca57); background-size: 400% 400%; animation: gradient 3s ease infinite; color: white; padding: 4px 16px; border-radius: 8px; font-weight: bold; font-size: 14px; text-shadow: 2px 2px 4px rgba(0,0,0,0.3);',
  'background: linear-gradient(45deg, #667eea, #764ba2); color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; margin-left: 8px;'
]
// ${version}
// console.log(gradientText, ...styles)

// 添加一些有趣的日志
window.CURRENT_ENV === 'dev' && console.log(
  '%c🚀 欢迎使用 感智｜晓界工坊!',
  'color: #4CAF50; font-size: 16px; font-weight: bold;'
)
window.CURRENT_ENV === 'dev' && console.log('%c🎨 这是一个强大的组件仓库系统', 'color: #2196F3; font-size: 14px;')
window.CURRENT_ENV === 'dev' && console.log('%c⚡ 快速开发，高效部署', 'color: #FF9800; font-size: 14px;')

// 添加一些有用的信息
console.group(gradientText, ...styles)
console.log('%c版本:', 'color: #E91E63; font-weight: bold;', version)
console.log(
  '%c环境:',
  'color: #E91E63; font-weight: bold;',
  window.CURRENT_ENV === 'dev' ? '开发环境' : window.CURRENT_ENV === 'test' ? '测试环境' : window.CURRENT_ENV === 'stage' ? '试用环境' : '生产环境'
)

console.log(
  '%c时间:',
  'color: #E91E63; font-weight: bold;',
  new Date(Number(window.MCServeInfo.time)).toLocaleString('zh-CN')
)
console.groupEnd()



// 3秒后停止动画并显示最终信息
// setTimeout(() => {
//   console.log(gradientText, ...styles)
//   console.log('%c🎉 系统加载完成！', 'color: #4CAF50; font-size: 16px; font-weight: bold;')
//   console.log('%c🌟 开始你的微码之旅吧！', 'color: #FF9800; font-size: 14px;')
// }, 3000)