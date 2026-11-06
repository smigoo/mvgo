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

## 8. 图表专项规则

- **使用 echarts.init() 初始化图表**（`<div ref="chartRef" class="chart-container" />` + `echarts.init(chartRef.value)`）
- **必须搭配** ResizeObserver 等待容器就绪 + `watch(chartRef)` 处理 base-panel DOM 替换 + `onUnmounted` 中 dispose
- `$mcComponentBuilder()` 直接解构（`const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()`，声明+赋值一体，禁止 let + try-catch 分离）
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

