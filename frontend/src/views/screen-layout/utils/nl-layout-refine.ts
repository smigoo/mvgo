// ============================================================
// 大屏布局 · 增量修改（refine）
// ------------------------------------------------------------
// 「一句话生成」只解决从零到有；真正干活时用户是**改**布局，不是重来一遍。
// 这个模块让用户能在已应用的布局上继续说：
//     顶栏改 100px / 改成三栏 / 左边窄一点 / 每列 3 块 /
//     间距 16px / 去掉左边那块 / 改成等比缩放 / 换成 4K
//
// 契约：
//   · 纯函数，绝不就地修改入参（deep copy 后再改）—— 否则撤销栈会串味。
//   · 一句话可以含多个指令，按固定顺序累积应用（结构类优先于样式类）。
//   · 一个都没命中时返回 ok:false + hint，绝不静默吞掉用户的输入。
//   · 结构变化后仍保证 zones[].colIndex 合法（不产生悬挂引用）。
// ============================================================

import type {
  ScreenLayout,
  ColumnConfig,
  ZoneConfig,
  HeaderFooterConfig,
} from '@/types/screen-layout'
import {
  parseSize,
  parseFitMode,
  scanWeights,
  scanGrid,
  scanBothSides,
  scanTotalColumns,
  scanBareRows,
  scanHFHeight,
  fitWeights,
  createMiddleZone,
  toNum,
  FIT_LABELS,
} from './nl-layout-parser'

// ============================================================
// 词表
// ============================================================

const HEADER_WORD = '顶栏|顶部栏|头顶栏|头部|标题栏|导航栏|页头'
const FOOTER_WORD = '底栏|底部栏|页脚|页底|状态栏'
const DEL_VERB = '去掉|删除|移除|不要|取消|去除|拿掉|干掉|删掉'
const ADD_VERB = '加|增加|添加|追加|补|来|要'
/** 区域单位（刻意不含「个」——「加个底栏」的「个」不是区域单位） */
const ZONE_UNIT = '块|区域|卡片|面板'
const SIDE_WORD = '左|右|中间|中'

/** 适配策略意图的守卫：parseFitMode 有「永远返回一个值」的兜底，必须先确认用户真的提了策略 */
const FIT_CUE =
  /铺满|充满|填满|自适应|响应式|适配|全屏|等比|保持比例|按比例|留黑边|黑边|不裁切|完整显示|拉伸|拉满|不缩放|原始尺寸|适应宽度|适应高度|宽度铺满|高度铺满/

const GAP_CUE = /间距|间隙|留白|\bgap\b/i

type Scope = 'left' | 'right' | 'center' | 'all'

export interface RefineResult {
  /** 是否真的改动了布局 */
  ok: boolean
  /** 改动后的新布局（ok 为 false 时不存在） */
  layout?: ScreenLayout
  /** 人类可读的变更清单 */
  changes: string[]
  /** 没听懂时的引导 */
  hint?: string
}

export const REFINE_EXAMPLES: string[] = [
  '顶栏改 100px',
  '改成三栏',
  '左边窄一点',
  '每列 3 块',
  '间距 16px',
  '去掉左边那块',
  '改成等比缩放',
]

// ============================================================
// 小工具
// ============================================================

let _rid = 0
function rid(prefix: string): string {
  return `${prefix}-r${Date.now().toString(36)}-${(++_rid).toString(36)}`
}

function clampCols(n: number): number {
  return Math.max(1, Math.min(12, Math.round(n)))
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

function mkColumn(fr: number): ColumnConfig {
  return {
    id: rid('col'),
    width: `${fr}fr`,
    resizable: true,
    collapsible: false,
    defaultCollapsed: false,
    collapsedWidth: '0fr',
  }
}

function mkHF(kind: 'header' | 'footer', height: string): HeaderFooterConfig {
  return {
    enabled: true,
    height,
    backgroundColor: kind === 'header' ? 'rgba(20,30,80,0.9)' : 'rgba(0,0,0,0.2)',
    innerLayout: 'grid',
    gridCols: 1,
    components: [],
  }
}

/** 从「左/右/中间」词得到列索引；all 表示全部列 */
function scopeToCols(scope: Scope, colCount: number): number[] {
  switch (scope) {
    case 'left':
      return [0]
    case 'right':
      return [colCount - 1]
    case 'center':
      return [Math.floor((colCount - 1) / 2)]
    default:
      return Array.from({ length: colCount }, (_, i) => i)
  }
}

function parseScope(raw: string | undefined): Scope {
  if (!raw) return 'all'
  if (/^左右|^两边|^两侧/.test(raw)) return 'all'
  if (/^左/.test(raw)) return 'left'
  if (/^右/.test(raw)) return 'right'
  if (/^中/.test(raw)) return 'center'
  return 'all'
}

// ============================================================
// 各条规则
// ============================================================

/** 「左边改成 3 块」「每列 3 块」「上下分 4 块」→ 目标块数 + 作用范围 */
function scanRowCount(cmd: string): { rows: number; scope: Scope } | null {
  const UNIT = '块|个|格|区域|区|行|层|排|部分'
  const m = cmd.match(
    new RegExp(
      `(左右|两边|两侧|每列|每栏|各列|各栏|上下|竖向|纵向|垂直|左|右|中间|中)?` +
        `[^0-9，,。;；]{0,6}?(\\d+|[一二两三四五六七八九十]+)\\s*(?:${UNIT})`,
    ),
  )
  if (!m) return null
  const n = toNum(m[2])
  if (n === null || n < 1 || n > 12) return null
  return { rows: n, scope: parseScope(m[1]) }
}

/** 单块区域的增删：返回被操作的列索引 + 动作 */
function scanZoneOp(rest: string): { scope: Scope; action: 'add' | 'del' } | null {
  const del = new RegExp(
    `(?:${DEL_VERB})\\s*(${SIDE_WORD})?(?:边|侧)?\\s*(?:那|这|最后|最下面|最上面)?\\s*(?:一)?\\s*(?:${ZONE_UNIT})`,
  )
  const add = new RegExp(
    `(?:${ADD_VERB})(?:上|一)?\\s*(?:个|块)?\\s*(${SIDE_WORD})?(?:边|侧)?\\s*(?:${ZONE_UNIT})`,
  )
  if (del.test(rest)) return { scope: parseScope(rest.match(del)![1]), action: 'del' }
  if (add.test(rest)) return { scope: parseScope(rest.match(add)![1]), action: 'add' }
  return null
}

/** 重建列（增删列 + 应用权重），并把越界 zone 迁到最后一列 */
function rebuildColumns(layout: ScreenLayout, nextN: number, weights: number[] | null, changes: string[]): void {
  const old = layout.body.columns
  const w = fitWeights(weights, nextN)
  const next: ColumnConfig[] = []
  for (let i = 0; i < nextN; i++) {
    next.push(old[i] ? { ...old[i], width: `${w[i]}fr` } : mkColumn(w[i]))
  }
  layout.body.columns = next
  // 被裁掉的列上的区域迁到最后一列 —— 宁可挤一挤，也不静默丢用户拖进去的组件
  let migrated = 0
  for (const z of layout.body.zones) {
    if (z.colIndex >= nextN) {
      z.colIndex = nextN - 1
      migrated++
    }
  }
  changes.push(`列数 → ${nextN} 列${weights ? `（宽度 ${w.join(' : ')}）` : ''}`)
  if (migrated) changes.push(`${migrated} 个区域已迁到最后一列（原有配置保留）`)
}

/** 应用列宽权重（列数不变时） */
function applyWeights(layout: ScreenLayout, weights: number[], changes: string[]): void {
  const n = layout.body.columns.length
  const w = fitWeights(weights, n)
  if (layout.body.columns.every((c, i) => c.width === `${w[i]}fr`)) return
  layout.body.columns.forEach((c, i) => {
    c.width = `${w[i]}fr`
  })
  changes.push(`列宽 → ${w.join(' : ')}`)
}

/** 调整区域块数 */
function applyRows(layout: ScreenLayout, rows: number, scope: Scope, gap: string, changes: string[]): void {
  const colIdx = layout.body.columns.map((_, i) => i)
  const targets = scopeToCols(scope, colIdx.length)
  let added = 0
  let removed = 0

  for (const ci of targets) {
    const mine = layout.body.zones.filter((z) => z.colIndex === ci)
    if (mine.length > rows) {
      const drop = new Set(mine.slice(rows).map((z) => z.id))
      layout.body.zones = layout.body.zones.filter((z) => !drop.has(z.id))
      removed += drop.size
    } else {
      for (let k = mine.length; k < rows; k++) {
        layout.body.zones.push(createMiddleZone(ci, gap))
        added++
      }
    }
  }

  const scopeText = scope === 'all' ? '每列' : scope === 'left' ? '左列' : scope === 'right' ? '右列' : '中列'
  if (added || removed) {
    changes.push(`区域 → ${scopeText} ${rows} 块（新增 ${added}，移除 ${removed}）`)
  }
}

/** 间距同步到所有区域（含嵌套子区域） */
function applyGap(layout: ScreenLayout, gap: string): void {
  const walk = (zones: ZoneConfig[]) => {
    for (const z of zones) {
      z.padding = { top: gap, right: gap, bottom: gap, left: gap }
      if (z.children?.length) walk(z.children)
    }
  }
  walk(layout.body.zones)
}

/** 单个区域的增删 */
function applyZoneOp(layout: ScreenLayout, op: { scope: Scope; action: 'add' | 'del' }, gap: string, changes: string[]): void {
  const colCount = layout.body.columns.length
  const targets = scopeToCols(op.scope, colCount)
  const scopeText = op.scope === 'all' ? '末列' : op.scope === 'left' ? '左列' : op.scope === 'right' ? '右列' : '中列'

  if (op.action === 'del') {
    // 删「最后一个」：视觉上最直观的那块
    const ci = targets[targets.length - 1]
    const mine = layout.body.zones.filter((z) => z.colIndex === ci)
    if (mine.length <= 1) {
      changes.push(`没删：${scopeText}只剩 1 块，再删这一列就空了`)
      return
    }
    const victim = mine[mine.length - 1]
    layout.body.zones = layout.body.zones.filter((z) => z.id !== victim.id)
    changes.push(`已删除 ${scopeText}最后 1 块（该列剩 ${mine.length - 1} 块）`)
    return
  }

  for (const ci of targets) {
    layout.body.zones.push(createMiddleZone(ci, gap))
  }
  changes.push(`已新增 ${targets.length} 块区域（${scopeText}）`)
}

// ============================================================
// 主入口
// ============================================================

export function parseRefine(current: ScreenLayout, command: string): RefineResult {
  const cmd = (command || '').trim()
  if (!cmd) {
    return { ok: false, changes: [], hint: '说点什么，例如「顶栏改 100px」' }
  }

  const layout = clone(current)
  const changes: string[] = []

  // ── ① 画布尺寸 ──
  const size = parseSize(cmd)
  if (size.clue) {
    layout.canvas.width = size.width
    layout.canvas.height = size.height
    layout.canvas.aspectRatio = +(size.width / size.height).toFixed(4)
    changes.push(`画布 → ${size.width}×${size.height}`)
  }

  // ── ② 自适应策略（必须先过 cue 守卫） ──
  if (FIT_CUE.test(cmd)) {
    const f = parseFitMode(cmd)
    if (f.fit !== layout.canvas.outputScaleMode) {
      layout.canvas.outputScaleMode = f.fit
      changes.push(`自适应 → ${FIT_LABELS[f.fit]}`)
    }
  }

  // ── ③ 头 / 尾栏的增删 ──
  let removedHeader = false
  let removedFooter = false
  for (const [kind, word] of [
    ['header', HEADER_WORD],
    ['footer', FOOTER_WORD],
  ] as const) {
    const isDel = new RegExp(`(?:${DEL_VERB})[^，,。;；]{0,6}?(?:${word})`).test(cmd)
    const isAdd = !isDel && new RegExp(`(?:${ADD_VERB})[^，,。;；]{0,4}?(?:${word})`).test(cmd)
    if (isDel) {
      if (kind === 'header' && layout.header) {
        layout.header = null
        removedHeader = true
        changes.push('已移除顶栏')
      } else if (kind === 'footer' && layout.footer) {
        layout.footer = null
        removedFooter = true
        changes.push('已移除底栏')
      }
    } else if (isAdd) {
      if (kind === 'header' && !layout.header) {
        layout.header = mkHF('header', '70px')
        changes.push('已新增顶栏 70px')
      } else if (kind === 'footer' && !layout.footer) {
        layout.footer = mkHF('footer', '50px')
        changes.push('已新增底栏 50px')
      }
    }
  }

  // ── ④ 头 / 尾栏高度 ──
  const hh = scanHFHeight(cmd, 'header')
  const fh = scanHFHeight(cmd, 'footer')
  if (hh && !removedHeader) {
    if (layout.header) {
      if (layout.header.height !== hh) {
        layout.header.height = hh
        changes.push(`顶栏高度 → ${hh}`)
      }
    } else {
      layout.header = mkHF('header', hh)
      changes.push(`已新增顶栏 ${hh}`)
    }
  }
  if (fh && !removedFooter) {
    if (layout.footer) {
      if (layout.footer.height !== fh) {
        layout.footer.height = fh
        changes.push(`底栏高度 → ${fh}`)
      }
    } else {
      layout.footer = mkHF('footer', fh)
      changes.push(`已新增底栏 ${fh}`)
    }
  }

  // ── ⑤ 结构：网格 / 列数 / 块数 ──
  const grid = scanGrid(cmd)
  let targetCols: number | null = null
  let targetRows: number | null = null
  let rowScope: Scope = 'all'

  if (grid) {
    targetCols = grid.cols
    targetRows = grid.rows
  } else {
    const both = scanBothSides(cmd)
    if (both) targetCols = both * 2
    else {
      const total = scanTotalColumns(cmd)
      if (total) targetCols = total
    }
    const bare = scanBareRows(cmd)
    if (bare) targetRows = bare
  }

  const weights = scanWeights(cmd)
  // 块数（更具体的「左边 3 块」写法，会覆盖上面较粗的 rows 结果）
  const rc = scanRowCount(cmd)
  if (rc && targetCols === null) {
    targetRows = rc.rows
    rowScope = rc.scope
  } else if (rc && grid) {
    rowScope = 'all'
  }

  const colsChanged = targetCols !== null && clampCols(targetCols) !== layout.body.columns.length
  if (colsChanged) {
    rebuildColumns(layout, clampCols(targetCols!), weights, changes)
  }
  if (targetRows !== null) {
    applyRows(layout, targetRows, rowScope, scanGapValue(cmd), changes)
  }
  if (!colsChanged && weights) {
    applyWeights(layout, weights, changes)
  }

  // ── ⑥ 间距 ──
  if (GAP_CUE.test(cmd)) {
    const gm = cmd.match(
      /(?:间距|间隙|留白|\bgap\b)\s*(?:改成|改为|调成|调到|设为|设成|变成|为|是|到)?\s*(\d{1,3})\s*(?:px|像素)?/i,
    )
    if (gm) {
      const n = parseInt(gm[1], 10)
      if (n > 0 && n <= 64) {
        applyGap(layout, `${n}px`)
        changes.push(`间距 → ${n}px（已同步到全部区域）`)
      }
    }
  }

  // ── ⑦ 单个区域增删（先剥掉已消费的头尾词，避免「加个底栏」被当成加区域） ──
  const rest = cmd.replace(new RegExp(`${HEADER_WORD}|${FOOTER_WORD}`, 'g'), ' ')
  const zoneOp = scanZoneOp(rest)
  if (zoneOp) {
    applyZoneOp(layout, zoneOp, scanGapValue(cmd), changes)
  }

  // ── 收尾 ──
  if (!changes.length) {
    return {
      ok: false,
      changes: [],
      hint: `没听懂「${cmd}」。可以试试：${REFINE_EXAMPLES.slice(0, 5).join(' / ')}`,
    }
  }

  return { ok: true, layout, changes }
}

/** 取命令里的间距值，缺省 8px —— 新建区域时用它继承现有节奏 */
function scanGapValue(cmd: string): string {
  const gm = cmd.match(/(?:间距|间隙|留白|\bgap\b)\s*(?:改成|改为|调成|调到|设为|设成|变成|为|是|到)?\s*(\d{1,3})\s*(?:px|像素)?/i)
  if (gm) {
    const n = parseInt(gm[1], 10)
    if (n > 0 && n <= 64) return `${n}px`
  }
  return '8px'
}
