/**
 * 节点级尺寸绑定 validator 测试（P1-1，2026-08-30）
 */
import { describe, it, expect } from '@jest/globals'
import { buildNodeSizeMap, validateNodeSizes } from '../node-size-validator.js'

describe('buildNodeSizeMap', () => {
  it('空输入 → 空 Map', () => {
    expect(buildNodeSizeMap([]).size).toBe(0)
    expect(buildNodeSizeMap(null).size).toBe(0)
  })

  it('单条目 → 1 条映射', () => {
    const map = buildNodeSizeMap([
      { mountTarget: 'tabs-list', figmaBox: { width: 295, height: 27 }, figmaNodeId: '1:234' },
    ])
    expect(map.size).toBe(1)
    expect(map.get('tabs-list')).toEqual({ width: 295, height: 27, figmaNodeId: '1:234' })
  })

  it('无 mountTarget 或 figmaBox 的条目被跳过', () => {
    const map = buildNodeSizeMap([
      { mountTarget: '', figmaBox: { width: 100, height: 50 } },
      { mountTarget: 'ok', figmaBox: null },
      { mountTarget: 'valid', figmaBox: { width: 100, height: 50 } },
    ])
    expect(map.size).toBe(1)
    expect(map.has('valid')).toBe(true)
  })

  it('同 mountTarget 重复时取尺寸更大者', () => {
    const map = buildNodeSizeMap([
      { mountTarget: 'dup', figmaBox: { width: 100, height: 50 } },
      { mountTarget: 'dup', figmaBox: { width: 200, height: 100 } },
    ])
    expect(map.get('dup')?.width).toBe(200)
  })
})

describe('validateNodeSizes', () => {
  const rdm = [
    { mountTarget: 'tabs-list', figmaBox: { width: 295, height: 27 }, figmaNodeId: '1:1' },
    { mountTarget: 'chart-section', figmaBox: { width: 420, height: 186 }, figmaNodeId: '1:2' },
  ]

  it('空资源映射 → 无 issue', () => {
    const files = [{ path: 'package/index.vue', content: '.foo { width: 100px; }' }]
    expect(validateNodeSizes(files, [], {})).toHaveLength(0)
  })

  it('精确匹配——尺寸一致 → 无 issue', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: '<style lang="less" scoped>\n.tabs-list { width: 295px; height: 27px; }\n</style>',
      },
    ]
    expect(validateNodeSizes(files, rdm, {})).toHaveLength(0)
  })

  it('后缀匹配（c-前缀 class）——尺寸一致 → 无 issue', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: '<style lang="less" scoped>\n.c-test-tabs-list { width: 295px; height: 27px; }\n</style>',
      },
    ]
    expect(validateNodeSizes(files, rdm, {})).toHaveLength(0)
  })

  it('width 偏差 > 2px → BLOCK', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: '<style lang="less" scoped>\n.tabs-list { width: 420px; height: 27px; }\n</style>',
      },
    ]
    const issues = validateNodeSizes(files, rdm, {})
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].id).toBe('NODE-001')
    expect(issues[0].message).toContain('width=420px')
    expect(issues[0].message).toContain('295px')
  })

  it('height 偏差 > 2px → BLOCK', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: '<style lang="less" scoped>\n.tabs-list { width: 295px; height: 100px; }\n</style>',
      },
    ]
    const issues = validateNodeSizes(files, rdm, {})
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].message).toContain('height=100px')
  })

  it('±1px 偏差在容忍度内 → 无 issue', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: '<style lang="less" scoped>\n.tabs-list { width: 296px; height: 28px; }\n</style>',
      },
    ]
    expect(validateNodeSizes(files, rdm, {})).toHaveLength(0)
  })

  it('跨 .less 文件校验', () => {
    const files = [
      {
        path: 'resources/styles/common.less',
        content: '.tabs-list { width: 295px; height: 27px; }',
      },
    ]
    expect(validateNodeSizes(files, rdm, {})).toHaveLength(0)
  })

  it('class 名不匹配 mountTarget → 跳过（不误报）', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: '<style lang="less" scoped>\n.unrelated { width: 999px; height: 999px; }\n</style>',
      },
    ]
    expect(validateNodeSizes(files, rdm, {})).toHaveLength(0)
  })

  it('多容器多文件均校验', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: '<style lang="less" scoped>\n.tabs-list { width: 295px; height: 27px; }\n.chart-section { width: 420px; height: 186px; }\n</style>',
      },
    ]
    expect(validateNodeSizes(files, rdm, {})).toHaveLength(0)
  })
})