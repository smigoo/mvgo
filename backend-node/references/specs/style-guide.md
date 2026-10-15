# 样式开发规范


## 🔴 子组件命名标准（CRITICAL — 强制执行）

除 `index.vue` 外，所有子组件文件名必须使用 **PascalCase（大写开头驼峰）**。

### 命名规则
- **格式**：每个单词首字母大写，无连字符
- **转换方式**：section id (kebab-case) → PascalCase
- **示例**：
  - `daily-total` → `DailyTotal.vue`
  - `tunnel-flow-chart` → `TunnelFlowChart.vue`
  - `vehicle-distribution` → `VehicleDistribution.vue`
  - `flow-prediction` → `FlowPrediction.vue`

### ❌ 禁止
- `daily-total.vue`（kebab-case）
- `Dailytotal.vue`（仅首字母大写）
- `index.vue` 作为子组件名（保留给主入口）

### 🔧 工具链保障
mc-gen 在以下 3 层强制执行 PascalCase：
1. **Prompt 层**：AI 收到的 FILE 路径已为 PascalCase
2. **占位层**：enforceModularStructure() 创建 PascalCase 占位 + 清理旧 kebab 文件
3. **写入层**（utils.cjs）：writePreviewFiles() 自动将 AI 输出的 kebab-case 转 PascalCase 并清理旧文件

---

## 资源引用规则

所有 `resource-dom-mapping.json` 中列出的资源必须被组件代码引用。

### 引用方式
| 资源类型 | usage 字段 | 引用方式 | 示例 |
|---------|-----------|---------|------|
| **bg-[m] / bg** (背景图) | `background-image（去掉CSS border/background）` | CSS `background-image: url()` | `.card { background-image: url('../../images/slot-frame1280-8834.png'); }` |
| **icon** (图标) | `<img :src>` | base64 内联常量 / 同源 URL `<img :src>`（**禁止 `import` 本地图片**） | `const icon = 'data:image/png;base64,...'`（或 `<img :src="/api/preview/{gid}/{id}/resources/icons/xxx.png">`） |

### ⚠️ 注意事项
- **禁止遗漏任何已映射资源** — mc-gen figma 阶段会校验覆盖率并输出 WARN 日志
- **禁止用纯 CSS 渐变替代实际的背景图片**（除非设计稿确实无背景图）
- 图标必须在模板中实际使用（不要只声明不渲染）
- 背景图引用后应移除该元素的 CSS `border` 和 `background-color`（避免叠加）

---

## CSS 变量配置规范

CSS 变量配置详见 `../patterns/css-variable-pattern.md`

### 核心规则

1. **命名格式**：微码平台注入 **camelCase** CSS 变量
   - ✅ `--colorTextBase`（正确）
   - ❌ `--color-text-base`（错误）

2. **theme-vars.less 的 `.common()` 只映射「尺寸/字重」类框架预设**（值写成 `var(--xxx)` 透传）：
   ```less
   .common() {
     @fontSize: var(--fontSize);
     @fontWeightStrong: var(--fontWeightStrong);
     @font-size-base: 14px;
     @border-radius-base: 8px;
     // ... 仅 尺寸/圆角/字重/间距
     // ❌ 禁止 @color-error / @color-xxx: #333333;  —— 语义颜色槽位与字面量色值一律不放这里
   }
   .common();
   ```
   > 🔴 **颜色值一律写进 `.theme-light()` / `.theme-dark()`**（两侧都要有、且**值必须不同**）。
   > `.common()` 里一旦出现 `@colorX`，LESS「首个定义者胜出」会让主题 mixin 的同名定义被静默忽略
   > → 浅/深渲染完全相同（门禁 `THEME-COMMON-COLOR-VAR`）。

3. **业务样式写 Less 变量，不写 `var()`**：
   ```less
   .c-component {
     color: @color-text-primary;   // ✅ 值由 .theme-dark()/.theme-light() 编译期决定
     font-size: @fontSize;         // ✅ .common() 映射好的尺寸变量
     // color: var(--colorTextBase, @color-text-primary);  ❌ 模式 A 残留，已作废
   }
   ```

---

## 样式文件结构（纯 Less 变量主题模式）

```
resources/styles/
├── index.less           # 入口：theme-vars → (multiple)common → dark → light
├── common.less          # 所有业务样式 + 布局（使用 @color-xxx 变量）
└── themes/
    ├── theme-vars.less  # 主题变量定义（.common/.theme-dark/.theme-light mixin）
    ├── dark.less        # &.dark { .theme-dark(); @import(multiple) common; }
    └── light.less       # &.light { .theme-light(); @import(multiple) common; }
```

> **注意**：不再需要 `variables.less`，所有变量统一在 `theme-vars.less` 的 mixin 中管理。

仅当 `themeConfig` 存在时需要 `themes/` 目录。

> **规范要求**：`themeConfig` 为必须配置项（至少一个主题），`css-vars.js` 为必须文件，`resources/styles/index.less` 为必须文件。

### 🔴 业务样式文件规范（严格执行）

**核心原则：所有业务样式必须直接写到 `common.less` 中，不要创建其他业务样式文件。**

**✅ 正确做法：**
- 所有组件的布局、样式、交互样式都写在 `common.less` 中
- 使用注释分段组织样式（如 `// === 设备汇总 ===`）
- `variables.less` 只用于定义变量，不包含样式规则

**❌ 禁止做法：**
- ❌ 禁止创建以组件名命名的样式文件（如 `c-sbjc.less`、`c-traffic.less`）

**示例：**
```less
// common.less
// === 组件容器 ===
.component-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

// === 设备汇总 ===
.summary-cards {
  display: flex;
  gap: 16px;
}

// === 左侧导航 ===
.left-nav {
  display: flex;
  flex-direction: column;
}
```

## css-vars.js 结构

```js
// resources/config/css-vars.js
// 仅当 declare.json 中有 cssVariableConfig 时需要此文件

const common = {
  // 主题无关的变量（字体大小、间距等）
  fontSize: $mcCssBuilder.getCssSize(),
  titleSize: $mcCssBuilder.getCssSize(20),
  colorTextBase: $mcCssBuilder.getConfig('colorTextBase')
}

const dark = {
  // 深色主题变量
  colorPrimary: '#3677f8',
  colorPrimaryBg: '#696969',
  colorTextBase: '#ffffff'
}

const light = {
  // 浅色主题变量
  colorPrimary: '#3677f8',
  colorPrimaryBg: 'transparent',
  colorTextBase: '#011025'
}

export default { common, dark, light }
```

## 纯 Less 变量主题模式（双主题开发）

### 架构概览

组件采用**纯 Less 变量模式**实现 dark/light 双主题切换，通过 CSS 类名 `&.dark` / `&.light` 作用域隔离。

```
编译时（Vite build）:
  index.less
    → @import theme-vars.less   // 定义 .common() .theme-dark() .theme-light()
    → @import (multiple) common.less  // 顶层：布局样式全局可用
    → @import dark.less        // &.dark { .theme-dark(); @import common; }
    → @import light.less       // &.light { .theme-light(); @import common; }

运行时（浏览器）:
  框架注入 componentProps.themeType = 'dark' | 'light' | undefined
    ↓
  index.vue: :class="['component-name', theme]"
    ↓
  DOM: <div class="component-name dark">  或  <div class="component-name light">
    ↓
  浏览器匹配: .component-name.dark { ... }  或  .component-name.light { ... }
```

### 文件职责

| 文件 | 职责 | 关键规则 |
|------|------|----------|
| `index.less` | 入口，按固定顺序导入 | ①theme-vars ②(multiple)common ③dark ④light |
| `themes/theme-vars.less` | 定义 3 个 mixin + 全局调用 `.theme-light()` | `.theme-*` mixin 内**禁止** `var()`；仅 `.common()` 允许尺寸/字重 `var()` 透传，**禁止颜色** |
| `themes/dark.less` | `&.dark {}` 作用域：注入深色变量 + 导入 common | 必须以 `&.dark {` 开头 |
| `themes/light.less` | `&.light {}` 作用域：注入浅色变量 + 导入 common | 必须以 `&.light {` 开头 |
| `common.less` | 所有业务样式和布局 | 使用 `@color-xxx` 变量，**不引入 variables.less** |

### 变量定义方式

```less
// themes/theme-vars.less — 唯一的变量定义源

// 深色变量（从 Figma 深色稿提取）
.theme-dark() {
  @color-tab-default-text: #18ffce;
  @color-btn-bg: rgba(255,255,255,0.12);
  @color-chart-axis: rgba(255,255,255,0.65);
  // ... 所有颜色变量
}

// 浅色变量（从 Figma 浅色稿提取）
.theme-light() {
  @color-tab-default-text: #2c9bea;
  @color-btn-bg: #ffffff;
  @color-chart-axis: #333333;
  // ... 所有颜色变量
}

// 全局默认：浅色值作为兜底（子组件 scoped 样式需要）
.theme-light();
```

**为什么不用 `var(--xxx)`？**
- `var()` 是运行时 CSS 变量，Less 编译期无法解析
- 会导致 `lighten()`、`darken()`、`saturate()` 等 Less 颜色函数全部报错
- 纯 Less 硬编码值在编译期确定，所有 Less 函数正常工作

### 三层默认值保证

即使外部框架没有配置主题，组件也能正常显示浅色：

| 层级 | 位置 | 兜底逻辑 |
|------|------|---------|
| ① Less 层 | `theme-vars.less` 末尾 `.theme-light();` | 全局注入浅色变量，任何作用域都能读到 |
| ② 配置层 | `declare.json` → `themeConfig.default: "light"` | 框架没传 themeType 时 fallback |
| ③ JS 层 | `index.vue` → `=== 'dark' ? 'dark' : 'light'` | 乱值也 fallback 到 light |

### 开发双主题的步骤

1. 从 Figma **浅色稿**提取颜色值 → 写入 `.theme-light() {}`
2. 从 Figma **深色稿**提取颜色值 → 写入 `.theme-dark() {}`
3. 在 `common.less` 中用 `@color-xxx` 变量写布局和业务样式
4. 如果深/浅色有**结构性差异**（非颜色），写在 `dark.less` / `light.less` 的 `&.dark{}` / `&.light{}` 内部
5. JS 侧（ECharts 等）：用 `THEME_COLORS[props.theme]` 对象取值

### index.vue 主题调度

```vue
<script setup>
// 方案 B：framework 的 themeType 为唯一主题源
const theme = computed(() => (componentProps.themeType === 'dark' ? 'dark' : 'light'))
const panelKey = computed(() => (theme.value === 'dark' ? 'dark-panel' : 'default-panel'))
</script>

<template>
  <base-panel :panelKey="panelKey">
    <div :class="['component-name', theme]">
      <!-- 内容 -->
    </div>
  </base-panel>
</template>
```

## 样式使用规范

**响应式单位**（优先级从高到低）：
- `em`：首选，基于组件根字体大小，适合间距、字体
- `$mcCssBuilder.getCssSize(px)`：将设计图 px 转为 rem/px
- `$mcCssBuilder.getCssEm(px)`：将设计图 px 转为 em
- 避免使用大于 5px 的固定 px 值

**样式隔离**：
- 必须使用 `<style scoped>` 或 CSS Modules
- 禁止全局样式污染

**CSS 变量使用**（模式 B：业务样式只写 Less 变量）：
```less
.component {
  font-size: @fontSize;           // ✅ 尺寸走 .common() 映射
  color: @color-text-base;        // ✅ 颜色走主题槽位
  background: @color-bg-container;
  // ❌ 禁止：font-size: var(--fontSize); color: var(--colorTextBase);
}
```

## 统计指标（stat）版式契约（2026-10-14 · cd63d1c5 实锤立项）

Figma 中的「数值 + 标签」统计组（如 `3,792 在线`、`28 离线`）必须按以下契约生成，
禁止自由发挥版式（实锤病灶：四 span 一行横排 `2,138 在线 12 离线`）：

**结构契约**：
- 每组 stat = **一个包裹容器**（如 `.xxx-stat`），内含**数值元素在上、标签元素在下**
  （容器 `display:flex; flex-direction:column; align-items:center`）；
- 多组 stat 之间横向排列（父容器 row + gap）；
- ❌ 禁止把「数值 标签 数值 标签」写成同一容器内连续横排的兄弟 span（无分组容器）。

**状态点契约**：
- Figma 小圆点（≤8px，与数值/标签同行相邻）是**状态点**，必须挂在**对应数值旁**
  （用数值元素的 `::before` 伪元素实现：6px 圆、`margin-right: 4px`）；
- ❌ 禁止把状态点挂到卡片图标/头像上（badge 化是臆造，实锤：`icon-dot` 挂图标右上角）。

**色值契约**：
- 数值色：在线/正向指标走 `@color-success`；离线/异常数值本身**不写红色**，
  红色只给状态点（数值走 `@color-text-design` 主题槽位）。

## 容器底色与强调色契约（2026-10-14 · cd63d1c5 实锤立项，R7/R8）

**容器底色契约（R8）**：
- 组件内容根容器（`*-slot-con`）必须有**显式** `background`，走页面底色主题槽位
  （按产物既有定义取：`@color-bg-page` / `@color-bg-container` / `@color-bg-base` / `@color-bg`）；
- ❌ 禁止根容器透明、依赖预览环境底色——深色主题下卡/底亮度关系会失控
  （实锤：dark 轨 slot-con 无 background，面板成灰底、卡比底还深）。

**强调色使用契约（R7）**：
- `@color-primary` 是品牌/交互**强调色**（按钮、链接、激活态文字、选中描边），
  ❌ **禁止**直接作为卡片/容器的大面积背景——深色轨下亮青/亮蓝纯底 + 白字
  是对比度灾难（实锤：首卡 `background: #44e4ff` 直挂 M4-10 colorPrimary 枚举色）；
- 卡片底色走 bg 系槽位：`@color-bg-card` / `@color-bg-card-active` / `@color-bg-container`；
  强调/激活卡可用 `@color-primary-bg` 或基于 `@color-primary` 的**渐变**槽位
  （如 `linear-gradient(135deg, @color-primary, @color-primary-active)`），禁纯色直挂。

## 列表卡激活态契约（2026-10-14 · 2238359a 实锤立项）

Figma 同构列表卡的填充分布只有三种合法语义，必须严格区分
（实锤病灶：首卡激活态 1 异 5 同被臆造成 `nth-child(odd)` 斑马纹）：

> 🔴 **结构化真值优先**：视觉分析 JSON 顶层的 `repeatedCardTruth`（Figma 确定性注入，
> `{kind:'active'|'uniform'|'zebra', size, activeHex?}`）是本契约的权威事实源。
> 该字段存在时，按其 `kind` 直接按下表生成，**禁止**再从视觉印象重新推断分布。

| Figma fills 分布 | 语义 | 正确产物 |
|------------------|------|----------|
| 全部同色 | 无高亮 | 无任何高亮规则 |
| **恰好 1 张异色**（通常首张） | **激活/选中态** | `:first-child`（或 `.active` 类） |
| ≥4 张严格 ABAB 交替 | 斑马纹 | `nth-child(odd/even)` 仅此时合法 |

**激活态生成契约**：
- 首卡异色 ⇒ 激活态，必须生成 `:first-child` 并**同时配 `:hover` 同色** + `cursor: pointer`
  + `transition: background 0.2s ease`（悬停即预览选中态）：
  ```less
  .x-card {
    background: @color-bg-container;
    &:first-child, &:hover {
      background: @color-bg-card-active;   /* 真值色入槽位，禁直挂 @color-primary */
      cursor: pointer;
      transition: background 0.2s ease;
    }
  }
  ```
- ❌ **禁止**把「1 异 N 同」写成 `:nth-child(odd/even/2n)`——单点激活证据不得泛化为交替模式；
- 激活底色走 bg 系槽位（`@color-bg-card-active` 等，真值色入槽），遵守 R7 强调色契约；
- 卡内子元素（icon 底等）首卡与其余卡不同色时，同样按 `:first-child` 激活语义处理。

## 多布局实现

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

布局子组件只负责展示，通过 props 接收数据：

```vue
<!-- components/LayoutOne.vue -->
<script setup>
defineProps({ componentProps: { type: Object, required: true } })
</script>

<style scoped>
.layout-one {
  font-size: @fontSize;        /* ✅ .common() 映射 */
  color: @color-text-base;     /* ✅ 主题槽位（根作用域 .theme-light()/.theme-dark() 提供） */
}
</style>
```

## base-panel 组件

```vue
<!-- panelKey 不传则使用默认面板 -->
<base-panel panelKey="empty" title="面板标题">
  <!-- 业务内容 -->
</base-panel>
```

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `panelKey` | String | `'empty'` | 面板类型：`empty`、`default-panel`、`aio-panel` 等 |
| `title` | String | - | 面板标题 |

具名插槽：`title-left`、`title-right`、`header-right`、`close`

## 框架预设 CSS 变量

| 变量名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `fontSize` | size | 14px | 基础字体大小 |
| `colorTextBase` | color | #000000 | 基础文字颜色 |
| `colorPrimary` | color | - | 主色调 |
| `colorPrimaryActive` | color | - | 主色调激活态 |
| `colorPrimaryBg` | color | - | 主色调背景 |
| `colorPrimaryBgHover` | color | - | 主色调背景悬浮态 |

## 开发建议

- 先设置组件根字体大小，再用 `em` 倍数设置其他尺寸
- 图片资源优先使用 SVG 格式
- 通用样式与主题样式分离，主题相关放 `themes/`，通用放 `common.less`
