# 🔴 Figma 精修规则（Figma阶段专属，最高优先级）

> 以下规则仅适用于 Figma 阶段。Preview 阶段忽略此部分。

{{FIGMA_RULES_CONTENT}}

{{TEXT_INVENTORY_SECTION}}

{{TEXT_CONSTANTS_SECTION}}

{{VISION_FIGMA_CROSS_SECTION}}

{{STRUCTURE_MARKERS_SECTION}}

{{CLASS_NAME_MANIFEST}}

## Figma 关键节点样式数据（用于精确样式还原）

> **逐节点比对（flex-direction 的权威依据）**：节点标注 `布局: HORIZONTAL` → 该容器必须 `flex-direction: row`；`布局: VERTICAL` → `flex-direction: column`。**严禁**假设子容器与父容器同方向。
> **铁律**：任何 `display: flex` 的容器都必须显式写 `flex-direction`，禁止省略——省略时 CSS 默认是 `row`，会把本应上下堆叠的容器渲染成左右并排。

{{FIGMA_STYLE_DATA}}

## 样式映射结果

{{STYLE_MAPPINGS}}

{{ELEMENT_STYLE_MAP_SECTION}}

## 已下载资源清单

{{ASSETS_LIST}}

{{RESOURCE_DOM_MAPPING}}
