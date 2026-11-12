/**
 * 刀 55 / P2-2：`enforceCompositeRowTruth` —— 复合卡「图标 + 数值 + 标签」横排真值落地。
 *
 * 立项实证（mc-max-1794456716158-7f427bd3）：统计卡三处容器全缺 `display:flex`
 *   ⇒ <img>/<span> 退化为块级，33 与 66 纵向堆叠并溢出重叠，两张卡挤成一张。
 * 判据真值：Figma 段节点子树内「图标与文本 y 区间重叠且图标在左」。
 */
import { enforceCompositeRowTruth } from './layout-truth-healer.js'

/** 段节点：背景矩形（不应被当图标）+ icon + 数值 + 标签（横排事实） */
const figmaNode = (opts: { iconTop?: boolean } = {}) => ({
  id: '38:3260',
  name: 'Group 2136638431',
  type: 'GROUP',
  absoluteBoundingBox: { x: 0, y: 0, width: 265, height: 76 },
  children: [
    {
      id: '38:3261',
      name: 'Rectangle 346241391',
      type: 'VECTOR',
      absoluteBoundingBox: { x: 0, y: 0, width: 265, height: 76 },
    },
    {
      id: '187:262',
      name: 'icon-合作厂商',
      type: 'VECTOR',
      absoluteBoundingBox: { x: 20, y: opts.iconTop ? 0 : 10, width: 53, height: opts.iconTop ? 8 : 56 },
    },
    {
      id: '38:3262',
      name: '33',
      type: 'TEXT',
      characters: '33',
      absoluteBoundingBox: { x: 90, y: 14, width: 40, height: 32 },
    },
    {
      id: '38:3263',
      name: '合作厂商',
      type: 'TEXT',
      characters: '合作厂商',
      absoluteBoundingBox: { x: 90, y: 46, width: 60, height: 20 },
    },
  ],
})

const wrapRoot = (node: object) => ({ document: { id: '0:0', name: 'root', type: 'DOCUMENT', children: [node] } })

describe('刀 55 enforceCompositeRowTruth（复合卡横排真值）', () => {
  test('阳性：图标壳 + 数值/标签兄弟直挂卡容器 ⇒ 卡容器 row + 文本兄弟包 column', () => {
    const files = {
      'package/components/HeaderSection.vue': `<template>
  <div class="c-header-section" data-section-id="38:3260">
    <div class="c-header-card">
      <div class="c-icon"><img :src="icon2" /></div>
      <span class="c-header-value">33</span>
      <span class="c-header-label">合作厂商</span>
    </div>
  </div>
</template>
`,
    }
    const r = enforceCompositeRowTruth(files, { figmaRoot: wrapRoot(figmaNode()) })
    const out = r.files['package/components/HeaderSection.vue']

    expect(r.stats.rowTruth).toBe(1)
    expect(out).toContain('flex-direction:row')
    expect(out).toContain('mc-stat-text-col')
    expect(out).toContain('flex-direction:column')
    // 🔴 完整性回归：曾因 inner→tpl 坐标换算把 end 算到模板外，多删 143 字符
    //   （模板被截断、script 顶部丢失）。断言"只增不减 + 结构闭合 + 文本不丢"。
    expect(out.length).toBeGreaterThan(files['package/components/HeaderSection.vue'].length)
    expect(out).toContain('</template>')
    expect(out.match(/合作厂商/g)).toHaveLength(1)
    expect(out).toContain('<span class="c-header-value">33</span>')
    // 幂等：再跑一次不得重复包裹
    const again = enforceCompositeRowTruth(r.files, { figmaRoot: wrapRoot(figmaNode()) })
    expect(again.changes).toHaveLength(0)
  })

  test('阳性：图标壳 + 文本容器（数值/标签已包一层）⇒ 卡容器 row + 文本容器 column', () => {
    const files = {
      'package/components/StatsSection.vue': `<template>
  <div class="c-stats-section" data-section-id="38:3260">
    <div class="c-stat-card">
      <div class="c-stat-card-content">
        <div class="c-stat-card-icon-wrap"><img :src="icon3" /></div>
        <div class="c-stat-card-text">
          <span class="c-stat-card-value">66</span>
          <span class="c-stat-card-label">在线设备</span>
        </div>
      </div>
    </div>
  </div>
</template>
`,
    }
    const r = enforceCompositeRowTruth(files, { figmaRoot: wrapRoot(figmaNode()) })
    const out = r.files['package/components/StatsSection.vue']

    expect(out).toContain('flex-direction:row')
    // 文本容器拿到 column，而不是被包新壳
    expect(out).toMatch(/c-stat-card-text"[^>]*flex-direction:column|flex-direction:column[^>]*c-stat-card-text/)
    expect(out).not.toContain('mc-stat-text-col')
    // 完整性：模板闭合、数值与标签都在
    expect(out.length).toBeGreaterThan(files['package/components/StatsSection.vue'].length)
    expect(out).toContain('</template>')
    expect(out).toContain('>66<')
    expect(out).toContain('>在线设备<')
  })

  test('阴性：图标与文本纵向排列（y 不重叠）⇒ 不注入', () => {
    const files = {
      'package/components/HeaderSection.vue': `<template>
  <div class="c-header-section" data-section-id="38:3260">
    <div class="c-header-card">
      <div class="c-icon"><img :src="icon2" /></div>
      <span class="c-header-value">33</span>
      <span class="c-header-label">合作厂商</span>
    </div>
  </div>
</template>
`,
    }
    const r = enforceCompositeRowTruth(files, { figmaRoot: wrapRoot(figmaNode({ iconTop: true })) })
    expect(r.changes).toHaveLength(0)
    expect(r.files['package/components/HeaderSection.vue']).toBe(files['package/components/HeaderSection.vue'])
  })

  test('阴性：无 figmaRoot ⇒ fail-open 不改（零臆造）', () => {
    const files = {
      'package/components/HeaderSection.vue': `<template>
  <div class="c-header-section" data-section-id="38:3260">
    <div class="c-header-card"><img :src="icon2" /><span>33</span><span>合作厂商</span></div>
  </div>
</template>
`,
    }
    const r = enforceCompositeRowTruth(files, {})
    expect(r.changes).toHaveLength(0)
    expect(r.stats.scanned).toBe(0)
  })

  test('阴性：模板里没有 <img>（纯文本卡）⇒ 不介入', () => {
    const files = {
      'package/components/Plain.vue': `<template>
  <div class="c-plain" data-section-id="38:3260">
    <div class="c-plain-card"><span>33</span><span>合作厂商</span></div>
  </div>
</template>
`,
    }
    const r = enforceCompositeRowTruth(files, { figmaRoot: wrapRoot(figmaNode()) })
    expect(r.changes).toHaveLength(0)
  })
})
