## 3.1️⃣ $mcComponentBuilder 调用（必须）

⚠️ **API 返回值结构**：
```javascript
{
  componentId,          // 组件id
  componentDeclareInfo, // 组件声明信息
  runtimeBuilder,       // ← 事件总线（不是 eventBus！）
  componentProps,       // 组件配置
  businessProps,        // 组件业务传参
  componentApi,         // API 请求方法
}
```

✅ **唯一标准写法（直接解构，声明+赋值一体，只能调用一次）**：
```vue
<script setup>
import { onMounted } from 'vue'

// 1. 一次调用 $mcComponentBuilder 并直接解构（const 解构=声明+赋值一体，杜绝 TDZ）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 2. 在 onMounted 中触发 onload 事件
onMounted(() => {
  runtimeBuilder.publishEvent('{{COMPONENT_NAME}}-onload', {
    componentId: '{{COMPONENT_NAME}}',
    timestamp: Date.now()
  })
})
</script>
```

❌ **绝对禁止**：
- ❌ 使用 `eventBus` 解构：`const { eventBus } = ...`（API 中不存在此属性）
- ❌ 调用 `eventBus.emit()`（正确的是 `runtimeBuilder.publishEvent()`）
- ❌ 用 `let runtimeBuilder = null` + `try { runtimeBuilder = ... } catch` 分离声明与赋值（会产生「声明前赋值」的 TDZ 运行时错误 `Cannot access before initialization`）
- ❌ 用 `typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null` 的属性访问链（直接解构即可，`$mcComponentBuilder` 在微码/预览环境均已全局注入）
- ❌ 多次调用 `$mcComponentBuilder()`（只能调用一次）
- ❌ 缺少 onload 事件触发

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
├── index.less       (入口：@import theme-vars.less → 根作用域 .common() + .theme-{dark|light}() → @import (multiple) './common.less')
├── themes/dark.less (覆盖层，仅宿主注入 .dark 类时生效)
└── themes/light.less (覆盖层，仅宿主注入 .light 类时生效)
```

**index.less 最终由系统生成，你不要输出它。**

⚠️ **common.less 必须写在文件根层**：所有 `.c-` 业务 class 直接顶格写，
**禁止**用 `.dark {}` / `.light {}` / 组件根 class 等任何外层选择器包裹。
宿主 base-panel 不会给组件根加 `.dark`/`.light` 类，一旦包裹就会编译成
`.dark .c-xxx`，在真实 DOM 上 0 命中 → 背景/边框/圆角/图标尺寸/内部布局**全部失效**。

**package/index.vue 必须包含**：
```vue
<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
```

❌ **绝对禁止**：
- 使用组件名命名的样式文件（如 c-xxx-component.less）
- 子组件添加无 scoped 的裸 <style> 块（子组件 style 可选：允许不写，但若有必须 <style lang="less" scoped> + @import '../../resources/styles/index.less'）

## 3.2️⃣ 布局防挤压铁律（flex 压扁是最高频失真，必须遵守）

组件按 Figma 原始宽高渲染，内部布局**禁止被压缩变形**：

1. **横向 flex 容器内的文本子项**（Tab 项/按钮/标签）：必须 `white-space: nowrap; flex-shrink: 0;`
   —— 缺 `flex-shrink: 0` 时窄容器会把文字挤压换行（「一氧化碳」变「一氧化/碳」）
2. **图标按钮**：`width/height` 显式设定 + `flex-shrink: 0`，**禁止在图标旁臆造文字标签**（设计稿图标区无文字就生成纯图标，如视图切换按钮不要写「柱状图视图」「列表视图」文字）
3. **echarts 图表容器**：必须显式 `min-height`（按 Figma 图表区实际高度，一般 ≥ 80px）+ `flex: 1`
   —— 缺 min-height 时被兄弟元素挤压到 ~10px，折线图视觉变形
4. **横向分区**（如 Tab 区 + 右侧图标区）：Tab 区 `flex: 1; min-width: 0`，图标区 `flex-shrink: 0`
5. Tab 项宽度按内容均分：`flex: 1` + `text-align: center`（每项等宽，不逐项设固定 px）

## 3.3️⃣ 图标资源分档（禁止臆造 SVG，但 vector 节点允许手绘）

1. **Figma 提供了该图标的图片资源**（资源清单里存在对应 icon 变量）→ **必须**引用该资源（`<img :src="iconX">`），**禁止**手写 `<svg>`/`<canvas>`。
2. **Figma 该图标是 vector 节点、未导出图片资源**（资源清单里无对应项）→ 允许手写 `<svg>` 或用 CSS 实现，但**尺寸/颜色必须取自 Figma 真值**，不得臆造形状或配色。
3. 禁止用 `<canvas>` 手绘任何图标/图表（图表必须用 echarts）。
