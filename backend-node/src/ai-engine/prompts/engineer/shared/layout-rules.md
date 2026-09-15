## 2️⃣ 混合布局规则（MIXED_LAYOUT）- 代码结构优先级

> **flex-direction 铁律（所有阶段通用）**：任何 `display: flex` 的容器都必须**显式写** `flex-direction`，禁止省略——省略时 CSS 默认值是 `row`（横向），会把本应上下堆叠的容器渲染成左右并排。写 `display: flex` 就立刻补 `flex-direction: column` 或 `flex-direction: row`。

当 layoutStructure 中出现 stat-item 等数据指标项，且内部包含 `type: 'row'` / `layout: 'horizontal'` 的嵌套子结构时，**必须生成对应的嵌套 flex 容器**，禁止将所有子元素平铺为纯 vertical flex。

**正确示例（icon+label 同行，value 在下方）**：
```vue
<template>
  <div v-for="item in stats" :key="item.label" class="c-{{COMPONENT_NAME}}-stat-item">
    <!-- row 容器：icon 和 label 同行 -->
    <div class="c-{{COMPONENT_NAME}}-stat-row">
      <img :src="item.icon" class="c-{{COMPONENT_NAME}}-stat-icon" />
      <span class="c-{{COMPONENT_NAME}}-stat-label">{{ item.label }}</span>
    </div>
    <!-- value 在下方 -->
    <span class="c-{{COMPONENT_NAME}}-stat-value">{{ item.value }}</span>
  </div>
</template>
```
```less
.c-{{COMPONENT_NAME}}-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.c-{{COMPONENT_NAME}}-stat-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
}
```

**错误示例 ❌**（纯 vertical 平铺，icon/label/value 全部垂直排列）：
```less
.c-{{COMPONENT_NAME}}-stat-item {
  display: flex;
  flex-direction: column;  // ❌ 所有子元素垂直排列
}
// ❌ icon、label、value 是兄弟节点，不在同一行
```

**判断规则**：如果 layoutStructure 的 stat-item children 中有 `type: 'row'` 且 `layout: 'horizontal'`，则模板必须生成一个 flex-direction: row 的容器包裹 row 的 children（icon + label），其余 children（value 等）放在 stat-item 的下一层。

## 2.1️⃣ stat-item 自身布局方向规则（STAT_ITEM_DIRECTION）

stat-item 元素的 `layout` 属性决定了其自身的 flex-direction，**必须严格遵守**：
- `layout: "horizontal"` → `.stat-item { flex-direction: row; }`（icon 和 text-group 横向排列）
- `layout: "vertical"` → `.stat-item { flex-direction: column; }`（icon 和 text-group 纵向排列）

**当 stat-item 的 layout 为 horizontal 且 children 包含 icon + container(text-group) 时**：
- icon 在左，text-group（label + value 纵向堆叠）在右
- 禁止将 icon 和 label 拆到单独的 row 容器中（除非 layoutStructure 显式有 `type: 'row'` 子节点）
- 禁止将 value 放到 text-group 外部

**正确示例**（stat-item layout: "horizontal"，children: icon + text-group）：
```vue
<div class="c-{{COMPONENT_NAME}}-stat-item">
  <img :src="icon1" class="c-{{COMPONENT_NAME}}-stat-icon" />
  <div class="c-{{COMPONENT_NAME}}-text-group">
    <span class="c-{{COMPONENT_NAME}}-stat-label">{{ item.label }}</span>
    <span class="c-{{COMPONENT_NAME}}-stat-value">{{ item.value }}</span>
  </div>
</div>
```
```less
.c-{{COMPONENT_NAME}}-stat-item {
  display: flex;
  flex-direction: row;  /* ← 跟随 layout: "horizontal" */
  align-items: center;
  gap: 6px;
}
.c-{{COMPONENT_NAME}}-text-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
```

**错误示例** ❌（把 icon+label 拆成 row，value 放到外部，破坏了 text-group 结构）：
```vue
<div class="c-{{COMPONENT_NAME}}-stat-item">
  <div class="c-{{COMPONENT_NAME}}-stat-row">
    <img :src="icon1" />
    <span>{{ item.label }}</span>
  </div>
  <span>{{ item.value }}</span>
</div>
```

**关键原则**：stat-item 的 children 结构决定了 DOM 结构。如果 children 是 `[icon, container]`，DOM 就应该是 `<img> + <div>text-group</div>`，不要拆分 container 的子元素到 stat-item 层级。

**内容区背景图规则（CONTENT_BG）**：
如果 layoutStructure 的 content/body 节点有 `backgroundImage.src` 字段，内容区容器必须使用该背景图，而非纯色或 CSS 渐变。

## 2.2️⃣ 元素样式差异化规则（ELEMENT_STYLE_DIFF）

当 layoutStructure 或 elementStyleMap 中存在**不同 element id** 的同类元素（如 `text-value-mainline` 和 `text-value-tunnel`），**必须为每种样式生成独立的 CSS class**，禁止用伪类区分。

**正确示例**（主线 20px bold，其他 16px）：
```vue
<template>
  <div v-for="item in stats" :key="item.label" class="c-{{COMPONENT_NAME}}-stat-item">
    <span :class="item.isMain ? 'c-{{COMPONENT_NAME}}-stat-value-main' : 'c-{{COMPONENT_NAME}}-stat-value-normal'">{{ item.value }}</span>
  </div>
</template>
```
```less
.c-{{COMPONENT_NAME}}-stat-value-main {
  font-size: 20px;
  font-weight: bold;
  color: #ffffff;
}
.c-{{COMPONENT_NAME}}-stat-value-normal {
  font-size: 16px;
  font-weight: normal;
  color: rgba(255, 255, 255, 0.8);
}
```

**错误示例** ❌（用伪类区分，不同 element id 被合并为同一 class）：
```less
.c-{{COMPONENT_NAME}}-stat-value {
  font-size: 20px;  // ❌ 统一样式
  font-weight: bold;
}
.c-{{COMPONENT_NAME}}-stat-item:first-child .c-{{COMPONENT_NAME}}-stat-value {
  font-size: 20px;  // ❌ 用伪类区分
}
.c-{{COMPONENT_NAME}}-stat-item:not(:first-child) .c-{{COMPONENT_NAME}}-stat-value {
  font-size: 16px;  // ❌ 用伪类区分
}
```

**判断规则**：如果 elementStyleMap 或 elements 数组中两个元素的 `font-size`、`font-weight`、`color` 等属性不同，必须生成两个独立的 class，禁止用 `:first-child` / `:not(:first-child)` / `:nth-child()` 等伪类来区分。

```vue
<div class="c-{{COMPONENT_NAME}}-content" :style="{ backgroundImage: `url(${bgX})`, backgroundSize: layoutStructure.backgroundSize || '100% 100%', backgroundPosition: layoutStructure.backgroundPosition || 'center center', backgroundRepeat: layoutStructure.backgroundRepeat || 'no-repeat' }">
  <!-- stat-item 等内容 -->
</div>
```

## 2.3️⃣ 卡片布局规则（CARD_LAYOUT）

当 layoutStructure 中出现类似卡片的元素（card、info-card、stat-card 等），且其 children 包含 icon/image + 文字内容时，**默认使用横向布局**：

- **icon + text 结构 → flex-direction: row（水平排列）**
- icon/image 在左侧，文字内容（label + value）在右侧堆叠
- 禁止将所有子元素全部垂直排列（column）—— 这会导致 icon 在上、文字在下，与设计稿不符

**正确示例**（卡片：icon 左 + 文字右）：
```vue
<template>
  <div v-for="item in cards" :key="item.label" class="c-{{COMPONENT_NAME}}-card-item">
    <img :src="item.icon" class="c-{{COMPONENT_NAME}}-card-icon" />
    <div class="c-{{COMPONENT_NAME}}-card-text">
      <span class="c-{{COMPONENT_NAME}}-card-label">{{ item.label }}</span>
      <span class="c-{{COMPONENT_NAME}}-card-value">{{ item.value }} <small>{{ item.unit }}</small></span>
    </div>
  </div>
</template>
```
```less
.c-{{COMPONENT_NAME}}-card-item {
  display: flex;
  flex-direction: row;       /* ← 水平排列：icon 左 + 文字右 */
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
}
.c-{{COMPONENT_NAME}}-card-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;            /* ← icon 不缩放 */
}
.c-{{COMPONENT_NAME}}-card-text {
  display: flex;
  flex-direction: column;    /* ← label 和 value 纵向堆叠 */
  gap: 4px;
}
.c-{{COMPONENT_NAME}}-card-label {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.65);
}
.c-{{COMPONENT_NAME}}-card-value {
  font-size: 24px;
  font-weight: bold;
  color: #ffffff;
}
.c-{{COMPONENT_NAME}}-card-value small {
  font-size: 12px;
  font-weight: normal;
  color: rgba(255, 255, 255, 0.5);
}
```

**错误示例** ❌（全部垂直排列，icon在上、文字在下）：
```less
.c-{{COMPONENT_NAME}}-card-item {
  display: flex;
  flex-direction: column;    // ❌ 所有子元素纵向堆叠
  align-items: center;
}
```

**判断规则**：只要 layoutStructure 中某个元素的 children 同时包含图标类（icon/image）和文字类（text/label/value）子元素，就使用横向布局。只有纯文字堆叠的卡片才用竖向布局。

**图标尺寸规则**：卡片/列表项中的业务图标尺寸取自 Figma 节点 absoluteBoundingBox，且 `flex-shrink: 0`。
≤12px 的圆点/短线属于**装饰元素**（资源映射中会标注 `🔸[装饰元素·非业务图标]`），**禁止**把它当作卡片或标题的主图标使用。

## 3️⃣ flex-grow 比例分配铁律（FLEX_GROW_RATIO）

> 唯一事实源：本节是「内容区块高度分配」的唯一规范，替代 root-container.md / ai-generation-constraints.md / chart-standards.md 中重复表述。

**组件内有多个功能区块（header / tab / 图表区 / footer）时，禁止给内容区块写死固定高度。**

| 区块类型 | 高度策略 | 示例 |
|---------|---------|------|
| 标题/表头/功能条 | 固定高度 + `flex-shrink: 0` | `height: 40px` |
| Tab/筛选条 | 固定高度 + `flex-shrink: 0` | `height: 32px` |
| 内容区块（数据卡/图表区/主内容区） | `flex: <flexGrow系数> 1 0; min-height: 0` | 系数 = 管线归一化值 |
| 图表/数据区兜底 | 主图 `min-height: 160px`；紧凑图 `min-height: 100px` | — |
| 底部状态栏 | 固定高度 + `flex-shrink: 0` | `height: 28px` |

🔴 **核心禁令（逐条）**：
1. **禁止把 Figma 像素高度直接写进 flex-grow**（如 `flex: 220 1 0`）——grow 是无单位弹性系数（0/1/小数值），不是像素。像素只能出现在 flex-basis（`flex: <系数> 1 <高度>px`）或固定区块的 height 里。
2. **定宽/定高区块禁止 flex-grow**（2026-09-02 实锤 mc-max-1788280167414）：写了显式 `width/height: <px>` 的区块只配 `flex-shrink: 0`，禁止同块写 grow——grow 会覆盖显式尺寸（`flex-basis:0` 忽略 width），把 46px 侧栏撑满整个剩余宽度。
3. **`height: 100%` 唯一合法位置是根容器**（`.c-*-root`）。子区块 `height: 100%` 会吃掉父容器剩余空间、挤压兄弟区块导致重叠/溢出。
4. **禁止手工算术**：`flex: <flexGrow系数> 1 0` 比例分配自动等比压缩/放大，禁止手工计算缩放值或换算百分比（flexGrow 由管线归一化后下发，直接使用）。

```less
// ✅ 正确：固定功能条 + 内容区块 flex-grow 归一化系数
.root-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  .header { height: 40px; flex-shrink: 0; }
  .stat-cards { flex: 0.67 1 0; min-height: 0; }
  .chart-area { flex: 1.33 1 0; min-height: 160px; }
  .footer { height: 28px; flex-shrink: 0; }
}
```
