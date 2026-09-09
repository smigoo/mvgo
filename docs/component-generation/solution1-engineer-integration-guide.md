# 方案1: 增强子组件拆分 - Engineer 集成指南

> **目标读者**: 需要集成 `internalSubcomponents` 到代码生成阶段的开发者  
> **前置条件**: 已完成 `SubcomponentPlanner` 增强（方案1）

---

## 📋 快速开始

### 1. 获取规划结果

```javascript
import { subcomponentPlanner } from '../roles/subcomponent-planner.js'

const plan = subcomponentPlanner.plan(layoutStructure, {
  minSectionsForced: 3,
  skipPanelHeaderFilter: false,  // 微码 false，Vue3 true
  enableInternalSplit: true       // 启用内部拆分
})
```

### 2. 理解返回结构

```javascript
{
  // Section 级子组件（原有逻辑）
  effectiveSections: [
    {
      id: 'section-charts',
      responsibility: '图表/数据可视化区',
      elementCount: 15,
      title: '数据趋势',
      
      // 🎯 新增字段
      complexityScore: 70,              // 复杂度评分
      shouldSplitInternally: true,      // 是否需要内部拆分
      internalSubcomponents: [          // 该 section 的内部子组件
        { type: 'chart-component', id: 'chart1', name: 'BarChart', ... },
        { type: 'chart-component', id: 'chart2', name: 'LineChart', ... }
      ],
      layoutMetadata: {                 // 布局元数据
        direction: 'column',
        gap: 16,
        padding: { top: 12, right: 24, bottom: 12, left: 24 }
      }
    }
  ],
  
  // 🎯 所有内部子组件（扁平列表，携带 parentSectionId）
  internalSubcomponents: [
    {
      type: 'chart-component',
      id: 'chart1',
      name: 'BarChart',
      parentSectionId: 'section-charts',
      parentSectionTitle: '数据趋势',
      responsibility: '图表组件：柱状图',
      reason: 'R1: 图表隔离策略',
      props: ['chartData', 'chartConfig'],
      emits: ['legendClick', 'dataZoom']
    }
  ],
  
  isForced: true,
  minFiles: 8,  // section数 + 内部子组件数
  reason: '...'
}
```

---

## 🔧 集成步骤

### Step 1: 检查是否有内部子组件

```javascript
if (plan.internalSubcomponents && plan.internalSubcomponents.length > 0) {
  console.log(`需要生成 ${plan.internalSubcomponents.length} 个内部子组件`)
  // 执行内部子组件生成逻辑
}
```

### Step 2: 为每个内部子组件生成文件

**推荐按 parentSectionId 分组**:

```javascript
// 按 parentSectionId 分组
const groupedBySection = {}
for (const subcomp of plan.internalSubcomponents) {
  const sectionId = subcomp.parentSectionId
  if (!groupedBySection[sectionId]) {
    groupedBySection[sectionId] = []
  }
  groupedBySection[sectionId].push(subcomp)
}

// 为每个 section 生成其内部子组件
for (const [sectionId, subcomps] of Object.entries(groupedBySection)) {
  console.log(`section ${sectionId} 包含 ${subcomps.length} 个内部子组件`)
  
  for (const subcomp of subcomps) {
    // 生成子组件文件
    await generateInternalSubcomponent(subcomp, sectionId)
  }
}
```

### Step 3: 生成内部子组件 Prompt

根据 `subcomp.type` 选择不同的生成策略：

#### 3.1 图表组件 (chart-component)

```javascript
if (subcomp.type === 'chart-component') {
  const prompt = `
## 生成图表子组件

**组件名称**: ${subcomp.name}
**职责**: ${subcomp.responsibility}
**拆分原因**: ${subcomp.reason}

### Props 定义
- chartData: Array - 图表数据
- chartConfig: Object - 完整的 echarts 配置

### Emits 定义
- legendClick: 图例点击事件
- dataZoom: 数据缩放事件

### 要求
1. 使用 echarts 渲染图表
2. 根元素设置 width: 100%; height: 100%;
3. 监听 chartData 和 chartConfig 变化，自动更新图表
4. 图表点击事件通过 emit 传递给父组件

### 尺寸约束
- 根元素：width: 100%; height: 100%; (填充父组件空间)
- 禁止设置 margin
`
  
  // 调用 LLM 生成代码
  const code = await llm.generate(prompt)
  
  // 保存文件
  await saveFile(`components/${subcomp.name}.vue`, code)
}
```

#### 3.2 元素分组组件 (element-group)

```javascript
if (subcomp.type === 'element-group') {
  const prompt = `
## 生成元素分组子组件

**组件名称**: ${subcomp.name}
**职责**: ${subcomp.responsibility}
**拆分原因**: ${subcomp.reason}

### 要求
1. 该分组包含多个卡片/元素，按原 layoutStructure 排列
2. 根元素设置 width: 100%; height: 100%;
3. 使用 flex 或 grid 布局
4. 禁止设置 margin

### 尺寸约束
- 根元素：width: 100%; height: 100%; (填充父组件空间)
`
  
  const code = await llm.generate(prompt)
  await saveFile(`components/${subcomp.name}.vue`, code)
}
```

#### 3.3 嵌套组件 (nested-component)

```javascript
if (subcomp.type === 'nested-component') {
  const prompt = `
## 生成深层嵌套子组件

**组件名称**: ${subcomp.name}
**职责**: ${subcomp.responsibility}
**拆分原因**: ${subcomp.reason}

### 要求
1. 该组件包含深层嵌套的内容结构
2. 根元素设置 width: 100%; height: 100%;
3. 合理使用嵌套层级，避免过深（<3层）
4. 禁止设置 margin
`
  
  const code = await llm.generate(prompt)
  await saveFile(`components/${subcomp.name}.vue`, code)
}
```

#### 3.4 交互区域组件 (interaction-area)

```javascript
if (subcomp.type === 'interaction-area') {
  const prompt = `
## 生成交互控件区子组件

**组件名称**: ${subcomp.name}
**职责**: ${subcomp.responsibility}
**拆分原因**: ${subcomp.reason}

### Emits 定义
- action: 交互操作事件，携带 { type, payload }

### 要求
1. 该组件包含多个交互控件（按钮、输入框、下拉框等）
2. 根元素设置 width: 100%; height: 100%;
3. 所有交互操作通过 emit 'action' 传递给父组件
4. 禁止设置 margin
`
  
  const code = await llm.generate(prompt)
  await saveFile(`components/${subcomp.name}.vue`, code)
}
```

### Step 4: 修改父组件生成逻辑

#### 4.1 Import 内部子组件

```javascript
// 收集该 section 的内部子组件
const sectionSubcomps = plan.internalSubcomponents.filter(
  sub => sub.parentSectionId === section.id
)

if (sectionSubcomps.length > 0) {
  const imports = sectionSubcomps.map(sub => 
    `import ${sub.name} from './components/${sub.name}.vue'`
  ).join('\n')
  
  // 注入到 <script setup> 顶部
  scriptContent = `${imports}\n\n${scriptContent}`
}
```

#### 4.2 使用内部子组件

```javascript
if (sectionSubcomps.length > 0) {
  const componentsUsage = sectionSubcomps.map(sub => {
    // 生成 props 绑定
    const propsBinding = sub.props?.map(prop => 
      `:${toKebabCase(prop)}="${toCamelCase(prop)}"`
    ).join(' ') || ''
    
    // 生成 emits 监听
    const emitsBinding = sub.emits?.map(evt => 
      `@${toKebabCase(evt)}="handle${toPascalCase(evt)}"`
    ).join(' ') || ''
    
    return `<${sub.name} ${propsBinding} ${emitsBinding} />`
  }).join('\n    ')
  
  // 注入到模板
  templateContent = `
  <div class="c-${section.id}-container">
    ${componentsUsage}
  </div>
  `
}
```

#### 4.3 生成布局协调代码

使用 `section.layoutMetadata` 生成父组件布局样式：

```javascript
const metadata = section.layoutMetadata

const layoutStyle = `
.c-${section.id}-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: ${metadata.direction};
  align-items: ${metadata.alignItems};
  justify-content: ${metadata.justifyContent};
  gap: ${metadata.gap}px;
  padding: ${metadata.padding.top}px ${metadata.padding.right}px ${metadata.padding.bottom}px ${metadata.padding.left}px;
}
`

// 注入到 <style> 块
styleContent += layoutStyle
```

#### 4.4 为子组件准备数据

```javascript
// 图表子组件需要 chartData 和 chartConfig
if (sub.type === 'chart-component') {
  const dataVarName = toCamelCase(sub.name) + 'Data'
  const configVarName = toCamelCase(sub.name) + 'Config'
  
  scriptContent += `
// ${sub.name} 数据准备
const ${dataVarName} = ref([])
const ${configVarName} = computed(() => ({
  // echarts 配置
  title: { text: '${sub.responsibility}' },
  // ...
}))

// 从 API 加载数据
const load${toPascalCase(sub.name)}Data = async () => {
  const data = await componentApi.getCommonApiFindList({}, '${sub.id}Data')
  ${dataVarName}.value = data
}

onMounted(() => {
  load${toPascalCase(sub.name)}Data()
})
`
}
```

#### 4.5 处理子组件事件

```javascript
// 为每个 emit 生成事件处理函数
if (sub.emits && sub.emits.length > 0) {
  for (const evt of sub.emits) {
    const handlerName = `handle${toPascalCase(evt)}`
    
    scriptContent += `
// ${sub.name} 的 ${evt} 事件处理
const ${handlerName} = (params) => {
  console.log('${sub.name} ${evt}:', params)
  // TODO: 实现事件处理逻辑
}
`
  }
}
```

---

## 🎯 完整示例

### 输入

```javascript
plan.internalSubcomponents = [
  {
    type: 'chart-component',
    id: 'chart1',
    name: 'BarChart',
    parentSectionId: 'section-charts',
    props: ['chartData', 'chartConfig'],
    emits: ['legendClick']
  },
  {
    type: 'chart-component',
    id: 'chart2',
    name: 'LineChart',
    parentSectionId: 'section-charts',
    props: ['chartData', 'chartConfig'],
    emits: ['legendClick']
  }
]

section.layoutMetadata = {
  direction: 'column',
  gap: 16,
  padding: { top: 12, right: 24, bottom: 12, left: 24 }
}
```

### 输出（父组件）

```vue
<template>
  <div class="c-section-charts-container">
    <BarChart 
      :chart-data="barChartData" 
      :chart-config="barChartConfig"
      @legend-click="handleLegendClick"
    />
    <LineChart 
      :chart-data="lineChartData" 
      :chart-config="lineChartConfig"
      @legend-click="handleLegendClick"
    />
  </div>
</template>

<script setup>
import BarChart from './components/BarChart.vue'
import LineChart from './components/LineChart.vue'

// BarChart 数据准备
const barChartData = ref([])
const barChartConfig = computed(() => ({
  title: { text: '图表组件：柱状图' },
  xAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed'] },
  yAxis: { type: 'value' },
  series: [{ data: barChartData.value, type: 'bar' }]
}))

// LineChart 数据准备
const lineChartData = ref([])
const lineChartConfig = computed(() => ({
  title: { text: '图表组件：折线图' },
  xAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed'] },
  yAxis: { type: 'value' },
  series: [{ data: lineChartData.value, type: 'line' }]
}))

// 事件处理
const handleLegendClick = (params) => {
  console.log('Legend clicked:', params)
  // 图例联动逻辑
}

// 加载数据
onMounted(() => {
  loadBarChartData()
  loadLineChartData()
})
</script>

<style scoped lang="less">
.c-section-charts-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 12px 24px;
}
</style>
```

---

## 🔍 L0-B 校验增强

### 新增校验规则

#### COMPONENT-001: 子组件未 import
```javascript
const imports = extractImports(parentComponentCode)
for (const subcomp of plan.internalSubcomponents) {
  if (!imports.includes(subcomp.name)) {
    return {
      id: 'COMPONENT-001',
      severity: 'BLOCK',
      message: `内部子组件 "${subcomp.name}" 未被父组件 import`,
      fix: `import ${subcomp.name} from './components/${subcomp.name}.vue'`
    }
  }
}
```

#### COMPONENT-002: 子组件未使用
```javascript
const template = extractTemplate(parentComponentCode)
for (const subcomp of plan.internalSubcomponents) {
  if (!template.includes(`<${subcomp.name}`)) {
    return {
      id: 'COMPONENT-002',
      severity: 'BLOCK',
      message: `内部子组件 "${subcomp.name}" 已 import 但未在模板中使用`
    }
  }
}
```

#### COMPONENT-003: Props 传递缺失
```javascript
if (subcomp.props && subcomp.props.length > 0) {
  const componentTag = extractComponentTag(template, subcomp.name)
  for (const prop of subcomp.props) {
    const kebabProp = toKebabCase(prop)
    if (!componentTag.includes(`:${kebabProp}=`) && !componentTag.includes(`${kebabProp}="`)) {
      return {
        id: 'COMPONENT-003',
        severity: 'WARN',
        message: `子组件 "${subcomp.name}" 的 prop "${prop}" 未传递`
      }
    }
  }
}
```

#### LAYOUT-002: 布局方向不一致
```javascript
const style = extractStyle(parentComponentCode)
const containerClass = `.c-${section.id}-container`
const flexDirection = extractFlexDirection(style, containerClass)

if (flexDirection !== section.layoutMetadata.direction) {
  return {
    id: 'LAYOUT-002',
    severity: 'WARN',
    message: `布局方向不一致：layoutMetadata 为 "${section.layoutMetadata.direction}"，实际为 "${flexDirection}"`,
    fix: `flex-direction: ${section.layoutMetadata.direction};`
  }
}
```

---

## 📚 工具函数

```javascript
// 驼峰转 kebab-case
function toKebabCase(str) {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
}

// 驼峰转 PascalCase
function toPascalCase(str) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

// kebab-case 转驼峰
function toCamelCase(str) {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}
```

---

## ⚠️ 注意事项

### 1. 向下兼容
```javascript
// 检查是否有内部子组件
if (!plan.internalSubcomponents || plan.internalSubcomponents.length === 0) {
  // 使用原有逻辑（section 级拆分）
  return generateSectionComponents(plan.effectiveSections)
}
```

### 2. 禁用内部拆分
```javascript
// 如果需要禁用内部拆分
const plan = subcomponentPlanner.plan(layoutStructure, {
  enableInternalSplit: false  // 关闭内部拆分
})
```

### 3. 文件命名规范
- 内部子组件统一放在 `components/` 目录
- 文件名使用 PascalCase：`BarChart.vue`
- 避免与 section 级子组件冲突

### 4. 样式隔离
- 所有内部子组件根元素必须：`width: 100%; height: 100%;`
- 禁止设置 `margin`
- 父组件用 `gap` 控制子组件间距

---

## 🎉 预期效果

### 优化前
```
section-charts (包含2个图表)
  → 单个文件 500+ 行
  → LLM token 压力大
  → 生成成功率 60%
```

### 优化后
```
section-charts
  ├─ BarChart.vue (150 行)  ← 独立子组件
  ├─ LineChart.vue (150 行) ← 独立子组件
  └─ SectionCharts.vue (80 行) ← 父组件（布局协调）

→ 每个文件体量小
→ LLM 生成质量高
→ 生成成功率 90%+
```

---

**文档版本**: v1.0  
**最后更新**: 2026-08-28  
**维护者**: AI Engine Team
