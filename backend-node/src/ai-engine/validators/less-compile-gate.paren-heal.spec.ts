import less from 'less'
import {
  healMissingCloseParens,
  gateStandaloneLessWrite,
} from './less-compile-gate.js'

/**
 * 🛡️ L1-b（2026-10-20 · mc-max-1792497064987-195c8d0e 实锤）：缺失 `)` 确定性补全。
 *
 * 为什么必须补这一刀：`rebalanceOrphanCloseParens` 只抹「孤立 `)`」（多出来的），
 * **缺 `)` 一律不补** ⇒ 这是整条链上唯一没有自愈出口的缺陷，只能靠 L0-B 重试。
 * 195c8d0e 连试 6 轮全失败 ⇒ 门禁跳过 ⇒ 15 行兜底模板覆盖 641 行合格样式。
 *
 * 判据（位置唯一，不猜语义）：圆括号不跨声明/块终结符 ⇒ 扫到 `;` 或 `}` 时栈非空，
 * 缺失的 `)` 就在**该终结符之前**。
 *
 * 本 spec 的**硬判据是真编译**（`less.render` 能过），不是「gate 自己说 ok」——
 * 避免「判据与实现同源 = 假绿闭环」。
 */

describe('L1-b healMissingCloseParens（缺失 `)` 确定性补全）', () => {
  it('跨行 linear-gradient 断头 ⇒ 补在 `;` 前，且 less 真能编译', async () => {
    const src = '.a {\n  background: linear-gradient(\n    180deg,\n    rgba(1,2,3,0.4) 0%,\n    rgba(4,5,6,0.4) 100%;\n}\n'
    const r = healMissingCloseParens(src)
    expect(r.changed).toBe(true)
    expect(r.added).toBe(1)
    // 补位必须落在 `;` 之前（而不是块尾 `}` 之前）
    expect(r.source).toContain('rgba(4,5,6,0.4) 100%);')
    await expect(less.render(r.source)).resolves.toBeTruthy()
  })

  it('rgba 少 `)` ⇒ 补成 rgba(1,2,3); 并通过真编译', async () => {
    const r = healMissingCloseParens('.a { background: rgba(1,2,3; }\n')
    expect(r.source).toContain('background: rgba(1,2,3);')
    await expect(less.render(r.source)).resolves.toBeTruthy()
  })

  it('多层未闭合 ⇒ 一次补齐全部', () => {
    const r = healMissingCloseParens('.a { background: linear-gradient(rgba(1,2,3; }\n')
    expect(r.added).toBe(2)
    expect((r.source.match(/\(/g) || []).length).toBe((r.source.match(/\)/g) || []).length)
  })

  it('阴性对照：括号已平衡的正常文本零改动（不误伤）', () => {
    const src = '.a {\n  width: 10px;\n  background: rgba(1,2,3,0.5);\n  box-shadow: inset 0 0 16px rgba(25,181,186,0.67);\n}\n'
    const r = healMissingCloseParens(src)
    expect(r.changed).toBe(false)
    expect(r.source).toBe(src)
  })

  it('阳性对照 · 字符串内的 `(` 与 `;` 不参与配对（不得误补)', () => {
    for (const src of [
      '.a { content: "("; width: 10px; }\n',
      '.a { background: url("a;b.png"); }\n',
      ".a { content: ')'; }\n",
    ]) {
      const r = healMissingCloseParens(src)
      expect(r.changed).toBe(false)
      expect(r.source).toBe(src)
    }
  })

  it('阳性对照 · 注释内的 `(` 不参与配对', () => {
    for (const src of [
      '// 真值 (38:3138) 未闭合\n.a { width: 10px; }\n',
      '/* ( 示意 */\n.a { width: 10px; }\n',
    ]) {
      expect(healMissingCloseParens(src).changed).toBe(false)
    }
  })

  it('幂等：二次调用零改动', () => {
    const once = healMissingCloseParens('.a { background: linear-gradient(rgba(1,2,3; }\n').source
    const twice = healMissingCloseParens(once)
    expect(twice.changed).toBe(false)
    expect(twice.source).toBe(once)
  })

  it('接入写盘门禁：fixes 记录 heal(missing-paren:N)，且不再 LESS-WRITE-004', () => {
    const g = gateStandaloneLessWrite('.a { background: rgba(1,2,3; }\n', 'x.less')
    expect(g.ok).toBe(true)
    expect(g.fixes.join(',')).toContain('missing-paren:1')
    expect(g.defects).toHaveLength(0)
  })

  it('与 rebalanceOrphanCloseParens 互补：孤立 `)` 走 parens、缺 `)` 走 missing-paren', () => {
    const extra = gateStandaloneLessWrite('.a { background: #fff); }\n', 'x.less')
    expect(extra.fixes.join(',')).toContain('parens:1')
    const missing = gateStandaloneLessWrite('.a { background: rgba(1,2; }\n', 'x.less')
    expect(missing.fixes.join(',')).toContain('missing-paren:1')
  })
})
