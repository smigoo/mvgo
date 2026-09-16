# 🎯 方案1: 增强子组件拆分 - 快速参考

> 一页纸速查，供开发者和 code review 使用

---

## 📊 核心数据结构

### SubcomponentPlanner.plan() 返回值

```javascript
{
  // Section 级子组件
  effectiveSections: [
    {
      id: 'section-charts',
      responsibility: '图表/数据可视化区',
      elementCount: 15,
      title: '数据趋势',
      
      // 🎯 新增
      complexityScore: 70,              // 复杂度总分
      shouldSplitInternally: true,      // 是否需内部拆分
      internalSubcomponents: [ ... ],   // 该 section 的内部子组件
      layoutMetadata: {                 // 布局元数据
        direction: 'column',
        gap: 16,
        padding: { top, right, bottom, left }
      }
    }
  ],
  
  // 🎯 新增：所有内部子组件（扁平列表）
  internalSubcomponents: [
    {
      type: 'chart-component',          // 子组件类型
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
  minFiles: 5,  // section数 + 内部子组件数
  reason: '...'
}
```

---

## 📏 评分体系

| 维度 | 权重 | 阈值 | 得分 |
|------|------|------|------|
| 元素密度 | 40% | >10 → 40分<br>>6 → 20分 | 高密度需拆分 |
| 图表数量 | 30% | ≥2 → 30分<br>=1且>8元素 → 15分 | 多图表优先隔离 |
| 交互复杂度 | 20% | >3 → 20分<br>>1 → 10分 | 交互多则代码量大 |
| 嵌套深度 | 10% | >3 → 10分 | 深层嵌套影响可读性 |

**触发阈值**: ≥30 分

---

## 🔀 拆分优先级

```
R1: 图表隔离 ⭐⭐⭐⭐⭐
  ├─ 触发: ≥2 图表
  ├─ 策略: 每个图表独立子组件
  └─ Props: chartData, chartConfig
     Emits: legendClick, dataZoom

R2: 元素密度拆分 ⭐⭐⭐⭐
  ├─ 触发: >10 元素 且 <2 图表
  └─ 策略: 按密度分组（每组 ≤8 元素）

R3: 深层嵌套拆分 ⭐⭐⭐
  ├─ 触发: 嵌套深度 >3 层
  └─ 策略: 深层节点提升为子组件

R4: 交互复杂度拆分 ⭐⭐
  ├─ 触发: >3 交互元素
  └─ 策略: 交互区域独立子组件
```

---

## 💻 Engineer 使用方式

### 1. 解析数据

```javascript
// microcode-engineer.js / vue3-engineer.js
const { subPlan, effectiveSections, internalSubcomponents } = 
  this.resolveSubComponentPlan(input)
```

### 2. 生成提示

```javascript
if (subPlan.isForced) {
  const totalSubcomponents = 
    effectiveSections.length + internalSubcomponents.length
  
  prompt += `本组件必须拆分为 ${totalSubcomponents} 个子组件：\n`
  prompt += `- ${effectiveSections.length} 个 section 级\n`
  prompt += `- ${internalSubcomponents.length} 个内部子组件\n`
}
```

### 3. 显示内部子组件

```javascript
// 按 parentSectionId 分组
const grouped = {}
for (const sub of internalSubcomponents) {
  if (!grouped[sub.parentSectionId]) {
    grouped[sub.parentSectionId] = []
  }
  grouped[sub.parentSectionId].push(sub)
}

// 显示
for (const [sectionId, subs] of Object.entries(grouped)) {
  prompt += `\n${sectionId} 的内部子组件：\n`
  for (const sub of subs) {
    prompt += `  - ${sub.responsibility} (${sub.reason})\n`
    if (sub.props) prompt += `    Props: ${sub.props.join(', ')}\n`
  }
}
```

---

## 📁 预期文件结构

```
package/
├── index.vue           (主组件)
├── declare.json
├── component.js
└── components/
    ├── Header.vue      (section-header)
    ├── Charts.vue      (section-charts)
    │   ├── import BarChart
    │   └── import LineChart
    ├── BarChart.vue    (内部子组件)
    ├── LineChart.vue   (内部子组件)
    └── Stats.vue       (section-stats)
```

---

## ✅ L0-B 校验（待实施）

| 规则 ID | 检查项 | 严重性 |
|---------|--------|--------|
| COMPONENT-001 | 子组件是否被 import | BLOCK |
| COMPONENT-002 | 子组件是否在模板中使用 | BLOCK |
| COMPONENT-003 | Props 是否传递正确 | WARN |
| COMPONENT-004 | Emits 是否监听正确 | WARN |
| LAYOUT-002 | 布局方向是否与 layoutMetadata 一致 | WARN |

---

## 🔧 配置选项

```javascript
const plan = subcomponentPlanner.plan(layoutStructure, {
  minSectionsForced: 3,           // 强制拆分的最小 section 数
  skipPanelHeaderFilter: false,   // 微码 false，Vue3 true
  enableInternalSplit: true       // 是否启用内部拆分（默认开启）
})
```

**禁用内部拆分**:
```javascript
enableInternalSplit: false  // 回退到原有逻辑（仅 section 级拆分）
```

---

## 🎨 子组件类型

| 类型 | 说明 | Props | Emits |
|------|------|-------|-------|
| `chart-component` | 图表子组件 | chartData, chartConfig | legendClick, dataZoom |
| `element-group` | 元素分组 | - | - |
| `nested-component` | 深层嵌套 | - | - |
| `interaction-area` | 交互控件区 | - | action |

---

## 📐 样式约束

### 内部子组件

```css
/* 根元素 */
.chart-container {
  width: 100%;   /* 必须：填充父组件空间 */
  height: 100%;  /* 必须：填充父组件空间 */
  /* margin: 禁止设置（由父组件的 gap 控制） */
}
```

### 父组件（使用 layoutMetadata）

```css
.section-container {
  display: flex;
  flex-direction: column;  /* 从 layoutMetadata.direction */
  gap: 16px;               /* 从 layoutMetadata.gap */
  padding: 12px 24px;      /* 从 layoutMetadata.padding */
}
```

---

## 🐛 常见问题

### Q: 为什么图表被误识别？
**A**: 已修复。现在只遍历 section 的直接子节点，不会将 section 本身识别为图表。

### Q: 内部子组件如何命名？
**A**: 由 LLM 根据语义自行命名（PascalCase），如 `BarChart.vue`、`LineChart.vue`。

### Q: 如何知道哪些子组件属于哪个 section？
**A**: 使用 `parentSectionId` 字段。

### Q: 评分阈值可以调整吗？
**A**: 可以，修改 `calculateSplitScore()` 中的阈值 30。

---

## 📊 测试验证

```bash
# 核心功能测试
node src/ai-engine/roles/__tests__/verify-phase2-solution1.js

# Engineer 集成验证
node src/ai-engine/roles/__tests__/verify-engineer-integration.js
```

**预期结果**: ✅ 所有测试通过

---

## 📚 完整文档

- `solution1-implementation-summary.md` - 详细实施报告（20页）
- `solution1-engineer-integration-guide.md` - 集成指南（15页）
- `SOLUTION1-COMPLETION-REPORT.md` - 完成报告（2页）
- `PHASE2-SOLUTION1-COMPLETE-REPORT.md` - 完整报告（6页）

---

**版本**: v1.0  
**更新**: 2026-08-28  
**维护**: AI Engine Team
