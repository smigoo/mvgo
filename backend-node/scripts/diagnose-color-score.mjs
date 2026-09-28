#!/usr/bin/env node
/**
 * 诊断样式评分 color 维度低分原因（2026-09-28）
 * 
 * 用法：node scripts/diagnose-color-score.mjs <componentDir>
 * 
 * 输出：
 * 1. 变量解析情况（从哪些文件提取了多少变量）
 * 2. Figma 期望颜色 vs 产物实际颜色对比
 * 3. 未匹配颜色的原因分析
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { 
  resolveStyleVariables, 
  substituteVariables,
  parseColor,
  colorDistance,
  colorFuzzyMatch,
} from '../src/ai-engine/utils/style-var-resolver.js'
import {
  extractDeclaredStyleLiterals,
} from '../src/ai-engine/utils/quality-score-v1.js'
import { 
  collectGeneratedFilesFromDir,
  extractExpectedStyleLiterals,
  findFigmaNodeData,
  findThemeVarsPath,
} from '../src/ai-engine/utils/quality-score-v1.js'

const componentDir = process.argv[2]
if (!componentDir) {
  console.error('用法: node scripts/diagnose-color-score.mjs <componentDir>')
  process.exit(1)
}

if (!existsSync(componentDir)) {
  console.error(`目录不存在: ${componentDir}`)
  process.exit(1)
}

console.log('=== 诊断组件目录 ===')
console.log(componentDir)
console.log()

// 1. 收集产物文件
const files = collectGeneratedFilesFromDir(componentDir)
console.log(`📦 产物文件数: ${files.length}`)
for (const f of files) {
  console.log(`  - ${f.path} (${f.content?.length || 0} bytes)`)
}
console.log()

// 2. 查找 theme-vars.less
const themeVarsPath = findThemeVarsPath(componentDir)
console.log(`🎨 theme-vars.less: ${themeVarsPath || '未找到'}`)
console.log()

// 3. 解析变量
const varMap = resolveStyleVariables(files, themeVarsPath)
console.log(`🔧 解析变量数: ${varMap.size}`)
if (varMap.size > 0) {
  console.log('变量列表:')
  for (const [name, value] of varMap) {
    console.log(`  @${name}: ${value}`)
  }
}
console.log()

// 4. 提取 Figma 期望颜色
const figma = findFigmaNodeData(componentDir)
const expectedStyle = extractExpectedStyleLiterals(figma)
console.log(`🎯 Figma 期望颜色数: ${expectedStyle.color?.length || 0}`)
if (expectedStyle.color?.length > 0) {
  console.log('期望颜色:')
  for (const c of expectedStyle.color) {
    console.log(`  - ${c}`)
  }
}
console.log()

// 5. 提取产物实际颜色（替换变量后）
const resolvedFiles = files.map((f) => ({
  ...f,
  content: substituteVariables(f.content, varMap),
}))
const actualStyle = extractDeclaredStyleLiterals(resolvedFiles)
console.log(`📝 产物实际颜色数: ${actualStyle.color?.length || 0}`)
if (actualStyle.color?.length > 0) {
  console.log('实际颜色:')
  for (const c of actualStyle.color) {
    console.log(`  - ${c}`)
  }
}
console.log()

// 6. 逐个对比
console.log('=== 颜色匹配详情 ===')
const expected = expectedStyle.color || []
const actual = actualStyle.color || []
let matched = 0
const missed = []

for (const expColor of expected) {
  // 先精确匹配
  const exactMatch = actual.some((act) => {
    const e = parseColor(expColor)
    const a = parseColor(act)
    if (!e || !a) return false
    return e.r === a.r && e.g === a.g && e.b === a.b && Math.abs(e.a - a.a) < 0.01
  })
  
  if (exactMatch) {
    matched++
    console.log(`✅ ${expColor} → 精确匹配`)
    continue
  }
  
  // 模糊匹配
  const fuzzyMatch = colorFuzzyMatch(expColor, actual, { maxDelta: 32, alphaTolerance: 0.15 })
  if (fuzzyMatch) {
    matched++
    // 找最接近的
    let closest = null
    let minDist = Infinity
    for (const act of actual) {
      const dist = colorDistance(expColor, act)
      if (dist < minDist) {
        minDist = dist
        closest = act
      }
    }
    console.log(`🟡 ${expColor} → 模糊匹配 (最接近: ${closest}, 距离: ${minDist.toFixed(2)})`)
  } else {
    missed.push(expColor)
    // 找最接近的
    let closest = null
    let minDist = Infinity
    for (const act of actual) {
      const dist = colorDistance(expColor, act)
      if (dist < minDist) {
        minDist = dist
        closest = act
      }
    }
    if (closest) {
      console.log(`❌ ${expColor} → 未匹配 (最接近: ${closest}, 距离: ${minDist.toFixed(2)})`)
    } else {
      console.log(`❌ ${expColor} → 未匹配 (产物无任何颜色)`)
    }
  }
}

console.log()
console.log('=== 汇总 ===')
console.log(`期望: ${expected.length}, 匹配: ${matched}, 未匹配: ${missed.length}`)
console.log(`匹配率: ${((matched / expected.length) * 100).toFixed(1)}%`)
console.log()

if (missed.length > 0) {
  console.log('未匹配颜色:')
  for (const c of missed) {
    console.log(`  - ${c}`)
  }
  console.log()
  
  // 分析原因
  console.log('=== 原因分析 ===')
  console.log('可能原因:')
  console.log('1. 产物确实缺少这些颜色（LLM 生成质量问题）')
  console.log('2. 变量解析未覆盖（变量定义文件不在 files 列表中）')
  console.log('3. 产物用了其他颜色替代（设计偏差）')
  console.log()
  
  // 检查是否有未解析的变量引用（排除语法关键字）
  const syntaxKeywords = new Set([
    'import', 'media', 'keyframes', 'font-face', 'charset', 'namespace', 
    'supports', 'document', 'page', 'counter-style', 'font-feature-values',
    'click', 'change', 'input', 'submit', 'focus', 'blur', 'keydown', 
    'keyup', 'mouseenter', 'mouseleave', 'mousedown', 'mouseup', 'mousemove',
    'touchstart', 'touchend', 'touchmove', 'scroll', 'resize', 'load', 'error', 'abort'
  ])
  
  let unresolvedVars = new Set()
  for (const f of files) {
    const content = f.content || ''
    const varRefs = content.match(/@([\w-]+)/g) || []
    for (const ref of varRefs) {
      const varName = ref.slice(1)
      if (!varMap.has(varName) && !syntaxKeywords.has(varName)) {
        unresolvedVars.add(varName)
      }
    }
  }
  if (unresolvedVars.size > 0) {
    console.log(`⚠️  发现 ${unresolvedVars.size} 个未解析的变量引用:`)
    for (const v of unresolvedVars) {
      console.log(`  - @${v}`)
    }
    console.log('这些变量可能导致颜色缺失')
  }
}
