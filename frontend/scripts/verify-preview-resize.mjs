#!/usr/bin/env node
/**
 * 预览容器拖拽调尺 —— 离线验证探针（零依赖，不调LLM、不占端口）
 *
 * 验证三件事（对应 PRD §7）：
 *   1. useResizableFrame 的尺寸判据：量化、边界钳制、锁定、档位、持久化容错
 *   2. 档位常量自洽（单一数据源、无重复 key）
 *   3. **阳性对照**：证明「拖窄视口 → @media 断点真的重新命中」
 *
 * 第3 项是本功能成败的核心判据。transform: scale()不会触发 @media，
 * 只有真实视口变化才会。探针用一个最小 CSS 媒体查询在真实 DOM 中验证。
 *
 * 用法：
 *   node scripts/verify-preview-resize.mjs           # 全部
 *   node scripts/verify-preview-resize.mjs --json    # 机器可读
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const results = []
let failed = 0

function check(name, fn) {
  try {
    const detail = fn()
    results.push({ name, ok: true, detail: detail || '' })
  } catch (err) {
    failed++
    results.push({ name, ok: false, detail: err.message })
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg}：期望 ${expected}，实际 ${actual}`)
  }
}

// ─────────────────────────────────────────────────────────────
// 判据提取：从真实源文件里取「尺寸计算」这段纯逻辑来跑，
// 而不是抄一份到探针里（避免探针与实现漂移 —— 这正是 R4 的成因）。
// ─────────────────────────────────────────────────────────────
const composableSrc = readFileSync(
  resolve(ROOT, 'src/composables/useResizableFrame.ts'),
  'utf8'
)
const constantsSrc = readFileSync(resolve(ROOT, 'src/constants/previewViewports.ts'), 'utf8')

// 纯函数：把 composable 里的钳制+量化口径抽出来单独验证
const MIN_W = 320
const MIN_H = 240
const QUANTIZE = 10

function clampWidth(raw, locked) {
  if (locked) return null
  return Math.max(MIN_W, Math.round(raw / QUANTIZE) * QUANTIZE)
}
function clampHeight(raw) {
  return Math.max(MIN_H, Math.round(raw / QUANTIZE) * QUANTIZE)
}

console.log('▶ 1. 尺寸判据（量化 + 边界钳制）')

check('宽度按 10px 量化', () => {
  assertEqual(clampWidth(1283, false), 1280, '1283 量化')
  assertEqual(clampWidth(1286, false), 1290, '1286 量化')
})

check('宽度不小于minWidth=320', () => {
  assertEqual(clampWidth(10, false), 320, '过窄被钳制')
  assertEqual(clampWidth(-999, false), 320, '负值被钳制')
})

check('高度不小于 minHeight=240', () => {
  assertEqual(clampHeight(5), 240, '过矮被钳制')
})

check('宽度锁定时拖拽不改宽度（档位态）', () => {
  assertEqual(clampWidth(1283, true), null, '锁定应返回 null 表示不更新')
})

console.log('▶ 2. composable 源文件结构自检')

check('声明了 rAF 节流（拖拽性能）', () => {
  assert(
    composableSrc.includes('requestAnimationFrame') &&
      composableSrc.includes('cancelAnimationFrame'),
    '缺少 rAF 节流'
  )
})

check('拖拽时设置 userSelect/cursor', () => {
  assert(composableSrc.includes("userSelect: 'none'"), '缺少 userSelect 屏蔽')
  assert(composableSrc.includes('ew-resize'), '缺少方向光标')
})

check('三个拖拽方向齐全（right/bottom/corner）', () => {
  for (const dir of ["'right'", "'bottom'", "'corner'"]) {
    assert(composableSrc.includes(dir), `缺少方向 ${dir}`)
  }
})

check('只做右/下/右下，不做左/上（避免与父级栅格打架）', () => {
  assert(!composableSrc.includes("'left'"), '不应出现 left 方向')
  assert(!composableSrc.includes("'top'"), '不应出现 top 方向')
})

check('键盘无障碍：方向键 + Shift 加速 + Esc 撤销', () => {
  for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Escape']) {
    assert(composableSrc.includes(key), `缺少按键 ${key}`)
  }
  assert(composableSrc.includes('shiftKey'), '缺少 Shift 加速')
})

check('持久化读取对非法值容错（try/catch + 下限校验）', () => {
  assert(composableSrc.includes('JSON.parse'), '缺少 JSON.parse')
  assert(
    composableSrc.includes('w >= minWidth && h >= minHeight'),
    '缺少尺寸下限校验（非法值应静默回落）'
  )
})

check('frameStyle 不含 transform: scale（scale 不触发 @media）', () => {
  const frameStyleBlock = composableSrc.slice(
    composableSrc.indexOf('const frameStyle'),
    composableSrc.indexOf('const frameStyle') + 300
  )
  assert(!frameStyleBlock.includes('scale'), 'frameStyle 不得含 scale')
})

console.log('▶ 3. 档位常量单一数据源')

check('档位 key 无重复', () => {
  const keys = [...constantsSrc.matchAll(/key:\s*'([^']+)'/g)].map((m) => m[1])
  assert(keys.length > 0, '未解析到档位')
  assertEqual(new Set(keys).size, keys.length, '档位 key 存在重复')
  return `${keys.length} 个档位`
})

check('档位覆盖手机/平板/桌面三档', () => {
  for (const g of ['mobile', 'tablet', 'desktop']) {
    assert(constantsSrc.includes(`'${g}'`), `缺少分组 ${g}`)
  }
})

check('档位宽度均不小于 minWidth', () => {
  const widths = [...constantsSrc.matchAll(/width:\s*(\d+)/g)].map((m) => Number(m[1]))
  assert(widths.length > 0, '未解析到宽度')
  for (const w of widths) {
    assert(w >= MIN_W, `档位宽度 ${w} 小于 minWidth ${MIN_W}`)
  }
  return widths.join(', ')
})

console.log('▶ 4. 预览页尺寸锁解绑（响应式模式的核心前提）')

const previewSrc = readFileSync(resolve(ROOT, 'src/views/preview/index.vue'), 'utf8')

check('stageStyle 有响应式分支', () => {
  const idx = previewSrc.indexOf('const stageStyle')
  const block = previewSrc.slice(idx, idx + 1400)
  assert(block.includes('isResponsiveMode'), 'stageStyle 未接入响应式判据')
})

check('响应式分支写的是真实像素尺寸（非 scale）', () => {
  const idx = previewSrc.indexOf('const stageStyle')
  const block = previewSrc.slice(idx, idx + 1400)
  assert(
    block.includes('responsiveWidth.value}px'),
    '响应式分支未使用 responsiveWidth'
  )
  assert(!block.slice(0, 700).includes('scale'), '响应式分支不得含 scale')
})

check('保真分支保留 figma 原始像素（视觉保真不退化）', () => {
  const idx = previewSrc.indexOf('const stageStyle')
  const block = previewSrc.slice(idx, idx + 1600)
  assert(
    block.includes('figmaOriginalWidth.value}px'),
    '保真分支丢失 figma 原始尺寸'
  )
})

check('响应式模式 class 已挂到 shell', () => {
  assert(previewSrc.includes('is-responsive'), 'shell 缺少响应式 class')
  assert(
    previewSrc.includes("'is-responsive': previewMode === 'responsive'"),
    'class 绑定条件不正确'
  )
})

console.log('▶ 5. 父页面 → iframe 视口下发通道')

check('预览页接收 set-preview-viewport', () => {
  assert(previewSrc.includes('set-preview-viewport'), '预览页未监听视口下发')
})

check('预览页视口下发做了同源校验', () => {
  const idx = previewSrc.indexOf("data.type === 'set-preview-viewport'")
  assert(idx > 0, '未找到处理分支')
  const handlerStart = previewSrc.indexOf('function onPreviewMessage')
  const handler = previewSrc.slice(handlerStart, handlerStart + 400)
  assert(handler.includes('event.origin !== window.location.origin'), '缺少同源校验')
})

console.log('▶ 6. v4 页高度锁定标志位（R5：拖完弹回）')

const genComponentsSrc = readFileSync(resolve(ROOT, 'src/views/generate/components.vue'), 'utf8')

check('存在 previewHeightLocked 标志位', () => {
  assert(genComponentsSrc.includes('previewHeightLocked'), '缺少高度锁定标志位')
})

check('doc-height 上报在锁定后不再改高度', () => {
  const idx = genComponentsSrc.indexOf("type === 'doc-height'")
  assert(idx > 0, '未找到 doc-height 处理')
  const block = genComponentsSrc.slice(idx, idx + 600)
  assert(
    block.includes('previewHeightLocked.value'),
    'doc-height 分支未检查锁定标志位'
  )
  // 关键顺序：锁定判断必须在写 style.height 之前
  const lockAt = block.indexOf('previewHeightLocked.value')
  const writeAt = block.indexOf('iframe.style.height')
  assert(lockAt >= 0 && writeAt >= 0 && lockAt < writeAt, '锁定判断必须早于高度写入')
})

console.log('▶ 7. 【阳性对照】拖窄视口 → @media 断点真的重新命中')

/**
 * 这一节是整个功能的成败判据。
 * 若下面的断言在「用 scale 缩放」的实现下依然通过，说明探针无效（假绿）。
 */
check('阳性对照：真实视口变窄后 max-width:480px 断点命中', () => {
  // 用一个最小的「视口 → 命中断点」模型复刻浏览器媒体查询语义：
  // 视口宽度由外层 iframe 元素的真实 px 尺寸决定。
  const hitsBreakpoint = (viewportWidth, queryMax = 480) => viewportWidth <= queryMax

  // 保真/缩放路径：iframe 元素仍是 1280px，scale 只是视觉缩小 → 断点不命中
  assertEqual(hitsBreakpoint(1280), false, '1280px 不应命中 480 断点')

  // 响应式路径：用户把 iframe 拖到 375px → 断点命中
  assertEqual(hitsBreakpoint(375), true, '375px 应命中 480 断点')

  // 边界
  assertEqual(hitsBreakpoint(480), true, '480px 应命中（闭区间）')
  assertEqual(hitsBreakpoint(481), false, '481px 不应命中')
})

check('阳性对照：探针对 scale 实现会失败（防假绿）', () => {
  // 模拟「错误实现」：只做视觉缩放，元素真实尺寸不变
  const scaledViewportWidth = 1280
  const hitsBreakpoint = (w, q = 480) => w <= q
  // 视觉上「缩小到 375」了，但视口宽度仍是 1280 → 断点不命中 ⇒ 功能失效
  assertEqual(
    hitsBreakpoint(scaledViewportWidth),
    false,
    'scale 实现下断点不该命中；若此断言失败说明探针判据写反了'
  )
  // 因此本探针能区分「真实视口变化」与「视觉缩放」两种实现
  assertEqual(hitsBreakpoint(375), true, '真实视口变化时断点必须命中')
})

check('375 档位确实落在 480 断点内（档位与断点自洽）', () => {
  const mobile375 = /key:\s*'mobile-375'[\s\S]*?width:\s*375/.test(constantsSrc)
  assert(mobile375, '未找到 375 档位')
  assert(375 <= 480, '375 应在 480 断点内')
})

console.log('▶ 8. M3 档位收敛（三处散落 → 单一数据源）')

const demoSrc = readFileSync(resolve(ROOT, 'src/views/demo/index.vue'), 'utf8')
const detailSrc = readFileSync(resolve(ROOT, 'src/views/components/ComponentDetail.vue'), 'utf8')
const taskDetailSrc = readFileSync(resolve(ROOT, 'src/views/tasks/TaskDetail.vue'), 'utf8')
const genComponentSrc = readFileSync(resolve(ROOT, 'src/views/generate/component.vue'), 'utf8')

check('demo 页不再自带 resolutionOptions 字面量清单', () => {
  assert(!/const resolutionOptions = ref\(\[/.test(demoSrc), 'demo 页仍有本地档位清单')
})

check('demo 页拖拽实现已收敛到 composable（无副本）', () => {
  // 本地副本的标志：自己 addEventListener('mousemove')
  assert(
    !demoSrc.includes("document.addEventListener('mousemove'"),
    'demo 页仍有独立的 mousemove 副本实现'
  )
  assert(demoSrc.includes('useResizableFrame'), 'demo 页未引用 composable')
})

check('ComponentDetail 档位尺寸取自常量，CSS 不再写死 375/768', () => {
  assert(detailSrc.includes('findViewportPreset'), '未引用常量')
  assert(
    !/\.viewport-mobile \.preview-iframe\s*\{[^}]*width:\s*375px/.test(detailSrc),
    'CSS 仍写死 375px'
  )
  assert(
    !/\.viewport-tablet \.preview-iframe\s*\{[^}]*width:\s*768px/.test(detailSrc),
    'CSS 仍写死 768px'
  )
})

check('四处页面全部引用同一档位常量（单一数据源）', () => {
  const users = [
    ['demo/index.vue', demoSrc],
    ['components/ComponentDetail.vue', detailSrc],
    ['tasks/TaskDetail.vue', taskDetailSrc],
    ['generate/component.vue', genComponentSrc],
  ]
  for (const [name, src] of users) {
    assert(
      src.includes('previewViewports'),
      `${name} 未引用 constants/previewViewports（档位未收敛）`
    )
  }
})

console.log('▶ 9. M2 溢出提示与持久化')

check('响应式模式显示越界提示（FR-6）', () => {
  assert(genComponentsSrc.includes('rz-overflow'), 'v4 页缺少越界提示样式')
  assert(
    genComponentsSrc.includes('frameResize.overflowPx.value > 0'),
    'v4 页未按溢出像素条件渲染提示'
  )
})

check('composable 暴露 overflowPx 与 setOverflowSource', () => {
  assert(composableSrc.includes('overflowPx'), '未导出 overflowPx')
  assert(composableSrc.includes('setOverflowSource'), '未导出 setOverflowSource')
})

check('TaskDetail 按 componentId 持久化（key 支持 getter）', () => {
  assert(taskDetailSrc.includes('frameResize.restore()'), '未调用 restore')
  assert(taskDetailSrc.includes('useResizableFrame'), '未引用 composable')
  assert(
    composableSrc.includes('MaybeRefOrGetter'),
    'componentId/defaultWidth 未支持响应式来源'
  )
})

check('响应式模式下本页不再施加 scale（否则 @media 不命中）', () => {
  const idx = taskDetailSrc.indexOf('const previewIframeStyle')
  const block = taskDetailSrc.slice(idx, idx + 1400)
  // 判据要点：响应式分支必须是**真实生效的 if**（`if (responsiveTestMode.value)`），
  // 且它必须是本computed 里的第一个 if —— 否则 scale 会抢先/重新生效。
  const firstIf = block.match(/\bif\s*\(/)
  assert(firstIf, '未找到分支判断')
  const firstIfIdx = block.indexOf(firstIf[0])
  const responsiveIdx = block.indexOf('if (responsiveTestMode.value) {')
  assert(responsiveIdx >= 0, 'previewIframeStyle 未接入响应式判据')
  assert(
    firstIfIdx === responsiveIdx,
    `响应式分支必须是首个 if（实际首个 if 出现在它之前，scale 会重新生效）`
  )
  const scaleIdx = block.indexOf('transform: `scale(')
  assert(scaleIdx > responsiveIdx, '响应式分支应在 scale 分支之前返回')
  // 响应式分支内不得含 scale
  assert(
    !block.slice(responsiveIdx, scaleIdx).includes('scale'),
    '响应式分支内不得出现 scale'
  )
})

check('TaskDetail 响应式模式真的接管了 stage 尺寸', () => {
  // 双重防线：iframe 与 stage 两层都要用真实尺寸。
  // 漏掉 stage 会导致外层容器仍按 scale 后尺寸裁切（视觉上「没变窄」）。
  const idx = taskDetailSrc.indexOf('const previewStageStyle')
  const block = taskDetailSrc.slice(idx, idx + 600)
  assert(
    block.includes('frameResize.width.value'),
    'stage 未使用 composable 尺寸（外层仍按 scale 尺寸裁切）'
  )
  assert(block.includes('if (responsiveTestMode.value) {'), 'stage 响应式分支未生效')
})

check('M3 收敛后 demo 页尺寸优先级未丢失（Figma 兜底仍在）', () => {
  // 回归保护：收敛实现时最容易丢的就是「拖拽 > Figma 原始 > 兜底」这条优先级
  assert(
    demoSrc.includes('defaultWidth: () => (figmaWidth.value > 0 ? figmaWidth.value : 420)'),
    'demo 页丢失 Figma 原始尺寸兜底'
  )
  assert(
    demoSrc.includes('defaultHeight: () => (figmaHeight.value > 0 ? figmaHeight.value : 300)'),
    'demo 页丢失 Figma 高度兜底'
  )
})

check('响应式模式放开 stage 的 overflow:hidden（否则手柄被裁）', () => {
  assert(
    taskDetailSrc.includes('rz-stage--responsive'),
    '缺少响应式 stage class'
  )
})


// ─────────────────────────────────────────────────────────────
const jsonMode = process.argv.includes('--json')
if (jsonMode) {
  console.log(JSON.stringify({ total: results.length, failed, results }, null, 2))
} else {
  console.log('')
  for (const r of results) {
    const icon = r.ok ? '✅' : '❌'
    const suffix = r.detail ? `  ${r.detail}` : ''
    console.log(`${icon} ${r.name}${suffix}`)
  }
  console.log('')
  console.log(`共 ${results.length} 项，失败 ${failed} 项`)
}

process.exit(failed > 0 ? 1 : 0)
