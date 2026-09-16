# Runtime latest snapshot 404 系统性分析

> 分析时间：2026-09-08 | 标识：RUNTIME-007

## 一、问题事实

**表现**：`ensureLatestSnapshot()` → `GET /api/tasks/{sessionId}/code-snapshots/latest` → **404**
**影响**：后端日志污染；workspace 被清而快照存在时预览失败（错失快照源）；触发 RUNTIME-007 采集

---

## 二、历史修复回溯

### 已有修复（2 次）

| 日期 | 提交 | 作用域 | 措施 | 覆盖 ID 类型 |
|---|---|---|---|---|
| 09-01 | dc9d566 (F3) | 前端 | `ensureLatestSnapshot()` catch 静默 + 自动补 revision | sessionId / componentId(c-xxx) |
| 09-03 | M1-1 | 后端 | `resolveSnapshotSessionId()` 直查→componentId 反查 fallback | sessionId / componentId(c-xxx) |

**结论**：问题**不是全新的**，已专门解决过两次。当前 404 是这两次修复**没兜住的特例类型**。

---

## 三、URL 路径段语义分类（根因层）

`/preview/:componentId` 的路由参数 **:componentId** 在 8 个入口处承载了 4 种不同语义：

| 语义类型 | 示例值 | 入口来源 | `ensureLatestSnapshot` 能否命中 | `resolveSnapshotSessionId` 能否反查 |
|---|---|---|---|---|
| A. 真 sessionId | `mc-max-1788500607191-577eae48` | WorkflowMonitor, page.vue child, getVue3PreviewUrl, getMcPreviewUrl | ✅ 直查成功 | ✅ 直查成功 |
| B. 业务 componentId | `c-env-monitor`, `c-lljc-test` | TaskDetail (M1-1 解析后) | ❌ 直查失败 | ✅ componentId 反查成功 |
| C. MongoDB ObjectId | `60a1b2c3d4e5f6a7b8c9d0e1` | ComponentDetail fallback (sid 为空) | ❌ 直查失败 | ❌ Map 无此 key, `.componentId` 不匹配 → 原路返回 |
| D. 页面骨架 ID | `ps-xxxx` | page-skeleton.ts getPagePreviewUrl | ❌ 直查失败 | ❌ 页面骨架无任务管线 |

**浅层根因**：`ensureLatestSnapshot()` 第 206 行无差别发起请求：
```js
const sessionId = String(route.query.sessionId || componentId || '')
// 当入口是 C 类（ObjectId）或 D 类（pageId）时必 404
```

**中层根因**：URL 路径段 `:componentId` 从未定义其语义契约。同一路由在 8 个入口处塞 4 种 ID，没有任何 URL 编码规范（如 `?src=task` / `?sid=` 显式标记来源）。

**深层根因**：F3 策略承诺"全场景"，但其前提「路径段 = sessionId 或可反查的任务 ID」对 C/D 类入口不成立——正因为没有会话（Phase2 老组件 / 页面骨架），才走 workspace/静态源降级。F3 没有识别"此入口注定无任务"这个事实。

---

## 四、策略重复与矛盾审计

### 4.1 F3（前端）与 M1-1（后端）的双保险间隙

两条「componentId→sessionId」反查路径在 **ObjectId** 上均失效：

```
前端 ensureLatestSnapshot                           后端 resolveSnapshotSessionId
├─ sessionId = query.sessionId || componentId        ├─ getTaskStatus(id).success → return id
│  └─ 无 query.sessionId + componentId=ObjectId       │  └─ Map.get(ObjectId)=undefined → {success:false}
└─ GET /api/tasks/{ObjectId}/code-snapshots/latest   └─ getTaskByComponentId(ObjectId)
   → 后端先 resolveSnapshotSessionId → ObjectId         ├─ tasks.get(ObjectId)=undefined（Map key=sessionId）
                                                         └─ .componentId === ObjectId → none → 返回 ObjectId
                                                      → latest 端点最终用 ObjectId → 404
```

### 4.2 `getPreviewUrl()` 契约劈叉

`api/component.ts` 的 `getPreviewUrl(gid, cid)` 返回 **后端 Phase2 静态 URL**：
```
BASE_URL + /preview/{groupId}/{componentId}/index.html
```

而 ComponentDetail.vue 第 453 行在 sid 为空时把它当**前端 SPA 路由 URL** 用：
```js
const base = sid
  ? getRouteUrl(`/preview/${sid}...`)  // 前端路由
  : getPreviewUrl(gid, component.value._id)  // 后端静态 URL，路径段=ObjectId
```

这种情况下 `<iframe :src="getPreviewUrl(...)">` 其实加载的是後端 Phase2 编译好的 index.html——**这与走前端沙箱路由是不同的渲染链路**（无 ErrorBoundary、无快照源、无 Figma 尺寸自适应）。两条链路同时用同一组件入口 URL，但行为完全不同。

### 4.3 `resolvePreviewDescriptor` 的语义模糊

`preview-resolver.ts` 第 68-70 行的 fallback 链主动模糊了 componentId 和 sessionId：
```js
const componentId = asString(task.componentId || task.sessionId)
const sessionId = asString(task.sessionId || componentId)
```

这在 TaskDetail 等「有任务」的场景下正确（sessionId 和 componentId 都指向同一生成任务），但对无任务入口（ComponentDetail fallback / page-skeleton）会产生 ObjectId→sessionId→componentId 语义污染。

### 4.4 `ensureLatestSnapshot` 与 `?exists=1` 探测惯例的矛盾

项目多处（loadVue3Runtime 入口探测、injectGlobalIndexCssIfExists、loadMicrocodeDeclare F1）使用 `?exists=1` 或 try-catch 探测，**避免无谓 404**。`ensureLatestSnapshot` 的 catch 静默虽然吸收了 404，但请求本身仍产生后端日志污染。

`latest` 端点的非幂等性质（返回候选快照摘要的复合结构，不只是在/否）使其无法简单套用 `?exists=1`——需要不同的启发式跳过。

---

## 五、入口级别 404 风险矩阵

| 入口 | 路径段语义 | 404 风险 | 功能影响 |
|---|---|---|---|
| TaskDetail（有 snapshot） | componentId + query.sessionId | ❌ hasExplicitSource 绕过 | — |
| TaskDetail（无 snapshot fallback） | componentId | ⚠️ B 类，M1-1 能反查 | 无害 |
| WorkflowMonitor | sessionId | ❌ A 类直查成功 | — |
| getVue3PreviewUrl | sessionId | ❌ A 类直查成功 | — |
| getMcPreviewUrl | sessionId | ❌ A 类直查成功 | — |
| page.vue getChildPreviewUrl | childSessionId | ❌ A 类直查成功 | — |
| **page-skeleton.ts** | **pageId (D 类)** | **🔴 必 404** | **无害（降级 workspace）** |
| **ComponentDetail fallback** | **ObjectId (C 类)** | **🔴 必 404** | **无害（降级 workspace/静态源）** |
| **demo/index.vue Playground** | **componentId (可能 B/C)** | **🔴 taskId 空时必 404** | **无害（降级 workspace）** |

> 功能影响均为"无害"的原因：catch 静默 + 降级 workspace 源。但 workspace 被清而快照存在的场景下，错失快照源 → 预览失败。

---

## 六、根源解决方案（管线优化）

### 设计原则

1. **URL 规范化**：路径段语义需要标准化，不能同时承载 4 种类型
2. **前置跳过**：在发起 latest 请求前就决定跳过，而不是靠后端 404 静默兜底
3. **复用现有惯例**：吸收 `?exists=1` 探测思路，对「注定无任务」的入口不加探测
4. **无侵入**：不改 URL 路由（影响面太大），在 `ensureLatestSnapshot` 入口段做智能跳过

### 方案 A（推荐） — 启发式跳过

在 `ensureLatestSnapshot()` 前做 ID 类型判定，对 C/D 类直接跳过：

```
// 伪代码
function shouldSkipLatestLookup(id: string): boolean {
  // C 类：MongoDB ObjectId（24 位 hex）
  if (/^[0-9a-f]{24}$/i.test(id)) return true
  // D 类：pageId（ps- 前缀）
  if (/^ps-/.test(id)) return true
  // B 类：有 query.sessionId（来自 TaskDetail 等显式构造）→ 已由 hasExplicitSource 绕过
  // A 类：剩余命中
  return false
}
```

**优势**：改动最小（只改 preview/index.vue ~15 行），零副作用，复用现有 catch 兜底。

### 方案 B — 前端 sessionId 缓存 + 跳过

在 preview/index.vue 维护一个 `knownNoSnapshotIds` Set，一旦 latest 返回 404 就记录，同 ID 不再重试：

```
const knownNoSnapshotIds = new Set<string>()

async function ensureLatestSnapshot() {
  ...
  if (knownNoSnapshotIds.has(sessionId)) return  // 已知无快照，跳过
  try {
    ...
  } catch {
    knownNoSnapshotIds.add(sessionId)  // 记录
  }
}
```

**优势**：无硬编码 ID 格式判断；与后端 M1-1 完全解耦。

**劣势**：每个入口第一次还是会 404 一次（会话级免除，不是永久免除）。

### 方案 C — URL 来源声明（重构）

给 `/preview/:componentId` 加一个 query 参数声明来源类型：

```typescript
// 分场景构造
type PreviewSource = 'task' | 'static' | 'page-skeleton'

// TaskDetail: /preview/c-env-monitor?source=task&sessionId=...
// ComponentDetail: /preview/60a1b2c3d4e5f6a7b8c9d0e1?source=static
// page-skeleton: /preview/ps-xxx?source=page-skeleton
```

**优势**：URL 语义标准化——这是最彻底的根除方案。

**劣势**：需要改所有构造入口（8 个位置），协调部署难度大。

### 方案 D — 组合策略（推荐实施）

**短期（立即见效）**：方案 A + 方案 B 混合

1. 方案 A 启发式跳过 ObjectId 和 pageId（硬编码，一次判断永久免除）
2. 方案 B 对非启发式匹配但依然 404 的 ID 做 Set 缓存（会话级免除首次 404）

**中期**：方案 C URL 来源声明（在下次统一改版 URL 构造时做，对齐 PhaseX 规划）

---

## 七、实施计划

### P1 · 立即（一小时内）

```diff
+ const knownNoSnapshotIds = new Set<string>()
+ const SESSION_ID_PATTERN = /^[0-9a-f]{24}$|^ps-/i

async function ensureLatestSnapshot() {
  if (hasExplicitSource) return
  if (latestSnapshotSource.value) return
  const sessionId = String(route.query.sessionId || componentId || '')
  if (!sessionId) return
+  // P1 · 启发式跳过：ObjectId（24 位 hex）和 pageId（ps- 前缀）注定无任务快照
+  if (knownNoSnapshotIds.has(sessionId) || SESSION_ID_PATTERN.test(sessionId)) return
  try {
    ...
  } catch {
+    knownNoSnapshotIds.add(sessionId)
  }
}
```

### P2 · 本周

方案 C 的 URL 来源声明标准化——为 `/preview/:componentId` 添加 `?src=task|static|page` query，各入口构造时带来源声明。

### P3 · 下期重构

`resolvePreviewDescriptor` 的 `componentId || sessionId` fallback 链改为显式分离：componentId 不再 fallback 到 sessionId，而是通过外部传入来源类型决定。

---

## 八、验证标准

| 场景 | 预期行为 |
|---|---|
| WorkflowMonitor → 预览 | ✅ 无 404，快照源优先 |
| TaskDetail 合格/失败任务 → 预览 | ✅ URL 带 explicit sessionId+revision，hasExplicitSource 直接绕过 |
| ComponentDetail 新组件（有 sid）→ 预览 | ✅ sessionId 直查成功 |
| ComponentDetail 老组件（无 sid）→ 预览 | ✅ 启发式跳过 latest，直接 workspace/静态源 |
| page-skeleton → 预览 | ✅ 启发式跳过 latest，直接 workspace 源 |
| demo/index.vue Playground（有 taskId）| ✅ 直查正常 |
| demo/index.vue Playground（无 taskId）| ✅ 启发式跳过或 404 后 Set 记录不再重试 |
| 后端日志 | ✅ 无 /api/tasks/*/code-snapshots/latest 的 404 噪音 |