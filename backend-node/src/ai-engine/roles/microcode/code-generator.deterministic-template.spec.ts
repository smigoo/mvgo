import { jest } from '@jest/globals'

// ⚠️ 加载期拦截：下列模块内部使用 import.meta，jest CJS 模式下直接 import 会加载失败。
// 与 code-generator.parse-failure.spec.ts 同款替身，避免触发 import.meta 解析错误。
jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  backendRoot: process.cwd(),
  projectRoot: process.cwd(),
  logsDir: require('os').tmpdir(),
  dataDir: require('os').tmpdir(),
  tempComponentsDir: require('os').tmpdir(),
}), { virtual: true })

jest.mock('../../utils/sfc-semantics.js', () => ({
  dedupeScriptImports: (s: string) => s,
  dedupeScriptDeclarations: (s: string) => s,
  dedupeMcComponentBuilder: (s: string) => s,
  dedupeLifecycleHooks: (s: string) => s,
  validateVueScriptSemantics: () => ({ issues: [] }),
  extractComponentTagNames: () => [],
  VUE_BUILTIN_COMPONENTS: [],
}))

jest.mock('../../utils/prompt-loader.js', () => ({
  loadMd: () => '',
  validatePromptsDir: () => true,
  buildSharedSections: () => '',
  trimConstraintsForContext: (c = '') => c,
  buildConcerns: () => '',
  formatAssetsList: () => '',
  buildTextInventorySection: () => '',
  buildStructureMarkersSection: () => '',
  buildFigmaStage: () => '',
}))

jest.mock('../../utils/resource-import-guard.js', () => ({
  extractResourceVarNames: () => [],
  resolveResourceDomMapping: () => ({}),
}))

jest.mock('../../utils/provider-pool.js', () => ({
  getProviderPool: () => ({ recordTimeout: () => {}, get: () => null }),
}))

jest.mock('../../utils/llm-timeout.js', () => ({ invokeWithTimeout: jest.fn() }))

import { buildDeterministicIndexTemplate, applyDeterministicIndexTemplate, findRootTemplateBlock, siblingGapStyle, stripUnplannedSubComponentImports, containChartRefInsidePanel, flexItemStyleFromWidths, flexItemStyleFromHeights, resolveSectionFlexSize } from './code-generator.js'
import { stripSurplusBlockClosers } from './file-writer.js'
import { indexFigmaNodes } from '../../utils/section-tree.js'
import { pruneDeadSubComponentImports } from './resource-mounter.js'

// 模拟 planner 的 effectiveSections（device-monitor 实锤：header + switch + tabs + section-main）
function makeInput(sections: any, componentName = 'device-monitor') {
  return {
    componentName,
    panelType: 'default-panel',
    subComponentPlan: { effectiveSections: sections, isForced: true },
  }
}

const deviceSections = [
  { id: '2:8419', type: 'header', responsibility: '顶部标题区' },
  { id: '89:38', type: 'switch', responsibility: 'switch（请按功能拆分）' },
  { id: '89:37', type: 'tabs', responsibility: '标签页切换区' },
  { id: 'section-main', type: 'body', responsibility: '主内容区' },
]

describe('层① 确定性 index.vue 模板装配', () => {
  test('有计划子组件 → 返回确定性模板（base-panel + header 插槽 + 子组件标签）', () => {
    const facts = buildDeterministicIndexTemplate(makeInput(deviceSections))
    expect(facts).not.toBeNull()
    const tpl = facts!.template
    expect(tpl).toContain('<base-panel panelKey="default-panel">')
    expect(tpl).toContain('<template #header-right>')
    expect(tpl).toContain('<HeaderSection />')
    // 🛡️ P5（2026-09-17）：叶子子组件标签内联传导样式（flex:1;min-height:0）
    expect(tpl).toContain('<SwitchSection style="flex:1;min-height:0;" />')
    expect(tpl).toContain('<TabsSection style="flex:1;min-height:0;" />')
    expect(tpl).toContain('<MainSection style="flex:1;min-height:0;" />')
    expect(tpl).toContain('class="c-device-monitor-slot-con" style="display:flex;flex-direction:column;"')
    expect(tpl.indexOf('<SwitchSection')).toBeLessThan(tpl.indexOf('<TabsSection'))
    expect(tpl.indexOf('<TabsSection')).toBeLessThan(tpl.indexOf('<MainSection'))
    // 🛡️ R1-2：facts 单一事实源（rootContainerClass + sectionRoots）
    expect(facts!.rootContainerClass).toBe('c-device-monitor-slot-con')
    expect(facts!.sectionRoots.map((s) => s.component)).toEqual([
      'HeaderSection', 'SwitchSection', 'TabsSection', 'MainSection',
    ])
    // 🛡️ 推 A：确定性子组件文件集（index 层「引用谁」唯一事实源）
    expect(facts!.componentFiles.sort()).toEqual([
      'HeaderSection', 'MainSection', 'SwitchSection', 'TabsSection',
    ])
  })

  test('同 type 多 section：去重改为语义后缀（替代裸序号 2/3）', () => {
    // 2026-09-14 命名治本：同类型多 section 不再用 ContentSection2/MainSection2 这类裸序号，
    // 而按 section.id/title 派生确定性 PascalCase 后缀（Main + id 段 → MainA/MainB）。
    const secs = [
      { id: 'a', type: 'body', responsibility: '主内容区' },
      { id: 'b', type: 'body', responsibility: '副内容区' },
    ]
    const facts = buildDeterministicIndexTemplate(makeInput(secs))
    const tpl = facts!.template
    expect(tpl).toContain('<MainA style="flex:1;min-height:0;" />')
    expect(tpl).toContain('<MainB style="flex:1;min-height:0;" />')
    expect(tpl).not.toContain('<MainSection2 />') // 不再产出裸序号
  })

  test('水平 flex 子项按 Figma 宽度比例分配，tabs 46 / cons 367 不能均分', () => {
    // 🛡️ P6 wrapper 容器化合并（2026-09-17）：helper 只输出比例 + min 约束，
    //   display:flex 随 wrapper 消失，由目标元素（容器/子组件根）自身承载。
    expect(flexItemStyleFromWidths([46, 367], 0)).toBe('flex:0.111;min-width:0;')
    expect(flexItemStyleFromWidths([46, 367], 1)).toBe('flex:0.889;min-width:0;')
    expect(flexItemStyleFromWidths([0, 0], 0)).toBe('flex:1;min-width:0;')
    expect(flexItemStyleFromHeights([32, 207], 0)).toBe('flex:0.134;min-height:0;')
    expect(flexItemStyleFromHeights([0, 0], 0)).toBe('flex:1;min-height:0;')
    const secs = [{
      id: '89:40',
      name: 'slot-con',
      isLayoutContainer: true,
      layout: 'vertical',
      children: [{
        id: '89:37',
        name: '@antd/tab',
        isLayoutContainer: true,
        layout: 'horizontal',
        children: [
          { id: '89:39', type: 'tabs', title: 'tabs', absoluteBoundingBox: { width: 46, height: 317 } },
          { id: '2:8437', type: 'body', title: 'cons', absoluteBoundingBox: { width: 367, height: 295 } },
        ],
      }],
    }]
    const tpl = buildDeterministicIndexTemplate(makeInput(secs))!.template
    // P6：比例直接内联到子组件标签（无 wrapper 中转）
    expect(tpl).toContain('<TabsSection style="flex:0.111;min-width:0;" />')
    expect(tpl).toContain('<MainSection style="flex:0.889;min-width:0;" />')
    // P6：不再产出任何纯比例空壳 wrapper div
    expect(tpl).not.toContain('<div style="flex:')
    expect(tpl).not.toMatch(/antd-tab-con[\s\S]*flex:1;min-width:0;[\s\S]*flex:1;min-width:0;/)
  })

  test('无计划子组件 → 返回 null（回退 LLM 生成）', () => {
    expect(buildDeterministicIndexTemplate(makeInput([]))).toBeNull()
    expect(buildDeterministicIndexTemplate({ componentName: 'x', subComponentPlan: null } as any)).toBeNull()
  })

  test('无 header section → 不生成 header 插槽', () => {
    const secs = [{ id: '89:37', type: 'tabs', responsibility: '标签页' }]
    const facts = buildDeterministicIndexTemplate(makeInput(secs))
    const tpl = facts!.template
    expect(tpl).not.toContain('#header-right')
    expect(tpl).toContain('<TabsSection style="flex:1;min-height:0;" />')
  })

  test('刀 5c：headerSlots 契约 figmaNodeId 匹配 sourceNodeIds → tabs 进 header-right，body 不重复', () => {
    // vehicle 实锤：tabs（标题行控件）与内容区「小标题」都进过 header/body 双轨。
    // 治本：header-right 只消费 headerSlots 契约命中的 node；body 排除同 node（只落一次）。
    const secs = [
      { id: '2:7954', type: 'tabs', responsibility: '标签页切换区', sourceNodeIds: ['2:7954'] },
      { id: '2:7959', type: 'content', responsibility: '小标题', sourceNodeIds: ['2:7959'] },
      { id: 'section-cards', type: 'stats', responsibility: '统计卡片区', sourceNodeIds: ['2:8023'] },
    ]
    const input = makeInput(secs)
    ;(input as any).headerSlots = [
      { slotType: 'header-right', elementType: 'tab', figmaNodeId: '2:7954', content: '危化/重型/超高' },
    ]
    const facts = buildDeterministicIndexTemplate(input)
    const tpl = facts!.template
    expect(tpl).toContain('<template #header-right>')
    expect(tpl).toContain('<TabsSection />')
    // 核心：body（slot-con 之后）不再出现 TabsSection（同 figmaNodeId 只落一次，杜绝双轨）
    const slotConIdx = tpl.indexOf('slot-con')
    const bodyPart = tpl.slice(slotConIdx)
    expect(bodyPart).not.toContain('<TabsSection')
    // 统计卡叶子仍在 body
    expect(bodyPart).toContain('<StatsSection')
  })

  test('刀 5c：无 headerSlots 契约 → 回退 type==="header" 二分（旧行为零回归）', () => {
    const secs = [
      { id: '2:8419', type: 'header', responsibility: '顶部标题区' },
      { id: '89:37', type: 'tabs', responsibility: '标签页切换区' },
    ]
    const facts = buildDeterministicIndexTemplate(makeInput(secs))
    expect(facts!.template).toContain('<HeaderSection />')
    expect(facts!.template).toContain('<TabsSection style="flex:1;min-height:0;" />')
  })

  test('E1 治本：容器嵌套保留（switch/@antd-tab 生成 wrapper div，不拍平叶子）', () => {
    // device-monitor 实锤：con 容器下 switch（active/default）+ @antd/tab（tabs/cons），
    // 旧实现拍平叶子导致 switch 与 tab 全部平级 flex（用户指正「switch 没组成一个元素」）。
    const tree = [
      { id: '2:8419', type: 'header', responsibility: '顶部标题区' },
      {
        id: '89:40', type: 'container', name: 'con', isLayoutContainer: true,
        responsibility: '纵向布局容器',
        // 🛡️ 2026-09-30 P0-1：容器**必须携带显式 layout**（真实管线里 E1 恒从 A 类事实写入；
        //   字段缺失 = 「无事实」⇒ 写产物层按四分支**不内联方向**）。此处显式声明 vertical，
        //   保持本用例原意（验证 P6 wrapper 合并 + 容器 div 吃父比例）。
        layout: 'vertical',
        children: [
          {
            id: '89:38', type: 'container', name: 'switch', isLayoutContainer: true,
            responsibility: '纵向布局容器',
            layout: 'vertical',
            children: [
              { id: '2:8787', type: 'content', name: 'active', responsibility: 'active' },
              { id: '2:8806', type: 'content', name: 'default', responsibility: 'default' },
            ],
          },
          {
            id: '89:37', type: 'container', name: '@antd/tab', isLayoutContainer: true,
            responsibility: '纵向布局容器',
            layout: 'vertical',
            children: [
              { id: '89:39', type: 'tabs', responsibility: '标签页切换区' },
              { id: '2:8437', type: 'content', name: 'cons', responsibility: 'cons' },
            ],
          },
        ],
      },
    ]
    const facts = buildDeterministicIndexTemplate(makeInput(tree))
    const tpl = facts!.template
    // header 进插槽
    expect(tpl).toContain('<template #header-right>')
    expect(tpl).toContain('<HeaderSection />')
    // 容器生成 wrapper div，子叶子归属正确
    expect(tpl).toContain('c-device-monitor-switch-con')
    expect(tpl).toContain('c-device-monitor-antd-tab-con')
    // 结构顺序：switch 容器在 active/default 之前，active/default 在 antd-tab 容器之前，
    // tabs 在 antd-tab 容器之后（验证容器包裹关系，不拍平）
    const switchIdx = tpl.indexOf('c-device-monitor-switch-con')
    const tabIdx = tpl.indexOf('c-device-monitor-antd-tab-con')
    const tabsIdx = tpl.indexOf('<TabsSection')
    expect(switchIdx).toBeGreaterThan(-1)
    expect(tabIdx).toBeGreaterThan(-1)
    expect(switchIdx).toBeLessThan(tabIdx)
    expect(tabIdx).toBeLessThan(tabsIdx)
    // 🛡️ P6 wrapper 容器化合并：容器 div 直接吃父比例（本例 con-con 无父分配 → flex:1;min-height:0）
    //   + 对子方向（本例两个容器显式 layout='vertical' → column）；
    //   无任何纯比例空壳 wrapper。
    expect(tpl).toContain('c-device-monitor-switch-con" data-section-id="89:38" style="flex:1;min-height:0;display:flex;flex-direction:column;"')
    expect(tpl).toContain('c-device-monitor-antd-tab-con" data-section-id="89:37" style="flex:1;min-height:0;display:flex;flex-direction:column;"')
    // P6：模板中不再有 wrapper 空壳 div（纯 style 无 class 的 div）
    expect(tpl).not.toContain('<div style="flex:')
    // switch 容器的闭合 div 必须在 antd-tab 容器开始之后（两个容器互不嵌套、平级包裹各自叶子）
    expect(tpl.indexOf('</div>', switchIdx)).toBeLessThan(tabIdx)
  })

  /**
   * 🛡️ 2026-09-30 复审 P0-1：`section.layout` 取值域扩到 {horizontal, vertical, grid, null} 后，
   *   容器写产物层（`code-generator.js:649`）必须是**四分支**，不能再是二值三元
   *   （旧口径把 `grid`/`null` 一律内联成 `flex-direction:column`，内联优先级压过 class 规则）。
   */
  describe('P0-1 容器四分支（grid / null 不再退化成 column）', () => {
    const containerWith = (layout: unknown, extra: Record<string, unknown> = {}) => [
      {
        id: 'c1',
        type: 'container',
        name: 'wrap',
        isLayoutContainer: true,
        responsibility: '容器',
        layout,
        ...extra,
        children: [{ id: 'k1', type: 'content', name: 'main', responsibility: 'main' }],
      },
    ]
    // ⚠️ 断言必须精确到**容器 div 自身的 style 属性**：模板里 `slot-con` 本身恒含
    //    `display:flex;flex-direction:column`，用全局 not.toContain 会误判。
    const wrapStyle = (layout: unknown, extra?: Record<string, unknown>) => {
      const tpl = buildDeterministicIndexTemplate(makeInput(containerWith(layout, extra)))!.template
      const m = tpl.match(/c-device-monitor-wrap-con" data-section-id="c1" style="([^"]*)"/)
      expect(m).not.toBeNull()
      return m![1]
    }

    test('horizontal → display:flex;flex-direction:row + align-items:stretch', () => {
      const s = wrapStyle('horizontal')
      expect(s).toContain('display:flex;flex-direction:row;')
      expect(s).toContain('align-items:stretch;')
    })

    test('vertical → display:flex;flex-direction:column（无 align-items）', () => {
      const s = wrapStyle('vertical')
      expect(s).toContain('display:flex;flex-direction:column;')
      expect(s).not.toContain('align-items:stretch')
    })

    test('⭐ grid + gridColumns → display:grid + repeat(N,1fr)（旧口径会写成 column）', () => {
      const s = wrapStyle('grid', { gridColumns: 3 })
      expect(s).toContain('display:grid;grid-template-columns:repeat(3,1fr);')
      expect(s).not.toContain('flex-direction')
    })

    test('grid 无列数 → 只写 display:grid，不臆造列数', () => {
      const s = wrapStyle('grid')
      expect(s).toContain('display:grid;')
      expect(s).not.toContain('grid-template-columns')
      expect(s).not.toContain('flex-direction')
    })

    test('⭐ layout = null（无事实）→ 不内联 display / 方向（交 common.less 与 2.11）', () => {
      const s = wrapStyle(null)
      expect(s).not.toContain('display:flex')
      expect(s).not.toContain('display:grid')
      expect(s).not.toContain('flex-direction')
      // flex 比例仍保留（它是父容器的 flex item，与自身 display 无关）
      expect(s).toContain('flex:1;min-height:0;')
    })

    test('布局取值未知（拼写错误串）→ 同样不臆造（等同无事实）', () => {
      const s = wrapStyle('HORIZONTAL ')
      expect(s).not.toContain('flex-direction')
      expect(s).not.toContain('display:')
    })
  })

  test('E1 治本：headerSlots 编造 id 匹配不到 → 回退 type=header 二分（header 不丢）', () => {
    // device-monitor 实锤：headerSlots 契约 figmaNodeId 是 vision 编造 id（8:3/8:4/8:5），
    // 真实 header 叶子 sourceNodeIds 是 2:8419 → 匹配不到 → header 整个丢失。
    const secs = [
      { id: '2:8419', type: 'header', responsibility: '顶部标题区', sourceNodeIds: ['2:8419'] },
      { id: '89:37', type: 'tabs', responsibility: '标签页切换区' },
    ]
    const input = makeInput(secs)
    ;(input as any).headerSlots = [
      { slotType: 'header-right', elementType: 'statistic', figmaNodeId: '8:3' },
      { slotType: 'header-right', elementType: 'statistic', figmaNodeId: '8:4' },
    ]
    const facts = buildDeterministicIndexTemplate(input)
    expect(facts!.template).toContain('<template #header-right>')
    expect(facts!.template).toContain('<HeaderSection />')
  })

  describe('刀 7 容器吸收背景层（8bbcf027 `36:1695` 实锤）', () => {
    // 真值几何逐字段抄录：容器 801:3 (24745,51499) 547×493；
    // 底卡 36:1695 (24745,51799) 547×193 #E1EBFF r12 —— 左右底三边与容器贴合。
    const CONTAINER_BOX = { x: 24745, y: 51499, width: 547, height: 493 }
    const BG_FILL = {
      type: 'SOLID', visible: true,
      color: { r: 0.8811598420143127, g: 0.9216160774230957, b: 1, a: 1 },
    }
    const figmaNodeData = {
      document: {
        id: '0:0', type: 'FRAME',
        children: [{
          id: '801:3', type: 'GROUP', name: 'slot-icon', absoluteBoundingBox: CONTAINER_BOX,
          children: [
            { id: '36:1695', type: 'RECTANGLE', absoluteBoundingBox: { x: 24745, y: 51799, width: 547, height: 193 }, fills: [BG_FILL], cornerRadius: 12 },
            { id: '36:1708', type: 'TEXT', characters: '产品描述', absoluteBoundingBox: { x: 24772, y: 51824, width: 64, height: 16 } },
            { id: '36:1719', type: 'TEXT', characters: '长描述', absoluteBoundingBox: { x: 24772, y: 51849, width: 496, height: 90 } },
          ],
        }],
      },
    }
    const secs = [{
      id: '801:3', name: 'slot-icon', isLayoutContainer: true, layout: 'vertical',
      sourceNodeIds: ['801:3', '36:1695', '36:1708', '36:1719'],
      children: [
        { id: '801:3-orphan-text-2', type: 'content', sourceNodeIds: ['36:1708'], absoluteBoundingBox: { width: 64, height: 16 } },
        { id: '801:3-orphan-text-3', type: 'content', sourceNodeIds: ['36:1719'], absoluteBoundingBox: { width: 496, height: 90 } },
      ],
    }]

    test('⭐ 未被认领的 SOLID 底卡 ⇒ 容器 position:relative + 绝对定位背景层（真值 rgba/r12/边锚定）', () => {
      const input = { ...makeInput(secs), figmaNodeData }
      const tpl = buildDeterministicIndexTemplate(input)!.template
      expect(tpl).toContain('data-absorbed-bg="36:1695"')
      expect(tpl).toContain('background:rgba(225,235,255,1);')
      expect(tpl).toContain('border-radius:12px;')
      expect(tpl).toContain('left:0;right:0;bottom:0;height:193px;')
      expect(tpl).toContain('z-index:-1;')
      // 容器 div 必须 position:relative（绝对定位参照）
      expect(tpl).toMatch(/data-section-id="801:3" style="[^"]*position:relative;/)
      // 刀 7b（ad8939a5 真机实锤）：relative 不成层叠上下文 ⇒ z-index:-1 层沉到 base-panel
      // 面板底之下不可见 ⇒ 容器必须 isolation:isolate 把负层圈在本容器内
      expect(tpl).toMatch(/data-section-id="801:3" style="[^"]*isolation:isolate;/)
      // 背景层必须先于容器内首个子组件标签（沉底语义；子组件名由 assignSectionComponentNames 派生）
      const firstChildTag = tpl.search(/<Content\w+ /)
      expect(firstChildTag).toBeGreaterThan(-1)
      expect(tpl.indexOf('data-absorbed-bg="36:1695"')).toBeLessThan(firstChildTag)
    })

    test('反向：无 figmaNodeData ⇒ 零行为变化（fail-open，模板不含背景层）', () => {
      const tpl = buildDeterministicIndexTemplate(makeInput(secs))!.template
      expect(tpl).not.toContain('data-absorbed-bg')
      expect(tpl).not.toContain('position:relative')
    })

    test('反向：底卡被叶子认领 ⇒ 不出层', () => {
      const claimed = [{
        ...secs[0],
        sourceNodeIds: ['801:3', '36:1695', '36:1708', '36:1719'],
        children: [
          { id: '801:3-orphan-text-3', type: 'content', sourceNodeIds: ['36:1719', '36:1695'], absoluteBoundingBox: { width: 496, height: 90 } },
        ],
      }]
      const input = { ...makeInput(claimed), figmaNodeData }
      const tpl = buildDeterministicIndexTemplate(input)!.template
      expect(tpl).not.toContain('data-absorbed-bg')
    })

    test('⭐ 嵌套容器重复吸收同一矩形（c-a0f93b 实锤）⇒ 最近容器独占，只出一层', () => {
      // 外层 796:3 与内层 38:3137 的 sourceNodeIds 都含矩形 38:3138。
      const rect = { id: '38:3138', type: 'RECTANGLE', absoluteBoundingBox: { x: 100, y: 209, width: 300, height: 161 }, fills: [BG_FILL], cornerRadius: 8 }
      const nestedFigma = {
        document: {
          id: '0:0', type: 'FRAME',
          children: [{
            id: '796:3', type: 'GROUP', absoluteBoundingBox: { x: 100, y: 100, width: 300, height: 500 },
            children: [
              {
                id: '38:3137', type: 'GROUP', absoluteBoundingBox: { x: 100, y: 209, width: 300, height: 161 },
                children: [
                  rect,
                  { id: '38:3139', type: 'TEXT', characters: 't', absoluteBoundingBox: { x: 120, y: 230, width: 60, height: 16 } },
                ],
              },
            ],
          }],
        },
      }
      const nestedSecs = [{
        id: '796:3', name: 'slot-outer', isLayoutContainer: true, layout: 'vertical',
        sourceNodeIds: ['796:3', '38:3137', '38:3138', '38:3139'],
        children: [{
          id: '38:3137', name: 'inner', isLayoutContainer: true, layout: 'vertical',
          sourceNodeIds: ['38:3137', '38:3138', '38:3139'],
          absoluteBoundingBox: { width: 300, height: 161 },
          children: [
            { id: '38:3139-t', type: 'content', sourceNodeIds: ['38:3139'], absoluteBoundingBox: { width: 60, height: 16 } },
          ],
        }],
      }]
      const input = { ...makeInput(nestedSecs), figmaNodeData: nestedFigma }
      const tpl = buildDeterministicIndexTemplate(input)!.template
      // 只出一层，且挂在**内层**容器（38:3137 的 div 内、四边 0）
      expect(tpl.match(/data-absorbed-bg="38:3138"/g)!.length).toBe(1)
      expect(tpl).toContain('left:0;right:0;top:0;bottom:0;')
      // 外层容器不得带 position:relative（它名下无层）
      const outerLine = tpl.split('\n').find((l) => l.includes('data-section-id="796:3"')) || ''
      expect(outerLine).not.toContain('position:relative')
      const innerLine = tpl.split('\n').find((l) => l.includes('data-section-id="38:3137"')) || ''
      expect(innerLine).toContain('position:relative')
    })
  })
})

describe('层① pruneDeadSubComponentImports（删死 import）', () => {
  test('删除模板未引用的 ./components/X.vue import', () => {
    const content = `<template><div class="x"><TabsSection /></div></template>
<script setup>
import TabsSection from './components/TabsSection.vue'
import MainSection from './components/MainSection.vue'
import { ref } from 'vue'
const x = ref(0)
</script>`
    const out = pruneDeadSubComponentImports(content)
    expect(out).toContain("import TabsSection from './components/TabsSection.vue'")
    expect(out).not.toContain("import MainSection from './components/MainSection.vue'")
    expect(out).toContain("import { ref } from 'vue'")
  })

  test('保留 :is="X" 动态引用的子组件 import', () => {
    const content = `<template><component :is="DynamicComp" /></template>
<script setup>
import DynamicComp from './components/DynamicComp.vue'
</script>`
    const out = pruneDeadSubComponentImports(content)
    expect(out).toContain("import DynamicComp from './components/DynamicComp.vue'")
  })

  test('无死 import 时原样返回', () => {
    const content = `<template><div><TabsSection /></div></template>
<script setup>
import TabsSection from './components/TabsSection.vue'
</script>`
    expect(pruneDeadSubComponentImports(content)).toBe(content)
  })
})

// ──────────────────────────────────────────────
// 🛡️ 推 A（2026-09-14 · mc-max-1789376057659-2290591b 实锤）：索引层「引用谁」的确定性约束
// ──────────────────────────────────────────────
describe('stripUnplannedSubComponentImports（剥离未规划子组件 import）', () => {
  const CNT = (script: string) => `<template><div class="x"><ContentSection /></div></template>
<script setup>
${script}
</script>`

  test('规划外静态 import 被剥离，规划内保留（2290591b 形态）', () => {
    // 2290591b：规划只有 ContentSection，LLM 却 import 了未生成的 SubHeaderSection
    const content = CNT(`import ContentSection from './components/ContentSection.vue'
import SubHeaderSection from './components/SubHeaderSection.vue'`)
    const out = stripUnplannedSubComponentImports(content, ['ContentSection'])
    expect(out).toContain("import ContentSection from './components/ContentSection.vue'")
    expect(out).not.toContain("import SubHeaderSection")
  })

  test('规划外 defineAsyncComponent 动态 import 表达式被消除', () => {
    const content = CNT(`const SubHeaderSection = defineAsyncComponent(() => import('./components/SubHeaderSection.vue'))`)
    const out = stripUnplannedSubComponentImports(content, ['ContentSection'])
    expect(out).not.toContain("import('./components/SubHeaderSection.vue')")
    expect(out).toContain('SubHeaderSection') // 变量声明保留（仅去 import 表达式，不破坏语法链）
  })

  test('全部规划内 → 原样返回（零改动）', () => {
    const content = CNT(`import ContentSection from './components/ContentSection.vue'
import HeaderSection from './components/HeaderSection.vue'`)
    expect(stripUnplannedSubComponentImports(content, ['ContentSection', 'HeaderSection'])).toBe(content)
  })

  test('allowed 为空 → 不剥离（向后兼容无规划信息场景）', () => {
    const content = CNT(`import X from './components/X.vue'`)
    expect(stripUnplannedSubComponentImports(content, [])).toBe(content)
  })

  test('不触碰非 ./components/ 的 import（vue / 外部库保留）', () => {
    const content = CNT(`import { ref } from 'vue'
import ContentSection from './components/ContentSection.vue'`)
    const out = stripUnplannedSubComponentImports(content, ['ContentSection'])
    expect(out).toContain("import { ref } from 'vue'")
    expect(out).toBe(content)
  })

  test('空/畸形输入 fail-open 原样返回', () => {
    expect(stripUnplannedSubComponentImports('', ['A'])).toBe('')
    expect(stripUnplannedSubComponentImports(null as any, ['A'])).toBeNull()
  })
})

describe('E3-1 containChartRefInsidePanel（chartRef 容器位置收口，2026-09-16 12bc3750）', () => {
  test('⭐ chartRef 在 base-panel 外 → 移回 base-panel 内', () => {
    const input = [
      '<template>',
      '  <base-panel panelKey="default-panel">',
      '    <div class="c-x-slot-con">',
      '      <ListSection />',
      '    </div>',
      '  </base-panel>',
      '  <div ref="chartRef" class="c-x-chart" style="width:100%;height:100%"></div>',
      '</template>',
    ].join('\n')
    const out = containChartRefInsidePanel(input, {})
    expect(out.indexOf('ref="chartRef"')).toBeLessThan(out.indexOf('</base-panel>'))
  })

  test('chartRef 已在 base-panel 内 → 原样返回（零误伤）', () => {
    const input = '<template>\n  <base-panel>\n    <div class="slot-con">\n      <div ref="chartRef"></div>\n    </div>\n  </base-panel>\n</template>'
    expect(containChartRefInsidePanel(input, {})).toBe(input)
  })

  test('无 chartRef / 无 base-panel → 原样返回', () => {
    expect(containChartRefInsidePanel('<template><div>x</div></template>', {})).toBe('<template><div>x</div></template>')
    expect(containChartRefInsidePanel('', {})).toBe('')
  })
})

describe('resolveSectionFlexSize / 装配回查 Figma bbox（d70a19bf）', () => {
  test('树上无 bbox 时按 figmaNodeId / sourceNodeIds 回查宽度', () => {
    const figma = {
      document: {
        id: 'root', name: 'root', type: 'FRAME',
        children: [
          { id: '3:74', name: 'left', type: 'FRAME', absoluteBoundingBox: { x: 303, y: 2282, width: 220, height: 170 } },
          { id: '287:4', name: 'chart', type: 'FRAME', absoluteBoundingBox: { x: 561, y: 2267, width: 207, height: 207 } },
          { id: '3:110', name: 'right', type: 'FRAME', absoluteBoundingBox: { x: 806, y: 2282, width: 220, height: 170 } },
        ],
      },
    }
    const index = indexFigmaNodes(figma.document)
    expect(resolveSectionFlexSize({ id: '287:5-left', sourceNodeIds: ['3:74'] }, index, 'width')).toBe(220)
    expect(resolveSectionFlexSize({ id: '287:4', figmaNodeId: '287:4' }, index, 'width')).toBe(207)
    expect(resolveSectionFlexSize({ id: '287:5-right', sourceNodeIds: ['3:110'] }, index, 'width')).toBe(220)
  })

  test('planner 丢掉 bbox 时三栏按 220/207/220 分配，不回退 flex:1', () => {
    const sections = [
      {
        id: '287:6', type: 'container', isLayoutContainer: true, layout: 'horizontal',
        children: [
          { id: '287:5-left', type: 'stats', title: '统计数据-left', sourceNodeIds: ['3:74'] },
          { id: '287:4', type: 'chart', title: '中间图表', figmaNodeId: '287:4' },
          { id: '287:5-right', type: 'stats', title: '统计数据-right', sourceNodeIds: ['3:110'] },
        ],
      },
    ]
    const input = makeInput(sections, 'd70a19')
    ;(input as any).figmaNodeData = {
      document: {
        id: 'root', name: 'cp', type: 'FRAME',
        children: [
          { id: '3:74', name: 'left', type: 'FRAME', absoluteBoundingBox: { x: 303, y: 2282, width: 220, height: 170 } },
          { id: '287:4', name: '中间图表', type: 'FRAME', absoluteBoundingBox: { x: 561, y: 2267, width: 207, height: 207 } },
          { id: '3:110', name: 'right', type: 'FRAME', absoluteBoundingBox: { x: 806, y: 2282, width: 220, height: 170 } },
        ],
      },
    }
    const tpl = buildDeterministicIndexTemplate(input)!.template
    expect(tpl).toContain('flex:0.340;min-width:0;')
    expect(tpl).toContain('flex:0.320;min-width:0;')
    expect(tpl.match(/flex:1;min-width:0;/g) || []).toHaveLength(0)
  })

  test('⭐ 多个「顶层」section 也按 Figma 高度分配比例，不再一律 flex:1（2026-09-28 afd08494 实锤）', () => {
    // 复刻 traffic 结构：slot-con 下三个顶层 section，设计高 556 / 142 / 174。
    // 旧实现 renderBodyNode(root, 0) 不传比例 → 顶层全走 flex:1 兜底 → 1/3 等分。
    const sections = [
      { id: '88:33', type: 'container', isLayoutContainer: true, layout: 'vertical',
        children: [{ id: '88:34', type: 'content', title: '当日总流量' }] },
      { id: '2:3438', type: 'container', isLayoutContainer: true, layout: 'horizontal',
        children: [{ id: '2:3439', type: 'content', title: '车型分布' }] },
      { id: '83:30', type: 'container', isLayoutContainer: true, layout: 'vertical',
        children: [{ id: '83:31', type: 'content', title: '流量预测' }] },
    ]
    const input = makeInput(sections, 'traffic-monitor')
    ;(input as any).figmaNodeData = {
      document: {
        id: 'root', name: 'cp', type: 'FRAME',
        children: [
          { id: '88:33', name: 'slot-当日总流量', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 425, height: 556 } },
          { id: '2:3438', name: 'slot-车型分布', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 556, width: 387, height: 142 } },
          { id: '83:30', name: 'slot-流量预测', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 698, width: 378, height: 174 } },
        ],
      },
    }
    const tpl = buildDeterministicIndexTemplate(input)!.template
    // 556:142:174 → 0.638 / 0.163 / 0.200（归一化 flex-grow）
    expect(tpl).toContain('flex:0.638;min-height:0;')
    expect(tpl).toContain('flex:0.163;min-height:0;')
    expect(tpl).toContain('flex:0.200;min-height:0;')
  })

  test('无高度事实时顶层多 section 行为不变（回落 flex:1，零回归）', () => {
    const sections = [
      { id: 'a', type: 'container', isLayoutContainer: true, layout: 'vertical',
        children: [{ id: 'a1', type: 'content', title: '甲' }] },
      { id: 'b', type: 'container', isLayoutContainer: true, layout: 'vertical',
        children: [{ id: 'b1', type: 'content', title: '乙' }] },
    ]
    const tpl = buildDeterministicIndexTemplate(makeInput(sections, 'no-height'))!.template
    expect(tpl).toContain('flex:1;min-height:0;')
  })
})

// ══════════════════════════════════════════════════════════════════════════
// 🛡️ B（#719 主线 · 2026-09-26 · mc-max-1790420477334-6e065bd7 实锤）
// applyDeterministicIndexTemplate：simple/medium 分支的 index.vue 由 LLM 整文件产出，
// 绕过确定性装配 → 模板子元素顺序与 effectiveSections 脱钩（实锤 chart 被提到 tabs 之前）。
// 治本契约：保留 LLM 的 <script>，仅覆盖 <template> 段。
// ══════════════════════════════════════════════════════════════════════════
describe('#719 B · applyDeterministicIndexTemplate（装配与填值分离）', () => {
  // 复刻 env-monitor 真实结构：89:41 > 89:42[tab 列表] + 2:7898[图表内容]，另挂 chart 叶子
  const envPlan = () => ({
    isForced: true,
    minFiles: 8,
    effectiveSections: [
      {
        id: '89:41', title: 'con', type: 'container', isLayoutContainer: true,
        layout: 'vertical', elementCount: 49,
        children: [
          {
            id: '89:42', title: 'sub-t', type: 'container', isLayoutContainer: true,
            layout: 'horizontal', elementCount: 14,
            children: [
              { id: '2:7889', title: 'tabs-list', type: 'tabs', elementCount: 6 },
              { id: '89:43', title: 'tab-panel', type: 'tabs', elementCount: 20 },
            ],
          },
          {
            id: '2:7898', title: 'echarts-line', type: 'container', isLayoutContainer: true,
            layout: 'horizontal', elementCount: 10,
            children: [{ id: '2:7899', title: 'chart-body', type: 'content', elementCount: 8 }],
          },
        ],
      },
      { id: 'chart-2:7898', title: 'chart', type: 'chart', elementCount: 5 },
    ],
  })

  // LLM 整文件产物：chart 写在 tabs 之前（正是实锤的顺序错位形态）
  const llmIndexVue = () => `<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-root">
      <div class="c-env-monitor-slot-con">
        <EnvMonitorChart class="c-env-monitor-chart-section" />
        <EnvMonitorTabs class="c-env-monitor-tabs-section" />
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import EnvMonitorChart from './components/EnvMonitorChart.vue'
import EnvMonitorTabs from './components/EnvMonitorTabs.vue'
const switchSelected = ref('active')
</script>`

  const mkInput = (p: any) => ({
    componentName: 'env-monitor',
    panelType: 'default-panel',
    subComponentPlan: p,
  })

  it('有 effectiveSections → <template> 段被确定性骨架覆盖，顺序 = facts 顺序，script 原样保留', () => {
    const r = applyDeterministicIndexTemplate(llmIndexVue(), mkInput(envPlan()), {})
    expect(r.applied).toBe(true)
    expect(r.facts?.source).toBe('deterministic-template')

    const out = r.content
    const tpl = out.match(/<template\b[^>]*>([\s\S]*?)<\/template>/i)?.[1] || ''

    // ① 装配收回：LLM 自拟的模板标签与内容根不复存在
    expect(tpl).not.toContain('EnvMonitorChart')
    expect(tpl).not.toContain('c-env-monitor-root')
    expect(tpl).toContain('c-env-monitor-slot-con')
    expect(tpl).toContain('data-section-id="89:42"')

    // ② 顺序 = effectiveSections 顺序：tabs 区必须在图表区之前
    const tabsAt = tpl.indexOf('data-section-id="89:42"')
    const chartAt = tpl.indexOf('data-section-id="2:7898"')
    expect(tabsAt).toBeGreaterThanOrEqual(0)
    expect(chartAt).toBeGreaterThan(tabsAt)

    // ③ 填值保留：LLM script 内容不被改写
    expect(out).toContain('const switchSelected = ref(')

    // ④ import 与新模板对齐：模型自拟的子组件 import 变死 → 被裁剪
    expect(out).not.toContain("import EnvMonitorChart from './components/EnvMonitorChart.vue'")
    expect(out).not.toContain("import EnvMonitorTabs from './components/EnvMonitorTabs.vue'")
  })

  it('无 plan（effectiveSections 空）→ 原样返回 + reason，不 fail-closed', () => {
    const src = llmIndexVue()
    const r = applyDeterministicIndexTemplate(src, mkInput({ isForced: false, effectiveSections: [] }), {})
    expect(r.applied).toBe(false)
    expect(r.reason).toBe('no-plan-sections')
    expect(r.content).toBe(src)
  })

  it('空内容 / 无 <template> 段 → 原样返回', () => {
    expect(applyDeterministicIndexTemplate('', mkInput(envPlan()), {}).reason).toBe('empty-content')
    const r = applyDeterministicIndexTemplate('<script setup>const a=1</script>', mkInput(envPlan()), {})
    expect(r.applied).toBe(false)
    expect(r.reason).toBe('no-template-block')
  })
})

describe('刀12 · 2D 行簇重建（ad8939a5 `801:3` 实锤：左图右文被纵切七段）', () => {
  const B = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })
  // 801:3 真值几何（.checkpoint/figma.json）：头部带 = img(98×98) ｜ 右列（标题/编码行/pill），
  // 下方依次 = 参数网格 81:7、产品描述 label、描述正文。容器 vertical（几何判 column 不错，
  // 错在纵流内部的横向带没表达）。
  const headSection = {
    id: '801:3',
    name: 'slot-icon',
    type: 'body',
    isLayoutContainer: true,
    layout: 'vertical',
    absoluteBoundingBox: B(24745, 51499, 547, 493),
    children: [
      { id: '36:1725', name: 'img', type: 'content', absoluteBoundingBox: B(24745, 51499, 98, 98) },
      { id: '801:3-orphan-text-0', name: 'GD-Robot-04', type: 'text', absoluteBoundingBox: B(24864, 51514, 147, 24) },
      { id: '36:1722', name: 'Frame pill', type: 'content', absoluteBoundingBox: B(24905, 51553, 72, 22) },
      { id: '801:3-orphan-text-1', name: '编码 / 爆闪灯', type: 'text', absoluteBoundingBox: B(24864, 51556, 173, 16) },
      { id: '81:7', name: 'Group grid', type: 'content', absoluteBoundingBox: B(24745, 51630, 440, 135.25) },
      { id: '801:3-orphan-text-2', name: '产品描述', type: 'text', absoluteBoundingBox: B(24772, 51824, 64, 16) },
      { id: '801:3-orphan-text-3', name: '描述正文', type: 'text', absoluteBoundingBox: B(24772, 51849, 496, 90) },
    ],
  }

  it('⭐ 阳性：纵向容器内横向带被重建为 row wrapper（img 不再独占一行通栏）', () => {
    const facts = buildDeterministicIndexTemplate(makeInput([headSection], 'device'))
    expect(facts).not.toBeNull()
    const tpl = facts!.template
    // ① 行簇 wrapper 存在（匿名 div，无 data-section-id）
    expect(tpl).toContain('flex-direction:row')
    // ② 行带 wrapper 在 801:3 容器之后；叶标签序 = 行簇阅读序：
    //    [img, 标题, pill, 编码行(orphan-1)]（首带）→ [网格 81:7] → [描述 label] → [描述正文]
    const conAt = tpl.indexOf('data-section-id="801:3"')
    const rowAt = tpl.indexOf('flex-direction:row')
    expect(conAt).toBeGreaterThanOrEqual(0)
    expect(rowAt).toBeGreaterThan(conAt)
    const leafTags = [...tpl.matchAll(/<([A-Z]\w+) style="flex:/g)].map((m) => ({ tag: m[1], at: m.index! }))
    expect(leafTags).toHaveLength(7)
    // 首带 4 叶全在 row wrapper 之后；网格（第 5 叶）在其后（不再与 img 同级纵切通栏）
    expect(leafTags[0].at).toBeGreaterThan(rowAt)
    expect(leafTags[4].at).toBeGreaterThan(leafTags[3].at)
    // ③ 行带内 img 与右列按真值宽度比分 flex（98/(98+173)=0.362；右列并集宽 173 ⇒ 0.638）
    expect(tpl).toContain('flex:0.362;min-width:0;')
    expect(tpl).toContain('flex:0.638;min-width:0;')
    // ④ 带高比例：头带 98/(98+135.25+16+90) ≈ 0.289（与既有「子项高度和」口径一致）
    expect(tpl).toContain('flex:0.289;min-height:0;')
  })

  it('阴性：纯纵流容器（无任何带成行）⇒ 模板与刀前逐字一致（无 row wrapper）', () => {
    const pureVertical = {
      ...headSection,
      children: [
        { id: 'a', name: 'A', type: 'content', absoluteBoundingBox: B(0, 0, 547, 100) },
        { id: 'b', name: 'B', type: 'content', absoluteBoundingBox: B(0, 120, 547, 100) },
        { id: 'c', name: 'C', type: 'content', absoluteBoundingBox: B(0, 240, 547, 100) },
      ],
    }
    const tpl = buildDeterministicIndexTemplate(makeInput([pureVertical], 'device'))!.template
    expect(tpl).not.toContain('c-device-band')
    expect(tpl).not.toContain('flex-direction:row')
  })

  it('fail-open：子项几何不可解析 ⇒ 回退既有比例路径（无 band wrapper）', () => {
    const partial = {
      ...headSection,
      children: [
        { id: 'a', name: 'A', type: 'content', absoluteBoundingBox: B(24745, 51499, 98, 98) },
        { id: 'b', name: 'B', type: 'content' }, // 无几何
        { id: 'c', name: 'C', type: 'content', absoluteBoundingBox: B(24772, 51849, 496, 90) },
      ],
    }
    const tpl = buildDeterministicIndexTemplate(makeInput([partial], 'device'))!.template
    expect(tpl).not.toContain('c-device-band')
  })
})

describe('刀14 · 根 <template> 块嵌套计数配对（mc-3538d75b 实锤：插槽截断残留 </div> → Invalid end tag）', () => {
  // 实锤复刻：mc-max-1793103916900-3538d75b 第三次生成的 LLM index.vue（chunk 缓存
  // 2-package_index.vue，63 行，本体平衡），根模板内含 <template #header_right> 插槽。
  // 旧 lazy 正则只替换到插槽闭合（第 8 行）⇒ 第 9–37 行（</div>×3、</base-panel>、
  // 收尾 </template>）整段残留在确定性骨架之后 ⇒ SFC 47:8/48:6/49:4 Invalid end tag。
  const llmIndexVueWithSlot = () => `<template>
  <base-panel panelKey="default-panel">
    <!-- 头部右侧：关闭按钮 -->
    <template #header_right>
      <div class="c-device-header-close">
        <img :src="icon2" class="c-device-icon-close" alt="关闭" />
      </div>
    </template>

    <!-- 主体内容区 -->
    <div class="c-device-content" :style="{ backgroundImage: 'url(' + bg1 + ')' }">
      <StatCardsRow />
      <div class="c-device-table-area">
        <DeviceNameColumn />
        <BatteryColumn />
      </div>
      <div class="c-device-footer">
        <LegendItem legendType="running" />
        <TailText />
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { onMounted } from 'vue'
const { componentProps, runtimeBuilder } = $mcComponentBuilder()
import StatCardsRow from './components/StatCardsRow.vue'
import DeviceNameColumn from './components/DeviceNameColumn.vue'
import BatteryColumn from './components/BatteryColumn.vue'
import LegendItem from './components/LegendItem.vue'
import TailText from './components/TailText.vue'
onMounted(() => {
  runtimeBuilder.publishEvent('device-onload', { componentId: 'device', timestamp: Date.now() })
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>`

  const listPlan = () => ({
    isForced: true,
    minFiles: 6,
    effectiveSections: [
      { id: '43:4800', title: 'con', type: 'container', isLayoutContainer: true,
        layout: 'vertical', elementCount: 20,
        children: [
          { id: '43:4801', title: 'stat-row', type: 'content', elementCount: 5 },
          { id: '43:4812', title: 'device-list', type: 'content', elementCount: 10 },
        ] },
    ],
  })
  const mkListInput = () => ({
    componentName: 'device',
    panelType: 'default-panel',
    subComponentPlan: listPlan(),
  })

  it('findRootTemplateBlock：嵌套插槽不截断，区间覆盖到根块真正的 </template>', () => {
    const src = llmIndexVueWithSlot()
    const block = findRootTemplateBlock(src)!
    expect(block).not.toBeNull()
    const sliced = src.slice(block.start, block.end)
    // 区间必须以根 </template> 收尾，且内部完整含插槽块与 </base-panel>
    expect(sliced.startsWith('<template>')).toBe(true)
    expect(sliced.trimEnd().endsWith('</template>')).toBe(true)
    expect(sliced).toContain('<template #header_right>')
    expect(sliced).toContain('</base-panel>')
    // 区间之后只剩 script/style —— 不得残留任何模板内容
    const rest = src.slice(block.end)
    expect(rest).not.toContain('</div>')
    expect(rest).not.toContain('</base-panel>')
    expect(rest).not.toContain('</template>')
    expect(rest).toContain('<script setup>')
  })

  it('实锤复刻：含插槽的 LLM index.vue 嫁接后模板平衡、LLM 旧模板零残留', () => {
    const r = applyDeterministicIndexTemplate(llmIndexVueWithSlot(), mkListInput(), {})
    expect(r.applied).toBe(true)
    const out = r.content

    // ① 结构平衡：template 开/闭计数相等（旧实现此处会多出 1 个 </template> 与 3 个 </div>）
    const opens = (out.match(/<template\b(?![^>]*\/>)[^>]*>/gi) || []).length
    const closes = (out.match(/<\/template\s*>/gi) || []).length
    expect(closes).toBe(opens)

    // ② LLM 自拟模板的容器/标签零残留（确定性骨架接管）
    expect(out).not.toContain('c-device-content')
    expect(out).not.toContain('c-device-table-area')
    expect(out).not.toContain('c-device-footer')
    expect(out).toContain('data-section-id="43:4800"')
    expect(out).toContain('c-device-slot-con')

    // ③ 确定性骨架自带的插槽保留（骨架有 header 插槽时应在产物里），script 填值保留
    expect(out).toContain('const { componentProps, runtimeBuilder } = $mcComponentBuilder()')
    expect(out).toContain("runtimeBuilder.publishEvent('device-onload'")

    // ④ 下游 stripSurplusBlockClosers 不再有事可做（幂等零改动）
    const closers = stripSurplusBlockClosers(out)
    expect(closers.removed).toEqual([])
  })

  it('反向：模板残缺（有 <template> 无配对闭合）→ fail-open 原样返回 template-unbalanced', () => {
    const broken = '<template>\n  <div>未闭合\n<script setup>const a = 1</script>'
    const r = applyDeterministicIndexTemplate(broken, mkListInput(), {})
    expect(r.applied).toBe(false)
    expect(r.reason).toBe('template-unbalanced')
    expect(r.content).toBe(broken)
  })

  it('回归：无插槽的 LLM index.vue 行为不变（同 #719 B 语义）', () => {
    const plain = `<template>
  <base-panel panelKey="default-panel">
    <div class="c-device-root"><LlmMadeUp /></div>
  </base-panel>
</template>

<script setup>
import LlmMadeUp from './components/LlmMadeUp.vue'
const marker = ref('keep-me')
</script>`
    const r = applyDeterministicIndexTemplate(plain, mkListInput(), {})
    expect(r.applied).toBe(true)
    expect(r.content).not.toContain('LlmMadeUp')
    expect(r.content).toContain("const marker = ref('keep-me')")
    const opens = (r.content.match(/<template\b(?![^>]*\/>)[^>]*>/gi) || []).length
    const closes = (r.content.match(/<\/template\s*>/gi) || []).length
    expect(closes).toBe(opens)
  })
})

describe('刀16 · 兄弟间距真值注入（6bba7218 实锤：纵流 33/20/20px + 行带内横向 64px 全贴死）', () => {
  const B = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })
  // 实锤几何（.mc-gen/cache/figma-node-data.json）：容器 796:3(26894,51483,604,787)
  // 带1 = 3260(26900,51483,265,76) | 3282(27229,51483,265,76) → 横向间距 64px
  // 纵排：带1底 51559 → 3137(…,51592,604,161) 间距33 → 3162(…,51773,604,212) 间距20
  //       → 3206(…,52005,604,265) 间距20，底 52270 = 容器底
  const gapPlan = () => ({
    isForced: true,
    minFiles: 8,
    effectiveSections: [
      { id: '796:3', title: 'slot-icon', type: 'container', isLayoutContainer: true,
        layout: 'vertical', elementCount: 30,
        absoluteBoundingBox: B(26894, 51483, 604, 787),
        children: [
          { id: '38:3260', title: 'g1', type: 'content', elementCount: 5, absoluteBoundingBox: B(26900, 51483, 265, 76) },
          { id: '38:3282', title: 'g2', type: 'content', elementCount: 5, absoluteBoundingBox: B(27229, 51483, 265, 76) },
          { id: '38:3137', title: 'card1', type: 'content', elementCount: 6, absoluteBoundingBox: B(26894, 51592, 604, 161) },
          { id: '38:3162', title: 'card2', type: 'content', elementCount: 6, absoluteBoundingBox: B(26894, 51773, 604, 212) },
          { id: '38:3206', title: 'card3', type: 'content', elementCount: 6, absoluteBoundingBox: B(26894, 52005, 604, 265) },
        ] },
    ],
  })
  const mkGapInput = () => ({
    componentName: 'device',
    panelType: 'default-panel',
    subComponentPlan: gapPlan(),
  })

  it('⭐ 实锤复刻：纵向兄弟 margin-top 33/20/20、行带内横向 margin-left 64、flex 比例保持', () => {
    const facts = buildDeterministicIndexTemplate(mkGapInput())
    expect(facts).not.toBeNull()
    const tpl = facts!.template
    // 行带内：第二组 margin-left:64px
    expect(tpl).toContain('margin-left:64px')
    // 纵向兄弟：33/20/20
    expect(tpl).toContain('margin-top:33px')
    expect((tpl.match(/margin-top:20px/g) || []).length).toBe(2)
    // flex 比例链不变（分母照旧，margin 与 grow 相容）
    expect(tpl).toContain('flex:0.500')
  })

  it('反向：兄弟贴合（gap=0）⇒ 零 margin，零行为变化', () => {
    const p = gapPlan()
    // 只让 card1→card2→card3 之间贴合（带结构与带间距 33px 不动，
    // 避免 y 聚带容差把贴合的 card 并进行带、改变刀12 结构）
    p.effectiveSections[0].children[3].absoluteBoundingBox = B(26894, 51753, 604, 212) // 贴住 card1 底
    p.effectiveSections[0].children[4].absoluteBoundingBox = B(26894, 51965, 604, 265) // 贴住 card2 底
    const tpl = buildDeterministicIndexTemplate({ componentName: 'device', panelType: 'default-panel', subComponentPlan: p })!.template
    // 卡片间 20px 消失
    expect(tpl).not.toContain('margin-top:20px')
    // 带间距 33px 与横向 64px 仍在（几何未动）
    expect(tpl).toContain('margin-top:33px')
    expect(tpl).toContain('margin-left:64px')
  })

  it('反向：几何缺失（无 bbox）⇒ 零 margin，回退既有比例路径', () => {
    const p = gapPlan()
    for (const c of p.effectiveSections[0].children) delete (c as any).absoluteBoundingBox
    const tpl = buildDeterministicIndexTemplate({ componentName: 'device', panelType: 'default-panel', subComponentPlan: p })!.template
    expect(tpl).not.toContain('margin-top:')
    expect(tpl).not.toContain('margin-left:')
  })

  it('siblingGapStyle 单元：重叠（负 gap）/ 亚像素 / 缺 box 全部返回空串', () => {
    expect(siblingGapStyle({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 5, w: 10, h: 10 }, 'vertical')).toBe('')
    expect(siblingGapStyle({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 10.4, w: 10, h: 10 }, 'vertical')).toBe('')
    expect(siblingGapStyle(null, { x: 0, y: 20, w: 10, h: 10 }, 'vertical')).toBe('')
    expect(siblingGapStyle({ x: 0, y: 0, w: 10, h: 10 }, { x: 30, y: 0, w: 10, h: 10 }, 'horizontal')).toBe('margin-left:20px;')
    expect(siblingGapStyle({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 33, w: 10, h: 10 }, 'vertical')).toBe('margin-top:23px;')
  })
})

describe('刀17 · 横向容器 2D 列簇 + 交叉轴居中（6bba7218 `38:3260` 实锤：icon ｜ 纵排文本块被平铺横排且贴顶）', () => {
  const B = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })
  // 实锤几何：38:3260(26900,51483,265,76) horizontal，三子项：
  // icon 187:262(26920,51496,53,55.4) ｜ 标题 38:3263(26997.7,51496,64,24) ｜ 数字 38:3262(26997,51521.9,28,28)
  const statGroup = () => ({
    isForced: true,
    minFiles: 5,
    effectiveSections: [
      { id: '38:3260', title: 'g', type: 'container', isLayoutContainer: true,
        layout: 'horizontal', elementCount: 10,
        absoluteBoundingBox: B(26900, 51483, 265, 76),
        children: [
          { id: '187:262', title: 'icon', type: 'content', elementCount: 3, absoluteBoundingBox: B(26920, 51496, 53, 55.4) },
          { id: '38:3263', title: '合作厂商', type: 'content', elementCount: 1, absoluteBoundingBox: B(26997.7, 51496, 64, 24) },
          { id: '38:3262', title: '33', type: 'content', elementCount: 1, absoluteBoundingBox: B(26997, 51521.9, 28, 28) },
        ] },
    ],
  })

  it('⭐ 实锤复刻：标题/数字聚成纵排组、icon 与组横排、align-self:center 落到直接子项', () => {
    const facts = buildDeterministicIndexTemplate({ componentName: 'device', panelType: 'default-panel', subComponentPlan: statGroup() })
    expect(facts).not.toBeNull()
    const tpl = facts!.template
    // ① 2D 列簇命中：band wrapper 存在且根为 row
    expect(tpl).toContain('c-device-band')
    expect(tpl).toContain('flex-direction:row')
    // ② 纵排组存在（标题/数字在 column 组内）：模板里出现嵌套 band（row 内 column）
    expect(tpl).toContain('flex-direction:column')
    // ③ 居中：直接子项带 align-self:center（icon 与文本块中心≈容器中心）
    expect((tpl.match(/align-self:center/g) || []).length).toBe(2)
    // ④ 组内纵排间距（刀16 叠加）：数字 margin-top ≈ 2px（51521.9-51520=1.9）
    expect(tpl).toContain('margin-top:2px')
  })

  it('反向：纯横行三并列卡 ⇒ 2D 不命中、无 band、无 align-self', () => {
    const p = statGroup()
    p.effectiveSections[0].children = [
      { id: 'a', title: 'A', type: 'content', elementCount: 1, absoluteBoundingBox: B(26900, 51496, 60, 50) },
      { id: 'b', title: 'B', type: 'content', elementCount: 1, absoluteBoundingBox: B(26990, 51496, 60, 50) },
      { id: 'c', title: 'C', type: 'content', elementCount: 1, absoluteBoundingBox: B(27080, 51496, 60, 50) },
    ]
    const tpl = buildDeterministicIndexTemplate({ componentName: 'device', panelType: 'default-panel', subComponentPlan: p })!.template
    expect(tpl).not.toContain('c-device-band')
    expect(tpl).not.toContain('align-self:center')
  })
})
