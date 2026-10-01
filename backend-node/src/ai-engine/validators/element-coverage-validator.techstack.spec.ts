/**
 * 🛡️ P1-8 回归：`@技术栈` 标记落地校验（element-coverage-validator）
 *
 * 事故依据 mc-max-1790830432735-07a812f7：设计稿标注 `@antd/table` / `@antd/button` /
 * `@antd/radio`，产物零 `a-` 组件（按钮整块消失、表格手写 div），旧管线**零报警**判「成功」。
 * 本 spec 锁死：
 *   ① 真值节点名触发（不是文档 control 词表）；② 库→标签前缀确定性映射；
 *   ③ 未知库 fail-open；④ 原生 `<table>` 不算「用了 antd table」；
 *   ⑤ 文档元素通道行为不被技术栈通道污染（口径分账）。
 */
// 🚨 本模块经 ../logger/index.js 间接依赖 config/backend-root.js（用 import.meta.url，jest CJS 下
//    报 `Identifier '__filename' has already been declared`）⇒ virtual mock 掉路径解析。
jest.mock('../../config/backend-root.js', () => ({
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

import {
  ElementCoverageValidator,
  collectTechStackMarkers,
  validateTechStack,
} from './element-coverage-validator.js'

const node = (id, name, children = []) => ({ id, name, type: 'FRAME', children })

describe('collectTechStackMarkers', () => {
  it('遍历真值树并按 lib/component 去重', () => {
    const tree = node('r', 'cp-x', [
      node('a', '@antd/table', [node('a1', '@antd/table')]),
      node('b', '@antd/button'),
      node('c', '普通容器', [node('c1', '@echarts/bar')]),
      node('d', '没有标记'),
    ])
    const markers = collectTechStackMarkers(tree)
    expect(markers.map((m) => m.raw).sort()).toEqual(['@antd/button', '@antd/table', '@echarts/bar'])
    expect(markers.find((m) => m.raw === '@antd/table')).toMatchObject({
      nodeId: 'a', library: 'antd', component: 'table',
    })
  })

  it('支持 { document } 包装形态；空输入返回空数组', () => {
    expect(collectTechStackMarkers({ document: node('r', '@antd/select') })).toHaveLength(1)
    expect(collectTechStackMarkers(null)).toEqual([])
    expect(collectTechStackMarkers({ name: 'no-marker' })).toEqual([])
  })
})

describe('validateTechStack', () => {
  const markers = collectTechStackMarkers(node('r', 'root', [node('a', '@antd/table'), node('b', '@antd/button')]))

  it('产物无对应库组件 → 全部报缺失', () => {
    const r = validateTechStack({ markers, files: { 'package/index.vue': '<template><div/></template>' } })
    expect(r.total).toBe(2)
    expect(r.missing.map((m) => m.raw).sort()).toEqual(['@antd/button', '@antd/table'])
    expect(r.missing[0].expected.join(' ')).toContain('<a-table')
  })

  it('kebab / 带前缀 Pascal / 裸 Pascal 三种写法都算落地', () => {
    for (const tag of ['<a-table', '<ATable', '<Table']) {
      const r = validateTechStack({
        markers,
        files: { 'a.vue': `<template>${tag} :columns="c" /><a-button>保存</a-button></template>` },
      })
      expect(r.missing.map((m) => m.raw)).toEqual([])
    }
  })

  it('原生 <table> 不算「用了 antd table」（严格口径）', () => {
    const r = validateTechStack({ markers: [markers[0]], files: { 'a.vue': '<template><table><tr/></table></template>' } })
    expect(r.missing).toHaveLength(1)
  })

  it('未知库 fail-open（不判定、不阻断），但留下 skip 痕迹', () => {
    const r = validateTechStack({
      markers: collectTechStackMarkers(node('r', '@foo/bar')),
      files: { 'a.vue': '<template><div/></template>' },
    })
    expect(r.missing).toHaveLength(0)
    expect(r.coveredDetails[0].via).toContain('unknown-library')
  })

  it('图表库按 echarts / setOption 判定', () => {
    const chartMarkers = collectTechStackMarkers(node('r', '@echarts/bar'))
    expect(validateTechStack({ markers: chartMarkers, files: { 'a.vue': '<script>setOption({})</script>' } }).missing).toHaveLength(0)
    expect(validateTechStack({ markers: chartMarkers, files: { 'a.vue': '<template><div/></template>' } }).missing).toHaveLength(1)
  })
})

describe('ElementCoverageValidator.validate —— 技术栈通道接入', () => {
  const markers = collectTechStackMarkers(node('r', 'root', [node('a', '@antd/table')]))

  it('Figma 路径（无 docAnalysis.uiElements）不早退，且报 TECHSTACK 缺失', () => {
    const r = new ElementCoverageValidator().validate({
      uiElements: [],
      files: { 'package/index.vue': '<template><div class="x"/></template>' },
      techStackMarkers: markers,
    })
    expect(r.skipped).toBe(false)
    expect(r.pass).toBe(false)
    expect(r.missing).toHaveLength(1)
    expect(r.missing[0].control).toBe('技术栈')
    expect(r.techStackMissing).toHaveLength(1)
    expect(r.summary).toContain('@技术栈 标记未落地 1 个')
  })

  it('无可校验内容时仍早退（保持旧行为）', () => {
    const r = new ElementCoverageValidator().validate({ uiElements: [], files: {} })
    expect(r.skipped).toBe(true)
  })

  it('文档元素通道行为不变（技术栈切片不污染覆盖率分母）', () => {
    const r = new ElementCoverageValidator().validate({
      uiElements: [{ name: '统计卡', control: '统计卡' }],
      files: { 'a.vue': '<template><div class="stat">统计卡</div></template>' },
      techStackMarkers: markers,
    })
    expect(r.total).toBe(1)
    expect(r.covered).toBe(1)
    expect(r.coverageRate).toBe(1)
    // 技术栈缺失单独切片，不计入文档元素覆盖率
    expect(r.techStack.missing).toHaveLength(1)
  })
})
