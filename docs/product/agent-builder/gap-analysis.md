# Agent Builder 目标对齐差距分析（Gap Analysis）

> 目标：**真实运行的管线2 每个节点都能用"新建功能"建立出来；节点编排能还原；新建不同类型所需资源支持手填/上传**
> 对照基线：phase2 真实节点 25 个（getPhase2NodeRegistry）vs 当前 Agent Builder（9 模板 + 手填资源）
> 日期：2026-08-20

---

## 1. 结论先行

**当前功能不满足目标。** 三方面都有缺口：
- **节点可建性**：25 个节点中仅 9 个可直接建、4 个可近似，**12 个无法用现有模板创建**
- **编排可还原**：条件分支 ✅ 可编排；**并行组 ❌**（引擎+画布都不支持）
- **资源能力**：手填 ✅；**上传 ❌**；参考文档引用 ❌；图片/视觉输入 ❌

## 2. phase2 25 节点覆盖矩阵

| phase2 真实节点 | 类型 | 当前能否建 | 方式 / 缺口 |
|---|---|---|---|
| init | 确定性 | ❌ | 缺「初始化/状态准备」模板（含文档子管线） |
| figma-connector | 确定性 | ❌ | 缺「API 取数」模板（Figma token/节点树获取） |
| visual-parser | AI 视觉 | ❌ | llm-analyzer **无图片输入**，缺「视觉分析」模板 |
| preview-validator | 校验门 | ⚠️ | validator 模板可近似，但无 L0-A 具体规则 |
| parallel-analysis | 并行编排 | ❌ | 引擎/画布无并行支持 |
| layout-reviewer | AI | ✅ | llm-analyzer + 审查 prompt |
| style-mapper | AI | ✅ | llm-analyzer + 映射 prompt |
| microcode-engineer | AI | ⚠️ | llm-analyzer 可建，但**缺规范文档引用**（references） |
| code-structure-validator | 校验门 | ❌ | 缺 L0-B 特定校验模板（CODE-xxx 规则） |
| parallel-refine | 串行编排 | ⚠️ | 可近似为顺序，但非并行语义 |
| refine-feedback | AI | ✅ | llm-analyzer |
| adversarial-checker | AI | ✅ | llm-analyzer + 对抗审查 prompt |
| screenshot-renderer | 确定性 | ❌ | 缺「渲染/截图」模板（puppeteer） |
| visual-comparator | AI 视觉 | ❌ | 缺「双图视觉比对」模板（无图片输入） |
| parallel-quality-check | 确定性 | ⚠️ | aggregator 可近似质量聚合 |
| revision-decision | 确定性 | ✅ | router 模板可建（field/threshold 决策） |
| complete | 确定性 | ❌ | 缺「产物输出/发布」模板 |
| style-refiner | AI | ✅ | llm-analyzer |
| layout-refiner-legacy | AI | ✅ | llm-analyzer |
| style-refiner-legacy | AI | ✅ | llm-analyzer |
| subcomponent-planner | 确定性 | ✅ | **内置已有**（17 内置节点含它） |
| l0b-fail | 确定性 | ❌ | 缺「失败阻断 fail-closed」模板 |
| do-not-invent-check | 确定性 | ❌ | 缺「内容臆造检查」模板 |
| generate-runtime-verify | 确定性 | ❌ | 缺「运行时验证」模板 |

**统计**：✅ 可建 9 个（含内置 1）｜ ⚠️ 可近似 4 个｜ ❌ **不可建 12 个**

## 3. 编排能力差距

| 能力 | 现状 | 目标 | 差距 |
|---|---|---|---|
| 串行 DAG | ✅ 支持 | ✅ | 无 |
| 条件分支（condition） | ✅ 引擎 addConditionalEdge + 画布 condition 节点 | ✅ | 无 |
| 校验门（gate） | ✅ 引擎 gate 分支 + NODE_TYPES.gate | ✅ | 画布需确认 gate 节点类型入口 |
| **并行组（parallel）** | ❌ 引擎无 parallel、画布无并行节点 | ❌ | **缺：引擎 + 画布都需加并行支持** |
| phase2 拓扑加载编辑 | ✅ 可加载/编辑/另存/变体运行 | ✅ | 无 |

## 4. 资源能力差距

| 资源 | 现状 | 目标 | 差距 |
|---|---|---|---|
| 输入/输出字段 | ✅ 手填（textarea 解析） | ✅ 手填+上传 | 无（手填已满足） |
| 模板参数 | ✅ 手填 JSON | ✅ | 无 |
| Prompt | ✅ 手填 | ✅ | 无 |
| **文件上传（文档/图片/schema）** | ❌ 无 | ✅ 必须 | **缺：上传接口 + 前端上传控件** |
| **参考文档引用** | ❌ llm-analyzer 无 referenceFiles | ✅（工程师类需规范文档） | **缺：模板加 referenceFiles + 文档库** |
| **图片/视觉输入** | ❌ llm-analyzer 仅文本 | ✅（视觉分析/比对） | **缺：视觉模式（image 输入 + vision 模型）** |

## 5. 补全计划（分期）

| 阶段 | 内容 | 解决差距 |
|---|---|---|
| **P1-1 补核心工具模板（6 个）** | init 初始化 / figma-connector API 取数 / screenshot 渲染 / complete 发布 / l0b-fail 失败阻断 / do-not-invent 臆造检查 | 12 个不可建 → 减至 6 个 |
| **P1-2 视觉支持** | llm-analyzer 加 vision 模式（image 输入 + vision 模型）；新增 visual-compare 模板 | visual-parser / visual-comparator 可建 |
| **P1-3 参考文档** | 模板加 referenceFiles 字段 + 文档库（已有 references/ 目录选择） | microcode-engineer 等工程师类 |
| **P1-4 资源上传** | 上传接口（文档/图片/JSON schema）+ 前端上传控件 | 上传能力 |
| **P2-1 并行编排** | dynamic 引擎加 parallel 节点（组内并行执行 + 汇合）；画布加并行组类型 | 并行编排 |

## 6. 验收标准（目标达成定义）

1. phase2 25 个节点**每个都能用新建功能创建**（✅ 可建 = 生成代码 + 冒烟通过 + 可拖入管线）
2. 用新建的节点 + 编辑器，能**从 0 编排出与管线2 等价的拓扑**（含条件、并行）
3. 新建任意类型时，资源清单展示 + **手填和上传都可用**
4. 用新建节点还原的管线运行结果与管线2 一致（质量闭环保留）
