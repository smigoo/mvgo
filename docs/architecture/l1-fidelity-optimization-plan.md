# L1 还原率回归评测 — 优化方案（文档版，未落代码）

> 状态：方案评审中，尚未修改任何管线代码（遵循「服务不允许重启」硬约束）。
> 关联：自动化评测脚本 `backend-node/scripts/eval-fidelity-loop.mjs`；基线报告 `backend-node/scripts/eval-reports/eval-report-2026-08-28T18-17-05-953Z.{json,csv}`。

## 1. 目标与现状

| 项 | 值 |
|---|---|
| 评测方式 | L1：发现回归集 → puppeteer 真实 Vue 运行时截图 → VisualComparator(vision=claude-opus-4-8) 比对 → CSV/JSON 报告 |
| 回归集规模 | 7 件（6 微码 + 1 Vue3），均含 `source-*.png`(Figma 真值) + `package/index.vue`(产物) |
| 平均还原率 | **68%** |
| ≥80% 占比 | **0/7 (0%)** |
| 门禁 BLOCK/错误 | 0（7 件全部正常渲染，无运行时崩溃） |
| 目标 | 闭环到 **平均 ≥80% 且 ≥80% 占比 ≥ 80%** |

结论：**自动化评测已跑通，但管线当前还原率远低于目标，且失败模式高度系统性、可归类**——适合用「确定性后处理 + 规范强化」治本，而非模型随机重试。

## 2. 六类失败模式 → 根因 → 修复（按杠杆排序）

### P1 · echarts 坐标轴刻度/标签缺失
- **证据**（vision）：6 件微码几乎全部命中 `missing_element: Y轴刻度(40/30/20/10/0)`、`X轴时间刻度(2/4/.../24)`、`X轴单位'时'` 不显示。
- **根因**：`prompts/engineer/dynamic/chart-standards.md` 仅给 `xAxis:{type:'category',data:[]}` / `yAxis:{type:'value'}`，`data:[]` 永远为空，且无 `axisLabel`/`min`/`max`/`axisTick` 任何强制约束 → 模型吐空轴。
- **修复（治本，确定性）**：
  1. chart-standards.md 增加硬约束：`yAxis.axisLabel` 必须渲染数值刻度（从 Figma 文本节点提取真实刻度值，写入 `data`/`min`/`max`/`interval`）；`xAxis.axisLabel` 必须渲染类目/时间刻度与单位。
  2. 新增确定性后处理 `code-fix-pipeline` 规则 `inject-echarts-axis-ticks`：解析产物 `<chart>`/echarts `option`，若 `yAxis.axisLabel.show!==true` 或 `data` 为空但 Figma 文本含数字刻度 → 从 vision/figma 文本回填 `axisLabel` + `min/max`，并置 `axisTick.show=true`。
- **预期增益**：直接命中 5–6 件，单件 +5~12 分，对均值拉动最大。

### P2 · 产物多出设计没有的控件（下拉/搜索框）
- **证据**：`extra_element: 下拉选择框('使用默认'/'监测类型')`、`搜索框`、`额外菜单` 出现在 5/6 微码件，设计稿均无。
- **根因**：模型用模板/示例默认控件填空（如未绑数据的 `<select>` 默认项），无「Figma 无此节点则禁止生成交互控件」强约束；`resource-mapping-formatter` 的噪声过滤未覆盖「悬空交互控件」。
- **修复**：
  1. prompt 红线新增：禁止生成 Figma 节点树中不存在的交互控件（select/input/下拉）；缺失数据用静态占位文本，不得加可交互壳。
  2. `code-fix-pipeline` 规则 `strip-orphan-controls`：用 vision JSON 的 `extra_element` 区域反查，删除无对应 Figma 节点的 `<select>/<input>` 及其默认项文案（如「使用默认」）。
- **预期增益**：直接命中 5 件，单件 +3~8 分，并消除「假交互」误导。

### P3 · 标签页形状错（箭头连接 → 独立圆角矩形）
- **证据**：设计稿为箭头型连续标签，渲染为独立圆角矩形按钮（多件微码 + Vue3 均命中 `layout`/`missing_element`）。
- **根因**：`header-slot-validator.js` 把 `tab/switch/segmented` 仅作 slot 命名处理，未约束视觉形态；`structure-order-validator.js` 只管顺序不管样式；微码/Vue3 模板对 segmented 的 CSS 默认是独立按钮。
- **修复**：
  1. 新增 `chart-standards`/header 规范：segmented 标签须按 Figma 形态渲染（箭头连接 = 相邻元素共享边框/负 margin；圆角矩形独立 = 各 item 独立 radius），以 Figma `cornerRadius`/`strokes` 真值为准。
  2. `code-fix-pipeline` 规则 `segmented-shape-align`：依据 Figma 节点 `cornerRadius` 与相邻关系，确定性注入 `border-radius`/`margin-left:-1px` 等，对齐形态。
- **预期增益**：命中 3–4 件，单件 +3~6 分。

### P4 · 统计卡信息栏/渐变背景缺失
- **证据**：`mc-lite-1785941241031` 缺设备总数/完好率；多件卡片背景「蓝灰渐变→纯灰」、`v2-e2e-p2verify` 标题栏「深青渐变→纯色」。
- **根因**：渐变映射缺口——`resource-mapping-formatter.js` 有「禁止用渐变替代图片」铁律，但**未覆盖「设计是渐变色值时应原样还原渐变」**；数据栏缺失为字段绑定缺口（与 P1 同源，Figma 文本未回填）。
- **修复**：
  1. 区分两类背景：Figma 是图片 → 用图片（现有铁律）；Figma 是 `linear-gradient` 色值 → 确定性生成 `background: linear-gradient(...)`（补充映射分支）。
  2. 统计卡字段：从 Figma 文本节点提取「设备总数/完好率」等标签+数值，回填到卡片（与 P1 的 Figma 文本提取共用提取器）。
- **预期增益**：命中 3–4 件，单件 +3~7 分。

### P5 · 关闭 X / 图标 / 实景图缺失
- **证据**：`v2-e2e-*` 缺关闭 X、`运单信息 icon`、车辆实景照片；属静态资源/图标映射缺口。
- **根因**：图标/图片节点在 `visual-parser` 的 role 推断或 `resource-mapping` 挂载阶段被当作噪声丢弃（参考 `resource-mapping-formatter.js` 把部分节点当噪声的注释），或挂载目标错位。
- **修复**：
  1. `nav-section.js`/`visual-parser` 收紧 role 推断：含「关闭/close/X/icon/照片/实景」语义的节点不得误归为可丢弃噪声。
  2. `resource-mapping-formatter` 补全图标/实景图的挂载速查表（变量→尺寸→挂载目标），与现有 bg 速查表同源。
- **预期增益**：命中 2–3 件，单件 +2~5 分。

### P6 · Vue3 结构丢失最重（仅 45%）
- **证据**：`mv-lite-1785921659215` 整条标签导航栏(二氧化碳/能见度/洞内照明/洞外光强)缺失、副标题缺失、图标错位。
- **根因**：Vue3 引擎 `vue3-engineer.js` 此前**未接入** `stripLlmTailGarbage`/统一清洗层（见 2026-08-29 整改记录 P0-4 已接微码侧，Vue3 侧仍弱）；结构级信息（导航栏/副标题）在 Vue3 路径易在分块/清洗阶段被截断。
- **修复**：
  1. 确认 `vue3-engineer` 清洗层完整接入 `stripLlmTailGarbage`（先统一工具再旧方法兜底），与微码对齐（P0-4 已部分做，需回归验证）。
  2. `structure-order-validator` 增加 Vue3 结构完整性检查：header(标题+副标题)/tabs/图表 三类 block 必须存在且顺序正确，缺则 fail-closed 交重试。
- **预期增益**：Vue3 单件 +15~25 分，是均值最大拉升点之一。

## 3. 实施顺序与预期

| 阶段 | 包含 | 预期均值 | 备注 |
|---|---|---|---|
| S1 | P1 + P2 | 68% → ~78% | 命中面最广，确定性后处理可直接落地 |
| S2 | P3 + P4 | ~78% → ~83% | 突破 80% 阈值 |
| S3 | P5 + P6 | ~83% → ~88% | Vue3 拉升最大 |

> 单件修复后预期：6 微码 72%→~85%，Vue3 45%→~75%（仍偏低，需 P6 结构修复兜底）。

## 4. 验证闭环（L1 复用）

每次 S1/S2/S3 落地后：
1. `nest build`（仅重建 dist，**不重启**当前运行进程）。
2. 待重启放行后，重跑 `node scripts/eval-fidelity-loop.mjs --target=all` → 对比新报告 `avgSimilarity` 与 `ge80Ratio`。
3. 逐件 diff `topIssues`，确认 P1–P6 对应 `issues` 消失；未消失则回到对应 S 阶段加确定性规则。
4. 达标（均值 ≥80% 且 ge80Ratio ≥80%）即闭环；否则进入 L3（全自动：评测→归因→改规则→重启→复测，带熔断）。

## 5. 约束与依赖

- **当前硬约束**：服务不允许重启。因此本方案所有修复均**先写成代码 + 重建 dist**，生效须待用户放行一次 Node 重启（13030）后方可被 L1 评测验证。
- **风险**：P1/P4 的 Figma 数值/渐变提取依赖视觉真值质量；若 vision JSON 漏提刻度，则后处理回填为空——需 P1 规则同时 fallback 到 Figma 文本节点原始值。
- **不变量**：所有修复走确定性后处理/规范强化，禁止「产物直改」「假 toggle」；新增规则须带回归归因（对照 L1 报告）。

## 6. 交付物清单（本方案）

- 本报告（文档版，待评审）
- 后续落地时同步更新：6 条 `code-fix-pipeline` 规则 + chart-standards/header 规范补强 + vue3-engineer 清洗接入回归验证
- 每阶段一份 L1 复测报告（CSV/JSON）留作回归基线
