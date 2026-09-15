import {
  collectSharedClassBodies,
  collectPropNames,
  pruneConflictingDecls,
  pruneDuplicateStyleDecls,
} from './style-dedup-guard.js'

/**
 * 样式重复声明剥离回归测试（2026-09-03，mc-1788415227440 实锤）
 *
 * 事故：common.less 正确写 `.c-monitor-tabs-wrapper { width: 160px; flex: 0 0 auto }`
 * （宽度修复成果），但子组件 DeviceCategoryTabs.vue 的 <style scoped> 又写了一遍
 * `flex: 1 1 0; width: 100%` —— scoped 优先级 (0,2,0) 恒胜 common.less (0,1,0)，
 * 160px 定宽在渲染层被 100% 覆盖，同时触发 FLEX-003 BLOCK。
 */

/** 复刻事故现场：共享表定宽真值 + 子组件 scoped 覆盖 */
const commonLess = `
// ─── Tabs 包装层 ──────────────────────────────────────────────────────────────
.c-monitor-tabs-wrapper {
  width: 160px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
}

.c-monitor-tab-badge {
  position: absolute;
  width: 14px;
  height: 14px;
  background: rgba(255, 77, 79, 1);
}
`

const childVue = `<template><div class="c-monitor-tabs-wrapper">x</div></template>
<script setup>const a = 1</script>
<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-tabs-wrapper {
flex: 1 1 0;

  width: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;}

.c-monitor-tab-badge {
  position: absolute;
  width: 20px;
  height: 20px;
  background: rgba(0, 0, 0, 1);
  border-radius: 4px;
}
</style>`

const files = () => [
  { path: 'package/components/DeviceCategoryTabs.vue', content: childVue },
  { path: 'resources/styles/common.less', content: commonLess },
]

describe('collectSharedClassBodies', () => {
  it('提取顶层单 class 规则块（跳过注释头污染）', () => {
    const m = collectSharedClassBodies(commonLess)
    // 关键回归：`.c-monitor-tabs-wrapper` 前带 `// ─── Tabs 包装层 ───` 注释头，
    // extractStyleBlocks 的 [^{}]+ 会把注释吞进 selector，须先剥注释再匹配
    expect(m.has('c-monitor-tabs-wrapper')).toBe(true)
    expect(m.has('c-monitor-tab-badge')).toBe(true)
    expect(m.get('c-monitor-tabs-wrapper')).toContain('width: 160px')
  })

  it('组合选择器 / 伪类 / 嵌套块不计入', () => {
    const css = `
.a .b { width: 10px }
.c:hover { width: 20px }
.d { width: 30px; &:hover { width: 40px } }
.e { width: 50px }
`
    const m = collectSharedClassBodies(css)
    expect(m.has('b')).toBe(false)
    expect(m.has('c')).toBe(false)
    expect(m.has('d')).toBe(false) // 含嵌套 &
    expect(m.has('e')).toBe(true)
  })
})

describe('collectPropNames', () => {
  it('提取属性名并小写归一', () => {
    const props = collectPropNames('width: 10px; Flex-Direction: column;')
    expect(props.has('width')).toBe(true)
    expect(props.has('flex-direction')).toBe(true)
  })
})

describe('pruneConflictingDecls', () => {
  it('剥离命中白名单且在共享表存在的属性，保留独有属性', () => {
    const shared = new Set(['width', 'flex', 'display'])
    const r = pruneConflictingDecls(
      'flex: 1 1 0;\n  width: 100%;\n  display: flex;\n  min-height: 0',
      shared,
    )
    expect(r.removed).toBe(3)
    expect(r.body).not.toContain('flex: 1 1 0')
    expect(r.body).not.toContain('width: 100%')
    expect(r.body).not.toContain('display: flex')
    expect(r.body).toContain('min-height: 0') // 独有属性保留
  })

  it('表现类属性（color/background）不剥离 —— 允许子组件差异化', () => {
    const shared = new Set(['background', 'color'])
    const r = pruneConflictingDecls('background: red; color: #fff; width: 5px', shared)
    expect(r.removed).toBe(0)
    expect(r.body).toContain('background: red')
  })
})

describe('pruneDuplicateStyleDecls', () => {
  it('剥离子组件冲突声明，共享表真值保持不变', () => {
    const r = pruneDuplicateStyleDecls(files())
    const vue = r.files.find((f) => f.path.includes('DeviceCategoryTabs'))!.content
    const shared = r.files.find((f) => f.path.includes('common.less'))!

    expect(shared.content).toBe(commonLess) // 共享表不被改动
    // 冲突的 flex / width / display / flex-direction 已剥离
    expect(vue).not.toMatch(/c-monitor-tabs-wrapper\s*\{[^}]*flex:\s*1 1 0/)
    expect(vue).not.toMatch(/c-monitor-tabs-wrapper\s*\{[^}]*width:\s*100%/)
    // 独有属性保留
    expect(vue).toMatch(/c-monitor-tabs-wrapper\s*\{[^}]*min-height:\s*0/)
    // 非布局属性（border-radius / background）保留
    expect(vue).toMatch(/c-monitor-tab-badge\s*\{[^}]*border-radius/)
  })

  it('幂等：二次执行无变更', () => {
    const r1 = pruneDuplicateStyleDecls(files())
    const r2 = pruneDuplicateStyleDecls(r1.files)
    expect(r2.changes).toHaveLength(0)
  })

  it('无共享样式表 → 原样返回（不误改）', () => {
    const only = [{ path: 'package/components/A.vue', content: childVue }]
    const r = pruneDuplicateStyleDecls(only)
    expect(r.changes).toHaveLength(0)
    expect(r.files[0].content).toBe(childVue)
  })

  it('剥离后无剩余声明 → 整块删除，不留空壳', () => {
    const src = [
      { path: 'package/components/B.vue', content: '<style>\n.x { width: 3px }\n</style>' },
      { path: 'resources/styles/common.less', content: '.x { width: 9px }' },
    ]
    const r = pruneDuplicateStyleDecls(src)
    expect(r.files[0].content).not.toMatch(/\.x\s*\{\s*\}/)
    expect(r.changes.length).toBeGreaterThan(0)
  })

  it('R5-minheight：min-height 是防塌缩安全网，即使共享表同名 class 也声明，也不剥离', () => {
    // 实锤（环境监测 chart-container）：T2 注入 min-height:160px 到子组件 scoped，
    // consolidate 又复制到 common.less，旧逻辑按「属性名」剥离子组件 min-height →
    // 图表容器塌缩。min-height 冗余无害（CSS 取较大值），必须保留。
    const src = [
      {
        path: 'package/components/ChartSection.vue',
        content: '<style lang="less" scoped>\n@import \'../../resources/styles/index.less\';\n\n.c-env-monitor-chart-container {\n  min-height: 160px;\n  width: 100%;\n}\n</style>',
      },
      {
        path: 'resources/styles/common.less',
        content: '.c-env-monitor-chart-container { min-height: 160px; width: 100%; }',
      },
    ]
    const r = pruneDuplicateStyleDecls(src)
    const vue = r.files.find((f) => f.path.includes('ChartSection'))!.content
    // width 仍剥离（冲突），min-height 保留（安全网）
    expect(vue).toMatch(/c-env-monitor-chart-container\s*\{[^}]*min-height:\s*160px/)
    expect(vue).not.toMatch(/c-env-monitor-chart-container\s*\{[^}]*width:\s*100%/)
  })
})
