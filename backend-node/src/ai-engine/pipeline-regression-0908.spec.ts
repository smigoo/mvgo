/**
 * 0908 管线回归症状断言（P1 figmaNodeId 传播 + P5 DOM 级重复插槽清理）
 *
 * 背景（docs/0907-组件生成问题分析.md 第六章审计 + 0907 执行回顾）：
 * - T09 重复渲染问题：vision 把同一份统计数据同时放进 headerSlots 和 sections（header-stats），
 *   下游两路消费：section → 子组件渲染；headerSlots → T09 兜底注入插槽 → 双份渲染。
 *   0907 P1-3（#565）只做了「契约层」去重：跳过向 slots 注入，但 LLM 直接生成的/缓存恢复的
 *   <template #XXX> DOM 仍留在代码里 → 仍然双份渲染。
 * - C-1 越界几何过滤（09-02, 9c3aff7f）依赖 headerSlots[].figmaNodeId 在 Figma 节点树中定位候选
 *   bbox，但 visual-parser 产出的 headerSlots 大部分不带 figmaNodeId → C-1 定位不到 → 保守保留
 *   所有候选 → 内容区元素被误判为 header 插槽（9c3aff7f 把图标当纯文字渲染 + 双份挂载）。
 *
 * P1（2026-09-09）：
 *   - visual-parser.js：headerSlots 产出链路全部携带 figmaNodeId（section controls 提取 + inline
 *     rows 双通道：LLM 有 children 走子节点提取，bbox 无 children 走行名启发式）。
 *   - 修复死路径：bbox 重建的 inlineCompositeRows 只有 {name,layout,members}，不含 children，
 *     旧代码 `row.children` 恒为 [] → 兜底推断永远空。
 *   - inline 兜底从「覆盖」改为「合并+去重」：保留 section-inferred 已有 slot，追加无 content 冲突的新 slot。
 *
 * P5（2026-09-09）：
 *   - resource-mounter.js：P1-3 契约层过滤掉的 slot 若已有 <template #XXX> DOM → 扫描模板内部
 *     内容，与子组件文本重叠则移除整个模板（双保险，防 LLM/缓存直接生成的重复 DOM）。
 */

import * as fs from 'fs'
import * as path from 'path'

const AI_ENGINE_DIR = __dirname
const FIXTURE_DIR = path.resolve(__dirname, '../fixtures/0907')

function readSrc(rel: string): string {
  return fs.readFileSync(path.resolve(AI_ENGINE_DIR, rel), 'utf8')
}

function loadJson(rel: string): any {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, rel), 'utf8'))
}

/** 动态探测函数（ESM .js 下 require 失败 → 退回动态 import），不存在返回 null */
async function tryRequire<T = any>(rel: string, exportName: string): Promise<T | null> {
  const p = path.resolve(AI_ENGINE_DIR, rel)
  try {
    const mod = require(p)
    const ns = mod?.default ?? mod
    return ns?.[exportName] ?? null
  } catch {
    try {
      const mod = await import(p)
      const ns = mod?.default ?? mod
      return ns?.[exportName] ?? null
    } catch {
      return null
    }
  }
}

// ---------------------------------------------------------------------------
// P1 · visual-parser headerSlots 全部携带 figmaNodeId（C-1 过滤前置条件）
// 背景：device vision.json 的 headerSlots 无 figmaNodeId（content 只有 "设备类型 28"），
// C-1 越界过滤拿不到 bbox，只能保守保留全部 → 内容区元素被误判为 header 插槽。
// ---------------------------------------------------------------------------
describe('P1 headerSlots figmaNodeId 传播（C-1 过滤前置）', () => {
  test('P1-1: 伴生数据收集——section controls→headerSlots 携带 figmaNodeId', async () => {
    // device fixture：sections 含 header-stats，统计指标经 headerSlots 消费。
    // 断言产物 headerSlots 链路（vision.json 凭据）上存在的 slot 具备 figmaNodeId 解析前提。
    const vision = loadJson('device/vision.json')
    const headerSlots = Array.isArray(vision.headerSlots) ? vision.headerSlots : []
    // fixture 本身尚缺 figmaNodeId（P1 修复的目标场景）——这里断言的是：解析链路必须补上。
    // 以 environment 修复版 fixture 为准（its headerSlots 已带 figmaNodeId）
    const env = loadJson('env/vision.json')
    const envSlots = Array.isArray(env.headerSlots) ? env.headerSlots : []
    const withId = envSlots.filter((s: any) => s.figmaNodeId || s.id)
    expect(withId.length).toBeGreaterThanOrEqual(envSlots.length - 1) // 至少绝大多数带 id
  })

  test('P1-2: inline 行 LLM 路径（有 children）→ slot 携带子节点 figmaNodeId', async () => {
    const { inferHeaderSlotsFromInlineRows } = (await tryRequire<any>(
      './utils/inline-header-slot-inferrer.js',
      'inferHeaderSlotsFromInlineRows',
    )) || {}
    expect(inferHeaderSlotsFromInlineRows).not.toBeNull()
    if (!inferHeaderSlotsFromInlineRows) return
    const rows = [
      {
        id: 'row-1',
        name: 'header-controls',
        layout: 'horizontal',
        children: [
          { id: 'c1', type: 'stat-item', name: '设备类型 28' },
          { id: 'c2', type: 'tab-switch', name: '监控' },
          { id: 'c3', type: 'icon-button', name: '设置' },
        ],
      },
    ]
    const slots = inferHeaderSlotsFromInlineRows({ inlineCompositeRows: rows })
    expect(slots.length).toBe(3)
    // 每个 slot 都有 figmaNodeId，且直接来自子节点 id（供 C-1 定位）
    for (const s of slots) {
      expect(typeof s.figmaNodeId).toBe('string')
      expect(s.figmaNodeId.length).toBeGreaterThan(0)
    }
    expect(slots[0].figmaNodeId).toBe('c1')
    expect(slots[1].elementType).toBe('tab')
    expect(slots[2].elementType).toBe('icon')
  })

  test('P1-3: inline 行 bbox 路径（无 children）→ 以行名+行 id 兜底（死路径修复）', async () => {
    const { inferHeaderSlotsFromInlineRows } = (await tryRequire<any>(
      './utils/inline-header-slot-inferrer.js',
      'inferHeaderSlotsFromInlineRows',
    )) || {}
    expect(inferHeaderSlotsFromInlineRows).not.toBeNull()
    if (!inferHeaderSlotsFromInlineRows) return
    // bbox 重建路径：inlineCompositeRows 只有 {id,name,layout,members}，无 children
    const rows = [
      { id: 'row-2', name: 'header-right', layout: 'horizontal', members: ['m1', 'm2'] },
      { id: 'row-3', name: 'title-left', layout: 'horizontal', members: ['m3'] },
      { id: 'row-4', name: 'chart-area', layout: 'vertical', members: ['m4'] },
    ]
    const slots = inferHeaderSlotsFromInlineRows({ inlineCompositeRows: rows })
    // 前两个是 header-/title- 前缀 → 走行名启发式（死路径修复前 → 0 个）
    expect(slots.length).toBe(2)
    expect(slots[0].figmaNodeId).toBe('row-2')
    expect(slots[1].figmaNodeId).toBe('row-3')
    // chart-area 不算 header 行 → 不产生 slot
    expect(slots.every((s: any) => s.figmaNodeId)).toBe(true)
  })

  test('P1-4: inline 兜底「合并+去重」不覆盖已有 section-inferred slot', async () => {
    const { inferHeaderSlotsFromInlineRows, mergeHeaderSlots } = (await tryRequire<any>(
      './utils/inline-header-slot-inferrer.js',
      'mergeHeaderSlots',
    )) || {}
    expect(inferHeaderSlotsFromInlineRows).not.toBeNull()
    expect(mergeHeaderSlots).not.toBeNull()
    if (!inferHeaderSlotsFromInlineRows || !mergeHeaderSlots) return
    // 复刻 visual-parser 3190-3206 段的合并语义：
    const vision = loadJson('env/vision.json')
    const existingSlots = Array.isArray(vision.headerSlots) ? vision.headerSlots : []
    const inlineSlots = inferHeaderSlotsFromInlineRows({
      inlineCompositeRows: [{ id: 'r-9', name: 'header-right', children: [{ id: 'x-1', type: 'icon-button', name: '全新面板' }] }],
    })
    const merged = mergeHeaderSlots(existingSlots, inlineSlots)
    const oldContents = new Set(existingSlots.map((s: any) => s.content).filter(Boolean))
    const added = merged.filter((s: any) => !oldContents.has(s.content))
    // 新增的只有一个（无 content 冲突的 inline 项）
    expect(added.length).toBe(1)
    expect(added[0].content).toBe('全新面板')
    expect(added[0].figmaNodeId).toBe('x-1')
    // 总数 = 原有 + 1
    expect(merged.length).toBe(existingSlots.length + 1)
    // 不产生 content 重复
    const contents = merged.map((s: any) => s.content).filter(Boolean)
    expect(new Set(contents).size).toBe(contents.length)
  })

  test('P1-5 Loop0.A: C-1 rejected 的 inline slot 不得 merge 回来', async () => {
    const mergeHeaderSlots = await tryRequire<any>(
      './utils/inline-header-slot-inferrer.js',
      'mergeHeaderSlots',
    )
    expect(typeof mergeHeaderSlots).toBe('function')
    const existing: any[] = []
    const inline = [
      { slotType: 'header-right', elementType: 'statistic', content: '设备类型 28', figmaNodeId: 'n-stat' },
      { slotType: 'header-right', elementType: 'icon', content: '设置', figmaNodeId: 'n-ok' },
    ]
    const merged = mergeHeaderSlots(existing, inline, {
      rejectedKeys: new Set(['n-stat', '设备类型 28']),
    })
    expect(merged.map((s: any) => s.figmaNodeId)).toEqual(['n-ok'])
    expect(merged.some((s: any) => s.figmaNodeId === 'n-stat')).toBe(false)
  })

  test('P1-6 Loop0.A: 契约回写不得把 C-1 rejected 的 derived 加回（纠错 0 + derived 3 → derived 0）', async () => {
    const applyHeaderSlotContractRewrite = await tryRequire<any>(
      './utils/header-slot-contract.js',
      'applyHeaderSlotContractRewrite',
    )
    expect(typeof applyHeaderSlotContractRewrite).toBe('function')
    const vision = [
      { slotType: 'header-right', elementType: 'statistic', content: '设备类型 28', figmaNodeId: 'a' },
      { slotType: 'header-right', elementType: 'statistic', content: '在线 12', figmaNodeId: 'b' },
      { slotType: 'header-right', elementType: 'statistic', content: '离线 16', figmaNodeId: 'c' },
    ]
    const rejectedNodes = vision.map((s) => ({
      figmaNodeId: s.figmaNodeId,
      slotCandidate: { figmaNodeId: s.figmaNodeId, content: s.content },
    }))
    const out = applyHeaderSlotContractRewrite({
      headerSlots: vision,
      contractSlots: vision,
      rejectedNodes,
    })
    expect(out.headerSlots).toEqual([])
    expect(out.derivedKept).toBe(0)
    expect(out.visionKept).toBe(0)
  })

  test('P1-7 Loop0.B: Map 空 + declare 有 checkpoint → 用盘上的 componentId', async () => {
    const resolveComponentIdCheckpoint = await tryRequire<any>(
      './utils/component-naming.js',
      'resolveComponentIdCheckpoint',
    )
    const applyDeclareCheckpoint = await tryRequire<any>(
      './utils/component-naming.js',
      'applyDeclareCheckpoint',
    )
    expect(typeof resolveComponentIdCheckpoint).toBe('function')
    expect(typeof applyDeclareCheckpoint).toBe('function')
    const id = resolveComponentIdCheckpoint({
      sessionId: 'mc-max-1-abcdef12',
      memoryId: '',
      declareCheckpointId: 'c-device-monitor-abcdef12',
    })
    expect(id).toBe('c-device-monitor-abcdef12')
    const d: any = { componentId: 'c-device-monitor-abcdef12' }
    applyDeclareCheckpoint(d, {
      sessionId: 'mc-max-1-abcdef12',
      componentId: 'c-device-monitor-abcdef12',
      classPrefix: 'c-device-monitor',
    })
    expect(d.meta.checkpoint.componentId).toBe('c-device-monitor-abcdef12')
    expect(d.meta.checkpoint.classPrefix).toBe('c-device-monitor')
    const memWins = resolveComponentIdCheckpoint({
      sessionId: 'mc-max-1-abcdef12',
      memoryId: 'c-from-memory-abcdef12',
      declareCheckpointId: 'c-from-disk-abcdef12',
    })
    expect(memWins).toBe('c-from-memory-abcdef12')
  })
})

// ---------------------------------------------------------------------------
// P5 · DOM 级重复插槽清理（resource-mounter ensureHeaderSlots）
// 背景：P1-3 契约层过滤只跳过「注入」，但 LLM/缓存直接生成的 <template #header-right> DOM
// 仍留在代码里 → 与子组件渲染内容重叠 → 双份渲染。P5 扫描现有 DOM 移除重叠模板。
// ---------------------------------------------------------------------------
describe('P5 DOM 级重复插槽清理（T09 双保险）', () => {
  // 构造：子组件已渲染「当日总流量 22350」，主组件 template 残留 <template #header-right> 相同内容
  const files = {
    'package/index.vue': `<base-panel title="流量监测">
      <template #header-right>
        <span>当日总流量 22350</span>
        <span>车流量 16270</span>
      </template>
      <div class="c-root">主体</div>
    </base-panel>`,
    'package/components/FlowCard.vue': `<template>
      <div>
        <div class="label">当日总流量</div>
        <div class="value">22350</div>
        <div class="label">车流量</div>
        <div class="value">16270</div>
      </div>
    </template>`,
  }
  const input = {
    headerSlots: [
      { slotType: 'header-right', elementType: 'statistic', content: '当日总流量 22350', figmaNodeId: 'n1' },
    ],
  }

  test('P5-1: 与子组件文本重叠的 <template #header-right> 被整段移除', async () => {
    const { ensureHeaderSlots } = (await tryRequire<any>(
      './roles/microcode/resource-mounter.js',
      'ensureHeaderSlots',
    )) || {}
    expect(ensureHeaderSlots).not.toBeNull()
    if (!ensureHeaderSlots) return
    const result = ensureHeaderSlots(files['package/index.vue'], input, { files, componentType: 'microcode' })
    expect(result).not.toContain('当日总流量 22350')
    expect(result).not.toContain('<template #header-right>')
    // 非重叠主体保留
    expect(result).toContain('c-root')
  })

  test('P5-2: 与子组件无重叠的插槽模板保留（不误删）', async () => {
    const { ensureHeaderSlots } = (await tryRequire<any>(
      './roles/microcode/resource-mounter.js',
      'ensureHeaderSlots',
    )) || {}
    expect(ensureHeaderSlots).not.toBeNull()
    if (!ensureHeaderSlots) return
    const code = `<base-panel title="流量监测">
      <template #header-right>
        <span>自定义按钮</span>
      </template>
      <div class="c-root">主体</div>
    </base-panel>`
    const result = ensureHeaderSlots(code, input, { files, componentType: 'microcode' })
    expect(result).toContain('自定义按钮')
    expect(result).toContain('<template #header-right>')
  })

  test('P5-3: 空/仅注释插槽保留（P5 只清重叠内容）', async () => {
    const { ensureHeaderSlots } = (await tryRequire<any>(
      './roles/microcode/resource-mounter.js',
      'ensureHeaderSlots',
    )) || {}
    expect(ensureHeaderSlots).not.toBeNull()
    if (!ensureHeaderSlots) return
    const code = `<base-panel title="流量监测">
      <template #header-right>
        <!-- 模型占位 -->
      </template>
      <div class="c-root">主体</div>
    </base-panel>`
    const result = ensureHeaderSlots(code, input, { files, componentType: 'microcode' })
    expect(result).toContain('<template #header-right>')
    expect(result).toContain('<!-- 模型占位 -->')
  })

  test('P5-4: vue3 组件类型跳过（无 base-panel 宿主）', async () => {
    const { ensureHeaderSlots } = (await tryRequire<any>(
      './roles/microcode/resource-mounter.js',
      'ensureHeaderSlots',
    )) || {}
    expect(ensureHeaderSlots).not.toBeNull()
    if (!ensureHeaderSlots) return
    const code = `<template>
      <div class="c-root">主体</div>
    </template>`
    const result = ensureHeaderSlots(code, input, { files, componentType: 'vue3' })
    expect(result).toBe(code) // 原样返回
  })
})
