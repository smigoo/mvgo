/**
 * 分块响应守卫测试（2026-11-13 · mc-max-1794551009165-7dfc01e9 空壳覆写实锤）
 *
 * 事故：重试轮 chunk 只请求 index.vue 的 script 状态段，LLM 越界返回 8 个文件的
 * script-only 残片（含 TunnelChart/BridgeChart），照单全收后残片覆盖完整版
 * （5001B → 572B 空壳），A6 断点续跑把空壳当完好文件恢复 ⇒ 污染固化不可逆。
 *
 * 判据收窄口径：只剥「.vue 残片」（缺 <template> 的非 index.vue 文件）；
 * 越界完整 SFC 是合法捎带形态（同任务 chunk8：请求 ContentForecast、捎带
 * ForecastChart 且被宿主消费），仅计数放行。
 */
import { describe, it, expect } from '@jest/globals'
import {
  isFragmentVueFile,
  sanitizeChunkResponse,
  buildScopeViolationFeedback,
} from '../chunk-response-guard.js'

const FULL_SFC = `<template><div class="x"><div ref="chartRef"></div></div></template>
<script setup>
import * as echarts from 'echarts'
const chartRef = ref(null)
</script>
<style scoped></style>`

const FRAGMENT_SFC = `<script setup>
import { ref } from 'vue'
const chartRef = ref(null)
const list = ref([])
</script>`

const noopLogger = () => {}

describe('isFragmentVueFile（残片判据阴阳对照）', () => {
  it('阳性：子组件 script-only 残片（7dfc01e9 事故形态）', () => {
    expect(isFragmentVueFile('package/components/TunnelChart.vue', FRAGMENT_SFC)).toBe(true)
  })
  it('阳性：空内容子组件 .vue', () => {
    expect(isFragmentVueFile('package/components/BridgeChart.vue', '')).toBe(true)
  })
  it('阴性：完整 SFC（有 template）', () => {
    expect(isFragmentVueFile('package/components/TunnelChart.vue', FULL_SFC)).toBe(false)
  })
  it('阴性：index.vue 的 script 段（分段合并机制消费，合法）', () => {
    expect(isFragmentVueFile('package/index.vue', FRAGMENT_SFC)).toBe(false)
  })
  it('阴性：非 .vue 文件（less/json 不在判据面）', () => {
    expect(isFragmentVueFile('resources/styles/common.less', '.a { color: red }')).toBe(false)
    expect(isFragmentVueFile('declare.json', '{}')).toBe(false)
  })
})

describe('sanitizeChunkResponse（摄取层剥除）', () => {
  it('7dfc01e9 形态：请求 1 个 index.vue script 段、响应 8 个文件，7 个越界残片全剥', () => {
    const res = sanitizeChunkResponse(
      {
        'package/index.vue': 'const state = ref(1)',
        'package/components/ContentDailyTotalFlow.vue': FRAGMENT_SFC,
        'package/components/ContentTunnel.vue': FRAGMENT_SFC,
        'package/components/ContentBridge.vue': FRAGMENT_SFC,
        'package/components/ContentVehicleDist.vue': FRAGMENT_SFC,
        'package/components/ContentForecast.vue': FRAGMENT_SFC,
        'package/components/TunnelChart.vue': FRAGMENT_SFC,
        'package/components/BridgeChart.vue': FRAGMENT_SFC,
      },
      { index: 3, files: ['package/index.vue'], segmentType: 'script', title: 'index.vue 脚本(状态)' },
      noopLogger,
    )
    expect(Object.keys(res.files)).toEqual(['package/index.vue'])
    expect(res.metrics.droppedFragments).toHaveLength(7)
    expect(res.metrics.droppedFragments).toContain('package/components/TunnelChart.vue')
    expect(res.metrics.outOfScopeFull).toHaveLength(0)
  })

  it('chunk8 形态：越界完整 SFC 放行仅计数（合法捎带）', () => {
    const res = sanitizeChunkResponse(
      {
        'package/components/ContentForecast.vue': FULL_SFC,
        'package/components/ForecastChart.vue': FULL_SFC,
      },
      { index: 8, files: ['package/components/ContentForecast.vue'], segmentType: 'component' },
      noopLogger,
    )
    expect(Object.keys(res.files)).toHaveLength(2)
    expect(res.metrics.droppedFragments).toHaveLength(0)
    expect(res.metrics.outOfScopeFull).toEqual(['package/components/ForecastChart.vue'])
  })

  it('请求内子组件残片同样剥除（子组件不存在分段生成）', () => {
    const res = sanitizeChunkResponse(
      { 'package/components/TunnelChart.vue': FRAGMENT_SFC },
      { index: 10, files: ['package/components/TunnelChart.vue'], segmentType: 'component' },
      noopLogger,
    )
    expect(res.files).toEqual({})
    expect(res.metrics.droppedFragments).toEqual(['package/components/TunnelChart.vue'])
  })

  it('异常形态安全：null/undefined/数组入参不抛错', () => {
    const chunk = { files: ['a.vue'] }
    expect(sanitizeChunkResponse(null, chunk, noopLogger).files).toEqual({})
    expect(sanitizeChunkResponse(undefined, chunk, noopLogger).files).toEqual({})
    expect(sanitizeChunkResponse([1, 2], chunk, noopLogger).files).toEqual({})
  })

  it('观测纪律：恒打计数行（0 也打），有剥除时升级 warn', () => {
    const infos: string[] = []
    const warns: string[] = []
    const logger = {
      info: (m: string) => infos.push(m),
      warn: (m: string) => warns.push(m),
    }
    sanitizeChunkResponse({ 'a.vue': FULL_SFC }, { files: ['a.vue'] }, logger)
    expect(infos.some((m) => m.includes('分块响应守卫'))).toBe(true)
    expect(warns).toHaveLength(0)

    sanitizeChunkResponse({ 'b.vue': FRAGMENT_SFC }, { files: ['b.vue'] }, logger)
    expect(warns.some((m) => m.includes('剥除 .vue 残片'))).toBe(true)
  })
})

describe('buildScopeViolationFeedback（回灌教学）', () => {
  it('无违规记录返回空串（不污染 prompt）', () => {
    expect(buildScopeViolationFeedback([])).toBe('')
    expect(buildScopeViolationFeedback(null as any)).toBe('')
  })
  it('生成回灌段且只取最近 3 条', () => {
    const notes = [
      { chunk: '批1', dropped: ['A.vue'] },
      { chunk: '批2', dropped: ['B.vue', 'C.vue'] },
      { chunk: '批3', dropped: ['D.vue'] },
      { chunk: '批4', dropped: ['E.vue'] },
    ]
    const text = buildScopeViolationFeedback(notes as any)
    expect(text).toContain('输出范围修正')
    expect(text).not.toContain('A.vue') // 批1 被裁掉（只保留最近 3 条）
    expect(text).not.toContain('批1')
    expect(text).toContain('E.vue')
    expect(text).toContain('整段丢弃')
  })
})
