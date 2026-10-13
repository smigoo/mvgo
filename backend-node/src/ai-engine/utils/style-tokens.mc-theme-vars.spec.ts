import {
  renderMicrocodeThemeVarsLess,
  splitCommonColorVars,
} from './style-tokens.js'

/**
 * 微码 theme-vars.less 确定性渲染 —— `.common()` 颜色变量**迁出**（2026-10-09 治本）。
 *
 * 根因：产物 `index.less` / `themes/dark.less` / `themes/light.less` 均为
 * `.common(); .theme-X();` 顺序调用，而 LESS 的 mixin 变量「首个定义者胜出」
 * → `.common()` 里的 `@colorX` 会让随后 `.theme-light()`/`.theme-dark()` 的同名定义
 *   被**静默忽略** → `.dark` 与 `.light` 展开出的 CSS 完全相同，切主题零生效。
 *
 * 实锤：c-traffic-monitor-140cbd45 / c-cb2cdd-cb2cdd82（`.common()` 里躺着
 * `@color-error` / `@color-predict-line` / `@color-truck-value`）。全语料近 7 天 8/23 命中。
 *
 * 治本口径：把颜色从 `.common()` **移出**并注入两套主题 mixin（缺失才补写），
 * 再交给既有的 `deriveCounterpartCustomSlots` 做确定性深浅派生 —— 既不再抢定义，
 * 又不丢变量（业务样式引用它仍可编译）。
 */

const priorWithCommonColors = [
  '.common() {',
  '  @fontSize: var(--fontSize);',
  '  @font-size-base: 14px;',
  '  @border-radius-base: 8px;',
  '  @color-error: #ff4d4f;',
  '  @color-predict-line: #52c41a;',
  '  @colorTextBase: var(--colorTextBase);',
  '}',
  '.theme-light() {',
  '  @color-text-base: #333333;',
  '}',
  '.theme-dark() {',
  '  @color-text-base: #ffffff;',
  '}',
].join('\n')

const blockOf = (less: string, name: string): string => {
  const re =
    name === 'common'
      ? /\.common\s*\(\s*\)\s*\{([^}]*)\}/
      : new RegExp(`\\.${name}\\s*\\(\\s*\\)\\s*\\{([^}]*)\\}`)
  return String(less).match(re)?.[1] ?? ''
}

const valueOf = (block: string, name: string): string | undefined =>
  block.match(new RegExp(`@${name}\\s*:\\s*([^;]+);`))?.[1]?.trim()

describe('renderMicrocodeThemeVarsLess — .common() 颜色变量迁出', () => {
  const tokens = { defaultTheme: 'dark' }

  it('颜色变量不再出现在 .common()（@color-error / @color-predict-line）', () => {
    const out = renderMicrocodeThemeVarsLess(tokens, priorWithCommonColors)
    const common = blockOf(out, 'common')
    expect(common).not.toMatch(/@color-error/)
    expect(common).not.toMatch(/@color-predict-line/)
  })

  it('尺寸/字号/圆角与 var() 透传令牌**留在** .common()', () => {
    const out = renderMicrocodeThemeVarsLess(tokens, priorWithCommonColors)
    const common = blockOf(out, 'common')
    expect(common).toMatch(/@fontSize:\s*var\(--fontSize\)/)
    expect(common).toMatch(/@font-size-base:\s*14px/)
    expect(common).toMatch(/@border-radius-base:\s*8px/)
    // var() 透传是「接入主题变量」形态 → 不算颜色冲突，必须留在 .common()（否则断掉平台注入通道）
    expect(common).toMatch(/@colorTextBase:\s*var\(--colorTextBase\)/)
  })

  it('迁出的颜色在两套主题 mixin 里都有定义 —— 不产生未定义变量（可编译）', () => {
    const out = renderMicrocodeThemeVarsLess(tokens, priorWithCommonColors)
    for (const name of ['color-error', 'color-predict-line']) {
      expect(blockOf(out, 'theme-light')).toContain(`@${name}:`)
      expect(blockOf(out, 'theme-dark')).toContain(`@${name}:`)
    }
  })

  it('迁出槽位经深浅派生后两侧**值不同**（否则等于换个地方继续死主题）', () => {
    const out = renderMicrocodeThemeVarsLess(tokens, priorWithCommonColors)
    const l = valueOf(blockOf(out, 'theme-light'), 'color-error')
    const d = valueOf(blockOf(out, 'theme-dark'), 'color-error')
    expect(l).toBeTruthy()
    expect(d).toBeTruthy()
    expect(l).not.toBe(d)
  })

  it('主题 mixin 已显式给真值的同名槽位**不被覆盖**（设计真值优先）', () => {
    const prior = [
      '.common() {',
      '  @fontSize: var(--fontSize);',
      '  @color-error: #ff4d4f;',
      '}',
      '.theme-light() { @color-error: #aa0000; }',
      '.theme-dark() { @color-error: #ff8888; }',
    ].join('\n')
    const out = renderMicrocodeThemeVarsLess(tokens, prior)
    expect(valueOf(blockOf(out, 'theme-light'), 'color-error')).toBe('#aa0000')
    expect(valueOf(blockOf(out, 'theme-dark'), 'color-error')).toBe('#ff8888')
    expect(blockOf(out, 'common')).not.toContain('@color-error')
  })

  it('.common() 只含颜色（无尺寸令牌）→ 迁空后落 MC_COMMON_FALLBACK 兜底', () => {
    const prior = ['.common() {', '  @color-error: #ff4d4f;', '}'].join('\n')
    const out = renderMicrocodeThemeVarsLess(tokens, prior)
    expect(blockOf(out, 'common')).toMatch(/@fontSize:\s*var\(--fontSize\)/)
    expect(blockOf(out, 'common')).not.toContain('@color-error')
  })

  it('prior 为空 → 落 MC_COMMON_FALLBACK（行为不回退）', () => {
    const out = renderMicrocodeThemeVarsLess(tokens, '')
    expect(blockOf(out, 'common')).toMatch(/@fontSize:\s*var\(--fontSize\)/)
  })

  it('阴性对照：.common() 全是尺寸/透传令牌 → 一律不迁出', () => {
    const prior = [
      '.common() {',
      '  @fontSize: var(--fontSize);',
      '  @font-size-base: 14px;',
      '  @border-radius-base: 8px;',
      '  @fontWeightStrong: var(--fontWeightStrong);',
      '}',
      '.theme-light() { @color-text-base: #333333; }',
      '.theme-dark() { @color-text-base: #ffffff; }',
    ].join('\n')
    const out = renderMicrocodeThemeVarsLess(tokens, prior)
    const common = blockOf(out, 'common')
    for (const k of ['@fontSize', '@font-size-base', '@border-radius-base', '@fontWeightStrong']) {
      expect(common).toContain(k)
    }
  })
})

describe('splitCommonColorVars — 与门禁同源判据', () => {
  it('颜色语义名 / 字面量色值 → moved；var() 透传 / 几何令牌 / 纯尺寸 → kept', () => {
    const { kept, moved } = splitCommonColorVars({
      fontSize: 'var(--fontSize)',
      colorTextBase: 'var(--colorTextBase)',
      'font-size-base': '14px',
      'border-radius-base': '8px',
      'color-error': '#ff4d4f',
      'color-tab-bg': '#ffffff',
      shadowCard: '0 2px 8px rgba(0, 0, 0, 0.1)',
    })
    expect(Object.keys(moved).sort()).toEqual([
      'color-error',
      'color-tab-bg',
      'shadowCard',
    ])
    expect(Object.keys(kept).sort()).toEqual([
      'border-radius-base',
      'colorTextBase',
      'font-size-base',
      'fontSize',
    ])
  })

  it('非颜色变量的字面量值不算冲突（@border-width-base: 2px）', () => {
    const { kept, moved } = splitCommonColorVars({
      'border-width-base': '2px',
      'z-index-modal': '1000',
    })
    expect(Object.keys(moved)).toEqual([])
    expect(Object.keys(kept).sort()).toEqual(['border-width-base', 'z-index-modal'])
  })

  it('空入参 → 双空（不抛错）', () => {
    expect(splitCommonColorVars()).toEqual({ kept: {}, moved: {} })
    expect(splitCommonColorVars({})).toEqual({ kept: {}, moved: {} })
  })
})

/**
 * 🔴 2026-10-13 回归（真机实锤 c-aiot-dpjh-bsjd-fca166e8）：
 * N 主题 + 系统占位 dark 并存时，themeMeta 循环先 emit 的 `.theme-dark()`
 * 用了 themeSlots.dark 的原始值（深色稿真值落 dark 槽位时 = theme_2 的值），
 * 使 hasMixin('theme-dark') 为 true ⇒ 「补 darkFinal（M4-10 枚举三核心）」被跳过
 * ⇒ theme-vars.less 的 dark ≠ css-vars.js 的 dark ⇒ 用户视觉「dark 和主题2 一样」。
 */
describe('renderMicrocodeThemeVarsLess — N 主题循环里系统占位 dark 强制枚举', () => {
  const MC_ENUM_PRIMARY = '#44E4FF' // M4-10 枚举 colorPrimary（见 MC_DARK_THEME_COLOR_ENUM）

  it('themeSlots.dark 的原始真值不得泄漏进 .theme-dark() 三核心', () => {
    const styleTokens = {
      themeMeta: [
        { key: 'light', name: '浅色', brightness: 'light' },
        { key: 'theme_2', name: '某主题', brightness: 'dark' },
        { key: 'dark', name: '深色', brightness: 'dark' },
      ],
      themeSlots: {
        light: { colorPrimary: '#a6ceff', colorTextBase: '#546881', colorBgDesign: '#a0c1ff' },
        // 深色稿真值被错误落到 dark 槽位（= theme_2 值）——上游数据事故形态
        dark: { colorPrimary: '#071f3d', colorTextBase: '#98c2f6', colorBgDesign: '#123259' },
        theme_2: { colorPrimary: '#071f3d', colorTextBase: '#98c2f6', colorBgDesign: '#123259' },
      },
    }
    const out = renderMicrocodeThemeVarsLess(styleTokens, '')
    // 提取 .theme-dark() 块
    const m = out.match(/\.theme-dark\(\)\s*\{([^}]*)\}/)
    expect(m).toBeTruthy()
    const body = m![1]
    // 三核心必须是 M4-10 枚举值（dark 视觉不得被 theme_2 顶掉）
    expect(body).toContain(`@colorPrimary: ${MC_ENUM_PRIMARY}`)
    expect(body).not.toContain('@colorPrimary: #071f3d')
  })

  it('自定义深色 key（theme_2）真值照常保留（不受枚举约束）', () => {
    const styleTokens = {
      themeMeta: [
        { key: 'light', name: '浅色', brightness: 'light' },
        { key: 'theme_2', name: '某主题', brightness: 'dark' },
        { key: 'dark', name: '深色', brightness: 'dark' },
      ],
      themeSlots: {
        light: { colorPrimary: '#a6ceff' },
        dark: { colorPrimary: '#071f3d' },
        theme_2: { colorPrimary: '#071f3d', colorTextBase: '#98c2f6' },
      },
    }
    const out = renderMicrocodeThemeVarsLess(styleTokens, '')
    const m = out.match(/\.theme-theme_2\(\)\s*\{([^}]*)\}/)
    expect(m).toBeTruthy()
    // mcSlotsFromTokens 输出 kebab-case
    expect(m![1]).toContain('@color-primary: #071f3d')
  })
})
