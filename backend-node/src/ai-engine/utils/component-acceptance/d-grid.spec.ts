/**
 * 🛡️ D-GRID 元素级列数判据（2026-11-12 · P0-2 放水评审）
 *
 * 病灶两连：
 *   ① 旧实现是**文件级**正则 —— 同文件里任一元素写了 `repeat(4` 即通过，
 *      本段哪怕 flex 平铺也 PASS（"放水"）。
 *   ② 只认 `repeat(K` —— 合规的显式轨道 `1fr 1fr 1fr 1fr` 或 flex 等分被误判 FAIL。
 *
 * 本组锁死三条：
 *   阳性（3）：repeat / 显式轨道 / flex calc 等分 都能证明列数 ⇒ PASS；
 *   阴性（3）：flex 平铺数不出 / 列数不符 / 同文件别处写对不得冒充 ⇒ FAIL；
 *   跳 过（1）：无 v-for ⇒ 无「重复列」语义 ⇒ fail-open。
 */
import { runAcceptanceChecks } from './index.js'

const PLAN = (k = 4) => ({
  effectiveSections: [
    {
      id: '38:3137',
      type: 'grid',
      gridColumns: k,
      header: { title: '战略合作厂商' },
      absoluteBoundingBox: { x: 0, y: 0, width: 604, height: 161 },
    },
  ],
})

/** 单段产物：网格样式由调用方给定（写 <style> class 规则，与真机产物同形态） */
const build = (gridCss: string, itemCss = '.item { width: 126px }', withVFor = true) => ({
  'package/index.vue': `<template><div class="root"><GroupA /></div></template>`,
  'package/components/GroupA.vue': `<template>
  <div class="card" data-section-id="38:3137">
    <div class="hd"><span>战略合作厂商</span></div>
    <div class="grid">
      ${withVFor ? '<div v-for="it in list" :key="it.id" class="item">{{ it.name }}</div>' : '<div class="item">甲</div>'}
    </div>
  </div>
</template>
<style>
${gridCss}
${itemCss}
</style>`,
})

const dGrid = (fails: any[]) => fails.filter((f) => f.code === 'D-GRID')

describe('D-GRID 元素级列数判据', () => {
  it('阳性①：grid + repeat(4, 126px) ⇒ 列数可证，不报', () => {
    const r = runAcceptanceChecks({
      files: build('.grid { display: grid; grid-template-columns: repeat(4, 126px); column-gap: 20px }'),
      componentPlan: PLAN(4),
    })
    expect(dGrid(r.fails)).toHaveLength(0)
  })

  it('阳性②：显式轨道 1fr 1fr 1fr 1fr ⇒ 数得出 4 列，不报（旧实现会误判）', () => {
    const r = runAcceptanceChecks({
      files: build('.grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr }'),
      componentPlan: PLAN(4),
    })
    expect(dGrid(r.fails)).toHaveLength(0)
  })

  it('阳性③：flex 行 + 子项 calc((100% - 60px) / 4) ⇒ 等分 4 份可证，不报', () => {
    const r = runAcceptanceChecks({
      files: build(
        '.grid { display: flex; flex-direction: row }',
        '.item { flex-basis: calc((100% - 60px) / 4) }',
      ),
      componentPlan: PLAN(4),
    })
    expect(dGrid(r.fails)).toHaveLength(0)
  })

  it('阴性①（放水回归）：本段 flex 平铺数不出列数 ⇒ FAIL', () => {
    const r = runAcceptanceChecks({
      files: build('.grid { display: flex; flex-wrap: wrap }', '.item { flex: 1 1 0 }'),
      componentPlan: PLAN(4),
    })
    expect(dGrid(r.fails)).toHaveLength(1)
    expect(dGrid(r.fails)[0].detail).toContain('数不出列数')
  })

  it('阴性②（放水回归）：同文件另一处写 repeat(4) 不得替本段作证 ⇒ 仍 FAIL', () => {
    const r = runAcceptanceChecks({
      // 关键：旧实现是文件级正则 ⇒ `.decoy` 里的 repeat(4 会让本段白过
      files: build(
        '.grid { display: flex; flex-wrap: wrap }\n.decoy { display: grid; grid-template-columns: repeat(4, 126px) }',
        '.item { flex: 1 1 0 }',
      ),
      componentPlan: PLAN(4),
    })
    expect(dGrid(r.fails)).toHaveLength(1)
  })

  it('阴性③：声明 3 列但真值 4 列 ⇒ FAIL 且指明实际列数', () => {
    const r = runAcceptanceChecks({
      files: build('.grid { display: grid; grid-template-columns: repeat(3, 126px) }'),
      componentPlan: PLAN(4),
    })
    expect(dGrid(r.fails)).toHaveLength(1)
    expect(dGrid(r.fails)[0].detail).toContain('3 列')
  })

  it('跳过：无 v-for ⇒ 无重复列语义，fail-open 不判', () => {
    const r = runAcceptanceChecks({
      files: build('.grid { display: flex; flex-wrap: wrap }', '.item { flex: 1 1 0 }', false),
      componentPlan: PLAN(4),
    })
    expect(dGrid(r.fails)).toHaveLength(0)
  })
})
