# MVGO 五组件生成质量与上游根因审计报告（2026-11-18）

> **文档性质**：中文技术审计报告 Markdown 中间稿，供后续 Word 排版转换使用。  
> **审计边界**：本稿仅整理当前会话已确认的五个组件审计证据，不新增未经确认的事实。  
> **证据口径**：以组件源码、checkpoint 分析、chunk 元数据、生成管线源码和 acceptance 逻辑为准；历史快照用于说明缺陷链，不等同于当前运行态。

## 一、执行摘要

本轮审计对象严格限定为以下五个组件：

1. `c-vehicle-monitor-77ccc814`：重点车辆监测；
2. `c-intelligent-detection-417c52e1`：智能侦测；
3. `c-env-monitor-27bc42b2`：环境监测；
4. `c-monitor-d703ca6a`：监测预警；
5. `c-traffic-monitor-45d4f3f3`：流量监测。

本轮审计对每个组件核对了 `package/index.vue`、`components`、`.checkpoint/analysis.json`、`chunk-meta.json`，并沿生成链路核对了后端 `subcomponent-planner.js:3897-3902`、`prompt-builder.js:2277`、`code-generator.js` 的 `buildDeterministicIndexTemplate`、`section-structure-contract.js`、`chart-type-detection.js` 的 `collectTextCarriedChartTypes`、`chart-missing-types.js`、`code-fix-rules.js` 的 S4，以及 `component-acceptance/index.js:2064-2123` 和 `mc-component-graph-phase2.js` 的 acceptance 降级路径。

核心结论如下：

1. 五个组件的审计事实必须以当前组件标识为边界，不能再沿用其他样本的哈希、组件名称或旧报告结论。
2. 组件源码、checkpoint 和 chunk 元数据之间存在承载与消费不一致：部分内容已生成或已进入中间产物，但未在最终 index、子组件挂载、布局状态或图表交互中形成闭合链路。
3. `section-structure-contract.js`、确定性 index 模板、S4 修复规则和 acceptance 逻辑共同构成当前主要质量门；其中 acceptance 的降级路径可能把未闭合问题转化为“可继续生成”状态，不能将通过门禁等同于视觉还原完成。
4. 已确认的改善项包括 `anchorKind`、R1-c、S4 定位和文本折叠等方向；这些改善不能被表述为五个组件当前全部问题已经消失，也不能替代逐组件证据。
5. 最新 P0 观察单独记录为后续同类根因观察：E2 数据串位、D2 列错位、A2 Tab 顺序/归属问题。它们不直接改写本报告中的五组件逐项事实。

## 二、审计范围与方法

### 2.1 审计范围

| 组件标识 | 中文名称 | 核对材料 |
|---|---|---|
| `c-vehicle-monitor-77ccc814` | 重点车辆监测 | `package/index.vue`、`components`、`.checkpoint/analysis.json`、`chunk-meta.json` |
| `c-intelligent-detection-417c52e1` | 智能侦测 | `package/index.vue`、`components`、`.checkpoint/analysis.json`、`chunk-meta.json` |
| `c-env-monitor-27bc42b2` | 环境监测 | `package/index.vue`、`components`、`.checkpoint/analysis.json`、`chunk-meta.json` |
| `c-monitor-d703ca6a` | 监测预警 | `package/index.vue`、`components`、`.checkpoint/analysis.json`、`chunk-meta.json` |
| `c-traffic-monitor-45d4f3f3` | 流量监测 | `package/index.vue`、`components`、`.checkpoint/analysis.json`、`chunk-meta.json` |

不纳入本报告的内容包括其他组件哈希、其他批次样本、旧报告专属统计，以及无法由当前会话证据直接支持的扩展结论。

### 2.2 取证方法

1. 对照每个组件的 `package/index.vue` 与 `components`，核对模块是否实际挂载、props 是否传递、Tab 和图表节点是否存在。
2. 对照 `.checkpoint/analysis.json` 与 `chunk-meta.json`，核对视觉分析、分段、图表识别、文本承载和组件分片之间的事实是否一致。
3. 沿 `subcomponent-planner.js:3897-3902`、`prompt-builder.js:2277`、`buildDeterministicIndexTemplate` 和 `section-structure-contract.js`，核对规划、提示词、index 装配和结构契约。
4. 沿 `collectTextCarriedChartTypes`、`chart-missing-types.js`、S4 和 acceptance 代码，核对图表类型识别、缺失类型判断、修复定位和最终验收边界。
5. 将历史快照、当前源码证据和已确认改善项分栏记录，避免把离线修复方向或历史问题直接写成当前全部现状。

## 三、生成链路与验收边界

### 3.1 当前证据链

| 环节 | 当前核对证据 | 审计关注点 |
|---|---|---|
| 组件输入与分析 | `.checkpoint/analysis.json` | 视觉结构、文本、图表和区域关系是否被正确记录 |
| 分片元数据 | `chunk-meta.json` | 内容是否被拆分、重复承载、遗漏或错误归属 |
| 子组件规划 | `subcomponent-planner.js:3897-3902` | 子组件规划是否保留原始语义和结构边界 |
| 生成提示 | `prompt-builder.js:2277` | 规划结果是否以正确约束传入生成阶段 |
| index 装配 | `code-generator.js` 的 `buildDeterministicIndexTemplate` | 子组件是否按正确顺序、槽位、props 和状态挂载 |
| 结构契约 | `section-structure-contract.js` | section、Tab、容器和内容归属是否满足结构约束 |
| 图表识别 | `chart-type-detection.js` 的 `collectTextCarriedChartTypes`、`chart-missing-types.js` | 文本承载的图表语义是否被识别，缺失图表判断是否准确 |
| 修复定位 | `code-fix-rules.js` 的 S4 | 修复是否落到正确组件、section 和代码位置 |
| acceptance | `component-acceptance/index.js:2064-2123` | 验收覆盖的是结构存在性，还是实际内容、状态和交互闭合 |
| 降级路径 | `mc-component-graph-phase2.js` | acceptance 失败或证据不足时是否降级放行 |

### 3.2 链路判断

当前证据支持以下判断：

- 组件问题不能只依据最终截图判断，也不能只依据文件是否生成判断；必须同时核对 index、子组件、checkpoint、chunk 元数据和 acceptance。
- “模板存在”不等于“模板已正确挂载”，“数据存在”不等于“数据已被正确消费”，“图表类型被识别”也不等于“图表已经真实绘制”。
- `buildDeterministicIndexTemplate` 与 `section-structure-contract.js` 能收敛部分装配不确定性，但不能单独证明 Tab 状态、字段顺序、图表绘制和数据归属在运行态正确。
- `mc-component-graph-phase2.js` 的 acceptance 降级路径必须作为审计边界单独保留：降级结果只能说明流程继续，不能直接说明组件满足设计事实。

## 四、五组件逐项审计

> 逐项结论只针对本节列出的五个组件。历史快照中的问题用于说明形成链路；已确认改善项单列，不作为“当前全部已修复”的证明。

### 4.1 `c-vehicle-monitor-77ccc814`：重点车辆监测

**当前审计观察**

- 车辆卡片内部方向不一致：同一类卡片的内容排列、信息方向或视觉阅读方向没有形成一致规则。
- 存在空字段，说明数据或字段占位在 index、子组件与实际展示之间未完全闭合。
- 卡片使用固定尺寸时发生内容裁切，固定宽高与内部字段密度不匹配。
- Tab 状态链断：Tab 的选中状态、内容区域消费和最终展示之间没有形成可验证的闭环。

**根因链判断**

应重点核对 `package/index.vue` 的卡片与 Tab 挂载、对应 `components` 的字段消费、`chunk-meta.json` 的字段归属，以及 `section-structure-contract.js` 对卡片和状态区域的约束。若 index 已挂载组件而字段仍为空，问题属于数据接线或消费链；若字段已存在但被裁切，问题属于固定尺寸与布局契约；若 Tab 有声明但内容不随状态变化，问题属于状态链未被真实消费。

**证据置信度**：高。卡片方向、空字段、固定尺寸裁切和 Tab 状态链均为本轮确认的逐项观察；具体首发环节按上述源码和中间产物对账，不扩大为单一上游根因。

### 4.2 `c-intelligent-detection-417c52e1`：智能侦测

**当前审计观察**

- 存在样板与数据列表双承载：同一业务内容同时以样板化结构和实际数据列表承载，导致内容职责重叠或展示归属不清。
- 该问题不能仅按“组件缺失”描述；需要区分样板是否用于布局、数据列表是否用于真实内容，以及两者是否被 index 同时挂载。

**根因链判断**

应对照 `.checkpoint/analysis.json` 的内容结构、`chunk-meta.json` 的分片归属、`package/index.vue` 的挂载顺序及 `components` 的数据消费，确认样板和数据列表是否来自不同生成阶段。`subcomponent-planner.js:3897-3902` 与 `prompt-builder.js:2277` 是核对语义分配和提示约束的关键位置；若两类承载均进入最终 index，则属于重复装配或职责未收敛；若其中一类仅存在于中间产物，则属于生成链路未正确裁决承载方式。

**证据置信度**：高。样板/数据列表双承载为当前会话已确认事实；本报告不把它进一步推断为某一个单独模块的唯一责任。

### 4.3 `c-env-monitor-27bc42b2`：环境监测

**当前审计观察**

- 存在历史图表消失链：图表语义在分析、分片、识别或装配的某个环节被削弱或遗漏，最终表现为历史图表在生成物中消失。
- 该结论描述的是已确认的历史形成链，不应直接写成当前运行态中所有图表均已消失。
- 当前复核重点是 `collectTextCarriedChartTypes` 与 `chart-missing-types.js` 是否能够识别文本承载的图表语义，以及识别结果是否进入最终 index 和图表子组件。

**根因链判断**

应按 `.checkpoint/analysis.json` → `chunk-meta.json` → `chart-type-detection.js` → `chart-missing-types.js` → `buildDeterministicIndexTemplate` 的顺序核对。若 checkpoint 已记录图表而 chunk 未承载，属于分片丢失；若 chunk 已承载而 `collectTextCarriedChartTypes` 未识别，属于图表类型检测缺口；若类型已识别但 index 未挂载图表组件，属于装配缺口；若组件已挂载但图表未绘制，则应继续核对数据消费和 acceptance 覆盖。

**证据置信度**：高。历史图表消失链已确认；当前状态必须以本轮组件源码和中间产物的逐层对账为准，不能用历史快照替代当前结论。

### 4.4 `c-monitor-d703ca6a`：监测预警

**当前审计观察**

- 存在父子双 Tab：父级和子级均承载 Tab 语义，但两层状态和内容归属没有形成单一、清晰的消费链。
- `active` 状态存在不被消费的情况：状态可能被声明或传递，但实际内容区域没有依据该状态完成切换。
- 因此，Tab 文件存在、Tab 文案存在或 acceptance 通过，均不足以证明 Tab 交互和归属正确。

**根因链判断**

应对照 `package/index.vue` 的父子 Tab 结构、对应 `components` 的 `active` props 或状态变量、`chunk-meta.json` 的 Tab 归属，以及 `section-structure-contract.js` 的 section 关系。重点检查 `buildDeterministicIndexTemplate` 是否生成了正确的父子顺序和状态传递，并检查 `component-acceptance/index.js:2064-2123` 是否只验证节点存在而未验证状态消费。若 acceptance 失败后进入 `mc-component-graph-phase2.js` 的降级路径，则应保留“结构存在但状态未闭合”的风险结论。

**证据置信度**：高。父子双 Tab 与 `active` 状态不消费为本轮确认事实；具体是父级、子级还是 index 装配首发，需以逐文件对账为准。

### 4.5 `c-traffic-monitor-45d4f3f3`：流量监测

**当前审计观察**

- 预测 Tab 与 ECharts 的相对真实性较高，说明预测内容和图表承载在当前产物中具有较强的实际落地迹象。
- 时间选择器仍偏静态，节假日链接也仍为静态表现，尚未证明与数据状态或用户选择形成闭环。
- 段高风险仍需保留：图表、选择器、节假日链接及其上下文的尺寸和顺序可能在段高约束下产生裁切、错位或不可见。

**根因链判断**

应核对 `package/index.vue` 中预测 Tab、ECharts 和时间选择器的挂载关系，`components` 中图表数据与状态消费，`chunk-meta.json` 中交互语义是否被独立承载，以及 `section-structure-contract.js` 对图表 section 高度的约束。`collectTextCarriedChartTypes` 和 `chart-missing-types.js` 只能说明图表类型识别与缺失判断，不能替代对 ECharts 实际绘制和时间选择状态的验收。

**证据置信度**：中高。预测 Tab/ECharts 相对真实、时间选择器和节假日链接静态、段高风险均已确认；实际运行态交互仍应通过后续验收补齐。

## 五、公共根因与当前改善边界

### 5.1 公共根因

| 优先级 | 根因观察 | 影响 |
|---|---|---|
| P0 | 生成内容、index 装配、子组件消费和视觉状态之间缺少完整闭环 | 可出现空字段、双承载、Tab 状态不消费和图表消失 |
| P0 | section、卡片、图表和 Tab 的结构契约与实际布局消费不完全一致 | 可出现固定尺寸裁切、段高风险和父子归属不清 |
| P0 | acceptance 存在降级路径 | 结构或流程继续不等于内容、状态和视觉验收通过 |
| P1 | 图表文本承载识别与缺失类型判断仍需和最终装配对账 | 图表语义可能在中间链路被误判或丢失 |
| P1 | index 确定性模板虽能收敛部分生成差异，但仍需验证 props、顺序和状态消费 | 模板存在不等于运行态语义正确 |

### 5.2 已确认改善项与表述边界

本轮已确认以下方向属于改善项或已进入修复/约束链路：

- `anchorKind`：用于提高锚点语义和定位准确性；不能据此断言所有历史锚点问题已消失。
- R1-c：用于收敛相关结构或数据定位；不能据此断言五个组件的所有结构归属已经正确。
- S4 定位：用于将修复落到更明确的组件或代码位置；不能据此断言修复已覆盖全部运行态问题。
- 文本折叠：用于处理文本承载或重复内容的展示风险；不能据此断言图表、Tab、字段和交互已完成验收。

这些改善项必须与当前五组件的源码、checkpoint、chunk 元数据和 acceptance 结果分别对账。报告不将改善方向写成当前全部现状，也不将历史快照直接写成当前部署状态。

## 六、最新 P0 观察：后续同类根因线索

以下三项是当前会话最新确认的 P0 观察，用于指导后续同类问题归因，不混入五组件逐项事实：

1. **E2：数据串位**。需继续核对数据从 chunk、index props 到子组件消费的键和值是否保持同一语义归属。
2. **D2：列错位**。需继续核对列定义、字段顺序、容器布局和实际数据渲染之间是否存在错配。
3. **A2：Tab 顺序/归属问题**。需继续核对父子 Tab 的结构顺序、归属边界、active 状态和内容消费，避免把存在文案误判为已完成交互。

这三项观察不改变第四节对五个指定组件的现象描述，也不应被反向套用为每个组件已经发生的确定事实。

## 七、验收建议与质量门边界

### 7.1 五组件后续验收清单

| 组件 | 后续必查项目 | 通过标准 |
|---|---|---|
| `c-vehicle-monitor-77ccc814` | 卡片方向、空字段、固定尺寸、Tab 状态链 | 字段完整可见；卡片方向一致；无裁切；Tab 状态驱动正确内容 |
| `c-intelligent-detection-417c52e1` | 样板与数据列表承载、index 挂载、数据归属 | 样板职责与数据职责唯一且清晰；无重复承载或错误叠加 |
| `c-env-monitor-27bc42b2` | 历史图表链、图表类型识别、缺失判断、最终挂载 | 图表语义从分析到 index 和组件闭合；实际图表可见且可验证 |
| `c-monitor-d703ca6a` | 父子 Tab、active 状态、内容消费、降级结果 | Tab 顺序和归属正确；active 状态被消费；切换后内容真实变化 |
| `c-traffic-monitor-45d4f3f3` | 预测 Tab、ECharts、时间选择器、节假日链接、段高 | 图表真实绘制；选择状态可消费；链接状态明确；无段高裁切或错位 |
| 全五组件 | index、components、checkpoint、chunk、acceptance 对账 | 结构、数据、状态和视觉四层同时闭合 |

### 7.2 质量门解释

1. 文件存在、模板存在或节点计数正确，只能证明产物落地，不能证明数据和状态已被正确消费。
2. `component-acceptance/index.js:2064-2123` 的检查范围必须与真实内容完整性、Tab 切换、图表绘制、字段顺序和裁切风险区分开。
3. `mc-component-graph-phase2.js` 的 acceptance 降级结果必须显式标记为降级，不应被解释为视觉通过。
4. 图表识别工具和 S4 修复定位属于链路能力，不替代最终运行态验收。
5. 后续验收应以五个组件自身的当前源码和产物为准，不能复用其他批次样本的统计或结论。

## 八、审计交付边界与只读声明

本轮仅完成审计整理和报告修订：

- 未改源码；
- 未构建；
- 未重启；
- 未提交；
- 未推送；
- 未部署。

本次只覆盖本报告文件：`/Users/smigoo/工作/mvgo/output/audit-report-2026-11-18/stage1/final_draft.md`。报告中的历史快照、改善项和后续根因观察均不构成源码已修改、服务已重启或修复已部署的证明。
