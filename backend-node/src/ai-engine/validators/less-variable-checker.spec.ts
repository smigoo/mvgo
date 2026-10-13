import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { readFileSync } from 'fs'

jest.mock('../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: join(tmpdir(), 'mvgo-test-logs'),
}), { virtual: true })

import { LessVariableChecker } from './less-variable-checker.js'

describe('LessVariableChecker', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mvgo-less-vars-'))
    await mkdir(join(root, 'package'), { recursive: true })
    await mkdir(join(root, 'resources', 'styles', 'themes'), { recursive: true })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('ignores Vue template events and only scans lang=less style blocks', async () => {
    await writeFile(
      join(root, 'package', 'index.vue'),
      `<template><button @click="refresh">刷新</button></template>\n<script setup>const refresh = () => {}</script>\n<style lang="less" scoped>.root { color: @text-color; }</style>`,
      'utf-8',
    )
    await writeFile(
      join(root, 'resources', 'styles', 'themes', 'theme-vars.less'),
      `.common() { @text-color: #fff; }\n.common();\n`,
      'utf-8',
    )

    const result = await LessVariableChecker.check(root)

    expect(result.usedVariables.has('text-color')).toBe(true)
    expect(result.usedVariables.has('click')).toBe(false)
    expect(result.missingVariables).toEqual([])
  })

  it('主题 mixin 已定义的变量不再复制进 .common()（否则静默挡住主题覆盖）', async () => {
    // 🛡️ 2026-09-15 治本回归：LESS 的 mixin 变量不覆盖 caller 已有同名变量。
    // 若把 .theme-light()/.theme-dark() 的颜色变量复制进 .common()，.common() 会抢先定义，
    // 后调用的 .theme-dark() 被静默忽略 → .dark/.light 编译结果完全相同（切主题零生效）。
    await writeFile(
      join(root, 'package', 'index.vue'),
      `<template><div class="root"></div></template>\n<style lang="less" scoped>.root { background: @c-test-bg; color: @c-test-primary; }</style>`,
      'utf-8',
    )
    await writeFile(
      join(root, 'resources', 'styles', 'themes', 'theme-vars.less'),
      [
        // ⚠️ .common() 里刻意只放**非颜色**令牌：本用例的命题是「主题 mixin 已定义的变量
        //    不要被复制进 .common()」。若放 `@c-test-text: #333`（值含色值字面量），
        //    会先被 2026-10-09 的「.common() 颜色迁出」规则命中而改变 fixed 结果，混淆命题。
        `.common() { @c-test-size: 16px; }`,
        `.theme-light() { @c-test-bg: #edf4fb; @c-test-primary: #1990ff; }`,
        `.theme-dark() { @c-test-bg: #1a2332; @c-test-primary: #44e4ff; }`,
        `.theme-light();`,
        `.common();`,
      ].join('\n'),
      'utf-8',
    )

    const result = await LessVariableChecker.check(root)

    // 变量已在主题 mixin 定义 → 不算缺失 → 不做任何补全
    expect(result.missingVariables).toEqual([])
    expect(result.fixed).toBe(false)

    const content = readFileSync(
      join(root, 'resources', 'styles', 'themes', 'theme-vars.less'),
      'utf-8',
    )
    // .common() 中不得出现这两个颜色变量（出现即挡主题覆盖）
    const commonBlock = content.match(/\.common\s*\(\s*\)\s*\{([^}]*)\}/)
    expect(commonBlock).not.toBeNull()
    const commonBody = commonBlock![1]
    expect(commonBody).not.toContain('@c-test-bg')
    expect(commonBody).not.toContain('@c-test-primary')
    // 原有变量保持不变
    expect(content).toContain('@c-test-size: 16px;')
  })

  it('任何 mixin 都未定义的颜色变量 → 补进两个主题 mixin（不进 .common()）', async () => {
    await writeFile(
      join(root, 'package', 'index.vue'),
      `<template><div class="root"></div></template>\n<style lang="less" scoped>.root { color: @c-brand-color; }</style>`,
      'utf-8',
    )
    await writeFile(
      join(root, 'resources', 'styles', 'themes', 'theme-vars.less'),
      [
        `.common() { @fontSize: var(--fontSize); }`,
        `.theme-light() { @c-slot: #fff; }`,
        `.theme-dark() { @c-slot: #000; }`,
      ].join('\n'),
      'utf-8',
    )

    const result = await LessVariableChecker.check(root)
    expect(result.missingVariables).toEqual(['c-brand-color'])

    const content = readFileSync(
      join(root, 'resources', 'styles', 'themes', 'theme-vars.less'),
      'utf-8',
    )
    // 颜色变量落进两个主题 mixin，而不是 .common()
    const commonBlock = content.match(/\.common\s*\(\s*\)\s*\{([^}]*)\}/)
    expect(commonBlock).not.toBeNull()
    expect(commonBlock![1]).not.toContain('@c-brand-color')
    const lightBlock = content.match(/\.theme-light\s*\(\s*\)\s*\{([^}]*)\}/)
    const darkBlock = content.match(/\.theme-dark\s*\(\s*\)\s*\{([^}]*)\}/)
    expect(lightBlock[1]).toContain('@c-brand-color')
    expect(darkBlock[1]).toContain('@c-brand-color')
  })

  it('uses safeLessVarValue semantic guess when variable is not in any mixin', async () => {
    // 变量名有语义但不在任何 mixin 中 → safeLessVarValue 推断
    await writeFile(
      join(root, 'package', 'index.vue'),
      `<template><div class="root"></div></template>\n<style lang="less" scoped>.root { background: @unknown-bg; }</style>`,
      'utf-8',
    )
    await writeFile(
      join(root, 'resources', 'styles', 'themes', 'theme-vars.less'),
      `.common() { @existing-var: #000; }\n.common();\n`,
      'utf-8',
    )

    const result = await LessVariableChecker.check(root)

    expect(result.fixed).toBe(true)
    expect(result.missingVariables).toEqual(['unknown-bg'])
    expect(result.uninferredVariables).toEqual([])  // safeLessVarValue 能推断 bg→白色

    const content = readFileSync(
      join(root, 'resources', 'styles', 'themes', 'theme-vars.less'),
      'utf-8',
    )
    // safeLessVarValue('@unknown-bg') → /bg/ → 颜色分支返回真实颜色 #ffffff
    // （2026-09-13 回退 var() 透传：真实颜色才能被 lighten()/fade() 求值）
    expect(content).toContain('@unknown-bg: #ffffff; // 自动添加（语义推断）')
  })

  it('records warning for truly unguessable variable names', async () => {
    // 变量名无语义匹配 → 结构化告警
    await writeFile(
      join(root, 'package', 'index.vue'),
      `<template><div class="root"></div></template>\n<style lang="less" scoped>.root { value: @my-custom-thing; }</style>`,
      'utf-8',
    )
    await writeFile(
      join(root, 'resources', 'styles', 'themes', 'theme-vars.less'),
      `.common() { @existing-var: #000; }\n.common();\n`,
      'utf-8',
    )

    const result = await LessVariableChecker.check(root)

    expect(result.fixed).toBe(true)
    expect(result.missingVariables).toEqual(['my-custom-thing'])
    // safeLessVarValue('@my-custom-thing') 无匹配 → 'unset'
    expect(result.uninferredVariables).toEqual(['my-custom-thing'])

    const content = readFileSync(
      join(root, 'resources', 'styles', 'themes', 'theme-vars.less'),
      'utf-8',
    )
    expect(content).toContain('@my-custom-thing: unset;')
    expect(content).toContain('⚠️')
  })

  // ── 刀 16b（2026-09-13）：颜色函数实参的兜底必须是可求值真颜色 ──
  it('变量被颜色函数当实参引用 → 兜底为中立真颜色（而非 unset），并记录告警', async () => {
    await writeFile(
      join(root, 'package', 'index.vue'),
      `<template><div class="root"></div></template>\n<style lang="less" scoped>.root { color: lighten(@my-custom-thing, 10%); }</style>`,
      'utf-8',
    )
    await writeFile(
      join(root, 'resources', 'styles', 'themes', 'theme-vars.less'),
      `.common() { @existing-var: #000; }\n.common();\n`,
      'utf-8',
    )

    const result = await LessVariableChecker.check(root)

    expect(result.fixed).toBe(true)
    // 扫描阶段收集到「颜色函数实参」变量
    expect([...result.colorFnVariables]).toContain('my-custom-thing')
    // 兜底值必须可被 lighten() 求值 —— unset 会让整个 <style> 块编译失败
    const content = readFileSync(
      join(root, 'resources', 'styles', 'themes', 'theme-vars.less'),
      'utf-8',
    )
    expect(content).toContain('@my-custom-thing: #333333;')
    expect(content).not.toContain('@my-custom-thing: unset;')
    // 合成值需人工核对真值 → 仍要落结构化告警
    expect(result.uninferredVariables).toContain('my-custom-thing')
  })

  it('名字分支本会给出非颜色（@radius-x → 8px）时，被颜色函数引用仍纠正为真颜色', async () => {
    await writeFile(
      join(root, 'package', 'index.vue'),
      `<template><div class="root"></div></template>\n<style lang="less" scoped>.root { color: lighten(@radius-x, 10%); }</style>`,
      'utf-8',
    )
    await writeFile(
      join(root, 'resources', 'styles', 'themes', 'theme-vars.less'),
      `.common() { @existing-var: #000; }\n.common();\n`,
      'utf-8',
    )

    await LessVariableChecker.check(root)

    const content = readFileSync(
      join(root, 'resources', 'styles', 'themes', 'theme-vars.less'),
      'utf-8',
    )
    // 只看名字会得到 '8px'（编译期不可求值）——消费端事实必须压过名字猜测
    expect(content).toContain('@radius-x: #333333;')
    expect(content).not.toContain('@radius-x: 8px;')
  })

  it('未被颜色函数引用 → 保持原有语义推断 / unset 行为（不刷无关变更）', async () => {
    await writeFile(
      join(root, 'package', 'index.vue'),
      `<template><div class="root"></div></template>\n<style lang="less" scoped>.root { color: @my-custom-thing; border-radius: @radius-x; }</style>`,
      'utf-8',
    )
    await writeFile(
      join(root, 'resources', 'styles', 'themes', 'theme-vars.less'),
      `.common() { @existing-var: #000; }\n.common();\n`,
      'utf-8',
    )

    await LessVariableChecker.check(root)

    const content = readFileSync(
      join(root, 'resources', 'styles', 'themes', 'theme-vars.less'),
      'utf-8',
    )
    expect(content).toContain('@my-custom-thing: unset;')
    expect(content).toContain('@radius-x: 8px;')
  })

  it('确定性自愈：.common() 颜色变量**迁出**到主题 mixin（双侧已定义直删，单侧缺失先补写）', async () => {
    // 场景：checker 历史行为把 theme mixin 的颜色变量复制进 .common() → 挡住主题覆盖。
    // 2026-10-09 放宽前置条件：不再只在「两个主题都已定义」时删，而是**先补写再删**——
    // 颜色回到「主题 mixin 定义」的正确归属，且不产生未定义变量（可编译、外观不变）。
    await writeFile(
      join(root, 'package', 'index.vue'),
      `<template><div class="root"></div></template>\n<style lang="less" scoped>.root { color: @color-text-primary; }</style>`,
      'utf-8',
    )
    await writeFile(
      join(root, 'resources', 'styles', 'themes', 'theme-vars.less'),
      [
        '.common() {',
        '  @fontSize: var(--fontSize);',
        '  @border-radius-base: 4px;',
        '  @color-text-primary: rgba(51, 51, 51, 1);',
        '  @color-only-light: #ffffff;',
        '}',
        '.theme-light() { @color-text-primary: #333333; @color-only-light: #ffffff; }',
        '.theme-dark() { @color-text-primary: #f2f2f2; }',
      ].join('\n'),
      'utf-8',
    )

    const result = await LessVariableChecker.check(root)

    // 两个颜色变量都迁出：前者双侧已定义（直删），后者仅 light 定义（补进 dark 再删）
    expect(result.healedCommonColorVars!.sort()).toEqual([
      'color-only-light',
      'color-text-primary',
    ])
    expect(result.injectedCommonColorVars).toContain('@color-only-light→.theme-dark()')

    const content = readFileSync(
      join(root, 'resources', 'styles', 'themes', 'theme-vars.less'),
      'utf-8',
    )
    const commonBlock = content.match(/\.common\s*\(\s*\)\s*\{([^}]*)\}/)
    expect(commonBlock).not.toBeNull()
    const commonBody = commonBlock![1]
    expect(commonBlock![1]).not.toContain('@color-text-primary')
    expect(commonBlock![1]).not.toContain('@color-only-light')
    // 非颜色令牌保留（几何 / var() 透传）
    expect(commonBlock![1]).toContain('@fontSize')
    expect(commonBlock![1]).toContain('@border-radius-base')
    // 缺失侧被补写（值取自 .common() 原值 → 外观逐字不变）
    const darkBlock = content.match(/\.theme-dark\s*\(\s*\)\s*\{([^}]*)\}/)
    expect(darkBlock).not.toBeNull()
    expect(darkBlock![1]).toMatch(/@color-only-light\s*:\s*#ffffff/)
    // 原本就有的主题定义不受影响
    expect(darkBlock![1]).toMatch(/@color-text-primary\s*:\s*#f2f2f2/)
  })

  it('确定性自愈（阴性对照）：.common() 只有尺寸令牌与 var() 透传 → 一处都不动', async () => {
    await writeFile(
      join(root, 'package', 'index.vue'),
      `<template><div class="root"></div></template>\n<style lang="less" scoped>.root { color: var(--colorTextBase, @color-text-primary); }</style>`,
      'utf-8',
    )
    await writeFile(
      join(root, 'resources', 'styles', 'themes', 'theme-vars.less'),
      [
        '.common() {',
        '  @fontSize: var(--fontSize);',
        '  @border-radius-base: 4px;',
        '  @colorTextBase: var(--colorTextBase);',
        '}',
        '.theme-light() { @color-text-primary: #333333; }',
        '.theme-dark() { @color-text-primary: #f2f2f2; }',
      ].join('\n'),
      'utf-8',
    )

    const result = await LessVariableChecker.check(root)
    expect(result.healedCommonColorVars).toEqual([])

    const content = readFileSync(
      join(root, 'resources', 'styles', 'themes', 'theme-vars.less'),
      'utf-8',
    )
    const commonBlock = content.match(/\.common\s*\(\s*\)\s*\{([^}]*)\}/)
    expect(commonBlock![1]).toContain('@fontSize')
    expect(commonBlock![1]).toContain('@border-radius-base')
    // var() 透传是「接入主题变量」形态 → 必须留在 .common()，搬走会断掉平台注入通道
    expect(commonBlock![1]).toContain('@colorTextBase: var(--colorTextBase)')
  })

  it('确定性自愈（fail-open）：两个主题 mixin 都不存在 → 不动 .common()（不制造未定义变量）', async () => {
    await writeFile(
      join(root, 'package', 'index.vue'),
      `<template><div class="root"></div></template>`,
      'utf-8',
    )
    await writeFile(
      join(root, 'resources', 'styles', 'themes', 'theme-vars.less'),
      ['.common() {', '  @color-error: #ff4d4f;', '}'].join('\n'),
      'utf-8',
    )

    const result = await LessVariableChecker.check(root)
    expect(result.healedCommonColorVars).toEqual([])

    const content = readFileSync(
      join(root, 'resources', 'styles', 'themes', 'theme-vars.less'),
      'utf-8',
    )
    // 没有可补写的目标 mixin → 保守保留（否则业务样式引用 @color-error 时编译失败）
    expect(content.match(/\.common\s*\(\s*\)\s*\{([^}]*)\}/)![1]).toContain('@color-error')
  })

  it('框架预设名缺失 → 补进 .common() 为 var() 透传映射（不落真值）', async () => {
    // css-variable-pattern.md 规范：「.common() mixin 中映射了所有 cssVariableConfig 的 key」，
    // 形态是 `@key: var(--key)`。落成真值会丢掉运行期 CSS 变量响应。
    await writeFile(
      join(root, 'package', 'index.vue'),
      `<template><div class="root"></div></template>\n<style lang="less" scoped>.root { color: @colorTextBase; border-color: var(--colorPrimary, @colorPrimary); }</style>`,
      'utf-8',
    )
    await writeFile(
      join(root, 'resources', 'styles', 'themes', 'theme-vars.less'),
      [
        '.common() { @fontSize: var(--fontSize); }',
        '.theme-light() { @c-slot: #ffffff; }',
        '.theme-dark() { @c-slot: #000000; }',
      ].join('\n'),
      'utf-8',
    )

    await LessVariableChecker.check(root)

    const content = readFileSync(
      join(root, 'resources', 'styles', 'themes', 'theme-vars.less'),
      'utf-8',
    )
    const commonBlock = content.match(/\.common\s*\(\s*\)\s*\{([^}]*)\}/)
    expect(commonBlock).not.toBeNull()
    const commonBody = commonBlock![1]
    // 透传映射形态
    expect(commonBlock![1]).toContain('@colorTextBase: var(--colorTextBase)')
    expect(commonBlock![1]).toContain('@colorPrimary: var(--colorPrimary)')
    // 不得落成真值/推断色
    expect(commonBlock![1]).not.toMatch(/@colorTextBase\s*:\s*[#rgba]/i)
    expect(commonBlock![1]).not.toMatch(/@colorPrimary\s*:\s*[#rgba]/i)
  })
})

/**
 * 🔴 2026-10-13 回归（真机 fca166e8）：N 主题下 theme-vars.less 的
 * `.theme-dark()` 三核心被 theme_2 值顶掉（生成器已修），存量产物
 * 经写盘自愈链路应收敛为 M4-10 枚举值（与 css-vars.js 同口径）。
 */
describe('healThemeVarsDarkCore — theme-vars dark 三核心校正', () => {
  const coreLines = (themeVars: string) => {
    const m = themeVars.match(/\.theme-dark\(\)\s*\{([^}]*)\}/)
    expect(m).toBeTruthy()
    const pick = (name: string) =>
      m![1].match(new RegExp(`@${name}\\s*:\\s*([^;]+);`))?.[1]?.trim()
    return {
      'color-text-base': pick('color-text-base'),
      'color-primary': pick('color-primary'),
      'color-primary-bg': pick('color-primary-bg'),
    }
  }

  it('theme_2 值顶掉 dark 三核心时 → 校正为 M4-10 枚举值', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tvd-'))
    const p = join(dir, 'theme-vars.less')
    await writeFile(
      p,
      [
        '.common() {',
        '  @fontSize: 14px;',
        '}',
        '',
        '.theme-light() {',
        '  @color-primary: #a6ceff;',
        '}',
        '',
        // 事故形态：theme-dark 三核心 = theme_2 的值
        '.theme-dark() {',
        '  @color-text-base: #98c2f6;',
        '  @color-primary: #071f3d;',
        '  @color-primary-bg: #123259;',
        '}',
      ].join('\n'),
    )
    const r = LessVariableChecker.healThemeVarsDarkCore(p)
    expect(r.fixed).toBe(true)
    expect(r.changed.map((c) => c.name).sort()).toEqual([
      '@color-primary',
      '@color-primary-bg',
      '@color-text-base',
    ])
    const core = coreLines(readFileSync(p, 'utf-8'))
    expect(core['color-primary']).toBe('#44E4FF')
    expect(core['color-primary-bg']).toBe('#414141')
    expect(core['color-text-base']).toBe('#ffffff')
    await rm(dir, { recursive: true, force: true })
  })

  it('已符合枚举值 → 幂等（不写盘）', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tvd-'))
    const p = join(dir, 'theme-vars.less')
    const content = [
      '.theme-dark() {',
      '  @color-text-base: #ffffff;',
      '  @color-primary: #44E4FF;',
      '  @color-primary-bg: #414141;',
      '}',
    ].join('\n')
    await writeFile(p, content)
    const r = LessVariableChecker.healThemeVarsDarkCore(p)
    expect(r.fixed).toBe(false)
    expect(readFileSync(p, 'utf-8')).toBe(content)
    await rm(dir, { recursive: true, force: true })
  })

  it('无 .theme-dark() 块 → 静默跳过（不抛错）', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tvd-'))
    const p = join(dir, 'theme-vars.less')
    await writeFile(p, '.common() { @fontSize: 14px; }')
    expect(LessVariableChecker.healThemeVarsDarkCore(p).fixed).toBe(false)
    await rm(dir, { recursive: true, force: true })
  })
})

/**
 * 🔴🔴 2026-10-13 回归（真机 mc-max-1791884047075-49102507）：
 * common.less 引用 `@color-card-bg`（仅 .theme-dark() 定义），根作用域
 * （index.less 只有 .common()+.theme-light()）编译
 * `variable @color-card-bg is undefined` ⇒ 整个生成失败。
 * 旧「自动补全」判据 isLessVarDeclared 是文件级（dark 里有就算有）⇒ 漏补。
 */
describe('healRootScopeMissingSlots — 根作用域缺槽位补齐', () => {
  const write = async (dir: string, themeVars: string, commonLess: string) => {
    await mkdir(join(dir, 'resources/styles/themes'), { recursive: true })
    await writeFile(join(dir, 'resources/styles/themes/theme-vars.less'), themeVars)
    await writeFile(join(dir, 'resources/styles/common.less'), commonLess)
  }

  it('仅 dark 定义的槽位被 light 引用 → light 补浅色值、dark 不动', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rss-'))
    await write(
      dir,
      [
        '.common() { @font-size-base: 14px; }',
        '',
        '.theme-light() {',
        '  @color-primary: #a6ceff;',
        '}',
        '',
        '.theme-dark() {',
        '  @color-primary: #44E4FF;',
        '  @color-card-bg: rgba(20, 32, 52, 1);',
        '  @color-card-border: #141d29;',
        '}',
      ].join('\n'),
      [
        '.card {',
        '  background: @color-card-bg;',
        '  border: 1px solid @color-card-border;',
        '}',
      ].join('\n'),
    )
    const commonText = readFileSync(join(dir, 'resources/styles/common.less'), 'utf-8')
    console.log('DBG commonText:', JSON.stringify(commonText))
    const tvText = readFileSync(join(dir, 'resources/styles/themes/theme-vars.less'), 'utf-8')
    console.log('DBG tvText:', JSON.stringify(tvText.slice(0, 200)))
    const r = LessVariableChecker.healRootScopeMissingSlots(
      join(dir, 'resources/styles/themes/theme-vars.less'),
      join(dir, 'resources/styles/common.less'),
    )
    console.log('DBG r:', JSON.stringify(r))
    expect(r.fixed).toBe(true)
    // light 补了两个缺槽位；dark 本就有 → 不补
    expect(r.injected.filter((i) => i.includes('theme-light')).length).toBe(2)
    expect(r.injected.filter((i) => i.includes('theme-dark')).length).toBe(0)
    const tv = readFileSync(join(dir, 'resources/styles/themes/theme-vars.less'), 'utf-8')
    const lightBlock = tv.match(/\.theme-light\(\)\s*\{([^}]*)\}/)![1]
    // card-bg 按名猜值：light → 白系（可编译 + 浅色视觉正确）
    expect(lightBlock).toMatch(/@color-card-bg:\s*#ffffff/)
    await rm(dir, { recursive: true, force: true })
  })

  it('自定义深色 key（theme_N）缺失槽位按其主色亮度补深色值', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rss-'))
    await write(
      dir,
      [
        '.common() { @font-size-base: 14px; }',
        '',
        '.theme-light() { @color-primary: #a6ceff; }',
        '',
        // 深蓝主色 ⇒ 自定义 key 应推断为 dark 明暗
        '.theme-theme_2() { @color-primary: #071f3d; }',
      ].join('\n'),
      '.card { border: 1px solid @color-card-border; }',
    )
    const r = LessVariableChecker.healRootScopeMissingSlots(
      join(dir, 'resources/styles/themes/theme-vars.less'),
      join(dir, 'resources/styles/common.less'),
    )
    expect(r.fixed).toBe(true)
    const tv = readFileSync(join(dir, 'resources/styles/themes/theme-vars.less'), 'utf-8')
    const t2Block = tv.match(/\.theme-theme_2\(\)\s*\{([^}]*)\}/)![1]
    // border 按名猜值 + dark 明暗 → 深灰系
    expect(t2Block).toMatch(/@color-card-border:\s*#4b4b4b/)
    await rm(dir, { recursive: true, force: true })
  })

  it('全部主题槽位齐备 → 幂等不写盘', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rss-'))
    const themeVars = [
      '.common() {}',
      '.theme-light() { @color-card-bg: #fff; }',
      '.theme-dark() { @color-card-bg: #222; }',
    ].join('\n')
    await write(dir, themeVars, '.card { background: @color-card-bg; }')
    const r = LessVariableChecker.healRootScopeMissingSlots(
      join(dir, 'resources/styles/themes/theme-vars.less'),
      join(dir, 'resources/styles/common.less'),
    )
    expect(r.fixed).toBe(false)
    expect(readFileSync(join(dir, 'resources/styles/themes/theme-vars.less'), 'utf-8')).toBe(themeVars)
    await rm(dir, { recursive: true, force: true })
  })
})

