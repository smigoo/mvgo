/**
 * 刀 45（2026-10-22 · mc-1792639559460-61f0ebaf 实锤）：section 有图标真值但组件**零渲染**。
 * 与 R24 的「破图」是两件事：R24 需要模板里已存在 `<img>`，本判据处理的正是「连 img 都没有」。
 * spec 锁三件事：① 位置/尺寸**只认 mapping 真值**；② 任何证据缺失都退回不判；③ 幂等。
 */
import {
  healMissingIconRender,
  decideInsertPosition,
  lockHostAxisInline,
} from '../missing-icon-render-healer.js'

const ICON = {
  figmaNodeId: '38:3160',
  ownerSectionId: '38:3137',
  resourceFile: '../resources/images/icon-战略厂商-3160.png',
  assignedVarName: 'icon4',
  semanticVarName: 'icon战略厂商',
  previewAnalysisRole: 'icon',
  usage: '<img :src="iconX">',
  figmaBox: { x: 26914, y: 51617, width: 16, height: 16 },
  parentBox: { x: 26894, y: 51592, width: 604, height: 161 },
}

const sfc = (img = '') => `<template>
  <div data-section-id="38:3137-tail-text" class="c-demo-header-text" v-bind="$attrs">
    ${img}<span class="c-demo-header-text-title">{{ title }}</span>
  </div>
</template>

<script setup>
defineProps({ title: { type: String, default: '战略合作厂商' } })
</script>
`

describe('刀 45 healMissingIconRender：补缺失的图标元素', () => {
  test('① 阳性（左上角 ⇒ 首子元素）：插 img + 补 import，尺寸取 figmaBox', () => {
    const r = healMissingIconRender(sfc(), [ICON], '../../resources/images/', {})
    expect(r.changed).toBe(true)
    expect(r.healed[0]).toMatchObject({
      varName: 'icon4',
      sectionId: '38:3137-tail-text',
      position: 'prepend',
      width: 16,
      height: 16,
      className: 'c-demo-header-text-icon',
    })
    // 插在 span 之前
    expect(r.code.indexOf('c-demo-header-text-icon')).toBeLessThan(r.code.indexOf('<span'))
    expect(r.code).toContain('width:16px;height:16px')
    expect(r.code).toContain("import icon4 from '../../resources/images/icon-战略厂商-3160.png'")
  })

  test('② 阳性（最右侧 ⇒ 末子元素）：插到根元素闭合标签之前', () => {
    const right = {
      ...ICON,
      figmaBox: { x: 26894 + 560, y: 51617, width: 16, height: 16 },
    }
    const r = healMissingIconRender(sfc(), [right], '../../resources/images/', {})
    expect(r.changed).toBe(true)
    expect(r.healed[0].position).toBe('append')
    expect(r.code.indexOf('c-demo-header-text-icon')).toBeGreaterThan(r.code.indexOf('<span'))
    expect(r.code.indexOf('c-demo-header-text-icon')).toBeLessThan(r.code.indexOf('</div>'))
  })

  test('③ 阴性：图标在中间位置 ⇒ 位置不确定，不动（插错比不插更糟）', () => {
    const middle = {
      ...ICON,
      figmaBox: { x: 26894 + 280, y: 51617, width: 16, height: 16 },
    }
    const r = healMissingIconRender(sfc(), [middle], '../../resources/images/', {})
    expect(r.changed).toBe(false)
    expect(r.skipped[0].reason).toBe('position-unknown')
  })

  test('④ 阴性：`previewAnalysisRole` 是 bg ⇒ 绝不插成 img', () => {
    const bg = { ...ICON, previewAnalysisRole: 'bg' }
    const r = healMissingIconRender(sfc(), [bg], '../../resources/images/', {})
    expect(r.changed).toBe(false)
    expect(r.skipped[0].reason).toBe('no-icon-resource')
  })

  test('⑤ 阴性：usage 未声明为 <img> 形态 ⇒ 不判', () => {
    const other = { ...ICON, usage: 'background-image' }
    const r = healMissingIconRender(sfc(), [other], '../../resources/images/', {})
    expect(r.changed).toBe(false)
    expect(r.skipped[0].reason).toBe('no-icon-resource')
  })

  test('⑥ 阴性：模板里已有 <img> ⇒ 属 R24 域，本判据不碰', () => {
    const r = healMissingIconRender(sfc('<img class="x" />'), [ICON], '../../resources/images/', {})
    expect(r.changed).toBe(false)
    expect(r.skipped[0].reason).toBe('has-img')
  })

  test('⑦ 阴性：已经引用过该资源文件 ⇒ 不是缺图标', () => {
    const code = `<template>
  <div data-section-id="38:3137-tail-text" class="c-x"><span>{{ t }}</span></div>
</template>

<script setup>
import icon4 from '../../resources/images/icon-战略厂商-3160.png'
const t = ''
</script>
`
    const r = healMissingIconRender(code, [ICON], '../../resources/images/', {})
    expect(r.changed).toBe(false)
    expect(r.skipped[0].reason).toBe('already-referenced')
  })

  test('⑧ 阴性：同 section 有 2 个图标候选 ⇒ 歧义，不动', () => {
    const extra = { ...ICON, figmaNodeId: '38:3161', assignedVarName: 'icon4b' }
    const r = healMissingIconRender(sfc(), [ICON, extra], '../../resources/images/', {})
    expect(r.changed).toBe(false)
    expect(r.skipped[0]).toMatchObject({ reason: 'ambiguous-icon-resource', candidates: 2 })
  })

  test('⑨ 阴性：无 figmaBox（尺寸/位置真值缺失）⇒ 不判，不编尺寸', () => {
    const { figmaBox, ...noBox } = ICON
    const r = healMissingIconRender(sfc(), [noBox], '../../resources/images/', {})
    expect(r.changed).toBe(false)
    // 位置先被否 ⇒ position-unknown（尺寸检查在其后，同属「真值缺失不猜」）
    expect(r.skipped[0].reason).toBe('position-unknown')
  })

  test('⑩ 幂等：二次运行不再插入第二个 img', () => {
    const once = healMissingIconRender(sfc(), [ICON], '../../resources/images/', {})
    const twice = healMissingIconRender(once.code, [ICON], '../../resources/images/', {})
    expect(twice.changed).toBe(false)
    expect(once.code.match(/<img\b/g)).toHaveLength(1)
    expect(once.code.match(/import icon4 from/g)).toHaveLength(1)
  })

  test('⑪ 归属兜底：模板无 data-section-id 时用 ownerSectionId（装配层推断）', () => {
    const code = `<template>
  <div class="c-demo-h2"><span>{{ t }}</span></div>
</template>

<script setup>
const t = ''
</script>
`
    const noAnchor = { ...ICON, ownerSectionId: '38:3162' }
    // 无锚点 + 无 owner ⇒ 不判
    expect(healMissingIconRender(code, [noAnchor], '../../resources/images/', {}).changed).toBe(false)
    // 给了 owner ⇒ 命中（候选按 ownerSectionId 匹配）
    const r = healMissingIconRender(code, [noAnchor], '../../resources/images/', {
      ownerSectionId: '38:3162',
    })
    expect(r.changed).toBe(true)
    expect(r.healed[0].sectionId).toBe('38:3162')
  })
})

/**
 * 刀 45b（mc-1792640078832-caa3c509 / mc-1792641321781-bf647860 双实锤）：
 * `prepend` 只决定子树顺序，视觉语义由宿主根元素的排列轴决定。
 * 真机 `HeaderText2.vue` 根元素 `class="c-bf6478-icon …"`，而 `.c-bf6478-icon` 的
 * `flex-direction: column` 定义在**共享样式表** `resources/styles/index.css` 里
 * ⇒ 改组件 scoped 规则**不生效**（上一版判据因此零命中），且该类被多处复用不能改。
 * ⇒ 改为在**该元素的内联 style** 上钉轴（优先级最高、只作用于这一个元素）。
 * 位置与坐标一概不管：段高由 flex 分配、组件要等比缩放，写死 left/top 必漂。
 */
const SFC_PLAIN = `<template>
  <div data-section-id="38:3137-tail-text" class="c-demo-tail-text" v-bind="$attrs">
    <span class="c-demo-tail-text-label">{{ text }}</span>
  </div>
</template>

<script setup>
const text = ''
</script>
`

const sfcStyled = (styleAttr: string) => `<template>
  <div data-section-id="38:3137-tail-text" class="c-demo-tail-text" ${styleAttr} v-bind="$attrs">
    <span class="c-demo-tail-text-label">{{ text }}</span>
  </div>
</template>

<script setup>
const text = ''
</script>
`

describe('刀 45b 轴向锁定：内联 style 钉「同一行」（不碰 class / 不锁坐标）', () => {
  test('⑫ 阳性：静态 style 里 column ⇒ row，并补 display/align-items', () => {
    const r = healMissingIconRender(
      sfcStyled('style="flex-direction: column;justify-content: center;"'),
      [ICON],
      '../../resources/images/',
      {},
    )
    expect(r.changed).toBe(true)
    expect(r.healed[0].axisLock).toEqual({ mode: 'inline-style-merged' })
    expect(r.code).toContain('flex-direction: row')
    expect(r.code).not.toContain('flex-direction: column')
    expect(r.code).toContain('display: flex')
    expect(r.code).toContain('align-items: center')
    // 原有声明保留
    expect(r.code).toContain('justify-content: center')
  })

  test('⑬ 阳性：无 style ⇒ 追加内联轴（只作用于该元素）', () => {
    const r = healMissingIconRender(SFC_PLAIN, [ICON], '../../resources/images/', {})
    expect(r.changed).toBe(true)
    expect(r.healed[0].axisLock).toEqual({ mode: 'inline-style-added' })
    expect(r.code).toMatch(/style="display: flex; flex-direction: row; align-items: center;"/)
  })

  test('⑭ 阴性：内联已是 row ⇒ 幂等，不重复写', () => {
    const once = healMissingIconRender(SFC_PLAIN, [ICON], '../../resources/images/', {})
    const twice = healMissingIconRender(once.code, [ICON], '../../resources/images/', {})
    // 第二次因模板已有 <img> 直接跳过（has-img）⇒ 需单独验证 lockHostAxisInline 幂等
    const divStart = once.code.indexOf('<div')
    const divEnd = once.code.indexOf('>', divStart) + 1
    const lock = lockHostAxisInline(once.code, { start: divStart, end: divEnd })
    expect(lock.changed).toBe(false)
    expect(twice.changed).toBe(false)
    // 内联轴只写一次
    expect(once.code.match(/flex-direction:\s*row/g)).toHaveLength(1)
  })

  test('⑮ 阴性：已有 align-items / display ⇒ 只补缺的那条', () => {
    const r = healMissingIconRender(
      sfcStyled('style="display:flex;align-items:flex-end;"'),
      [ICON],
      '../../resources/images/',
      {},
    )
    expect(r.code).toMatch(/align-items:\s*flex-end/)
    expect(r.code).not.toMatch(/align-items:\s*center/)
    expect(r.code.match(/display\s*:/g)).toHaveLength(1)
    expect(r.code).toContain('flex-direction: row')
  })

  test('⑯ 阴性：宿主多子项 ⇒ 不插（掰轴会打乱原布局，fail-open）', () => {
    const multi = `<template>
  <div data-section-id="38:3137-tail-text" class="c-demo-tail-text">
    <span>a</span><span>b</span>
  </div>
</template>

<script setup>
const t = ''
</script>
`
    const r = healMissingIconRender(multi, [ICON], '../../resources/images/', {})
    expect(r.changed).toBe(false)
    expect(r.skipped.map((s) => s.reason)).toContain('host-has-multiple-children')
  })

  test('⑰ 阴性：`:style` 动态绑定不与静态 style 冲突（Vue 合并，静态布局键生效）', () => {
    const code = `<template>
  <div data-section-id="38:3137-tail-text" class="c-demo-tail-text"
    :style="{ backgroundImage: 'url(x)' }" v-bind="$attrs">
    <span>{{ t }}</span>
  </div>
</template>

<script setup>
const t = ''
</script>
`
    const r = healMissingIconRender(code, [ICON], '../../resources/images/', {})
    expect(r.changed).toBe(true)
    // 动态 :style 保持原样
    expect(r.code).toContain(':style="{ backgroundImage: \'url(x)\' }"')
    // 追加静态 style
    expect(r.code).toContain('style="display: flex; flex-direction: row; align-items: center;"')
  })

  test('⑱ 不锁坐标：产物里绝不出现 absolute / left: / top:', () => {
    const r = healMissingIconRender(SFC_PLAIN, [ICON], '../../resources/images/', {})
    expect(r.code).not.toContain('position: absolute')
    expect(r.code).not.toMatch(/left:\s*\d+px/)
    expect(r.code).not.toMatch(/top:\s*\d+px/)
  })
})

describe('decideInsertPosition：位置只认 bbox 真值', () => {  test('左上角 ⇒ prepend；最右 ⇒ append；中间/缺 bbox ⇒ null', () => {
    expect(decideInsertPosition(ICON)).toBe('prepend')
    expect(
      decideInsertPosition({
        ...ICON,
        figmaBox: { x: 26894 + 580, y: 51617, width: 16, height: 16 },
      }),
    ).toBe('append')
    expect(
      decideInsertPosition({
        ...ICON,
        figmaBox: { x: 26894 + 280, y: 51617, width: 16, height: 16 },
      }),
    ).toBeNull()
    expect(decideInsertPosition({})).toBeNull()
    // 尺寸非法（0 宽）也不算真值
    expect(
      decideInsertPosition({ figmaBox: { x: 0, y: 0, width: 0, height: 0 }, parentBox: { x: 0, y: 0, width: 10, height: 10 } }),
    ).toBeNull()
  })
})
