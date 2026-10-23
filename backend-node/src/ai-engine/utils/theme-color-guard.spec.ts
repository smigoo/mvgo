import {
  detectThemeColorViolations,
  collectIdenticalThemeMixins,
  collectFileLevelSlotOverrides,
  healFileLevelSlotOverrides,
  healBusinessStyleVarRefs,
  collectThemeSlotNames,
  healBusinessStyleVarsInCss,
} from './theme-color-guard.js'

/**
 * THEME-COLOR（2026-09-04）样式主题变量化门禁回归测试。
 *
 * 背景：mc-max-1788485095835-e1432017 把主题槽位色值抄写为样式字面量
 * （81 处 #hex、var(--color*) 引用 0）+ 子组件局部 @colorTextBase:#333 覆盖
 * → 切主题/调颜色变量零生效。本 guard 兜底：槽值抄写/预设重声明 BLOCK，
 * 设计专色/渐变/SVG WARN，var() 引用与主题槽位文件豁免。
 */

const THEME_VARS = `.theme-light() {
  @color-bg-base: #EDF4FB;
  @color-text-base: #333333;
  @color-text-secondary: #666666;
  @color-primary: #1990FF;
}
.theme-dark() {
  @color-bg-base: #1a1d2e;
  @color-text-base: #e8eaed;
}`

const findBy = (issues: any[], id: string) => issues.filter((i) => i.id === id)

describe('THEME-COLOR theme-color-guard 主题变量化门禁', () => {
  it('槽位文件 themes/theme-vars.less 自身豁免（唯一允许色值处）', () => {
    const issues = detectThemeColorViolations([
      { path: 'resources/styles/themes/theme-vars.less', content: THEME_VARS },
    ])
    expect(issues).toHaveLength(0)
  })

  it('vue3 theme-vars.less（无 themes/ 子目录）同样豁免（2026-09-17 治本）', () => {
    // vue3 路径是 resources/styles/theme-vars.less，此前 /\/themes\// 排除漏掉它，
    // .theme-dark() 硬编码槽位值被误判 THEME-PRESET-OVERRIDE BLOCK
    const vue3ThemeVars = `.common() {
  @fontSize: var(--fontSize, 14px);
  @colorTextBase: var(--colorTextBase, #ffffff);
}
.theme-dark() {
  @colorTextBase: #ffffff;
  @colorPrimary: #44E4FF;
}
.theme-light() {
  @colorTextBase: #333333;
  @colorPrimary: #1890ff;
}
`
    const issues = detectThemeColorViolations([
      { path: 'resources/styles/theme-vars.less', content: vue3ThemeVars },
    ])
    // 主题变量定义文件整体豁免，不应有任何 issue
    expect(issues).toHaveLength(0)
  })

  it('var() 变量引用 + 渐变合法 → 无 BLOCK', () => {
    const issues = detectThemeColorViolations([
      { path: 'resources/styles/themes/theme-vars.less', content: THEME_VARS },
      {
        path: 'package/index.vue',
        content: `<style lang="less" scoped>
.c-root { color: var(--colorTextBase, #333333); background: var(--colorPrimaryBg, #EDF4FB); }
.c-grad { background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 100%); }
</style>`,
      },
    ])
    expect(findBy(issues, 'THEME-SLOT-COLOR')).toHaveLength(0)
    expect(findBy(issues, 'THEME-PRESET-OVERRIDE')).toHaveLength(0)
  })

  it('槽位色值抄写 >3 处 → THEME-SLOT-COLOR BLOCK（超阈值仍拦截）', () => {
    const issues = detectThemeColorViolations([
      { path: 'resources/styles/themes/theme-vars.less', content: THEME_VARS },
      {
        path: 'package/components/Title.vue',
        content: `<style lang="less" scoped>
.c-a { color: #333333; }
.c-b { background-color: #EDF4FB; }
.c-c { color: #1990FF; }
.c-d { background-color: #1a1d2e; }
</style>`,
      },
    ])
    const blocks = findBy(issues, 'THEME-SLOT-COLOR').filter((i: any) => i.severity === 'BLOCK')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].message).toContain('#333333')
  })

  it('槽位色值抄写 ≤3 处 → 降级 WARN（2026-09-04 D：少量残留不硬失败）', () => {
    const issues = detectThemeColorViolations([
      { path: 'resources/styles/themes/theme-vars.less', content: THEME_VARS },
      {
        path: 'package/components/Title.vue',
        content: `<style lang="less" scoped>
.c-a { color: #333333; }
.c-b { background-color: #EDF4FB; }
</style>`,
      },
    ])
    const warns = findBy(issues, 'THEME-SLOT-COLOR').filter((i: any) => i.severity === 'WARN')
    expect(warns).toHaveLength(1)
    expect(warns[0].message).toContain('降级 WARN')
  })

  it('本地预设名字面量重声明 >2 处 → THEME-PRESET-OVERRIDE BLOCK', () => {
    const issues = detectThemeColorViolations([
      { path: 'resources/styles/themes/theme-vars.less', content: THEME_VARS },
      {
        path: 'package/components/DailyTotal.vue',
        content: `<style lang="less" scoped>
@colorTextBase: #333333;
@colorPrimary: #1990FF;
.c-x { color: @colorTextBase; }
.c-y { --colorPrimary: #fff; color: var(--colorPrimary); }
</style>`,
      },
    ])
    const blocks = findBy(issues, 'THEME-PRESET-OVERRIDE').filter((i: any) => i.severity === 'BLOCK')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].message).toContain('3 处')
  })

  it('本地预设名字面量重声明 ≤2 处 → 降级 WARN（2026-09-04 D）', () => {
    const issues = detectThemeColorViolations([
      { path: 'resources/styles/themes/theme-vars.less', content: THEME_VARS },
      {
        path: 'package/components/DailyTotal.vue',
        content: `<style lang="less" scoped>
@colorTextBase: #333333;
.c-x { color: @colorTextBase; }
</style>`,
      },
    ])
    const warns = findBy(issues, 'THEME-PRESET-OVERRIDE').filter((i: any) => i.severity === 'WARN')
    expect(warns).toHaveLength(1)
    expect(warns[0].message).toContain('降级 WARN')
  })

  it('var() 透传声明（@fontSize: var(--fontSize)）豁免 → 不报 THEME-PRESET-OVERRIDE（2026-09-04 A）', () => {
    const issues = detectThemeColorViolations([
      { path: 'resources/styles/themes/theme-vars.less', content: THEME_VARS },
      {
        path: 'package/components/LineChartArea.vue',
        content: `<style lang="less" scoped>
@fontSize: var(--fontSize);
.c-x { color: @colorTextBase; font-size: @fontSize; }
</style>`,
      },
    ])
    expect(findBy(issues, 'THEME-PRESET-OVERRIDE')).toHaveLength(0)
  })

  it('设计专色（非槽位）与渐变 → WARN 不阻断', () => {
    const issues = detectThemeColorViolations([
      { path: 'resources/styles/themes/theme-vars.less', content: THEME_VARS },
      {
        path: 'resources/styles/common.less',
        content: `.c-legend-bus { color: #FF7A00; }
.c-legend { background: linear-gradient(180deg, #ffffff, #e2f0ff); }
.c-veh-truck { fill: #52C41A; }`,
      },
    ])
    expect(findBy(issues, 'THEME-SLOT-COLOR')).toHaveLength(0)
    expect(findBy(issues, 'THEME-PRESET-OVERRIDE')).toHaveLength(0)
    const warns = findBy(issues, 'THEME-SPECIAL-COLOR').filter((i: any) => i.severity === 'WARN')
    expect(warns.length).toBeGreaterThanOrEqual(1)
  })

  it('.vue script 内 echarts 数据系列色不误报（只扫 <style>）', () => {
    const issues = detectThemeColorViolations([
      { path: 'resources/styles/themes/theme-vars.less', content: THEME_VARS },
      {
        path: 'package/components/Chart.vue',
        content: `<script setup>
const chartColors = ['#1990FF', '#52C41A', '#FF7A00']
</script>
<style lang="less" scoped>
.c-chart { height: 100%; color: var(--colorTextBase, #333333); }
</style>`,
      },
    ])
    expect(findBy(issues, 'THEME-SLOT-COLOR')).toHaveLength(0)
    expect(issues.filter((i: any) => i.severity === 'BLOCK')).toHaveLength(0)
  })

  it('theme-vars 无 hex 槽值时（异常形态）独立 hex 降级 WARN（fail-open 不误杀）', () => {
    const issues = detectThemeColorViolations([
      {
        path: 'resources/styles/themes/theme-vars.less',
        content: '.common() { @colorTextBase: var(--colorTextBase); }',
      },
      { path: 'resources/styles/common.less', content: `.c-x { color: #333333; }` },
    ])
    expect(findBy(issues, 'THEME-SLOT-COLOR')).toHaveLength(0)
    expect(findBy(issues, 'THEME-SPECIAL-COLOR').length).toBeGreaterThanOrEqual(1)
  })

  it('无效入参/空集安全返回空', () => {
    expect(detectThemeColorViolations([])).toHaveLength(0)
    expect(detectThemeColorViolations(null as any)).toHaveLength(0)
  })

  it('rgba() 形态抄写槽位色值同样计为 THEME-SLOT-COLOR（2026-09-15 治本）', () => {
    // 历史漏检：只认 #hex，LLM 写 rgba(51,51,51,1) 被当「半透明装饰色」降 WARN →
    // 槽值被抄写却零拦截（c-env-monitor-1cffd7ce 实锤：7 处 rgba 硬编码全放行）
    const issues = detectThemeColorViolations([
      {
        path: 'resources/styles/themes/theme-vars.less',
        content: [
          '.common() { @fontSize: var(--fontSize); }',
          '.theme-light() { @colorTextBase: #333333; }',
          '.theme-dark() { @colorTextBase: #f2f2f2; }',
        ].join('\n'),
      },
      {
        path: 'resources/styles/common.less',
        content: `.c-x { color: rgba(51, 51, 51, 1); }\n.c-y { color: rgba(242, 242, 242, 1); }`,
      },
    ])
    const slot = findBy(issues, 'THEME-SLOT-COLOR')
    expect(slot).toHaveLength(1)
    expect(slot[0].severity).toBe('WARN') // 2 处 ≤ 阈值 3 → 降级 WARN
    expect(slot[0].message).toContain('2 处')
  })

  it('rgba 专色（非槽值）仍为 THEME-SPECIAL-COLOR，不误升为槽位违规', () => {
    const issues = detectThemeColorViolations([
      {
        path: 'resources/styles/themes/theme-vars.less',
        content: '.theme-dark() { @colorTextBase: #ffffff; }',
      },
      {
        path: 'resources/styles/common.less',
        content: `.c-x { background: rgba(245, 63, 63, 1); }`,
      },
    ])
    expect(findBy(issues, 'THEME-SLOT-COLOR')).toHaveLength(0)
    expect(findBy(issues, 'THEME-SPECIAL-COLOR').length).toBeGreaterThanOrEqual(1)
  })

  it('.common() 定义颜色变量（>2 处）→ THEME-COMMON-COLOR-VAR 为 BLOCK（2026-10-09 阈值化）', () => {
    // 2026-09-15 全语料审计 70% 命中时曾统一 WARN；2026-10-09 三件治本落地后升级为阈值 BLOCK
    // （生成器移出 .common() 颜色 + 自愈器先补写再删 + 判据单一来源），>2 处说明系统性回潮，需重试修复。
    const issues = detectThemeColorViolations([
      {
        path: 'resources/styles/themes/theme-vars.less',
        content: [
          '.common() {',
          '  @fontSize: var(--fontSize);',
          '  @color-text-primary: rgba(51, 51, 51, 1);',
          '  @color-primary: rgba(85, 158, 255, 1);',
          '  @color-bg-base: #ffffff;',
          '  @color-warning: rgba(255, 94, 0, 1);',
          '}',
          '.theme-light() { @colorTextBase: #333333; }',
          '.theme-dark() { @colorTextBase: #f2f2f2; }',
        ].join('\n'),
      },
    ])
    const hit = findBy(issues, 'THEME-COMMON-COLOR-VAR')
    expect(hit).toHaveLength(1)
    expect(hit[0].severity).toBe('BLOCK')
    expect(hit[0].message).toContain('4 个颜色变量')
  })

  it('阳性对照：.common() 仅 1 处颜色变量 → 降级 WARN（≤COMMON_COLOR_WARN_UP_TO，不阻断）', () => {
    const issues = detectThemeColorViolations([
      {
        path: 'resources/styles/themes/theme-vars.less',
        content: [
          '.common() {',
          '  @fontSize: var(--fontSize);',
          '  @color-error: #ff4d4f;',
          '}',
          '.theme-light() { @colorTextBase: #333333; }',
          '.theme-dark() { @colorTextBase: #f2f2f2; }',
        ].join('\n'),
      },
    ])
    const hit = findBy(issues, 'THEME-COMMON-COLOR-VAR')
    expect(hit).toHaveLength(1)
    expect(hit[0].severity).toBe('WARN')
    expect(hit[0].message).toContain('≤2 处降级 WARN')
  })

  it('交界：恰好 2 处颜色变量 → 仍为 WARN（阈值含端点）', () => {
    const issues = detectThemeColorViolations([
      {
        path: 'resources/styles/themes/theme-vars.less',
        content: [
          '.common() {',
          '  @color-error: #ff4d4f;',
          '  @color-predict-line: #52c41a;',
          '}',
          '.theme-light() { @colorTextBase: #333333; }',
          '.theme-dark() { @colorTextBase: #f2f2f2; }',
        ].join('\n'),
      },
    ])
    const hit = findBy(issues, 'THEME-COMMON-COLOR-VAR')
    expect(hit).toHaveLength(1)
    expect(hit[0].severity).toBe('WARN')
  })

  it('.common() 仅含 var() 透传令牌（@fontSize）→ 不触发 THEME-COMMON-COLOR-VAR', () => {
    const issues = detectThemeColorViolations([
      {
        path: 'resources/styles/themes/theme-vars.less',
        content: [
          '.common() {',
          '  @fontSize: var(--fontSize);',
          '  @font-size-base: 14px;',
          '  @border-radius-base: 4px;',
          '}',
          '.theme-light() { @colorTextBase: #333333; }',
          '.theme-dark() { @colorTextBase: #f2f2f2; }',
        ].join('\n'),
      },
    ])
    expect(findBy(issues, 'THEME-COMMON-COLOR-VAR')).toHaveLength(0)
  })
})

/**
 * THEME-VAR-NAME-MISMATCH（2026-09-16）——`var(--x, fallback)` 的「名字存在性」门禁。
 *
 * 背景：c-env-monitor 系列实测——产物用 `var(--colorWhite, #ffffff)` / `var(--colorError, #f53f3f)`，
 * 而 css-vars.js 提供的是 `colorTextBase` / `colorDanger` 等，名字对不上 → 运行期注入不进去
 * → 恒走 fallback → 切主题零生效。全语料审计：248 组件中 150 命中（60%）→ 统一 WARN。
 */
describe('THEME-VAR-NAME-MISMATCH 业务样式直引 var()（模式 B，2026-09-16）', () => {
  const CSS_VARS = `const common = {
  fontSize: $mcCssBuilder.getCssSize(12),
  colorTextBase: '#ffffff',
  colorPrimary: '#44E4FF',
};
const light = {
  colorTextBase: '#333333',
};
export { common, light };`

  const DECLARE = `{
  "cssVariableConfig": [
    { "name": "设计稿背景色", "key": "colorBgDesign", "type": "color" }
  ]
}`

  const withFact = (lessOrVue: { path: string; content: string }) => [
    { path: 'resources/config/css-vars.js', content: CSS_VARS },
    { path: 'declare.json', content: DECLARE },
    lessOrVue,
  ]

  it('引用未提供的变量名 → 命中且为 WARN（不 BLOCK）', () => {
    const issues = detectThemeColorViolations(
      withFact({
        path: 'resources/styles/common.less',
        content: '.c-env-monitor-x { color: var(--colorWhite, #ffffff); background: var(--colorError, #f53f3f); }',
      }),
    )
    const hits = findBy(issues, 'THEME-VAR-NAME-MISMATCH')
    expect(hits).toHaveLength(1)
    expect(hits[0].severity).toBe('WARN')
    expect(hits[0].message).toContain('--colorWhite')
    expect(hits[0].message).toContain('--colorError')
  })

  it('LESS 槽位 kebab 名被误写成 CSS 变量 → 命中（--color-text-base 应为 --colorTextBase）', () => {
    const issues = detectThemeColorViolations(
      withFact({
        path: 'resources/styles/common.less',
        content: '.c-x { color: var(--color-text-base, #333333); }',
      }),
    )
    const hits = findBy(issues, 'THEME-VAR-NAME-MISMATCH')
    expect(hits).toHaveLength(1)
    expect(hits[0].message).toContain('--color-text-base')
  })

  it('模式 B：即使是合法变量名，业务样式直引 var() 仍报（尺寸类 --fontSize 放行）', () => {
    const issues = detectThemeColorViolations(
      withFact({
        path: 'resources/styles/common.less',
        content: [
          '.a { color: var(--colorTextBase, #333333); }',
          '.b { color: var(--colorPrimary); }',
          '.c { background: var(--colorBgDesign); }',
          '.d { font-size: var(--fontSize); }',
        ].join('\n'),
      }),
    )
    const hits = findBy(issues, 'THEME-VAR-NAME-MISMATCH')
    // 模式 B：颜色/阴影/背景/边框类 var() 一律属模式 A 残留；--fontSize 属尺寸类放行
    expect(hits).toHaveLength(1)
    expect(hits[0].message).toContain('--colorTextBase')
    expect(hits[0].message).toContain('--colorPrimary')
    expect(hits[0].message).toContain('--colorBgDesign')
    expect(hits[0].message).not.toContain('--fontSize')
  })

  it('模式 B：拿不到 css-vars.js 也不 fail-open（不再依赖「提供集」判断）', () => {
    const issues = detectThemeColorViolations([
      {
        path: 'resources/styles/common.less',
        content: '.c-x { color: var(--colorWhite, #ffffff); }',
      },
    ])
    const hits = findBy(issues, 'THEME-VAR-NAME-MISMATCH')
    expect(hits).toHaveLength(1)
    expect(hits[0].message).toContain('--colorWhite')
  })

  it('themes/ 与 config/ 目录不参与引用扫描（槽位与事实源自身豁免）', () => {
    const issues = detectThemeColorViolations(
      withFact({
        path: 'resources/styles/themes/theme-vars.less',
        content: '.c-x { color: var(--colorNotProvided, #fff); }',
      }),
    )
    expect(findBy(issues, 'THEME-VAR-NAME-MISMATCH')).toHaveLength(0)
  })
})

describe('THEME-MIXINS-IDENTICAL 两套 theme mixin 值相同（模式 B，2026-09-16）', () => {
  const tv = (dark: string, light: string) =>
    `.theme-dark() {\n${dark}\n}\n.theme-light() {\n${light}\n}`

  const SAME = tv(
    '  @color-text-base: #ffffff;\n  @color-primary: #5478ff;',
    '  @color-text-base: #ffffff;\n  @color-primary: #5478ff;',
  )

  it('两套 mixin 槽位值逐字相同 → 命中，返回槽位个数', () => {
    const r = collectIdenticalThemeMixins([
      { path: 'resources/styles/themes/theme-vars.less', content: SAME },
    ])
    expect(r).not.toBeNull()
    expect(r!.slotCount).toBe(2)
  })

  it('两套 mixin 有差异 → 不命中（正常双主题）', () => {
    const r = collectIdenticalThemeMixins([
      {
        path: 'resources/styles/themes/theme-vars.less',
        content: tv('  @color-text-base: #ffffff;', '  @color-text-base: #333333;'),
      },
    ])
    expect(r).toBeNull()
  })

  it('缺 theme-vars.less 或缺任一 mixin → fail-open 返回 null', () => {
    expect(collectIdenticalThemeMixins([])).toBeNull()
    expect(
      collectIdenticalThemeMixins([
        { path: 'resources/styles/common.less', content: '.a{}' },
      ]),
    ).toBeNull()
    // 只有 light 没有 dark → 结构缺失由 less-variable-checker 负责，此处不重复报
    expect(
      collectIdenticalThemeMixins([
        {
          path: 'resources/styles/themes/theme-vars.less',
          content: '.theme-light() {\n  @a: #fff;\n}',
        },
      ]),
    ).toBeNull()
  })

  it('接入主流程：相同值产出 BLOCK（0.1+0.3-b 后语料实测 0% 命中，故升级为 BLOCK）', () => {
    const issues = detectThemeColorViolations([
      { path: 'resources/styles/themes/theme-vars.less', content: SAME },
    ])
    const hits = findBy(issues, 'THEME-MIXINS-IDENTICAL')
    expect(hits).toHaveLength(1)
    expect(hits[0].severity).toBe('BLOCK')
    expect(hits[0].message).toContain('完全相同')
  })

  // 🛡️ 2026-09-29 回归（mc-max-1790666332846-2e5fc9e7 实锤，误报率 93.4%）：
  //   系统确定性生成的 theme-vars.less 头部第 2 行注释并列列出了三个 mixin 名。
  //   原 grab 用 indexOf 抓「第一次出现」⇒ 两次都命中注释行 ⇒ 都落到 `.common()` 块 ⇒
  //   恒判「两套 mixin 相同」。真机 453 个组件命中 257 个，其中 239 个是本误报，
  //   当天导致 25 个任务重试耗尽失败（门禁是 BLOCK）。
  const HEADER = (body: string) =>
    [
      '// 微码组件主题变量文件（系统确定性生成；§3 核心槽位值由 buildStyleTokens 注入，勿手改）',
      '// 结构：三个 mixin（.common() / .theme-dark() / .theme-light()）',
      '// 约束：mixin 内仅允许 @变量 定义，禁止任何 CSS 属性；禁止 CSS 变量',
      '',
      '',
      body,
    ].join('\n')

  it('回归：模板头注释含 mixin 名 + 两套值实际不同 → 必须不命中（原实现误报）', () => {
    const content = HEADER(
      tv(
        '  @color-text-base: #ffffff;\n  @color-primary: #44E4FF;',
        '  @color-text-base: #333333;\n  @color-primary: #1990ff;',
      ),
    )
    expect(
      collectIdenticalThemeMixins([
        { path: 'resources/styles/themes/theme-vars.less', content },
      ]),
    ).toBeNull()
  })

  it('回归：模板头注释存在但两套值真相同 → 仍命中，且 slotCount 取 mixin 自身而非 .common()', () => {
    const content = HEADER(
      [
        '.common() {',
        '  @font-size-base: 14px;',
        '  @font-size-lg: 20px;',
        '  @font-size-xl: 28px;',
        '}',
        '',
        tv(
          '  @color-text-base: #ffffff;\n  @color-primary: #5478ff;',
          '  @color-text-base: #ffffff;\n  @color-primary: #5478ff;',
        ),
      ].join('\n'),
    )
    const r = collectIdenticalThemeMixins([
      { path: 'resources/styles/themes/theme-vars.less', content },
    ])
    expect(r).not.toBeNull()
    // 必须是 mixin 自身的 2 个槽位，而不是 .common() 的 3 个
    expect(r!.slotCount).toBe(2)
  })

  it('回归：mixin 定义可带缩进；`&.dark { .theme-dark(); }` 调用形态不被误当定义', () => {
    const content = [
      '.theme-dark() {',
      '  @a: #000;',
      '}',
      '.theme-light() {',
      '  @a: #fff;',
      '}',
      '&.dark { .theme-dark(); }',
      '&.light { .theme-light(); }',
    ].join('\n')
    expect(
      collectIdenticalThemeMixins([
        { path: 'resources/styles/themes/theme-vars.less', content },
      ]),
    ).toBeNull()
  })
})

describe('THEME-SLOT-LOCAL-OVERRIDE 文件级槽位字面量重声明（2026-09-16）', () => {
  const f = (path: string, content: string) => [{ path, content }]

  it('common.less 顶层 @color-*: 字面量 → 命中', () => {
    const hits = collectFileLevelSlotOverrides(
      f('resources/styles/common.less', '@color-text-base: rgba(51,51,51,1);\n.c-x { color: red; }'),
    )
    expect(hits).toHaveLength(1)
    expect(hits[0].line).toBe(1)
    expect(hits[0].sample).toContain('@color-text-base')
  })

  it('#hex 与 rgba 两种字面量形态都命中', () => {
    const hits = collectFileLevelSlotOverrides(
      f('resources/styles/common.less', '@color-primary: #1890ff;\n@color-bg: rgba(237,244,251,1);'),
    )
    expect(hits).toHaveLength(2)
  })

  it('规则块/选择器内部（深度>0）→ 不算文件级，不命中', () => {
    const hits = collectFileLevelSlotOverrides(
      f(
        'resources/styles/common.less',
        '.c-x {\n  @color-text-base: #333;\n  color: @color-text-base;\n}',
      ),
    )
    expect(hits).toHaveLength(0)
  })

  it('值为 var() 或其它变量引用 → 不命中（非字面量）', () => {
    expect(
      collectFileLevelSlotOverrides(
        f('resources/styles/common.less', '@color-primary: var(--colorPrimary);'),
      ),
    ).toHaveLength(0)
    expect(
      collectFileLevelSlotOverrides(
        f('resources/styles/common.less', '@color-primary: @other-var;'),
      ),
    ).toHaveLength(0)
  })

  it('themes/ 与 config/ 豁免（槽位本就该定义在主题 mixin 里）', () => {
    expect(
      collectFileLevelSlotOverrides(
        f('resources/styles/themes/theme-vars.less', '@color-bg: rgba(26,35,50,1);'),
      ),
    ).toHaveLength(0)
  })

  it('.vue <style> 顶层重声明同样命中', () => {
    const hits = collectFileLevelSlotOverrides(
      f(
        'package/index.vue',
        '<style lang="less" scoped>\n@color-text-base: #333333;\n.c-x { color: @color-text-base; }\n</style>',
      ),
    )
    expect(hits).toHaveLength(1)
    expect(hits[0].sample).toContain('@color-text-base')
  })

  it('接入主流程：产出 BLOCK（后果最重且可确定性删除）', () => {
    const issues = detectThemeColorViolations(
      f('resources/styles/common.less', '@color-text-base: rgba(51,51,51,1);'),
    )
    const hits = findBy(issues, 'THEME-SLOT-LOCAL-OVERRIDE')
    expect(hits).toHaveLength(1)
    expect(hits[0].severity).toBe('BLOCK')
    expect(hits[0].message).toContain('首个定义者胜出')
  })
})

describe('healFileLevelSlotOverrides 确定性自愈（2026-09-16）', () => {
  const f = (path: string, content: string) => [{ path, content }]

  it('删除 common.less 顶层的 @color-* 字面量重声明行', () => {
    const files = f(
      'resources/styles/common.less',
      '@color-text-base: rgba(51,51,51,1);\n@color-primary: #1890ff;\n.c-x { color: red; }',
    )
    const r = healFileLevelSlotOverrides(files)
    expect(r.changed).toBe(true)
    expect(r.removed).toBe(2)
    expect(files[0].content).toBe('.c-x { color: red; }')
  })

  it('保留规则块内的同名赋值（depth>0 不删）', () => {
    const files = f(
      'resources/styles/common.less',
      '.c-x {\n  @color-text-base: #333;\n  color: @color-text-base;\n}\n@color-bg: rgba(26,35,50,1);',
    )
    const r = healFileLevelSlotOverrides(files)
    expect(r.removed).toBe(1) // 仅顶层那行
    expect(files[0].content).toContain('@color-text-base: #333')
  })

  it('值为 var()/变量引用不删（合法透传）', () => {
    const files = f('resources/styles/common.less', '@color-primary: var(--colorPrimary);\n@color-bg: @other;')
    const r = healFileLevelSlotOverrides(files)
    expect(r.changed).toBe(false)
  })

  it('.vue <style> 顶层重声明被删、模板 @click 不被误伤', () => {
    const files = f(
      'package/index.vue',
      '<template>\n  <div @click="onX">a</div>\n</template>\n<style lang="less" scoped>\n@color-text-base: #333333;\n.c-x { color: @color-text-base; }\n</style>',
    )
    const r = healFileLevelSlotOverrides(files)
    expect(r.changed).toBe(true)
    expect(files[0].content).toContain('@click="onX"') // 模板事件未被删
    expect(files[0].content).not.toContain('@color-text-base: #333333')
  })

  it('themes/ 与 config/ 豁免', () => {
    const files = f('resources/styles/themes/theme-vars.less', '@color-bg: rgba(26,35,50,1);')
    const r = healFileLevelSlotOverrides(files)
    expect(r.changed).toBe(false)
  })

  it('自愈后 THEME-SLOT-LOCAL-OVERRIDE 不再命中', () => {
    const files = f('resources/styles/common.less', '@color-text-base: rgba(51,51,51,1);\n.c-x { color: red; }')
    healFileLevelSlotOverrides(files)
    const issues = detectThemeColorViolations(files)
    expect(findBy(issues, 'THEME-SLOT-LOCAL-OVERRIDE')).toHaveLength(0)
  })
})

describe('VAR-SUFFIX-ILLEGAL var()-后缀非法拼接（2026-09-16 · c-vehicle-monitor-71dd6494）', () => {
  it('var(--color-bg, rgba(...))-card → BLOCK', () => {
    const issues = detectThemeColorViolations([
      { path: 'resources/styles/themes/theme-vars.less', content: THEME_VARS },
      {
        path: 'resources/styles/common.less',
        content: '.c-stat-card {\n  background: var(--color-bg, rgba(237, 244, 251, 1))-card;\n}',
      },
    ])
    const hits = findBy(issues, 'VAR-SUFFIX-ILLEGAL')
    expect(hits).toHaveLength(1)
    expect(hits[0].severity).toBe('BLOCK')
  })

  it('合法 var(--x, fallback) 结尾 → 不命中', () => {
    const issues = detectThemeColorViolations([
      { path: 'resources/styles/themes/theme-vars.less', content: THEME_VARS },
      {
        path: 'resources/styles/common.less',
        content: '.c-x { background: var(--colorBgCard, #ffffff); }\n.c-y { color: var(--colorTextBase, #333333); }',
      },
    ])
    expect(findBy(issues, 'VAR-SUFFIX-ILLEGAL')).toHaveLength(0)
  })

  it('themes/ 豁免（槽位声明里 var() 透传是合法的）', () => {
    const issues = detectThemeColorViolations([
      { path: 'resources/styles/themes/theme-vars.less', content: '.common() { @fontSize: var(--fontSize); }' },
    ])
    expect(findBy(issues, 'VAR-SUFFIX-ILLEGAL')).toHaveLength(0)
  })
})

describe('healBusinessStyleVarRefs：业务样式 var() 直引自愈（模式 A→B，2026-09-17）', () => {
  it('var(--colorTextBase, 浅色) → @color-text-base（文字白色黑底根治）', () => {
    const files = {
      'resources/styles/themes/theme-vars.less': `.theme-light() { @color-text-base: #000000; @color-primary: #1890ff; }`,
      'package/index.vue': `<style>.a { color: var(--colorTextBase, rgba(230, 237, 245, 1)); }</style>`,
    }
    const fixed = healBusinessStyleVarRefs(files, { logger: { warn() {} } })
    expect(fixed.length).toBe(1)
    expect(files['package/index.vue']).toContain('color: @color-text-base;')
    expect(files['package/index.vue']).not.toContain('var(--colorTextBase')
  })

  it('槽位不存在的 var → 回退 fallback 字面量（丢弃 var）', () => {
    const files = {
      'resources/styles/themes/theme-vars.less': `.theme-light() { @color-text-base: #000000; }`,
      'package/index.vue': `<style>.b { color: var(--color-success, rgba(8,163,165,1)); }</style>`,
    }
    const fixed = healBusinessStyleVarRefs(files, { logger: { warn() {} } })
    expect(files['package/index.vue']).toContain('color: rgba(8,163,165,1);')
    expect(files['package/index.vue']).not.toContain('var(--color-success')
  })

  it('0.3-a：camelCase 槽名（@fontSize）走「原样名」查找 → @fontSize（不降级为 fallback 字面量）', () => {
    // 🛡️ 2026-09-26 治本 0.3-a：`.common()` 的槽名是 camelCase（@fontSize），
    // camelToKebab 会得到 font-size → 查不到 → 旧逻辑退化成 fallback（14px），**丢宿主响应式**。
    const files = {
      'resources/styles/themes/theme-vars.less': `.common() { @fontSize: var(--fontSize); }`,
      'package/index.vue': `<style>.c { font-size: calc(var(--fontSize, 14px) * 0.857); }</style>`,
    }
    const fixed = healBusinessStyleVarRefs(files, { logger: { warn() {} } })
    expect(fixed.length).toBe(1)
    expect(files['package/index.vue']).toContain('calc(@fontSize * 0.857)')
    expect(files['package/index.vue']).not.toContain('14px * 0.857')
  })

  it('0.3-a：无 fallback 的 var(--x) 也命中（此前正则强制要求 fallback → 完全不匹配，残留大头）', () => {
    const files = {
      'resources/styles/themes/theme-vars.less': `.theme-light() { @color-text-base: #333333; }`,
      'package/index.vue': `<style>.d { color: var(--colorTextBase); }</style>`,
    }
    const fixed = healBusinessStyleVarRefs(files, { logger: { warn() {} } })
    expect(fixed.length).toBe(1)
    expect(files['package/index.vue']).toContain('color: @color-text-base;')
    expect(files['package/index.vue']).not.toContain('var(--colorTextBase)')
  })

  it('theme-vars.less 自身透传 @x: var(--x) 不被改动', () => {
    const files = {
      'resources/styles/themes/theme-vars.less': `.common() { @fontSize: var(--fontSize); }`,
    }
    const fixed = healBusinessStyleVarRefs(files, { logger: { warn() {} } })
    expect(fixed.length).toBe(0)
    expect(files['resources/styles/themes/theme-vars.less']).toContain('@fontSize: var(--fontSize)')
  })
})

describe('collectThemeSlotNames / healBusinessStyleVarsInCss（2026-09-29 P0-C 抽出的 CSS 级变体）', () => {
  const tv = `.theme-light() { @color-text-base: #000000; @color-primary: #1890ff; }
.common() { @fontSize: var(--fontSize); }`;

  it('collectThemeSlotNames 提取 theme-vars 槽位名集合', () => {
    const names = collectThemeSlotNames(tv);
    expect(names.has('color-text-base')).toBe(true);
    expect(names.has('color-primary')).toBe(true);
    expect(names.has('fontSize')).toBe(true);
  });

  it('healBusinessStyleVarsInCss 仅作用于传入 CSS，var(--colorXxx) → @color-x', () => {
    const css = '.a { color: var(--colorTextBase, #333); }';
    const out = healBusinessStyleVarsInCss(css, collectThemeSlotNames(tv));
    expect(out).toContain('color: @color-text-base;');
    expect(out).not.toContain('var(--colorTextBase');
  });

  it('healBusinessStyleVarsInCss 不误伤 camelCase 槽名 var(--fontSize) → @fontSize（exact-name）', () => {
    const css = '.c { font-size: calc(var(--fontSize, 14px) * 0.857); }';
    const out = healBusinessStyleVarsInCss(css, collectThemeSlotNames(tv));
    expect(out).toContain('calc(@fontSize * 0.857)');
  });

  it('healBusinessStyleVarsInCss 槽位不存在的 var → 回退 fallback 字面量', () => {
    const css = '.b { color: var(--color-success, rgba(8,163,165,1)); }';
    const out = healBusinessStyleVarsInCss(css, collectThemeSlotNames(tv));
    expect(out).toContain('color: rgba(8,163,165,1);');
  });

  it('healBusinessStyleVarsInCss 非 theme 槽位的 var（如局部 mixin 参数）回退 fallback 字面量', () => {
    const css = '.d { padding: var(--gap, 8px); }';
    const out = healBusinessStyleVarsInCss(css, collectThemeSlotNames(tv));
    expect(out).toContain('padding: 8px;');
    expect(out).not.toContain('var(--gap');
  });

  // 🛡️ 2026-10-08 治本（实锤 c-a54c97-a54c975f）：桥接声明行 `@x: var(--x)` 若被替换
  // 会变成 `@x: @x` → LESS「Recursive variable definition」→ 整组件编译失败。
  it('桥接声明行 @x: var(--x) 原样保留（不产生递归定义，实锤 c-a54c97 common.less:1）', () => {
    const css = '@fontSize: var(--fontSize);\n.a { font-size: @fontSize; }';
    const out = healBusinessStyleVarsInCss(css, collectThemeSlotNames(tv));
    expect(out).toContain('@fontSize: var(--fontSize);');
    expect(out).not.toContain('@fontSize: @fontSize');
    expect(out).toContain('.a { font-size: @fontSize; }');
  });

  it('声明行引用**其它**槽位仍照常替换（@titleSize: var(--fontSize) → @titleSize: @fontSize）', () => {
    const css = '@titleSize: var(--fontSize);\n@colorTextBase: var(--colorTextBase);';
    const out = healBusinessStyleVarsInCss(css, collectThemeSlotNames(tv));
    expect(out).toContain('@titleSize: @fontSize;');
    // tv 里 colorTextBase 的槽名是 kebab（color-text-base）≠ 声明名 colorTextBase → 照常替换，无递归
    expect(out).toContain('@colorTextBase: @color-text-base;');
  });

  it('多行文本逐行处理：桥接行保留、普通行替换互不干扰', () => {
    const css = [
      '@fontSize: var(--fontSize);',
      '.card {',
      '  color: var(--colorTextBase);',
      '  font-size: var(--fontSize);',
      '}',
    ].join('\n');
    const out = healBusinessStyleVarsInCss(css, collectThemeSlotNames(tv));
    expect(out.split('\n')[0]).toBe('@fontSize: var(--fontSize);');
    expect(out).toContain('color: @color-text-base;');
    expect(out).toContain('font-size: @fontSize;');
  });

  // ============================================================
  // 🆕 2026-10-23 治本（mc-max-1792739994368-e2c61f62 实锤）：
  //   fallback 嵌套 var() 时 VAR_RE 懒匹配 `[^)]+?` 吞内层 var 左半、
  //   闭括号配到内层 `)` ⇒ 替换后丢一个括号 ⇒
  //   `calc(@fontSize) * 1.7143);` → LESS 门禁 Operation on an invalid type。
  //   防线：fallback 含 var( ⇒ 整段原样保留（fail-open）。
  // ============================================================
  it('🔴 嵌套 var fallback：var(--x, var(--x)) 双写自引用 ⇒ 整段保留，绝不拆半丢括号（事故现场形态）', () => {
    const css = '.c-device-card-grid-value {\n  font-size: calc(var(--fontSize, var(--fontSize)) * 1.7143);\n}';
    const out = healBusinessStyleVarsInCss(css, collectThemeSlotNames(tv));
    // 事故形态必须消失：不产出 calc(@fontSize) *（乘法在 calc 外）
    expect(out).not.toMatch(/calc\(\s*@[\w-]+\s*\)\s*\*/);
    // 整段保留（fail-open，交给源头 healThemeMixinVarRefs 治本不产生）
    // 🔴 注意 `* 1.7143);` 是 calc 的**合法闭括号 + 分号**，不是孤儿残骸——
    //    事故残骸的特征是「乘法落在 calc 外」（即上方 854 行的形态），已单独断言，
    //    勿再用 `not.toMatch(/1\.7143\);/)` 误伤合法原文（2026-10-23 实证）。
    expect(out).toContain('var(--fontSize, var(--fontSize)) * 1.7143');
  });

  it('嵌套 var fallback 无 calc 包裹（font-size: var(--x, var(--x))）⇒ 同样整段保留', () => {
    const css = '.a { font-size: var(--fontSize, var(--fontSize)); }';
    const out = healBusinessStyleVarsInCss(css, collectThemeSlotNames(tv));
    expect(out).toBe(css);
  });

  it('回归：字面量 fallback 照常转换（var(--fontSize, 14px) → @fontSize，运行期响应保留）', () => {
    const css = '.a { font-size: calc(var(--fontSize, 14px) * 1.7143); }';
    const out = healBusinessStyleVarsInCss(css, collectThemeSlotNames(tv));
    expect(out).toContain('calc(@fontSize * 1.7143)');
  });

  it('回归：无 fallback 的 var(--x) 照常转换（不受嵌套守卫影响）', () => {
    const css = '.a { font-size: var(--fontSize); }';
    const out = healBusinessStyleVarsInCss(css, collectThemeSlotNames(tv));
    expect(out).toContain('font-size: @fontSize;');
  });
})
