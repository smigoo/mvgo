/**
 * 🛡️ L3-c 写盘出口终验（2026-11-16 · P1 复核）：
 * `<img v-if="iconN" class="…" alt="" />` —— 变量**只出现在 v-if 里**、没有 `:src` ⇒ 渲染空 img。
 *
 * 为什么必须挂在 `writeFiles`（与刀 43 / R24 同一理由）：
 *   pre-write 自愈链之后仍有权重覆写/回退步骤，只有唯一写盘出口能保证
 *   「门禁校验的内容 === 实际落盘的内容」。
 *
 * 为什么 R24 兜不住（本地实证 · 存量 20 个 IMG-SRC-001 全属此类）：
 *   `healEmptyImgSrc` 的候选域是「本文件唯一 sectionId 下的资源」，且要求候选**恰好 1 个**；
 *   真实产物里同一段常有多个图标 ⇒ `ambiguous-resource` 直接跳过。
 *   L3-c 把候选域换成「本文件 `<script>` 里真实 import 过的资源变量」，与 section 无关。
 *
 * 本 spec 只锁**挂载点与边界**：断言读盘内容（不看函数返回值）。
 */
import { mkdtemp, mkdir, rm } from 'fs/promises'
import { readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

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

/**
 * 真实形态：**同一 section 两个图标** ⇒ `healEmptyImgSrc` 判 ambiguous-resource，
 * R24 与 R24-C 都跳过，只有 L3-c 能命中。
 */
const MAP = [
  {
    figmaNodeId: '43:4886',
    ownerSectionId: '43:4878',
    resourceFile: '../resources/images/Group_11-4886.png',
    assignedVarName: 'icon1',
    downloadStatus: 'success',
    previewAnalysisRole: 'icon',
  },
  {
    figmaNodeId: '43:4890',
    ownerSectionId: '43:4878',
    resourceFile: '../resources/images/Group_11-4890.png',
    assignedVarName: 'icon2',
    downloadStatus: 'success',
    previewAnalysisRole: 'icon',
  },
]

const INDEX = `<template>
  <div class="c-detail-root">
    <ContentDetail />
  </div>
</template>

<script setup>
import ContentDetail from './components/ContentDetail.vue'
</script>
`

/** 真机原样：import 已由资源注入器注入，模板却只把变量用在 v-if 上 */
const DETAIL = `<template>
  <div class="c-detail" data-section-id="43:4878">
    <div class="c-detail-link">
      <span class="c-detail-text">点击查看详情</span>
      <img class="c-detail-arrow" alt="" v-if="icon1" style="width:20px;height:20px" />
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/Group_11-4886.png'
import icon2 from '../../resources/images/Group_11-4890.png'
</script>
`

describe('L3-c · writeFiles 出口回填 <img> 缺失的 :src', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mvgo-fw-l3c-'))
    await mkdir(join(root, 'resources', 'styles'), { recursive: true })
    await mkdir(join(root, '.mc-gen'), { recursive: true })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('阳性：同段 2 图标（R24 判歧义）+ 无 :src ⇒ 按已 import 变量回填，落盘即修复后内容', () => {
    const res = writeFiles(
      { 'package/index.vue': INDEX, 'package/components/ContentDetail.vue': DETAIL },
      root,
      { logger: noopLogger, resourceDomMapping: MAP },
    )
    const out = readFileSync(join(root, 'package/components/ContentDetail.vue'), 'utf-8')
    expect(out).toContain('<img :src="icon1"')
    expect(out).toContain('v-if="icon1"')
    // 不臆造第二个变量、不重复 import
    expect(out.match(/import icon1 from/g)).toHaveLength(1)
    // 计数行随返回值上抛（真机可判读）
    // 🔴 2026-11-16：计数对象扩为「扫描维度 + 拦截维度」纯附加列（原 files/tags 语义不变），
    //   逐字段断言以免后续再加列时静默改变判读口径。
    expect(res.imgSrcHealStats).toMatchObject({ files: 1, tags: 1 })
    expect(res.imgSrcHealStats.scannedVue).toBeGreaterThan(0)
    expect(res.imgSrcHealStats.imgs).toBeGreaterThan(0)
    expect(res.imgSrcHealStats.skippedNoCandidate).toBe(0)
    expect(res.imgSrcHealStats.skippedMultiCandidate).toBe(0)
  })

  it('可观测性：无对象时 verdict 必须是 all-src-present，不能与「没执行」混为一谈', () => {
    const withSrc = DETAIL.replace('v-if="icon1"', 'v-if="icon1" :src="icon1"')
    const lines: string[] = []
    const res = writeFiles(
      { 'package/index.vue': INDEX, 'package/components/ContentDetail.vue': withSrc },
      root,
      {
        logger: { ...noopLogger, info: (m: string) => lines.push(m) } as never,
        resourceDomMapping: MAP,
      },
    )
    expect(res.imgSrcHealStats.files).toBe(0)
    expect(res.imgSrcHealStats.scannedVue).toBeGreaterThan(0)
    expect(res.imgSrcHealStats.imgs).toBe(res.imgSrcHealStats.withSrc)
    const summary = lines.find((l) => l.includes('L3-c 写盘出口扫描汇总'))
    expect(summary).toBeTruthy()
  })

  it('可观测性：本文件零 import ⇒ noImportFiles 记账（最早一处早退，与「无候选」区分）', () => {
    const noImport = DETAIL
      .replace("import icon1 from '../../resources/images/Group_11-4886.png'\n", '')
      .replace("import icon2 from '../../resources/images/Group_11-4890.png'\n", '')
    const res = writeFiles(
      { 'package/index.vue': INDEX, 'package/components/ContentDetail.vue': noImport },
      root,
      { logger: noopLogger, resourceDomMapping: MAP },
    )
    expect(res.imgSrcHealStats.files).toBe(0)
    expect(res.imgSrcHealStats.noImportFiles).toBeGreaterThan(0)
  })

  it('可观测性：有 import 但裸 <img> 上无该变量 ⇒ skippedNoCandidate 记账（上游没给可绑变量）', () => {
    const orphan = DETAIL.replace('v-if="icon1"', 'v-if="hasIcon"')
    const res = writeFiles(
      { 'package/index.vue': INDEX, 'package/components/ContentDetail.vue': orphan },
      root,
      { logger: noopLogger, resourceDomMapping: MAP },
    )
    expect(res.imgSrcHealStats.files).toBe(0)
    expect(res.imgSrcHealStats.skippedNoCandidate).toBeGreaterThan(0)
  })

  it('阴性：标签内出现 2 个候选变量 ⇒ 不猜（宁漏不错配）', () => {
    const ambiguous = DETAIL.replace('v-if="icon1"', 'v-if="icon1 || icon2"')
    writeFiles(
      { 'package/index.vue': INDEX, 'package/components/ContentDetail.vue': ambiguous },
      root,
      { logger: noopLogger, resourceDomMapping: MAP },
    )
    const out = readFileSync(join(root, 'package/components/ContentDetail.vue'), 'utf-8')
    expect(out).not.toContain(':src=')
  })

  it('阴性：变量未在 <script> 里 import ⇒ 不补（补了就是悬空引用，必被门禁判死）', () => {
    const noImport = DETAIL
      .replace("import icon1 from '../../resources/images/Group_11-4886.png'\n", '')
      .replace("import icon2 from '../../resources/images/Group_11-4890.png'\n", '')
    writeFiles(
      { 'package/index.vue': INDEX, 'package/components/ContentDetail.vue': noImport },
      root,
      { logger: noopLogger, resourceDomMapping: MAP },
    )
    const out = readFileSync(join(root, 'package/components/ContentDetail.vue'), 'utf-8')
    expect(out).not.toContain(':src=')
  })

  it('阴性：已有 :src 的作者写法不动（尊重作者，交给其它判据）', () => {
    const authored = DETAIL.replace('alt=""', ':src="icon2" alt=""')
    writeFiles(
      { 'package/index.vue': INDEX, 'package/components/ContentDetail.vue': authored },
      root,
      { logger: noopLogger, resourceDomMapping: MAP },
    )
    const out = readFileSync(join(root, 'package/components/ContentDetail.vue'), 'utf-8')
    expect(out).toContain(':src="icon2"')
    expect(out).not.toContain(':src="icon1"')
  })

  it('幂等：以落盘内容再写一次，不重复插入 :src', () => {
    const files = { 'package/index.vue': INDEX, 'package/components/ContentDetail.vue': DETAIL }
    writeFiles(files, root, { logger: noopLogger, resourceDomMapping: MAP })
    const once = readFileSync(join(root, 'package/components/ContentDetail.vue'), 'utf-8')
    writeFiles(
      { 'package/index.vue': INDEX, 'package/components/ContentDetail.vue': once },
      root,
      { logger: noopLogger, resourceDomMapping: MAP },
    )
    const twice = readFileSync(join(root, 'package/components/ContentDetail.vue'), 'utf-8')
    expect(twice.match(/:src="icon1"/g)).toHaveLength(1)
    expect(twice).toBe(once)
  })
})
