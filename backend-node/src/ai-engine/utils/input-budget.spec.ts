import { estimateInputTokens, trimPromptToBudget, enforceInputBudget } from './input-budget.js'

describe('estimateInputTokens', () => {
  it('空与非字符串返回 0', () => {
    expect(estimateInputTokens('')).toBe(0)
    expect(estimateInputTokens(null)).toBe(0)
    expect(estimateInputTokens(undefined)).toBe(0)
  })

  it('纯英文按约 4 字符/token 估算', () => {
    const tokens = estimateInputTokens('a'.repeat(400))
    expect(tokens).toBe(100)
  })

  it('纯中文按约 1.5 字/token 估算', () => {
    const tokens = estimateInputTokens('中'.repeat(150))
    expect(tokens).toBe(100)
  })
})

describe('trimPromptToBudget', () => {
  const critical = '## 目标文件（必须输出）\npackage/index.vue\n⚠️ 关键约束'
  const filler = (n) => 'x'.repeat(n)

  it('未超预算时原样返回', () => {
    const p = '# 角色\n' + critical
    const out = trimPromptToBudget(p, 1000)
    expect(out.trimmed).toBe(false)
    expect(out.prompt).toBe(p)
  })

  it('超预算时裁剪冗余段，最终不超过预算', () => {
    const p = '# 角色定位\n' + critical + '\n## 冗余规范段\n' + filler(5000)
    const out = trimPromptToBudget(p, 200)
    expect(out.trimmed).toBe(true)
    expect(out.estTokens).toBeLessThanOrEqual(200)
    expect(out.droppedSections.length).toBeGreaterThan(0)
  })

  it('关键段（目标文件/关键约束）绝不被删除', () => {
    const p = '# 角色\n## 关键约束（不可违反）\n$mcComponentBuilder\n## 目标文件（必须输出）\npackage/index.vue\n## 冗余规范\n' + filler(8000)
    const out = trimPromptToBudget(p, 120)
    expect(out.prompt).toContain('目标文件')
    expect(out.prompt).toContain('$mcComponentBuilder')
    expect(out.prompt).toContain('package/index.vue')
  })

  it('裁剪幂等：连续两次结果一致', () => {
    const p = '# 角色\n## 目标文件（必须输出）\na.vue\n## 冗余A\n' + filler(3000) + '\n## 冗余B\n' + filler(3000)
    const a = trimPromptToBudget(p, 150)
    const b = trimPromptToBudget(a.prompt, 150)
    expect(b.trimmed).toBe(false)
    expect(b.prompt).toBe(a.prompt)
  })

  it('非字符串安全返回', () => {
    const out = trimPromptToBudget(null, 100)
    expect(out.prompt).toBeNull()
    expect(out.trimmed).toBe(false)
  })

  it('Infinity 预算不裁剪', () => {
    const p = '# 角色\n' + filler(5000)
    const out = trimPromptToBudget(p, Infinity)
    expect(out.trimmed).toBe(false)
  })
})

describe('enforceInputBudget', () => {
  it('返回 prompt 与结构化 report', () => {
    const { prompt, report } = enforceInputBudget('# 角色\n## 目标文件\nx', 10)
    expect(typeof prompt).toBe('string')
    expect(report).toHaveProperty('originalTokens')
    expect(report).toHaveProperty('finalTokens')
    expect(report).toHaveProperty('trimmed')
    expect(report).toHaveProperty('droppedSections')
  })
})
