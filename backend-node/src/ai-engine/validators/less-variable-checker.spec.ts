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
