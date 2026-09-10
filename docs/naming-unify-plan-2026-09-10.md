# 命名统一方案：任务号不变，目录名 + 规范 ID 统一为 `c-*`

> 定稿：2026-09-10 · 目标：**`sessionId` 保持 `mc-`/`mv-` 不动，只把「workspace 目录名」与「`declare.componentId`」统一为 `c-<语义段>-<尾8hex>`**
> 配套工具：`backend-node/scripts/naming-audit.mjs`（只读盘点，已交付）

---

## 零、目标形态

| 层 | 形态 | 本次是否改 |
|---|---|---|
| 任务号 `sessionId` | `mc-lite-1789035969084-c298235f` | ❌ **不变** |
| 临时源目录 | `temp-components/<gid>/mc-lite-1789035969084-c298235f/` | ❌ 不变 |
| 快照目录 | `.task-code-snapshots/mc-lite-1789035969084-c298235f/` | ❌ 不变 |
| **`declare.componentId`** | `c-environment-monitor-c298235f` | ✅ **必须** |
| **workspace 目录名** | `c-environment-monitor-c298235f` | ✅ **必须** |
| DB `components.componentId` | `c-environment-monitor-c298235f` | ✅ 存量需迁 |
| SSE / 路由 / 日志文件名 | 沿用任务号 | ❌ 不变 |

**这个组合的价值**：任务号不变 → DB 主键、快照目录、SSE 频道、前端路由、10 处 `startsWith`、7 处白名单正则 **全部不用动**；只需解决「目录名 / 规范 ID 被任务号污染」。

---

## 一、现状判定：机制已经有了，但**正在被反向覆盖**

`buildComponentId()`（`component-naming.js:160-167`）+ `resolveWorkspaceComponentId()`（`workspace-preview-publisher.js:599`）在 2026-09-04 就已落地，新产物确实写成 `c-environment-monitor-c298235f`。

**但实测显示它正在被反向覆盖**：

| 目录 | `css-vars.js` 时间 | `declare.json` 时间 | `declare.componentId` |
|---|---|---|---|
| `projectRoot/workspace/custom-components/mc-lite-…-c298235f` | **23:10:52** | **23:10:13** | 🔴 `mc-lite-1789035969084-c298235f` |
| `frontend/workspace/custom-components/mc-lite-…-c298235f` | **23:10:52** | **23:10:13** | 🔴 `mc-lite-1789035969084-c298235f` |
| `frontend/workspace/custom-components/c-environment-monitor-c298235f` | 22:52:10 | 22:44:33 | ✅ `c-environment-monitor-c298235f` |
| `backend-node/workspace/custom-components/c-environment-monitor-c298235f` | （该文件缺失） | — | ✅ |

→ **最新的一次写盘（23:10）写的是「任务号目录」，并把 `declare.componentId` 写回了任务号。规范目录停在 22:52，根本没被写。**

### 全仓盘点（`naming-audit.mjs` 实测）

| 根 | 总数 | 任务号名 | 规范 `c-` 名 |
|---|---|---|---|
| `projectRoot/workspace/custom-components` | 9 | **9（100%）** | 0 |
| `frontend/workspace/custom-components` | 401 | 278 | 109 |
| `frontend/workspace/vue3-components` | 135 | 133 | 0 |
| `backend-node/workspace/custom-components` ⚠️不在搜索根 | 395 | 267 | 116 |
| `backend-node/workspace/vue3-components` ⚠️不在搜索根 | 132 | 126 | 0 |
| **合计任务号形态目录** | **813** | | |

| 分类 | 数量 | 含义 |
|---|---|---|
| **4a 🔴** `declare.componentId` 是任务号 | **138** | 规范化被反向覆盖（含 `c-mc-lite-…` 双前缀污染） |
| **4b ⚠️** 目录名是任务号、declare 已归一 | **285** | 残留老目录（可清理） |
| **4c ⚠️** 目录名与 declare 都不含时间戳但不一致 | 12 | `-2`/`-10` 重名后缀漂移 |
| **2** 同一尾缀多种目录名 | 2 | `c298235f`、`c1914947` |

---

## 二、根因链（5 环，每环都有代码位置）

```
① componentSearchRoots() 第一位是 projectRoot/workspace/custom-components
      ↓  这个根已基本废弃（9 个目录，100% 任务号名），但优先级最高
② resolveComponentDirStrict() 尾缀匹配 → 命中 root#1 的任务号目录 → 返回 hits[0]
      ↓  component-resolver.js:123-162
③ resolveWritableComponentDirs() 用 basename(strict) 当 realName
      ↓  realName === 任务号 === componentId → candidateIds 只剩任务号 → 规范目录被排除
      ↓  component-resolver.js:203-205
④ writeComponentFile() 写「主目录 + 全部可写副本」
      ↓  playground-tools.js:121-131
⑤ declare.componentId 被写回任务号 → 规范化反向覆盖
```

### 逐环证据

**②** `component-resolver.js:123-162`：`for (const root of componentSearchRoots())` 收集 `hits`，最终 `return hits[0]`。因为 root#1 里有 `mc-lite-…-c298235f`，它**先于** `frontend/.../c-environment-monitor-c298235f` 入列。

**③** `component-resolver.js:203-205`：

```js
const strict = await resolveComponentDirStrict(componentId)
const realName = strict ? basename(strict) : null          // ← 命中的是任务号目录 → realName = 任务号
const candidateIds = realName && realName !== componentId
  ? [realName, componentId] : [componentId]                 // ← 相等 → 退化成 [任务号]
```

→ **规范目录 `c-environment-monitor-c298235f` 从此不在可写集合里**。

**④⑤** `playground-tools.js:121-131` 把 `writableDirs` 全部写一遍 → 只写到两个任务号目录 → 时间戳变成最新（23:10:52），且 `declare.json` 被写入任务号（23:10:13）。

### 第 5 环（结构性问题，独立存在）

| | 路径 |
|---|---|
| `publishQualityPreview` **写** | `backendRoot/workspace/…` = `backend-node/workspace/…` |
| `phase2.copyToWorkspace` **写** | `customComponentsDir` = `projectRoot/workspace/…` |
| `preview.controller` **读** | `backendRoot/workspace/…` |
| `componentSearchRoots()` **读** | `projectRoot/workspace/…` + `frontend/workspace/…` |

→ **`backend-node/workspace` 的 527 个目录「写了但解析读不到」；`projectRoot/workspace` 9 个目录「读了但没人写」。**

---

## 三、实施步骤（6 步，各自独立可验证 / 可回滚）

| 步 | 内容 | 类型 | 风险 | 依赖 |
|---|---|---|---|---|
| **S0** | 盘点（`naming-audit.mjs`，两环境各跑一次） | 只读 | 无 | — |
| **S1** 🔴 | `resolveWritableComponentDirs` 的 realName 改以 **declare.componentId** 为准 | 代码 | 低 | — |
| **S2** 🔴 | `resolveComponentDirStrict` 尾缀命中后**规范名优先**排序 | 代码 | 低 | — |
| **S3** | 写盘 fail-closed 断言：`declare.componentId` 不得是编码型 | 代码 | 低 | S1 |
| **S4** | 存量清理：813 个任务号目录 + 138 条 declare 回退 | 数据 | **中** | S1+S2 |
| **S5** | 统一 backend 副本根（消除读写分叉） | 代码 | **中** | S4 |
| **S6** | 端到端回归（生成 → 检查 → AI 修复 → 预览/下载） | 验证 | — | S1–S5 |

> **关键**：本方案**不需要**改 `/^(c|cp|mv|page)-/` 白名单、不需要改前端 4 处 `startsWith`、不需要改 `tasks.service.ts` 4 处判断、不需要动 6 处 sessionId 生成点。这是「任务号不变」换来的最大省力点。

---

## 四、S1 / S2 精确改动（核心治本两处）

### S1 · `component-resolver.js` — realName 以 declare 为事实源

```js
// 新增辅助
function resolveDeclaredId(dir) {
  try {
    const d = JSON.parse(fs.readFileSync(join(dir, 'declare.json'), 'utf8'))
    const id = typeof d.componentId === 'string' ? d.componentId.trim() : ''
    if (!id) return null
    // 编码型（含 13 位毫秒时间戳）不是规范 ID，忽略
    if (/^(mc|mv)-[a-z-]*\d{13}-/i.test(id)) return null
    return id
  } catch {
    return null
  }
}

export async function resolveWritableComponentDirs(componentId) {
  const strict = await resolveComponentDirStrict(componentId)
  // 🔴 2026-09-10 治本：不能再只取 basename(strict)。
  // strict 可能命中「残留任务号目录」，此时 basename === componentId →
  // candidateIds 退化成 [任务号] → 规范目录被排除出可写集合 → 写盘只写残留目录，
  // 且 declare.componentId 被写回任务号（实测 23:10 故障）。
  const realName = strict ? (resolveDeclaredId(strict) || basename(strict)) : null
  const candidateIds = realName && realName !== componentId
    ? [realName, componentId]
    : [componentId]
  // …以下不变
}
```

**为什么低风险**：只可能**扩大或纠偏** `candidateIds`，不会减少原有写入目标；最坏情况是该组件目录不存在 → `statSync` 跳过（原有逻辑）。

**验收**：`resolveWritableComponentDirs('mc-lite-1789035969084-c298235f')` 应返回**包含** `…/c-environment-monitor-c298235f` 的集合（当前不包含）。

### S2 · `component-resolver.js` — 规范名优先排序

```js
if (hits.length) {
  // 🔴 2026-09-10：排序而非纯 roots 顺序。
  // 「任务号形态目录」（mc-/mv- + 13 位时间戳）是历史残留，不应优先于规范名目录。
  const isEncoded = (dir) => /^(mc|mv)-[a-z-]*\d{13}-/i.test(basename(dir))
  const ranked = [...hits].sort((a, b) => Number(isEncoded(a)) - Number(isEncoded(b)))
  if (hits.length > 1) {
    logger.warn('组件目录尾缀多命中', {
      componentId, tail: tailMatch[1],
      picked: ranked[0], encoded: isEncoded(ranked[0]),
      candidates: ranked,
    })
  }
  return ranked[0]
}
```

**为什么低风险**：只在「同尾缀多命中」时改变选择；单一命中时行为完全不变。等价于把「残留目录胜出」改成「规范目录胜出」。

**验收**：`resolveComponentDirStrict('mc-lite-1789035969084-c298235f')` 应返回 `…/c-environment-monitor-c298235f`（当前返回 `…/mc-lite-…`）。

> S1 + S2 合起来才闭环：**S2 让解析命中规范目录，S1 让可写集合也包含规范目录**。只做 S2 则写盘仍可能只写残留目录；只做 S1 则主目录可能仍是残留目录。

---

## 五、S3 · 写盘防腐断言

在写盘链路（`playground-tools.js#writeComponentFile`）落盘前加一道确定性检查。

> **⚠️ 实施时改为「归一 + WARN」而非原设计的「抛错」，理由见下。** 原设计（fail-closed 抛错）已否决：
> 存量已有 **138 条** `declare.componentId` 被污染成任务号（4a），若抛错会让这些组件的
> AI 修复**全线失败**（拒绝服务）。目标是「坏值不再被持久化」，而不是「拒绝写入」。

实际落地实现：

```js
export function normalizeDeclareComponentId(raw, fallbackComponentId, filePath) {
  const parsed = JSON.parse(raw)                       // 解析失败 → 抛错（结构非法不放过）
  const current = parsed.componentId?.trim() || ''
  if (!current || !isEncodedComponentName(current)) return raw   // 已是规范名 → 原样写
  const seg = semanticTokenFrom({                       // 语义段：中文名走词表，如 环境监测→env-monitor
    displayName: parsed.componentName || parsed.name || parsed.displayName || '',
    zhName: parsed.componentName || parsed.name || '',
    fallbackToken: String(fallbackComponentId || '').replace(/^(mc|mv)-/i, ''),
  })
  const normalized = buildComponentId(seg, fallbackComponentId || current)  // c-<语义段>-<尾8hex>
  parsed.componentId = normalized
  logger.warn('declare.componentId 为任务号形态，写盘前已归一', { filePath, from: current, to: normalized })
  return JSON.stringify(parsed, null, 2)
}
```

**目的**：让「规范化回退」这道 bug **不可能再悄悄发生**（此前是静默写回任务号，零告警），
现在既会收敛坏值、又会打出 `WARN` 留下可追溯日志。

**注意**：`microcode-engineer.js:4098` 现有守卫 `/^(c|cp|mv|page)-/` 在本方案下**不需要改** —— 任务号仍是 `mc-`，不匹配白名单 → 仍会触发重建。这正是「任务号不变」保住的第二道防线。

---

## 六、S4 · 存量清理策略（需授权，本轮未执行）

| 类别 | 数量 | 建议处置 |
|---|---|---|
| **4a** `declare.componentId` = 任务号 | 138 | ✅ **修 declare**：按同尾缀的规范目录或 `buildComponentId` 重算并覆写；**不删目录** |
| **4b** 目录名任务号、declare 已归一 | 285 | ① 若同尾缀已有规范目录 → **移入回收区**（不删，留 30 天）；② 若无 → **重命名为规范名**（保留尾 8 hex） |
| **4c** 重名后缀/脏目录 | 12 | 已查清（见 §十-3）：`v2-e2e-*` 测试残留 3 + `page-page-*` 中文 ID 6 + 其他；**须先定性再处置，勿与 4b 同批** |
| **`backend-node/workspace`** | 527 | 待 S5 决定「纳入搜索根」还是「作为冗余副本清理」 |
| **`projectRoot/workspace`** | 9 | 100% 任务号名，建议整个根退役 |

**迁移铁律**（沿用既有教训 + 本轮复审新增第 6 条）：
1. **多副本同时改**：`frontend/workspace` 与 backend 侧必须同步，否则「预览 A 副本 / 修复 B 副本」再次分叉；
2. **保尾 8 hex**：`resolveComponentDirStrict` 靠尾缀跨副本关联，改名必须保留尾缀；
3. **先备份再动手**：目录级 `cp -r` 或移入 `_naming-migration-backup-<ts>/`，不用 `rm`；
4. **按类别分批**（每批 ≤10 个），每批后跑 `naming-audit.mjs` 复验；
5. **两环境各跑一次**：`deploy-cloud.sh` 不同步 workspace，生产存量独立；
6. **🆕 git 感知（本轮新增，硬前置）**：`frontend/workspace` **已入库 3380 个文件 / 169 个组件目录**（见 §十）。批量 `mv` 会让已跟踪目录变成「删除 + 新增」，因此每批改名必须：
   - 改前 `git -C frontend status --porcelain workspace` 确认工作区干净；
   - 用 `git mv`（而非 `mv`）保留历史，或先 `git rm -r --cached <旧目录>` 再改名；
   - 单批 commit，**禁止 `git add -A`**（沿用仓库约定）。
   `backend-node/workspace` 与 `projectRoot/workspace` 的 `.gitignore` 是**生效的**（跟踪数 = 0），这两个根可自由 `mv`。

---

## 七、与「改 sessionId」方案的对比

| 维度 | 本方案（任务号不变） | 改 sessionId 前缀 |
|---|---|---|
| 代码改动点 | **2 处核心 + 1 处断言** | 6 处生成点 + 16 处后端判定 + 4 处前端判定 + 白名单 |
| DB / 快照 / SSE / 路由 | ✅ 全不动 | ❌ 全部受影响 |
| 存量目录 | 813 个（清理/改名） | 813 个（**且要连带 DB 主键、快照目录一起迁**） |
| 白名单 `/^(c\|cp\|mv\|page)-/` | ✅ 不用改 | ❌ 改 `c-` 会拆掉 `microcode-engineer.js:4098` 的重建防线 |
| `componentModeText` / `getTaskTier` | ✅ 不受影响 | ⚠️ 需保留 lite/max 段才安全 |
| 可回滚性 | ✅ 单文件回退即可 | ❌ 数据已迁，回退困难 |

---

## 八、验收标准

| 项 | 判据 |
|---|---|
| S1 | `resolveWritableComponentDirs(任务号)` 返回值包含规范名目录 |
| S2 | `resolveComponentDirStrict(任务号)` 返回值 basename 以 `c-` 开头 |
| S3 | 人为构造编码型 `declare.componentId` → 写盘报错而非静默通过 |
| S4 | `naming-audit.mjs` 的 4a = **0**、2（跨根不同名）= **0** |
| S6 | 新生成一个组件 → 目录名 = `declare.componentId` = `c-<语义>-<尾8hex>`；检查/AI 修复/预览/下载四者读同一目录 |

> **S1 / S2 / S3 已于 2026-09-10 23:50 实施并验证通过，逐条证据见 §十一。**

---

## 九、待确认

1. **是否按序执行 S1 → S2 → S3**（代码改动，含 `tsc` 构建 + `naming-audit` 前后对比 + jest 基线比对）？
2. **S4 存量清理**采用「重命名」还是「移入回收区」？是否需要我先出一份逐条清单（当前 813 条太多，建议先选 1 个尾缀做试点）？
3. **S5 读写根分叉**（`backend-node/workspace` 527 个目录）是纳入搜索根、还是作为冗余副本清退？

---

## 十、严肃复审（2026-09-10 22:5x，实跑取证后的修订）

> 复审方式：不读代码推断，**实跑** `resolveComponentDirStrict` / `resolveWritableComponentDirs` / `naming-audit.mjs`，
> 并对 `git ls-files` / `find` / `ls` 逐项验证。以下每条都给出可复现命令或文件:行号。

### 10.1 结论确认（与上轮一致，已复跑复核）

| 项 | 上轮值 | 复审实测 | 判定 |
|---|---|---|---|
| 任务号形态目录（component 族合计） | 813 | **813** | ✅ |
| 4a `declare.componentId` 是任务号 | 138 | **138**（fe/custom 80 + be/ws/custom 57 + root-ws/custom 1） | ✅ |
| 4b 残留老目录 | 285 | **285** | ✅ |
| 4c 不一致目录 | 12 | **12**（构成见 10.3，比上轮描述更严重） | ⚠️ 需修正描述 |
| 跨根多种名字 | 2 | **2**（`c298235f` 4 份 / `c1914947` 3 份） | ✅ |

`c298235f` 组的解析行为复审复现：传 **规范 ID** `c-environment-monitor-c298235f` 进去，`resolveComponentDirStrict` **仍返回任务号目录** `workspace/custom-components/mc-lite-1789035969084-c298235f` ——
因为尾缀匹配**完全忽略传入名，只看尾 8 hex**，而 `root-ws/custom`（优先级最高）里躺着的正是任务号目录。
**即：用规范 ID 查也查不到规范目录。** 这是比「查任务号查不到规范目录」更严重的形态。

### 10.2 🔴 新增：S4 的真实 git 代价（上轮完全遗漏）

| 根 | git 仓库 | 跟踪文件 | 跟踪的组件目录 | 其中任务号形态 |
|---|---|---|---|---|
| `frontend/workspace/custom-components` | frontend | 2596 | **98** | 83 |
| `frontend/workspace/vue3-components` | frontend | 779 | **71** | 69 |
| `frontend/workspace/api-modules` | frontend | 4 | 1（`flow/`） | — |
| `frontend/workspace/custom-panels` | frontend | 1（`.gitkeep`） | 0 | — |
| `backend-node/workspace/*` | backend-node | **0** | 0 | — |
| `projectRoot/workspace/*` | mvgo（主仓） | **0** | 0 | — |

要点：
1. **三仓 `.gitignore` 都有 `workspace/` 规则**（`frontend/.gitignore:51`、`backend-node/.gitignore:39`、主仓 `.gitignore:30`），**后端与主仓的规则是生效的**（跟踪 0）；只有 `frontend/workspace` 的规则被早期提交绕过（`git check-ignore -v --no-index workspace` → `.gitignore:51:workspace/` 但文件已入库）。
2. 因此 S4 的 git 影响面**只限 `frontend/workspace`**：**169 个组件目录 / 3380 个文件**，其中 **152 个是任务号形态**（=改名会真实改动 git 的数量）。
3. 上轮「3380 个文件全部受影响」表述**过宽**，正确表述是「169 个目录涉及 git，813 条里只有 152 条需走 `git mv`，其余 661 条可自由 `mv`」。
4. 附带发现：`frontend/workspace` 已被 `.gitignore` 忽略却仍被跟踪 → 后续新生成的组件**不会**再入库，所以这个 169 是**冻结的历史集合**，不会增长。

### 10.3 ⚠️ 4c 的 12 条真实构成（上轮描述为「重名后缀漂移」，不准确）

| 目录名 | 所在根 | git | `declare.componentId` | 判定 |
|---|---|---|---|---|
| `v2-e2e-p2verify-1786520871372` | fe/custom + be/ws/custom | √/× | `e2emodalp2` | e2e 测试残留 |
| `v2-e2e-microcode-max-1786518174118` | fe/custom + be/ws/custom | √/× | `e2emodalp2` | e2e 测试残留 |
| `v2-e2e-microcode-max-1786420688421` | fe/custom + be/ws/custom | √/× | `chart` | e2e 测试残留 |
| `page-page-1784847100090-2c02e104-2-7879` | fe/custom | √ | **`c-环境监测`** | 页面骨架误落组件根 + **中文 ID** |
| `page-page-1785047305483-e525beb3-2-7879` | fe/custom | √ | **`c-环境监测`** | 同上 |
| `page-page-1785049023343-dc4245c3-2-7879` | fe/custom | √ | **`c-环境监测`** | 同上 |
| `page-page-1785049023343-dc4245c3-2-8417` | fe/custom | √ | **`c-设备监测`** | 同上 |
| `page-page-1785230057176-9a95c836-2-8417` | fe/custom | √ | **`c-设备监测`** | 同上 |
| `page-page-1784847100090-2c02e104-2-8417` | fe/custom | √ | **`c-设备监测`** | 同上 |

两条独立问题被这一组暴露出来，**均不在原方案覆盖范围内**：

- **A. `v2-e2e-*` 前缀不含 `mc-`/`mv-`** → 不被 `ENCODED_RE` 捕获，也不是规范名，属于**游标外的脏目录**（e2e 脚本产物被 commit）。建议：确认 `backend-node` 的 e2e 脚本是否用时间戳命名临时目录；如是，加清理钩子。
- **B. `declare.componentId` 是中文**（`c-环境监测` / `c-设备监测`）→ 与以下三处 ASCII 假定冲突：
  - `SPEC_RE = /^c-[a-z][a-z0-9-]*$/`（盘点脚本）
  - `component-naming.js` 的 `semanticSegmentOf` / `classPrefixOf`（**需实测确认中文语义段是否会被拒**）
  - CSS class 前缀生成（中文进 class 名 → 非法 CSS 标识符风险）
  建议：单独立项确认「中文语义段是否合法」，不要在本次改名中顺手处理。

### 10.4 ✅ 需要撤回 / 降级的上一轮结论

| 上轮结论 | 复审结论 | 依据 |
|---|---|---|
| `v-` 与 Vue 指令**语法硬冲突** | ❌ **说重了**。降级为「1 处确定性缺陷」，且**已实锤落盘**：`c-mc-lite-1788491849328-99e8660b`（目录名被加了 `c-` 前缀、内部仍是任务号）。成因 `component-naming.js:182` 兜底 `c-${id}`。其余 `props-wiring-guard.js:416`、`layout-responsive-graph.js:345` 等全作用于**模板属性名**，不命中目录名/ID | `naming-audit` 4a 清单实采 |
| vue3 可改用 `cp-` 空闲槽位 | ❌ **撤回**。`cp-` 是 **Figma 根容器命名约定**，非空闲 | `figma-plugins/naming-checker-v2/code.ts:297`、`docs/product/Figma-管线整理规范.md:44` |
| 「glob 键反推 componentId」是生产风险 | ❌ **撤回**。实测该链路在生产**恒为空**：`vue3-components` 任意深度 **0 个** `component.js`/`declare.js`/`declare.ts`/`declare.json`（只有 `component-meta.json`/`index.vue`/`package/`/`resources/`）；且 `vcf.js` 的 glob 只有 `@/components/**` 与 `@/workspace/vue3-components/**`，**根本没有 custom-components 的 glob** | `find` = 0；`frontend/src/core/vcf.js:6,8,16,18`；`frontend/src/router/index.js:88-92` |
| `vite.config.js:557-568` 目录列表 = 生产构建排除 | ❌ **误读**，它是 `optimizeDeps.exclude`（dev 预扫描跳过） | `frontend/vite.config.js:557-568` |
| `frontend/workspace` 3380 文件「全部」受影响 | ⚠️ **过宽**，收敛为 169 个目录 / 152 条任务号形态 | 见 10.2 |

> `custom-components 不参与生产构建` 这一点的**正确理由是**：前端 glob **从未声明** custom-components，
> 而不是某个 exclude 配置。注释（`vcf.js:7`）与实现一致，属于**存量正确**，不必改。

### 10.5 🆕 补入盘点的子根（上轮工具未覆盖）

| 子根 | 族 | 目录数 | 说明 |
|---|---|---|---|
| `backend-node/workspace/vue3-pages` | page | 4 | `page-<12hex>` + `page-meta.json` + `组件清单.md`；**不在搜索根**（与组件根同类的读写分叉） |
| `frontend/workspace/vue3-pages` | page | 0 | 前端侧不存在 → 页面骨架同样只落 backend 侧 |
| `frontend/workspace/custom-panels` | other | 0 | 仅 `.gitkeep` 入库；`vcf.js:31` 的 glob `@/workspace/custom-panels/*/*.vue` 当前为空 |
| `frontend/workspace/api-modules` | api-module | 1 | `flow/`（`flow.js`/`flow-enums.js`/`flow.mock.js`/`flow.usage.md`）—— 接口生成产物，无 `c-`/`mc-` 语义，**不受本次改造影响** |

`naming-audit.mjs` 已升级：新增 `family`/`inSearchRoot` 字段、`gitTracked` 列、§5 其他族分布、§6 git 跟踪面汇总。
**只有 `family === 'component'` 的根参与尾缀/编码/4a-4c 分析**，避免 `page-`/`api-module` 污染统计。

### 10.6 🆕 `/__raw` 是 dev 下的**第二条写盘链路**（后端断言保护不到）

`frontend/vite.config.js:113-134` 的 `workspace-raw-files` 插件**同时支持写**：
```
line 119  // ── 写：dev-only，Playground 实时编辑把源码写回 frontend/workspace ──
line 121-122 // 后端保存会落到 backend-node/workspace，与 /__raw 读的 frontend/workspace 不同，
             // 故 dev 下编辑器直接写 frontend/workspace
line 132  if (!absPath.startsWith(workspaceRoot + path.sep)) → Forbidden
```
含义：
- S3 的「写盘防腐断言」若只加在 `file-writer.js`，**dev 下经 `/__raw` 的写入不受保护**；
- 但与 10.4 一致 —— 该链路写的是 `frontend/workspace`，**恰好是 S2 排序修复后 `resolveComponentDirStrict` 会命中的根**，风险方向相反、可控；
- `/__raw` 的写入口只接受完整绝对路径且做前缀校验，**不接受组件 ID**，所以不产生新的「名字→目录」解析，属低风险。

### 10.7 复审后的三项建议（替换 §九）

1. **S1 → S2 → S3 是否现在改？**
   → **建议先只做 S2（排序）**，理由是它单独就能把「用规范 ID 也命中任务号目录」的现状扭转（10.1），且改动面最小（1 处排序 + 1 处注释），可独立回滚。S1（realName 取 declare）会**扩大可写目录集合**，在 `frontend/workspace` 有 169 个入库目录的情况下必须先确认 git 状态干净再动。S3 断言要与 S1 同批上，否则 S1 放开写盘后没有兜底。

2. **S4 存量 813 条怎么处置？**
   → 按 **10.2** 拆成两批：
   - **可自由 `mv` 的 661 条**（backend-node/workspace 393 + root-ws 9 + 其余）：无 git 负担，建议直接用 `naming-audit.mjs` 生成的清单脚本化改名；
   - **需 `git mv` 的 152 条**（全在 `frontend/workspace`）：每批 ≤10、单批 commit、禁用 `git add -A`。
   → **先选 1 个尾缀试点**（建议 `c298235f`，它同时覆盖「4 份副本 / 2 种名字 / declare 双向污染」全部形态），验证 S1-S3 后再放量。
   → **4c 的 12 条先别动**（10.3 的两个独立问题要单独定性）。

3. **S5 读写根分叉方向？**
   → **证据倾向「纳入搜索根」而非清退**：`backend-node/workspace/custom-components` 有 **116 个规范 `c-` 目录**（全部根里最多），如果清退就等于丢掉最干净的一份；相反，`projectRoot/workspace`（9 个、100% 任务号）**建议整个根退役**，因为它是搜索根第 1 位、纯脏数据、退役后 S2 排序压力自然消失。
   → 需先上生产核实 `docker-compose.yml` / ECS 上 workspace 的卷挂载（本地 grep 未找到挂载声明）。

---

## 十一、S1 / S2 / S3 实施记录（2026-09-10 23:50 已完成并验证）

### 11.1 改动清单（2 个文件，+约 90 行）

**`backend-node/src/ai-engine/utils/component-resolver.js`**

| 项 | 内容 |
|---|---|
| 新增 import | `import { isEncodedSessionId } from './component-naming.js'`（**复用**既有编码型判定，不另造正则） |
| 新增常量 | `CANONICAL_NAME_RE = /^c-[a-z]/` |
| 新增导出 | `isEncodedComponentName(name)`、`readDeclaredComponentId(dir)` |
| 新增内部 | `namingRank(name)`（0=规范 c- / 1=其他 / 2=任务号）、`rankDirsByNaming(dirs)`（稳定排序） |
| **S2** | `resolveComponentDirStrict` 多命中选择：`hits[0]` → `rankDirsByNaming(hits)[0]`；WARN 文案改「规范名优先」并输出 `candidates` |
| **S1** | `resolveWritableComponentDirs`：`realName = readDeclaredComponentId(strict) \|\| basename(strict)` |
| S1 附带 | 候选循环由「根外层 / ID 内层」改为「**ID 外层 / 根内层**」→ 规范名副本整体排在任务号副本之前（`writableDirs[0]` 即主目录） |

**`backend-node/src/ai-engine/tools/playground-tools.js`**

| 项 | 内容 |
|---|---|
| 新增 import | `import { buildComponentId, semanticTokenFrom } from '../utils/component-naming.js'` |
| 新增导出 | `normalizeDeclareComponentId(raw, fallbackComponentId, filePath)` |
| **S3** | `writeComponentFile` 在 `.vue` 语法校验后、快照前，对 `declare.json` 计算 `effectiveContent`；全部写盘目标与 `bytesWritten` 改用 `effectiveContent` |

### 11.2 验证证据（实跑，非推断）

**行为断言 7/7 通过**（临时探针，跑完已删除）

| 断言 | 修复前 | 修复后 |
|---|---|---|
| `resolveComponentDirStrict('mc-lite-1789035969084-c298235f')` | `workspace/custom-components/mc-lite-…-c298235f`（任务号目录） | **`frontend/workspace/custom-components/c-environment-monitor-c298235f`** |
| `resolveComponentDirStrict('c-environment-monitor-c298235f')`（规范 ID） | 同上，**也**命中任务号目录 | **同规范目录** |
| `resolveWritableComponentDirs(任务号)[0]` | 任务号目录 | **规范目录** |
| `resolveWritableComponentDirs(任务号)` 是否含规范副本 | 否 | **是**（3 个副本） |
| `normalizeDeclareComponentId(污染 declare, …)` | — | `mc-lite-…-c298235f` → **`c-env-monitor-c298235f`**（中文「环境监测」→ `env-monitor`） |
| `normalizeDeclareComponentId(规范 declare, …)` | — | **原样返回**（无副作用） |
| `normalizeDeclareComponentId('{ not json', …)` | — | **抛错**（结构非法不放过） |

WARN 日志实测输出（新增可观测性）：
```
[WARN] 组件目录尾缀多命中，规范名优先
  picked: frontend/workspace/custom-components/c-environment-monitor-c298235f
  candidates: [c-environment-monitor-c298235f, workspace/.../mc-lite-…, frontend/.../mc-lite-…]
[WARN] declare.componentId 为任务号形态，写盘前已归一
  from: mc-lite-1789035969084-c298235f → to: c-env-monitor-c298235f
```

**构建 / 回归**

| 项 | 结果 |
|---|---|
| `rm -f tsconfig.build.tsbuildinfo && npm run build` | ✅ 成功（`✅ references copied to dist`） |
| dist 产物新鲜度 | ✅ `dist/*.js` = 23:51 ≥ `src/*.js` = 23:51 |
| 新符号进产物 | ✅ `rankDirsByNaming`×2 / `readDeclaredComponentId`×3 / `isEncodedComponentName`×4 / `normalizeDeclareComponentId`×2 |
| jest 回归（受影响 2 套） | ✅ `package-component.spec.ts` + `mc-spec-skill-install.spec.ts` → **2 suites / 21 tests passed**，与基线一致 |

> **副产品澄清（重要）**：`backend-node` 的 `package.json` **没有** `"type": "module"`，`ai-engine/**/*.js`
> 是靠 `nest-cli.json` 的 assets `**/*.js` **原样拷贝**进 dist 的纯 ESM 文件；node 22 通过
> 「模块类型自动探测 + `require(esm)`」加载它们（运行时会打 `MODULE_TYPELESS_PACKAGE_JSON` 提示）。
> 因此给 `component-resolver.js` 加相对 ESM import 是安全的，无需改 package.json。

### 11.3 尚未执行（保持待授权状态）

| 项 | 状态 |
|---|---|
| **服务重启** | ⏳ 线上进程 PID 7528 仍载旧 dist，**需重启才生效**（未获授权，未动） |
| S4 存量 813 条 | ⏳ 未执行（661 条自由 `mv` + 152 条 `git mv`；建议先选尾缀 `c298235f` 试点） |
| S5 读写根分叉 | ⏳ 未执行（倾向纳入 `backend-node/workspace`，退役 `projectRoot/workspace`） |
| 4c 的 12 条脏目录 | ⏳ 未执行（`v2-e2e-*` / `page-page-*` 中文 ID，需单独立项） |
