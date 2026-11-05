# Header-Right 插槽识别指南

## 问题背景

AI 在识别哪些元素应该放在 header-right 插槽时准确率较低（约40%），导致布局错误。

## Header-Right 插槽的作用

header-right 插槽位于组件标题栏的右侧区域，通常用于放置：
- 操作按钮（刷新、设置、导出等）
- 筛选控件（时间选择器、下拉框等）
- 搜索框
- 图标按钮
- 状态指示器

## 识别关键特征

### 1. 位置特征（最重要）

**Y坐标判断**：
- 元素的Y坐标与header区域顶部对齐
- 通常在容器顶部20-60px范围内
- 与标题文字在同一水平线上

**X坐标判断**：
- 元素位于容器的右侧部分
- X坐标通常大于容器宽度的50%
- 靠近容器右边缘（通常在右侧100px范围内）

### 2. Figma节点层级

**正确的层级关系**：
- 与header容器在同一父容器下
- 不是header标题的子元素
- 通常与标题元素是兄弟节点

### 3. 元素类型

**常见的header-right元素类型**：
- 按钮（button）
- 图标（icon）
- 搜索框（search/input）
- 下拉选择器（select/dropdown）
- 时间选择器（date-picker）
- 操作图标组（action-group）

### 4. 视觉特征

**外观特征**：
- 尺寸较小（通常24-40px高度）
- 间距紧凑
- 颜色通常是主题色或中性色
- 可能有图标配合文字

## 识别流程

### Step 1: 定位Header区域

```javascript
// 从layout中查找header section
const headerSection = analysis.layout.sections.find(section => {
  return section.name.includes('header') || 
         section.name.includes('顶部') ||
         section.name.includes('标题')
})
```

### Step 2: 提取Header区域的元素

```javascript
// 获取header区域内的所有元素
const headerElements = extractElementsFromSection(headerSection, nodeData)
```

### Step 3: 计算Header的基准Y坐标

```javascript
// 计算header区域所有元素的平均Y坐标
const headerY = calculateAverageY(headerElements)
```

### Step 4: 判断元素是否属于header-right

```javascript
for (const element of headerElements) {
  // Y坐标接近（±20px容差）
  if (Math.abs(element.y - headerY) <= 20) {
    // X坐标在右侧
    if (element.bounds.x > containerWidth / 2) {
      // 元素类型符合
      if (isHeaderRightType(element.type)) {
        candidates.push(element)
      }
    }
  }
}
```

## 常见错误案例

### 错误1: 将标题文字误判为header-right元素
- **原因**: 只看X坐标，忽略了元素类型
- **解决**: 检查元素类型，标题文字不应放入header-right

### 错误2: 将内容区域的按钮误判为header-right元素
- **原因**: 只看元素类型，忽略了Y坐标
- **解决**: 必须检查Y坐标是否与header顶部对齐

### 错误3: 遗漏了正确的header-right元素
- **原因**: Y坐标容差设置太小
- **解决**: 使用合理的容差范围（建议±20px）

## 输出格式

当识别到header-right元素时，应输出：

```json
{
  "headerValidation": {
    "passed": true,
    "headerElements": [...],
    "headerRightElements": [
      {
        "name": "refresh-button",
        "type": "button",
        "bounds": { "x": 1680, "y": 24, "width": 32, "height": 32 },
        "y": 24,
        "nodeId": "1234:5678"
      }
    ],
    "suggestions": [
      "建议将以下元素放入header-right插槽: refresh-button, setting-icon"
    ],
    "confidence": "high"
  }
}
```

## 置信度等级

- **high**: Y坐标对齐 + X坐标在右侧 + 元素类型匹配 + Figma层级正确
- **medium**: Y坐标对齐 + X坐标在右侧，但元素类型不明确
- **low**: 仅基于基础特征推断，缺少Figma节点数据

## 最佳实践

1. **优先级**: Y坐标对齐 > X坐标位置 > 元素类型 > Figma层级
2. **容差设置**: Y坐标容差建议±20px，X坐标判断使用容器宽度的50%作为分界
3. **类型检查**: 使用白名单方式，只接受明确的header-right类型
4. **边界情况**: 当元素在容器中间位置时，优先判定为非header-right

## 代码示例

```javascript
// 完整的判断逻辑
function shouldBeInHeaderRight(element, headerY, nodeData) {
  const yTolerance = 20
  const containerWidth = nodeData?.absoluteBoundingBox?.width || 1920
  
  // 1. Y坐标检查
  if (Math.abs(element.y - headerY) > yTolerance) {
    return false
  }
  
  // 2. X坐标检查
  if (element.bounds.x <= containerWidth / 2) {
    return false
  }
  
  // 3. 类型检查
  const rightSideTypes = ['button', 'icon', 'search', 'input', 'action']
  if (element.type) {
    const typeLower = element.type.toLowerCase()
    if (rightSideTypes.some(t => typeLower.includes(t))) {
      return true
    }
  }
  
  return true
}
```

## 注意事项

1. **必须有Figma节点数据**: 如果没有nodeData，validator会跳过验证
2. **Y坐标是最关键因素**: 元素必须与header在同一水平线上
3. **避免过度匹配**: 不要将所有右侧元素都判定为header-right
4. **保持保守**: 当不确定时，不要将元素放入header-right
