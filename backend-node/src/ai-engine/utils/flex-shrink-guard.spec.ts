/**
 * WP4 收缩守卫（flex-shrink-guard）单测
 * fixture 原型：8db2b3b7 统计行 9px 塌缩（min-height:0 不算保护）与 feb1f87a header-right 8px。
 */
import { scanFlexShrinkRisk, summarizeFlexShrinkIssues } from './flex-shrink-guard.js'

const vue = (template: string, style = ''): Array<{ path: string; content: string }> => {
  const files: Array<{ path: string; content: string }> = [
    { path: 'package/components/Demo.vue', content: `<template>\n${template}\n</template>\n` },
  ]
  if (style) {
    files[0].content += `<style scoped>\n${style}\n</style>`
  }
  return files
}

describe('scanFlexShrinkRisk', () => {
  test('RC2 实锤形态：flex column 子项仅 min-height:0，孙层 height:100% → 命中', () => {
    const files = vue(
      `<div class="panel">
        <div class="row"><span class="lab">9px 行</span></div>
      </div>`,
      `.panel { display: flex; flex-direction: column; height: 100%; }
       .row { display: block; gap: 4px; min-height: 0; }
       .lab { height: 100%; }`,
    )
    const { issues } = scanFlexShrinkRisk(files)
    expect(issues.length).toBe(1)
    expect(issues[0].el).toBe('lab')
    expect(issues[0].axis).toBe('height')
    expect(issues[0].flexParent).toBe('panel')
    expect(issues[0].flexChild).toBe('row')
    expect(issues[0].reason).toBe('percent-size-on-unprotected-flex-child')
  })

  test('min-height:0 不是保护（判据核心）而 min-height:>0 是保护', () => {
    const base = (rowExtra: string) =>
      vue(
        `<div class="panel"><div class="row"><span class="lab">x</span></div></div>`,
        `.panel { display: flex; flex-direction: column; }
         .row { display: block; ${rowExtra} }
         .lab { height: 100%; }`,
      )
    // min-height: 0 → 仍命中
    expect(scanFlexShrinkRisk(base('min-height: 0;')).issues.length).toBe(1)
    // min-height: 8px → 保护，不命中
    expect(scanFlexShrinkRisk(base('min-height: 8px;')).issues.length).toBe(0)
    // flex-shrink: 0 → 不命中
    expect(scanFlexShrinkRisk(base('flex-shrink: 0;')).issues.length).toBe(0)
    // flex: 1 1 0（三值：grow=1 shrink=1 basis=0）→ shrink=1 仍命中
    expect(scanFlexShrinkRisk(base('flex: 1 1 0;')).issues.length).toBe(1)
    // flex: 0 0 auto（三值 shrink=0）→ 不命中
    expect(scanFlexShrinkRisk(base('flex: 0 0 auto;')).issues.length).toBe(0)
    // flex: 1 0（两值：grow=1 shrink=0）→ 不命中
    expect(scanFlexShrinkRisk(base('flex: 1 0;')).issues.length).toBe(0)
    // flex: none ≡ 0 0 auto → 不命中
    expect(scanFlexShrinkRisk(base('flex: none;')).issues.length).toBe(0)
    // overflow: hidden → 不命中
    expect(scanFlexShrinkRisk(base('overflow: hidden;')).issues.length).toBe(0)
    // 显式高度 → 不命中
    expect(scanFlexShrinkRisk(base('height: 40px;')).issues.length).toBe(0)
  })

  test('row 方向 axis=width：子项无保护且孙层 width:100% → 命中', () => {
    const files = vue(
      `<div class="bar"><div class="cell"><span class="fill">x</span></div></div>`,
      `.bar { display: flex; flex-direction: row; width: 100%; }
       .cell { display: block; }
       .fill { width: 100%; }`,
    )
    const { issues } = scanFlexShrinkRisk(files)
    expect(issues.length).toBe(1)
    expect(issues[0].axis).toBe('width')
    expect(issues[0].flexChild).toBe('cell')
  })

  test('内联 style 触发 + 内联 flex 容器：命中', () => {
    const files = vue(
      `<div style="display:flex;flex-direction:column;height:100%">
        <div><span style="height:100%">x</span></div>
      </div>`,
    )
    // 注意：flex 子项层是无 class 的 div（无法从 CSS 取 decls）→ 该形态首版不判（留待运行时探针）
    const { issues } = scanFlexShrinkRisk(files)
    expect(issues.length).toBe(0)
  })

  test('内联 style 触发且 flex 子项有 class：命中', () => {
    const files = vue(
      `<div style="display:flex;flex-direction:column;height:100%">
        <div class="row"><span style="height:100%">x</span></div>
      </div>`,
      `.row { gap: 4px; }`,
    )
    const { issues } = scanFlexShrinkRisk(files)
    expect(issues.length).toBe(1)
    expect(issues[0].flexChild).toBe('row')
  })

  test('无 flex 祖先的百分比尺寸 → 不命中', () => {
    const files = vue(
      `<div class="wrap"><span class="lab" style="height:100%">x</span></div>`,
      `.wrap { display: block; }`,
    )
    expect(scanFlexShrinkRisk(files).issues.length).toBe(0)
  })

  test('@media 外壳内规则照常收编；后代选择器 .a .b 只给最右段 b', () => {
    const files = vue(
      `<div class="outer"><div class="inner"><div class="mid"><span class="lab" style="height:100%">x</span></div></div></div>`,
      `@media (max-width: 900px) {
         .outer .inner { display: flex; flex-direction: column; }
       }`,
    )
    const { issues } = scanFlexShrinkRisk(files)
    expect(issues.length).toBe(1)
    // 若 .outer 被错误收编 display:flex，flexParent 会变成 outer（更远层）而非 inner
    expect(issues[0].flexParent).toBe('inner')
    expect(issues[0].flexChild).toBe('mid')
  })

  test('独立 css 文件 + 多文件合并；空输入安全', () => {
    const files = vue(
      `<div class="panel"><div class="row"><span class="lab">x</span></div></div>`,
    )
    files.push({
      path: 'resources/styles/common.css',
      content: `.panel{display:flex;flex-direction:column}.lab{height:100%}`,
    })
    const { issues } = scanFlexShrinkRisk(files)
    expect(issues.length).toBe(1)

    expect(scanFlexShrinkRisk([]).issues.length).toBe(0)
    expect(scanFlexShrinkRisk(null as any).issues.length).toBe(0)
    // 无模板的 .vue
    expect(scanFlexShrinkRisk([{ path: 'a.vue', content: '<style>.a{color:red}</style>' }]).issues.length).toBe(0)
  })

  test('flex-basis 百分比与 flex 简写第三值 % 均触发', () => {
    const mk = (decl: string) =>
      vue(
        `<div class="panel"><div class="row"><span class="lab">x</span></div></div>`,
        `.panel { display: flex; flex-direction: column; }
         .lab { ${decl} }`,
      )
    expect(scanFlexShrinkRisk(mk('flex-basis: 30%;')).issues.length).toBe(1)
    expect(scanFlexShrinkRisk(mk('flex: 0 0 30%;')).issues.length).toBe(1)
  })

  test('判据 B（8db2b3b7 stat-row 9px 实锤形态）：column+space-between 子项 min-height:0 → 命中', () => {
    const files = vue(
      `<div class="stats">
        <div class="stat-row">行一</div>
        <div class="stat-row">行二</div>
        <div class="stat-row">行三</div>
      </div>`,
      `.stats {
         display: flex; flex-direction: column; justify-content: space-between;
         height: 100%; flex: 1 1 0; min-height: 0; overflow: hidden;
       }
       .stat-row { min-height: 0; display: flex; align-items: center; }`,
    )
    const { issues } = scanFlexShrinkRisk(files)
    expect(issues.length).toBe(3)
    expect(issues[0].reason).toBe('space-between-child-floor-released')
    expect(issues[0].el).toBe('stat-row')
    expect(issues[0].flexParent).toBe('stats')
    expect(issues[0].axis).toBe('height')
  })

  test('判据 B 降误报：未解除 floor / 有硬保护 / row 方向 / 唯一子项 / 容器显式高度 → 不命中', () => {
    const mk = (containerExtra: string, rowExtra: string, rows = 3) =>
      vue(
        `<div class="stats">${Array.from({ length: rows }, (_, i) => `<div class="stat-row">行${i}</div>`).join('')}</div>`,
        `.stats { display: flex; flex-direction: column; justify-content: space-between; ${containerExtra} }
         .stat-row { ${rowExtra} }`,
      )
    // 未解除 floor（无 min-height:0/overflow）→ 有 min-content 兜底，不命中
    expect(scanFlexShrinkRisk(mk('height: 100%; flex: 1 1 0;', 'display: flex;')).issues.length).toBe(0)
    // 硬保护 flex-shrink:0 → 不命中
    expect(scanFlexShrinkRisk(mk('height: 100%;', 'min-height: 0; flex-shrink: 0;')).issues.length).toBe(0)
    // 容器显式高度（不依赖外部）→ 不命中
    expect(scanFlexShrinkRisk(mk('height: 240px;', 'min-height: 0;')).issues.length).toBe(0)
    // row 方向 space-between → 不命中（仅 column 判）
    const rowFiles = vue(
      `<div class="bar"><div class="cell">a</div><div class="cell">b</div></div>`,
      `.bar { display: flex; flex-direction: row; justify-content: space-between; height: 100%; }
       .cell { min-height: 0; }`,
    )
    // row 的 axis 是 width，floor 解除判定按 height → min-height:0 不解除 width floor → 不命中
    expect(scanFlexShrinkRisk(rowFiles).issues.length).toBe(0)
    // 唯一子项 → 不命中
    expect(scanFlexShrinkRisk(mk('height: 100%;', 'min-height: 0;', 1)).issues.length).toBe(0)
  })

  test('summarizeFlexShrinkIssues 输出人类可读摘要', () => {
    const files = vue(
      `<div class="panel"><div class="row"><span class="lab">x</span></div></div>`,
      `.panel { display: flex; flex-direction: column; }
       .lab { height: 100%; }`,
    )
    const { issues } = scanFlexShrinkRisk(files)
    const lines = summarizeFlexShrinkIssues(issues)
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain('.lab')
    expect(lines[0]).toContain('.row')
  })
})
