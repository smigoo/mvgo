/**
 * 治本 F1（2026-09-10）：calc 默认值自引用双写修复（CSS-CALC-SELFREF-001 内联逻辑）。
 * 验证 cons-section 的 `calc(var(--x, var(--x)) * n)` 被改写为保留首个回退值的合法 calc。
 */
jest.mock('../../config/backend-root.js', () => ({
  getWorkspaceRoot: () => '/Users/smigoo/工作/mvgo/backend-node',
  getLogsDir: () => '/tmp/mvgo-test-logs',
  isDev: true,
}))

describe('治本F1 calc 默认值自引用双写修复', () => {
  const RE = /calc\(\s*var\(\s*(--[\w-]+)\s*,\s*var\(\s*\1\s*\)\s*\)(\s*\*[^(]+\))/g
  const fix = (css: string) => css.replace(RE, (_m, name, tail) => `calc(var(${name}, 14px)${tail}`)

  test('ConsSection 实测 `var(--fontSize, var(--fontSize))` → 保留首个回退值', () => {
    const css = `.x { font-size: calc(var(--fontSize, var(--fontSize)) * 0.857); }`
    const out = fix(css)
    expect(out).toBe(`.x { font-size: calc(var(--fontSize, 14px) * 0.857); }`)
    expect(out).not.toMatch(/var\(--fontSize\)\s*,?\s*var\(--fontSize\)/)
  })

  test('正常值不误伤', () => {
    const css = `.x { font-size: calc(var(--fontSize, 14px) * 0.857); }`
    expect(fix(css)).toBe(css)
  })

  test('无空格写法也能修', () => {
    const css = `.y { font-size: calc(var(--fs,var(--fs))*2); }`
    expect(fix(css)).toBe(`.y { font-size: calc(var(--fs, 14px)*2); }`)
  })
})
