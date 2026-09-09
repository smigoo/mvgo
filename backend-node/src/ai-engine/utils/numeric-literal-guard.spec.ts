import { assessNumericLiteralRewrite } from './numeric-literal-guard.js'

describe('N1 numeric literal rewrite confidence', () => {
  it('有 section/视觉证据时只诊断，不允许把真实数字改成 0', () => {
    const result = assessNumericLiteralRewrite({
      layoutStructure: { sections: [{ id: 'traffic' }] },
      visualElements: [{ type: 'TEXT', characters: '68109' }],
      charts: [{ type: 'line' }],
    })
    expect(result.rewrite).toBe(false)
    expect(result.reason).toContain('只记录诊断')
    expect(result.evidence).toEqual(expect.arrayContaining(['sections=1', 'visualElements']))
  })

  it('没有结构证据时才允许低置信数字占位改写', () => {
    const result = assessNumericLiteralRewrite({
      figmaNodeData: { document: { type: 'FRAME', children: [] } },
    })
    expect(result.rewrite).toBe(true)
    expect(result.reason).toContain('低置信')
  })

  it('有 elements 结构证据时也只诊断，不改写', () => {
    const result = assessNumericLiteralRewrite({
      elements: [{ type: 'TEXT', characters: '18270' }],
    })
    expect(result.rewrite).toBe(false)
    expect(result.evidence).toContain('elements')
  })
})
