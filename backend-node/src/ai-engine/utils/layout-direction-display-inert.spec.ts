/**
 * F16（2026-10-21）：方向判据必须「先验 display」。
 *
 * 真实事故 mc-max-1792497064987-195c8d0e「合作厂商弹窗」：
 * `ListList.vue` / `ListList2.vue` 通篇 `display:flex` 出现 **0 次**，
 * 真值是 4 列横排，产物一列到底，判据却全绿 —— 因为「没有方向声明」被归入
 * `skippedNoActual` 直接放过。
 *
 * 本 spec 的每个阳性对照都对应一种「字面看起来对、实际无效」的写法。
 */
import {
  resolveActualDirection,
  collectDirectionKinds,
} from './layout-direction-guard.js'
import {
  detectVForListDirectionMismatch,
  healVForListDirection,
} from './vfor-list-direction-guard.js'

const tag = (name: string, className: string) => ({
  name,
  attrs: ` class="${className}"`,
})

describe('declToKind / resolveActualDirection：display 前置', () => {
  it('阳性对照 A：只有 width，无 display 无 flex-direction ⇒ 块级默认 column', () => {
    const corpus = `.c-x-grid { width: 100%; }`
    const actual = resolveActualDirection(tag('div', 'c-x-grid'), corpus, {
      inferDefaultBlock: true,
    })
    expect(actual?.kind).toBe('column')
    expect(actual?.inferred).toBe('default-block')
  })

  it('阳性对照 B：flex-direction: row 但 display 非 flex ⇒ 声明无效，实际 column', () => {
    const corpus = `.c-x-grid { flex-direction: row; width: 100%; }`
    const kinds = collectDirectionKinds(corpus, '.c-x-grid')
    expect(kinds[0]?.kind).toBe('column')
    expect(kinds[0]?.inertFlexDirection).toBe('row')
  })

  it('阳性对照 C：display:flex 但没写 flex-direction ⇒ CSS 初始值 row', () => {
    const corpus = `.c-x-grid { display: flex; }`
    const actual = resolveActualDirection(tag('div', 'c-x-grid'), corpus, {
      inferDefaultBlock: true,
    })
    expect(actual?.kind).toBe('row')
  })

  it('阴性对照 A：真正的 flex-row 容器 ⇒ row（不误判）', () => {
    const corpus = `.c-x-grid { display: flex; flex-direction: row; }`
    expect(
      resolveActualDirection(tag('div', 'c-x-grid'), corpus, { inferDefaultBlock: true })
        ?.kind,
    ).toBe('row')
  })

  it('阴性对照 B：display 与 flex-direction 拆进两份同名规则块 ⇒ 按层叠合并，仍是 row', () => {
    const corpus = `.c-x-grid { display: flex; }\n.c-x-grid { flex-direction: row; }`
    expect(
      resolveActualDirection(tag('div', 'c-x-grid'), corpus, { inferDefaultBlock: true })
        ?.kind,
    ).toBe('row')
  })

  it('阴性对照 C：自定义组件标签（非块级）且无声明 ⇒ 不猜（null）', () => {
    const actual = resolveActualDirection(tag('MyCard', 'c-x-card'), ``, {
      inferDefaultBlock: true,
    })
    expect(actual).toBeNull()
  })

  it('默认关闭 inferDefaultBlock ⇒ 保持旧行为（null），零回归', () => {
    expect(resolveActualDirection(tag('div', 'c-x-grid'), `.c-x-grid{width:100%}`)).toBeNull()
  })

  it('grid 容器照旧判 grid（不被 display 前置逻辑吃掉）', () => {
    const corpus = `.c-x-grid { display: grid; grid-template-columns: repeat(4, 1fr); }`
    expect(
      resolveActualDirection(tag('div', 'c-x-grid'), corpus, { inferDefaultBlock: true }),
    ).toMatchObject({ kind: 'grid', cols: 4 })
  })
})

describe('detectVForListDirectionMismatch：display:flex 全缺 ⇒ 必须判红', () => {
  /** 真实产物形态：wrapper 与 item 都没有 display / flex-direction */
  const product = [
    {
      path: 'package/components/ListList.vue',
      content: `<template>
  <div data-section-id="38:3167-list" class="c-x-list-grid">
    <div v-for="(it, i) in list" :key="i" class="c-x-list-cell">
      <span>{{ it.name }}</span>
    </div>
  </div>
</template>
<style lang="less" scoped>
.c-x-list-grid { width: 100%; min-height: 0; }
.c-x-list-cell { height: 30px; background: #fff; }
</style>`,
    },
  ]
  const layoutStructure = {
    layout: {
      sections: [
        {
          // 折叠列表段（`-list` 合成 id）：自身 layout = 重复单元**之间**排布 ⇒ wrapper 期望
          id: '38:3167-list',
          layout: 'horizontal',
          // 子段 = 重复单元原型：自身 layout = **单元内部**排布 ⇒ item 期望
          children: [{ id: '38:3168', layout: 'horizontal' }],
        },
      ],
    },
  }

  it('阳性对照：wrapper 与 item 一列到底 ⇒ 两条 issue 都要报', () => {
    const out = detectVForListDirectionMismatch(product, layoutStructure)
    const wrapper = out.issues.find((i: any) => i.id === 'VFOR-DIR-WRAPPER')
    const item = out.issues.find((i: any) => i.id === 'VFOR-DIR-ITEM')
    expect(wrapper).toBeTruthy()
    expect(wrapper.hint.actual).toBe('column')
    expect(item).toBeTruthy()
    expect(item.hint.actual).toBe('column')
  })

  it('自愈：整块无 flex-direction ⇒ 注入 display:flex + flex-direction:row', () => {
    const out = detectVForListDirectionMismatch(product, layoutStructure)
    const healed = healVForListDirection(product, out.issues)
    const file = healed.files.find((f: any) => /ListList\.vue$/.test(f.path))!
    expect(file.content).toMatch(/\.c-x-list-grid \{[^}]*display:\s*flex/)
    expect(file.content).toMatch(/\.c-x-list-grid \{[^}]*flex-direction:\s*row/)
    expect(healed.healed.some((h: any) => h.mode === 'inject-display-flex')).toBe(true)
  })

  it('自愈后复检归零（幂等收敛，无震荡）', () => {
    const out = detectVForListDirectionMismatch(product, layoutStructure)
    const healed = healVForListDirection(product, out.issues)
    const again = detectVForListDirectionMismatch(healed.files, layoutStructure)
    expect(again.issues.filter((i: any) => i.id === 'VFOR-DIR-WRAPPER')).toHaveLength(0)
  })

  it('阴性对照：已经写了 display:flex + row ⇒ 不产生 issue', () => {
    const fixed = [
      {
        ...product[0],
        content: product[0].content
          .replace('.c-x-list-grid { width: 100%; min-height: 0; }', '.c-x-list-grid { display: flex; flex-direction: row; width: 100%; }')
          .replace('.c-x-list-cell { height: 30px; background: #fff; }', '.c-x-list-cell { display: flex; flex-direction: row; height: 30px; }'),
      },
    ]
    const out = detectVForListDirectionMismatch(fixed, layoutStructure)
    expect(out.issues.filter((i: any) => i.id === 'VFOR-DIR-WRAPPER')).toHaveLength(0)
  })

  it('class 规则根本不存在 ⇒ 不凭空造选择器，记 failed', () => {
    const noRule = [{ path: 'x.less', content: '/* empty */' }]
    const res = healVForListDirection(noRule, [
      { id: 'VFOR-DIR-WRAPPER', hint: { role: 'wrapper', className: 'c-x-ghost', expected: 'row' } },
    ])
    expect(res.healed).toHaveLength(0)
    expect(res.failed[0]?.reason).toBe('class-rule-not-found')
  })
})
