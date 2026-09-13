import { CodeFixPipeline, FIX_PHASE } from './code-fix-pipeline.js'
import { registerBuiltinFixRules } from './code-fix-rules.js'
import { pruneDuplicateStyleDecls } from '../utils/style-dedup-guard.js'

/**
 * 刀 13-C · fixFiles 返回契约 + FLEX-003 真机路径回归（2026-09-13）
 *
 * 事故：`prune-duplicate-style-decls`（style-dedup-guard#pruneDuplicateStyleDecls）
 * 的纯函数只认数组形态，而 CodeFixPipeline.apply 传的是**对象 map**（Object<string,string>）
 * → 恒早退、changes 恒空、日志「样式重复声明剥离」真机 0 命中、FLEX-003 的
 * 「同 class 跨样式源 flex 冲突」永不收敛。且因返回的是包装对象 `{files, changes}`，
 * 管线只按「值是否字符串」过滤 → 静默丢弃，无任何告警。
 *
 * ⚠️ 既有 style-dedup-guard.spec.ts 全用数组直调，**测不到这条契约**——
 * 这正是「单测全绿但真机死」的盲区。本 spec 走真实接线（registerBuiltinFixRules +
 * pipeline.apply 对象 map），把契约钉死。
 */

/** 复刻 FLEX-003 事故现场：共享表定宽真值 + 子组件 scoped 覆盖 */
const COMMON_LESS = `
// ─── Tabs 包装层 ──────────────────────────────────────────────
.c-monitor-tabs-wrapper {
  width: 160px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
}
`

const CHILD_VUE = `<template><div class="c-monitor-tabs-wrapper">x</div></template>
<script setup>const a = 1</script>
<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-tabs-wrapper {
  flex: 1 1 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
</style>`

describe('刀 13-C · fixFiles 返回契约守卫（不再静默丢弃）', () => {
  const makeLogger = () => {
    const warns: string[] = []
    return {
      warns,
      logger: {
        warn: (m: unknown) => warns.push(String(m)),
        info: () => {},
      },
    }
  }

  it('返回数组 → 记 warn 指出契约要求，且不写入任何内容', () => {
    const { warns, logger } = makeLogger()
    const p = new CodeFixPipeline({ logger, context: {} })
    p.register({
      id: 'test-returns-array',
      name: '故意返回数组',
      phase: FIX_PHASE.POLISH,
      // @ts-expect-error 故意违反契约
      fixFiles: () => [{ path: 'package/index.vue', content: 'changed' }],
    })
    const r = p.apply({ 'package/index.vue': 'origin' }, {})
    expect(warns.some((w) => w.includes('test-returns-array') && w.includes('数组'))).toBe(true)
    expect(r.files['package/index.vue']).toBe('origin')
    expect(r.applied).toHaveLength(0)
  })

  it('返回 {files, changes} 包装对象 → 记 warn 列出非字符串键', () => {
    const { warns, logger } = makeLogger()
    const p = new CodeFixPipeline({ logger, context: {} })
    p.register({
      id: 'test-returns-wrapper',
      name: '故意返回包装对象',
      phase: FIX_PHASE.POLISH,
      // @ts-expect-error 故意违反契约
      fixFiles: () => ({ files: { 'a.vue': 'x' }, changes: ['c'] }),
    })
    const r = p.apply({ 'a.vue': 'origin' }, {})
    expect(warns.some((w) => w.includes('非字符串值'))).toBe(true)
    expect(r.files['a.vue']).toBe('origin')
  })

  it('正常返回 Object<string,string> → 无 warn、正常 applied', () => {
    const { warns, logger } = makeLogger()
    const p = new CodeFixPipeline({ logger, context: {} })
    p.register({
      id: 'test-contract-ok',
      name: '契约正确',
      phase: FIX_PHASE.POLISH,
      fixFiles: (files: Record<string, string>) => ({ ...files, 'a.vue': 'patched' }),
    })
    const r = p.apply({ 'a.vue': 'origin' }, {})
    expect(warns).toHaveLength(0)
    expect(r.files['a.vue']).toBe('patched')
    expect(r.applied.some((a) => a.id === 'test-contract-ok')).toBe(true)
  })
})

describe('刀 13-C · prune-duplicate-style-decls 真机路径（对象 map 契约）', () => {
  it('经 pipeline.apply(对象 map) 剥离 FLEX-003 冲突声明，共享表不动', () => {
    const pipeline = new CodeFixPipeline({ context: {} })
    // engineer 传最小 stub：本规则是纯函数不依赖 engineer；
    // 其他规则缺方法会抛异常，由 pipeline 逐条捕获跳过（既有设计行为）
    registerBuiltinFixRules(pipeline, {} as never, {
      figmaNodeData: { children: [] },
      input: {},
    })

    // 真机形态：对象 map（非数组）
    const files: Record<string, string> = {
      'package/components/DeviceCategoryTabs.vue': CHILD_VUE,
      'resources/styles/common.less': COMMON_LESS,
    }
    const res = pipeline.apply(files, {})

    // ① 规则真的跑到了（此前恒 0 命中）
    expect(res.applied.some((a) => a.id === 'prune-duplicate-style-decls')).toBe(true)

    const vue = res.files['package/components/DeviceCategoryTabs.vue']
    // ② 冲突的 flex / width / display / flex-direction 被剥离
    expect(vue).not.toMatch(/c-monitor-tabs-wrapper\s*\{[^}]*flex:\s*1 1 0/)
    expect(vue).not.toMatch(/c-monitor-tabs-wrapper\s*\{[^}]*width:\s*100%/)
    // ③ 子组件独有属性保留
    expect(vue).toMatch(/c-monitor-tabs-wrapper\s*\{[^}]*min-height:\s*0/)
    // ④ 共享表真值不被改动（仍是定宽 160px）
    expect(res.files['resources/styles/common.less']).toBe(COMMON_LESS)
  })

  it('纯函数形态跟随：对象 map 进 → 对象 map 出；数组进 → 数组出', () => {
    const map = {
      'package/components/A.vue': CHILD_VUE,
      'resources/styles/common.less': COMMON_LESS,
    }
    const rMap = pruneDuplicateStyleDecls(map)
    expect(Array.isArray(rMap.files)).toBe(false)
    expect(rMap.changes.length).toBeGreaterThan(0)

    const arr = [
      { path: 'package/components/A.vue', content: CHILD_VUE },
      { path: 'resources/styles/common.less', content: COMMON_LESS },
    ]
    const rArr = pruneDuplicateStyleDecls(arr)
    expect(Array.isArray(rArr.files)).toBe(true)
    expect(rArr.changes.length).toBeGreaterThan(0)
  })

  it('无冲突时对象 map 返回原引用（不产生虚假 applied）', () => {
    const map = {
      'package/components/B.vue': '<template><div/></template><style>.q { color: red }</style>',
      'resources/styles/common.less': COMMON_LESS,
    }
    const r = pruneDuplicateStyleDecls(map)
    expect(r.files).toBe(map)
    expect(r.changes).toHaveLength(0)
  })
})
