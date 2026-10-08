import {
  collectSharedClassBodies,
  collectPropNames,
  formatDeclarationList,
  pruneConflictingDecls,
  pruneDuplicateStyleDecls,
  pruneDuplicateStyleDeclsFromShared,
} from './style-dedup-guard.js'
// 🛡️ P2-11 端到端用例用真实修复器做下游追加
import { extractLeafBlocks, fixVerticalBody } from './vertical-layout-guard.js'

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

/** 🛡️ P2-11：声明体口径单一事实源（style-dedup-guard 与 shared-class-deconflict 共用） */
describe('formatDeclarationList（声明体规范多行输出）', () => {
  it('逐条两空格缩进 + `;` 收尾；吃掉原始缩进与空白', () => {
    expect(formatDeclarationList(['\n  flex-direction: column', '\n  min-height: 0\n'])).toBe(
      '  flex-direction: column;\n  min-height: 0;',
    )
  })

  it('片段自带末尾 `;` 时去重，只留一个终止符（幂等）', () => {
    expect(formatDeclarationList(['min-height: 0;'])).toBe('  min-height: 0;')
    expect(formatDeclarationList(['min-height: 0;;;'])).toBe('  min-height: 0;')
  })

  it('空数组 / 全空串 → 空串（调用方据此删整块）', () => {
    expect(formatDeclarationList([])).toBe('')
    expect(formatDeclarationList(['', '   ', null, undefined])).toBe('')
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

  // 🛡️ P2-11（2026-10-01 · c-be6-869be6fe 实锤）：输出必须「规范多行 + 逐条 `;` 收尾」。
  //   旧实现 `kept.join(';').trim()` 产出 `flex-direction: column`（单行、末条无 `;`），
  //   拼进块得到 `{flex-direction: column}`；下游 VERT-004 按「末条已 `;`」追加 min-height
  //   ⇒ `{flex-direction: column\n  min-height: 0; …}` ⇒ LESS `Unrecognised input`。
  it('输出规范多行且逐条 `;` 收尾（不再产出裸值结尾）', () => {
    const r = pruneConflictingDecls(
      'flex: 1 1 0;\n  width: 100%;\n  min-height: 0;\n  flex-direction: column',
      new Set(['flex', 'width']),
    )
    expect(r.removed).toBe(2)
    expect(r.body).toBe('  min-height: 0;\n  flex-direction: column;')
    // 关键契约：末字符必须是 `;`（下游按「声明已终止」做字符串追加）
    expect(r.body.trimEnd().endsWith(';')).toBe(true)
  })

  it('空体返回空串（调用方据此删整块）', () => {
    const r = pruneConflictingDecls('width: 5px; height: 5px', new Set(['width', 'height']))
    expect(r.removed).toBe(2)
    expect(r.body).toBe('')
  })
})

/**
 * 🛡️ P2-11 端到端：生产者规范化后，下游 VERT-004 追加不再产出非法 LESS
 * （c-be6-869be6fe：`.c-869be6-icon {flex-direction: column` + 追加 ⇒ Unrecognised input）。
 */
describe('P2-11 事故复现：共享表删除属性后的块形态可被下游安全追加', () => {
  it('剪枝后的块 + VERT-004 追加 → 块内每条声明都以 `;` 终止', () => {
    // 复现事故：共享表块被删掉 width/... 后只剩 flex-direction: column
    const r = pruneConflictingDecls(
      '\n  flex-direction: column;\n  width: 100%;\n  height: 100%;',
      new Set(['width', 'height']),
    )
    const badBlock = `.c-869be6-icon {\n${r.body}\n}`
    // 用 vertical-layout-guard 的真实修复器做追加
    const blk = extractLeafBlocks(badBlock)[0]
    const { newBody } = fixVerticalBody(blk.body, blk.selector)
    const fixed = `.c-869be6-icon {\n${newBody}}`
    // 每条声明都有 `;` ⇒ 不会出现 `flex-direction: column\n  min-height` 粘连
    expect(fixed).toMatch(/flex-direction:\s*column;/)
    expect(fixed).not.toMatch(/flex-direction:\s*column\s*\n\s*min-height/)
    for (const decl of fixed.replace(/[{}]/g, '').split(';')) {
      const t = decl.trim()
      if (!t || t.startsWith('/*') || t.endsWith('*/')) continue
      expect(t).toMatch(/:/)
    }
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

/**
 * 🛡️ 刀 23（2026-10-08 · mc-max-1791439072481-07b4d2a5 实锤）— 「FLEX-003 跨文件 flex 值冲突」治本自愈。
 *
 * 事故链：`.c-07b4d2-header` 在 SFC scoped 写 `flex: 1 1 0`、在 common.less 写 `flex: 0 0 auto`。
 * 浏览器实际生效 = SFC 那份（scoped 优先级 (0,2,0) > common.less (0,1,0)），但
 * FLEX-003 跨文件索引读到 common.less 那份 → BLOCK。本刀 = 反向 pruneDuplicateStyleDecls：
 * 剥 shared 表里的「SFC scoped 已声明的 LAYOUT_PROPS 属性」声明，让 FLEX-003 看不到矛盾。
 */
describe('刀 23 · pruneDuplicateStyleDeclsFromShared', () => {
  const baseFiles = () => [
    {
      path: 'package/components/HeaderSection.vue',
      content: `<template><div class="c-07b4d2-header">x</div></template>
<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-07b4d2-header {
  flex: 1 1 0;
  width: 100%;
  min-height: 0;
  color: #333;
}
</style>`,
    },
    {
      path: 'resources/styles/common.less',
      content: `.c-07b4d2-header {
  flex: 0 0 auto;
  width: 200px;
  color: #666;
  background: #fff;
}`,
    },
  ]

  it('SFC scoped 已声明的 LAYOUT_PROPS 属性，从 shared 表里剥（flex/width）', () => {
    const r = pruneDuplicateStyleDeclsFromShared(baseFiles())
    const shared = r.files.find((f) => f.path.includes('common.less'))!
    const vue = r.files.find((f) => f.path.includes('HeaderSection'))!

    // 关键回归：flex / width 从 shared 表被剥（避免 FLEX-003 跨文件索引冲突）
    expect(shared.content).not.toMatch(/\.c-07b4d2-header\s*\{[^}]*flex:/)
    expect(shared.content).not.toMatch(/\.c-07b4d2-header\s*\{[^}]*width:/)
    // 表现类（color / background）保留在 shared 表——允许差异化
    expect(shared.content).toMatch(/color:\s*#666/)
    expect(shared.content).toMatch(/background:\s*#fff/)
    // SFC scoped 完全不动
    expect(vue.content).toMatch(/flex:\s*1 1 0/)
    expect(vue.content).toMatch(/width:\s*100%/)
  })

  it('空壳块（剥后无剩余声明）→ 整块删除，不留 `.c-x {}`', () => {
    // shared 表里的 c-empty 只有 width（且 SFC 也声明了 width）→ 剥空
    const src = [
      {
        path: 'package/components/A.vue',
        content: '<style lang="less" scoped>\n.c-empty { width: 5px; }\n</style>',
      },
      { path: 'resources/styles/common.less', content: '.c-empty { width: 10px }' },
    ]
    const r = pruneDuplicateStyleDeclsFromShared(src)
    const shared = r.files.find((f) => f.path.includes('common.less'))!
    expect(shared.content).not.toMatch(/\.c-empty\s*\{/)
  })

  it('SFC scoped 未声明的属性不剥（SFC 没声明 background，但 shared 有）', () => {
    // background 不在 LAYOUT_PROPS 白名单，本就不参与；SFC 没声明的 LAYOUT_PROPS 属性
    // （如 padding）shared 里若有就保留——避免误删共享真值
    const src = [
      {
        path: 'package/components/A.vue',
        content: '<style lang="less" scoped>\n.c-x { width: 5px }\n</style>',
      },
      { path: 'resources/styles/common.less', content: '.c-x { width: 10px; padding: 4px; background: #f0f0f0 }' },
    ]
    const r = pruneDuplicateStyleDeclsFromShared(src)
    const shared = r.files.find((f) => f.path.includes('common.less'))!
    expect(shared.content).not.toMatch(/width:\s*10px/)
    expect(shared.content).toMatch(/padding:\s*4px/) // SFC 没声明 padding → 保留
    expect(shared.content).toMatch(/background:\s*#f0f0f0/) // 表现类始终保留
  })

  it('只采 scoped <style>——unscoped 全局样式不参与', () => {
    // unscoped <style> 里的 class 属性不算「SFC scoped 已声明」，不该触发剥 shared
    const src = [
      {
        path: 'package/components/A.vue',
        content: '<style>\n.c-x { width: 5px }\n</style>', // unscoped
      },
      { path: 'resources/styles/common.less', content: '.c-x { width: 10px; padding: 4px }' },
    ]
    const r = pruneDuplicateStyleDeclsFromShared(src)
    const shared = r.files.find((f) => f.path.includes('common.less'))!
    // 0 改动（unscoped 不参与 SFC scoped 集合）
    expect(shared.content).toMatch(/width:\s*10px/)
    expect(shared.content).toMatch(/padding:\s*4px/)
  })

  it('幂等：二次执行无变更', () => {
    const r1 = pruneDuplicateStyleDeclsFromShared(baseFiles())
    const r2 = pruneDuplicateStyleDeclsFromShared(r1.files)
    expect(r2.changes).toHaveLength(0)
  })

  it('无 shared 表（common.less/index.less）→ 原样返回，不误改', () => {
    const only = baseFiles().filter((f) => !f.path.includes('common.less'))
    const r = pruneDuplicateStyleDeclsFromShared(only)
    expect(r.changes).toHaveLength(0)
    expect(r.files[0].content).toBe(only[0].content)
  })

  it('对象 map 形态进 → 对象 map 形态出（与既有契约同步）', () => {
    const arr = baseFiles()
    const dict = Object.fromEntries(arr.map((f) => [f.path, f.content]))
    const r = pruneDuplicateStyleDeclsFromShared(dict)
    expect(Array.isArray(r.files)).toBe(false)
    expect(typeof r.files).toBe('object')
    // shared 表有改动
    expect(r.changes.length).toBeGreaterThan(0)
  })
})
