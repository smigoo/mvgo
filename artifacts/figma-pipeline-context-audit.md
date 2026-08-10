# Figma → 微码 / Vue3 生成管线 · 上下文矛盾与重复审计

> 目的：定位两条生成链路（figma url → 微码 / vue3）在**上下文拼装**上的矛盾（影响还原度）与重复（浪费 token），给出优化方向。
> 审计日期：2026-08-07 ｜ 范围：`backend-node/src/ai-engine`（figma-connector / visual-parser / *-engineer / graphs / references）
> 状态：**仅分析，未改动任何文件**

---

## 一、核心矛盾（Contradictions · 直接影响还原度）

### C1 · VisualParser 完全不感知 target，vue3 被错误框定为"微码组件"
- 证据：`roles/visual-parser.js` 的 `buildPrompt`（第 222 行）写死 `请分析以下微码组件的预览图`；`resourceSection`（第 193–209 行）无条件注入"头部插槽识别（面板组件专用）→ base-panel 具名插槽"规范。
- 证据：两条图的 VisualParser 构造都**没传 target/componentType**——`mc-component-graph-vue3.js:298`、`mc-component-graph-phase2.js:429`。
- 影响：**vue3 生成链路**的视觉分析收到"微码 + base-panel 插槽"语境，但 vue3 实际自行渲染面板外壳、不消费 base-panel 插槽（见工作记忆"面板架构区分"）。视觉模型被带偏，是"看着对、跑出来偏"的潜在根因。

### C2 · 面板外壳剥离逻辑两面都成了死代码
- 证据：`visual-parser.js:943` 关键分支 `if (this.componentType === 'microcode')` 调用 `_stripPanelChromeFromFigmaText` / `_filterPanelChromeResources`；但**全文件 grep `this.componentType =` 无任何赋值** → 该分支永假。
- 结果：微码本应剥离的面板外壳（root bg / header 节点）从没被剥离；而 `microcode-engineer.js:739-740` 的 prompt 又要求"忽略 structure.background / header（base-panel 已渲染）"。
- 矛盾本质：**"既没剥离、又要求忽略"**——分析产物里残留面板外壳，既浪费 token，又让 engineer 在"忽略"与"误用"间摇摆。

### C3 · "结构"字段存在 ≥3 种并行表示，反复重序列化
- 证据：`visual-parser.normalizeFields`（588–673 行）把 `layoutStructure / layout_sections / sections / layout` 等多别名归一为 `layout`，`visualElements / styleConfig / visual_styles` 归一为 `styles`。
- 证据：`microcode-engineer._extractSections`（64–78 行）再处理 `layoutStructure.layout.sections`、`layoutStructure.sections`、`layoutStructure.layoutStructure?.sections` 三种嵌套形状。
- 影响：同一条结构在链路里被反复重新 JSON.stringify 进不同 prompt（见 D/A），既耗 token，又因"读哪个字段"不一致带来还原不确定性。

### C4 · Vue3Engineer 整类继承 MicrocodeEngineer，vue3 携带微码 DNA
- 证据：`vue3-engineer.js:23` `class Vue3Engineer extends MicrocodeEngineer`；共享 `_formatFigmaStyleData / _formatResourceMapping / _extractSections / assessComplexity` 等。
- 影响：vue3 的提示构造与微码耦合，任何对微码 prompt/上下文的"通用化"修改都会隐性波及 vue3，review 与回归成本高；也是 C3 多形状兼容逻辑被 vue3 继承的根源。

---

## 二、重复与冗余（Duplication · 浪费 token）

### D · 同一大块上下文被 6~7 次独立重序列化
- `figmaNodeData`(pruned) / `layoutStructure` / `visualElements` / `resourceDomMapping` / `charts` / `headerSlots` 被分别注入：
  visual-parser → layout-reviewer → style-mapper → *-engineer → layout/style-refiner → adversarial-checker。
- `full` 模式 + revision 轮次下，**每轮同一上下文约 6~7× 重复发送**。
- 参考点：`vue3-engineer.js:361-368` 用 `JSON.stringify(layoutStructure||{}, null, 1)`、`visualElements` 原样注入；`figmaNodeData` 再 `_formatFigmaStyleData` 单独树形注入；`resourceDomMapping` 再 `_formatResourceMapping` 注入——**一个 engineer 调用内就重复了 3 遍资源/结构信息**。

### E · visual-parser 内部重复遍历与双套资源注入
- `extractFigmaHints` + `_generateCoverageReport` + `_extractChartDataFromFigma` 三次独立递归遍历 `figmaData`。
- `_enrichWithResourceMapping`（execute 内第 2269 行调用）与 `_postProcessAnalysis` 内的 `_enrichContentBackground / _enrichElement`（第 933 行调用）是**两套并行资源注入**，逻辑重叠。

### F · schema + 9 个必选模块无条件全量注入
- `buildPrompt` 每次都拼：完整 `preview-analysis-schema.md`（**11,124 字符**）+ 9 个 required 模块（v3.0 注释标注约 20KB）。
- 对纯文本/无图/无图表组件也未裁剪。

### G · 参考文档体量巨大（单次 engineer 调用轻松 60K+ 字符）
| 文件 | 字符数 |
|---|---|
| constraints/ai-generation-constraints.md | 21,330 |
| rules/stage-execution-rules.md | 15,383 |
| prompts/figma.md | 11,754 |
| schemas/preview-analysis-schema.md | 11,124 |
| prompts/validation-checklist.md | 9,658 |
| patterns/code-patterns.md | 9,599 |
| specs/style-guide.md | 8,489 |
| vue3/component-development.md | 5,874 |
| specs/declare-json.md | 5,855 |
| prompts/preview-analysis/figma-css-style-mapping.md | 5,687 |

> 注：schema 本身经 grep 验证为中性文本（不含 微码/vue3/base-panel 等定向词），矛盾主要来自 **C1 的 prompt 措辞**，而非 schema 内容。

---

## 三、量化影响（估算）

- **每轮总输入**：6~7 次 LLM 调用 × 平均 15~40KB ≈ **100~250KB 文本 / 轮**。
- **可省空间**：
  - D/A 冗余重序列化：约 **30~45%**
  - F schema/模块全量注入：约 **10~15%**
  - G 参考文档未裁剪：约 **15~25%**
  - 综合预计 **省 30~50%**（与项目记忆中"prompt 瘦身方向"估算一致）。
- **保真风险**：C1/C2/C4 直接使 vue3/微码视觉语境失真——比 token 浪费更该优先处理。

---

## 四、优化建议（按性价比排序 · 先分析不动手）

### P0 · 保真优先（必做）
1. **target 透传**：VisualParser 构造/execute 接收 `target`，`buildPrompt` 按 target 切换"微码组件 / 标准组件"措辞；**仅微码**注入 base-panel 插槽规范。
2. **修复 componentType 赋值**：构造函数或 execute 内 `this.componentType = target === 'vue3' ? 'vue3' : 'microcode'`，让 C2 的面板剥离逻辑真正生效（微码剥离、vue3 保留）。
3. **结构单一表示**：以 `preview-analysis-schema` 为唯一输出契约，`normalize` 在 parser 出口一次性完成；下游（engineer/reviewer/mapper/checker）只读 `layoutStructure`，删除 `_extractSections` 多形状兼容。

### P1 · 省 token（高收益）
4. **上下文分级**：`figmaNodeData` 仅在确需精确坐标的环节（style-mapper、engineer 的 flex 判断）传全量，其余环节传精简摘要或引用。
5. **资源注入去重**：合并 `_enrichWithResourceMapping` 与 `_enrichContentBackground/_enrichElement` 为单路径。
6. **模块按需裁剪**：无图组件不加载 schema 全文（拆核心/扩展）；无图表跳过 self-checklist 等轻量模块（现仅 hasCharts 已裁剪 legend/axes）。
7. **参考文档按技术栈裁剪**：将已规划的"antd 按 chunk 裁剪"思路推广到 vue3/mc 全套参考。

### P2 · 结构性
8. **解耦继承**：`Vue3Engineer` 不再 `extends MicrocodeEngineer` 整类，改为组合共享 `BaseEngineer`（上下文拼装工具），阻断微码 DNA 泄漏。
9. **上下文预算告警**：复用已存在的 `TokenBudget`，在 graph 层对每轮总输入设上限并报警。

---

## 六、补充实证与结论修正（2026-08-07 续）

> 应"补充实证"要求，本轮实测了 visual-parser 静态体量并通读 vue3-engineer 提示拼装，修正原报告一处过度判断。

### E1 · VisualParser 静态提示底座实测 = 30,792 字符/次（无条件）
- 测量：9 个必选模块（structure-examples 3153 / base 1335 / layout-analysis-workflow 2219 / ui-element-checklist 856 / figma-css-style-mapping 5687 / mixed-layout-examples 2955 / self-checklist 982 / do-not-invent 764 / header-rules 1717）+ preview-analysis-schema 11124 = **30,792 UTF-8 字符**。
- 含义：每次 Vision 调用（无论 vue3/微码、有无图/图表）**至少**烧 30.8K 字符静态提示，且与动态数据无关。这是 token 浪费的硬下限。

### E2 · 修正 C4：Vue3Engineer 提示文本是独立的，并非"微码 DNA 泄漏"
- 实测 `vue3-engineer.js:255-454` 的提示模板完全基于 vue3/SFC 规范：`spec('component-development.md',4000)`、`naming-conventions.md`、`code-quality.md`、`user-experience.md`，且大量 `<script setup>` / `ref()` / `ECharts` / `scoped less` 文案。**未继承微码 prompt 文本**。
- 它只复用基类**中性** formatter：`_formatFigmaStyleData`（microcode-engineer:3970，仅输出节点名/尺寸/layoutMode/fills/effects，无 c-xxx/declare.json 定向）、`_formatResourceMapping`（5229）。二者为中立格式器，**不是矛盾源**。
- **修正后的 C4 表述**：Vue3Engineer 继承 MicrocodeEngineer 的真实风险是 **helper 层耦合**（改共享 formatter 同时影响两条链路）+ 继承来的 `_extractSections` 多形状兼容（放大 C3），而非"提示文案泄漏"。原报告"vue3 提示带微码 DNA"措辞**过度**，以本条为准。

### E3 · C1 因此更坐实（真正的矛盾点收敛到这里）
- 两条 engineer 对面板外壳是**正确分化**的：
  - 微码 prompt（microcode-engineer:739-740）："忽略 structure.background / header（base-panel 已渲染）"
  - vue3 prompt（vue3-engineer:359-361）："面板明暗：… / 含 background/header 节点，全部要真实还原"
- 矛盾**不在两个 engineer 之间**，而在**共享的 visual-parser** 对两种目标**无条件**写"微码组件 + base-panel 插槽"语境（buildPrompt:222 / resourceSection:193-209）。vue3 engineer 拿到被 base-panel 框定的分析，却要自己渲染外壳 → C1 是保真层面的唯一真矛盾。

### E4 · engineer 单次调用重复注入（实测细化 D）
- vue3-engineer 数据段对同一来源做了**三重序列化**：
  1. `layoutStructure`（JSON null,1）
  2. `visualElements`（JSON null,1）—— 与 layoutStructure 是 vision 产出的两个独立 blob，同时全量注入
  3. `figmaNodeData` 经 `_formatFigmaStyleData`（**第 3 次遍历**整棵 figma 树，depth 8、compact≥5）再注入
  - 外加 headerSlots / styleMappings / charts / interactions / assets / resourceDomMapping 各一份 JSON。
- **代表值估算**（中组件）：静态参考 ~25-30K（vue3 参考截断后）+ layoutStructure+visualElements 5-15K + figmaNodeData 样式树 5-20K + 模板文本 ~12K ≈ **单次 vue3-engineer 调用 40-70K 字符**。与"60K+"估算一致。
- 叠加 D（6~7 个 LLM 调用 × 每轮重复）→ 每轮总输入 100~250KB 的估算成立。

### 修正后的优先级
- **唯一真保真矛盾 = C1**（target 透传 + 仅微码注入 base-panel 语境）。P0 仍成立且更聚焦。
- C2（面板剥离死代码）仍成立，属 C1 的配套修复（让微码剥离真正生效）。
- C3（结构多表示）仍成立，但根因部分来自继承的 `_extractSections` 兼容（见 E2）。
- C4 降级为"helper 耦合"——非保真阻断，列入 P2 结构性即可。

---

## 七、环境覆盖性评估（生成 vs 开发）— 2026-08-07 续

> 应"是否考虑了生成和开发两种环境"追问，本轮核查了 Playground 开发/修改链路与生成管线的隔离性。

### G1 · 两种环境在架构上完全隔离
| 维度 | 生成环境（本审计范围） | 开发环境（Playground AI 修改器） |
|---|---|---|
| 编排图 | `mc-component-graph-vue3` / `mc-component-graph-phase2` | `playground-agent-graph` |
| 视觉分析 | ✅ `VisualParser`（30,792 字符静态底座） | ❌ 不调用 |
| figmaNodeData | ✅ 三重序列化注入 | ❌ 无 |
| componentType / target | ✅ C1/C2 死代码与未传参处 | ❌ 不存在 |
| 上下文来源 | 重 prompt 模块 + 派生数据 | ~600 字内联 system prompt + 用户指令 + 工具读盘文件 |
| 本报告的 C1–C9 / D–E | 全部命中于此 | 全部不命中 |

- 实证：`playground-agent-graph.js` 全程**无** `VisualParser / visual-parser / figmaNodeData / componentType / target` 引用；`playground-tools.js` 仅做文件读写。
- 开发链路 system prompt（`playground-agent-graph.js:208-238`）为**纯内联字符串**，不 `readFileSync` 任何 `references/**/*.md`，不拼装结构/资源 JSON。其全部"上下文"来自：短指令 + 用户自然语言 + `read_file` 工具从磁盘读回的真实文件内容。

### G2 · 对本报告结论的影响（重要修正）
1. **P0（target 透传 + 面板剥离死代码修复）严格收敛在生成环境**：开发链路从不构造 `VisualParser`，修复**不可能波及**开发环境 → 安全，可放心落地。
2. **P1 的"省 30~50% token"必须限定为"生成环境"**：开发环境根本不做 figmaNodeData 重序列化（读磁盘真实文件），无镜像冗余；其上下文本就瘦，不存在同类浪费。原报告泛指"管线"需收窄为"生成链路"。
3. **`visual-parser.js:25` 的"开发态/生产态"≠ 生成 vs 开发**：它仅指**模块路径解析**（src 还是 dist 去找 `references/`），同一生成流程两种态下加载一致，已由 `_resolveProjectRoot` 向上探测兼容。本审计读 src，对两态均有效。
4. **共享点仅在产物门禁**：两链路最终都产出组件文件、过 workspace/缓存/LESS 编译门禁，但"上下文拼装"这一审计维度完全独立。

### G3 · 收口结论
- 本审计的发现**全部属于生成环境**，开发环境因架构隔离而不受影响、也不共享其冗余。
- 因此：P0 可直接在生成链路落地而无需回归开发环境；P1 的降本量化应标注"生成链路每轮 100~250KB → 目标降至 50~150KB"，不混算开发环境。
- 若未来开发环境要增强"基于 Figma 截图重新生成"，会回路由生成链路承担（handoff），不引入新的共享上下文矛盾。

---

## 八、P0 实施记录（已落地 2026-08-07）

> P0 = target 透传 + 面板外壳分离（修复死代码 + 微码/vue3 语境分叉）。已实施并通过 `node --check` + `build-backend.sh`（tsc 无错，116 个 .js 全同步 dist）。运行实例需重启后端才生效（本次未重启）。

### 改动清单
| 文件 | 改动 |
|---|---|
| `roles/visual-parser.js` | ① 构造器接收 `config.target`，存 `this.target`/`this.componentType`；② `execute` 解构 `target` 并下发 `analyze`；③ `analyze` 接收 `target` 传入 `buildPrompt`；④ `buildPrompt` 计算 `isMicrocode`，按 target 切换"微码组件/标准组件"措辞；⑤ `resourceSection` 的"头部插槽识别（面板组件专用）"段**仅微码**注入；⑥ `_postProcessAnalysis` 将 `_stripBasePanelChrome` 由无条件改为仅 `componentType==='microcode'` 执行（修复 vue3 header 被误剥 bug） |
| `graphs/mc-component-graph-phase2.js` | `parser.execute({...})` 补 `target: 'microcode'`（此前漏传） |
| `graphs/mc-component-graph-vue3.js` | 已传 `target: 'vue3'`（仅确认，无需改） |
| `graphs/dynamic-workflow-graph.js` | `visual-parser` 节点默认 `target: 'microcode'`（该图仅支持 microcode-engineer，等价于原"无条件剥离"行为，避免回归） |

### 关键判定
- **vue3 链路**：`execute({target:'vue3'})` → 不走 base-panel 插槽语境、不剥离面板外壳 → 还原度与 vue3 prompt（359-361"含 background/header 全部真实还原"）一致。
- **微码链路**：`target:'microcode'` → 注入 base-panel 插槽规范 + 剥离面板外壳（含 Figma 文本/资源过滤，`this.componentType==='microcode'` 分支首次真正生效，死代码复活）。
- **动态编排**：微码专用，默认 `target:'microcode'`，行为与原"无条件 `_stripBasePanelChrome`"一致 → **无回归**。
- **开发环境（playground-agent-graph）**：完全不调 VisualParser → 不受任何影响（见第七章）。

### 待验证（需重启后端后跑真实生成）
- [ ] 取 1 个 vue3 组件 + 1 个微码组件各跑一次，对比 `.mc-gen/cache/debug-prompt.txt`：vue3 不应含"头部插槽识别（面板组件专用）"段，微码应含。
- [ ] 对比两份 `debug-ai-response.txt`：vue3 的 `structure` 应保留 background/header 子节点；微码应被剥离为 slot 内容。
- [ ] 已知小隐患：Vision 缓存键 `fileKey+nodeId+figmaData` 未含 target，若同一 node 被 vue3 与微码复用（极少见）会串缓存——后续可加 target 进缓存键。

---

## 九、后续路线图（P1 / P2 与待办）

### P1 · token 瘦身（生成链路，预计省 30~50%，每轮 100~250KB → 50~150KB）
1. **重序列化去重（D 项）**：`figmaNodeData` 在单 engineer 调用内被 3 次注入（layoutStructure + visualElements + `_formatFigmaStyleData` 第 3 次遍历整树）。建议 engineer 层只传一次结构化数据，引用而非重序列化。
2. **资源注入合并**：`resourceDomMapping` 与各资源清单重复注入，合并为单份。
3. **参考模块按需裁剪**：`buildPrompt` 固定加载 9 个必选模块（30,792 字符/次），其中 `figma-css-style-mapping`(5687)、`mixed-layout-examples`(2955) 等可按组件特征跳过。

### P2 · 结构性（解耦）
- **C4 降级项**：`Vue3Engineer extends MicrocodeEngineer`，共享 `_formatFigmaStyleData`/`_formatResourceMapping`/`_extractSections`。改任一会影响两条链路，回归成本高。建议抽成无状态工具模块（如 `utils/figma-format.js`），两 engineer 各自引用，解除继承耦合。

### 已闭环的回归风险
- 动态编排微码路径此前依赖"无条件 `_stripBasePanelChrome`"意外得到正确行为；P0 将其改条件执行后，已在 `dynamic-workflow-graph` 显式传 `target:'microcode'` 补偿，**无回归**。

### 建议的执行顺序
1. 重启后端 → 验证 P0（见上"待验证"清单）。
2. 视验证结果，优先 P1-1（重序列化去重，ROI 最高）。
3. P2 解耦作为独立重构，单独排期（改动面大，需双链路回归）。

---

## 九、P1-1 实施记录（2026-08-07）+ P2 排期 + 串缓存解答

### 9.1 重要修正：所谓的"重序列化"大多是"同源不同视图的互补"

落地 P1-1 前的实证复查推翻了原报告"同一份 figmaNodeData 被注入 3 遍"的部分表述。实际在单 engineer 调用内：

| 注入项 | 来源 | 性质 |
|---|---|---|
| `layoutStructure` JSON | visual-parser 结构化输出 | 布局/层级/文本（权威） |
| `visualElements` JSON | visual-parser 结构化输出 | 视觉元素（与 layoutStructure 部分重叠） |
| `_formatVisualStyle(visualElements)` | 同一 visualElements 的**样式子集**自然语言化 | **与上面同源，但带"必须实现视觉"强指令** |
| `_formatFigmaStyleData(figmaNodeData)` | 原始 Figma 节点树遍历 | **flex-direction 的唯一权威依据**（注释明确：此前遗漏导致卡片方向错） |

结论：**前三项里只有 `visualElements` 的"JSON 完整版 + `_formatVisualStyle` 自然语言版"是真正的同源双序列化**；其余是互补而非重复。直接删 `_formatFigmaStyleData` 会伤还原度（绝不删）；`layoutStructure`/`visualElements` 与 `_formatVisualStyle` 是"机器数据 + 自然语言约束"组合。

### 9.2 P1-1a 已落地：microcode `visualElements` 双序列化去重

- **文件**：`roles/microcode-engineer.js` 输入信息段（约 804-809 行）。
- **改动**：删除 `JSON.stringify(visualElements, null, 2)` 完整 JSON 块，**保留** `_formatVisualStyle(visualElements)`（自然语言强指令）。
- **理由**：文本/层级信息已由 `layoutStructure` 覆盖；视觉样式由 `_formatVisualStyle` 以更易被 LLM 遵循的自然语言给出；纯 JSON 是冗余。使 microcode 与 vue3（vue3 仅注入一次 visualElements 信息）口径收敛。
- **收益**：每组件 microcode 生成省去一份完整 `visualElements` JSON（中小组件 2–6KB，复杂组件更高）。full + revision 轮次叠加。
- **验证**：`node --check` 通过；`build-backend.sh` tsc 无错，dist 已同步。

### 9.3 P1-1b 已落地：视觉分析缓存键加 target（修串缓存）

- **根因**：`_buildCacheKey(fileKey, nodeId, figmaData)` 原返回 `vision_${fileKey}_${nodeId}`，**不含 target**。P0 后 vue3/微码对同 node 产出不同语境分析结果（vue3 保留外壳、微码剥离外壳），但缓存只认 fileKey+nodeId → vue3 生成可能命中微码的分析缓存（或反之），**串味**。
- **修复**（3 处）：`visual-parser.js`
  - `_buildCacheKey` 签名加 `target`，返回 `vision_${fileKey}_${nodeId}_${target || 'default'}`。
  - `execute` 调用处传入 `target`。
- **副作用（期望行为）**：旧的无 target 缓存（24h TTL）自然失效，下次同 node 按 target 分别缓存。**不清理旧文件也无碍**（TTL 覆盖 + 键不匹配即 miss）。
- **验证**：同 P1-1a。

### 9.4 串缓存还有什么办法？（问答）

除"加 target 进键"外，还有两种可选增强（本轮未采用，按需）：
1. **内容哈希兜底**：当 `figmaData` 存在但无 fileKey/nodeId 时，已用 `md5(figmaData)` 入键；若后续同一 node 在不同 token/不同截图下复用，可把 `previewImage` 的短哈希一并纳入键，进一步区分"同 node 不同图"。
2. **按组件实例隔离**：缓存目录当前在 `outputPath/.mc-gen/cache/vision-cache`，已按组件隔离；若要支持"同 node 多组件复用不同分析"，键里再加 `componentName` 即可。

> 本轮采用方案 = 加 target，已足够覆盖 P0 后的语境分叉。其余按需。

### 9.5 P2 解耦单独排期（任务 #328 · in_progress）

真正的大头 token 浪费不在单调用内的 visualElements，而在 **figmaNodeData 跨调用重复序列化**：
- visual-parser 提示注入原始 `figmaData` 一次；
- engineer（vue3 行 376 / microcode 行 859）每轮 `_formatFigmaStyleData(figmaNodeData)` 重新遍历整树（depth 8，10–30KB），full + revision 共 2 次。

排期步骤（独立重构，不混 P1）：
1. **抽无状态 formatter**：把 `_formatFigmaStyleData` / `_formatResourceMapping` / `_extractSections` 从 `MicrocodeEngineer` 基类抽到 `utils/figma-format.js`（纯函数，不依赖 `this`）。
2. **parser 复用并产出**：`visual-parser` 在分析后调用该 util 生成 `figmaStyleTree`，作为 `analysisResult` 的一部分输出（一次遍历，全链路复用）。
3. **engineer 改为读取**：vue3/microcode 的 `buildPrompt` 直接引用 `analysisResult.figmaStyleTree`，**不再重新遍历 figmaNodeData** → 消除每组件多轮 ×10–30KB 重复。
4. **双链路回归**：微码 + vue3 各跑 1 组件，对比 `debug-prompt.txt` 中 figma 样式段内容与还原度，确认 flex-direction 等权威信息不丢。

> 此步同时消除"继承耦合"（P2 原目标）与"figmaNodeData 跨调用重复"（P1 真正大头），是一石二鸟的关键重构。

### 9.6 当前状态
- P0：已落地（未重启生效）。
- P1-1a / P1-1b：已落地（未重启生效）。
- P2：已排期，待执行（步骤 1–4）。
- ⚠️ 运行实例仍为旧内存态，需重启后端让 P0/P1-1 生效。

