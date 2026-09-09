import {
  buildStyleTokens,
  buildVue3ThemeMixinSnippet,
  buildVue3ThemeVarsLess,
} from './style-tokens.js'

/**
 * Vue3 theme-vars.less 契约渲染（1.4，2026-09-03）。
 * styleTokens 契约第 3 消费轨：vue3 resources/styles/theme-vars.less 兜底渲染。
 * docs C2.1 混合模式：.common() var() 接收框架变量；.theme-*() 硬编码槽位值。
 * 关键约束：只定义 mixin、无根级调用（不触发 phase2 sanitizeLess 的 :root 包裹）。
 */

/** 深色稿契约（defaultTheme=dark，light 走派生算法） */
function darkTokens() {
  return buildStyleTokens(
    {
      figmaNodeData: {
        type: 'FRAME',
        children: [
          {
            type: 'RECTANGLE',
            fills: [
              { type: 'SOLID', visible: true, color: { r: 0.03, g: 0.03, b: 0.05 } },
            ],
            absoluteBoundingBox: { width: 800, height: 600 },
          },
          {
            type: 'TEXT',
            characters: '标题',
            fills: [{ type: 'SOLID', visible: true, color: { r: 0.09, g: 0.78, b: 1 } }],
            absoluteBoundingBox: { width: 100, height: 20 },
          },
        ],
      },
      backgroundBrightness: 'dark',
      fontSize: '14',
    },
    { logger: { info() {}, warn() {} } },
  )
}

describe('buildVue3ThemeVarsLess（契约 → theme-vars.less 确定性渲染）', () => {
  it('深色稿契约输出三个 mixin 定义，且无根级 mixin 调用', () => {
    const less = buildVue3ThemeVarsLess(darkTokens())
    expect(less).toContain('.common() {')
    expect(less).toContain('.theme-dark() {')
    expect(less).toContain('.theme-light() {')
    // 根级调用形如 `.common();` 独立成行 → 会被 phase2 sanitizeLess 包进 :root（变量局部化）。
    // 真实产物形态为「只定义 mixin」——模板必须与此一致。
    expect(less).not.toMatch(/^\.(common|theme-dark|theme-light)\(\);/m)
  })

  it('.common() 用 var() 接收 8 个框架预设变量，fallback 取契约 fontSize/枚举色值', () => {
    const less = buildVue3ThemeVarsLess(darkTokens())
    expect(less).toContain('@fontSize: var(--fontSize, 14px);')
    expect(less).toContain('@fontWeightStrong: var(--fontWeightStrong, 600);')
    expect(less).toContain('@colorTextBase: var(--colorTextBase, #ffffff);')
    expect(less).toContain('@colorPrimary: var(--colorPrimary, #44E4FF);')
    expect(less).toContain('@colorPrimaryBgHover: var(--colorPrimaryBgHover, #4B4B4B);')
  })

  it('.theme-dark() 硬编码枚举核心（dark 槽位 = darkWithDesign，契约键原样输出）', () => {
    const less = buildVue3ThemeVarsLess(darkTokens())
    expect(less).toContain('@colorTextBase: #ffffff;')
    expect(less).toContain('@colorPrimary: #44E4FF;')
    expect(less).toContain('@colorPrimaryBg: #414141;')
  })

  it('.theme-light() 硬编码派生槽位（深色稿 → 派生算法值，含 ensureContrastOnWhite 校正）', () => {
    const tokens = darkTokens()
    const less = buildVue3ThemeVarsLess(tokens)
    // light 槽位由 buildStyleTokens 派生：主色沿用深色稿亮青 → 明度校正后 hex
    expect(less).toContain(`@colorPrimary: ${tokens.light.colorPrimary};`)
    expect(less).toContain(`@colorTextBase: ${tokens.light.colorTextBase};`)
  })

  it('契约缺省（{}）时：.common() + .theme-dark() 枚举回退，theme-light 槽位空不输出', () => {
    const less = buildVue3ThemeVarsLess({})
    expect(less).toContain('.common() {')
    expect(less).toContain('.theme-dark() {')
    expect(less).toContain('@colorPrimary: #44E4FF;')
    // 无 theme-light mixin 定义块（注释里出现的同名文本不算）
    expect(less).not.toContain('.theme-light() {')
  })
})

describe('buildVue3ThemeMixinSnippet（缺哪个补哪个的单个 mixin 块）', () => {
  it('theme-dark 有契约 → darkWithDesign 槽位', () => {
    const tokens = darkTokens()
    const snip = buildVue3ThemeMixinSnippet('theme-dark', tokens)
    expect(snip).toContain('.theme-dark() {')
    expect(snip).toContain('@colorPrimary: #44E4FF;')
  })

  it('theme-dark 无契约 → 回退枚举三核心（保编译不空壳）', () => {
    const snip = buildVue3ThemeMixinSnippet('theme-dark', {})
    expect(snip).toContain('@colorTextBase: #ffffff;')
    expect(snip).toContain('@colorPrimary: #44E4FF;')
    expect(snip).toContain('@colorPrimaryBg: #414141;')
  })

  it('theme-light 槽位空 → 返回 null（不输出空壳 mixin）', () => {
    expect(buildVue3ThemeMixinSnippet('theme-light', {})).toBeNull()
  })

  it('未知 mixin 名 → null', () => {
    expect(buildVue3ThemeMixinSnippet('theme-xxx', {})).toBeNull()
  })
})
