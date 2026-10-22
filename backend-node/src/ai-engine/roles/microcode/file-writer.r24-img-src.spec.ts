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
