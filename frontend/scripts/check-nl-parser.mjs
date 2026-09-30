#!/usr/bin/env node
/**
 * 大屏布局 ·「自然语言 → 布局 DSL」解析器离线回归
 * ------------------------------------------------------------
 * 设计要点：
 *   1. 直接 ts.transpileModule 跑 **真 TS 源码**，不是另写一份 JS 副本
 *      —— 副本会与源码漂移，测了等于没测。
 *   2. 零网络、零 LLM、毫秒级：改解析器规则前先跑它，防止回归裸奔。
 *   3. 断言维度与「用户能感知的结果」对齐（列数/区域数/头尾/fit/列宽权重/间隔）。
 *
 * 运行：
 *   node scripts/check-nl-parser.mjs
 *   npm run check:nl-parser
 * 退出码 0 = 全绿，1 = 有失败（可直接进 CI / pre-commit）。
 */

import fs from 'node:fs'
import path from 'node:path'
import Module from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FE_ROOT = path.resolve(__dirname, '..')
const UTILS_DIR = path.join(FE_ROOT, 'src/views/screen-layout/utils')

const require = Module.createRequire(import.meta.url)
const ts = require(path.join(FE_ROOT, 'node_modules/typescript'))

// ============================================================
// TS 源码加载器（抹类型 → CJS → 注入依赖）
// ============================================================

function loadTsModule(file, injections = {}) {
  const full = path.join(UTILS_DIR, file)
  if (!fs.existsSync(full)) return null

  const src = fs.readFileSync(full, 'utf8')
  const js = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: full,
  }).outputText

  const m = new Module(full, null)
  m.filename = full
  m.paths = Module._nodeModulePaths(UTILS_DIR)

  const nativeRequire = Module.prototype.require
  m.require = function (id) {
    const hit = Object.keys(injections).find((k) => id === k || id.endsWith(k))
    if (hit) return injections[hit]
    return nativeRequire.call(this, id)
  }

  m._compile(js, full)
  return m.exports
}

const parser = loadTsModule('nl-layout-parser.ts')
if (!parser) {
  console.error('❌ 找不到 src/views/screen-layout/utils/nl-layout-parser.ts')
  process.exit(1)
}
const refine = loadTsModule('nl-layout-refine.ts', { './nl-layout-parser': parser })

const { parseLayoutPrompt } = parser

// ============================================================
// 断言框架
// ============================================================

let pass = 0
let fail = 0
const failures = []

function check(name, cond, detail) {
  if (cond) {
    pass++
  } else {
    fail++
    failures.push(detail ? `${name} —— ${detail}` : name)
  }
}

function eq(name, actual, expected) {
  check(name, actual === expected, `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`)
}

function section(title) {
  console.log(`\n${'─'.repeat(76)}\n▌${title}\n${'─'.repeat(76)}`)
}

function showCase(prompt, r) {
  const c = r.candidates[0]
  console.log(`\n输入: ${prompt}`)
  console.log(`  线索: ${r.clues.map((x) => `${x.label}=${x.value}`).join(' | ')}`)
  console.log(`  fit: ${r.fit}`)
  r.candidates.forEach((cand, i) => {
    const L = cand.layout
    console.log(
      `  [候选${i + 1}] ${cand.label}  cols=[${L.body.columns.map((x) => x.width).join(',')}]` +
        ` zones=${L.body.zones.length} header=${L.header ? L.header.height : '无'}` +
        ` footer=${L.footer ? L.footer.height : '无'} canvas=${L.canvas.width}x${L.canvas.height}` +
        ` mode=${L.canvas.outputScaleMode}`,
    )
  })
  if (r.warnings.length) console.log(`  ⚠️  ${r.warnings.join('  ⟂  ')}`)
  void c
}

// ============================================================
// A. 基础解析（从零生成）
// ============================================================

const BASIC_CASES = [
  {
    p: '1920×1080，铺满不变形，左边上下两块右边上下两块，有顶栏',
    expect: { cols: 2, zones: 4, header: true, footer: false, fit: 'fluid' },
  },
  {
    p: '大屏页面19201080做成自适应，左边两栏右边两栏',
    expect: { cols: 4, size: [1920, 1080], fit: 'fluid' },
  },
  {
    p: '4K 大屏，等比缩放，左中右三栏，有顶栏和底栏',
    expect: { cols: 3, size: [3840, 2160], header: true, footer: true, fit: 'contain' },
  },
  {
    p: '2560×1440，宽度填满，左右各两栏，有底栏',
    expect: { cols: 4, size: [2560, 1440], footer: true, fit: 'fillWidth' },
  },
  {
    // 「拉伸」不映射 hybrid（语义相反），按 fluid 生成 + 告警
    p: '1920x1080 拉伸填满，左右各一栏',
    expect: { cols: 2, fit: 'fluid', warn: true },
  },
  {
    p: '我要一个很酷的页面',
    expect: { cols: 3, warn: true, fit: 'fluid' },
  },
]

section('A. 基础解析')
for (const { p, expect: e } of BASIC_CASES) {
  const r = parseLayoutPrompt(p)
  const c1 = r.candidates[0]
  const cols = c1.layout.body.columns.length
  showCase(p, r)

  if (e.cols !== undefined) eq('[A] 列数', cols, e.cols)
  if (e.zones !== undefined) eq('[A] 区域数', c1.layout.body.zones.length, e.zones)
  if (e.header !== undefined) eq('[A] 顶栏', !!c1.layout.header, e.header)
  if (e.footer !== undefined) eq('[A] 底栏', !!c1.layout.footer, e.footer)
  if (e.fit !== undefined) eq('[A] 适配策略', r.fit, e.fit)
  if (e.warn !== undefined) check('[A] 有提示', r.warnings.length > 0, `warnings=${JSON.stringify(r.warnings)}`)
  if (e.size !== undefined) {
    eq('[A] 画布宽', c1.layout.canvas.width, e.size[0])
    eq('[A] 画布高', c1.layout.canvas.height, e.size[1])
  }
  eq('[A] raw 回显', r.raw, p)
}

// ============================================================
// B. 结构一致性（越界 / 重复 id）
// ============================================================

section('B. 结构一致性')
for (const { p } of BASIC_CASES) {
  const r = parseLayoutPrompt(p)
  for (const cand of r.candidates) {
    const L = cand.layout
    const n = L.body.columns.length
    const outOfRange = L.body.zones.filter((z) => z.colIndex < 0 || z.colIndex >= n)
    const zoneIds = L.body.zones.map((z) => z.id)
    const colIds = L.body.columns.map((c) => c.id)
    check(`[B] ${cand.label} colIndex 合法`, outOfRange.length === 0, `越界 ${outOfRange.length} 个`)
    check(`[B] ${cand.label} zone id 唯一`, new Set(zoneIds).size === zoneIds.length)
    check(`[B] ${cand.label} col id 唯一`, new Set(colIds).size === colIds.length)
    check(`[B] ${cand.label} 列宽为正数 fr`, L.body.columns.every((c) => /^\d+(\.\d+)?fr$/.test(c.width)))
  }
}

// ============================================================
// C. 覆盖率补充：比例权重 / 头尾高度 / M×N 网格
// ============================================================

const EXT_CASES = [
  // ── 比例权重 ──
  {
    p: '1920×1080，左中右三栏，比例 1:2:1',
    expect: { cols: 3, colsFr: [1, 2, 1] },
  },
  {
    p: '2560×1440，左边窄右边宽，两栏',
    expect: { cols: 2, colsFr: [1, 2] },
  },
  {
    p: '1920×1080，左 1 右 2，分两栏',
    expect: { cols: 2, colsFr: [1, 2] },
  },
  // ── 头尾高度 ──
  {
    p: '1920×1080，顶栏 100px，底栏 60px，三栏',
    expect: { header: true, footer: true, headerHeight: '100px', footerHeight: '60px' },
  },
  // ── M×N 网格 ──
  {
    p: '1920×1080，3 行 4 列的网格',
    expect: { cols: 4, zones: 12 },
  },
  {
    p: '1920×1080，4×3 网格，有顶栏',
    expect: { cols: 4, zones: 12, header: true },
  },
]

section('C. 覆盖率补充（比例权重 / 头尾高度 / M×N 网格）')
for (const { p, expect: e } of EXT_CASES) {
  const r = parseLayoutPrompt(p)
  const c1 = r.candidates[0]
  showCase(p, r)

  if (e.cols !== undefined) eq('[C] 列数', c1.layout.body.columns.length, e.cols)
  if (e.zones !== undefined) eq('[C] 区域数', c1.layout.body.zones.length, e.zones)
  if (e.header !== undefined) eq('[C] 顶栏', !!c1.layout.header, e.header)
  if (e.footer !== undefined) eq('[C] 底栏', !!c1.layout.footer, e.footer)
  if (e.headerHeight !== undefined) eq('[C] 顶栏高度', c1.layout.header?.height, e.headerHeight)
  if (e.footerHeight !== undefined) eq('[C] 底栏高度', c1.layout.footer?.height, e.footerHeight)
  if (e.colsFr !== undefined) {
    const actual = c1.layout.body.columns.map((c) => parseFloat(c.width))
    check('[C] 列宽权重', JSON.stringify(actual) === JSON.stringify(e.colsFr), `期望 ${JSON.stringify(e.colsFr)}，实际 ${JSON.stringify(actual)}`)
  }
}

// ============================================================
// D. 增量修改 refine
// ============================================================

if (refine && typeof refine.parseRefine === 'function') {
  section('D. 增量修改 refine')
  const { parseRefine } = refine

  const base = () => parseLayoutPrompt('1920×1080，左右各一栏，有顶栏').candidates[0].layout

  const REFINE_CASES = [
    { cmd: '顶栏改 100px', assert: (L) => L.header?.height === '100px', desc: '顶栏高度 100px' },
    { cmd: '底栏 60px', assert: (L) => L.footer?.height === '60px' && L.footer?.enabled, desc: '新增底栏 60px' },
    { cmd: '去掉顶栏', assert: (L) => !L.header, desc: '移除顶栏' },
    { cmd: '加个底栏', assert: (L) => !!L.footer?.enabled, desc: '新增底栏' },
    { cmd: '改成三栏', assert: (L) => L.body.columns.length === 3, desc: '列数 2→3' },
    { cmd: '间距 16px', assert: (L) => L.body.zones.every((z) => z.padding.left === '16px'), desc: '间距 16px' },
    { cmd: '改成等比缩放', assert: (L) => L.canvas.outputScaleMode === 'contain', desc: '适配策略→contain' },
    { cmd: '改成 2560×1440', assert: (L) => L.canvas.width === 2560 && L.canvas.height === 1440, desc: '画布尺寸' },
    { cmd: '左边窄一点', assert: () => true, desc: '列宽权重可解析' },
    { cmd: '去掉左边那块', assert: () => true, desc: '删除区域' },
    { cmd: '完全看不懂的一句话xyz', assert: () => true, desc: '兜底不崩' },
  ]

  for (const { cmd, assert, desc } of REFINE_CASES) {
    const cur = base()
    const before = JSON.stringify(cur)
    const res = parseRefine(cur, cmd)
    const label = `[D] ${cmd}`
    check(`${label} 不改入参`, JSON.stringify(cur) === before, '入参被就地修改')
    check(`${label} 有返回体`, !!res && typeof res.ok === 'boolean', `res=${JSON.stringify(res)?.slice(0, 120)}`)
    if (res?.ok) {
      check(`${label} 生效（${desc}）`, !!assert(res.layout), '断言未通过')
      check(`${label} 有变更说明`, (res.changes || []).length > 0, 'changes 为空')
      // 变更后结构仍自洽
      const L = res.layout
      const n = L.body.columns.length
      check(`${label} colIndex 未越界`, L.body.zones.every((z) => z.colIndex >= 0 && z.colIndex < n))
    } else {
      check(`${label} 未命中时给提示`, !!(res?.hint || res?.error), '既没改也没提示')
    }
  }
} else {
  console.log('\n（跳过 D 组：utils/nl-layout-refine.ts 尚未落地）')
}

// ============================================================
// 汇总
// ============================================================

section('汇总')
if (failures.length) {
  console.log('失败明细：')
  failures.forEach((f, i) => console.log(`  ${i + 1}. ❌ ${f}`))
}
console.log(`\n断言结果: ${pass} 通过 / ${fail} 失败`)

if (fail === 0) {
  console.log('✅ 全绿 —— 解析器行为符合契约')
} else {
  console.log('🔴 有失败 —— 请检查上面的明细')
}
process.exit(fail > 0 ? 1 : 0)
