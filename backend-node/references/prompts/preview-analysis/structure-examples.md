# 输出结构示例（强制参考）

## 正确示例 ✅（整体结构）

**必须像这样完整分析所有区域**（标题、控件、内容区、卡片、图表全部识别，不要只识别一个控件就停止）：

```json
{
  "componentName": "重点车辆监测",
  "summary": "包含Tab切换、今日累计标题、三个统计卡片",
  "layout": {
    "type": "vertical-stack",
    "sections": [
      {
        "id": "section-tabs",
        "name": "Tab切换栏",
        "role": "tabs",
        "headerRelation": "title-same-row",
        "slotCandidate": "header-right",
        "children": [
          { "role": "tab", "name": "江阴靖江长江隧道", "active": true },
          { "role": "tab", "name": "江阴大桥", "active": false }
        ]
      },
      {
        "id": "section-total",
        "name": "今日累计",
        "role": "stats-header",
        "headerRelation": "content-below-title",
        "children": [
          { "role": "icon", "name": "菱形图标" },
          { "role": "text", "name": "今日累计" }
        ]
      },
      {
        "id": "section-cards",
        "name": "统计卡片",
        "role": "card-row",
        "layout": "horizontal-3-columns",
        "children": [
          { "role": "stat-card", "name": "危化品车", "value": "51次" },
          { "role": "stat-card", "name": "重型货车", "value": "2次" },
          { "role": "stat-card", "name": "超高车辆", "value": "19次" }
        ]
      }
    ]
  }
}
```

## 元素级结构示例（结构相似的重复项）

当组件包含**结构相似的多个数据项**（统计卡片、数据列表）时，用 `items` 数组描述深层结构（而非简单 children）：

```json
{
  "id": "jurisdiction-scope",
  "name": "管辖范围",
  "role": "常驻",
  "layout": "vertical",
  "bgPlaceholder": "section-bg-jurisdiction",
  "header": {
    "text": "管辖范围",
    "figmaNode": "1452:1950",
    "styles": { "fontSize": 24, "fontWeight": "bold", "color": "#ffffff" }
  },
  "body": {
    "layout": "horizontal-4-items",
    "bgPlaceholder": "body-bg-jurisdiction",
    "items": [
      {
        "layout": "horizontal",
        "icon": { "placeholder": "icon-mainline", "figmaNode": "1452:1955", "position": "left", "resource": "icon-1955.png" },
        "content": {
          "layout": "vertical",
          "position": "right",
          "elements": [
            { "type": "label", "text": "主线", "figmaNode": "1452:1960", "position": "top", "styles": { "fontSize": 14, "color": "#ffffff" } },
            {
              "type": "value",
              "position": "bottom",
              "parts": [
                { "text": "185.6", "type": "number", "figmaNode": "1452:1965", "styles": { "fontSize": 36, "color": "#00f0ff", "fontWeight": "bold" } },
                { "text": "km", "type": "unit", "figmaNode": "1452:1966", "styles": { "fontSize": 14, "color": "#ffffff" } }
              ]
            }
          ]
        }
      }
    ]
  }
}
```

## 关键要点

1. **sections 数组不能为空**（至少 1 个）；每个 section 必须有 children/body；body.children 不能为空
2. **不要只识别一个控件就停止**——自上而下完整分析：标题、控件、内容区、卡片、图表、列表全部识别后再输出
3. 资源占位符命名：section 级 `section-bg-{section-id}`、body 级 `body-bg-{section-id}`、icon `icon-{semantic-name}`
4. 每个文字/图标元素必须带 `styles`（fontSize/color 等）；`figmaNode` 仅在提供了 Figma 结构参考时必须携带（对应真实节点 ID），纯截图分析省略、禁止臆造
5. 文字拆分：数值+单位必须拆为独立 `parts`（number/unit），各自独立 figmaNode/styles
6. 无重复项组件可用简化 `children` 结构，无需 `items`
