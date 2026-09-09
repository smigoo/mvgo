## 1.5️⃣ 根容器样式零添加规则（ROOT_CONTAINER_NO_DECORATION）

> **预览图是唯一真相源**：如果 Figma 预览图中根容器/面板没有背景色、内边距、圆角或阴影，**绝对禁止自行添加**。

🔴 **禁止行为（模型常犯错误）**：
- ❌ 给根容器加 `background: #0b0f11` / `background: #1a1a1a` 等深色纯色背景（预览图没有就别加）
- ❌ 给根容器加 `padding: 8px 14px` / `padding: 12px 16px` 等额外内边距
- ❌ 给根容器加 `border-radius: 8px` / `border-radius: 12px` 等圆角
- ❌ 给根容器加 `box-shadow` 阴影效果
- ❌ 给任何容器添加「预览图里不存在的装饰性样式」

✅ **正确做法**：
- 根容器默认：`width: 100%; height: 100%; box-sizing: border-box; overflow: hidden;`，**布局方向由 `layoutStructure` 决定**：
  - 若 `layoutStructure` 包含"两列"/"网格"/"grid"/"并排" → `display: grid; grid-template-columns: 1fr 1fr;`（两列网格）
  - 若 `layoutStructure` 包含"纵向"/"column"/"竖排" → `display: flex; flex-direction: column;`（单列布局）
  - 默认 → `display: flex; flex-direction: column;`
- 只有当 `layoutStructure` 或 `elementStyleMap` 中**明确标注**了某容器的 background/padding/border-radius 时，才按精确值还原
- 背景图资源（bg1/bg2...）通过 `:style="{ backgroundImage: ... }"` 引用，**不是**用纯色 `background` 模拟
- **子区块高度规则（自适应比例分配，🔴 核心规范）**：
  - **内容区块**（数据卡/图表区/列表/主内容区）：高度用 `flex: <flexGrow系数> 1 0; min-height: 0`——flexGrow 是管线按 Figma 高度**归一化**的弹性系数（各区块 flexGrow 的平均值为 1，如 0.978 / 1.3 / 2.309），直接使用 prompt 下发的系数值。flex 引擎按系数等比分配剩余空间，任何容器尺寸下设计稿比例保持不变。**禁止给内容区块写死 height/固定像素**（容器尺寸变化时必然失衡）
  - 🔴 **禁止把 Figma 像素高度直接写进 flex-grow**（如 `flex: 220 1 0`、`flex: 131 1 0`）——flex-grow 是无单位弹性系数（0/1/小数值），不是像素。像素高度只能出现在 flex-basis（`flex: <系数> 1 <高度>px` 的第三项）或固定区块的 height 里
  - **功能条**（标题栏/tab 条/操作栏/状态栏/页脚/统计条）：用 `flex: 0 0 <Figma高度>px`（或 `height: <Figma高度>px; flex-shrink: 0`）——此类区块高度天然固定，不参与比例分配
  - 🔴 **定宽/定高区块禁止 flex-grow（2026-09-02 实锤 mc-max-1788280167414）**：任何写了显式 `width: <px>` 或 `height: <px>` 的区块（侧栏导航/tab 条/统计条/图标/徽标/按钮）一律只配 `flex-shrink: 0`（或 `flex: 0 0 auto`），**禁止**同块写 `flex: 1 1 0` / `flex: 1` 等 grow——flex-grow 会覆盖显式尺寸（`flex-basis: 0` 忽略 width），把 46px 侧栏撑满整个剩余宽度（实测 46px → 186px）。只有「无显式尺寸的主内容区」才允许 grow 分配剩余空间
  - **图表容器**：flex 比例（同上，grow=下发的 flexGrow 系数）+ `min-height` 兜底防压扁——多系列主图（柱状/折线/多系列饼图）`min-height: 160px`，紧凑图（环形仪表/单值卡内嵌图）`min-height: 100px`；echarts 自适应容器尺寸（ResizeObserver 触发 chart.resize()），容器比例正确图表自然正确
  - **字体/图标/间距**：固定 px（可读性优先，不随容器缩放），图标加 `flex-shrink: 0`
  - 🔴 **`height: 100%` 唯一合法位置是根容器**（`.c-*-root`）。子区块 height: 100% 会吃掉父容器全部剩余空间、挤压兄弟区块导致重叠/溢出
- **区块间距**：根容器用 `gap: <Figma 间距精确值>` 控制子区块间距；禁止用子区块自身的 `margin-bottom` 堆叠间距（会与 gap 叠加导致间距翻倍）。
- **总高约束（禁止手工算术）**：设计稿总高与预览容器不一致时，`flex: <flexGrow系数> 1 0` 比例分配**自动等比压缩/放大**各内容区块——**禁止手工计算缩放值或换算百分比**（除法/百分比换算由 flex 引擎完成，LLM 算术不可靠；flexGrow 系数由管线归一化后下发，直接使用即可）。根容器 `overflow: hidden` 兜底，不产生 Y 轴滚动。
- **aspectRatio 来源（禁止默认值）**：模板中 `boxStyle` 的 `aspectRatio` 必须从 Figma 根容器的真实尺寸计算（`Figma width / Figma height`），**禁止写死 `[16, 9]` 或任何默认比例**。Figma 根容器 425×807 → 应为 `aspectRatio: '425 / 807'`（纵向面板），而非 `'16 / 9'`（横向视频比例）。写错 aspectRatio 会导致容器被压扁/拉伸，内容全部挤到一端。

```less
// ✅ 正确：根容器干净，无多余装饰
.c-{{COMPONENT_NAME}}-root {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

// ❌ 错误：模型自作主张加了背景和 padding
.c-{{COMPONENT_NAME}}-root {
  width: 100%;
  height: 100%;
  background: #0b0f11;    // ← 预览图没有！删除！
  padding: 8px 14px;      // ← 预览图没有！删除！
  border-radius: 8px;     // ← 预览图没有！删除！
}
```

<!-- 混合布局规则(2️⃣) / stat-item 方向规则(2.1️⃣) / 元素样式差异化规则(2.2️⃣) 已合并至 layout-rules.md 唯一一份（2026-08-24 去重，内容逐字保留） -->
