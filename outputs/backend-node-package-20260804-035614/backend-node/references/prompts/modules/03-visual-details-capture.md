# 视觉细节捕获规则（新增模块 ⭐）

## 核心目标
**从预览图中捕获所有可见的视觉细节，确保代码生成时能够准确还原UI设计。**

---

## 🎯 为每个 Section 添加 VisualDetails 字段

### 字段结构
```json
{
  "id": "stat-cards-section",
  "name": "统计卡片组",
  "role": "stat-cards-group",
  "visualDetails": {
    "shape": "arrow-right",
    "background": {
      "type": "gradient",
      "value": "linear-gradient(135deg, #64b5f6 0%, #4a9eff 100%)"
    },
    "borders": "none",
    "shadows": "0 2px 8px rgba(0,0,0,0.1)",
    "corners": "8px",
    "spacing": {
      "padding": "20px",
      "gap": "12px",
      "margin": "12px 0"
    }
  }
}
```

---

## Shape（特殊形状）

**识别方法**：观察元素是否有特殊的形状设计。

### 常见形状类型
- `"rectangle"` - 标准矩形（默认，可省略）
- `"rounded-rectangle"` - 圆角矩形
- `"circle"` - 圆形
- `"arrow-right"` - 右箭头形状（梯形，右侧尖）
- `"arrow-left"` - 左箭头形状（梯形，左侧尖）
- `"hexagon"` - 六边形
- `"custom"` - 其他自定义形状

### 识别要点
- ✅ 仔细观察卡片/按钮的边缘轮廓
- ✅ 箭头形状通常用于流程、导航、强调
- ✅ 如果看不出特殊形状，使用 `"rectangle"` 或省略该字段

### 示例
```json
// 统计卡片有箭头形状
{
  "visualDetails": {
    "shape": "arrow-right"
  }
}

// 导航按钮是圆形
{
  "visualDetails": {
    "shape": "circle"
  }
}
```

---

## Background（背景）

**识别方法**：观察元素的背景颜色或渐变。

### 背景类型

#### 1. 纯色背景
```json
{
  "background": {
    "type": "solid",
    "value": "#ffffff"
  }
}
```

#### 2. 渐变背景
```json
{
  "background": {
    "type": "gradient",
    "value": "linear-gradient(135deg, #64b5f6 0%, #4a9eff 100%)",
    "direction": "135deg",
    "colors": ["#64b5f6", "#4a9eff"]
  }
}
```

#### 3. 无背景
```json
{
  "background": "transparent"
}
```

### 识别要点
- ✅ 仔细观察颜色过渡，判断是纯色还是渐变
- ✅ 渐变方向：
  - 左上到右下：`135deg`
  - 上到下：`180deg`
  - 左到右：`90deg`
- ✅ 使用色值选择器工具提取准确的颜色值

---

## Borders（边框）

**识别方法**：观察元素是否有边框线。

### 边框类型

#### 1. 无边框
```json
{
  "borders": "none"
}
```

#### 2. 实线边框
```json
{
  "borders": {
    "width": "1px",
    "style": "solid",
    "color": "#e8e8e8"
  }
}
```

#### 3. 部分边框
```json
{
  "borders": {
    "bottom": "1px solid #e8e8e8"
  }
}
```

### 识别要点
- ✅ 放大预览图，观察元素边缘是否有线条
- ✅ 如果看不出明显边框，使用 `"none"`
- ✅ 注意区分边框和阴影

---

## Shadows（阴影）

**识别方法**：观察元素是否有投影效果。

### 阴影类型

#### 1. 无阴影
```json
{
  "shadows": "none"
}
```

#### 2. 标准阴影
```json
{
  "shadows": "0 2px 8px rgba(0, 0, 0, 0.1)"
}
```

#### 3. 悬停阴影
```json
{
  "shadows": {
    "default": "none",
    "hover": "0 2px 8px rgba(0, 0, 0, 0.1)"
  }
}
```

#### 4. 图标底部阴影（常见）
```json
{
  "shadows": {
    "icon": "0 4px 8px rgba(74, 158, 255, 0.3)"
  }
}
```

### 识别要点
- ✅ 观察元素下方或周围是否有模糊的灰色/蓝色区域
- ✅ 阴影通常在卡片、按钮、图标底部
- ✅ 如果看不出阴影，使用 `"none"`

---

## Corners（圆角）

**识别方法**：观察元素的四个角是否是圆角。

### 圆角类型

#### 1. 统一圆角
```json
{
  "corners": "8px"
}
```

#### 2. 不同圆角
```json
{
  "corners": {
    "topLeft": "8px",
    "topRight": "8px",
    "bottomLeft": "0",
    "bottomRight": "0"
  }
}
```

#### 3. 无圆角（直角）
```json
{
  "corners": "0"
}
```

### 识别要点
- ✅ 放大预览图，观察角落是否有弧度
- ✅ 常见圆角值：4px（小）、6px（中）、8px（大）、50%（圆形）
- ✅ 如果看不出明显圆角，使用 `"0"`

---

## Spacing（间距）

**识别方法**：观察元素的内外边距。

### 间距结构
```json
{
  "spacing": {
    "padding": "20px",           // 内边距
    "gap": "12px",              // 子元素之间的间距
    "margin": "12px 0"          // 外边距
  }
}
```

### 识别要点
- ✅ Padding：元素边缘到内容的距离
- ✅ Gap：并列元素之间的距离
- ✅ Margin：元素之间的间隔
- ✅ 通过视觉估算，使用 4 的倍数：4px、8px、12px、16px、20px

---

## 🎯 为每个 Section 添加 TextStyles 字段

### 字段结构
```json
{
  "id": "stat-cards-section",
  "textStyles": {
    "title": {
      "size": "14px",
      "weight": "500",
      "color": "#ffffff"
    },
    "value": {
      "size": "24px",
      "weight": "600",
      "color": "#ffffff"
    },
    "label": {
      "size": "12px",
      "weight": "400",
      "color": "rgba(255, 255, 255, 0.8)"
    },
    "error": {
      "size": "20px",
      "weight": "600",
      "color": "#ff4d4f"
    }
  }
}
```

---

## TextStyles 识别规则

### 文本角色分类
为不同角色的文本定义样式：

- **title** - 标题文字（section 的小标题）
- **value** - 数值文字（统计数据、指标值）
- **label** - 标签文字（描述性文字）
- **error** - 错误/异常文字（警告信息、异常数）
- **success** - 成功文字（正常状态提示）
- **secondary** - 次要文字（辅助说明）

### Size（字号）

**识别方法**：通过视觉对比判断文字大小。

#### 常见字号参考
- `8px` - 极小文字（徽章、角标）
- `10px` - 小文字（竖排导航）
- `12px` - 标签文字
- `14px` - 标题文字
- `16px` - 大标题文字
- `20px` - 突出数值
- `24px` - 大数值
- `28px-32px` - 特大数值

#### 识别要点
- ✅ 观察文字相对大小，建立大小层级
- ✅ 最小文字作为基准（通常是 12px）
- ✅ 数值文字通常是标签文字的 2 倍大

### Weight（字重）

**识别方法**：观察文字的粗细。

#### 常见字重
- `400` - 正常（Normal）
- `500` - 中等（Medium）
- `600` - 半粗（Semi-Bold）
- `700` - 粗体（Bold）

#### 识别要点
- ✅ 标签文字通常是 `400`
- ✅ 标题文字通常是 `500` 或 `600`
- ✅ 数值文字通常是 `600` 或 `700`
- ✅ 如果看不出明显粗细差异，使用 `400`

### Color（颜色）

**识别方法**：使用色值选择器提取准确颜色。

#### 常见文本颜色
- `#333333` - 深色主文字（浅色主题）
- `#666666` - 深色次要文字（浅色主题）
- `#ffffff` - 白色文字（深色背景）
- `rgba(255, 255, 255, 0.8)` - 半透明白色（深色背景）
- `#ff4d4f` - 错误/异常红色
- `#52c41a` - 成功绿色
- `#4a9eff` - 主题蓝色

#### 识别要点
- ✅ 使用取色器工具提取准确色值
- ✅ 注意区分纯色和半透明色
- ✅ 错误/异常数字通常是红色
- ✅ 成功/完好率通常是绿色

---

## 🎯 DataFormat（数据格式）

**用于描述数据的显示格式，特别是特殊的格式约定。**

### 字段结构
```json
{
  "id": "device-list-section",
  "dataFormat": {
    "pattern": "bracket",
    "example": "(2/484)",
    "description": "异常数/总数，使用括号包裹"
  }
}
```

### 常见格式类型

#### 1. 括号格式
```json
{
  "dataFormat": {
    "pattern": "bracket",
    "example": "(2/484)",
    "separator": "/",
    "errorStyle": "red-first"  // 异常数用红色
  }
}
```

#### 2. 百分比格式
```json
{
  "dataFormat": {
    "pattern": "percentage",
    "example": "98%",
    "decimals": 0
  }
}
```

#### 3. 千位分隔符
```json
{
  "dataFormat": {
    "pattern": "number",
    "example": "68,562",
    "separator": ","
  }
}
```

#### 4. 徽章格式
```json
{
  "dataFormat": {
    "pattern": "badge",
    "example": "3/3740",
    "description": "显示在导航项右上角"
  }
}
```

### 识别要点
- ✅ 仔细观察数字的显示方式
- ✅ 注意分隔符：`/`、`,`、`-`
- ✅ 注意括号、单位、前缀
- ✅ 记录异常值的颜色标记规则

---

## 完整示例

```json
{
  "sections": [
    {
      "id": "stat-cards-section",
      "name": "统计卡片组",
      "role": "stat-cards-group",
      "layout": "horizontal",
      "visualDetails": {
        "shape": "arrow-right",
        "background": {
          "type": "gradient",
          "value": "linear-gradient(135deg, #64b5f6 0%, #4a9eff 100%)"
        },
        "borders": "none",
        "shadows": "none",
        "corners": "8px",
        "spacing": {
          "padding": "20px",
          "gap": "12px"
        }
      },
      "textStyles": {
        "title": {
          "size": "14px",
          "weight": "500",
          "color": "#ffffff"
        },
        "value": {
          "size": "24px",
          "weight": "600",
          "color": "#ffffff"
        },
        "label": {
          "size": "12px",
          "weight": "400",
          "color": "rgba(255, 255, 255, 0.8)"
        },
        "error": {
          "size": "20px",
          "weight": "600",
          "color": "#ff4d4f"
        }
      },
      "children": [
        {
          "name": "隧道设备",
          "role": "stat-card",
          "widthRatio": 0.5
        },
        {
          "name": "南北接线设备",
          "role": "stat-card",
          "widthRatio": 0.5
        }
      ]
    },
    {
      "id": "device-list-section",
      "name": "设备列表",
      "role": "list",
      "visualDetails": {
        "background": {
          "type": "solid",
          "value": "#ffffff"
        },
        "borders": {
          "width": "1px",
          "style": "solid",
          "color": "#e8e8e8"
        },
        "corners": "8px",
        "shadows": {
          "default": "none",
          "hover": "0 2px 8px rgba(0, 0, 0, 0.1)"
        }
      },
      "textStyles": {
        "title": {
          "size": "12px",
          "weight": "400",
          "color": "#333333"
        },
        "value": {
          "size": "14px",
          "weight": "600",
          "color": "#4a9eff"
        }
      },
      "dataFormat": {
        "pattern": "bracket",
        "example": "(2/484)",
        "separator": "/",
        "errorStyle": "red-first"
      }
    }
  ]
}
```

---

## 识别优先级

1. **形状（Shape）** - 最容易识别，优先判断
2. **背景（Background）** - 颜色和渐变
3. **文本样式（TextStyles）** - 字号、粗细、颜色
4. **间距（Spacing）** - 内外边距
5. **边框（Borders）** - 有或无
6. **圆角（Corners）** - 角落弧度
7. **阴影（Shadows）** - 投影效果
8. **数据格式（DataFormat）** - 特殊显示规则

---

## ⚠️ 注意事项

1. **只描述能看到的**：如果预览图中看不清楚，使用保守估计或省略该字段
2. **避免臆造**：不要根据"经验"添加默认样式
3. **颜色准确性**：使用取色器工具，不要目测
4. **一致性**：同类元素的样式描述应该一致
5. **完整性**：每个 section 都应该有 visualDetails 和 textStyles 字段
