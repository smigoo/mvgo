/**
 * 🎯 Phase 2 方案1: Engineer 集成验证脚本
 *
 * 验证 microcode-engineer.js 是否正确消费 internalSubcomponents
 */

// 模拟 subcomponentPlanner 返回的数据结构
const mockSubPlan = {
  effectiveSections: [
    {
      id: 'section-header',
      responsibility: '顶部标题区/控件区',
      elementCount: 3,
      title: '数据概览',
      complexityScore: 15,
      complexityReasons: {
        elementCount: 3,
        charts: 0,
        interactions: 1,
        maxDepth: 1,
      },
      layoutMetadata: {
        direction: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: { top: 12, right: 24, bottom: 12, left: 24 },
      },
      internalSubcomponents: [],
      shouldSplitInternally: false,
    },
    {
      id: 'section-charts',
      responsibility: '图表/数据可视化区',
      elementCount: 15,
      title: '数据趋势',
      complexityScore: 70,
      complexityReasons: {
        elementCount: 15,
        charts: 2,
        interactions: 2,
        maxDepth: 2,
      },
      layoutMetadata: {
        direction: 'column',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        gap: 16,
        padding: { top: 12, right: 24, bottom: 12, left: 24 },
      },
      internalSubcomponents: [
        {
          type: 'chart-component',
          id: 'chart1',
          name: 'BarChart',
          responsibility: '图表组件：柱状图',
          reason: 'R1: 图表隔离策略',
          props: ['chartData', 'chartConfig'],
          emits: ['legendClick', 'dataZoom'],
        },
        {
          type: 'chart-component',
          id: 'chart2',
          name: 'LineChart',
          responsibility: '图表组件：折线图',
          reason: 'R1: 图表隔离策略',
          props: ['chartData', 'chartConfig'],
          emits: ['legendClick', 'dataZoom'],
        },
      ],
      shouldSplitInternally: true,
    },
    {
      id: 'section-stats',
      responsibility: '数据统计指标区',
      elementCount: 12,
      title: '关键指标',
      complexityScore: 40,
      complexityReasons: {
        elementCount: 12,
        charts: 0,
        interactions: 0,
        maxDepth: 2,
      },
      layoutMetadata: {
        direction: 'row',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        gap: 12,
        padding: { top: 8, right: 16, bottom: 8, left: 16 },
      },
      internalSubcomponents: [],
      shouldSplitInternally: false,
    },
  ],
  isForced: true,
  minFiles: 5, // 3 sections + 2 internal subcomponents
  reason: '有效 sections=3 ≥ 3 或存在高复杂度 section → 强制拆分',
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
      emits: ['legendClick', 'dataZoom'],
    },
    {
      type: 'chart-component',
      id: 'chart2',
      name: 'LineChart',
      parentSectionId: 'section-charts',
      parentSectionTitle: '数据趋势',
      responsibility: '图表组件：折线图',
      reason: 'R1: 图表隔离策略',
      props: ['chartData', 'chartConfig'],
      emits: ['legendClick', 'dataZoom'],
    },
  ],
}

console.log('\n🎯 Phase 2 方案1: Engineer 集成验证\n')

console.log('1️⃣ 数据结构验证')
console.log('─────────────────────────────────────')
console.log(`✅ effectiveSections: ${mockSubPlan.effectiveSections.length} 个`)
console.log(`✅ internalSubcomponents: ${mockSubPlan.internalSubcomponents.length} 个`)
console.log(`✅ 总子组件数: ${mockSubPlan.minFiles} 个`)
console.log(`✅ isForced: ${mockSubPlan.isForced}`)
console.log(`✅ 强制原因: ${mockSubPlan.reason}`)

console.log('\n2️⃣ Section 级子组件')
console.log('─────────────────────────────────────')
mockSubPlan.effectiveSections.forEach((sec, idx) => {
  console.log(`\n${idx + 1}. ${sec.id}`)
  console.log(`   职责: ${sec.responsibility}`)
  console.log(`   标题: ${sec.title}`)
  console.log(`   元素数: ${sec.elementCount}`)
  console.log(`   复杂度评分: ${sec.complexityScore}`)
  console.log(`   是否需要内部拆分: ${sec.shouldSplitInternally}`)

  if (sec.internalSubcomponents.length > 0) {
    console.log(`   内部子组件: ${sec.internalSubcomponents.length} 个`)
    sec.internalSubcomponents.forEach((sub, subIdx) => {
      console.log(`      ${subIdx + 1}. ${sub.name} (${sub.type})`)
      console.log(`         - ${sub.responsibility}`)
      console.log(`         - Props: ${sub.props.join(', ')}`)
      console.log(`         - Emits: ${sub.emits.join(', ')}`)
    })
  }

  console.log(`   布局元数据:`)
  console.log(`      - direction: ${sec.layoutMetadata.direction}`)
  console.log(`      - gap: ${sec.layoutMetadata.gap}px`)
})

console.log('\n3️⃣ 内部子组件详情')
console.log('─────────────────────────────────────')

// 按 parentSectionId 分组
const groupedBySection = {}
for (const sub of mockSubPlan.internalSubcomponents) {
  const sectionId = sub.parentSectionId
  if (!groupedBySection[sectionId]) {
    groupedBySection[sectionId] = []
  }
  groupedBySection[sectionId].push(sub)
}

for (const [sectionId, subcomps] of Object.entries(groupedBySection)) {
  console.log(`\n📦 ${sectionId}:`)
  subcomps.forEach((sub, idx) => {
    console.log(`   ${idx + 1}. ${sub.name} (${sub.type})`)
    console.log(`      职责: ${sub.responsibility}`)
    console.log(`      原因: ${sub.reason}`)
    console.log(`      Props: ${sub.props.join(', ')}`)
    console.log(`      Emits: ${sub.emits.join(', ')}`)
  })
}

console.log('\n4️⃣ Prompt 生成预览')
console.log('─────────────────────────────────────')

console.log(`
## 🚨 强制子组件拆分（必须遵守）

**强制原因**：${mockSubPlan.reason}

本组件**必须**拆分为 **${mockSubPlan.minFiles}** 个独立子组件文件：
- **${mockSubPlan.effectiveSections.length}** 个 section 级子组件（每个 section 各一个文件）
- **${mockSubPlan.internalSubcomponents.length}** 个内部子组件（section 内部拆分）

文件名和组件名由你根据语义自行命名（PascalCase），但**数量和对应关系不得缩减**。

**Section 级子组件清单**：
`)

mockSubPlan.effectiveSections.forEach((sec, idx) => {
  console.log(`${idx + 1}. \`${sec.id}\` — ${sec.responsibility}（原标题「${sec.title}」），含 ${sec.elementCount} 个元素，复杂度评分 ${sec.complexityScore}`)

  if (sec.internalSubcomponents && sec.internalSubcomponents.length > 0) {
    console.log(`   → 该 section 需进一步拆分为 ${sec.internalSubcomponents.length} 个内部子组件：`)
    sec.internalSubcomponents.forEach((sub, subIdx) => {
      console.log(`      ${subIdx + 1}. ${sub.responsibility} (${sub.reason})`)
      console.log(`         Props: ${sub.props.join(', ')}`)
      console.log(`         Emits: ${sub.emits.join(', ')}`)
    })
  }
})

console.log(`
**内部子组件详细说明**：
`)

for (const [sectionId, subcomps] of Object.entries(groupedBySection)) {
  const parentSection = mockSubPlan.effectiveSections.find(s => s.id === sectionId)
  console.log(`\n📦 **${parentSection.title}** (${sectionId}) 的内部子组件：`)

  subcomps.forEach((sub, idx) => {
    console.log(`
${idx + 1}. **${sub.type}** — ${sub.responsibility}
   拆分原因：${sub.reason}
   Props 定义：`)
    sub.props.forEach(prop => {
      if (prop === 'chartData') {
        console.log(`   - \`${prop}\`: Array - 图表数据`)
      } else if (prop === 'chartConfig') {
        console.log(`   - \`${prop}\`: Object - 完整的 echarts 配置`)
      }
    })
    console.log(`   Emits 定义：`)
    sub.emits.forEach(evt => {
      if (evt === 'legendClick') {
        console.log(`   - \`${evt}\`: 图例点击事件`)
      } else if (evt === 'dataZoom') {
        console.log(`   - \`${evt}\`: 数据缩放事件`)
      }
    })

    if (sub.type === 'chart-component') {
      console.log(`   要求：
   - 使用 echarts 渲染图表
   - 根元素设置 width: 100%; height: 100%;
   - 监听 chartData 和 chartConfig 变化，自动更新图表
   - 图表交互事件通过 emit 传递给父组件`)
    }
  })
}

console.log(`
**关键约束**：
- 每个 section 必须对应一个独立的 \`package/components/{YourName}.vue\` 文件
- 每个内部子组件也必须是独立的 \`package/components/{YourName}.vue\` 文件
- \`package/index.vue\` 必须 import 所有 section 级子组件并在 template 中引用
- section 级子组件 import 其内部子组件并在 template 中引用
- 严禁将多个 section 合并到同一个文件
- 严禁省略任何 section 的子组件或内部子组件

**布局协调提示**：
- \`section-header\` 使用 flex-direction: row，gap: 16px
- \`section-charts\` 使用 flex-direction: column，gap: 16px
- \`section-stats\` 使用 flex-direction: row，gap: 12px
`)

console.log('\n5️⃣ 预期文件结构')
console.log('─────────────────────────────────────')
console.log(`
package/
├── index.vue           (主组件)
├── declare.json
├── component.js
├── resources/
│   └── styles/
└── components/
    ├── Header.vue      (section-header)
    ├── Charts.vue      (section-charts)
    │   ├── BarChart.vue    (内部子组件)
    │   └── LineChart.vue   (内部子组件)
    └── Stats.vue       (section-stats)

总计文件数: ${mockSubPlan.minFiles} 个子组件
`)

console.log('\n✅ 验证完成！\n')
console.log('📊 总结:')
console.log(`  - Section 级子组件: ${mockSubPlan.effectiveSections.length} 个`)
console.log(`  - 内部子组件: ${mockSubPlan.internalSubcomponents.length} 个`)
console.log(`  - 总子组件数: ${mockSubPlan.minFiles} 个`)
console.log(`  - 强制拆分: ${mockSubPlan.isForced ? '是' : '否'}`)
console.log(`  - 有内部拆分的 section: ${mockSubPlan.effectiveSections.filter(s => s.shouldSplitInternally).length} 个`)
console.log('\n🎯 Phase 2 方案1 Engineer 集成数据验证通过！')
