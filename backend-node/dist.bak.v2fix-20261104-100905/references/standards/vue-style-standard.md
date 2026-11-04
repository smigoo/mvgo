# 微码组件 Vue 样式标准

## 1. 核心规则（违反即 BLOCK）

### 1.1 component.js 样式引用（入口文件）

每个组件的 `component.js` 入口文件**必须**引用 `.less` 文件，不是 `.css`：

```javascript
// ✅ 正确
import component from './package/index.vue'
import './resources/styles/index.less'
export default component

// ❌ 错误 - 禁止引用 .css 文件
import './resources/styles/index.css'
```

### 1.2 style 块要求

每个生成的 `.vue` 文件**必须**包含且仅包含一个 style 块，格式如下：

```vue
<style lang="less" scoped>
@import '{相对路径}/resources/styles/index.less';
/* 组件私有样式在此编写 */
</style>
```

**禁止事项**：
- ❌ 使用 `<style>` 而非 `<style lang="less" scoped>`
- ❌ 使用非 less 语言（如 `<style scoped lang="css">` 或 `<style scoped lang="scss">`）
- ❌ 一个 .vue 文件中出现多个 style 块
- ❌ style 块中没有 `@import index.less`
- ❌ 使用非 scoped 的 style 块（除非该块仅包含 1-2 行 CSS 变量定义）

### 1.2 样式引入路径

- **根组件** (`package/index.vue`): `@import '../resources/styles/index.less';`
- **一级子组件** (`package/components/Xxx.vue`): `@import '../../resources/styles/index.less';`
- **二级子组件**: `@import '../../../resources/styles/index.less';`
- 路径根据实际层级调整，始终指向组件自己的 `resources/styles/index.less`

### 1.3 宿主样式隔离（违反即 BLOCK）

生成组件必须保持样式与运行时自包含，**禁止依赖宿主站的 Tailwind / Inspira / 全局 UI 样式**。

**禁止事项**：
- ❌ 在 template 中使用 Tailwind utility class（如 `flex`, `grid`, `px-4`, `text-sm`, `bg-slate-900`, `rounded-lg`）
- ❌ 在样式中使用 `@apply`、`@tailwind`、`@layer`
- ❌ 引用 `tailwindcss`、`tw-animate-css`、`@inspira-ui/plugins` 或任何 Inspira 运行时 helper
- ❌ 假设宿主页面已注入 reset / preflight / 主题 token，然后省略组件自身样式
- ❌ 通过裸标签选择器（如 `div`, `span`, `button`）覆盖宿主环境，制造跨组件污染

**必须做到**：
- ✅ 所有布局、颜色、间距、边框、阴影在组件自己的 less 中完整定义
- ✅ 共享样式只通过组件包内的 `resources/styles/index.less` 引入
- ✅ 组件离开当前宿主后，单独放入预览容器仍能保持结构和样式成立

## 2. Class 命名规范（违反即 WARN）

### 2.1 前缀规则

所有写在 `common.less` 中的 class 必须以组件 ID 为前缀：

```
格式: .c-{componentId}-{语义名称}
示例: .c-mmmm-tabs-container
      .c-shxh-device-grid
      .c-tunnel-vehicle-card
```

### 2.2 语义命名要求

- 使用 kebab-case（小写字母+连字符）
- 名词在前，修饰在后：`tabs-container` ✓, `container-tabs` ✗
- 避免过于通用的单词单独使用：
  - ❌ `.item`, `.box`, `.wrapper`, `.container`, `.content`
  - ✅ `.stat-item`, `.card-box`, `.chart-wrapper`, `.list-container`, `.body-content`

### 2.3 组件内部私有 class

在 `.vue` 文件的 `<style scoped>` 中直接定义的 class（不放入 common.less）可以使用更简短的名称，但仍需避免过度通用。

## 3. CSS 变量使用规范

### 3.1 优先使用变量

颜色值应优先引用 `vars.less` 中定义的 CSS 变量：

```less
// ✅ 推荐
.c-mmmm-tab-item {
  color: var(--em-primary);
}

// ⚠️ 允许（需注释来源）
.c-mmmm-tab-item {
  color: rgb(44, 155, 234);  /* Figma fills[0].color */
}
```

### 3.2 硬编码色值标注

当必须使用硬编码颜色时，必须在注释中标明来源：

```less
/* 来源选项:
 * - "Figma fills[N].color"
 * - "Figma strokes[N].color"
 * - "设计稿目视"
 * - "品牌规范"
 */
```

## 4. 特殊场景处理

### 4.1 ECharts 容器

ECharts 渲染容器的 class 放入 scoped style 即可，ECharts 内部 DOM 不需要你的 CSS：

```vue
<template>
  <div class="c-mmmm-chart-container" ref="chartEl"></div>
</template>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
.c-mmmm-chart-container { width: 100%; height: 100%; }
</style>
```

### 4.2 动态样式

允许使用 Vue 的 `:style` 动态绑定：

```vue
<!-- ✅ 允许 -->
<div :style="{ background: gradientValue, borderRadius: radius + 'px' }">

<!-- ❌ 禁止静态内联 -->
<div style="display: flex;">
```

### 4.3 深度选择器（:deep）

覆盖第三方 UI 库（ant-design-vue）组件内部 DOM 样式时，**必须使用 `:deep(.ant-xxx)`**。

原因：组件强制 `<style lang="less" scoped>`，scoped 会给选择器加 `[data-v-xxx]` 后缀，而 antd 组件内部 DOM 不携带该属性，直接写 `.ant-xxx` 不生效。

```less
/* ✅ 正确 — 覆盖 antd 组件内部样式 */
:deep(.ant-btn) {
  border-radius: 4px;
}
:deep(.ant-input) {
  background: transparent;
  border-color: var(--border-color);
}
:deep(.ant-select-selector) {
  background: transparent;
}
:deep(.ant-table-thead) {
  background: rgba(0, 0, 0, 0.3);
}
:deep(.ant-table-tbody > tr > td) {
  border-bottom: 1px solid var(--border-color);
}

/* ❌ 错误 — scoped 下不生效 */
.ant-btn { border-radius: 4px; }
.ant-input { background: transparent; }
```

**适用场景**：
- antd 表单组件：`a-input` / `a-select` / `a-date-picker` / `a-switch` / `a-radio` / `a-checkbox` / `a-form`
- antd 表格组件：`a-table`
- antd 按钮：`a-button`
- antd 弹窗：`a-modal` / `a-popconfirm`
- 任何 antd 组件内部 DOM（`.ant-xxx` 类名）

**不需要 :deep() 的场景**：
- 覆盖组件自身 template 中直接编写的元素样式（自带 `data-v-xxx`）
- ECharts 容器样式（ECharts 内部 DOM 由 JS 渲染，不通过 CSS 控制）

## 5. 图标与 Emoji 使用规范

后台、工具型、管理型页面禁止使用 emoji 作为功能图标、状态图标或高频列表操作按钮。

**禁止示例**：
- ❌ `🔄 刷新`
- ❌ `📦 下载`
- ❌ `🗑 删除`
- ❌ `⏸ 暂停`
- ❌ `▶ 恢复`
- ❌ `✕ 取消`

**必须使用**：
- 项目已有图标库、SVG 图标或设计系统图标
- 图标按钮必须提供 `title` 或 `aria-label`
- 危险操作图标需有明确 hover/active 危险态，如删除使用红色反馈

**允许使用 emoji 的场景**：
- 空状态
- 非关键轻量提示
- 临时 demo 占位，但最终产物必须替换为正式图标

## 6. 代码生成 Checklist

生成每个组件时，确认以下项目：

- [ ] **component.js** 引用 `.less` 文件（不是 `.css`）
- [ ] 每个 .vue 文件末尾有且仅有 1 个 `<style lang="less" scoped">` 块
- [ ] style 块第一行是 `@import` 指向正确的 index.less
- [ ] 没有使用 Tailwind utility class、`@apply`、`@tailwind`、`@layer`
- [ ] 没有引用 `tailwindcss`、`tw-animate-css`、`@inspira-ui/plugins` 等宿主依赖
- [ ] 所有 class 名称符合前缀规范（common.less 中的 class）
- [ ] 颜色值优先使用 CSS 变量或注明来源
- [ ] 功能图标、状态图标、高频操作按钮没有使用 emoji
- [ ] 图标按钮已提供 `title` 或 `aria-label`
- [ ] 没有 `<style>` 非 scoped 块（除非仅含变量）
- [ ] 没有 `lang="scss"` 或 `lang="css"`
- [ ] 子组件文件也有独立的 scoped less 块
