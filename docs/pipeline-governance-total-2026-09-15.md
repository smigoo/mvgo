# 组件生成管线 · 全量问题治理总纲（2026-09-15）

> **执行依据已切换到 `docs/全量治理方案-2026-09-15.md`（15:13 修订）。**
> 本文保留为 09-15 上午取证附录。09-09/09-10/09-13/09-14 继续只作附录。
>
> 触发：用户要求「整理包含之前的所有问题，给治理方案」——此前方案散落在 4 份文档、
> 40+ 门禁编号、刀 1~22、H-01~H-05、G1~G9、批次 1~4 里，且 09-15 又新发现 2 个**管线后处理自身**
> 的注入 bug（aspect-ratio 误伤 / min-height 污染），需要一份收敛后的总纲。

---

## 0. 唯一方法论（删减法，不再追加规则）

**核心判断**：所有问题的共同根因只有一句——**视觉确定性事实没有在「生成时」由代码强制落盘，
而是交给 LLM 自由生成 + 事后用规则纠偏**。LLM 的错误空间无限，纠偏规则必然无限（40+ 编号、刀 1~22、
H/G 编号、3 套契约、2 套矩阵，每一条都是某次失败后追加的纠偏层）。继续在这个范式里加规则，永不收敛。

**唯一治本**：把「视觉确定性事实」从 LLM 职责剥离，把「生成后纠偏」改为「生成时确定性装配」。

**唯一收敛指标**：**门禁/规则总数必须下降，而非上升。** 一个让规则变多的「治理」是发散（补丁）；
只有让规则变少，才是收敛（治本）。

**删减法三步**：
1. 圈定「LLM 不该碰」的事实清单（结构树 / bbox / fills 颜色 / 资源与挂载点 / item 数量与顺序 / display·flex·grid）。
2. planner + assembler 确定性接管：planner 产出唯一确定结构，assembler 直接生成 DOM/资源/样式，LLM 只填 {业务文案、数据映射、交互事件}。
3. 每接管一件事，删掉对应后处理/门禁（收敛，不是发散）。

**验证纪律（每阶段）**：离线重放 → 真机重生成（前端在线）→ jest 基线逐字同名同数 → build/dist → 独立 commit → 文档+日志。

---

## 1. 全量问题收敛（按根因维度，不按症状）

把之前所有症状（H-01~H-05、G1~G9、switch/tabs/device-grid/vehicle/traffic 五组件、刀系列、阶段 A~E、
09-15 新发现）收敛为 **7 个根因维度**：

| 维度 | 根因（一句话） | 覆盖的历史症状 |
|---|---|---|
| **R1 事实源未收口** | 底层 Figma 索引/bbox/文本归一化被多处重复实现 | A0 盘点：`inline-row-rebuilder` 重复实现 bb/xOverlap 等；下游各自建索引 |
| **R2 结构/布局/配对由 LLM 自由生成** | 结构树、item 顺序、成员配对、display·flex·grid 未由代码确定性生成 | H-01 文字折行；switch 左右两列；tabs 窄条纵向；device-card 垂直布局；vehicle 双 content-section；stat 成员左右反；traffic 内容挤压 |
| **R3 资源挂载无目标约束** | 资源「能挂哪」而非「该挂哪」，fail-open 补挂 | H-05 `bg-8439` 跨区挂 stat-group；device-grid 12 卡背景挂容器而非卡片 |
| **R4 确定性后处理自身注入误伤** ⭐新 | 管线自己的后处理规则有 bug，注入错误值 | `aspect-ratio:426/807` 误伤纵向多 section 容器；`min-height:160px` 污染 chart-title/icon/text/legend |
| **R5 LLM 幻觉内容** | 臆造文本/控件/重复文本，无 Figma 来源 | 「*数据实时更新」；刷新按钮（H-04）；duplicateTextIssues；vehicle 多出 title-row |
| **R6 颜色/文本样式未绑定 nodeId fills** | 数字渐变、icon 图形语义用通用近似值替代 | H-02 数字渐变硬编码；H-03 icon 变 CSS 圆点 |
| **R7 视觉正确性无门禁** | 「可编译」≠「视觉正确」，门禁只验语法/引用/结构 | traffic-monitor 全部门禁通过却「样式几乎看不到」；BLOCK=0 ≠ 视觉正确（多次实锤） |

> ⭐ **R4 是 09-15 新增维度**，此前删减法只关注「LLM 错误被后处理纠偏」，未意识到「后处理自身也会注入错误」。
> 它揭示一个更深结论：**确定性后处理与 LLM 一样是「生成后纠偏」，同样会引入错误**——只有「生成时确定性装配」
> 才能同时消灭这两类错误。

---

## 2. 逐维度治理落点 + 执行状态

### R1 事实源收口 —— ✅ 主体完成（阶段 A1），A2/A3/A4 残留

- **已完成（A1，2026-09-15）**：`section-tree.js` 提供兼容性底层事实接口（`indexFigmaNodes` 保留 rawNode、
  `buildChildrenMap`、`normalizeFigmaTextName`、`collectSubtreeTexts`、`getFigmaBox`、`areBoxesSideBySide`）；
  `section-content-guard` 删私有实现改用共享入口；`inline-row-merger`/`container-rebuilder`/`tab-resource-guard`/
  `figma-height-ratio`/`flex-direction-inferrer`/`inline-row-rebuilder` 按返回契约迁移底层消费。
  离线 fixture 498 节点 / 105 TEXT 重放通过；8 套件 124 测试绿；真机 `runtimeVerified=true`。
- **残留**：
  - A2：`header-slot-validator` / `inline-header-slot-inferrer` / `header-relation-validator` 剩余局部事实收口。
  - A3：header slot 三处收敛（底层节点事实可共享，slot 归属裁决单独验证）。
  - A4：prompt 里 flex/layout 规则收敛到 `layout-rules.md` 单一片段（先盘点冲突，再收敛）。

### R2 结构/布局/配对确定性接管 —— 🔶 部分完成（stat 配对已治本；布局批次 3 进行中）

- **已完成：统计行 stat 文本配对（阶段 B，commit `3e56f77`→`779a6cb`→`04265a0`）**
  - `inline-row-assembler.js`：`assessStatRowConfidence`（高置信判定）+ `healStatRowMemberPairing`（写盘前确定性对齐）。
  - 真机 `memberOrderIssues=[]` 归零（此前 A1/B2 都报 2:3660 左右反）。
  - 残留：class 互换（标题装进 value 类 → 字号错），内容驱动只重排文本不改 class 结构。
- **已完成：section↔Figma 节点归属锚定（批次 1，`anchorPhantomSections`）**
  - 修 `collectSourceNodeIds` 只认 `数字:数字` 导致壳 src=[]；traffic 8 壳全保留。
- **已完成：布局事实注入（批次 3，3a/3b/3c）**
  - `buildSectionLayoutFacts` + `fixSectionHeightsForResource` 规则⑤（只补不覆盖）；LLM 勿手写 display/flex/grid；
    vision schema 示例语义 id 改数字:数字。
- **进行中（待观测归零后删纠偏器）**：`healGridContainer`/`ensureGridDisplay`/`ensureFlexDirection`/FLEX-001~005/
  `dedupeByWholeRegionShell`/`dedupeDuplicateSections` 的删除条件是「LLM 不再写布局 / planner 不再产出不可锚壳」——
  需 3b/3c 生效若干真机样本后观测触发归零，才删。
- **未覆盖（本次新组件又暴露）**：
  - switch「icon+title 左列、line1+line2 右列」两列结构、tabs 窄条纵向、device-card 垂直布局——这些**双层 item 内部结构**
    事实表仍不能表达（批次 3 已明确「内层栅格唯一例外」），需 `stateful-section-contract` 类 item 级契约（批次 5 同路）。
  - inline style 对象键覆盖（`{...bg1, bg2}` 后键覆盖前键）——这是 LLM 写 JS 的代码质量缺陷，需 code-healer 或确定性模板。

### R3 资源挂载目标约束 —— 🔶 大部分完成（批次 2，2a/2b/2c 已落地）

- **已完成**：`buildResourceMountPlan`（单变量 + `sharedBy` + owner 解析 + fail-closed）；
  `mountPlannedResources`（限定 owner 文件 + 去重 + icon 尺寸封顶）；`assignVisualOrderVarNames` 源头共享编号。
- **已删纠偏 3/4**：`autoMountUnusedBackgrounds` + `autoMountUnusedIcons` + `dedupeSameImageAliases`。
- **残留**：`ensureHeaderSlots` 延后（依赖插槽 DOM 确定性装配，属 R2 批次 3/4 职责）。

### R4 确定性后处理注入误伤 —— ✅ 已治本（commit `82d5dab`，2026-09-15）

两个 bug 都已定位到具体注入点并修复（非 LLM 生成，是管线后处理主动注入）：

| bug | 注入点 | 修复 |
|---|---|---|
| `aspect-ratio: W/H` 误伤纵向多 section 容器 | `validators/code-fix-rules.js#anchorRootContainerInFiles` + `utils/root-container-normalizer.js#normalizeRootContainerLayout` | **删除 aspect-ratio 注入**，改补 width/height 100% 双全（宿主 `.pannel-content` 有明确高度 `calc(100%-38px)`，6/6 面板确认，双全即满足 I4） |
| `min-height:160px` 污染非图表容器 | `utils/post-process.js#injectChartMinHeight` 正则过宽（经 `microcode-engineer.js:1702` + `resource-mounter.js:1461` 两处调用） | replace 回调加「非容器后缀黑名单」`CHART_NON_CONTAINER_RE`（title/legend/icon/text/header/bridge/section/forecast/tunnel/item/dot/label/name/value/stat），命中跳过；容器词/数字编号/chart 结尾照常注入 |

**R4 的更深结论（成立）**：这两个 bug 本质是「生成后纠偏」自身的错误——确定性后处理与 LLM 一样会注入错误。删减法正解是让 assembler 生成时正确决策形态锁与图表兜底，然后删掉后处理。本次删除了 aspect-ratio 注入（一个有害纠偏规则），min-height 收窄（黑名单过滤，未删 T2 精确版）。

**验证**：
- 单测 t03 +2（非容器不注入/真容器仍注入）7/7；root-anchor + normalizer 26/26；artifact-invariants 19/19；resource-mounter 42/42；pipeline-regression 10/10。
- 离线回放（dist 对真实 fixture）：注入 160px=0、chart-title/legend/section 未注入、aspect-ratio 已删除。
- 真机（reuseCache:true，任务 mc-1789440425491-4fa2dc7d）：新产物零 min-height:160px 污染、零 aspect-ratio 注入，slot-con = width/height 100% 双全。

**附带发现（R2 范畴，未在本次范围）**：环境监测 ChartSection.vue 图表容器 `.c-env-monitor-chart-container` 在 style 段无规则块 → T2 精确版「匹配规则块注入」失效 → 图表容器无高度。需 T2 增强「规则块不存在时主动创建」（归 R2 布局确定性接管）。

### R5 LLM 幻觉内容 —— 🔶 部分覆盖，阶段 C 待做

- **已有防护**：TEXT-TRUTH 门禁（Figma 文本白名单）+ Vision-Figma 交叉验证（#532）+ 放松 TEXT-TRUTH（#536）。
- **仍漏报**：「*数据实时更新」类文本不在白名单却未被拦截（TEXT-TRUTH 漏报，09-15 新实锤）。
- **治本（阶段 C）**：内容守卫分级——高置信自愈（唯一归属文本从非归属组件删除）/ 中置信诊断 / 低置信 BLOCK+定向重试。
  现状：`duplicateTextIssues` 偶发（LLM 写重复文本）、LLM 偶发拒绝（返回「我需要澄清」非 JSON），均非系统性。

### R6 颜色/文本样式绑定 nodeId fills —— 🔴 阻塞（批次 4 前置缺失）

- **阻塞事实**：`figma-connector.js` 无 nodeId 级 fills 提取能力（grep `fills/gradientStops` 为空）。
- **结论**：assembler 按 nodeId 绑定 fills 的事实源不存在，颜色仍只能 LLM 生成 + 后处理兜底。
  M5-10/THEME-*/刀 19 本轮不能删（删则颜色错误/数据键类名化复发）。
- **待办**：figma-connector 补 nodeId→fills 提取 → 批次 4 才能落地接管并删颜色后处理。

### R7 视觉正确性门禁 —— 🔴 阶段 D 待做（backlog 老账）

- **问题**：门禁只验语法/引用/结构，不验「视觉正确」。traffic-monitor 全部门禁通过却「样式几乎看不到」。
- **治本（阶段 D）**：真实 `screenshot.png`（`screenshot-renderer` 生成 `*-rendered.png`，非 `mc-preview.png`）
  与设计稿做结构/元素级比对（D1 元素级）+ 像素级（D2）。截图 vs 设计稿的视觉覆盖检查进管线。

---

## 3. 执行顺序（收敛版，取代旧四阶段/三批次零散计划）

按「依赖序 + 每步可独立验收 + 门禁数下降」排序：

| 序 | 动作 | 归属维度 | 状态 | 验收指标 |
|---|---|---|---|---|
| 1 | 修 R4 两个注入 bug（min-height 正则收窄 + aspect-ratio 纵向容器排除） | R4 | ✅ 完成（`82d5dab`） | 真机零 min-height:160px 污染、零 aspect-ratio 注入 |
| 1b | T2 增强：图表容器无规则块时主动创建 min-height | R2 | ✅ 完成（`a507c63`） | 离线回放成功创建 `.chart-container { min-height:160px }` |
| 2 | 完成 A2/A3/A4（header slot 事实收口 + prompt 规则收敛） | R1 | 🔶 A4 完成（`0b04965`），A2/A3 评估完成 | A4 flex-grow 规则收敛到 layout-rules.md；A2/A3 盘点结论：可收口项少（characters vs name 语义差异），不强行收口 |
| 3 | 观测 3b/3c 生效后删 FLEX-001~005 + 2 布局守卫 + 2 去重器 | R2 | 🔶 进行中 | 探测器触发归零 → 删；门禁总数下降 |
| 4 | item 级契约（stateful-section-contract 类）：双层 item 内部结构 + 背景归属 + 垂直布局 | R2/R3 | 🔴 待做 | switch/tabs/device-grid 三样本 item 结构/背景/顺序正确 |
| 5 | 内容守卫分级（阶段 C） | R5 | 🔴 待做 | TEXT-TRUTH 拦截臆造文本；duplicateTextIssues 归零 |
| 6 | figma-connector 补 nodeId→fills 提取 → 批次 4 颜色接管 | R6 | 🔴 阻塞 | 颜色由 assembler 绑定，删 M5-10/THEME-* |
| 7 | 视觉覆盖门禁（阶段 D） | R7 | 🔴 待做 | 真实截图 vs 设计稿结构/元素级比对进管线 |
| 8 | 渲染自给自足（阶段 E） | — | 🔴 待做 | screenshot-renderer 不依赖 2610 dev server |

**关键依赖**：
- 序 1（R4）优先级最高——它是「管线自身 bug」，不修则所有后续真机样本都被污染，且是本次用户直接反馈的「样式看不到」根因。
- 序 3 的「删」必须等「观测归零」，顺序不可倒置（先接管 → 观测 → 再删）。
- 序 4/6/7 需要新事实源能力（item 契约 / nodeId fills / 截图比对），不能先删旧门禁。

---

## 4. 验收硬指标（客观，非「单测绿即完成」）

1. **门禁/规则总数下降**：每完成一个接管批次，统计纠偏器函数数 + 门禁编号数，必须净下降。
2. **真机视觉正确**：`reuseCache:true` 重生成后，`*-rendered.png`（非 mc-preview）与设计稿对照，
   无「样式看不到」「内容挤压」「撑裂」类问题。
3. **四样本回归**：switch / tabs / device-grid / vehicle（+ traffic）统一矩阵通过，证明通用治理而非组件特判。
4. **jest 基线逐字同名同数**：改动后失败集与基线完全一致（仓库既有 4 例红灯 + import.meta 加载失败，不新增）。

---

## 5. 明确禁止（沿用旧治理，继续有效）

- ❌ 禁止在 `frontend/workspace/custom-components/` 或 `temp-components/` 对单个产物加 CSS 补丁。
- ❌ 禁止新增 CODE-0XX/FLEX-0XX 编号（新问题归入 7 根因维度，不扩编号）。
- ❌ 禁止再发明 grep=0 的新符号当现状（`FigmaFactsTree`/`SectionPlanContract`/`assembler` 等一律视为目标形态描述，
  落地必须落到真实文件与真实函数）。
- ❌ 禁止「删探测器」早于「观测触发归零」。
- ❌ 禁止把 `mc-preview.png`（Figma 下载预览图）当作真实渲染效果证据，必须用 `screenshot-renderer` 的 `*-rendered.png`。

---

## 6. 关键代码证据索引（本文涉及的注入点）

| 注入/事实源 | 文件:行 | 说明 |
|---|---|---|
| aspect-ratio 注入 | `validators/code-fix-rules.js:243` | `anchorRootContainerInFiles`，缺宽高时注入 `aspect-ratio: W/H` |
| aspect-ratio 注入（终验兜底） | `utils/root-container-normalizer.js:165` | `normalizeRootContainerLayout`，同样语义 |
| min-height 注入（粗暴正则） | `utils/post-process.js:37-44` | `injectChartMinHeight`，正则 `chart-` 过宽误伤 title/legend/icon |
| min-height 注入调用点 | `microcode-engineer.js:1702` + `resource-mounter.js:1461` | 粗暴正则的 2 处调用 |
| min-height 注入（精确版） | `microcode-engineer.js:5689-5732` | T2，匹配 `echarts.init(refName)` 的精确版 |
| stat 配对事实源 | `utils/inline-row-assembler.js` | 阶段 B 治本产物 |
| 根容器事实源 | `utils/section-tree.js` | 共享底层事实接口（A1 收口） |
