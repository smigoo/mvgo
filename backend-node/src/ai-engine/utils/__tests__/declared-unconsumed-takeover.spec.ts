/**
 * R6（2026-11-02 · mc-max-1793601903166-9e078c6a「合作厂商弹窗」复跑实锤）：
 * 接管形态 vs 段声明**内容对账** —— 命中形态（header/icon）消费不了段 `body.children`
 * 声明的内容 ⇒ 拒接管、回退 LLM、计 `declaredUnconsumed`。
 *
 * 病灶：vision 在 plan 里**一字不差**声明了厂商段 6/12/15 个 pill（`华为技术 8台`…）和
 * 统计段 2 张卡，但 header 形态只渲染 1 标题、icon 形态只渲染 1 图标 —— 声明内容被
 * 确定性丢弃、零告警、不回退 LLM。与 R3 的区别：本判据治「消费量 ≪ 声明量」，
 * kids 无 figma id（refs=∅）时 R3 天然盲区。
 *
 * 对照设计（防假绿）：
 *   ① 阳性：厂商段复刻（6 个带文本 pill + Figma 树标题/图标齐备，header 本会命中）⇒ 拒
 *   ② 阳性：统计段复刻（2 张卡 item，icon 本会命中）⇒ 拒
 *   ③ 阴性：真标题行段（声明 1 个带文本 item）⇒ header 照常命中（判据不是恒拒）
 *   ④ 阴性：无声明 kids 的段 ⇒ 逐字不变（fail-open）
 *   ⑤ 计数行：`declaredUnconsumed` 恒在（0 也打），REJECT-SUMMARY 串可见
 */
import {
  collectFoldedGridTakeover,
  detectHeaderRowLeaf,
  detectIconLeaf,
} from '../folded-grid-section-takeover.js';
import { indexFigmaNodes } from '../section-tree.js';
import { pickTakeoverAudit, formatTakeoverAuditLine } from '../reject-summary.js';

const box = (x, y, w, h) => ({ x, y, width: w, height: h });
const bbox = (x, y, w, h) => ({ absoluteBoundingBox: box(x, y, w, h) });

/** Figma 真值：厂商组 38:3137（标题 TEXT + 图标 VECTOR + pill 行组），邻组 38:3162 */
function makeFigma() {
  return {
    document: {
      id: '1:1',
      name: 'root',
      type: 'FRAME',
      children: [
        {
          id: '9:9',
          name: 'container',
          type: 'GROUP',
          ...bbox(0, 0, 604, 787),
          children: [
            {
              id: '38:3137',
              name: 'vendor-strategy',
              type: 'GROUP',
              ...bbox(0, 0, 604, 120),
              children: [
                { id: '38:3140', name: 'icon', type: 'VECTOR', ...bbox(8, 8, 16, 16), children: [] },
                { id: '38:3141', name: 'title', type: 'TEXT', characters: '战略合作厂商', ...bbox(30, 8, 100, 16), fills: [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 }, opacity: 1 }], style: { fontFamily: 'PingFang SC', fontWeight: 500, fontSize: 16 }, children: [] },
                { id: '38:3142', name: 'pill-row-1', type: 'GROUP', ...bbox(8, 40, 580, 30), children: [] },
                { id: '38:3143', name: 'pill-row-2', type: 'GROUP', ...bbox(8, 80, 580, 30), children: [] },
              ],
            },
            {
              id: '38:3260',
              name: 'stat-card-1',
              type: 'GROUP',
              ...bbox(0, 130, 265, 76),
              children: [
                { id: '38:3261', name: 'bg', type: 'RECTANGLE', ...bbox(0, 130, 265, 76), children: [] },
                { id: '187:262', name: 'icon', type: 'VECTOR', ...bbox(10, 140, 53, 55), children: [] },
              ],
            },
            {
              id: '38:3282',
              name: 'stat-card-2',
              type: 'GROUP',
              ...bbox(270, 130, 265, 76),
              children: [
                { id: '38:3283', name: 'bg', type: 'RECTANGLE', ...bbox(270, 130, 265, 76), children: [] },
                { id: '38:3284', name: 'icon', type: 'VECTOR', ...bbox(280, 140, 53, 55), children: [] },
              ],
            },
          ],
        },
      ],
    },
  }
}

const MAPPING = [
  { figmaNodeId: '38:3140', resourceFile: 'resources/images/icon-title.png', downloadStatus: 'ok', assignedVarName: 'iconTitle' },
  { figmaNodeId: '187:262', resourceFile: 'resources/images/icon-stat.png', downloadStatus: 'ok', assignedVarName: 'iconStat' },
]

/** 9e078c6a 厂商段复刻：vision 声明 6 个带文本 pill（无 figma id —— R3 refs 盲区形态） */
function vendorSection() {
  return {
    id: '38:3137',
    name: '战略合作厂商',
    body: {
      children: [
        { text: '华为技术 8台' },
        { text: '中兴通讯 8台' },
        { text: '海康威视 13台' },
        { text: '新华三集团 1台' },
        { text: '浪潮信息 0台' },
        { text: '天地伟业 0台' },
      ],
    },
  }
}

/** 9e078c6a 统计段复刻：2 张卡 item（带 figma id；sourceNodeIds = R1 归属产物形态——kids figma id 入归属，两卡皆锚） */
function statsSection() {
  return {
    id: '38:3260',
    name: '统计区',
    sourceNodeIds: ['38:3260', '38:3282'],
    body: {
      children: [
        { id: '38:3260', name: '合作厂商', role: 'stat-card' },
        { id: '38:3282', name: '在线设备', role: 'stat-card' },
      ],
    },
  }
}

function index() {
  return indexFigmaNodes(makeFigma().document)
}

describe('R6 接管形态 vs 段声明内容对账', () => {
  test('🔴 阳性（9e078c6a 厂商段复刻）：header 本会命中，6 个声明 pill 只消费 1 标题 ⇒ 拒', () => {
    const fi = index()
    // 无对账时该 fixture 是真 header 命中（锚点+直接子项恰 1 TEXT + 图标已映射）
    const gateOnly = detectHeaderRowLeaf(vendorSection(), fi, MAPPING)
    expect(gateOnly.ok).toBe(true) // 前置：确认「本会命中」——拒绝来自 R6 而非检测器自身
    const r = collectFoldedGridTakeover({
      treeSections: [vendorSection()],
      figmaNodeData: makeFigma(),
      resourceMapping: MAPPING,
      componentName: 'c-demo',
    })
    expect(r.declaredUnconsumed).toBe(1)
    expect(r.map.size).toBe(0) // 未落地任何接管组件 ⇒ 回退 LLM
    const skip = r.skipped.find((s) => s.id === '38:3137')
    expect(String(skip?.reason)).toContain('declaredUnconsumed(5)') // 6 声明 − 1 标题
  })

  test('🔴 阳性（统计段复刻）：icon 本会命中，2 张声明卡只消费 1 图标 ⇒ 拒', () => {
    const fi = index()
    expect(detectIconLeaf(statsSection(), fi, MAPPING).ok).toBe(true) // 前置：本会命中
    const r = collectFoldedGridTakeover({
      treeSections: [statsSection()],
      figmaNodeData: makeFigma(),
      resourceMapping: MAPPING,
      componentName: 'c-demo',
    })
    expect(r.declaredUnconsumed).toBe(1)
    expect(r.map.size).toBe(0)
    const skip = r.skipped.find((s) => s.id === '38:3260')
    expect(String(skip?.reason)).toContain('declaredUnconsumed(1)')
  })

  test('🔴 阴性（判据不是恒拒）：真标题行段（声明 1 个带文本 item）⇒ header 照常命中', () => {
    const r = collectFoldedGridTakeover({
      treeSections: [
        {
          id: '38:3137',
          name: '标题行',
          body: { children: [{ id: '38:3141', name: '标题' }] },
        },
      ],
      figmaNodeData: makeFigma(),
      resourceMapping: MAPPING,
      componentName: 'c-demo',
    })
    expect(r.map.size).toBe(1)
    expect(r.declaredUnconsumed).toBe(0)
  })

  test('🔴 阴性：无声明 kids 的段 fail-open，行为逐字不变', () => {
    const sec = { id: '38:3137', name: '纯子树段' } // 无 body/children ⇒ 声明 ⌀
    expect(detectHeaderRowLeaf(sec, index(), MAPPING).ok).toBe(true)
    const r = collectFoldedGridTakeover({
      treeSections: [sec],
      figmaNodeData: makeFigma(),
      resourceMapping: MAPPING,
      componentName: 'c-demo',
    })
    expect(r.declaredUnconsumed).toBe(0)
    expect(r.map.size).toBe(1)
  })

  test('计数行：pickTakeoverAudit / REJECT-SUMMARY 行恒透传 declaredUnconsumed（0 也打）', () => {
    const audit = pickTakeoverAudit({ evaluated: 1, map: new Map(), skipped: [], declaredUnconsumed: 0 })
    expect(audit.declaredUnconsumed).toBe(0)
    expect(formatTakeoverAuditLine(audit)).toContain('declaredUnconsumed=0')
  })
})
