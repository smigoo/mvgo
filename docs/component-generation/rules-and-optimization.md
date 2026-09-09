# 组件生成规则约束与优化方案

> **文档版本**: v2.0  
> **最后更新**: 2026-08-28  
> **适用范围**: 微码组件 + Vue3 组件生成管线  
> **维护者**: AI Engine Team

---

## 文档目的

本文档旨在解决组件生成过程中的三大核心问题：
1. **布局识别错误** - LLM 凭组件名臆造结构，未遵循 layoutStructure
2. **静态资源未使用** - resource-dom-mapping.json 中的资源被遗漏
3. **生成报错/中断** - 样式作用域错误、资源变量误用、组件 ID 污染

通过**分层规则约束** + **优化方案集成**，将复杂组件生成成功率从 60% 提升至 90%+。

---

## 目录

- [第一部分：规则约束体系](#第一部分规则约束体系)
  - [A. 布局结构约束](#a-布局结构约束)
  - [B. 资源引用约束](#b-资源引用约束)
  - [C. 样式规范约束](#c-样式规范约束)
  - [D. 微码专属约束](#d-微码专属约束)
  - [E. Vue3 专属约束](#e-vue3-专属约束)
- [第二部分：优化方案](#第二部分优化方案)
  - [方案 1: 增强子组件拆分](#方案-1-增强子组件拆分)
  - [方案 2: 样式隔离策略](#方案-2-样式隔离策略)
  - [方案 3: 布局骨架注入](#方案-3-布局骨架注入)
  - [方案 4: 资源覆盖率校验](#方案-4-资源覆盖率校验)
- [第三部分：实施路径](#第三部分实施路径)
- [第四部分：验收标准](#第四部分验收标准)

---

# 第一部分：规则约束体系

## A. 布局结构约束

### A1. 权威蓝图原则 ⭐⭐⭐⭐⭐

**规则**: `layoutStructure` 是布局的唯一权威来源，Figma 树仅用于资源引用和样式取值。

**约束细则**:

| 字段 | 约束 | 违规示例 | 正确示例 |
|------|------|----------|----------|
| `sections[].layout` | 必须严格遵循方向 | `layout: "horizontal"` 却生成 `flex-direction: column` | `layout: "horizontal"` → `flex-direction: row` |
| `sections[].order` | 按数组顺序从上到下/从左到右排列 | 把第 3 个 section 放到第 1 个位置 | sections[0] → DOM 第 1 个，sections[1] → DOM 第 2 个 |
| `body.gridColumns` | 网格列数硬约束 | `gridColumns: 3` 却生成 `repeat(4, 1fr)` | `gridColumns: 3` → `grid-template-columns: repeat(3, 1fr)` |
| `layout: "2-col"` | 必须两列并排 | 改成上下堆叠 | `display: grid; grid-template-columns: 1fr 1fr;` |

**Prompt 注入位置**: `microcode-engineer.js:_buildLayoutSkeleton()` → 生成骨架文本注入 prompt

**示例骨架文本**:
```
## 🧱 组件结构骨架（必须严格遵循，禁止臆造）

1. 「tab-switcher」 → 横向：江阴靖江长江隧道、江阴大桥
2. 「daily-stats」（标题「今日累计」） → 竖向：stat-cards（横向）
3. 「vehicle-cards」 → 网格3列：危化品车、重载车、集卡

**铁律**：
- tab-switcher 必须横向排列（flex-direction: row）
- vehicle-cards 必须 3 列网格（grid-template-columns: repeat(3, 1fr)）
- 禁止凭组件名臆造结构
```

### A2. 禁止臆造结构 ⭐⭐⭐⭐⭐

**规则**: 禁止 LLM 凭组件名、业务经验、通用模式推测布局。

**常见违规场景**:

| 组件名关键词 | LLM 臆造结构 | 正确做法 |
|-------------|-------------|---------|
| "统计" / "dashboard" | 自动生成"上卡片+下图表" | 严格按 layoutStructure 的 sections 顺序 |
| "列表" / "table" | 自动生成"左过滤+右表格" | 检查是否有 `layout: "2-col"` |
| "图表" / "chart" | 自动生成"标题+图表+图例" | 检查 layoutStructure 是否包含图例 section |

**Prompt 约束文本**:
```markdown
❌ 禁止凭组件名推测布局：
- 看到"统计"不要自动生成"上卡片+下图表"
- 看到"列表"不要自动生成"左过滤+右表格"
- 看到"图表"不要自动生成"标题+图表+图例"

✅ 必须按 layoutStructure 的 sections 数组顺序、每个 section 的 layout 字段生成
```

### A3. 嵌套层级限制 ⭐⭐⭐

**规则**: 最大嵌套深度不超过 4 层，避免 DOM 树过深。

**约束**:
```
✅ 推荐结构（3 层）:
.c-component-root (1)
  └─ .c-section (2)
       └─ .c-card (3)
            └─ .c-card-content (4)

❌ 过深结构（6 层）:
.c-root → .c-wrapper → .c-container → .c-section → .c-card → .c-content
```

**实施**: 在子组件拆分时，将深层嵌套拆分为独立子组件。

---

## B. 资源引用约束

### B1. 资源覆盖率 100% ⭐⭐⭐⭐⭐

**规则**: `resource-dom-mapping.json` 中列出的资源必须全部被代码引用。

**资源类型与引用方式**:

| 资源类型 | usage 字段 | 引用方式 | 正确示例 | 错误示例 |
|---------|-----------|---------|---------|---------|
| **背景图** | `background-image` | 模板插值 `:style` | `:style="{ backgroundImage: 'url(' + bg1 + ')' }"` | `<style> .card { background-image: url($bg1); } </style>` |
| **图标** | `<img :src>` | 模板插值 `:src` | `<img :src="icon1" />` | `<style> .icon { content: url(@icon1); } </style>` |
| **装饰图** | `<img :src>` | 同图标 | `<img :src="img1" class="decoration" />` | - |

**禁止行为**:
1. ❌ 遗漏任何已映射资源
2. ❌ 用纯 CSS 渐变替代实际背景图片（除非设计稿确实无图）
3. ❌ 在 `<style>` 块中使用资源变量（`url($bg1)` / `url(@bg1)` / `url(${bg1})`）
4. ❌ 手写 import 语句（系统自动注入）

**Prompt 注入位置**: `microcode-engineer.js:_buildTemplateChunkMiddle()` → `availVarsBlock`

**示例约束文本**:
```markdown
## 📦 资源变量白名单

本次**仅以下资源变量可用**：
- `icon1`、`icon2`、`bg1`、`bg3`

**用法铁律**：
1. ✅ 模板插值：`<img :src="icon1">` / `:style="{ backgroundImage: 'url(' + bg1 + ')' }"`
2. ❌ 禁止写进 CSS：`url($bg1)` / `url(@bg1)` 会导致 Less 编译崩溃
3. ❌ 禁止手写 import：系统自动注入
4. ✅ 覆盖率 100%：所有白名单资源必须被引用
```

### B2. 背景图专属约束 ⭐⭐⭐

**规则**: 使用背景图的元素必须移除 CSS `border` 和 `background-color`。

**原因**: 避免背景图与 CSS 样式叠加导致视觉错误。

**正确示例**:
```vue
<template>
  <div 
    :style="{ backgroundImage: 'url(' + bg1 + ')' }" 
    class="c-card"
  >
    <!-- 内容 -->
  </div>
</template>

<style scoped lang="less">
.c-card {
  width: 200px;
  height: 150px;
  background-size: cover;
  background-position: center;
  // ✅ 不设置 border 和 background-color
}
</style>
```

**错误示例**:
```less
.c-card {
  background-color: rgba(255, 255, 255, 0.1); // ❌ 会与背景图叠加
  border: 1px solid #ccc; // ❌ 可能遮挡背景图边缘
}
```

---

## C. 样式规范约束

### C1. 微码样式规范（纯 mixin 模式）⭐⭐⭐⭐⭐

#### C1.1 文件结构（固定）

```
resources/styles/
├── index.less           # 系统自动生成（不要输出）
├── common.less          # ✅ 必须生成：全部业务样式
└── themes/
    ├── theme-vars.less  # ✅ 必须生成：主题变量 mixin
    ├── dark.less        # 系统自动生成
    └── light.less       # 系统自动生成
```

#### C1.2 theme-vars.less 规范

**必须定义三个 mixin**:

```less
.common() {
  // 跨主题共享变量
  @font-size-base: 14px;
  @spacing-md: 16px;
}

.theme-dark() {
  // 深色主题变量（硬编码值，支持 Less 颜色函数）
  @color-card-bg: rgba(255, 255, 255, 0.05);
  @color-text-primary: #ffffff;
  @color-primary: #3677f8;
  @color-hover: lighten(#3677f8, 10%); // ✅ Less 函数
}

.theme-light() {
  // 浅色主题变量
  @color-card-bg: #ffffff;
  @color-text-primary: #333333;
  @color-primary: #3677f8;
}

// ⚠️ 根级禁止调用任何 mixin（由系统在 index.less 调用）
```

**禁止用法**:
```less
// ❌ 错误：不要在需要 Less 颜色函数的地方使用 var()
.theme-dark() {
  @color-primary: var(--colorPrimary);  // ❌
  @color-hover: lighten(@color-primary, 10%);  // 编译报错！
}

// ❌ 错误：根级调用 mixin
.common();
.theme-dark();  // 不要写这个
```

#### C1.3 common.less 规范（铁律）⭐⭐⭐⭐⭐

**🔴 铁律**: 所有业务 class 必须写在**文件根作用域**，禁止用任何外层选择器包裹。

**正确示例**:
```less
// ✅ 直接在根作用域写业务 class
.c-vehicle-card {
  background: @color-card-bg;
  border: 1px solid @color-border;
}

.c-vehicle-title {
  color: @color-text-primary;
  font-size: @font-size-lg;
}
```

**错误示例**:
```less
// ❌ 用 .dark {} 或 .light {} 包裹
.dark {
  .c-vehicle-card {  
    // 编译成 .dark .c-vehicle-card
    // 真实 DOM 上无 .dark 类 → 0 命中 → 样式全部失效！
  }
}

// ❌ 用主题类包裹
.theme-dark {
  .c-xxx { }  // 同样失效
}
```

**失效原因**:
- 微码宿主**不会**给组件根元素添加 `.dark` / `.light` 类
- 被包裹后编译成 `.dark .c-xxx`，真实 DOM 无此结构 → 选择器 0 命中
- index.less 在**根作用域**调用主题 mixin，common.less 直接导入（无包裹）

**index.less 结构（系统自动生成）**:
```less
@import './themes/theme-vars.less';
.common();         // 根作用域调用
.theme-dark();     // 根作用域调用（默认主题）
@import (multiple) './common.less';  // 无包裹导入
```

#### C1.4 Class 命名规范

**强制前缀**: `.c-`（component 缩写）

**命名规则**:
```less
// ✅ 正确：.c- 前缀 + 语义化命名（kebab-case）
.c-env-monitor-root { }
.c-env-monitor-header { }
.c-vehicle-card { }
.c-chart-container { }

// ❌ 错误：用组件实例 ID 作 class 前缀
.c-f0abee-container { }         // 实例 ID 是运行时随机的
.c-mc-max-1735123456-root { }   // 时间戳不可预测
```

**特殊说明**: 根容器的实例 ID 类（如 `.c-mc-max-{INSTANCE_ID}`）由系统自动注入，LLM 不需要手写。

#### C1.5 容器约束（防止溢出）

```less
.c-component-root {
  width: 100%;            // ✅ 填充父容器
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;       // ✅ 防止内容溢出
  display: flex;          // ✅ 使用 flex 布局
  flex-direction: column;
}

.c-content-area {
  flex: 1 1 auto;         // ✅ 弹性高度
  min-height: 0;          // ✅ 允许收缩
  overflow-y: auto;       // ✅ 内容过多时滚动
}

// ❌ 避免固定高度
.c-chart {
  // height: 300px;  // ❌ 固定高度可能溢出
  height: 100%;      // ✅ 填充父容器
}
```

---

### C2. Vue3 样式规范（混合模式）⭐⭐⭐⭐

#### C2.1 主题变量混合模式

**架构**: CSS 变量（框架注入） + Less 变量（主题特定）

```less
// theme-vars.less（Vue3 版本）
.common() {
  // ✅ 接收框架 CSS 变量
  @fontSize: var(--fontSize);
  @colorTextBase: var(--colorTextBase);
  @colorPrimary: var(--colorPrimary);
}
.common();  // 全局调用

.theme-dark() {
  // 硬编码值（用于 Less 颜色函数）
  @custom-bg-color: #1a1a1a;
  @custom-border-color: #333333;
  @hover-color: lighten(#3677f8, 10%);
}

.theme-light() {
  @custom-bg-color: #ffffff;
  @custom-border-color: #e0e0e0;
  @hover-color: darken(#3677f8, 10%);
}
.theme-light();  // 默认主题
```

#### C2.2 主题切换方式

```vue
<!-- 父容器动态添加主题类 -->
<template>
  <div :class="['dashboard-root', themeType]">
    <!-- 内容 -->
  </div>
</template>

<style scoped lang="less">
@import '../../resources/styles/themes/theme-vars.less';

.dashboard-root {
  background: @custom-bg-color;  // 默认浅色主题
  
  &.dark {
    .theme-dark();  // 切换到深色主题
    background: @custom-bg-color;
  }
}
</style>
```

#### C2.3 Class 命名（无强制前缀）

```less
// ✅ 推荐：BEM 命名
.dashboard-root { }
.dashboard__header { }
.dashboard__content { }

// ✅ 也可以：自由命名（scoped 已隔离）
.root { }
.header { }
```

---

## D. 微码专属约束

### D1. base-panel 包裹 ⭐⭐⭐⭐⭐

**规则**: 顶层必须使用 `<base-panel>` 包裹，不允许嵌套其他组件。

**正确示例**:
```vue
<template>
  <base-panel panelKey="default-panel">
    <div class="c-component-root">
      <!-- 业务内容 -->
    </div>
  </base-panel>
</template>
```

**panelKey 可选值**:
- `empty` - 无外壳（透明背景）
- `default-panel` - 默认面板（带边框/阴影/背景）
- `aio-panel` - 一体化面板

**错误示例**:
```vue
<!-- ❌ 顶层不是 base-panel -->
<template>
  <div class="c-component-root">
    <base-panel>...</base-panel>
  </div>
</template>

<!-- ❌ 嵌套其他组件 -->
<template>
  <base-panel>
    <el-container>...</el-container>
  </base-panel>
</template>
```

### D2. $mcComponentBuilder 单次调用 ⭐⭐⭐⭐⭐

**规则**: 整个组件中只能调用一次 `$mcComponentBuilder()`。

**正确示例**:
```vue
<script setup>
// ✅ 解构获取所需方法
const {
  runtimeBuilder,
  businessProps,
  componentProps,
  componentApi,
  componentId,
  componentDeclareInfo
} = $mcComponentBuilder()
</script>
```

**错误示例**:
```vue
<script setup>
// ❌ 多次调用
const { runtimeBuilder } = $mcComponentBuilder()
const { componentApi } = $mcComponentBuilder()  // 违规！
</script>
```

### D3. 事件发布/监听规范 ⭐⭐⭐⭐

**规则**: 业务事件必须在 `declare.json` 中声明，框架事件（`mc-framework-*`）无需声明。

**业务事件**:
```javascript
// ✅ 发布（必须在 declare.json businessEvents 中声明）
runtimeBuilder.publishEvent('vehicle-click', {
  vehicleId: row.id,
  vehicleName: row.name
})

// ✅ 监听（必须在 declare.json businessStatuses 中声明）
runtimeBuilder.listenEvent('refresh-data', (data) => {
  fetchData(data.filters)
})

// ✅ 销毁（必须在 onUnmounted 中调用）
onUnmounted(() => {
  runtimeBuilder.removeListener('refresh-data')
})
```

**框架事件**（无需声明）:
```javascript
// ✅ 框架级事件（mc-framework-* 前缀）
runtimeBuilder.publishEvent('mc-framework-init')
runtimeBuilder.publishEvent('mc-framework-loading', { loading: true })
runtimeBuilder.publishEvent('mc-framework-close-component')
```

**一致性校验**: L0-B 阶段检查 `publishEvent` / `listenEvent` 的事件名与 `declare.json` 一致性。

### D4. 数据请求约束 ⭐⭐⭐⭐⭐

**规则**: 只能使用 `componentApi.*` 方法，禁止 `axios` / `fetch` / `createRequest`。

**正确示例**:
```javascript
// ✅ 使用 componentApi
const data = await componentApi.getCommonApiFindList(params, 'vehicleList')
const detail = await componentApi.getCommonApiFindOne({ id: 1 }, 'vehicleDetail')
const page = await componentApi.getCommonApiPageList({ 
  page: { currentPage: 1, pageSize: 10 } 
}, 'vehicleList')
```

**错误示例**:
```javascript
// ❌ 禁止使用其他 HTTP 库
import axios from 'axios'  // 禁止！
const data = await axios.get('/api/vehicles')

const data = await fetch('/api/vehicles')  // 禁止！
```

**例外白名单**: `c-mc-map` 组件允许使用地图 SDK 的内置请求。

### D5. declare.json 规范 ⭐⭐⭐⭐

**componentId 约束**:
```json
{
  "componentId": "${componentName}",  // ✅ 必须使用变量
  "componentName": "${displayName || componentName}",
  "version": "v1.0.0"
}
```

**必填字段**:
- `componentId`、`componentName`、`version`
- `attribute.aspectRatio`（数组，如 `[16, 9]`）
- `businessEvents`、`businessStatuses`（可为空对象 `{}`）
- `themeConfig`（至少一个主题）

**完整示例**: 参见 `frontend-mc-guideline/references/declare-json.md`

---

## E. Vue3 专属约束

### E1. 无 base-panel 约束 ⭐⭐⭐

**规则**: 标准 SFC，无框架容器，面板头部/背景/边框真实还原。

```vue
<template>
  <div class="dashboard-root">
    <!-- ✅ 面板头部、背景、边框等真实还原 -->
    <div class="dashboard-header">
      <h2>{{ title }}</h2>
    </div>
    <div class="dashboard-content">
      <!-- 内容区 -->
    </div>
  </div>
</template>
```

### E2. API 调用自由 ⭐⭐

**规则**: 可以使用任何 HTTP 库。

```javascript
// ✅ 使用 axios
import axios from 'axios'
const data = await axios.get('/api/vehicles')

// ✅ 使用 fetch
const response = await fetch('/api/vehicles')
const data = await response.json()
```

### E3. 无 declare.json ⭐⭐

Vue3 组件不需要 `declare.json`、`component.js`、`css-vars.js` 等微码专属文件。

---

# 第二部分：优化方案

## 方案 1: 增强子组件拆分

### 背景

当前子组件拆分策略（`subcomponent-planner.js`）：
- **拆分依据**: 仅按 section 数量（≥3 个 section 触发拆分）
- **粒度**: 粗粒度，一个 section = 一个子组件
- **问题**: 单个 section 内部复杂度高（如包含 2+ 图表、10+ 元素）时仍会超出 token 预算

### 优化目标

将复杂组件成功率从 **60% → 90%**，超大型组件从 **20% → 80%**。

### 核心思路

**三层拆分策略**:
1. **Section 级拆分**（现有逻辑）: section 数量 ≥3 时拆分
2. **Section 内部拆分**（NEW）: 单个 section 复杂度高时内部拆分
3. **图表隔离**（NEW）: 图表数量 ≥2 时独立子组件

### 实施细节

#### 阶段 1: 多维度复杂度评分

```javascript
// subcomponent-planner.js
function calculateSplitScore(section) {
  let score = 0
  
  // 维度 1: 元素密度（40% 权重）
  const elementCount = countElements(section)
  if (elementCount > 10) score += 40
  else if (elementCount > 6) score += 20
  
  // 维度 2: 图表数量（30% 权重）
  const charts = extractCharts(section)
  if (charts.length >= 2) score += 30
  else if (charts.length === 1 && elementCount > 8) score += 15
  
  // 维度 3: 交互复杂度（20% 权重）
  const interactions = countInteractions(section)
  if (interactions > 3) score += 20
  else if (interactions > 1) score += 10
  
  // 维度 4: 嵌套深度（10% 权重）
  const maxDepth = calculateDepth(section)
  if (maxDepth > 3) score += 10
  
  return {
    score,
    shouldSplit: score >= 30,  // 阈值：30 分
    reasons: {
      elementCount,
      charts: charts.length,
      interactions,
      maxDepth
    }
  }
}
```

#### 阶段 2: Section 内部拆分规则

| 规则 ID | 触发条件 | 拆分策略 | 示例 |
|---------|---------|---------|------|
| **R1** | 图表 ≥2 | 每个图表独立子组件 | `BarChart.vue` + `LineChart.vue` + `PieChart.vue` |
| **R2** | 元素 >10 且无图表 | 按元素密度分组（每组 ≤8 元素） | `StatGroup1.vue` + `StatGroup2.vue` |
| **R3** | 嵌套深度 >3 | 深层节点提升为子组件 | `CardList.vue` 拆出 `CardItem.vue` |
| **R4** | 交互复杂度 >3 | 每个交互区域独立子组件 | `FilterPanel.vue` + `ActionBar.vue` |

#### 阶段 3: 图表隔离策略

**触发条件**: 图表数量 ≥2

**拆分方式**:
```javascript
// 每个图表生成独立子组件
{
  name: 'BarChart',
  type: 'chart-component',
  props: {
    chartData: 'Array',      // 数据
    chartConfig: 'Object'    // 完整 echarts 配置
  },
  emits: ['legendClick', 'dataZoom']
}
```

**父组件职责**:
```vue
<template>
  <div class="c-charts-container">
    <BarChart 
      :chart-data="barData" 
      :chart-config="barConfig"
      @legend-click="handleLegendClick"
    />
    <LineChart 
      :chart-data="lineData" 
      :chart-config="lineConfig"
    />
  </div>
</template>

<script setup>
// 父组件协调图表交互
const handleLegendClick = (params) => {
  // 联动其他图表
  lineChartRef.value?.dispatchAction({
    type: 'legendToggleSelect',
    name: params.name
  })
}
</script>
```

**优势**:
1. 每个图表子组件体量小（< 200 行）
2. echarts 配置完整保留（无质量损失）
3. 父组件只负责数据准备和交互协调

#### 阶段 4: 布局元数据提取

**目的**: 父组件生成正确的布局协调代码。

```javascript
// 从 Figma Auto Layout 提取
function extractLayoutMetadata(section) {
  return {
    direction: section.layoutMode,  // HORIZONTAL / VERTICAL
    alignItems: section.primaryAxisAlignItems,
    justifyContent: section.counterAxisAlignItems,
    gap: section.itemSpacing,
    padding: {
      top: section.paddingTop,
      right: section.paddingRight,
      bottom: section.paddingBottom,
      left: section.paddingLeft
    }
  }
}
```

**父组件生成**:
```vue
<style scoped lang="less">
.c-section-container {
  display: flex;
  flex-direction: row;  // 从 layoutMetadata 提取
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 24px;
}
</style>
```

### 实施步骤

**Step 1**: 增强 `subcomponent-planner.js`
- 新增 `calculateSplitScore()` 函数
- 新增 `splitSectionInternally()` 函数
- 新增 `extractLayoutMetadata()` 函数

**Step 2**: Engineer 集成
- `microcode-engineer.js` / `vue3-engineer.js` 消费增强后的 plan
- 生成子组件时注入 props/emits 定义
- 生成父组件时注入布局协调代码

**Step 3**: L0-B 校验
- 检查子组件是否被父组件引用
- 检查 props/emits 是否匹配
- 检查布局方向是否与 layoutMetadata 一致

### 预期效果

| 组件复杂度 | 拆分前成功率 | 拆分后成功率 | 提升幅度 |
|-----------|------------|------------|---------|
| 简单（<5 元素） | 95% | 98% | +3% |
| 中等（5-10 元素） | 80% | 95% | +15% |
| 复杂（10-20 元素，1-2 图表） | 60% | 90% | +30% ⭐ |
| 超大型（>20 元素，2+ 图表） | 20% | 80% | +60% ⭐⭐ |

---

## 方案 2: 样式隔离策略

### 背景

组件拆分后，父子组件样式需要严格隔离，避免：
1. 父子组件 class 名称冲突
2. 全局样式污染
3. 主题变量传递混乱

### 核心原则

```
隔离 > 共享：优先隔离，按需共享（通过 CSS 变量）
约束 > 自由：父组件约束外部尺寸，子组件填充给定空间
变量 > 硬编码：使用 CSS 变量，避免硬编码颜色/间距
穿透 > 全局：需要修改时用 :deep()，不要用全局样式
```

### 职责划分

| 层级 | 职责 | 示例 |
|------|------|------|
| **父组件** | 布局协调（位置、间距、尺寸约束） | `display: flex; gap: 16px; width: 100%;` |
| **子组件** | 内部样式（颜色、边框、内边距） | `color: @color-text; border: 1px solid; padding: 12px;` |

### 尺寸约束规则

```vue
<!-- 父组件：约束子组件的外部尺寸 -->
<style scoped lang="less">
.dashboard {
  &__header {
    width: 100%;      // 宽度约束
    height: 60px;     // 高度约束（固定）
  }
  
  &__chart {
    width: 100%;
    flex: 1 1 auto;   // 高度约束（弹性）
    min-height: 300px;
  }
}
</style>

<!-- 子组件：填充父组件给定的空间 -->
<style scoped lang="less">
.header-section {
  width: 100%;   // 继承父组件宽度约束
  height: 100%;  // 继承父组件高度约束
  display: flex; // 内部布局自己控制
  padding: 12px; // 内部间距自己管理
}
</style>
```

### 间距管理规则

```vue
<!-- 父组件：控制子组件之间的间距 -->
<style scoped lang="less">
.dashboard__layout {
  display: flex;
  flex-direction: column;
  gap: 16px; // ✅ 子组件间距由父组件统一管理
}
</style>

<!-- 子组件：只管理内部间距 -->
<style scoped lang="less">
.header-section {
  padding: 12px 16px; // ✅ 内部间距
  
  // ❌ 不要设置 margin（会破坏父组件的 gap 布局）
  // margin-bottom: 16px; // WRONG!
}
</style>
```

### 样式穿透（修改子组件/第三方组件）

```vue
<style scoped lang="less">
.dashboard {
  // ✅ 穿透修改子组件样式
  :deep(.header-section__title) {
    color: #1890ff;
  }
  
  // ✅ 修改第三方组件（echarts）
  :deep(.echarts-tooltip) {
    background: rgba(0, 0, 0, 0.8);
  }
}
</style>
```

### 实施步骤

**Step 1**: Engineer 阶段注入样式隔离指南
- 在 prompt 中明确父子组件职责划分
- 在子组件 prompt 中强调"填充父组件空间"

**Step 2**: L0-B 校验增强
- 检查子组件根元素是否设置 `width: 100%; height: 100%;`
- 检查子组件是否存在 `margin`（警告）
- 检查父组件是否用 `gap` 控制子组件间距

**Step 3**: 生成后自动修复
- 扫描子组件，自动注入 `width: 100%; height: 100%;`
- 移除子组件根元素的 `margin`

---

## 方案 3: 布局骨架注入

### 背景

分块生成模式下，LLM 容易聚焦末尾的"只生成 template"指令而忽略前文的 `layoutStructure`，导致凭组件名臆造结构。

### 解决方案

在分块 prompt 中，**直接贴近模板生成指令前**注入精简的「组件结构骨架」。

### 实施位置

`microcode-engineer.js:_buildLayoutSkeleton()` → 生成骨架文本 → `_buildTemplateChunkMiddle()` 注入

### 骨架文本格式

```markdown
## 🧱 组件结构骨架（必须严格按此还原顶层布局，禁止凭组件名臆造结构）

1. 「tab-switcher」 → 横向：江阴靖江长江隧道、江阴大桥
2. 「daily-stats」（标题「今日累计」） → 竖向：stat-cards（横向）
3. 「vehicle-cards」 → 网格3列：危化品车卡片、重载车卡片、集卡卡片
4. 「traffic-chart」 → 竖向：折线图容器

**铁律**：
- 段落从上到下顺序即为上方 sections 顺序
- 每段内部排列方向已标注（横向/竖向/网格）
- 网格段必须按标注的列数生成（如 3 列 → grid-template-columns: repeat(3, 1fr)）
- 两列并排段必须生成 flex-direction: row，禁止改为上下堆叠
- 禁止凭组件名臆造结构
```

### 效果验证

**Before**（无骨架注入）:
```
LLM 看到组件名"交通统计"
→ 臆造结构：上统计卡片 + 下图表
→ 与 layoutStructure 不符 → 布局错误
```

**After**（有骨架注入）:
```
LLM 看到骨架：
1. tab-switcher → 横向
2. daily-stats → 竖向：stat-cards（横向）
3. vehicle-cards → 网格3列
→ 严格按骨架生成 → 布局正确 ✅
```

---

## 方案 4: 资源覆盖率校验

### 背景

`resource-dom-mapping.json` 中列出的资源经常被遗漏，导致：
1. 设计稿还原度低（图标/背景图缺失）
2. 资源文件浪费（下载但未使用）

### 解决方案

**L0-B 阶段**增加资源覆盖率校验，生成 `RESOURCE-001` / `RESOURCE-002` 告警。

### 校验规则

#### RESOURCE-001: 资源未引用

```javascript
// code-structure-validator.js
function checkResourceCoverage(files, resourceMapping) {
  const issues = []
  const allFiles = Object.values(files).join('\n')
  
  for (const [resourceVar, resource] of Object.entries(resourceMapping)) {
    // 检查是否在模板中引用
    const usedInTemplate = allFiles.includes(`:src="${resourceVar}"`) ||
                          allFiles.includes(`'url(' + ${resourceVar}`)
    
    if (!usedInTemplate) {
      issues.push({
        id: 'RESOURCE-001',
        severity: 'WARN',
        message: `资源变量 "${resourceVar}" 未被引用`,
        location: resource.path,
        fix: resource.usage === 'background-image' 
          ? `:style="{ backgroundImage: 'url(' + ${resourceVar} + ')' }"`
          : `<img :src="${resourceVar}" />`
      })
    }
  }
  
  return issues
}
```

#### RESOURCE-002: 资源误用（写进 CSS）

```javascript
function checkResourceMisuse(files) {
  const issues = []
  
  for (const [path, content] of Object.entries(files)) {
    if (path.endsWith('.vue') || path.endsWith('.less')) {
      // 检查 <style> 或 .less 中是否误用资源变量
      const styleMatch = content.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || [content]
      
      for (const styleBlock of styleMatch) {
        // 检查 url($bg1) / url(@icon1) / url(${bg1}) 等误用
        const misuse = styleBlock.match(/url\s*\(\s*[$@{]*(\w+\d*)[}]*\s*\)/g)
        
        if (misuse) {
          issues.push({
            id: 'RESOURCE-002',
            severity: 'BLOCK',
            message: `禁止在 CSS 中使用资源变量：${misuse.join(', ')}`,
            location: path,
            fix: '改用模板插值：:style="{ backgroundImage: \'url(\' + bg1 + \')\' }"'
          })
        }
      }
    }
  }
  
  return issues
}
```

### 实施步骤

**Step 1**: 在 `code-structure-validator.js` 中新增 `checkResourceCoverage()` 和 `checkResourceMisuse()`

**Step 2**: 在 L0-B 节点调用校验

**Step 3**: 如果检测到 `RESOURCE-001`（未引用），生成修复建议并重新生成

---

# 第三部分：实施路径

## 阶段划分

### 阶段 1: 规则约束强化（1-2 周）⭐⭐⭐⭐⭐

**目标**: 将现有约束文本注入到 Engineer prompt 中。

**任务**:
1. 更新 `microcode-engineer.js` 的 `buildCodePrompt()` 方法
   - 注入布局骨架（`_buildLayoutSkeleton`）
   - 注入资源白名单（`availVarsBlock`）
   - 注入样式规范（common.less 根作用域铁律）
   - 注入 class 命名规范（`.c-` 前缀 + 禁止实例 ID）

2. 更新 `vue3-engineer.js` 的 prompt 构建
   - 覆写样式规范为 Vue3 混合模式
   - 移除微码专属约束（base-panel / $mcComponentBuilder）

3. 验证现有组件生成
   - 选取 5 个历史失败案例重新生成
   - 对比前后差异，验证规则是否生效

**验收标准**:
- [ ] 布局骨架在 prompt 中可见（贴近模板生成指令）
- [ ] 资源白名单在 prompt 中可见
- [ ] 样式约束文本完整（common.less 根作用域 + class 命名）
- [ ] 5 个历史失败案例中至少 4 个成功生成

---

### 阶段 2: L0-B 校验增强（1 周）⭐⭐⭐⭐

**目标**: 在代码结构校验阶段拦截违规代码。

**任务**:
1. 新增校验规则
   - `LAYOUT-001`: 布局方向与 layoutStructure 不符
   - `RESOURCE-001`: 资源变量未引用
   - `RESOURCE-002`: 资源变量误用（写进 CSS）
   - `STYLE-001`: common.less 被外层选择器包裹
   - `STYLE-002`: class 使用实例 ID 前缀
   - `STYLE-003`: 子组件设置 margin

2. 集成到 `code-structure-validator.js`

3. L0-B 节点失败时生成详细修复建议

**验收标准**:
- [ ] 6 个新校验规则通过单元测试
- [ ] L0-B 失败时返回具体违规代码行号 + 修复建议
- [ ] 拦截率 ≥80%（80% 的违规代码被校验拦截）

---

### 阶段 3: 增强子组件拆分（2-3 周）⭐⭐⭐⭐⭐

**目标**: 实现三层拆分策略，提升复杂组件成功率。

**任务**:
1. 增强 `subcomponent-planner.js`
   - 新增 `calculateSplitScore()` - 多维度评分
   - 新增 `splitSectionInternally()` - section 内部拆分
   - 新增 `extractCharts()` - 图表识别与隔离
   - 新增 `extractLayoutMetadata()` - 布局元数据提取

2. Engineer 集成
   - 消费增强后的 plan（含内部拆分子组件）
   - 生成子组件时注入 props/emits 定义
   - 生成父组件时注入布局协调代码

3. 测试复杂组件
   - 选取 10 个复杂组件（10-20 元素，2+ 图表）
   - 验证拆分策略是否生效
   - 验证父子组件通信是否正确

**验收标准**:
- [ ] 复杂组件成功率 60% → 90%（目标 +30%）
- [ ] 超大型组件成功率 20% → 80%（目标 +60%）
- [ ] 图表隔离策略生效（≥2 图表时自动拆分）
- [ ] 父子组件 props/emits 匹配（L0-B 校验通过）

---

### 阶段 4: 样式隔离策略（1 周）⭐⭐⭐

**目标**: 确保父子组件样式严格隔离。

**任务**:
1. Engineer prompt 注入样式隔离指南
   - 父组件职责：布局协调
   - 子组件职责：内部样式
   - 尺寸约束规则
   - 间距管理规则

2. L0-B 校验增强
   - `STYLE-004`: 子组件未填充父组件空间
   - `STYLE-005`: 子组件使用 margin（警告）

3. 自动修复
   - 子组件根元素自动注入 `width: 100%; height: 100%;`
   - 移除子组件根元素 `margin`

**验收标准**:
- [ ] 样式隔离指南在 prompt 中可见
- [ ] 子组件根元素自动注入尺寸约束
- [ ] 父子组件样式冲突率 <5%

---

### 阶段 5: 全量测试与优化（1-2 周）⭐⭐⭐⭐

**目标**: 全量测试生成管线，达到验收标准。

**任务**:
1. 全量测试
   - 简单组件（<5 元素）: 30 个
   - 中等组件（5-10 元素）: 30 个
   - 复杂组件（10-20 元素，1-2 图表）: 30 个
   - 超大型组件（>20 元素，2+ 图表）: 10 个

2. 问题修复
   - 收集失败案例，分析失败原因
   - 调整 prompt 或校验规则
   - 重新测试

3. 文档更新
   - 更新规范文档（frontend-mc-guideline）
   - 更新校验清单（frontend-mc-check）
   - 更新开发者文档

**验收标准**:
- [ ] 简单组件成功率 ≥98%
- [ ] 中等组件成功率 ≥95%
- [ ] 复杂组件成功率 ≥90%
- [ ] 超大型组件成功率 ≥80%
- [ ] 布局识别错误率 <5%
- [ ] 资源遗漏率 <5%
- [ ] 样式作用域失效率 <3%

---

## 优先级排序

| 阶段 | 优先级 | 预期收益 | 实施难度 | 工时 |
|------|--------|---------|---------|------|
| 阶段 1: 规则约束强化 | ⭐⭐⭐⭐⭐ | 中高（+20% 成功率） | 低 | 1-2 周 |
| 阶段 2: L0-B 校验增强 | ⭐⭐⭐⭐ | 中（拦截 80% 违规） | 低 | 1 周 |
| 阶段 3: 增强子组件拆分 | ⭐⭐⭐⭐⭐ | 高（+30% 复杂组件成功率） | 中高 | 2-3 周 |
| 阶段 4: 样式隔离策略 | ⭐⭐⭐ | 中（减少样式冲突） | 低 | 1 周 |
| 阶段 5: 全量测试优化 | ⭐⭐⭐⭐ | 高（确保稳定性） | 中 | 1-2 周 |

**建议执行顺序**: 阶段 1 → 阶段 2 → 阶段 3 → 阶段 4 → 阶段 5

**最小可行方案（MVP）**: 阶段 1 + 阶段 2（3 周，立即见效）

---

# 第四部分：验收标准

## 量化指标

### 1. 生成成功率（按复杂度分层）

| 组件复杂度 | 当前成功率 | 目标成功率 | 验收条件 |
|-----------|-----------|-----------|---------|
| 简单（<5 元素） | 95% | 98% | ≥98% |
| 中等（5-10 元素） | 80% | 95% | ≥95% |
| 复杂（10-20 元素，1-2 图表） | 60% | 90% | ≥90% ⭐ |
| 超大型（>20 元素，2+ 图表） | 20% | 80% | ≥80% ⭐ |

### 2. 错误率（按错误类型分类）

| 错误类型 | 当前错误率 | 目标错误率 | 验收条件 |
|---------|-----------|-----------|---------|
| 布局识别错误 | 15% | <5% | <5% ⭐ |
| 资源遗漏 | 20% | <5% | <5% ⭐ |
| 样式作用域失效 | 12% | <3% | <3% ⭐ |
| 生成报错/中断 | 10% | <2% | <2% |
| 其他错误 | 8% | <5% | <5% |

### 3. 校验拦截率

| 校验规则 | 目标拦截率 | 验收条件 |
|---------|-----------|---------|
| LAYOUT-001（布局方向错误） | ≥80% | ≥80% |
| RESOURCE-001（资源未引用） | ≥90% | ≥90% |
| RESOURCE-002（资源误用） | ≥95% | ≥95% |
| STYLE-001（样式作用域错误） | ≥95% | ≥95% ⭐ |
| STYLE-002（class 命名错误） | ≥90% | ≥90% |

### 4. 代码质量

| 指标 | 目标值 | 验收条件 |
|------|--------|---------|
| 子组件平均行数 | <200 行 | <250 行 |
| 主组件平均行数 | <400 行 | <500 行 |
| common.less 平均行数 | <300 行 | <400 行 |
| 资源覆盖率 | 100% | ≥95% |
| L0-B 通过率 | ≥90% | ≥90% |

---

## 质量检查项

### 布局结构检查

- [ ] 严格按 layoutStructure.sections 顺序生成（未凭组件名臆造）
- [ ] 每个 section 的 layout 方向正确
- [ ] 网格段按标注列数生成
- [ ] 两列并排段生成 flex-direction: row

### 资源引用检查

- [ ] resource-dom-mapping.json 中的资源全部被引用
- [ ] 背景图使用模板插值（`:style`）
- [ ] 图标使用 `<img :src>`
- [ ] 背景图容器已移除 CSS border 和 background-color

### 样式规范检查（微码）

- [ ] common.less 所有 class 在根作用域（未被 `.dark {}` 包裹）
- [ ] theme-vars.less 定义了三个 mixin
- [ ] theme-vars.less 根级未调用任何 mixin
- [ ] 所有 class 使用 `.c-` 前缀（未用实例 ID）
- [ ] 未在 `<style>` 中使用 `url($bg1)`

### 样式规范检查（Vue3）

- [ ] 使用 `<style scoped lang="less">`
- [ ] theme-vars.less 的 `.common()` 使用 `var(--xxx)`
- [ ] `.theme-dark()` / `.theme-light()` 使用硬编码值
- [ ] 主题切换通过父容器 `:class="themeType"` 实现

### 容器约束检查

- [ ] 根容器设置 `width: 100%; height: 100%;`
- [ ] 根容器设置 `overflow: hidden;`
- [ ] 所有容器设置 `box-sizing: border-box;`
- [ ] 使用 flex 或 grid 布局

### 微码专属检查

- [ ] `<base-panel>` 包裹顶层内容
- [ ] `$mcComponentBuilder` 只调用一次
- [ ] 事件已在 declare.json 中声明
- [ ] listenEvent 有对应的 removeListener
- [ ] 数据请求只用 componentApi

### 子组件拆分检查

- [ ] 复杂 section（评分 ≥30）已拆分
- [ ] 图表 ≥2 时已隔离为独立子组件
- [ ] 子组件定义了 props/emits
- [ ] 父组件正确传递 props 和监听 emits
- [ ] 子组件被父组件引用（import + 模板使用）

---

## 回归测试集

### 测试用例分类

| 用例类型 | 数量 | 覆盖范围 |
|---------|------|---------|
| 简单组件 | 30 | 单 section、无图表、<5 元素 |
| 中等组件 | 30 | 2-3 sections、0-1 图表、5-10 元素 |
| 复杂组件 | 30 | 3-5 sections、1-2 图表、10-20 元素 |
| 超大型组件 | 10 | ≥5 sections、2+ 图表、>20 元素 |
| 边缘案例 | 10 | 深层嵌套、复杂交互、异形布局 |

### 测试执行

**频率**: 每个阶段完成后执行一次全量测试

**通过条件**: 
- 所有量化指标达标
- 所有质量检查项通过
- 无 P0/P1 级别 bug

---

## 文档交付物

### 必须交付

1. **规则约束文档**（本文档）
   - 完整的规则体系
   - 优化方案详细设计
   - 实施路径和验收标准

2. **更新后的规范文档**
   - `frontend-mc-guideline/` - 微码开发规范
   - `frontend-mc-check/` - 微码检查规范

3. **代码实现**
   - 增强的 `subcomponent-planner.js`
   - 更新的 `microcode-engineer.js` / `vue3-engineer.js`
   - 新增的校验规则（`code-structure-validator.js`）

4. **测试报告**
   - 全量测试结果
   - 失败案例分析
   - 性能对比（优化前后）

### 可选交付

1. **开发者指南** - 如何调试生成失败案例
2. **FAQ 文档** - 常见问题与解决方案
3. **演示视频** - 复杂组件生成全流程

---

# 附录

## A. 常见问题与解决方案

### Q1: 为什么微码 common.less 不能用 `.dark {}` 包裹？

**A**: 微码宿主**不会**给组件根元素添加 `.dark` 或 `.light` 类。如果 common.less 被包裹，编译后变成 `.dark .c-xxx`，真实 DOM 无此结构 → 选择器 0 命中 → 样式全部失效。

**解决方案**: 所有业务 class 写在 common.less 根作用域；index.less 在根作用域调用主题 mixin，然后导入 common.less。

---

### Q2: 资源变量为什么不能写进 CSS？

**A**: 资源变量（如 `bg1`、`icon1`）是 JavaScript 变量，Less 编译期无法解析 `url($bg1)` / `url(@bg1)`，会导致编译崩溃。

**解决方案**: 只能用模板插值：`:style="{ backgroundImage: 'url(' + bg1 + ')' }"`

---

### Q3: 如何判断一个 section 是否需要拆分？

**A**: 使用多维度评分系统（`calculateSplitScore`），阈值 30 分：
- 元素 >10 → +40 分
- 图表 ≥2 → +30 分
- 交互 >3 → +20 分
- 深度 >3 → +10 分

评分 ≥30 时触发拆分。

---

### Q4: 父子组件如何传递主题变量？

**A**: 
- **微码**: 子组件在 `<style scoped>` 中 `@import theme-vars.less`，然后调用主题 mixin
- **Vue3**: 父组件通过 `:class="themeType"` 传递主题类，子组件根据类名切换主题

---

### Q5: L0-B 校验失败后如何自动修复？

**A**: 
1. 解析校验错误 JSON（含 `id`、`severity`、`fix`）
2. 根据 `fix` 字段生成修复指令
3. 重新调用 Engineer 生成特定文件
4. 如果连续 3 次失败，降级到人工审查

---

## B. 术语表

| 术语 | 全称 | 说明 |
|------|------|------|
| **LLM** | Large Language Model | 大语言模型，如 Claude / GPT-4 |
| **Engineer** | Code Engineer | 代码生成器角色（microcode-engineer / vue3-engineer） |
| **L0-B** | Level 0 - Block B | 管线中的代码结构校验节点 |
| **layoutStructure** | Layout Structure | 视觉分析生成的权威布局结构 |
| **resource-dom-mapping** | Resource DOM Mapping | 资源到 DOM 节点的映射关系 |
| **base-panel** | Base Panel | 微码组件必须的顶层容器组件 |
| **$mcComponentBuilder** | Microcode Component Builder | 微码组件构建器（提供事件/API/Props） |
| **componentApi** | Component API | 微码组件数据请求 API |
| **runtimeBuilder** | Runtime Builder | 微码组件事件构建器（发布/监听事件） |
| **subcomponent-planner** | Subcomponent Planner | 子组件拆分规划器 |
| **BEM** | Block Element Modifier | CSS 命名规范 |

---

## C. 参考文档

### 内部规范

- `frontend-mc-guideline/` - 微码组件开发规范
- `frontend-mc-check/` - 微码组件检查规范
- `./pipeline-nodes.md` - 管线节点文档
- `./complex-component-optimization.md` - 复杂组件优化方案

### 代码文件

- `backend-node/src/ai-engine/roles/microcode-engineer.js` - 微码代码生成器
- `backend-node/src/ai-engine/roles/vue3-engineer.js` - Vue3 代码生成器
- `backend-node/src/ai-engine/roles/subcomponent-planner.js` - 子组件拆分规划器
- `backend-node/src/ai-engine/validators/code-structure-validator.js` - 代码结构校验器

### 外部参考

- [Vue 3 Style Guide](https://vuejs.org/style-guide/)
- [Less Documentation](https://lesscss.org/)
- [BEM Methodology](https://getbem.com/)

---

**文档结束**

如有疑问，请联系 AI Engine Team。
