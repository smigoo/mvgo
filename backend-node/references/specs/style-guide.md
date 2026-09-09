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

2. **theme-vars.less 必须映射 CSS 变量到 Less 变量**：
   ```less
   .common() {
     @colorTextBase: var(--colorTextBase);
     @fontSize: var(--fontSize);
     // ... 所有 cssVariableConfig 的 key
   }
   .common();
   ```

3. **样式使用 var()**：
   ```less
   .c-component {
     color: var(--colorTextBase, @color-text-primary);
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
| `themes/theme-vars.less` | 定义 3 个 mixin + 全局调用 `.theme-light()` | **禁止使用 `var(--xxx)`** |
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

**CSS 变量使用**：
```css
.component {
  font-size: var(--fontSize);
  color: var(--colorTextBase);
  background: var(--colorPrimaryBg);
}
```

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
  font-size: var(--fontSize);
  color: var(--colorTextBase);
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
