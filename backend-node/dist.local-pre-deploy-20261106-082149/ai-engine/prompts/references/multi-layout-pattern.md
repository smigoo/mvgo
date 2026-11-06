---
name: mc-gen-multi-layout-pattern
description: mc-gen 多布局组件开发规范与最佳实践
type: reference
---

# mc-gen 多布局组件开发规范

## 概述

多布局组件允许一个组件拥有多种视觉布局，通过 `layoutType` 配置动态切换。

## 核心原则

| 原则 | 说明 |
|------|------|
| 布局隔离 | 每个布局拥有独立的目录、组件、样式和资源 |
| 统一数据层 | 主入口统一处理数据，通过 props 传递给各布局 |
| 配置驱动 | 通过 `layoutType` 配置项控制布局切换 |

## 目录结构

```
package/
├── index.vue              # 主入口：布局路由器
├── layout-default/          # 布局一（默认）
│   ├── index.vue           # 布局入口
│   ├── ComponentA.vue      # 子组件
│   └── ComponentB.vue
└── layout-two/             # 布局二
    ├── index.vue
    ├── ComponentA.vue
    └── ComponentB.vue

resources/
├── images/
│   ├── layout-default/     # 布局一资源
│   └── layout-two/         # 布局二资源
└── styles/
    ├── index.less          # 基础样式
    ├── layout-default.less # 布局一样式
    └── layout-two.less     # 布局二样式
```

## 阶段执行规则

### 必须为每个布局独立执行

```bash
# 布局一（默认）
mc-gen --name=c-xxx --preview
mc-gen --name=c-xxx --figma

# 布局二
mc-gen --name=c-xxx --layout=two --preview
mc-gen --name=c-xxx --layout=two --figma
```

### layouts 阶段（合并）

使用 `layouts` 阶段自动将两个独立组件合并为多布局组件：

```bash
mc-gen --name=c-xxx --layouts --merge-from=c-xxx,c-xxx-dark --default-layout=c-xxx
```

## 主入口规范

### 模板结构

```vue
<template>
  <base-panel panelKey="default-panel" class="c-xxx-panel">
    <LayoutDefault v-if="isDefaultLayout" v-bind="layoutProps" />
    <LayoutTwo v-else v-bind="layoutProps" />
  </base-panel>
</template>

<script setup>
import { computed } from 'vue'
import LayoutDefault from './layout-default/index.vue'
import LayoutTwo from './layout-two/index.vue'

// 微码构建器
const builder = (() => {
  try {
    return typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : {}
  } catch {
    return {}
  }
})()

const businessProps = builder?.businessProps || {}
const mcProps = builder?.componentProps || {}

// 布局切换逻辑
const layoutType = computed(() => 
  businessProps?.layoutType || 
  businessProps?.layout || 
  mcProps?.layoutType || 
  mcProps?.layout || 
  'default'
)

const isDefaultLayout = computed(() => layoutType.value === 'default')
const isLayoutTwo = computed(() => layoutType.value === 'two')

// Props 传递
const layoutProps = computed(() => ({
  businessProps,
  mcProps
}))
</script>
```

### 关键配置字段

| 字段名 | 来源 | 说明 |
|--------|------|------|
| `layoutType` | businessProps | 首选配置项（declare.json 定义） |
| `layout` | businessProps/mcProps | 备用字段 |
| `default` | 默认值 | 当无配置时回退到默认布局 |

## declare.json 配置

### layoutConfig（必需）

```json
{
  "layoutConfig": {
    "default": "default",
    "list": [
      {
        "name": "c-xxx",
        "key": "default",
        "nodeId": "",
        "fileKey": "",
        "componentsDir": "layout-default",
        "previewImage": "resources/images/layout-default/mc-preview.png"
      },
      {
        "name": "c-xxx-dark",
        "key": "two",
        "nodeId": "",
        "fileKey": "",
        "componentsDir": "layout-two",
        "previewImage": "resources/images/layout-two/mc-preview.png"
      }
    ]
  }
}
```

### businessConfig（必需）

```json
{
  "businessConfig": [
    {
      "name": "布局类型",
      "key": "layoutType",
      "type": "string",
      "default": "default",
      "renderType": "select",
      "list": [
        { "name": "默认布局", "key": "default" },
        { "name": "布局二", "key": "two" }
      ],
      "describe": "选择组件布局样式"
    }
  ]
}
```

## 布局入口规范

### 样式引入

每个布局入口必须引入样式：

```vue
<script setup>
// 布局逻辑
</script>

<style lang="less">
// 先引入基础样式
@import '../../resources/styles/index.less';
// 再引入布局特定样式
@import '../../resources/styles/layout-default.less';
</style>
```

### 数据接收

```vue
<script setup>
const props = defineProps({
  businessProps: { type: Object, default: () => ({}) },
  mcProps: { type: Object, default: () => ({}) }
})

// 解构配置
const { componentApi, runtimeBuilder } = $mcComponentBuilder()
</script>
```

## 常见错误

### ❌ 错误：固定引用 components 目录

```vue
<!-- 错误：没有切换逻辑 -->
<template>
  <base-panel>
    <ComponentA />
    <ComponentB />
  </base-panel>
</template>

<script setup>
import ComponentA from './components/ComponentA.vue'  // ❌ 固定路径
</script>
```

### ❌ 错误：缺少 layoutType 配置

```json
// declare.json 中缺少 layoutType 配置项
{
  "businessConfig": [
    // 只有其他配置，没有 layoutType
  ]
}
```

### ❌ 错误：布局入口缺少样式

```vue
<script setup>
// 布局逻辑
</script>

<style scoped>
/* 错误：没有引入 index.less 和布局样式 */
</style>
```

## 调试方法

在 `package/index.vue` 添加调试日志：

```javascript
console.log('[多布局调试] businessProps:', businessProps)
console.log('[多布局调试] mcProps:', mcProps)
console.log('[多布局调试] layoutType:', layoutType.value)
console.log('[多布局调试] isDefaultLayout:', isDefaultLayout.value)
```

## 校验清单

- [ ] `package/index.vue` 有动态布局切换逻辑
- [ ] `package/index.vue` 有 `base-panel` 包裹
- [ ] `declare.json` 有 `layoutConfig` 配置
- [ ] `declare.json` `businessConfig` 有 `layoutType` 配置项
- [ ] 每个布局入口引入了 `index.less` 和布局特定样式
- [ ] 布局目录命名与 `componentsDir` 一致
