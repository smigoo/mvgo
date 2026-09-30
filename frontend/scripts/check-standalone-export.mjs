#!/usr/bin/env node
/**
 * 大屏布局 · 单文件 HTML 导出器离线回归
 * ------------------------------------------------------------
 * 导出物是「用户能直接交付的东西」，它错了比页面错更严重
 * （对方拿到手双击打开是坏的，还找不到是谁的问题）。
 *
 * 断言三件事：
 *   ① 五种适配策略**各自生成各自的 CSS**（尤其 hybrid 不能被悄悄退化成 fluid）
 *   ② 结构性：列/区域数量与输入一致、DOCTYPE 完整、零外部依赖
 *   ③ 安全：布局名/组件名里的 HTML 被转义（导出文件会被直接打开）
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

function loadTsModule(file) {
  const full = path.join(UTILS_DIR, file)
  if (!fs.existsSync(full)) return null
  const js = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: full,
  }).outputText
  const m = new Module(full, null)
  m.filename = full
  m.paths = Module._nodeModulePaths(UTILS_DIR)
  m._compile(js, full)
  return m.exports
}

const exporter = loadTsModule('export-standalone-html.ts')
if (!exporter?.buildStandaloneHtml) {
  console.error('❌ 找不到 utils/export-standalone-html.ts 的 buildStandaloneHtml')
  process.exit(1)
}
const { buildStandaloneHtml } = exporter

let pass = 0
let fail = 0
const failures = []
function check(name, cond, detail) {
  if (cond) pass++
  else {
    fail++
    failures.push(detail ? `${name} —— ${detail}` : name)
  }
}
function section(t) {
  console.log(`\n${'─'.repeat(76)}\n▌${t}\n${'─'.repeat(76)}`)
}

// ── 构造一份最小可用布局 ──
function mkLayout(mode, extra = {}) {
  return {
    id: 'l1',
    name: '测试大屏',
    canvas: {
      width: 1920,
      height: 1080,
      aspectRatioLocked: true,
      aspectRatio: 1.7778,
      outputScaleMode: mode,
      backgroundColor: '#0a1628',
      showGrid: false,
      gridSize: 20,
      snapToGrid: false,
      editorZoom: 1,
    },
    header: { enabled: true, height: '70px', backgroundColor: 'rgba(20,30,80,0.9)', innerLayout: 'grid', gridCols: 1, components: [] },
    body: {
      columns: [
        { id: 'c1', width: '1fr', resizable: true, collapsible: false, defaultCollapsed: false, collapsedWidth: '0fr' },
        { id: 'c2', width: '2fr', resizable: true, collapsible: false, defaultCollapsed: false, collapsedWidth: '0fr' },
      ],
      zones: [
        { id: 'z1', colIndex: 0, contentAlign: { vertical: 'stretch', horizontal: 'stretch' }, padding: { top: '8px', right: '8px', bottom: '8px', left: '8px' }, zIndex: 'middle', offset: { left: '0', right: '0' }, layoutMode: 'grid', contentType: 'components', gridConfig: { cols: 12, rowHeight: 8, components: [] }, flexConfig: { direction: 'row', gap: '8px', wrap: false, justify: 'flex-start', align: 'stretch' } },
        { id: 'z2', colIndex: 1, contentAlign: { vertical: 'stretch', horizontal: 'stretch' }, padding: { top: '8px', right: '8px', bottom: '8px', left: '8px' }, zIndex: 'middle', offset: { left: '0', right: '0' }, layoutMode: 'grid', contentType: 'components', gridConfig: { cols: 12, rowHeight: 8, components: [{ id: 'g1', componentName: '趋势图', layout: { x: 0, y: 0, w: 6, h: 4, minW: 1, maxW: 12, minH: 1, maxH: 12, static: false }, zIndex: 1, props: {} }] }, flexConfig: { direction: 'row', gap: '8px', wrap: false, justify: 'flex-start', align: 'stretch' } },
      ],
    },
    footer: { enabled: true, height: '50px', backgroundColor: 'rgba(0,0,0,0.2)', innerLayout: 'grid', gridCols: 1, components: [] },
    ...extra,
  }
}

const MODES = ['fluid', 'hybrid', 'contain', 'fillWidth', 'fillHeight', 'none']

section('A. 六种策略各自生成各自的 CSS')
const htmls = {}
for (const mode of MODES) {
  const html = buildStandaloneHtml(mkLayout(mode))
  htmls[mode] = html
  console.log(`  ${mode.padEnd(11)} 长度 ${String(html.length).padStart(6)} 字节`)
}

check('[A] contain 用 min() 等比缩放', /transform:scale\(min\(calc\(100vw \/ 1920\), calc\(100vh \/ 1080\)\)\)/.test(htmls.contain), '未发现 min() 缩放')
check('[A] fillWidth 只按宽缩放', /transform:scale\(calc\(100vw \/ 1920\)\)/.test(htmls.fillWidth) && !/100vh/.test(htmls.fillWidth.split('.screen-root{width:1920px')[1]?.slice(0, 120) || ''), '缩放式不符')
check('[A] fillHeight 只按高缩放', /transform:scale\(calc\(100vh \/ 1080\)\)/.test(htmls.fillHeight), '缩放式不符')
check('[A] none 不缩放', !/transform:scale/.test(htmls.none), '出现了 scale')
check(
  '[A] fluid 盒=视口且不做 transform',
  /\.screen-root\{width:100vw;height:100vh;\}/.test(htmls.fluid) && !/transform:scale/.test(htmls.fluid),
  'fluid 实现不符',
)
check(
  '[A] hybrid 用 clamp 表达「等比 + 有限贴边」，未被退化成 fluid',
  /clamp\(var\(--kmin\), var\(--kmax\), calc\(var\(--kmin\) \* 1\.1364\)\)/.test(htmls.hybrid) && /--kx:calc\(100vw \/ 1920\)/.test(htmls.hybrid),
  'hybrid 未按契约生成',
)

section('B. 结构性')
for (const mode of MODES) {
  const html = htmls[mode]
  const cols = (html.match(/class="sl-col"/g) || []).length
  const zones = (html.match(/class="sl-zone"/g) || []).length
  check(`[B] ${mode} 列数=2`, cols === 2, `实际 ${cols}`)
  check(`[B] ${mode} 区域数=2`, zones === 2, `实际 ${zones}`)
  check(`[B] ${mode} 有 DOCTYPE`, html.startsWith('<!DOCTYPE html>'))
  check(`[B] ${mode} 有 <title>`, /<title>[^<]*<\/title>/.test(html))
  check(`[B] ${mode} 零外部依赖`, !/(src|href)\s*=\s*["']https?:/.test(html), '存在外部引用')
  check(`[B] ${mode} 顶底栏都在`, /class="sl-header"/.test(html) && /class="sl-footer"/.test(html))
  check(`[B] ${mode} 列宽用 fr 映射到 flex-grow`, /flex-grow:1/.test(html) && /flex-grow:2/.test(html))
}

// 无顶尾栏时不应渲染
const bare = buildStandaloneHtml(mkLayout('fluid', { header: null, footer: null }))
check('[B] 无顶尾栏时不渲染 header/footer', !/class="sl-header"/.test(bare) && !/class="sl-footer"/.test(bare))

// 组件名应出现在区域里（不是只有空占位）
check('[B] 组件名渲染进区域', /趋势图/.test(htmls.fluid))

section('C. 转义（导出文件会被直接双击打开）')
const evil = buildStandaloneHtml(
  mkLayout('fluid', {
    name: '<script>alert(1)</script>',
    body: {
      columns: [{ id: 'c1', width: '1fr', resizable: true, collapsible: false, defaultCollapsed: false, collapsedWidth: '0fr' }],
      zones: [
        {
          id: 'z1',
          colIndex: 0,
          contentAlign: { vertical: 'stretch', horizontal: 'stretch' },
          padding: { top: '8px', right: '8px', bottom: '8px', left: '8px' },
          zIndex: 'middle',
          offset: { left: '0', right: '0' },
          layoutMode: 'grid',
          contentType: 'components',
          gridConfig: { cols: 12, rowHeight: 8, components: [{ id: 'g1', componentName: '<img src=x onerror=alert(2)>', layout: { x: 0, y: 0, w: 1, h: 1, minW: 1, maxW: 1, minH: 1, maxH: 1, static: false }, zIndex: 1, props: {} }] },
          flexConfig: { direction: 'row', gap: '8px', wrap: false, justify: 'flex-start', align: 'stretch' },
        },
      ],
    },
  }),
)
check('[C] 布局名里的标签被转义', !/<script>alert\(1\)<\/script>/.test(evil) && /&lt;script&gt;/.test(evil))
// 关键判据是「不构成标签」：`<` 已被转义成 `&lt;`，剩下的 onerror= 只是纯文本，不会执行
check('[C] 组件名里的标签被转义', !/<img\s/.test(evil) && /&lt;img/.test(evil), '仍存在可执行的 <img 标签')

section('D. 骨架装饰色随画布明暗自适应')
// 设计稿画布默认是白色：若骨架沿用深色主题的浅蓝描边 + 浅色文字，
// 导出的文件白底浅字、虚线几乎看不见 —— 拿到手第一眼就是「坏的」。
const withBg = (bg) => buildStandaloneHtml(mkLayout('fluid', { canvas: { ...mkLayout('fluid').canvas, backgroundColor: bg } }))
const onWhite = withBg('#ffffff')
const onDark = withBg('#0a1628')
check('[D] 白底：骨架走深色主题', /color:#1c2a3a/.test(onWhite) && /rgba\(40, 90, 180, 0\.42\)/.test(onWhite))
check('[D] 白底：不残留深色主题的浅色文字', !/#dbe6f5/.test(onWhite))
check('[D] 深底：骨架走浅色主题', /color:#dbe6f5/.test(onDark) && /rgba\(120, 170, 255, 0\.35\)/.test(onDark))
check('[D] 非法/缺失背景色按深色处理（不崩）', /color:#dbe6f5/.test(withBg('')))

section('汇总')
if (failures.length) {
  console.log('失败明细：')
  failures.forEach((f, i) => console.log(`  ${i + 1}. ❌ ${f}`))
}
console.log(`\n断言结果: ${pass} 通过 / ${fail} 失败`)
if (fail === 0) console.log('✅ 全绿 —— 导出器行为符合契约')
else console.log('🔴 有失败')
process.exit(fail > 0 ? 1 : 0)
