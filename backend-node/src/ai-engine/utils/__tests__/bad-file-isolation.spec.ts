/**
 * 坏文件隔离降级决策层测试（P1-4，2026-08-30）
 *
 * 覆盖 R9 修复：组件三（mc-max-1788067021808-b401bed4）5 个子组件全部生成成功，
 * 仅 FlowPrediction.vue 一个 SFC 编译失败 → 1436 字符主入口 + 4 个健康子组件全部丢弃。
 * 门禁本意是防坏文件，不该承担「一个坏 → 全盘否决」的连坐语义。
 */
import { describe, it, expect } from '@jest/globals'
import { isDegradableVuePath, planBadFileIsolation } from '../bad-file-isolation.js'

const HEALTHY = {
  'package/index.vue': '<template><div><A/><B/></div></template>',
  'package/components/A.vue': '<template><i/></template>',
  'package/components/B.vue': '<template><i/></template>',
  'package/components/FlowPrediction.vue': '<template><div :style="{" /></template>',
  'resources/styles/common.less': '.a { color: red; }',
}

describe('isDegradableVuePath', () => {
  it('一层子组件可降级', () => {
    expect(isDegradableVuePath('package/components/FlowPrediction.vue')).toBe(true)
    expect(isDegradableVuePath('package/components/A.vue')).toBe(true)
  })

  it('主入口 / 样式 / 声明 / 嵌套子组件不可降级', () => {
    expect(isDegradableVuePath('package/index.vue')).toBe(false)
    expect(isDegradableVuePath('resources/styles/common.less')).toBe(false)
    expect(isDegradableVuePath('declare.json')).toBe(false)
    // 嵌套超过一层：位置语义不明，保守 fail-closed
    expect(isDegradableVuePath('package/components/sub/C.vue')).toBe(false)
  })
})

describe('planBadFileIsolation', () => {
  it('空坏文件清单 → ok=false', () => {
    expect(planBadFileIsolation(HEALTHY, []).ok).toBe(false)
    expect(planBadFileIsolation(HEALTHY, [null, ''] as any).ok).toBe(false)
  })

  it('仅坏子组件（组件三实锤场景）→ 可降级，主入口与其余子组件保留', () => {
    const r: any = planBadFileIsolation(HEALTHY, [
      'package/components/FlowPrediction.vue',
    ])
    expect(r.ok).toBe(true)
    expect(r.removed).toEqual(['package/components/FlowPrediction.vue'])
    expect(r.files['package/index.vue']).toBe(HEALTHY['package/index.vue'])
    expect(r.files['package/components/A.vue']).toBeDefined()
    expect(r.files['package/components/B.vue']).toBeDefined()
    expect(r.files['package/components/FlowPrediction.vue']).toBeUndefined()
    expect(r.files['resources/styles/common.less']).toBeDefined()
  })

  it('多个坏子组件 → 一并剔除', () => {
    const r: any = planBadFileIsolation(HEALTHY, [
      'package/components/A.vue',
      'package/components/B.vue',
    ])
    expect(r.ok).toBe(true)
    expect(r.removed).toHaveLength(2)
    expect(r.files['package/components/A.vue']).toBeUndefined()
    expect(r.files['package/components/B.vue']).toBeUndefined()
  })

  it('主入口坏 → 不可降级（组件无主入口即不可用）', () => {
    const r: any = planBadFileIsolation(HEALTHY, ['package/index.vue'])
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('package/index.vue')
    expect(r.reason).toContain('fail-closed')
  })

  it('主入口 + 子组件同时坏 → 整体不可降级（不半降）', () => {
    const r: any = planBadFileIsolation(HEALTHY, [
      'package/index.vue',
      'package/components/A.vue',
    ])
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('package/index.vue')
  })

  it('嵌套子组件坏 → 不可降级', () => {
    const r: any = planBadFileIsolation(HEALTHY, ['package/components/sub/C.vue'])
    expect(r.ok).toBe(false)
  })

  it('坏文件不在产物集中 → ok=false，不误删', () => {
    const r: any = planBadFileIsolation(HEALTHY, ['package/components/Ghost.vue'])
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('坏文件不在产物集中')
  })

  it('不修改传入的 allFiles（返回浅拷贝）', () => {
    const src = { ...HEALTHY }
    planBadFileIsolation(src, ['package/components/A.vue'])
    expect(src['package/components/A.vue']).toBeDefined()
    expect(Object.keys(src)).toHaveLength(Object.keys(HEALTHY).length)
  })
})
