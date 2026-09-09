import { buildRetryPrompt } from '../utils/retry-prompt.js'

describe('buildRetryPrompt (P0-C)', () => {
  const baseChunk = {
    files: ['package/index.vue'],
    contextFiles: [
      { path: 'package/index.vue', content: '<template><div>demo</div></template>' },
    ],
  }

  it('在重试 Prompt 中携带目标文件清单', () => {
    const p = buildRetryPrompt({ files: ['declare.json', 'resources/styles/a.less'] }, 'truncation', 'x')
    expect(p).toContain('declare.json')
    expect(p).toContain('resources/styles/a.less')
  })

  it('max_tokens 错误给出精简输出提示', () => {
    const p = buildRetryPrompt(baseChunk, 'max_tokens', 'stop_reason=max_tokens')
    expect(p).toContain('max_tokens')
    expect(p).toContain('精简输出')
  })

  it('semantics 错误给出 script 修复提示', () => {
    const p = buildRetryPrompt(baseChunk, 'semantics', '重复 import')
    expect(p).toContain('语义不完整')
    expect(p).toContain('<script setup>')
  })

  it('parse_failure 错误给出重新输出合规 JSON（含 files 字段）提示', () => {
    const p = buildRetryPrompt(baseChunk, 'parse_failure', 'LLM 返回的 JSON 缺少 files 字段')
    expect(p).toContain('files')
    expect(p).toContain('JSON')
    expect(p).toContain('重新输出')
  })

  it('其它截断错误提示涉及文件', () => {
    const p = buildRetryPrompt(baseChunk, 'truncation', '未闭合')
    expect(p).toContain('截断或不完整')
    expect(p).toContain('package/index.vue')
  })

  it('保留微码关键约束，避免质量崩塌', () => {
    const p = buildRetryPrompt(baseChunk, 'truncation', 'x')
    expect(p).toContain('$mcComponentBuilder')
    expect(p).toContain('onload')
    expect(p).toContain('// === path ===')
  })

  it('上下文契约每个文件最多 4000 字', () => {
    const huge = 'x'.repeat(10000)
    const p = buildRetryPrompt(
      { files: ['package/index.vue'], contextFiles: [{ path: 'package/index.vue', content: huge }] },
      'truncation',
      'x',
    )
    const marker = p.indexOf('// @file package/index.vue')
    const afterMarker = p.slice(marker)
    const xRun = afterMarker.match(/^\/\/ @file package\/index\.vue\n(x*)/)
    // 输入 10000 字，契约应被裁剪到最多 4000 字
    expect(xRun).not.toBeNull()
    expect(xRun[1].length).toBeLessThanOrEqual(4000)
    expect(xRun[1].length).toBe(4000)
  })

  it('无 contextFiles 时不报错', () => {
    const p = buildRetryPrompt({ files: ['package/index.vue'] }, 'truncation', 'x')
    expect(typeof p).toBe('string')
    expect(p.length).toBeGreaterThan(0)
  })
})
