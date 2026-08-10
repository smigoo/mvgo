# 详细元素级结构示例

## 适用场景

当组件包含**结构相似的多个数据项**时（如统计卡片、数据列表），必须输出详细的元素级结构。

## 完整示例

假设预览图显示：一个包含4个数据项的横向布局，每个项左边有图标，右边有标签和数值。

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
    "styles": {
      "fontSize": 24,
      "fontWeight": "bold",
      "color": "#ffffff"
    }
  },
  "body": {
    "layout": "horizontal-4-items",
    "bgPlaceholder": "body-bg-jurisdiction",
    "items": [
      {
        "layout": "horizontal",
        "icon": {
          "placeholder": "icon-mainline",
          "figmaNode": "1452:1955",
          "position": "left",
          "resource": "icon-1955.png"
        },
        "content": {
          "layout": "vertical",
          "position": "right",
          "elements": [
            {
              "type": "label",
              "text": "主线",
              "figmaNode": "1452:1960",
              "position": "top",
              "styles": {
                "fontSize": 14,
                "color": "#ffffff",
                "fontWeight": "normal"
              }
            },
            {
              "type": "value",
              "position": "bottom",
              "parts": [
                {
                  "text": "185.6",
                  "type": "number",
                  "figmaNode": "1452:1965",
                  "styles": {
                    "fontSize": 36,
                    "color": "#00f0ff",
                    "fontWeight": "bold"
                  }
                },
                {
                  "text": "km",
                  "type": "unit",
                  "figmaNode": "1452:1966",
                  "styles": {
                    "fontSize": 14,
                    "color": "#ffffff",
                    "fontWeight": "normal"
                  }
                }
              ]
            }
          ]
        }
      },
      {
        "layout": "horizontal",
        "icon": {
          "placeholder": "icon-tunnel",
          "figmaNode": "1452:1970",
          "position": "left",
          "resource": "icon-1970.png"
        },
        "content": {
          "layout": "vertical",
          "position": "right",
          "elements": [
            {
              "type": "label",
              "text": "隧道",
              "figmaNode": "1452:1975",
              "position": "top",
              "styles": {
                "fontSize": 14,
                "color": "#ffffff"
              }
            },
            {
              "type": "value",
              "position": "bottom",
              "parts": [
                {
                  "text": "1",
                  "type": "number",
                  "figmaNode": "1452:1980",
                  "styles": {
                    "fontSize": 36,
                    "color": "#00f0ff"
                  }
                },
                {
                  "text": "条",
                  "type": "unit",
                  "figmaNode": "1452:1981",
                  "styles": {
                    "fontSize": 14,
                    "color": "#ffffff"
                  }
                }
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

1. **资源占位符命名规范**：
   - section级别：`section-bg-{section-id}`
   - body级别：`body-bg-{section-id}`
   - icon：`icon-{semantic-name}` 或 `icon-{index}`

2. **Figma节点ID**：
   - 格式：`"1452:1955"` （页面ID:节点ID）
   - 必须为每个文字元素、图标元素填写
   - 如果无法确定，可以使用占位符 `"unknown"`

3. **文字拆分原则**：
   - 观察视觉上的字号、颜色差异
   - 数值+单位必须拆分为独立的parts
   - 每个part有独立的figmaNode和styles

4. **布局描述**：
   - `horizontal-4-items` 表示横向4个项
   - `horizontal` 表示item内部左右布局
   - `vertical` 表示content内部上下布局

## 何时使用简化结构

如果组件**不包含**结构相似的重复项，可以使用简化的 `children` 数组，无需详细的 `items` 结构。
