// backend-root.js 是 ESM 风格（fileURLToPath(import.meta.url)），ts-jest CJS 转换下会撞名
// ⇒ 沿用既有惯例（resource-mounter.spec / ensure-header-slots.* 同款）工厂 mock 绕过真实文件。
jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: '/tmp/mvgo-test-logs',
}))

/**
 * 🔴 2026-11-16（mc-max-1794761434475-a1dbffb6 实锤）：T09 插槽计数必须能区分「没跑」与
 * 「跑过了但每个出口都吃掉」。
 *
 * 真机读数：`evaluated=3 blocked=2 slotBodyDuplicate=0` 之后**注入 0 条**，而产物
 * `#header-right` 为空 —— 剩下那一条死在哪个静默出口（slotType 未映射 / content 空 /
 * 既有插槽已有内容）当时无从判断：三个出口都是裸 `continue`，既不计数也不打形状。
 *
 * 本 spec 用「逐出口单点触发」把四个出口钉死：每个用例只让一个出口命中，
 * 断言对应计数 +1、其余为 0，且 pending/injected 与预期一致（阴性对照 = 正常插槽必须注入）。
 */
import { ensureHeaderSlots } from './resource-mounter.js'

const INDEX_EMPTY_SLOT = `<template>
  <base-panel panelKey="default-panel">
    <template #header-right>
      
    </template>
    <div class="c-x-slot-con"></div>
  </base-panel>
</template>
<script setup>
const a = 1
</script>`

const INDEX_FILLED_SLOT = `<template>
  <base-panel panelKey="default-panel">
    <template #header-right>
      <span class="c-x-txt">已有内容</span>
    </template>
    <div class="c-x-slot-con"></div>
  </base-panel>
</template>
<script setup>
const a = 1
</script>`

type Meta = Record<string, any>

function run(code: string, slots: any[]) {
  const logs: Array<{ msg: string; meta?: Meta }> = []
  const logger = {
    info: (msg: string, meta?: Meta) => logs.push({ msg, meta }),
    warn: (msg: string, meta?: Meta) => logs.push({ msg, meta }),
    error: (msg: string, meta?: Meta) => logs.push({ msg, meta }),
  }
  const out = ensureHeaderSlots(
    code,
    { headerSlots: slots },
    { logger, files: { 'package/index.vue': code } },
  )
  const statsOf = (msg: string): Meta | undefined =>
    logs.find((l) => l.msg.includes(msg))?.meta
  return {
    out,
    changed: out !== code,
    block: statsOf('T09 资源型插槽文本注入拦截'),
    result: statsOf('T09 插槽注入结果'),
    diag: logs.find((l) => l.msg.includes('T09 未注入诊断'))?.meta,
  }
}

describe('T09 插槽逐出口计数（可归因）', () => {
  it('阴性对照：label 插槽 + 空模板 ⇒ 注入成功，injected=1', () => {
    const r = run(INDEX_EMPTY_SLOT, [
      { slotType: 'header-right', elementType: 'label', content: '全国', figmaNodeId: '48:5902' },
    ])
    expect(r.changed).toBe(true)
    expect(r.out).toContain('全国')
    expect(r.result).toMatchObject({ evaluated: 1, blocked: 0, injected: 1, pending: 1 })
    expect(r.diag).toBeUndefined()
  })

  it('出口①资源型（elementType=icon）⇒ blocked=1，pending=0 且打形状快照', () => {
    const r = run(INDEX_EMPTY_SLOT, [
      { slotType: 'header-right', elementType: 'icon', content: '装饰图标', figmaNodeId: '48:5903' },
    ])
    expect(r.changed).toBe(false)
    expect(r.result).toMatchObject({ evaluated: 1, blocked: 1, injected: 0, pending: 0 })
    expect(r.diag?.slotsShape?.[0]).toMatchObject({ elementType: 'icon', resourceBacked: true })
  })

  it('出口②slotType 未映射 ⇒ noSlotName=1，pending=0', () => {
    const r = run(INDEX_EMPTY_SLOT, [
      { slotType: 'footer-left', elementType: 'label', content: '全国' },
    ])
    expect(r.changed).toBe(false)
    expect(r.result).toMatchObject({ evaluated: 1, noSlotName: 1, blocked: 0, pending: 0, injected: 0 })
    expect(r.diag?.slotsShape?.[0]).toMatchObject({ slotType: 'footer-left' })
  })

  it('出口③content 为空 ⇒ emptyContent=1，pending=0', () => {
    const r = run(INDEX_EMPTY_SLOT, [
      { slotType: 'header-right', elementType: 'label', content: '   ' },
    ])
    expect(r.changed).toBe(false)
    expect(r.result).toMatchObject({ evaluated: 1, emptyContent: 1, pending: 0, injected: 0 })
  })

  it('出口④既有插槽已有实体内容 ⇒ existingSlotKept=1，不覆盖', () => {
    const r = run(INDEX_FILLED_SLOT, [
      { slotType: 'header-right', elementType: 'label', content: '全国', figmaNodeId: '48:5902' },
    ])
    expect(r.changed).toBe(false)
    expect(r.out).toContain('已有内容')
    expect(r.result).toMatchObject({ evaluated: 1, existingSlotKept: 1, pending: 0, injected: 0 })
  })

  it('恒等性：evaluated = blocked + noSlotName + emptyContent + slotBodyDuplicate + existingSlotKept + pending', () => {
    const r = run(INDEX_EMPTY_SLOT, [
      { slotType: 'header-right', elementType: 'label', content: '全国', figmaNodeId: '48:5902' },
      { slotType: 'header-right', elementType: 'icon', content: '装饰图标', figmaNodeId: '48:5903' },
      { slotType: 'footer-left', elementType: 'label', content: 'x' },
      { slotType: 'header-right', elementType: 'label', content: '' },
    ])
    const s = r.result as Meta
    expect(s.evaluated).toBe(4)
    expect(
      s.blocked + s.noSlotName + s.emptyContent + s.slotBodyDuplicate + s.existingSlotKept + s.pending,
    ).toBe(s.evaluated)
    expect(s.injected).toBe(1)
  })
})
