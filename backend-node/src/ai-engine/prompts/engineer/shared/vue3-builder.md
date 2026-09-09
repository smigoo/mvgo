## 3.1️⃣ Vue3 组件脚本范式（必须）

⚠️ **本组件是标准 Vue3 SFC，不使用任何微码运行时 API**：

❌ **绝对禁止（vue3 环境未注入这些全局变量，引用即渲染崩溃）**：
- ❌ `$mcComponentBuilder` / `componentProps` / `businessProps` / `runtimeBuilder` / `componentApi`
- ❌ `runtimeBuilder.publishEvent()` / `eventBus`
- ❌ `<base-panel>` 宿主标签（vue3 需真实还原面板外壳：背景/边框/圆角/阴影自己写）
- ❌ **面板标题元素**（预览/宿主外壳已渲染面板标题与关闭按钮）：组件内**禁止**生成标题文字元素（如 Figma header 区的标题 TEXT「环境监测」/「流量监测」等）。
      外壳自绘范围仅限：背景图/底色、边框、圆角、阴影；header 区只生成**右侧控件**（统计指标/Tab/图标），标题文字与左侧装饰留给外壳
- ❌ declare.json / component.js（系统不消费）

✅ **标准 Vue3 写法**：
```vue
<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'   // 仅在确实需要时

// 组件配置：用 defineProps 接收（代替微码的 componentProps）
const props = defineProps({
  title: { type: String, default: '流量监测' },
  refreshInterval: { type: Number, default: 30000 },
})

// 对外事件：defineEmits
const emit = defineEmits(['refreshed', 'error'])

// 响应式状态
const summary = ref(null)
const loading = ref(false)

// 生命周期
onMounted(() => {
  loadSummaryData()
})
onBeforeUnmount(() => {
  /* 清理定时器 / echarts dispose / ResizeObserver disconnect */
})
</script>
```

**规则**：
1. 数据获取直接用 `fetch` / 全局挂载的请求工具；没有微码 componentApi
2. 定时刷新自己管理 `setInterval`，并在 `onBeforeUnmount` 清理
3. 图表：`echarts.init(chartRef.value)` + `ResizeObserver` 自适应 + `onBeforeUnmount` 中 `dispose()`
4. 样式 class 使用 `.c-{{COMPONENT_NAME}}-` 语义前缀（如 `.c-{{COMPONENT_NAME}}-root`）

## 3.2️⃣ 布局防挤压铁律（flex 压扁是最高频失真，必须遵守）

组件按 Figma 原始宽高渲染，内部布局**禁止被压缩变形**：

1. **横向 flex 容器内的文本子项**（Tab 项/按钮/标签）：必须 `white-space: nowrap; flex-shrink: 0;`
   —— 缺 `flex-shrink: 0` 时窄容器会把文字挤压换行（「一氧化碳」变「一氧化/碳」）
2. **图标按钮**：`width/height` 显式设定 + `flex-shrink: 0`，**禁止在图标旁臆造文字标签**（设计稿图标区无文字就生成纯图标）
3. **echarts 图表容器**：必须显式 `min-height`（按 Figma 图表区实际高度，一般 ≥ 80px）+ `flex: 1`
   —— 缺 min-height 时被兄弟元素挤压到 ~10px，折线图视觉变形
4. **横向分区**（如 Tab 区 + 右侧图标区）：Tab 区 `flex: 1; min-width: 0`，图标区 `flex-shrink: 0`
5. Tab 项宽度按内容均分：`flex: 1` + `text-align: center`（每项等宽，不逐项设固定 px）

## 4️⃣ 样式文件结构（index.less 必须完整）

✅ **必须生成的文件**（核心样式，由你输出）：
```
resources/styles/
├── common.less      (所有业务样式，使用 .c-{{COMPONENT_NAME}}- 前缀)
└── themes/theme-vars.less   (主题变量：.common() .theme-dark() .theme-light())
```

✅ **自动生成文件**（固定模板，你不要输出）：
```
resources/styles/
├── index.less       (入口：仅导入 theme-vars.less / dark.less / light.less，禁止顶层导入 common.less)
├── themes/dark.less (固定模板：&.dark { .common(); .theme-dark(); @import (multiple) '../common.less'; })
└── themes/light.less (固定模板：&.light { .common(); .theme-light(); @import (multiple) '../common.less'; })
```

**index.less 最终由系统生成，你不要输出它。**

**package/index.vue 必须包含**：
```vue
<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
```
