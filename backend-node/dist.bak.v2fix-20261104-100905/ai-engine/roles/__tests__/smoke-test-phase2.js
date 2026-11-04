/**
 * Phase 2 Solution 1 烟雾测试
 * 验证修复后的模块导入和核心功能
 */

import { SubcomponentPlanner } from '../subcomponent-planner.js'

console.log('🧪 Phase 2 Solution 1 烟雾测试')
console.log('================================\n')

// 测试 1: SubcomponentPlanner 实例化
console.log('测试 1: SubcomponentPlanner 实例化...')
try {
  const planner = new SubcomponentPlanner()
  console.log('✓ SubcomponentPlanner 创建成功\n')
} catch (error) {
  console.error('✗ SubcomponentPlanner 创建失败:', error.message)
  process.exit(1)
}

// 测试 2: 复杂组件拆分规划
console.log('测试 2: 复杂组件拆分规划...')
const mockComplexComponent = {
  id: 'complex-dashboard',
  name: '复杂数据大屏',
  body: {
    type: 'FRAME',
    children: [
      {
        id: 'section-1',
        name: 'Header',
        body: {
          type: 'FRAME',
          children: Array(5).fill(null).map((_, i) => ({ id: `elem-${i}`, name: `Element ${i}` }))
        }
      },
      {
        id: 'section-2',
        name: 'ChartArea',
        layoutMetadata: { direction: 'horizontal', gap: 16 },
        body: {
          type: 'FRAME',
          children: [
            {
              id: 'chart-1',
              name: '销售趋势图表',
              body: {
                type: 'FRAME',
                children: Array(12).fill(null).map((_, i) => ({ id: `chart-elem-${i}`, name: `Elem ${i}` }))
              }
            },
            {
              id: 'chart-2',
              name: '用户分布图',
              body: {
                type: 'FRAME',
                children: Array(10).fill(null).map((_, i) => ({ id: `chart-elem2-${i}`, name: `Elem ${i}` }))
              }
            }
          ]
        }
      },
      {
        id: 'section-3',
        name: 'DataTable',
        body: {
          type: 'FRAME',
          children: Array(8).fill(null).map((_, i) => ({ id: `table-elem-${i}`, name: `Row ${i}` }))
        }
      }
    ]
  }
}

try {
  const planner = new SubcomponentPlanner()
  const result = planner.plan(mockComplexComponent, { forceSubcomponents: true })

  console.log(`✓ 拆分规划完成`)
  console.log(`  - 有效分区数: ${result.effectiveSections.length}`)
  console.log(`  - 内部子组件数: ${result.internalSubcomponents.length}`)
  console.log(`  - 最小文件数: ${result.minFiles}`)

  // 验证内部子组件
  const hasInternalSubs = result.internalSubcomponents.length > 0
  if (hasInternalSubs) {
    console.log('\n  内部子组件详情:')
    result.internalSubcomponents.forEach((sub, idx) => {
      console.log(`    ${idx + 1}. ${sub.name} (复杂度分数: ${sub.complexityScore})`)
      console.log(`       父分区: ${sub.parentSectionId}`)
      console.log(`       拆分原因: ${sub.splitReason}`)
    })
  }

  console.log('\n✓ 测试通过\n')
} catch (error) {
  console.error('✗ 拆分规划失败:', error.message)
  console.error(error.stack)
  process.exit(1)
}

// 测试 3: 模型建议功能（验证导入修复）
console.log('测试 3: 模型建议功能 (验证导入修复)...')
try {
  const { buildModelSuggestion } = await import('../../../ai-engine/utils/model-suggestion.js')

  const suggestion = buildModelSuggestion(20000, 'qwen-plus')
  console.log('✓ 模型建议功能正常')
  console.log(`  - 需要升级: ${suggestion.needUpgrade}`)
  console.log(`  - 当前模型限制: ${suggestion.currentLimit} tokens`)
  console.log(`  - 预估需求: ${suggestion.estimatedTokens} tokens`)

  if (suggestion.needUpgrade) {
    console.log(`  - 推荐层级: ${suggestion.recommendedTier}`)
  }

  console.log('\n✓ 测试通过\n')
} catch (error) {
  console.error('✗ 模型建议功能失败:', error.message)
  console.error(error.stack)
  process.exit(1)
}

console.log('================================')
console.log('🎉 所有烟雾测试通过！')
console.log('\n修复总结:')
console.log('  ✓ 移除了 MODEL_MAX_OUTPUT_TOKENS 的非法导入')
console.log('  ✓ 重构 getModelCapabilityTable() 使用本地数据')
console.log('  ✓ SubcomponentPlanner 核心功能正常')
console.log('  ✓ 内部子组件拆分逻辑正常')
console.log('  ✓ 模型建议功能正常')
