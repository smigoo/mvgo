# 静态资源处理指南

> 🔴 **硬规则（RUNTIME-004 根因）**：禁止用 ESM `import` 引入本地图片（`.png/.jpg/.gif/.webp/.svg`）。预览加载器（DEV 原生 import / PROD vue3-sfc-loader）无法解析，会触发 `[RUNTIME-004] load-error`。一律改用 base64 内联（`const x = 'data:image/png;base64,...'`）或同源 URL（`<img :src>` / CSS `url()`）。外部在线 URL 生产被 CSP 拦截，禁止依赖。

## 1. 资源目录结构规范

### 标准目录结构

```
component-name/
└── resources/
    ├── config/           # 配置文件
    │   └── css-vars.js   # CSS 变量配置
    ├── images/           # 图片资源（背景图、装饰图）
    │   ├── bg-xxx.png
    │   ├── slot-xxx.png
    │   ├── frame-xxx.png
    │   └── layout-one/   # 按布局组织（可选）
    │       └── ...
    └── icons/            # 图标资源
        ├── icon-xxx.png
        ├── icon-xxx.svg
        └── ...
```

### 目录用途说明

| 目录 | 用途 | 文件类型 |
|------|------|---------|
| `resources/config/` | CSS 变量配置 | `.js` |
| `resources/images/` | 背景图、装饰图 | `.png`, `.jpg` |
| `resources/images/` | 图标 | `.svg`, `.png` |
| `resources/styles/` | 样式文件 | `.less` |

---

## 2. 资源命名规范

### 背景图命名

**命名模式：**
- `bg-{描述}.png` - 背景图
- `slot-{描述}.png` - 插槽背景
- `frame-{描述}.png` - 容器背景

**示例：**
```
bg-card-header.png       # 卡片头部背景
bg-gradient-blue.png     # 蓝色渐变背景
slot-frame1280-8835.png  # 插槽容器背景
```

### 图标命名

**命名模式：**
- `icon-{描述}.{ext}` - 功能图标
- `{功能名}.svg` - 业务图标

**示例：**
```
icon-close.svg           # 关闭图标
icon-arrow-right.png     # 右箭头图标
accident.svg             # 事故图标
vehicle-fault.svg        # 车辆故障图标
```

### 预览图命名

**命名模式：**
- `mc-preview.png` - 主预览图
- `mc-preview-{序号}.png` - 多布局预览图

**示例：**
```
mc-preview.png           # 默认布局预览图
mc-preview-two.png       # 第二个布局预览图
mc-preview-three.png     # 第三个布局预览图
```

---

## 3. 资源引用路径规则

### 🔴 必须严格遵循路径规则

| 资源类型 | 存放目录 | 代码中 import 路径 | 使用方式 |
|---------|----------|-------------------|---------|
| 背景图 | `resources/images/` | `../../resources/images/xxx.png` | CSS `background-image` |
| 图标 | `resources/images/` | `../../resources/images/xxx.svg` | `<img>` 标签 |
| CSS 变量配置 | `resources/config/` | `../resources/config/css-vars.js` | import 导入 |

### 正确示例

```javascript
// ✅ 正确：背景图从 images 导入
// [禁止] import 本地图片会触发 RUNTIME-004：改用 const bgHeader = 'data:image/png;base64,...' 内联

// ✅ 正确：图标从 icons 导入
// [禁止] import 本地图片会触发 RUNTIME-004：改用 const iconClose = 'data:image/png;base64,...' 内联

// ✅ 正确：CSS 变量配置
import cssVars from '../resources/config/css-vars.js'
```

### 错误示例

```javascript
// ❌ 错误：图标从 images 导入
// [禁止] import 本地图片会触发 RUNTIME-004：改用 const icon = 'data:image/png;base64,...' 内联

// ❌ 错误：背景图从 icons 导入
// [禁止] import 本地图片会触发 RUNTIME-004：改用 const bg = 'data:image/png;base64,...' 内联
```

---

## 4. 背景图 vs 图标使用区分

### 判断依据

| 特征 | 背景图 | 图标 |
|-----|--------|------|
| 文件名前缀 | `bg-`, `slot-`, `frame-` | `icon-` 或功能名 |
| 作用 | 装饰性背景、容器背景 | 功能图标、状态图标 |
| 使用方式 | CSS `background-image` | `<img>` 标签 |
| 存放位置 | `resources/images/` | `resources/images/` |
| 尺寸特点 | 通常较大，铺满容器 | 通常较小，固定尺寸 |

### 背景图使用规范

**✅ 正确：使用 CSS background**
```vue
<template>
  <div class="card-header" :style="headerStyle">
    <span class="title">{{ title }}</span>
  </div>
</template>

<script setup>
// [禁止] import 本地图片会触发 RUNTIME-004：改用 const bgHeader = 'data:image/png;base64,...' 内联

const headerStyle = computed(() => ({
  backgroundImage: `url(${bgHeader})`,
  backgroundSize: '100% 100%',
  backgroundRepeat: 'no-repeat'
}))
</script>
```

**❌ 错误：使用 img 标签**
```vue
<!-- 禁止！背景图不应该用 img 标签 -->
<img :src="bgHeader" class="card-bg">
```

### 图标使用规范

**✅ 正确：使用 img 标签**
```vue
<template>
  <div class="event-item">
    <img :src="eventIcon" class="event-icon" />
    <span class="event-name">{{ name }}</span>
  </div>
</template>

<script setup>
// [禁止] import 本地图片会触发 RUNTIME-004：改用 const accident = 'data:image/png;base64,...' 内联

const eventIcon = computed(() => {
  return accident  // 根据类型返回不同图标
})
</script>
```

**❌ 错误：使用 CSS background**
```css
/* 不推荐：图标应该用 img 标签 */
.event-icon {
  background-image: url('../../resources/images/accident.svg');
}
```

---

## 5. 资源尺寸规范

### 🔴 尺寸必须来自 Figma 数据

**禁止使用图片原始像素尺寸，必须使用 Figma 设计尺寸。**

### 数据来源优先级

**1. resource-dom-mapping.json（最高优先级）**
```json
{
  "resourceFile": "resources/images/img-6311.png",
  "figmaNodeId": "1:6311",
  "figmaBox": {
    "width": 76,
    "height": 31
  }
}
```

**2. dom-figma-mapping.json**
```json
{
  "figmaId": "1:6311",
  "figmaData": {
    "absoluteBoundingBox": {
      "width": 76,
      "height": 31
    }
  }
}
```

### 代码中的尺寸标注

```css
.rescue-vehicle {
  width: 76px;   /* Figma 1:6311: figmaBox.width */
  height: 31px;  /* Figma 1:6311: figmaBox.height */
}
```

### 常见错误

```css
/* ❌ 错误：使用图片原始尺寸 */
.rescue-vehicle {
  width: 152px;  /* 这是图片文件的实际像素，不是 Figma 设计尺寸 */
  height: 62px;
}

/* ✅ 正确：使用 Figma 设计尺寸 */
.rescue-vehicle {
  width: 76px;   /* Figma 1:6311: figmaBox.width */
  height: 31px;  /* Figma 1:6311: figmaBox.height */
}
```

---

## 6. Preview 阶段资源占位规则

### 背景图占位

**Preview 阶段不能下载真实背景图，但必须留好占位：**

```vue
<!-- TODO[figma]: 背景图待补 - 蓝绿渐变卡片头部 -->
<div class="card-header card-header__has-bg">
  <span class="card-title">{{ title }}</span>
</div>
```

```less
.card-header__has-bg {
  /* TODO[figma]: 背景图 */
  background: transparent;  // 先留空
  width: 100%;
  height: 60px;
}
```

### 图标占位

```vue
<!-- TODO[figma]: 图标待补 -->
<span class="event-icon icon-placeholder" />
```

```less
.icon-placeholder {
  width: 24px;   /* 预留尺寸 */
  height: 24px;
  /* TODO[figma]: 图标背景图或 img src */
}
```

---

## 7. 资源优化建议

### 图片格式选择

| 场景 | 推荐格式 | 原因 |
|-----|---------|------|
| 图标、简单图形 | SVG | 矢量格式，清晰度高，文件小 |
| 照片、复杂图像 | PNG/JPG | 适合位图 |
| 透明背景 | PNG | 支持透明通道 |
| 装饰线、分隔线 | SVG | 矢量，可缩放 |

### 图片压缩

- PNG 图片使用 TinyPNG 或类似工具压缩
- SVG 文件使用 SVGO 优化
- 背景图建议使用 2x 分辨率（适配高清屏）

### 懒加载

```javascript
// 大图片使用懒加载
const bgLarge = defineAsyncComponent(() => 
  // [禁止] 动态 import 本地图片会触发 RUNTIME-004：改用 base64 内联或同源 <img :src>
)
```

---

## 8. 资源自检清单

### 路径检查
- [ ] 背景图是否从 `resources/images/` 导入？
- [ ] 图标是否从 `resources/images/` 导入？
- [ ] 是否混淆了背景图和图标的存放位置？

### 使用方式检查
- [ ] 背景图是否使用 CSS `background-image`？
- [ ] 图标是否使用 `<img>` 标签？
- [ ] 背景图是否设置了 `backgroundSize`？
- [ ] 背景图是否错误地使用了 `<img>` 标签？

### 尺寸检查
- [ ] 图片尺寸是否来自 Figma `figmaBox`？
- [ ] 是否使用了图片原始像素尺寸？
- [ ] 是否添加了 `/* Figma X:YYYY */` 来源注释？

### Preview 阶段检查
- [ ] 是否添加了 `__has-bg` 类名？
- [ ] 是否添加了 `/* TODO[figma]: xxx */` 注释？
- [ ] 是否预留了合适的容器尺寸？

---

## 9. 完整示例

### 示例：包含背景图和图标的组件

```vue
<template>
  <div class="event-list">
    <div 
      v-for="item in list" 
      :key="item.key"
      class="event-item"
      :style="getItemStyle(item)"
    >
      <img :src="item.icon" class="event-icon" />
      <span class="event-name">{{ item.name }}</span>
      <span class="event-value">{{ item.value }}</span>
    </div>
  </div>
</template>

<script setup>
// ✅ 正确：图标从 icons 导入
// [禁止] import 本地图片会触发 RUNTIME-004：改用 const accident = 'data:image/png;base64,...' 内联
// [禁止] import 本地图片会触发 RUNTIME-004：改用 const vehicleFault = 'data:image/png;base64,...' 内联

// ✅ 正确：背景图从 images 导入
// [禁止] import 本地图片会触发 RUNTIME-004：改用 const bgItem = 'data:image/png;base64,...' 内联

const props = defineProps({
  list: { type: Array, default: () => [] }
})

const iconMap = {
  accident,
  vehicleFault
}

const getItemStyle = (item) => ({
  backgroundImage: `url(${bgItem})`,
  backgroundSize: '100% 100%',
  backgroundRepeat: 'no-repeat'
})
</script>

<style scoped lang="less">
.event-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.event-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  /* 背景图通过 style 动态设置 */

  .event-icon {
    width: 24px;   /* Figma 1:2345: figmaBox.width */
    height: 24px;  /* Figma 1:2345: figmaBox.height */
    flex-shrink: 0;
  }

  .event-name {
    flex: 1;
    font-size: @fontSize;
    color: @colorTextBase;
  }

  .event-value {
    font-size: @fontSize;
    font-weight: @fontWeightStrong;
    color: @colorPrimary;
  }
}
</style>
```

---

## 10. 子组件资源使用规范 🆕

### 核心原则

**子组件是独立文件，无法直接访问父组件的资源变量。**

### 错误示例

```vue
<!-- ❌ 错误：子组件直接使用父组件的资源变量 -->
<template>
  <div class="tab-item" :style="{ backgroundImage: `url(${bg3})` }">
    {{ label }}
  </div>
</template>

<script setup>
// bg3 未定义，会导致编译失败
const props = defineProps({ label: String })
</script>
```

**问题**：`bg3` 是父组件导入的变量，子组件无法访问。

---

### 正确方案

#### 方案 A：通过 Props 传递（推荐）

```vue
<!-- ✅ 正确：父组件传递资源 -->
<!-- 父组件 index.vue -->
<template>
  <TabItem 
    :label="tab.label" 
    :background-image="bg3"
    :is-active="activeTab === tab.value"
  />
</template>

<script setup>
import bg3 from '../resources/images/bg-tab-active.png'
</script>

<!-- 子组件 TabItem.vue -->
<template>
  <div 
    class="tab-item" 
    :style="isActive ? { backgroundImage: `url(${backgroundImage})` } : {}"
  >
    {{ label }}
  </div>
</template>

<script setup>
const props = defineProps({
  label: String,
  backgroundImage: String,
  isActive: Boolean
})
</script>
```

#### 方案 B：使用 CSS 类名（推荐）

```vue
<!-- ✅ 正确：通过 CSS 类控制样式 -->
<!-- 子组件 -->
<template>
  <div :class="['tab-item', { 'tab-item-active': isActive }]">
    {{ label }}
  </div>
</template>

<script setup>
const props = defineProps({
  label: String,
  isActive: Boolean
})
</script>

<style scoped>
.tab-item {
  /* 基础样式 */
}

.tab-item-active {
  /* 激活状态样式由父组件的 common.less 定义 */
  /* 或在此处定义固定样式 */
  background: linear-gradient(180deg, #1099b1 0%, #038fff 100%);
  color: #ffffff;
}
</style>
```

#### 🔴 方案 C：子组件自己导入资源（**禁止**）

> ⛔ **硬性契约（P0/D，2026-09-09）**：**资源变量（bg1/icon1/img1/语义名）只在主组件 `package/index.vue` 的 `<script setup>` import 一次**；子组件（`package/components/*.vue`）**绝不允许本地 `import ... from '...png'` 资源**，一律通过 `defineProps` 接收、由主组件调用处 `:prop="prop"` 透传。

```vue
<!-- ❌ 禁止：子组件独立导入资源（会触发 CODE-019 不收敛 + CODE-018 误判） -->
<script setup>
import bgActive from '../../resources/images/bg-tab-active.png'  // ❌ 禁止
const props = defineProps({ label: String, isActive: Boolean })
</script>

<!-- ✅ 正确：子组件只通过 defineProps 接收 -->
<template>
  <div :style="isActive ? { backgroundImage: `url(${bgActive})` } : {}">
    {{ label }}
  </div>
</template>
<script setup>
const props = defineProps({
  label: String,
  isActive: Boolean,
  bgActive: { type: String, required: true },  // ✅ 资源由父透传
})
</script>
```

**为什么禁止子组件本地导入资源**：
- 违反「资源单一数据源」契约：父子双份持有 → 主组件漏传、子组件本地 import 冲突 → CODE-019 反复 BLOCK 不收敛（env-monitor d2311f17 实锤 3×BLOCK）
- 子组件 `/components/` 路径的 `../../resources/images/` 易被语义门禁/去重误伤
- 后处理器会自动把子组件本地资源 import 改写为 `defineProps` 资源 prop（确定性，不依赖模型遵守 prompt）；**不要再手写本地资源 import**

---

### 最佳实践总结

| 场景 | 推荐方案 | 原因 |
|------|---------|------|
| 动态背景图 | Props 传递 | 灵活，父组件控制 |
| 固定样式（激活态） | CSS 类名 | 简洁，性能好 |
| 图标 | Props 传递 | 可复用，易测试 |

### 自动修复机制（P0/D 契约，2026-09-09 更新）

- **主组件** `package/index.vue`：系统自动 import **全部** success 资源（forceAll），作为子组件透传的唯一来源。
- **子组件** `package/components/*.vue`：系统自动把本地资源 import **改写为 `defineProps` 资源 prop**，并**不再补注入本地资源 import**。
- 主组件调用子组件处缺失的 `:prop="prop"` 透传：系统确定性自动补线（autoWire），不依赖模型遵守 prompt。
- **模型唯一要做的**：子组件模板里**直接用资源变量名**（`<img :src="icon1">` / `url(${bg1})`），别手写 import，也别在调用处省略 props —— 其余由后处理器兜底。

---

## 总结

静态资源处理的核心要点：

1. **目录结构**：`images/` 放背景图，`icons/` 放图标
2. **引用路径**：严格按照资源类型使用正确路径
3. **使用方式**：背景图用 CSS background，图标用 img 标签
4. **尺寸来源**：必须来自 Figma 数据，不能用图片原始像素
5. **Preview 占位**：添加 `__has-bg` 类名和 TODO 注释
6. **子组件资源**：通过 Props 传递或 CSS 类名，禁止直接使用父组件变量
6. **文件格式**：图标优先 SVG，照片用 PNG/JPG
