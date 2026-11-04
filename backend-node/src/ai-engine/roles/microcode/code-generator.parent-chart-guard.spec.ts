import { jest } from '@jest/globals'

// ⚠️ 加载期拦截：下列模块内部使用 import.meta，jest CJS 模式下直接 import 会加载失败。
// 与 code-generator.parse-failure.spec.ts / deterministic-template.spec.ts 同款替身。
jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  backendRoot: process.cwd(),
  projectRoot: process.cwd(),
  logsDir: require('os').tmpdir(),
  dataDir: require('os').tmpdir(),
  tempComponentsDir: require('os').tmpdir(),
}), { virtual: true })

jest.mock('../../utils/sfc-semantics.js', () => ({
  dedupeScriptImports: (s: string) => s,
  dedupeScriptDeclarations: (s: string) => s,
  dedupeMcComponentBuilder: (s: string) => s,
  dedupeLifecycleHooks: (s: string) => s,
  validateVueScriptSemantics: () => ({ issues: [] }),
  extractComponentTagNames: () => [],
  VUE_BUILTIN_COMPONENTS: [],
  findTdzReferences: () => [],
  autoFixTdzReferences: (s: string) => ({ fixed: [], content: s }),
}))

jest.mock('../../utils/prompt-loader.js', () => ({
  loadMd: () => '',
  validatePromptsDir: () => true,
  buildSharedSections: () => '',
  trimConstraintsForContext: (c = '') => c,
  buildConcerns: () => '',
  formatAssetsList: () => '',
  buildTextInventorySection: () => '',
  buildStructureMarkersSection: () => '',
  buildFigmaStage: () => '',
}))

jest.mock('../../utils/resource-import-guard.js', () => ({
  extractResourceVarNames: () => [],
  resolveResourceDomMapping: () => ({}),
}))

jest.mock('../../utils/provider-pool.js', () => ({
  getProviderPool: () => ({ recordTimeout: () => {}, get: () => null }),
}))

jest.mock('../../utils/llm-timeout.js', () => ({ invokeWithTimeout: jest.fn() }))

import { buildScriptChunkMiddle, templateHasNoRefMount } from './prompt-builder.js'
import { generateIndexVue } from './code-generator.js'

/**
 * 🛡️ 父级图表挂载守卫（2026-11-04 治本 · mc-max-1793767891707-10c19d61 实锤）。
 *
 * 病灶：index.vue 最终模板由确定性骨架生成（子组件组合壳，无任何 ref 挂载 div），
 * 而 script 段 prompt 仍鼓励「如有图表，使用 echarts.init() + watch(chartRef)」⇒
 * LLM 写出完整父级图表实现 ⇒ echarts.init(chartRef) 无本文件挂载 ⇒
 * DO-NOT-INVENT-CHART-MOUNT-MISSING 终态拦截（iteration 8 无回环，任务失败）。
 *
 * 三条防线（判据单一来源 templateHasNoRefMount）：
 *   ① 纯判据：模板无 ref 锚 → true（有锚/空模板 → false，fail-open）；
 *   ② 单 chunk script 段 prompt：无锚 → 「如有图表…」鼓励句替换为硬禁令；
 *   ③ scriptSplit charts 段：无锚 → 跳过（续接 1787708996212「isForced 跳过」口径）。
 */

const NO_MOUNT_TPL = `<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-root" style="display:flex;flex-direction:column">
      <TabsSection style="flex: 0.325 1 0;min-height:0;" />
      <ChartSection style="flex: 1.675 1 0;" />
    </div>
  </base-panel>
</template>`

const MOUNT_TPL = `<template>
  <div class="c-env-monitor-root">
    <div class="c-env-monitor-chart">
      <div ref="chartRef" class="c-env-monitor-chart-inner"></div>
    </div>
  </div>
</template>`

describe('父级图表挂载守卫 · templateHasNoRefMount（纯判据）', () => {
  it('⭐ 阳性：子组件组合壳（无任何 ref 属性）→ true（父级图表实现必然孤儿）', () => {
    expect(templateHasNoRefMount(NO_MOUNT_TPL)).toBe(true)
  })

  it('阴性：静态 ref="chartRef" 挂载 → false（零行为变化）', () => {
    expect(templateHasNoRefMount(MOUNT_TPL)).toBe(false)
  })

  it('阴性：动态 :ref="chartRef" 绑定也算锚存在 → false', () => {
    expect(templateHasNoRefMount('<template><div :ref="chartRef"></div></template>')).toBe(false)
  })

  it('阴性：空模板 → false（部分修订路径不猜）', () => {
    expect(templateHasNoRefMount('')).toBe(false)
    expect(templateHasNoRefMount(null as any)).toBe(false)
  })
})

describe('父级图表挂载守卫 · buildScriptChunkMiddle（单 chunk script 段禁令）', () => {
  const mkInput = () => ({
    componentName: 'env-monitor',
    layoutStructure: null,
    resourceDomMapping: {},
    outputPath: '/tmp/x',
  })

  it('⭐ 阳性：contextFiles 模板无锚 → 鼓励句替换为硬禁令（禁 echarts.init/图表实现）', () => {
    const chunk = {
      index: 3,
      total: 5,
      title: 'index.vue 脚本',
      contextFiles: [{ path: 'package/index.vue (template)', content: NO_MOUNT_TPL }],
    }
    const prompt = buildScriptChunkMiddle(chunk as any, mkInput() as any)
    expect(prompt).toContain('父模板无任何 ref 挂载点')
    expect(prompt).toContain('禁止')
    expect(prompt).toContain('DO-NOT-INVENT-CHART-MOUNT-MISSING')
    // 鼓励句必须被替换——它正是 10c19d61 病灶的 prompt 层诱因
    expect(prompt).not.toContain('如有图表，使用 echarts.init()')
  })

  it('阴性：模板有 ref 挂载 → 保留既有鼓励句（零行为变化）', () => {
    const chunk = {
      index: 3,
      total: 5,
      title: 'index.vue 脚本',
      contextFiles: [{ path: 'package/index.vue (template)', content: MOUNT_TPL }],
    }
    const prompt = buildScriptChunkMiddle(chunk as any, mkInput() as any)
    expect(prompt).toContain('如有图表，使用 echarts.init() + ResizeObserver + watch(chartRef) 模式')
    expect(prompt).not.toContain('父模板无任何 ref 挂载点')
  })

  it('阴性：无模板上下文（部分修订）→ 不注入禁令（fail-open）', () => {
    const chunk = { index: 3, total: 5, title: 'index.vue 脚本', contextFiles: [] }
    const prompt = buildScriptChunkMiddle(chunk as any, mkInput() as any)
    expect(prompt).toContain('如有图表，使用 echarts.init() + ResizeObserver + watch(chartRef) 模式')
  })
})

describe('父级图表挂载守卫 · generateIndexVue（charts 段跳过决策）', () => {
  const mkRun = (tpl: string) => {
    const requested: Array<{ segmentType: string; scriptPart: string }> = []
    const runChunk = async (chunk: any) => {
      requested.push({
        segmentType: String(chunk?.segmentType || ''),
        scriptPart: String(chunk?.scriptPart || ''),
      })
      if (chunk?.segmentType === 'template') {
        return { files: { 'package/index.vue': tpl } }
      }
      return { files: { 'package/index.vue': '<script setup>\nconst activeTab = 1\n</script>' } }
    }
    return { runChunk, requested }
  }
  const mkInput = () => ({
    componentName: 'env-monitor',
    layoutStructure: null,
    resourceDomMapping: {},
    outputPath: '/tmp/x',
  } as any)

  it('⭐ 阳性：自然拆分（isForced 无）+ 模板无锚 → charts 段被跳过', async () => {
    const { runChunk, requested } = mkRun(NO_MOUNT_TPL)
    const assembled = await generateIndexVue(
      runChunk as any,
      mkInput(),
      { splitDecision: { scriptSplit: true, estTokens: 100, sizeTier: 'L' }, allFiles: { 'declare.json': '{}' } },
      {},
    )
    // charts 段不再请求（省一次 LLM + 杜绝父级孤儿图表实现）
    expect(requested.some((r) => r.scriptPart === 'charts')).toBe(false)
    // state/lifecycle 段照常
    expect(requested.some((r) => r.scriptPart === 'state')).toBe(true)
    expect(requested.some((r) => r.scriptPart === 'lifecycle')).toBe(true)
    // 拼装产物仍是完整 SFC
    expect(assembled).toContain('<template')
    expect(assembled).toContain('<script setup>')
  })

  it('阴性：模板有 ref 挂载 → charts 段照常请求（既有行为）', async () => {
    const { runChunk, requested } = mkRun(MOUNT_TPL)
    await generateIndexVue(
      runChunk as any,
      mkInput(),
      { splitDecision: { scriptSplit: true, estTokens: 100, sizeTier: 'L' }, allFiles: { 'declare.json': '{}' } },
      {},
    )
    expect(requested.some((r) => r.scriptPart === 'charts')).toBe(true)
  })
})
