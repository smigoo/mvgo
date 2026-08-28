# 组件代码规范

## 子组件命名标准（CRITICAL — 强制执行）

除 `index.vue` 外，所有子组件文件名必须使用 **PascalCase（大写开头驼峰）**。

### 命名规则

- **格式**：每个单词首字母大写，无连字符
- **转换方式**：section id (kebab-case) → PascalCase
- **示例**：`daily-total` → `DailyTotal.vue`

### ❌ 禁止

- `daily-total.vue`（kebab-case）
- `Dailytotal.vue`（仅首字母大写）
- `index.vue` 作为子组件名（保留给主入口）

---

## 资源引用规则

所有 `resource-dom-mapping.json` 中列出的资源必须被组件代码引用。

### 引用方式

| 资源类型                 | usage 字段                                      | 引用方式                        | 示例                                                                       |
| ------------------------ | ----------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------- |
| **bg-[m] / bg** (背景图) | `background-image（去掉CSS border/background）` | CSS `background-image: url()`   | `.card { background-image: url('../../images/slot-frame1280-8834.png'); }` |
| **icon** (图标)          | `<img :src>`                                    | JS `import` + 模板 `<img :src>` | `import icon from '../../resources/icons/slot-sub-header-icon-3561.png'`   |

### ⚠️ 注意事项

- **禁止遗漏任何已映射资源** — mc-gen figma 阶段会校验覆盖率并输出 WARN 日志
- **禁止用纯 CSS 渐变替代实际的背景图片**（除非设计稿确实无背景图）
- 图标 import 后必须在模板中实际使用（不要只 import 不渲染）
- 背景图引用后应移除该元素的 CSS `border` 和 `background-color`（避免叠加）

---

## 文件规范

### component.js（复制即可，不可修改）

```js
import component from './package/index.vue'
export default component
```

### declare.js

```js
import declareConfig from './declare.json'
import cssVars from './resources/config/css-vars.js'

let declareInfo = $createMcDeclare({
  metaUrl: import.meta.url,
  declareConfig,
  cssVars
})

export default declareInfo
```

### package/index.vue 规范

- 顶层必须用 `<base-panel>` 包裹，不允许嵌套其他组件在顶层
- `$mcComponentBuilder()` **只能调用一次**，通过解构获取所需方法
- 数据获取和交互处理放在根组件，子组件只负责展示
- 多布局时使用 `defineAsyncComponent` 异步加载子组件

---

#### base-panel 组件

**基本使用**

```vue
<!-- panelKey 不传则使用默认面板 -->
<base-panel panelKey="xxx" title="面板标题">
  <!-- 业务内容 -->
</base-panel>
```

**属性说明**

| 属性 | 类型 | 必填 | 默认值 | 说明 |
|------|------|--------|------|------|
| `panelKey` | String | 否 | `'empty'` | 面板类型：`empty`、`default-panel`、`aio-panel` 等 |
| `title` | String | 否 | - | 面板标题 |

**具名插槽**

- `title-left` - 标题左侧区域
- `title-right` - 标题右侧区域
- `header-right` - 头部右侧区域
- `close` - 关闭按钮区域

---


#### 多布局实现

**主组件结构**

```vue
<template>
  <base-panel>
    <!-- 通过 layoutType 切换布局，themeType 传递主题 class -->
    <component
      :is="layouts[componentProps.layoutType]"
      :class="componentProps.themeType"
      :component-props="componentProps"
    />
  </base-panel>
</template>

<script setup>
const { componentProps } = $mcComponentBuilder()

const layouts = {
  one: defineAsyncComponent(() => import('./components/LayoutOne.vue')),
  two: defineAsyncComponent(() => import('./components/LayoutTwo.vue'))
}
</script>
```

**布局子组件**

布局子组件只负责展示，通过 props 接收数据：

```vue
<!-- components/LayoutOne.vue -->
<script setup>
defineProps({ componentProps: { type: Object, required: true } })
</script>

<template>
  <div class="layout-one">
    <!-- 布局内容 -->
  </div>
</template>

<style scoped>
.layout-one {
  font-size: var(--fontSize);
  color: var(--colorTextBase);
}
</style>
```

---

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
