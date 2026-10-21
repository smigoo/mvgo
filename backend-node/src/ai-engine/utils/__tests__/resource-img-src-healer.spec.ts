/**
 * R24（2026-10-21 · mc-1792560692909-07ae49a2 实锤）：空 `<img>` 补齐资源 src。
 *
 * 真机病灶：4 个 `<img>` 完全没有 src（ContentSection / ContentSection5 / ContentIcon2 / HeaderText2），
 * 而 resourceDomMapping 里对应资源齐全并带 `assignedVarName`。
 * `injectResourceImports` 只注入「代码里出现的变量」⇒ 模型一个变量都没写就无从注入；门禁也只查
 * 「用了变量未声明」⇒ 零命中。本 spec 锁死判据的**边界**（阳性 + 三条阴性 + 幂等）。
 */
import { healEmptyImgSrc, findImgTags } from '../resource-img-src-healer.js'

const MAP = [
  {
    resourceFile: '../resources/images/icon-262.png',
    figmaNodeId: '187:262',
    ownerSectionId: '38:3260',
    assignedVarName: 'icon2',
  },
  {
    resourceFile: '../resources/images/icon-263.png',
    figmaNodeId: '187:263',
    ownerSectionId: '38:3282',
    assignedVarName: 'icon3',
  },
  {
    resourceFile: '../resources/images/icon-优质厂商-3164.png',
    figmaNodeId: '38:3164',
    ownerSectionId: '38:3162',
    assignedVarName: 'icon5',
  },
]

const sfc = (sectionId: string, imgTag: string) => `<template>
  <div class="c-root" data-section-id="${sectionId}">
    ${imgTag}
    <span>33</span>
  </div>
</template>

<script setup>
const statValue = '33'
</script>
`

describe('R24 healEmptyImgSrc：空 img 补资源 src', () => {
  test('① 空 img + 唯一候选 ⇒ 补 :src 与 import', () => {
    const code = sfc('38:3260', '<img class="c-icon" alt="" />')
    const r = healEmptyImgSrc(code, MAP, '../../resources/images/')

    expect(r.changed).toBe(true)
    expect(r.healed).toEqual([
      { varName: 'icon2', resourceFile: '../resources/images/icon-262.png', sectionId: '38:3260', imgs: 1 },
    ])
    expect(r.code).toContain('<img :src="icon2" class="c-icon" alt="" />')
    expect(r.code).toContain("import icon2 from '../../resources/images/icon-262.png'")
    // 原有内容不动
    expect(r.code).toContain("const statValue = '33'")
  })

  test('② 阴性对照：img 已有 src（含 :src / v-bind:src）⇒ 不动', () => {
    for (const tag of ['<img src="/a.png" />', '<img :src="icon2" />', '<img v-bind:src="x" />']) {
      const r = healEmptyImgSrc(sfc('38:3260', tag), MAP, '../../resources/images/')
      expect(r.changed).toBe(false)
      expect(r.healed).toEqual([])
    }
  })

  test('③ 阴性对照：模板内出现多个不同 data-section-id（装配层）⇒ 不动', () => {
    const code = `<template>
  <div data-section-id="38:3260"><img class="c-icon" /></div>
  <div data-section-id="38:3282"><span>66</span></div>
</template>

<script setup>
</script>
`
    const r = healEmptyImgSrc(code, MAP, '../../resources/images/')
    expect(r.changed).toBe(false)
    expect(r.skipped[0].reason).toBe('ambiguous-section')
  })

  test('④ 阴性对照：候选 ≥2 ⇒ 不动（宁可漏，不可错配）', () => {
    const dup = [
      ...MAP,
      { resourceFile: '../resources/images/icon-extra.png', figmaNodeId: '1:1', ownerSectionId: '38:3260', assignedVarName: 'icon9' },
    ]
    const r = healEmptyImgSrc(sfc('38:3260', '<img class="c-icon" />'), dup, '../../resources/images/')
    expect(r.changed).toBe(false)
    expect(r.skipped[0]).toMatchObject({ reason: 'ambiguous-resource', candidates: 2 })
  })

  test('⑤ 阴性对照：该 section 无资源 ⇒ 不动', () => {
    const r = healEmptyImgSrc(sfc('99:99', '<img class="c-icon" />'), MAP, '../../resources/images/')
    expect(r.changed).toBe(false)
    expect(r.skipped[0].reason).toBe('no-resource')
  })

  test('⑥ figmaNodeId 口径：组件就是资源节点自身（data-section-id=187:263）⇒ 命中 icon4', () => {
    const r = healEmptyImgSrc(sfc('187:263', '<img class="c-icon" />'), MAP, '../../resources/images/')
    expect(r.changed).toBe(true)
    expect(r.healed[0].varName).toBe('icon3')
    expect(r.healed[0].resourceFile).toContain('icon-263')
  })

  test('⑦ 派生 section id（38:3162-tail-text）⇒ 前缀命中 owner 38:3162', () => {
    const r = healEmptyImgSrc(sfc('38:3162-tail-text', '<img alt="优质厂商" />'), MAP, '../../resources/images/')
    expect(r.changed).toBe(true)
    expect(r.healed[0].varName).toBe('icon5')
    expect(r.healed[0].sectionId).toBe('38:3162-tail-text')
  })

  test('⑧ 幂等：二次运行 changed=false、不再新增 import', () => {
    const once = healEmptyImgSrc(sfc('38:3260', '<img class="c-icon" />'), MAP, '../../resources/images/')
    const twice = healEmptyImgSrc(once.code, MAP, '../../resources/images/')
    expect(twice.changed).toBe(false)
    expect(twice.code.match(/import icon2 from/g)).toHaveLength(1)
  })

  test('⑨ 已具名声明时只补 :src，不重复 import', () => {
    const code = `<template>
  <div data-section-id="38:3260"><img class="c-icon" /></div>
</template>

<script setup>
import icon2 from '../../resources/images/icon-262.png'
</script>
`
    const r = healEmptyImgSrc(code, MAP, '../../resources/images/')
    expect(r.code.match(/import icon2 from/g)).toHaveLength(1)
    expect(r.code).toContain('<img :src="icon2" class="c-icon" />')
  })

  test('⑩ 无 <script setup> ⇒ 不改（无法插 import，fail-open）', () => {
    const code = `<template>\n  <div data-section-id="38:3260"><img class="c-icon" /></div>\n</template>\n`
    const r = healEmptyImgSrc(code, MAP, '../../resources/images/')
    expect(r.changed).toBe(false)
    expect(r.skipped[0].reason).toBe('no-script-setup')
  })

  test('⑪ findImgTags：只扫模板区，script 里的字符串不算', () => {
    const code = `<template><div><img class="a" /></div></template>\n<script setup>\nconst t = '<img src="x" />'\n</script>\n`
    const tags = findImgTags(code)
    expect(tags).toHaveLength(1)
    expect(tags[0].hasSrc).toBe(false)
  })
})
