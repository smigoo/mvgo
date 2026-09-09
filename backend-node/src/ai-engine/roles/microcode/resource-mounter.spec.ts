import { fixSectionHeightsForResource, ensureHeaderSlots, injectFailedResourceFallbacks, dedupeSameImageAliases, stripEmptyShellBindings } from './resource-mounter.js'

/**
 * 🛡️ fix-section-heights 规则②：组件根 height:100% 不得改写（2026-09-02 实锤）。
 *
 * 背景：宿主 `.pannel-content` 是 **block 定高容器**（`height: calc(100% - 38px)`，
 * 无 `display:flex`，见 frontend default-panel/index.vue:76-93）。组件根写
 * `height: 100%` 正好生效；但规则② 把「规则体含 display:flex 且含 height:100%」
 * 一律改写为 `flex: 1 1 0`，在非 flex 父容器下 **flex 完全失效** → 根高度退 auto →
 * 内部 `flex:1; min-height:0` 的图表区拿到 0 → **内容整块消失**。
 *
 * 实锤：mc-max-1788280914596-25b10e4d 最早 revision（r-f2dd7c10）根规则是
 * `height: 100%`（预览正常，用户「中途看到过」），最终产物同一选择器被改写成
 * `flex: 1 1 0`（内容消失）。同模式复现于 mc-max-1788280156657-f97fafa8（高度坍塌）
 * 与 mc-max-1788280167414-49dfbe7d。
 *
 * 规则② 的初衷（治内部多 section 各写 height:100% 互相溢出）仍然正确——
 * 内部 section 的父级是组件根（flex 容器），改写成 flex 分配有效。
 * 盲区只在于它分不清「组件根」与「内部 section」。
 */
describe('fixSectionHeightsForResource 规则②：组件根豁免 height:100% 改写', () => {
  const CTX = { path: 'resources/styles/common.less' }

  it('⭐ 组件根选择器（-root 结尾）保留 height:100%，不改写为 flex:1 1 0', () => {
    const input = [
      '.c-env-monitor-root {',
      '  width: 100%;',
      '  height: 100%;',
      '  display: flex;',
      '  flex-direction: column;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('height: 100%')
    expect(out).not.toContain('flex: 1 1 0')
  })

  it('防误伤：内部 section（非 root）含 display:flex + height:100% 仍改写为 flex:1 1 0', () => {
    // 规则② 的原始职责必须保留：内部 section 父级是组件根（flex 容器），
    // 各写 height:100% 会互相溢出，改写成 flex 分配是正确行为。
    const input = [
      '.c-env-monitor-chart-section {',
      '  height: 100%;',
      '  display: flex;',
      '  flex-direction: column;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('flex: 1 1 0')
    expect(out).not.toContain('height: 100%')
  })

  it('同一文件 root + section 混合：只改 section，保留 root 的 height:100%', () => {
    const input = [
      '.c-monitor-root {',
      '  width: 100%;',
      '  height: 100%;',
      '  display: flex;',
      '  flex-direction: column;',
      '}',
      '.c-monitor-chart-section {',
      '  height: 100%;',
      '  display: flex;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    // root 保留 height:100%
    const rootBlock = out.match(/\.c-monitor-root \{[^}]*\}/)?.[0] ?? ''
    expect(rootBlock).toContain('height: 100%')
    expect(rootBlock).not.toContain('flex: 1 1 0')
    // section 仍被改写
    const sectionBlock = out.match(/\.c-monitor-chart-section \{[^}]*\}/)?.[0] ?? ''
    expect(sectionBlock).toContain('flex: 1 1 0')
    expect(sectionBlock).not.toContain('height: 100%')
  })

  it('不误豁免：类名含 -rooter 等「-root 非结尾」的选择器仍按普通规则改写', () => {
    // `-root\b` 词边界保证 .c-x-rooter 不被误判为组件根
    const input = [
      '.c-monitor-rooter {',
      '  height: 100%;',
      '  display: flex;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('flex: 1 1 0')
  })
})

describe('fixSectionHeightsForResource 规则② A4 加权（2026-09-04 实锤 mc-max-1788454423557）', () => {
  // sectionHeights 映射：子组件根 class → Figma 高度 px（真值 65:317，非 50/50 均分）
  const CTX = {
    path: 'package/components/OverviewCards.vue',
    sectionHeights: {
      'c-monitor-overview-cards': 65,
      'c-monitor-device-list': 317,
    },
  }

  it('⭐ 命中映射的 section 根：height:100% → flex: <px> 1 0（非盲注 1 1 0），并补 min-height:0', () => {
    const input = [
      '.c-monitor-overview-cards {',
      '  height: 100%;',
      '  display: flex;',
      '  flex-direction: row;',
      '  gap: 10px;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('flex: 65 1 0')
    expect(out).toContain('min-height: 0')
    expect(out).not.toContain('flex: 1 1 0')
    expect(out).not.toContain('height: 100%')
  })

  it('⭐ 升级分支：已被盲注 flex: 1 1 0 的存量产物（无 height:100%）改写为真值 px', () => {
    // 25e40782 产物实景：OverviewCards.vue scoped 第一行曾被盲注 flex: 1 1 0 → 50/50 均分
    const input = [
      '.c-monitor-overview-cards {',
      'flex: 1 1 0;',
      '',
      '  display: flex;',
      '  flex-direction: row;',
      '  flex-shrink: 0;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('flex: 65 1 0')
    expect(out).not.toContain('flex: 1 1 0')
  })

  it('未命中映射的 section 维持旧行为（flex: 1 1 0），映射缺省时完全不变', () => {
    const input = [
      '.c-monitor-other-section {',
      '  height: 100%;',
      '  display: flex;',
      '}',
    ].join('\n')
    // 有映射但未命中 → 旧行为
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('flex: 1 1 0')
    // 无映射 → 同样旧行为（fail-open）
    const out2 = fixSectionHeightsForResource(input, { path: 'x.less' })
    expect(out2).toContain('flex: 1 1 0')
  })

  it('组件根豁免优先于 A4 加权：-root 类即使碰巧在映射中也不改写', () => {
    const input = [
      '.c-monitor-root {',
      '  height: 100%;',
      '  display: flex;',
      '  flex-direction: column;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, {
      path: 'x.vue',
      sectionHeights: { 'c-monitor-root': 425 },
    })
    expect(out).toContain('height: 100%')
    expect(out).not.toContain('flex: 425 1 0')
  })
})

describe('fixSectionHeightsForResource 规则④：固定 px 尺寸区块禁 flex-grow（2026-09-02 实锤）', () => {
  const CTX = { path: 'resources/styles/common.less' }

  it('⭐ width:46px + flex:1 1 0 → flex: 0 0 auto（CategoryNav 实锤：186px 撑满）', () => {
    const input = [
      '.c-monitor-category-nav {',
      '  display: flex;',
      '  flex-direction: column;',
      '  align-items: center;',
      '  width: 46px;',
      '  flex: 1 1 0;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('flex: 0 0 auto')
    expect(out).toContain('width: 46px')
    expect(out).not.toContain('flex: 1 1 0')
  })

  it('防误伤：无 px 尺寸的 flex:1（自适应区块）→ 不动', () => {
    const input = [
      '.c-monitor-main-layout {',
      '  flex: 1;',
      '  display: flex;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('flex: 1')
  })

  it('防误伤：width:100% + flex:1 1 0 → 不动（行父等价/列父不可静态判定）', () => {
    const input = [
      '.c-monitor-stats-header {',
      '  flex: 1 1 0;',
      '  width: 100%;',
      '  display: flex;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('flex: 1 1 0')
  })

  it('防误伤：min-height:120px + flex:131 1 0（图表 section 合法组合）→ 不动', () => {
    const input = [
      '.c-monitor-chart-section {',
      '  flex: 131 1 0;',
      '  min-height: 120px;',
      '  display: flex;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('flex: 131 1 0')
  })

  it('height:100px + flex:1 1 0（单块内）→ flex: 0 0 auto（保留显式高）', () => {
    const input = [
      '.c-monitor-stats-header {',
      '  height: 100px;',
      '  flex: 1 1 0;',
      '  display: flex;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('flex: 0 0 auto')
    expect(out).toContain('height: 100px')
  })
})

describe('ensureHeaderSlots P1-3: headerSlots/sections 重叠去重', () => {
  // 多行 baseCode 匹配注入正则 `/<base-panel[^>]*>\s*\n/`
  const baseCode = [
    '<template>',
    '  <base-panel>',
    '    <div>content</div>',
    '  </base-panel>',
    '</template>',
  ].join('\n')

  it('当 headerSlot content 与子组件文本完全匹配时，跳过注入', () => {
    const input = {
      headerSlots: [
        { slotType: 'header-right', content: '设备类型 28', figmaNodeId: 'node1' },
      ],
    }
    const files = {
      'package/components/HeaderStats.vue':
        '<template><div><span>设备类型 28</span></div></template>',
    }
    const result = ensureHeaderSlots(baseCode, input, { files })
    // 重叠 → 跳过注入，code 不变
    expect(result).toBe(baseCode)
  })

  it('当 headerSlot content 与子组件无重叠时，正常注入', () => {
    const input = {
      headerSlots: [
        { slotType: 'header-right', content: '设备类型 28', figmaNodeId: 'node1' },
      ],
    }
    const files = {
      'package/components/OtherWidget.vue':
        '<template><div><span>其他内容</span></div></template>',
    }
    const result = ensureHeaderSlots(baseCode, input, { files })
    // 无重叠 → 注入 DOM
    expect(result).not.toBe(baseCode)
    expect(result).toContain('设备类型 28')
  })

  it('无 files 时不做去重，保持原有注入行为', () => {
    const input = {
      headerSlots: [
        { slotType: 'header-right', content: '设备类型 28', figmaNodeId: 'node1' },
      ],
    }
    const result = ensureHeaderSlots(baseCode, input, {})
    expect(result).not.toBe(baseCode)
    expect(result).toContain('设备类型 28')
  })

  it('部分重叠：只跳过匹配的 slot，保留不匹配的', () => {
    const input = {
      headerSlots: [
        { slotType: 'header-right', content: '设备类型 28', figmaNodeId: 'node1' },
        { slotType: 'title-right', content: '完好率 98%', figmaNodeId: 'node2' },
      ],
    }
    const files = {
      'package/components/HeaderStats.vue':
        '<template><div><span>设备类型 28</span></div></template>',
    }
    const result = ensureHeaderSlots(baseCode, input, { files })
    // 第一个 slot 被跳过（重叠），第二个应该注入
    expect(result).toContain('完好率 98%')
    // header-right 被跳过 → 不应注入
    expect(result).not.toContain('#header-right')
  })

  it('数字片段匹配：子组件包含数字 "28" 时，"设备类型 28" 被跳过', () => {
    const input = {
      headerSlots: [
        { slotType: 'header-right', content: '设备类型 28', figmaNodeId: 'node1' },
      ],
    }
    const files = {
      'package/components/HeaderStats.vue':
        '<template><div><span>28</span></div></template>',
    }
    const result = ensureHeaderSlots(baseCode, input, { files })
    // "28" 是片段之一，匹配 → 跳过
    expect(result).toBe(baseCode)
  })

  it('vue3 组件跳过整个 ensureHeaderSlots 逻辑', () => {
    const input = {
      headerSlots: [
        { slotType: 'header-right', content: '设备类型 28', figmaNodeId: 'node1' },
      ],
    }
    const files = {
      'package/components/HeaderStats.vue':
        '<template><div><span>设备类型 28</span></div></template>',
    }
    const result = ensureHeaderSlots(baseCode, input, { files, componentType: 'vue3' })
    // vue3 直接返回原 code
    expect(result).toBe(baseCode)
  })

  it('无 base-panel 时跳过注入', () => {
    const plainCode = '<template><div>plain</div></template>'
    const input = {
      headerSlots: [
        { slotType: 'header-right', content: '设备类型 28', figmaNodeId: 'node1' },
      ],
    }
    const result = ensureHeaderSlots(plainCode, input, {})
    expect(result).toBe(plainCode)
  })
})

/**
 * 🛡️ B2（2026-09-07）：下载失败背景资源的 CSS 渐变/纯色兜底注入。
 *
 * 背景：traffic 组件根背景 bg-[m] downloadStatus='missing'，skipMount 后无替代方案 → 容器无背景。
 * 现有 resolveCssSubstituteRefs 只处理 downloadStatus='css'，healUnavailableResourceRefs
 * 只剥离引用（→ none），未注入任何视觉替代。
 *
 * 测试覆盖：
 *  1) template 内 :style 绑定 url(${var}) → 静态 fallback 色值
 *  2) <style> 内 url(@var) → fallback 值
 *  3) <style> 内 url(none)（heal 已剥离引用）→ fallback 值
 *  4) 兜底 CSS 类注入（template 引用已被 heal 剥离）
 *  5) 颜色来源优先级：visualMeta.fillsSummary > cssValue > 默认渐变
 *  6) 仅处理 previewAnalysisRole='bg'（icon/img 不处理）
 *  7) env BG_AUTO_MOUNT=false 时关闭
 */
describe('injectFailedResourceFallbacks: B2 下载失败背景 CSS 兜底', () => {
  const makeMapping = (overrides = {}) => ({
    previewAnalysisRole: 'bg',
    downloadStatus: 'missing',
    assignedVarName: 'bg1',
    semanticVarName: null,
    visualMeta: { fillsSummary: null },
    cssValue: null,
    mountTarget: 'traffic-root',
    name: 'bg-[m]',
    targetDomHint: 'traffic container',
    figmaPath: 'traffic/bg-[m]',
    ...overrides,
  })

  it('① template :style 绑定 url(${var}) → 静态 fallback 色值', () => {
    const allFiles = {
      'package/index.vue': `<template>
  <div class="traffic-root" :style="\`url(\${bg1})\`"></div>
</template>
<style></style>`,
    }
    const mapping = [makeMapping({ visualMeta: { fillsSummary: '#ff0000' } })]
    const fixes = injectFailedResourceFallbacks(allFiles, mapping)
    expect(fixes.length).toBe(1)
    expect(fixes[0].method).toContain('tpl-style')
    expect(allFiles['package/index.vue']).toContain("backgroundImage: '#ff0000'")
  })

  it('② <style> 内 url(@var) → fallback 值', () => {
    const allFiles = {
      'package/index.vue': `<template>
  <div class="trafficroot"></div>
</template>
<style>
.trafficroot { background-image: url(@bg1); }
</style>`,
    }
    const mapping = [makeMapping({ visualMeta: { fillsSummary: 'linear-gradient(180deg, #000 0%, #fff 100%)' } })]
    const fixes = injectFailedResourceFallbacks(allFiles, mapping)
    expect(fixes.length).toBe(1)
    expect(fixes[0].method).toContain('style-url')
    expect(allFiles['package/index.vue']).toContain("url('linear-gradient(180deg, #000 0%, #fff 100%)')")
  })

  it('③ <style> 内 url(none)（heal 已剥离引用）→ fallback 值', () => {
    const allFiles = {
      'package/index.vue': `<template>
  <div class="trafficroot"></div>
</template>
<style>
.trafficroot { background-image: url(none); }
</style>
<script>const bg1 = 'xxx';</script>`,
    }
    const mapping = [makeMapping({ visualMeta: { fillsSummary: '#00ff00' } })]
    const fixes = injectFailedResourceFallbacks(allFiles, mapping)
    expect(fixes.length).toBe(1)
    expect(fixes[0].method).toContain('style-none')
    expect(allFiles['package/index.vue']).toContain("url('#00ff00')")
  })

  it('④ 兜底 CSS 类注入（template 引用已被 heal 剥离）', () => {
    const allFiles = {
      'package/index.vue': `<template>
  <div class="trafficroot"></div>
</template>
<style></style>
<script>const bg1 = 'xxx';</script>`,
    }
    const mapping = [makeMapping({ visualMeta: { fillsSummary: '#0000ff' } })]
    const fixes = injectFailedResourceFallbacks(allFiles, mapping)
    expect(fixes.length).toBe(1)
    expect(fixes[0].method).toContain('class-inject')
    expect(allFiles['package/index.vue']).toContain('fb-bg-bg1')
    expect(allFiles['package/index.vue']).toContain("background-image: #0000ff")
  })

  it('⑤ 颜色来源优先级：visualMeta.fillsSummary > cssValue > 默认渐变', () => {
    // 优先级 1: visualMeta.fillsSummary
    const m1 = [makeMapping({ visualMeta: { fillsSummary: '#111' }, cssValue: '#222' })]
    const f1 = { 'package/index.vue': `<template><div class="x" :style="\`url(\${bg1})\`"></div></template><style></style><script>const bg1='x';</script>` }
    injectFailedResourceFallbacks(f1, m1)
    expect(f1['package/index.vue']).toContain("backgroundImage: '#111'")

    // 优先级 2: cssValue（fillsSummary 为空）
    const m2 = [makeMapping({ visualMeta: { fillsSummary: null }, cssValue: '#333' })]
    const f2 = { 'package/index.vue': `<template><div class="x" :style="\`url(\${bg1})\`"></div></template><style></style><script>const bg1='x';</script>` }
    injectFailedResourceFallbacks(f2, m2)
    expect(f2['package/index.vue']).toContain("backgroundImage: '#333'")

    // 优先级 3: 默认渐变（fillsSummary 和 cssValue 都为空）
    const m3 = [makeMapping({ visualMeta: { fillsSummary: null }, cssValue: null })]
    const f3 = { 'package/index.vue': `<template><div class="x" :style="\`url(\${bg1})\`"></div></template><style></style><script>const bg1='x';</script>` }
    injectFailedResourceFallbacks(f3, m3)
    expect(f3['package/index.vue']).toContain('linear-gradient(180deg, #edf4fb, #d6e8f5)')
  })

  it('⑥ 仅处理 previewAnalysisRole="bg"（icon/img 不处理）', () => {
    const allFiles = {
      'package/index.vue': `<template><div class="x" :style="\`url(\${icon1})\`"></div></template><style></style><script>const icon1='x';</script>`,
    }
    const mapping = [makeMapping({ previewAnalysisRole: 'icon', assignedVarName: 'icon1' })]
    const fixes = injectFailedResourceFallbacks(allFiles, mapping)
    expect(fixes.length).toBe(0)
  })

  it('⑦ env BG_AUTO_MOUNT=false 时关闭', () => {
    const orig = process.env.BG_AUTO_MOUNT
    process.env.BG_AUTO_MOUNT = 'false'
    try {
      const allFiles = {
        'package/index.vue': `<template><div class="x" :style="\`url(\${bg1})\`"></div></template><style></style><script>const bg1='x';</script>`,
      }
      const mapping = [makeMapping()]
      const fixes = injectFailedResourceFallbacks(allFiles, mapping)
      expect(fixes.length).toBe(0)
    } finally {
      if (orig === undefined) delete process.env.BG_AUTO_MOUNT
      else process.env.BG_AUTO_MOUNT = orig
    }
  })

  it('无失败资源时返回空数组', () => {
    const allFiles = { 'package/index.vue': '<template><div></div></template>' }
    const mapping = [makeMapping({ downloadStatus: 'success' })]
    const fixes = injectFailedResourceFallbacks(allFiles, mapping)
    expect(fixes.length).toBe(0)
  })
})

/**
 * 🛡️ C1（2026-09-07，#568）：同图多别名去重。
 *
 * 背景：同一张背景图被 LLM 以多个别名（bg4~bg14）绑进多层 spread 嵌套 :style，
 * 最终只生效一张，其余都是噪音。根因是 figma-connector 按 Figma 节点分配编号，
 * 同一张图可能被多个容器节点引用。
 *
 * 修复策略：按 resourceFile 聚合所有 success 的 bg 资源，若同一 resourceFile
 * 有 ≥2 个 mapping，选评分最高者保留，剥离其余别名的模板引用。
 */
describe('dedupeSameImageAliases: C1 同图多别名去重', () => {
  const makeMapping = (overrides: Record<string, any> = {}) => ({
    previewAnalysisRole: 'bg',
    downloadStatus: 'success',
    assignedVarName: 'bg1',
    semanticVarName: null,
    resourceFile: 'resources/images/bg.png',
    mountTarget: 'container-root',
    targetDomHint: 'container',
    figmaPath: 'frame/bg',
    name: 'bg-[m]',
    ...overrides,
  })

  it('⭐ 同图多别名 → 只保留评分最高者，剥离其余引用', () => {
    const allFiles = {
      'package/index.vue': `<template>
  <div class="outer" :style="{ backgroundImage: \`url(\${bg4})\` }">
    <div class="inner" :style="{ backgroundImage: \`url(\${bg5})\` }"></div>
  </div>
</template>
<style></style>`,
    }
    // bg4 和 bg5 指向同一张图，bg4 的 mountTarget 匹配 outer（评分更高）
    const mapping = [
      makeMapping({ assignedVarName: 'bg4', mountTarget: 'outer', targetDomHint: 'outer container' }),
      makeMapping({ assignedVarName: 'bg5', mountTarget: 'inner', targetDomHint: 'inner container' }),
    ]
    const result = dedupeSameImageAliases(allFiles, mapping)
    expect(result.fixes.length).toBe(1)
    expect(result.fixes[0].keptVar).toBe('bg4')
    expect(result.fixes[0].removedVar).toBe('bg5')
    // bg5 的引用被剥离（inner 的 :style 只有 background，整条删除）
    expect(result.files['package/index.vue']).not.toContain('bg5')
    // bg4 保留
    expect(result.files['package/index.vue']).toContain('bg4')
  })

  it('不同图不触发去重', () => {
    const allFiles = {
      'package/index.vue': `<template>
  <div class="a" :style="{ backgroundImage: \`url(\${bg1})\` }"></div>
  <div class="b" :style="{ backgroundImage: \`url(\${bg2})\` }"></div>
</template>
<style></style>`,
    }
    const mapping = [
      makeMapping({ assignedVarName: 'bg1', resourceFile: 'resources/images/a.png' }),
      makeMapping({ assignedVarName: 'bg2', resourceFile: 'resources/images/b.png' }),
    ]
    const result = dedupeSameImageAliases(allFiles, mapping)
    expect(result.fixes.length).toBe(0)
    expect(result.files['package/index.vue']).toContain('bg1')
    expect(result.files['package/index.vue']).toContain('bg2')
  })

  it('只有一个别名被引用时不去重', () => {
    const allFiles = {
      'package/index.vue': `<template>
  <div class="root" :style="{ backgroundImage: \`url(\${bg1})\` }"></div>
</template>
<style></style>`,
    }
    const mapping = [
      makeMapping({ assignedVarName: 'bg1', resourceFile: 'resources/images/same.png' }),
      makeMapping({ assignedVarName: 'bg2', resourceFile: 'resources/images/same.png' }),
    ]
    const result = dedupeSameImageAliases(allFiles, mapping)
    // bg2 未被引用，不触发去重
    expect(result.fixes.length).toBe(0)
    expect(result.files['package/index.vue']).toContain('bg1')
  })

  it('空 mapping 返回空 fixes', () => {
    const allFiles = { 'package/index.vue': '<template><div></div></template>' }
    const result = dedupeSameImageAliases(allFiles, [])
    expect(result.fixes.length).toBe(0)
  })
})

/**
 * 🛡️ C2（2026-09-07，#568）：空壳解绑。
 *
 * 背景：T1 标题剥离后，原父容器 div 残留 `:style="{ backgroundImage: \`url(${bg4})\` }"`
 * 绑定变成空壳（只有 background 引用，无 class/子内容），导致运行时 ReferenceError。
 *
 * 修复策略：扫描所有 .vue 文件的 template 段，匹配只有 :style 绑定的 div 标签
 * （无 class），检查 :style 内是否仅含 background 相关属性且引用了死变量，
 * 是则删除整个 :style 属性。
 */
describe('stripEmptyShellBindings: C2 空壳解绑', () => {
  const makeMapping = (overrides: Record<string, any> = {}) => ({
    previewAnalysisRole: 'bg',
    downloadStatus: 'success',
    assignedVarName: 'bg1',
    semanticVarName: null,
    resourceFile: 'resources/images/bg.png',
    mountTarget: 'container-root',
    targetDomHint: 'container',
    figmaPath: 'frame/bg',
    name: 'bg-[m]',
    ...overrides,
  })

  it('⭐ 空壳 div（只有 :style 无 class，引用死变量）→ :style 被删除', () => {
    const allFiles = {
      'package/index.vue': `<template>
  <div :style="{ backgroundImage: \`url(\${bg4})\` }"></div>
</template>
<style></style>`,
    }
    // bg4 不在 mapping 中（死变量）
    const mapping = [makeMapping({ assignedVarName: 'bg1' })]
    const result = stripEmptyShellBindings(allFiles, mapping)
    expect(result.fixes.length).toBe(1)
    expect(result.fixes[0].file).toBe('package/index.vue')
    expect(result.fixes[0].vars).toContain('bg4')
    expect(result.files['package/index.vue']).not.toContain(':style')
  })

  it('有 class 的 div 不处理', () => {
    const allFiles = {
      'package/index.vue': `<template>
  <div class="shell" :style="{ backgroundImage: \`url(\${bg4})\` }"></div>
</template>
<style></style>`,
    }
    const mapping = [makeMapping({ assignedVarName: 'bg1' })]
    const result = stripEmptyShellBindings(allFiles, mapping)
    expect(result.fixes.length).toBe(0)
    expect(result.files['package/index.vue']).toContain(':style')
  })

  it(':style 含非 background 属性时保留', () => {
    const allFiles = {
      'package/index.vue': `<template>
  <div :style="{ backgroundImage: \`url(\${bg4})\`, color: 'red' }"></div>
</template>
<style></style>`,
    }
    const mapping = [makeMapping({ assignedVarName: 'bg1' })]
    const result = stripEmptyShellBindings(allFiles, mapping)
    expect(result.fixes.length).toBe(0)
    expect(result.files['package/index.vue']).toContain(':style')
  })

  it('所有变量都可用时不清理', () => {
    const allFiles = {
      'package/index.vue': `<template>
  <div :style="{ backgroundImage: \`url(\${bg1})\` }"></div>
</template>
<style></style>`,
    }
    const mapping = [makeMapping({ assignedVarName: 'bg1' })]
    const result = stripEmptyShellBindings(allFiles, mapping)
    expect(result.fixes.length).toBe(0)
    expect(result.files['package/index.vue']).toContain(':style')
  })

  it('空 mapping 返回空 fixes', () => {
    const allFiles = { 'package/index.vue': '<template><div></div></template>' }
    const result = stripEmptyShellBindings(allFiles, [])
    expect(result.fixes.length).toBe(0)
  })
})
