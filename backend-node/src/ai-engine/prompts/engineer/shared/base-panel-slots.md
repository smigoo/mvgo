# 🎯 base-panel 插槽映射表（仅在有 headerSlots 时加载）

可用插槽（从左到右排列）：

| 插槽名 | 位置 | 用途 | 你的内容 |
|--------|------|------|----------|
| #title_left | 标题栏左侧 | 装饰图标、状态标识 | {{HEADER_SLOTS_TITLE_LEFT}} |
| #title_right | 标题右侧紧邻 | 副标题、更新时间、单位 | {{HEADER_SLOTS_TITLE_RIGHT}} |
| #header_right | 标题右侧靠右 | 统计指标、Tab切换、图标操作按钮 | {{HEADER_SLOTS_HEADER_RIGHT}} |
| #close | 最右侧关闭 | 关闭按钮 | (base-panel 已默认提供) |
| 默认插槽 | 内容区 | 所有业务内容 | (布局结构中的 body 部分) |

**必须按以下方式使用**：
```vue
<base-panel panelKey="{{PANEL_TYPE}}">
  <template #title_left>
    <!-- 左侧装饰内容 -->
  </template>
  <template #title_right>
    <!-- 副标题/时间/单位 -->
  </template>
  <template #header_right>
    <!-- 右侧控件：Tab按钮、统计指标、图标操作 -->
  </template>
  <!-- 业务内容放在默认插槽 -->
  <div class="component-body">...</div>
</base-panel>
```

## 🔴 插槽必须有真实内容（高频严重违规）

上表「你的内容」列里的文案是从 Figma 标题栏**确定性提取**的真实内容，**必须逐条渲染成真实 DOM**。

```vue
<!-- ❌ 致命错误：只留注释 → 预览里头部一片空白，用户直接判定生成失败 -->
<template #header_right>
  <!-- 右侧统计指标 -->
</template>

<!-- ✅ 正确：真实 DOM + 真实文案 + common.less 里有对应 class -->
<template #header_right>
  <div class="c-monitor-header-stats">
    <div class="c-monitor-header-stat">
      <span class="c-monitor-header-stat-label">设备类型</span>
      <span class="c-monitor-header-stat-value">28</span>
    </div>
    ...
  </div>
</template>
```

规则：
1. 「你的内容」非空的插槽，**必须**输出 `<template #插槽名>` 且内部有真实元素，禁止只写 `<!-- 注释 -->` 或留空
2. 文案必须用「你的内容」列里的原文，禁止改写、禁止用占位符（如「统计1」「--」）
3. 插槽里用到的每个 class 都必须在 common.less 中定义（否则有 DOM 无样式，等于没做）

**禁止行为**：
- ❌ 不要在默认插槽内生成 `<div class="header">` 或 `<div class="panel-title">` — 标题栏由 base-panel 提供
- ❌ 不要用 `<h2>` / `<h3>` 包裹标题 — base-panel 已渲染标题
- ❌ 不要在默认插槽内放置 header_right 的控件 — 它们必须在 `<template #header_right>` 中

## 🔴 铁律：命名插槽仅用于 header 区控件

**命名插槽（`#title_left` / `#title_right` / `#header_right` / `#close`）仅用于放置 header 区控件**（如 tabs、按钮、标题、统计指标等）。

**主体内容（图表、列表、卡片、数据展示区等）必须放默认插槽**——即直接写在 `<base-panel>` 内部，**不得**包裹在任何 `<template #slotName>` 中。

违反此规则将导致组件空壳（默认插槽为空，命名插槽有内容 → L0-B EMPTY_BODY 检测拦截）。

```vue
<!-- ❌ 致命错误：把图表放在命名插槽里 -->
<base-panel panelKey="default-panel">
  <template #header_right>
    <ChartArea />  <!-- 错误！图表是主体内容，必须放默认插槽 -->
  </template>
</base-panel>

<!-- ✅ 正确：图表放在默认插槽 -->
<base-panel panelKey="default-panel">
  <template #header_right>
    <div class="tabs">...</div>  <!-- 正确：tabs 是 header 控件 -->
  </template>
  <ChartArea />  <!-- 正确：图表是主体内容，放默认插槽 -->
</base-panel>
```

## 🔴 铁律：命名插槽仅用于 header 区控件

**命名插槽（`#title_left` / `#title_right` / `#header_right` / `#close`）仅用于放置 header 区控件**（如 tabs、按钮、标题、统计指标等）。

**主体内容（图表、列表、卡片、数据展示区等）必须放默认插槽**——即直接写在 `<base-panel>` 内部，**不得**包裹在任何 `<template #slotName>` 中。

违反此规则将导致组件空壳（默认插槽为空，命名插槽有内容 → L0-B EMPTY_BODY 检测拦截）。

```vue
<!-- ❌ 致命错误：把图表放在命名插槽里 -->
<base-panel panelKey="default-panel">
  <template #header_right>
    <ChartArea />  <!-- 错误！图表是主体内容，必须放默认插槽 -->
  </template>
</base-panel>

<!-- ✅ 正确：图表放在默认插槽 -->
<base-panel panelKey="default-panel">
  <template #header_right>
    <div class="tabs">...</div>  <!-- 正确：tabs 是 header 控件 -->
  </template>
  <ChartArea />  <!-- 正确：图表是主体内容，放默认插槽 -->
</base-panel>
```

**禁止渲染设计师注释**：
- ❌ 不要将 Figma 中以 `*` / `#` 开头或包含 `TODO`/`注`/`标注` 的文本渲染为 UI 内容（它们是设计稿标注，不是业务数据）
- ❌ 如果 visualElements 中有以 `*` 或 `#` 开头的注释文本，忽略它——它们不是最终产品的文字内容
