# Agent Builder（智能体工坊）PRD

> 版本：v0.1（MVP）｜ 日期：2026-08-20 ｜ 作者：产品通 + smigoo
> 关联：WorkflowEditor（/generator/workflow）、create-ai-agent skill、hello-agent 示例

---

## 1. 背景与 Why

### 1.1 现状

- WorkflowEditor 支持**编排**已存在的智能体（多智能体 DAG 管线），但**新增**一个智能体目前是纯代码操作：手写 `roles/*.js` 类 + 改注册表 `workflow.constants.ts` + 改调度器 `dynamic-workflow-graph.js` + 构建重启。
- 已沉淀 `create-ai-agent` 技能与 `hello-agent` 最小示例，验证了"单智能体 = 零件、管线 = 装配线"的架构，但**能力停留在代码层，无界面入口**。

### 1.2 要解决的问题

**产品目标**：让"创建智能体"成为工作流界面的自助能力——用户填写配置，系统生成可运行的单智能体，并立即出现在可用列表、可拖入多智能体管线。

- 用户问题：新增智能体门槛高（需写代码、改 3 处、重启），阻碍平台用户扩展管线
- 业务价值：把"造零件"从开发动作变为产品功能，释放管线编排的组合价值（智能体数量 → 管线可组合性）

### 1.3 概念对齐

| 概念 | 定义 | 现状 |
|---|---|---|
| 单智能体 | 一个 agent 节点：输入 → 处理 → 输出，职责单一 | hello-agent ✅ |
| 多智能体管线 | 多个 agent 节点按 DAG 编排，state 字段在节点间流动 | WorkflowEditor / phase2 ✅ |
| Agent Builder（本功能） | 在界面**创建**单智能体的自助能力 | ❌ 待建 |

---

## 2. 目标用户与用户故事

**目标用户**：平台登录用户（通用开放，MVP 起考虑权限与命名隔离）。

| 用户故事 | 优先级 |
|---|---|
| 作为平台使用者，我希望在界面填写名称/职责/输入输出即可生成可运行智能体，以便无需写代码扩展管线 | P0 |
| 作为编排者，我希望新建的智能体**立即**出现在可用 Agent 列表并可拖入画布，以便快速组装多智能体流程 | P0 |
| 作为使用者，我希望创建时能配置「纯逻辑」模式（无 LLM 依赖），以便简单任务不消耗模型额度 | P0 |
| 作为使用者，我希望创建后能**冒烟测试**（mock 输入看输出），以便确认智能体行为符合预期再进管线 | P1 |
| 作为使用者，我希望复用/复制现有智能体改造成新智能体，以便减少重复配置 | P2 |
| 作为管理者，我希望智能体有命名校验与隔离，以便多用户不冲突、不可误改他人智能体 | P1 |

---

## 3. 范围

### 3.1 In-scope（MVP，P0）

1. **前端入口**：WorkflowEditor 工具栏「＋ 新建智能体」按钮 + 创建表单弹窗
2. **表单字段**：标识（英文 kebab-case，唯一）、显示名称、描述、分类、逻辑类型（MVP 固定"纯确定性"）、输入字段（key+类型）、输出字段（key+类型）
3. **后端生成**：agent-builder 服务——基于安全模板渲染生成 `roles/{name}.js`（复用 hello-agent 模板），写入智能体定义存储
4. **动态注册（热加载）**：改造调度器 `instantiateRole` 为**注册表驱动动态加载**——新智能体创建后免重启即可被调度
5. **校验**：vm 语法校验 + 冒烟测试（实例化 + mock 输入执行）
6. **注册**：自动出现在 `GET /workflows/meta/handlers`，编辑器可用列表可见

### 3.2 Non-goals（明确不做）

- ❌ 不做可视化拖拽式流程编程（管线本身已提供）
- ❌ 不做低代码函数/逻辑编辑器（MVP 仅模板化配置）
- ❌ 不支持 LLM 调用型智能体的 UI 创建（P1，表单预留逻辑类型字段）
- ❌ 不允许任意代码注入（生成代码走模板白名单，不开放自定义脚本）
- ❌ 不做智能体市场/跨项目共享（P2）
- ❌ 不做版本管理/回滚（P2）
- ❌ 不纳入受保护管线（组件/Vue3/页面/接口四条官方管线仍走生产引擎，不读动态注册表）

---

## 4. 功能规格

### 4.1 前端（WorkflowEditor.vue）

**入口**：工具栏「＋ 新建智能体」按钮（与「＋ 新建」「运行」「保存」同排）。

**创建表单（弹窗）**：

| 字段 | 类型 | 必填 | 校验/约束 |
|---|---|---|---|
| 标识 name | text | ✅ | 英文 kebab-case；正则 `^[a-z][a-z0-9-]{2,31}$`；全局唯一（后端校验） |
| 显示名称 label | text | ✅ | 中文/英文均可；≤ 20 字 |
| 描述 description | textarea | ✅ | ≤ 200 字 |
| 分类 category | select | 否 | 预置：数据源/分析/转换/生成/审查/示例；可自定义 |
| 逻辑类型 logicType | radio | ✅ | MVP 固定「纯确定性」disabled；LLM 调用置灰（P1） |
| 输入字段 inputs | 动态列表 | 否 | key（camelCase）+ 类型（string/number/object/array） |
| 输出字段 outputs | 动态列表 | ✅ | key + 类型，至少 1 个 |

**交互**：提交 → loading → 成功提示（含冒烟测试结果摘要）→ 关闭并刷新可用 Agent 列表。

### 4.2 后端（agent-builder 模块）

**新增模块**：`backend-node/src/agent-builder/`（或并入 workflow 模块）

| 接口 | 方法 | 说明 |
|---|---|---|
| `POST /api/agent-builder/create` | 创建 | 校验 → 模板渲染 → 写 roles 文件 → 写注册表 → 语法校验 → 冒烟测试 → 返回结果 |
| `GET /api/agent-builder/list` | 列表 | 用户可见的智能体列表（含内置 + 用户自建） |
| `DELETE /api/agent-builder/:name` | 删除 | 仅作者/管理员；内置智能体不可删 |
| `POST /api/agent-builder/:name/test` | 冒烟测试 | 传 mock 输入 → 实例化执行 → 返回输出 |

**模板渲染**（核心，安全边界）：

```js
// 模板占位符：{{name}} / {{label}} / {{description}} / {{category}} / {{inputs}} / {{outputs}}
// 输入字段 → execute 解构 + 默认值兜底
// 输出字段 → 返回值白名单（只允许声明过的 key，防注入）
// 一律继承 BaseAgent + skipLLM: true（纯确定性）
// 生成代码不包含任何用户原始输入文本（仅字段名），杜绝注入
```

**智能体定义存储**：`config/agents/{name}.json`（用户自建）+ 注册表合并策略：
- `handlers` 接口返回 = 内置注册表（workflow.constants.ts）+ 动态注册表（config/agents/*.json）合并
- 命名冲突：用户自建优先报错（不允许覆盖内置）；用户间冲突后创建者胜

### 4.3 调度器动态化改造（核心架构改动）

**现状**：`instantiateRole()` 是静态 `switch/case`，硬编码 6 个角色。

**目标**：

```js
// 注册表条目扩展：{ ...meta, modulePath: 'roles/hello-agent.js', skipLLM: true }
async function instantiateRole(handlerName, state) {
  const entry = await resolveHandler(handlerName)  // 内置表 + 动态表合并查询
  if (!entry) throw new Error(`未知的 handler: ${handlerName}`)
  const mod = await import(`../${entry.modulePath}`)   // 动态 import，免重启
  return new mod[entry.className](roleCfg)
}
```

**要点**：
- 内置角色迁移为同构注册表条目（行为不变，需回归验证 4 条受保护管线）
- 动态 import 带缓存，新增时清缓存热加载
- 校验门（gate/condition）等非 agent 节点逻辑不动
- **回归要求**：改造后 phase2 生产管线、hello-demo 自定义管线必须重跑通过

### 4.4 校验与冒烟测试

| 校验 | 方式 | 通过标准 |
|---|---|---|
| 语法 | `vm.SourceTextModule` | 无 SyntaxError |
| 实例化 | `new Agent({...})` | 构造成功（skipLLM 无 key 依赖） |
| 冒烟 | `execute(mockInput)` | 返回声明过的 outputs、无异常 |
| 注册 | `GET /workflows/meta/handlers` | 列表包含新智能体 |

---

## 5. 数据模型

```jsonc
// config/agents/{name}.json
{
  "name": "my-agent",            // 唯一标识
  "label": "我的智能体",
  "description": "...",
  "category": "示例",
  "logicType": "deterministic",  // deterministic | llm（P1）
  "inputs": [{ "key": "text", "type": "string", "required": false }],
  "outputs": [{ "key": "result", "type": "object" }],
  "author": "userId",            // 权限控制
  "createdAt": 1787196000000,
  "modulePath": "roles/my-agent.js",
  "className": "MyAgent"
}
```

---

## 6. 验收标准（MVP）

1. 界面点击「＋ 新建智能体」→ 填表提交 → 提示创建成功
2. `GET /workflows/meta/handlers` 立即（免重启）返回新智能体
3. WorkflowEditor 可用列表可见新智能体，可拖入画布连线保存
4. 运行该管线：新智能体被调度执行，输出正确合并进 state
5. 命名冲突/非法标识被拦截并给出明确错误
6. 内置 8 个智能体与 4 条受保护管线回归通过（不回归 = 不验收）

---

## 7. 指标

| 类型 | 指标 | 目标（上线 4 周） |
|---|---|---|
| 北极星 | 智能体创建 → 成功进入管线的转化率 | ≥ 60% |
| 驱动 | 周新增智能体数 | ≥ 5 |
| 驱动 | 用户自建智能体被管线引用次数 | 累计 ≥ 20 |
| 健康 | 创建成功率（语法+冒烟通过） | ≥ 95% |
| 健康 | 创建到首跑耗时（不含排队） | ≤ 5 分钟 |

---

## 8. 分期路线图

| 阶段 | 范围 | 验收 |
|---|---|---|
| **P0（MVP）** | 表单创建 + 模板渲染 + 动态注册表改造 + 冒烟测试 + 回归 | 第 6 节全部 |
| **P1** | LLM 调用型智能体（prompt 编辑 + 模型配置）、节点内测试（mock 输入面板）、权限（作者/管理员）、命名冲突 UI 化 | P0 上线后 2 周 |
| **P2** | 智能体模板库（预置 10+ 模板）、复制/编辑现有智能体、版本管理、跨项目共享 | 按需 |

---

## 9. 风险与对策

| 风险 | 等级 | 对策 |
|---|---|---|
| 动态注册表改造影响现有管线（instantiateRole 重构） | 🔴 高 | 内置角色迁移为同构条目；改造后强制回归 4 条受保护管线 + hello-demo |
| 模板渲染代码注入 | 🔴 高 | 白名单模板（无用户文本进代码）；字段名校验；vm 语法门禁 |
| 热加载缓存失效/内存泄漏（频繁动态 import） | 🟡 中 | import 缓存 + 删除时清缓存；限制创建频率 |
| LLM 配置缺失导致构造失败 | 🟢 低 | MVP 仅确定性智能体（skipLLM），P1 引 LLM 时给配置检查 |
| 用户命名冲突/恶意占用 | 🟡 中 | 后端唯一性校验 + 作者隔离；内置名保留 |
| 与受保护管线边界模糊（用户误以为新智能体进生产管线） | 🟢 低 | UI 明确标注「自定义智能体仅用于自定义管线」 |

---

## 10. 待确认问题（开工前）

1. 动态注册表改造是否接受"内置角色迁移"（一次性重构 + 回归成本）——**已确认：接受（热加载）**
2. MVP 仅纯确定性智能体——**已确认**
3. 平台用户通用——**已确认**；P0 是否要 author 字段与删除权限（建议 P0 带上，成本低）
4. agent-builder 后端归属：新建独立模块 vs 并入 workflow 模块（建议并入，复用 ProgressService/TasksService）
