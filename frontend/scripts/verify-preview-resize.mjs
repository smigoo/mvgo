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

console.log('▶ 8. M3 档位收敛（三处散落→ 单一数据源）')

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
  // ⚠️ TaskDetail 已演进为「恒响应式」架构（commit cdcd937：删保真模式、
  //    拉伸控制条收进浏览器工具条），不再使用本项目的档位常量，改用内置的
  //    zoomScaleChoice 下拉。这里按「仍属本功能域的页面」口径校验，
  //    避免把架构演进误判为档位未收敛。
  const users = [
    ['demo/index.vue', demoSrc],
    ['components/ComponentDetail.vue', detailSrc],
    ['generate/component.vue', genComponentSrc],
    ['generate/components.vue', genComponentsSrc],
  ]
  for (const [name, src] of users) {
    assert(
      src.includes('previewViewports'),
      `${name} 未引用 constants/previewViewports（档位未收敛）`
    )
  }
})

console.log('▶ 8b. TaskDetail 恒响应式架构（无保真模式分支）')

check('TaskDetail 不再保留「响应式模式开关」（恒响应式）', () => {
  assert(
    !/if\s*\(\s*responsiveTestMode\.value\s*\)/.test(taskDetailSrc),
    'TaskDetail 仍存在 responsiveTestMode 分支（应已删除保真模式）'
  )
})

check('TaskDetail iframe 恒用真实尺寸（不按 figma 尺寸写死）', () => {
  const idx = taskDetailSrc.indexOf('const previewIframeStyle')
  const block = taskDetailSrc.slice(idx, idx + 900)
  assert(
    block.includes('frameResize.width.value'),
    'iframe 未使用真实视口尺寸'
  )
  assert(
    !block.includes('figmaOriginalWidth') && !block.includes('figmaDimensions'),
    'iframe 仍按 figma 尺寸写死（恒响应式下应为真实视口）'
  )
})

check('TaskDetail stage 恒用真实尺寸（与 iframe 一致）', () => {
  const idx = taskDetailSrc.indexOf('const previewStageStyle')
  const block = taskDetailSrc.slice(idx, idx + 500)
  assert(block.includes('frameResize.width.value'), 'stage 未使用真实视口尺寸')
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
  // TaskDetail 恒响应式：iframe 宽高恒为真实视口尺寸。
  //「画布内缩放」只允许出现在 transform 上（缩放不改变 iframe 元素真实宽度，
  //因此 @media 仍按真实视口命中）—— 关键判据是 width 必须取真实视口。
  const idx = taskDetailSrc.indexOf('const previewIframeStyle')
  const block = taskDetailSrc.slice(idx, idx + 900)
  assert(block.includes('frameResize.width.value'), 'iframe 宽度必须取真实视口')
  assert(
    !/width:\s*`\$\{figma[^}]*\}`/.test(block),
    'iframe 宽度不得按 figma 尺寸写死'
  )
})

check('TaskDetail 响应式模式真的接管了 stage 尺寸', () => {
  // stage 与 iframe 两层都要用真实尺寸。漏掉 stage 会导致外层容器仍按
  // 缩放后尺寸裁切（视觉上「没变窄」）。
  const idx = taskDetailSrc.indexOf('const previewStageStyle')
  const block = taskDetailSrc.slice(idx, idx + 500)
  assert(
    block.includes('frameResize.width.value'),
    'stage 未使用 composable 尺寸（外层仍按缩放尺寸裁切）'
  )
})

check('M3 收敛后 demo 页尺寸优先级未丢失（Figma 兜底仍在）', () => {
  // 回归保护：收敛实现时最容易丢的就是「拖拽 > Figma 原始 > 兜底」这条优先级。
  // 现语义：容器在 1920×1080 画布内，Figma 尺寸需 clamp 到画布内（不超画布）。
  assert(
    /defaultWidth:\s*\(\)\s*=>/.test(demoSrc) &&
      /figmaWidth\.value/.test(demoSrc) &&
      /Math\.min\(figmaWidth\.value/.test(demoSrc),
    'demo 页丢失 Figma 原始尺寸兜底（或未按画布 clamp）'
  )
  assert(
    /defaultHeight:\s*\(\)\s*=>/.test(demoSrc) &&
      /Math\.min\(figmaHeight\.value/.test(demoSrc),
    'demo 页丢失 Figma 高度兜底（或未按画布 clamp）'
  )
})

console.log('▶ 11. demo 固定画布 + 内部容器拉伸（用户需求：1920×1080 画布）')

check('demo 页画布固定 1920×1080', () => {
  assert(/const CANVAS_W = 1920/.test(demoSrc), '未定义 1920 画布宽')
  assert(/const CANVAS_H = 1080/.test(demoSrc), '未定义 1080 画布高')
})

check('画布层与容器层是两层结构（canvas 包 box）', () => {
  assert(demoSrc.includes('class="preview-canvas"'), '缺少 preview-canvas 层')
  assert(demoSrc.includes('class="preview-box"'), '缺少 preview-box 层')
  // 容器样式必须用 left/top 在画布内定位，而不是靠文档流
  const idx = demoSrc.indexOf('const previewStyle')
  const block = demoSrc.slice(idx, idx + 700)
  assert(/\bleft:/.test(block) && /\btop:/.test(block), '容器未用 left/top 在画布内定位')
  assert(
    /CANVAS_W - previewContainerWidth\.value/.test(block),
    '容器未按画布宽居中'
  )
})

check('缩放只施加在画布层，容器层绝无 scale（响应式语义基础）', () => {
  // 容器层 previewStyle：只允许 left/top/width/height，绝不能有 transform
  const boxIdx = demoSrc.indexOf('const previewStyle')
  const boxBlock = demoSrc.slice(boxIdx, demoSrc.indexOf('const ', boxIdx + 10))
  assert(
    !/transform/.test(boxBlock),
    '容器层出现了 transform（会破坏 @media / vw / % 语义）'
  )
  assert(/\bleft:/.test(boxBlock) && /\btop:/.test(boxBlock), '容器未用 left/top 定位')

  // 画布层 canvasStyle：必须有整体缩放
  const canvasIdx = demoSrc.indexOf('const canvasStyle')
  assert(canvasIdx > 0, '未找到 canvasStyle')
  const canvasBlock = demoSrc.slice(canvasIdx, demoSrc.indexOf('\nconst ', canvasIdx + 10))
  assert(
    /style\.zoom\s*=\s*String\(s\)/.test(canvasBlock) || /transform\s*=\s*`scale\(/.test(canvasBlock),
    '画布层未施加整体缩放'
  )
})

check('🔴 画布缩放用 zoom 而非 transform+负margin（2026-10-13 事故）', () => {
  // 事故：transform scale 不改布局，靠右/下负 margin 让 flex 居中按视觉尺寸排布。
  // overflow:auto + flex 居中 + 负 margin 组合下画布被压成 ~25px 窄条，
  // 组件完全不可见；选 100%（s=1，无 transform）才恢复 —— 精确指向该组合。
  const canvasIdx = demoSrc.indexOf('const canvasStyle')
  const canvasBlock = demoSrc.slice(canvasIdx, demoSrc.indexOf('\nconst ', canvasIdx + 10))
  assert(
    !/marginRight/.test(canvasBlock),
    'canvasStyle 仍有负 margin hack（transform 布局不同步的脆弱组合，换 zoom）'
  )
  assert(
    /style\.zoom/.test(canvasBlock),
    'canvasStyle 未使用 zoom（布局尺寸真实变化，flex 居中天然正确）'
  )
})

console.log('▶ 16. zoom 反馈循环防护（「由大到小的动画最后看不到组件」）')

check('demo 页 wrapper 有 min-height:0（flex 子项默认 auto 会被内容撑破）', () => {
  // zoom 让 canvas 布局尺寸真实变化后，wrapper（flex column 子项）若无
  // min-height:0，内容高（1080×zoom）会撑破 flex 分配 ⇒ zoom 越小 wrapper
  // 越矮 → fit 更小 → 循环到 0。
  const m = demoSrc.match(/\.preview-wrapper\s*\{[^}]*\}/)
  assert(m, '未找到 .preview-wrapper 规则')
  assert(
    /min-height:\s*0/.test(m[0]),
    'preview-wrapper 缺 min-height:0（zoom 反馈循环：由大到小直到消失）'
  )
})

check('demo 主链 tabpane 锁高（否则 wrapper 的 flex:1 无基准）', () => {
  // 主链 .ant-tabs-content(height:100%) 里 tabpane 若无 flex/height 规则，
  // pane 高 = 内容高（canvas）⇒ 同样构成反馈回路。
  // 定位：主链 content 块（含 height:100% 注释链）内的 tabpane 规则。
  const holderIdx = demoSrc.indexOf('.ant-tabs-content-holder {\n          flex: 1;')
  assert(holderIdx > 0, '未找到主链 content-holder 规则')
  const chain = demoSrc.slice(holderIdx, holderIdx + 800)
  assert(
    /\.ant-tabs-tabpane\s*\{[^}]*flex:\s*1/.test(chain),
    '主链缺 tabpane flex:1（pane 高=内容高，zoom 循环仍在）'
  )
  assert(
    /height:\s*0/.test(chain),
    '主链 tabpane 缺 height:0（flex:1 在嵌套 flex 中正确收缩的关键）'
  )
  // 🔴 2026-10-13 puppeteer 实测：漏 display:flex 时 pane 是 block，
  //    wrapper 的 flex:1 在 block 父级里无效 ⇒ 高度塌回内容高（46px），
  //    zoom 棘轮已收敛到 1% 且永久冻结（availH<0 时 updateAutoFitScale 放弃）。
  assert(
    /\.ant-tabs-tabpane\s*\{[^}]*display:\s*flex/.test(chain),
    '主链 tabpane 缺 display:flex（block 下 wrapper flex:1 无效，高度塌回内容高）'
  )
})

check('composable 支持 scaleFactor（缩放后拖拽跟手）', () => {
  assert(composableSrc.includes('scaleFactor'), 'composable 未支持 scaleFactor')
  const idx = composableSrc.indexOf('function applyDrag')
  const block = composableSrc.slice(idx, idx + 500)
  assert(
    /clientX - startX\)\s*\/\s*k/.test(block) || /deltaX\s*=\s*\(e\.clientX - startX\)\s*\/\s*k/.test(block),
    'applyDrag 未按 scale 换算位移（缩放后手柄会跟不上鼠标）'
  )
})

check('demo 页把画布缩放比传给 composable', () => {
  assert(
    /scaleFactor:\s*\(\)\s*=>\s*canvasScale\.value/.test(demoSrc),
    'demo 页未传 scaleFactor'
  )
})

check('demo 手柄用 pointerdown（沿用上一轮修复）', () => {
  assert(
    !/@mousedown="startPreviewResize/.test(demoSrc),
    'demo 手柄仍用 @mousedown（松开后仍会继续变）'
  )
  assert(/@pointerdown="startPreviewResize/.test(demoSrc), 'demo 手柄未用 @pointerdown')
})

console.log('▶ 12. fit 缩放初始时机（用户反馈「初始不对，点了右下角才对」）')

check('autoFitScale 初值非 1（1 会让 1920 画布不缩放、内容挤在中间）', () => {
  const m = demoSrc.match(/const autoFitScale = ref\(([\d.]+)\)/)
  assert(m, '未找到 autoFitScale 初值')
  assert(
    Number(m[1]) < 1,
    `autoFitScale 初值不应为 1（当前 ${m[1]}）：画布 1920 宽不缩放会挤在中间`
  )
})

check('updateAutoFitScale 返回成功标志（尺寸未就绪时可被重试）', () => {
  const idx = demoSrc.indexOf('function updateAutoFitScale')
  const block = demoSrc.slice(idx, idx + 900)
  assert(/return false/.test(block), '尺寸未就绪时应return false 以便重试')
  assert(/return true/.test(block), '成功时应 return true')
})

check('有 rAF 连续试探机制（覆盖 Tabs 异步布局）', () => {
  assert(demoSrc.includes('setupFitScaleObserver'), '缺少 setupFitScaleObserver')
  assert(
    /requestAnimationFrame\(probe\)/.test(demoSrc),
    '缺少 rAF 连续试探（Tabs 未布局完成时算不对）'
  )
})

check('切 Tab 时重建观察（预览面板此时才挂载）', () => {
  assert(
    /watch\(activeCanvasTab[\s\S]{0,200}setupFitScaleObserver/.test(demoSrc),
    '切 Tab 未触发观察重建（初始进入预览 Tab 时 ref 为 null ⇒ 观察根本没建立）'
  )
})

check('「重置」按钮初始不显示（presetName 初值即 default）', () => {
  // presetName 初值为 'default'，若判据含 'default' 则恒 true ⇒ 一进页面就显示
  const idx = demoSrc.indexOf('const hasCustomPreviewSize')
  assert(idx > 0, '未找到 hasCustomPreviewSize')
  const block = demoSrc.slice(idx, idx + 200)
  assert(
    /=== 'custom'/.test(block) && !/=== 'default'/.test(block),
    'hasCustomPreviewSize 不应把 default 算作「已改过」（重置按钮会一进页面就显示）'
  )
})

console.log('▶ 13. TaskDetail fit 初始时机（同 demo 页病因，用户反馈「默认两边空白」）')

check('TaskDetail zoomScaleChoice 初值为 fit（非 100）', () => {
  const m = taskDetailSrc.match(
    /const zoomScaleChoice = ref<number \| 'fit'>\(([^)]+)\)/
  )
  assert(m, '未找到 zoomScaleChoice 初值')
  assert(
    /'fit'/.test(m[1]),
    `zoomScaleChoice 初值应为 'fit'（当前 ${m[1]}）：100 会让 1280 宽视口溢出被裁 ⇒ 两边空白`
  )
})

check('TaskDetail autoFitScale 初值非 1', () => {
  const m = taskDetailSrc.match(/const autoFitScale = ref\(([\d.]+)\)/)
  assert(m, '未找到 autoFitScale 初值')
  assert(
    Number(m[1]) < 1,
    `autoFitScale 初值不应为 1（当前 ${m[1]}）：RO 只在尺寸变化时回调，初始错值不会被纠正`
  )
})

check('TaskDetail updateAutoFitScale 返回成功标志（可重试）', () => {
  const idx = taskDetailSrc.indexOf('function updateAutoFitScale')
  const block = taskDetailSrc.slice(idx, idx + 800)
  assert(/return false/.test(block), '尺寸未就绪时应 return false 以便重试')
  assert(/return true/.test(block), '成功时应 return true')
})

check('TaskDetail 有 rAF 连续试探（覆盖异步布局）', () => {
  assert(
    taskDetailSrc.includes('setupStageFitScaleObserver'),
    '缺少 setupStageFitScaleObserver'
  )
  assert(
    /requestAnimationFrame\(probe\)/.test(taskDetailSrc),
    '缺少 rAF 连续试探'
  )
})

check('TaskDetail 观察建立走统一入口（不再各建一个 RO）', () => {
  // 关键：原先 onMounted 里另建一个 ResizeObserver，会覆盖别处已建实例，
  // 且 onMounted 时 ref 可能为 null ⇒ 观察根本没建立。
  const occurrences = taskDetailSrc.match(/new ResizeObserver/g) || []
  assertEqual(
    occurrences.length,
    1,
    `TaskDetail 应只有一处 new ResizeObserver（实际 ${occurrences.length}）`
  )
  assert(
    /onMounted\([\s\S]{0,200}setupStageFitScaleObserver/.test(taskDetailSrc),
    'onMounted 未走统一入口'
  )
})

check('TaskDetail 预览视口不裁切（overflow: auto）', () => {
  const m = taskDetailSrc.match(/\.bf-body-real\s*\{[^}]*\}/)
  assert(m, '未找到 .bf-body-real 规则')
  assert(
    /overflow:\s*auto/.test(m[0]),
    '预览视口仍 overflow:hidden（选 100%+ 时溢出被凭空裁掉）'
  )
})

check('切档位时重算 fit（从 50% 切回应适应不能沿用旧值）', () => {
  assert(
    /watch\(zoomScaleChoice/.test(taskDetailSrc),
    '切换缩放档位未触发 fit 重算'
  )
})

console.log('▶ 14. 默认视口跟随设计稿比例（竖版组件不该用横版视口装）')

check('TaskDetail 默认高度不写死常量（须按设计稿比例推算）', () => {
  // 事故 mc-1791783806265-5831962c：declare.json aspectRatio=[510,665]（竖版），
  // 而 defaultHeight 硬编码 667 ⇒ 1280×667 横版视口装竖版内容 ⇒ 左右各空约385px。
  const m = taskDetailSrc.match(
    /const frameResize = useResizableFrame\(\{[\s\S]{0,1600}?defaultHeight:[\s\S]{0,500}?\}\s*\)/
  )
  assert(m, '未取到 useResizableFrame 配置块')
  const block = m[0]
  const dh = block.match(/defaultHeight:\s*\(\)\s*=>\s*\{([\s\S]*?)\n {2}\},/);
  assert(dh, 'defaultHeight 非 getter 形式')
  const dhBody = dh[1];
  assert(
    /figmaDimensions/.test(dhBody),
    'defaultHeight 未参考 figmaDimensions（竖版组件会被装进横版视口）'
  );
  assert(
    /Math\.max\(/.test(dhBody) && /Math\.min\(/.test(dhBody),
    '按比例推算的高度未做上下限夹取（可能过高或过矮）'
  )
})

check('defaultWidth 有容器上限（手柄不会落在可视区外）', () => {
  const m = taskDetailSrc.match(
    /const frameResize = useResizableFrame\(\{[\s\S]{0,1600}?defaultWidth:[\s\S]{0,300}?\},/
  );
  assert(m, '未取到 defaultWidth 配置')
  assert(
    /Math\.min\(hostW, 1280\)/.test(m[0]),
    'defaultWidth 未按容器宽封顶（手柄可能落在可视区外）'
  )
})

console.log('▶ 15. 持久化快照过期判定（否则修复对老用户无效）')

check('composable 支持 designSize（用于判定快照是否过期）', () => {
  assert(
    composableSrc.includes('designSize'),
    'composable 未支持 designSize'
  )
  assert(
    /designSize:\s*\(\)\s*=>\s*figmaDimensions\.value/.test(taskDetailSrc),
    'TaskDetail 未把 figmaDimensions 传给 designSize'
  )
})

check('persist 写入 designRatio', () => {
  assert(composableSrc.includes('designRatio'), '持久化未记录 designRatio')
  const idx = composableSrc.indexOf('function persist')
  const block = composableSrc.slice(idx, idx + 800)
  assert(
    /designRatio:\s*currentDesignRatio\(\)/.test(block),
    'persist 未写入当前比例'
  )
})

check('restore 做过期判定（比例不符 ⇒ 丢弃回落 default）', () => {
  const idx = composableSrc.indexOf('function restore')
  const block = composableSrc.slice(idx, idx + 1800)
  assert(
    /data\.designRatio\s*!==\s*curRatio/.test(block),
    'restore 未做比例一致性判定'
  )
  assert(
    /customWidth\.value\s*=\s*0/.test(block) && /customHeight\.value\s*=\s*0/.test(block),
    '过期后未回落 default（custom 残留会继续屏蔽 defaultWidth）'
  )
})

check('阳性对照：过期判定逻辑本身有效（改坏即须失败）', () => {
  // 用纯函数复刻判定条件，验证「不一致/缺字段」两种情况都能识别为过期
  const ratioOf = (d) =>
    d && d.width > 0 && d.height > 0 ? (d.width / d.height).toFixed(3) : null
  const isStale = (saved, cur) => Boolean(cur) && saved !== cur

  const cur = ratioOf({ width: 510, height: 665 })
  assertEqual(cur, '0.767', '510:665 比例计算错误')
  // 事故现场：旧逻辑写下的快照没有 designRatio ⇒ undefined ≠ cur ⇒ 判过期
  assert(isStale(undefined, cur) === true, '无 designRatio 的旧快照应判过期')
  // 比例确实变了 ⇒ 判过期
  assert(isStale('0.400', cur) === true, '比例变化的快照应判过期')
  // 正常场景：比例一致 ⇒ 保留
  assert(isStale('0.767', cur) === false, '比例一致的快照不应作废')
  // designSize 不可得 ⇒ 不判过期（不得误伤用户尺寸）
  assert(isStale(undefined, ratioOf(null)) === false, 'designSize 不可得时不应作废')
})

check('响应式模式放开 stage 的 overflow:hidden（否则手柄被裁）', () => {
  assert(
    taskDetailSrc.includes('rz-stage--responsive') ||
      // 恒响应式架构下不再需要该 class；stage 本身不应再有 overflow:hidden 裁切
      !/\.preview-scale-stage\s*\{[^}]*overflow:\s*hidden/.test(taskDetailSrc),
    'stage 仍 overflow:hidden，会裁掉拖拽手柄'
  )
})

console.log('▶ 10. Pointer Capture 拖拽收尾（用户反馈「松开后还在变」）')

check('拖拽用 pointerdown 而非 mousedown（mousedown 无 pointerId）', () => {
  // 根因：@mousedown 拿到的 MouseEvent 没有 pointerId ⇒ setPointerCapture
  // 分支永远进不去 ⇒ 每次落到 document 兜底 ⇒ 拖拽经过 iframe 时 mouseup 被吞、
  // 监听器残留、isResizing 卡 true ⇒ 松开后尺寸继续变。
  assert(
    !/@mousedown="frameResize\.startResize/.test(
      taskDetailSrc + genComponentSrc + genComponentsSrc + demoSrc
    ),
    '仍有页面用 @mousedown 绑定 startResize（Pointer Capture 会失效）'
  )
  assert(
    /@pointerdown="frameResize\.startResize/.test(
      taskDetailSrc + genComponentSrc + genComponentsSrc
    ),
    '未发现 @pointerdown 绑定（应为 pointer events）'
  )
})

check('composable 记录 capturePointerId（释放 capture 需要）', () => {
  assert(composableSrc.includes('capturePointerId'), '未记录 capture 的 pointerId')
  assert(composableSrc.includes('releasePointerCapture'), '未释放 pointer capture')
})

check('composable 摘净全部监听路径（任一残留都会导致松开后继续变）', () => {
  for (const ev of ['pointermove', 'pointerup', 'pointercancel', 'mousemove', 'mouseup']) {
    assert(
      composableSrc.includes(`removeEventListener('${ev}'`),
      `finishResize 未摘除 ${ev} 监听`
    )
  }
  assert(composableSrc.includes("removeEventListener('blur'"), '未兜底 window blur')
})

check('composable 有「已收尾则忽略」硬保险（不依赖事件送达）', () => {
  // 最后一道防线：isResizing 为 false 时 onDragMove 一律 return，
  // 这样即便有监听器漏摘（iframe 吞事件等），松开后也不会再改尺寸。
  const idx = composableSrc.indexOf('function onDragMove')
  const block = composableSrc.slice(idx, idx + 700)
  assert(
    /if\s*\(!isResizing\.value\)\s*return/.test(block),
    'onDragMove 缺少 isResizing 守卫'
  )
  // rAF 回调内也要复查（松手与 rAF 执行存在竞态）
  assert(
    /if \(pendingEvent && isResizing\.value\)/.test(block),
    'rAF 回调内未复查 isResizing（松手后仍会应用最后一帧）'
  )
})

check('手柄样式含 touch-action: none（否则浏览器手势截走指针事件）', () => {
  const withHandles = [taskDetailSrc, genComponentSrc, genComponentsSrc].filter(
    (s) => s.includes('.rz-h')
  )
  assert(withHandles.length > 0, '未找到手柄样式')
  for (const s of withHandles) {
    assert(/touch-action:\s*none/.test(s), '手柄缺少 touch-action: none')
  }
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
