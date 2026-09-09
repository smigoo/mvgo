import { detectThemeColorViolations } from './theme-color-guard.js'

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
})
