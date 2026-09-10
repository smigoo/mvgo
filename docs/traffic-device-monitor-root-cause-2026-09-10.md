# 流量监测与设备监测最新问题根因审计

日期：2026-09-10

样本：

- traffic 任务：`mc-max-1789002090192-f98f73ce`
- traffic 组件：`c-traffic-monitor-kccduf83-f98f73ce`
- device 组件：`c-device-monitor-dq3a4bj3-8014324d`
- 依据：最新生成产物、`.checkpoint/visual.json`、`.checkpoint/analysis.json`、`.mc-gen/resource-dom-mapping.json`、宿主 `base-panel/default-panel` 源码

> 本文只记录根因和后续治本边界，不修改当前生成产物，不通过手工 CSS 补丁掩盖管线缺陷。

## 1. 结论先行

此前将所有现象归因于 `headerSlots` 推断错误是不完整的。最新证据表明，问题由四条相互关联但可独立阻断的链路组成：

1. **资源语义与 DOM 位置脱节**：同一个资源文件被按变量编号复用到不同业务区域；`icon1` 的真实 Figma 归属是当日总流量标题图标，却被产物同时当作标题图标和中央车辆图标。
2. **结构契约与产物装配脱节**：traffic 的视觉分析已经识别出两个 `chartType: "bar"`，但代码生成后把 ECharts 的 `series.type` 写成中文业务描述 `"分组柱状图"`；device 的 `header-stats`、主体区和左侧 tab 虽然部分出现在产物中，但没有由统一结构契约控制父子装配。
3. **高度预算与宿主布局模型不一致**：多个根/子容器采用 `flex: ... 1 0`、`min-height: 0`，但宿主内容区是 block 定高而不是 flex 子项分配上下文，导致 header 和 main 的 flex basis 同时退化为 0。
4. **样式类名和视觉语义双重漂移**：组件 scoped style 使用短类名，中央 `common.less` 使用带组件前缀的长类名；同时生成器把设计资源重复挂在内外层，并为没有证据的 group 节点添加渐变、边框和圆角。

因此，不能只修 `headerSlots`、只给图表加固定高度，或只删除当前产物中的一条 CSS。应在 Manifest、结构规划、装配和门禁层建立单一事实源。

## 2. Traffic 最新问题

### 2.1 `daily-center-icon` 出现标题小图标

#### 现象

中央车辆图标区域出现了一个本应位于“当日总流量”标题左侧的小图标；标题和中央区域使用了相同资源，布局语义错误。

#### 产物证据

`package/components/DailyTotalTraffic.vue`：

- 第 6 行：标题区域使用 `<img :src="icon1" ...>`。
- 第 37 行：中央区域再次使用 `<img :src="icon1" ...>`。
- 第 50 行：`icon1` 导入 `../../resources/images/icon-3561.png`。
- 第 102-106 行：标题图标被定义为 18×18。
- 第 226 行以后：中央图标又被定义为独立的 70×70 容器和 48×48 图片。

`.mc-gen/resource-dom-mapping.json` 的对应事实：

- `icon-3561.png` / `figmaNodeId: 2:3561`
- `figmaPath: cp-流量监测/slot-当日总流量/sub-header/标题/icon`
- `assignedVarName: icon1`
- `downloadStatus: success`

这说明 `icon1` 的资源归属是标题图标，不是中央车辆图标。中央区域复用 `icon1` 不是浏览器布局偶发现象，而是资源归属契约在组件生成时被错误扩展。

#### 根因分层

- **L3 资源归属**：变量编号没有携带唯一的 `figmaNodeId` / `figmaPath` 业务归属，子组件可把标题资源当作中央内容资源。
- **L4 代码生成**：模型根据“中央车辆图标”语义臆造复用，而不是只消费对应节点的资源契约。
- **L5 写盘装配**：没有在写盘前验证同一 `figmaNodeId` 是否被放入两个不相交的业务区域。
- **headerSlots 不是唯一根因**：当前 `visual.json` 顶层确实有 `title-left` 及多个 `header-right` 候选，但最终 `DailyTotalTraffic.vue` 的错误复用已经发生在子组件自身，不能通过删一个插槽候选解决。

#### 治本边界

- Resource Manifest 必须将资源绑定为 `figmaNodeId -> ownerBlockId -> semanticRole -> allowedTarget`，变量名只是渲染别名，不能作为资源事实源。
- 每个资源节点必须有唯一消费位置；同一资源只能在有明确 `deduplicatedFrom` / `sharedResource` 契约时复用。
- 写盘前做跨区几何和 owner 校验：标题节点不得进入内容区，内容区节点不得进入 `title-left` / `header-right`。
- 不能通过给中央图标换一个编号、在当前 `.vue` 里手工替换图片，或新增一个“中央图标专用 CSS”收尾。

### 2.2 两张柱状图不显示

#### 现象

隧道小时流量图和大桥小时流量图的图表区域空白。

#### 阻断点 A：ECharts 类型非法

视觉分析已经给出正确真值：

- `visual.json` 的 `hourly-flow-tunnel.body.children[0].chartType` 为 `bar`。
- `visual.json` 的 `hourly-flow-bridge.body.children[0].chartType` 为 `bar`。

但产物中：

- `package/components/TunnelHourlyChart.vue:159`：`type: '分组柱状图'`
- `package/components/TunnelHourlyChart.vue:185`：`type: '分组柱状图'`
- `package/components/BridgeHourlyChart.vue:135`：`type: '分组柱状图'`
- `package/components/BridgeHourlyChart.vue:157`：`type: '分组柱状图'`

ECharts 的 `series.type` 必须是注册的技术类型，例如 `bar`；“分组柱状图”是业务描述，不是 ECharts series 类型。该错误独立于 CSS 高度，即使把容器高度改成 120px，系列仍不能按预期渲染。

#### 阻断点 B：高度分配链不稳定

当前结构为：

```text
base-panel
└─ traffic root
   ├─ DailyTotalTraffic
   ├─ TunnelHourlyChart
   ├─ BridgeHourlyChart
   ├─ VehicleTypeDistribution
   └─ FlowPrediction
```

产物证据：

- `package/index.vue:3` 的根节点是 `.c-traffic-monitor-kccduf83-c-traffic-monitor-root`。
- `resources/styles/common.less:7-12` 只给根节点 `height: 100%` 和 column flex。
- `resources/styles/common.less:29-32` 将所有 chart section 写成 `flex: 1 1 0; min-height: 0`。
- `TunnelHourlyChart.vue:247-249` 和 `BridgeHourlyChart.vue:216-218` 又将子组件写成 `flex: 0.978 1 0; min-height: 0`。
- 两个图表内部的 `chart-wrap` / `chart` 依赖 `flex: 1 1 0` + `height: 100%`。

这种链路要求每一级父节点都获得一个真实的可分配高度。若宿主或外层 section 未形成有效的 flex 分配上下文，`flex-basis: 0` 与 `min-height: 0` 会让图表容器得到 0 高度，`initChart()` 只能持续等待 ResizeObserver 的正尺寸。

#### 阻断点 C：类名命中不一致

- `TunnelHourlyChart.vue:245` 使用短类名 `.c-traffic-monitor-tunnel-hourly`。
- `resources/styles/common.less:205` 使用带实例前缀的 `.c-traffic-monitor-kccduf83-c-traffic-monitor-tunnel-hourly`。
- `TunnelHourlyChart.vue:335-340` 的短类名 scoped 样式虽然声明了 `height: 100%`，但其父级高度仍依赖短/长类名两套规则的共同命中。
- 中央样式不是由统一 token 生成，造成“DOM 存在、规则存在、但规则不命中对应 DOM”的结构性断裂。

#### 结论

图表空白不是一个问题：

1. **代码合法性阻断**：series type 从真值 `bar` 漂移成非法中文字符串。
2. **运行时尺寸阻断**：chart 容器高度依赖不稳定的多层 `flex-basis: 0` 链。
3. **样式作用域阻断**：scoped 短类名与 common.less 长类名不是同一 token 源。

三者必须分别在图表类型门禁、尺寸装配和类名生成器层解决，不能只给 `.chart` 增加固定 `height`。

### 2.3 车型分布被臆造成环形图

`visual.json` 的审查结果仍然包含“车型分布嵌套过深”等结构警告，但最新产物 `VehicleTypeDistribution.vue:21-52` 生成了四个 ECharts donut，并在 `:122` 使用 `type: 'pie'`。

这不是本轮用户反馈的单一显示故障，而是同一条“视觉真值未形成不可变结构契约”的证据：

- Figma 真值描述为两张数字卡（客车/货车）和图标，不是四个 donut。
- `analysis.json` 的 review 只指出结构复杂度和字段不一致，没有把“Figma 无 pie 图但产物生成 pie”升级为阻断。
- 生成器允许模型用“车型分布”语义补全常见图表模板。

治本要求 `chartType` 由 Figma/Manifest 真值驱动；无 `pie` 真值时，`pie` 代码必须在装配或门禁阶段被拒绝。

## 3. Device 最新问题

### 3.1 `header-stats` 与 `slot-con-main` 高度变成 0

#### 现象

当前样本中，用户手动设置 CSS 高度后才看到内容；不设置时：

- `c-device-monitor-dq3a4bj3-c-device-monitor-slot-con-header-stats` 高度为 0。
- `c-device-monitor-slot-con-main` 高度为 0。

#### 宿主布局证据

`frontend/src/components/@mv-business-panels/aio-light-panel/index.vue`：

- 第 35-39 行：`.pannel` 是 column flex，且高度 100%。
- 第 60-64 行：`.pannel-content` 只有 `height: calc(100% - 38px)`，没有 `display: flex`。

`frontend/src/components/base-components/base-panel/index.vue:152-155` 的 `.mc-base-panel-wrapper` 也只声明 width/height 100%，不改变内容区的 block 布局事实。

因此，组件根虽然可以拿到 100% 的外部高度，但它不是一个由宿主作为 flex item 分配剩余高度的子项。生成产物内部却继续依赖 flex item 分配。

#### 产物证据

`package/index.vue`：

- 第 5-8 行：`.c-device-monitor-slot-con` 内部直接排列 `<HeaderStats />` 与 `<MainLayout />`。
- 第 31-38 行：根内部容器使用 `flex: 1 1 0`、`display: flex`、`flex-direction: column`、`min-height: 0`。

`HeaderStats.vue:26-35`：

- 使用 `.c-device-monitor-slot-con-header-stats`。
- 使用 `flex: 0.339 1 0`、`min-height: 0`、`width: 100%`。
- 没有确定的高度或由结构 Manifest 写出的 header 尺寸。

`MainLayout.vue:199`：

- 使用 `.c-device-monitor-slot-con-main`。
- 使用 `flex: 1.661 1 0`、`min-height: 0`。

当根容器没有获得有效可分配高度，或父子 class 规则没有一致命中时，两个子项的 basis 都为 0，最终出现 header/main 同时坍塌。手动设置 CSS 高度只是绕过了尺寸分配缺陷，不是修复。

#### 额外的类名错位

- `HeaderStats.vue:2` 使用长类名 `c-device-monitor-dq3a4bj3-c-device-monitor-slot-con-header-stats`，但 `HeaderStats.vue:26` 的 scoped 规则使用短类名 `c-device-monitor-slot-con-header-stats`。
- `MainLayout.vue:2` 使用短类名 `c-device-monitor-slot-con-main`，而 common.less 同时存在长类名规则和短类名重复规则（`common.less:115-122`、`503-510`）。
- `package/index.vue:41` 还定义了一个 `.c-device-monitor-header-stats` 规则，但该类并未作为 HeaderStats 根节点使用。

这不是单纯的“少写一个高度”，而是 class token 没有单一生成器，导致尺寸规则分散且不能证明实际命中。

### 3.2 头部插槽没有识别/没有放到正确位置

当前 device 的视觉分析并不是空的：

- `visual.json` 顶层 `headerSlots` 有设备类型、设备总数、完好率三个 `header-right` 统计项。
- `layout.sections[0]` 的 `headerRelation` 为 `title-same-row`，`slotCandidate` 为 `header-right`。
- `layout.sections[1]` 的主体是 317px 高的左侧 Tab + 右侧内容区。

但是同一份分析还将 `section-main-layout` 作为普通内容 section，并且顶层仍追加了 `header`、`@antd/tab` 等 header 候选。现有契约回写函数 `backend-node/src/ai-engine/utils/header-slot-contract.js:24-55` 只能做候选去重/rejected 过滤，不能把“头部统计”和“主体左侧 tab”强制变成互斥的结构块。

此外，当前 device 产物的 `index.vue` 直接把 `<HeaderStats />` 放在组件内容区，而不是通过 base-panel 的 `header-right` 插槽传递：

- `package/index.vue:5-8`：HeaderStats 与 MainLayout 都在 `.slot-con` 内部。
- base-panel 的真实具名插槽来自 `frontend/src/components/base-components/base-panel/index.vue:22-24`，名称是 `title-left`、`title-right`、`header-right`、`close`。

因此“头部没有识别上去”包含两个层次：

1. **结构归属错误**：header stats 仍作为内部 section 渲染。
2. **契约装配错误**：没有将 `headerSlots` 直接装配到宿主具名插槽，或没有明确声明 device 是“内部标题栏”还是“宿主 header-right”两者之一。

必须先确定且固化唯一归属，不能通过同时保留两份 DOM 再用 CSS 隐藏一份。

### 3.3 default 卡片背景重复、边框不应存在

`MainLayout.vue:45-64`：

- 外层 `.c-device-monitor-default` 在第 46 行绑定 `bg2`。
- 内层 `.c-device-monitor-default-bg` 在第 47 行再次绑定 `bg2`。
- `resources/styles/common.less:260-262` 又给内层添加纯 CSS 渐变。
- `resources/styles/common.less:331-334` 再添加 `background: rgba(...)` 和 `border: 1px solid ...`。

结果是同一设计背景同时出现在外层和内层，并叠加一个没有 Figma 证据的 CSS 背景/边框，所以出现“default 和内部都设置了背景”和“不应该有的边框”。

根因是 `backgroundBlock` 资源没有唯一 mount target，装配器也没有禁止同一背景资源在父子容器重复消费。治本应由 Manifest 写出：

```text
bg-8807 -> ownerBlockId=slot-con/switch/default -> mountTarget=default-card
```

然后由装配器选择唯一承载元素；若 Figma 节点本身已经是图片背景，不得再生成 CSS 渐变和边框替代它。

### 3.4 `group-xxx` 背景、边框和内部布局未还原

#### 证据

资源映射将 `bg-8439.png` 归属到：

- `cp-设备监测/slot-con/@antd/tab/cons/Group 2136637321/bg`
- Figma 尺寸约 117×64
- `assignedVarName` 在多个资源条目中被复用/展开

产物结构：

- `MainLayout.vue:68-82` 用 `v-for` 生成所有设备 group。
- 第 72 行使用 `.c-device-monitor-group-2136637321`。
- 第 74 行只把 `bg14` 挂到了内部 `.group-1321317970`，没有将 group 自身的真实背景结构按每个 Figma group 建立独立 owner。

样式却给 group 外层统一写入：

- `resources/styles/common.less:341-351`：渐变背景、`border: 1px solid #f0f5ff`、`border-radius: 6px`。
- `resources/styles/common.less:412-423` 的另一套重复规则又写入白色半透明背景、圆角和 overflow。
- `resources/styles/common.less:358-364` 的内部图标容器甚至没有完整资源背景语义，只有尺寸和 flex 对齐。

这解释了用户看到的“背景没有还原、内部布局结构没有还原”：生成器将多个真实 group 当成同一个通用卡片模板，再用统一 CSS 填充差异；资源映射没有把每个 group 的背景、图标、文字、内部 padding 和相对位置固化为独立结构契约。

#### 治本边界

- `@antd/tab` 必须保留二元结构：`nav` + `panels`，并且 nav 与每个 panel 使用独立 ownerBlockId。
- 每个 `Group` 的 `figmaNodeId` 只能生成一次，背景和内部子节点不能被另一个 group 复用，除非 Manifest 明确声明共享。
- group 的背景、border、radius、padding、图标尺寸和文字位置必须来自 Figma 真值；没有真值的 CSS 装饰默认禁止生成。
- 不能只删除 `border`，也不能把 `background` 替换成一个看似接近的渐变；这类操作会继续掩盖结构缺失。

## 4. `headerSlots` 当前结论

最新样本的 `headerSlots` 状态如下：

| 样本 | 当前 headerSlots | 结论 |
|---|---:|---|
| traffic | 6 项：title-left 1 项、header-right 5 项 | 存在内部标识符污染和内容区候选混入；但 `daily-center-icon` 错误复用还发生在子组件资源消费层 |
| device | 5 项：统计 3 项、header、`@antd/tab` 各 1 项 | 统计区应与主体 section 互斥；`@antd/tab` 不应作为普通 header-right 文本候选 |

`applyHeaderSlotContractRewrite()` 当前只保证 rejected 不重新加回、已有候选去重和 contractSlots 合并；它不是完整的布局装配器。下一阶段必须让 header slot 与 content block 共用同一份 owner/geometry 表，确保同一节点只能落在一个区域。

## 5. 禁止的补丁式处理

以下做法不能作为完成标准：

- 在当前 `DailyTotalTraffic.vue` 中手动换图片，让中央图标“看起来正确”。
- 给两个 chart 容器硬编码高度，或在预览页额外注入 `height`。
- 将非法 ECharts type 留在产物中，只靠浏览器容错或改 `echarts.init` 时机。
- 给 `.slot-con-header-stats` / `.slot-con-main` 任意增加固定高度，绕过宿主和 Manifest 的高度预算。
- 删除一条 default/group 的 border 或背景而不追查资源 mount target。
- 用 CSS `display:none` 隐藏重复 header、tab 或背景层。
- 继续扩大 `forceAll`、autoMount 或 T09 文本兜底，使错误结构“至少可见”。

## 6. 治本实施顺序

### P0-1：统一资源所有权和唯一挂载

输入：Figma node tree、下载结果、Working Manifest。

输出至少包含：

```text
resourceId
figmaNodeId
figmaPath
ownerBlockId
semanticRole
mountTarget
allowedConsumers
bbox
status
```

门禁：同一 `figmaNodeId` 跨不相交 block 重复消费，直接 BLOCK；missing 资源不得伪装成 success。

### P0-2：固定结构契约

- traffic：daily title icon、daily center icon、two hourly bar charts、vehicle numeric cards、prediction chart 分离建 block。
- device：`headerStats`、`nav`、`switch`、`deviceGrid` 建立明确父子关系；`@antd/tab` 固化为 `nav + panels`。
- 每个 block 写出 `layoutMode`、尺寸预算、资源 props 和唯一 class token。

### P0-3：装配器而非 LLM 决定技术类型和尺寸

- `chartType: bar` 只能装配为 ECharts `type: 'bar'`。
- 图表 section 的高度由 Manifest 的剩余高度预算写出，不依赖模型自由生成 `flex`。
- 有 Figma 固定尺寸的卡片写 `flex: 0 0 <size>`；可伸缩图表区才使用 `minmax(0, 1fr)` 或等价 flex。
- 宿主为 block 内容区时，组件根使用明确 `height: 100%`；内部 flex 分配必须建立在根容器真实高度已确定的前提上。

### P0-4：统一 class token 生成

同一 `genClassKey(block)` 必须同时写入：

- template class
- component scoped style
- `common.less`
- manifest product locator

禁止组件 scoped 使用短类名、common.less 使用另一套实例长类名。

### P1：门禁升级

新增/收紧以下门禁：

- `RESOURCE-OWNER-001`：资源跨 owner 或跨区重复消费。
- `STRUCTURE-OWNER-001`：同一 Figma 节点同时落 header/content。
- `CHART-TYPE-001`：产物 chart type 不等于 Manifest 真值，或不是合法 ECharts 类型。
- `LAYOUT-BUDGET-001`：关键 block 的计算高度为 0，或 flex basis 依赖未建立的父级高度。
- `CLASS-TOKEN-001`：template/scoped/common.less token 不一致。
- `DECORATION-001`：产物新增的 background/border/radius 无对应 Figma style 证据。

## 7. 回归验收

同一版本、同一任务样本分别验证 traffic/device：

| 类别 | 验收条件 |
|---|---|
| 资源 | daily title icon 不进入 center；default/group 每个背景仅有一个 owner 和一个 mount target |
| 结构 | device 头部统计只出现一次；左侧竖 tab 保留且与右侧 panel 同帧；不存在重复大 tab |
| 图表 | 两张 hourly chart 的 series type 为 `bar`；chart 容器 `clientWidth > 0 && clientHeight > 0`；柱子真实出现 |
| 尺寸 | `header-stats`、`slot-con-main`、chart-wrap 的 computed height 均大于 0；不依赖手工注入 CSS |
| 样式 | common.less 命中率 100%；default 不重复背景、不出现无真值 border；group 背景和内部相对布局与 Figma 对齐 |
| 门禁 | 任一资源错绑、结构重叠、非法 chart type、关键容器 0 高度都 BLOCK，不进入发布 |

## 8. 当前状态

- 本轮只完成根因审计和文档记录。
- 未修改 traffic/device 当前生成产物。
- 未用固定高度、手工换资源或隐藏 DOM 作为修复。
- 下一刀应从 Working Manifest 的 owner/geometry/resource contract 接线开始，再进入结构装配和门禁，不应先改当前组件 CSS。
- **09-09 优化为何未挡住本样本**：见 `pipeline-governance-v2-2026-09-10.md`。结论是方向对、落地半截、文档互斥、验收偷换；先做 Loop 2.0 关自伤，再做 2.1 结构表改写 `sections`，禁止直接开四个 Loop 2 函数。
