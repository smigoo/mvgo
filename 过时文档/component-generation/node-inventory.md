# 节点全量清单（按类别）

> 盘点日期：2026-08-20 ｜ 来源：backend-node/src/ai-engine（roles 21 + agents 7 + validators 26 + 注册表）
> 状态图例：✅ 已注册+可运行（编辑器可见）｜ 🟡 已注册但调度器无 case（可见但运行报错）｜ ⚪ 未注册（引擎内部/待开放）

---

## 一、数据源（获取/解析输入）

| 节点 | 职责 | 类型 | 状态 |
|---|---|---|---|
| `figma-connector` | 从 Figma API 获取节点数据、样式、静态资源 | 工具 | ✅ 注册 |
| `url-parser-agent` | 解析 Figma 链接 → fileKey/nodeId（新增） | 工具 | ✅ 注册 |
| `data-agent` | 数据结构生成智能体 | AI | ⚪ 未注册 |

## 二、分析（理解输入 → 结构化）

| 节点 | 职责 | 类型 | 状态 |
|---|---|---|---|
| `visual-parser` | 预览图+节点树 → 布局结构（核心分析） | AI（视觉） | ✅ 注册 |
| `doc-analyzer` | 需求文档 → 结构化 JSON 分析 | AI | 🟡 注册但调度器无 case（实际类在 agents/doc-analyzer-agent.js） |
| `figma-layout-analyzer-agent` | Figma 布局分析智能体（agents 层） | AI | ⚪ 未注册 |

## 三、审查（质量/规范检查）

| 节点 | 职责 | 类型 | 状态 |
|---|---|---|---|
| `layout-reviewer` | 审查布局结构合理性（嵌套/区域/父子） | AI | ✅ 注册 |
| `adversarial-checker` | 对抗式审查生成代码（规范/潜在问题/优化） | AI | ✅ 注册 |
| `code-validator` | 代码验证智能体（对抗式） | AI | ⚪ 未注册 |
| `code-reviewer-agent` | 代码评审智能体（agents 层） | AI | ⚪ 未注册 |
| `demo-assistant` | 演示助手 | AI | ⚪ 未注册 |

## 四、转换/样式（映射 → 可落地样式）

| 节点 | 职责 | 类型 | 状态 |
|---|---|---|---|
| `style-mapper` | Figma 样式 → CSS 变量/微码样式 | AI | ✅ 注册 |
| `style-agent` | 样式生成智能体 | AI | ⚪ 未注册 |
| `layout-responsive-agent` | 响应式布局智能体（agents 层） | AI | ⚪ 未注册 |

## 五、生成（产出代码/配置）

| 节点 | 职责 | 类型 | 状态 |
|---|---|---|---|
| `microcode-engineer` | 微码组件代码生成（主生成器） | AI | ✅ 注册 |
| `vue3-engineer` | Vue3 普通组件代码生成（新管线） | AI | ⚪ 未注册 |
| `layout-generator` | 布局代码生成器 | AI | ⚪ 未注册 |
| `component-assembler` | 组件组装器 | AI | ⚪ 未注册 |
| `subcomponent-planner` | 子组件拆分规划 | AI | ⚪ 未注册 |
| `config-generator` | 生成业务配置四章节 | AI | 🟡 注册但调度器无 case（实际类在 agents/config-generator-agent.js） |

## 六、精修（Refiner，迭代打磨）

| 节点 | 职责 | 类型 | 状态 |
|---|---|---|---|
| `layout-refiner` | 布局精修 | AI | ⚪ 未注册（phase2 内部使用） |
| `style-refiner` | 样式精修 | AI | ⚪ 未注册（phase2 内部使用） |
| `layout-style-refiner` | 布局+样式合并精修 v3.8 | AI | ⚪ 未注册（phase2 内部使用） |

## 七、渲染/视觉反馈（质量闭环）

| 节点 | 职责 | 类型 | 状态 |
|---|---|---|---|
| `screenshot-renderer` | 渲染组件截图（puppeteer） | 工具 | ⚪ 未注册（phase2 内部使用） |
| `visual-comparator` | 截图 vs 预览图视觉比对 | AI（视觉） | ⚪ 未注册（phase2 内部使用） |

## 八、示例/基础设施

| 节点 | 职责 | 类型 | 状态 |
|---|---|---|---|
| `hello-agent` | 最小示例（链路验证） | 工具 | ✅ 注册 |
| `base-agent` | 智能体基类（非节点，所有类继承） | — | — |
| `vision-agent` | 视觉分析通用智能体（visual-parser 依赖） | AI（视觉） | ⚪ 未注册 |

## 九、校验器（Gate/校验门，26 个）

### 结构类
| 校验器 | 职责 |
|---|---|
| `code-structure-validator` | 代码结构门禁（CODE-001~013，fail-closed） |
| `vue-component-validator` | Vue3 组件校验 |
| `structure-order-validator` | 结构顺序校验 |
| `code-traceability-detector` | 代码溯源检测 |
| `resource-path-validator` | 资源路径校验 |
| `header-relation-validator` | 头部关系校验 |
| `header-slot-validator` | 头部插槽校验 |
| `declare-json-schema-validator` | declare.json 结构校验 |

### 语义/内容类
| 校验器 | 职责 |
|---|---|
| `preview-analysis-validator` | 预览分析结果校验（L0-A） |
| `do-not-invent-validator` | 禁止臆造校验 |
| `element-coverage-validator` | 元素覆盖率校验 |
| `consistency-validator` | 一致性校验 |
| `chart-validator` | 图表配置校验 |
| `figma-node-validator` | Figma 节点校验 |
| `vision-authenticity-detector` | 视觉真实性检测 |
| `vision-code-cross-validator` | 视觉-代码交叉校验 |

### 编译/资源类
| 校验器 | 职责 |
|---|---|
| `less-compile-gate` | Less 编译门禁（LESS-COMPILE-001） |
| `less-variable-checker` | Less 变量检查 |
| `image-load-verifier` | 图片加载验证 |
| `theme-validator` | 主题校验 |
| `orphan-component-detector` | 孤儿组件检测 |
| `rule-validator` | 规则校验 |
| `phase1-validator` | Phase1 校验 |

### 编排类
| 校验器 | 职责 |
|---|---|
| `validator-coordinator` | 校验器协调器 |
| `unified-adversarial-validator` | 统一对抗校验 |
| `index` | 校验器出口 |

## 十、图节点类型（WorkflowEditor 画布）

| 类型 | 含义 |
|---|---|
| `start` | 入口节点（初始化 state） |
| `end` | 结束节点 |
| `agent` / `skill` | 智能体执行节点（同一概念，新旧术语） |
| `condition` | 条件分支（按 state._decision 路由） |
| `gate` | 校验门（执行真实校验器写 checkResult） |

---

## 关键发现（整理过程中暴露的问题）

1. **🟡 doc-analyzer / config-generator「假注册」**：注册表可见、但调度器 `instantiateRole` 无 case、roles/ 目录无对应类（实际实现在 agents/ 层）→ 编辑器里拖入运行会抛 `未知的 handler`。建议：补 case 或从注册表移除
2. **⚪ 大量引擎内部节点未注册**：screenshot-renderer / visual-comparator / layout-refiner / style-refiner / subcomponent-planner / vue3-engineer 等只在 phase2 生产图内部使用，编辑器不可见。若要做"管线二可编辑"（用户上一诉求），这些节点需逐步开放注册
3. **✅ 当前编辑器可用共 10 个**：figma-connector / visual-parser / layout-reviewer / style-mapper / microcode-engineer / adversarial-checker / hello-agent / url-parser-agent（8 个可运行）+ doc-analyzer / config-generator（2 个假注册）
4. **校验器不属于注册表**：26 个校验器作为 gate 节点能力存在，目前 phase2 内部硬编码调用，未开放为可配置节点
