/**
 * R1（2026-11-02 · mc-max-1793597679970-646085b2「合作厂商弹窗」撕裂实锤）：
 * section 归属候选键（collectSourceNodeIds）复用 `sectionAnchorCandidates` 单一来源。
 *
 * 病灶：几何轨（`sectionAnchorKey`，刀33）已读修复产物 `figmaAnchorId` 与 `figmaNodeId`；
 * 归属轨（本函数）没读、且字段名用 `nodeId` —— 两套优先级互不一致 ⇒ 锚点守卫每修一次锚点，
 * 就制造一段「几何来自 A 节点、内容来自 B 节点」的撕裂段（修复越多撕裂越多）。
 *
 * 不变量（方案 §R1）：`anchorGeometryId(section) === anchorMembershipId(section)`
 * —— 几何键（`sectionAnchorKey`）为合法 Figma id 时，必须包含在归属集合（membership）中。
 * 另锁 P2-1 语义 id 自愈的触发语义（R1 后无锚点声明段仍触发；已锚定段不再触发属正当）。
 */
// planner 依赖链里的 logger 在 jest CJS 环境无法编译（backend-root 的 __filename/import.meta
// 混用），与既有 planner spec 同手法 mock 掉（本 spec 不测日志行为）。
jest.mock('../../logger/index.js', () => ({
  createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} }),
}))

import { buildEffectiveSection, collectSourceNodeIds } from '../subcomponent-planner.js'
import { FIGMA_ID_RE, sectionAnchorKey } from '../../utils/section-anchor-truth.js'
describe('R1 collectSourceNodeIds：归属候选与几何键同源（单一来源）', () => {
  test('🔴 真机复刻（646085b2）：修复产物 figmaAnchorId 进入归属集合，不变量成立', () => {
    const sec = {
      id: '38:3260',
      figmaAnchorId: '796:3',
      name: '统计区',
      body: { children: [{ id: '38:3261' }, { id: '38:3282' }] },
    }
    const ids = collectSourceNodeIds(sec)
    expect(ids).toContain('796:3')
    // 不变量：几何键 === 归属键（修复后几何键已切到 figmaAnchorId）
    expect(sectionAnchorKey(sec)).toBe('796:3')
    expect(ids).toContain(sectionAnchorKey(sec))
  })

  test('🔴 不变量批量断言：任一候选字段承载合法 Figma id ⇒ 必在归属集合中', () => {
    const shapes = [
      { id: '4:4' },
      { id: 'sec-a', figmaNodeId: '7:7' },
      { id: 'sec-b', nodeId: '9:9' },
      { id: 'sec-c', figmaNode: '5:5' },
      { id: 'sec-d', figmaAnchorId: '3:3' },
    ]
    for (const sec of shapes) {
      const key = sectionAnchorKey(sec)
      if (!FIGMA_ID_RE.test(key)) continue // 合成段 id（43:4791-list）不在不变量域内
      expect(collectSourceNodeIds(sec)).toContain(key)
    }
  })

  test('🔴 P2-1 自愈语义锁定：无锚点声明的语义 id 段，自愈仍触发（逐字不变）', () => {
    const sec = { id: 'section-cards', name: 'header' }
    const ids = collectSourceNodeIds(sec)
    expect(ids).toContain('1:1') // findFigmaNodeIdBySectionName 桩表 header→1:1
    expect(sec.analysisFixes?.[0]).toMatchObject({ kind: 'semanticIdFallback', from: 'section-cards', to: '1:1' })
  })

  test('P2-1 已锚定的语义 id 段不再按名字重映射（第二真值源，正当跳过）', () => {
    const sec = { id: 'section-cards', name: 'header', figmaAnchorId: '796:3' }
    const ids = collectSourceNodeIds(sec)
    expect(ids).toContain('796:3')
    expect(ids).not.toContain('1:1')
    expect(sec.analysisFixes).toBeUndefined()
  })

  test('子元素 figmaNodeId 纳入归属（与 collectSectionFigmaRefs 同视野，消半写回）', () => {
    const sec = { id: '4:4', body: { children: [{ id: 'c-1', figmaNodeId: '5:5' }, { id: 'c-2', nodeId: '6:6' }] } }
    const ids = collectSourceNodeIds(sec)
    expect(ids).toContain('5:5')
    expect(ids).toContain('6:6')
  })

  test('语义 id 不进归属集合（id 仍做形态校验，语义名不是节点引用）', () => {
    const ids = collectSourceNodeIds({ id: 'section-cards', name: 'x' })
    expect(ids).not.toContain('section-cards')
  })
})

describe('R7 修复锚点的 plan 契约透传', () => {
  const ctx = () => ({ enableInternalSplit: false, allInternalSubcomponents: [], figmaIndex: null })

  test('普通叶：figmaAnchorId 不被白名单重建剥离；缺字段不产键', () => {
    const repaired = buildEffectiveSection({ id: '136:122', figmaAnchorId: '2:8023', body: { children: [] } }, 0, ctx())
    const plain = buildEffectiveSection({ id: '136:122', body: { children: [] } }, 0, ctx())
    expect(repaired.figmaAnchorId).toBe('2:8023')
    expect(Object.prototype.hasOwnProperty.call(plain, 'figmaAnchorId')).toBe(false)
  })

  test('容器叶：修复锚与 children 一起存活', () => {
    const out = buildEffectiveSection({
      id: '136:122', figmaAnchorId: '2:8023', isLayoutContainer: true,
      children: [{ id: '136:123', body: { children: [] } }],
    }, 0, ctx())
    expect(out.isLayoutContainer).toBe(true)
    expect(out.figmaAnchorId).toBe('2:8023')
  })

  test('富卡列表合成叶：id 变为 -list 后主锚仍指向原修复容器', () => {
    const richItems = [
      { id: '136:127', content: { elements: [{ text: '危化品车' }, { text: '51次' }] } },
      { id: '136:128', content: { elements: [{ text: '重型货车' }, { text: '2次' }] } },
    ]
    const out = buildEffectiveSection({
      id: '136:122', figmaAnchorId: '2:8023', isLayoutContainer: true, layout: 'horizontal',
      body: { items: richItems },
      children: [{ id: '136:127' }, { id: '136:128' }],
    }, 0, ctx())
    expect(out.children).toHaveLength(1)
    expect(out.children[0].collapsed).toBe(true)
    expect(out.children[0].id).toBe('136:122-list')
    expect(out.children[0].figmaAnchorId).toBe('2:8023')
  })
})
