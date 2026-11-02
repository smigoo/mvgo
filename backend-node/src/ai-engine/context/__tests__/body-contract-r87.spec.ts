/**
 * R8-7（2026-11-02 · mc-max-1793630407343-dea074f9 实锤）：段内容契约透传。
 *
 * 病灶：normalizeSectionNode 白名单重建不透传 body ⇒ resolvePlanSections 优先读
 * generationInput.componentPlan ⇒ vision 的 body.items/body.children 全丢 ⇒
 * 刀53 的 R3/R6/刀20a/statrow/table 五处判据共用同一断供开关、全部 fail-open。
 *
 * 本 spec 只测装配层纯函数；判据层（declaredUnconsumed 拒止）见 folded-grid-section-takeover.spec.ts。
 */
// 🚨 assembler 经 createLogger → config/backend-root.js（import.meta.url）⇒ CJS 下需 virtual mock
//    （与 hallucinated-empty-section-r85.spec.ts 同口径）。
jest.mock('../../../config/backend-root.js', () => ({
  backendRoot: process.cwd(),
  projectRoot: process.cwd(),
  workspaceRoot: process.cwd() + '/workspace',
  customComponentsDir: process.cwd() + '/workspace/custom-components',
  vue3ComponentsDir: process.cwd() + '/workspace/vue3-components',
  tempComponentsDir: process.cwd() + '/temp-components',
  dataDir: process.cwd() + '/data',
  logsDir: process.cwd() + '/logs',
  configDir: process.cwd() + '/config',
}), { virtual: true })

import { normalizeComponentPlan } from '../generation-context-assembler.js'

/** 38:3137「战略合作厂商」vision 段（body.items 6 项，文本在 content.parts[].text）。 */
function makeVendorSection(itemCount = 6) {
  const names = ['华为技术', '中兴通讯', '海康威视', '新华三集团', '浪潮信息', '天地伟业']
  return {
    id: '38:3137',
    title: '战略合作厂商',
    elementCount: itemCount,
    layout: 'grid-4-columns',
    sourceNodeIds: ['38:3137'],
    body: {
      layout: 'grid-4-columns',
      gridColumns: 4,
      bgPlaceholder: 'section-bg-strategic', // 不应透传（非内容契约）
      items: Array.from({ length: itemCount }, (_, i) => ({
        id: `strat-${i + 1}`,
        name: names[i % names.length],
        role: 'data-tag',
        repeatedFill: '#FFFFFF', // 不应透传（样式）
        content: {
          parts: [
            { text: names[i % names.length], type: 'label', styles: { fontSize: 12, color: '#333333' } },
            { text: `${8 + i}台`, type: 'value', styles: { fontSize: 12, color: '#D4A017' } },
          ],
        },
      })),
    },
  }
}

/** 38:3260 统计段（body.children 2 张 stat-card，文本在 content.elements[].text）。 */
function makeStatSection() {
  const card = (id, name, value) => ({
    id,
    name,
    role: 'stat-card',
    layout: 'horizontal',
    icon: { resourceFile: '../resources/images/icon-262.png', width: 53, height: 55, base64: 'x'.repeat(500) },
    content: {
      layout: 'vertical',
      elements: [
        { type: 'label', text: name, styles: { fontSize: 14 } },
        { type: 'value', text: value, styles: { fontSize: 28 } },
      ],
    },
  })
  return {
    id: '38:3260',
    title: '合作厂商统计',
    type: 'stats',
    sourceNodeIds: ['38:3260'],
    body: { layout: 'horizontal-2-columns', children: [card('38:3260-item-1', '合作厂商', '33'), card('38:3282-item-2', '在线设备', '66')] },
  }
}

describe('R8-7 段内容契约透传（normalizeComponentPlan）', () => {
  it('V1：body.items 全量透传（6 项 + content.parts 文本），布局标量保留', () => {
    const out = normalizeComponentPlan({ effectiveSections: [makeVendorSection()] })
    const sec = out.effectiveSections[0]
    expect(sec.declaredContent).toBeDefined()
    expect(sec.declaredContent.layout).toBe('grid-4-columns')
    expect(sec.declaredContent.gridColumns).toBe(4)
    expect(sec.declaredContent.items).toHaveLength(6)
    expect(sec.declaredContent.items[0].name).toBe('华为技术')
    // 🔴 content.parts 是文本载体容器键，必须递归保留（否则 R6-2 mass 计不全）
    expect(sec.declaredContent.items[0].content.parts.map((p) => p.text)).toEqual(['华为技术', '8台'])
    // 样式/占位符不属于内容契约
    expect(sec.declaredContent.bgPlaceholder).toBeUndefined()
    expect(sec.declaredContent.items[0].repeatedFill).toBeUndefined()
    expect(sec.declaredContent.items[0].content.parts[0].styles).toBeUndefined()
  })

  it('V1b：body.children（stat-card）透传 + icon 仅引用不回 base64', () => {
    const out = normalizeComponentPlan({ effectiveSections: [makeStatSection()] })
    const sec = out.effectiveSections[0]
    expect(sec.declaredContent.children).toHaveLength(2)
    expect(sec.declaredContent.children[0].content.elements.map((e) => e.text)).toEqual(['合作厂商', '33'])
    expect(sec.declaredContent.children[0].icon.resourceFile).toBe('../resources/images/icon-262.png')
    expect(sec.declaredContent.children[0].icon.base64).toBeUndefined()
  })

  it('V5：无 body 段零副作用（不产 body 键、计数为 0）', () => {
    const out = normalizeComponentPlan({
      effectiveSections: [{ id: '38:3140', title: 'x', sourceNodeIds: ['38:3140'], layout: 'grid' }],
    })
    expect(out.effectiveSections[0].declaredContent).toBeUndefined()
    expect(out.normalization.bodySections).toBe(0)
    expect(out.normalization.bodyBytes).toBe(0)
  })

  it('V5b：body 无内容数组（仅标量）⇒ 不产 body 键（与表头契约「宁缺不猜」同语义）', () => {
    const out = normalizeComponentPlan({
      effectiveSections: [{ id: 's1', body: { layout: 'vertical' } }],
    })
    expect(Object.prototype.hasOwnProperty.call(out.effectiveSections[0], 'declaredContent')).toBe(false)
  })

  it('观测：droppedKeys 记录被剔除的内容型字段（对象/数组值才计）', () => {
    const sec = makeVendorSection()
    sec.styles = { figmaHeightPx: 161 } // styles 已透传 ⇒ 不应计入 dropped
    sec.techStack = { chart: 'echarts' } // 未透传且为对象 ⇒ 必须计数
    sec.someScalar = 'x' // 标量 ⇒ 不计
    const out = normalizeComponentPlan({ effectiveSections: [sec] })
    expect(out.normalization.sections).toBe(1)
    expect(out.normalization.bodySections).toBe(1)
    expect(out.normalization.bodyBytes).toBeGreaterThan(0)
    expect(out.normalization.droppedKeys.techStack).toBe(1)
    expect(out.normalization.droppedKeys.styles).toBeUndefined()
    expect(out.normalization.droppedKeys.someScalar).toBeUndefined()
  })

  it('体积闸：body 超 6KB 预算的段只剥 body、保留段本身并计数', () => {
    // 200 项 × 双文本 ⇒ 单段 body 远超 6KB
    const big = makeVendorSection(6)
    big.body.items = Array.from({ length: 200 }, (_, i) => ({
      id: `x-${i}`,
      name: `厂商名称编号${i}甲乙丙丁戊己庚辛`,
      content: { parts: [{ text: `文本内容甲乙丙丁戊己庚辛壬癸${i}` }, { text: `${i}台` }] },
    }))
    const out = normalizeComponentPlan({ effectiveSections: [big, makeStatSection()] })
    // 第一段被预算剥 body，第二段保留
    expect(out.effectiveSections[0].declaredContent).toBeUndefined()
    expect(out.effectiveSections[1].declaredContent).toBeDefined()
    expect(out.normalization.bodyDroppedByBudget).toBe(1)
    expect(out.effectiveSections).toHaveLength(2)
  })

  it('节点闸：单段超 200 节点截断并计数（不静默丢）', () => {
    const sec = makeVendorSection(6)
    sec.body.items = Array.from({ length: 120 }, (_, i) => ({
      id: `n-${i}`,
      name: `n${i}`,
      content: { parts: [{ text: `t${i}` }] },
    }))
    const out = normalizeComponentPlan({ effectiveSections: [sec] })
    expect(out.normalization.bodyTruncated).toBeGreaterThan(0)
  })
})
