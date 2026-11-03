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
- **子区块高度规则**：内容区块用 `flex: <flexGrow系数> 1 0; min-height: 0` 比例分配、禁止写死高度、禁止像素写进 grow、图表容器 min-height 分级（主图 160/紧凑 100）——**完整规范见 layout-rules.md「3️⃣ flex-grow 比例分配铁律」（唯一事实源，本文件不再重复）**。
- **区块间距**：根容器用 `gap: <Figma 间距精确值>` 控制子区块间距；禁止用子区块自身的 `margin-bottom` 堆叠间距（会与 gap 叠加导致间距翻倍）。
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
