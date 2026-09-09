import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
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
})
