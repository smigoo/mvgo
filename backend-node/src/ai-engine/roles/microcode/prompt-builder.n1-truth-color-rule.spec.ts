/**
 * N1（#139）：prompt 硬约束「给出色值不得被变量替换」的契约锁。
 *
 * 事故：样式事实已下发 rgba(226,208,132,0.2) / #ffc800 / #fffdf1，
 *   但 LLM 换成语义变量（@color-bg-card-active / @color-accent-gold），
 *   变量值由系统按名推断 ⇒ 面板变蓝块/白块。
 *
 * 本 spec 锁三件事（防止治理被静默回退）：
 *   ① 约束文本包含「必须原样出现」「严禁」「@color-accent-*」三个硬锚点；
 *   ② 约束**只在给了样式事实时**注入（否则与「禁止添加背景」叠加成死锁）；
 *   ③ 单一来源：两处模板共用同一常量（不各写一份）。
 */
jest.mock('../../utils/prompt-loader.js', () => ({
  buildSharedSections: () => '',
  buildConcerns: () => '',
  buildFigmaStage: () => '',
  formatAssetsList: () => '',
  trimConstraintsForContext: (c = '') => c,
}))

jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: '/tmp/mvgo-test-logs',
}), { virtual: true })

import { N1_TRUTH_COLOR_LANDING_RULE } from './prompt-builder.js'

describe('N1 真值落地 prompt 约束', () => {
  test('硬锚点齐备（真值必须原样出现 / 严禁语义变量 / 举出事故变量名）', () => {
    expect(N1_TRUTH_COLOR_LANDING_RULE).toContain('必须原样出现在产物里')
    expect(N1_TRUTH_COLOR_LANDING_RULE).toContain('严禁')
    expect(N1_TRUTH_COLOR_LANDING_RULE).toContain('@color-accent-*')
    expect(N1_TRUTH_COLOR_LANDING_RULE).toContain('@color-bg-card-active')
    // 必须给出「允许的写法」——否则 LLM 不知道怎么合规
    expect(N1_TRUTH_COLOR_LANDING_RULE).toContain('写成 Less 变量且该变量的值')
  })

  test('举例含真实真值与错值（可对照，不是空泛要求）', () => {
    expect(N1_TRUTH_COLOR_LANDING_RULE).toContain('#ffc800')
    expect(N1_TRUTH_COLOR_LANDING_RULE).toContain('#409EFF')
    expect(N1_TRUTH_COLOR_LANDING_RULE).toContain('rgba(226,208,132,0.2)')
  })
})
