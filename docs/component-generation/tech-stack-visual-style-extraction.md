# 技术栈节点样式处理优化方案（视觉识别驱动）

## 核心思路总结

**你的方案要点**：
1. **节点还原**：跳过 `@xxx` 技术栈节点的内部结构还原（正确）
2. **样式提取**：通过**视觉识别**提取容器的大概样式（背景色、文字颜色等）
3. **Deep 样式控制**：
   - Ant Design 等 UI 组件库：**不需要 deep**（组件库自带样式）
   - 自定义组件：已有 **scoped**，也**不需要 deep**

## 问题分析

### 当前的矛盾

```
@ant/select (FRAME)
  fills: [{ type: 'SOLID', color: '#f5f5f5' }]  ← 视觉上看到灰色背景
  strokes: [{ color: '#d9d9d9' }]               ← 视觉上看到浅灰边框
  ├── 下拉框主体 (FRAME)
  │   fills: [{ type: 'SOLID', color: '#ffffff' }]  ← 组件内部样式
  │   └── 输入框文本 (TEXT)
  │       fills: [{ type: 'SOLID', color: '#333333' }]  ← 内部文字颜色
  └── 下拉箭头 (VECTOR)
```

**当前问题**：
- ❌ 跳过整个节点 → 连容器的灰色背景也丢失了
- ❌ 不跳过 → 会还原内部的白色背景、文字颜色（错误，应该由 antd 控制）

### 你的方案的核心优势

**"视觉识别还原大概的颜色背景、文字颜色"**：

不是完全跳过样式，而是：
- ✅ **容器级别**：还原视觉上看到的背景色、边框、圆角
- ❌ **内部细节**：不还原组件库内部的样式（如 input 的内边距、hover 效果）

**关于 deep 的判断**：

你的理解完全正确：
- **Ant Design 等组件库**：组件自带完整样式系统，不需要 deep 覆盖
- **自定义组件 + scoped**：样式已经隔离，不需要 deep 穿透
- **唯一需要 deep 的场景**：要覆盖第三方组件库的内部样式时（极少数情况）

## 优化方案设计

### 方案核心：视觉识别 + 容器样式

#### 1. 视觉识别提取容器样式

**原理**：只看技术栈节点本身的视觉属性，不递归子节点

```javascript
/**
 * 通过视觉识别提取技术栈节点的容器样式
 * 只提取节点本身的视觉属性，不递归子节点
 * @param {Object} node - Figma 技术栈节点（如 @ant/select）
 * @returns {Object} 容器样式对象
 */
function extractVisualContainerStyles(node) {
  const styles = {}
  
  // ✅ 背景色/背景渐变（只看节点本身的 fills）
  if (node.fills && node.fills.length > 0) {
    const fill = node.fills[0]
    if (fill.visible !== false && fill.type === 'SOLID') {
      // 纯色背景：直接提取
      styles.background = rgbaToHex(fill.color, fill.opacity)
    } else if (fill.type === 'GRADIENT_LINEAR' || fill.type === 'GRADIENT_RADIAL') {
      // 渐变背景：提取渐变
      styles.background = convertGradient(fill)
    }
    // ⚠️ 背景图：技术栈节点的背景图通常是装饰性的，谨慎处理
    // 可以通过规则判断：如果是纯装饰图案，跳过；如果是有意义的背景，保留
  }
  
  // ✅ 边框（只看节点本身的 strokes）
  if (node.strokes && node.strokes.length > 0) {
    const stroke = node.strokes[0]
    if (stroke.visible !== false) {
      const width = node.strokeWeight || 1
      const color = rgbaToHex(stroke.color)
      styles.border = `${width}px solid ${color}`
    }
  }
  
  // ✅ 圆角（视觉属性）
  if (node.cornerRadius) {
    styles.borderRadius = `${node.cornerRadius}px`
  } else if (node.rectangleCornerRadii) {
    styles.borderRadius = node.rectangleCornerRadii.map(r => `${r}px`).join(' ')
  }
  
  // ✅ 阴影（视觉属性）
  if (node.effects) {
    const shadows = node.effects.filter(e => 
      e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW'
    )
    if (shadows.length > 0) {
      styles.boxShadow = shadows.map(s => convertShadow(s)).join(', ')
    }
  }
  
  // ✅ 透明度（视觉属性）
  if (node.opacity !== undefined && node.opacity !== 1) {
    styles.opacity = node.opacity
  }
  
  // ⚠️ 文字颜色：需要特殊处理
  // 如果技术栈节点本身有文本（如 @ant/button 按钮上的文字），提取其颜色
  // 但不要递归提取子节点的文字颜色（那些由组件库控制）
  if (node.type === 'TEXT' && node.fills && node.fills.length > 0) {
    const textFill = node.fills[0]
    if (textFill.visible !== false && textFill.type === 'SOLID') {
      styles.color = rgbaToHex(textFill.color)
    }
  }
  
  // ✅ 尺寸（布局属性，容器需要）
  if (node.width) styles.width = `${node.width}px`
  if (node.height) styles.height = `${node.height}px`
  
  // ✅ 内边距（布局属性，容器需要）
  if (node.paddingLeft || node.paddingRight || node.paddingTop || node.paddingBottom) {
    const top = node.paddingTop || 0
    const right = node.paddingRight || 0
    const bottom = node.paddingBottom || 0
    const left = node.paddingLeft || 0
    styles.padding = `${top}px ${right}px ${bottom}px ${left}px`
  }
  
  // ❌ 明确跳过的属性
  // - layoutMode / itemSpacing：内部布局由组件库控制
  // - 子节点的任何样式：不递归
  
  return styles
}
```

#### 2. Deep 样式控制规则

**规则表**：

| 场景 | 是否使用 deep | 原因 |
|------|--------------|------|
| **Ant Design 组件** (如 `<a-select>`) | ❌ 不需要 | 组件库自带完整样式系统 |
| **Element Plus 组件** (如 `<el-button>`) | ❌ 不需要 | 组件库自带完整样式系统 |
| **ECharts 图表** (如 `<div ref="chart">`) | ❌ 不需要 | 图表内部样式由 ECharts API 控制 |
| **自定义子组件 + scoped** | ❌ 不需要 | scoped 已经隔离，不会污染父组件 |
| **要覆盖第三方组件内部样式** | ✅ 需要 deep | 极少数情况，明确标注 |

**代码实现**：

```javascript
/**
 * 判断技术栈节点是否需要 deep 样式
 * @param {Object} techStackHint - 技术栈提示对象 { library, component }
 * @returns {boolean} 是否需要 deep
 */
function needsDeepStyles(techStackHint) {
  if (!techStackHint) return false
  
  const { library, component } = techStackHint
  
  // ❌ UI 组件库：不需要 deep
  const UI_LIBRARIES = ['ant', 'antd', 'element', 'el', 'vant', 'naive']
  if (UI_LIBRARIES.includes(library)) {
    return false
  }
  
  // ❌ 图表库：不需要 deep
  const CHART_LIBRARIES = ['echarts', 'chart', 'g2', 'highcharts']
  if (CHART_LIBRARIES.includes(library)) {
    return false
  }
  
  // ❌ 地图库：不需要 deep
  const MAP_LIBRARIES = ['amap', 'bmap', 'mapbox', 'leaflet']
  if (MAP_LIBRARIES.includes(library)) {
    return false
  }
  
  // ✅ 其他情况：默认不需要 deep（保守策略）
  // 如果需要，用户可以在 Figma 中标注 @xxx#deep
  return false
}
```

#### 3. 生成代码模板

**正确示例**（视觉识别容器样式 + 不使用 deep）：

```vue
<template>
  <div class="select-container">
    <a-select 
      v-model="value" 
      :options="options"
      placeholder="请选择"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'

const value = ref(undefined)
const options = ref([
  { label: '选项1', value: '1' },
  { label: '选项2', value: '2' },
])
</script>

<style scoped lang="less">
.select-container {
  /* ✅ 容器级别样式：从 Figma 视觉识别提取 */
  background: #f5f5f5;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  padding: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  
  /* ❌ 不使用 deep：antd 组件自带样式 */
  /* 错误写法：:deep(.ant-select) { ... } */
}
</style>
```

**错误示例**（深入还原内部样式 + 使用 deep）：

```vue
<!-- ❌ 不要这样做 -->
<style scoped lang="less">
.select-container {
  background: #f5f5f5;
  
  /* ❌ 错误：不要用 deep 覆盖组件库内部样式 */
  :deep(.ant-select-selector) {
    background: #ffffff;
    border: 1px solid #d9d9d9;
    padding: 4px 11px;
  }
  
  :deep(.ant-select-arrow) {
    color: #666666;
  }
}
</style>
```

### 方案实施步骤

#### Step 1: 修改样式提取逻辑

**文件**: `src/ai-engine/utils/figma-format.js` 或 `visual-parser.js`

```javascript
// 新增函数
export function extractVisualContainerStyles(node) {
  // 实现上面的视觉识别逻辑
}

// 修改现有的样式提取函数
export function extractNodeStyles(node) {
  // 检测是否为技术栈节点
  const isTechStack = node.name && /@[a-zA-Z]/.test(node.name)
  
  if (isTechStack) {
    // ✅ 只提取视觉容器样式
    return {
      isTechStackNode: true,
      containerStyles: extractVisualContainerStyles(node),
      techStackHint: parseTechStackHint(node.name),
      needsDeep: false  // 默认不需要 deep
    }
  } else {
    // 正常节点：完整提取
    return {
      isTechStackNode: false,
      styles: extractFullStyles(node),
      children: node.children?.map(child => extractNodeStyles(child)) || []
    }
  }
}
```

#### Step 2: 增强 Prompt 指导

**文件**: `src/ai-engine/roles/microcode-engineer.js` 和 `vue3-engineer.js`

```javascript
const techStackStyleGuidance = `
## 技术栈节点样式处理规则（视觉识别驱动）

### ✅ 容器样式提取（通过视觉识别）

对于标注了 @技术栈 的节点，**只提取容器级别的视觉样式**：

1. **背景**：background（纯色/渐变，背景图谨慎判断）
2. **边框**：border, border-radius
3. **阴影**：box-shadow
4. **尺寸**：width, height
5. **间距**：padding（容器内边距）
6. **透明度**：opacity

### ❌ 不要还原的内部样式

- 不要深入子节点提取样式
- 不要还原组件库内部的样式（如 input 内边距、hover 效果）
- 不要还原内部布局（flex、gap 等由组件库控制）
- 不要还原内部文字样式（由组件库控制）

### 🚫 不要使用 deep 样式

对于以下技术栈，**不要使用 :deep() 或 /deep/ 或 ::v-deep**：

- **UI 组件库**：@ant / @antd / @element / @el / @vant / @naive
- **图表库**：@echarts / @chart / @g2 / @highcharts
- **地图库**：@amap / @bmap / @mapbox / @leaflet

**原因**：
1. 这些组件库自带完整样式系统
2. 自定义组件已有 scoped，不需要穿透
3. 使用 deep 可能破坏组件库的样式逻辑

### 代码生成示例

**✅ 正确示例（容器样式 + 不使用 deep）**：

\`\`\`vue
<template>
  <div class="form-wrapper">
    <a-form :model="formData">
      <a-form-item label="用户名">
        <a-input v-model:value="formData.username" />
      </a-form-item>
    </a-form>
  </div>
</template>

<style scoped lang="less">
.form-wrapper {
  /* ✅ 容器样式：从 Figma 视觉识别提取 */
  background: #f5f5f5;
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  
  /* ✅ 不使用 deep，让 antd 组件保持原生样式 */
}
</style>
\`\`\`

**❌ 错误示例（使用 deep 覆盖组件库）**：

\`\`\`vue
<!-- 不要这样做 -->
<style scoped lang="less">
.form-wrapper {
  background: #f5f5f5;
  
  /* ❌ 错误：不要用 deep 覆盖 antd 内部样式 */
  :deep(.ant-form-item-label) {
    color: #333333;
    font-size: 14px;
  }
  
  :deep(.ant-input) {
    background: #ffffff;
    border: 1px solid #d9d9d9;
  }
}
</style>
\`\`\`

### 特殊情况：确实需要覆盖组件库样式

极少数情况下，如果设计稿中明确要求覆盖组件库的默认样式（如修改 antd 按钮的主题色），
可以在 Figma 中标注 \`@ant/button#deep\`，生成时才使用 :deep()。

**但优先推荐的做法是**：
1. 使用组件库的主题配置（如 antd 的 ConfigProvider）
2. 使用组件的 props（如 \`<a-button type="primary" danger>\`）
3. 使用全局样式变量（如 CSS Variables）
`

// 将这段规则注入到 Prompt 中
p += techStackStyleGuidance
```

#### Step 3: 验证和测试

**测试用例设计**：

1. **表单容器有灰色背景**
   - 输入: `@ant/form` (background: #f5f5f5, padding: 24px)
   - 期望: 容器 div 有背景和内边距，不使用 deep

2. **表格有白色背景和边框**
   - 输入: `@ant/table` (background: #fff, border: 1px solid #e5e5e5)
   - 期望: 容器 div 有背景和边框，不使用 deep

3. **按钮有圆角和阴影**
   - 输入: `@ant/button` (border-radius: 4px, box-shadow: ...)
   - 期望: 容器 div 有圆角和阴影，不使用 deep

4. **图表有装饰性背景**
   - 输入: `@echarts/bar` (backgroundImage: url(...))
   - 期望: 判断背景图是否应该保留，不使用 deep

## 方案优势

### 1. 视觉驱动，简单直观

- ✅ "看到什么，还原什么"（容器层面）
- ✅ 不需要复杂的规则判断（只看节点本身的视觉属性）
- ✅ 符合设计师的思维模式

### 2. 避免样式污染

- ✅ 不使用 deep，保持组件库的原生样式
- ✅ scoped 已经隔离，不会污染父组件
- ✅ 减少样式冲突和意外覆盖

### 3. 生成代码更简洁

- ✅ 只有必要的容器样式
- ✅ 没有冗余的 deep 覆盖
- ✅ 更易维护和调试

### 4. Token 消耗更少

- ✅ 不传递子节点的样式信息
- ✅ Prompt 更简洁
- ✅ 生成更快

## 边界情况处理

### 情况1: 文字颜色的判断

**问题**：技术栈节点本身可能有文字（如按钮上的文字），如何判断是否应该提取文字颜色？

**规则**：
- ✅ 如果节点本身是 TEXT 类型 → 提取颜色
- ❌ 如果是子节点的 TEXT → 不提取（由组件库控制）

```javascript
// 只提取节点本身的文字颜色
if (node.type === 'TEXT' && node.fills && node.fills.length > 0) {
  const textFill = node.fills[0]
  if (textFill.type === 'SOLID') {
    styles.color = rgbaToHex(textFill.color)
  }
}

// ❌ 不递归子节点提取文字颜色
// for (const child of node.children) { ... }  // 不执行
```

### 情况2: 背景图的判断

**问题**：技术栈节点有背景图，是装饰性的还是有意义的容器背景？

**规则**：
- ✅ 如果是纯色/渐变 → 直接保留（肯定是容器背景）
- ⚠️ 如果是背景图 → 需要判断：
  - 宽高比接近常见 UI 容器（0.8-5.0）→ 可能是有意义的背景，保留
  - 瘦长条或小方块 → 可能是装饰图案，跳过
  - 或者提供用户标记：`@ant/form#preserve-bg`

```javascript
if (fill.type === 'IMAGE') {
  // 判断宽高比
  const aspectRatio = node.width / node.height
  if (aspectRatio > 0.8 && aspectRatio < 5) {
    // 可能是有意义的容器背景
    styles.backgroundImage = `url(${fill.imageRef})`
  } else {
    // 可能是装饰图案，跳过
    // 或者记录一个警告，让用户手动判断
  }
}
```

### 情况3: 嵌套技术栈节点

**问题**：技术栈节点内部又有技术栈节点（如 `@ant/form` 里有 `@ant/input`）

**规则**：
- ✅ 每个技术栈节点独立处理
- ✅ 不递归子节点（自然避免嵌套问题）

```javascript
// 外层容器
<div class="form-container">  <!-- 提取 @ant/form 的容器样式 -->
  <a-form>
    <div class="input-wrapper">  <!-- 提取 @ant/input 的容器样式 -->
      <a-input />
    </div>
  </a-form>
</div>
```

## 实施优先级

### P0 - 立即实施（核心功能）

1. **实现 `extractVisualContainerStyles()` 函数**
   - 只提取节点本身的视觉属性
   - 不递归子节点
   - 复杂度: 中等（~100行）

2. **修改样式提取逻辑**
   - 标记技术栈节点
   - 调用视觉容器样式提取
   - 复杂度: 低（~50行）

3. **增强 Prompt 指导**
   - 明确"不使用 deep"规则
   - 提供正确/错误示例
   - 复杂度: 低（~50行文档）

### P1 - 短期优化（1-2周）

4. **智能背景图判断**
   - 区分有意义的背景 vs 装饰图案
   - 复杂度: 中等（~80行）

5. **验证和测试**
   - 创建测试用例（表单、表格、按钮、图表各5个）
   - 验证生成的代码不使用 deep
   - 验证容器样式正确提取

### P2 - 长期增强（未来版本）

6. **用户标记支持**
   - 支持 `@xxx#preserve-bg` 等标记
   - 支持 `@xxx#deep`（极少数情况）

7. **样式冲突检测**
   - 检测容器样式是否与组件库默认样式冲突
   - 给出建议

## 关键代码位置

### 需要新增/修改的文件

1. **figma-format.js** 或 **style-extractor.js**
   - 新增: `extractVisualContainerStyles(node)`
   - 新增: `needsDeepStyles(techStackHint)`

2. **visual-parser.js**
   - 修改: 样式提取逻辑，调用 `extractVisualContainerStyles()`

3. **microcode-engineer.js**
   - 修改: Prompt 生成，添加"不使用 deep"规则

4. **vue3-engineer.js**
   - 修改: Prompt 生成，添加"不使用 deep"规则

## 总结

### 核心原则

1. **视觉识别驱动**：只看节点本身的视觉属性，不递归子节点
2. **容器级别样式**：只提取背景、边框、圆角、阴影、尺寸、间距
3. **不使用 deep**：组件库自带样式，scoped 已隔离，不需要穿透

### 预期效果

- ✅ `@ant/form` 的灰色背景正确还原
- ✅ `@ant/table` 的边框和圆角正确还原
- ✅ 不使用 `:deep()` 覆盖组件库样式
- ✅ 生成的代码更简洁、更符合 Vue 规范
- ✅ Token 消耗减少（不传递子节点样式）

### 你的理解完全正确

- ✅ 跳过节点的结构还原（不递归子节点）
- ✅ 通过视觉识别提取容器的大概样式（背景、边框等）
- ✅ 不使用 deep（UI 组件库自带样式，scoped 已隔离）

这个方案既解决了样式缺失的问题，又避免了样式污染和 deep 滥用！

---

**状态**: 📋 方案设计完成，待实施  
**优先级**: P1 (影响生成质量和代码规范)  
**预计工时**: 4-6小时（P0 部分）
