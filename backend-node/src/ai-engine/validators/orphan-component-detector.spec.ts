import { mkdtemp, mkdir, rm, writeFile, access } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

// validator → logger/index → logger/logger → backend-root（用了 import.meta，jest 无法直接加载）
jest.mock(
  '../../config/backend-root.js',
  () => ({
    workspaceRoot: process.cwd(),
    logsDir: process.cwd() + '/logs',
  }),
  { virtual: true },
)

import { OrphanComponentDetector } from './orphan-component-detector.js'

/**
 * 回归背景：
 * 真实子组件写在 package/components/** 下，而旧实现只 readdirSync(package/) 顶层，
 * 导致 childComponents 恒为空 → orphansFound 恒为 0（检测器静默失效，
 * 生成产物里的死代码子组件（如 ContentCons.vue）不被清理）。
 * 同时引用判定只看 index.vue，会把「被兄弟子组件引用」的文件误删。
 */
describe('OrphanComponentDetector.detect', () => {
  let root: string

  const exists = async (p: string) => {
    try {
      await access(p)
      return true
    } catch {
      return false
    }
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mvgo-orphan-'))
    await mkdir(join(root, 'package', 'components'), { recursive: true })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('检测并删除 package/components 下无人引用的子组件', async () => {
    await writeFile(
      join(root, 'package', 'index.vue'),
      `<template><div class="root" /></template>\n`,
      'utf-8',
    )
    const orphan = join(root, 'package', 'components', 'ContentCons.vue')
    await writeFile(orphan, `<template><div class="cons" /></template>\n`, 'utf-8')

    const result = await OrphanComponentDetector.detect(root)

    expect(result.orphans).toContain(orphan)
    expect(result.deleted).toContain(orphan)
    expect(await exists(orphan)).toBe(false)
  })

  it('保留被 index.vue 以 ./components 路径 import 的子组件', async () => {
    await writeFile(
      join(root, 'package', 'index.vue'),
      `<template><ContentActive /></template>\n<script setup>\nimport ContentActive from './components/ContentActive.vue'\n</script>\n`,
      'utf-8',
    )
    const child = join(root, 'package', 'components', 'ContentActive.vue')
    await writeFile(child, `<template><div class="a" /></template>\n`, 'utf-8')

    const result = await OrphanComponentDetector.detect(root)

    expect(result.kept).toContain(child)
    expect(result.deleted).toHaveLength(0)
    expect(await exists(child)).toBe(true)
  })

  it('保留仅被兄弟子组件引用（index.vue 未直接引用）的子组件', async () => {
    await writeFile(
      join(root, 'package', 'index.vue'),
      `<template><Wrapper /></template>\n<script setup>\nimport Wrapper from './components/Wrapper.vue'\n</script>\n`,
      'utf-8',
    )
    const wrapper = join(root, 'package', 'components', 'Wrapper.vue')
    await writeFile(
      wrapper,
      `<template><Inner /></template>\n<script setup>\nimport Inner from './Inner.vue'\n</script>\n`,
      'utf-8',
    )
    const inner = join(root, 'package', 'components', 'Inner.vue')
    await writeFile(inner, `<template><div class="i" /></template>\n`, 'utf-8')

    const result = await OrphanComponentDetector.detect(root)

    expect(result.kept).toContain(inner)
    expect(result.deleted).toHaveLength(0)
    expect(await exists(inner)).toBe(true)
  })

  it('无 package/index.vue 时安全返回，不误删任何文件', async () => {
    const stray = join(root, 'package', 'components', 'Stray.vue')
    await writeFile(stray, `<template><div class="s" /></template>\n`, 'utf-8')

    const result = await OrphanComponentDetector.detect(root)

    expect(result.deleted).toHaveLength(0)
    expect(await exists(stray)).toBe(true)
  })
})
