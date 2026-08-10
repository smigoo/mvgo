# Vue3 组件数据槽识别流程优化方案

## 1. 背景与问题

当前接口对接向导的“自动分析”主要由 `SlotAnalyzerService.analyzeSlots` 完成。现有流程只提取 Vue SFC 的 `<template>` 部分，并通过正则按行匹配 `v-for`、`:data-source`、`:columns`、`:options`、`:option`、插值统计字段等模式。

这导致环境监测类组件只能识别到：

```vue
v-for="(tab, index) in tabs"
```

输出为：

```text
LIST tabs 监测指标Tab列表
```

但图表真实业务数据位于 `<script setup>` 的 ECharts 配置中，例如：

```js
const getChartData = () => [5, 12, 18, 25, 22, 15, 28, 35, 32, 20, 10, 8]

series: [
  {
    name: 'zk3+785CO浓度',
    type: 'line',
    data: getChartData()
  }
]
```

当前规则不会分析这些脚本数据，因此漏掉图表数据槽。

## 2. 优化目标

### 核心目标

把数据槽识别从“模板变量扫描”升级为“组件业务数据结构识别”。

### 具体目标

1. 自动识别图表类组件的数据需求，包括 `series.data`、`xAxis.data`、`legend`、`markLine`。
2. 区分 UI 配置数据与业务主数据，例如 `tabs` 应识别为筛选维度，而不是普通列表。
3. 以“复合数据槽”方式展示图表、表格、统计卡片，降低用户绑定接口时的理解成本。
4. 为每个识别结果提供来源、置信度、原因，方便用户判断是否可信。
5. 为后续接口自动绑定和 adapter 生成提供结构化输入。

## 3. 目标识别流程

```text
读取组件真实入口
  ↓
解析 Vue SFC：template + script
  ↓
Template 层识别 UI 消费点
  ↓
Script 层识别 props/ref/computed/functions
  ↓
图表专项分析 ECharts option/setOption
  ↓
合并为业务数据槽
  ↓
生成 label / role / confidence / reason
  ↓
前端展示可绑定主槽
  ↓
绑定接口后生成 adapter 和注入代码
```

## 4. 后端设计

### 4.1 入口归一化

新增或强化 `resolveComponentEntry(componentId, groupId)`。

搜索优先级：

```text
1. frontend/workspace/vue3-components/{groupId}/{componentId}/package/index.vue
2. frontend/workspace/vue3-components/{groupId}/{componentId}/index.vue
3. backend-node/workspace/vue3-components/{groupId}/{componentId}/package/index.vue
4. backend-node/workspace/vue3-components/{groupId}/{componentId}/index.vue
5. 跨 groupId fallback
```

返回结构：

```ts
interface ResolvedComponentEntry {
  componentId: string
  groupId: string
  entryPath: string
  workspace: 'frontend' | 'backend'
  hasPackage: boolean
  sfcContent: string
}
```

目的：避免“分析读后端 workspace，预览读前端 workspace”的错位。

### 4.2 SFC 解析层

建议中期引入 `@vue/compiler-sfc`：

```ts
import { parse } from '@vue/compiler-sfc'
```

解析结果：

```ts
interface ParsedSfcInfo {
  template: string
  scriptSetup: string
  imports: ImportInfo[]
  props: PropInfo[]
  emits: string[]
  refs: RefInfo[]
  computed: ComputedInfo[]
  functions: FunctionInfo[]
}
```

MVP 可以先用轻量正则保持低风险，后续再升级 AST。

### 4.3 Template 层识别

现有规则保留，但需要增加上下文判断。

| 模式 | 当前输出 | 优化后输出 |
|---|---|---|
| `v-for in tabs` | `list` | `filter.tabs` |
| `v-for in cards/items/list` | `list` | `list.items` |
| `:data-source` | `table` | `table.rows` |
| `:columns` | `table` | `table.columns` |
| `{{ xxx.total }}` | `stat` | `stat.metric` |
| `ref="chartRef"` + script 中存在 ECharts | 无 | `chart.container` |

判断依据：

1. 变量名：`tabs/tabList/options/filterOptions` 更像筛选项。
2. class：`tab-bar/tab-list/tab-item` 更像 Tab。
3. 标签：`button` + `role="tab"` 更像 Tab。
4. 上下文注释：`Tab 切换栏`、`筛选`、`图表`。

### 4.4 Script 层识别

新增 `ScriptDataAnalyzer`，识别：

| 类型 | 示例 | 输出 role |
|---|---|---|
| `defineProps` | `chartData`, `tunnelData` | `prop.data` |
| `ref([])` | `tabs`, `deviceCards` | `filter.tabs` / `list.items` |
| `ref({})` | `summaryData` | `stat.group` |
| `computed` | `filteredCards` | `derived.list` |
| 函数返回数组 | `getChartData()` | `chart.series.data` |
| 函数返回对象 | `buildOption()` | `chart.option` |

MVP 识别规则：

```text
const xxx = ref([...])
const xxx = ref({...})
const xxx = computed(...)
const xxx = () => [...]
const xxx = () => ({...})
defineProps({...})
```

### 4.5 ECharts 专项识别

新增 `EChartsSlotAnalyzer`。

识别入口：

```text
echarts.init(chartRef.value)
chartInstance.setOption(option)
setOption({ ... })
const option = { ... }
```

识别内容：

| ECharts 字段 | 数据槽 role | 示例 label |
|---|---|---|
| `xAxis.data` | `chart.xAxis` | 时间轴 |
| `series[].data` | `chart.series` | CO浓度趋势数据 |
| `series[].name` | `chart.legend` | zk3+785CO浓度 |
| `series[].type` | `chart.type` | 折线图 |
| `markLine.data` | `chart.threshold` | 预警线 |
| `legend.data` | `chart.legend` | 图例列表 |

对环境监测组件应输出：

```json
{
  "slotId": "slot-chart-1",
  "slotType": "chart",
  "role": "chart.composite",
  "label": "环境监测趋势图",
  "refName": "chartRef",
  "confidence": "high",
  "reason": "检测到 chartRef 绑定 ECharts 实例，series.data 来自 getChartData()，series.name 为 zk3+785CO浓度",
  "children": [
    {
      "role": "filter.tabs",
      "refName": "tabs",
      "label": "监测指标Tab列表"
    },
    {
      "role": "chart.xAxis",
      "refName": "xAxis.data",
      "label": "时间轴"
    },
    {
      "role": "chart.series",
      "refName": "getChartData",
      "label": "CO浓度趋势数据"
    },
    {
      "role": "chart.threshold",
      "refName": "markLine.data",
      "label": "预警线"
    }
  ]
}
```

### 4.6 数据槽模型升级

当前：

```ts
interface DataSlot {
  slotId: string
  slotType: 'table' | 'chart' | 'select' | 'list' | 'stat' | 'form'
  label: string
  refName: string
  sourceLine: number
  sourceContext: string
}
```

建议升级：

```ts
interface DataSlotV2 {
  slotId: string
  slotType: 'chart' | 'table' | 'stat' | 'list' | 'filter' | 'form'
  role: string
  label: string
  refName: string
  sourceLine?: number
  sourceContext?: string
  sourceKind: 'template' | 'script' | 'echarts' | 'props' | 'computed'
  confidence: 'high' | 'medium' | 'low'
  reason: string
  bindable: boolean
  children?: DataSlotChild[]
  adapterHint?: AdapterHint
}

interface DataSlotChild {
  role: string
  refName: string
  label: string
  sourceKind: string
  sourceLine?: number
}

interface AdapterHint {
  expectedShape: 'array' | 'object' | 'timeseries' | 'table' | 'metric'
  suggestedResponseFields: string[]
}
```

兼容方案：后端同时返回 `slots` 和 `slotsV2`，前端优先使用 V2，无 V2 时回落旧 UI。

## 5. 前端设计

### 5.1 数据槽展示升级

当前列表卡片：

```text
LIST tabs 监测指标Tab列表
行 18: v-for="(tab, index) in tabs"
```

优化后：

```text
CHART 环境监测趋势图
高置信度 · ECharts
来源：chartRef + setOption(option)

包含数据：
- 筛选维度 tabs：一氧化碳 / 能见度 / 洞内照明 / 洞外光强
- X轴 xAxis.data：2-24时
- 系列 getChartData：CO浓度趋势数据
- 阈值 markLine：预警线 30
```

### 5.2 绑定交互

建议区分两类绑定：

1. 主槽绑定：用户选择接口绑定整个图表。
2. 子字段映射：系统根据 adapterHint 自动生成默认映射，用户可展开微调。

示例：

```text
环境监测趋势图 → getEnvironmentTrend()

接口返回字段映射：
metrics[] → tabs
times[] → xAxis.data
values[] → series[0].data
warningLine → markLine.data
```

### 5.3 置信度展示

| confidence | UI 表达 | 用户动作 |
|---|---|---|
| high | 自动推荐绑定 | 可直接绑定 |
| medium | 需要确认 | 展开查看原因 |
| low | 建议手动处理 | 默认不自动绑定 |

### 5.4 无需求文档时的策略

无需求文档时：

```text
代码结构识别为主
变量名/注释/图表字段语义增强
只推荐数据槽，不强行匹配接口
```

有需求文档时：

```text
代码槽位 + 需求语义 + API 目录 三方匹配
```

## 6. 接口与注入适配

### 6.1 绑定请求扩展

`BindingSlotDto` 需要支持复合槽：

```ts
interface BindingSlotDto {
  slotId: string
  slotType: string
  role?: string
  refName: string
  status: 'bound' | 'stub' | 'skipped'
  moduleName?: string
  functionName?: string
  adapter?: SlotAdapterConfig
}
```

### 6.2 Adapter 生成

图表类不要直接把接口返回塞进单个 ref，而是生成 adapter：

```js
function adaptEnvironmentTrendResponse(res) {
  return {
    tabs: res.metrics || [],
    xAxisData: res.times || [],
    seriesData: res.values || [],
    warningLine: res.warningLine ?? 30
  }
}
```

再注入到组件状态：

```js
const data = adaptEnvironmentTrendResponse(response)
tabs.value = data.tabs
chartInstance.setOption({
  xAxis: { data: data.xAxisData },
  series: [{ data: data.seriesData }],
  markLine: { data: [{ yAxis: data.warningLine }] }
})
```

## 7. 分阶段实施

### 阶段 1：P0 快速修复

目标：解决“图表数据完全识别不到”。

后端：
1. `tabs` 识别从 `list` 改为 `filter.tabs`。
2. 扫描 script 中 `echarts.init`、`setOption`、`series.data`、`xAxis.data`、`markLine`。
3. 输出 `chart` 复合槽。
4. 增加 `confidence/reason/sourceKind`。

前端：
1. slot 卡片支持 `chart` 复合展示。
2. 子项折叠展示。
3. 显示识别原因和来源。

验收：
1. 环境监测组件不再只显示 `tabs`。
2. 能显示 `环境监测趋势图` 主槽。
3. 主槽下能看到 `tabs/xAxis/series/threshold`。

### 阶段 2：P1 接口绑定体验优化

目标：用户能按业务主槽绑定接口。

后端：
1. `BindingSlotDto` 支持 `role/adapter`。
2. 图表绑定生成 adapter 注入代码。
3. stub 生成支持图表模拟数据。

前端：
1. 主槽绑定接口。
2. 子字段映射预览。
3. 手动调整字段映射。

验收：
1. 图表接口绑定后能更新曲线数据。
2. stub 模式能生成合理图表 mock。
3. 绑定后预览不报错。

### 阶段 3：P2 语义增强

目标：减少人工判断。

后端：
1. 有需求文档时，LLM 使用 `slotsV2` 做语义匹配。
2. 无需求文档时，基于变量名、注释、标题、series.name 生成 label。
3. API 目录匹配增加领域词典，例如 `CO/一氧化碳/浓度/environment`。

前端：
1. 展示推荐接口和推荐理由。
2. 标记高/中/低置信度。

验收：
1. 有文档时能推荐到更准确接口。
2. 无文档时不乱匹配，只给结构化槽位。

## 8. 风险与控制

| 风险 | 控制方式 |
|---|---|
| 正则解析 ECharts 复杂对象不稳定 | MVP 覆盖常见生成结构，中期改 AST |
| 误把 UI 配置当业务数据 | 增加 `bindable` 字段，tabs 默认作为子槽而非主槽 |
| 图表绑定破坏现有静态效果 | 生成 adapter 前保留 fallback mock 数据 |
| 旧前端不兼容 V2 数据 | 后端同时返回旧 `slots` 和新 `slotsV2` |
| AI 语义匹配误判接口 | 低置信度不自动绑定，只展示建议 |

## 9. 验收组件

优先用以下组件做回归：

1. `mv-1785678105587-dc8835d0`：环境监测，单折线图 + tabs。
2. `mv-1785676111765-509e0dd3`：流量监测，多图表 + props 数据。
3. `mv-1785387528776-e7c947df`：设备监测，tabs + 卡片列表。
4. 一个表格类组件：验证旧规则兼容。

## 10. 推荐结论

优先做 P0：

1. 增加 Script/ECharts 数据槽识别。
2. 把 `tabs` 从普通 list 调整为 filter/tabs。
3. 输出图表复合槽。
4. 前端支持复合槽展示。

这一步就能直接解决当前“没有需求文档时只识别出 tab，看不到图表数据”的问题。