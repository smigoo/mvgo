/**
 * Loop 2.1.A：把 inlineCompositeRows（bbox 检测到的同行兄弟）真正合并进
 * `layout.sections`，成为 horizontal block 的 children，而不只是写旁路字段。
 * 下游 planner/engineer 优先采用 bbox 推导的 horizontal 行，避免 Vision 误拆竖排。
 */
import { mergeInlineRowsIntoSections } from './inline-row-merger.js'

describe('Loop 2.1.A mergeInlineRowsIntoSections', () => {
  const baseLayout = {
    type: 'vertical',
    direction: 'top-to-bottom',
    sections: [
      { id: 'sec-1', name: '当日总流量', role: 'header', layout: 'vertical', body: { layout: 'vertical', children: [] } },
      { id: 'sec-2', name: '车型分布', role: 'chart', layout: 'vertical', body: { layout: 'vertical', children: [] } },
    ],
  }
  const rows = [
    {
      id: 'parent-1',
      name: 'top-bar',
      layout: 'horizontal',
      members: ['tabs-1', 'icon-2', 'stat-3'],
    },
  ]

  test('空 rows 不改 sections', () => {
    const out = mergeInlineRowsIntoSections(baseLayout, [])
    expect(out.sections).toHaveLength(2)
  })

  test('同行兄弟合并为 horizontal block 的 children', () => {
    const out = mergeInlineRowsIntoSections(baseLayout, rows)
    const inlineBlock = out.sections.find((s) => s.id === 'parent-1')
    expect(inlineBlock).toBeDefined()
    expect(inlineBlock.layout).toBe('horizontal')
    // members 顺序保留（bbox 已是左→右序），figmaNode 指回原始节点 id
    expect(inlineBlock.children.map((c) => c.figmaNode)).toEqual(['tabs-1', 'icon-2', 'stat-3'])
    expect(inlineBlock.figmaNodeId).toBe('parent-1')
  })

  test('合并后原 sections 仍保留（不删业务区块）', () => {
    const out = mergeInlineRowsIntoSections(baseLayout, rows)
    const names = out.sections.map((s) => s.name)
    expect(names).toContain('当日总流量')
    expect(names).toContain('车型分布')
    expect(names).toContain('top-bar')
  })

  test('layoutSource 标记为 inline-row（可供下游优先采用）', () => {
    const out = mergeInlineRowsIntoSections(baseLayout, rows)
    const inlineBlock = out.sections.find((s) => s.id === 'parent-1')
    expect(inlineBlock.layoutSource).toBe('inline-row')
  })

  test('层级收敛（figmaData）：深层嵌套 frame 不污染顶层 sections', () => {
    // 复刻 device-monitor 真值：整棵树递归抽到 44 个 inline-row，但只有 3 个是真正顶层并行块。
    // parent-1 是组件根直接子（parentDepth=0）；nested-parent 被 row-2 作为成员引用，且自身也是行；
    // deep-row 是卡片内部并行（parentDepth=5），均应剔除。
    const figmaData = {
      document: {
        id: 'root',
        name: 'root',
        children: [
          { id: 'parent-1', name: 'header', children: [{ id: 'tabs-1' }, { id: 'icon-2' }, { id: 'stat-3' }] },
          {
            id: 'container',
            name: 'slot-con',
            children: [
              { id: 'row-2', name: 'switch', children: [{ id: 'a' }, { id: 'b' }] },
              { id: 'row-3', name: 'tab', children: [{ id: 'c' }, { id: 'd' }] },
            ],
          },
          {
            id: 'card',
            name: 'card',
            children: [
              {
                id: 'inner',
                name: 'inner',
                children: [
                  { id: 'deep-parent', name: 'icon', children: [{ id: 'deep-row', name: 'grp', children: [{ id: 'x' }, { id: 'y' }] }] },
                ],
              },
            ],
          },
        ],
      },
    }
    const deepRows = [
      { id: 'parent-1', name: 'header', layout: 'horizontal', members: ['tabs-1', 'icon-2', 'stat-3'] },
      { id: 'row-2', name: 'switch', layout: 'horizontal', members: ['a', 'b'] },
      { id: 'row-3', name: 'tab', layout: 'horizontal', members: ['c', 'd'] },
      // deep-parent 的 parent 是 inner（depth2）→ parentDepth>1，剔除
      { id: 'deep-parent', name: 'icon', layout: 'horizontal', members: ['deep-row'] },
      // deep-row 的 parent 是 deep-parent（本身是行）→ 嵌套，剔除
      { id: 'deep-row', name: 'grp', layout: 'horizontal', members: ['x', 'y'] },
    ]
    const out = mergeInlineRowsIntoSections(baseLayout, deepRows, figmaData)
    const kept = out.sections.filter((s) => s.layoutSource === 'inline-row').map((s) => s.id)
    expect(kept.sort()).toEqual(['parent-1', 'row-2', 'row-3'])
  })

  test('无 figmaData 时保持旧行为（不收敛，零回归）', () => {
    const manyRows = [
      { id: 'parent-1', name: 'top', layout: 'horizontal', members: ['a', 'b'] },
      { id: 'nested', name: 'nested', layout: 'horizontal', members: ['c', 'd'] },
    ]
    const out = mergeInlineRowsIntoSections(baseLayout, manyRows)
    const kept = out.sections.filter((s) => s.layoutSource === 'inline-row').map((s) => s.id)
    expect(kept.sort()).toEqual(['nested', 'parent-1'])
  })

  test('顺序治本（figmaData）：顶部 header 按 y 排最前，不被 append 到末尾', () => {
    // 复刻 device 症状：header(y=441, 顶部) + slot-con(y=475) + 业务语义壳(无 y)
    // 旧逻辑把 inline-row 一律 push 末尾 → header 落到业务 section 之后 =「头部插槽放到了下面」
    const figmaData = {
      document: {
        id: 'root',
        name: 'root',
        absoluteBoundingBox: { x: 0, y: 433, width: 420, height: 425 },
        children: [
          { id: 'header-row', name: 'header', absoluteBoundingBox: { x: 0, y: 441, width: 420, height: 30 }, children: [{ id: 'h1' }, { id: 'h2' }] },
          { id: 'slot-con', name: 'slot-con', absoluteBoundingBox: { x: 0, y: 475, width: 420, height: 380 }, children: [{ id: 's1' }, { id: 's2' }] },
        ],
      },
    }
    const layout = {
      type: 'vertical',
      sections: [
        { id: 'section-header-stats', name: '顶部统计指标栏' },
        { id: 'section-main-body', name: '主体内容区' },
      ],
    }
    const rows = [
      { id: 'header-row', name: 'header', layout: 'horizontal', members: ['h1', 'h2'] },
      { id: 'slot-con', name: 'slot-con', layout: 'horizontal', members: ['s1', 's2'] },
    ]
    const out = mergeInlineRowsIntoSections(layout, rows, figmaData)
    const ids = out.sections.map((s) => s.id)
    // header 必须在最前（y 最小），且在无 y 的业务语义壳之前
    expect(ids[0]).toBe('header-row')
    expect(ids.indexOf('header-row')).toBeLessThan(ids.indexOf('section-header-stats'))
    // slot-con(y=475) 在 header(y=441) 之后，且也在业务壳之前
    expect(ids.indexOf('header-row')).toBeLessThan(ids.indexOf('slot-con'))
    expect(ids.indexOf('slot-con')).toBeLessThan(ids.indexOf('section-header-stats'))
  })

  // 🛡️ 语义壳去重（2026-09-10 · env-monitor「两套 tabs / 两套 icons」实锤）
  // 几何行（89:42）覆盖了 Vision 拆出的语义壳（header-tabs / header-controls）时，
  // 语义壳必须被剔除，否则同一片 figma 区域会生成两个子组件 → 重复渲染。
  describe('语义壳被几何行覆盖时去重', () => {
    const figmaData = {
      document: {
        id: 'root',
        name: 'root',
        children: [
          {
            id: '89:42',
            name: 'sub-t',
            children: [
              {
                id: '2:7889',
                name: 'tabs-list',
                children: [
                  { id: '2:7890', name: 'bg', type: 'VECTOR' },
                  { id: '2:7892', name: 'TEXT', type: 'TEXT', characters: '一氧化碳' },
                  { id: '2:7893', name: 'TEXT', type: 'TEXT', characters: '洞内照明' },
                  { id: '2:7894', name: 'TEXT', type: 'TEXT', characters: '洞外光强' },
                  { id: '2:7897', name: 'TEXT', type: 'TEXT', characters: '能见度' },
                ],
              },
              {
                id: '89:43',
                name: 'tabs-icon',
                children: [
                  { id: '2:7941', name: 'icon', type: 'GROUP' },
                  { id: '2:7945', name: 'icon', type: 'GROUP' },
                ],
              },
            ],
          },
          {
            id: '2:7898',
            name: 'chart',
            children: [{ id: '2:7918', name: 'TEXT', type: 'TEXT', characters: '40 30 20 10 0' }],
          },
        ],
      },
    }
    const rows = [
      { id: '89:42', name: 'sub-t', layout: 'horizontal', members: ['2:7889', '89:43'] },
    ]
    const layoutWithShells = {
      type: 'vertical',
      sections: [
        {
          id: 'header-tabs',
          name: 'Tab切换栏',
          body: {
            layout: 'horizontal',
            children: [
              { id: 'tab-1', name: '一氧化碳' },
              { id: 'tab-2', name: '能见度' },
              { id: 'tab-3', name: '洞内照明' },
              { id: 'tab-4', name: '洞外光强' },
            ],
          },
        },
        {
          id: 'header-controls',
          name: '头部控件组',
          body: {
            layout: 'horizontal',
            children: [
              { id: 'chart-icon', name: '图表图标', resourceFile: '../resources/images/icon-7941.png' },
              { id: 'export-icon', name: '导出图标', resourceFile: '../resources/images/icon-7941.png' },
              { id: 'badge', name: '通知角标' },
            ],
          },
        },
        {
          id: 'chart-section',
          name: '图表展示区',
          body: {
            layout: 'vertical',
            children: [
              { id: 'x-2', name: 'X轴刻度2' },
              { id: 'x-4', name: 'X轴刻度4' },
              { id: 'x-unit', name: 'X轴单位' },
            ],
          },
        },
      ],
    }

    test('文案命中：header-tabs 被剔除（不被覆盖部分低于阈值不影响）', () => {
      const out = mergeInlineRowsIntoSections(layoutWithShells, rows, figmaData)
      expect(out.sections.some((s) => s.id === 'header-tabs')).toBe(false)
    })

    test('资源尾号命中：header-controls 被剔除（icon-7941 ∈ 89:42 子树）', () => {
      const out = mergeInlineRowsIntoSections(layoutWithShells, rows, figmaData)
      expect(out.sections.some((s) => s.id === 'header-controls')).toBe(false)
    })

    test('无命中：chart-section 保留（不得误删真实业务区块）', () => {
      const out = mergeInlineRowsIntoSections(layoutWithShells, rows, figmaData)
      expect(out.sections.some((s) => s.id === 'chart-section')).toBe(true)
    })

    test('几何行本身保留（去重只针对语义壳）', () => {
      const out = mergeInlineRowsIntoSections(layoutWithShells, rows, figmaData)
      const geo = out.sections.find((s) => s.id === '89:42')
      expect(geo).toBeDefined()
      expect(geo.layoutSource).toBe('inline-row')
    })

    test('命中率低于阈值（1/3）不剔除', () => {
      const layoutLow = {
        type: 'vertical',
        sections: [
          {
            id: 'low-coverage',
            name: '低覆盖区',
            body: {
              layout: 'vertical',
              children: [
                { id: 'c1', name: '能见度' },
                { id: 'c2', name: '无关甲' },
                { id: 'c3', name: '无关乙' },
              ],
            },
          },
        ],
      }
      const out = mergeInlineRowsIntoSections(layoutLow, rows, figmaData)
      expect(out.sections.some((s) => s.id === 'low-coverage')).toBe(true)
    })

    test('无 figmaData 时不做去重（零回归）', () => {
      const out = mergeInlineRowsIntoSections(layoutWithShells, rows)
      expect(out.sections.some((s) => s.id === 'header-tabs')).toBe(true)
    })
  })

  // 覆盖率根因（2026-09-11 · env-monitor 10% 实锤）：inline-row 子节点 name 之前只写节点号，
  // 覆盖率把 tab 文案判 missing → 虚低。治本：name 用 member 子树文案拼接。
  describe('inline-row 子节点 name 用子树文案（非节点号）', () => {
    const figmaData = {
      document: {
        id: 'root',
        children: [
          {
            id: '89:42',
            name: 'sub-t',
            children: [
              {
                id: '2:7889',
                name: 'tabs-list',
                children: [
                  { id: '2:7892', name: 'TEXT', type: 'TEXT', characters: '一氧化碳' },
                  { id: '2:7893', name: 'TEXT', type: 'TEXT', characters: '洞内照明' },
                ],
              },
              { id: '89:43', name: 'tabs-icon', children: [] },
            ],
          },
        ],
      },
    }
    const rows = [{ id: '89:42', name: 'sub-t', layout: 'horizontal', members: ['2:7889', '89:43'] }]

    test('member 子树有文案 → name = 拼接文案（覆盖率可子串命中）', () => {
      const out = mergeInlineRowsIntoSections({ type: 'vertical', sections: [] }, rows, figmaData)
      const block = out.sections.find((s) => s.id === '89:42')
      const first = block.children.find((c) => c.figmaNode === '2:7889')
      expect(first.name).toBe('一氧化碳洞内照明')
    })

    test('member 子树无文案 → 回退节点号（保持原行为）', () => {
      const out = mergeInlineRowsIntoSections({ type: 'vertical', sections: [] }, rows, figmaData)
      const block = out.sections.find((s) => s.id === '89:42')
      const icon = block.children.find((c) => c.figmaNode === '89:43')
      expect(icon.name).toBe('89:43')
    })

    test('无 figmaData → 回退节点号（零回归）', () => {
      const out = mergeInlineRowsIntoSections({ type: 'vertical', sections: [] }, rows)
      const block = out.sections.find((s) => s.id === '89:42')
      expect(block.children.map((c) => c.name)).toEqual(['2:7889', '89:43'])
    })
  })

  // ─────────────────────────────────────────────────────────────
  // 🛡️ 治本（2026-09-11 · mc-max-1789097821000-c6194696 设备监测实锤）
  // 重复 tabs 根因：语义壳 section-main（figmaNode=null）的直接子元素是「左侧竖向Tab切换栏/
  // 右侧内容区」纯语义名，无可匹配 token；但深层 tab 项的 name（监控/照明…）能命中几何行
  // 89:37 子树的 characters。旧 childCoveredByEvidence 不递归 → 去重失效 → 两套 tabs。
  // 治本：递归语义壳子元素，收集后代 name/text/label + resourceFile 尾号与几何行子树证据比对。
  // ─────────────────────────────────────────────────────────────
  describe('语义壳深层子元素递归去重（重复 tabs 根治）', () => {
    // 复刻设备监测真值：89:37 几何行子树含 tabs(TEXT characters=监控/照明/摄像机) + cons
    const figmaData = {
      document: {
        id: 'root',
        name: 'cp-设备监测',
        children: [
          {
            id: '89:37',
            name: '@antd/tab',
            children: [
              {
                id: '89:39',
                name: 'tabs',
                children: [
                  { id: '2:8827', name: 't-监控', type: 'TEXT', characters: '监控' },
                  { id: '2:8832', name: 'd-照明', type: 'TEXT', characters: '照明' },
                ],
              },
              {
                id: '2:8437',
                name: 'cons',
                children: [
                  { id: '2:8439', name: '摄像机', type: 'TEXT', characters: '摄像机' },
                ],
              },
            ],
          },
        ],
      },
    }
    const rows = [{ id: '89:37', name: '@antd/tab', layout: 'horizontal', members: ['89:39', '2:8437'] }]

    // 语义壳：直接子元素无 token，但深层 tab 项 name 能命中几何行子树 characters
    const layoutWithDeepShell = {
      type: 'vertical',
      sections: [
        {
          id: 'section-main',
          name: '主内容区',
          body: {
            layout: 'horizontal',
            children: [
              {
                id: 'section-left-tabs',
                name: '左侧竖向Tab切换栏',
                children: [
                  { id: 'tab-monitor', name: '监控', active: true },
                  { id: 'tab-lighting', name: '照明', active: false },
                ],
              },
              {
                id: 'section-right-content',
                name: '右侧内容区',
                children: [{ id: 'dev-1', name: '摄像机' }],
              },
            ],
          },
        },
      ],
    }

    test('深层 tab 项 name 命中几何行子树 → section-main 被剔除（根治重复 tabs）', () => {
      const out = mergeInlineRowsIntoSections(layoutWithDeepShell, rows, figmaData)
      expect(out.sections.some((s) => s.id === 'section-main')).toBe(false)
    })

    test('几何行本身保留（去重只针对语义壳）', () => {
      const out = mergeInlineRowsIntoSections(layoutWithDeepShell, rows, figmaData)
      expect(out.sections.some((s) => s.id === '89:37')).toBe(true)
    })

    test('深层子元素不命中几何行 → 语义壳保留（不误删真实区块）', () => {
      const unrelated = {
        type: 'vertical',
        sections: [
          {
            id: 'section-footer',
            name: '底部信息区',
            body: {
              layout: 'vertical',
              children: [
                {
                  id: 'footer-1',
                  name: '版权说明',
                  children: [{ id: 'f1', name: '沪ICP备' }],
                },
              ],
            },
          },
        ],
      }
      const out = mergeInlineRowsIntoSections(unrelated, rows, figmaData)
      expect(out.sections.some((s) => s.id === 'section-footer')).toBe(true)
    })

    test('无 figmaData → 不做去重（零回归）', () => {
      const out = mergeInlineRowsIntoSections(layoutWithDeepShell, rows)
      expect(out.sections.some((s) => s.id === 'section-main')).toBe(true)
    })
  })
})
