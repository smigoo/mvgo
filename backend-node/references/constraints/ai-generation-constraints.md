# AI 生成约束（mc-gen 专用）

本文件面向 **AI 代码生成阶段**（`mc-gen --preview` / `mc-gen --figma`）的约束规则，不是面向终端用户的"如何使用"说明。

目标：减少大模型"自作主张"造成的 UI/交互偏差，保证生成结果可运行且贴合设计稿。

## 0. 微码组件核心规范（🔴 必须遵守，违反则直接报错）

### 🔴 必须使用 `<script setup>` 语法

**所有 Vue 组件（包括子组件）必须使用 `<script setup>` 语法，禁止使用 Options API 或普通 `<script>` + `setup()` 函数。**

```vue
<!-- ✅ 正确：script setup -->
<script setup>
import { ref } from 'vue'
const count = ref(0)
</script>

<!-- ❌ 错误：Options API -->
<script>
export default {
  setup() {
    const count = ref(0)
    return { count }
  }
}
</script>
```

### 🔴 必须使用 `$mcComponentBuilder()` 并正确调用

**主组件 `package/index.vue` 必须：**
1. 调用 `$mcComponentBuilder()` **且只能调用一次**
2. 通过解构获取 `runtimeBuilder`
3. 在 `onMounted` 中触发 `{componentId}-onload` 事件

```vue
<script setup>
import { onMounted } from 'vue'

// ✅ 正确：直接解构（声明+赋值一体，只能调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// ✅ 正确：触发 onload 事件
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('my-component-onload', {
    componentId: 'my-component',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
})
</script>
```

**❌ 错误示例（绝对禁止）：**
```javascript
// ❌ 错误 1: 直接调用，不解构
$mcComponentBuilder({
  eventName: 'my-component-onload',
  payload: { onLoad: true }
})

// ❌ 错误 2: 没有触发 onload 事件
const { runtimeBuilder } = $mcComponentBuilder()
// 缺少 runtimeBuilder.publishEvent('my-component-onload', ...)

// ❌ 错误 3: 用 let + try-catch 分离声明与赋值（会触发 TDZ：Cannot access 'runtimeBuilder' before initialization）
let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) { console.warn(e) }
```

### 🔴 declare.json 必须声明 businessEvents

**`declare.json` 的 `businessEvents` 不能为空对象，必须至少声明 `{componentId}-onload` 事件：**

```json
{
  "businessEvents": {
    "my-component-onload": {
      "eventId": "my-component-onload",
      "eventName": "组件加载完成",
      "eventDataSchema": {
        "componentId": { "key": "componentId", "name": "组件ID", "type": "string" },
        "timestamp": { "key": "timestamp", "name": "时间戳", "type": "number" }
      }
    }
  }
}
```

### 🔴 declare.json 的 componentName 必须从预览图识别

**`declare.json` 的 `componentName` 字段必须使用预览图上的组件面板中文标题，禁止使用组件英文名或 componentId：**

**错误示例：**
```json
{
  "componentId": "c-jytunnel-traffic-monitoring",
  "componentName": "c-jytunnel-traffic-monitoring"  // ❌ 错误：使用了英文名
}
```

**正确示例：**
```json
{
  "componentId": "c-jytunnel-traffic-monitoring",
  "componentName": "流量监测"  // ✅ 正确：使用预览图上的中文标题
}
```

**约束规则：**
1. 从预览图左上角或顶部识别组件的中文标题
2. 将识别到的中文标题填入 `declare.json` 的 `componentName`
3. 禁止使用 componentId 或英文名作为 componentName

### 🔴 禁止生成组件命名的 less 文件

**样式文件命名规则：**
- ✅ 允许：`index.less`、`common.less`、`variables.less`
- ❌ 禁止：`c-jytunnel-traffic-monitoring.less`、`my-component.less` 等使用组件名命名的文件

**错误示例：**
```
resources/styles/
├── index.less
├── common.less
├── c-jytunnel-traffic-monitoring.less  // ❌ 错误：使用组件名命名
├── layout.less                          // ❌ 错误：单独的业务样式文件
└── components.less                      // ❌ 错误：单独的业务样式文件
```

**正确示例：**
```
resources/styles/
├── index.less
├── common.less      // ✅ 正确：所有业务样式都写在这里
└── variables.less
```

**约束规则：**
1. 禁止使用组件名或 componentId 作为样式文件名
3. **所有业务样式必须直接写在 `common.less` 中**，使用注释分段组织（如 `// === 设备汇总 ===`）
4. 只允许创建 `variables.less`（变量定义）和 `themes/` 目录下的主题文件

### 🔴 样式必须在主组件的 `<style scoped>` 中引入

**只有主组件 `package/index.vue` 需要在 `<style scoped>` 标签中通过 `@import` 引入样式入口文件，子组件不需要：**

**错误示例：**
```vue
<!-- ❌ 错误：在 script 中引入样式 -->
<script setup>
import '../resources/styles/index.less'  // ❌ 禁止在 script 中引入
</script>
```

**正确示例：**
```vue
<!-- ✅ 正确：在 style scoped 中引入 -->
<template>
  <base-panel panelKey="default-panel">
    <div class="my-component">
      <!-- 组件内容 -->
    </div>
  </base-panel>
</template>

<script setup>
// 不要在这里 import 样式
import { ref } from 'vue'
</script>

<style scoped>
@import '../resources/styles/index.less';
</style>
```

**约束规则：**
1. 主组件 `package/index.vue` 必须 `<style scoped>@import '../resources/styles/index.less';</style>`
2. 子组件 `package/components/*.vue` **禁止**添加 `<style scoped>` 块（样式已通过主组件引入）
3. 禁止在 `<script setup>` 中 import 样式文件
4. 禁止在 `.vue` 文件中直接写 CSS 样式代码，所有样式必须放在 `resources/styles/` 目录

### 🔴 禁止使用 Emoji 作为功能图标

**后台、工具型、管理型组件禁止使用 emoji 作为功能图标、状态图标或高频列表操作按钮。**

**禁止示例：**
```vue
<!-- ❌ 错误：emoji 承担功能语义 -->
<button title="刷新">🔄 刷新</button>
<button title="下载">📦</button>
<button title="删除">🗑</button>
<button title="暂停">⏸</button>
<button title="恢复">▶</button>
<button title="取消">✕</button>
```

**正确示例：**
```vue
<!-- ✅ 正确：使用正式图标组件/SVG，并提供可访问语义 -->
<button class="action-btn" title="下载组件包" aria-label="下载组件包">
  <DownloadIcon />
</button>
<button class="action-btn danger" title="删除任务" aria-label="删除任务">
  <DeleteIcon />
</button>
```

**约束规则：**
1. 刷新、下载、删除、暂停、恢复、取消、查看、编辑等功能操作禁止使用 emoji 表达。
2. 高频列表、表格操作栏中禁止出现 emoji 操作按钮。
3. 图标按钮必须提供 `title` 或 `aria-label`。
4. 危险操作必须有明确危险态反馈，如删除按钮 hover 使用红色。
5. emoji 仅允许用于空状态、非关键轻量提示或临时 demo 占位，最终产物必须替换为正式图标。

### 🔴 禁止生成组件面板标题和边框样式

**组件使用 `<base-panel>` 包裹，面板的标题、边框、背景、阴影等样式已由 `default-panel` 统一处理，禁止在组件内容中重复生成：**

**面板自动处理的元素（禁止生成）：**
| 元素 | 处理方 | 禁止行为 |
|------|--------|---------|
| 组件标题 | `default-panel` 通过 `componentName` 自动显示 | ❌ 禁止生成标题栏、标题文字 |
| 面板边框 | `default-panel` 统一样式 | ❌ 禁止设置 border、border-radius |
| 面板背景 | `default-panel` 统一背景色 | ❌ 禁止设置 background-color |
| 面板阴影 | `default-panel` 统一阴影 | ❌ 禁止设置 box-shadow |
| 面板内边距 | `default-panel` 已处理组件与边界的间距 | ❌ 禁止在最外层设置 padding |
| 标题装饰线 | `default-panel` 底部装饰线 | ❌ 禁止生成底部装饰线、圆点 |

**错误示例：**
```vue
<!-- ❌ 错误：生成了面板标题 -->
<template>
  <base-panel panelKey="default-panel">
    <div class="my-component">
      <div class="header">
        <span class="title-text">流量监测</span>  <!-- ❌ 禁止：标题已由面板自动显示 -->
      </div>
      <!-- 业务内容 -->
    </div>
  </base-panel>
</template>
```

```css
/* ❌ 错误：重复设置面板样式 */
.my-component {
  padding: 16px;              /* ❌ 禁止：base-panel 已处理 */
  background-color: #fff;     /* ❌ 禁止：base-panel 已处理 */
  border-radius: 8px;         /* ❌ 禁止：base-panel 已处理 */
  box-shadow: 0 2px 8px;      /* ❌ 禁止：base-panel 已处理 */
}
```

**正确示例：**
```vue
<!-- ✅ 正确：不生成面板标题，只生成业务内容 -->
<template>
  <base-panel panelKey="default-panel">
    <div class="my-component">
      <!-- 只包含业务内容，不包含面板标题 -->
      <div class="section-header">
        <span class="section-title">当日总流量</span>
      </div>
      <!-- 业务内容 -->
    </div>
  </base-panel>
</template>
```

```css
/* ✅ 正确：最外层不设置 padding、background、border 等 */
.my-component {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  /* 内容区域的间距用 margin 或内部元素的 padding 实现 */
}
```

**约束规则：**
1. 预览图左上角/顶部的组件标题（如"流量监测"）**不要生成**，它会通过 `declare.json.componentName` 自动显示在面板上
2. 组件最外层禁止设置 `padding`、`background-color`、`border-radius`、`box-shadow`、`border`
3. 组件内容区域的间距使用 `margin` 或内部元素的 `padding` 实现
4. 只生成预览图中面板内容区域（标题栏下方）的业务元素

### 🔴 纯 Less 变量主题模式（必须遵守）

**组件采用纯 Less 变量模式实现双主题（dark/light），变量定义在 `theme-vars.less` 的 mixin 中，通过 `&.dark` / `&.light` CSS 类名作用域隔离。**

**架构说明：**
```
theme-vars.less  定义三个 mixin：
  .common()     → 框架级 CSS 变量（可选）
  .theme-dark() → 深色 Less 变量硬编码值
  .theme-light()→ 浅色 Less 变量硬编码值
  .theme-light(); → 全局调用作为默认值（子组件可用）

dark.less:       &.dark { .theme-dark(); @import(multiple) '../common.less'; }
light.less:      &.light { .theme-light(); @import(multiple) '../common.less'; }

index.vue:      :class="['component-name', theme]"  // theme = 'dark' | 'light'
```

**正确示例：**
```less
/* ✅ 正确：theme-vars.less 中定义 mixin */
.theme-dark() {
  @color-tab-default-text: #18ffce;
  @color-btn-bg: rgba(255,255,255,0.12);
}
.theme-light() {
  @color-tab-default-text: #2c9bea;
  @color-btn-bg: #ffffff;
}
.theme-light(); /* 全局默认 */

/* ✅ 正确：common.less 直接使用变量，无需 @import variables */
.section-tabs .tab-item {
  color: @color-tab-default-text; /* dark时=#18ffce, light时=#2c9bea */
}

/* ✅ 正确：dark.less / light.less 使用作用域 + multiple 导入 */
&.dark {
  .theme-dark();
  @import (multiple) '../common.less';
  /* 可在此添加深色特有样式（非颜色差异） */
}
```

**错误示例：**
```less
/* ❌ 错误：使用 CSS var() 导致 lighten/darken 等 Less 函数不可用 */
@color-btn-bg: var(--color-btn-bg, #ffffff);

/* ❌ 错误：common.less 引入不存在的 variables.less */
@import './variables.less';

/* ❌ 错误：dark.less/light.less 内容为空或没有 &.dark/&.light 包裹 */
/* 空文件 */
```

**约束规则：**
1. **所有主题变量必须在 `.theme-dark()` 和 `.theme-light()` mixin 中分别定义**
2. **`theme-vars.less` 末尾必须调用 `.theme-light()` 作为全局默认值**（确保子组件 scoped 样式中变量可用）
3. **`dark.less` / `light.less` 必须以 `&.dark { }` / `&.light { }` 开头，内部调用对应 mixin + `@import (multiple) '../common.less'`**
4. **`index.less` 中 `@import (multiple) './common.less'` 必须在 dark/light 之前顶层导入一次**（确保布局样式全局可用）
5. **禁止使用 `var(--xxx)` 定义变量**（会导致 lighten/darken/saturate 等 Less 颜色函数编译报错）
6. **不需要 `variables.less` 文件**（变量统一在 `theme-vars.less` 的 mixin 中管理）

### 🔴 禁止在 @import 中使用 when 语法

**Less 的 `@import` 语句不支持 `when` 守卫，这会导致编译报错 `Missing closing ')'`：**

**错误示例：**
```less
/* ❌ 错误：Less 不支持 import when */
@import './themes/dark.less' when (@theme = 'dark');
@import './themes/light.less' when (@theme = 'light');
```

**正确示例：**
```less
/* ✅ 正确：直接引入，由框架处理主题切换 */
@import './themes/dark.less';
@import './themes/light.less';
```

**约束规则：**
1. `index.less` 中直接引入所有主题文件
2. 禁止使用 `when`、`if` 等条件语法修饰 `@import`
3. 主题切换逻辑应由 CSS 类名或框架变量控制，而非 Less 编译时控制

### 🔴 样式文件必须完整引用

### 🔴 子组件必须使用 defineProps

**子组件必须使用 `<script setup>` 的 `defineProps` 宏，禁止使用 Options API 的 `props` 配置：**

```vue
<!-- ✅ 正确：defineProps -->
<script setup>
const props = defineProps({
  title: { type: String, default: '' }
})
</script>

<!-- ❌ 错误：Options API -->
<script>
export default {
  props: { title: { type: String, default: '' } }
}
</script>
```

---

## 0.5. Preview 阶段最低样式标准（🔴 必须遵守）

**Preview 阶段虽然是初版，但必须保证基本的可预览性，不能只输出结构而忽略样式。**

### 🔴 必须实现的基础样式

| 样式项 | Preview 要求 | 示例 |
|--------|-------------|------|
| **字号层级** | 必须区分标题、正文、数值字号 | 标题 16px、正文 14px、大数值 20-28px |
| **颜色映射** | 必须使用预览图可见的关键颜色 | 主色（蓝色系）、强调色（红色/橙色/绿色） |
| **背景色** | 卡片/区块必须有可见背景 | background: rgba(230, 242, 255, 0.8) 或预览图可见的背景色 |
| **间距** | 必须设置合理的 gap/padding | 卡片间距 12px、内容 padding 12-16px |
| **圆角** | 预览图明显有圆角时必须添加 | border-radius: 4-8px（保守估计） |
| **图标位置** | 必须预留图标空容器 | div.card-icon-wrapper，设置宽高 |
| **Tab 切换** | 必须有激活态样式区分 | 激活态背景色/文字颜色变化 |
| **数值强调** | 关键数值必须大字号 + 强调色 | 异常数红色、完好率绿色 |

### 🔴 Preview 禁止的行为

1. 所有元素都是默认白色背景，看不出区块划分
2. 所有文字都是默认黑色，没有颜色层级
3. 所有元素紧贴在一起，没有间距
4. Tab 切换只有点击事件，没有激活态样式
5. 图标位置完全没有预留，导致布局错位
6. 关键数值和普通文字字号相同，无法区分

### 🔴 自检清单（Preview 生成后必须确认）

- 每个卡片/区块都有可见背景色
- 关键数值使用大字号（≥20px）和强调色
- Tab/按钮有激活态样式区分
- 图标位置有空容器占位（设置 width/height）
- 元素之间有合理间距（gap ≥ 8px）
- 预览图明显有圆角的元素添加了 border-radius
- 文字颜色有层级区分（标题深、正文浅、数值强调）

---

## 1. 设计稿的"状态/瞬态"识别（必须）

设计稿中常见的悬浮态、交互态、展开态（通常用于表达交互效果），默认 **不应作为常驻 UI 元素** 写入模板：

- tooltip / popover / 悬浮气泡
- 下拉展开面板
- 日期选择器弹层
- hover 高亮态的临时背景

### 图表 tooltip（ECharts）

1. 只要组件中存在 ECharts 图表，就**必须**提供 `option.tooltip`；**禁止**省略 tooltip，**禁止**写 `tooltip: { show: false }`。
2. 设计图里出现 tooltip 气泡，默认只代表"交互时出现"的效果，而不是常驻 UI。
3. **禁止**在 `<template>` 写死一个 tooltip DOM 盒子当成常驻元素。
4. 没有设计证据时，也必须保留默认 tooltip：
   - 折线图 / 柱状图 / 面积图等坐标系图表，默认使用 `tooltip.trigger = 'axis'`
   - 饼图 / 散点图 / 仪表盘等非坐标系图表，默认使用 `tooltip.trigger = 'item'`
5. 如果设计图或分析结果里出现了 tooltip 视觉证据，必须优先还原 `trigger / backgroundColor / border / textStyle / axisPointer / formatter` 等样式与内容结构。
6. **禁止**无需求地在 `onMounted` 中调用 `chart.dispatchAction({ type: 'showTip' })` 强行常驻展示。
7. 如需默认展示 tooltip，必须在需求中明确写出"默认展示 tooltip"，并在代码中注明理由。

## 2. 样式"证据优先"（必须）

### 🔴 禁止自行添加任何装饰样式

**绝对禁止自行添加以下样式，除非 Figma 数据或预览图中明确存在：**

| 禁止自行添加 | 判断依据 |
|-------------|---------|
| `border-radius` | Figma 节点的 `cornerRadius` > 0 或预览图明显圆角 |
| `background` (纯色/渐变) | Figma 节点的 `fills` 存在且非空，或预览图明显有背景 |
| `box-shadow` | Figma 节点的 `effects` 存在且 type 为 DROP_SHADOW |
| `border` | Figma 节点的 `strokes` 存在且非空 |
| `padding` | Figma 节点有明确内容间距 |

### 🔴 零装饰原则

1. **默认不添加任何装饰**：生成代码时，默认假设元素无圆角、无背景、无阴影、无边框
2. **有证据才添加**：只有当 Figma 数据明确存在对应属性时，才添加对应样式
3. **证据来源优先级**：
   - Figma API 数据（cornerRadius、fills、effects、strokes）> 预览图肉眼识别 > 不添加
4. **宁可缺失，不可臆造**：如果无法确定是否存在某样式，选择不添加

### 背景处理（bg 节点）

- 若背景节点本质是 **纯色/渐变**，且 Figma 数据提供完整参数，允许使用 CSS `background` 精确还原。
- 若背景节点为 **图片切片/纹理/复杂光效** 等难以用 CSS 精确还原的效果，必须使用下载的图片资源，但**禁止用 ESM `import`** 引入本地图片文件（见下方硬规则），应改用 base64 内联或 CSS `background-image: url()` / `<img :src>` 同源路径。
- 禁止用随意的 `#fff`、默认渐变、默认阴影去替代设计稿背景。

### 🔴 禁止 ESM import 本地图片资源（RUNTIME-004 根因）

微码组件预览加载机制**无法解析组件内的 `import '*.png/jpg/gif/webp/svg'`**：
- 开发环境：`loadDev()` 用 `import(/* @vite-ignore */ component.js)` 原生加载，浏览器原生 import 二进制图片失败。
- 生产环境：`loadProd()` 走 `vue3-sfc-loader` 且无图片 `handleModule`，import 解析失败。

两者都会触发运行时质量门禁 `[RUNTIME-004] load-error`，且该门禁为 BLOCK 级，AI 首次质量检查即阻断、无机会迭代修订。

**禁止写法**：
```js
import icon from '../resources/images/foo.png'   // ❌ 触发 RUNTIME-004
```

**必须改用以下任一（本地/生产均安全）**：
1. **base64 内联（首选）**：`const icon = 'data:image/png;base64,iVBORw0KGgo...'`。后端 CSP `img-src data:` 已放行，组件自包含，DEV/PROD 通用。
2. **同源 URL（运行时 `<img :src>` 或 CSS `url()`）**：
   - 开发：`/workspace/custom-components/{id}/resources/images/foo.png`
   - 生产：`/api/preview/{groupId}/{id}/resources/images/foo.png`（同源，CSP `img-src 'self'` 放行）
3. **外部在线 URL**：⚠️ **仅开发环境可用**；生产 CSP `img-src 'self'` 会拦截跨域图片，**禁止依赖**。

### 🔴 禁止默认"卡片化"

**绝对禁止对子模块默认添加卡片样式。**

以下样式仅在 Figma 数据明确存在时才可添加：

```less
// ❌ 禁止默认添加
.some-module {
  background: #fff;           // 仅当 fills 存在时添加
  border-radius: 8px;         // 仅当 cornerRadius > 0 时添加
  padding: 16px;              // 仅当有明确间距时添加
  box-shadow: 0 2px 8px ...;  // 仅当 effects 存在时添加
}

// ✅ 正确做法：默认无装饰
.some-module {
  // 无 background、border-radius、padding、box-shadow
  // 仅添加布局相关样式（display、flex、gap、width、height 等）
}
```

## 2.5. Tab/Select 切换约束（必须）

### 🔴 Tab/Select 切换必须实现数据联动

**如果预览图中存在 Tab 切换或 Select 下拉（如"24 小时/7 天/30 天"或"隧道/大桥"），必须实现切换后更新图表数据。**

实现要求：
1. 用 `ref` 维护当前激活状态：`const activeTab = ref('24h')`
2. 维护不同状态对应的数据源：`const dataMap = { '24h': [...], '7d': [...] }`
3. 使用 `watch` 监听状态变化，并更新图表数据：
   ```javascript
   watch(activeTab, (newTab) => {
     updateChart(dataMap[newTab])
   })
   ```
4. **禁止仅做样式切换（只改 active class）而不更新数据**

正确实现示例：
```vue
<template>
  <div class="tabs">
    <span
      v-for="tab in tabList"
      :key="tab.key"
      :class="['tab-item', { active: activeTab === tab.key }]"
      @click="activeTab = tab.key"
    >
      {{ tab.label }}
    </span>
  </div>
  <div class="chart-body">
    <div ref="chartRef" class="chart-container" />
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const activeTab = ref('24h')
const tabList = [
  { key: '24h', label: '24 小时' },
  { key: '7d', label: '7 天' }
]

const dataMap = {
  '24h': [10, 20, 30],
  '7d': [100, 200, 300]
}

const chartRef = ref(null)
let chart = null
let chartObserver = null

const updateChart = () => {
  if (!chart) return
  const data = dataMap[activeTab.value]
  chart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { containLabel: true },
    xAxis: { type: 'category', data: ['1', '2', '3'] },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data }]
  }, true)
}

const initChart = () => {
  if (!chartRef.value) return
  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart = echarts.init(chartRef.value)
    updateChart()
    return
  }
  chartObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !chart) {
      chartObserver?.disconnect()
      chart = echarts.init(chartRef.value)
      updateChart()
    }
  })
  chartObserver.observe(chartRef.value)
}

watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

watch(activeTab, () => { updateChart() })

onMounted(() => { initChart() })

onUnmounted(() => {
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>
```

### 禁止的行为

1. ❌ Tab 切换只改变样式（active class），不更新图表数据
2. ❌ Select 切换不触发任何数据更新
3. ❌ 数据写死在模板中，没有根据状态动态变化

## 3. base-panel 约束（必须）

1. 外层 padding/background/radius/shadow 由 `base-panel` 处理，组件根容器不应重复设置。
2. 组件内部如需间距，用内部元素的 margin/局部 padding 表达，不要给根容器做"再包一层卡片"。

## 4. 图例交互约束（必须）

### 🔴 自定义图例必须与图表联动

**如果预览图中存在图表图例（如"北京方向"/"上海方向"等），必须实现点击图例切换系列显示的功能。**

实现要求：
1. 用 `ref` 维护每个系列的显示状态：`const legendState = ref({ beijing: true, shanghai: true })`
2. 点击图例时调用 `chart.dispatchAction({ type: 'legendToggleSelect', name: seriesName })`
3. 图例 DOM 的激活样式与 legendState 绑定：`:class="{ active: legendState.beijing }"`
4. **禁止使用 ECharts 内置 legend 组件替代自定义图例**（除非设计稿明确使用内置图例）

正确实现示例：
```vue
<template>
  <div class="chart-legend">
    <span 
      class="legend-item" 
      :class="{ active: legendState.beijing }" 
      @click="toggleLegend('北京方向')"
    >
      <i class="dot dark-blue"></i>北京方向
    </span>
    <span 
      class="legend-item" 
      :class="{ active: legendState.shanghai }" 
      @click="toggleLegend('上海方向')"
    >
      <i class="dot light-blue"></i>上海方向
    </span>
  </div>
  <div class="chart-body">
    <div ref="chartRef" class="chart-container" />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const chartRef = ref(null)
let chart = null

// 图例状态
const legendState = ref({ beijing: true, shanghai: true })

// 切换图例
const toggleLegend = (name) => {
  chart?.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
}

const updateChart = () => {
  if (!chart) return
  chart.setOption({
    legend: { data: ['北京方向', '上海方向'] },
    tooltip: { trigger: 'axis' },
    grid: { containLabel: true },
    // ... 其他配置
  }, true)
}

const initChart = () => {
  if (!chartRef.value) return
  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart = echarts.init(chartRef.value)
    updateChart()
  }
}

watch(chartRef, (newRef) => { if (newRef && !chart) initChart() })

onMounted(() => { initChart() })
onUnmounted(() => { chart?.dispose() })
</script>
```

### 禁止的行为

1. ❌ 图例是静态 DOM，没有点击事件
2. ❌ 图例点击后图表不响应
3. ❌ 使用 ECharts 内置 legend 组件替代自定义图例（除非设计稿明确使用）

## 5. 宽度自适应约束（必须）

### 🔴 容器布局禁止固定宽度

**组件内部布局必须自适应容器宽度，禁止使用固定 px 宽度限制容器伸缩。**

| 场景 | 禁止 | 正确 |
|------|------|------|
| 并排等宽元素 | `width: 200px` | `flex: 1` |
| 并排不等宽 | 固定 px | `flex: 2` / `flex: 1` 比例 |
| 容器内子元素 | `width: 400px` | `width: 100%` 或 `flex: 1` |

```less
// ❌ 禁止：固定宽度，无法自适应
.panel { width: 400px; }
.card-left { width: 200px; }
.card-right { width: 200px; }

// ✅ 正确：flex 布局自适应
.panel { width: 100%; display: flex; gap: 12px; }
.card-left { flex: 1; }
.card-right { flex: 1; }
```

**例外**：图标、小圆点、分隔线等装饰性小元素可使用固定 px 宽度

**补充规则：**
1. 内部布局容器（Tab 条、图表区、卡片排布区、列表区）默认先满足 `width: 100%` / `flex: 1` / `min-width: 0`
2. Figma 的像素宽度优先作为比例、上限和视觉参考，不应直接写成会撑破父容器的固定宽度
3. 图片、Icon 可保留原始 intrinsic size，但在自适应容器内必须保证 `max-width: 100%` 或由父容器安全裁切
4. 背景图优先挂到已有父容器，父容器跟随布局宽度；不要为了贴 Figma 原图尺寸把父容器写死成固定 px
5. 任何内部元素超出组件根容器都视为错误；必要时补 `overflow: hidden`

## 6. 标题对齐约束（必须）

### 🔴 区域标题必须统一左对齐

**错误示例：**
```less
// ❌ 错误：使用 space-between 导致标题位置不固定
.section-header {
  display: flex;
  justify-content: space-between;  // 会根据子元素数量变化位置
}
```

**正确示例：**
```less
// ✅ 正确：标题始终左对齐，右侧元素使用 margin-left: auto
.section-header {
  display: flex;
  align-items: center;
  
  .section-title {
    // 标题自然靠左
  }
  
  .time-filter,
  .tab-group {
    margin-left: auto;  // 右侧元素自动推到右边
  }
}
```

**约束规则：**
1. 区域标题（如"当日总流量"、"车型分布"、"流量预测"）必须始终左对齐
2. 右侧的操作元素（筛选器、Tab、链接等）使用 `margin-left: auto` 实现右对齐
3. 禁止使用 `justify-content: space-between` 来布局标题行
4. 禁止使用 `justify-content: center` 来居中标题（除非设计稿明确要求居中）

## 6.5 Select/下拉框识别约束（必须）

### 🔴 正确识别 Select 下拉框特征

**Select 下拉框的视觉特征**:
- 文字 + 边框矩形 + 下拉箭头(▼)
- 不是简单的切换按钮

**错误实现示例**:
```vue
<!-- ❌ 错误：当作切换按钮 -->
<div @click="toggle">
  <span>{{ value }}</span>
  <span class="arrow"></span>
</div>
```

**正确实现示例**:
```vue
<!-- ✅ 正确：完整的下拉框结构 -->
<div class="select-wrapper">
  <div class="select-trigger" @click="showDropdown = !showDropdown">
    <span class="select-value">{{ selectedValue }}</span>
    <span class="select-arrow" :class="{ up: showDropdown }"></span>
  </div>
  <div class="select-dropdown" v-show="showDropdown">
    <div 
      v-for="option in options" 
      :key="option.value"
      class="select-option"
      :class="{ active: selectedValue === option.value }"
      @click="selectOption(option.value)"
    >
      {{ option.label }}
    </div>
  </div>
</div>
```

**约束规则**:
1. 看到"文字+框+箭头"组合,必须识别为 Select 下拉框
2. 必须实现完整的下拉菜单结构(trigger + dropdown)
3. 必须支持点击展开/收起下拉菜单
4. 禁止简化为点击切换两个值的 toggle 按钮
5. 下拉箭头应该根据展开状态旋转(默认向下,展开后向上)

## 7. 图表边界约束（必须）

### 🔴 ECharts 不能超出组件容器

图表"越界"通常不是单一原因，必须同时满足以下约束：

1. 图表容器必须显式设置 `width: 100%`；高度使用 flex 比例分配（`flex: <Figma高度px> 1 0`，grow 直接取设计稿高度值），禁止写死固定像素（如 `height: 180px`）
2. 图表外层 flex 子项必须设置 `min-width: 0`（避免内容挤压导致溢出）
3. ECharts `grid` 必须设置 `containLabel: true`（避免坐标轴文字把画布撑出容器）
4. 必须使用 ResizeObserver + window resize 监听容器/窗口尺寸变化
5. 图表区块建议增加 `overflow: hidden` 作为视觉兜底
6. 图表上方的 Tab、图例、按钮等兄弟区域也必须保持 `width: 100%` / `min-width: 0`，不能因固定宽度把图表容器挤出组件边界

```less
.chart-card {
  flex: 220 1 0;     // flex-grow = 设计稿高度px，按比例分配高度
  min-height: 160px; // 主图兜底（紧凑图 100px）
  min-width: 0;
  overflow: hidden;
}
.chart-container {
  width: 100%;
  height: 100%;      // 撑满父容器
```

```js
// updateChart 通过 chart.setOption(option, true) 更新图表
const updateChart = () => {
  if (!chart) return
  chart.setOption({
    grid: { left: 40, right: 16, top: 20, bottom: 28, containLabel: true },
    // ... 其他配置
  }, true)
}
```
