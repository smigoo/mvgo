// backend-root.js ESM 风格（const __filename）在 ts-jest CJS 下与模块包装器参数撞名，
// logger 链一加载整套件 0 运行 ⇒ 工厂 mock 绕过（file-writer.diff-skip 等同款惯例）。
// 本 spec 的「接线」用例要加载 code-structure-validator（其 logger → backend-root），故需要。
jest.mock('../../config/backend-root.js', () => {
  const cwd = process.cwd()
  return {
    backendRoot: cwd,
    projectRoot: cwd,
    workspaceRoot: cwd,
    customComponentsDir: cwd,
    vue3ComponentsDir: cwd,
    resolveFrontendWorkspacePath: () => cwd,
    frontendCustomComponentsDir: () => cwd,
    frontendVue3ComponentsDir: () => cwd,
    tempComponentsDir: cwd,
    dataDir: cwd,
    logsDir: '/tmp/mvgo-test-logs',
    configDir: cwd,
    chatAttachmentsDir: cwd,
    apifoxZipsDir: cwd,
    apiCatalogsDir: cwd,
  }
}, { virtual: true })

import fs from 'fs'
import path from 'path'
import {
  collectFigmaAsciiTokens,
  detectUnknownAsciiTokens,
  formatTextTruthAsciiLog,
} from './text-truth-guard.js'
import { CodeStructureValidator } from '../validators/code-structure-validator.js'

/**
 * 🛡️ Phase H（2026-11-02）ASCII token 口径回归。
 *
 * 病灶（准确归因，方案文档 §Phase H）：`detectUnknownText` 的候选文本只从「连续中文 ≥2 字」
 * 生成（`CHINESE_RUN_RE`），纯 ASCII token（`zh1` / `sta`）**天然不入检查**——这是 docstring
 * 明写的设计豁免（避免误杀格式文字），不是漏洞。真机 mc-max-1793582610570-e7da39ca
 * `43:4791`「设备数据表格」：表头第 4 列「启用状态」渲染成空 div、行值「启用」×7 被替换成
 * 幻觉 token `zh1`（并生成荒谬分支 `row.status === 'zh1' ? enabled : disabled`）；Figma 真值
 * （`43:4852 启用状态` / `43:4854… 启用 / 禁用`）里没有任何 `zh1` ⇒ 应当被拦却全程无人拦。
 *
 * 口径（与中文口径**并列、独立计数**，不改既有动态分级）：
 *   - 候选 = 渲染文本（模板文本节点 + script `label|name|text|title` 字段）里的 ASCII
 *     **标识符 token**（首字符为字母/_/$、长度 ≥3）；
 *   - 真值 = Figma characters 里的 ASCII token 集合；
 *   - 白名单 = 框架词（生命周期 / 事件名 / 指令词 / 常见属性&关键字）——它们是**代码词汇**，
 *     不是设计文案，不得判臆造；
 *   - 🔴 判定按 **token 边界独立匹配**（小写全等），**禁止**复用 `isCoveredByTruth` 的
 *     「去空白 + 子串双向覆盖」——否则 token 边界被抹平（`dev ⊂ DEV2201` 直接漏报）。
 */

const figma = {
  type: 'FRAME',
  name: 'root',
  children: [
    { type: 'TEXT', name: 't-启用状态', characters: '启用状态' },
    { type: 'TEXT', name: 'd-启用', characters: '启用' },
    { type: 'TEXT', name: 'd-禁用', characters: '禁用' },
    // 真值里本就存在的 ASCII 标识符（设备编号）——必须不误报
    { type: 'TEXT', name: 'd-编号', characters: 'DEV2201' },
  ],
}

const fileOf = (content: string) => [{ path: 'package/index.vue', content }]

describe('Phase H · ASCII token 口径（正向拦截 / 白名单豁免）', () => {
  it('① 正向拦截：产物渲染出真值里没有的 ASCII token（zh1 / sta）⇒ 逐 token 检出', () => {
    const files = fileOf(`<template>
  <div><span>{{ row.status }}</span></div>
</template>
<script setup>
const rows = ref([{ id: 'a', label: 'zh1' }, { id: 'b', name: 'sta' }])
</script>`)
    const hits = detectUnknownAsciiTokens(files, figma).map((u) => u.text)
    expect(hits).toContain('zh1')
    expect(hits).toContain('sta')
    expect(hits).toHaveLength(2)
  })

  it('② 白名单豁免：框架词（status / disabled / mounted / click）不判臆造', () => {
    const files = fileOf(`<template>
  <div>
    <span>status</span>
    <span>disabled</span>
    <span>mounted</span>
    <span>click</span>
  </div>
</template>`)
    expect(detectUnknownAsciiTokens(files, figma)).toHaveLength(0)
  })

  it('③ token 边界独立匹配：`dev` 不被真值 `DEV2201` 的子串吞掉（禁 isCoveredByTruth 式包含）', () => {
    // 🔴 阳性对照的「反例方向」：若复用 isCoveredByTruth（norm.includes(tn)）⇒ `dev` 被判
    // 「被 DEV2201 覆盖」而漏报。token 边界匹配下必须命中。
    const files = fileOf('<template><span>dev</span><span>DEV2201</span></template>')
    const hits = detectUnknownAsciiTokens(files, figma).map((u) => u.text)
    expect(hits).toContain('dev')
    expect(hits).not.toContain('dev2201')
    expect(hits).toHaveLength(1)
  })

  it('④ 真值集合为空（非 Figma 任务 / 无 ASCII 真值）⇒ fail-open 返回空', () => {
    expect(detectUnknownAsciiTokens(fileOf('<span>zh1</span>'), null)).toHaveLength(0)
    expect(collectFigmaAsciiTokens(null).size).toBe(0)
  })
})

describe('Phase H · 阳性对照（合规零命中 / 注入 zh1 恰好 1 命中）', () => {
  const compliant = fileOf(`<template>
  <div class="row">
    <span>启用状态</span>
    <span>启用</span>
  </div>
</template>
<script setup>
const rows = ref([{ id: 'a', label: '启用' }, { id: 'b', label: '禁用' }])
</script>`)

  const mutated = fileOf(`<template>
  <div class="row">
    <span>启用状态</span>
    <span>启用</span>
  </div>
</template>
<script setup>
const rows = ref([{ id: 'a', label: '启用' }, { id: 'b', label: 'zh1' }])
</script>`)

  it('⑤-A 合规单：零命中（真值中文 + 无 ASCII 渲染文本）', () => {
    expect(detectUnknownAsciiTokens(compliant, figma)).toHaveLength(0)
  })

  it('⑤-B 变异单：仅注入 `zh1` ⇒ 恰好 1 命中', () => {
    const hits = detectUnknownAsciiTokens(mutated, figma)
    expect(hits).toHaveLength(1)
    expect(hits[0].text).toBe('zh1')
  })
})

describe('Phase H · 接线：独立计数（不进 unknownTexts、不改分级）', () => {
  const run = (content: string) =>
    CodeStructureValidator.validate([{ path: 'package/index.vue', content }], 'test-component', {
      target: 'microcode',
      figmaNodeData: figma,
    })

  const mutated = `<template>
  <div class="row"><span>启用状态</span><span>启用</span></div>
</template>
<script setup>
const rows = ref([{ id: 'a', label: '启用' }, { id: 'b', label: 'zh1' }])
</script>`

  const compliant = `<template>
  <div class="row"><span>启用状态</span><span>启用</span></div>
</template>
<script setup>
const rows = ref([{ id: 'a', label: '启用' }, { id: 'b', label: '禁用' }])
</script>`

  it('⑥ 注入 zh1 ⇒ stats.hits=1 / enabled=true，且**不落 issue、不改分级**', () => {
    const res: any = run(mutated)
    expect(res.textTruthAsciiStats).toBeTruthy()
    expect(res.textTruthAsciiStats.enabled).toBe(true)
    expect(res.textTruthAsciiStats.hits).toBe(1)
    expect(res.textTruthAsciiStats.tokens).toContain('zh1')
    // 🔴 不改分级：ASCII 口径只做计数观测，不落 issue（TEXT-TRUTH 的动态分级链逐字不变）
    expect((res.issues || []).some((i: any) => i.id === 'TEXT-TRUTH-ASCII')).toBe(false)
  })

  it('⑦ 合规单 ⇒ hits=0 但 stats 仍在（「守卫没跑」与「跑了零命中」可区分）', () => {
    const res: any = run(compliant)
    expect(res.textTruthAsciiStats).toBeTruthy()
    expect(res.textTruthAsciiStats.enabled).toBe(true)
    expect(res.textTruthAsciiStats.hits).toBe(0)
    expect(res.textTruthAsciiStats.truthTokens).toBeGreaterThan(0)
  })

  it('⑧ 无 figmaNodeData ⇒ enabled=false（口径未启用，非零命中）', () => {
    const res: any = CodeStructureValidator.validate(
      [{ path: 'package/index.vue', content: compliant }],
      'test-component',
      { target: 'microcode' },
    )
    expect(res.textTruthAsciiStats).toBeTruthy()
    expect(res.textTruthAsciiStats.enabled).toBe(false)
    expect(res.textTruthAsciiStats.hits).toBe(0)
  })

  it('⑨ 日志行格式：hits:0 也带 enabled/truthTokens，可 grep 计数', () => {
    const line = formatTextTruthAsciiLog(
      { enabled: true, hits: 0, truthTokens: 3, tokens: [] },
      'max',
    )
    expect(line.message).toContain('[TEXT-TRUTH-ASCII@max]')
    expect(line.message).toContain('hits:0')
    expect(line.message).toContain('enabled:true')
    expect(line.message).toContain('truthTokens:3')
    expect(line.meta).toMatchObject({ tag: 'max', hits: 0, enabled: true, truthTokens: 3 })
  })
})

describe('Phase H · 双形态接线断言（microcode / vue3 L0-B 门禁）', () => {
  // 图文件（mc-component-graph-*.js）在单测里无法执行（依赖 LangGraph 运行时），
  // 故接线断言走源码级：两形态门禁必须都「接线了 ASCII 口径日志行 + 事实源」。
  const graphsDir = path.join(__dirname, '..', 'graphs')
  const GREPHS = [
    'mc-component-graph-phase2.js', // microcode 形态
    'mc-component-graph-vue3.js', // vue3 形态
  ]

  it.each(GREPHS)('⑩ %s 已接线 ASCII 口径计数观测', (name) => {
    const src = fs.readFileSync(path.join(graphsDir, name), 'utf-8')
    expect(src).toContain('formatTextTruthAsciiLog(')
    expect(src).toContain('textTruthAsciiStats')
    expect(src).toContain('figmaNodeData:')
  })
})
