# 技术栈区域资源样式矛盾问题分析

## 问题描述

**用户提出的矛盾**：
- **需求1**: 跳过 `@技术栈` 区域资源（如 `@ant/select`），不深入节点，不还原样式
- **需求2**: 表单、表格如果有背景样式（background），需要还原这些样式

**核心矛盾**：技术栈组件由第三方库渲染，不需要还原内部装饰样式，但容器级别的背景、边框等样式需要保留。

## 当前实现分析

### 1. figma-connector.js 的跳过逻辑

**位置**: `src/ai-engine/roles/figma-connector.js:647-655`

```javascript
// extractResourceNodes() 方法中
if (node.name && /@[a-zA-Z]/.test(node.name)) {
  logger.info(`跳过 @技术栈 区域资源: ${node.name}`, { nodeId: node.id })
  return collected  // ❌ 直接返回，跳过整个子树
}
```

**问题**：
- **资源提取层面**：完全跳过，不导出任何图片资源（正确）
- **样式提取层面**：没有明确处理，可能连容器样式也被跳过

### 2. pruneRedundantFields() 中的样式保留

**位置**: `src/ai-engine/roles/figma-connector.js:786-836`

```javascript
// ✅ 保留填充信息（颜色、渐变 - 技术栈节点需要）
if (node.fills && node.fills.length > 0) {
  optimized.fills = node.fills.map(fill => {
    // 保留纯色、渐变、图片填充
  })
}

// ✅ 保留文本样式（字体、大小 - 技术栈节点需要）
if (node.type === 'TEXT') {
  // 保留字体、大小、颜色等
}
```

**注释明确说明**：技术栈节点需要保留填充信息和文本样式。

### 3. 当前处理策略的不一致性

| 处理阶段 | 当前行为 | 是否合理 |
|---------|---------|---------|
| **资源提取** (extractResourceNodes) | ❌ 跳过整个子树 | ✅ 正确（不导出装饰图片） |
| **样式优化** (pruneRedundantFields) | ✅ 保留填充/文本样式 | ✅ 正确（注释说明需要） |
| **结构提取** (structureData) | ⚠️ 不明确 | ❓ 需要验证 |
| **样式映射** (styleMappings) | ⚠️ 不明确 | ❓ 需要验证 |

## 问题的本质

### 分层理解技术栈节点

```
@ant/select (FRAME)                    ← 容器层：需要样式（背景、边框、圆角、阴影）
├── 下拉框主体 (FRAME)                  ← 组件层：由 antd 渲染，不需要还原
│   ├── 输入框装饰 (VECTOR)            ← 装饰层：不导出图片，不还原样式
│   ├── 下拉箭头图标 (VECTOR)          ← 装饰层：不导出图片，不还原样式
│   └── 选项文本 (TEXT)                ← 装饰层：不还原样式（antd 控制）
└── 下拉菜单 (FRAME)                   ← 组件层：由 antd 渲染
    ├── 选项1 (FRAME)                  ← 装饰层
    └── 选项2 (FRAME)                  ← 装饰层
```

**应该保留的**：
- ✅ 容器层样式：background, border, border-radius, box-shadow, padding
- ✅ 容器层尺寸：width, height（或 flex 布局约束）
- ✅ 容器层定位：position, top, left（如果是绝对定位）

**应该跳过的**：
- ❌ 装饰图片资源：下拉箭头、选项图标、分割线等 VECTOR
- ❌ 内部布局样式：组件内部的 flex 布局（由 antd 控制）
- ❌ 内部文本样式：选项文本的字体、颜色（由 antd 控制）

## 实际场景分析

### 场景1: 表单容器有背景

```figma
@ant/form (FRAME)
  fills: [{ type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.95 } }]  ← 灰色背景
  cornerRadius: 8
  padding: 24
  ├── @ant/input "用户名"
  ├── @ant/input "密码"
  └── @ant/button "提交"
```

**期望输出**：
```vue
<div class="form-container" style="background: #f2f2f2; border-radius: 8px; padding: 24px;">
  <a-input placeholder="用户名" />
  <a-input type="password" placeholder="密码" />
  <a-button type="primary">提交</a-button>
</div>
```

**关键**：容器的背景、圆角、内边距必须还原，但子组件由 antd 渲染。

### 场景2: 表格有边框和背景

```figma
@ant/table (FRAME)
  fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }]  ← 白色背景
  strokes: [{ color: { r: 0.9, g: 0.9, b: 0.9 } }]  ← 浅灰边框
  cornerRadius: 4
  ├── 表头装饰 (FRAME)
  ├── 数据行1 (FRAME)
  └── 数据行2 (FRAME)
```

**期望输出**：
```vue
<div class="table-container" style="background: #fff; border: 1px solid #e5e5e5; border-radius: 4px;">
  <a-table :columns="columns" :dataSource="data" />
</div>
```

### 场景3: 图表有装饰背景

```figma
@echarts/bar (FRAME)
  fills: [{ type: 'IMAGE', ... }]  ← 装饰性背景图
  ├── 柱状图主体 (FRAME)
  ├── 图例 (FRAME)
  └── 坐标轴 (VECTOR)
```

**期望输出**：
```vue
<div class="chart-container" style="background-image: url(...);">
  <div ref="chartRef" style="width: 100%; height: 400px;"></div>
</div>
```

## 优化方案设计

### 方案1: 分层样式提取（推荐）

**核心思想**：区分「容器层样式」vs「装饰层样式」

#### 1.1 资源提取阶段（已正确）

```javascript
// figma-connector.js:extractResourceNodes()
if (node.name && /@[a-zA-Z]/.test(node.name)) {
  // ✅ 跳过整个子树的资源提取（不导出装饰图片）
  return collected
}
```

**保持不变**，这个逻辑是正确的。

#### 1.2 样式提取阶段（需要增强）

**新增函数**: `extractContainerStylesOnly(node)`

```javascript
/**
 * 提取技术栈节点的容器层样式（跳过装饰层）
 * @param {Object} node - Figma 技术栈节点（如 @ant/select）
 * @returns {Object} 容器样式对象
 */
function extractContainerStylesOnly(node) {
  const styles = {}
  
  // ✅ 容器级别样式：背景
  if (node.fills && node.fills.length > 0) {
    const fill = node.fills[0]
    if (fill.visible !== false) {
      if (fill.type === 'SOLID') {
        styles.background = rgbaToHex(fill.color, fill.opacity)
      } else if (fill.type === 'GRADIENT_LINEAR' || fill.type === 'GRADIENT_RADIAL') {
        styles.background = convertGradient(fill)
      } else if (fill.type === 'IMAGE') {
        // ⚠️ 背景图：如果是装饰性的，可能不需要
        // 需要根据实际场景判断
        styles.backgroundImage = `url(${fill.imageRef})`
      }
    }
  }
  
  // ✅ 容器级别样式：边框
  if (node.strokes && node.strokes.length > 0) {
    const stroke = node.strokes[0]
    if (stroke.visible !== false) {
      styles.border = `${node.strokeWeight || 1}px solid ${rgbaToHex(stroke.color)}`
    }
  }
  
  // ✅ 容器级别样式：圆角
  if (node.cornerRadius) {
    styles.borderRadius = `${node.cornerRadius}px`
  } else if (node.rectangleCornerRadii) {
    styles.borderRadius = node.rectangleCornerRadii.map(r => `${r}px`).join(' ')
  }
  
  // ✅ 容器级别样式：阴影
  if (node.effects) {
    const shadows = node.effects.filter(e => 
      e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW'
    )
    if (shadows.length > 0) {
      styles.boxShadow = shadows.map(s => convertShadow(s)).join(', ')
    }
  }
  
  // ✅ 容器级别样式：内边距
  if (node.paddingLeft || node.paddingRight || node.paddingTop || node.paddingBottom) {
    styles.padding = `${node.paddingTop || 0}px ${node.paddingRight || 0}px ${node.paddingBottom || 0}px ${node.paddingLeft || 0}px`
  }
  
  // ✅ 容器级别样式：透明度
  if (node.opacity !== undefined && node.opacity !== 1) {
    styles.opacity = node.opacity
  }
  
  // ❌ 跳过：内部布局（layoutMode、itemSpacing 等）
  // ❌ 跳过：子节点样式
  
  return styles
}
```

#### 1.3 结构提取阶段（需要标记）

**修改**: `buildStructureData()` 或类似函数

```javascript
function buildStructureData(node, depth = 0) {
  const isTechStack = node.name && /@[a-zA-Z]/.test(node.name)
  
  const result = {
    id: node.id,
    name: node.name,
    type: node.type,
    ...extractBasicLayout(node),
  }
  
  if (isTechStack) {
    // ✅ 标记为技术栈节点
    result.isTechStackNode = true
    
    // ✅ 只提取容器样式
    result.containerStyles = extractContainerStylesOnly(node)
    
    // ✅ 保留技术栈提示信息
    const match = node.name.match(/@([^/\s]+)(?:\/([^\s]+))?/)
    if (match) {
      result.techStack = {
        library: match[1],
        component: match[2],
        fullHint: match[0]
      }
    }
    
    // ❌ 不递归子节点（children 设为空或浅层信息）
    result.children = []
    
  } else {
    // 正常节点：完整提取
    result.styles = extractFullStyles(node)
    result.children = node.children?.map(child => buildStructureData(child, depth + 1)) || []
  }
  
  return result
}
```

#### 1.4 Prompt 生成阶段（需要明确指导）

**修改**: `microcode-engineer.js` 或 `vue3-engineer.js` 的 Prompt

```javascript
// 在 Prompt 中添加明确的技术栈节点处理规则
const techStackGuidance = `
## 技术栈节点处理规则

对于标注了 @技术栈 的节点（如 @ant/select、@echarts/bar），遵循以下规则：

### ✅ 必须保留的容器样式
- background / background-image（容器背景）
- border / border-radius（容器边框和圆角）
- box-shadow（容器阴影）
- padding（容器内边距）
- width / height（容器尺寸）
- opacity（容器透明度）

### ❌ 不要还原的内部样式
- 不要深入子节点还原样式（如下拉箭头、选项图标）
- 不要还原组件内部的 flex 布局
- 不要还原组件内部的文本样式
- 不要使用装饰性图片资源

### 代码生成示例

**正确示例**（保留容器样式）：
\`\`\`vue
<template>
  <div class="select-wrapper" :style="containerStyles">
    <a-select v-model="value" :options="options" />
  </div>
</template>

<style scoped lang="less">
.select-wrapper {
  background: #f5f5f5;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  padding: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}
</style>
\`\`\`

**错误示例**（深入还原内部样式）：
\`\`\`vue
<!-- ❌ 不要这样做 -->
<template>
  <div class="select-container">
    <div class="select-input">
      <span class="select-text">请选择</span>
      <img src="arrow-down.png" class="select-arrow" />
    </div>
    <div class="select-dropdown">
      <div class="select-option">选项1</div>
      <div class="select-option">选项2</div>
    </div>
  </div>
</template>
\`\`\`
`
```

### 方案2: 智能背景检测（补充方案）

**适用场景**：无法确定背景是「容器级别」还是「装饰级别」时

```javascript
/**
 * 判断背景是否应该保留
 * @param {Object} node - Figma 节点
 * @returns {boolean} 是否保留背景
 */
function shouldPreserveBackground(node) {
  // 规则1: 纯色/渐变背景 → 保留（通常是容器级别）
  if (node.fills && node.fills.length > 0) {
    const fill = node.fills[0]
    if (fill.type === 'SOLID' || fill.type.startsWith('GRADIENT')) {
      return true
    }
    
    // 规则2: 背景图 + 有明显尺寸 → 可能是装饰性的
    if (fill.type === 'IMAGE') {
      // 如果节点宽高比接近常见UI容器（如表单、卡片），保留
      const aspectRatio = node.width / node.height
      if (aspectRatio > 0.8 && aspectRatio < 5) {
        return true
      }
      // 如果是瘦长条或正方形小块，可能是装饰图案
      return false
    }
  }
  
  return false
}
```

### 方案3: 用户配置项（长期方案）

在 Figma 设计稿或配置文件中增加标记：

```
@ant/select#preserve-bg   ← 保留背景
@ant/table#no-border      ← 不还原边框
@echarts/bar#full-style   ← 完整还原容器样式
```

解析逻辑：
```javascript
function parseTechStackConfig(nodeName) {
  const match = nodeName.match(/@([^#\s]+)#?([^\s]*)/)
  return {
    library: match[1].split('/')[0],
    component: match[1].split('/')[1],
    config: match[2] || 'default'  // preserve-bg / no-border / full-style
  }
}
```

## 实施优先级

### P0 - 立即实施（方案1的核心部分）

1. **新增 `extractContainerStylesOnly()` 函数**
   - 位置: `src/ai-engine/utils/figma-format.js` 或类似工具文件
   - 功能: 提取容器层样式（背景、边框、圆角、阴影、内边距）
   - 复杂度: 中等（~100行代码）

2. **修改 `buildStructureData()` 或 visual-parser 中的结构提取**
   - 位置: `src/ai-engine/roles/visual-parser.js`
   - 功能: 标记技术栈节点，调用 `extractContainerStylesOnly()`
   - 复杂度: 低（~50行修改）

3. **增强 Prompt 指导**
   - 位置: `src/ai-engine/roles/microcode-engineer.js` 和 `vue3-engineer.js`
   - 功能: 添加技术栈节点样式处理规则
   - 复杂度: 低（~30行文档）

### P1 - 短期优化（1-2周）

4. **智能背景检测** (方案2)
   - 自动判断背景是否应该保留
   - 避免误保留装饰性背景图

5. **验证和测试**
   - 创建测试用例：表单、表格、图表各5个
   - 验证容器样式正确还原
   - 验证装饰样式正确跳过

### P2 - 长期增强（未来版本）

6. **用户配置项** (方案3)
   - 支持 `#preserve-bg` 等标记
   - 提供更精细的控制

7. **样式冲突检测**
   - 检测容器样式是否与组件库默认样式冲突
   - 给出警告和建议

## 测试用例设计

### 用例1: 表单容器有灰色背景
```
输入: @ant/form (background: #f5f5f5, padding: 24px)
      ├── @ant/input
      └── @ant/button
      
期望输出: 
  - ✅ 容器 div 有 background: #f5f5f5
  - ✅ 容器 div 有 padding: 24px
  - ✅ 使用 <a-input /> 和 <a-button /> 组件
  - ❌ 不还原 input/button 内部样式
```

### 用例2: 表格有白色背景和边框
```
输入: @ant/table (background: #fff, border: 1px solid #e5e5e5)
      ├── 表头装饰
      └── 数据行
      
期望输出:
  - ✅ 容器 div 有 background: #fff
  - ✅ 容器 div 有 border: 1px solid #e5e5e5
  - ✅ 使用 <a-table /> 组件
  - ❌ 不导出表头/数据行的装饰图片
```

### 用例3: 图表有装饰性背景图
```
输入: @echarts/bar (backgroundImage: url(...))
      ├── 柱状图主体
      └── 坐标轴
      
期望输出:
  - ⚠️ 判断背景图是否应该保留（方案2）
  - ✅ 使用 echarts 实例渲染
  - ❌ 不导出坐标轴的 VECTOR 图片
```

## 风险和注意事项

### 风险1: 样式过度简化
- **问题**: 某些技术栈组件可能依赖容器的特定样式（如表格的滚动容器）
- **缓解**: 保留所有容器级别的盒模型样式（width, height, padding, margin）

### 风险2: 背景图误判
- **问题**: 装饰性背景图被误认为容器背景保留下来
- **缓解**: 使用智能检测（方案2）或用户标记（方案3）

### 风险3: 样式冲突
- **问题**: 容器样式与组件库默认样式冲突（如 padding 叠加）
- **缓解**: Prompt 中明确说明，建议使用 wrapper div 隔离

## 关键代码位置

### 需要修改的文件

1. **figma-connector.js**
   - `extractResourceNodes()`: 已正确（保持不变）
   - `pruneRedundantFields()`: 已保留样式信息（保持不变）

2. **visual-parser.js** 或类似文件
   - 需要新增或修改: `buildStructureData()` 或结构提取逻辑
   - 标记技术栈节点，提取容器样式

3. **figma-format.js** 或 **style-extractor.js**
   - 新增: `extractContainerStylesOnly(node)`
   - 功能: 提取容器层样式

4. **microcode-engineer.js**
   - 修改: Prompt 生成逻辑
   - 添加: 技术栈节点样式处理规则

5. **vue3-engineer.js**
   - 修改: Prompt 生成逻辑
   - 添加: 技术栈节点样式处理规则

### 新增的工具函数

```javascript
// src/ai-engine/utils/tech-stack-style-extractor.js

export function extractContainerStylesOnly(node) { /* ... */ }
export function shouldPreserveBackground(node) { /* ... */ }
export function isTechStackNode(nodeName) { /* ... */ }
export function parseTechStackConfig(nodeName) { /* ... */ }
```

## 总结

### 核心要点

1. **分层处理**: 区分「容器层」vs「装饰层」
2. **资源跳过**: 已正确实现（保持不变）
3. **样式分离**: 只提取容器层样式（新增功能）
4. **Prompt 明确**: 指导 LLM 正确处理技术栈节点

### 推荐方案

**Phase 1 (立即实施)**:
- 实施方案1的 P0 部分
- 新增容器样式提取函数
- 修改结构提取逻辑
- 增强 Prompt 指导

**Phase 2 (短期优化)**:
- 实施智能背景检测
- 创建完整测试用例
- 验证实际生成效果

**Phase 3 (长期增强)**:
- 支持用户配置标记
- 样式冲突检测和建议

### 预期效果

- ✅ 技术栈组件容器样式正确还原（背景、边框、圆角）
- ✅ 装饰性图片和样式正确跳过
- ✅ 生成的代码更简洁、更符合规范
- ✅ 减少 token 消耗（不传递无用的装饰样式）

---

**状态**: 📋 分析完成，待实施  
**优先级**: P1 (影响生成质量)  
**预计工时**: 4-6小时（P0 部分）
