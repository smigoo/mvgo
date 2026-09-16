# 命名改造影响面调研：`mc-xxxx` → `c-xxx`、Vue 组件 → `v-xxxx`

> 调研日期：2026-09-10 · 范围：全仓（backend-node / frontend / 目录产物 / Mongo 存量）
> 结论一句话：**「组件规范 ID」这一层其实已经改成 `c-*` 了；真正还带 `mc-` / `mv-` 的是「任务号 sessionId」和它的磁盘目录 —— 这一层不建议改。而 `v-` 前缀有硬冲突，建议不要引入。**

---

## 一、结论速览

| 层次 | 当前形态 | 谁在用 | 改成 `c-` / `v-`？ | 判定 |
|---|---|---|---|---|
| ① **任务号 sessionId** | `mc-lite-<ts>-<hex>`、`mc-max-…`、`mv-lite-…`、`mv-max-…` | DB 主键、全部 API 入参、快照目录、temp 目录、SSE 频道、前端路由 | ❌ **不建议** | 它是「任务」标识，不是「组件」标识。改成 `c-`/`v-` 会让「任务」与「组件」两种 ID 同名，反而更乱 |
| ② **组件规范 ID（declare.componentId）** | 新产物**已统一** `c-<语义>-<hex8>`（如 `c-env-monitor-43e7fe45`）；`v-` 从未出现过 | `declare.json`、workspace 目录名、DB `components.componentId`、CSS class 前缀 | ✅ **已经是 `c-` 了**，无需改造 | **已完成，只需防腐** |
| ③ **workspace 磁盘目录名** | 新产物已按 declare 归一到 `c-*`；**老产物残留** `mc-*` | 预览 URL、组件库列表、Playground 定位 | ⚠️ 存量可迁，但要逐副本同步 | **可做但需分批** |
| ④ **Vue3 侧** | 目录/ID 一律 `mv-*`（134+132 个） | vue3 workspace、DB | ⚠️ 若改，需同步 5 处白名单 | **不建议用 `v-`，可用 `cp-` 或保持 `mv-`** |

---

## 二、核心澄清：你说的「mc-xxxx」其实是两种东西

### 2.1 「组件规范 ID」早已是 `c-*`（不需要改）

`backend-node/src/ai-engine/utils/component-naming.js:1-9` 的文件头注释就是这段历史的结论：

```
 * 背景：figma/截图生成组件此前 componentId 有两套坏格式——
 *   - max 管线：LLM 自由发挥 englishId（c-monitor）撞名后 workspace 目录被 resolveUnique 追加 -2/-27
 *   - lite 管线：整段 sessionId（mc-lite-1788... / 无 c- 前缀）当 componentId
 * 统一为确定性格式：`c-<语义段>-<sessionId 尾 8 hex>`（如 c-monitor-43e7fe45）
```

**2026-09-04「方案 C」已经落地**：

- `buildComponentId()`（`component-naming.js:160-167`）产出 `c-<语义>-<tail8>`，M1-1 校验规则 `^c-`；
- lite 管线接入点：`lite/lite.service.ts:431` → `buildComponentId(finalComponentName, sessionId)`；
- max 管线归一：`ai-engine/roles/microcode-engineer.js:4075 / 4087` → `d.componentId = buildComponentId(seg, sessionId)`；
- 校验器事实源：`code-structure-validator.js:553` → `classPrefixOf(decl.componentId)`。

**磁盘取证**（抽样 400 个 `custom-components/**/declare.json`）：

| declare.componentId 前缀 | 数量 |
|---|---|
| `mc-` | 104（全是**老产物**） |
| `c-` | 276（新产物） |
| `v-` | 0 |

所以「把 mc-xxxx 改成 c-xxx」这件事，**新链路不需要动**；剩下的只是老产物。

### 2.2 「任务号 sessionId」才是 `mc-` / `mv-` 的真实来源（不建议改）

生成点共 **4 处**（后端全部生成，前端从不生成）：

| # | 文件:行 | 代码 | 形态 |
|---|---|---|---|
| 1 | `lite/lite.controller.ts:316-318` | `const typePrefix = componentType === 'microcode' ? 'mc' : 'mv'` | `mc-lite-<ts>-<hex>` |
| 2 | `lite/html-split.service.ts:160-161` | 同上 | `mc-lite-…` |
| 3 | `lite/html-split.service.ts:286-287` | 同上 | `mc-lite-…` |
| 4 | `lite/batch.service.ts:265-267` | 同上（批量） | `mc-lite-…` |
| 5 | `phase2/phase2.controller.ts:275-278` | `const idPrefix = dto.target === 'vue3' ? 'mv' : 'mc'` | `mc-<ts>-<hex>` |
| 6 | `vue3/vue3.controller.ts:131` | 硬编码 | `mv-<ts>-<hex>` |

`sessionId` 的消费面（改名会连带打断的地方）：

- **磁盘**：`temp-components/<groupId>/<sessionId>-<name>/`（`vue3.service.ts:66-79`，注释明确「temp 目录必须以业务组件号 sessionId 开头，重启恢复才能精确关联任务产物」）；
- **快照**：`temp-components/.task-code-snapshots/<sessionId>/revisions/<rev>/`（`task-code-snapshot.service.ts:132`）；
- **DB**：`components.componentId`、`tasks.sessionId`；
- **后端判断 6 处**：`tasks/tasks.service.ts:1446、1459、1460、1461`；
- **前端判断 4 处**：`utils/task-actions.ts:32-33`、`utils/preview-resolver.ts:39`、`views/demo/composables/useFileManager.js:250`、`views/demo/index.vue:2327-2328`；
- **SSE / 预览 URL**：`/api/progress`、`preview.controller.ts` 路由均以 componentId(=sessionId) 为 key。

> 关键判断：`sessionId` 与 `componentId` 是**两套 ID 体系**。组件 ID 用 `c-`（微码语义），任务号用 `mc-`（microcode）/`mv-`（microcode-vue3）。把任务号也改成 `c-`，会让「这个 ID 是任务还是组件」无法一眼分辨 —— 而 `resolveComponentDirStrict()` 恰恰依赖「尾 8 hex 相同」把两者串起来（见 §3.3）。**任务号前缀属于「内部编码」，不是用户体验可见的命名，改它收益极低、风险极高。**

---

## 三、涉及面清单（若坚持要改，逐项都在这里）

### 3.1 前缀白名单正则 —— 5 处，**必须同步**（这是最容易漏的）

| # | 文件:行 | 当前正则 | 说明 |
|---|---|---|---|
| 1 | `ai-engine/roles/microcode-engineer.js:4098` | `/^(c\|cp\|mv\|page)-/` | componentId 合法性 |
| 2 | `ai-engine/roles/microcode-engineer.js:4340` | `/^(c\|cp\|mv\|page)-/` | 归一兜底 |
| 3 | `ai-engine/utils/workspace-preview-publisher.js:608` | `/^(c\|cp\|mv\|page)-/` | 发布目录名归一 |
| 4 | `ai-engine/utils/component-naming.js:179、181` | `/^(c\|cp\|mv\|page)-(.+)-[0-9a-f]{8}$/` | classPrefixOf 剥尾段 |
| 5 | `ai-engine/utils/component-naming.js:195` | `/^(c\|cp\|mv\|page\|mc)-/` | semanticSegmentOf |

**现状：白名单里没有 `v-`。** 若引入 `v-` 前缀而漏改这 5 处 → 产物 ID 被判非法 → `componentId` 被再拼一次 `c-` 前缀 → 出现 `c-v-xxx` 双前缀，且 `classPrefixOf` 剥离失败 → CODE-003 类名不命中门禁误报。

另有剥离正则 2 处：`microcode-engineer.js:3354、4026` 的 `/^(mc|cp|mv|page)-(\d{13}-)?/i`。

### 3.2 前端类型推断 —— 4 处

| 文件:行 | 代码 |
|---|---|
| `utils/task-actions.ts:32-33` | `if (id.startsWith('mv-')) return 'vue3'` / `if (id.startsWith('mc-')) return 'microcode'` |
| `utils/preview-resolver.ts:39` | `return id.startsWith('mv-') ? 'vue3' : 'microcode'` |
| `views/demo/composables/useFileManager.js:250` | `return componentId.value.startsWith('mc-')` |
| `views/demo/index.vue:2327-2328` | 同上两条 |

`task-actions.ts:22` 注释记录了历史教训：「收敛此前 6 处重复的 `id.startsWith('mv-')` 内联判断——改一处漏五处的隐患」。**这已经是踩过一次的坑。**

### 3.3 目录定位机制 —— 尾缀匹配，是「不改 sessionId」的技术理由

`ai-engine/utils/component-resolver.js#resolveComponentDirStrict()` 的匹配策略是**尾 8 hex**：

```
任务号  mc-lite-1789035969084-c298235f
真实目录 c-environment-monitor-c298235f      ← 共享尾缀 c298235f
```

`copyToWorkspace` 已有归一日志实锤（server.log）：

```
[publishQualityPreview] workspace 目录名按 declare.json 归一
  {"original":"mc-lite-1789035969084-c298235f","resolved":"c-environment-monitor-c298235f"}
```

即：**「任务号带 mc-，落地目录是 c-」这本来就是设计。** 如果把任务号也换成 `c-`，尾缀匹配的区分度下降，且 `resolveComponentDirStrict` 的「多命中 WARN」（本轮刚加）会更频繁触发。

> ⚠️ 同一尾缀已实测命中 3 个目录（`mc-lite-…-c298235f` + `c-environment-monitor-c298235f` + 副本），属存量噪声，**尚未处置**。

### 3.4 存量规模（改名的实际工作量）

| 位置 | `mc-` | `c-` | `mv-` | 其他 |
|---|---|---|---|---|
| `workspace/custom-components`（根） | 9 | 0 | 0 | 0 |
| `frontend/workspace/custom-components` | 279 | 109 | 0 | 13 |
| `backend-node/workspace/custom-components` | 275 | 116 | 0 | 4 |
| `frontend/workspace/vue3-components`（两层） | 1 | 0 | 134 | 0 |
| `backend-node/workspace/vue3-components`（两层） | 0 | 0 | 132 | 0 |
| `temp-components`（两层） | 238 | 0 | 31 | 1 |
| **Mongo `components`（67 条）** | **17** | **27** | **15** | **8（空）** |

- 微码 `mc-` 目录合计 ≈ **563 个**（frontend 279 + backend-node 275 + 根 9）；
- 临时目录 `mc-` 238 个是可清理的，不必改名；
- **Mongo 只有 17 条 `mc-` componentId 需要迁移**（数量很小，是最大的好消息）。

**注意「多副本双写」**：`resolveWritableComponentDirs()` 必须返回全部正式副本，重命名必须对同一 `c-*` 目录在 `frontend/workspace` 与 `backend-node/workspace` **同时**执行，否则两份失同步（历史上已因此出过「预览有内容、下载是空壳」）。

---

## 四、`v-` 前缀：**明确不建议**

| 风险 | 证据 |
|---|---|
| **与 Vue 指令语法天然冲突** | `ai-engine/utils/props-wiring-guard.js:416`：`if (attrName.startsWith('v-') && !attrName.startsWith('v-bind:')) return` —— `v-` 在本仓库语义就是「Vue 指令」，不是「组件编号」 |
| 大量 `v-` 解析逻辑会被污染 | `layout-responsive-graph.js:345-346`（`v-if/v-for/v-model/v-on` 剥离）、`figma-section-heights.js:37`（`v-slot/v-if/v-bind` 判定）、`runtime-static-rules.js:69-71` |
| 语义也不准确 | 现有 `mv-` = microcode-vue3（微码的 Vue3 版），不是「普通 Vue 组件」；改 `v-` 反而丢失「微码」这一层信息 |

**替代建议**：若要给 Vue3 组件换前缀，用 **`cp-`**（白名单已有 `cp`）或 **`vc-`**；若不换，保持 `mv-` 也完全能用。

---

## 五、建议方案（三选一）

### 方案 A（推荐）：**不改前缀，只做存量清理 + 防腐**

- ① 老产物 `mc-*` 目录：不批量改名（会打断预览 URL 与尾缀匹配），改走**「重新发布时按 declare 自动归一」** —— 复用 `copyToWorkspace` 已有机制，新目录落 `c-*`，老目录随之被替换；
- ② Mongo 17 条 `mc-` componentId：写一次性迁移脚本（`mc-<name>-<hex>` → `c-<name>-<hex>`，保留尾缀），**低风险、可回滚**；
- ③ 加一道**防腐哨兵**：在 `buildComponentId` 出口断言 `^c-`，一旦有回退立刻 fail-fast（而不是再靠人工 grep）。
- 工作量：小。风险：低。

### 方案 B：**新增即 `c-` / `v-`，存量不动**

- 只改 §3.1 的 5 处白名单（补 `v-`）+ §3.2 的 4 处前端判断（补 `c-`/`v-` 分支）；
- 存量 563 个 `mc-*` 目录继续用尾缀匹配兼容；
- **代价**：长期维护「新旧两套前缀」的兼容分支，代码里 `startsWith` 判断变复杂 —— 与 `task-actions.ts:22` 想收敛的初衷相反。
- 工作量：中。风险：中（最容易漏改白名单 → 双前缀）。

### 方案 C：**不做**（当前命名其实是合理的）

「`mc-`/`mv-` 是任务号、`c-` 是组件号」是清晰的分层。用户可见的组件名/目录名已经是 `c-*`。**如果你是从「组件库里看到 `mc-max-1789…` 这种名字很丑」出发的，那真正该修的是「组件库列表把任务号当展示名」这个 UI 问题，而不是 ID 体系。**

---

## 六、如果只做一件事

> **把「组件库 / 任务列表展示」与「ID」解耦** —— 展示层统一显示 `declare.name` 或语义名（如「环境监测」），ID 只在调试/复制时可见。

这样既解决了「命名丑」的观感问题，又不用碰 563 个目录 + 5 处白名单 + 4 处前端判断 + 17 条 DB 记录。

---

## 七、待决策 / 未动手

1. **同一尾缀 3 份产物并存**（`c298235f`）—— 未处置，等确认（删临时副本 / 保留正式目录）。
2. 本报告**未修改任何代码与目录**，纯调研。
3. 若选方案 A 的 ②③，可立即开工（预计改动面：1 个迁移脚本 + 1 处断言 + 1 个单测）。

---

# 补充调研（第二轮）：全场景 + 环境差异

> 触发：用户指出「组件预览、下载、更改、分享等场景都有可能出现」，并要求确认「生产 / 测试环境是否都要改」。
> 本轮**新增实测数据**，并修正了第一轮的部分判断。

---

## 八、全场景影响矩阵（15 个用户可见面）

| # | 场景 | 代码位置 | 用户实际看到 | 暴露 ID？ | 改名影响 |
|---|---|---|---|---|---|
| 1 | 组件库列表 · **组件编码列** | `ComponentLibrary.vue:127-128`（`getBusinessComponentId().slice(0,20)`） | `mc-max-1788252098143…` | 🔴 **直接显示** | 高 |
| 2 | 组件库 · **规格列 Max/Lite** | `ComponentLibrary.vue:438-441`（`id.includes('lite'/'max')`） | `Max` / `Lite` | 🟡 间接依赖 | **改名会直接算错** |
| 3 | 组件库 · 复制编码 | `ComponentLibrary.vue:459-467` | 剪贴板拿到 `mc-…`，用户会粘贴到别处 | 🔴 | 高 |
| 4a | 下载 · 浏览器文件名（前端） | `ComponentLibrary.vue:781` `a.download = \`${componentId}.zip\`` | `mc-lite-1789….zip` | 🔴 | 高 |
| 4b | 下载 · 响应头文件名（后端） | `demo/demo.service.ts:482 / 506` `Content-Disposition: filename="<id>.zip"` | 同上 | 🔴 | 高 |
| 4c | 下载 · **ZIP 内根目录** | `phase2/phase2.service.ts:2037` `archive.directory(workspacePath, componentId, …)` | 解压后文件夹叫 `mc-lite-1789…` | 🔴 | 高 |
| 5 | 预览 · 页面地址 | `router/basic-routes.js:35` `/preview/:componentId` + `preview-resolver.ts#buildPreviewUrl` | **浏览器地址栏** `/preview/mc-lite-…` | 🔴 | 高 |
| 6 | 预览 · Vue3 静态文件 | `preview/preview.controller.ts:105` `/preview/:groupId/:componentId/*path` | 网络面板可见 | 🟡 | 中 |
| 7 | 预览 · 快照文件 | `preview-resolver.ts#buildSnapshotFileUrl` `/api/tasks/:sessionId/code-snapshots/:rev/file` | 网络面板可见 | 🟡 | 中 |
| 8 | **更改 / Playground** | `ComponentLibrary.vue:769-771` `/demo/${componentId}` + `router/dev-route.js:20` | **地址栏** `/demo/mc-lite-…` | 🔴 | 高 |
| 9 | 任务中心 · 任务号 | `views/tasks/TaskCenter.vue:189 / 197` `任务号：{{task.sessionId}}` | 列表每行都显示 | 🔴 **最显眼** | 高 |
| 10 | 任务详情 · Tier 兜底 | `TaskDetail.vue:3043-3053` `sessionId.split('-')[1] === 'lite'/'max'` | Lite/Max 徽章 | 🟡 仅兜底（主用 `generationTier`） | 低 |
| 11 | 任务日志下载 | `ResultPanel.vue:334` `${sessionId}-logs.txt` | `mc-lite-….log` | 🔴 | 中 |
| 12 | **分享 / 发布公共池** | `api/component.ts:193-198` `publishComponent(_id)` | 无 ID，走 ObjectId | ✅ **不受影响** | **无** |
| 13 | GitLab 推送 | `gitlab-push.service.ts:151` 路径前缀 `{componentId}/{file}`；`:170` commit message | 仓库里目录名 + commit 标题 | 🔴 | 中 |
| 14 | API 绑定 | `vue3/dto/bind-api.dto.ts:118` `componentId` 入参 | 请求体可见 | 🟡 | 中 |
| 15 | 截图 / 视觉回归 | `screenshot-renderer.js:341` `FRONTEND_WORKSPACE` | 不含 ID | ✅ | 无 |

**小结：15 个面里 12 个会把 ID 露给用户**，只有「发布/分享」和「截图」不受影响。

### 8.1 一个被忽略的命名依赖（改名会静默算错）

`ComponentLibrary.vue:438-441`：

```js
function componentModeText(component) {
  const id = getBusinessComponentId(component).toLowerCase()
  if (id.includes('lite')) return 'Lite'
  if (id.includes('max'))  return 'Max'
  return '—'
}
```

规格列是**靠字符串里有没有 `lite`/`max` 猜出来的**。如果按方案 B 把 ID 改成 `c-xxx`（丢掉 `lite`/`max` 段），这一列会**全部退化成 `—`**，而且不报错。`TaskDetail.vue:3043` 的兜底同理。

---

## 九、实测：命名不一致**已经在制造真实故障**

对 3 个 workspace 根做尾缀交叉比对（314 个尾缀）：

| 指标 | 数量 | 说明 |
|---|---|---|
| 总尾缀 | 314 | |
| 多 root 命中 | 237 | 正常：`backend-node/workspace` 与 `frontend/workspace` 双副本 |
| **同尾缀不同名** | **2** | 🔴 解析歧义 |

两个异常：

**① `c298235f`（4 份产物、2 种名字）**

```
workspace/custom-components/mc-lite-1789035969084-c298235f          ← 根 workspace（旧名）
frontend/workspace/custom-components/mc-lite-1789035969084-c298235f ← 前端 workspace（旧名，残留）
frontend/workspace/custom-components/c-environment-monitor-c298235f ← 前端 workspace（规范名）
backend-node/workspace/custom-components/c-environment-monitor-c298235f
temp-components/6a51f7ca…/mc-lite-1789035969084-c298235f
temp-components/.task-code-snapshots/mc-lite-1789035969084-c298235f
```

→ **同一个目录（frontend/workspace）里同时躺着新旧两个名字**，说明「发布时归一」写入了新目录，但**旧目录没被清掉**。

**② `c1914947`（第三种历史格式）**

```
frontend/workspace/…/mc-max-1788171201725-c1914947
backend-node/workspace/…/mc-1788171201725-c1914947   ← 少了 -max- 段
```

### 为什么这是「真故障」而不只是洁癖

`resolveComponentDirStrict()`（`component-resolver.js:123-160`）尾缀匹配后**按 roots 顺序取首个**。源码注释（`:150-153`）已经自述了这个风险：

> 同一尾缀可能同时命中「规范命名目录」与「任务号命名目录」…… 两条链路若各选一份，就会出现**「检查通过但下载的是旧版」**这类诡异现象

即：**点「预览」和点「下载」可能落在不同副本上** —— 一个 c- 目录、一个 mc- 目录，内容可能不同版本。这不是改名才引入的风险，是**现在就存在**的问题，改名只是会放大它。

---

## 十、生产 / 测试环境：逐层回答

### 10.1 结论表

| 层 | 需要按环境分别处理？ | 依据 |
|---|---|---|
| **命名逻辑（代码）** | ❌ **不需要** —— 代码里**没有任何命名相关环境变量** | `config/backend-root.ts:36-37`、`component-naming.js` 全硬编码；`runtime-env.ts` 的必填项里也没有命名项 |
| **存量目录** | ✅ **必须各跑一次** | `deploy-cloud.sh:93/99` 只处理 `dist` 与 `package.json`，**不 rsync workspace** → 生产 workspace 在 `/home/mvbt/mvgo/` 自己长出来 |
| **Mongo 存量** | ✅ **每套库各跑一次** | 本地库实测 `components` 67 条（`mc-`17）；生产库数量需上机统计 |
| **nginx** | ❌ 不需要 | `docker/nginx/nginx.conf` 三条 location 全按**路径前缀**路由（`/api/progress`、`/api/mc-spec`、`/api`），与 ID 命名零关系 |
| **Java 层** | ❌ 不需改代码；只需迁 DB 字段值 | 全仓无 `mc-`/`mv-` 硬编码；CRUD 主键走 ObjectId（`ComponentService.java:137/196/231` 都 `ObjectId.isValid`），`componentId` 只用于展示与 GitLab 推送前缀 |
| **前端产物** | ⚠️ 改了前端就只有重新 build + 部署 dist 才生效 | 生产前端是静态文件 |

### 10.2 关键回答

> **「生产 vs 测试」在命名这件事上不是两个需要分别定制的环境，而是「同一份代码 + 两套各自独立的存量数据」。**

- 代码改一次，两个环境**同时生效**，不存在「只改测试不改生产」的选项；
- 但**迁移脚本必须在两边各执行一次**，且**生产存量规模无法从本地推断**（部署脚本不同步 workspace）；
- 生产要先跑一条只读统计（同 §九 的尾缀交叉比对），再决定迁移批次。

### 10.3 环境差异项（影响验证方式，不影响命名）

| 变量 / 行为 | 生产 | 开发 |
|---|---|---|
| `MC_PREVIEW_BASE_URL` | **必填**，缺失启动即失败（`runtime-env.ts:34-38`） | 回退 `http://127.0.0.1:2610` |
| `getFrontendCandidates()` | 仅主地址 | 额外追加 `2610/2611` fail-over（`runtime-env.ts:53-60`） |
| `FRONTEND_WORKSPACE` | 显式 `/home/mvbt/mvgo/frontend/workspace`（`deploy-cloud.sh:67`） | 默认 `../frontend/workspace` |
| 质量参数默认值 | `MAX_ITERATIONS=3` / `QUALITY_SCORE_THRESHOLD=90` | 同左（已对齐，`runtime-env.ts:82-105`） |

### 10.4 「测试环境」根本不存在独立部署

- `frontend/.env.test` **全文只有一行**：`VITE_MODE = 'test'`；
- backend 只有 `.env`（刻意空）、`.env.development`、`.env.production.example`；
- **没有** `.env.staging` / docker-compose 的 staging 段 / 第二台 ECS。

→ 所谓「测试环境」实际就是**本地开发环境（Node 13030 + 前端 2610 + 本地 Mongo）**。所以「生产要不要改」的真实含义是：**本地做完、验证通过后，要不要在生产也执行一次存量迁移** —— 答案是**要**，而且必须单独跑。

### 10.5 ⚠️ 顺带发现（与命名无关，但同属「预览」场景）

`preview-resolver.ts#buildPreviewUrl` 把**鉴权 token 直接拼进预览 URL 的 query**：

```js
const token = getAuthToken()
if (token) params.set('token', token)
```

用户若把预览地址复制给别人（分享场景），等于**连 token 一起分享**。建议后续评估是否改为同源 cookie 鉴权。

---

## 十一、修正后的行动建议：把「观感」和「数据」拆开

用户真正在意的「`mc-xxxx` 难看」，其实**不是 ID 体系的问题，而是展示层直接把 ID 当名字用了**。

### 11.1 观感层（零风险，不动任何 ID）

| 改动 | 位置 |
|---|---|
| 列表「组件编码」列改显示 `component.name`，ID 留在 tooltip（`title` 已挂全 ID） | `ComponentLibrary.vue:127-128` |
| 任务中心「任务号：mc-lite-…」改为组件名 + Lite/Max 徽章 | `TaskCenter.vue:189 / 197` |
| 下载文件名改用 `name` —— ⚠️ **前后端必须同步**，否则后端 `Content-Disposition` 会覆盖前端 `a.download` | `ComponentLibrary.vue:781` + `demo.service.ts:482/506` + `phase2.service.ts:2037` |
| 规格列 Max/Lite 改为读 `generationTier` 字段而非 `id.includes()` | `ComponentLibrary.vue:438-441` |

### 11.2 数据层（按环境执行）

1. **先修 §九 的 2 个不一致尾缀** —— 这是现存真实故障，优先于任何改名；
2. 存量迁移分两步：① 只读统计（两环境各一次）；② 迁移脚本（**保尾缀**，可回滚）；
3. 迁移前必须确认「多副本同时改」（`resolveWritableComponentDirs` 双写语义）。

### 11.3 明确不要动的

- `sessionId` 前缀（`mc-`/`mv-`）：任务标识，改它等于同时改 DB 主键、快照目录、SSE 频道、日志文件名、GitLab 路径；
- `resolveComponentType()` 的 `mc-`/`mv-` 前缀判断：它是前端类型判定的**唯一真相源**，动它要同步 4 处消费点 + 7 处白名单正则；
- `v-` 前缀：与 Vue 指令语法冲突（见 §四）。

---

# 第三轮修订：**保留 lite/max 段**前提下的结论

> 用户新增约束：**`lite` / `max` 段不丢**。
> 本节**推翻并修正** §四 与 §8.1 的部分判断，所有结论均以**真实执行 `component-naming.js`** 的实测为准。

---

## 十二、约束变更后的实测结果

### 12.1 实测：跑真实的 `component-naming.js` 函数

| 形态 | 白名单 `^(c\|cp\|mv\|page)-` | `classPrefixOf()` | `semanticSegmentOf()` | tier 可按 `split('-')[1]` 取到？ |
|---|---|---|---|---|---|
| `mc-lite-1789035969084-c298235f`（现状） | **FAIL** | `c-mc-lite-…` | 空（判无效） | ✅ lite |
| `mc-max-…`（现状） | FAIL | `c-mc-max-…` | 空 | ✅ max |
| `mv-lite-…`（现状 vue3） | PASS | `mv-lite-1789035969084-c298235f` | 空 | ✅ lite |
| **`c-lite-1789035969084-c298235f`** | ✅ **PASS** | ✅ `c-lite-1789035969084-c298235f`（13 位时间戳守卫拦住，未破坏） | ✅ 空（判无效） | ✅ **lite** |
| `v-max-1789035969084-c298235f` | ❌ **FAIL** | ❌ `c-v-max-1789035969084-c298235f`（**双段污染**） | 空 | ✅ max |
| `vc-max-…` | ❌ FAIL | ❌ `c-vc-max-…`（同样双段污染） | 空 | ✅ max |
| `c-environment-monitor-c298235f`（对照·规范 ID） | PASS | `c-environment-monitor` | `environment-monitor` | — |

**两个直接结论：**

1. ✅ **`c-lite-…` 形态是安全的** —— `component-naming.js` 的 **13 位时间戳守卫**（`:173 / :180 / :197`）本来就是为这种形态写的，会正确识别并拒绝剥离。`semanticSegmentOf` 判无效（不会把 `lite-1789…` 当语义段），`classPrefixOf` 不剥离（返回完整 ID）。
2. ❌ **`v-` / `vc-` 都不在白名单里**，会走 `component-naming.js:182` 的兜底 `return \`c-${id}\`` → 拼出 **`c-v-max-…`** 这种双段污染。

### 12.2 修订：§8.1 提的「静默算错」风险 **解除**

保留 lite/max 段后：

| 位置 | 代码 | 新形态下的行为 |
|---|---|---|
| `ComponentLibrary.vue:438-441` | `id.includes('lite')` / `id.includes('max')` | ✅ **继续正确** |
| `TaskDetail.vue:3043-3053` | `sessionId.split('-')[1] === 'lite'/'max'` | ✅ **`c-lite-…`.split('-')[1] === 'lite'`，继续正确** |

→ §8.1 那段可以划掉了。这是保留 lite/max 换来的实质收益。

### 12.3 修订：§四「`v-` 与 Vue 指令硬冲突」**降级**

第三轮复核后要诚实修正：`v-` 的**具体技术阻塞点只有 1 处确定性缺陷**：

- `component-naming.js:182` 兜底 `c-${id}` → `c-v-max-…`（实测已复现）

其余我上轮点名的位置（`props-wiring-guard.js:416`、`layout-responsive-graph.js:345`、`figma-section-heights.js:37`、`runtime-static-rules.js:69`）**全部作用在模板属性名上**，需要前后有空白或 `=` 才匹配，**不会命中目录名/组件 ID 位置**。

所以准确定性是：**`v-` 是「概念混淆 + 1 处确定性缺陷」，不是「语法硬冲突」**。我上轮说重了，这里更正。

---

## 十三🔴、真正的拦路虎换了：`c-` 与「组件规范 ID」撞前缀

保留 lite/max 之后，`c-lite-1789035969084-c298235f` 和 `c-environment-monitor-c298235f` **长成一模一样**。这会拆掉 2026-09-04「方案 C」故意留下的两道防线：

### 13.1 防线一：`componentId` 重建守卫被绕过（最严重）

`microcode-engineer.js:4098-4101`：

```js
} else if (!/^(c|cp|mv|page)-/.test(d.componentId)) {
  d.componentId = `c-${String(d.componentId).replace(/^[-]+/, '')}`;
  changed = true;
}
```

**现状**：如果任务号（`mc-lite-…`）漏进了 `d.componentId`，因为 `mc-` 不在白名单里 → 条件成立 → **被重建为规范 ID**。

**改成 `c-lite-…` 后**：`^c-` 判定 **PASS** → 条件不成立 → **跳过重建，任务号直接当组件 ID 写进 `declare.json`**。

→ 这正是 2026-09-04 方案 C 要修的那个 bug（`component-naming.js:7` 注释原文：「lite 管线：整段 sessionId 当 componentId」）。**`mc-` 前缀现在实际上是一道意外的安全网，拆之前必须先补上新网：**

```js
// 建议：形态判定代替前缀判定
const isEncodedId = (id) => /^(c|cp|mv|page|v)-/.test(id) && /\d{13}/.test(id);
} else if (isEncodedId(d.componentId) || !/^(c|cp|mv|page|v)-/.test(d.componentId)) {
```

同样的坑在 `workspace-preview-publisher.js:608`（决定 workspace 目录名是否按 declare 归一）。

### 13.2 防线二：`isMcId` 双向失灵

`code-validator.js:662` / `:783` / `:806` 是用来判断「`declare.componentName` 填的是个 ID 而不是中文名」，命中就自动替换成显示名：

```js
const isMcId = (name) => /^mc-\d{13}-[a-f0-9]+$/i.test(name);
const hasIdPrefix = (name) => /^(mc-|cp-|mv-|page-)/i.test(name);
```

| 选择 | 后果 |
|---|---|
| **不加 `c-`** | `declare.componentName = 'c-lite-1789035969084-c298235f'` 漏检 → **丑 ID 会直接显示在 UI 名称位** |
| **加 `c-`** | 又必须同时加 13 位时间戳守卫，否则规范 ID `c-environment-monitor-c298235f` 会被误判成「不是中文名」→ **正常组件名被自动改写** |

而现状（`c-` 不在 `hasIdPrefix` 里）**其实已经有个空档**：`c-environment-monitor-c298235f` 当 componentName 时同样漏检。所以这里本来就该补，只是改名会让它从「边缘空档」变成「高频路径」。

### 13.3 顺带：`cp-` / `page-` 不能拿来给 vue3 用

我上轮建议过「vue3 用 `cp-`」，**这个建议错了，撤回**：

| 前缀 | 实际语义 | 来源 |
|---|---|---|
| `c-` | 组件规范 ID | `component-naming.js:166` |
| **`cp-`** | **Figma 根容器命名约定** | `figma-plugins/naming-checker-v2/code.ts:297`、`docs/product/Figma-管线整理规范.md:44` |
| `page-` | 页面骨架 ID | `page-skeleton.service.ts:98` |
| `mv-` | vue3 任务号 | `vue3.controller.ts:131` |

→ 白名单里 `(c|cp|mv|page)` **四个槽位全都有主**。要给 vue3 换新前缀只能**新增**一个。

---

## 十四、修订后的完整改动清单（保留 lite/max 版）

### 14.1 后端前缀判定 —— **13 处**

| # | 文件:行 | 现在 | 需要改成 | 风险 |
|---|---|---|---|---|
| 1 | `ai-engine/roles/microcode-engineer.js:4098` | `!/^(c\|cp\|mv\|page)-/` | **加 13 位时间戳排除**（见 §13.1） | 🔴 拆防线 |
| 2 | `ai-engine/roles/microcode-engineer.js:4340` | `/^(c\|cp\|mv\|page)-/` | 同上加守卫 | 🟡 |
| 3 | `ai-engine/roles/microcode-engineer.js:3354` | `/^(mc\|cp\|mv\|page)-(\d{13}-)?/i` | 补 `c` / vue3 新前缀 | 🟡 |
| 4 | `ai-engine/roles/microcode-engineer.js:4026` | 同上 | 同上 | 🟡 |
| 5 | `ai-engine/roles/microcode-engineer.js:4029` | `^(mc-\|cp-\|mv-\|page-)` + `^mc-\d{13}-` | 补前缀 + 加守卫 | 🟡 |
| 6 | `ai-engine/utils/workspace-preview-publisher.js:608` | `/^(c\|cp\|mv\|page)-/` | **加 13 位时间戳排除** | 🔴 拆防线 |
| 7 | `ai-engine/utils/component-naming.js:179` | `/^(c\|cp\|mv\|page)-(.+)-[0-9a-f]{8}$/` | 补 vue3 新前缀 | ✅ 守卫已有 |
| 8 | `ai-engine/utils/component-naming.js:181` | `/^(c\|cp\|mv\|page)-/` | 补 vue3 新前缀 | ✅ |
| 9 | `ai-engine/utils/component-naming.js:195` | `/^(c\|cp\|mv\|page\|mc)-/` | 补 vue3 新前缀 | ✅ 守卫已有 |
| 10 | `ai-engine/roles/microcode/code-validator.js:662` | `isMcId = /^mc-\d{13}-/` | 补 `c-lite-` / `c-max-` | 🔴 漏检 |
| 11 | `ai-engine/roles/microcode/code-validator.js:783` | `hasIdPrefix = /^(mc-\|cp-\|mv-\|page-)/` | 补前缀 **+ 守卫** | 🔴 双向 |
| 12 | `ai-engine/roles/microcode/code-validator.js:806` | `.replace(/^(mc\|cp\|mv)-\d{13}-/)` | 补前缀 | 🟡 |
| 13 | `tasks/tasks.service.ts:1446` | `sessionId?.startsWith('mv-')` | 改 `v-`（或保留） | 🟡 |
| 14 | `tasks/tasks.service.ts:1459` | `'mv-lite-'` / `'mc-lite-'` | 改 `'v-lite-'`/`'c-lite-'` | 🟡 |
| 15 | `tasks/tasks.service.ts:1460` | `'mv-max-'` / `'mc-max-'` | 改 `'v-max-'`/`'c-max-'` | 🟡 |
| 16 | `tasks/tasks.service.ts:1461` | `'mv-'` / `'mc-'` | 改 `'v-'`/`'c-'` | 🟡 |

> 注：`tasks.service.ts` 判的是 `t.sessionId`（任务号字段，不是 componentId），`c-` 前缀在这里**不会与规范 ID 混淆**，是安全的。

### 14.2 前端 —— **4 处**

`utils/task-actions.ts:32-33`、`utils/preview-resolver.ts:39`、`views/demo/composables/useFileManager.js:250`、`views/demo/index.vue:2327-2328`

> 附带收益：现在 `resolveComponentType('c-environment-monitor-c298235f')` 返回 `''`（既不匹配 `mc-` 也不匹配 `mv-`）。补上 `c-` 判定后它返回 `'microcode'` —— **语义上更正确**（规范 ID 本就属于微码组件）。

### 14.3 保留 lite/max 换来的收益

| 项 | 是否还需处理 |
|---|---|
| `ComponentLibrary.vue:438-441` 规格列 Max/Lite | ✅ **不用改** |
| `TaskDetail.vue:3043-3053` Tier 兜底 | ✅ **不用改** |
| `getTaskTier` / `componentModeText` 全列退化风险 | ✅ **解除** |

---

## 十五、最终建议（保留 lite/max 版）

**microcode：`mc-` → `c-` —— 可行，但必须先补 §13.1 的守卫，否则会退回 2026-09-04 之前的状态。**

**vue3：不建议用 `v-`**，理由从「语法冲突」修正为「① 不在白名单 → 需新增；② `classPrefixOf` 会拼出 `c-v-max-…`；③ 概念上与 Vue 指令同形」。可选项：

| 方案 | 白名单改动 | classPrefixOf 改动 | 评价 |
|---|---|---|---|
| **保持 `mv-`（推荐）** | 0 | 0 | 零成本，语义明确（microcode-vue3） |
| `v-` | 需新增 | 需新增 | 用户想要，但 3 处代价 |
| `vc-` / `vue-` | 需新增 | 需新增 | 无概念冲突，比 `v-` 干净 |

**最小可落地路径（按顺序）：**

1. 先补 §13.1 的两道守卫（`microcode-engineer.js:4098`、`workspace-preview-publisher.js:608`）—— **这一步与改名无关，单独就值得做**，因为它同时修掉「任务号污染 componentId」的现存风险；
2. 再改 6 处生成点（`lite.controller.ts:316`、`html-split.service.ts:160/286`、`batch.service.ts:265`、`phase2.controller.ts:277`、`vue3.controller.ts:131`）；
3. 同步 16 处后端判定 + 4 处前端判定；
4. 存量：**老目录按原规则继续被尾缀匹配兼容**，无需批量改名（因为 `resolveComponentDirStrict` 靠尾 8 hex，前缀变了也能互相找到）。
