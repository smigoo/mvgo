/**
 * chunk-meta.files 多段映射测试（P1-5，2026-08-30）
 *
 * 覆盖 R10 修复：写侧 `Object.assign(meta.files, blockFiles)` 单值覆盖使
 * `meta.files['package/index.vue']` 只剩最后一段（脚本/图表段），读侧把这段当完整
 * 文件恢复 → 断点续跑后 index.vue 变成「只有 <script> 没有 <template>」的残片，
 * 且后续 chunk 因 allFiles[f] != null 判定「已生成」而跳过 → template 永久丢失。
 */
import { describe, it, expect } from '@jest/globals'
import {
  isIndexVuePath,
  normalizeFileSegments,
  upsertFileSegment,
  planSegmentMerge,
} from '../chunk-meta-files.js'

const seg = (index: number, file: string, extra: any = {}) => ({
  index,
  file,
  segmentType: '',
  scriptPart: '',
  ...extra,
})

describe('isIndexVuePath', () => {
  it('识别主入口（含子目录形态）', () => {
    expect(isIndexVuePath('package/index.vue')).toBe(true)
    expect(isIndexVuePath('some/package/index.vue')).toBe(true)
  })

  it('子组件 / 样式 / 声明文件不算主入口', () => {
    expect(isIndexVuePath('package/components/FlowPrediction.vue')).toBe(false)
    expect(isIndexVuePath('resources/styles/common.less')).toBe(false)
    expect(isIndexVuePath('declare.json')).toBe(false)
  })
})

describe('normalizeFileSegments', () => {
  it('null / undefined → 空数组', () => {
    expect(normalizeFileSegments(null)).toEqual([])
    expect(normalizeFileSegments(undefined)).toEqual([])
  })

  it('旧格式单值字符串 → 长度 1 的段数组（index 归一为 0）', () => {
    const out = normalizeFileSegments('3-package_index.vue')
    expect(out).toEqual([
      { index: 0, file: '3-package_index.vue', segmentType: '', scriptPart: '' },
    ])
  })

  it('旧格式字符串数组 → 按下标给 index，保持顺序', () => {
    const out = normalizeFileSegments(['2-package_index.vue', '3-package_index.vue'])
    expect(out.map((s) => s.file)).toEqual([
      '2-package_index.vue',
      '3-package_index.vue',
    ])
    expect(out.map((s) => s.index)).toEqual([0, 0])
  })

  it('新格式段数组 → 按 index 升序', () => {
    const out = normalizeFileSegments([
      seg(5, '5-package_index.vue', { segmentType: 'script', scriptPart: 'charts' }),
      seg(2, '2-package_index.vue', { segmentType: 'template' }),
      seg(3, '3-package_index.vue', { segmentType: 'script', scriptPart: 'state' }),
    ])
    expect(out.map((s) => s.index)).toEqual([2, 3, 5])
    expect(out[0].segmentType).toBe('template')
    expect(out[2].scriptPart).toBe('charts')
  })

  it('过滤空文件名 / null 项', () => {
    const out = normalizeFileSegments([null, { index: 1, file: '' }, seg(2, '2-a.vue')])
    expect(out).toHaveLength(1)
    expect(out[0].file).toBe('2-a.vue')
  })
})

describe('upsertFileSegment', () => {
  it('空映射首次写入 → 单段', () => {
    const m: any = {}
    upsertFileSegment(m, 'package/index.vue', seg(2, '2-package_index.vue', { segmentType: 'template' }))
    expect(m['package/index.vue']).toHaveLength(1)
    expect(m['package/index.vue'][0].file).toBe('2-package_index.vue')
  })

  it('按 index 升序维护多段（template 2 + script 3）', () => {
    const m: any = {}
    upsertFileSegment(m, 'package/index.vue', seg(2, '2-package_index.vue', { segmentType: 'template' }))
    upsertFileSegment(m, 'package/index.vue', seg(3, '3-package_index.vue', { segmentType: 'script' }))
    expect(m['package/index.vue'].map((s: any) => s.index)).toEqual([2, 3])
  })

  it('同 index 重跑 → 覆盖，不重复追加', () => {
    const m: any = {}
    upsertFileSegment(m, 'package/index.vue', seg(3, '3-package_index.vue'))
    upsertFileSegment(m, 'package/index.vue', seg(3, '3-package_index.vue'))
    expect(m['package/index.vue']).toHaveLength(1)
  })

  it('同 index 换文件名 → 替换（重试轮新产物）', () => {
    const m: any = {}
    upsertFileSegment(m, 'package/index.vue', seg(3, '3-package_index.vue'))
    upsertFileSegment(m, 'package/index.vue', seg(3, '3-package_index_v2.vue'))
    expect(m['package/index.vue']).toHaveLength(1)
    expect(m['package/index.vue'][0].file).toBe('3-package_index_v2.vue')
  })

  it('同文件名换 index → 去重为一条', () => {
    const m: any = {}
    upsertFileSegment(m, 'package/index.vue', seg(3, '3-package_index.vue'))
    upsertFileSegment(m, 'package/index.vue', seg(7, '3-package_index.vue'))
    expect(m['package/index.vue']).toHaveLength(1)
    expect(m['package/index.vue'][0].index).toBe(7)
  })

  it('旧格式单值已存在 → 转段数组后合并，按 index 升序', () => {
    const m: any = { 'package/index.vue': '1-package_index.vue' }
    upsertFileSegment(m, 'package/index.vue', seg(2, '2-package_index.vue', { segmentType: 'template' }))
    expect(m['package/index.vue']).toHaveLength(2)
    expect(m['package/index.vue'].map((s: any) => s.index)).toEqual([0, 2])
  })

  it('非法入参 → 原样返回，不抛错', () => {
    const m: any = { a: 'a.vue' }
    expect(upsertFileSegment(m, '', seg(1, 'x.vue'))).toBe(m)
    expect(upsertFileSegment(m, 'a', { index: 1, file: '' } as any)).toBe(m)
    expect(m.a).toBe('a.vue')
  })
})

describe('planSegmentMerge', () => {
  it('空段 → kind=empty，ok=false', () => {
    const p = planSegmentMerge('package/index.vue', [])
    expect(p.kind).toBe('empty')
    expect(p.ok).toBe(false)
  })

  it('单段 → kind=single', () => {
    const p = planSegmentMerge('resources/styles/common.less', [seg(9, '9-common.less', { content: 'a' })] as any)
    expect(p.kind).toBe('single')
    expect(p.order).toHaveLength(1)
  })

  it('index.vue template(2) + script(3) → 拆出 template 与 scriptParts', () => {
    const p: any = planSegmentMerge('package/index.vue', [
      seg(2, '2-package_index.vue', { segmentType: 'template', content: '<template><div/></template>' }),
      seg(3, '3-package_index.vue', { segmentType: 'script', content: '<script setup>x</script>' }),
    ])
    expect(p.kind).toBe('index-vue')
    expect(p.ok).toBe(true)
    expect(p.template.file).toBe('2-package_index.vue')
    expect(p.scriptParts.map((s: any) => s.file)).toEqual(['3-package_index.vue'])
  })

  it('index.vue scriptSplit 四段 → scriptParts 按 index 升序（状态→生命周期→图表）', () => {
    const p: any = planSegmentMerge('package/index.vue', [
      seg(5, '5-package_index.vue', { segmentType: 'script', scriptPart: 'charts', content: 'c' }),
      seg(3, '3-package_index.vue', { segmentType: 'script', scriptPart: 'state', content: 's' }),
      seg(2, '2-package_index.vue', { segmentType: 'template', content: 't' }),
      seg(4, '4-package_index.vue', { segmentType: 'script', scriptPart: 'lifecycle', content: 'l' }),
    ])
    expect(p.template.file).toBe('2-package_index.vue')
    expect(p.scriptParts.map((s: any) => s.scriptPart)).toEqual([
      'state',
      'lifecycle',
      'charts',
    ])
  })

  it('index.vue 缺 template 段 → ok=false（不得恢复成残片）', () => {
    const p: any = planSegmentMerge('package/index.vue', [
      seg(3, '3-package_index.vue', { segmentType: 'script', content: '<script setup>x</script>' }),
      seg(5, '5-package_index.vue', { segmentType: 'script', content: '<script setup>y</script>' }),
    ])
    expect(p.kind).toBe('index-vue')
    expect(p.ok).toBe(false)
    expect(p.template).toBeNull()
  })

  it('无 segmentType 时按 index===2 兜底判 template', () => {
    const p: any = planSegmentMerge('package/index.vue', [
      seg(5, '5-package_index.vue', { content: '<script setup>y</script>' }),
      seg(2, '2-package_index.vue', { content: '<template><div/></template>' }),
    ])
    expect(p.ok).toBe(true)
    expect(p.template.file).toBe('2-package_index.vue')
  })

  it('无 segmentType 且 index 均不为 2 → 按内容嗅探 template', () => {
    const p: any = planSegmentMerge('package/index.vue', [
      seg(0, 'a-package_index.vue', { content: '<script setup>y</script>' }),
      seg(1, 'b-package_index.vue', { content: '<template><div/></template>' }),
    ])
    expect(p.ok).toBe(true)
    expect(p.template.file).toBe('b-package_index.vue')
  })

  it('非 index.vue 多段 → kind=concat，按 index 顺序拼接', () => {
    const p: any = planSegmentMerge('resources/styles/common.less', [
      seg(10, '10-common.less', { content: '/* part2 */' }),
      seg(9, '9-common.less', { content: '/* part1 */' }),
    ])
    expect(p.kind).toBe('concat')
    expect(p.order.map((s: any) => s.content)).toEqual(['/* part1 */', '/* part2 */'])
    expect(p.order.map((s: any) => s.content).join('\n')).toBe('/* part1 */\n/* part2 */')
  })
})
