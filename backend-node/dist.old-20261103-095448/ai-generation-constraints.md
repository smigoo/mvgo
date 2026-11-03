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
2. 子组件 `package/components/*.vue` 的 `<style>` 块**可选**：允许不写（样式由主组件统一引入）；但若写了必须为 `<style lang="less" scoped>` 并 `@import '../../resources/styles/index.less'`，禁止无 `scoped` 的裸 `<style>` 块污染全局
3. 禁止在 `<script setup>` 中 import 样式文件
4. 禁止在 `.vue` 文件中直接写 CSS 样式代码，所有样式必须放在 `resources/styles/` 目录

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

**组件采用纯 Less 变量模式：变量定义在 `theme-vars.less` 的 mixin 中，由系统生成的 `index.less` 在【根作用域】调用默认主题 mixin 后导入 `common.less`。**

**架构说明：**
```
theme-vars.less  只定义三个 mixin（根级不调用）：
  .common()     → 跨主题共享变量
  .theme-dark() → 深色 Less 变量硬编码值
  .theme-light()→ 浅色 Less 变量硬编码值

index.less（系统自动生成，你不要输出）：
  @import './themes/theme-vars.less';
  .common();
  .theme-dark();                        ← 默认主题，与面板 backgroundBrightness 一致
  @import (multiple) './common.less';   ← 业务规则输出到【根作用域】

themes/dark.less / light.less：覆盖层，仅当宿主给组件根注入 .dark/.light 类时才生效
```

**⚠️ 为什么 common.less 必须落在根作用域（血泪教训）：**
宿主 `base-panel` 与前端预览**从不给组件根注入 `.dark` / `.light` 类**。
如果 `common.less` 的规则被包进 `.dark {}`，编译产物就是 `.dark .c-xxx`，
在真实 DOM 上 **0 命中** —— 表现为「HTML 结构和布局都在，但背景、边框、圆角、
图标尺寸、卡片底图、Tab 激态背景、内部 flex/grid 全部丢失」，即组件整体裸奔。

**正确示例：**
```less
/* ✅ theme-vars.less：只定义 mixin，根级不调用 */
.common() {
  @font-cn: 'PingFang SC', sans-serif;
}
.theme-dark() {
  @color-tab-default-text: #18ffce;
  @color-btn-bg: rgba(255,255,255,0.12);
}
.theme-light() {
  @color-tab-default-text: #2c9bea;
  @color-btn-bg: #ffffff;
}

/* ✅ common.less：所有业务 class 顶格写在文件根层，直接使用变量 */
.c-monitor-tabs .c-monitor-tab-item {
  color: @color-tab-default-text;
}
```

**错误示例：**
```less
/* ❌ 致命错误：把业务 class 包进主题/根 class 作用域 → 真实 DOM 0 命中，样式全失效 */
.dark {
  .c-monitor-tab-item { color: #18ffce; }
}
.c-monitor-root {
  .c-monitor-tab-item { color: #18ffce; }   /* 若 root class 本身也在 common.less 内则等价于自我嵌套 */
}

/* ❌ 错误：使用 CSS var() 导致 lighten/darken 等 Less 函数不可用 */
@color-btn-bg: var(--color-btn-bg, #ffffff);

/* ❌ 错误：common.less 引入不存在的 variables.less */
@import './variables.less';
```

**约束规则：**
1. **所有主题变量必须在 `.theme-dark()` 和 `.theme-light()` mixin 中分别定义**
2. **`theme-vars.less` 根级禁止调用任何 mixin**（默认主题由系统生成的 `index.less` 在根作用域调用）
3. **`common.less` 中所有业务 class 必须写在文件根层**，禁止任何外层选择器（含 `.dark`/`.light`/组件根 class）包裹
4. **`index.less` / `dark.less` / `light.less` 由系统自动生成，禁止输出**
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
/* ✅ 正确：无条件直接引入（index.less 由系统生成，此处仅示意语法） */
@import './themes/theme-vars.less';
```

**约束规则：**
1. 禁止使用 `when`、`if` 等条件语法修饰 `@import`
2. 主题切换逻辑由 CSS 类名控制，而非 Less 编译时控制

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
- 若背景节点为 **图片切片/纹理/复杂光效** 等难以用 CSS 精确还原的效果，必须使用下载的图片资源（`import bgUrl from ...`，模板/样式使用变量）。
- 禁止用随意的 `#fff`、默认渐变、默认阴影去替代设计稿背景。

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

## 3. base-panel 约束（必须）

1. 外层 padding/background/radius/shadow 由 `base-panel` 处理，组件根容器不应重复设置。
2. 组件内部如需间距，用内部元素的 margin/局部 padding 表达，不要给根容器做"再包一层卡片"。

## 5. flex 布局约束（必须）

### 🔴 禁止冗余 flex（flex:1 子项 + 无 flex 子属性 = 冗余）

**只有当容器确实需要以下能力时，才使用 `display: flex; flex-direction: column;`：**

| 场景 | 使用 flex 的理由 |
|------|-----------------|
| 容器内有 `flex: 1` 或 `flex-grow: 1` 子项 | 需要子项按弹性比例分配空间 |
| 需要 `align-items` / `justify-content` | 需要对齐方式控制 |
| 需要 `gap` 控制子项间距 | 需要统一间距管理 |
| Figma Auto Layout 明确标注 VERTICAL/HORIZONTAL | 设计稿明确要求 flex 布局 |

**错误示例（冗余 flex）：**
```less
// ❌ 错误：display:flex + flex-direction:column 但没有任何 flex 子属性
.container {
  display: flex;
  flex-direction: column;
  // 没有 flex:1 子项，没有 align/justify，没有 gap
  // 这种布局等价于默认的块级流，flex 是冗余的
}
```

**正确示例：**
```less
// ✅ 正确 1：需要 flex:1 子项分配空间
.container {
  display: flex;
  flex-direction: column;
  
  .header { height: 40px; }
  .content { flex: 1; min-height: 0; }  // 弹性分配
  .footer { height: 30px; }
}

// ✅ 正确 2：需要 gap 控制间距
.container {
  display: flex;
  flex-direction: column;
  gap: 12px;  // 统一间距管理
  
  .card { width: 100%; }
}

// ✅ 正确 3：不需要 flex 时，使用默认块级流
.container {
  // 不写 display:flex，子元素自然堆叠
  .section { margin-bottom: 12px; }
}
```

**约束规则：**
1. **Figma 无 layoutMode 时，默认使用块级流（`display: block`），不要主动加 flex**
2. **如果写了 `display: flex; flex-direction: column;`，必须至少使用以下一项**：
   - `flex: 1` / `flex-grow: 1` 子项
   - `align-items` / `justify-content` / `gap`
   - `align-self` / `flex-shrink` / `margin-top: auto` 等 flex 子属性
3. **如果只需要垂直堆叠 + 间距，用 `margin-bottom` 或 `gap`（块级容器也支持 gap），不要用 flex**
4. **自检清单**：写完 `display: flex; flex-direction: column;` 后，问自己"我需要这个 flex 做什么？"——答不上来就是冗余

### 🔴 flex:1 子项必须搭配 min-height:0

**如果容器内有 `flex: 1` 子项，容器必须设置 `min-height: 0;`，否则高度会被内容撑破（尤其是 echarts/表格类容器）。**

```less
// ❌ 错误：flex:1 子项但容器缺 min-height:0
.container {
  display: flex;
  flex-direction: column;
  height: 300px;
  
  .chart-wrapper {
    flex: 1;
    // 缺少 min-height: 0，echarts 会被内容撑破
  }
}

// ✅ 正确：flex:1 子项 + 容器 min-height:0
.container {
  display: flex;
  flex-direction: column;
  height: 300px;
  min-height: 0;  // ✅ 必需
  
  .chart-wrapper {
    flex: 1;
    min-height: 0;  // ✅ 子项也需要
  }
}
```

### 🔴 子区块高度分配规则

**组件内有多个功能区块（header / tab / 图表区 / footer）时，禁止给内容区块写死固定高度。标准模式：固定功能条用固定高度，内容区块用 `flex: <Figma高度px> 1 0` 比例分配。**

**标准三段式布局**（最常见）：

```less
.root-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;

  // ✅ 固定高度的功能条
  .header { height: 40px; flex-shrink: 0; }
  .tab-bar { height: 32px; flex-shrink: 0; }

  // ✅ 内容区块：flex-grow 直接取设计稿高度值，引擎自动等比分配
  .stat-cards { flex: 110 1 0; min-height: 0; }   // 设计稿 110px
  .chart-area { flex: 220 1 0; min-height: 160px; } // 设计稿 220px（主图兜底 160）

  // ✅ 固定高度的底部
  .footer { height: 28px; flex-shrink: 0; }
}
```

**多图表比例分配**（图表区内有多个图表）：

```less
.chart-area {
  flex: 220 1 0;   // 设计稿高度 220px
  min-height: 0;
  display: flex;
  flex-direction: column;

  // flex-grow 直接取设计稿高度值（如柱状图 220px / 折线图 180px）
  .chart-a { flex: 220 1 0; min-height: 160px; }  // 主图兜底
  .chart-b { flex: 180 1 0; min-height: 160px; }
  .chart-c { flex: 130 1 0; min-height: 100px; }  // 紧凑图（环形）兜底
}
```

**规则总结**：

| 区块类型 | 高度策略 | 示例 |
|---------|---------|------|
| 标题/表头 | 固定高度 + `flex-shrink: 0` | `height: 40px` |
| Tab/筛选条 | 固定高度 + `flex-shrink: 0` | `height: 32px` |
| 图表/数据区 | `flex: <设计稿px> 1 0` + `min-height` 兜底 | 主图 160px / 紧凑图 100px |
| 底部状态栏 | 固定高度 + `flex-shrink: 0` | `height: 28px` |

**自检**：写完布局后，检查是否所有内容区块都是固定高度 — 如果是，改成 `flex: <设计稿px> 1 0` 比例分配。

## 6. 宽度自适应约束（必须）

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

## 7. 标题对齐约束（必须）

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

## 7.5 Select/下拉框识别约束（必须）

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

## 7.6 禁止臆造交互控件（必须）

**仅当 Figma 节点树中确实存在对应交互控件（select/下拉/搜索框/输入框/switch 等）时才生成；设计稿没有的，绝对禁止生成。**

### 🔴 红线

1. 禁止生成 Figma 节点树中不存在的 `<select>` / `<input>` / UI 库下拉（`<a-select>`/`<el-select>`/`<n-select>` 等）及其默认项文案（如「使用默认」「监测类型」「请选择」）。
2. 缺失数据/筛选态时，用**静态占位文本/静态布局**呈现（与设计稿一致即可），**不得套可交互壳**。
3. 「文字+框+箭头」组合只有在 Figma 中确为下拉控件时才按 7.5 实现；若仅是设计稿的纯展示标签/按钮，按普通文本/按钮处理，禁止臆造成下拉。
4. 宁可缺失、不可臆造：无法确定设计稿是否含交互控件时，不生成可交互控件。

**错误示例：**
```vue
<!-- ❌ 错误：设计稿无此控件，模型自行加了下拉 -->
<select class="monitor-type">
  <option>使用默认</option>
  <option>监测类型</option>
</select>

<!-- ❌ 错误：设计稿是静态标签，被臆造成输入框 -->
<input type="text" placeholder="监测类型" />
```

**正确示例：**
```vue
<!-- ✅ 正确：设计稿无交互控件 → 静态文本/布局呈现 -->
<div class="monitor-type-label">监测类型</div>
```

## 7.7 分段/标签控件形态必须对齐 Figma（必须）

**分段控件（Tab 切换 / 步骤条 / 箭头连接式标签）的视觉形态必须以 Figma 节点真值为准，禁止一律渲染成独立圆角矩形按钮。**

### 🔴 红线

1. Figma 中标签是「箭头连接 / 共享边框 / 相邻紧贴」形态 → 渲染为相邻元素共享边框（如 `border-left:none` + `margin-left:-1px`，或用 `:not(:first-child)` 去左边框），整体呈连续条状。
2. Figma 中标签是「独立圆角矩形」形态（每项各自 `cornerRadius`、彼此有间距）→ 才渲染为独立 `border-radius` 项。
3. 判定依据：Figma 节点的 `cornerRadius`、`strokes`、相邻兄弟节点的间距与边框连续性。拿不准时，以设计稿视觉（箭头连续 vs 孤立圆角）为准，禁止默认圆角矩形。
4. 激活态 / 未激活态的颜色、圆角、边框必须与 Figma 一一对应，禁止激活态仍显示默认圆角而设计稿为连续箭头。

**错误示例：**
```vue
<!-- ❌ 错误：设计稿是箭头连接式标签，却渲染成孤立圆角矩形 -->
<div class="tab" v-for="t in tabs" :key="t">{{ t }}</div>
<style>
.tab { border-radius: 16px; border: 1px solid #ddd; } /* 孤立圆角，与设计稿箭头连续不符 */
</style>
```

**正确示例：**
```vue
<!-- ✅ 正确：箭头连接式 → 相邻共享边框 -->
<div class="tab" v-for="(t,i) in tabs" :key="t" :class="{active:i===cur}">{{ t }}</div>
<style>
.tab { border: 1px solid #2b6cb0; border-right: none; }
.tab:last-child { border-right: 1px solid #2b6cb0; }
.tab.active { background: #2b6cb0; color: #fff; }
</style>
```

## 7.8 渐变背景与统计卡信息栏必须还原（必须）

**设计稿的视觉必须用对应 CSS 真实还原：设计是渐变色值 → 用 `linear-gradient`；设计是图片 → 用图片（既有铁律）；设计是纯色 → 用纯色。禁止把渐变/图片降级成纯灰/纯色。**

### 🔴 红线

1. Figma 填充为 `linear-gradient`（GRADIENT_LINEAR）时，必须生成 `background: linear-gradient(<angle>, <c1>, <c2> ...)`（角度与色标取自 Figma 渐变定义），禁止渲染成 `background:#ccc` 之类的纯色降级。
2. 既有的「图片禁止用渐变替代」铁律保持不变（设计是图片就必须用图片）；本红线补上「设计是渐变就还原渐变」的反向缺口。
3. 统计卡（含设备总数 / 完好率 / 在线数等）的标签与数值必须从 Figma 文本节点提取并**真实绑定到数据**，禁止整块缺失或用占位写死。字段文案（如「设备总数」「完好率」）与数值位置须与设计稿一致。

**错误示例：**
```vue
<!-- ❌ 错误：设计稿是蓝灰渐变，渲染成纯灰 -->
<div class="stat-card">设备总数</div>
<style>.stat-card { background: #cccccc; }</style>  /* 渐变被降级 */
```

**正确示例：**
```vue
<!-- ✅ 正确：还原渐变 + 真实字段绑定 -->
<div class="stat-card">
  <span class="label">设备总数</span>
  <span class="value">{{ deviceTotal }}</span>
</div>
<style>
.stat-card { background: linear-gradient(135deg, #e8f1fb 0%, #cfe0f3 100%); }
</style>
```

## 7.9 图标 / 实景图 / 关闭按钮不得丢弃（必须）

**Figma 节点树中存在、且资源映射（resourceDomMapping）已提供的图标 / 实景照片 / 关闭 X 等元素，必须在产物中真实渲染，禁止当作噪声丢弃或漏挂载。**

### 🔴 红线

1. 资源映射中 `previewAnalysisRole === 'icon'` 的图标必须被 `<img :src>` / 背景图使用（与 `bg`/`img` 同属用户自定义命名，代表设计意图，未使用 = 生成失败）。
2. 设计稿含「关闭 X / 关闭按钮 / 退出」语义的节点，必须渲染为真实可点击的关闭元素，禁止整块遗漏。
3. 设计稿含「实景照片 / 车辆图 / 运单图」等 `img` 资源，必须挂到对应 DOM，禁止丢弃。
4. 图标缺失（资源下载失败）时按资源映射的 fallback 规则用 CSS/伪元素/Unicode 替代或留空，**但不得把其他位置的图标挪用**；若资源映射中明明提供了图标却未使用，属生成缺陷。
5. 含「关闭/close/X/icon/照片/实景」语义的节点，在角色推断阶段不得误归为可丢弃噪声。

