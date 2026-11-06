# ⚠️ 面板类型要求（最高优先级）

**必须使用指定的面板类型：**
- 面板类型已指定为：`{{PANEL_TYPE}}`
- 生成的组件必须使用：`<base-panel panelKey="{{PANEL_TYPE}}">`
- 不要使用其他panelKey值，必须严格使用指定的值

# 🎯 base-panel 插槽映射（必须遵循）

base-panel 已提供完整面板框架（标题栏、背景、边框），你只需通过**具名插槽**填充内容。

**禁止**在 base-panel 内部生成 `<div class="header">`、`<div class="bg">`、`<div class="bg-layer">`、`<div class="panel-header">` 等结构元素，所有头部内容必须通过插槽分发。

**关键过滤规则（CRITICAL）**：
- 如果 `layoutStructure.structure` 存在 `background` 字段（outer panel bg），**忽略它** —— 这是 base-panel 的面板背景，不是组件内容。
- 如果 `layoutStructure.structure.children` 中有 `type: "header"` / `type: "panel-header"` 的元素，**忽略它** —— base-panel 已经渲染标题栏。
- 这些被忽略的元素**不产生任何 DOM、不引用任何 bg/icon 资源、不写任何 class**。
- 只有标题栏装饰图标应通过 `<template #title_left>` / `<template #title_right>` / `<template #header_right>` 插入 base-panel 插槽。

**背景图应用规则（BACKGROUND_AS_CSS）**：
- 任何保留的背景图必须作为**父容器 CSS 的 background-image** 使用，例如：
  ```vue
  <div class="c-{{COMPONENT_NAME}}-content" :style="{ backgroundImage: `url(${bgX})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }">...</div>
  ```
- **backgroundSize / backgroundPosition / backgroundRepeat 必须与 layoutStructure 中的值一致**。如果 layoutStructure 的 background/backgroundImage 字段包含 backgroundSize/backgroundPosition/backgroundRepeat，必须在 :style 绑定中精确还原这些值，不要自行推测或使用 cover/center/no-repeat 默认值。
- **禁止**为背景图单独创建一个空 `<div>`（如 `bg-layer`），再叠加其他内容。这是视觉错误的主要来源。
- **溢出裁切规则（OVERFLOW_HIDDEN）**：当 layoutStructure 的 background 或 backgroundImage 字段标记 `needsOverflowHidden: true` 时，承载该背景图的容器元素**必须添加 `overflow: hidden`**（通过 CSS class 或 :style），否则背景图溢出部分会穿透容器边界。示例：
  ```vue
  <div class="c-{{COMPONENT_NAME}}-content" :style="{ backgroundImage: `url(${bgX})`, backgroundSize: 'auto 100%', overflow: 'hidden' }">...</div>
  ```

（插槽映射表和详细示例见 base-panel-slots.md，仅在有 headerSlots 时加载）
