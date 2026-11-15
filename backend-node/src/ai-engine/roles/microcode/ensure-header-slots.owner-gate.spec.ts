jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: '/tmp/mvgo-test-logs',
}))

/**
 * 🛡️ 2026-11-15（mc-max-1794749284344-c5e0aadc 实锤）：
 *   T09 P1-3「重叠去重」原先只看「文本是否在子组件里出现过」。模型把 header 组当成业务
 *   section 写进内容区（`StatsSection.vue` 里手写「设备类型 28 / 设备总数 68562 / 完好率 98%」）
 *   之后，去重认定「body 已表达」⇒ 3 条 header-right 插槽全部跳过注入 ⇒
 *   真插槽留在内容区、`#header-right` 恒空（F1b slotAbsent=3 只报不拦）。
 *   owner 门禁：候选插槽的 figmaNodeId 落在 header owner 子树内 ⇒ 不允许被「内容区副本」否掉。
 */
import { ensureHeaderSlots } from './resource-mounter.js'

const INDEX = `<template>
  <base-panel panelKey="default-panel">
    <div class="c-x-slot-con"><StatsSection /><CardGrid /></div>
  </base-panel>
</template>`

/** 模型错位的产物：header 内容被手写进内容区 section 组件。 */
const STATS_SECTION = `<template>
  <div class="c-x-header">
    <span>设备类型</span><span>28</span>
    <span>设备总数</span><span>68562</span>
  </div>
</template>`

const FILES = {
  'package/index.vue': INDEX,
  'package/components/StatsSection.vue': STATS_SECTION,
  'package/components/CardGrid.vue': '<template><div class="c-x-grid">摄像机</div></template>',
}

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })

/** root 400×400 / header 组高 40（10%）/ 内容段其下。 */
const FIGMA = {
  document: {
    id: '0:0',
    type: 'DOCUMENT',
    name: 'Document',
    children: [
      {
        id: '1:1',
        type: 'FRAME',
        name: 'cp-面板',
        absoluteBoundingBox: box(0, 0, 400, 400),
        children: [
          {
            id: '1:2',
            type: 'GROUP',
            name: 'header',
            absoluteBoundingBox: box(0, 0, 400, 40),
            children: [
              {
                id: '1:3',
                type: 'TEXT',
                name: '设备监测',
                characters: '设备监测',
                absoluteBoundingBox: box(4, 4, 60, 18),
                style: { fontSize: 18 },
              },
              {
                id: '1:4',
                type: 'FRAME',
                name: 'stat',
                absoluteBoundingBox: box(200, 6, 80, 23),
                children: [
                  {
                    id: '1:5',
                    type: 'TEXT',
                    name: 'label',
                    characters: '设备类型',
                    absoluteBoundingBox: box(200, 6, 50, 20),
                    style: { fontSize: 14 },
                  },
                ],
              },
            ],
          },
          {
            id: '1:10',
            type: 'FRAME',
            name: 'cons',
            absoluteBoundingBox: box(0, 50, 400, 340),
            children: [
              {
                id: '1:11',
                type: 'TEXT',
                name: '摄像机',
                characters: '摄像机',
                absoluteBoundingBox: box(10, 60, 50, 18),
                style: { fontSize: 14 },
              },
            ],
          },
        ],
      },
    ],
  },
}

const SLOTS_OWNER = [
  { slotType: 'header-right', elementType: 'statistic', content: '设备类型 28', figmaNodeId: '1:4' },
]

const SLOTS_CONTENT = [
  { slotType: 'header-right', elementType: 'statistic', content: '设备类型 28', figmaNodeId: '1:11' },
]

const opts = (extra: Record<string, unknown> = {}) => ({
  componentType: 'microcode',
  files: FILES,
  logger: { info: () => {}, warn: () => {} },
  ...extra,
})

describe('T09 owner 门禁：header 子树内的插槽不得被内容区副本否掉', () => {
  it('阳性：slot.figmaNodeId 在 owner 子树内 ⇒ 注入 #header-right（不因文本重复跳过）', () => {
    const out = ensureHeaderSlots(INDEX, { headerSlots: SLOTS_OWNER, figmaNodeData: FIGMA }, opts())
    expect(out).toContain('<template #header-right>')
    expect(out).toContain('设备类型')
  })

  it('阳性：owner 门禁计数行可核（exempt=1 且 kept=1）', () => {
    const lines: any[] = []
    const logger = { info: (m: string, meta: any) => lines.push([m, meta]), warn: () => {} }
    ensureHeaderSlots(INDEX, { headerSlots: SLOTS_OWNER, figmaNodeData: FIGMA }, opts({ logger }))
    const gate = lines.find(([m]) => String(m).includes('owner 门禁'))
    expect(gate).toBeTruthy()
    expect(gate[1]).toMatchObject({ ownerId: '1:2', exempt: 1, kept: 1 })
  })

  it('阴性：slot 在内容区（figmaNodeId 不在 owner 子树）且文本重复 ⇒ 仍旧跳过注入', () => {
    const out = ensureHeaderSlots(INDEX, { headerSlots: SLOTS_CONTENT, figmaNodeData: FIGMA }, opts())
    expect(out).not.toContain('<template #header-right>')
  })

  it('阴性：无 figmaNodeData ⇒ 不启用门禁，退回旧去重行为（跳过注入）', () => {
    const out = ensureHeaderSlots(INDEX, { headerSlots: SLOTS_OWNER }, opts())
    expect(out).not.toContain('<template #header-right>')
  })

  it('阴性：owner 子树内但文本不在子组件 ⇒ 照常注入（门禁不改变正常路径）', () => {
    const files = {
      'package/index.vue': INDEX,
      'package/components/StatsSection.vue': '<template><div class="c-x">无关</div></template>',
    }
    const out = ensureHeaderSlots(INDEX, { headerSlots: SLOTS_OWNER, figmaNodeData: FIGMA }, opts({ files }))
    expect(out).toContain('<template #header-right>')
  })
})
