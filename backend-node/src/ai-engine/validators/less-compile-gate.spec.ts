import { mkdtemp, mkdir, rm, writeFile, readFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

jest.mock('../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
}), { virtual: true })

import { LessCompileGate } from './less-compile-gate.js'

describe('LessCompileGate.validateDirectory', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mvgo-less-gate-'))
    await mkdir(join(root, 'package'), { recursive: true })
    await mkdir(join(root, 'resources', 'styles', 'themes'), { recursive: true })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('reads final disk files and blocks an undefined variable introduced after earlier checks', async () => {
    await writeFile(
      join(root, 'package', 'index.vue'),
      `<template><div class="root" /></template>\n<style lang="less" scoped>@import '../resources/styles/index.less';</style>`,
      'utf-8',
    )
    await writeFile(join(root, 'resources', 'styles', 'index.less'), `@import './themes/theme-vars.less';\n@import './themes/dark.less';\n`, 'utf-8')
    await writeFile(join(root, 'resources', 'styles', 'themes', 'theme-vars.less'), `.common() { @font-cn: Arial; }\n.theme-dark() { @text: #fff; }\n`, 'utf-8')
    await writeFile(join(root, 'resources', 'styles', 'themes', 'dark.less'), `&.dark { .theme-dark(); @import (multiple) '../common.less'; }\n`, 'utf-8')
    await writeFile(join(root, 'resources', 'styles', 'common.less'), `.root { color: @text; font-family: @font-cn; }\n`, 'utf-8')

    const result = await LessCompileGate.validateDirectory(root)

    expect(result.pass).toBe(false)
    expect(result.diagnostics.some(item => String(item.message).includes('@font-cn'))).toBe(true)
  })

  it('passes when common and theme mixins are applied before importing common.less', async () => {
    await writeFile(
      join(root, 'package', 'index.vue'),
      `<template><div class="root" /></template>\n<style lang="less" scoped>@import '../resources/styles/index.less';</style>`,
      'utf-8',
    )
    await writeFile(join(root, 'resources', 'styles', 'index.less'), `@import './themes/theme-vars.less';\n@import './themes/dark.less';\n`, 'utf-8')
    await writeFile(join(root, 'resources', 'styles', 'themes', 'theme-vars.less'), `.common() { @font-cn: Arial; }\n.theme-dark() { @text: #fff; }\n`, 'utf-8')
    await writeFile(join(root, 'resources', 'styles', 'themes', 'dark.less'), `&.dark { .common(); .theme-dark(); @import (multiple) '../common.less'; }\n`, 'utf-8')
    await writeFile(join(root, 'resources', 'styles', 'common.less'), `.root { color: @text; font-family: @font-cn; }\n`, 'utf-8')

    const result = await LessCompileGate.validateDirectory(root)

    expect(result.pass).toBe(true)
  })

  it('heals a missing trailing brace before a new top-level rule', async () => {
    await writeFile(
      join(root, 'package', 'index.vue'),
      `<template><div class="root" /></template>\n<style lang="less" scoped>@import '../resources/styles/index.less';</style>`,
      'utf-8',
    )
    await writeFile(join(root, 'resources', 'styles', 'index.less'), `@import './themes/theme-vars.less';\n@import './themes/dark.less';\n`, 'utf-8')
    await writeFile(join(root, 'resources', 'styles', 'themes', 'theme-vars.less'), `.common() { @font-cn: Arial; }\n.theme-dark() { @text: #fff; }\n`, 'utf-8')
    await writeFile(join(root, 'resources', 'styles', 'themes', 'dark.less'), `&.dark { .common(); .theme-dark(); @import (multiple) '../common.less'; }\n`, 'utf-8')
    await writeFile(join(root, 'resources', 'styles', 'common.less'), `.root {\n  color: @text;\n.child { color: red; }\n`, 'utf-8')

    const result = await LessCompileGate.validateDirectory(root)

    expect(result.pass).toBe(true)
    expect(result.diagnostics.some(item => item.id === 'LESS-AUTOHEAL-001')).toBe(true)
  })

  // 🛡️ 治本扩展（2026-09-29 · mc-max-1790696917698-bf3612dc 实锤）：
  //   未闭合块注释 heal 的两处缺口——①「横幅正文 + 空行 + 首个规则」形态
  //   单行前瞻恒不命中；② 多横幅形态第一处插入后其余全漏修（下标集合误标）。
  //   复刻 bf3612dc：common.less 两个分区横幅均未闭合 + .vue SFC 内嵌 style
  //   经 @import common.less 链路（连锁 BLOCK 的真凶是 common.less）。
  it('heals multiple unclosed banner comments in common.less (bf3612dc shape)', async () => {
    await writeFile(
      join(root, 'package', 'index.vue'),
      `<template><div class="root" /></template>\n<style lang="less" scoped>@import '../resources/styles/index.less';</style>`,
      'utf-8',
    )
    await writeFile(join(root, 'resources', 'styles', 'index.less'), `@import './themes/theme-vars.less';\n@import './themes/dark.less';\n`, 'utf-8')
    await writeFile(join(root, 'resources', 'styles', 'themes', 'theme-vars.less'), `.common() { @font-cn: Arial; }\n.theme-dark() { @text: #fff; }\n`, 'utf-8')
    await writeFile(join(root, 'resources', 'styles', 'themes', 'dark.less'), `&.dark { .common(); .theme-dark(); @import (multiple) '../common.less'; }\n`, 'utf-8')
    // 两个分区横幅注释都只开不闭：正文行 + 空行 + 首个规则（旧 heal 单行前瞻不命中的形态）
    await writeFile(
      join(root, 'resources', 'styles', 'common.less'),
      [
        '/* ============================================================',
        '   标题区',
        '',
        '.c-x-title {',
        '  width: 100%;',
        '}',
        '',
        '/* ============================================================',
        '   图表区',
        '',
        '.c-x-chart {',
        '  height: 100%;',
        '}',
        '',
      ].join('\n'),
      'utf-8',
    )

    const result = await LessCompileGate.validateDirectory(root)

    expect(result.pass).toBe(true)
    // 磁盘上两处横幅都被补了独立闭合行
    const healed = await readFile(join(root, 'resources', 'styles', 'common.less'), 'utf-8')
    expect(healed.split('\n').filter(l => l.trim() === '*/')).toHaveLength(2)
    // 正常多行块注释不受影响：补的闭合行不得吞掉合法内容（规则仍在）
    expect(healed).toContain('.c-x-title {')
    expect(healed).toContain('.c-x-chart {')
  })
})
