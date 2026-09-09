/**
 * json-parser 单元测试
 *
 * 覆盖 robustJSONParse 的截断修复能力（R2' 治理单元）：
 * - 括号配平（truncated JSON 补全闭合括号）
 * - 去尾逗号
 * - 截断补全（max_tokens 截断场景）
 *
 * 同时覆盖既有修复链的回归保护。
 */

import { robustJSONParse } from './json-parser.js'

// jest.mock 处理 import.meta 依赖
jest.mock('../../config/backend-root.js', () => ({ workspaceRoot: process.cwd(), logsDir: '/tmp/mvgo-test-logs' }), { virtual: true })

describe('robustJSONParse — 截断修复（R2\'）', () => {
  describe('括号配平：truncated JSON 补全闭合括号', () => {
    it('应修复截断在对象中部的 JSON（缺少 }）', () => {
      const truncated = '{"layout": {"sections": [{"id": "s1", "name": "header"}]'
      const result = robustJSONParse(truncated, { _context: 'test-truncation-obj' })
      expect(result).toBeDefined()
      expect(result.layout).toBeDefined()
      expect(result.layout.sections).toBeDefined()
      expect(Array.isArray(result.layout.sections)).toBe(true)
      expect(result.layout.sections[0].id).toBe('s1')
    })

    it('应修复截断在数组中部的 JSON（缺少 ] 和 }）', () => {
      const truncated = '{"items": [1, 2, 3'
      const result = robustJSONParse(truncated, { _context: 'test-truncation-arr' })
      expect(result).toBeDefined()
      expect(Array.isArray(result.items)).toBe(true)
      expect(result.items).toEqual([1, 2, 3])
    })

    it('应修复截断在嵌套结构中的 JSON（多层括号未闭合）', () => {
      const truncated = '{"a": {"b": {"c": [1, 2'
      const result = robustJSONParse(truncated, { _context: 'test-truncation-deep' })
      expect(result).toBeDefined()
      expect(result.a.b.c).toEqual([1, 2])
    })

    it('应修复截断 + 尾部逗号的组合情况', () => {
      const truncated = '{"sections": [{"id": "s1"}, {"id": "s2",'
      const result = robustJSONParse(truncated, { _context: 'test-truncation-comma' })
      expect(result).toBeDefined()
      expect(Array.isArray(result.sections)).toBe(true)
      // 尾部逗号应被清除
      expect(result.sections.length).toBeGreaterThanOrEqual(1)
    })

    it('应修复只有开括号没有闭括号的极端截断', () => {
      const truncated = '{"layout": {"type": "vertical"'
      const result = robustJSONParse(truncated, { _context: 'test-extreme-truncation' })
      expect(result).toBeDefined()
      expect(result.layout.type).toBe('vertical')
    })
  })

  describe('去尾逗号（既有能力回归保护）', () => {
    it('应去除对象末尾多余逗号', () => {
      const input = '{"a": 1, "b": 2,}'
      const result = robustJSONParse(input, { _context: 'test-trailing-comma-obj' })
      expect(result).toEqual({ a: 1, b: 2 })
    })

    it('应去除数组末尾多余逗号', () => {
      const input = '{"items": [1, 2, 3,]}'
      const result = robustJSONParse(input, { _context: 'test-trailing-comma-arr' })
      expect(result.items).toEqual([1, 2, 3])
    })
  })

  describe('完整 JSON 不应被修改', () => {
    it('完整的合法 JSON 应原样返回', () => {
      const input = '{"layout": {"sections": [{"id": "s1"}]}, "charts": []}'
      const result = robustJSONParse(input, { _context: 'test-valid-json' })
      expect(result.layout.sections[0].id).toBe('s1')
      expect(result.charts).toEqual([])
    })

    it('字符串内的括号不应被误判为需要配平', () => {
      const input = '{"msg": "hello } world", "count": 42}'
      const result = robustJSONParse(input, { _context: 'test-braces-in-string' })
      expect(result.msg).toBe('hello } world')
      expect(result.count).toBe(42)
    })
  })

  describe('Vision 截断场景模拟', () => {
    it('应修复典型的 vision JSON max_tokens 截断', () => {
      // 模拟 vision 输出在 sections 数组中间被截断
      const truncated = `{
        "layout": {
          "type": "vertical",
          "sections": [
            {"id": "header", "name": "标题区", "role": "常驻"},
            {"id": "chart-area", "name": "图表区", "role": "常驻",
              "body": {"layout": "single-chart", "children": [{"id": "c1", "role": "chart"`
      const result = robustJSONParse(truncated, { _context: 'test-vision-truncation' })
      expect(result).toBeDefined()
      expect(result.layout).toBeDefined()
      expect(result.layout.type).toBe('vertical')
      expect(Array.isArray(result.layout.sections)).toBe(true)
      expect(result.layout.sections.length).toBe(2)
      expect(result.layout.sections[0].id).toBe('header')
      expect(result.layout.sections[1].id).toBe('chart-area')
    })

    it('应修复带有 markdown 代码块包裹的截断 JSON', () => {
      const truncated = '```json\n{"sections": [{"id": "s1", "name": "test"}\n'
      const result = robustJSONParse(truncated, { _context: 'test-markdown-truncation' })
      expect(result).toBeDefined()
      expect(Array.isArray(result.sections)).toBe(true)
      expect(result.sections[0].id).toBe('s1')
    })
  })
})

describe('robustJSONParse — 既有修复链回归保护', () => {
  it('应修复字符串内未转义的双引号', () => {
    const input = '{"msg": "他说"你好"世界"}'
    const result = robustJSONParse(input, { _context: 'test-unescaped-quotes' })
    expect(result).toBeDefined()
    expect(result.msg).toContain('你好')
  })

  it('应修复 JS 风格注释', () => {
    const input = '{\n// this is a comment\n"a": 1\n}'
    const result = robustJSONParse(input, { _context: 'test-comments' })
    expect(result.a).toBe(1)
  })

  it('应修复非法转义序列', () => {
    const input = '{"path": "C:\\Users\\test"}'
    const result = robustJSONParse(input, { _context: 'test-escape' })
    expect(result).toBeDefined()
    expect(result.path).toContain('Users')
  })

  it('应从 markdown 代码块中提取 JSON', () => {
    const input = '这是分析结果：\n```json\n{"a": 1}\n```\n希望对你有帮助'
    const result = robustJSONParse(input, { _context: 'test-markdown' })
    expect(result.a).toBe(1)
  })
})
