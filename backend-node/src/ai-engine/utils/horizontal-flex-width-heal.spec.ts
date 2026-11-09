/**
 * 🛡️ R9-b（2026-11-09 · loop-verify R9 轮）：横排 flex 兄弟组 width:100% 挤压裁切 heal。
 *
 * 病灶（设备监测 49d23fe1 真机实锤）：switch-con（89:38 横排 flex）下两张统计卡
 * scoped CSS 均 `width: 100%` ⇒ 互相挤压，第二卡文字裁成「南北接：设备」。
 * 判据与 flex-shrink-guard 判据 A 同源（percent-size-on-unprotected-flex-child），
 * heal 形态：width:100% → flex:1 1 0 + min-width:0。
 */
import {
  healHorizontalFlexWidth100,
  collectRowFlexChildComponents,
  healRowFixedWidthTruth,
} from './horizontal-flex-width-heal.js';

/** 49d23fe1 StatsTunnel 形态逐字复刻（含 LESS 头部 @ 变量/@import —— 首版 bug 实锤素材） */
const TUNNEL = `<template>
  <div class="c-device-monitor-stats-tunnel" data-section-id="2:8787">
    <div class="c-device-monitor-stats-tunnel-left">x</div>
  </div>
</template>

<script setup>
import bg1 from '../../resources/images/bg-1.png'
</script>

<style lang="less" scoped>
@fontSize: var(--fontSize, 14px);
@import '../../resources/styles/index.less';

.c-device-monitor-stats-tunnel {height: 100%;
  width: 100%;
  min-height: 0;
  display: grid;
}
</style>
`

describe('R9-b · 横排 flex 兄弟组 width:100% heal（49d23fe1 实锤）', () => {
  it('⭐ 阳性：width:100% → flex:1 1 0 + min-width:0（LESS 头部不干扰选择器解析）', () => {
    const r = healHorizontalFlexWidth100(TUNNEL, { parentIsRowFlex: true })
    expect(r.changed).toBe(true)
    expect(r.rewritten).toEqual(['c-device-monitor-stats-tunnel'])
    const block = r.content.match(/\.c-device-monitor-stats-tunnel \{[^}]*\}/)[0]
    expect(block).toContain('flex: 1 1 0')
    expect(block).toContain('min-width: 0')
    expect(block).not.toMatch(/width:\s*100%/)
    // 其余声明原样保留
    expect(block).toContain('height: 100%')
    expect(block).toContain('display: grid')
    // LESS 头部不被破坏
    expect(r.content).toContain("@import '../../resources/styles/index.less'")
  })

  it('阴性·无父容器佐证（无结构判定也无 class 白名单）⇒ 保守不改（竖排场景安全）', () => {
    const r = healHorizontalFlexWidth100(TUNNEL, {})
    expect(r.changed).toBe(false)
  })

  it('阴性·已有 shrink 保护（flex-shrink:0）⇒ 豁免', () => {
    const PROTECTED = TUNNEL.replace(
      'width: 100%;',
      'width: 100%;\n  flex-shrink: 0;',
    )
    const r = healHorizontalFlexWidth100(PROTECTED, { parentIsRowFlex: true })
    expect(r.changed).toBe(false)
  })

  it('阴性·已有 flex 声明 ⇒ 豁免（不重复写）', () => {
    const HASFLEX = TUNNEL.replace('width: 100%;', 'flex: 0.42 1 0;')
    const r = healHorizontalFlexWidth100(HASFLEX, { parentIsRowFlex: true })
    expect(r.changed).toBe(false)
  })

  it('阴性·无 width:100% 的组件零触碰', () => {
    const NOOP = TUNNEL.replace('width: 100%;', '')
    const r = healHorizontalFlexWidth100(NOOP, { parentIsRowFlex: true })
    expect(r.changed).toBe(false)
    expect(r.content).toBe(NOOP)
  })

  // 🔴 2026-11-09 修订（第二轮评审 P0-2）：旧实现接受 `'*'` 通配，等价「无条件信任调用方」，
  //   现在必须显式结构判定或真实 class 白名单。
  it("阴性·'*' 通配不再生效（防无条件放行）", () => {
    const r = healHorizontalFlexWidth100(TUNNEL, { parentFlexRowClasses: ['*'] })
    expect(r.changed).toBe(false)
  })

  it('阳性·显式 class 白名单命中（真实类名）', () => {
    const r = healHorizontalFlexWidth100(TUNNEL, {
      parentFlexRowClasses: ['c-device-monitor-stats-tunnel'],
    })
    expect(r.changed).toBe(true)
    expect(r.rewritten).toEqual(['c-device-monitor-stats-tunnel'])
  })
})

describe('R9-b · collectRowFlexChildComponents：横排容器直接子组件结构判定（零硬编码）', () => {
  /** 设备监测 49d23fe1 形态：switch-con 横排下两卡 */
  const INDEX = `<template>
  <div class="c-device-monitor" style="display:flex;flex-direction:column;">
    <HeaderSection style="height:65px;" />
    <div class="c-device-monitor-switch-con" style="display:flex;flex:1 1 0;min-height:0;">
      <StatsTunnel style="flex:1 1 0;min-width:0;" />
      <StatsSection style="flex:1 1 0;min-width:0;" />
    </div>
    <div class="c-device-monitor-stack" style="display:flex;flex-direction:column;">
      <CardGrid style="width:100%;" />
    </div>
  </div>
</template>
`

  it('⭐ 阳性：只收集横排容器深度 0 的子组件（竖排 column 容器的子组件不收集）', () => {
    const names = collectRowFlexChildComponents(INDEX)
    expect(names).toEqual(['StatsTunnel', 'StatsSection'])
    // 竖排 stack 里的 CardGrid 不得被当作横排子项（旧实现会误改它）
    expect(names).not.toContain('CardGrid')
    // 根容器是 column ⇒ 其子项也不收集
    expect(names).not.toContain('HeaderSection')
  })

  it('阴性：无 display:flex 容器 ⇒ 空数组', () => {
    const PLAIN = '<template><div class="a"><X /><Y /></div></template>'
    expect(collectRowFlexChildComponents(PLAIN)).toEqual([])
  })

  it('阴性：横排容器内嵌套（深度>0）的组件不收集', () => {
    const NESTED = `<template>
  <div style="display:flex">
    <div class="wrap"><DeepChild /></div>
    <DirectChild />
  </div>
</template>
`
    expect(collectRowFlexChildComponents(NESTED)).toEqual(['DirectChild'])
  })

  it('边界：单引号 style 与自闭合子组件均可解析', () => {
    const SQ = `<template>
  <section style='display: flex;'>
    <A />
    <B></B>
  </section>
</template>
`
    expect(collectRowFlexChildComponents(SQ)).toEqual(['A', 'B'])
  })
})

// ─────────────────────────────────────────────────────────────────────────
// R9-c（2026-11-09 · fe2acd21/54f523ac 实锤）：横排容器子项「定宽真值」行内注入。
// 病灶：89:37（flex row）下 tab 列 89:39 真值 46×317，产物 `flex: 0 0 auto` 自撑 193px
// ⇒ 挤占网格。守六条：
//   ① 阳性：class 块声明 flex:0 0 auto + 容器 class 在 common.less（行内无 display）
//     ⇒ 行内注入 flex: 0 0 46px；
//   ② 阴性（健康单 49d23fe1 同形态）：子项行内 flex:0.111 + min-width:0 ⇒ 不动；
//   ③ 阴性：width:100% 子项 ⇒ R9-b 契约域，本刀不碰；
//   ④ 阴性：真值缺失 ⇒ noTruth 计数、不猜；
//   ⑤ 幂等：二次调用 changed=false；
//   ⑥ 阴性：竖排（column）容器 ⇒ 不碰。
// ─────────────────────────────────────────────────────────────────────────
describe('R9-c：横排容器子项定宽真值注入', () => {
  // fe2acd21 形态：容器/子项样式都在 common.less（index.vue 行内只有 min-height）
  const LESS = `
.c-device-monitor-89-37-con {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 8px;
  width: 100%;
}
.c-device-monitor-89-39-con {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 0 0 auto;
  min-height: 0;
}
.c-device-monitor-2-8437-con {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
}
`
  const INDEX = `<template>
  <div class="c-device-monitor-slot-con" style="display:flex;flex-direction:column;height:100%;">
    <div class="c-device-monitor-89-37-con" data-section-id="89:37" style="flex:0.830;min-height:0;">
      <div class="c-device-monitor-89-39-con" data-section-id="89:39" style="min-height:0;">
        <div class="c-device-monitor-tab-item">监控</div>
      </div>
      <div class="c-device-monitor-2-8437-con" data-section-id="2:8437" style="min-height:0;">
        <div class="c-device-monitor-card">卡</div>
      </div>
    </div>
  </div>
</template>
`
  const files = (less: string) => [
    { path: 'resources/styles/common.less', content: less },
    { path: 'package/index.vue', content: INDEX },
  ]
  const truth = (sid: string) => ({ '89:37': 367, '89:39': 46, '2:8437': 367 }[sid] ?? null)

  it('① 阳性：flex:0 0 auto 自撑子项 ⇒ 行内注入 flex: 0 0 46px', () => {
    const r = healRowFixedWidthTruth(INDEX, files(LESS), { truthWidthOf: truth })
    expect(r.changed).toBe(true)
    expect(r.healed).toEqual([{ sid: '89:39', width: 46, cls: 'c-device-monitor-89-39-con', where: 'inline-append' }])
    expect(r.content).toContain('data-section-id="89:39" style="min-height:0;flex: 0 0 46px"')
    // 另一子项 2-8437（flex: 1 1 auto 有弹性语义）必须被豁免：healed 恰 1 条、豁免恰 1 条
    expect(r.healed).toHaveLength(1)
    expect(r.stats.hasFlexSemantics).toBe(1)
  })

  it('② 阴性：子项行内 flex:0.111 + min-width:0（49d23fe1 健康形态）⇒ 不动', () => {
    const healthy = INDEX.replace(
      'data-section-id="89:39" style="min-height:0;"',
      'data-section-id="89:39" style="flex:0.111;min-width:0;"',
    )
    const r = healRowFixedWidthTruth(healthy, files(LESS.replace('flex: 0 0 auto;', '')), { truthWidthOf: truth })
    expect(r.changed).toBe(false)
    expect(r.stats.hasFlexSemantics).toBeGreaterThanOrEqual(1)
  })

  it('③ 阴性：width:100% 子项 ⇒ R9-b 契约域，本刀不碰', () => {
    const idx = INDEX.replace('data-section-id="89:39" style="min-height:0;"', 'data-section-id="89:39" style="width:100%;"')
    const r = healRowFixedWidthTruth(idx, files(LESS), { truthWidthOf: truth })
    expect(r.changed).toBe(false)
  })

  it('④ 阴性：真值缺失 ⇒ noTruth 计数、不猜', () => {
    const r = healRowFixedWidthTruth(INDEX, files(LESS), { truthWidthOf: () => null })
    expect(r.changed).toBe(false)
    expect(r.stats.noTruth).toBeGreaterThanOrEqual(1)
    expect(r.stats.healed).toBe(0)
  })

  it('⑤ 幂等：已注入目标声明 ⇒ 二次调用 changed=false', () => {
    const once = healRowFixedWidthTruth(INDEX, files(LESS), { truthWidthOf: truth })
    expect(once.changed).toBe(true)
    const twice = healRowFixedWidthTruth(once.content, files(LESS), { truthWidthOf: truth })
    expect(twice.changed).toBe(false)
    expect(twice.healed).toHaveLength(0)
  })

  it('⑥ 阴性：竖排（column）容器 ⇒ 不碰', () => {
    const colLess = LESS.replace('flex-direction: row;', 'flex-direction: column;')
    const r = healRowFixedWidthTruth(INDEX, files(colLess), { truthWidthOf: truth })
    expect(r.changed).toBe(false)
    expect(r.stats.candidates).toBe(0)
  })
})
