/**
 * 🛡️ 结构骨架来源（structureSource）判据 —— 2026-10-30 第2步
 *
 * 用户拍板（刀33 既有步序）：**结构骨架 = vision／精确尺寸 = Figma**。
 *
 * 真实病灶：mc-max-1793337365462-12ee8e4c（c-aiot-dpjh-bsjd）
 *   - vision（visual.json）已给出「节点列表」`body.layout='vertical-6-items'`、
 *     `body.items` = 6 个完整列表项 —— 结构**正确**；
 *   - E1（deriveSectionsFromFigmaTree）无条件替代 vision sections 作结构骨架，
 *     把该段推成 `type=container / layoutSource=container-rebuild`，
 *     规划结果 `children=1`、`bodyItems=0` ⇒ **6 卡塌成 1 卡**，
 *     其余 5 卡变成 10 个 absorbed-bg 绝对定位背景块。
 *
 * 本 spec 守三件事：
 *   A. 默认走 vision 骨架，vision 已给出的整列 items **不得被丢弃**；
 *   B. Figma 仍提供精确尺寸（figmaHeightPx / absoluteBoundingBox）；
 *   C. 显式 `structureSource:'figma'` 保留旧 E1 行为（逃生门 + 阳性对照，
 *      证明「默认路径保留 items」不是 fixture 恒真）。
 */
jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: '/tmp/mvgo-test-workspace',
  backendRoot: '/Users/smigoo/工作/mvgo/backend-node',
  projectRoot: '/Users/smigoo/工作/mvgo',
  logsDir: '/tmp/mvgo-test-logs',
  dataDir: '/tmp/mvgo-test-data',
  tempComponentsDir: '/tmp/mvgo-test-temp-components',
}), { virtual: true })

import { readFileSync } from 'fs'
import { join } from 'path'
import {
  SubcomponentPlanner,
  normalizeStructureSource,
  DEFAULT_STRUCTURE_SOURCE,
} from '../subcomponent-planner.js'

const svcSrc = readFileSync(join(__dirname, '../subcomponent-planner.js'), 'utf-8')

/** 6 张同构卡片（等宽 470、等高 72、等间距 92）——与真实 figma.json 同构 */
function figmaTreeWithSixCards(): any {
  const cards = [0, 1, 2, 3, 4, 5].map((i) => ({
    id: `48:${5798 + i * 15}`,
    name: `Group 213663841${5 + i}`,
    type: 'GROUP',
    absoluteBoundingBox: { x: 20, y: 51606 + i * 92, width: 470, height: 72 },
    children: [
      {
        id: `48:${5799 + i * 15}`,
        name: 'Rectangle',
        type: 'RECTANGLE',
        absoluteBoundingBox: { x: 20, y: 51606 + i * 92, width: 470, height: 72 },
      },
      {
        id: `48:${5801 + i * 15}`,
        name: 'Group inner',
        type: 'GROUP',
        absoluteBoundingBox: { x: 36, y: 51622 + i * 92, width: 438, height: 41 },
        children: [
          {
            id: `48:${5806 + i * 15}`,
            name: `节点${i + 1}`,
            type: 'TEXT',
            characters: `节点${i + 1}`,
            absoluteBoundingBox: { x: 36, y: 51622 + i * 92, width: 120, height: 18 },
          },
        ],
      },
    ],
  }))
  return {
    id: '565:3',
    name: 'slot-con',
    type: 'GROUP',
    absoluteBoundingBox: { x: 20, y: 51606, width: 470, height: 568 },
    children: cards,
  }
}

/** vision 已正确识别：节点列表 = 6 个列表项（对应真实 visual.json 的形态） */
function visionLayoutWithSixItems(): any {
  const items = [0, 1, 2, 3, 4, 5].map((i) => ({
    id: `48:${5798 + i * 15}`,
    name: `节点${i + 1}`,
    role: 'list-item',
    layout: 'horizontal',
    content: { elements: [{ type: 'label', text: `节点${i + 1}` }] },
  }))
  return {
    layout: {
      sections: [
        {
          id: '48:5798',
          name: '节点列表',
          layout: 'vertical',
          body: { layout: 'vertical-6-items', items },
        },
      ],
    },
  }
}

function findSection(secs: any[], id: string): any {
  for (const s of secs || []) {
    if (s?.id === id) return s
    const hit = findSection(s?.children || [], id)
    if (hit) return hit
  }
  return null
}

function planWith(opts: any = {}) {
  return new SubcomponentPlanner().plan(visionLayoutWithSixItems(), {
    figmaNodeData: figmaTreeWithSixCards(),
    ...opts,
  })
}

describe('structureSource 归一（默认 vision，figma 为逃生门）', () => {
  it('默认 / 脏值 ⇒ vision；仅显式 figma ⇒ figma', () => {
    expect(DEFAULT_STRUCTURE_SOURCE).toBe('vision')
    expect(normalizeStructureSource(undefined)).toBe('vision')
    expect(normalizeStructureSource(null)).toBe('vision')
    expect(normalizeStructureSource('')).toBe('vision')
    expect(normalizeStructureSource('whatever')).toBe('vision')
    expect(normalizeStructureSource('figma')).toBe('figma')
    expect(normalizeStructureSource('vision')).toBe('vision')
  })
})

describe('🔴 病灶复刻：vision 已给出 6 项列表时，默认路径不得丢弃', () => {
  it('默认（vision 骨架）：节点列表保留 6 个列表项', () => {
    const res: any = planWith()
    const list = findSection(res.effectiveSections, '48:5798')
    expect(list).toBeTruthy()
    const items = list.body?.items || list.items || []
    console.log('[诊断] 默认路径列表区:', JSON.stringify({
      id: list.id, type: list.type, layout: list.layout,
      items: items.length, kids: (list.children || []).length,
      figmaHeightPx: list.styles?.figmaHeightPx,
    }))
    expect(items.length).toBe(6)
  })

  it('阳性对照：显式 structureSource=figma ⇒ 走 E1，vision 的 6 项不被保留（证明判据非恒真）', () => {
    const res: any = planWith({ structureSource: 'figma' })
    const list = findSection(res.effectiveSections, '48:5798')
    const items = list?.body?.items || list?.items || []
    console.log('[诊断] figma 路径列表区:', JSON.stringify({
      id: list?.id, type: list?.type, layout: list?.layout,
      items: items.length, kids: (list?.children || []).length,
    }))
    // E1 用 Figma 树重建结构，vision 的 body.items 不作结构骨架
    expect(items.length).not.toBe(6)
  })

  it('Figma 精确尺寸仍注入：vision 骨架下 section 带 figmaHeightPx', () => {
    const res: any = planWith()
    const list = findSection(res.effectiveSections, '48:5798')
    expect(list.styles?.figmaHeightPx).toBeGreaterThan(0)
    expect(list.absoluteBoundingBox?.width).toBe(470)
  })

  it('列表段尺寸取逐项并集（不得压成首卡 72px，刀25/26 同型病灶）', () => {
    const res: any = planWith()
    const list = findSection(res.effectiveSections, '48:5798')
    // 首卡 y=51606 h=72，末卡 y=52066 h=72 ⇒ 并集 height = 52138-51606 = 532
    expect(list.styles?.figmaHeightPx).toBe(532)
    expect(list.absoluteBoundingBox?.height).toBe(532)
  })

  it('ef5c7ed3：合成 item id + figmaNode 真值锚 ⇒ 列表段高仍为六项并集 532', () => {
    const vision = visionLayoutWithSixItems()
    const list = vision.layout.sections[0]
    list.body.items = list.body.items.map((item: any) => ({
      ...item,
      figmaNode: item.id,
      id: `${item.id}-item`,
    }))
    const res: any = new SubcomponentPlanner().plan(vision, {
      figmaNodeData: figmaTreeWithSixCards(),
    })
    const sec = findSection(res.effectiveSections, '48:5798')
    expect(sec.styles?.figmaHeightPx).toBe(532)
    expect(sec.absoluteBoundingBox?.height).toBe(532)
  })

  it('阴性对照：单项段尺寸仍取锚点 bbox（不被并集逻辑误扩）', () => {
    const single = {
      layout: {
        sections: [{ id: '48:5798', name: '单卡', body: { items: [{ id: '48:5798' }] } }],
      },
    }
    const res: any = new SubcomponentPlanner().plan(single, {
      figmaNodeData: figmaTreeWithSixCards(),
    })
    const sec = findSection(res.effectiveSections, '48:5798')
    // 叶子段的尺寸载体是 layoutMetadata.height（buildEffectiveSection 不透传 styles）
    expect(sec.layoutMetadata?.height ?? sec.styles?.figmaHeightPx).toBe(72)
  })
})

describe('vision 原生 panel-header 识别（9e0b7a97：不再依赖几何行注入）', () => {
  const layout = {
    layout: { sections: [
      {
        id: 'section-header', role: 'header', headerRelation: 'title-itself',
        children: [
          { role: 'icon', name: '标题装饰图标' },
          { role: 'text', text: '部署节点概览' },
          { role: 'text', text: '全国' },
          { role: 'icon', name: '关闭按钮' },
          { role: 'decoration', name: '标题下划线' },
        ],
      },
      { id: '48:5798', role: 'list', body: { items: [] } },
      { id: 'section-footer', role: 'footer', body: { children: [] } },
    ] },
  }

  it('微码：显式 role=header + title-itself 即使 5 个 chrome 元素也由 base-panel 承接', () => {
    const res: any = new SubcomponentPlanner().plan(layout)
    expect(res.effectiveSections.map((s: any) => s.id)).toEqual(['48:5798', 'section-footer'])
  })

  it('ef5c7ed3：role=常驻但显式 title-itself 仍是原生面板标题，不得物化成统计段', () => {
    const nativeHeader = {
      layout: { sections: [
        { ...layout.layout.sections[0], role: '常驻' },
        ...layout.layout.sections.slice(1),
      ] },
    }
    const res: any = new SubcomponentPlanner().plan(nativeHeader)
    expect(res.effectiveSections.map((s: any) => s.id)).toEqual(['48:5798', 'section-footer'])
  })

  it('696105e8：title-same-row 且 body 全由标题/控件/装饰解释 ⇒ base-panel 承接，不物化伪 StatsSection', () => {
    const sameRowChrome = {
      layout: { sections: [
        {
          ...layout.layout.sections[0],
          role: '常驻',
          name: '头部栏',
          headerRelation: 'title-same-row',
          slotCandidate: 'header-right',
          header: {
            title: '部署节点概览',
            controls: [
              { name: '全国', value: '全国', role: 'label' },
              { name: 'icon-关闭', role: 'icon' },
            ],
          },
          children: undefined,
          body: { children: [
            { role: 'decoration', type: 'decoration', name: '标题装饰线' },
            { role: 'icon', type: 'icon', name: '标题装饰图标' },
            { role: 'text', type: 'text', text: '部署节点概览' },
            { role: 'text', type: 'text', text: '全国' },
            { role: 'icon', type: 'icon', name: 'icon-关闭' },
          ] },
        },
        ...layout.layout.sections.slice(1),
      ] },
    }
    const res: any = new SubcomponentPlanner().plan(sameRowChrome)
    expect(res.effectiveSections.map((s: any) => s.id)).toEqual(['48:5798', 'section-footer'])
  })

  it('阴性：title-same-row 含额外业务 body ⇒ 保留 section，仅控件进 header slot', () => {
    const withBusinessBody = {
      layout: { sections: [
        {
          ...layout.layout.sections[0],
          headerRelation: 'title-same-row',
          slotCandidate: 'header-right',
          header: { title: '部署节点概览', controls: [{ name: '全国', value: '全国' }] },
          children: undefined,
          body: { children: [
            { role: 'text', type: 'text', text: '部署节点概览' },
            { role: 'text', type: 'text', text: '全国' },
            { role: 'statistic', type: 'text', text: '在线 3792' },
          ] },
        },
        ...layout.layout.sections.slice(1),
      ] },
    }
    const res: any = new SubcomponentPlanner().plan(withBusinessBody)
    expect(res.effectiveSections.map((s: any) => s.id)).toContain('section-header')
  })

  it('Vue3：skipPanelHeaderFilter=true 仍保留 header，不改变既有双端契约', () => {
    const res: any = new SubcomponentPlanner().plan(layout, { skipPanelHeaderFilter: true })
    expect(res.effectiveSections.map((s: any) => s.id)).toContain('section-header')
  })
})

describe('ef5c7ed3：纯装饰伪 section 不得进入业务规划', () => {
  const layout = {
    layout: { sections: [
      { id: '48:5798', type: 'list', body: { items: [] } },
      { id: 'footer', type: 'stats', body: { children: [{ type: 'text', text: '共 6 个节点' }] } },
      { id: 'scrollbar', body: { children: [
        { id: 'scrollbar-track', role: '装饰', type: 'decoration', styles: { width: '6px' } },
      ] } },
    ] },
  }

  it('只有 decoration 叶的空业务段被过滤，列表/footer 保持 vision 顺序', () => {
    const res: any = new SubcomponentPlanner().plan(layout)
    expect(res.effectiveSections.map((s: any) => s.id)).toEqual(['48:5798', 'footer'])
  })

  it('阴性：decoration 与业务文本同段时不过滤，不误删真实内容', () => {
    const mixed = {
      layout: { sections: [
        { id: 'footer', body: { children: [
          { role: '装饰', type: 'decoration' },
          { role: '常驻', type: 'text', text: '共 6 个节点' },
        ] } },
      ] },
    }
    const res: any = new SubcomponentPlanner().plan(mixed)
    expect(res.effectiveSections.map((s: any) => s.id)).toEqual(['footer'])
  })
})

describe('🔴 锚点完备性闸门（4cff5af2：vision 语义 id + 逐项无 id ⇒ 零真值）', () => {
  it('段与逐项均失锚 ⇒ 回退 E1（不产出零真值布局）', () => {
    const semantic = {
      layout: {
        sections: [{
          id: 'node-list', name: '节点列表', layout: 'vertical',
          body: { items: [0, 1, 2, 3, 4, 5].map((i) => ({ name: `节点${i + 1}`, content: {} })) },
        }],
      },
    }
    const res: any = new SubcomponentPlanner().plan(semantic, {
      figmaNodeData: figmaTreeWithSixCards(),
    })
    const ids = res.effectiveSections.map((s: any) => String(s.id))
    expect(ids).not.toContain('node-list') // vision 段被放弃
    expect(ids.some((id: string) => /^(48|565):/.test(id))).toBe(true) // 改走 Figma 推导
  })

  it('段 id 为语义名但逐项可锚定 ⇒ 不误回退，且尺寸仍能由逐项并集供出', () => {
    const semantic = {
      layout: {
        sections: [{
          id: 'node-list', name: '节点列表', layout: 'vertical',
          body: { items: [0, 1, 2, 3, 4, 5].map((i) => ({ id: `48:${5798 + i * 15}`, name: `节点${i + 1}` })) },
        }],
      },
    }
    const res: any = new SubcomponentPlanner().plan(semantic, {
      figmaNodeData: figmaTreeWithSixCards(),
    })
    const list = findSection(res.effectiveSections, 'node-list')
    expect(list).toBeTruthy()
    expect((list.body?.items || []).length).toBe(6)
    // 尺寸载体随段形态不同：列表段在 styles.figmaHeightPx，叶子段在 layoutMetadata.height
    const h = list.styles?.figmaHeightPx ?? list.layoutMetadata?.height
    console.log('[诊断] 逐项锚定段:', JSON.stringify({ id: list.id, type: list.type, h, lm: list.layoutMetadata?.height }))
    expect(h).toBe(532) // 段失锚也能靠逐项拿到真值
  })

  it('e7c4197c：统计项失锚但表格子节点已锚定 ⇒ 不得把整组件回退 E1', () => {
    const semantic = {
      layout: {
        sections: [
          {
            id: 'section-summary', name: '设备状态汇总', role: 'stats-row',
            body: { items: ['总设备', '运行中', '离线'].map((name) => ({ name, role: 'stat-card' })) },
          },
          {
            id: 'section-table', name: '设备列表', role: 'table',
            body: { children: [{
              id: 'device-table', role: 'table', control: 'table', figmaNode: '48:5798',
              tableStyle: { headers: ['设备名称', '电量'], columnCount: 2 },
            }] },
          },
          { id: 'section-footer', name: '底部状态说明', role: 'footer', body: { children: [] } },
        ],
      },
    }
    const res: any = new SubcomponentPlanner().plan(semantic, {
      figmaNodeData: figmaTreeWithSixCards(),
    })
    expect(res.effectiveSections.map((s: any) => s.id)).toEqual([
      'section-summary', 'section-table', 'section-footer',
    ])
    expect(findSection(res.effectiveSections, 'section-table')?.type).toBe('table')
    expect(findSection(res.effectiveSections, 'section-summary')?.body?.items).toHaveLength(3)
  })
})

describe('🔴 vision 布局主权：根锚点只切几何，Figma 不重排结构（7d7925d2）', () => {
  const ROOT = {
    id: '807:2', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 510, height: 515 },
    children: [
      { id: '43:4892', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 0, width: 510, height: 66 }, children: [] },
      { id: '43:4788', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 84, width: 510, height: 345 }, children: [] },
    ],
  }
  const layout = {
    layout: { sections: [
      { id: '43:4893', figmaAnchorId: '43:4892', name: '统计卡片区', body: { children: [{ role: 'stat-card', text: '8' }] } },
      { id: '807:2', name: '底部图例', body: { children: [{ type: 'label', text: '运行中' }] } },
      { id: '43:4788', name: '设备列表', body: { children: [{ type: 'label', text: '设备' }] } },
    ] },
  }

  it('子段误锚组件根 ⇒ 保留 footer 和 vision 顺序，但根高 515 不得注入', () => {
    const res: any = new SubcomponentPlanner().plan(layout, { figmaNodeData: ROOT })
    expect(res.effectiveSections.map((s: any) => s.id)).toEqual(['43:4893', '807:2', '43:4788'])
    const footer = findSection(res.effectiveSections, '807:2')
    expect(footer.geometryAnchorInvalid).toBe('component-root')
    expect(footer.absoluteBoundingBox?.height).not.toBe(515)
    expect(footer.layoutMetadata?.height).not.toBe(515)
    expect(footer.layoutMetadata?.flexGrow).not.toBeGreaterThan(1)
  })

  it('顶部 stat-card 不得被几何兜底改成 header', () => {
    const res: any = new SubcomponentPlanner().plan(layout, { figmaNodeData: ROOT })
    expect(findSection(res.effectiveSections, '43:4893')?.type).not.toBe('header')
  })

  it('Figma y 顺序与 vision 相反 ⇒ 仍保留 vision 顺序；根锚点守卫不是重排开关', () => {
    const reversed = {
      layout: { sections: [
        { id: '43:4788', name: '先读列表', body: { children: [] } },
        { id: '43:4893', figmaAnchorId: '43:4892', name: '后读统计', body: { children: [] } },
      ] },
    }
    const res: any = new SubcomponentPlanner().plan(reversed, { figmaNodeData: ROOT })
    expect(res.effectiveSections.map((s: any) => s.id)).toEqual(['43:4788', '43:4893'])
  })
})

describe('接线判据：开关真的接在 E1 推导上（不是新壳）', () => {
  function assertWiring(text: string) {
    expect(text).toMatch(/normalizeStructureSource\(opts\.structureSource\)/)
    expect(text).toMatch(/effectiveStructureSource === STRUCTURE_SOURCE_FIGMA/)
    expect(text).toMatch(/DEFAULT_STRUCTURE_SOURCE = STRUCTURE_SOURCE_VISION/)
    // 真机判据行（离线探针不可替代）
    expect(text).toContain('structure-source·已评估')
    // 配套①：vision 平铺容器锚点下，覆盖去重必须要求吸收者携带内容（P0 业务段误删）
    expect(text).toMatch(/requireContentCarrier: effectiveStructureSource === STRUCTURE_SOURCE_VISION/)
    // 配套②：isPanelHeader 剥离的标题栏必须计入几何兜底闸门（P0 统计卡被误标 header）
    expect(text).toMatch(/effectiveStructureSource === STRUCTURE_SOURCE_VISION && filteredCount > 0/)
    // 配套③：锚点完备性闸门——vision 失锚必须回退 E1（4cff5af2 零真值布局崩塌）
    expect(text).toMatch(/hasAnchoredContent\(sections, anchorIndex\)/)
    expect(text).toContain('vision-anchor-missing')
    // vision 顺序与根锚点守卫：Figma 只补事实，不得重排/回灌根盒
    expect(text).toMatch(/effectiveStructureSource === STRUCTURE_SOURCE_FIGMA\s*\?\s*sortSectionsByFigmaY/)
    expect(text).toContain("geometryAnchorInvalid: 'component-root'")
    expect(text).toMatch(/if \(s\?\.geometryAnchorInvalid\) continue/)
  }

  it('subcomponent-planner.js 满足接线判据', () => {
    assertWiring(svcSrc)
  })

  it('阳性对照：把开关摘回硬编码旧行为 ⇒ 判据必须变红', () => {
    const reverted = svcSrc.replace(
      'const structureSource = normalizeStructureSource(opts.structureSource);',
      "const structureSource = 'figma';",
    )
    expect(reverted).not.toBe(svcSrc)
    expect(() => assertWiring(reverted)).toThrow()
  })
})
