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

  it('copies variable value from sibling light/dark mixin to .common()', async () => {
    // 模拟 LLM 在 .theme-light() 中定义了变量但忘记写进 .common() 的常见错误
    await writeFile(
      join(root, 'package', 'index.vue'),
      `<template><div class="root"></div></template>\n<style lang="less" scoped>.root { background: @c-test-bg; color: @c-test-primary; }</style>`,
      'utf-8',
    )
    await writeFile(
      join(root, 'resources', 'styles', 'themes', 'theme-vars.less'),
      [
        `.common() { @c-test-text: #333; }`,
        `.theme-light() { @c-test-bg: #edf4fb; @c-test-primary: #1990ff; }`,
        `.theme-dark() { @c-test-bg: #1a2332; @c-test-primary: #44e4ff; }`,
        `.theme-light();`,
        `.common();`,
      ].join('\n'),
      'utf-8',
    )

    const result = await LessVariableChecker.check(root)

    expect(result.fixed).toBe(true)
    expect(result.missingVariables).toEqual(['c-test-bg', 'c-test-primary'])
    expect(result.uninferredVariables).toEqual([])  // 全部从 mixin 复制，无告警

    // 验证文件内容：@c-test-bg 和 @c-test-primary 已经从 .theme-light() 复制到 .common()
    const content = readFileSync(
      join(root, 'resources', 'styles', 'themes', 'theme-vars.less'),
      'utf-8',
    )
    expect(content).toContain('@c-test-bg: #edf4fb; // 自动添加（从 theme mixin 复制）')
    expect(content).toContain('@c-test-primary: #1990ff; // 自动添加（从 theme mixin 复制）')
    // 原有的 @c-test-text 保持不变
    expect(content).toContain('@c-test-text: #333;')
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
})
