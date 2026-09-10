import { findTdzReferences, autoFixTdzReferences } from '../sfc-tdz.js'

/**
 * 引用型 TDZ 治本单测（2026-09-10）
 * 根因：env 样本 mc-max-1789019718053-fb0a0de7 的 index.vue 把 `watch(activeTab)`
 * 写在 `const activeTab = ref(...)` 之前 → 运行时 "Cannot access 'activeTab' before initialization"。
 * scriptSplit 三段合并只做 import/Builder/lifecycle 去重，缺声明顺序校验 → 漏网写盘。
 */
describe('findTdzReferences — 引用型 TDZ 检测', () => {
  it('detects watch(x) before const x declaration (env 样本原病)', () => {
    const body = [
      "import { ref, watch } from 'vue'",
      "watch(activeTab, () => {})",
      "const activeTab = ref('co')",
    ].join('\n')
    const hits = findTdzReferences(body)
    expect(hits.map((h) => h.name)).toContain('activeTab')
    expect(hits[0].refIndex).toBeLessThan(hits[0].declIndex)
  })

  it('does not flag reference AFTER declaration (legal)', () => {
    const body = [
      "import { ref, watch } from 'vue'",
      "const activeTab = ref('co')",
      'watch(activeTab, () => {})',
    ].join('\n')
    expect(findTdzReferences(body)).toEqual([])
  })

  it('does not flag function declarations (hoisted, no TDZ)', () => {
    const body = ['foo()', 'function foo() {}'].join('\n')
    expect(findTdzReferences(body)).toEqual([])
  })

  it('does not flag import bindings (hoisted)', () => {
    const body = ["import { ref } from 'vue'", 'const x = ref(1)'].join('\n')
    expect(findTdzReferences(body)).toEqual([])
  })

  it('does not flag references inside a function body (evaluated at call time)', () => {
    const body = [
      'function useIt() { return later }',
      'const later = 1',
    ].join('\n')
    // later 的引用发生在函数体内，且函数调用不早于声明 → 不应命中
    expect(findTdzReferences(body)).toEqual([])
  })
})

describe('autoFixTdzReferences — 引用型 TDZ 自动修复', () => {
  it('moves the const declaration above its first reference', () => {
    const body = [
      "import { ref, watch } from 'vue'",
      "watch(activeTab, () => {})",
      "const handleTabChange = () => activeTab.value",
      "const activeTab = ref('co')",
    ].join('\n')
    const { content, fixed } = autoFixTdzReferences(body)
    expect(fixed.length).toBeGreaterThan(0)
    expect(findTdzReferences(content)).toEqual([])
    // activeTab 的声明现在必须出现在 watch 之前
    expect(content.indexOf('const activeTab')).toBeLessThan(content.indexOf('watch(activeTab'))
  })

  it('returns unchanged content when there is no TDZ', () => {
    const body = ['const a = 1', 'const b = a + 1'].join('\n')
    const { content, fixed } = autoFixTdzReferences(body)
    expect(fixed).toEqual([])
    expect(content).toBe(body)
  })
})

describe('分段合并后 TDZ 自检（mergeScriptParts 等价流程）', () => {
  it('合并 state(声明在段尾) + lifecycle(watch 在段首) → 自动修复后无 TDZ', () => {
    // 模拟 scriptSplit 两段合并（env 真值）：lifecycle 段把 `watch(activeTab)` 写在段首，
    // state 段的 `const activeTab` 在段尾 → 合并后 watch 排在 const 之前 → 引用型 TDZ。
    const lifecyclePart = ["import { watch } from 'vue'", 'watch(activeTab, () => {})', 'onMounted(() => {})'].join('\n')
    const statePart = ["import { ref } from 'vue'", "const handleTabChange = () => activeTab.value", "const activeTab = ref('co')"].join('\n')
    const merged = `${lifecyclePart}\n\n${statePart}`

    // 合并后自检：应发现引用型 TDZ
    expect(findTdzReferences(merged).map((h) => h.name)).toContain('activeTab')
    // 自动修复
    const { content, fixed } = autoFixTdzReferences(merged)
    expect(fixed.length).toBeGreaterThan(0)
    expect(findTdzReferences(content)).toEqual([])
    expect(content.indexOf('const activeTab')).toBeLessThan(content.indexOf('watch(activeTab'))
  })
})
