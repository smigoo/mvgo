/**
 * 🛡️ #78 技术栈接管单测（S2 语义收编 + S3 内容抽取）。
 *
 * 真机基线：mc-max-1790830432735-07a812f7 —— `@antd/table`（210:45641，575×173）被
 * 拆成 3 个列容器叶子 ⇒ LLM 手写假表格（a-table 0 次）。S2 直接命中吸收 + S3 契约
 * （3 列 70/254/254 × 表头+3 行 44px，第一列 radio = rowSelection）。
 * 几何坐标镜像真值（table y=20，单元格 44px 高）。
 */
import {
  extractTableContract,
  enrichSectionsWithTechStack,
} from './techstack-section-contract.js'
import {
  collectTechStackMarkerNodes,
  collectTechStackMarkers,
  techStackTagHint,
} from '../validators/element-coverage-validator.js'
import { formatSectionTreeForPrompt } from './section-tree.js'

// ESM logger 依赖（jest CJS 转译下 import.meta 冲突）—— 照 json-parser.spec 约定 virtual mock
jest.mock('../../config/backend-root.js', () => ({ workspaceRoot: process.cwd(), logsDir: '/tmp/mvgo-test-logs' }), { virtual: true })

const box = (x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h })
const hex = (r: number, g: number, b: number) => ({ r: r / 255, g: g / 255, b: b / 255 })
const fill = (r: number, g: number, b: number) => [{ type: 'SOLID', visible: true, color: hex(r, g, b) }]
const text = (id: string, chars: string, x: number, y: number, opts: any = {}) => ({
  id,
  name: chars,
  type: 'TEXT',
  characters: chars,
  absoluteBoundingBox: box(x, y, 28, 21),
  ...(opts.style ? { style: opts.style } : {}),
  ...(opts.fills ? { fills: opts.fills } : {}),
})
/** P3-15 样式真值（07a812f7 取证）：表头 14px/500/#000 底 #eef2fb；正文 14px/400/#333 底 #fff/#f6f9ff 交替；边框 #dbe1e6 */
const HEADER_STYLE = { fontSize: 14, fontWeight: 500, textAlignHorizontal: 'CENTER', lineHeightPx: 21 }
const BODY_STYLE = { fontSize: 14, fontWeight: 400, textAlignHorizontal: 'CENTER', lineHeightPx: 21 }
const headerCell = (id: string, chars: string, x: number, y: number, w: number) => ({
  id,
  name: chars,
  type: 'FRAME',
  absoluteBoundingBox: box(x, y, w, 44),
  fills: fill(238, 242, 251), // #eef2fb
  strokes: fill(219, 225, 230), // #dbe1e6
  children: [text(id + '-t', chars, x + 5, y + 12, { style: HEADER_STYLE, fills: fill(0, 0, 0) })],
})
const bodyCell = (id: string, chars: string, x: number, y: number, w: number, zebra: boolean, extra: any[] = []) => ({
  id,
  name: chars,
  type: 'FRAME',
  absoluteBoundingBox: box(x, y, w, 44),
  fills: fill(...(zebra ? [246, 249, 255] : [255, 255, 255])), // #f6f9ff / #ffffff
  strokes: fill(219, 225, 230),
  children: [...extra, text(id + '-t', chars, x + 5, y + 12, { style: BODY_STYLE, fills: fill(51, 51, 51) })],
})

/** 07a812f7 真值形态：3 列 × 4 单元格，第一列数据行含 radio（Ellipse 无文本） */
const radio = (id: string, x: number, y: number, name = '@antd/radio') => ({
  id,
  name,
  type: 'GROUP',
  absoluteBoundingBox: box(x, y, 12, 12),
  children: [
    { id: `${id}-a`, name: 'Ellipse', type: 'ELLIPSE', absoluteBoundingBox: box(x, y, 12, 12) },
  ],
})

const figma = () => ({
  id: 'root',
  name: 'cp-选择登录用户',
  type: 'FRAME',
  absoluteBoundingBox: box(0, 0, 575, 389),
  children: [
    {
      id: '210:45499',
      name: '@antd/button',
      type: 'FRAME',
      absoluteBoundingBox: box(258, 250, 60, 40), // 真值：con 内水平居中（左 258/右 257），与表格间距 57px
      fills: fill(57, 101, 255), // #3965ff
      cornerRadius: 4,
      children: [text('210:45500', '保存', 510, 223, { style: BODY_STYLE, fills: fill(255, 255, 255) })],
    },
    {
      id: '210:45641',
      name: '@antd/table',
      type: 'FRAME',
      layoutMode: 'HORIZONTAL',
      absoluteBoundingBox: box(0, 20, 575, 173),
      children: [
        {
          id: '210:45642',
          name: 'Frame 列1',
          type: 'FRAME',
          absoluteBoundingBox: box(0, 20, 70, 173),
          children: [
            headerCell('210:45643', '姓名', 0, 20, 70),
            bodyCell('210:45646', '张斌', 0, 64, 70, false, [radio('210:45918', 5, 80)]),
            bodyCell('210:45649', '张斌', 0, 108, 70, true, [radio('210:45925', 5, 124, 'Group 2136638408')]),
            bodyCell('210:45652', '张斌', 0, 152, 70, false),
          ],
        },
        {
          id: '210:45676',
          name: 'Frame 列2',
          type: 'FRAME',
          absoluteBoundingBox: box(70, 20, 254, 173),
          children: [
            headerCell('210:45677', '单位', 70, 20, 254),
            bodyCell('210:45679', '江苏交控/宁沪公司', 70, 64, 254, false),
            bodyCell('210:45681', '江苏交控/通行宝公司', 70, 108, 254, true),
            bodyCell('210:45683', '江苏交控/的高速', 70, 152, 254, false),
          ],
        },
        {
          id: '210:45699',
          name: 'Frame 列3',
          type: 'FRAME',
          absoluteBoundingBox: box(324, 20, 254, 173),
          children: [
            headerCell('210:45700', '所属租户', 324, 20, 254),
            bodyCell('210:45702', '江苏联网租户', 324, 64, 254, false),
            bodyCell('210:45704', '江苏联网租户', 324, 108, 254, true),
            bodyCell('210:45706', '高管中心租户', 324, 152, 254, false),
          ],
        },
      ],
    },
  ],
})

describe('extractTableContract（S3 内容抽取）', () => {
  it('07a812f7 真值形态：3 列（title/width/dataIndex）+ 3 行 + rowSelection', () => {
    const tree: any = figma()
    const table = tree.children.find((n: any) => n.id === '210:45641')
    const c = extractTableContract(table)
    expect(c).not.toBeNull()
    expect(c.kind).toBe('table')
    expect(c.columnCount).toBe(3)
    expect(c.rowCount).toBe(4)
    expect(c.columns).toEqual([
      { title: '姓名', dataIndex: 'field1', width: 70 },
      { title: '单位', dataIndex: 'field2', width: 254 },
      { title: '所属租户', dataIndex: 'field3', width: 254 },
    ])
    expect(c.rowSelection).toBe(true)
    expect(c.dataSource).toEqual([
      { field1: '张斌', field2: '江苏交控/宁沪公司', field3: '江苏联网租户' },
      { field1: '张斌', field2: '江苏交控/通行宝公司', field3: '江苏联网租户' },
      { field1: '张斌', field2: '江苏交控/的高速', field3: '高管中心租户' },
    ])
  })

  it('fail-open：单列 / 缺 bbox / 全空文本 → null（不得产出空表契约）', () => {
    const tree: any = figma()
    const table = tree.children.find((n: any) => n.id === '210:45641')
    expect(extractTableContract({ ...table, children: table.children.slice(0, 1) })).toBeNull()
    const noBox = { ...table, children: table.children.map((c: any) => ({ ...c, absoluteBoundingBox: undefined })) }
    expect(extractTableContract(noBox)).toBeNull()
    const empty = {
      id: 't',
      name: '@antd/table',
      type: 'FRAME',
      absoluteBoundingBox: box(0, 0, 100, 100),
      children: [
        { id: 'a', name: 'col1', type: 'FRAME', absoluteBoundingBox: box(0, 0, 50, 100), children: [{ id: 'a1', name: 'F', type: 'FRAME', absoluteBoundingBox: box(0, 0, 50, 50), children: [] }, { id: 'a2', name: 'F', type: 'FRAME', absoluteBoundingBox: box(0, 50, 50, 50), children: [] }] },
        { id: 'b', name: 'col2', type: 'FRAME', absoluteBoundingBox: box(50, 0, 50, 100), children: [{ id: 'b1', name: 'F', type: 'FRAME', absoluteBoundingBox: box(50, 0, 50, 50), children: [] }, { id: 'b2', name: 'F', type: 'FRAME', absoluteBoundingBox: box(50, 50, 50, 50), children: [] }] },
      ],
    }
    expect(extractTableContract(empty)).toBeNull()
  })

  it('P3-15 style 段：表头底色/斑马纹/行高/边框/对齐/字色 全部真值还原', () => {
    const tree: any = figma()
    const table = tree.children.find((n: any) => n.id === '210:45641')
    const c: any = extractTableContract(table)
    expect(c.style).toEqual({
      headerBg: '#eef2fb',
      headerFontWeight: 500,
      cellBg: '#ffffff',
      zebraBg: '#f6f9ff',
      zebraRows: [2],
      rowHeight: 44,
      borderColor: '#dbe1e6',
      align: 'center',
      textColor: '#333333',
    })
  })

  it('P3-15 style fail-open：表头色列间不一致 → 不臆造（键删除）', () => {
    const tree: any = figma()
    const table = tree.children.find((n: any) => n.id === '210:45641')
    table.children[1].children[0].fills = [{ type: 'SOLID', visible: true, color: hex(250, 250, 250) }]
    const c: any = extractTableContract(table)
    expect(c.style.headerBg).toBeUndefined()
    // 其余键不受影响
    expect(c.style.zebraBg).toBe('#f6f9ff')
  })
})

describe('enrichSectionsWithTechStack（S2 语义收编）', () => {
  it('直接命中吸收：table 容器 → 单一 techstack 叶子 + 契约', () => {
    const sections: any[] = [
      {
        id: '210:45641',
        name: '@antd/table',
        type: 'container',
        isLayoutContainer: true,
        layoutSource: 'container-rebuild',
        absoluteBoundingBox: box(0, 20, 575, 173),
        sourceNodeIds: ['210:45641', '210:45642', '210:45676', '210:45699'],
        children: [
          { id: '210:45642', type: 'leaf', absoluteBoundingBox: box(0, 20, 70, 173), sourceNodeIds: [] },
          { id: '210:45676', type: 'leaf', absoluteBoundingBox: box(70, 20, 254, 173), sourceNodeIds: [] },
          { id: '210:45699', type: 'leaf', absoluteBoundingBox: box(324, 20, 254, 173), sourceNodeIds: [] },
        ],
      },
    ]
    const stats = enrichSectionsWithTechStack(sections, figma())
    expect(stats.enriched).toBe(1)
    expect(stats.absorbed).toBe(1)
    const sec = sections[0]
    expect(sec.children).toEqual([])
    expect(sec.isLayoutContainer).toBe(false)
    expect(sec.layoutSource).toBe('techstack-leaf')
    expect(sec.type).toBe('techstack')
    expect(sec.techStack.tag).toBe('a-table')
    expect(sec.techStack.via).toBe('direct')
    expect(sec.techStack.contract.columnCount).toBe(3)
    expect(sec.techStack.contract.rowSelection).toBe(true)
  })

  it('最小归属：外层容器（子树全集 sourceNodeIds）不抢内层已认领标记', () => {
    const sections: any[] = [
      {
        id: '272:2',
        name: 'con',
        type: 'container',
        isLayoutContainer: true,
        layoutSource: 'container-rebuild',
        absoluteBoundingBox: box(0, 0, 575, 200),
        sourceNodeIds: ['272:2', '210:45641', '210:45642', '210:45676', '210:45699'],
        children: [
          {
            id: '210:45641',
            name: '@antd/table',
            type: 'container',
            isLayoutContainer: true,
            layoutSource: 'container-rebuild',
            absoluteBoundingBox: box(0, 20, 575, 173),
            sourceNodeIds: ['210:45641', '210:45642'],
            children: [],
          },
        ],
      },
    ]
    const stats = enrichSectionsWithTechStack(sections, figma())
    // 只有内层 210:45641 认领；外层 con 不被误标「位于 table 内部」
    expect(sections[0].techStack).toBeUndefined()
    expect(sections[0].children[0].techStack?.via).toBe('direct')
    expect(stats.enriched).toBe(1)
  })

  it('祖先链标注：table 无自己 section 时，内部叶子挂 via=ancestor-chain；外层父容器几何门拒绝', () => {
    const sections: any[] = [
      {
        id: '272:2',
        name: 'con',
        type: 'container',
        isLayoutContainer: true,
        absoluteBoundingBox: box(0, 0, 575, 200),
        sourceNodeIds: ['272:2', '210:45642'],
        children: [
          {
            id: '210:45642',
            name: 'Frame 列1',
            type: 'leaf',
            absoluteBoundingBox: box(0, 20, 70, 173),
            sourceNodeIds: ['210:45642', '210:45645'],
          },
        ],
      },
    ]
    const stats = enrichSectionsWithTechStack(sections, figma())
    // 叶子（bbox 在 table 内）→ 祖先链标注 + 契约
    const leaf = sections[0].children[0]
    expect(leaf.techStack?.via).toBe('ancestor-chain')
    expect(leaf.techStack?.tag).toBe('a-table')
    expect(leaf.techStack?.contract?.columnCount).toBe(3)
    // 外层 con（bbox 包含 table，中心在外）→ 不标注
    expect(sections[0].techStack).toBeUndefined()
    expect(stats.ancestorTagged).toBe(1)
  })

  it('自绘容器/未知组件不接管：@antd/tab 与 @antd/button 原样保留', () => {
    const tree: any = figma()
    tree.children[0].name = '@antd/tab' // button → tab（自绘容器）
    const sections: any[] = [
      { id: '210:45499', name: '@antd/tab', type: 'container', isLayoutContainer: true, absoluteBoundingBox: box(500, 0, 60, 40), sourceNodeIds: ['210:45499'], children: [{ id: 'k', type: 'leaf' }] },
    ]
    const stats = enrichSectionsWithTechStack(sections, tree)
    expect(stats.enriched).toBe(0)
    expect(stats.absorbed).toBe(0)
    expect(sections[0].children).toHaveLength(1)
  })

  it('风险纪律：table 契约抽取失败 → 不挂标签、不吸收（fail-open 维持拆列现状）', () => {
    const tree: any = figma()
    const table = tree.children.find((n: any) => n.id === '210:45641')
    table.children = table.children.slice(0, 1) // 破坏成单列 ⇒ 契约 null
    const sections: any[] = [
      {
        id: '210:45641',
        name: '@antd/table',
        type: 'container',
        isLayoutContainer: true,
        absoluteBoundingBox: box(0, 20, 575, 173),
        sourceNodeIds: ['210:45641'],
        children: [{ id: '210:45642', type: 'leaf' }],
      },
    ]
    const stats = enrichSectionsWithTechStack(sections, tree)
    expect(stats.enriched).toBe(0)
    expect(stats.absorbed).toBe(0)
    expect(sections[0].techStack).toBeUndefined()
    expect(sections[0].children).toHaveLength(1)
  })

  it('P3-15b 孤儿标记重建：保存按钮（无自己 section）插入父容器 children，视觉序按真值 y', () => {
    const tree: any = figma()
    // 按钮的 figma 父须与宿主容器 section 同 id（真值：按钮父 = slot-con 272:2）
    tree.children = [
      {
        id: '272:2',
        name: 'slot-con',
        type: 'GROUP',
        absoluteBoundingBox: box(0, 0, 575, 300),
        children: [...tree.children],
      },
    ]
    const sections: any[] = [
      {
        id: '272:2',
        name: 'con',
        type: 'container',
        isLayoutContainer: true,
        layoutSource: 'container-rebuild',
        absoluteBoundingBox: box(0, 0, 575, 300),
        children: [
          // table section（吸收后 children 清空、bbox 缺失 ⇒ 排序须回查真值树）
          {
            id: '210:45641',
            name: '@antd/table',
            type: 'techstack',
            isLayoutContainer: false,
            layoutSource: 'techstack-leaf',
          },
        ],
      },
    ]
    const stats = enrichSectionsWithTechStack(sections, tree)
    expect(stats.orphanRebuilt).toBe(1)
    const kids = sections[0].children
    expect(kids.map((k: any) => k.id)).toEqual(['210:45641', '210:45499']) // 表格(上) → 按钮(下)
    const btn = kids[1]
    expect(btn.techStack.via).toBe('orphan-rebuild')
    expect(btn.techStack.tag).toBe('a-button')
    expect(btn.techStack.contract.kind).toBe('button')
    expect(btn.techStack.contract.text).toBe('保存')
    // 🛡️ P3-15d：按钮真值居中（父 272:2 宽 575，按钮中心偏差 0）+ 与表格间距 57px
    expect(btn.techStack.contract.style).toMatchObject({
      background: '#3965ff',
      borderRadius: 4,
      width: 60,
      height: 40,
      textColor: '#ffffff',
      align: 'center',
      marginTop: 57,
    })
    expect(btn.isLayoutContainer).toBe(false)
    expect(btn.type).toBe('techstack')
  })

  it('P3-15d 表格宽度事实：表格宽 = 父容器宽 ⇒ fullWidth=true', () => {
    const tree: any = figma()
    // 表格的 figma 父须与容器 section 同 id（真值：table 父 = slot-con 272:2，宽 575 = 表宽 575）
    tree.children = [
      {
        id: '272:2',
        name: 'slot-con',
        type: 'GROUP',
        absoluteBoundingBox: box(0, 0, 575, 300),
        children: [...tree.children],
      },
    ]
    const sections: any[] = [
      {
        id: '272:2',
        name: 'con',
        type: 'container',
        isLayoutContainer: true,
        layoutSource: 'container-rebuild',
        children: [
          // table section 直接命中（id = 标记 id），吸收后校验宽度事实
          { id: '210:45641', name: '@antd/table', type: 'container', isLayoutContainer: true, children: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }] },
        ],
      },
    ]
    enrichSectionsWithTechStack(sections, tree)
    const sec: any = sections[0].children[0]
    expect(sec.techStack.via).toBe('direct')
    expect(sec.techStack.contract.style.fullWidth).toBe(true)
    expect(sec.techStack.contract.style.width).toBe(575)
  })
})

describe('标记收集与标签提示', () => {
  it('collectTechStackMarkerNodes 不去重 / collectTechStackMarkers 去重', () => {
    const tree: any = figma()
    tree.children.push({
      id: '210:46000',
      name: '@antd/button',
      type: 'FRAME',
      absoluteBoundingBox: box(0, 0, 60, 40),
      children: [],
    })
    const all = collectTechStackMarkerNodes(tree)
    expect(all.filter((m) => m.component === 'button')).toHaveLength(2)
    const dedup = collectTechStackMarkers(tree)
    expect(dedup.filter((m) => m.component === 'button')).toHaveLength(1)
  })

  it('techStackTagHint：antd/table → a-table；图表库 / 未知库 → null', () => {
    expect(techStackTagHint({ library: 'antd', component: 'table' })).toBe('a-table')
    expect(techStackTagHint({ library: 'element-plus', component: 'select' })).toBe('el-select')
    expect(techStackTagHint({ library: 'echarts', component: 'bar' })).toBeNull()
    expect(techStackTagHint({ library: 'unknown-lib', component: 'grid' })).toBeNull()
  })
})

describe('P3-15 prompt 渲染（formatSectionTreeForPrompt）', () => {
  it('表格样式契约块：斑马纹/表头底色/:deep 白名单 全部下发', () => {
    const sections: any[] = [
      {
        id: '210:45641',
        name: '@antd/table',
        type: 'techstack',
        responsibility: '技术栈接管：@antd/table 区域',
        children: [],
        techStack: {
          library: 'antd',
          component: 'table',
          nodeId: '210:45641',
          tag: 'a-table',
          via: 'direct',
          contract: {
            kind: 'table',
            columns: [
              { title: '姓名', dataIndex: 'field1', width: 70 },
              { title: '单位', dataIndex: 'field2', width: 254 },
            ],
            dataSource: [{ field1: '张斌', field2: '江苏交控' }],
            rowSelection: true,
            columnCount: 2,
            rowCount: 2,
            style: {
              headerBg: '#eef2fb',
              headerFontWeight: 500,
              cellBg: '#ffffff',
              zebraBg: '#f6f9ff',
              zebraRows: [2],
              rowHeight: 44,
              borderColor: '#dbe1e6',
              align: 'center',
              textColor: '#333333',
              fullWidth: true,
              width: 575,
            },
          },
        },
      },
    ]
    const out = formatSectionTreeForPrompt(sections)
    expect(out).toContain('表格样式契约（Figma 真值色值，逐条还原）')
    expect(out).toContain('数据行高 44px')
    expect(out).toContain('表头底色 #eef2fb')
    expect(out).toContain('唯一允许的 :deep 白名单')
    expect(out).toContain('斑马纹方向 = 横向（按数据**行**交替，整行同色）')
    expect(out).toContain('禁止纵向/按列斑马')
    expect(out).toContain('数据第 2 行底色 #f6f9ff')
    expect(out).toContain(':row-class-name')
    // P3-15d：宽度 + radio 同格 + hairline；P3-15e：禁臆造交互 + 按钮文案直接内容
    expect(out).toContain('表格**撑满父容器**')
    expect(out).toContain('**不用 rowSelection prop**')
    expect(out).toContain('radio 与第一列文本**同格**')
    expect(out).toContain('极淡 hairline（真值色 #dbe1e6')
    expect(out).toContain('只渲染表格本身')
    expect(out).toContain('禁止在表格上方/下方添加设计中不存在的 tab 切换、按钮组')
    expect(out).toContain('极淡 hairline（真值色 #dbe1e6')
    expect(out).toContain('radio 与第一列文本**同格**')
  })

  it('控件契约块：按钮外观真值（#3965ff/圆角/尺寸）+ 禁手画', () => {
    const sections: any[] = [
      {
        id: '210:45499',
        name: '@antd/button',
        type: 'techstack',
        children: [],
        techStack: {
          library: 'antd',
          component: 'button',
          nodeId: '210:45499',
          tag: 'a-button',
          via: 'orphan-rebuild',
          contract: {
            kind: 'button',
            tag: 'a-button',
            text: '保存',
            style: { background: '#3965ff', borderRadius: 4, width: 60, height: 40, fontSize: 14, textColor: '#ffffff' },
          },
        },
      },
    ]
    const out = formatSectionTreeForPrompt(sections)
    expect(out).toContain('控件契约（确定性事实，禁止改写）')
    expect(out).toContain('文案「保存」必须作为 <a-button> 的**直接内容**')
    expect(out).toContain('禁止留空标签/空 span 占位')
    expect(out).toContain('底色 #3965ff')
    expect(out).toContain('圆角 4px')
    expect(out).toContain('禁止 :deep 穿透控件内部，禁止手画')
  })
})
