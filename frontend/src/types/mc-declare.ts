/**
 * 微码组件声明配置类型定义
 */

export interface McDeclareConfig {
  componentId: string
  componentName: string
  version: string
  attribute: {
    aspectRatio: number[]
    title: string
    description: string
    imgUrl: string | null
  }
  businessEvents: Record<string, McBusinessEvent>
  businessStatuses: Record<string, McBusinessStatus>
  dataSources: McDataSource[] | null
  formSources: McformSource[] | null
  layoutConfig?: {
    default: string
    list: McLayoutItem[]
  }
  themeConfig?: {
    default: string
    list: NameKeyItem[]
  }
  cssVariableConfig?: CssVariableItem[]
  promptConfig?: PromptConfigItem[]
}

export interface PromptConfigItem extends NameKeyItem {
  value: string
}

export interface CssVariableItem extends NameKeyItem {
  type: 'size' | 'color' | 'weight' | 'string' | 'select' | 'number'
  layoutTypes?: string // 可选字段
}
/**
 * 通用键值对类型（带名称）
 */
export interface NameKeyItem {
  name: string
  key: string
}

export interface McBusinessEvent {
  eventId?: string
  eventName?: string
  eventDataSchema?: Record<string, McEventParameter>
}

export interface McEventParameter extends NameKeyItem {
  type: string
}

export interface McBusinessStatus {
  statusId?: string
  statusName?: string
  parameters?: Record<string, McEventParameter>
}

export interface McformSource {
  formName: string
}

export interface McDataSource {
  sourceName: string
  columns?: any[]
  indexs?: any[]
}

export interface McLayoutItem extends NameKeyItem {
  previewUrl?: string
}

export interface McDeclareInfo extends McDeclareConfig {
  cssVars?: Record<string, string>
}
