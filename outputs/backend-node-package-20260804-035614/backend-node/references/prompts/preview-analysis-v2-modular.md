# Preview Analysis - 模块化版本

> 本文件是模块化重构后的主入口，各规则已拆分到独立模块中。

---

## 📖 阅读顺序

AI 在执行分析任务时，必须按以下顺序加载模块：

### 1️⃣ 核心约束（必读）
**文件**: `modules/01-core-constraints.md`  
**内容**: 图片验证协议、语言要求、输出格式、零臆造原则  
**重要性**: ⭐⭐⭐⭐⭐ 最高优先级

### 2️⃣ 布局分析规则
**文件**: `modules/02-layout-analysis-rules.md`  
**内容**: Panel vs Section、嵌套容器、HeaderRelation、WidthRatio  
**重要性**: ⭐⭐⭐⭐⭐

### 3️⃣ 视觉细节捕获（新增⭐）
**文件**: `modules/03-visual-details-capture.md`  
**内容**: VisualDetails、TextStyles、DataFormat 字段的详细识别规则  
**重要性**: ⭐⭐⭐⭐⭐ **关键新增模块**

### 4️⃣ 图表分析规则（可选）
**文件**: `modules/04-chart-analysis-rules.md`  
**内容**: 图表类型识别、图例位置、数据系列  
**重要性**: ⭐⭐⭐⭐ 仅当组件包含图表时加载

### 5️⃣ 交互识别规则（可选）
**文件**: `modules/05-interaction-rules.md`  
**内容**: Tab切换、下拉菜单、筛选器、时间选择  
**重要性**: ⭐⭐⭐ 仅当组件有交互时加载

---

## 🎯 核心改进点

### ✨ 新增 VisualDetails 字段
每个 section 现在必须包含详细的视觉样式信息：

```json
{
  "id": "stat-cards-section",
  "visualDetails": {
    "shape": "arrow-right",           // ✨ 新增：特殊形状
    "background": {                   // ✨ 增强：渐变详情
      "type": "gradient",
      "value": "linear-gradient(...)"
    },
    "borders": "none",                // ✨ 新增
    "shadows": "...",                 // ✨ 新增
    "corners": "8px",                 // ✨ 新增
    "spacing": {                      // ✨ 新增
      "padding": "20px",
      "gap": "12px"
    }
  }
}
```

### ✨ 新增 TextStyles 字段
为不同角色的文本定义详细样式：

```json
{
  "textStyles": {
    "title": { "size": "14px", "weight": "500", "color": "#fff" },
    "value": { "size": "24px", "weight": "600", "color": "#fff" },
    "label": { "size": "12px", "weight": "400", "color": "rgba(255,255,255,0.8)" },
    "error": { "size": "20px", "weight": "600", "color": "#ff4d4f" }
  }
}
```

### ✨ 新增 DataFormat 字段
描述数据的显示格式：

```json
{
  "dataFormat": {
    "pattern": "bracket",
    "example": "(2/484)",
    "separator": "/",
    "errorStyle": "red-first"
  }
}
```

---

## 📏 Prompt 大小对比

| 文件 | 旧版本 | 新版本（模块化） |
|------|--------|----------------|
| preview-analysis.md | 48KB (1150行) | 2KB (主入口) |
| 核心约束 | - | 2.5KB |
| 布局规则 | - | 7KB |
| 视觉细节 | - | 11KB (新增⭐) |
| 图表规则 | - | ~8KB (待创建) |
| 交互规则 | - | ~5KB (待创建) |
| **总计** | **48KB** | **35.5KB** (分模块加载) |

**优势**：
- ✅ 单次加载仅需 10-20KB（按需选择模块）
- ✅ 规则更清晰，AI 不会遗漏
- ✅ 易于维护和更新

---

## 🚀 使用方法

### 代码生成工具调用示例

```javascript
// 在 mc-gen 工具中
const buildPreviewAnalysisPrompt = (componentName, previewImagePath) => {
  const modules = [
    readModule('01-core-constraints.md'),        // 必需
    readModule('02-layout-analysis-rules.md'),   // 必需
    readModule('03-visual-details-capture.md'),  // 必需
    // 根据组件类型按需加载：
    hasCharts ? readModule('04-chart-analysis-rules.md') : '',
    hasInteraction ? readModule('05-interaction-rules.md') : ''
  ]
  
  return modules.join('\n\n---\n\n') + `\n\n## 分析任务\n\n请分析组件：${componentName}\n预览图路径：${previewImagePath}`
}
```

---

## 📊 输出格式示例

完整的 preview-analysis.json 示例（包含新增字段）：

```json
{
  "IMAGE_VERIFICATION": "REQUIRED",
  "canSeeImage": true,
  "evidence": { ... },
  "componentName": "设备监测",
  "componentType": "statistics",
  "summary": "...",
  "layout": {
    "type": "vertical-stack",
    "direction": "vertical",
    "sections": [
      {
        "id": "stat-cards-section",
        "name": "统计卡片组",
        "role": "stat-cards-group",
        "layout": "horizontal",
        "headerRelation": "content-below-title",
        "slotCandidate": null,
        
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
          "title": { "size": "14px", "weight": "500", "color": "#ffffff" },
          "value": { "size": "24px", "weight": "600", "color": "#ffffff" },
          "label": { "size": "12px", "weight": "400", "color": "rgba(255,255,255,0.8)" },
          "error": { "size": "20px", "weight": "600", "color": "#ff4d4f" }
        },
        
        "children": [
          { "name": "隧道设备", "role": "stat-card", "widthRatio": 0.5 },
          { "name": "南北接线设备", "role": "stat-card", "widthRatio": 0.5 }
        ]
      },
      {
        "id": "device-list-section",
        "name": "设备列表",
        "role": "list",
        
        "visualDetails": {
          "background": { "type": "solid", "value": "#ffffff" },
          "borders": { "width": "1px", "style": "solid", "color": "#e8e8e8" },
          "corners": "8px",
          "shadows": { "default": "none", "hover": "0 2px 8px rgba(0,0,0,0.1)" }
        },
        
        "textStyles": {
          "title": { "size": "12px", "weight": "400", "color": "#333333" },
          "value": { "size": "14px", "weight": "600", "color": "#4a9eff" }
        },
        
        "dataFormat": {
          "pattern": "bracket",
          "example": "(2/484)",
          "separator": "/",
          "errorStyle": "red-first"
        }
      }
    ]
  },
  "styles": { ... },
  "charts": [],
  "interactions": []
}
```

---

## ⚠️ 迁移注意事项

### 旧版 prompt 的问题
- ❌ 48KB 单文件，AI 容易遗漏后半部分规则
- ❌ 缺少视觉细节字段，导致 UI 还原度不足
- ❌ 示例过多，占用大量 tokens

### 新版改进
- ✅ 模块化，按需加载
- ✅ 新增 visualDetails、textStyles、dataFormat 字段
- ✅ 规则更清晰，优先级明确

### 代码生成阶段需要调整
代码生成 prompt 需要利用这些新字段：

```javascript
// 在 figma-code-generation prompt 中
const visualDetails = section.visualDetails
const textStyles = section.textStyles

// 生成 CSS 时使用这些数据
if (visualDetails.shape === 'arrow-right') {
  css += `clip-path: polygon(0 0, calc(100% - 20px) 0, 100% 50%, calc(100% - 20px) 100%, 0 100%);`
}

if (visualDetails.background.type === 'gradient') {
  css += `background: ${visualDetails.background.value};`
}

if (textStyles.title) {
  css += `.title { font-size: ${textStyles.title.size}; font-weight: ${textStyles.title.weight}; color: ${textStyles.title.color}; }`
}
```

---

## 🎯 预期效果

### UI 还原度提升

| 问题 | 旧版 | 新版 |
|------|------|------|
| 卡片箭头形状 | ❌ 缺失 | ✅ visualDetails.shape |
| 渐变背景 | ⚠️ 不准确 | ✅ background.type + value |
| 文本大小颜色 | ⚠️ AI臆造 | ✅ textStyles 准确描述 |
| 数据格式 | ❌ 不一致 | ✅ dataFormat 明确规则 |
| 边框圆角阴影 | ❌ AI惯性添加 | ✅ 明确描述，禁止臆造 |

### 综合评分

- **旧版 UI 还原度**: 7/10
- **新版 UI 还原度**: 9/10（预期）

---

## 📝 TODO

- [x] 创建核心约束模块
- [x] 创建布局分析模块
- [x] 创建视觉细节捕获模块（新增⭐）
- [ ] 创建图表分析模块
- [ ] 创建交互识别模块
- [ ] 修改 mc-gen 工具调用逻辑
- [ ] 测试新 prompt 的实际效果
- [ ] 更新代码生成 prompt 以使用新字段

---

**版本**: v2.0-modular  
**创建日期**: 2026-06-30  
**状态**: ✅ 核心模块完成，待集成到 mc-gen 工具
