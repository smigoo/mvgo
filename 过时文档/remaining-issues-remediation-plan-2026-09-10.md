# 剩余未解决问题与治理方案总览（2026-09-10）

> 用途：把当天（2026-09-10）所有「未闭环」的问题、已有治理方案、已落地/未落地状态、验收标准、方案自身风险与「是否真正根治」汇总成一份独立文档。  
> 配套权威文档：`docs/pipeline-governance-v2-2026-09-10.md`（治理原则/顺序）、`docs/device-slot-con-layer-preservation-plan-2026-09-10.md`（A′ 治本）、`docs/tdz-root-cause-2026-09-10.md`、`docs/runtime-js-error-governance-2026-09-10.md`。  
> 当日运维/排障流水在 `.workbuddy/memory/2026-09-10.md`。

---

## 0. 总览（一句话 + 状态图）

当天主线是「**把上个月/昨天的治理真正接管写盘，并补两类闸门**」：Loop 2.0/2.1/3/4 的结构、A′ slot-con 嵌套、TDZ、运行时 fail-closed、视觉双闸门、per-user 队列、快照 exists 协议都已**落到代码并通过单测/构建**。

**唯一最大的未闭环缺口**：三样本（env / traffic / device）**在新代码上重生成 + 肉眼结构对照**尚未做——治理文定义这是「唯一真实验收」，缺此步禁止把任何 Loop 标完成。

| 类别                      | 项数   | 已落地代码         | 仅方案/未验收           |
| ----------------------- | ---- | ------------- | ----------------- |
| 管线结构治理（Loop 2.0/2.1/3）  | 多项   | ✅             | 三样本验收未做           |
| A′ slot-con 嵌套          | 1 大项 | ✅ 代码 + 单测     | 三样本验收未做           |
| 容量门禁（Max 误杀）            | 1    | ✅ 本轮已校准       | 生产未部署             |
| TDZ / 运行时 fail-closed   | 2    | ✅             | 生产未部署             |
| 视觉能力双闸门                 | 1    | ✅             | 生产未部署 + 前端未展示     |
| per-user 队列 / exists 探测 | 2    | ✅             | 生产未部署             |
| frontend ①/② 修复         | 2    | ✅             | 生产未部署             |
| 上报统计全 0                 | 1    | ✅ 本地 dist     | 生产未部署             |
| 公共池 AI 修复               | 1    | ❌ 未定位         | 待报错样本             |
| 微码规范检查（v1.0.20）         | 1    | ❌ 未修（已量化）     | 106 个产物 95 个不允许上线 |
| Loop 4 Golden 前置裁判      | 1    | ⚠️ 代码在，未接入    | 设计缺陷（与生成方共用算法）    |
| 三样本重生成验收                | 1    | ❌             | 需额度授权             |
| device 内联渲染/子组件死代码      | 1    | ✅ 已落地（R2+R3+R1，待验收） | 结构表多解释者（§3.5）   |
| env 同一区域重复生成（双结构）       | 1    | ✅ 已治本 c40af24 | 结果层止血，根在 §3.5 R1  |

---

## 1. 剩余问题清单（按优先级）


### P0-1 三样本（env / traffic / device）新代码重生成 + 肉眼对照未做

- **根因**：所有结构治理、A′、TDZ、容量门禁的代码都只跑了**单测 + 本地构建 + 运行时冒烟（checkpoint 级别）**，没有用同一 Figma 重新生成三个样本后在浏览器/预览里核对真实布局。
- **已有治理方案**：`pipeline-governance-v2-2026-09-10.md` §0/§3 明确「完成 = 三样本重生成肉眼对照」；A′ 文档 §7.3、Loop 审计 §563 均把这一项列为「禁止标完成」的硬门槛。
- **已落地**：env/traffic/device 的治本代码（A′ 嵌套、Loop 2.0/2.1/3、TDZ、容量分块）均已进 src 并构建。
- **未落地**：重生成动作未执行（需额度授权），故「管线绿」在严格意义上**不成立**。
- **验收标准**：
  - device：switch 横贯最上 → 其下 tab 竖栏(左) + cons(右)；不再 tab 最左、switch 在右区顶。
  - traffic：子组件数收敛（不再 30+ 过细）、布局不退化。
  - env：顶部 tab 行不丢、`v-if`+`v-for` 不崩、TDZ 不崩。
  - **新增（本轮，承接 P0-6/P1-8）**：`index.vue` 模板**引用全部 planned 子组件**（死代码归零）、纵向 6 类 tab 不丢、大卡 bg 挂上、模板 class 集合 ⊆ CSS class 集合、同片 figma 区域**只生成一份**（无双结构）。
- **免额度的确定性验收（自我评审补充，降低「未验收」风险）**：不必等额度，可用 checkpoint 的 `figma.json` + `visual.json` 跑**完整 planner 链路**断言结构树——本轮已做：env 4→2、device-hnhl49no 4→3（`inline-row-merger.js` 去重后顶层 sections 收敛），作为「重生成肉眼对照」的**前置/补充**。注意：checkpoint 断言只能验证**结构层**（merger/planner），**不能**替代浏览器肉眼对照（模板/样式/资源挂载仍需真实生成 + 预览）。
- **方案风险/缺陷**：重跑可能暴露新结构漂移（A′ planner 停 flatten 后，prompt/assembler/engineer 消费树尚未全链路核对，见 P1-3）。
- **是否根治**：代码治本已做，但**验收未做**，当前只能说「代码层可能已根治，未经验证」。


### P0-2 生产部署缺口（多项本地改动未上生产）

- **涉及改动**（本地 dist 已含、生产未部署）：
  - 视觉能力双闸门（`model-config.js` / `config.controller.ts` / `config-test.service.ts` / `lite.service.ts` / `phase2.service.ts` / `vision-capability.spec.ts`）
  - per-user 队列（`task-queue.service.ts` + 4 个 controller 的 userId 传参）
  - 快照 exists 探测（`tasks.controller.ts`）
  - TDZ / 运行时 fail-closed（`sfc-tdz.js` / `runtime-error-classifier.js` / `runtime-static-rules.js`）
  - 上报统计（`admin-stats.controller.js` 等，本地已打 dist 但未 scp）
  - frontend ①②修复（`demo/index.vue` / `WorkflowMonitor.vue` / `preview-resolver.ts` / `preview/index.vue` / `TaskDetail.vue`）
- **根因**：当天重心在本地代码落地与构建验证，生产 scp + 重启 + 探活未排期。
- **已落地**：本地 13030 已重启并加载新 dist（PID 多次轮换，最终以端口释放+`Nest started`+`GET /api` 200 为准）。
- **未落地**：ECS scp、生产重启、生产探活、生产多用户并发验证。
- **验收标准**：生产 `GET /api` 200；生产队列 `/api/tasks/queue/stats` 带 token 返回；视觉闸门拦截已知非视觉模型；报表 `user-stats` 不再 404/全 0。
- **方案风险**：`TASK_MAX_CONCURRENT` 本地显式=2（语义已变为「单用户额度」），生产若也显式设过，需确认 `TASK_GLOBAL_MAX_CONCURRENT` 取值；视觉闸门改动需前端配合展示 `visionCheck`/`visionWarnings` 文案，否则用户只看见「保存成功」却不知不能生成。

### P0-3 公共池 AI 修复不可用 —— 根因未定

- **现象**：用户报「公共池 AI 修复无法使用」，未给具体报错文案。
- **已定位三处嫌疑**：
  - 嫌疑 A（ID 语义）：`ComponentDetail.vue:453/461` 兜底用 `component.value._id`（Mongo `_id`）当预览 ID，业务目录名是 `businessComponentId`；`resolveAuthorizedComponent` 归一只在 `component.service.ts:322-360`，仅 sid 空时的兜底分支踩坑。
  - 嫌疑 B（权限）：`component.service.ts:564-571` public 全员可读，`:352 mode==='write'` 走 `checkComponentPermission`（仅创建者/管理员）→ 公共池他人组件写回可能被拒。
  - 嫌疑 C（模型）：`aiFixRenderError` 调 LLM，生产 fenno.ai 曾 429 → 模型侧失败。
- **已落地**：链路已 trace（`preview/index.vue:938` → `demo.controller.ts:57` → `demo.service.ts:133/261`）。
- **未落地**：具体报错、复现步骤、最终根因与修复。
- **验收标准**：给定公共池组件 ID，AI 修复能正常发起、模型返回、写回目录成功（或明确返回业务错误而非静默失败）。
- **方案风险**：三嫌疑可能叠加，需先拿到一条真实报错再定方案，避免盲改。
- **是否根治**：未开始。

### P0-4 上报统计全 0（生产）

- **根因**：生产 Node 跑的 dist **不含 `admin-stats.controller.js`**（新 dist 未部署/未重启）；`GET /api/admin/user-stats` 在生产返回 404 → Java `fetchUserStats()` 拿非 2xx → `emptyMap()` → 全体降级 0。与 09-09 记录同根因。
- **已落地**：本地代码 + 报表口径（`hasConfig` 按 id+uid 双形态）已调整并打 dist；ECS Mongo 直查真值已拿到（注册 85 / 已配置 23 / 已测试生成 22）。
- **未落地**：生产部署 + 验证。
- **验收标准**：生产 `user-stats` 返回与 Mongo 真值一致（非 0），`configMap`（admin.service.ts:183）补 uid 兜底前，lius 类「老 UID 写配置」用户仍会被静默判未配置——**治本在改 `configMap` 加 uid 兜底，不是补数据**。
- **方案风险**：仅部署 dist 不修 `configMap` 双形态，老 UID 用户统计仍偏少。
- **是否根治**：部署可恢复数值，但 `configMap` 单键缺陷未修 → 部分假性「未配置」仍在。


### P0-5 微码组件 v1.0.20 规范检查不通过（106 个产物 95 个不允许上线）

- **现象**：用 `frontend-mc-check`（`scripts/mc-check.cjs`，spec **v1.0.20**）检查 `frontend/workspace/custom-components`：
  - 全量 **397 个目录：允许上线 11，不允许 386**；
  - 剔除混入的非组件目录（hash 命名如 `6a7599af…`、`v2-e2e-*` 测试件、空壳目录）后，**106 个真实生成产物：允许上线 11，不允许 95（不合规率 89.6%）**。
- **失败项分布（合法命名 106 个，按命中数）**：
  | 检查项                              | 命中     | 级别        | 说明                           |
  | -------------------------------- | ------ | --------- | ---------------------------- |
  | M5-10 硬编码颜色                      | 102    | warning   | 样式写死色值，未走 CSS 变量（不影响上线）      |
  | **M5-6 `@fontSize` 变量声明与使用**     | **68** | **error** | **头号阻断项**，67 例同一句报错          |
  | M1-1 componentId 规范              | 50     | error     | 全为「与目录名不一致」                  |
  | M5-2 `$mcComponentBuilder` 只调用一次 | 14     | error     | 产物中重复调用                      |
  | M4-6 `index.less` 被引用            | 8      | error     | 主组件未引 `index.less`           |
  | M5-4 / M3-12 / M3-13 / M3-1 等    | 5–7    | error     | 零散项（事件一致性、内容布局、dark 主题、必填字段） |
- **根因（不是「模型写得差」，是**自愈层写反&#x4E86;**——已实锤到代码行）**：
  1. **M5-6（68/106）**：LLM 按 prompt（`prompt-builder.js:2300-2304`）写的是 `font-size: @fontSize`（**本来是对的**），被两段自愈改坏：
     - `file-writer.js:648-666` 把 `theme-vars.less` 归一为 `@fontSize: var(--fontSize);`（✅ 正确，规范要求的精确映射）；
     - `code-healer.js:1431-1439` 把业务样式的 `@name` 替换为 `var(--${name}, ${def})`，而此时 `def` 已是 `var(--fontSize)` → 产出 **`var(--fontSize, var(--fontSize))`**：fallback 指向自己，且绕过 LESS 变量层 → 规范判「声明了却没用」→ 失败。
     - **反证**：`c-device-monitor-l0rxb0x4-c34eb871` 的 `@fontSize` 声明不在 mixin 闭包内、未命中替换 → 保留 `font-size: @fontSize` / `calc(@fontSize * 1.1429)` → **该项通过**。说明管线本就能产出正确形态，是后处理把它改坏。
     - **同类正确实现已存在**：`file-writer.js:562` 对 SFC 内嵌 `<style>` 注入的是 `@fontSize: var(--fontSize);` 声明（保留 `@fontSize` 引用）——同一套做法没应用到独立 `.less` 文件，这才是分叉点。
  2. **M1-1（50/106）**：`declare.json` 的 `componentId` 与落地目录名不同步（`c-monitor-N` 26 例、`c-env-monitor-N` 23 例）→ 组件改名/复用 ID 时未把目录名作为单一事实源。
  3. 附带：`$mcComponentBuilder` 重复调用（14）、`index.less` 未引用（8）、颜色未变量化（102，warning）。
- **已落地**：量化诊断完成（全量报告 `mc-report.html/md` + 失败项统计），根因定位到具体文件与生成表达式。
- **未落地**：管线修复（一行代码未改）。
- **修复方案（治本：改生成管线，禁止直改产物）**：**完整方案见 `docs/mc-spec-compliance-plan-2026-09-10.md`**（五层：L1 修反向自愈 / L2 合规自愈层 / L3 ID 单一事实源 / L4 门禁前移 / L5 防回归测试）。要点：
  - **L1（M5-6，最关键）**：在 `file-writer.js` 第 666 行之后、678 行（`healThemeMixinVarRefs`）之前，对**非 themes 的业务 `.less`** 注入顶层声明 `@fontSize: var(--fontSize);` → `code-healer.js:1413-1414` 的 `localDeclared` 命中即跳过 var() 替换 → `@fontSize` 保留、LESS 编译也通过。**不需要改 `code-healer.js` 的替换逻辑，风险最小**；也不必在 A1/A2 之间妥协。
  - **A1（推荐）样式生成统一走 LESS 变量层**：`microcode-engineer` 产出样式时把 `font-size: var(--fontSize…)` / `calc(var(--fontSize, var(--fontSize)) * 1.429)` 改为 `@fontSize` / `calc(@fontSize * 1.429)`；`theme-vars.less` 保持 `@fontSize: var(--fontSize)` 映射；同时去掉 `var(--x, var(--x))` 自指 fallback。
  - **A2（备选，仅当确认不用 LESS 变量层）**：不要在 `css-vars.js` 声明用不到的变量（杜绝「空头声明」）。**需与规范维护方确认 A1/A2 哪条是正解**，二者选一，不可并存。
  - **B ID 单一事实源**：组件落地/改名时以**目录名**为准强制回写 `declare.json` 的 `componentId`，发布链路加断言（不一致直接失败，不静默）。
  - **C 构建器幂等**：`$mcComponentBuilder` 产物后处理去重 + 断言只调用一次。
  - **D 颜色变量化**：随 A1 一起把硬编码色值抽到 CSS 变量（消 M5-10 warning）。
  - **E 接入门禁（建议）**：把 `mc-check.cjs` 的 M 系列接入生成完成后的校验（与 L0-B 并列），`error` 项直接 BLOCK，避免「生成通过、投放被拒」。
  - **硬原则（本次事故教训）**：**任何自愈都不得把「已经符合规范的形态」改写成不合规形态**——prompt 与后处理必须同向。
- **验收标准**：修复后重跑同一份扫描，合法命名组件的 **error 项归零**（M5-6 / M1-1 / M5-2 / M4-6），可上线率从 11/106 提升到 **≥90%**；M5-10 warning 显著下降；新生成组件首次检查即通过。
- **复跑方法（脚本有路径约束）**：`mc-check.cjs` 的 `ROOT = resolve(__dirname,'../../../..')`，必须把工具**复制**到 `<项目根>/aidocs/skills/frontend-mc-check`（软链无效，`__dirname` 解析真实路径），且被扫目录需位于 `<项目根>/src/workspace/custom-components`（mvgo 实际在 `frontend/workspace/custom-components`，需软链）：
  ```bash
  cp -R ~/Downloads/frontend-mc-check <项目根>/aidocs/skills/
  mkdir -p <项目根>/src/workspace
  ln -sfn <项目根>/frontend/workspace/custom-components <项目根>/src/workspace/custom-components
  cd <项目根> && node aidocs/skills/frontend-mc-check/scripts/mc-check.cjs --output-dir /tmp/mc-check-all
  ```
- **方案风险**：
  - 改样式生成会影响**所有新组件**的变量解析方式，必须做三样本（env/traffic/device）回归，否则可能引入新的视觉回归。
  - **存量 397 个产物不回刷仍然不合规**，需明确决策：只保证新增合规，还是写一次性回刷脚本（后者风险高、需逐组件验证）。
  - 目录里混入的非组件目录（hash 名、`v2-e2e-*`）会污染统计，验收时应按 `^c-[a-z0-9-]+$` 过滤后再评估。
- **是否根治**：否（未修），当前仅完成量化与根因定位。


### P0-6 device「index.vue 内联渲染 + 子组件全死代码」—— 结构失真（已落地，待验收）

- **原始问题（用户实锤 4 症状）**：`mc-max-1789046782479-465cd516(c-device-monitor-0quu3hqa-465cd516)` ① 插槽出现在内容区域 ② 大的 tab 背景没出现、样式有差异 ③ 纵向大类 tab 消失 ④ list item 样式布局不对。
- **根因（逐条取证，读产物不猜）**：
  1. `package/index.vue` 模板 **0 处引用任何子组件**（`grep -cE "<(HeaderSection|SwitchSection|TabsSection|HeaderStats|AbnormalStats|ViewTabs|DeviceGrid)"` = 0），7 个 import 全是**死代码** → 真实结构只活在未挂载的子组件里。症状③铁证：`TabsSection.vue` 里**正确生成了 6 项纵向 tab**（监控/照明/通风/消防/交通诱导/供配电 + 计数 `3/3740`、`3`），却从不渲染。
  2. **chunk 顺序**：2→4 是 index（模板/状态/生命周期），5→11 才是子组件。`buildTemplateChunkMiddle`(`prompt-builder.js`) 里子组件拆分只写「复杂组件**强烈建议**…若 ≥3 个清晰业务区域」= **建议非强制**；`buildSubComponentNamingGuidance` 只给「建议名称」让 LLM 自定 → 模板段选了**内联手写整份 DOM**。而脚本段(chunk 3)按计划名单**无条件 import** 全部子组件 → 死代码。子组件文件路径由 `detectSubComponents`（resource-mounter.js:2477）从脚本段 import 提取 → 模板/脚本/文件名三者由不同 LLM chunk 各自决定。
  3. 内联时的连带失真：bg 资源只 import 不挂（模板 `background-image/:style` 0 处、`<img class="…stat-icon" />` 无 `:src`）→ 症状②；tab 类名 `:class="['c-device-monitor-tab-item',…]"` 漏实例前缀（CSS 是 `.c-device-monitor-0quu3hqa-c-device-monitor-tab-item`）→ 症状④；把纵向 6 项缩成横向 2 项 `viewTabs=监控/照明` → 症状③；模板 0 处具名插槽（无 `<template #header-right>`）→ 症状①（⚠️ 此条为**推断**：「插槽」的具体所指尚未与用户逐一确认，待用户指正）。
- **已落地（2026-09-10 晚）**：R2 正向（`022526c` 强制装配+禁止内联铁律、`2b8a60b` 确定性子组件命名）+ R3 反向（`d251774` CODE-020/021/022 门禁）+ R1（`a0f9e6a` 结构树单一事实源）——正向强制 + 反向兜底两侧闭环。
- **未落地**：三样本重生成肉眼对照（P0-1）。
- **验收标准**：重跑后 index 模板引用全部 planned 子组件（死代码归零、CODE-021 不触发）；纵向 6 类 tab 恢复；大卡 bg 与卡片布局还原；模板 class 集合 ⊆ CSS class 集合（CODE-020 不触发）。
- **是否根治**：**代码层已落地，未经验证**——需三样本重生成证明「失真从机制上不再发生」。


### P1-1 Max 复杂度容量门禁（已治本，本轮校准）

- **原始问题**：`mc-max-1789036112943-460346bf` 报 `⚠️ 组件复杂度超出当前模型能力` + `[模型能力检查] 组件复杂度较高，建议升级模型或简化设计`。
- **根因**：整组件估算 44860 tokens，`claude-opus-4-8` 上限 32768；容量检查在**分块决策之前**硬失败，本可正常分块生成的组件被误杀。
- **第一版治本（当日早）**：容量检查后移到 `shouldSplitIndexVue()` 之后，用 `estTotal / chunkCount`（5 或 7）算单段。
- **本轮校准（当前）**：发现 `5/7` 是**进度编号不是等权分母**，真实权重为 template 0.1 / script 0.3（scriptSplit 三段各 0.3）。已抽纯函数 `chunk-budget.js:getIndexVueChunkBudgets/getMaxIndexVueChunkBudget` 作为**容量门禁与分块下发共用单一事实源**；门禁比较的是真实最大块 `requestedMaxTokens`（`estTokens*1.2+1024`，与 `generateSingleChunk.dynamicMax` 一致）。
  - 实证：44860 整组件 → max chunk script≈13458 → requested≈17383 < 32768 → **放行**（原逻辑误杀）。
  - 真超限判定：仅当某真实块 `requestedMaxTokens > 模型上限` 且能力已识别（`identified && limitKnown`）才硬抛 `MODEL_CAPACITY_EXCEEDED`。
- **已落地**：`chunk-budget.js` 新增 + spec（6 用例）、`microcode-engineer.js` 改用 `getMaxIndexVueChunkBudget`、`code-generator.js` 改用 `getIndexVueChunkBudgets`、acorn 校验通过、构建进行中。
- **未落地**：生产部署；极端超大组件（脚本必须 > 上限）的真超限路径未在真实模型上跑过。
- **验收标准**：同 Figma 重跑该 Max 任务不再误报容量超限；真超限任务（如 requested > 模型上限）仍准确报错。
- **方案风险**：`estimateIndexVueSize` 公式本身偏保守（41 个 section 含大量 inline-row，视觉覆盖率仅 40/56），可能仍会高估；但高估只影响「建议升级」提示，不再误杀可分块任务，可接受。
- **是否根治**：是（逻辑层面），待生产验证。

### P1-2 视觉能力双闸门（已治本，口径已纠正）

- **原始问题**：deepseek-v4 不支持视觉但保存后仍生成，组件与截图无关。
- **根因**：判定依赖 `isVisionModel()` 模型名白名单，与实际能力脱钩；保存/生成路径均无 fail-closed。
- **治本**：判定只认实测结论 `resolveVisionCapability()`（`true/false/null`，null=fail-closed）；保存时**永远允许**但承担视觉角色的模型需实测并落盘，返回 `visionCheck`/`visionWarnings`；生成时 `vision !== true` 一律拒绝。
- **已落地**：`model-config.js`（`markModelCapabilityIdentified`/`resolveVisionCapability`）、`config.controller.ts`（`detectVisionCapabilityOnSave`）、`config-test.service.ts`、`phase2.service.ts`/`lite.service.ts` 生成闸门、spec 8/8 + 6/6。
- **未落地**：生产部署；前端未展示 `visionCheck`/`visionWarnings` 文案。
- **验收标准**：非视觉模型保存成功但生成被拒并报明确错误；前端保存后提示「已保存，但不能用于组件生成」。
- **方案风险**：保存时同步检测会消耗额度/变慢，已用「已有结论复用」缓解；脱敏 key 无法检测时标 null 放行，靠生成闸门兜底。
- **是否根治**：是（逻辑层面），待生产 + 前端展示验证。

### P1-3 A′ slot-con 嵌套消费层未全链路核对

- **原始问题**：device「大 tab 应最上」本质为 `slot-con(89:40)` 容器层级在视觉分区/merger 阶段丢失。
- **治本**：`container-rebuilder.js:rebuildSlotConContainers` 在 merger 之后、planner 之前基于 figma 真值恢复纵向容器嵌套；planner 停 flatten、保留 children 树；prompt/assembler 透传。
- **已落地**：Phase 1→4 + 单测（8/8）+ 嵌套回归（6 suites/45 tests）+ 本地 13030 重启 + checkpoint 冒烟（sections 41→40，89:40 重建、children=[89:38,89:37]）。
- **未落地**：三样本重生成验收；engineer 强制拆分块仍有按顶层 `effectiveSections.length` 计数的残留（文档 §7.3 已记）。
- **验收标准**：device 重跑后 switch 在最上、tab 竖栏在左下、cons 在右下；env/traffic 不退化。
- **方案风险**：planner 停 flatten 后，prompt/assembler/engineer 是否全按树消费仍需逐处核对（文档 §3 已列消费面清单）；高度比例 `figma-height-ratio.js` 对容器 section 的处理需重跑验证不退化。
- **是否根治**：结构层已治本，消费层残留 + 验收未做。

### P1-4 TDZ / 运行时 fail-closed（已治本）

- **原始问题**：env 样本 `activeTab` TDZ 运行时崩；生成模式对非确定性错误 fail-open 降级，与 `v-if`+`v-for` 硬 BLOCK 不对等。
- **治本**：
  - `sfc-tdz.js:findTdzReferences/autoFixTdzReferences` 覆盖**引用型** TDZ；`mergeScriptParts` 合并后自检 + `validateVueScriptSemantics` 第 6b 节扩展。
  - `runtime-error-classifier.js` 补确定性模式（含 `Cannot access ... before initialization`、优先消费 `RUNTIME-004.evidence.errorType==='vue-render'`）；phase2 降级分支仅放行非确定性。
  - `runtime-static-rules.js` 统一 `RUNTIME-STATIC-*` 编号中心。
- **已落地**：spec 8/8 + 11/11 + 8/8；回归 42/42 + 47/47；dist + 重启。
- **未落地**：生产部署；生成期能静态判定的运行时错误统一登记（G3 待排期）。
- **验收标准**：env 类样本重跑不再 TDZ 崩；生产相同样本生成稳定。
- **方案风险**：`findTdzAssignments` 旧函数仍零调用（虚设），已用新 `sfc-tdz.js` 覆盖；既有 `sfc-semantics.spec.ts` 因 `import.meta` 基线失败，不影响新模块。
- **是否根治**：是（逻辑层面），待生产验证。

### P1-5 per-user 队列 + 快照 exists 探测（已治本）

- **原始问题**：新用户首次生成即排队（全局 2 槽共享）；Lite 预览 `resources/styles/index.css` 404（exists 探测协议后端未实现）。
- **治本**：
  - 队列改 `sessionOwners` + `GLOBAL_MAX_CONCURRENT` 天花板；`getRunningCount` 补 `reapStaleRunningTasks` 修口径不一致；`releaseSlotInternal` 统一释放；调度时某用户满不堵他人。
  - `tasks.controller.ts` 实现 `exists` 查询参数，探测永不 404。
- **已落地**：per-user spec 7/7；dist 符号校验；本地 13030 重启加载。
- **未落地**：生产部署；真实多用户压力验证。
- **验收标准**：生产多用户并发互不阻塞；Lite 预览无 404（RUNTIME-007 不误判）。
- **方案风险**：批量替换曾把 `releaseSlotInternal` 自身替换为自递归（已修）；`TASK_MAX_CONCURRENT` 本地语义已变单用户额度，生产需确认。
- **是否根治**：是（逻辑层面），待生产验证。


### P1-7 「摄像机类组件布局被拍平 + 颜色样式丢失」回归（已治本，本轮）

- **原始问题（用户实锤）**：`mc-max-1789042321732-b04286b9` 崩溃 `chunkBudgets is not defined`；且「内部摄像机每次布局不还原，做成最简单从上到下，颜色样式也没还原，但早期正常过」。
- **根因（确定性证据链）**：`a78a980`(09-10 10:51) 引入的 `mergeInlineRowsIntoSections`（`inline-row-merger.js`）把 `rebuildSectionsPreservingInlineRows`（`inline-row-rebuilder.js`）**对整棵 Figma 树递归**检测到的 **44 个同行 frame** 无条件 `push` 到**顶层** `layout.sections`。其中 43 个是**深层嵌套**（depth 2~6，含 switch/active/default 状态态、卡片内部 `Group 1321317970`）。→ 原始 3 个业务 section 被炸成 **41 个平级 inline-row**（时间线实锤：09-10 12:01 起所有 device-monitor 组件 sections 从 3→41）。
  - 连锁：planner 消费 `layout.sections` → `effectiveSections` 出现 `2:8787 active`/`89:38 switch` 等**内部状态子元素**被当独立区块 → 子组件从 **3 个炸成 21 个**（`ActiveCard/DefaultCard/ActiveLine1/DefaultIcon…` 全是 switch 卡片内部状态态）→ 卡片语义与设计 token 继承链断裂 = 用户感知的「拍平 + 颜色样式丢失」。
- **治本 A（层级收敛）**：`inline-row-merger.js` 新增第 3 参数 `figmaData`，启用**层级收敛**——仅保留「最大连通分量根」的并行块：(a) parent 不是任何 inline-row；(b) parentDepth ≤ 1（组件根直接子/一级容器）；(c) 其 id 不被其他行作为成员引用。`visual-parser.js:1464/1467` 两处传入 `figmaData` 启用收敛；不传 figmaData 保持旧行为（零回归）。
  - 实测收敛：**41 → 4 顶层**（2 业务 section + `2:8419` header 并行块 + `89:40` slot-con 容器重建 children=2），层级保真。
- **治本 B（顺序重排，用户追加反馈「头部插槽放到了下面」）**：收敛后 `merged.push` 仍**无条件追加末尾** → header（figma y=441 最小）被排到业务 section 之后（实测 `[0] section-header-stats [1] section-main-body [2] 2:8419(header)`），产物 `</base-panel>` 后跟 `<HeaderStats />` 挤出面板外且在下。治本：新增 `figmaYOf(nodeId)`（遍历 figma 树取 `absoluteBoundingBox.y`）/`sectionY(sec)`，合并后 `withY.concat(newBlocks)` **按 y 升序统一重排**全部 section；无 y 的纯语义业务壳用 `1e6 + idx` **沉底**。
  - 澄清：本问题**与 headerSlots 识别无关**——headerSlots 数据源是 `inlineCompositeRows`（`visual-parser.js:1456`），不消费 merger 产物；headerSlots 渲染落 `<template #header-right>` 具名插槽，位置由框架头部区决定。真实机制是 planner 按 sections 顺序把 header 区块子组件排到 main-body 之后。
  - 沉降哨兵方向坑：首版误用 `-1e6 + idx` 会让业务壳压过 header（header 落 [2]）；改 `1e6` 后正确。
- **已落地**：`chunkBudgets` 崩溃修复；`inline-row-merger.js` + spec **7/7 绿**（含顺序治本「header 在 index 0」断言）；`container-rebuilder`+`subcomponent-planner-nested`+`prompt-builder.nested-container` 15/15 绿；acorn OK；`npm run build` 通过（BUILD_EXIT=0，dist 21:02 > src 21:01，`grep -c figmaYOf dist`=3）；重启 **PID 64874** 监听 13030，`GET /api` 200。提交 backend-node `44b3d67`（收敛+传参）/ `433b7fd`（顺序重排）。
- **未落地**：三样本（env/traffic/device）新代码重生成 + 肉眼对照（需额度验证收敛与排序是否泛化到非 device 组件）。
- **验收标准**：重跑同类含深层嵌套的组件，顶层 sections 维持业务语义层级（不再 41+），**header 区块排在 sections[0]**（不再沉底），子组件数回落到合理范围（3~8），布局保真 + 颜色 token 继承不断裂。
- **方案风险**：收敛判据假设「卡片内部并行不应进顶层」——若某业务组件本身就是「卡片 + 卡内并行」且希望卡内并行当顶层区块，需再评估；当前 device/traffic/env 实测均符合。
- **是否根治**：是（逻辑层面），待三样本重生成验证泛化。


### P1-8 env「同一区域生成两套 tabs/icons」—— 语义壳 vs 几何块双结构（已治本）

- **原始问题（用户实锤）**：`mc-max-1789046776453-ccbd7891(c-env-monitor-d86yzvac-ccbd7891)` 生成中预览出现**两套 tabs（一氧化碳/能见度/洞内照明/洞外光强）+ 两套 icons（角标 6 / 8）**。
- **根因（确定性证据链）**：Vision 把同一行拆成语义壳（`header-tabs`「Tab切换栏」+ `header-controls`「头部控件组」），merger 又把该行整体提升为几何块 `89:42`（成员 = `2:7889 tabs-list` + `89:43 tabs-icon`）→ **两者描述同一片 figma 区域**却都留在顶层 sections → planner 出 4 个 effectiveSections → engineer 各生成一个子组件（`SubT.vue` + `HeaderTabs.vue` + `HeaderControls.vue` + `ChartSection.vue`）→ `index.vue` 同时装配 → 重复渲染。
- **治本（commit `c40af24`，`inline-row-merger.js`）**：语义壳去重——几何行保留（真值几何），语义壳若其子元素被某几何行**子树证据**覆盖 ≥0.6 则剔除，保证「同一 figma 节点只落一次」。证据=几何行子树全部 id / **id 尾号** / TEXT 文案 / 非通用节点名（排除 `Frame|Group|Rectangle|…`）；命中=`figmaNode`/`figmaNodeId` 精确或尾号、**资源文件名尾号**（`icon-7941.png`→`7941`，命名见 `figma-connector.js:1181` 取 id 冒号后半段）、`name`/`text`/`label` 文案。无 figmaData 零回归；顺带把 `figmaYOf` 从「每 section 重建全树索引」改为共用单次 `buildFigmaIndex`（原 O(n²)）。
- **实测**：env 4→2 顶层（`89:42` 几何 + `chart-section`），`header-tabs`/`header-controls` 剔除；device-hnhl49no 4→3（删 `section-header`，**保留 `section-main`**——含 12 卡所属 `cons(2:8437)`，误删会丢内容）。spec 13/13 + 相关 5 套件 29/29 绿；dist 22:09 新符号在；重启 PID 4916 `/api` 200。
- **未落地**：三样本重生成验证（当前 workspace 的 env 产物是 21:31 旧代码生成）。
- **是否根治**：**结果层止血**——在 merger 层裁掉了重复；但「为什么会产生双结构」的根（结构表多解释者、无强制契约）未除，属 §3.5.2 R1 范畴。

### P1-6 frontend ①②：Playground 预览不刷新 + Lite 进度条（已治本）

- **原始问题**：  
  ① `demo/index.vue` 仅 `file.name==='index.vue'` 才 `refreshPreview()` → 改子组件/LESS 永不刷新；`previewUrl` 钉死旧 revision、生产 `/__invalidate` 不可用。  
  ② `WorkflowMonitor.vue` 的 `NODE_STAGE_MAP` 只认 Phase2 节点 ID，Lite 推英文 stage → 恒定 1/8。
- **治本**：① 删除 index.vue 限制，任意文件保存都刷新；`preview-resolver` `buildSnapshotFileUrl` 加 cacheKey（route `_t`）。② `WorkflowMonitor` 新增 `LITE_PIPELINE_STAGES` + `LITE_NODE_STAGE_MAP` + `getStageConfig` 分流。
- **已落地**：frontend 改动在 git diff 中（未提交）。
- **未落地**：生产 dev/build 部署验证。
- **验收标准**：Playground 改子组件/LESS 预览实时刷新；Lite 进度条 1/4→4/4 且阶段名中文。
- **方案风险**：cacheKey 可能影响正常缓存命中率，已用 route query 低频参数缓解。
- **是否根治**：是（逻辑层面），待生产验证。

### P2-1 Loop 4 Golden 前置裁判未真正接入生成

- **问题**：`figma-golden-extractor.js` / `manifest-auditor.js` / `docs/golden-manifests/*` 代码存在，但：
  - 建在乱写盘之前（治理文 D6 点名）；
  - extractor `import buildResourceManifest` → **裁判与选手共用归属算法**（C8）→ 锁的是资源表不是结构表；
  - 未接入生成门禁，不能当 Loop 4 完成。
- **治理方案**：Loop 4 准入须在 Loop 2.1+3 三样本过之后；Golden 不得 import 工程师/装配/解析层，归属算法若必须共享抽到第三文件 `section-key.js`；生成门禁 `diff(golden, working)` 对 structural.shifted / resource.misbound / chartType mismatch / height0 → BLOCK。
- **已落地**：草稿代码在仓。
- **未落地**：独立路径重构 + 接入生成门禁。
- **验收标准**：Golden 与 working 不共用算法；重跑 diff 能拦结构漂移。
- **方案风险**：若与生成方共用算法，diff 永远自洽 → 形同虚设。
- **是否根治**：否（设计缺陷未修）。

### P2-2 `configMap` 单键导致老 UID 用户假性「未配置」

- **问题**：`admin.service.ts:183` `configMap` 只按 `u._id.toString()` 查，无 uid 兜底；`:200 statsMap` 已修双形态。老流程写 UID 字符串的配置会被静默判 `hasConfig=false`。
- **治本**：`configMap` 加 uid 兜底（与 statsMap 同策略），**不要靠补数据掩盖**。
- **已落地**：仅诊断；报表已用 Mongo 直查双形态拿到真值。
- **未落地**：代码修复 + 验证。
- **验收标准**：lius 类用户在生产 `hasConfig` 与 Mongo 真值一致。
- **是否根治**：否（未修）。

---


## 2. 落地状态表（文件级）

| 文件                                                         | 改动                         | 单测     | 构建             | 本地重启 | 生产 |
| ---------------------------------------------------------- | -------------------------- | ------ | -------------- | ---- | -- |
| `ai-engine/roles/microcode/chunk-budget.js`                | 新增（容量门禁单一事实源）              | spec 6 | 进行中            | —    | 否  |
| `ai-engine/roles/microcode-engineer.js`                    | 容量门禁改用真实块预算 + leafSections | 嵌套 45  | 进行中            | 是    | 否  |
| `ai-engine/roles/microcode/code-generator.js`              | 分块预算复用 chunk-budget        | 嵌套 45  | 进行中            | 是    | 否  |
| `ai-engine/utils/container-rebuilder.js`                   | 新增 A′ 容器重建                 | 8/8    | ✅              | 是    | 否  |
| `ai-engine/roles/subcomponent-planner.js`                  | A′ 停 flatten + 透传          | 嵌套 7   | ✅              | 是    | 否  |
| `ai-engine/utils/sfc-tdz.js`                               | TDZ 引用型                    | 8/8    | ✅              | 是    | 否  |
| `ai-engine/utils/runtime-error-classifier.js`              | 确定性模式                      | 11/11  | ✅              | 是    | 否  |
| `ai-engine/validators/runtime-static-rules.js`             | 编号中心                       | 8/8    | ✅              | 是    | 否  |
| `ai-engine/utils/model-config.js`                          | 视觉能力识别                     | 8/8    | ✅              | 是    | 否  |
| `config/config.controller.ts`                              | 视觉保存检测                     | 6/6    | ✅              | 是    | 否  |
| `config/config-test.service.ts`                            | 视觉落盘                       | 6/6    | ✅              | 是    | 否  |
| `lite/lite.service.ts` / `phase2/phase2.service.ts`        | 生成 fail-closed             | 8/8    | ✅              | 是    | 否  |
| `queue/task-queue.service.ts` + 4 controller               | per-user 队列                | 7/7    | ✅              | 是    | 否  |
| `tasks/tasks.controller.ts`                                | exists 探测                  | —      | ✅              | 是    | 否  |
| `frontend/views/demo/index.vue`                            | 预览刷新                       | —      | ✅ 25s          | —    | 否  |
| `frontend/components/generator/WorkflowMonitor.vue`        | Lite 进度                    | —      | ✅ 25s          | —    | 否  |
| `frontend/utils/preview-resolver.ts` / `preview/index.vue` | cacheKey                   | —      | ✅ 25s          | —    | 否  |
| 微码产物（`frontend/workspace/custom-components`）               | v1.0.20 规范检查               | —      | ❌ 106 个 95 不合规 | —    | 否  |

> backend 当前 git 未提交改动：`microcode-engineer.js`、`model-config.js`、`config-test.service.ts`、`config.controller.ts`、`lite.service.ts`、`phase2.service.ts`（视觉闸门线）+ 本轮 `chunk-budget.js`/`code-generator.js`/spec。frontend 未提交：`WorkflowMonitor.vue`/`preview-resolver.ts`/`demo/index.vue`/`preview/index.vue`/`TaskDetail.vue`。docs 未提交：`device-slot-con-layer-preservation-plan` 等。

---

## 3. 方案自身存在的问题（诚实复盘）

1. **「单测绿 = 管线绿」反复复发**：09-09 已点名，09-10 仍因「jest 全绿 + nest build 成功」多次宣告阶段性完成，直到审计发现三样本未重跑、源码曾处于损坏态（leafSections 未声明）。**根因**：缺少「真实验收」的自动化门槛，本地 checkpoint 冒烟不等于浏览器肉眼对照。
2. **增量 build 假绿**：`nest build` 只重编改动文件，src mtime 晚于 dist 时改动没进产物（lite 17:14 vs dist 16:33）。**教训**：每次改完必须比对 src/dist mtime + grep 新符号。
3. **Edit 工具成功但未落盘**：5 次 Edit 全报成功，磁盘未变 → 源码混合态、dist 假绿。**教训**：大文件改完用 grep/Read 复核真值。
4. **容量门禁第一版等权分母错误**：`estTotal/5|7` 把进度编号当分母，极端超大组件会错误放行。**已本轮用 chunk-budget 单一事实源修正**。
5. **Loop 4 Golden 与生成方共用算法**：裁判不独立，diff 自洽 → 不可作门禁。设计缺陷，未修。
6. **A′ 消费层残留**：planner 停 flatten 后，engineer 强制拆分块仍有按顶层 `effectiveSections.length` 计数的残留，需逐处核对树消费。
7. **两道门禁脱节（本轮新发现）**：平台内部 L0-B 与公司微码规范（`frontend-mc-check` v1.0.20）是**两套互不知晓的标准**——生成侧只过 L0-B，产物「生成通过」却在投放项目时被规范脚本拦下（106 个产物 95 个不允许上线，头号阻断项 M5-6 是纯确定性的变量使用问题）。**教训**：门禁要覆盖「交付口径」而不只是「生成口径」，否则质量闸门形同半道失守；同理，规范扫描的统计口径也要过滤非组件目录（hash 名 / 测试件），否则会误判整体不合规率。

---

## 3.5 系统性根因与根治方向（把「东补西补」收敛为三条根治线）

### 3.5.1 根因的根因

今天所有**结构失真类**问题（P1-7 拍平、P1-8 双结构、P0-6 死代码、类名前缀不命中、bg 未挂）**同出一源**：

> **结构表 `layout.sections` 在管线里有多个「解释者」、彼此无强制契约，导致同一份 Figma 被反复重构、反复失真。**

> ⚠️ **归因边界（自我评审修正）**：LESS-COMPILE（`common.less` 漏 `}`）、bcrypt TS2307、TDZ 属**输出格式/编译类**——根因是「LLM 输出格式错误 + 自愈层反向改写」，与「结构多解释者」**不是同一根因**。本节只收敛**结构失真**这一类；格式类问题靠已有自愈 + 门禁（P1-4、LESS 自愈）治理，不混入「多解释者」结论，否则「根因的根因」会因归因过宽而失真。

| 环节           | 谁在解释        | 产出                              | 失真的地方                                 |
| ------------ | ----------- | ------------------------------- | ------------------------------------- |
| Vision       | LLM         | 语义壳 sections                    | 把一行拆成 `header-tabs`/`header-controls` |
| merger       | 代码（bbox 几何） | 几何块 + 语义壳                       | 与语义壳并存 → 双结构（P1-8）                    |
| planner      | 代码          | effectiveSections + internal 拆分 | 又一层重排/折叠/拆                            |
| engineer 模板段 | LLM         | index.vue `<template>`          | **内联手写 DOM、不引用子组件**（P0-6）             |
| engineer 样式段 | LLM         | `common.less`                   | 类名前缀自造 → 与模板不命中                       |
| 资源挂载         | 代码          | `:style`/bg import              | import 了却不挂（P0-6 症状②）                 |

因为**没有一层是「唯一权威」，也没有任何一层去校验上一层**，每个环节都在「重新解释 Figma」，每解释一次就失真一点。过去我们都在**每个失真的出口加一个补丁**（去重、收敛、排序、自愈、前缀补齐…），补丁越多，各层之间的对齐越难维持——这就是「东凑西凑打补丁」的本质。


### 3.5.2 根治三线（R1 / R2 / R3）

> ✅ **落地状态（2026-09-10 晚）**：三线核心已全部落地并构建/重启/加载，代码层闭环；**三样本重生成肉眼对照（P0-1）是唯一真实验收，仍未做**。
> - **R3 门禁闭环** — ✅ 已落地（`d251774`）：`code-structure-validator.js` 新增 CODE-020（反向类名不命中）/ CODE-021（子组件死代码）/ CODE-022（资源未挂）三检测器，catch 走 BLOCK（fail-closed）。
> - **R2 模板确定性装配** — ✅ 核心已落地（`022526c` + `2b8a60b`）：① `buildTemplateChunkMiddle` 把「强烈建议」改「强制装配 + 禁止内联铁律」；② `section-tree.js#assignSectionComponentNames` 确定性命名（type 优先稳定映射 + 序号去重），`buildSubComponentNamingGuidance` 输出「强制名称」替代「建议名列表」。
> - **R1 结构树单一事实源** — ✅ 已落地（`a0f9e6a`）：`buildLayoutSkeleton` 改消费 planner 的 `effectiveSections`（新增 `resolvePlanSections` 统一解析），下游模板段/脚本段/样式段三个调用点不再从 `layoutStructure` 重新推断；`formatSectionTreeForPrompt` 补 layout 方向。
> - 附：`c40af24`（语义壳去重，P1-8 结果层止血）。
>
> **说明**：R2 的「`generateTemplateFromPlan` 完全确定性模板生成器」与 R2 的「类名/bg 挂载系统生成（而非 CODE 门禁兜底）」属**可选深化**——当前「正向强制 + 反向门禁兜底」已闭环，非根治必需。

**R1 —— 结构树单一事实源（治 P1-7 / P1-8 的本）**

- **事实源 = Figma 节点树本身**（不是 merger 产物）。merger 只是对 Figma 做「确定性几何归一」（左右并列 → 一行、上下堆叠 → 容器），其产物**不是新事实，是 Figma 的确定性投影**。若几何推断错了（如把 active/default 误判为并列），那「唯一权威」就成了「错误的权威」——所以 R1 必须给几何归一留**可回查、可纠正**的锚点（保留 figmaNodeId 全链路）。
- **单树模型 = 「几何为骨架 + 语义为标注」**：Vision 的语义壳**不再作为并列 section**，而是作为**标注（annotation）附着到几何节点上**（如 `2:7889 tabs-list` 标注 `role:tab`、`89:43` 标注 `role:icon-group`）。彻底消除「语义壳 vs 几何块」双结构，而不是在结果层去重。
- planner 只做「命名 / 复杂度评分 / 内部拆分建议」，**不重排、不重拆、不再凭空生成平级 section**。
- 下游（engineer 模板段/样式段、assembler）**只消费这棵树**，禁止各自臆造结构。
- 验收标尺：同一 figma，全链路任何一环打印出的 section 树**逐字一致**。

**R2 —— 模板装配确定性化（治 P0-6 的本）**

- **分层边界（自我评审修正）**：只把「**装配层**」确定性化，**不把「叶内生成」也确定性化**——否则会变成新的僵硬失真源。具体：
  - **装配层（系统生成，LLM 不得插手）**：`<XxxSection />` 顺序 = 树先序遍历；子组件 import 清单；类名 = `classPrefixOf + 语义名`（覆盖 `:class` 动态绑定）；bg/icon 挂载 = `resourceDomMapping` 确定性注入。
  - **叶内生成（仍交 LLM）**：每个叶子组件**内部**的 `v-if`/`v-for`/tab 表达/图表配置/布局细节——这些是「语义」，不是「装配」，仍由 LLM 按结构树生成。
- 这样一次消灭 P0-6 的 4 个症状：死代码（装配层必引用子组件）、纵向 tab 丢失（子组件渲染）、bg 丢失（装配层确定性挂载）、类名不命中（装配层确定性前缀）。今天提的 A/B/C/D 中，A（下发名单）、C（前缀覆盖动态绑定）、D（资源挂载）属**装配层**，应落成「系统装配」而非「提示词劝导」。

**R3 —— 门禁闭环（治「生成通过 ≠ 可投放」的本）**

- 把所有**确定性**缺陷做成机器 BLOCK，不靠 LLM 自觉：
  - 子组件死代码（import 但模板 0 引用）→ BLOCK；
  - 类名不命中（模板 class 集合 ⊄ CSS class 集合）→ BLOCK；
  - 资源未挂（import bg/icon 但模板 0 引用）→ BLOCK；
  - 叠加已有：L0-B、微码 M 系列（P0-5 方案 E）、运行时 fail-closed、语义门禁。
- **fail-closed 铁律（自我评审修正）**：门禁检测器自身异常必须走 **BLOCK 而非 WARN**。历史反例——`section-coverage-guard.js` 检测器异常走 WARN、漏 `collectLeafSections` import 时静默漏检，`COMP-001` 因此 fail-open。若 R3 的门禁本身还会静默漏检，「确定性门禁」就形同虚设，重蹈覆辙。
- 目标是**一套统一质量门禁**，同时覆盖「生成口径」和「交付口径」，产物流出前就拦下。

### 3.5.3 「是否根治」的统一标尺

> 判断一件事是否根治，不看「又加了个补丁让这个样本过了」，而看「**这个样本的失真，在新架构下从机制上不可能再发生**」。

R1/R2/R3 **代码已落地**（2026-09-10 晚），但「是否根治」仍需三样本重生成肉眼对照（P0-1）证明「失真从机制上不再发生」——**代码落地 ≠ 已根治，验收通过才算**。三样本未重跑前，R1/R2/R3 只能算「代码层可能已根治，未经验证」。

---

## 4. 建议的下一步（按依赖顺序）

1. ~~**系统性根治 R1→R2→R3（§3.5）**~~ ✅ **已落地（2026-09-10 晚，commit c40af24/d251774/022526c/2b8a60b/a0f9e6a）**。剩余可选深化：`generateTemplateFromPlan` 完全确定性模板生成器、类名/bg 挂载系统生成（当前靠 CODE 门禁兜底已闭环）。
2. **三样本重生成验收（P0-1，现为最高优先级）**：额度授权后重跑 env/traffic/device，逐条对照 §1 P0-1 验收标准；重点验证 R1/R2/R3 落地后：死代码消失（CODE-021 不触发）、纵向 6 类 tab 恢复 + 大卡 bg 挂上 + 类名命中（CODE-020/022 不触发）、无双结构（同片区域只生成一份）。不过则回到对应 Loop 修，不标完成。
3. **生产部署（P0-2/P0-4）**：scp backend dist + frontend build + 重启（先确认释放 13030）；设 `TASK_GLOBAL_MAX_CONCURRENT`；验证 `user-stats` 非 0；修 `configMap` uid 兜底。
4. **公共池 AI 修复（P0-3）**：向用户要到具体报错后再定方案，优先验证嫌疑 A/B/C 哪条命中。
5. **微码规范检查修复（P0-5）**：① 先与规范维护方确认 A1/A2 哪条是正解（样式走 `@fontSize` LESS 变量层 vs 不在 css-vars.js 声明用不到的变量）；② 改 `microcode-engineer` 样式生成 + 去 `var(--x, var(--x))` 自指 fallback；③ `componentId` 与目录名强制对齐并加断言；④ `$mcComponentBuilder` 幂等去重；⑤ 重跑 mc-check 验收（error 归零、可上线率 ≥90%）；⑥ 建议把 M 系列接入生成门禁（E），并决策存量 397 个是否回刷。**改样式生成必须做三样本回归。**
6. **Loop 4 重构（P2-1）**：Golden 抽离独立算法文件，接入生成门禁，避免与生成方共用。
7. **A′ 消费层收口（P1-3）**：grep engineer/assembler/prompt 中残留的 `effectiveSections.length` / 顶层遍历，改为树消费。

---

## 5. 结论

- **代码层已治本**：Max 容量误杀、A′ 嵌套、TDZ、运行时 fail-closed、视觉双闸门、per-user 队列、exists 探测、frontend ①②——逻辑均已落地并通过单测/构建。
- **未根治 / 未验收**：三样本重生成肉眼对照（最大缺口）、生产部署、Loop 4 独立裁判、configMap 双形态、公共池 AI 修复根因、**微码产物 v1.0.20 规范不合规（106 个 95 个不允许上线，见 P0-5）**。
- **新增判断**：「生成通过」不等于「可投放」——L0-B 门禁只覆盖平台内部质量，公司微码规范（`frontend-mc-check` v1.0.20）是**第二道独立门禁**，目前两道门禁互不知晓；建议按 P0-5 方案 E 把 M 系列并入生成后校验，否则产物流到项目侧才被规范脚本拦下。
- **新增判断（本轮）**：今天的结构类问题（P1-7 拍平 / P1-8 双结构 / P0-6 死代码 + 类名不命中 + bg 未挂）**同出一源**——`layout.sections` 在管线里有 Vision/merger/planner/模板段/样式段多个「解释者」、彼此无强制契约，导致同一份 Figma 被反复重构失真。**根治不是再加补丁，而是三条线收敛（§3.5）**：R1 结构树单一事实源、R2 模板由系统确定性装配、R3 确定性门禁闭环。**三线核心已落地（2026-09-10 晚，5 个 commit），代码层闭环；但「是否根治」仍需三样本重生成肉眼对照（P0-1）证明**。
- **严格意义上「管线绿」不成立**：缺 P0-1 真实验收；所有 Loop 完成声明应视为「代码完成 + 单测通过」，非正式验收。
