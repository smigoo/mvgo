/**
 * 🛡️ 刀 43（2026-10-22 · mc-1792635919906-88b9c3a5 / mc-1792638154357-8a1a0d96 双实锤）：
 * R24「空 `<img>` / `:src` 引用未声明变量」的**落盘前终验**必须挂在 `writeFiles`。
 *
 * 为什么不在 `pre-write-self-healing`：该链之后还有 4 个会覆写/回退内容的步骤
 * （CODE-020 类名前缀 / 根容器布局归一 / 覆写后语义校验回退到 `allFiles` / absolute 遮罩层），
 * 只有 `writeFiles`（唯一写盘出口、最后一个调用点在最末）能保证
 * 「门禁校验的内容 === 实际落盘的内容」。真机 8a1a0d96 在 pre-write 阶段零命中即此因。
 *
 * 本 spec 只锁**挂载点**：读盘断言（不看函数返回值），确保修的是真落盘内容。
 */
import { mkdtemp, mkdir, rm } from 'fs/promises'
import { writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// file-writer → pre-write-self-healing → techstack-tag-enforcer → element-coverage-validator
// → logger → config/backend-root.js（用 import.meta.url，jest CJS 下会炸）⇒ 全字段 virtual mock。
jest.mock('../../../config/backend-root.js', () => ({
  backendRoot: process.cwd(),
  projectRoot: process.cwd(),
  workspaceRoot: process.cwd() + '/workspace',
  customComponentsDir: process.cwd() + '/workspace/custom-components',
  vue3ComponentsDir: process.cwd() + '/workspace/vue3-components',
  tempComponentsDir: process.cwd() + '/temp-components',
  dataDir: process.cwd() + '/data',
  logsDir: process.cwd() + '/logs',
  configDir: process.cwd() + '/config',
  chatAttachmentsDir: process.cwd() + '/temp-chat-attachments',
  apifoxZipsDir: process.cwd() + '/data/apifox-zips',
  apiCatalogsDir: process.cwd() + '/data/api-catalogs',
  resolveFrontendWorkspacePath: () => process.cwd(),
  frontendCustomComponentsDir: () => process.cwd(),
  frontendVue3ComponentsDir: () => process.cwd(),
}), { virtual: true })

import { writeFiles } from './file-writer.js'

const noopLogger = { info() {}, warn() {}, error() {}, debug() {} }

const MAP = [
  {
    figmaNodeId: '38:3160',
    ownerSectionId: '38:3158',
    resourceFile: '../resources/images/icon-战略厂商-3160.png',
    assignedVarName: 'icon4',
    downloadStatus: 'success',
    // 刀 45 需要：角色 + DOM 契约 + bbox 真值（位置/尺寸）
    previewAnalysisRole: 'icon',
    usage: '<img :src="iconX">',
    figmaBox: { x: 26914, y: 51617, width: 16, height: 16 },
    parentBox: { x: 26894, y: 51592, width: 604, height: 161 },
  },
  {
    figmaNodeId: '38:3164',
    ownerSectionId: '38:3162',
    resourceFile: '../resources/images/icon-优质厂商-3164.png',
    assignedVarName: 'icon5',
    semanticVarName: 'icon优质厂商',
    downloadStatus: 'success',
  },
  {
    figmaNodeId: '38:3208',
    ownerSectionId: '38:3206',
    resourceFile: '../resources/images/icon-普通厂商-3208.png',
    assignedVarName: 'icon6',
    semanticVarName: 'icon普通厂商',
    downloadStatus: 'success',
  },
]

const INDEX = `<template>
  <div class="c-page">
    <div class="c-sec" data-section-id="38:3158">
      <HeaderText />
    </div>
    <div class="c-sec" data-section-id="38:3162">
      <HeaderText2 />
    </div>
    <div class="c-sec" data-section-id="38:3206">
      <HeaderText3 />
    </div>
  </div>
</template>

<script setup>
import HeaderText from './components/HeaderText.vue'
import HeaderText2 from './components/HeaderText2.vue'
import HeaderText3 from './components/HeaderText3.vue'
</script>
`

// ① 自身有锚点 + 裸 img
const HEADER_TEXT = `<template>
  <div class="c-h" data-section-id="38:3158-tail-text">
    <img class="c-h-icon" alt="战略合作厂商" />
  </div>
</template>

<script setup>
</script>
`

// ② 无锚点 + 裸 img ⇒ 只能靠装配层归属
const HEADER_TEXT2 = `<template>
  <div class="c-h2"><img class="c-h2-icon" alt="优质厂商" /></div>
</template>

<script setup>
</script>
`

// ③ 有锚点 + `:src` 自造中文名且未声明
const HEADER_TEXT3 = `<template>
  <div class="c-h3" data-section-id="38:3206-tail-text">
    <img :src="icon普通厂商" class="c-h3-icon" alt="普通厂商" />
  </div>
</template>

<script setup>
const n = 0
</script>
`

const buildFiles = () => ({
  'package/index.vue': INDEX,
  'package/components/HeaderText.vue': HEADER_TEXT,
  'package/components/HeaderText2.vue': HEADER_TEXT2,
  'package/components/HeaderText3.vue': HEADER_TEXT3,
})

describe('刀 43 · writeFiles 是 R24 的唯一有效挂载点', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mvgo-fw-r24-'))
    await mkdir(join(root, 'resources', 'styles'), { recursive: true })
    await mkdir(join(root, '.mc-gen'), { recursive: true })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('阳性：三种成因一次全覆盖（补 :src / 装配层归属 / 自造名换名），且落盘内容即修复后内容', () => {
    const files = buildFiles()
    const res = writeFiles(files, root, {
      logger: noopLogger,
      resourceDomMapping: MAP,
    })
    expect(res.written).toContain('package/components/HeaderText.vue')

    const h1 = readFileSync(join(root, 'package/components/HeaderText.vue'), 'utf-8')
    expect(h1).toContain(':src="icon4"')
    expect(h1).toContain("import icon4 from '../../resources/images/icon-战略厂商-3160.png'")

    const h2 = readFileSync(join(root, 'package/components/HeaderText2.vue'), 'utf-8')
    expect(h2).toContain(':src="icon5"')
    expect(h2).toContain("import icon5 from '../../resources/images/icon-优质厂商-3164.png'")

    const h3 = readFileSync(join(root, 'package/components/HeaderText3.vue'), 'utf-8')
    expect(h3).toContain(':src="icon6"')
    expect(h3).not.toContain('icon普通厂商')
    expect(h3).toContain("import icon6 from '../../resources/images/icon-普通厂商-3208.png'")
  })

  it('mapping 只写盘不传参时也能拿到（outputPath/.mc-gen 兜底）', () => {
    writeFileSync(
      join(root, '.mc-gen', 'resource-dom-mapping.json'),
      JSON.stringify(MAP),
      'utf-8',
    )
    writeFiles(buildFiles(), root, { logger: noopLogger })
    const h2 = readFileSync(join(root, 'package/components/HeaderText2.vue'), 'utf-8')
    expect(h2).toContain(':src="icon5"')
  })

  it('阴性对照：无 mapping（既不传参也无磁盘文件）⇒ 一个字节都不改', () => {
    writeFiles(buildFiles(), root, { logger: noopLogger })
    const h1 = readFileSync(join(root, 'package/components/HeaderText.vue'), 'utf-8')
    const h2 = readFileSync(join(root, 'package/components/HeaderText2.vue'), 'utf-8')
    const h3 = readFileSync(join(root, 'package/components/HeaderText3.vue'), 'utf-8')
    expect(h1).not.toContain(':src=')
    expect(h2).not.toContain(':src=')
    // 自造名保持原样（不声明就不动，宁漏不错配）
    expect(h3).toContain('icon普通厂商')
  })

  it('幂等：同一份 mapping 再写一次，不重复插 import', () => {
    const files1 = buildFiles()
    writeFiles(files1, root, { logger: noopLogger, resourceDomMapping: MAP })
    // 第二次以磁盘内容为输入（真实管线就是"内存=磁盘终态"）
    const again = {
      'package/index.vue': readFileSync(join(root, 'package/index.vue'), 'utf-8'),
      'package/components/HeaderText.vue': readFileSync(join(root, 'package/components/HeaderText.vue'), 'utf-8'),
      'package/components/HeaderText2.vue': readFileSync(join(root, 'package/components/HeaderText2.vue'), 'utf-8'),
      'package/components/HeaderText3.vue': readFileSync(join(root, 'package/components/HeaderText3.vue'), 'utf-8'),
    }
    writeFiles(again, root, { logger: noopLogger, resourceDomMapping: MAP })
    const h1 = readFileSync(join(root, 'package/components/HeaderText.vue'), 'utf-8')
    expect(h1.match(/import icon4 from/g)).toHaveLength(1)
    const h3 = readFileSync(join(root, 'package/components/HeaderText3.vue'), 'utf-8')
    expect(h3.match(/import icon6 from/g)).toHaveLength(1)
  })

  /**
   * 🛡️ 刀 45（真机 `HeaderText.vue` 本轮只剩标题 span，`icon4` 因此 mount-target-not-found）：
   * 「连 `<img>` 都没有」的形态由刀 45 处理，位置与尺寸全部来自 mapping 真值。
   */
  it('刀 45：组件零 img 但 section 有唯一图标真值 ⇒ 落盘补出带真值尺寸的 <img>', () => {
    const onlyText = `<template>
  <div data-section-id="38:3158-tail-text" class="c-demo-header-text">
    <span class="c-demo-header-text-title">{{ title }}</span>
  </div>
</template>

<script setup>
defineProps({ title: { type: String, default: '战略合作厂商' } })
</script>
`
    const files = {
      'package/index.vue': INDEX,
      'package/components/HeaderText.vue': onlyText,
    }
    writeFiles(files, root, { logger: noopLogger, resourceDomMapping: MAP })
    const h1 = readFileSync(join(root, 'package/components/HeaderText.vue'), 'utf-8')
    expect(h1).toContain('<img :src="icon4"')
    expect(h1).toContain('width:16px;height:16px')
    expect(h1).toContain("import icon4 from '../../resources/images/icon-战略厂商-3160.png'")
    // 位置真值：icon 在父框左上角 ⇒ 首子元素（span 之前）
    expect(h1.indexOf('c-demo-header-text-icon')).toBeLessThan(h1.indexOf('<span'))
  })

  it('刀 45 阴性：位置真值缺失（无 figmaBox）⇒ 不插，不编尺寸', () => {
    const { figmaBox, parentBox, ...noBox } = MAP[0]
    const onlyText = `<template>
  <div data-section-id="38:3158-tail-text" class="c-demo-header-text">
    <span class="c-demo-header-text-title">{{ title }}</span>
  </div>
</template>

<script setup>
defineProps({ title: { type: String, default: '战略合作厂商' } })
</script>
`
    writeFiles(
      { 'package/components/HeaderText.vue': onlyText },
      root,
      { logger: noopLogger, resourceDomMapping: [noBox] },
    )
    const h1 = readFileSync(join(root, 'package/components/HeaderText.vue'), 'utf-8')
    expect(h1).not.toContain('<img')
    expect(h1).not.toContain('import icon4')
  })
})

/**
 * 🛡️ R24-C（2026-11-06 · mc-max-1793899537377-9a3c56bb 实锤）：`v-for` 数据对象里的空图字段。
 *
 * 同样只锁**挂载点**：断言读盘内容。上面的 A/B 类（`healEmptyImgSrc`）对
 * `<img :src="item.icon" />` 三条路全不通 —— ① 有 src 属性直接跳过；② 成员访问归一变量名返空；
 * ③ 本节 2 个候选撞上 `candidates.length !== 1` 硬闸判歧义。故必须由 C 类在**同一写盘出口**兜住，
 * 否则 mapping 里 `icon2/icon3` 已分配、图已落盘，产物依旧 `icon: ''` 破图。
 */
describe('R24-C · writeFiles 出口填 v-for 空图字段', () => {
  let root: string

  // 顺序刻意与视觉顺序**相反**（263 在前）：若实现偷用 mapping 数组顺序就会配对颠倒。
  const MAP_C = [
    {
      figmaNodeId: '187:263',
      ownerSectionId: '38:3260',
      resourceFile: '../resources/images/icon-263.png',
      assignedVarName: 'icon3',
      downloadStatus: 'success',
      previewAnalysisRole: 'icon',
      figmaBox: { x: 27249, y: 51617, width: 16, height: 16 },
    },
    {
      figmaNodeId: '187:262',
      ownerSectionId: '38:3260',
      resourceFile: '../resources/images/icon-262.png',
      assignedVarName: 'icon2',
      downloadStatus: 'success',
      previewAnalysisRole: 'icon',
      figmaBox: { x: 26920, y: 51617, width: 16, height: 16 },
    },
  ]

  // 真机形态：子组件自身**没有** `data-section-id`，归属只能由装配层（index.vue）推断。
  const STATS = (fieldA = "''", fieldB = "''") => `<template>
  <div class="c-stats">
    <div class="c-stats-item" v-for="item in statList" :key="item.label">
      <img class="c-stats-item-icon" :src="item.icon" alt="" />
      <span class="c-stats-item-label">{{ item.label }}</span>
    </div>
  </div>
</template>

<script setup>
const statList = [
  { label: '合作厂商', value: '33', icon: ${fieldA} },
  { label: '在线设备', value: '66', icon: ${fieldB} }
]
</script>
`

  const INDEX_C = `<template>
  <div class="c-page">
    <div class="c-sec" data-section-id="38:3260"><StatsSection /></div>
  </div>
</template>

<script setup>
import StatsSection from './components/StatsSection.vue'
</script>
`

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mvgo-fw-r24c-'))
    await mkdir(join(root, 'resources', 'styles'), { recursive: true })
    await mkdir(join(root, '.mc-gen'), { recursive: true })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('阳性：装配层归属 + 空字段数 === 候选数 ⇒ 按 figmaBox 视觉顺序 zip，落盘即修复后内容', () => {
    writeFiles(
      {
        'package/index.vue': INDEX_C,
        'package/components/StatsSection.vue': STATS(),
      },
      root,
      { logger: noopLogger, resourceDomMapping: MAP_C },
    )
    const s = readFileSync(join(root, 'package/components/StatsSection.vue'), 'utf-8')
    // 左（x=26920）配 icon2、右（x=27249）配 icon3，与 mapping 数组顺序无关
    expect(s.indexOf('icon: icon2')).toBeGreaterThan(-1)
    expect(s.indexOf('icon: icon3')).toBeGreaterThan(-1)
    expect(s.indexOf('icon: icon2')).toBeLessThan(s.indexOf('icon: icon3'))
    expect(s).not.toContain("icon: ''")
    // import 顺序同样跟视觉顺序，且插入在 <script setup> 之后
    const i2 = s.indexOf("import icon2 from '../../resources/images/icon-262.png'")
    const i3 = s.indexOf("import icon3 from '../../resources/images/icon-263.png'")
    expect(i2).toBeGreaterThan(s.indexOf('<script setup>'))
    expect(i3).toBeGreaterThan(i2)
  })

  it('阴性对照：空字段数(3) ≠ 候选数(2) ⇒ 一个字节都不改（宁漏不错配）', () => {
    const sfc = `<template>
  <div class="c-stats">
    <div v-for="item in statList" :key="item.label">
      <img :src="item.icon" alt="" />
    </div>
  </div>
</template>

<script setup>
const statList = [
  { label: 'A', icon: '' },
  { label: 'B', icon: '' },
  { label: 'C', icon: '' }
]
</script>
`
    writeFiles(
      {
        'package/index.vue': INDEX_C,
        'package/components/StatsSection.vue': sfc,
      },
      root,
      { logger: noopLogger, resourceDomMapping: MAP_C },
    )
    const out = readFileSync(join(root, 'package/components/StatsSection.vue'), 'utf-8')
    expect(out).not.toContain('import icon2')
    expect(out.match(/icon: ''/g)?.length).toBe(3)
  })

  it('阴性对照：只有 1 个候选 ⇒ 让位 A/B 类，不抢活', () => {
    writeFiles(
      {
        'package/index.vue': INDEX_C,
        'package/components/StatsSection.vue': STATS(),
      },
      root,
      { logger: noopLogger, resourceDomMapping: [MAP_C[1]] },
    )
    const out = readFileSync(join(root, 'package/components/StatsSection.vue'), 'utf-8')
    expect(out).not.toContain('icon2')
    expect(out.match(/icon: ''/g)?.length).toBe(2)
  })

  it('阴性对照：非空字段绝不复写（其他通道已填就不动）', () => {
    writeFiles(
      {
        'package/index.vue': INDEX_C,
        'package/components/StatsSection.vue': STATS("icon3", "icon2"),
      },
      root,
      { logger: noopLogger, resourceDomMapping: MAP_C },
    )
    const out = readFileSync(join(root, 'package/components/StatsSection.vue'), 'utf-8')
    // 已填的两条保持原值，不被 zip 覆盖
    expect(out).toContain("icon: icon3")
    expect(out).toContain("icon: icon2")
    expect(out.indexOf('icon: icon3')).toBeLessThan(out.indexOf('icon: icon2'))
  })

  it('真机原样（c-a3c56-9a3c56bb）：两图标分属兄弟段 38:3260 / 38:3282 ⇒ 仍能同排合并落盘', () => {
    // Figma 里是 N 个同构兄弟段，LLM 合成一个 v-for 后 DOM 只留首个段的 id。
    // 只认本段会退化成 single-resource-defer-ab ⇒ 真机继续破图。
    const row = { y: 51496, width: 53, height: 55.44972610473633 }
    const rowParent = (x: number) => ({ x, y: 51483, width: 265, height: 76 })
    const siblingMap = [
      {
        figmaNodeId: '187:262',
        ownerSectionId: '38:3260',
        ancestorIds: ['38:3260', '796:3', '38:3134'],
        resourceFile: '../resources/images/icon-262.png',
        assignedVarName: 'icon2',
        downloadStatus: 'success',
        previewAnalysisRole: 'icon',
        figmaBox: { x: 26920, ...row },
        parentBox: rowParent(26900),
      },
      {
        figmaNodeId: '187:263',
        ownerSectionId: '38:3282',
        ancestorIds: ['38:3282', '796:3', '38:3134'],
        resourceFile: '../resources/images/icon-263.png',
        assignedVarName: 'icon3',
        downloadStatus: 'success',
        previewAnalysisRole: 'icon',
        figmaBox: { x: 27249, ...row },
        parentBox: rowParent(27229),
      },
    ]
    writeFiles(
      {
        'package/index.vue': INDEX_C,
        'package/components/StatsSection.vue': STATS(),
      },
      root,
      { logger: noopLogger, resourceDomMapping: siblingMap },
    )
    const out = readFileSync(join(root, 'package/components/StatsSection.vue'), 'utf-8')
    expect(out).toContain('icon: icon2')
    expect(out).toContain('icon: icon3')
    expect(out).not.toContain("icon: ''")
    expect(out.indexOf('icon: icon2')).toBeLessThan(out.indexOf('icon: icon3'))
  })
})
