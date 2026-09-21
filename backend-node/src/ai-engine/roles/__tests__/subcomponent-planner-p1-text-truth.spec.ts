/**
 * P1 文本真值保留（2026-09-20 · c3c3244f tabs 消失治本）单元测试
 *
 * 背景：E1 derived 树的普通叶子（如 tabs-list 2:7889）其 item 级子节点（4 条 tab 文本）
 *   在 buildEffectiveSection 叶子重建时被「仅透传 collapsed 子项」收口丢弃 → LLM 拿不到
 *   tab 文本 → do-not-invent 生效 → tabs DOM 消失（环境监测文字 tabs 找不到）。
 *
 * 治本：叶子重建时把「无 collapsed/v-for、带 text 的 item 子节点」文本确定性收进 body.items。
 */

jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: '/tmp/mvgo-test-workspace',
  backendRoot: '/Users/smigoo/工作/mvgo/backend-node',
  projectRoot: '/Users/smigoo/工作/mvgo',
  logsDir: '/tmp/mvgo-test-logs',
  dataDir: '/tmp/mvgo-test-data',
  tempComponentsDir: '/tmp/mvgo-test-temp-components',
}), { virtual: true })

import { SubcomponentPlanner } from '../subcomponent-planner.js'

/**
 * 构造「sub-t 容器 → tabs-list（4 条 tab 文本 + 2 bg）→ tabs-icon」的 Figma 树，
 * 对齐 c3c3244f 环境监测真实结构（2:7879 → 89:42 → 2:7889 / 89:43）。
 */
function envMonitorFigma(): any {
  return {
    id: '2:7879',
    name: 'cp-环境监测',
    type: 'FRAME',
    absoluteBoundingBox: { x: 1475, y: 865, width: 420, height: 186 },
    children: [
      {
        id: '89:41',
        name: 'con',
        type: 'FRAME',
        absoluteBoundingBox: { x: 1475, y: 865, width: 420, height: 186 },
        children: [
          {
            id: '89:42',
            name: 'sub-t',
            type: 'FRAME',
            absoluteBoundingBox: { x: 1495, y: 875, width: 380, height: 32 },
            children: [
              {
                id: '2:7889',
                name: 'tabs-list',
                type: 'GROUP',
                absoluteBoundingBox: { x: 1495, y: 903, width: 295, height: 27 },
                children: [
                  { id: '2:7890', name: 'bg', type: 'VECTOR', absoluteBoundingBox: { x: 1495, y: 903, width: 295, height: 27 } },
                  { id: '2:7891', name: 'bg-tab-active', type: 'VECTOR', absoluteBoundingBox: { x: 1500, y: 906, width: 78, height: 21 } },
                  { id: '2:7892', name: '一氧化碳', type: 'TEXT', characters: '一氧化碳', absoluteBoundingBox: { x: 1500, y: 906, width: 48, height: 21 } },
                  { id: '2:7893', name: '洞内照明', type: 'TEXT', characters: '洞内照明', absoluteBoundingBox: { x: 1560, y: 906, width: 48, height: 21 } },
                  { id: '2:7894', name: '洞外光强', type: 'TEXT', characters: '洞外光强', absoluteBoundingBox: { x: 1620, y: 906, width: 48, height: 21 } },
                  { id: '2:7897', name: '能见度', type: 'TEXT', characters: '能见度', absoluteBoundingBox: { x: 1680, y: 906, width: 36, height: 21 } },
                ],
              },
              {
                id: '89:43',
                name: 'tabs-icon',
                type: 'FRAME',
                absoluteBoundingBox: { x: 1816, y: 905, width: 52, height: 24 },
                children: [
                  { id: '2:7941', name: 'icon', type: 'VECTOR', absoluteBoundingBox: { x: 1816, y: 905, width: 24, height: 24 } },
                  { id: '2:7945', name: 'icon', type: 'VECTOR', absoluteBoundingBox: { x: 1844, y: 905, width: 24, height: 24 } },
                ],
              },
            ],
          },
        ],
      },
    ],
  }
}

describe('P1 文本真值保留（tabs 文本不丢失）', () => {
  let planner: InstanceType<typeof SubcomponentPlanner>

  beforeEach(() => {
    planner = new SubcomponentPlanner()
  })

  test('普通叶子 tabs-list 的 4 条文本收进 body.items（不因收口丢失）', () => {
    const figma = envMonitorFigma()
    const result: any = planner.plan(
      { layout: { sections: [] }, sections: [] },
      { figmaNodeData: figma, minSectionsForced: 1 },
    )
    const secs: any[] = result.effectiveSections || []
    // 在树中找到 tabs-list（2:7889）
    let target: any = null
    const walk = (list: any[]) => {
      for (const s of list || []) {
        if (s.id === '2:7889') target = s
        walk(s.children || [])
      }
    }
    walk(secs)
    expect(target).toBeTruthy()
    const items = target.body?.items || []
    const texts = items.map((it: any) => it.text)
    expect(texts).toEqual(expect.arrayContaining(['一氧化碳', '洞内照明', '洞外光强', '能见度']))
    expect(texts).toHaveLength(4)
  })
})
