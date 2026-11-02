/**
 * R3（2026-11-02 · mc-max-1793597679970-646085b2「合作厂商弹窗」实锤）：
 * 超界段（`collectSectionFigmaRefs` 存在落在锚点子树之外的树内引用）禁 icon/header/text
 * 三类**单元素**接管 —— 只看锚点子树必然把整段内容确定性裁没（真机实锤：统计区只剩一张
 * 53×55 图标却 flex:2.209，厂商组 3 张卡整体消失）。
 *
 * 对照设计（防假绿）：
 *   ① 阳性：icon 本会命中（子树 0 TEXT + 图标已映射资源）+ refs 超界 ⇒ 拒，reason=scopeIncomplete
 *   ② 阴性：同一 section 收窄 refs（全部在锚点子树内）⇒ icon 照常命中（判据不是恒拒）
 *   ③ 阴性：无锚点段 ⇒ 不在此扩权（仍走既有 noAnchorNode 分支）
 *   ④ 计数行：collectFoldedGridTakeover 出口 `scopeIncomplete` 恒存在（0 也打），
 *      超界段计 1；skip 串可见 `icon:scopeIncomplete`
 */
import {
  collectFoldedGridTakeover,
  detectIconLeaf,
  detectTextLeaf,
  detectHeaderRowLeaf,
} from '../folded-grid-section-takeover.js';
import { indexFigmaNodes } from '../section-tree.js';

const box = (x, y, w, h) => ({ x, y, width: w, height: h });
const bbox = (x, y, w, h) => ({ absoluteBoundingBox: box(x, y, w, h) });

/**
 * 真值树（646085b2 撕裂形态复刻）：
 * root 1:1 → container 9:9 → { 卡 10:1(图标 10:3), 邻卡 10:4, 厂商组 11:1(文本 11:11) }
 */
function makeFigma() {
  return {
    document: {
      id: '1:1',
      name: 'root',
      type: 'FRAME',
      children: [
        {
          id: '9:9',
          name: 'slot-icon',
          type: 'GROUP',
          ...bbox(0, 0, 604, 787),
          children: [
            { id: '10:1', name: 'stat-card', type: 'GROUP', ...bbox(0, 0, 265, 76), children: [
              { id: '10:3', name: 'icon', type: 'VECTOR', ...bbox(20, 10, 53, 55), children: [] },
            ] },
            { id: '10:4', name: 'stat-card-2', type: 'GROUP', ...bbox(270, 0, 265, 76), children: [] },
            { id: '11:1', name: 'vendor', type: 'GROUP', ...bbox(0, 90, 604, 200), children: [
              { id: '11:11', name: 't', type: 'TEXT', characters: '华为', ...bbox(10, 100, 60, 20), children: [] },
            ] },
          ],
        },
      ],
    },
  }
}

const MAPPING = [
  { figmaNodeId: '10:3', resourceFile: 'resources/images/icon-1000.png', downloadStatus: 'ok', assignedVarName: 'iconVar' },
]

/** 阳性 section：锚 10:1（子树含 10:3 图标），refs 声明却含**锚外**的 10:4（撕裂形态） */
function tornSection() {
  return { id: '10:1', name: '统计区', body: { children: [{ id: '10:3' }, { id: '10:4' }] } }
}

function index() {
  return indexFigmaNodes(makeFigma().document)
}

describe('R3 超界段禁单元素接管', () => {
  test('🔴 阳性（646085b2 复刻）：icon 本会命中，refs 超界 ⇒ 拒 scopeIncomplete', () => {
    const fi = index()
    // 无守卫时该 fixture 是真 icon 命中（见下一条阴性对照的收窄版）——先证「会被裁没」
    expect(detectIconLeaf(tornSection(), fi, MAPPING)).toMatchObject({ ok: false, reason: 'scopeIncomplete' })
  })

  test('🔴 阴性（判据不是恒拒）：同一 section 收窄 refs ⇒ icon 照常命中', () => {
    const fi = index()
    const clean = { id: '10:1', name: '统计区', body: { children: [{ id: '10:3' }] } }
    expect(detectIconLeaf(clean, fi, MAPPING)).toMatchObject({ ok: true, kind: 'icon', iconFile: 'icon-1000.png' })
  })

  test('🔴 阴性：无锚点段不扩权（仍走既有 noAnchorNode 分支）', () => {
    const fi = index()
    const orphan = { id: 'sec-x', name: '合成段', body: { children: [{ id: '10:3' }, { id: '10:4' }] } }
    expect(detectIconLeaf(orphan, fi, MAPPING)).toMatchObject({ ok: false, reason: 'noAnchorNode' })
  })

  test('header / text 检测器同样被超界 gate 拦截', () => {
    const fi = index()
    expect(detectHeaderRowLeaf(tornSection(), fi, MAPPING).reason).toBe('scopeIncomplete')
    expect(detectTextLeaf(tornSection(), fi).reason).toBe('scopeIncomplete')
  })

  test('计数行：collectFoldedGridTakeover 出口恒有 scopeIncomplete 键（0 也打），超界段计 1', () => {
    const r = collectFoldedGridTakeover({
      treeSections: [tornSection(), { id: '10:4', name: '正常段', body: { children: [{ id: '10:4' }] } }],
      figmaNodeData: makeFigma(),
      resourceMapping: MAPPING,
      componentName: 'c-demo',
    })
    expect(r.scopeIncomplete).toBe(1)
    // skip 串可见（真机日志按 reason 字符串 grep）
    const torn = r.skipped.find((s) => s.id === '10:1')
    expect(String(torn?.reason)).toContain('scopeIncomplete')
  })
})
