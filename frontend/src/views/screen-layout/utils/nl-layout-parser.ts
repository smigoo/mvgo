// ============================================================
// 大屏布局 · 自然语言 → 布局 DSL 解析器（纯前端，零网络）
// ------------------------------------------------------------
// 目标：把「1920×1080，铺满不变形，左边上下两块右边上下两块，有顶栏」
//       这类一句话，确定性解析成大屏布局 DSL（ScreenLayout）。
//
// 设计原则：
//   1. 只做确定性规则解析，不调任何模型 —— 毫秒级、可解释、可复现。
//   2. 解析不了的维度一律给默认值，绝不追问用户。
//   3. 有歧义不弹窗：生成「主解读 + 备选解读」，用户一键切换。
//   4. 输出「我读到了什么」线索，让用户能核对解析结果。
// ============================================================

import type {
  ScreenLayout,
  ZoneConfig,
  ColumnConfig,
  HeaderFooterConfig,
  FlexConfig,
  OutputScaleMode,
} from '@/types/screen-layout'

// ============================================================
// 适配策略字典（UI 与解析器共用）
// ============================================================

export const FIT_LABELS: Record<OutputScaleMode, string> = {
  fluid: '铺满不变形（骨架弹性）',
  hybrid: '等比 + 弹性混合',
  contain: '整体等比缩放（可能留边）',
  fillWidth: '宽度填满（高度按比例）',
  fillHeight: '高度填满（宽度按比例）',
  none: '不缩放（1:1）',
}

export interface FitOption {
  value: OutputScaleMode
  label: string
  desc: string
  /** 圆在这种策略下的表现，用于效果自测 */
  effect: string
}

export const FIT_OPTIONS: FitOption[] = [
  {
    value: 'fluid',
    label: '铺满不变形',
    desc: '骨架（列宽、间距）弹性伸缩，元素尺寸与文字比例保持',
    effect: '圆始终是圆',
  },
  {
    value: 'hybrid',
    label: '等比 + 弹性',
    desc: '整体先等比缩放到接近目标，再由骨架弹性吸收剩余差额',
    effect: '圆始终是圆，边距略有变化',
  },
  {
    value: 'contain',
    label: '等比缩放留边',
    desc: '整体等比缩放，宽高比不一致时留黑边，内容绝不裁切',
    effect: '圆始终是圆，可能留黑边',
  },
  {
    value: 'fillWidth',
    label: '宽度填满',
    desc: '宽度铺满容器，高度按比例推出去（可能纵向滚动）',
    effect: '圆始终是圆，可能上下裁切',
  },
  {
    value: 'fillHeight',
    label: '高度填满',
    desc: '高度铺满容器，宽度按比例推出去（可能横向滚动）',
    effect: '圆始终是圆，可能左右裁切',
  },
  {
    value: 'none',
    label: '不缩放',
    desc: '按设计稿 1:1 渲染，容器不一致时出现滚动条',
    effect: '圆始终是圆，出现滚动条',
  },
]

// ============================================================
// 通用小工具
// ============================================================

const CN_NUM: Record<string, number> = {
  零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
}

export function toNum(s: string): number | null {
  if (/^\d+$/.test(s)) return parseInt(s, 10)
  if (s in CN_NUM) return CN_NUM[s]
  return null
}

let _uid = 0
function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${(++_uid).toString(36)}`
}

const NUM_PAT = '(\\d+|[一二两三四五六七八九十]+)'
const COL_UNIT = '栏|列'
const ROW_UNIT = '块|个|格|模块|区域|区|行|层|排|部分|卡片|面板'

/** 连接词：把「左（边/各/有/放）两个」这类插入语吃掉 */
const JOINER = '(?:侧|边|面|方|半)?(?:的)?(?:各有|各|分别|都|均|有|是|为|放|放置|放上|摆|包含|包括|分成|分为)?'

// ============================================================
// 1. 基准尺寸
// ============================================================

const SIZE_ALIASES: Array<{ re: RegExp; width: number; height: number; label: string }> = [
  { re: /8\s*k|8k超清/i, width: 7680, height: 2160, label: '8K 超宽' },
  { re: /4\s*k|\buhd\b|超高清/i, width: 3840, height: 2160, label: '4K UHD' },
  { re: /2\s*k|\bqhd\b/i, width: 2560, height: 1440, label: '2K QHD' },
  { re: /1080\s*p|\bfhd\b|全高清/i, width: 1920, height: 1080, label: '1080P FHD' },
  { re: /带鱼屏|超宽带|ultrawide|uwqhd/i, width: 3440, height: 1440, label: '带鱼屏 UWQHD' },
]

export interface SizeParse {
  width: number
  height: number
  /** 命中的原文片段；null 表示用了默认值 */
  clue: string | null
}

export function parseSize(text: string): SizeParse {
  // ① 显式 WxH：1920x1080 / 1920×1080 / 1920*1080
  const m1 = text.match(/(\d{3,5})\s*[x×*✕X]\s*(\d{3,5})/)
  if (m1) {
    const w = parseInt(m1[1], 10)
    const h = parseInt(m1[2], 10)
    if (w >= 320 && h >= 240) return { width: w, height: h, clue: `${w}×${h}` }
  }
  // ② 连写数字：19201080 / 1920 1080
  const m2 = text.match(/(?:^|[^\d])(\d{4})\s*(\d{4})(?:[^\d]|$)/)
  if (m2) {
    const w = parseInt(m2[1], 10)
    const h = parseInt(m2[2], 10)
    if (w >= 800 && h >= 600) return { width: w, height: h, clue: `${w}×${h}` }
  }
  // ③ 档位别名
  for (const a of SIZE_ALIASES) {
    if (a.re.test(text)) return { width: a.width, height: a.height, clue: a.label }
  }
  return { width: 1920, height: 1080, clue: null }
}

// ============================================================
// 2. 适配策略
// ============================================================

export interface FitParse {
  fit: OutputScaleMode
  label: string
  warning?: string
  clue: string | null
}

export function parseFitMode(text: string): FitParse {
  const t = text
  // 先剥掉否定短语，避免「不拉伸」「不变形」被下游的 /拉伸/ 误捕
  const positive = t.replace(/不拉伸|不变形|不压缩|不变型/g, '')

  // 「铺满不变形」是用户最常说的目标，但要和裸「拉伸」区分开，必须排在最前
  if (/铺满.{0,6}(不变形|不拉伸)|(不变形|不拉伸).{0,6}铺满|弹性(伸展|伸缩|布局)|流式/i.test(t)) {
    return { fit: 'fluid', label: FIT_LABELS.fluid, clue: '铺满不变形' }
  }
  if (/等比|保持比例|按比例|留黑边|黑边|letterbox|不裁切|完整显示/i.test(t)) {
    return { fit: 'contain', label: FIT_LABELS.contain, clue: '等比缩放' }
  }
  if (/适应宽度|填充宽度|宽度自适应|只填宽|宽度铺满|宽度撑满|宽度填满/.test(t)) {
    return { fit: 'fillWidth', label: FIT_LABELS.fillWidth, clue: '宽度自适应' }
  }
  if (/适应高度|填充高度|高度自适应|只填高|高度铺满|高度撑满|高度填满/.test(t)) {
    return { fit: 'fillHeight', label: FIT_LABELS.fillHeight, clue: '高度自适应' }
  }
  if (/不缩放|原始尺寸|1\s*[:：]\s*1/.test(t)) {
    return { fit: 'none', label: FIT_LABELS.none, clue: '不缩放' }
  }
  // 到这还没被否定短语挡掉，才说明用户确实说了「拉伸」
  // ⚠️ 刻意不映射到 hybrid：hybrid 的语义是「等比 + 弹性混合」（圆仍是圆），
  //    拿一个"不变形"的枚举去承载"会变形"的诉求，会让下游按 hybrid 语义理解时被误导。
  //    DSL 里没有、也不打算提供「非等比拉伸」，所以一律按 fluid 生成 + 明确告知差异。
  if (/拉伸|拉满|拉扁|扯满|撑变形/.test(positive)) {
    return {
      fit: 'fluid',
      label: `${FIT_LABELS.fluid}（原话是「拉伸」，已按不变形处理）`,
      warning: '「拉伸」会让圆形变椭圆、文字被压扁，所以没有按拉伸生成，已改为「铺满不变形」。若确实想看拉伸效果，打开「自适应预览」里的「非等比拉伸 · 反面教材」开关。',
      clue: '拉伸',
    }
  }
  if (/铺满|充满|填满|自适应|响应式|适配|全屏/.test(t)) {
    return { fit: 'fluid', label: FIT_LABELS.fluid, clue: '自适应' }
  }
  return { fit: 'fluid', label: `${FIT_LABELS.fluid}（默认）`, clue: null }
}

// ============================================================
// 3. 头 / 尾
// ============================================================

export interface HfParse {
  header: boolean
  footer: boolean
}

export function parseHeaderFooter(text: string): HfParse {
  const headerRe = /顶栏|顶部栏|头顶栏|头部|标题栏|导航栏|上导航|页头|\bheader\b/
  const footerRe = /底栏|底部栏|页脚|页底|状态栏|\bfooter\b/
  const noHeaderRe = /(不要|不需要|无|没有|去掉|去掉|移除)\s*(顶栏|顶部栏|头部|标题栏|导航栏)/
  const noFooterRe = /(不要|不需要|无|没有|去掉|移除)\s*(底栏|底部栏|页脚|状态栏)/

  const header = noHeaderRe.test(text) ? false : headerRe.test(text)
  const footer = noFooterRe.test(text) ? false : footerRe.test(text)
  return { header, footer }
}

// ============================================================
// 4. 结构：方位 → 列 / 行
// ============================================================

interface SideSpec {
  /** 该侧垂直列数（来自「N 栏 / N 列」） */
  cols?: number
  /** 该侧堆叠块数（来自「N 块 / N 个 / N 个区域」） */
  rows?: number
}

function scanSide(text: string, words: string[]): SideSpec {
  const alt = words.join('|')
  const spec: SideSpec = {}

  const colRe = new RegExp(`(?:${alt})${JOINER}\\s*${NUM_PAT}\\s*(?:${COL_UNIT})`)
  const rowRe = new RegExp(
    `(?:${alt})${JOINER}(?:上下|竖向|纵向|垂直|上中下)?\\s*${NUM_PAT}\\s*(?:${ROW_UNIT})`,
  )

  const mc = text.match(colRe)
  if (mc) {
    const n = toNum(mc[1])
    if (n !== null && n >= 1 && n <= 12) spec.cols = n
  }
  const mr = text.match(rowRe)
  if (mr) {
    const n = toNum(mr[1])
    if (n !== null && n >= 1 && n <= 12) spec.rows = n
  }
  return spec
}

/** 「左右各 N 栏」「两侧分别 N 列」 */
export function scanBothSides(text: string): number | null {
  const re = new RegExp(`(?:左右|两边|两侧|双侧)${JOINER}\\s*${NUM_PAT}\\s*(?:${COL_UNIT})`)
  const m = text.match(re)
  if (!m) return null
  const n = toNum(m[1])
  return n !== null && n >= 1 && n <= 12 ? n : null
}

/** 不带方位的总列数，如「三栏」「4 列」 */
export function scanTotalColumns(text: string): number | null {
  const m = text.match(/(\d+|[一二两三四五六七八九十]+)\s*(?:栏|列)/)
  if (!m) return null
  const n = toNum(m[1])
  return n !== null && n >= 1 && n <= 12 ? n : null
}

/** 「上下各 N 块」这类没有左右修饰的纵向分块 */
export function scanBareRows(text: string): number | null {
  const m = text.match(/(?:上下|竖向|纵向|垂直)(?:各有|各|分别|都|均|有|是|为)?\s*(\d+|[一二两三四五六七八九十]+)\s*(?:块|个|格|区域|区|行|层|排|部分)/)
  if (!m) return null
  const n = toNum(m[1])
  return n !== null && n >= 1 && n <= 12 ? n : null
}

/** 间距，如「间距 16px」 */
export function scanGap(text: string): string {
  const m = text.match(/间距\s*(\d+)\s*(?:px)?|gap\s*(\d+)/i)
  if (m) {
    const n = parseInt(m[1] || m[2], 10)
    if (n > 0 && n <= 64) return `${n}px`
  }
  return '8px'
}

// ============================================================
// 4b. 列宽权重 / M×N 网格 / 头尾高度
//     —— 这三项决定「同样的列数，看起来是不是同一张图」，缺一个都会让
//        用户觉得「跟我说的不一样」。
// ============================================================

/**
 * 列宽权重。支持四种说法，按可靠度从高到低匹配：
 *   ① 显式比例     「比例 1:2:1」「宽度比 2:1」
 *   ② 裸三段比例   「1:2:1」（至少两段冒号，避开 1:1 的「不缩放」语义）
 *   ③ 左右配比     「左 1 右 2」
 *   ④ 自然语言     「左窄右宽」「左边窄一点」
 * 返回 null 表示没读到 —— 由调用方按等宽处理。
 */
export function scanWeights(text: string): number[] | null {
  const NUM = '(\\d+(?:\\.\\d+)?)'

  // ① 显式比例
  const explicit = text.match(
    new RegExp(`(?:比例|占比|宽度比|列宽比|权重)\\s*[:：]?\\s*${NUM}(?:\\s*[:：]\\s*${NUM})+`),
  )
  if (explicit) {
    const arr = (explicit[0].match(/\d+(?:\.\d+)?/g) || []).map(Number)
    if (arr.length >= 2 && arr.every(n => n > 0 && isFinite(n))) return arr
  }

  // ② 裸三段比例（要求 ≥3 段，避免和「1:1 不缩放」「1920:1080」混淆）
  const bare = text.match(
    /(?:^|[^\d.])(\d+(?:\.\d+)?\s*[:：]\s*\d+(?:\.\d+)?\s*[:：]\s*\d+(?:\.\d+)?)(?:[^\d]|$)/,
  )
  if (bare) {
    const arr = bare[1].split(/[:：]/).map(s => parseFloat(s.trim()))
    if (arr.length >= 3 && arr.every(n => n > 0 && isFinite(n))) return arr
  }

  // ③ 左 X 右 Y
  const lr = text.match(
    /左\s*(?:边|侧|面|方)?\s*(?:占|是|为)?\s*(\d+(?:\.\d+)?)\s*[，,、]?\s*右\s*(?:边|侧|面|方)?\s*(?:占|是|为)?\s*(\d+(?:\.\d+)?)(?![0-9])/,
  )
  if (lr) {
    const a = parseFloat(lr[1])
    const b = parseFloat(lr[2])
    if (a > 0 && b > 0 && isFinite(a) && isFinite(b)) return [a, b]
  }

  // ④ 自然语言（窄 ←→ 宽 的反义表达）
  const NARROW = '(?:窄|小|短|细|少)'
  const WIDE = '(?:宽|大|长|粗|多)'
  if (new RegExp(`左(?:边|侧|面|方)?\\s*${NARROW}`).test(text)) return [1, 2]
  if (new RegExp(`右(?:边|侧|面|方)?\\s*${NARROW}`).test(text)) return [2, 1]
  if (new RegExp(`左(?:边|侧|面|方)?\\s*${WIDE}`).test(text)) return [2, 1]
  if (new RegExp(`(?:中间|中列|中央)\\s*${WIDE}`).test(text)) return [1, 2, 1]

  return null
}

/** 把权重组对齐到列数：长了截断，短了补 1，空则全 1 */
export function fitWeights(weights: number[] | null, colCount: number): number[] {
  const n = Math.max(1, colCount)
  if (!weights || !weights.length) return new Array(n).fill(1)
  if (weights.length === n) return weights.slice()
  if (weights.length > n) return weights.slice(0, n)
  return weights.concat(new Array(n - weights.length).fill(1))
}

export interface GridParse {
  rows: number
  cols: number
}

/**
 * M×N 网格。三种说法：
 *   ① 「3 行 4 列」  ② 「4 列 3 行」  ③ 「4×3 网格」（需带网格关键词，且按「列×行」理解）
 * 上限制 12 —— 网格维度超过 12 基本是别的东西被误读（如 1920×1080）。
 */
export function scanGrid(text: string): GridParse | null {
  const N = '(\\d{1,2}|[一二两三四五六七八九十]+)'
  const ok = (r: number | null, c: number | null): GridParse | null =>
    r !== null && c !== null && r >= 1 && r <= 12 && c >= 1 && c <= 12 ? { rows: r, cols: c } : null

  // ①「N 行 M 列」
  const m1 = text.match(new RegExp(`${N}\\s*(?:行)\\s*(?:[×x*]\\s*)?${N}\\s*(?:列)`))
  if (m1) return ok(toNum(m1[1]), toNum(m1[2]))

  // ②「M 列 N 行」
  const m2 = text.match(new RegExp(`${N}\\s*(?:列)\\s*(?:[×x*]\\s*)?${N}\\s*(?:行)`))
  if (m2) return ok(toNum(m2[2]), toNum(m2[1]))

  // ③「M×N 网格」—— 有「网格」字样才敢按 × 解析
  if (/网格|栅格|格子|卡片墙/.test(text)) {
    const m3 = text.match(
      new RegExp(`(?:^|[^\\d])(\\d{1,2}|[一二两三四五六七八九十]+)\\s*[×x*]\\s*(\\d{1,2}|[一二两三四五六七八九十]+)(?=[^\\d]|$)`),
    )
    if (m3) return ok(toNum(m3[2]), toNum(m3[1])) // 列 × 行
  }

  return null
}

/**
 * 头 / 尾栏高度。
 * 带 px 的说法最可信（「顶栏 100px」）；裸数字只在 24~300 之间才认，
 * 避免把「有顶栏和底栏，1920×1080」这种句子里的 1920 误读成高度。
 */
export function scanHFHeight(text: string, kind: 'header' | 'footer'): string | null {
  const words =
    kind === 'header'
      ? ['顶栏', '顶部栏', '头顶栏', '头部', '标题栏', '导航栏', '页头']
      : ['底栏', '底部栏', '页脚', '页底', '状态栏']
  const alt = words.join('|')

  const m1 = text.match(new RegExp(`(?:${alt})[^0-9]{0,8}?(\\d{1,4})\\s*(?:px|像素)`))
  if (m1) {
    const n = parseInt(m1[1], 10)
    if (n >= 20 && n <= 600) return `${n}px`
  }

  const m2 = text.match(new RegExp(`(?:${alt})[^0-9]{0,6}?(\\d{2,3})(?![0-9])`))
  if (m2) {
    const n = parseInt(m2[1], 10)
    if (n >= 24 && n <= 300) return `${n}px`
  }

  return null
}

// ============================================================
// 5. 形状 → ScreenLayout
// ============================================================

interface Shape {
  /** 每列的 fr 值 */
  columns: number[]
  /** 每列内上下堆叠几个 zone */
  zonesPerColumn: number
}

interface ShapeCandidate {
  key: string
  label: string
  hint: string
  shape: Shape
}

function buildFlexConfig(direction: 'row' | 'column', gap: string): FlexConfig {
  return { direction, gap, wrap: false, justify: 'flex-start', align: 'stretch' }
}

export function createMiddleZone(colIndex: number, gap: string): ZoneConfig {
  return {
    id: uid('zone'),
    colIndex,
    contentAlign: { vertical: 'stretch', horizontal: 'stretch' },
    padding: { top: gap, right: gap, bottom: gap, left: gap },
    zIndex: 'middle',
    offset: { left: '0', right: '0' },
    layoutMode: 'flex',
    contentType: 'components',
    gridConfig: { cols: 12, rowHeight: 8, components: [] },
    flexConfig: buildFlexConfig('column', gap),
  }
}

interface BuildSpec {
  name: string
  width: number
  height: number
  shape: Shape
  header: boolean
  footer: boolean
  fit: OutputScaleMode
  gap: string
  /** 自定义顶栏高度（如「顶栏 100px」），未指定则 70px */
  headerHeight?: string
  /** 自定义底栏高度（如「底栏 60px」），未指定则 50px */
  footerHeight?: string
}

function buildLayout(spec: BuildSpec): ScreenLayout {
  const columns: ColumnConfig[] = spec.shape.columns.map(fr => ({
    id: uid('col'),
    width: `${fr}fr`,
    resizable: true,
    collapsible: false,
    defaultCollapsed: false,
    collapsedWidth: '0fr',
  }))

  const zones: ZoneConfig[] = []
  columns.forEach((_, ci) => {
    for (let r = 0; r < spec.shape.zonesPerColumn; r++) {
      zones.push(createMiddleZone(ci, spec.gap))
    }
  })

  const header: HeaderFooterConfig | null = spec.header
    ? {
        enabled: true,
        height: spec.headerHeight || '70px',
        backgroundColor: 'rgba(20,30,80,0.9)',
        innerLayout: 'grid',
        gridCols: 1,
        components: [],
      }
    : null

  const footer: HeaderFooterConfig | null = spec.footer
    ? {
        enabled: true,
        height: spec.footerHeight || '50px',
        backgroundColor: 'rgba(0,0,0,0.2)',
        innerLayout: 'grid',
        gridCols: 1,
        components: [],
      }
    : null

  return {
    id: uid('layout'),
    name: spec.name,
    canvas: {
      width: spec.width,
      height: spec.height,
      aspectRatioLocked: true,
      aspectRatio: +(spec.width / spec.height).toFixed(4),
      outputScaleMode: spec.fit,
      backgroundColor: '#ffffff',
      showGrid: true,
      gridSize: 20,
      snapToGrid: false,
      editorZoom: 1,
    },
    header,
    body: { columns, zones },
    footer,
  }
}

function aspectLabel(w: number, h: number): string {
  const ar = w / h
  if (Math.abs(ar - 16 / 9) < 0.02) return '16:9'
  if (Math.abs(ar - 21 / 9) < 0.05) return '21:9'
  if (Math.abs(ar - 32 / 9) < 0.06) return '32:9'
  if (Math.abs(ar - 4 / 3) < 0.02) return '4:3'
  return ar.toFixed(2)
}

function describe(spec: BuildSpec): string[] {
  const lines: string[] = []
  const { shape } = spec
  const n = shape.columns.length

  lines.push(`画布 ${spec.width}×${spec.height}（${aspectLabel(spec.width, spec.height)}）`)
  lines.push(spec.header ? `顶栏 ${spec.headerHeight || '70px'}` : '无顶栏')

  const equal = shape.columns.every(v => v === shape.columns[0])
  // 比例不是全等宽时，把权重原样写出来 —— 用户一眼能核对「左窄右宽」有没有被理解
  const widthNote = equal ? '（等宽）' : `（宽度 ${shape.columns.map(v => +v.toFixed(2)).join(' : ')}）`
  if (shape.zonesPerColumn <= 1) {
    lines.push(`主体 ${n} 列并排${widthNote}`)
  } else {
    lines.push(`主体 ${n} 列 × 每列上下 ${shape.zonesPerColumn} 块（共 ${n * shape.zonesPerColumn} 个区域）${widthNote}`)
  }

  lines.push(spec.footer ? `底栏 ${spec.footerHeight || '50px'}` : '无底栏')
  lines.push(`自适应：${FIT_LABELS[spec.fit]}`)
  return lines
}

// ============================================================
// 6. 主入口
// ============================================================

export interface LayoutCandidate {
  key: string
  label: string
  hint: string
  layout: ScreenLayout
  structure: string[]
}

export interface ParsedClue {
  label: string
  value: string
}

export interface NlParseResult {
  raw: string
  fit: OutputScaleMode
  fitLabel: string
  fitWarning?: string
  candidates: LayoutCandidate[]
  clues: ParsedClue[]
  warnings: string[]
}

/** 解析一句话 → 布局候选 */
export function parseLayoutPrompt(raw: string): NlParseResult {
  const text = (raw || '').trim()
  const warnings: string[] = []
  const clues: ParsedClue[] = []

  // ── 尺寸 ──
  const size = parseSize(text)
  clues.push({
    label: '基准尺寸',
    value: size.clue ? `${size.clue} → ${size.width}×${size.height}` : `${size.width}×${size.height}（默认）`,
  })
  if (!size.clue) {
    warnings.push('没读到基准分辨率，先按 1920×1080 处理 —— 可以在左侧「画布设置」里改。')
  }

  // ── 适配 ──
  const fitInfo = parseFitMode(text)
  clues.push({ label: '自适应', value: fitInfo.label })
  if (fitInfo.warning) warnings.push(fitInfo.warning)

  // ── 头尾 ──
  const hf = parseHeaderFooter(text)
  const hfText = [
    hf.header ? `有顶栏${scanHFHeight(text, 'header') ? ` ${scanHFHeight(text, 'header')}` : ''}` : '无顶栏',
    hf.footer ? `有底栏${scanHFHeight(text, 'footer') ? ` ${scanHFHeight(text, 'footer')}` : ''}` : '无底栏',
  ].join(' · ')
  clues.push({ label: '顶栏 / 底栏', value: hfText })

  // ── 结构 ──
  const left = scanSide(text, ['左'])
  const right = scanSide(text, ['右'])
  const center = scanSide(text, ['中间', '中'])
  const bothCols = scanBothSides(text)
  const totalCols = scanTotalColumns(text)
  const bareRows = scanBareRows(text)
  const gap = scanGap(text)
  const grid = scanGrid(text)
  const weights = scanWeights(text)
  const headerHeight = scanHFHeight(text, 'header') || undefined
  const footerHeight = scanHFHeight(text, 'footer') || undefined

  clues.push({ label: '间隙', value: gap })
  if (grid) clues.push({ label: '网格', value: `${grid.cols} 列 × ${grid.rows} 行` })
  if (weights) clues.push({ label: '列宽比例', value: weights.join(' : ') })

  const rowsFromSides = Math.max(left.rows || 0, right.rows || 0, center.rows || 0, bareRows || 0)

  let primary: ShapeCandidate
  let alternative: ShapeCandidate | null = null

  const hasColumnCue = !!bothCols || !!left.cols || !!right.cols || !!center.cols

  if (grid) {
    // M×N 网格是最明确的意图，优先级最高 —— 命中「3 行 4 列」就不必再猜「栏」是横是纵
    primary = {
      key: 'grid',
      label: `${grid.cols} 列 × ${grid.rows} 行`,
      hint: '按「N 行 M 列」网格理解：M 列并排，每列纵向 M 块',
      shape: { columns: fitWeights(weights, grid.cols), zonesPerColumn: grid.rows },
    }
  } else if (hasColumnCue) {
    let n: number
    if (bothCols) {
      n = bothCols * 2
    } else if (left.cols && right.cols) {
      n = left.cols + right.cols + (center.cols || 0)
    } else {
      n = (left.cols || 0) + (right.cols || 0) + (center.cols || 0)
    }
    n = Math.max(1, Math.min(12, n))

    const zones = rowsFromSides || 1
    primary = {
      key: 'columns',
      label: `${n} 列并排`,
      hint: '把「栏 / 列」理解为垂直分列',
      shape: { columns: fitWeights(weights, n), zonesPerColumn: zones },
    }

    // 备选：把「栏」理解成左右两大区，每区内部上下分块
    const altZones = Math.max(2, Math.ceil(n / 2))
    if (zones !== altZones || n !== 2) {
      alternative = {
        key: 'stacked',
        label: `左右两栏，每栏上下 ${altZones} 块`,
        hint: '把「栏」理解为左右两大区，区内再纵向分块',
        shape: { columns: fitWeights(weights, 2), zonesPerColumn: altZones },
      }
    }
    // 主备形状完全一致时，去掉无意义的备选
    if (alternative && alternative.shape.columns.length === n && alternative.shape.zonesPerColumn === zones) {
      alternative = null
    }
  } else if (rowsFromSides > 1) {
    primary = {
      key: 'stacked',
      label: `左右两栏，每栏上下 ${rowsFromSides} 块`,
      hint: '按「左右 + 上下 N 块」理解为两列纵向分块',
      shape: { columns: fitWeights(weights, 2), zonesPerColumn: rowsFromSides },
    }
    alternative = {
      key: 'columns',
      label: `${rowsFromSides * 2} 列并排`,
      hint: '把每一块都理解成独立的列',
      shape: { columns: fitWeights(weights, rowsFromSides * 2), zonesPerColumn: 1 },
    }
  } else {
    const n = totalCols || 3
    primary = {
      key: 'columns',
      label: n > 1 ? `${n} 列并排` : '单列',
      hint: n > 1 ? '按「N 栏 / N 列」等分' : '未读到分区信息，先给单列骨架',
      shape: { columns: fitWeights(weights, Math.max(1, Math.min(12, n))), zonesPerColumn: 1 },
    }
    if (!totalCols && !hasColumnCue) {
      warnings.push('没读到分区方式，先给了一个 3 列骨架 —— 可以直接在画布上拖列宽、加区域。')
    }
  }

  const toCandidate = (c: ShapeCandidate): LayoutCandidate => {
    const spec: BuildSpec = {
      name: c.label,
      width: size.width,
      height: size.height,
      shape: c.shape,
      header: hf.header,
      footer: hf.footer,
      fit: fitInfo.fit,
      gap,
      headerHeight,
      footerHeight,
    }
    return {
      key: c.key,
      label: c.label,
      hint: c.hint,
      layout: buildLayout(spec),
      structure: describe(spec),
    }
  }

  clues.push({
    label: '主体结构',
    value: primary.label,
  })

  const candidates = [toCandidate(primary)]
  if (alternative) candidates.push(toCandidate(alternative))

  return {
    raw,
    fit: fitInfo.fit,
    fitLabel: fitInfo.label,
    fitWarning: fitInfo.warning,
    candidates,
    clues,
    warnings,
  }
}

// ============================================================
// 7. 示例输入（UI 引导用）
// ============================================================

export const PROMPT_EXAMPLES: string[] = [
  '1920×1080，铺满不变形，左边上下两块右边上下两块，有顶栏',
  '1920 1080 做成自适应，左边两栏右边两栏',
  '4K 大屏，等比缩放，左中右三栏，有顶栏和底栏',
  '2560×1440，宽度填满，左右各两栏，有底栏',
]
