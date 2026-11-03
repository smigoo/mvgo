## 2.3️⃣ 文本格式精确还原（TEXT_FIDELITY）

- 数字、比值、单位、括号、分隔符**必须与 Figma 文本逐字符一致**。
- 例：Figma 显示 `(2/484)` 就必须输出 `(2/484)`，**不得**去掉括号写成 `2/484`；`98%` 不得写成 `98`。
- 前后缀符号（`(` `)` `/` `:` `~` `+` `-` 及单位）一律照抄，禁止"美化"或简化。

## 2.4️⃣ 文字颜色精确还原（TEXT_COLOR_FIDELITY）

🔴 **最高频视觉偏差**：文字颜色必须来自 `elementStyleMap` / Figma `fills.color` 的**精确值**，禁止凭"深色背景配白字"的经验猜测。

- ❌ **禁止默认白字**：不要因为组件常见于深色大屏就给所有文字写 `color: #fff` / `color: rgba(255,255,255,0.8)`。若 Figma 中文本是深色（如 `#333333`、`#1f2329`），必须原样输出深色。
- ❌ **禁止默认深字**：同理，Figma 是白字就必须写白字，不要套 `@text-color-primary` 等主题变量覆盖精确值。
- ✅ **取色优先级**：
  1. `elementStyleMap[elementId].color`（最精确，逐元素）
  2. Figma 节点 `fills[0].color`（r/g/b × 255 换算为 hex/rgba，透明度取 `fills[0].opacity` 或 color.a）
  3. 两者都缺失时才允许用主题变量（`@text-color-primary` 等），并在注释中标注"未取到精确色"
- ✅ **核对方法**：生成后自查——预览图（截图）里每个文字块的颜色与 CSS 中对应 class 的 `color` 是否一致；标题、数值、单位、次要说明文字往往颜色不同，必须逐一对照。
- ⚠️ **text-shadow 不是颜色替代**：`text-shadow` 只能按 Figma `effects` 精确还原，禁止用它"提亮"文字来掩盖颜色错误。

## 2.5️⃣ 统计数据卡片化渲染（STAT_CARD_RENDERING）

 **高频缺陷**：Figma 中的统计数据块（如"↓ 128 KB/s"、"↑ 32 KB/s"、"总量 2.4 GB"）在 UI 设计中是**卡片/区块**形态（有背景色、圆角、内边距），但模型常输出为裸 `<span>` 纯文本排列，导致视觉效果简陋、与设计稿严重不符。

- ✅ **必须做**：每个统计数据项必须渲染为独立的卡片容器，包含：
  - 背景色（按 Figma 精确值，通常为主题色浅底或白色/深色卡片）
  - 圆角（`border-radius: 8px` 或 Figma 标注值）
  - 内边距（`padding: 8px 12px` 或 Figma 标注值）
  - 内部元素：箭头/图标 + 数值 + 单位，按 Figma 布局排列
- ❌ **绝对禁止**：
  - ❌ 用裸 `<span>↓ 128 KB/s</span><span>↑ 32 KB/s</span>` 横向平铺（无卡片包装）
  - ❌ 用纯文本 + 空格分隔多个统计项
  - ❌ 只给最外层容器加背景色，内部统计项无独立卡片

**正确示例**：
```vue
<template>
  <div class="c-{{COMPONENT_NAME}}-stats">
    <div v-for="stat in stats" :key="stat.label" class="c-{{COMPONENT_NAME}}-stat-card">
      <span class="c-{{COMPONENT_NAME}}-stat-arrow">{{ stat.arrow }}</span>
      <span class="c-{{COMPONENT_NAME}}-stat-value">{{ stat.value }}</span>
      <span class="c-{{COMPONENT_NAME}}-stat-unit">{{ stat.unit }}</span>
    </div>
  </div>
</template>
<style scoped lang="less">
.c-{{COMPONENT_NAME}}-stats {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}
.c-{{COMPONENT_NAME}}-stat-card {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(25, 144, 255, 0.08);  // 按 Figma 精确值
  border-radius: 8px;
  padding: 8px 12px;
}
.c-{{COMPONENT_NAME}}-stat-arrow { font-size: 14px; }
.c-{{COMPONENT_NAME}}-stat-value { font-size: 16px; font-weight: 600; }
.c-{{COMPONENT_NAME}}-stat-unit { font-size: 12px; opacity: 0.7; }
</style>
```

**错误示例** ❌（裸文本无卡片）：
```vue
<div class="monitor-stats">
  <span>↓ 128 KB/s</span>
  <span>↑ 32 KB/s</span>
  <span>总量 2.4 GB</span>
</div>
<style>
.monitor-stats { display: flex; gap: 12px; font-size: 12px; }  // ❌ 无卡片包装
</style>
```
