/**
 * 🛡️ R10（2026-11-09 · loop-verify R10 轮）：template 根游离元素归位 heal。
 *
 * 病灶（重点车辆监测 11bd56c1 真机实锤）：index.vue `<template>` 根下 tabs 块
 * 写在 `<base-panel>` 开标签之前（LLM 本体，引用 index 自身 ref）⇒ 游离于宿主外、
 * 浏览器容错后悬空渲染 + ListSection margin-top 硬补高度。
 * 治本：游离顶层元素移入 base-panel 默认插槽首部（语义等价归位，非判死）。
 */
import { relocateStrayTemplateRoots } from './stray-template-root-relocator.js'

/** 11bd56c1 形态逐字复刻（简化保留骨架） */
const STRAY = `<template>      <div class="c-x-tabs" style="display:flex">
        <div
          v-for="tab in tabs"
          :key="tab.value"
          @click="handleTabChange(tab.value)"
        >{{ tab.label }}</div>
      </div>

  <base-panel panelKey="default-panel">
    <div class="c-x-slot-con" style="display:flex;flex-direction:column;height:100%">
      <TabsSection style="flex:0.195;min-height:0;" />
      <ListSection style="flex:0.805;min-height:0;" />
    </div>
  </base-panel>
</template>
`

const NORMAL = `<template>
  <base-panel panelKey="default-panel">
    <template #title-left>
      <Icon />
    </template>
    <div class="c-x-body">x</div>
  </base-panel>
</template>
`

describe('R10 · template 根游离元素归位（11bd56c1 实锤）', () => {
  it('⭐ 阳性：base-panel 前游离 tabs 块移入默认插槽首部', () => {
    const r = relocateStrayTemplateRoots(STRAY)
    expect(r.changed).toBe(true)
    expect(r.moved).toHaveLength(1)
    const head = r.content.split('\n').slice(0, 6).join('\n')
    expect(head).toMatch(/<template>\s*\n\s*<base-panel/)
    // 游离块现在 base-panel 内部首位
    const panelIdx = r.content.indexOf('<base-panel')
    const tabsIdx = r.content.indexOf('c-x-tabs')
    expect(tabsIdx).toBeGreaterThan(panelIdx)
    // 原位置（base-panel 之前）不再有该块
    expect(r.content.slice(0, panelIdx)).not.toContain('c-x-tabs')
    // 其余结构零丢失
    expect(r.content).toContain('<TabsSection')
    expect(r.content).toContain('<ListSection')
    expect(r.content).toContain('</base-panel>')
  })

  it('阴性·正常结构（含具名插槽）零触碰', () => {
    const r = relocateStrayTemplateRoots(NORMAL)
    expect(r.changed).toBe(false)
    expect(r.content).toBe(NORMAL)
  })

  it('阴性·无 base-panel（vue3 形态）零触碰', () => {
    const NO_PANEL = '<template>\n  <div class="x">y</div>\n</template>'
    const r = relocateStrayTemplateRoots(NO_PANEL)
    expect(r.changed).toBe(false)
  })

  it('阴性·具名插槽块在 base-panel 前属合法（不触发）', () => {
    const NAMED = '<template>\n  <template #title-left>\n    <I />\n  </template>\n  <base-panel>x</base-panel>\n</template>'
    const r = relocateStrayTemplateRoots(NAMED)
    expect(r.changed).toBe(false)
  })

  // 🔴 2026-11-09 修订（第二轮评审 P0-3）：旧实现用「整段 before.trim()」当游离块，
  //   具名插槽与游离元素混存时会把具名插槽一起搬进默认插槽（与文档承诺相反）。
  it('⭐ 阳性·混合结构：只搬游离元素，具名插槽原位保留', () => {
    const MIXED = `<template>
  <template #title-left>
    <Icon />
  </template>
  <div class="c-x-stray">tabs</div>
  <base-panel panelKey="p">
    <div class="c-x-body">x</div>
  </base-panel>
</template>
`
    const r = relocateStrayTemplateRoots(MIXED)
    expect(r.changed).toBe(true)
    // 具名插槽仍在 base-panel 之前（原位不动）
    const panelIdx = r.content.indexOf('<base-panel')
    const namedIdx = r.content.indexOf('#title-left')
    expect(namedIdx).toBeGreaterThan(-1)
    expect(namedIdx).toBeLessThan(panelIdx)
    // 游离 div 搬到了 base-panel 内部
    expect(r.content.indexOf('c-x-stray')).toBeGreaterThan(panelIdx)
    // 具名插槽未被搬入 panel 内部（否则会嵌套进 div，Vue 不认）
    const strayIdx = r.content.indexOf('c-x-stray')
    const namedCloseIdx = r.content.indexOf('</template>', namedIdx)
    expect(namedCloseIdx).toBeLessThan(strayIdx)
    // 只搬了 1 个节点
    expect(r.moved).toHaveLength(1)
  })

  it('阳性·开标签属性值含 ">" 时按引号感知扫描，不截断标签', () => {
    const GT = `<template>
  <div class="stray">t</div>
  <base-panel :cond="a > b" panelKey="p">
    <div>body</div>
  </base-panel>
</template>
`
    const r = relocateStrayTemplateRoots(GT)
    expect(r.changed).toBe(true)
    // 开标签完整保留（含 :cond="a > b"）
    expect(r.content).toContain(':cond="a > b"')
    expect(r.content).toContain('panelKey="p"')
    // 游离块在开标签之后
    const tagClose = r.content.indexOf('panelKey="p">')
    expect(tagClose).toBeGreaterThan(-1)
    expect(r.content.indexOf('class="stray"')).toBeGreaterThan(tagClose)
  })

  it('阴性·幂等：已归位的结构二次调用零改动', () => {
    const once = relocateStrayTemplateRoots(STRAY)
    const twice = relocateStrayTemplateRoots(once.content)
    expect(twice.changed).toBe(false)
    expect(twice.content).toBe(once.content)
  })

  it('阴性·base-panel 前只有注释/空白（不算游离元素）', () => {
    const ONLY_COMMENT = '<template>\n  <!-- tabs -->\n\n  <base-panel>x</base-panel>\n</template>'
    const r = relocateStrayTemplateRoots(ONLY_COMMENT)
    expect(r.changed).toBe(false)
  })
})

describe('S6 · SFC 顶层块不得当游离 DOM 根搬移（2026-11-09 · a7b905d1 实锤）', () => {
  it('重复 <template> 骨架不被搬进 base-panel（moved=[]、changed=false）', () => {
    const src = [
      '<template>',
      '  <template>',
      '    <div class="dup">dup</div>',
      '  </template>',
      '  <base-panel panelKey="default-panel">',
      '    <div class="ok">ok</div>',
      '  </base-panel>',
      '</template>',
      '',
    ].join('\n');
    const r = relocateStrayTemplateRoots(src);
    expect(r.moved).toEqual([]);
    expect(r.changed).toBe(false);
  });

  it('真正的游离 DOM 根仍正常归位（不误伤 R10 主线）', () => {
    const src = [
      '<template>',
      '  <div class="stray">x</div>',
      '  <base-panel panelKey="default-panel">',
      '    <div class="ok">ok</div>',
      '  </base-panel>',
      '</template>',
      '',
    ].join('\n');
    const r = relocateStrayTemplateRoots(src);
    expect(r.changed).toBe(true);
    expect(r.moved.length).toBeGreaterThan(0);
  });
});
