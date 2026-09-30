// ============================================================
// 大屏布局编辑器 — TypeScript 接口定义
// 与 .workbuddy/design/screen-layout-builder.md 保持一致
// ============================================================

/**
 * 输出适配策略
 *
 * - contain    整体等比缩放，宽高比不一致时留黑边（内容绝不裁切）
 * - fillWidth  宽度铺满，高度按比例推出（可能纵向滚动）
 * - fillHeight 高度铺满，宽度按比例推出（可能横向滚动）
 * - none       按设计稿 1:1 渲染，容器不一致时出现滚动条
 * - fluid      骨架弹性伸缩铺满，元素尺寸与文字比例保持 —— 推荐默认
 * - hybrid     整体等比缩放到接近目标，再由骨架弹性吸收差额
 *
 * ⚠️ 后端 `screen-layout.service.ts` 仅做类型声明、未消费该字段，
 *    因此新增取值不会影响「下载 ZIP」链路。
 */
export type OutputScaleMode =
  | 'contain'
  | 'fillWidth'
  | 'fillHeight'
  | 'none'
  | 'fluid'
  | 'hybrid'

/** 画布配置 */
export interface CanvasConfig {
  width: number                      // 设计稿宽 1920 | 3840
  height: number                     // 设计稿高 1080
  aspectRatioLocked: boolean         // 锁定宽高比
  aspectRatio: number                // 宽高比 (width/height)
  outputScaleMode: OutputScaleMode
  backgroundColor: string            // 画布背景色
  backgroundImage?: string           // 背景图 URL
  showGrid: boolean                  // 显示网格
  gridSize: number                   // 网格间距 px
  snapToGrid: boolean                // 吸附网格
  editorZoom: number                 // 编辑器缩放 0.25~2
}

/** 栅格组件 */
export interface GridComponent {
  id: string
  componentName: string               // 通用组件名（仅布局结构，不区分具体类型）
  layout: {
    x: number; y: number
    w: number; h: number
    minW: number; maxW: number
    minH: number; maxH: number
    static: boolean
  }
  /** 组件层级（越大越上层），用于重叠排序 */
  zIndex: number
  props: Record<string, unknown>
}

/** Flex 布局配置 */
export interface FlexConfig {
  direction: 'row' | 'column'         // 横向 | 纵向
  gap: string                          // 间距 "8px"
  wrap: boolean                        // 是否换行
  justify: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly'
  align: 'flex-start' | 'center' | 'flex-end' | 'stretch'
}

/** Grid 布局配置 */
export interface GridConfig {
  cols: number
  rowHeight: number
  components: GridComponent[]
}

/** 头部/底部配置 */
export interface HeaderFooterConfig {
  enabled: boolean
  height: string                     // "80px" | "10vh"
  backgroundColor?: string
  innerLayout: 'grid'
  gridCols: number
  components: GridComponent[]
}

/** 内容对齐 */
export interface ContentAlign {
  vertical: 'top' | 'center' | 'bottom' | 'stretch'
  horizontal: 'left' | 'center' | 'right' | 'stretch'
}

/** 内边距 */
export interface Padding {
  top: string
  right: string
  bottom: string
  left: string
}

/** 偏移量 */
export interface Offset {
  left: string
  right: string
}

/** Zone 配置 */
export interface ZoneConfig {
  id: string
  colIndex: number
  contentAlign: ContentAlign
  padding: Padding
  zIndex: 'bottom' | 'middle'
  offset: Offset
  /** 内部布局模式：grid 栅格 | flex 弹性 */
  layoutMode: 'grid' | 'flex'
  /** 内容类型：components 组件 | zones 子布局（嵌套） */
  contentType: 'components' | 'zones'
  gridConfig: GridConfig
  flexConfig: FlexConfig
  /** 子 Zone（当 contentType === 'zones' 时使用，支持递归嵌套） */
  children?: ZoneConfig[]
  /** 显式宽度，如 "300px" | "50%"，不设则 flex:1 自适应 */
  width?: string
  /** 显式高度，如 "200px" | "40%"，不设则 flex:1 自适应 */
  height?: string
}

/** 列配置 */
export interface ColumnConfig {
  id: string
  width: string                      // "2fr" | "8fr"
  resizable: boolean
  collapsible: boolean
  defaultCollapsed: boolean
  collapsedWidth: string             // "0fr" | "48px"
}

/** 主体配置 */
export interface BodyConfig {
  columns: ColumnConfig[]
  zones: ZoneConfig[]
}

/** 顶层布局 */
export interface ScreenLayout {
  id: string
  name: string
  canvas: CanvasConfig
  header: HeaderFooterConfig | null
  body: BodyConfig
  footer: HeaderFooterConfig | null
}

/** 下载请求体 */
export interface ScreenLayoutDownloadRequest {
  layout: ScreenLayout
}
