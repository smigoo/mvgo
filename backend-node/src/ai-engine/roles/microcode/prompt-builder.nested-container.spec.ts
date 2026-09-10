/**
 * A′ Phase 5：buildSubComponentResponsibilityTable 按叶子+树消费嵌套容器。
 *
 * prompt-builder 顶层 import prompt-loader（import.meta.url），jest CJS 下必须 mock。
 * 被测函数只消费 section-tree 纯函数，不依赖 prompt-loader 返回值。
 */
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

import {
  buildSubComponentResponsibilityTable,
  buildSubComponentNamingGuidance,
} from './prompt-builder.js'

function nestedPlan(overrides: Record<string, unknown> = {}) {
  return {
    isForced: true,
    minFiles: 4,
    reason: '叶子 sections=4 → 强制拆分',
    effectiveSections: [
      {
        id: 'section-header',
        title: '头部统计指标区',
        responsibility: '统计概览',
        elementCount: 3,
      },
      {
        id: '89:40',
        title: 'slot-con',
        type: 'container',
        isLayoutContainer: true,
        layoutSource: 'container-rebuild',
        children: [
          {
            id: '89:38',
            title: 'switch',
            responsibility: '控件切换',
            elementCount: 2,
          },
          {
            id: '89:37',
            title: '@antd/tab',
            responsibility: '主内容区',
            elementCount: 4,
          },
        ],
      },
      {
        id: '2:8437',
        title: 'cons',
        responsibility: '卡片网格',
        layoutSource: 'inline-row',
        elementCount: 2,
      },
    ],
    ...overrides,
  }
}

describe('buildSubComponentResponsibilityTable 嵌套容器', () => {
  it('强制拆分按叶子计数，容器不进编号清单', () => {
    const text = buildSubComponentResponsibilityTable({
      subComponentPlan: nestedPlan(),
    })
    expect(text).toContain('强制拆分**为 4 个叶子子组件')
    expect(text).toContain('布局容器不单独生成文件')
    expect(text).toMatch(/1\. `section-header`/)
    expect(text).toMatch(/2\. `89:38`/)
    expect(text).toMatch(/3\. `89:37`/)
    expect(text).toMatch(/4\. `2:8437`/)
    expect(text).not.toMatch(/\d+\. `89:40`/)
    expect(text).not.toContain('3 个独立子组件')
  })

  it('注入嵌套树：容器标包裹、子区块顺序保留', () => {
    const text = buildSubComponentResponsibilityTable({
      subComponentPlan: nestedPlan(),
    })
    expect(text).toContain('嵌套树（容器不单独生成 .vue，index.vue 按 column 组装）')
    expect(text).toContain('容器 `89:40`')
    expect(text).toContain('不单独生成 .vue')
    expect(text).toContain('子区块顺序 [89:38 → 89:37]')
    expect(text).toContain('禁止打平')
  })

  it('generationInput.componentPlan 优先于 legacy subComponentPlan', () => {
    const text = buildSubComponentResponsibilityTable({
      generationInput: { componentPlan: nestedPlan() },
      subComponentPlan: {
        isForced: true,
        effectiveSections: [{ id: 'legacy-only', responsibility: '旧平铺' }],
      },
    })
    expect(text).toContain('`89:38`')
    expect(text).not.toContain('legacy-only')
  })

  it('无容器时仍按顶层叶子计数（env 形态）', () => {
    const text = buildSubComponentResponsibilityTable({
      subComponentPlan: {
        isForced: true,
        effectiveSections: [
          { id: 'section-tabs', responsibility: 'Tab切换栏' },
          { id: '89:42', responsibility: '标题' },
          { id: 'section-chart', responsibility: '趋势图' },
        ],
      },
    })
    expect(text).toContain('强制拆分**为 3 个叶子子组件')
    expect(text).toMatch(/1\. `section-tabs`/)
    expect(text).toMatch(/3\. `section-chart`/)
    expect(text).not.toContain('容器 `')
  })

  it('空 sections → 只回诊断块，不造职责表', () => {
    const text = buildSubComponentResponsibilityTable({
      subComponentPlan: {
        isForced: true,
        diagnostics: { coverageReport: { coverageRate: 88, summary: 'ok' } },
        effectiveSections: [],
      },
    })
    expect(text).toContain('覆盖率：88%')
    expect(text).not.toContain('子组件职责边界')
    expect(text).not.toContain('强制拆分')
  })

  it('isForced=false 不写强制拆分数，但仍列叶子', () => {
    const text = buildSubComponentResponsibilityTable({
      subComponentPlan: nestedPlan({ isForced: false }),
    })
    expect(text).toContain('本组件存在以下子组件拆分')
    expect(text).not.toContain('强制拆分**为')
    expect(text).toContain('`89:38`')
    expect(text).toContain('容器 `89:40`')
  })
})

describe('buildSubComponentNamingGuidance 嵌套容器（同源契约）', () => {
  it('命名指导按叶子列建议，容器只出现在树里', () => {
    const text = buildSubComponentNamingGuidance({
      subComponentPlan: nestedPlan(),
    })
    expect(text).toContain('嵌套树（容器不单独命名 .vue）')
    expect(text).toContain('容器 `89:40`')
    expect(text).toContain('section `89:38`')
    expect(text).toContain('section `89:37`')
    expect(text).not.toContain('section `89:40`')
  })
})
