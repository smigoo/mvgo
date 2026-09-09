/**
 * 产物集合级完整性硬门禁测试（R5，2026-08-30）
 *
 * 覆盖死链的兜底点：组件二/三跑到最后一步才因缺 package/index.vue 回滚，
 * 中间所有后处理白跑。本模块在 complete 收口最前端拦截。
 */
import { describe, it, expect } from '@jest/globals'
import {
  getRequiredArtifacts,
  normalizeRelPath,
  normalizeEntries,
  planArtifactIntegrity,
  buildArtifactIntegrityError,
} from '../artifact-integrity.js'

describe('getRequiredArtifacts', () => {
  it('microcode 含三件套', () => {
    expect(getRequiredArtifacts('microcode')).toEqual([
      'package/index.vue',
      'declare.json',
      'resources/styles/common.less',
    ])
  })

  it('vue3 / lite / 未知类型回落默认（仅主入口）', () => {
    expect(getRequiredArtifacts('vue3')).toEqual(['package/index.vue'])
    expect(getRequiredArtifacts('lite')).toEqual(['package/index.vue'])
    expect(getRequiredArtifacts('foobar')).toEqual(['package/index.vue'])
    expect(getRequiredArtifacts('')).toEqual(['package/index.vue'])
  })
})

describe('normalizeRelPath / normalizeEntries', () => {
  it('归一化反斜杠与 ./ 前缀', () => {
    expect(normalizeRelPath('package\\index.vue')).toBe('package/index.vue')
    expect(normalizeRelPath('./package/index.vue')).toBe('package/index.vue')
  })

  it('对象 map / 数组 / 路径数组三种形态', () => {
    expect(normalizeEntries({ 'package/index.vue': 'x' })).toEqual([
      { path: 'package/index.vue', content: 'x' },
    ])
    expect(normalizeEntries([{ path: 'a.vue', content: 'y' }])).toEqual([
      { path: 'a.vue', content: 'y' },
    ])
    expect(normalizeEntries(['package/index.vue'])).toEqual([
      { path: 'package/index.vue', content: null },
    ])
  })
})

describe('planArtifactIntegrity', () => {
  const full = {
    'package/index.vue': '<template><div/></template><script>export default {}</script>',
    'declare.json': '{}',
    'resources/styles/common.less': '.a{color:red}',
  }

  it('齐全 → ok=true', () => {
    const r = planArtifactIntegrity(full, { componentType: 'microcode' })
    expect(r.ok).toBe(true)
    expect(r.missing).toHaveLength(0)
  })

  it('缺主入口 → MISSING', () => {
    const r = planArtifactIntegrity({ 'declare.json': '{}' }, { componentType: 'microcode' })
    expect(r.ok).toBe(false)
    const idx = r.missing.find((m) => m.path === 'package/index.vue')
    expect(idx?.code).toBe('MISSING')
  })

  it('主入口为空（仅空白）→ EMPTY', () => {
    const r = planArtifactIntegrity({ 'package/index.vue': '   \n ' }, { componentType: 'microcode' })
    expect(r.ok).toBe(false)
    expect(r.missing[0]?.code).toBe('EMPTY')
  })

  it('主入口只有 script 没有 template（P1-5 残片）→ NO_TEMPLATE', () => {
    const r = planArtifactIntegrity(
      { 'package/index.vue': '<script>export default {}</script>' },
      { componentType: 'microcode' },
    )
    expect(r.ok).toBe(false)
    expect(r.missing[0]?.code).toBe('NO_TEMPLATE')
  })

  it('微码缺 declare.json / common.less 也计入缺失', () => {
    const r = planArtifactIntegrity(
      { 'package/index.vue': '<template><div/></template>' },
      { componentType: 'microcode' },
    )
    expect(r.ok).toBe(false)
    const paths = r.missing.map((m) => m.path)
    expect(paths).toContain('declare.json')
    expect(paths).toContain('resources/styles/common.less')
  })

  it('vue3 不要求 declare.json / common.less', () => {
    const r = planArtifactIntegrity(
      { 'package/index.vue': '<template><div/></template>' },
      { componentType: 'vue3' },
    )
    expect(r.ok).toBe(true)
  })

  it('requireTemplate=false 时不查 template', () => {
    const r = planArtifactIntegrity(
      { 'package/index.vue': 'only-script' },
      { componentType: 'vue3', requireTemplate: false },
    )
    expect(r.ok).toBe(true)
  })

  it('同路径多段出现时取内容最长的一份，不被空段覆盖', () => {
    const r = planArtifactIntegrity(
      [
        { path: 'package/index.vue', content: '' },
        { path: 'package/index.vue', content: '<template><div/></template>' },
      ],
      { componentType: 'vue3' },
    )
    expect(r.ok).toBe(true)
  })
})

describe('buildArtifactIntegrityError', () => {
  it('error.code = ARTIFACT_INCOMPLETE，message 含缺失清单与上游原因', () => {
    const result = planArtifactIntegrity({}, { componentType: 'microcode' })
    const err = buildArtifactIntegrityError(result, {
      outputPath: '/tmp/x',
      upstreamError: '视觉分析降级',
      degradedFiles: ['package/components/A.vue'],
    })
    expect(err.code).toBe('ARTIFACT_INCOMPLETE')
    expect(err.message).toContain('package/index.vue')
    expect(err.message).toContain('视觉分析降级')
    expect(err.message).toContain('package/components/A.vue')
  })
})
