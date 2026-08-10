# 阶段执行规则

> 本文档定义微码组件生成过程中各阶段（preview / figma / req-d / req / req-s）的执行规则和约束，适用于 langgraph-server 的所有生成角色。

## 1. 执行边界

**生成角色的职责：**

- 执行当前阶段允许的改动
- 使用现有阶段产物推进 `preview / figma / req-d / req / req-s`
- 在失败时优先做确定性修补
- 输出下一阶段建议

**生成角色的限制：**

- 不得自行放行到下一阶段
- 不得绕过审查流程
- 不得因局部问题重做整页结构
- 不得为单个组件写硬编码补丁掩盖系统问题

## 2. 所有阶段通用规则

- 优先复用 `{outputPath}/<name>` 下既有产物，不默认重写整个组件。
- 任何生成或修补，都必须遵守 `mc-dev` 微码规范。
- 代码输出必须是完整文件集合，不只给 diff 或解释。
- 禁止输出 placeholder / TODO / Markdown 围栏残留。
- 默认补充结构性中文注释：
  - template：主区块注释
  - script setup：状态 / 计算属性 / 数据整理 / 交互处理 / 生命周期 / 图表逻辑分段注释
  - styles：按区域分段注释
- 禁止无证据添加白底、边框、阴影、圆角、分割线、通用卡片壳。
- 资源引用必须使用组件目录内实际存在的相对路径。

### 专项规范引用

- **多布局组件**：详见 `references/multi-layout-pattern.md`
  - layoutType 配置与切换逻辑
  - 多布局目录结构
  - 主入口编写规范

- **CSS 变量配置**：详见 `references/css-variable-pattern.md`
  - CSS 变量命名格式（camelCase）
  - theme-vars.less 变量映射
  - 样式使用规范

## 3. preview 规则

### 🔴 图片读取验证（最高优先级，在任何分析之前执行）

**执行 preview-analysis 前，必须先验证图片是否真实可见：**

1. 使用 `Read` 工具读取预览图 PNG
2. **检查 Read 工具的输出**：
   - 如果输出为空 / 无内容 / 只有系统提示 → **图片读取失败**
   - 如果能看到图片的视觉内容 → 继续执行

3. **图片读取失败时，必须立即停止并输出**：
   ```
   ❌ 无法读取预览图，请将以下图片拖入对话框后重新执行：
   [图片路径]
   ```
   **禁止**：
   - ❌ 凭记忆或历史会话信息继续生成
   - ❌ 凭组件名/节点ID猜测设计内容
   - ❌ 复用上一个组件的分析结果

### 🔴 preview-analysis 写入前验证

写入 `preview-analysis-response.md` 前，必须能基于**当前看到的图片**回答：
- 背景是深色还是浅色？（`backgroundBrightness`）
- 图表是什么类型？（`charts[].type`）
- 有几个主要区块？（`layout.sections` 数量）

如果无法回答（因为没看到图片），**禁止写入，必须停止并要求用户发送图片**。

### 必做

- 建立可运行的 preview 版组件骨架。
- 保留 `base-panel`、`$mcComponentBuilder()`、`onload` 事件、样式目录结构。
- 先还原一级布局：头部 / 统计区 / 侧栏 / 内容区 / 网格区。
- 根据 `preview-analysis.json` 识别：
  - 主区块数量
  - 主轴方向
  - 行列关系
  - 大小比例
  - 面板插槽边界
- 有图表时必须生成可见图表，而不是空容器。

### 禁止

- 把标题栏控件错误塞进内容区
- 把内容区元素挪进 `header-right`
- 为"好看"臆造卡片壳或头部分割装饰
- 用固定 `setTimeout` 作为图表初始化唯一兜底
- 混淆 section 内部 header/body 层级与面板插槽层级

### 🔴 section 内部布局层级规则（CRITICAL）

**核心原则：section 内部的 `header` 和 `body` 是两个独立层级，禁止扁平化处理。**

#### 1. 结构解析规则

从 `preview-analysis.json` 读取 section 结构：

```json
{
  "id": "section-1",
  "header": {
    "title": "当日总流量",
    "controls": [{"role": "dropdown"}]
  },
  "body": {
    "layout": "horizontal-2-columns",
    "children": [{"role": "stat-card"}]
  }
}
```

**生成对应 DOM 结构：**

```vue
<div class="section">
  <!-- header 区域：标题行 -->
  <div class="section-header">
    <div class="section-title">{{ title }}</div>
    <div class="section-controls">
      <!-- controls 渲染在这里 -->
    </div>
  </div>
  
  <!-- body 区域：内容区 -->
  <div class="section-body">
    <!-- children 渲染在这里 -->
  </div>
</div>
```

#### 2. 错误示例（禁止）

❌ **错误：把 header controls 和 body children 扁平化到同一层**
```vue
<div class="stats-container">
  <div class="stat-card">...</div>      <!-- body content -->
  <div class="stat-card">...</div>      <!-- body content -->
  <div class="time-selector">...</div>  <!-- ❌ header control 混入 body -->
</div>
```

❌ **错误：用 grid 三列把 control 和 content 平行放置**
```less
.stats-container {
  grid-template-columns: 1fr 1fr auto;  // ❌ 错误布局
}
```

#### 3. 正确示例

✅ **正确：header 和 body 分层，上下结构**
```vue
<div class="section">
  <div class="section-header">
    <span class="title">当日总流量</span>
    <select class="time-selector">
      <option>24小时</option>
    </select>
  </div>
  <div class="section-body">
    <div class="stat-card">34,620</div>
    <div class="stat-card">82,379</div>
  </div>
</div>
```

```less
.section {
  display: flex;
  flex-direction: column;
}
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.section-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
}
```

### 🔴 样式约束自检清单（强制执行）

代码生成完成后，必须逐项检查：

#### 1. doNotInvent 约束检查

对照 `preview-analysis.json` 中的 `doNotInvent` 列表：

| 约束项 | 检查方法 | 违反时的处理 |
|-------|---------|------------|
| 不要添加设计稿中没有的卡片背景色 | 检查 `.card`、`.item` 等是否有 `background` | ❌ 删除无证据的 `background` |
| 不要添加额外的边框或阴影 | 检查是否有 `border`、`box-shadow` | ❌ 删除无证据的装饰样式 |
| 图例使用 ECharts 内置 | 检查是否生成 `.legend` DOM 元素 | ❌ 删除 DOM 图例，改用 ECharts legend |
| tooltip 是 hover 态 | 检查是否生成常驻 `.tooltip` DOM | ❌ 删除常驻 tooltip，改用 ECharts tooltip |

#### 2. 背景色添加准则

**每添加一个 `background` 或 `background-color`，必须回答：**
- 预览图中该区域是什么颜色？
- 如果是透明/无背景，禁止添加背景色
- 如果无法确定，保守选择不添加

**常见错误场景：**
- ❌ 给 `.vehicle-card` 添加 `background: @bg-light`（车型分布不需要卡片背景）
- ❌ 给 `.stat-item` 添加 `background: #fff`（统计数据不需要白色卡片）
- ✅ 仅在预览图明确显示有色背景时才添加

#### 3. 自检流程

生成代码后，执行以下检查：

```
1. 读取 preview-analysis.json 的 doNotInvent 列表
2. 遍历生成的 .less 文件，逐行检查：
   - 是否有 background / background-color？
   - 是否有 border / box-shadow？
   - 是否有 border-radius（卡片装饰）？
3. 对每个样式属性，确认预览图中是否有证据
4. 无证据的样式，立即删除
5. 重新生成，直到检查通过
```

#### 4. 🔴 ESLint + Prettier 格式化（强制，生成后必须执行）

所有 `.vue` 文件生成完毕后，**必须**运行以下命令修复格式：

```bash
npx eslint {outputPath}/<name>/package --ext .vue --fix
```

然后验证无剩余错误：

```bash
npx eslint src/workspace/custom-components/<name>/package --ext .vue
```

**输出有任何 error → 禁止标记阶段为 done，必须先修复。**

常见违规（AI 生成时容易犯）：
- 多条语句写在一行：`ro.disconnect(); chart = echarts.init(...)` → 必须换行
- 箭头函数缺括号：`el => ...` → `(el) => ...`
- 三元运算符未换行：`data.length ? data : ...` → prettier 要求换行
- 对象属性过长未换行

### 🔴 面板插槽判断规则（严格执行）

**核心原则：只有 preview-analysis.json 中 headerRelation="title-same-row" 且 slotCandidate 非空的元素，才能放入面板插槽。**

1. **读取 headerRelation 字段**：
   - 如果 section.headerRelation = "content-below-title" → 该section及其所有children都属于内容区
   - 如果 section.headerRelation = "title-same-row" 且 section.slotCandidate 有值 → 放入对应插槽

2. **禁止凭经验判断**：
   - ❌ 不要因为"看起来像统计数据"就放入 header-right
   - ❌ 不要因为"在顶部"就放入面板插槽
   - ✅ 只根据 preview-analysis.json 的 headerRelation 和 slotCandidate 字段判断

3. **默认规则**：
   - 如果 preview-analysis.json 中没有 headerRelation 字段，默认为 "content-below-title"
   - 如果有疑问，放入内容区而不是插槽

### 🔴 图表图例处理规则（严格执行）

**核心原则：图表图例必须使用 ECharts 内置 legend 组件，不要生成独立的 DOM 元素。使用 echarts.init() 进行图表初始化。**

1. **识别图例信息**：
   - 从 preview-analysis.json 的 charts 数组中读取 legend 和 legendPosition 字段
   - 不要从 section.children 中查找 role="text" 的图例元素

2. **生成 ECharts legend 配置**（在 updateChart 中通过 setOption 更新）：
   ```javascript
   const updateChart = () => {
     if (!chart) return
     chart.setOption({
       legend: {
         data: ['系列1', '系列2'],
         orient: 'horizontal',
         bottom: 10,
         left: 'center'
       },
       // ... 其他配置
     }, true)
   }
   ```

3. **legendPosition 映射规则**：
   - "top" → `{ top: 10, left: 'center' }`
   - "bottom" → `{ bottom: 10, left: 'center' }`
   - "left" → `{ left: 10, top: 'middle', orient: 'vertical' }`
   - "right" → `{ right: 10, top: 'middle', orient: 'vertical' }`

4. **禁止生成图例 DOM**：
   - ❌ 不要生成 `<div class="chart-legend">` 这样的DOM元素
   - ❌ 不要在 section.children 中为图例创建独立元素
   - ✅ 只在 ECharts option 中配置 legend

5. **echarts.init() 初始化方式**：
   - ✅ 使用 `<div ref="chartRef" class="chart-container" />` 作为容器
   - ✅ 使用 `echarts.init(chartRef.value)` + `chart.setOption(option, true)`
   - 🔴 必须搭配 ResizeObserver + watch(chartRef) + onUnmounted dispose

### 🔴 布局结构处理规则（严格执行）

**核心原则：准确理解 preview-analysis.json 中的 layout 字段，生成正确的 DOM 结构。**

#### 1. horizontal-N-columns 布局

当 section.layout = "horizontal-2-columns" 或 "horizontal-3-columns" 时：

**children 解析规则**：
- 第1个 child 如果 role="text" 且 name 是 section 名称 → section 标题（独立于列）
- 后续 children → 每个代表一列

**生成结构**：
```vue
<div class="section">
  <div class="section-title">{{ title }}</div>  <!-- 标题在顶部 -->
  <div class="columns">                         <!-- 列容器 -->
    <div class="column">{{ column1 }}</div>
    <div class="column">{{ column2 }}</div>
  </div>
</div>
```

**错误示例（禁止）**：
```vue
<!-- ❌ 错误：标题嵌套在列内 -->
<div class="columns">
  <div class="column">
    <div class="title">{{ title }}</div>
    <div class="content">{{ content }}</div>
  </div>
</div>
```

#### 2. chart-with-legend 布局

当 section.layout = "chart-with-legend" 时：

**children 解析规则**：
- role="text" 且 name 是 section 名称 → section 标题
- role="chart" → 图表容器
- role="text" 且 name 不是系列名称 → 图表外的标注（如"建议分流"）
- **忽略** role="text" 且 name 是系列名称的元素（这些是图例，由 ECharts 渲染）

**生成结构**：
```vue
<div class="chart-section">
  <div class="section-title">{{ title }}</div>
  <div class="chart-container">
    <div ref="chartRef" class="chart-inner" />
  </div>
  <div class="annotation">{{ annotation }}</div>  <!-- 如果有 -->
</div>
```

## 4. figma 规则

### 必做

- 只在 preview 结构上精修，不推翻已经正确的主布局。
- 消费：
  - `figma-data.json`
  - `dom-figma-mapping.json`
  - `panel-schema.json`
  - 下载到 `resources/` 的资源
- 修正：
  - 字体、字号、字重、颜色
  - 背景图 / 图标资源引用
  - 面板头部插槽归属
  - 图表尺寸链路、tooltip、可见性
  - 内容区模块间距与对齐

### 禁止

- 推翻 preview 已经正确的块级结构
- 把头部圆点、分割线、标签条装饰泄漏到内容区
- 给子组件统一套白底、边框、阴影、圆角
- 生成设计图没有证据的额外业务交互

## 5. req-d 规则

- 只更新 `requirement.md` 中"微码组件设计"章节（任意层级标题、任意编号，例如 `## 微码组件设计`、`### 4.3.2.1 微码组件设计`、`##### 4.3.2.1.2 微码组件设计`，均视为同一章节）。
- 🔴 **就地增量合并**：脚本会把新输出的 events/statuses/businessConfig/cssVariableConfig 项与已有章节做并集合并，**已存在的同名 key 不会被覆盖/删除**。如需修改已有项，请在描述里明确说明。
- 🔴 **多模块文档**：如果业务自带 `##### 4.3.2.1.2 微码组件设计` / `##### 4.3.2.2.2 微码组件设计` 等多个章节，脚本按 `moduleNumber`（`4.3.2.1`、`4.3.2.2`）命中对应章节，其他章节原封不动。
- 禁止修改任何组件代码、样式或声明文件。
- 🔴 **禁止在设计段落中生成 `dataSources` 字段**：`dataSources` 由脚本在 req 阶段自动解析注入，req-d 只设计 businessEvents / businessStatuses / businessConfig / cssVariableConfig 四项。
- 如果接口调用需要可配置的 URL，应在 `businessConfig` 里设置接口参数（如 `apiEndpoint: ""`），**不要**引入 `dataSources` 对象。

## 6. req 规则

- 只实现 requirement 明确要求的接口、事件、状态、联动。
- 保留 preview / figma 已存在且正确的基础交互。
- 子组件通过 props / emit 传递交互，不直接操作全局运行时。

### 🔴 接口调用去重规则（CRITICAL — 避免同一接口被多个子组件重复调用）

**核心原则：同一个接口只应该在父组件（package/index.vue）中调用一次，子组件通过 provide/inject 获取数据。**

#### 问题背景

当多个子组件需要使用同一个接口数据时，AI 可能会在每个子组件中独立调用接口，导致：
- 页面刷新时接口被重复请求（如 `todayFlow` 被 3 个子组件各调用一次 → 请求 3 次）
- 服务器压力增加
- 数据不一致风险（各子组件可能拿到不同时刻的数据）

#### ✅ 正确做法（req 阶段必须生成以下代码）

**父组件（package/index.vue）统一调用接口：**
```javascript
// === 统一数据管理（避免子组件重复调用同一接口）===
const flowData = ref(null) // todayFlow 接口数据

const fetchFlowData = async () => {
  if (!componentApi) return
  try {
    const result = await componentApi.getCommonApiFindList(
      { sectionNum: config.value.sectionNum, type: 1 },
      'todayFlow'
    )
    flowData.value = result?.data?.items || []
    console.log('[父组件] todayFlow 数据获取成功')
  } catch (error) {
    console.error('[父组件] todayFlow 数据获取失败:', error)
  }
}

// 注入给子组件使用
provide('flowData', flowData)
provide('fetchFlowData', fetchFlowData)

onMounted(() => {
  fetchFlowData()  // ✅ 只调用一次
})
```

**子组件通过 inject 获取数据 + watch 监听变化：**
```javascript
// === 从父组件获取数据（不再独立调用接口）===
const flowData = inject('flowData', null)

// === 监听父组件数据变化，更新组件状态 ===
watch(
  () => flowData.value,
  (data) => {
    if (!data || !Array.isArray(data)) return
    // 处理数据...
    updateChart()
    console.log('[子组件] 数据已更新')
  },
  { immediate: true }
)
```

#### ❌ 禁止行为（req 阶段生成代码时禁止生成以下代码）

```javascript
// ❌ 禁止：多个子组件各自独立调用同一接口
// 子组件A
const fetchData = async () => {
  const result = await componentApi.getCommonApiFindList({}, 'todayFlow')
  // 处理数据...
}

// 子组件B（❌ 重复调用同一接口）
const fetchData = async () => {
  const result = await componentApi.getCommonApiFindList({}, 'todayFlow')
  // 处理数据...
}

// ❌ 禁止：子组件各自维护独立的刷新定时器
let refreshTimer = setInterval(() => fetchData(), 60000)
```

#### 检查清单（req 阶段生成代码前必须逐项确认）

1. **识别共用接口**：检查 requirement.md 的接口设计，找出哪些接口被多个模块使用
2. **统一调用位置**：共用接口必须在父组件（package/index.vue）中统一调用
3. **数据传递方式**：使用 `provide/inject` 传递数据，子组件通过 `watch` 监听
4. **刷新机制**：定时刷新只在父组件中维护，子组件自动响应数据变化
5. **例外情况**：不同路段/不同参数的接口调用（如隧道 `S23-JY` 和大桥 `S23-JQ` 分别调用）允许独立调用

#### 例外情况判断

| 场景 | 是否允许独立调用 | 原因 |
|------|----------------|------|
| 同一接口、同一参数、多个子组件使用 | ❌ 禁止 | 数据相同，应共享 |
| 同一接口、不同参数（如不同路段） | ✅ 允许 | 数据不同，需独立请求 |
| 不同接口 | ✅ 允许 | 无重复问题 |
| 子组件有独立的交互触发刷新（如切换 Tab） | ⚠️ 视情况 | 若触发的是同一接口，调用父组件的 fetchFlowData |

#### 示例：正确识别共用接口

**requirement.md 接口设计：**
```markdown
## 接口设计
### todayFlow
- 用途：当日流量数据（隧道 + 大桥）
- 使用模块：总流量统计、隧道柱状图、大桥柱状图
- 参数：sectionNum, type
```

**识别结果：**
- `todayFlow` 被 **3 个模块** 使用 → **共用接口，必须统一调用**
- 参数相同（type=1），只是数据解析方式不同 → 父组件统一获取后，子组件各取所需

**生成代码策略：**
- 父组件：调用一次 `todayFlow`，存储完整数据
- TotalTraffic：从 `flowData` 取 `items[0].dailyTotalFlow` 和 `items[1].dailyTotalFlow`
- TunnelBarChart：从 `flowData` 取 `items[0].trendList`
- BridgeBarChart：从 `flowData` 取 `items[1].trendList`

## 7. req-s 规则

- 新增配置项必须在运行时代码里真正被消费。
- 不允许只改 `declare.json` / `declare.js` 而不改组件逻辑。
- 不得为接入配置而破坏既有布局结构。

## 8. 图表专项规则

- **使用 echarts.init() 初始化图表**（`<div ref="chartRef" class="chart-container" />` + `echarts.init(chartRef.value)`）
- **必须搭配** ResizeObserver 等待容器就绪 + `watch(chartRef)` 处理 base-panel DOM 替换 + `onUnmounted` 中 dispose
- `$mcComponentBuilder()` 必须 try-catch 保护
- `updateChart()` 通过 `chart.setOption(option, true)` 更新图表
- 必须保留 `option.tooltip`。
- 禁止写 `tooltip: { show: false }`。
- 坐标系图默认 `tooltip.trigger = 'axis'`。
- 饼图 / 散点 / 仪表盘等默认 `tooltip.trigger = 'item'`。
- 如果分析或设计里已有 tooltip 样式证据，按证据还原；否则保留 ECharts 默认交互 tooltip。
- 禁止通过 `dispatchAction({ type: 'showTip' })` 让 tooltip 常驻，除非需求明确要求。

## 9. 面板类组件专项规则

- `base-panel` 头部插槽只承载标题区内容。
- `title-left`、`header-right`、`close` 等插槽优先由头部结构决定，不从内容区"借元素"。
- 面板头部分界装饰只允许出现在头部，不得泄漏到内容区。
- 当识别到 tab / 切换器在头部时，应视为面板头部或标题行控件，不是内容卡片。
- 🔴 **面板根节点直接子元素的 `bg`、`bg-[m]`、`header-` 节点由微码面板框架处理，组件代码禁止生成**：
  - ❌ 不要把根节点背景图挂到内容区根容器
  - ❌ 不要在内容区重复渲染面板头部装饰
  - ✅ 只处理 `slot-xxx` 容器内的背景图和图标资源
- 🔴 **根容器样式规则**：`.c-{组件名}` 只允许 `width/height/display/flex-direction/box-sizing`，禁止添加 `padding`、`gap`、`background`、`background-color`、`box-shadow`
  - 原因：`pannel-content` 框架已有 `padding: 5px 10px`，`component-box` 框架已有背景色和阴影，组件重复添加会叠加
- 🔴 **背景图与图标用法区分**（figma 阶段）：
  - `resources/images/` 的背景图 → 必须用 `background-image: url(...)` 挂到容器，去掉该容器的 CSS `border`/`background`/`background-color`
  - `resources/icons/` 的图标 → 必须用 `<img :src="...">` 显示，禁止用 `background-image`
  - ❌ 禁止把背景图当 `<img>` 显示，也禁止把图标当背景图铺满

## 10. 输出给 frontend-mc-leader 的反馈格式

```markdown
# frontend-mc-developer 执行反馈
- 组件：`<name>`
- 阶段：`<stage>`
- 结果：`done / checkpoint / blocked`
- 修改文件：`...`
- 关键产物：`...`
- 建议下一阶段：`...`
- 风险：`...`
```

## 11. 产物状态追踪

### 目标
确保 reviewer 审查时能准确判断产物是否在审查后被修改。

### 实现方式
每次修改文件后，更新 `.mc-gen/env.json` 的 `stateFingerprint` 字段：

```json
{
  "stateFingerprint": {
    "stage": "preview",
    "timestamp": "2026-05-08T15:30:00.000Z",
    "files": {
      "package/index.vue": { "size": 2048, "lines": 85 },
      "resources/styles/c-lljc.less": { "size": 1024, "lines": 45 }
    }
  }
}
```

### 追踪规则
- 只追踪当前阶段修改的文件
- 记录文件大小（字节）和行数
- 记录修改时间戳
- 不需要计算哈希（保持轻量）

### developer 执行后必须更新
修改文件后，在反馈中说明：
```
✓ 已更新 stateFingerprint
  - package/index.vue: 1856 bytes, 78 lines
  - resources/styles/c-lljc.less: 945 bytes, 42 lines
  - 时间戳: 2026-05-08T15:30:00.000Z
```

## 12. 修改类型识别（能耗优化）

### 目标
识别修改类型，便于 reviewer 差异化检查，降低能耗。

### 修改类型定义

| 类型 | 标识 | 说明 | 检查深度 |
|------|------|------|---------|
| 样式微调 | style-tweak | 颜色、间距、字号微调 | quick |
| 配置更新 | config-update | declare.json、注释更新 | medium |
| 结构变更 | structure-change | DOM结构、布局改动 | full |
| 功能新增 | feature-add | 新增交互、事件、状态 | full |

### 识别规则

**样式微调**（符合任一条件）：
- 只修改 `.less` 文件
- 修改行数 ≤ 10 行
- 只涉及颜色、间距、字号

**配置更新**（符合任一条件）：
- 只修改 `declare.json` 或 `declare.js`
- 只修改注释或 describe 字段

**结构变更**（符合任一条件）：
- 修改 `.vue` 文件的 template 部分
- 修改布局相关的 flex/grid 属性

**功能新增**（符合任一条件）：
- 新增方法、状态、事件
- 修改业务逻辑

### 影响范围判断

| 修改类型 | 影响范围 | 需要回归 |
|---------|---------|---------|
| style-tweak | 局部 | ❌ 否 |
| config-update | 中等 | ⚠️ 轻量 |
| structure-change | 全局 | ✅ 是 |
| feature-add | 全局 | ✅ 是 |

### 反馈格式扩展

```markdown
# frontend-mc-developer 执行反馈
- 组件：`c-lljc`
- 阶段：`preview`
- 结果：`done`
- 修改类型：`style-tweak`
- 修改文件：`resources/styles/c-lljc.less`
- 修改行数：3
- 影响范围：局部
- 建议检查深度：`quick`
- 修改文件：...
- 关键产物：...
- 建议下一阶段：...
- 风险：...
```
