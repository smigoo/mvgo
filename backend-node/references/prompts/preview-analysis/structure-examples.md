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
        "id": "2:3550",
        "anchorKind": "container",
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
        "id": "2:3660",
        "anchorKind": "container",
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
        "repeatedFill": "#a6ceff",
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
7. **重复卡必须逐项标注 `repeatedFill`**（卡片底色 hex）：N 张中「恰好 1 张异色 = 激活态」「≥4 张严格 ABAB 交替 = 斑马纹」「全同 = 无高亮」——上例首卡 `#a6ceff` 异色即激活态；漏标会被 Figma 真值交叉核对判缺

## anchorKind 锚定示例（2026-11-18 新增）

**标题条与内容块是并列兄弟时的正确声明（title-strip）：**

```json
{
  "sections": [
    {
      "id": "2:3604",
      "anchorKind": "container",
      "name": "流量预测",
      "header": { "title": "流量预测" },
      "body": { "layout": "vertical", "children": [ { "id": "2:3605", "type": "chart", "chartType": "line" } ] }
    }
  ]
}
```

**错误声明（禁止）：** 把 `id` 指向 24px 的标题文字节点 `"2:3571"`（tit）——下游会按 24px 算段高，整段塌陷。
若标题条壳（6sub-header）与内容块（@echarts/line-7）是并列兄弟，`id` 必须填内容块 `2:3604`，
标题文字只出现在 `header.title`。

## 角标（badge）版式规则（2026-11-18 新增）

**骑跨宿主的角标必须绝对定位，不得排成流内兄弟：**

- Tab/按钮右上角的红色数字角标（badge-count），在 Figma 里与 tab 是**同父兄弟**、
  bbox **骑跨** tab 边缘（重叠率约 0.3~0.8）。
- 生成代码时：宿主元素 `position:relative`，角标 `position:absolute; right:-6px; top:-6px`
  （按真值几何，角标**不占据流内空间**）。
- ❌ 禁止把 badge 排成 `<tab/><badge/><tab/><badge/>` 的 flex 兄弟序列——那会撑宽 Tab 条。

```json
{ "role": "tabs", "children": [ { "type": "tab", "name": "全部", "overlayBadge": "badge-1" } ] }
```
