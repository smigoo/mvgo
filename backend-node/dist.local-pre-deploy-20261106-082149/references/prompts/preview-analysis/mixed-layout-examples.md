# 混合布局识别示例（必须遵守）

> 本模块针对“icon + label 在同一行，数值在下方”这类常见混合布局，给出**必须输出**的 JSON 结构。
> 只要预览图中出现这种排列，就严禁把 icon/label/value 平铺成一个纯 vertical 列。

---

## 典型场景：管辖范围 / 统计指标

设计稿中每个统计项的视觉关系：

```
┌─────────────────────────────┐
│ [图标] 标签文字               │  ← 这一行是 horizontal
│  185.6 km                   │  ← 数值在下一行
└─────────────────────────────┘
```

### ✅ 正确输出（必须）

```json
{
  "type": "stat-item",
  "layout": "vertical",
  "alignItems": "center",
  "children": [
    {
      "type": "row",
      "layout": "horizontal",
      "alignItems": "center",
      "gap": "6px",
      "children": [
        {
          "type": "icon",
          "resourceFile": "../resources/images/icon-1955.png",
          "recommendedUsage": "imgSrc",
          "width": 40,
          "height": 40
        },
        {
          "type": "label",
          "text": "主线",
          "color": "rgba(255, 255, 255, 0.8)",
          "fontSize": 12
        }
      ]
    },
    {
      "type": "value",
      "text": "185.6 km",
      "color": "rgba(255, 255, 255, 1)",
      "fontSize": 20,
      "fontWeight": "bold"
    }
  ]
}
```

### ✅ 另一种可接受的输出（按视觉横向分组）

```json
{
  "type": "stat-item",
  "layout": "horizontal",
  "alignItems": "center",
  "children": [
    { "type": "icon", ... },
    {
      "type": "group",
      "layout": "vertical",
      "children": [
        { "type": "label", ... },
        { "type": "value", ... }
      ]
    }
  ]
}
```

**选择原则**：
- 如果图标和标签明显在同一水平基线，数值在它们正下方 → 用第一种（vertical 套 horizontal row）。
- 如果图标在左侧，标签和数值整体在右侧上下排列 → 用第二种（horizontal 套 vertical group）。

---

## 内容区大背景识别规则

如果内容区（标题下方的整个数据展示区）背后有一张贯穿性的背景图或装饰底图，**必须在 JSON 中体现**，禁止忽略。

### ✅ 正确做法 1：在 content 上声明 backgroundImage

```json
{
  "content": {
    "layout": "row",
    "backgroundImage": {
      "src": "../resources/images/bg-956.png",
      "recommendedUsage": "backgroundStyle"
    },
    "backgroundSize": "cover",
    "backgroundPosition": "center",
    "children": [ ... ]
  }
}
```

### ✅ 正确做法 2：在 children 最前面加一个 decoration / bg 元素

```json
{
  "content": {
    "layout": "row",
    "children": [
      {
        "type": "bg",
        "resourceFile": "../resources/images/bg-956.png",
        "recommendedUsage": "backgroundStyle",
        "width": 433,
        "height": 104,
        "style": {
          "position": "absolute",
          "backgroundSize": "cover",
          "backgroundPosition": "center"
        }
      },
      ...stat-items
    ]
  }
}
```

### 如何判断内容区是否有大背景？

满足以下任一条件，即认为内容区有大背景：

1. Figma 节点中存在名为 `bg`、`background`、`底图`、`背景` 的子节点，且尺寸接近内容区尺寸。
2. `resourceDomMapping` 中提供了 role=bg、targetDomHint 包含“bg区域”且尺寸明显大于单个图标的资源。
3. 预览图中内容区不是纯色，而是带有渐变、地图、光效、线条等复杂纹理。

**禁止**：只把最外层面板背景当作唯一背景，而忽略内容区自己的背景图。

---

## 自检说明

混合布局相关的自检项已合并到 self-checklist 模块，请在那里完成最终检查。
