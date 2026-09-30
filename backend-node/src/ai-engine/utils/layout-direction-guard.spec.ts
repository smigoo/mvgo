/**
 * 🛡️ LAYOUT-001 布局方向守卫单测（2026-09-30 §8.10 换证据源）
 *
 * 覆盖四类真判据 + 五种必须跳过的 fail-open 情形 + 口径（三态/前缀/对象形态/gridColumns）。
 * 另有「真机产物 inline 变异」阳性对照在 docs §8.10.5 留痕（离线跑，不进单测）。
 */
import {
  detectLayoutDirectionMismatch,
  resolveTruthLayout,
  readSectionGridColumns,
  resolveActualDirection,
  buildSectionHostIndex,
  buildStyleCorpus,
} from './layout-direction-guard.js'

type AnyObj = Record<string, any>

/** 造一个最小产物：一个子组件 .vue（根元素带 data-section-id）+ 可选 class 规则 */
function fixture(opts: AnyObj = {}) {
  const { sectionLayout, rootAttrs, styleText = '', gridColumns, bodyGridColumns, sectionId = 'X:1' } = opts
  const files = [
    {
      path: 'package/components/Comp.vue',
      content: `<template>
  <div ${rootAttrs}>
    <span>hi</span>
  </div>
</template>

<script setup>
</script>

<style lang="less" scoped>
${styleText}
</style>
`,
    },
  ]
  const section: AnyObj = { id: sectionId, name: 'fixture' }
  if (sectionLayout !== undefined) section.layout = sectionLayout
  if (gridColumns !== undefined) section.gridColumns = gridColumns
  if (bodyGridColumns !== undefined) section.body = { gridColumns: bodyGridColumns }
  const layoutStructure = { layout: { sections: [section] } }
  return { files, layoutStructure }
}

const only = (r: AnyObj) => r.issues.filter((i: AnyObj) => i.id === 'LAYOUT-001')

// ─────────────────────────────────────────────────────────────────────────
describe('resolveTruthLayout 三态口径（与 subcomponent-planner#extractLayoutMetadata 同源）', () => {
  it('字符串形态：row/horizontal* → row，column/vertical* → column', () => {
    expect(resolveTruthLayout('horizontal')).toEqual({ direction: 'row', isGrid: false })
    expect(resolveTruthLayout('row')).toEqual({ direction: 'row', isGrid: false })
    expect(resolveTruthLayout('vertical')).toEqual({ direction: 'column', isGrid: false })
    expect(resolveTruthLayout('column')).toEqual({ direction: 'column', isGrid: false })
  })

  it('前缀变体（真实语料 horizontal-2-columns / vertical-6-items）→ 同向', () => {
    expect(resolveTruthLayout('horizontal-2-columns').direction).toBe('row')
    expect(resolveTruthLayout('horizontal-3-items').direction).toBe('row')
    expect(resolveTruthLayout('vertical-6-items').direction).toBe('column')
  })

  it('grid* → direction null 且 isGrid=true（网格事实走 gridColumns 通道，不臆造方向）', () => {
    expect(resolveTruthLayout('grid')).toEqual({ direction: null, isGrid: true })
    expect(resolveTruthLayout('grid-3x4')).toEqual({ direction: null, isGrid: true })
  })

  it('对象形态（既有测试/旧数据）：layoutMode/direction 键仍生效', () => {
    expect(resolveTruthLayout({ layoutMode: 'HORIZONTAL' }).direction).toBe('row')
    expect(resolveTruthLayout({ direction: 'VERTICAL' }).direction).toBe('column')
  })

  it('无事实 / 非方向语义 → 全空（不臆造）', () => {
    for (const v of [null, undefined, '', 'relative', 'absolute', 'center', 'none']) {
      expect(resolveTruthLayout(v)).toEqual({ direction: null, isGrid: false })
    }
  })
})

describe('readSectionGridColumns 口径统一（#3）', () => {
  it('sec.gridColumns 与 sec.body.gridColumns 都可读，前者优先', () => {
    expect(readSectionGridColumns({ gridColumns: 4 })).toBe(4)
    expect(readSectionGridColumns({ body: { gridColumns: 4 } })).toBe(4)
    expect(readSectionGridColumns({ gridColumns: 4, body: { gridColumns: 3 } })).toBe(4)
  })
  it('缺失/非法 → null', () => {
    expect(readSectionGridColumns({})).toBeNull()
    expect(readSectionGridColumns({ gridColumns: 0 })).toBeNull()
    expect(readSectionGridColumns({ gridColumns: 'abc' })).toBeNull()
  })
})

describe('证据源：宿主定位 + CSS 层叠（inline > :style > class）', () => {
  it('inline style 优先于 class 规则', () => {
    const { files } = fixture({
      rootAttrs: 'data-section-id="X:1" class="c-a" style="display:flex;flex-direction:column"',
      styleText: '.c-a{ display:flex; flex-direction:row; }',
    })
    const host = buildSectionHostIndex(files).get('X:1')
    const actual = resolveActualDirection(host!.tag, buildStyleCorpus(files))
    expect(actual).toEqual({ kind: 'column', cols: null })
  })

  it('无 inline 时取 class 规则（含跨文件 common.less）', () => {
    const files = [
      { path: 'package/components/Comp.vue', content: '<template><div data-section-id="X:1" class="c-a"></div></template>\n<style lang="less" scoped>\n.c-other{color:red}\n</style>' },
      { path: 'resources/styles/common.less', content: '.c-a{ display:flex; flex-direction:column; }' },
    ]
    const host = buildSectionHostIndex(files).get('X:1')
    expect(resolveActualDirection(host!.tag, buildStyleCorpus(files))).toEqual({ kind: 'column', cols: null })
  })

  it(':style 绑定（JS 对象字面量）可读 flexDirection / gridTemplateColumns', () => {
    const files = [
      { path: 'package/components/Comp.vue', content: "<template><div data-section-id=\"X:1\" class=\"c-a\" :style=\"{ flexDirection: 'column' }\"></div></template>" },
    ]
    const host = buildSectionHostIndex(files).get('X:1')
    expect(resolveActualDirection(host!.tag, buildStyleCorpus(files))).toEqual({ kind: 'column', cols: null })
  })

  it('多 class 给出冲突方向 ⇒ 歧义 ⇒ null（宁可漏报不误杀）', () => {
    const files = [
      { path: 'package/components/Comp.vue', content: '<template><div data-section-id="X:1" class="c-a c-b"></div></template>\n<style>\n.c-a{flex-direction:row}\n.c-b{flex-direction:column}\n</style>' },
    ]
    const host = buildSectionHostIndex(files).get('X:1')
    expect(resolveActualDirection(host!.tag, buildStyleCorpus(files))).toBeNull()
  })

  it('属性顺序无关（class 写在 data-section-id 之后也能取到）', () => {
    const files = [
      { path: 'package/components/Comp.vue', content: '<template><div data-section-id="X:1" style="flex-direction:column" class="c-a"></div></template>\n<style>.c-a{flex-direction:row}</style>' },
    ]
    const host = buildSectionHostIndex(files).get('X:1')
    expect(resolveActualDirection(host!.tag, buildStyleCorpus(files))).toEqual({ kind: 'column', cols: null })
  })
})

describe('四类真判据（阳性对照）', () => {
  it('truth=row + 产物 inline column → WARN', () => {
    const { files, layoutStructure } = fixture({
      sectionLayout: 'horizontal',
      rootAttrs: 'data-section-id="X:1" class="c-a" style="display:flex;flex-direction:column"',
    })
    const r = only(detectLayoutDirectionMismatch(files, layoutStructure))
    expect(r).toHaveLength(1)
    expect(r[0].severity).toBe('WARN')
    expect(r[0].file).toBe('package/components/Comp.vue')
    expect(r[0].message).toContain('横向')
  })

  it('truth=column + 产物 inline row → WARN', () => {
    const { files, layoutStructure } = fixture({
      sectionLayout: 'vertical',
      rootAttrs: 'data-section-id="X:1" class="c-a" style="display:flex;flex-direction:row"',
    })
    expect(only(detectLayoutDirectionMismatch(files, layoutStructure))).toHaveLength(1)
  })

  it('truth=row + 产物 class column → WARN', () => {
    const { files, layoutStructure } = fixture({
      sectionLayout: 'horizontal',
      rootAttrs: 'data-section-id="X:1" class="c-a"',
      styleText: '.c-a{ display:flex; flex-direction:column; }',
    })
    expect(only(detectLayoutDirectionMismatch(files, layoutStructure))).toHaveLength(1)
  })

  it('truth=grid + 产物 display:flex → WARN（网格被排成 flex）', () => {
    const { files, layoutStructure } = fixture({
      sectionLayout: 'grid',
      rootAttrs: 'data-section-id="X:1" class="c-a" style="display:flex;flex-direction:row"',
    })
    const r = only(detectLayoutDirectionMismatch(files, layoutStructure))
    expect(r).toHaveLength(1)
    expect(r[0].message).toContain('网格')
  })

  it('truth=grid 列数 + 产物列数不符 → WARN；相符 → 无 issue', () => {
    const bad = fixture({
      sectionLayout: 'grid',
      gridColumns: 4,
      rootAttrs: 'data-section-id="X:1" class="c-a" style="display:grid;grid-template-columns:repeat(2,1fr)"',
    })
    expect(only(detectLayoutDirectionMismatch(bad.files, bad.layoutStructure))).toHaveLength(1)

    const ok = fixture({
      sectionLayout: 'grid',
      bodyGridColumns: 4,
      rootAttrs: 'data-section-id="X:1" class="c-a" style="display:grid;grid-template-columns:repeat(4,1fr)"',
    })
    expect(only(detectLayoutDirectionMismatch(ok.files, ok.layoutStructure))).toHaveLength(0)
  })

  it('truth=row + 产物 display:grid → WARN（布局体系不符）', () => {
    const { files, layoutStructure } = fixture({
      sectionLayout: 'horizontal',
      rootAttrs: 'data-section-id="X:1" class="c-a" style="display:grid;grid-template-columns:repeat(3,1fr)"',
    })
    expect(only(detectLayoutDirectionMismatch(files, layoutStructure))).toHaveLength(1)
  })
})

describe('fail-open：五类必须跳过的情形（不猜）', () => {
  it('方向一致 ⇒ 不判', () => {
    const row = fixture({ sectionLayout: 'horizontal', rootAttrs: 'data-section-id="X:1" class="c-a" style="flex-direction:row"' })
    expect(only(detectLayoutDirectionMismatch(row.files, row.layoutStructure))).toHaveLength(0)
    const col = fixture({ sectionLayout: 'vertical', rootAttrs: 'data-section-id="X:1" class="c-a" style="flex-direction:column"' })
    expect(only(detectLayoutDirectionMismatch(col.files, col.layoutStructure))).toHaveLength(0)
  })

  it('真值方向为空（layout 缺失 / relative / absolute）⇒ 不判', () => {
    for (const v of [undefined, null, 'relative', 'absolute']) {
      const f = fixture({ sectionLayout: v, rootAttrs: 'data-section-id="X:1" class="c-a" style="flex-direction:column"' })
      const r = detectLayoutDirectionMismatch(f.files, f.layoutStructure)
      expect(only(r)).toHaveLength(0)
      expect(r.stats.judged).toBe(0)
    }
  })

  it('宿主未物化（无 data-section-id 命中）⇒ 不判（交 COMP-001）', () => {
    const f = fixture({ sectionLayout: 'horizontal', rootAttrs: 'class="c-a" style="flex-direction:column"', sectionId: 'NO:HOST' })
    const r = detectLayoutDirectionMismatch(f.files, f.layoutStructure)
    expect(only(r)).toHaveLength(0)
    expect(r.stats.hosts).toBe(0)
  })

  it('根元素未显式声明方向 ⇒ 不判（可能靠父级/默认）', () => {
    const f = fixture({ sectionLayout: 'horizontal', rootAttrs: 'data-section-id="X:1" class="c-a"' })
    const r = detectLayoutDirectionMismatch(f.files, f.layoutStructure)
    expect(only(r)).toHaveLength(0)
    expect(r.stats.skippedNoDecl).toBe(1)
  })

  it('多 class 冲突 ⇒ 不判', () => {
    const f = fixture({
      sectionLayout: 'horizontal',
      rootAttrs: 'data-section-id="X:1" class="c-a c-b"',
      styleText: '.c-a{flex-direction:row} .c-b{flex-direction:column}',
    })
    expect(only(detectLayoutDirectionMismatch(f.files, f.layoutStructure))).toHaveLength(0)
  })

  it('空产物 / 空 sections ⇒ 不判、不抛', () => {
    expect(detectLayoutDirectionMismatch([], { layout: { sections: [{ id: 'X:1', layout: 'horizontal' }] } }).issues).toHaveLength(0)
    expect(detectLayoutDirectionMismatch([{ path: 'a.vue', content: '<template><div/></template>' }], { layout: { sections: [] } }).issues).toHaveLength(0)
  })
})

describe('形态兼容 & 可达性（死守卫修复）', () => {
  it('layout.sections（真实形态）与顶层 sections（旧形态）都可达', () => {
    const f = fixture({ sectionLayout: 'horizontal', rootAttrs: 'data-section-id="X:1" class="c-a" style="flex-direction:column"' })
    // 真实形态
    expect(only(detectLayoutDirectionMismatch(f.files, f.layoutStructure))).toHaveLength(1)
    // 旧形态（顶层 sections）
    const legacy = { sections: [{ id: 'X:1', layout: 'horizontal' }] }
    expect(only(detectLayoutDirectionMismatch(f.files, legacy))).toHaveLength(1)
  })

  it('递归进 children（容器也各有宿主）', () => {
    const files = [
      { path: 'package/index.vue', content: '<template><div data-section-id="P:1" class="c-p" style="flex-direction:row"><div data-section-id="C:1" class="c-c" style="flex-direction:column"></div></div></template>' },
    ]
    const ls = {
      layout: {
        sections: [{ id: 'P:1', layout: 'horizontal', children: [{ id: 'C:1', layout: 'horizontal' }] }],
      },
    }
    const r = detectLayoutDirectionMismatch(files, ls)
    expect(r.stats.sections).toBe(2)
    expect(only(r)).toHaveLength(1)
    expect(only(r)[0].message).toContain('C:1')
  })

  it('统计字段可用于区分「跑了没命中」与「根本没跑」', () => {
    const f = fixture({ sectionLayout: 'horizontal', rootAttrs: 'data-section-id="X:1" class="c-a" style="flex-direction:row"' })
    const r = detectLayoutDirectionMismatch(f.files, f.layoutStructure)
    expect(r.stats).toMatchObject({ sections: 1, truthFact: 1, hosts: 1, judged: 1, mismatches: 0 })
  })

  it('内部异常降级为 WARN 不抛（fail-open）', () => {
    const bad: AnyObj = { layout: { sections: [null, 42, { id: 'X:1', layout: 'horizontal' }] } }
    expect(() => detectLayoutDirectionMismatch([{ path: 'a.vue', content: 'x' }], bad)).not.toThrow()
  })
})
