import {
  MANIFEST_TARGETS,
  CONTEXT_KEYS,
  parseManifest,
  defaultManifestFor,
  selectContext,
} from './context-manifest.js'

describe('parseManifest', () => {
  it('非法 target 报错', () => {
    const r = parseManifest({ target: 'unknown', required: [] })
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('未知分块类型'))).toBe(true)
  })

  it('未知上下文 key 记 warning 而非 error', () => {
    const r = parseManifest({ target: 'script', required: ['no-such-key'] })
    expect(r.valid).toBe(true)
    expect(r.warnings.some((w) => w.includes('no-such-key'))).toBe(true)
  })

  it('required 与 excluded 冲突时 required 优先', () => {
    const r = parseManifest({ target: 'script', required: ['charts'], excluded: ['charts'] })
    expect(r.excluded).not.toContain('charts')
    expect(r.required).toContain('charts')
  })

  it('非数组字段被归一化为数组', () => {
    const r = parseManifest({ target: 'script', required: 'charts', optional: 'requirement-business' })
    expect(r.required).toEqual(['charts'])
    expect(r.optional).toEqual(['requirement-business'])
  })

  it('非对象返回 invalid', () => {
    const r = parseManifest(null)
    expect(r.valid).toBe(false)
  })
})

describe('defaultManifestFor', () => {
  it('每个 target 都有合法默认 manifest', () => {
    for (const t of MANIFEST_TARGETS) {
      const r = defaultManifestFor(t)
      expect(r.valid).toBe(true)
      expect(r.target).toBe(t)
      expect(r.required.length).toBeGreaterThan(0)
    }
  })
})

describe('selectContext', () => {
  const registry = {
    'runtime-contract': 'RUNTIME_CONTRACT',
    'template-contract': () => 'TEMPLATE_CONTRACT',
    events: 'EVENTS',
    models: 'MODELS',
    'style-guide': 'STYLE_GUIDE',
    charts: 'CHARTS',
  }

  it('只取 required + optional，剔除 excluded', () => {
    const r = selectContext(
      parseManifest({ target: 'script', required: ['runtime-contract', 'events'], optional: ['charts'], excluded: ['style-guide'] }),
      registry,
    )
    expect(r.includedKeys).toEqual(['runtime-contract', 'events', 'charts'])
    expect(r.sections.map((s) => s.key)).toEqual(['runtime-contract', 'events', 'charts'])
  })

  it('惰性函数求值', () => {
    const r = selectContext(
      parseManifest({ target: 'script', required: ['template-contract'] }),
      registry,
    )
    expect(r.sections[0].content).toBe('TEMPLATE_CONTRACT')
  })

  it('缺失 key 记入 missingKeys 且不产出 section', () => {
    const r = selectContext(
      parseManifest({ target: 'script', required: ['bindings'] }),
      registry,
    )
    expect(r.missingKeys).toContain('bindings')
    expect(r.sections.length).toBe(0)
  })

  it('统计 sections 总字符数', () => {
    const r = selectContext(
      parseManifest({ target: 'script', required: ['runtime-contract', 'events'] }),
      registry,
    )
    expect(r.chars).toBe('RUNTIME_CONTRACT'.length + 'EVENTS'.length)
  })

  it('去重：required 与 optional 重复只取一次', () => {
    const r = selectContext(
      parseManifest({ target: 'script', required: ['charts'], optional: ['charts'] }),
      registry,
    )
    expect(r.includedKeys).toEqual(['charts'])
  })
})

describe('CONTEXT_KEYS 白名单', () => {
  it('包含 style-guide / less-naming / declare-schema / figma-raw-tree', () => {
    for (const k of ['style-guide', 'less-naming', 'declare-schema', 'figma-raw-tree']) {
      expect(CONTEXT_KEYS).toContain(k)
    }
  })
})
