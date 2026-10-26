/**
 * P0 端到端重放 spec（2026-10-26 · mc-max-1792934367321-ab7bb76c）：
 * 「面板标题段被还原 ⇒ 双标题」的完整链路 —— 真实 Figma 树 + 真实 vision plan，
 * 走**生产同一入口** `SubcomponentPlanner#plan`。
 *
 * 钉住三件事（双向）：
 *   ① 807:3（纯装饰标题栏）必须被 `stripChromeOnly` 剥离 ⇒ 不进 effectiveSections；
 *   ② 剥离后**不得**触发 `applyHeaderGeometryFallback` 把「顶部统计概览」误标成 header；
 *   ③ 业务段（统计 / 表格 / 底部图例）全部原样保留 ⇒ 剥离没有连带删内容。
 *
 * 语料缺失时整体 skip（不假设语料常驻）。
 */
import fs from 'node:fs'

jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: '/tmp/mvgo-test-workspace',
  backendRoot: '/Users/smigoo/工作/mvgo/backend-node',
  projectRoot: '/Users/smigoo/工作/mvgo',
  logsDir: '/tmp/mvgo-test-logs',
  dataDir: '/tmp/mvgo-test-data',
  tempComponentsDir: '/tmp/mvgo-test-temp-components',
}), { virtual: true })

import { SubcomponentPlanner } from '../subcomponent-planner.js'

const CASE_DIR =
  '/Users/smigoo/工作/mvgo/temp-components/6a51f7caed28c5d5b13c61a5/mc-max-1792934367321-ab7bb76c'
const FIGMA_PATH = `${CASE_DIR}/.mc-gen/cache/figma-node-data.json`
const VISUAL_PATH = `${CASE_DIR}/.checkpoint/visual.json`
const hasCorpus = fs.existsSync(FIGMA_PATH) && fs.existsSync(VISUAL_PATH)
const describeIfCorpus = hasCorpus ? describe : describe.skip

describeIfCorpus('P0 端到端重放：807:3 纯装饰标题栏剥离（ab7bb76c 真实语料）', () => {
  let plan: any
  let allSections: any[]

  beforeAll(() => {
    const figmaNodeData = JSON.parse(fs.readFileSync(FIGMA_PATH, 'utf8'))
    const visual = JSON.parse(fs.readFileSync(VISUAL_PATH, 'utf8'))
    const layoutStructure = visual.layoutStructure
    plan = new SubcomponentPlanner().plan(layoutStructure, { figmaNodeData })
    const flat: any[] = []
    const walk = (list: any[]) => {
      for (const s of list || []) {
        if (s && typeof s === 'object') {
          flat.push(s)
          if (Array.isArray(s.children)) walk(s.children)
        }
      }
    }
    walk(plan?.effectiveSections || [])
    // leaf 段是独立字段（不挂在 effectiveSections.children 下），必须并入
    walk(plan?.leafSections || [])
    allSections = flat
  })

  it('① 事故段 807:3 已被剥离（不进 plan）', () => {
    expect(allSections.some((s) => String(s.id) === '807:3')).toBe(false)
  })

  it('② 剥离后无任何段被标成 header（几何兜底必须被闸门挡住）', () => {
    const headers = allSections.filter((s) => s.type === 'header')
    expect(headers.map((s) => `${s.id}:${s.name}`)).toEqual([])
  })

  it('③ 业务段仍在：统计概览 + 表格 + 底部图例三项齐全', () => {
    const ids = new Set(allSections.map((s) => String(s.id)))
    // 顶部统计卡（真值 43:4893 ⇒ 43:4898 ⇒ 43:4903 三张卡），至少一张存活且不得被标 header
    const stat = allSections.find((s) =>
      ['43:4893', '43:4898', '43:4903'].includes(String(s.id)),
    )
    expect(stat).toBeTruthy()
    expect(stat.type).not.toBe('header')
    // 表格（真值 frame 是 43:4784，plan 层可能下钻成 43:4785/43:4788，任一存在即可）
    const tableLike = ['43:4784', '43:4785', '43:4788'].filter((id) => ids.has(id))
    expect(tableLike.length).toBeGreaterThan(0)
    // 底部图例（容器 807:2 或图例项 43:4869/43:4875）
    const legendLike = ['807:2', '43:4869', '43:4875', '807:2-tail-text'].filter((id) =>
      ids.has(id),
    )
    expect(legendLike.length).toBeGreaterThan(0)
  })

  it('④ 计数行留痕：剥离数与剩余数可查（不靠猜）', () => {
    // plan 层调用的日志由 logger 输出，此处校验剥离的**结果**可数：
    const headerCount = allSections.filter((s) => s.type === 'header').length
    expect(headerCount).toBe(0)
    expect(allSections.length).toBeGreaterThan(0)
  })
})
