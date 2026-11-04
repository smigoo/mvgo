/**
 * G6 script 区 CSS 声明行清除单测（2026-11-04 · bf0f0342 实锤）。
 * `display: flex;` 在 JS 里是合法标签语句（语法/语义门禁全放行），唯有写盘前逐行清除。
 */
import { healCssDeclarationsInScript } from './code-healer.js'

const SFC = (scriptBody: string) => `<template><div /></template>
<script setup>
${scriptBody}
</script>
<style lang="less" scoped>
.x { display: flex; }
</style>`

describe('healCssDeclarationsInScript', () => {
  test('bf0f0342 现场：if 块内的 display:flex 行被清除，其余逐字保留', () => {
    const body = [
      'const handleLegendToggle = (name) => {',
      '  if (Object.prototype.hasOwnProperty.call(legendState, name)) {',
      '  display: flex;',
      '    legendState[name] = !legendState[name]',
      '  }',
      '}',
    ].join('\n')
    const { source, changed, removed, samples } = healCssDeclarationsInScript(SFC(body))
    expect(changed).toBe(true)
    expect(removed).toBe(1)
    expect(samples).toEqual(['display: flex;'])
    // 仅 script 区段被清除；style 块内的合法 CSS 不受影响
    const scriptPart = source.match(/<script[\s\S]*?<\/script>/)?.[0] || ''
    expect(scriptPart).not.toContain('display: flex;')
    expect(source).toContain('legendState[name] = !legendState[name]')
    expect(source).toContain("if (Object.prototype.hasOwnProperty.call(legendState, name)) {")
    expect(source).toContain('.x { display: flex; }')
  })

  test('常见 CSS 属性行全部命中', () => {
    const body = [
      'const a = 1',
      '  margin-top: 305px;',
      '  flex-direction: column;',
      '  background-size: 100% 100%;',
      'const b = 2',
    ].join('\n')
    const { source, changed, removed } = healCssDeclarationsInScript(SFC(body))
    expect(removed).toBe(3)
    expect(source).toContain('const a = 1')
    expect(source).toContain('const b = 2')
  })

  test('合法 JS 不误伤：对象字面量（逗号/花括号收尾）、赋值、函数调用', () => {
    const body = [
      'const style = { display: flex, width: 100 }',
      '  const w = displayWidth;',
      '  position = absolute2(value)',
      '  arr.push({ top: 1, left: 2 })',
      '  return { height: computed }',
    ].join('\n')
    const { source, changed } = healCssDeclarationsInScript(SFC(body))
    expect(changed).toBe(false)
    expect(source).toBe(SFC(body))
  })

  test('无 script 区段 / 纯净 script ⇒ 零变化', () => {
    expect(healCssDeclarationsInScript('<template><div /></template>').changed).toBe(false)
    const clean = SFC('const a = 1\nexport default a')
    expect(healCssDeclarationsInScript(clean).changed).toBe(false)
    expect(healCssDeclarationsInScript(clean).source).toBe(clean)
  })

  test('多 script 块逐块处理', () => {
    const content = `<script>
  color: red;
</script>
<script setup>
  font-size: 12px;
</script>`
    const { removed } = healCssDeclarationsInScript(content)
    expect(removed).toBe(2)
  })
})
