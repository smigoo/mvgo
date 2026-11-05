# 🔴 组件生成验证清单（CRITICAL）

## 核心原则

**每次生成组件代码后，必须执行完整的验证流程，确保代码符合所有关键规范。**

这是防止结构性错误的最后一道防线。

## 验证流程（4个阶段）

### 阶段1：结构完整性验证

#### 1.1 检查 children 结构

```javascript
// 伪代码
function validateChildren(previewAnalysis, generatedCode) {
  for (const section of previewAnalysis.layout.sections) {
    if (section.children && section.children.length > 0) {
      // ✅ 必须检查：代码中是否包含对应数量的子元素
      const childrenInCode = countChildrenInTemplate(generatedCode, section.id)
      
      if (childrenInCode < section.children.length) {
        throw new Error(
          `Section "${section.name}" 应该包含 ${section.children.length} 个子元素，` +
          `但只生成了 ${childrenInCode} 个`
        )
      }
    }
  }
}
```

**检查清单**：
- [ ] 所有包含 children 的 section 都实现了对应的子元素
- [ ] 子元素数量与 `children.length` 一致
- [ ] 每个子元素都有对应的 class 名称

#### 1.2 检查并排布局

```javascript
function validateHorizontalLayout(previewAnalysis, generatedCode) {
  for (const section of previewAnalysis.layout.sections) {
    if (section.widthRatio && section.widthRatio < 1) {
      // ✅ 必须检查：是否使用了正确的布局方式
      const hasGridLayout = generatedCode.includes('grid-template-columns')
      const hasFlexLayout = generatedCode.includes('display: flex')
      
      if (!hasGridLayout && !hasFlexLayout) {
        throw new Error(
          `Section "${section.name}" 的 widthRatio=${section.widthRatio}，` +
          `但代码中没有使用 grid 或 flex 布局`
        )
      }
    }
  }
}
```

**检查清单**：
- [ ] 所有 `widthRatio < 1` 的 section 都使用了横向布局
- [ ] 布局方式为 `display: grid` 或 `display: flex`
- [ ] `grid-template-columns` 的值与 widthRatio 一致

### 阶段2：样式语法验证

#### 2.1 检查 :global 语法

```javascript
function validateGlobalSyntax(styleContent) {
  const errors = []
  
  // ❌ 检测块级 :global 语法
  if (/:global\s*\{/.test(styleContent)) {
    errors.push({
      type: 'invalid-global-block',
      line: findLineNumber(styleContent, ':global {'),
      message: '不能使用 :global { } 块级语法，应该使用 :global(.selector) 或 :deep()'
    })
  }
  
  return errors
}
```

**检查清单**：
- [ ] 没有使用 `:global { }` 块级包裹器
- [ ] 第三方组件样式覆盖使用了 `:deep()` 或非 scoped 标签
- [ ] 共享的 .less 文件只包含变量和 mixin

#### 2.2 检查样式导入

```javascript
function validateStyleImports(styleContent) {
  const imports = styleContent.match(/@import\s+['"]([^'"]+)['"]/g) || []
  
  for (const importStatement of imports) {
    const filePath = importStatement.match(/['"]([^'"]+)['"]/)[1]
    const importedContent = readFile(filePath)
    
    // ⚠️ 检查导入的文件是否包含 :global 语法
    if (/:global\s*\{/.test(importedContent)) {
      throw new Error(
        `导入的文件 ${filePath} 包含 :global 语法，会导致编译错误`
      )
    }
  }
}
```

**检查清单**：
- [ ] 所有 `@import` 导入的文件都是安全的（只包含变量和 mixin）
- [ ] 没有导入包含 `:global` 语法的文件

### 阶段3：图表配置验证

#### 3.1 检查 legendPosition

```javascript
function validateChartLegend(previewAnalysis, generatedCode) {
  for (const chart of previewAnalysis.charts || []) {
    if (!chart.legendPosition) {
      throw new Error(
        `图表 "${chart.section}" 缺少 legendPosition 字段`
      )
    }
    
    // ✅ 检查代码中是否正确设置了图例位置
    const hasLegendConfig = generatedCode.includes(`legend: {`)
    
    if (!hasLegendConfig) {
      console.warn(
        `图表 "${chart.section}" 在 preview-analysis.json 中设置了 legendPosition，` +
        `但代码中没有配置图例`
      )
    }
  }
}
```

**检查清单**：
- [ ] 所有图表都设置了 `legendPosition`
- [ ] `legendPosition` 的值符合规范（top-right、bottom-center、right 等）
- [ ] 图例没有被添加为 DOM children

#### 3.2 检查 headerRelation 和 slotCandidate

```javascript
function validateLayoutFields(previewAnalysis) {
  for (const section of previewAnalysis.layout.sections) {
    if (!section.headerRelation) {
      console.warn(
        `Section "${section.name}" 缺少 headerRelation 字段，` +
        `布局判断可能不准确`
      )
    }
    
    if (section.slotCandidate === undefined) {
      console.warn(
        `Section "${section.name}" 缺少 slotCandidate 字段`
      )
    }
  }
}
```

**检查清单**：
- [ ] 所有 section 都设置了 `headerRelation`
- [ ] 所有 section 都设置了 `slotCandidate`

### 阶段4：代码质量验证

#### 4.1 检查数据绑定

```javascript
function validateDataBinding(generatedCode) {
  // ✅ 检查是否使用了 props/emit/v-model
  const hasProps = /defineProps\(/.test(generatedCode)
  const hasEmit = /defineEmits\(/.test(generatedCode)
  
  // ⚠️ 如果组件没有任何数据交互，可能是静态组件
  if (!hasProps && !hasEmit) {
    console.warn(
      '组件没有定义 props 或 emit，可能是纯静态展示组件。' +
      '请确认是否需要添加数据交互。'
    )
  }
}
```

**检查清单**：
- [ ] 组件正确定义了 `defineProps`（如果需要接收数据）
- [ ] 组件正确定义了 `defineEmits`（如果需要触发事件）
- [ ] 动态数据使用了 `v-model`、`v-for` 等 Vue 指令

#### 4.2 检查响应式数据

```javascript
function validateReactivity(generatedCode) {
  // ✅ 检查是否正确使用了 ref/reactive
  const hasRef = /ref\(/.test(generatedCode)
  const hasReactive = /reactive\(/.test(generatedCode)
  
  // ⚠️ 检查是否有未使用 ref 包裹的可变数据
  const hasDirectAssignment = /let\s+\w+\s*=\s*['"\d]/.test(generatedCode)
  
  if (hasDirectAssignment && !hasRef && !hasReactive) {
    console.warn(
      '代码中使用了 let 声明的可变数据，但没有使用 ref() 或 reactive()。' +
      '这些数据的变化不会触发视图更新。'
    )
  }
}
```

**检查清单**：
- [ ] 可变数据使用了 `ref()` 或 `reactive()`
- [ ] 计算属性使用了 `computed()`
- [ ] 副作用使用了 `watch()` 或 `watchEffect()`


---

## 手动验证清单

如果没有自动化脚本，生成代码后必须手动检查：

### 结构完整性
- [ ] 所有 section.children 都实现了
- [ ] 并排布局使用了 grid 或 flex
- [ ] widthRatio < 1 的 section 确实是横向排列

### 样式语法
- [ ] 没有 `:global { }` 块语法
- [ ] 第三方组件样式使用了 `:deep()`
- [ ] 共享样式文件只有变量和 mixin

### 图表配置
- [ ] 所有图表都有 `legendPosition`
- [ ] 图例没有作为 children
- [ ] 所有 section 都有 `headerRelation` 和 `slotCandidate`

### 代码质量
- [ ] 数据使用了 `ref()`/`reactive()`
- [ ] 有必要的 props 和 emit
- [ ] 样式使用了 scoped

## 集成到 AI Prompt

在生成代码的 prompt 中，应该添加：

```markdown
## 🔴 生成代码后的自检步骤

生成代码后，必须执行以下自检：

1. **检查 children 结构**
   - 打开 preview-analysis.json
   - 找到所有包含 children 的 section
   - 确认代码中实现了对应数量的子元素

2. **检查并排布局**
   - 找到所有 widthRatio < 1 的 section
   - 确认使用了 `display: grid` 或 `display: flex`
   - 确认 `grid-template-columns` 与 widthRatio 一致

3. **检查样式语法**
   - 搜索 `:global {`，必须为0处
   - 搜索 `:deep(`，确认第三方组件样式使用了它
   - 检查 @import 的文件，确保安全

4. **检查图表配置**
   - 所有图表都有 legendPosition
   - 图例不在 children 中

如果发现任何问题，立即修正后再输出代码。
```

## 总结

**验证流程的核心价值**：
1. ✅ 防止结构性错误流入生产环境
2. ✅ 确保代码符合所有关键规范
3. ✅ 提高代码质量和一致性
4. ✅ 减少人工检查工作量

**建议实施优先级**：
1. **立即实施**：手动验证清单（在生成代码后立即检查）
2. **短期目标**：将验证清单集成到 AI prompt 中
3. **长期目标**：开发自动化验证脚本

**关键指标**：
- 验证覆盖率：100%（所有生成的组件都必须验证）
- 错误拦截率：目标 > 95%（在代码生成阶段发现并修复）
- 人工修复率：目标 < 5%（减少后期手动修复）
