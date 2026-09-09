# 组件代码规范


## 文件规范

### component.js（复制即可，不可修改）

```js
import component from './package/index.vue'
export default component
```

### declare.js

```js
import declareConfig from './declare.json'
import cssVars from './resources/config/css-vars.js'  // 仅当有 cssVariableConfig 时

let declareInfo = $createMcDeclare({
  metaUrl: import.meta.url,
  declareConfig,
  cssVars  // 仅当有 cssVariableConfig 时传入
})

export default declareInfo
```

### package/index.vue 规范

- 顶层必须用 `<base-panel>` 包裹，不允许嵌套其他组件在顶层
- `$mcComponentBuilder()` **只能调用一次**，通过解构获取所需方法
- 数据获取和交互处理放在根组件，子组件只负责展示
- 多布局时使用 `defineAsyncComponent` 异步加载子组件

```vue
<template>
  <base-panel>
    <component
      :is="layouts[componentProps.layoutType]"
      :class="componentProps.themeType"
      :component-props="componentProps"
    />
  </base-panel>
</template>

<script setup>
const { runtimeBuilder, businessProps, componentProps, componentApi } = $mcComponentBuilder()

const layouts = {
  one: defineAsyncComponent(() => import('./components/LayoutOne.vue')),
  two: defineAsyncComponent(() => import('./components/LayoutTwo.vue'))
}
</script>
```

## $mcComponentBuilder 解构说明

```js
const {
  runtimeBuilder,       // 事件构建器：publishEvent / listenEvent / removeListener
  businessProps,        // 业务参数（来自 businessConfig 配置）
  componentProps,       // 组件属性（layoutType / themeType 等）
  componentApi,         // 数据请求 API
  componentId,          // 当前组件 ID
  componentDeclareInfo  // 声明文件内容
} = $mcComponentBuilder()
```

## runtimeBuilder 事件方法

```js
// 发布业务事件（对应 declare.json businessEvents）
runtimeBuilder.publishEvent('event-id', { key: value })

// 监听业务状态（对应 declare.json businessStatuses）
runtimeBuilder.listenEvent('status-id', (data) => { /* 处理 */ })

// 销毁监听（必须在 onUnmounted 中调用，与 listenEvent 一一对应）
runtimeBuilder.removeListener('status-id')

// 框架级事件（mc-framework-* 前缀，无需在 declare.json 中声明）
runtimeBuilder.mcFrameworkPublishEvent('mc-framework-init')
runtimeBuilder.mcFrameworkListenEvent('mc-framework-websocket', (data) => {})
```

**重要**：每个 `listenEvent` 必须有对应的 `removeListener`，在 `onUnmounted` 中调用。

## componentApi 数据请求

```js
const { componentApi } = $mcComponentBuilder()

// dsName 对应 declare.json dataSources[].sourceName
componentApi.getCommonApiFindOne(params, dsName)      // 返回 Object
componentApi.getCommonApiFindList(params, dsName)     // 返回 Array
componentApi.getCommonApiPageList(params, dsName)     // 返回分页数据（params 需含 page: {currentPage, pageSize}）
componentApi.submitCommonApiForm(params, dsName)      // 提交表单
componentApi.delCommonApiDeleteOne(params, dsName)    // 删除
componentApi.commonApiUploadFile(params, dsName)      // 上传文件
componentApi.commonApiDownloadFile(params, dsName)    // 下载文件（v1.0.8+）
```

**禁止使用**：`axios`、`fetch`、`createRequest`、`this.$http` 等（例外：`c-mc-map` 在白名单内）

## 🔴 配置读取最佳实践

### 父组件 index.vue

```js
import { computed, provide } from 'vue'
import declareJson from '../declare.json'  // ← 同步加载，避免异步竞态

// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, runtimeBuilder, businessProps, componentApi } = $mcComponentBuilder()

// 提供 componentApi 给子组件（如子组件需调用接口）
if (componentApi) {
  provide('componentApi', componentApi)
}

// === declare.json 默认值（同步加载） ===
const declareDefaults = {}
if (declareJson?.businessConfig && Array.isArray(declareJson.businessConfig)) {
  declareJson.businessConfig.forEach((item) => {
    if (item?.key && item.default !== undefined) {
      declareDefaults[item.key] = item.default
    }
  })
}

// === 配置读取工具函数 ===
function getConfig(key, defaultValue) {
  const value = businessProps?.[key]
  
  // 优先级 1：businessProps（平台配置）← 最高优先级
  // 🔴 不检查 !== ''，空字符串是合法值
  if (value !== undefined && value !== null) {
    return value
  }
  
  // 优先级 2：declare.json 默认值
  if (declareDefaults[key] !== undefined && declareDefaults[key] !== null) {
    return declareDefaults[key]
  }
  
  // 优先级 3：函数参数默认值
  return defaultValue
}

// === 响应式配置 ===
const config = computed(() => ({
  // 数值类型：使用 ??
  dataRefreshInterval: getConfig('dataRefreshInterval', 60000),
  flowThreshold: getConfig('flowThreshold', 3000),
  
  // 布尔类型：使用 !== false
  showTimeSelector: getConfig('showTimeSelector', true),
  showPanelTitle: getConfig('showPanelTitle', true)
}))
```

### 子组件 xxx.vue

```js
import { computed, inject, onMounted, onUnmounted } from 'vue'

// === 接收父组件传递的配置 ===
const props = defineProps({
  businessConfig: {
    type: Object,
    default: () => ({
      dataRefreshInterval: 60000,
      showTimeSelector: true
    })
  }
})

// === 从配置中读取 ===
// 🔴 数值类型使用 ??（避免 0 被误判）
const dataRefreshInterval = computed(() => props.businessConfig?.dataRefreshInterval ?? 60000)

// 🔴 布尔类型使用 !== false
const showTimeSelector = computed(() => props.businessConfig?.showTimeSelector !== false)

// === 如需调用接口 ===
const componentApi = inject('componentApi', null)

// === 轮询逻辑 ===
let refreshTimer = null

const fetchData = async () => {
  if (!componentApi) {
    console.warn('[子组件] componentApi 未注入')
    return
  }
  
  try {
    const res = await componentApi.getCommonApiFindList({}, 'dataSourceName')
    dataList.value = res || []
  } catch (err) {
    console.error('获取数据失败:', err)
    dataList.value = []  // 降级方案
  }
}

onMounted(() => {
  fetchData()  // 首次加载
  refreshTimer = setInterval(fetchData, dataRefreshInterval.value)
})

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
})
```

### 配置类型处理规范

| 配置类型 | 判断方式 | 示例 |
|---------|---------|------|
| **布尔类型** | `!== false` | `computed(() => props.businessConfig?.showPanel !== false)` |
| **数值类型** | `?? defaultValue` | `computed(() => props.businessConfig?.threshold ?? 3000)` |
| **字符串类型** | `?? defaultValue` | `computed(() => props.businessConfig?.label ?? '默认')` |
| **数组/对象** | `?? defaultValue` | `computed(() => props.businessConfig?.list ?? [])` |

### 常见错误模式

```javascript
// ❌ 错误：使用 ||（0 被误判）
const threshold = computed(() => props.businessConfig?.threshold || 3000)

// ✅ 正确：使用 ??
const threshold = computed(() => props.businessConfig?.threshold ?? 3000)

// ❌ 错误：异步加载 declare.json（竞态问题）
const declareDefaults = reactive({})
fetch(new URL('../declare.json', import.meta.url).href)
  .then(r => r.json())
  .then(raw => { /* ... */ })

// ✅ 正确：同步加载
import declareJson from '../declare.json'

// ❌ 错误：使用 setInterval 但不清理
onMounted(() => {
  setInterval(fetchData, 60000)
})

// ✅ 正确：onUnmounted 中清理
let refreshTimer = null
onMounted(() => {
  refreshTimer = setInterval(fetchData, 60000)
})
onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
})
```

## $mcCssBuilder 样式工具

```js
const common = {
  fontSize: $mcCssBuilder.getCssSize(),          // 默认字体大小（rem/px）
  titleSize: $mcCssBuilder.getCssSize(20),       // 设计图 20px 对应的 rem/px
  gap: $mcCssBuilder.getCssEm(12),               // 设计图 12px 对应的 em
  colorBase: $mcCssBuilder.getConfig('colorTextBase')  // 获取平台配置值
}
```

## 开发约束

1. 组件内部不允许引用当前目录外的文件（禁止 `../../` 跨目录引用）
2. 禁止修改全局 `package.json`；需要第三方库时，将源码放入 `package/` 目录
3. `businessProps.payload` 是框架内置参数，不可在 `businessConfig` 中占用
4. `src/components/` 目录下所有文件不允许修改（框架内置组件）

## 组件上传前检查

1. 所有异步请求已改造为 `componentApi` 方法
2. 所有依赖已内置于组件目录
3. 执行 `npm run lint:prettier` 格式化
4. 打包时只打包组件内部文件，不含组件文件夹本身

---

## 🔴 组件联动事件编排（重要）

### 场景：两个独立组件的联动效果

当需要实现"组件 A 点击 → 打开组件 B 弹窗"的联动效果时，使用 `businessEvents` + `businessStatuses` 机制：

#### 1. 组件 A（触发方）- 例如 `VehicleType.vue`

```javascript
// 在 index.vue 中
const { runtimeBuilder } = $mcComponentBuilder()

// 点击卡片时发布事件
const handleCardClick = (sectionNum, sectionName) => {
  runtimeBuilder.publishEvent('vehicle-card-click', {
    sectionNum,
    sectionName
  })
  console.log('[VehicleType] 发布事件 vehicle-card-click:', { sectionNum, sectionName })
}
```

在 `declare.json` 中声明：
```json
{
  "businessEvents": {
    "vehicle-card-click": {
      "eventId": "vehicle-card-click",
      "eventName": "点击车型卡片",
      "eventDataSchema": {
        "sectionNum": { "key": "sectionNum", "name": "路段编码", "type": "string" },
        "sectionName": { "key": "sectionName", "name": "路段名称", "type": "string" }
      }
    }
  }
}
```

#### 2. 组件 B（接收方）- 例如 `VehicleTrendModal.vue`

```javascript
// 在 index.vue 中
const { runtimeBuilder } = $mcComponentBuilder()

// 监听事件
runtimeBuilder.listenEvent('show-modal', (data) => {
  console.log('[弹窗] 收到 show-modal 事件:', data)
  // 打开弹窗逻辑
})

// 在 onUnmounted 中清理监听
onUnmounted(() => {
  runtimeBuilder.removeListener('show-modal')
})
```

在 `declare.json` 中声明：
```json
{
  "businessStatuses": {
    "show-modal": {
      "statusId": "show-modal",
      "statusName": "显示弹窗",
      "parameters": {
        "sectionNum": { "key": "sectionNum", "name": "路段编码", "type": "string" },
        "sectionName": { "key": "sectionName", "name": "路段名称", "type": "string" }
      }
    }
  }
}
```

#### 3. 微码平台编排

在微码平台后台配置事件映射：
- **源事件**：`c-tunnel-traffic-monitoring/vehicle-card-click`
- **目标状态**：`c-tunnel-model-distributiony-trends-modal/show-modal`

### 注意事项

1. **每个 listenEvent 必须有对应的 removeListener**：在 `onUnmounted` 中调用
2. **eventId/statusId 必须为 kebab-case**：如 `vehicle-card-click`，禁止使用驼峰
3. **eventId 长度不超过 50 字符**：避免过长导致解析错误
4. **每个事件独立一行**：在 requirement.md 中编写时，每个事件必须独立一行（见 `declare-json.md`）

相关文档：`req-d-business-events-fix.md`
