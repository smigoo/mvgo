/**
 * Loop 2.1.D：重叠删 DOM（不只删合约）。
 * 同一 node 已在 content/子组件渲染时，主组件 template 中对应的插槽 DOM 整段移除，
 * 而不只是从 headerSlots 契约里剔除（契约删了 DOM 还在 → 仍双份渲染）。
 */
import { removeOverlappingSlotDom } from './slot-dom-deduper.js'

describe('Loop 2.1.D removeOverlappingSlotDom', () => {
  test('插槽内文本与子组件内容重叠 → 整段 <template #header-right> 移除', () => {
    const code = [
      '<template>',
      '  <base-panel>',
      '    <template #header-right><span>当日总流量 12345</span></template>',
      '    <div class="main">内容</div>',
      '  </base-panel>',
      '</template>',
    ].join('\n')
    const out = removeOverlappingSlotDom(code, {
      subcomponentTexts: new Set(['当日总流量']),
    })
    expect(out.code).not.toContain('#header-right')
    expect(out.removed).toBe(1)
  })

  test('插槽内文本无重叠 → 保留', () => {
    const code = [
      '<base-panel>',
      '  <template #title-right><span>专属标题</span></template>',
      '</base-panel>',
    ].join('\n')
    const out = removeOverlappingSlotDom(code, {
      subcomponentTexts: new Set(['别的文本']),
    })
    expect(out.code).toContain('#title-right')
    expect(out.removed).toBe(0)
  })

  test('空/仅注释插槽 → 保留（只清重叠内容）', () => {
    const code = '<base-panel>\n  <template #header-right>\n    <!-- TODO -->\n  </template>\n</base-panel>'
    const out = removeOverlappingSlotDom(code, {
      subcomponentTexts: new Set(['任意']),
    })
    expect(out.code).toContain('#header-right')
    expect(out.removed).toBe(0)
  })

  test('无 base-panel 宿主 → 原样返回', () => {
    const code = '<template>\n  <template #header-right>x</template>\n</template>'
    const out = removeOverlappingSlotDom(code, { subcomponentTexts: new Set(['x']) })
    expect(out.code).toBe(code)
    expect(out.removed).toBe(0)
  })
})
