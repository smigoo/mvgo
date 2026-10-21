/**
 * L3-c（2026-10-21）：`<img>` 引用资源变量但缺 `:src` ⇒ 确定性回填。
 *
 * 真实事故 c-c8d-195c8d0e：4 个图标位置全空白，产物是
 * `<img v-if="icon4" class="..." alt="" />`。变量确实被引用（v-if），
 * 所以 `isResourceVarMounted` 判「已挂载」⇒ CODE-022 不报、prune 不删 ⇒ 空 img。
 */
import {
  healImgSrcBindings,
  findImgSrcBindingGaps,
} from './resource-import-guard.js'

const MAPPING = [
  { assignedVarName: 'icon4', downloadStatus: 'success', name: 'icon-战略厂商' },
  { assignedVarName: 'icon5', downloadStatus: 'success', name: 'icon-优质厂商' },
]

const vue = (template: string, script = `import icon4 from '../../resources/images/icon-战略厂商-3160.png'\nimport icon5 from '../../resources/images/icon-优质厂商-3164.png'`) =>
  `<template>\n${template}\n</template>\n<script setup>\n${script}\n</script>`

describe('healImgSrcBindings', () => {
  it('阳性对照：只有 v-if 的 img ⇒ 回填 :src', () => {
    const src = vue('<div class="c-a"><img v-if="icon4" class="c-a-icon" alt="" /></div>')
    const r = healImgSrcBindings(src, MAPPING)
    expect(r.changed).toBe(true)
    expect(r.content).toContain('<img :src="icon4" v-if="icon4" class="c-a-icon" alt="" />')
    expect(r.healed).toHaveLength(1)
  })

  it('阴性对照：已有 :src ⇒ 一字不动（尊重作者写法）', () => {
    const src = vue('<div><img :src="icon4" class="x" alt="" /></div>')
    const r = healImgSrcBindings(src, MAPPING)
    expect(r.changed).toBe(false)
    expect(r.content).toBe(src)
  })

  it('阴性对照：已有静态 src ⇒ 不覆盖', () => {
    const src = vue('<div><img src="a.png" alt="icon4" /></div>')
    expect(healImgSrcBindings(src, MAPPING).changed).toBe(false)
  })

  it('阴性对照：标签内出现两个资源变量 ⇒ 不猜（多候选）', () => {
    const src = vue('<div><img v-if="icon4 || icon5" class="x" alt="" /></div>')
    expect(healImgSrcBindings(src, MAPPING).changed).toBe(false)
  })

  it('阴性对照：变量没在本文件 import（悬空引用）⇒ 不注入', () => {
    const src = vue('<div><img v-if="icon4" class="x" alt="" /></div>', '// no import')
    expect(healImgSrcBindings(src, MAPPING).changed).toBe(false)
  })

  it('阴性对照：空 mapping ⇒ 零改动（fail-safe）', () => {
    const src = vue('<div><img v-if="icon4" alt="" /></div>')
    expect(healImgSrcBindings(src, []).changed).toBe(false)
  })

  it('幂等：连续两次调用第二次零改动', () => {
    const src = vue('<div><img v-if="icon4" alt="" /></div>')
    const once = healImgSrcBindings(src, MAPPING)
    const twice = healImgSrcBindings(once.content, MAPPING)
    expect(twice.changed).toBe(false)
  })

  it('多个 img 各自回填', () => {
    const src = vue(
      '<div><img v-if="icon4" alt="" /><img v-if="icon5" alt="" /></div>',
    )
    const r = healImgSrcBindings(src, MAPPING)
    expect(r.healed).toHaveLength(2)
    expect(r.content).toContain(':src="icon4"')
    expect(r.content).toContain(':src="icon5"')
  })
})

describe('findImgSrcBindingGaps（只报不改）', () => {
  it('与修复器同口径：报出缺 :src 的位置，且不改文本', () => {
    const src = vue('<div><img v-if="icon4" class="x" alt="" /></div>')
    const gaps = findImgSrcBindingGaps(src, MAPPING)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].variable).toBe('icon4')
    expect(healImgSrcBindings(src, MAPPING).changed).toBe(true)
  })

  it('已修复的产物 ⇒ 零 gap（与修复器互为闭环验证）', () => {
    const src = vue('<div><img v-if="icon4" class="x" alt="" /></div>')
    const fixed = healImgSrcBindings(src, MAPPING).content
    expect(findImgSrcBindingGaps(fixed, MAPPING)).toHaveLength(0)
  })
})
