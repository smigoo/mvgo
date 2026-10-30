/**
 * 🛡️ 字号下限守卫 —— Lite 链路接线契约（本 spec 是「缺口不再复发」的唯一判据）
 *
 * 真实缺口（2026-10-30 真机验证暴露）：守卫实现原本只挂在
 * `microcode-engineer.js` 的 `writeFiles` 后处理链上，而 `lite.service.ts` 的
 * 4 个 index.vue 写盘点全是自己 `writeFile/writeFileSync`，**全库不调 writeFiles**
 * ⇒ Lite 产物零兜底，日志里连 `[FONT-MIN-GUARD]` 都不出现（不是 hits:0，是没执行）。
 *
 * 第二个缺口（同日真机阳性对照暴露）：接上线后 vue3 分支仍是死守卫 ——
 * 该分支不做字号归一，产物是**裸 px**，而守卫当时只认 `calc(@fontSize * X)`。
 * 实测：真实病灶裸 px 8/9/10 喂进去 → `hits:0 rawUnderMin:4 changes:0`，产物一字未改。
 *
 * 判据设计（为什么是「数量对齐」而不是逐条硬编码）：
 *   `守卫调用次数 === index.vue 写盘点次数`。任何人新增一个写盘点却忘了接线，
 *   或删掉任意一处守卫，数量立刻不等 → 红。这比逐个 if 断言更难被绕过。
 *
 * 纯函数行为见 `ai-engine/utils/font-size-guard.spec.ts`；
 * max 链路接线见 `ai-engine/roles/microcode-engineer.font-size-guard.spec.ts`。
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { ensureMinFontSize } from '../ai-engine/utils/font-size-guard.js'

const LITE_PATH = join(__dirname, 'lite.service.ts')
const src = readFileSync(LITE_PATH, 'utf-8')
const GUARD_SRC = readFileSync(join(__dirname, '../ai-engine/utils/font-size-guard.js'), 'utf-8')

/** 源码中所有 index.vue 落盘点（主路径 2 + 续跑 2） */
const WRITE_RE = /(?:await\s+)?writeFile(?:Sync)?\(\s*join\(packageDir,\s*'index\.vue'\)/g
/** 源码中所有守卫调用（排除 import 语句） */
const GUARD_RE = /ensureMinFontSize\(\{/g

const writeIdx: number[] = []
const guardIdx: number[] = []
{
  let m: RegExpExecArray | null
  while ((m = WRITE_RE.exec(src)) !== null) writeIdx.push(m.index)
  while ((m = GUARD_RE.exec(src)) !== null) guardIdx.push(m.index)
}

describe('Lite 字号守卫接线契约', () => {
  it('从单一来源导入（禁止在 lite 内另写一份）', () => {
    expect(src).toContain("from '../ai-engine/utils/font-size-guard.js'")
    expect(src).toMatch(/import\s*\{\s*ensureMinFontSize,\s*formatFontGuardLog\s*\}\s*from\s*'\.\.\/ai-engine\/utils\/font-size-guard\.js'/)
  })

  it('核心判据：守卫调用次数 === index.vue 写盘点次数（无遗漏、无冗余）', () => {
    expect(writeIdx.length).toBe(4) // 主路径微码 / 主路径 vue3 / 续跑微码 / 续跑 vue3
    expect(guardIdx.length).toBe(writeIdx.length)
  })

  it('每个写盘点之前都紧邻一处守卫（位置关系，不是「文件里存在」）', () => {
    for (const w of writeIdx) {
      const before = guardIdx.filter((g) => g < w)
      expect(before.length).toBeGreaterThan(0)
      const nearest = Math.max(...before)
      // 守卫块与写盘点之间不得插进另一个写盘点（否则说明是别的分支的守卫）
      const between = writeIdx.filter((x) => x > nearest && x < w)
      expect(between).toHaveLength(0)
      // 距离上限：守卫块是「构造 map + 取回 + 打日志」的短块
      expect(w - nearest).toBeLessThan(2000)
    }
  })

  it('微码分支两个落盘都必须过守卫（index.vue + 业务样式 common.less）', () => {
    // businessStyles 真实落点是 common.less，只守 index.vue 等于没守
    const microGuards = src.match(/ensureMinFontSize\(\{\s*'package\/index\.vue':\s*vueFinal,\s*'resources\/styles\/common\.less':\s*businessStyles,?\s*\}\)/g) || []
    expect(microGuards.length).toBe(2) // 主路径 + 续跑
  })

  it('vue3 分支两个落盘都必须过守卫', () => {
    const vue3Guards = src.match(/ensureMinFontSize\(\{\s*'package\/index\.vue':\s*vueCode\s*\}\)/g) || []
    expect(vue3Guards.length).toBe(2) // 主路径 + 续跑
  })

  it('四处日志都用 lite tag（真机可区分 max / lite 两条链路）', () => {
    const logs = src.match(/formatFontGuardLog\(_fontGuard[A-Za-z0-9]*, 'lite'\)/g) || []
    expect(logs.length).toBe(4)
    expect(src).not.toMatch(/formatFontGuardLog\(_fontGuard[A-Za-z0-9]*, 'max'\)/)
  })

  it('日志无条件打（禁止 changes>0 才打：那会让「没接线」与「零命中」同形）', () => {
    expect(src).not.toMatch(/_fontGuard[A-Za-z0-9]*\.changes\.length\s*>\s*0/)
  })

  it('死代码 prepareMicrocodeVueContent 必须保持已删除（它自称落盘单一实现却从未接线）', () => {
    expect(src).not.toContain('private async prepareMicrocodeVueContent')
    expect(src).toContain('死代码')
  })
})

describe('缺口②：vue3 裸 px 必须被真正拦截（不是只统计）', () => {
  it('守卫实现必须导入 MIN_FONT_PX 并对裸 px 做提升（结构判据）', () => {
    expect(GUARD_SRC).toMatch(/MIN_FONT_PX/)
    expect(GUARD_SRC).toMatch(/rawFixed/)
    expect(GUARD_SRC).toMatch(/RAW_PX_NUM_RE/)
  })

  it('行为判据：真实病灶阶梯 8/9/10/11/12px 过守卫后，不得残留低于下限的裸 px', () => {
    // 真实来源：c-deployment-node-overview-74d5fe95 的 codegen 原始输出（未归一，裸 px）
    const lesion = `<template><span style="font-size:9px">x</span></template>
<style>
.a { font-size: 12px; }
.b { font-size: 11px; }
.c { font-size: 10px; }
.d { font-size: 9px; }
.e { font-size: 8px; }
</style>`
    const r = ensureMinFontSize({ 'package/index.vue': lesion })
    expect(r.rawFixed).toBe(4) // inline 9px + .c/.d/.e
    expect(r.rawUnderMin).toBe(0)
    const out = r.files['package/index.vue']
    const left = [...out.matchAll(/font-size\s*:\s*([\d.]+)\s*px/gi)]
      .map((m) => parseFloat(m[1]))
      .filter((px) => px > 5 && px < 10.5)
    expect(left).toEqual([])
  })

  it('反证：合规产物（最低 11px）过守卫必须零命中（不得把合格字号抬高）', () => {
    const compliant = `<style>.a{font-size:15px}.b{font-size:13px}.c{font-size:11px}</style>`
    const r = ensureMinFontSize({ 'package/index.vue': compliant })
    expect(r.changes).toHaveLength(0)
    expect(r.files['package/index.vue']).toBe(compliant)
  })
})

describe('阳性对照：篡改源码必须让核心判据失败', () => {
  const countWrite = (s: string) => (s.match(WRITE_RE) || []).length
  const countGuard = (s: string) => (s.match(GUARD_RE) || []).length
  const aligned = (s: string) => countWrite(s) > 0 && countWrite(s) === countGuard(s)

  it('原源码 → 对齐', () => {
    expect(aligned(src)).toBe(true)
  })

  it('变异①：删掉任一处守卫调用 → 数量不再对齐（打红）', () => {
    const mutated = src.replace(
      "const _fontGuardVue3 = ensureMinFontSize({ 'package/index.vue': vueCode });",
      'const _fontGuardVue3 = { files: { \'package/index.vue\': vueCode }, changes: [] };',
    )
    expect(mutated).not.toBe(src)
    expect(aligned(mutated)).toBe(false)
  })

  it('变异②：新增一个写盘点但不接线 → 数量不再对齐（打红）', () => {
    const mutated = `${src}\n    await writeFile(join(packageDir, 'index.vue'), vueCode, 'utf-8');\n`
    expect(aligned(mutated)).toBe(false)
  })

  it('变异③：把 tag 改回 max → 打红', () => {
    const mutated = src.replace("formatFontGuardLog(_fontGuard, 'lite')", "formatFontGuardLog(_fontGuard, 'max')")
    expect(mutated).not.toBe(src)
    expect((mutated.match(/formatFontGuardLog\(_fontGuard[A-Za-z0-9]*, 'max'\)/g) || []).length).toBeGreaterThan(0)
  })
})
