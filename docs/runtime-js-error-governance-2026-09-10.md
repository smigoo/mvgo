# 立项：运行时 JS 错误 fail-closed 统一治理（2026-09-10）

状态：**已立项并落地 G1/G2/G3**
样本锚点：env `mc-max-1789019718053-fb0a0de7`（TDZ）、env `mc-max-1788359428498-ee0cbe69`（v-if+v-for）
关联：`docs/tdz-root-cause-2026-09-10.md`、`docs/device-traffic-remediation-plan-2026-09-10.md`

---

## 1. 立项背景：一类反复复发的问题

**症状共性**：组件生成 `status=completed`，但用户在预览里看不到效果；根因是产物运行时报 JS 错误（`Cannot read properties of undefined` / `Cannot access 'X' before initialization` …），而**质量门禁在 generate 模式下把它降级成 warning 并照常发布**。

已发生实例：

| # | 现象 | 错误文本 | 处置历史 |
|---|---|---|---|
| E 类 | `v-if`+`v-for` 同元素 | `Cannot read properties of undefined` | 2026-09-02 门禁收紧后**已硬 BLOCK**（本次已补 healer + `VUE-VIF-VFOR-001`） |
| TDZ 类 | `watch(activeTab)` 在 `const activeTab` 前 | `Cannot access 'activeTab' before initialization` | **曾被降级发布** → 本次补 `sfc-tdz.js` 生成期拦截 + G1 白名单 |

**关键不对称**：E 类的错误文本恰好命中既有白名单 `is not defined` / `Cannot read properties of undefined`，所以走了硬 BLOCK；TDZ 类文本（`Cannot access … before initialization`）**不在白名单**，于是继续被 generate 模式降级发布。→ 结论：**不是门禁没做，而是「确定性错误」的判定口径不全 + generate 模式系统性 fail-open。**

---

## 2. 现状审计（只读调研结论，附证据）

### 2.1 运行时门禁已具备实时捕获能力（无需重建）
`src/ai-engine/roles/screenshot-renderer.js`：
- 真实渲染 `renderViaPreviewPage`（L476）用 Puppeteer 打开 `/preview/:componentId`，监听：
  - `pageerror`（L571）→ **RUNTIME-009**（L681）
  - `console.error`（L574）→ **RUNTIME-010**（L684）
  - `response`≥400（L558）→ **RUNTIME-007**（L675）
  - `requestfailed`（L566）→ **RUNTIME-008**（L678）
  - `data-preview-status`（L632）→ **RUNTIME-004**（L665，render-error/load-error）
- BLOCK 集合 `RUNTIME_BLOCK_IDS`（L31-44）：001/002/003/004/005/006/009/011/012/013/014/015；WARN 集合 `RUNTIME_INCREMENTAL_IDS`（L46-50）：007/008/010。
- issue 经 `runtimeGate.issues` 回传 graph（L704）。

### 2.2 真正的漏网点：generate 模式 fail-open 降级
`src/ai-engine/graphs/mc-component-graph-phase2.js` L4167-4221：
- L4183-4203：`isGenerateMode && !isDeterministicMissing` → **降级为完成，不阻断发布**（`_runtimeGateDowngraded:true`）。
- 即：**只有命中确定性白名单才硬 BLOCK**，其余运行时错误一律放行。
- `hasDeterministicRuntimeMissing`（screenshot-renderer L264）依赖 `DETERMINISTIC_MISSING_PATTERNS`（L255-262），白名单仅 6 条，**缺 TDZ 文本、缺 `data-preview-error-type=vue-render` 这一结构化信号**。

### 2.3 生成的确定性信号被浪费
`frontend/src/views/preview/index.vue` L341-343：Vue 渲染崩溃时 `previewStatus='render-error'` 且 `previewErrorType='vue-render'`。该 `errorType` 已进 `RUNTIME-004.evidence`，但门禁**只做文本正则、不消费这个结构化字段**——明明有确定性信号却没用。

### 2.4 生成期语义门禁覆盖（本次已补 TDZ）
`src/ai-engine/utils/sfc-semantics.js` `validateVueScriptSemantics`：
- 覆盖：重复 import / 截断 / 模板引用未声明变量 / 重复顶层声明 / 整段重复 / 6a 赋值型 TDZ / **6b 引用型 TDZ（本次新增）** / 自由变量。
- 与 E 类（v-if+v-for）无重叠：后者由 `code-fix-rules.js` `VUE-VIF-VFOR-001`（STRUCTURE 阶段）独立覆盖。

### 2.5 漏网点清单
| 漏网类型 | 证据位置 | 影响 |
|---|---|---|
| 确定性白名单过窄（缺 TDZ） | screenshot-renderer.js L255-262 | `Cannot access before initialization` 被降级发布 |
| 未消费 `errorType=vue-render` 结构化信号 | screenshot-renderer.js L632-666 / phase2 L4184 | 已知是组件崩溃仍降级 |
| generate 模式系统性 fail-open | phase2 L4183-4203 | 非白名单运行时错误一律当成功 |
| 缺图自愈失败降级 WARN | screenshot-renderer.js L1104-1122 | 资源类不阻断（可接受，非本次范围） |
| benign console 直接 complete_with_warning | screenshot-renderer.js L313-320 | 非 fatal console 不阻断（可接受） |
| 静态降级不证明运行时 | screenshot-renderer.js RUNTIME-013 | 预览不可达时无法判定（环境类，非产物缺陷） |

---

## 3. 治理目标与红线

**目标**：凡是**产物自身缺陷导致的确定性运行时错误**，在 generate 模式也必须 **fail-closed（BLOCK）**，不得降级发布当成功。

**红线（不越界，避免误伤环境类）**：
- 环境类（前端不可达 RUNTIME-001/002/003、网络/HTTP 资源 RUNTIME-007/008）**不**升级为硬 BLOCK——它们非产物缺陷。
- 只升级「**产物代码必然触发**」的错误：TDZ、undefined/null 读取、未定义标识符、Vue 渲染崩溃。

---

## 4. 治本方案（三刀）

### G1：扩展确定性运行时错误判定（结构化信号优先）
**文件**：`src/ai-engine/roles/screenshot-renderer.js`
**函数**：`hasDeterministicRuntimeMissing`（L264）+ `DETERMINISTIC_MISSING_PATTERNS`（L255）
**改法**：
1. 白名单补 TDZ 文本：`/Cannot access .* before initialization/i`（引用型/赋值型 TDZ 的运行时文本）。
2. **新增结构化判定**：`RUNTIME-004` 的 `evidence.errorType === 'vue-render'` 直接视为确定性（组件渲染函数抛错，环境无关）。
3. 保留其余 6 条，不动环境类。

### G2：generate 模式降级边界收紧
**文件**：`src/ai-engine/graphs/mc-component-graph-phase2.js` L4183-4203
**改法**：`isDeterministicMissing` 现经 G1 扩展后已覆盖 TDZ + vue-render；降级分支 `if (isGenerateMode && !isDeterministicMissing)` **保持**，但因 G1 扩大判定面，TDZ/vue-render 会自然走 L4204 的硬 BLOCK。**不新增旁路**、不改 `isGenerateMode` 语义。
> 注：G2 本质是「G1 生效后自动收口」，无需在 phase2 再加逻辑——避免 `isGenerateMode` 语义扩散出第二种「确定性」定义。仅补注释 + spec 钉死边界。

### G3：生成期前置拦截 + 规则编号中心表（**已落地**，commit 9517c55）
- TDZ：**已落地**（`sfc-tdz.js` + `sfc-semantics.js` 6b + `mergeScriptParts` 自检）→ 中心表 `RUNTIME-STATIC-001`。
- v-if+v-for：**已落地**（`VUE-VIF-VFOR-001` + healer）→ 中心表 `RUNTIME-STATIC-002`。
- calc 双写：**已落地**（`CSS-CALC-SELFREF-001`）→ 中心表 `RUNTIME-STATIC-003`。
- **规则编号中心表（G3 立项核心）**：`src/ai-engine/validators/runtime-static-rules.js`（纯函数/无 import.meta）：
  - `RUNTIME_CODES`：运行时 `RUNTIME-001~015` 语义全集（与 screenshot-renderer.js `addBlock` 实证对应）。
  - `RUNTIME_STATIC_RULES`：已落地 3 条静态规则 ↔ 运行时码映射（legacyId 保持不变，仅做编号中心 + 映射）。
  - `resolveStaticCode` / `getStaticRule` / `validateStaticRuleRegistry`（自洽校验）。
  - **红线**：本表**只登记不改行为**；静态规则**不得**越界去改运行时门禁判定。
- 新 spec：`runtime-static-rules.spec.ts`（8 用例）钉死自洽 / 已落地项在册 / 每条标 runtimeCodes / 反查 null 安全 / staticId 唯一且形如 `RUNTIME-STATIC-\d{3}`。

---

## 5. 验证
- G1 新增 spec：`runtime-error-classifier.spec.ts`（11 用例）——TDZ 文本命中 / vue-render errorType 命中 / 环境类（RUNTIME-007）不命中 / 合法无 issue 不命中。
- G3 新增 spec：`runtime-static-rules.spec.ts`（8 用例）。
- 回归：runtime gate 相关既有 spec 全绿；`npm run build` 通过；dist 落盘；13030 重启。

### 5.1 零配额端到端回放（用原始任务记录，免重跑）
- 证据来源：`backend-node/data/tasks.json` 中 sessionId `mc-max-1789019718053-fb0a0de7` 的 `result.runtimeGate`：
  ```json
  { "status":"BLOCK", "issues":[{
    "id":"RUNTIME-004", "severity":"BLOCK", "category":"preview-status",
    "evidence":{ "status":"render-error", "errorType":"vue-render",
      "renderError":"组件渲染出错Cannot access 'activeTab' before initialization…" }
  }] }
  ```
- 用新分类器 `hasDeterministicRuntimeMissing` 回放该 gate → 返回 **`true`**（此前 phase2 generate 分支因该错误不在旧白名单而降级发布 `_runtimeGateDowngraded`；现在走 `GENERATE_RUNTIME_GATE_BLOCKED` 硬 BLOCK）。
- 对照：同一分类器对 `RUNTIME-007`（资源 404）返回 **`false`**，环境类不误升级。
- 双保险：静态层 G3 已让 TDZ 在写盘前被 `sfc-tdz.js` 自动修复，理想情况下该样本**根本不会**到达运行时门禁。
- 完整重跑（端到端真生成 + 截图）仍可做，但上述回放已用真实记录证明 classification 正确，无需消耗额度。

## 6. 完成状态
- **G1 + G2 + G3 全部落地**。G1 扩展确定性判定（含 TDZ + vue-render 信号）；G2 收紧 generate 降级边界；G3 建 `RUNTIME-STATIC-*` 编号中心表统一静态/运行时命名。
- 提交：backend-node（`runtime-error-classifier.js` + `runtime-static-rules.js` + spec）、docs（本文档）。
