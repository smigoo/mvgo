/**
 * 验证 MODEL_MAX_OUTPUT_TOKENS 导入错误修复
 * 不依赖 logger，纯粹测试模块导入
 */

console.log('🧪 验证导入修复')
console.log('================================\n')

// 测试 1: model-config.js 导出检查
console.log('测试 1: 检查 model-config.js 导出...')
try {
  const modelConfig = await import('../../utils/model-config.js')
  const exportedNames = Object.keys(modelConfig)

  console.log('✓ model-config.js 导入成功')
  console.log(`  导出内容: ${exportedNames.join(', ')}`)

  // 验证不导出 MODEL_MAX_OUTPUT_TOKENS
  if (exportedNames.includes('MODEL_MAX_OUTPUT_TOKENS')) {
    console.error('✗ 错误: MODEL_MAX_OUTPUT_TOKENS 不应该被导出')
    process.exit(1)
  }

  // 验证导出 getModelMaxOutputTokens 函数
  if (!exportedNames.includes('getModelMaxOutputTokens')) {
    console.error('✗ 错误: getModelMaxOutputTokens 函数未导出')
    process.exit(1)
  }

  console.log('  ✓ MODEL_MAX_OUTPUT_TOKENS 未导出（正确）')
  console.log('  ✓ getModelMaxOutputTokens 已导出（正确）\n')
} catch (error) {
  console.error('✗ model-config.js 导入失败:', error.message)
  process.exit(1)
}

// 测试 2: model-suggestion.js 导入检查
console.log('测试 2: 检查 model-suggestion.js 导入...')
try {
  const modelSuggestion = await import('../../utils/model-suggestion.js')
  const exportedNames = Object.keys(modelSuggestion)

  console.log('✓ model-suggestion.js 导入成功')
  console.log(`  导出内容: ${exportedNames.join(', ')}\n`)

  // 验证核心函数存在
  if (!modelSuggestion.buildModelSuggestion) {
    console.error('✗ 错误: buildModelSuggestion 函数未导出')
    process.exit(1)
  }

  console.log('  ✓ buildModelSuggestion 函数可用\n')
} catch (error) {
  console.error('✗ model-suggestion.js 导入失败:', error.message)
  console.error('  这是原始错误所在，说明修复失败')
  process.exit(1)
}

// 测试 3: 功能测试 - buildModelSuggestion
console.log('测试 3: 测试 buildModelSuggestion 功能...')
try {
  const { buildModelSuggestion } = await import('../../utils/model-suggestion.js')

  // 测试场景 1: 模型能力足够
  const result1 = buildModelSuggestion(5000, 'qwen-max')
  console.log(`✓ 场景1 - 能力足够:`)
  console.log(`  需要升级: ${result1.needUpgrade}`)
  console.log(`  预估: ${result1.estimatedTokens} tokens, 上限: ${result1.currentLimit} tokens`)

  if (result1.needUpgrade) {
    console.error('✗ 错误: 5000 tokens 不应该超过 qwen-max 的限制')
    process.exit(1)
  }

  // 测试场景 2: 模型能力不足
  const result2 = buildModelSuggestion(20000, 'qwen-plus')
  console.log(`\n✓ 场景2 - 能力不足:`)
  console.log(`  需要升级: ${result2.needUpgrade}`)
  console.log(`  预估: ${result2.estimatedTokens} tokens, 上限: ${result2.currentLimit} tokens`)

  if (!result2.needUpgrade) {
    console.error('✗ 错误: 20000 tokens 应该超过 qwen-plus 的 8192 限制')
    process.exit(1)
  }

  console.log(`  推荐层级: ${result2.recommendedTier}`)
  console.log(`  推荐模型: ${result2.tierInfo.examples.join(', ')}\n`)

} catch (error) {
  console.error('✗ buildModelSuggestion 功能测试失败:', error.message)
  console.error(error.stack)
  process.exit(1)
}

// 测试 4: getModelMaxOutputTokens 功能
console.log('测试 4: 测试 getModelMaxOutputTokens 功能...')
try {
  const { getModelMaxOutputTokens } = await import('../../utils/model-config.js')

  const qwenMax = getModelMaxOutputTokens('qwen-max')
  const qwenPlus = getModelMaxOutputTokens('qwen-plus')
  const unknown = getModelMaxOutputTokens('unknown-model', 16000)

  console.log(`✓ getModelMaxOutputTokens 测试:`)
  console.log(`  qwen-max: ${qwenMax} tokens`)
  console.log(`  qwen-plus: ${qwenPlus} tokens`)
  console.log(`  unknown-model (fallback): ${unknown} tokens\n`)

  if (qwenMax !== 32768) {
    console.error(`✗ 错误: qwen-max 应该是 32768，实际 ${qwenMax}`)
    process.exit(1)
  }

  if (qwenPlus !== 8192) {
    console.error(`✗ 错误: qwen-plus 应该是 8192，实际 ${qwenPlus}`)
    process.exit(1)
  }

  if (unknown !== 16000) {
    console.error(`✗ 错误: 未知模型应该返回 fallback 16000，实际 ${unknown}`)
    process.exit(1)
  }

} catch (error) {
  console.error('✗ getModelMaxOutputTokens 功能测试失败:', error.message)
  console.error(error.stack)
  process.exit(1)
}

console.log('================================')
console.log('🎉 所有测试通过！')
console.log('\n修复验证成功:')
console.log('  ✓ model-config.js 不导出 MODEL_MAX_OUTPUT_TOKENS 常量')
console.log('  ✓ model-suggestion.js 不再导入 MODEL_MAX_OUTPUT_TOKENS')
console.log('  ✓ getModelCapabilityTable() 重构为使用本地数据')
console.log('  ✓ buildModelSuggestion() 功能正常')
console.log('  ✓ getModelMaxOutputTokens() 功能正常')
console.log('\n原始错误已修复: "The requested module \'./model-config.js\' does not provide an export named \'MODEL_MAX_OUTPUT_TOKENS\'"')
