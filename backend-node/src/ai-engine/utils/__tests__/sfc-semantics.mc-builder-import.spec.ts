/**
 * 微码宿主 $mcComponentBuilder 裸 import 归一（abed6b93 真机 404）。
 * 只允许具名 import → 标准全局 builder 解构；其它模块/导入形态绝不接管。
 */
jest.mock('../acorn-optional-loader.js', () => ({ acornParser: null, acornWalker: null }))

import {
  normalizeMcComponentBuilderImports,
  dedupeMcComponentBuilder,
} from '../sfc-semantics.js'

describe('微码 builder 裸 import 归一', () => {
  test('真实事故形态：具名 import 转为标准全局解构并计数', () => {
    const source = `import { onMounted } from 'vue'
import { componentProps, businessProps, runtimeBuilder, componentApi} from '$mcComponentBuilder'
onMounted(() => runtimeBuilder.publishEvent('x-onload', {}))`
    const out = normalizeMcComponentBuilderImports(source)
    expect(out.healed).toBe(1)
    expect(out.content).not.toContain("from '$mcComponentBuilder'")
    expect(out.content).toContain(
      'const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()',
    )
    expect(out.content).toContain("import { onMounted } from 'vue'")
    expect(out.content).toContain('$mcComponentBuilder()\nonMounted')
  })

  test('别名保留本地绑定；重复 builder 仍由既有去重收口', () => {
    const source = `import { runtimeBuilder as rb, componentApi } from "$mcComponentBuilder";
const { businessProps, runtimeBuilder } = $mcComponentBuilder()`
    const normalized = normalizeMcComponentBuilderImports(source)
    expect(normalized.content).toContain('runtimeBuilder: rb')
    const stats: { mcBuilderModuleImport?: number } = {}
    const out = dedupeMcComponentBuilder(normalized.content, {
      normalizeModuleImports: true,
      stats,
    })
    expect(out.match(/\$mcComponentBuilder\s*\(\s*\)/g)).toHaveLength(1)
    expect(out).toContain('runtimeBuilder: rb')
    expect(out).toContain('businessProps')
    expect(out).toContain('componentApi')
    expect(stats.mcBuilderModuleImport).toBe(0)
  })

  test('装配 opt-in 直接消费裸 import 时统计 healed=1', () => {
    const stats: { mcBuilderModuleImport?: number } = {}
    const out = dedupeMcComponentBuilder(
      "import { runtimeBuilder } from '$mcComponentBuilder'",
      { normalizeModuleImports: true, stats },
    )
    expect(out).toBe('const { runtimeBuilder } = $mcComponentBuilder()')
    expect(stats.mcBuilderModuleImport).toBe(1)
  })

  test.each([
    "import builder from '$mcComponentBuilder'",
    "import * as builder from '$mcComponentBuilder'",
    "import '$mcComponentBuilder'",
    "import { runtimeBuilder as } from '$mcComponentBuilder'",
    "import { runtimeBuilder } from '$otherHost'",
    "const { runtimeBuilder } = $mcComponentBuilder()",
  ])('非简单具名 import 或非目标模块不接管：%s', (source) => {
    const out = normalizeMcComponentBuilderImports(source)
    expect(out.healed).toBe(0)
    expect(out.content).toBe(source)
  })
})
