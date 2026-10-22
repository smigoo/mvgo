/**
 * R24（2026-10-21 · mc-1792560692909-07ae49a2 实锤）：空 `<img>` 补齐资源 src。
 *
 * 真机病灶：4 个 `<img>` 完全没有 src（ContentSection / ContentSection5 / ContentIcon2 / HeaderText2），
 * 而 resourceDomMapping 里对应资源齐全并带 `assignedVarName`。
 * `injectResourceImports` 只注入「代码里出现的变量」⇒ 模型一个变量都没写就无从注入；门禁也只查
 * 「用了变量未声明」⇒ 零命中。本 spec 锁死判据的**边界**（阳性 + 三条阴性 + 幂等）。
 */
import {
  healEmptyImgSrc,
  findImgTags,
  buildComponentOwnerMap,
  normVarName,
  componentNameOf,
  ownerSectionIdForFile,
  findGlobalFallbackDecl,
  findDeclStatement,
} from '../resource-img-src-healer.js'

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
    semanticVarName: 'icon优质厂商',
  },
  {
    resourceFile: '../resources/images/icon-普通厂商-3208.png',
    figmaNodeId: '38:3208',
    ownerSectionId: '38:3206',
    assignedVarName: 'icon6',
    semanticVarName: 'icon普通厂商',
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

  test('② 阴性对照：字面量 src / 名字无关的未声明变量 ⇒ 不动', () => {
    for (const tag of ['<img src="/a.png" />', '<img v-bind:src="x" />']) {
      const r = healEmptyImgSrc(sfc('38:3260', tag), MAP, '../../resources/images/')
      expect(r.changed).toBe(false)
      expect(r.healed).toEqual([])
    }
  })

  /**
   * 刀 43 改判（2026-10-22 · mc-1792635919906-88b9c3a5 实锤）：
   * `:src="icon2"` 但文件里根本没 import ⇒ 运行时 `icon2 is not defined`，渲染就是破图。
   * 旧判据把「有 src 绑定」一律当已完成 —— 正是 `HeaderText3.vue` 的形态。
   */
  test('②-b 阳性：:src 引用了权威名但未声明 ⇒ 补 import', () => {
    const r = healEmptyImgSrc(sfc('38:3260', '<img :src="icon2" />'), MAP, '../../resources/images/')
    expect(r.changed).toBe(true)
    expect(r.code).toContain("import icon2 from '../../resources/images/icon-262.png'")
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

  /**
   * 刀 43（真机 `HeaderText2.vue`）：模板里**没有** `data-section-id`，但装配层把它嵌在
   * 某个 section 容器内 —— 归属是可证的结构事实，由调用方传入 `opts.ownerSectionId`。
   */
  test('⑫ 阳性：无 data-section-id 但调用方给出 ownerSectionId ⇒ 照常补 src', () => {
    const code = `<template>
  <div class="c-header-text2"><img class="c-icon" alt="优质厂商" /></div>
</template>

<script setup>
</script>
`
    const r = healEmptyImgSrc(code, MAP, '../../resources/images/', { ownerSectionId: '38:3206' })
    expect(r.changed).toBe(true)
    expect(r.healed[0]).toMatchObject({ varName: 'icon6', sectionId: '38:3206', imgs: 1 })
    expect(r.code).toContain('<img :src="icon6" class="c-icon" alt="优质厂商" />')
    expect(r.code).toContain("import icon6 from '../../resources/images/icon-普通厂商-3208.png'")
  })

  test('⑬ 阴性对照：同样文件但不传 ownerSectionId ⇒ 仍是 no-section-id（不猜）', () => {
    const code = `<template>\n  <div class="c-header-text2"><img class="c-icon" /></div>\n</template>\n\n<script setup>\n</script>\n`
    const r = healEmptyImgSrc(code, MAP, '../../resources/images/')
    expect(r.changed).toBe(false)
    expect(r.skipped[0].reason).toBe('no-section-id')
  })

  test('⑭ 阴性对照：ownerSectionId 也不能压过文件内的 ambiguous-section', () => {
    const code = `<template>
  <div data-section-id="38:3260"><img class="a" /></div>
  <div data-section-id="38:3282"><span>66</span></div>
</template>

<script setup>
</script>
`
    const r = healEmptyImgSrc(code, MAP, '../../resources/images/', { ownerSectionId: '38:3260' })
    expect(r.changed).toBe(false)
    expect(r.skipped[0].reason).toBe('ambiguous-section')
  })

  /**
   * 刀 43（真机 `HeaderText3.vue`）：`<img :src="icon普通厂商">` 有绑定但 `<script setup>`
   * 零 import ⇒ 运行时 `is not defined`。名字归一后等于权威名 ⇒ 换成权威名并补 import。
   */
  test('⑮ 阳性：:src 用自造中文名（归一后等于 semanticVarName）⇒ 换成权威名并补 import', () => {
    const code = `<template>
  <div data-section-id="38:3206"><img :src="icon普通厂商" class="c-icon" /></div>
</template>

<script setup>
const count = 0
</script>
`
    const r = healEmptyImgSrc(code, MAP, '../../resources/images/')
    expect(r.changed).toBe(true)
    expect(r.code).toContain('<img :src="icon6" class="c-icon" />')
    expect(r.code).toContain("import icon6 from '../../resources/images/icon-普通厂商-3208.png'")
    expect(r.code).not.toContain('icon普通厂商')
    expect(r.healed[0]).toMatchObject({ varName: 'icon6', imgs: 1, aliased: ['icon普通厂商'] })
  })

  test('⑯ 阴性对照：:src 用名字无关的未声明变量 ⇒ 不动（可能是别的数据）', () => {
    for (const tag of ['<img :src="avatarUrl" />', '<img :src="item.icon" />']) {
      const r = healEmptyImgSrc(sfc('38:3206', tag), MAP, '../../resources/images/')
      expect(r.changed).toBe(false)
      expect(r.healed).toEqual([])
    }
  })

  test('⑰ 阳性：v-bind:src 形态同样改名为权威名（不新增第二个 :src）', () => {
    const code = `<template>
  <div data-section-id="38:3206"><img v-bind:src="icon普通厂商" /></div>
</template>

<script setup>
</script>
`
    const r = healEmptyImgSrc(code, MAP, '../../resources/images/')
    expect(r.changed).toBe(true)
    expect(r.code).toContain('<img v-bind:src="icon6" />')
    expect(r.code.match(/:src=/g)).toHaveLength(1)
  })
})

/**
 * 🛡️ 刀 46（2026-10-22 · mc-1792640936339-f6660c71 实锤）：伪兜底声明。
 * `const iconzh1 = computed(() => window.iconzh1)` + `<img v-if="iconzh1" :src="iconzh1">`
 * —— `isDeclared` 会判「已声明」直接放过，但微码运行时**没有任何 `window.iconX` 注入**
 * （后端/前端全仓 grep 确证）⇒ 值恒 undefined ⇒ v-if 假 ⇒ 图标永不渲染。
 */
describe('刀 46 healEmptyImgSrc：window 伪兜底声明', () => {
  const SFC = `<template>
  <div data-section-id="38:3162-tail-text">
    <img v-if="iconzh1" :src="iconzh1" alt="优质厂商" />
    <span>优质厂商</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
const iconzh1 = computed(() => (typeof window !== 'undefined' ? window.iconzh1 : null))
</script>
`
  const M = [
    {
      resourceFile: '../resources/images/icon-优质厂商-3164.png',
      figmaNodeId: '38:3164',
      ownerSectionId: '38:3162',
      assignedVarName: 'icon5',
    },
  ]

  test('① 阳性：声明右侧换成资源字面量（变量名与模板都不动，v-if 跟着生效）', () => {
    const r = healEmptyImgSrc(SFC, M, '../../resources/images/', {})
    expect(r.changed).toBe(true)
    expect(r.healed[0].globalFallback).toEqual(['iconzh1'])
    // 模板原样
    expect(r.code).toContain('v-if="iconzh1" :src="iconzh1"')
    // 声明右侧换成字面量
    expect(r.code).toContain("const iconzh1 = '../../resources/images/icon-优质厂商-3164.png'")
    expect(r.code).not.toContain('window.iconzh1')
    // 不额外注入 import（用的是字面量）
    expect(r.code).not.toContain("import icon5 from")
  })

  test('② 阴性：普通声明（真 import）⇒ 不动', () => {
    const ok = SFC.replace(
      "const iconzh1 = computed(() => (typeof window !== 'undefined' ? window.iconzh1 : null))",
      "import iconzh1 from '../../resources/images/icon-优质厂商-3164.png'",
    )
    const r = healEmptyImgSrc(ok, M, '../../resources/images/', {})
    expect(r.changed).toBe(false)
  })

  test('③ 阴性：`window.otherName` 取的不是同名变量 ⇒ 不判（不是伪兜底形态）', () => {
    const other = SFC.replace('window.iconzh1', 'window.somethingElse')
    const r = healEmptyImgSrc(other, M, '../../resources/images/', {})
    expect(r.changed).toBe(false)
  })

  test('④ findGlobalFallbackDecl：跨行 computed 能定位语句边界', () => {
    const code = `<script setup>
import { computed } from 'vue'
const iconzh1 = computed(
  () => (typeof window !== 'undefined' ? window.iconzh1 : null)
)
const after = 1
</script>
`
    const d = findGlobalFallbackDecl(code, 'iconzh1')
    expect(d).not.toBeNull()
    expect(d.rhs).toContain('window.iconzh1')
    // 边界不能越过下一条语句
    expect(code.slice(d.rhsStart, d.end)).not.toContain('const after')
    expect(findDeclStatement(code, 'nothere')).toBeNull()
    expect(findGlobalFallbackDecl(code, 'after')).toBeNull()
  })
})

describe('buildComponentOwnerMap：装配层父子推断归属', () => {
  const INDEX = `<template>
  <div class="c-page">
    <div data-section-id="38:3137">
      <HeaderText />
    </div>
    <div data-section-id="38:3162">
      <HeaderText2 />
      <HeaderText3 />
    </div>
    <div class="c-foot">
      <div data-section-id="38:3206">
        <FooterText />
      </div>
    </div>
  </div>
</template>
`

  test('① 组件归属 = 最近祖先 data-section-id（自闭合 / 嵌套均可）', () => {
    const map = buildComponentOwnerMap({ 'src/views/index.vue': INDEX })
    expect(map.get('HeaderText')).toBe('38:3137')
    expect(map.get('HeaderText2')).toBe('38:3162')
    expect(map.get('HeaderText3')).toBe('38:3162')
    expect(map.get('FooterText')).toBe('38:3206')
  })

  test('② 阴性对照：同一组件出现在两个不同 section ⇒ 剔除（歧义不猜）', () => {
    const code = `<template>
  <div data-section-id="38:3137"><HeaderText /></div>
  <div data-section-id="38:3162"><HeaderText /></div>
</template>
`
    const map = buildComponentOwnerMap({ 'src/views/index.vue': code })
    expect(map.has('HeaderText')).toBe(false)
  })

  test('③ 阴性对照：没有 section 祖先的组件不收录', () => {
    const code = `<template>\n  <div class="c-page"><HeaderText /></div>\n</template>\n`
    const map = buildComponentOwnerMap({ 'src/views/index.vue': code })
    expect(map.size).toBe(0)
  })

  test('④ 只扫 .vue 文件；非 .vue 里的标签文本不算', () => {
    const map = buildComponentOwnerMap({
      'src/a.js': `<div data-section-id="X"><Foo /></div>`,
      'src/b.vue': INDEX,
    })
    expect(map.has('Foo')).toBe(false)
    expect(map.get('HeaderText')).toBe('38:3137')
  })

  test('⑤ normVarName：去分隔符与大小写，中文保留', () => {
    expect(normVarName('icon优质厂商')).toBe('icon优质厂商')
    expect(normVarName('Icon-优质_厂商')).toBe(normVarName('icon优质厂商'))
    expect(normVarName('icon_5')).toBe('icon5')
    expect(normVarName('')).toBe('')
  })

  test('⑥ componentNameOf：PascalCase 原样，kebab/snake 归一', () => {
    expect(componentNameOf('package/components/HeaderText2.vue')).toBe('HeaderText2')
    expect(componentNameOf('package/components/header-text2.vue')).toBe('HeaderText2')
    expect(componentNameOf('package/components/header_text2.vue')).toBe('HeaderText2')
    expect(componentNameOf('HeaderText2.vue')).toBe('HeaderText2')
    expect(componentNameOf('')).toBe('')
  })

  test('⑦ ownerSectionIdForFile：命中即返回，未收录 ⇒ 空串（唯一实现，两处调用点共用）', () => {
    const map = buildComponentOwnerMap({ 'src/views/index.vue': INDEX })
    expect(ownerSectionIdForFile(map, 'package/components/HeaderText.vue')).toBe('38:3137')
    // 文件名是 kebab 也能取到
    expect(ownerSectionIdForFile(map, 'package/components/header-text3.vue')).toBe('38:3162')
    // 未收录 / 空入参 ⇒ 不猜
    expect(ownerSectionIdForFile(map, 'package/components/Unknown.vue')).toBe('')
    expect(ownerSectionIdForFile(map, '')).toBe('')
    expect(ownerSectionIdForFile(null, 'a/B.vue')).toBe('')
  })
})
