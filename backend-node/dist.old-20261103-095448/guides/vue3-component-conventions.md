# Vue3 组件约束规范

> 适用于 `mc-component-graph-vue3.js` 工作流生成的标准 Vue3 SFC 组件  
> 与微码组件（`mc-component-graph-phase2.js`）完全分离，两套体系互不干扰

---

## 1. SFC 结构要求

每个组件必须是标准 Vue3 单文件组件，包含以下三部分：

```vue
<template>
  <!-- 真实 DOM，禁止微码标签 -->
</template>

<script setup>
// Vue3 Composition API
</script>

<style lang="less" scoped>
/* 样式必须 scoped */
</style>
```

| 要求 | 说明 |
|------|------|
| `<template>` | 必须有且仅有一个根元素（可用 `<div>` 包裹） |
| `<script setup>` | 优先使用 `<script setup>`，也支持 `<script>` + `setup()` |
| `<style scoped>` | 必须包含，`lang="less"` 可选 |
| 独立可用 | 组件必须自包含，不依赖外部微码运行时 |

---

## 2. 禁止的微码专有内容（微码污染）

以下任何内容出现在 Vue3 组件中都属于**严重违规**（severity: high, category: compliance）：

| 禁止项 | 说明 | 正确替代方案 |
|--------|------|-------------|
| `<base-panel>` | 微码专有容器标签 | 使用标准 `<div>` + CSS 实现面板样式 |
| `$mcComponentBuilder()` | 微码运行时 API | 使用 Vue3 `ref()` / `reactive()` / `computed()` |
| `panelKey` | 微码面板标识符 | 使用 Vue3 `props` 传递数据 |
| `declare.json` | 微码组件声明文件 | Vue3 不需要，使用 `defineProps()` / `defineEmits()` |
| `component.js` | 微码组件入口文件 | Vue3 组件自身就是入口 |
| `#header-right` / `#header-left` 等插槽 | 微码专属插槽名称 | 直接在 `<template>` 中渲染头部内容 |
| `resources/styles/` | 微码样式目录结构 | 使用 `<style scoped>` 内联样式 |
| `@mvgo/microcode` | 微码包引用 | Vue3 组件不依赖此包 |

---

## 3. 面板头部区域

Vue3 组件的面板头部必须是**真实 DOM 渲染**，不使用插槽机制：

```vue
<template>
  <div class="panel">
    <!-- ✅ 正确：头部直接写在模板中 -->
    <div class="panel-header">
      <h3 class="panel-title">标题</h3>
      <div class="panel-header-actions">
        <button class="btn">操作</button>
        <span class="tag">标签</span>
      </div>
    </div>
    <div class="panel-body">
      <!-- 内容区 -->
    </div>
  </div>
</template>

<style lang="less" scoped>
.panel {
  display: flex;
  flex-direction: column;
  
  &-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
  }
  
  &-body {
    flex: 1;
    padding: 16px;
  }
}
</style>
```

---

## 4. 可访问性要求

| 检查项 | 要求 |
|--------|------|
| `aria-label` | 交互元素必须有语义化标签 |
| `alt` 文本 | 所有 `<img>` 必须有 `alt` 属性 |
| 按钮语义 | 使用 `<button>` 而非 `<div @click>` |
| 键盘导航 | Tab 顺序合理，焦点可见 |

---

## 5. 性能要求

### 图表初始化

```vue
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const chartRef = ref(null)
let chartInstance = null

onMounted(() => {
  // 使用 ResizeObserver 等待容器就绪
  const observer = new ResizeObserver(() => {
    chartInstance?.resize()
  })
  observer.observe(chartRef.value)
  
  chartInstance = echarts.init(chartRef.value)
  chartInstance.setOption({ /* ... */ })
})

onUnmounted(() => {
  // 必须清理，防止内存泄漏
  chartInstance?.dispose()
})
</script>

<template>
  <!-- 容器必须有明确的宽高 -->
  <div ref="chartRef" style="width: 100%; height: 300px;"></div>
</template>
```

### 其他性能规范

- 大列表使用 `v-for` + `:key`，考虑虚拟滚动
- 避免在模板中使用复杂表达式，使用 `computed`
- 响应式数据使用 `ref()` / `reactive()` / `computed()`

### 🔴 数据变量声明硬规则（API 绑定兼容）

所有**需要接收外部 API 数据**的变量（即数据槽位对应变量），**必须使用 `ref()` 或 `reactive()` 声明**，禁止直接使用裸数组/对象字面量，更禁止使用 `computed()`。

| 变量类型 | 正确写法 | 错误写法 | 原因 |
|---|---|---|---|
| **数据槽位**（表格、列表、表单、统计等需要绑 API 的数据） | `const tableData = ref([])` | `const tableData = []` | 裸字面量无法注入新数据 |
| **数据槽位** | `const detailList = ref([])` | `const detailList = computed(...)` | computed 是只读的，API 无法改写 |
| **派生值**（基于已有数据计算） | `const total = computed(() => list.value.length)` | — | computed 仅用于派生，不作为 API 目标 |

> **强制约束**：生成代码时，任何在模板中被 `v-for` / 数据绑定使用、且预期接收 API 数据的变量，声明形式必须是 `const xxx = ref(...)` 或 `const xxx = reactive(...)`。`computed()` 只能用于已有数据的二次计算。

---

## 6. 代码质量要求

| 规范 | 说明 |
|------|------|
| Composition API | 优先使用 `<script setup>` + `ref()` / `reactive()` / `computed()` |
| 命名清晰 | 变量、函数、组件名语义化 |
| 注释充分 | 复杂逻辑必须注释 |
| 无冗余代码 | 删除未使用的 import、变量、函数 |
| Props 定义 | 使用 `defineProps()` 明确类型 |
| Emits 定义 | 使用 `defineEmits()` 声明事件 |

---

## 7. 样式规范

| 规范 | 说明 |
|------|------|
| `scoped` | 必须使用 `<style scoped>` |
| 无内联 style | 禁止静态 `style="..."` 属性 |
| 语义化类名 | 使用 BEM 或模块前缀，如 `.panel-header-title` |
| Flexbox/Grid | 布局优先使用 Flexbox 或 Grid |
| LESS 变量 | 可复用颜色/间距定义为 LESS 变量 |

---

## 8. 与微码组件的对比

| 维度 | Vue3 组件 | 微码组件 |
|------|----------|---------|
| 容器 | `<div>` + CSS | `<base-panel>` |
| 运行时 | Vue3 原生 | `$mcComponentBuilder()` |
| 配置 | `defineProps()` | `declare.json` |
| 头部 | 真实 DOM 渲染 | 插槽（`#header-right` 等） |
| 样式 | `<style scoped>` | `resources/styles/` |
| 工作流 | `mc-component-graph-vue3.js` | `mc-component-graph-phase2.js` |
| 对抗性检查 | Vue3 专属 prompt + 微码污染检测 | 微码专属 prompt + slot/base-panel 检查 |

---

## 9. AdversarialChecker 集成

Vue3 组件在对抗性检查阶段的处理：

- **Prompt 分支**：`componentType === 'vue3'` 时使用 `_buildVue3CheckPrompt()`
- **程序化检查**：
  - ✅ `_checkMicrocodePollution()` — 检测 8 种微码污染模式
  - ❌ 跳过 `_checkSlotUsage()` — 微码专属
  - ❌ 跳过 `_checkBasePanelChromeLeakage()` — 微码专属
- **调用处**：`mc-component-graph-vue3.js` 的 `checker.execute()` 传递 `componentType: 'vue3'`
