// ============================================================
// 大屏布局编辑器 — 8 个预设模板
// ============================================================
// 所有模板定义在此文件，方便统一维护和版本管理
// 新增模板只需追加一个 preset 对象即可
// ============================================================

import type {
  ScreenLayout,
  ZoneConfig,
  ContentAlign,
  Padding,
  Offset,
  FlexConfig,
} from '@/types/screen-layout'

let _idCounter = 0
function uid(prefix = 'id'): string {
  return `${prefix}-${Date.now().toString(36)}-${(++_idCounter).toString(36)}`
}
function resetUidCounter(): void { _idCounter = 0 }

// ============================================================
// 辅助构造函数 — 生成纯布局 Zone（无预置组件）
// ============================================================

function mkPadding(top = '8px', right = '8px', bottom = '8px', left = '8px'): Padding {
  return { top, right, bottom, left }
}

function mkOffset(left = '0', right = '0'): Offset {
  return { left, right }
}

function mkAlign(v: ContentAlign['vertical'] = 'top', h: ContentAlign['horizontal'] = 'stretch'): ContentAlign {
  return { vertical: v, horizontal: h }
}

/** 默认 flex 配置 */
function defaultFlexConfig(): FlexConfig {
  return { direction: 'row', gap: '8px', wrap: false, justify: 'flex-start', align: 'stretch' }
}

/** 创���空 grid zone（只保留布局框架，组件由用户拖入） */
function mkEmptyZone(colIndex: number, opts?: {
  cols?: number
  rowHeight?: number
  padding?: Padding
  offset?: Offset
  align?: ContentAlign
}): ZoneConfig {
  return {
    id: uid('zone'),
    colIndex,
    contentAlign: opts?.align || mkAlign('top', 'stretch'),
    padding: opts?.padding || mkPadding('8px'),
    zIndex: 'middle',
    offset: opts?.offset || mkOffset(),
    layoutMode: 'grid',
    contentType: 'components',
    gridConfig: {
      cols: opts?.cols ?? 12,
      rowHeight: opts?.rowHeight ?? 8,
      components: [],
    },
    flexConfig: defaultFlexConfig(),
  }
}

// ============================================================
// 预设模板 — 按「场景 × 分辨率」分类（8 个）
// 大屏 4 个：投屏展示/监控/展厅/指挥中心
// 后台 4 个：ERP/数据分析/CMS/配置平台
// ============================================================

// ============================================================
// 大屏 — B1 智慧交通监控 (1920×1080, 3列 2/8/2, 经典三分栏)
// 场景: 智慧城市/交通/隧道桥梁监测
// 布局: 左指标 + 中地图/图表 + 右事件
// ============================================================

const b1: ScreenLayout = {
  id: uid('layout'),
  name: '三分栏 (经典)',
  canvas: {
    width: 1920, height: 1080,
    aspectRatioLocked: true, aspectRatio: 1.778,
    outputScaleMode: 'contain',
    backgroundColor: '#ffffff',
    showGrid: true, gridSize: 20, snapToGrid: false,
    editorZoom: 1,
  },
  header: { enabled: true, height: '70px', backgroundColor: 'rgba(20,30,80,0.9)', innerLayout: 'grid', gridCols: 1, components: [] },
  footer: null,
  body: {
    columns: [
      { id: uid('col'), width: '2fr', resizable: true, collapsible: true, defaultCollapsed: false, collapsedWidth: '0fr' },
      { id: uid('col'), width: '8fr', resizable: true, collapsible: false, defaultCollapsed: false, collapsedWidth: '0fr' },
      { id: uid('col'), width: '2fr', resizable: true, collapsible: true, defaultCollapsed: false, collapsedWidth: '0fr' },
    ],
    zones: [
      mkEmptyZone(0),
      mkEmptyZone(1),
      mkEmptyZone(2),
    ],
  },
}

// ============================================================
// 大屏 — B2 设备运维监控 (1920×1080, 3列 3/6/3, 左右对称)
// 场景: 工厂/设备/园区楼宇监控
// 布局: 左指标 + 中核心面板 + 右告警
// ============================================================

const b2: ScreenLayout = {
  id: uid('layout'),
  name: '三分栏 (对称)',
  canvas: {
    width: 1920, height: 1080,
    aspectRatioLocked: true, aspectRatio: 1.778,
    outputScaleMode: 'contain',
    backgroundColor: '#ffffff',
    showGrid: true, gridSize: 20, snapToGrid: false,
    editorZoom: 1,
  },
  header: { enabled: true, height: '70px', backgroundColor: 'rgba(10,60,40,0.9)', innerLayout: 'grid', gridCols: 1, components: [] },
  footer: { enabled: true, height: '50px', backgroundColor: 'rgba(0,0,0,0.2)', innerLayout: 'grid', gridCols: 1, components: [] },
  body: {
    columns: [
      { id: uid('col'), width: '3fr', resizable: true, collapsible: true, defaultCollapsed: false, collapsedWidth: '0fr' },
      { id: uid('col'), width: '6fr', resizable: true, collapsible: false, defaultCollapsed: false, collapsedWidth: '0fr' },
      { id: uid('col'), width: '3fr', resizable: true, collapsible: true, defaultCollapsed: false, collapsedWidth: '0fr' },
    ],
    zones: [
      mkEmptyZone(0),
      mkEmptyZone(1),
      mkEmptyZone(2),
    ],
  },
}

// ============================================================
// 大屏 — B3 数字展厅 (3840×2160, 4K, 5列 1/1/4/1/1, 中心聚焦)
// 场景: 企业展厅/数字展馆/高端演示
// 布局: 两侧信息 + 中心 3D/地图展示
// ============================================================

const b3: ScreenLayout = {
  id: uid('layout'),
  name: '五分栏 (中心大)',
  canvas: {
    width: 3840, height: 2160,
    aspectRatioLocked: true, aspectRatio: 1.778,
    outputScaleMode: 'contain',
    backgroundColor: '#0a1628',
    showGrid: true, gridSize: 40, snapToGrid: false,
    editorZoom: 1,
  },
  header: { enabled: true, height: '100px', backgroundColor: 'rgba(0,0,0,0.4)', innerLayout: 'grid', gridCols: 1, components: [] },
  footer: null,
  body: {
    columns: [
      { id: uid('col'), width: '1fr', resizable: true, collapsible: true, defaultCollapsed: false, collapsedWidth: '0fr' },
      { id: uid('col'), width: '1fr', resizable: true, collapsible: true, defaultCollapsed: false, collapsedWidth: '0fr' },
      { id: uid('col'), width: '4fr', resizable: true, collapsible: false, defaultCollapsed: false, collapsedWidth: '0fr' },
      { id: uid('col'), width: '1fr', resizable: true, collapsible: true, defaultCollapsed: false, collapsedWidth: '0fr' },
      { id: uid('col'), width: '1fr', resizable: true, collapsible: true, defaultCollapsed: false, collapsedWidth: '0fr' },
    ],
    zones: [
      mkEmptyZone(0),
      mkEmptyZone(1),
      mkEmptyZone(2),
      mkEmptyZone(3),
      mkEmptyZone(4),
    ],
  },
}

// ============================================================
// 大屏 — B4 指挥中心 (5760×1080, 3屏拼接, 3列 2/8/2)
// 场景: 指挥中心/作战室/应急调度
// 布局: 大跨度多区域独立布局
// ============================================================

const b4: ScreenLayout = {
  id: uid('layout'),
  name: '三分栏 (超宽)',
  canvas: {
    width: 5760, height: 1080,
    aspectRatioLocked: true, aspectRatio: 5.333,
    outputScaleMode: 'contain',
    backgroundColor: '#ffffff',
    showGrid: true, gridSize: 40, snapToGrid: false,
    editorZoom: 1,
  },
  header: { enabled: true, height: '80px', backgroundColor: 'rgba(0,0,0,0.5)', innerLayout: 'grid', gridCols: 1, components: [] },
  footer: { enabled: true, height: '60px', backgroundColor: 'rgba(0,0,0,0.3)', innerLayout: 'grid', gridCols: 1, components: [] },
  body: {
    columns: [
      { id: uid('col'), width: '2fr', resizable: true, collapsible: true, defaultCollapsed: false, collapsedWidth: '0fr' },
      { id: uid('col'), width: '8fr', resizable: true, collapsible: false, defaultCollapsed: false, collapsedWidth: '0fr' },
      { id: uid('col'), width: '2fr', resizable: true, collapsible: true, defaultCollapsed: false, collapsedWidth: '0fr' },
    ],
    zones: [
      mkEmptyZone(0),
      mkEmptyZone(1),
      mkEmptyZone(2),
    ],
  },
}

// ============================================================
// 后台 — A1 ERP 管理系统 (1920×1080, 3列 2/7/3, 经典三栏)
// 场景: ERP/CRM/OA 等企业管理系统
// 布局: 侧边导航 + 主内容 + 辅助面板
// ============================================================

const a1: ScreenLayout = {
  id: uid('layout'),
  name: '三分栏 (侧栏+主内容+辅助)',
  canvas: {
    width: 1920, height: 1080,
    aspectRatioLocked: true, aspectRatio: 1.778,
    outputScaleMode: 'contain',
    backgroundColor: '#f5f7fa',
    showGrid: false, gridSize: 8, snapToGrid: true,
    editorZoom: 1,
  },
  header: { enabled: true, height: '56px', backgroundColor: '#ffffff', innerLayout: 'grid', gridCols: 1, components: [] },
  footer: null,
  body: {
    columns: [
      { id: uid('col'), width: '2fr', resizable: true, collapsible: true, defaultCollapsed: false, collapsedWidth: '0fr' },
      { id: uid('col'), width: '7fr', resizable: true, collapsible: false, defaultCollapsed: false, collapsedWidth: '0fr' },
      { id: uid('col'), width: '3fr', resizable: true, collapsible: true, defaultCollapsed: true, collapsedWidth: '0fr' },
    ],
    zones: [
      mkEmptyZone(0),
      mkEmptyZone(1),
      mkEmptyZone(2),
    ],
  },
}

// ============================================================
// 后台 — A2 数据分析平台 (1920×1080, 2列 8/4)
// 场景: BI/数据分析/报表平台
// 布局: 图表主体 + 筛选/条件面板
// ============================================================

const a2: ScreenLayout = {
  id: uid('layout'),
  name: '双栏 (主+辅)',
  canvas: {
    width: 1920, height: 1080,
    aspectRatioLocked: true, aspectRatio: 1.778,
    outputScaleMode: 'contain',
    backgroundColor: '#ffffff',
    showGrid: false, gridSize: 8, snapToGrid: true,
    editorZoom: 1,
  },
  header: { enabled: true, height: '56px', backgroundColor: '#ffffff', innerLayout: 'grid', gridCols: 1, components: [] },
  footer: null,
  body: {
    columns: [
      { id: uid('col'), width: '8fr', resizable: true, collapsible: false, defaultCollapsed: false, collapsedWidth: '0fr' },
      { id: uid('col'), width: '4fr', resizable: true, collapsible: true, defaultCollapsed: false, collapsedWidth: '0fr' },
    ],
    zones: [
      mkEmptyZone(0),
      mkEmptyZone(1),
    ],
  },
}

// ============================================================
// 后台 — A3 CMS 内容管理 (1440×900, 1列 1fr, 顶部导航简洁)
// 场景: CMS/博客/文档/简洁后台
// 布局: 全宽内容
// ============================================================

const a3: ScreenLayout = {
  id: uid('layout'),
  name: '单栏 (全宽)',
  canvas: {
    width: 1440, height: 900,
    aspectRatioLocked: true, aspectRatio: 1.6,
    outputScaleMode: 'contain',
    backgroundColor: '#f0f2f5',
    showGrid: false, gridSize: 8, snapToGrid: true,
    editorZoom: 1,
  },
  header: { enabled: true, height: '48px', backgroundColor: '#ffffff', innerLayout: 'grid', gridCols: 1, components: [] },
  footer: null,
  body: {
    columns: [
      { id: uid('col'), width: '1fr', resizable: false, collapsible: false, defaultCollapsed: false, collapsedWidth: '0fr' },
    ],
    zones: [
      mkEmptyZone(0),
    ],
  },
}

// ============================================================
// 后台 — A4 低代码配置平台 (1920×1080, 3列 1.5/7/3.5, 混合导航)
// 场景: 低代码/配置管理/开发者平台
// 布局: 左侧树形 + 中间编辑区 + 右侧属性面板
// ============================================================

const a4: ScreenLayout = {
  id: uid('layout'),
  name: '三分栏 (窄树+编辑+宽侧)',
  canvas: {
    width: 1920, height: 1080,
    aspectRatioLocked: true, aspectRatio: 1.778,
    outputScaleMode: 'contain',
    backgroundColor: '#ffffff',
    showGrid: false, gridSize: 8, snapToGrid: true,
    editorZoom: 1,
  },
  header: { enabled: true, height: '48px', backgroundColor: '#1a1a2e', innerLayout: 'grid', gridCols: 1, components: [] },
  footer: null,
  body: {
    columns: [
      { id: uid('col'), width: '1.5fr', resizable: true, collapsible: true, defaultCollapsed: false, collapsedWidth: '0fr' },
      { id: uid('col'), width: '7fr', resizable: true, collapsible: false, defaultCollapsed: false, collapsedWidth: '0fr' },
      { id: uid('col'), width: '3.5fr', resizable: true, collapsible: true, defaultCollapsed: false, collapsedWidth: '0fr' },
    ],
    zones: [
      mkEmptyZone(0),
      mkEmptyZone(1),
      mkEmptyZone(2),
    ],
  },
}

// ============================================================
// 预设标签（用于线框图预览中每列的文字标注）
// key = preset.name，value = 每列的标签数组
// ============================================================

export const PRESET_LABELS: Record<string, string[]> = {
  '三分栏 (经典)':      ['指标', '地图/3D', '图表'],
  '三分栏 (对称)':      ['状态', '主面板', '告警'],
  '五分栏 (中心大)':    ['信息', '指标', '核心', '图表', '列表'],
  '三分栏 (超宽)':      ['指标', '全景', '事件'],
  '三分栏 (侧栏+主内容+辅助)': ['导航', '内容', '属性'],
  '双栏 (主+辅)':       ['主面板', '筛选/详情'],
  '单栏 (全宽)':        ['全宽内容'],
  '三分栏 (窄树+编辑+宽侧)': ['树形', '编辑区', '属性'],
}

// ============================================================
// 导出
// ============================================================

/** 全部 8 个预设模板（大屏 4 + 后台 4） */
export const PRESETS: ScreenLayout[] = [b1, b2, b3, b4, a1, a2, a3, a4]

/** 按场景分组 */
export const PRESETS_BIG_SCREEN: ScreenLayout[] = [b1, b2, b3, b4]
export const PRESETS_ADMIN: ScreenLayout[] = [a1, a2, a3, a4]

/** 重置 ID 计数器（每次使用前调用，确保 ID 唯一） */
export function resetPresetIds(): void {
  resetUidCounter()
}
