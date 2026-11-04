/**
 * G11a 下载失败 bg 的 CSS fallback 注入单测（2026-11-04 · a41a470f/a87c2ba5 实锤）。
 * mapping missing + fillsSummary 真值 → section 容器背景注入；success/css 态与已有背景不动。
 */
import { injectMissingBgFallback } from './code-healer.js'

const GRAD = 'linear-gradient(180deg, #d4e3ffe5 0%, #c1d6ffe5 100%)'
const MAPPING = [
  {
    figmaNodeId: '38:3135',
    downloadStatus: 'missing',
    targetDomSelector: '[data-section-id="38:3134"]',
    visualMeta: { fillsSummary: GRAD },
  },
  {
    figmaNodeId: '36:1156',
    downloadStatus: 'missing',
    targetDomSelector: '[data-section-id="36:1155"]',
    visualMeta: { fillsSummary: '#123259f2' },
  },
  {
    figmaNodeId: '48:5797',
    downloadStatus: 'success',
    resourceFile: '../resources/images/bg.png',
    targetDomSelector: '[data-section-id="48:5796"]',
    visualMeta: { fillsSummary: '#ff0000' },
  },
]

describe('injectMissingBgFallback', () => {
  test('a41a470f 现场：missing+渐变真值注入到 data-section-id 容器 style 头部', () => {
    const vue = `<template>
  <div data-section-id="38:3134" class="x" style="display:flex;flex-direction:column;">
    <span>hi</span>
  </div>
</template>`
    const r = injectMissingBgFallback(vue, MAPPING)
    expect(r.changed).toBe(true)
    expect(r.injected).toBe(1)
    expect(r.content).toContain(`style="background:${GRAD};display:flex;flex-direction:column;"`)
  })

  test('无 style 属性的容器：新增 style 属性', () => {
    const vue = `<template><div data-section-id="36:1155"><p>y</p></div></template>`
    const r = injectMissingBgFallback(vue, MAPPING)
    expect(r.injected).toBe(1)
    expect(r.content).toContain('style="background:#123259f2;">')
  })

  test('success 态不注入（图必须用图）；容器已有 background 声明不覆盖', () => {
    const vue = `<template>
  <div data-section-id="48:5796" style="background:#123259f2;"></div>
</template>`
    const r = injectMissingBgFallback(vue, MAPPING)
    expect(r.changed).toBe(false)
    expect(r.injected).toBe(0)
  })

  test('class 选择器（虚构挂载点）跳过；无 fillsSummary 跳过', () => {
    const vue = `<template><div class="x" style="color:red;"></div></template>`
    const bad = [
      { downloadStatus: 'missing', targetDomSelector: '.-container', visualMeta: { fillsSummary: '#fff' } },
      { downloadStatus: 'missing', targetDomSelector: '[data-section-id="1:2"]', visualMeta: {} },
    ]
    const r = injectMissingBgFallback(vue, bad)
    expect(r.changed).toBe(false)
    expect(r.skipped).toBe(2)
  })

  test('非 vue 字符串/非数组 mapping：原样返回', () => {
    expect(injectMissingBgFallback(null, MAPPING).changed).toBe(false)
    expect(injectMissingBgFallback('<div/>', null).changed).toBe(false)
  })
})
