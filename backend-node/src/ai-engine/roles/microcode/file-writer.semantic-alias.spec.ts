/**
 * 🛡️ 语义别名层（2026-11-03 · 用户拍板「加语义别名层治本」· mc-max-1793699233426-f8c957d8 实锤）
 *
 * 事故：`safeLessVarValue` 的 N3（#139）口径为「颜色变量真值优先、禁止按名编造」，
 * 对**非规范槽位名**一律丢弃按名猜测的颜色 ⇒ `@color-alert`/`@color-error`/`@noticeColor`
 * 被兜成中性灰 `#333333`，2026-09-28 契约要求的「告警名 → 红」失效（告警数字渲染成灰）。
 *
 * 修法：约定语义名 → 规范槽位（MC_CANONICAL_COLOR_SLOTS 单一事实源，**不新增硬编码**），
 * 规则：error/danger/fail/alert/notice→color-danger、warning/warn→color-warning、
 *       success/ok→color-success；primary/accent 属框架 `--colorPrimary` 契约（#409EFF），另行保留。
 */
jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: '/tmp/mvgo-test-logs',
}), { virtual: true })

import { safeLessVarValue } from './file-writer.js'
import { MC_CANONICAL_COLOR_SLOTS } from '../../utils/style-tokens.js'

const LIGHT = MC_CANONICAL_COLOR_SLOTS.light as Record<string, string>
const DARK = MC_CANONICAL_COLOR_SLOTS.dark as Record<string, string>

describe('safeLessVarValue · 语义别名层（2026-11-03）', () => {
  it('约定语义名 → 规范槽真值（与 MC_CANONICAL_COLOR_SLOTS 单一事实源一致，无硬编码）', () => {
    for (const n of [
      '@color-alert',
      '@colorAlert',
      '@noticeColor',
      '@color-error',
      '@color-fail',
      '@color-danger',
    ]) {
      expect(safeLessVarValue(n)).toBe(LIGHT['color-danger'])
    }
    expect(safeLessVarValue('@color-warning')).toBe(LIGHT['color-warning'])
    expect(safeLessVarValue('@color-success')).toBe(LIGHT['color-success'])
  })

  it('深色底反相：语义名取 dark 规范槽（证别名层优于名字分支的硬编码红）', () => {
    expect(safeLessVarValue('@color-alert', { background: 'dark' })).toBe(DARK['color-danger'])
    expect(safeLessVarValue('@color-warning', { background: 'dark' })).toBe(DARK['color-warning'])
    expect(safeLessVarValue('@color-success', { background: 'dark' })).toBe(DARK['color-success'])
  })

  it('守卫①：bg/border 结构变体不走语义归位（@color-alert-bg 仍是底纹，非告警色本体）', () => {
    expect(safeLessVarValue('@color-alert-bg')).toBe('#ffffff')
  })

  it('守卫②：色相限定词 → 继续走 N3 真值桶（@139 不回归：@color-accent-gold 不得变蓝）', () => {
    expect(safeLessVarValue('@color-accent-gold')).not.toBe('#409EFF')
  })

  it('数值型分支优先：@alertZIndex/@alertGap 不被语义层染指', () => {
    expect(safeLessVarValue('@alertZIndex')).toBe('1')
    expect(safeLessVarValue('@alertGap')).toBe('0px')
  })

  it('primary/accent 分属两套语义：框架驼峰 @colorPrimary 保留 #409EFF，规范槽 @color-primary 取 canonical', () => {
    expect(safeLessVarValue('@colorPrimary')).toBe('#409EFF')
    expect(safeLessVarValue('@color-primary')).toBe(LIGHT['color-primary'])
  })
})
