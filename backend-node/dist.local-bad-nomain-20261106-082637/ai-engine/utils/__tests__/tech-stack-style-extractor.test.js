/**
 * 技术栈样式提取器单元测试
 * 验证视觉识别驱动的容器样式提取逻辑
 */

import {
  isTechStackNode,
  parseTechStackHint,
  needsDeepStyles,
  extractVisualContainerStyles,
  formatContainerStylesAsCSS,
} from '../tech-stack-style-extractor.js'

console.log('🧪 技术栈样式提取器单元测试')
console.log('=' .repeat(50))

// 测试1: isTechStackNode
console.log('\n测试1: isTechStackNode()')
const testCases1 = [
  { input: '@ant/select', expected: true, desc: 'Ant Design 组件' },
  { input: '@echarts/bar', expected: true, desc: 'ECharts 图表' },
  { input: '@element/button', expected: true, desc: 'Element Plus 组件' },
  { input: 'icon@2x', expected: false, desc: '分辨率后缀（不是技术栈）' },
  { input: 'icon@3x.png', expected: false, desc: '分辨率后缀（不是技术栈）' },
  { input: 'normal-frame', expected: false, desc: '普通节点' },
  { input: '', expected: false, desc: '空字符串' },
  { input: null, expected: false, desc: 'null' },
]

let passCount1 = 0
testCases1.forEach(({ input, expected, desc }) => {
  const result = isTechStackNode(input)
  const pass = result === expected
  if (pass) passCount1++
  console.log(`  ${pass ? '✓' : '✗'} ${desc}: "${input}" → ${result} (期望: ${expected})`)
})
console.log(`\n结果: ${passCount1}/${testCases1.length} 通过`)

// 测试2: parseTechStackHint
console.log('\n测试2: parseTechStackHint()')
const testCases2 = [
  {
    input: '@ant/select',
    expected: { library: 'ant', component: 'select', fullHint: '@ant/select' },
    desc: 'Ant Design Select'
  },
  {
    input: '@echarts/bar',
    expected: { library: 'echarts', component: 'bar', fullHint: '@echarts/bar' },
    desc: 'ECharts 柱状图'
  },
  {
    input: '@element',
    expected: { library: 'element', component: undefined, fullHint: '@element' },
    desc: '只有库名，无组件名'
  },
  {
    input: 'normal-node',
    expected: null,
    desc: '非技术栈节点'
  },
]

let passCount2 = 0
testCases2.forEach(({ input, expected, desc }) => {
  const result = parseTechStackHint(input)
  const pass = JSON.stringify(result) === JSON.stringify(expected)
  if (pass) passCount2++
  console.log(`  ${pass ? '✓' : '✗'} ${desc}:`)
  console.log(`    输入: "${input}"`)
  console.log(`    结果: ${JSON.stringify(result)}`)
  console.log(`    期望: ${JSON.stringify(expected)}`)
})
console.log(`\n结果: ${passCount2}/${testCases2.length} 通过`)

// 测试3: needsDeepStyles
console.log('\n测试3: needsDeepStyles()')
const testCases3 = [
  { input: { library: 'ant', component: 'select' }, expected: false, desc: 'Ant Design 组件' },
  { input: { library: 'antd', component: 'table' }, expected: false, desc: 'Ant Design (antd)' },
  { input: { library: 'element', component: 'button' }, expected: false, desc: 'Element Plus' },
  { input: { library: 'echarts', component: 'bar' }, expected: false, desc: 'ECharts 图表' },
  { input: { library: 'amap', component: 'map' }, expected: false, desc: '高德地图' },
  { input: { library: 'custom', component: 'widget' }, expected: false, desc: '自定义（默认不需要）' },
  { input: null, expected: false, desc: 'null' },
]

let passCount3 = 0
testCases3.forEach(({ input, expected, desc }) => {
  const result = needsDeepStyles(input)
  const pass = result === expected
  if (pass) passCount3++
  console.log(`  ${pass ? '✓' : '✗'} ${desc}: ${JSON.stringify(input)} → ${result} (期望: ${expected})`)
})
console.log(`\n结果: ${passCount3}/${testCases3.length} 通过`)

// 测试4: extractVisualContainerStyles
console.log('\n测试4: extractVisualContainerStyles()')

// 测试用例4.1: 有背景色和边框的表单容器
const node1 = {
  id: '1:1',
  name: '@ant/form',
  type: 'FRAME',
  width: 400,
  height: 300,
  fills: [
    {
      type: 'SOLID',
      visible: true,
      color: { r: 0.96, g: 0.96, b: 0.96 }, // #f5f5f5
      opacity: 1
    }
  ],
  strokes: [
    {
      type: 'SOLID',
      visible: true,
      color: { r: 0.85, g: 0.85, b: 0.85 } // #d9d9d9
    }
  ],
  strokeWeight: 1,
  cornerRadius: 8,
  paddingTop: 24,
  paddingRight: 24,
  paddingBottom: 24,
  paddingLeft: 24,
}

const styles1 = extractVisualContainerStyles(node1)
console.log('  用例4.1: 表单容器（背景+边框+圆角+内边距）')
console.log('    输入节点: @ant/form')
console.log('    提取样式:', JSON.stringify(styles1, null, 2))

const expected1Keys = ['background', 'border', 'borderRadius', 'width', 'height', 'padding']
const hasAllKeys1 = expected1Keys.every(key => key in styles1)
console.log(`    ${hasAllKeys1 ? '✓' : '✗'} 包含所有期望的样式属性`)

// 测试用例4.2: 有阴影的按钮
const node2 = {
  id: '2:2',
  name: '@ant/button',
  type: 'FRAME',
  width: 120,
  height: 40,
  fills: [
    {
      type: 'SOLID',
      visible: true,
      color: { r: 0.24, g: 0.58, b: 1.0 }, // #3d94ff
      opacity: 1
    }
  ],
  cornerRadius: 4,
  effects: [
    {
      type: 'DROP_SHADOW',
      visible: true,
      color: { r: 0, g: 0, b: 0, a: 0.1 },
      offset: { x: 0, y: 2 },
      radius: 4,
      spread: 0
    }
  ],
}

const styles2 = extractVisualContainerStyles(node2)
console.log('\n  用例4.2: 按钮（背景+圆角+阴影）')
console.log('    输入节点: @ant/button')
console.log('    提取样式:', JSON.stringify(styles2, null, 2))

const expected2Keys = ['background', 'borderRadius', 'boxShadow', 'width', 'height']
const hasAllKeys2 = expected2Keys.every(key => key in styles2)
console.log(`    ${hasAllKeys2 ? '✓' : '✗'} 包含所有期望的样式属性`)

// 测试用例4.3: 有渐变背景的卡片
const node3 = {
  id: '3:3',
  name: '@custom/card',
  type: 'FRAME',
  width: 300,
  height: 200,
  fills: [
    {
      type: 'GRADIENT_LINEAR',
      visible: true,
      gradientStops: [
        { position: 0, color: { r: 1, g: 1, b: 1, a: 1 } },
        { position: 1, color: { r: 0.95, g: 0.95, b: 0.95, a: 1 } }
      ]
    }
  ],
  cornerRadius: 12,
  opacity: 0.9,
}

const styles3 = extractVisualContainerStyles(node3)
console.log('\n  用例4.3: 卡片（渐变背景+圆角+透明度）')
console.log('    输入节点: @custom/card')
console.log('    提取样式:', JSON.stringify(styles3, null, 2))

const expected3Keys = ['background', 'borderRadius', 'opacity', 'width', 'height']
const hasAllKeys3 = expected3Keys.every(key => key in styles3)
console.log(`    ${hasAllKeys3 ? '✓' : '✗'} 包含所有期望的样式属性`)

// 测试用例4.4: 空节点（没有样式）
const node4 = {
  id: '4:4',
  name: '@echarts/bar',
  type: 'FRAME',
  width: 500,
  height: 400,
}

const styles4 = extractVisualContainerStyles(node4)
console.log('\n  用例4.4: 空样式节点')
console.log('    输入节点: @echarts/bar')
console.log('    提取样式:', JSON.stringify(styles4, null, 2))

const onlyHasSizes4 = Object.keys(styles4).every(key => ['width', 'height'].includes(key))
console.log(`    ${onlyHasSizes4 ? '✓' : '✗'} 只包含尺寸属性（无其他样式）`)

// 测试5: formatContainerStylesAsCSS
console.log('\n测试5: formatContainerStylesAsCSS()')

const testStyles = {
  background: '#f5f5f5',
  border: '1px solid #d9d9d9',
  borderRadius: '8px',
  padding: '24px',
  width: '400px',
  height: '300px',
}

const cssString = formatContainerStylesAsCSS(testStyles)
console.log('  输入样式对象:', JSON.stringify(testStyles, null, 2))
console.log('  输出 CSS 字符串:')
console.log(cssString)

const hasAllCssProps = ['background', 'border', 'border-radius', 'padding', 'width', 'height']
  .every(prop => cssString.includes(prop))
console.log(`  ${hasAllCssProps ? '✓' : '✗'} 包含所有 CSS 属性`)

// 总结
console.log('\n' + '='.repeat(50))
console.log('📊 测试总结')
console.log(`  测试1 (isTechStackNode): ${passCount1}/${testCases1.length} 通过`)
console.log(`  测试2 (parseTechStackHint): ${passCount2}/${testCases2.length} 通过`)
console.log(`  测试3 (needsDeepStyles): ${passCount3}/${testCases3.length} 通过`)
console.log(`  测试4 (extractVisualContainerStyles): 4/4 用例执行`)
console.log(`  测试5 (formatContainerStylesAsCSS): 1/1 用例执行`)

const totalPassed = passCount1 + passCount2 + passCount3
const totalTests = testCases1.length + testCases2.length + testCases3.length
console.log(`\n总计: ${totalPassed}/${totalTests} 单元测试通过`)

if (totalPassed === totalTests) {
  console.log('\n🎉 所有测试通过！')
} else {
  console.log(`\n⚠️ 有 ${totalTests - totalPassed} 个测试失败`)
  process.exit(1)
}
