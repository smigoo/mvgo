/**
 * T04: 背景图去重测试
 * 验证同一背景图不会在代码中重复出现
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deduplicateBackgroundImages } from '../utils/post-process.js'

test('T04-A: 重复背景图只保留一次', () => {
  const mockCode = `<style lang="less" scoped>
.c-monitor-root {
  background: url('resources/images/bg1.png') center/cover;
}
.c-monitor-sub {
  background: url('resources/images/bg1.png') center/cover;
}
</style>`

  const result = deduplicateBackgroundImages(mockCode)
  
  // 统计 bg1.png 出现次数
  const bgCount = (result.match(/bg1\.png/g) || []).length
  
  // 应只保留一次（第一次）
  assert.ok(
    bgCount <= 1,
    `重复的背景图应去重，实际出现 ${bgCount} 次`
  )
})

test('T04-B: 不同背景图分别保留', () => {
  const mockCode = `<style lang="less" scoped>
.c-monitor-root {
  background: url('resources/images/bg1.png') center/cover;
}
.c-monitor-sub {
  background: url('resources/images/bg2.png') center/cover;
}
</style>`

  const result = deduplicateBackgroundImages(mockCode)
  
  // 两个不同图片都应保留
  assert.ok(
    result.includes('bg1.png'),
    'bg1.png 应保留'
  )
  assert.ok(
    result.includes('bg2.png'),
    'bg2.png 应保留'
  )
})

test('T04-C: 无重复时保持不变', () => {
  const mockCode = `<style lang="less" scoped>
.c-monitor-root {
  background: url('resources/images/bg1.png') center/cover;
}
</style>`

  const result = deduplicateBackgroundImages(mockCode)
  
  assert.strictEqual(result, mockCode, '无重复时代码不变')
})

test('T04-D: 无背景图时不变', () => {
  const mockCode = `<style lang="less" scoped>
.c-monitor-root {
  width: 100%;
}
</style>`

  const result = deduplicateBackgroundImages(mockCode)
  
  assert.strictEqual(result, mockCode, '无背景图时代码不变')
})
