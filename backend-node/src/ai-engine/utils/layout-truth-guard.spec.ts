/**
 * 📐 layout-truth-guard.spec.ts —— A 批（层 4 + 层 5）阳性/阴性对照。
 *
 * 🔴 本项目铁律：判据改动的 0 命中必须配**阳性对照**，且阳性对照要打在**真正生效的那一层**。
 *   本 spec 的阳性对照全部取自真机产物 `c-device-58de7d47`（mc-max-1792985029695-58de7d47）：
 *     · J1 ← `common.less:149-162` / `ListSection.vue` 的 `.c-device-list-section`
 *     · J2 ← 同一块的 `gap: 6px 93px` + 真值 `36:1698` bbox 32×16
 *     · J3 ← `ContentMask.vue` scoped `min-height: 0` vs shared `min-height: 98px` + 真值 98×98
 *   阴性对照各对应一种「看起来该改、实际必须放过」的写法。
 */
import {
  runLayoutTruthGuard,
  buildTruthBoxIndex,
  buildClassSectionIndex,
  parseDecls,
  stripInertLayoutDecls,
  clampAbsoluteGeometry,
  stripScopedTruthOverride,
} from './layout-truth-guard.js'

// ── 真值树夹具（形态与 .mc-gen/cache/figma-node-data.json 一致：顶层 document.children）──
const truthTree = {
  document: {
    id: '0:1', name: 'root', type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 0, width: 603, height: 555 },
    children: [
      {
        id: '36:1698', name: '编码', type: 'TEXT',
        absoluteBoundingBox: { x: 24864, y: 51556, width: 32, height: 16 },
      },
      {
        id: '36:1726', name: 'Mask group', type: 'GROUP',
        absoluteBoundingBox: { x: 24745, y: 51499, width: 98, height: 98 },
      },
      {
        id: '36:1700', name: '属性列表', type: 'FRAME',
        absoluteBoundingBox: { x: 24864, y: 51580, width: 320, height: 220 },
      },
    ],
  },
}

const truthBoxes = buildTruthBoxIndex(truthTree)

describe('buildTruthBoxIndex / buildClassSectionIndex 基础口径', () => {
  it('走 .document 收集 bbox（离线重放铁律）', () => {
    expect(truthBoxes.get('36:1698')).toMatchObject({ width: 32, height: 16, type: 'TEXT' })
    expect(truthBoxes.get('36:1726')).toMatchObject({ width: 98, height: 98, type: 'GROUP' })
  })

  it('class→sectionId 只取「同一标签上同时有 class 与 data-section-id」', () => {
    const files = {
      'package/components/ListSection.vue':
        '<template><div class="c-x-list" data-section-id="36:1698"><span class="c-x-label">x</span></div></template>',
    }
    const idx = buildClassSectionIndex(files)
    expect(idx.get('c-x-list')).toBe('36:1698')
    // 后代 class 不继承祖先 section（避免把后代归到别的 section）
    expect(idx.has('c-x-label')).toBe(false)
  })
})

describe('J1 互斥布局指令共存（无需真值）', () => {
  it('阳性对照 A（真机 ListSection 形态）：display:grid 下 flex-direction/flex-wrap 是 inert ⇒ 删除', () => {
    const block = {
      selector: '.c-device-list-section',
      body: `width: 100%;
  min-height: 0;
  flex-wrap: wrap;
  gap: 6px 93px;
  overflow: hidden;
  grid-template-columns: repeat(2, 1fr);
  display: grid;`,
    }
    const r = stripInertLayoutDecls(block)
    expect(r).not.toBeNull()
    expect(r!.removed).toEqual(expect.arrayContaining(['flex-wrap']))
    expect(r!.body).not.toMatch(/flex-wrap/)
    // grid 语汇必须在（只删 inert，不删生效的）
    expect(r!.body).toMatch(/grid-template-columns/)
    expect(r!.body).toMatch(/display: grid/)
  })

  it('阳性对照 B：display:flex 下 grid-template-columns 是 inert ⇒ 删除', () => {
    const block = {
      selector: '.c-x-row',
      body: 'display: flex;\n  flex-direction: row;\n  grid-template-columns: repeat(3, 1fr);',
    }
    const r = stripInertLayoutDecls(block)
    expect(r).not.toBeNull()
    expect(r!.removed).toContain('grid-template-columns')
    expect(r!.body).toMatch(/display: flex/)
    expect(r!.body).toMatch(/flex-direction: row/)
  })

  it('阳性对照 C：display:grid 下 flex-direction 亦为 inert', () => {
    const block = {
      selector: '.c-x-grid',
      body: 'display: grid;\n  flex-direction: column;\n  grid-template-columns: repeat(2, 1fr);',
    }
    const r = stripInertLayoutDecls(block)
    expect(r!.removed).toContain('flex-direction')
  })

  it('阴性对照 A：合法 flex 容器（flex-direction + flex-wrap + display:flex）⇒ 不改', () => {
    const block = {
      selector: '.c-x-legal',
      body: 'display: flex;\n  flex-direction: row;\n  flex-wrap: wrap;\n  gap: 8px;',
    }
    expect(stripInertLayoutDecls(block)).toBeNull()
  })

  it('阴性对照 B：display 值不可知（var()）⇒ 不判（宁漏不误）', () => {
    const block = {
      selector: '.c-x-var',
      body: 'display: var(--layout-mode);\n  flex-wrap: wrap;',
    }
    expect(stripInertLayoutDecls(block)).toBeNull()
  })

  it('阴性对照 C：gap / align-items 在两容器下都有效 ⇒ 永不删', () => {
    const block = {
      selector: '.c-x-both',
      body: 'display: grid;\n  gap: 6px;\n  align-items: center;\n  justify-content: center;',
    }
    expect(stripInertLayoutDecls(block)).toBeNull()
  })

  it('阴性对照 D：display:none ⇒ 不判', () => {
    expect(stripInertLayoutDecls({ selector: '.c-x', body: 'display: none;\n  flex-wrap: wrap;' })).toBeNull()
  })
})

describe('J2 绝对几何超真值轴尺寸（需真值 bbox）', () => {
  it('阳性对照（真机形态）：gap 跨轴 93px > 真值宽 32px ⇒ 删跨轴（必然溢出）', () => {
    const box = { width: 32, height: 16 }
    const r = clampAbsoluteGeometry({ body: 'display: grid;\n  gap: 6px 93px;' }, box)
    expect(r).not.toBeNull()
    expect(r!.body).toMatch(/gap: 6px/)
    expect(r!.body).not.toMatch(/93px/)
    // 🔴 未命中的声明必须「属性名+值」原样保留。
    // 只做负向断言（只管删干净）会让「保留分支推出裸值」的产物损坏型 bug 逃过——
    // 本 spec 首版即因此漏网（成对断言：删对了 + 留对了）。
    expect(r!.body).toMatch(/display:\s*grid/)
  })

  it('阳性对照：min-height 超真值轴 ⇒ 收敛为真值', () => {
    const r = clampAbsoluteGeometry({ body: 'min-height: 400px;' }, { width: 320, height: 220 })
    expect(r).not.toBeNull()
    expect(r!.body).toMatch(/min-height: 220px/)
  })

  it('阴性对照 A：93px < 真值宽 600px ⇒ 合法，不改', () => {
    expect(clampAbsoluteGeometry({ body: 'display: grid;\n  gap: 6px 93px;' }, { width: 600, height: 400 })).toBeNull()
  })

  it('阴性对照 B：相对单位（%）不参与判据', () => {
    expect(clampAbsoluteGeometry({ body: 'gap: 6px 20%;' }, { width: 32, height: 16 })).toBeNull()
  })

  it('阴性对照 C：单值 gap 仅在两轴都超时才删（单轴超不足以判溢出）', () => {
    expect(clampAbsoluteGeometry({ body: 'gap: 100px;' }, { width: 32, height: 400 })).toBeNull()
  })
})

describe('J3 真值尺寸被 SFC scoped 抹掉（需真值 + shared 一致）', () => {
  const box = { width: 98, height: 98 }

  it('阳性对照（真机 ContentMask 形态）：shared min-height:98px 与真值一致，scoped min-height:0 ⇒ 剥 scoped', () => {
    const r = stripScopedTruthOverride(
      'display: flex;\n  flex-direction: column;\n  width: 100%;\n  min-height: 0;',
      'height: 100%;\n  width: 100%;\n  position: relative;\n  min-height: 98px;',
      box,
    )
    expect(r).not.toBeNull()
    expect(r!.removed).toContain('min-height:0')
    expect(r!.body).not.toMatch(/min-height/)
    // 非 min-* 声明必须原样保留
    expect(r!.body).toMatch(/display: flex/)
  })

  it('阴性对照 A：shared 的 min-height 与真值不符（50 vs 98）⇒ 不判', () => {
    expect(
      stripScopedTruthOverride('min-height: 0;', 'min-height: 50px;', box),
    ).toBeNull()
  })

  it('阴性对照 B：shared 无 min-* ⇒ 无真值锚，不判', () => {
    expect(
      stripScopedTruthOverride('min-height: 0;', 'width: 100%;', box),
    ).toBeNull()
  })

  it('阴性对照 C：scoped 值等于真值（不是抹掉）⇒ 不改', () => {
    expect(
      stripScopedTruthOverride('min-height: 98px;', 'min-height: 98px;', box),
    ).toBeNull()
  })
})

describe('主入口：形态契约 + 计数行 + 端到端', () => {
  const realCommonLess = `@fontSize: var(--fontSize);
.c-device-list-section {height: 100%;

  flex: 1 1 0;
  min-height: 0;
  flex-direction: column;
  justify-content: center;
  box-sizing: border-box;
  grid-template-columns: repeat(2, 1fr);
  width: 100%;
  flex-wrap: wrap;
  gap: 6px 93px;
  overflow: hidden;
  display: grid;
}
.c-device-mask-group {height: 100%;
width: 100%;

  position: relative;
  flex: 1 1 0;
  min-height: 98px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}`

  const realListVue = `<template>
  <div class="c-device-list-section" data-section-id="36:1698"><span>x</span></div>
</template>
<style lang="less" scoped>
@import '../../resources/styles/index.less';
.c-device-list-section {  width: 100%;

  min-height: 0;
  flex-wrap: wrap;
  gap: 6px 93px;
  overflow: hidden;
  grid-template-columns: repeat(2, 1fr);
  display: grid;}
</style>`

  const realMaskVue = `<template>
  <div data-section-id="36:1726" class="c-device-mask-group"><div class="c-device-mask-layer-a"></div></div>
</template>
<style lang="less" scoped>
.c-device-mask-group {  display: flex;
  flex-direction: column;
  width: 100%;

  min-height: 0;
}
</style>`

  it('真机三文件端到端：J1/J2/J3 全部命中，且计数行非零', () => {
    const files: Record<string, string> = {
      'resources/styles/common.less': realCommonLess,
      'package/components/ListSection.vue': realListVue,
      'package/components/ContentMask.vue': realMaskVue,
    }
    const { files: out, summary } = runLayoutTruthGuard(files, { figmaRoot: truthTree })

    expect(summary.enabled).toBe(true)
    expect(summary.hits).toBeGreaterThan(0)
    expect(summary.j1InertRemoved).toBeGreaterThan(0)
    expect(summary.j2GeometryClamped).toBeGreaterThan(0)
    expect(summary.j3TruthOverrideStripped).toBeGreaterThan(0)

    const common = out['resources/styles/common.less']
    const listVue = out['package/components/ListSection.vue']
    const maskVue = out['package/components/ContentMask.vue']

    // J1：flex 语汇从 grid 容器中消失
    expect(common).not.toMatch(/flex-wrap/)
    expect(common).not.toMatch(/flex-direction: column/)
    expect(listVue).not.toMatch(/flex-wrap/)
    // J2：93px 跨轴被收敛
    expect(common).not.toMatch(/93px/)
    // 🔴 成对断言：删对了 × 留对了。同块被 J1+J2 连改两次，
    // 未命中声明（display/width/overflow…）必须「属性名+值」完整存活。
    expect(common).toMatch(/display:\s*grid/)
    expect(common).toMatch(/width:\s*100%/)
    expect(common).toMatch(/overflow:\s*hidden/)
    expect(common).toMatch(/grid-template-columns/)
    // J3：scoped 的 min-height:0 被剥（真值 98px 由 shared 生效）
    expect(maskVue).not.toMatch(/min-height/)
    // shared 的真值锚必须还在
    expect(out['resources/styles/common.less']).toMatch(/min-height: 98px/)
  })

  it('对象 map 进 → 对象 map 出（管线契约）', () => {
    const files = { 'resources/styles/common.less': '.a {display: grid;\n flex-wrap: wrap;}' }
    const out = runLayoutTruthGuard(files, {})
    expect(Array.isArray(out.files)).toBe(false)
    expect(typeof (out.files as Record<string, string>)['resources/styles/common.less']).toBe('string')
  })

  it('无真值 ⇒ J1 仍生效，J2/J3 跳过且留痕 skippedReason', () => {
    const files = { 'resources/styles/common.less': '.a {display: grid;\n flex-wrap: wrap;}' }
    const { files: out, summary } = runLayoutTruthGuard(files, {})
    expect(summary.skippedReason).toBe('no-truth-bbox')
    expect(summary.j1InertRemoved).toBeGreaterThan(0)
    expect(summary.j2GeometryClamped).toBe(0)
    expect((out as Record<string, string>)['resources/styles/common.less']).toMatch(/display: grid/)
  })

  it('无改动时返回输入原引用（供 applied 判定）', () => {
    const files = { 'resources/styles/common.less': '.a {display: flex;\n flex-direction: row;}' }
    const out = runLayoutTruthGuard(files, {})
    expect(out.files).toBe(files)
  })

  it('parseDecls 基础口径', () => {
    expect(parseDecls('a: 1;\n  b: calc(1px + 2px);').map((d) => d.prop)).toEqual(['a', 'b'])
  })
})
