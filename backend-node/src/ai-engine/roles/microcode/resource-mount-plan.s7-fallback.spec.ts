/**
 * 🛡️ S7 几何相容门 spec（2026-11-12 · mc-1794464620608-61ca9e0b 实锤）。
 *
 * 病灶：三张 tab 状态背景（`bg-tab-today/month/year`，各 **52×20**）因 LLM 未给 tab
 *   元素对应类名而 `findTagByClassKeyword` miss ⇒ S7 按名字相似度回退，被评分挑中
 *   `slot-con`(396×292) / `item-inspection-stats-row`(288×45) / `Frame 2136638243`(385×192)
 *   ⇒ `background-size:100% 100%` 把 52×20 小图拉伸铺满整块面板（用户实测：上半区变成
 *   一块巨大蓝色渐变，雷达区数字发虚）。
 *
 * 治法：回退落点必须通过**几何相容**校验（覆盖率 ≥ ANCHOR_PROMOTION_MIN_AXIS_RATIO=0.5，
 *   与 `buildResourceMountPlan` 的 `isCoLocatedAnchor` 同源）；缺事实 fail-open。
 *
 * 本 spec 守三件事：
 *   ① 阳性：52×20 挂 288×45 / 396×292 ⇒ 拒绝挂载（产物不得出现 backgroundImage）；
 *   ② 阴性：尺寸同层（392×79 挂 392×79）、无真值盒、落点盒不可证 ⇒ 照常挂载（不误杀）；
 *   ③ 落点盒解析三条纯事实路径（data-section-id / class 数字 / class 词元）各自可命中。
 */
jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: '/tmp/mvgo-test-logs',
}), { virtual: true })

import { mountPlannedResources, resolveProductTagBox } from './resource-mount-plan.js'

/** 造 figma 索引：nodeId → 原始节点（含 absoluteBoundingBox） */
const figmaIndex = (nodes: Array<{ id: string; name: string; w: number; h: number; x?: number; y?: number }>) => {
  const m = new Map<string, any>()
  for (const n of nodes) {
    m.set(n.id, {
      id: n.id,
      name: n.name,
      absoluteBoundingBox: { x: n.x || 0, y: n.y || 0, width: n.w, height: n.h },
    })
  }
  return m
}

/**
 * 唯一候选 = 落点。class 含 `tab` 词但不含连续串 `tab-today`
 * ⇒ `findTagByClassKeyword('tab-today')` miss、`scoreMountTarget` 仍有正分（走 S7）。
 */
const vueWith = (candidate: string) => `<template>
  <div class="c-hazard-investigation-root">
    ${candidate}
  </div>
</template>
<script setup>
</script>`

const run = (opts: {
  candidate: string
  mount: Record<string, any>
  figmaIndex?: Map<string, any> | null
  kind?: string
}) => {
  const files: Record<string, string> = { 'package/index.vue': vueWith(opts.candidate) }
  const plan = {
    byFile: new Map([
      ['../resources/images/bg-tab-today-154.png', { varName: 'bg1', kind: opts.kind || 'bg', mounts: [opts.mount] }],
    ]),
  }
  const r = mountPlannedResources(files, plan as any, { figmaIndex: opts.figmaIndex ?? null })
  return { out: files['package/index.vue'], diagnostics: r.diagnostics }
}

const TAB_BOX = { x: 0, y: 0, width: 52, height: 20 }

describe('S7 回退几何相容门（跨层挂载必拒）', () => {
  it('阳性①：52×20 tab 背景回退到 288×45 统计行 ⇒ 拒绝挂载', () => {
    const { out, diagnostics } = run({
      candidate: '<div class="c-hazard-investigation-tab-item" data-section-id="2002:132"></div>',
      mount: { mountTarget: 'tab-today', figmaBox: TAB_BOX, parentBox: TAB_BOX },
      figmaIndex: figmaIndex([{ id: '2002:132', name: 'item-inspection-stats-row-1', w: 288, h: 45 }]),
    })
    expect(out).not.toContain('backgroundImage')
    const hit = diagnostics.find((d: any) => d.reason === 's7-fallback-cross-layer-rejected')
    expect(hit).toBeTruthy()
    expect(hit.ratio).toBeLessThan(0.5)
    expect(hit.anchorBox).toMatchObject({ width: 288, height: 45 })
  })

  it('阳性②：52×20 tab 背景回退到 396×292 段根（无 data-section-id，走 class 词元）⇒ 拒绝挂载', () => {
    const { out, diagnostics } = run({
      candidate: '<div class="c-hazard-investigation-slot-con c-hazard-investigation-tab-bar"></div>',
      mount: { mountTarget: 'tab-today', figmaBox: TAB_BOX, parentBox: TAB_BOX },
      figmaIndex: figmaIndex([{ id: '2002:157', name: 'slot-con', w: 396, h: 292 }]),
    })
    expect(out).not.toContain('backgroundImage')
    expect(diagnostics.find((d: any) => d.reason === 's7-fallback-cross-layer-rejected')).toBeTruthy()
  })

  it('阴性①：392×79 段背景回退到 392×79 同层容器 ⇒ 照常挂载', () => {
    const { out } = run({
      candidate: '<div class="c-hazard-investigation-tab-row" data-section-id="1:743"></div>',
      mount: {
        mountTarget: 'tab-today',
        figmaBox: { x: 0, y: 0, width: 392, height: 79 },
        parentBox: { x: 0, y: 0, width: 392, height: 79 },
      },
      figmaIndex: figmaIndex([{ id: '1:743', name: 'section-01-inspection-summary', w: 392, h: 79 }]),
    })
    expect(out).toContain('backgroundImage')
    expect(out).toContain('bg1')
  })

  it('阴性②：无 figmaIndex（落点盒不可证）⇒ fail-open 照常挂载', () => {
    const { out } = run({
      candidate: '<div class="c-hazard-investigation-tab-item" data-section-id="2002:132"></div>',
      mount: { mountTarget: 'tab-today', figmaBox: TAB_BOX, parentBox: TAB_BOX },
    })
    expect(out).toContain('backgroundImage')
  })

  it('阴性③：资源缺 figmaBox/parentBox（真值盒不可证）⇒ fail-open 照常挂载', () => {
    const { out } = run({
      candidate: '<div class="c-hazard-investigation-tab-item" data-section-id="2002:132"></div>',
      mount: { mountTarget: 'tab-today' },
      figmaIndex: figmaIndex([{ id: '2002:132', name: 'item-inspection-stats-row-1', w: 288, h: 45 }]),
    })
    expect(out).toContain('backgroundImage')
  })

  it('阴性④：非 bg 角色（icon 小图远小于宿主是常态）不受几何门约束 ⇒ 照常挂载', () => {
    const { out } = run({
      candidate: '<div class="c-hazard-investigation-tab-item" data-section-id="2002:132"></div>',
      mount: { mountTarget: 'tab-today', figmaBox: TAB_BOX, parentBox: TAB_BOX },
      figmaIndex: figmaIndex([{ id: '2002:132', name: 'item-inspection-stats-row-1', w: 288, h: 45 }]),
      kind: 'icon',
    })
    expect(out).toContain('<img')
  })
})

describe('resolveProductTagBox（落点盒解析·三条纯事实路径）', () => {
  const idx = figmaIndex([
    { id: '2002:132', name: 'item-inspection-stats-row-1', w: 288, h: 45 },
    { id: '2002:157', name: 'slot-con', w: 396, h: 292 },
    { id: '1:743', name: 'section-01-inspection-summary', w: 392, h: 79 },
  ])

  it('路径①：data-section-id 直连', () => {
    const b = resolveProductTagBox('<div class="x-con" data-section-id="2002:132">', '', idx)
    expect(b).toMatchObject({ width: 288, height: 45 })
  })

  it('路径③：class 词元 ↔ 节点名（slot-con）', () => {
    const b = resolveProductTagBox('<div class="c-hazard-investigation-slot-con">', '', idx)
    expect(b).toMatchObject({ width: 396, height: 292 })
  })

  it('阴性：class 与任何节点名都不匹配 ⇒ null（不猜）', () => {
    expect(resolveProductTagBox('<div class="c-hazard-investigation-unknown-box">', '', idx)).toBeNull()
  })

  it('阴性：无 figmaIndex ⇒ null', () => {
    expect(resolveProductTagBox('<div data-section-id="2002:132">', '', null)).toBeNull()
  })
})
