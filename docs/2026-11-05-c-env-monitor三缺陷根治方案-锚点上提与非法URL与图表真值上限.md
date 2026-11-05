# c-env-monitor 三缺陷根治方案：锚点上提 / 非法 URL 直通 / 图表 min-height 无真值上限

> 2026-11-05 · 触发真机：`mc-max-1793884385590-c324a730`（`c-env-monitor-c324a730`，Figma `1t7Dmmpsl5i0PC8BJt2QLf` / `89:41`）
> 用户三问：① 应属 `c-env-monitor-tab` 的背景被挂到 `c-env-monitor-main`；② `tab-item--active` 挂了 `mc-preview.png`；③ `c-env-monitor-chart` 超出组件尺寸
> 依据：`mvgo-node-pipeline-governance` 六阶段门禁 + `grill-me` 逐支裁决
> **状态：Phase 1~4 完成。代码一行未动，未部署。**

---

## §0 Phase 1 查重结论（强制记录）

| # | 命中既有痕迹 | 位置 | 裁决 |
|---|---|---|---|
| 1 | 「内容区子级资源归属保护」——子级有资源声明则父级不补统一背景 | `docs/2026-11-03-内容区子级资源归属保护.md`；`visual-parser.js:3350 _enrichContentBackground` | ✅ 续接，但**本单不适用**：`analysis.json` 里 `89:41` **无** `backgroundImage`（见 §1.1），背景不在该步落的 |
| 2 | 「B′ per-item 背景逐卡挂载」——落点让位判据 `findPerItemYieldHost` | `docs/2026-11-05-Bprime-per-item背景逐卡挂载治本方案.md`；`resource-mount-plan.js:579-595` / `:640-647` | ✅ 续接域。本单**未触发**：它只判「外部存在 v-for 宿主」，不判「锚点上提」 |
| 3 | `c72bbe2`「资源挂载祖先锚点治本」——`[owner,...ancestorIds]` 取第一个**真实存在**于产物 `data-section-id` 的 id，commit 明写**禁回退根容器** | `resource-mount-plan.js:283-285`；`git log -1 c72bbe2` | 🔴 **半成品**：承诺未兑现（见 §1.2），本单缺陷正是它引入的「上提到段根」。按门禁「已有半成品 ⇒ 原方案补全，禁第三次打补丁」 |
| 4 | 「背景挂错容器」校验器（选择器感知 + mountTarget 事实） | `code-structure-validator.js:1994-2011` | ✅ 续接。缺口单点：`:1996` 对「非已下载资源」直接 `continue` ⇒ 幻觉 URL 零校验 |
| 5 | 图表 `min-height` 单一事实源（T2 注入 / 刀1 剥 0 / 刀3 后置反杀恢复） | `post-process.js:95-216`；`chart-container-guard.js:220 restoreChartMinHeightAfterZero`；`docs/2026-11-04-根容器高度契约与样式合并粒度治本方案.md` §3 F3 | ✅ 续接。既有 F3 只解决「被 `min-height:0` 反杀」，**没有「上限」概念** |
| 6 | 守卫总纲 | `docs/2026-11-02-写盘前pass执行顺序总纲.md` | 本方案不新增 pass，只改既有判据输入；落点均在既有 pass 内 |

**结论：三条均为「既有方案补全」，零另起炉灶、零新增守卫模块。**

---

## §1 Phase 2 根因证据链

### 1.1 产物事实（实锤）

`.checkpoint/analysis.json` → `subComponentPlan.effectiveSections` 只有 **1 段** `89:41`（`type:body`、`figmaHeightPx:145`、`sourceNodeIds:["89:41","89:42"]`），其 `body.children`：

```
89:42  Tab切换栏  bgPlaceholder="section-bg-89-42"
  └ 2:7889  Tab列表  bgResource="../resources/images/bg-7890.png"  bgResourceSize="295x27"
      └ 2:7890 一氧化碳(active)  resourceFile="../resources/images/bg-tab-active-7891.png"  78x21
chart-container  一氧化碳浓度图表
```

- `89:41` 节点**无** `backgroundImage` 字段 ⇒ 背景不是 `_enrichContentBackground` 落的。
- `internalGeometry` = `[{y:930,w:380,h:113}, {y:898,w:380,h:32}]` ⇒ **图表真值 113**、tab 栏真值 32、段真值 145（113+32=145 ✓）。

`.mc-gen/cache/code-chunks/5-package_components_MainSection.vue`（**原始 LLM 输出**）：
- 模板根 `<div class="c-env-monitor-main" data-section-id="89:41">`，**无任何 `:style` 背景**，`data-section-id="2:7889"` 命中 **0** 次。
- 但已含 `.c-env-monitor-tab-item.is-active { background-image: url('/workspace/mc-preview.png'); }`。

⇒ **背景是后置挂载 pass 注入的，幻觉 URL 是模型自带的。**

### 1.2 P1 背景上提：`resolveSectionAnchor` 上提无边界

`resource-mount-plan.js:283-285`：

```js
if (productAnchorIds) {
  const hit = candidates.find((id) => productAnchorIds.has(id));  // candidates = [owner, ...ancestorIds]
  return hit || null;
}
```

bg1 的 mapping：`ownerSectionId=2:7889`，`ancestorIds=["2:7889","89:42","89:41","2:7879"]`；产物 `productAnchorIds={89:41}`（唯一锚点）。

⇒ `find` 跳过不存在的 `2:7889`、`89:42`，**取到 `89:41`** ⇒ 295×27 的 tab 底图挂到 380×145 的整块内容区，再被 `background-size:100% 100%` 拉满 **13.5 倍**。

真机日志（`server.log:30581-30583`，2026-11-05T13:14:18）：

```
🛡️ 资源挂载锚点统计 {"owner":0,"ancestor":4,"none":1,"productAnchors":1}
🎯 [资源挂载] bg1 经事实链 data-section-id=89:41 精确挂载（免关键字猜测） {"file":"package/components/MainSection.vue"}
🛡️ [资源挂载] bg2 的锚点元素 data-section-id=89:41 已被外来背景占用（other），放弃挂载（fail-closed）
```

对照同机 `c-device-monitor`（12:56:36，`productAnchors:2`）⇒ 锚点 `2:7889` 存在时 bg1 精确挂到 `TabsSection.vue` ✓。**同一判据，锚点是否存在决定对错。**

### 1.3 P2 非法 URL：校验器对「未声明资源」显式 `continue`

`code-structure-validator.js:1994-2001`：

```js
for (const hit of this._scanStyleResourceUrls(styleContent)) {
  const fname = String(hit.url).split('/').pop();
  if (!resourceFileNames.has(fname)) continue;   // ← :1996 非已下载资源：直接放过
  ...
}
```

`mc-preview.png` 物理存在于 `resources/images/`（47955 B，设计稿预览图），但**不在** `.mc-gen/resource-dom-mapping.json` 的 8 条资源里 ⇒ `resourceFileNames` 无此名 ⇒ **零校验直通**。而 `/workspace/` 是前端静态挂载点，该 URL **运行时真的能加载** ⇒ 设计稿整图被渲染成激活 tab 的底图。

`:1998-2005` 的落点判据（根容器 / mountTarget / isSubState）只对「已下载资源」生效，本单 bg2 又因 §1.2 的 fail-closed 被丢弃 ⇒ 正确的 `bg-tab-active-7891.png` 成孤儿：

```
🛡️ RES-UNREF：2 张已下载图片零引用 {"images":["bg-tab-active-7891","g-7883"]}   // server.log:30693
```

### 1.4 P3 图表溢出：兜底 `min-height` 无真值上限

- `microcode-engineer.js:6969` `_injectChartMinHeight(code)` —— **单参、零真值输入**。
- `post-process.js:28-32` `inferChartMinHeight` 只按类名给 160 / 100。
- 产物 `.c-env-monitor-chart` 无显式 `height`（`flex:1; width:100%; min-height:0; overflow:hidden`）⇒ `hasChartTruthHeight`（`:76`）不触发 ⇒ 注入 `min-height:160px`。
- 段真值 145、图表真值 113 ⇒ **下限 160 > 容器 145** ⇒ 必溢出 47px。

`chart-container-guard.js:159-175` 的 F3（`restoreChartMinHeightAfterZero`）会把「被后置 `min-height:0` 反杀」的正值恢复 —— 恢复的正是 **160** ⇒ 体系里没有任何环节知道真值是 113。

---

## §2 Phase 3 治本方案（判据为假设，以真机验证为准）

### 刀 A（P1）：锚点上提必须带「层级 + 尺度」双边界

**续接 `c72bbe2` 未兑现的「禁回退根容器」，不新起第二套解析。**

在 `resolveSectionAnchor`（`resource-mount-plan.js`）把「取第一个存在的祖先」改为**受约束的上提**。

> 🔴 **实施修订（2026-11-05，经真机重放纠正）**：原设计 A1（层级 hop 边界）+ A2（面积比）双判据，
> 实际落地**只保留单一条「几何共位」判据**，理由两条：
> ① A1 的 hop 计数依赖 `parentOf`（由 `opts.figmaRoot` 构建），而该索引在真机**恒空**（见 §8 假绿），
>    判据会静默失效；
> ② `candidates` 本身已是 `[owner, ...ancestorIds]` 全祖先链，hop 语义与 A2 高度重叠。
> 另：判据**仅对 `previewAnalysisRole==='bg'` 生效**——真机重放实测 `icon-7941`(52×24) 对
> 380×145 的锚点覆盖率仅 0.137，若一并套用会把全部图标锚点判死（原设计未覆盖此风险）。

| 项 | 最终判据（已实施） | 依据 |
|---|---|---|
| 触发条件 | 命中锚点的下标 `hitIdx > 0`（候选首位 = owner / 直接父节点不在产物中 ⇒ 本次是「上提」） | `hitIdx===0` 表示 owner 就在产物里，属正常命中，不走判据 |
| 共位判据 | `min(bgWidth/anchorWidth, bgHeight/anchorHeight) >= 0.5` | 同层容器背景两轴覆盖率 ≈1.0；本单 295×27 → 380×145 = 0.776 / **0.186** |
| 缺真值 | 锚点盒或背景盒任一缺失 ⇒ **fail-open**（不拦） | 保证不劣于旧行为 |
| 拒绝后果 | `sectionAnchorId=null` + `anchorPromotionRejected=true`，且下游**再设一道 fail-closed 短路** | 只置 null 不够：下游「容器状态根」「名字/关键词匹配」会再猜一次，很可能又挂回段根（本单实测正是如此） |
| 计数行 | 日志 `资源挂载锚点统计 {..., promotionRejected: n}`（**零命中亦打**）+ 明细 `锚点上提被拒` warn | 门禁 Phase 3.3 |
| 诊断 | `reason: 'anchor-promotion-rejected'`，带 `rejectedAnchor` | 可辩驳 |


**关键取舍（需用户裁决，见 §6 支 1）**：A1/A2 的后果是「**拦错**」而非「**挂对**」——背景会从「错挂到整块」变成「不挂」。真正的「挂对」需要产物里存在 `2:7889` 的锚点（当前 `productAnchors=1`）。两条路互斥：

- **路线 α（补锚点，治本）**：在子组件生成/装配阶段，为「自身或后代有资源声明」的内层节点补 `data-section-id`，使事实链能精确命中 ⇒ A1/A2 自然不再触发。
- **路线 β（守边界，最小）**：只做 A1/A2，接受「锚点缺失时背景不挂」，另由 `RES-UNREF` 报孤儿。

### 刀 B（P2）：非法 URL 从「放过」改为「拦下并归因」

**续接 `code-structure-validator.js:1994-2011` 既有校验器，把 `:1996` 的 `continue` 一分为二：**

| 输入 | 现状 | 改为 |
|---|---|---|
| `fname ∈ resourceFileNames` | 走落点合法性判据 | 不变 |
| `fname ∉ resourceFileNames` 且**物理存在于产物 `resources/images/`** | `continue`（放过） | **报 `RES-URL-UNDECLARED`**（截图/预览图等「磁盘有、映射无」的文件被当资源用） |
| `fname ∉ resourceFileNames` 且**不存在** | `continue` | 报 `RES-URL-BROKEN`（路径错误） |
| `url()` 指向 `@var` / 主题变量 / http(s) 外链 | `continue` | 保持放过（白名单，不误伤） |

判据同源：`allowedResourceFiles` 复用既有 `resourceFileNames`；「物理存在」复用既有 file-exists 探针（`mc-health-validator` 同款），**不新造文件扫描**。计数行 `resUrlUndeclared` / `resUrlBroken`（零命中亦打）。

> ⚠️ 本刀只解决「幻觉 URL 不被拦住」。`bg2` 该挂而未挂属 §1.2 的连带后果，由刀 A 修好锚点后自然恢复 —— 两条必须同批，否则本单仍会「拦掉预览图、但激活态仍无背景」。

### 刀 C（P3）：`min-height` 增加「真值上限」

**续接 `2026-11-04-根容器高度契约…` §3 F3 的单一事实源，不新增注入点。**

- `_injectChartMinHeight(code)`（`microcode-engineer.js:6969`）增加真值入参（段 `figmaHeightPx` / `internalGeometry` 图表盒高），透传 `inferChartMinHeight`。
- `inferChartMinHeight` 取值优先级改为：**① 图表真值（`internalGeometry` 中图表盒高）→ ② 段真值（`figmaHeightPx`）当图表是唯一子项 → ③ 兜底 160/100**；且最终值必须 `≤ 段真值`，否则取段真值。
- 无任何真值 ⇒ 保持旧兜底（fail-open，不劣化）。
- 计数行 `chartMinHeightFromTruth{byChartBox,bySection}` / `chartMinHeightClamped`。

**硬约束**：不得引入新的硬编码数值（160/100 仍是既有兜底常量，不改）；不得改 A4 比例。

---

## §3 Phase 4 影响面

| # | 刀 | 直接调用方 | 风险档 | 回滚 |
|---|---|---|---|---|
| A | `resource-mount-plan.js` `resolveSectionAnchor`（文件内私有，仅 `:320` 一处调用） | `buildResourceMountPlan` 签名不变 | **B**（改变挂载落点，影响全语料所有 bg 资源） | revert 单文件 |
| B | `code-structure-validator.js` `_scanStyleResourceUrls` 消费端（`:1994`、`:2129` 两处） | 校验器返回值可能新增 issue 类型 ⇒ 触发**重试** | **B**（新增 issue ⇒ 可能增多 LLM 重试轮次，需评估重试预算） | revert 单文件 + 关计数 |
| C | `post-process.js#inferChartMinHeight` + `microcode-engineer._injectChartMinHeight` | `resource-mounter.js:2117`、`microcode-engineer.js:2297` | **A**（纯收紧：只在有真值时把 160 降为真值，无真值行为不变） | revert 两文件 |

- **双端**：三刀均只影响 microcode 路径；Vue3 走 `selectAnchorMountCandidate` / 独立 post-process 分支，不受影响（刀 C 的 `inferChartMinHeight` 被 Vue3 共用需 grep 复核，见 §4）。
- **共享工具**：不触 `orchestrator` / `withTimeout` / `figma-rate-limiter` / 限流槽。
- **总纲**：不新增 pass、不改 W1~W7 顺序。

---

## §4 Phase 6 回归预案

1. **定向**：`resource-mount-plan.spec.ts`（现有锚点三态 4 例必改断言）、`code-structure-validator` 相关 spec、`post-process.spec.ts`（T03 九例）、`chart-container-guard` spec、`code-healer.g11a-bg-fallback.spec.ts`。
2. **阴性对照**（三态必须覆盖）：
   - 锚点存在于同层 ⇒ 仍精确挂载（不得被 A1 误拦）；
   - 资源落点合法 ⇒ B 不新增 issue；
   - 图表无真值 ⇒ 仍兜底 160（不得静默归零）。
3. **阳性对照**：本单真实数据离线重放 ⇒ `bg1` 落点不再是 `89:41`；`RES-URL-UNDECLARED=1`（mc-preview.png）；chart `min-height=113`。
4. **全量**：沙箱外 `env -i` + `--runInBand --forceExit`，两态 FAIL diff 必须为空（先 `wc -l`，FAIL 行去重后 diff）。
5. **构建**：`env -i … npm run build`，核对 dist stamp。

---

## §5 明确不做（本轮红线）

1. 不直改产物 `MainSection.vue` / `common.less`（禁产物直改）。
2. 不按任务 id / 组件名 / `mc-preview` 字面量特判（禁硬编码）。
3. 不改 `targetDomSelector` 生成规则（既有冻结裁决）。
4. 不改 A4 比例算法、不动 `_enrichContentBackground`（本单未在该步出事）。
5. 不新增守卫模块/pass（三刀全部落既有判据）。
6. 不把 `mc-preview.png` 从 `resources/images/` 删除（它是预览缩略图硬依赖，`mc-health-validator M2-2` 会报缺失）。
7. 不自行重启 `/ 部署 / push`。

---

## §6 待用户逐支裁决（不自行取舍）

| 支 | 问题 | 我的推荐 |
|---|---|---|
| 1 | P1 走**路线 α（补锚点，治本但动生成器）** 还是 **路线 β（只守边界，接受背景不挂）** | α + β 同做：β 先落地止血，α 作为同批第二步（否则永远「背景缺失」） |
| 2 | P2 命中 `RES-URL-UNDECLARED` 后的动作：**失败重试** / **自动替换为真值资源** / **仅告警写盘** | 自动替换（用 `mountTarget` 词集 + `bgRole=sub-state` 匹配真值）→ 匹配不到才失败 |
| 3 | P3 真值来源优先级：**图表盒（113）** / **段高（145）** | 图表盒优先；段高只作上限 |
| 4 | 三刀是否同批实施 | 同批（P1/P2 强耦合，P3 独立但同组件验证） |
| 5 | 是否把既有挂账 C1（`figmaHeightPx` 缺失用并集高度，27 段/2.2%）并入 | 不并入（不同域，避免混批） |

**已裁决**：支 1 ⇒ **α + β 同批，β 先落地止血，α 作为同批第二步**（2026-11-05 用户）。

---

## §7 实施记录（2026-11-05 · 仅 β / 刀 A，α 未开始）

### 7.1 改动文件

| 文件 | 改动 |
|---|---|
| `src/ai-engine/roles/microcode/resource-mount-plan.js` | 新增 `ANCHOR_PROMOTION_MIN_AXIS_RATIO=0.5` 常量、`sectionBoxById`（从 effectiveSections 取 `figmaBox/absoluteBoundingBox`）、`isCoLocatedAnchor()`；`resolveSectionAnchor` 增加 `hitIdx>0` 上提判定与拒绝留痕；candidates 去重；mount 条目新增 `anchorPromotionRejected / anchorPromotionRejectedAnchor`；新增 fail-closed 短路分支（`reason:'anchor-promotion-rejected'`） |
| `src/ai-engine/roles/microcode-engineer.js` | 锚点统计日志新增 `promotionRejected` 计数（恒打）+ 明细 warn |
| `src/ai-engine/roles/microcode/resource-mount-plan.spec.ts` | 新增 `刀A · 锚点上提几何共位` 5 例（跨层拒绝 / 同层不误拦 / owner 在产物不走判据 / 缺盒 fail-open / 端到端不写盘） |

### 7.2 真机数据 A/B（挂载前原始 chunk，`c-env-monitor-c324a730`）

用 `.mc-gen/cache/code-chunks/`（LLM 原始输出，`bg1` 尚未注入）构造产物，跑 `buildResourceMountPlan` + `mountPlannedResources`：

| 指标 | BEFORE（基线） | AFTER（刀A） |
|---|---|---|
| `anchorStats` | `{owner:0, ancestor:4, none:1}` ← **与生产日志 `server.log:30581` 逐字一致** | `{owner:0, ancestor:2, none:3}` |
| `bg1` 落点 | `mounted: bg1 → package/components/MainSection.vue`（**复现错挂段根**） | 无挂载，`mainInjectedBg1=false` |
| `bg2` | `bg-anchor-occupied-by-other-resource`（锚点被 bg1 占位） | `anchor-promotion-rejected` |
| `icon1/2/3` | `mount-target-not-found` | `mount-target-not-found`（**不变**，基线既有，非本次引入） |

> 基线 `ancestor:4 none:1` 与真机日志逐字相同 ⇒ 重放真实性成立。
> ⚠️ 首版重放用的是「已挂载的成品产物」，`bg1` 已存在于 `MainSection.vue` ⇒ 被刀33 让位判据提前短路，
> **复现不出注入动作**（假绿）。必须用 `code-chunks` 的挂载前产物。

### 7.3 回归

- 定向：`resource-mount-plan.spec.ts` **44/44 通过**。
- `src/ai-engine/roles/microcode` 全目录：42 套件通过 / 3 套件失败（`code-parser`、`file-writer.diff-skip`、`file-writer.less-heal`）。三者**均不引用** `resource-mount-plan`，且均在既有基线名单内。
- 全量两态 diff（沙箱外 `env -i` + `--runInBand --forceExit`）：**新增 0**；消失 1（`workspace-preview-publisher.spec.ts`，沙箱 EPERM 假失败在沙箱外恢复正常）。`21 failed / 386 passed`，用例 `46 failed / 5778 passed`。
- **构建：未通过，但非本次改动导致** —— `src/apifox/apifox-mcp.service.ts:486-487` 两个 `TS2339`。该文件为**未跟踪的并发会话 WIP**（mtime 与我构建同时刻），我不修改它。故 `dist/` 仍是旧版本（64236 B / 21:26），本次改动**尚未进入 dist**。
- 代码正确性已由 jest **真实执行**验证（44 例 + 真机重放均实际加载并运行该模块），不是静态检查。

### 7.4 状态

**已改完，未部署**：未重启 `:13030`、未同步 ECS、未 `git commit`、未 `git push`。
α（补锚点）**未开始**，等 §6 支 1 的子问题裁决。

---

## §7.5 α3 实施记录（2026-11-05 · 已落地）

**裁决链**：支1 = α+β 同批（用户）→ α 落点 = α3 挂载前就地补锚（用户）→ 落点形态 = **写回产物 DOM**（用户，grill-me 支 E）→ 语义弱校验收窄到落笔层 / 范围收窄到仅 mapping owner bg 节点（评审自定，纯收窄无取舍）。

### 7.5.1 改动文件

| 文件 | 改动 |
|---|---|
| `src/ai-engine/utils/template-element-tree.js`（**新增**） | 模板元素树配平扫描单一来源：`parseTemplateElementTree`（引号感知/自闭合/void 元素/HTML 注释）、`findElementByAttr`、`classTokensOf`、`tokenizeWords`（dePlural 与 `findTagByClassKeyword` 同口径）。🔴 依据治理反面教材（quality-score-v1 正则截断 118/544）弃正则硬解 |
| `src/ai-engine/roles/microcode/resource-anchor-injector.js`（**新增**） | `injectResourceAnchors(allFiles, sections, mapping)`：仅 bg owner；三条判据（最近锚点祖先唯一命中 / 每层子节点数相等 / **落笔层**语义弱校验）；补专用属性 `data-resource-anchor="<id>"`；幂等 |
| `src/ai-engine/roles/microcode/resource-mount-plan.js` | `findTagBySectionAnchor` 次优先级识别 `data-resource-anchor`（既有 `data-section-id` 行为不变）；事实链分支预过滤同步认补标锚（端到端实测缺口） |
| `src/ai-engine/roles/microcode-engineer.js` | `_mountPlannedResources` 入口（收集 productAnchorIds **之前**）调用补标；计数行 `🛡️ 资源挂载锚点补标`（恒打）；productAnchorIds 正则扩为双属性 |
| `src/ai-engine/roles/microcode/resource-anchor-injector.spec.ts`（**新增**） | 8 例：阳性（真机形态）/ 幂等 / 数量不等弃权 / 语义零交集弃权 / owner 不在树 / findTagBySectionAnchor 次优先级 / 段锚优先 / 端到端挂载 |
| `docs/2026-11-02-写盘前pass执行顺序总纲.md` | 登记 C9 + §5 计数行清单两行 |

### 7.5.2 评审修正（grill-me + 门禁自审揪出）

1. **中间层语义校验会误杀正解**：`89:42`(role=tabs) 对 `.c-env-monitor-sub-t` 词集零交集 ⇒ 语义校验收窄到**落笔层**。
2. **`extractSfcTemplateRegion` 不可作解析载体**：它剥 HTML 注释（`sfc-template-extractor.js:32`）⇒ 返回值非原文子串 ⇒ 坐标无法映射，真机实测「`injected=1` 但文件零改动」**假绿**。改为同一边界口径保留原文（`/<template\b[^>]*>/` 起、`<script[\s>]|<style[\s>]/` 止）。
3. **事实链预过滤缺口**：`mount.sectionAnchorId` 分支在调 `findTagBySectionAnchor` 前有 `data-section-id` 预过滤，补标文件被提前 `continue` ⇒ 同步扩展。
4. **`productAnchorIds` 不扩语义**：补标 id 进集合是「产物真实存在的锚点元素」的本义延伸；刀A `hitIdx` 判定天然兼容（owner 命中回到 `candidates[0]`，不再触发上提守卫）。
5. **`data-section-id` 红线**：25+ 消费文件依赖「一个文件恰好 1 个不同 data-section-id」，α3 走专用属性 `data-resource-anchor`（`data-absorbed-host` 同构先例，`code-generator.js:782`）。

### 7.5.3 真机重放（挂载前 chunk，α3 后）

```
anchorInject: {injected:1, 其余全 0}
productAnchors: ["89:41", "2:7889"]
bg1: {sectionAnchorId:"2:7889", anchorSource:"owner", anchorPromotionRejected:false}
mounted: ["bg1 → package/components/MainSection.vue"]
mainRootInjected: false      ← 段根零注入（旧实锤错挂形态消失）
tabAnchored: true            ← .c-env-monitor-tab 带 data-resource-anchor="2:7889"
```

**bg1 现在真正挂到 tab 栏**（不只是「不错挂」）。bg2 仍 `bg-anchor-occupied-by-other-resource`（78×21 激活态真值宿主是 `2:7890` 单个 tab item）——属 **B′ sub-state 域**（`mountSubStateBackground` 既有原语 + `2026-11-05-Bprime` 方案既立案），本刀不扩域。

### 7.5.4 回归

- α3 定向 spec **8/8**；`resource-mount-plan.spec.ts` 44/44 不变。
- microcode 目录：43 套件通过（+1 新增）/ 3 失败（`code-parser`、`file-writer.*`，与基线一致）。
- **全量两态 diff 双向为空**（对照 β 后基线）：`46F / 5790P`（用例 +12）。
- **构建通过**（21:55，`resource-anchor-injector.js` / `template-element-tree.js` 均已进 dist；此前阻断构建的 `apifox-mcp.service.ts` TS2339 已被并发会话修复）。

### 7.5.5 状态

**α3 + β 均已改完，未部署**：未重启 `:13030`、未同步 ECS、未 `git commit`、未 `git push`。
刀B（非法 URL 拦截）/ 刀C（min-height 真值上限）仍待 §6 支 2/支 3 裁决后实施。
真机验签项（重启后投同一 Figma 节点）：① `🛡️ 资源挂载锚点补标 {injected:1}`；② `promotionRejected` 回落为 0；③ `bg1` 挂到 `.c-env-monitor-tab`；④ 段根无 `bg1`。

---

## §7.6 刀B 实施记录（2026-11-05 22:00 · 用户裁决「mc-preview 禁作资源 + 执行 B1」后落地）

### 7.6.1 裁决链

- 用户问「为什么资源图会使用到 mc-preview.png」→ 根因四层（prompt 高频分析输入 token / bg2 落点指引自相矛盾（容器 `2:7889` ≠ 激活态 item `2:7890`，B′ 域）/ `/workspace/` 静态挂载运行时真能加载 ⇒ 幻觉可见 / 校验器 `:1996` 对非白名单 `continue` 零拦截）。
- 用户裁决：**mc-preview.png 禁止作为资源使用 + 执行 B1（自动替换）**（放弃 B2 只报不改）。

### 7.6.2 实施形态（与 §2-刀B 原案的差异）

原案是纯校验器拦截（RES-URL-UNDECLARED / RES-URL-BROKEN 两分）。落地时按 B1 裁决升级为**三层防线**：

| 层 | 位置 | 动作 |
|---|---|---|
| ① C10 守卫（主） | `resource-url-guard.js`（新），挂 `_mountPlannedResources` 入口（双调用点同咽喉）、锚点补标之前 | 样式 `url()` 按白名单分类：未声明本地路径 → **词集匹配换真值**（选择器 tokens ∩ mapping 的 mountTarget/hint/figmaPath tokens，`tokenizeWords` 单一来源，唯一最大交集才换；平票/零交集 → **剥整条声明**，宁留白不出错图）|
| ② 校验器兜底 | `code-structure-validator.js` 原案位置 | `:1996` continue 一分为二：非白名单+变量引用/data:URI/外链放行；**非白名单+本地路径直写 → `RES-URL-UNDECLARED`（BLOCK）** |
| ③ prompt 黑名单 | `visual-parser.js` 资源清单节 | 明示 `mc-preview.png` 是分析输入不是资源（保险层；α2 教训：prompt 约束不可单独依赖）|

**与原案差异说明**：①原案 RES-URL-BROKEN（物理存在性探针）未做 —— C10 的「剥除」语义已覆盖（换不到真值就删，不存在 404 残留）；②替换候选**仅 `previewAnalysisRole==='bg'`**（图标走 `<img>`，不该被换进 background）；③ LESS 变量定义形态 `@foo: url(幻觉)` 剥除时连 `@` 前缀一起剥（否则残留 `@;` 炸 LESS 编译）；④ 变量引用判定含 LESS 插值 `@{var}` 形态（防误杀）。

### 7.6.3 真机形态验证（c-env-monitor 样本）

`.c-env-monitor-tab-item.is-active { background-image: url('/workspace/mc-preview.png') }`：
选择器 tokens `{tab,active}` ∩ bg2（`bg-tab-active`，tab×4+active）→ 唯一胜出 bg1（tab×3）⇒ **替换为 `bg-tab-active-7891.png`** —— 错图变真值图。⚠️ 注意落点仍是 `.is-active` 静态 CSS（sub-state 的条件绑定归 B′ 域管，本刀只保证「图对」，不保证「挂法对」）。

### 7.6.4 改动文件

- `backend-node/src/ai-engine/roles/microcode/resource-url-guard.js`（**新增**，C10 单一来源）
- `backend-node/src/ai-engine/roles/microcode/resource-url-guard.spec.ts`（**新增**，9 例）
- `backend-node/src/ai-engine/roles/microcode-engineer.js`（导入 + `_mountPlannedResources` 入口挂钩 + 计数行 `🛡️ 资源URL白名单对账`，恒打；items>0 时 warn 留痕）
- `backend-node/src/ai-engine/validators/code-structure-validator.js`（`:1996` 一分为二 + `RES-URL-UNDECLARED` BLOCK 出口）
- `backend-node/src/ai-engine/roles/visual-parser.js`（资源清单节加 🚫 资源黑名单段）

### 7.6.5 测试与构建

- `resource-url-guard.spec.ts` **9/9 通过**（阳性替换 / 剥除 / 白名单放行 / 变量·data·外链放行 / 平票不猜 / 静态 src 只报不改 / 幂等 / 空映射 skip / .less+多 style 块）。
  - 实测纠正 2 处 spec 预期：①平票构造不能用 `.c-tab`（`tokenizeWords` 计出现次数，bg2 在 tab 上多一次必胜）→ 改用 `.c-list`（双方各 3 分真平票）；②白名单放行例漏写 `url()` 包裹。
- 回归：`resource-mount-plan.spec.ts` + `resource-anchor-injector.spec.ts` **52/52 通过**（β/α3 无波及）。
- 构建：`npm run build` 通过，dist stamp `2026-11-05T14:04:58Z`。

### 7.6.6 纪律遵从

- 改者（C10 声明正则）与验者（校验器 `_scanStyleResourceUrls`、spec 断言）三者正则互不相同。
- 计数行恒打（0 也打）：`🛡️ 资源URL白名单对账`。
- 真机验签项（并入 §7.5.5 清单）：⑤ 投含 mc-preview 幻觉的任务 → 日志出现 `🛡️ 资源URL白名单对账 {…replaced/stripped…}` 且产物 style 无 `mc-preview`。

### 7.6.7 状态

**刀B 已改完、已构建、未提交、未部署**（`:13030` 仍载旧 dist）。刀C（支 3）仍待裁决。
bg2 落点矛盾（`2:7889` vs v-for item）归 B′ 方案（`2026-11-05-Bprime-per-item背景逐卡挂载治本方案.md`），本刀不扩域。

---

## §7.7 刀C 实施记录（2026-11-05 22:19 · 用户裁决「帮我实现」后落地）

### 7.7.1 落点（与原案差异）

- 原案「`_injectChartMinHeight(code)` 增加真值入参」：实际注入点在 T2 chunk 后处理循环（`microcode-engineer.js` `_executeCore` 内 `:7834` 一带，`_inferChartMinHeightPure(chartCls,…)` 调用处），与 `effectiveSections` 同作用域 ⇒ 真值解析做成**纯函数 `resolveChartMinHeightTruth(sections, chartSectionId)`** 放 `post-process.js`（可 jest 单测、单一事实源），调用方消费后 clamp。`inferChartMinHeight` 的 160/100 兜底**一字未动**（硬约束 ✓）。
- 「`internalGeometry` 图表盒高」数据源确认：P-4（`subcomponent-planner.js:3359`）已把段锚点子树顶层元素盒采集为 `sec.internalGeometry = [{x,y,w,h,text?}]`；真机 tasks.json 156 处非空。

### 7.7.2 判据（三层）

1. **① 图表盒真值 `chartBoxH`**：段 `internalGeometry` 非文本条目中 h 最大者；须过**两道保险**：
   - 平票不猜（两个等高非文本盒 = 卡片网格，如 `[74,74,74]`/`[65,65]`，拦）；
   - **比例校验 `best ≥ sectionH/3`**（真机 `2:8069` 实锤：小图标段 geo 最大 h 仅 18px/145=0.12，若当图表盒会把 min-height 压到 18 致塌缩；`89:44` 实测 113/145=0.78 ✓）。无段真值时无法校验，保留原值（clamp 亦不发生）。
2. **② 段真值 `sectionH`**：`styles.figmaHeightPx` 优先 → `figmaBox/absoluteBoundingBox.height` 兜底（与 `resource-mount-plan.sectionBoxById` 同口径）。仅 `isOnlyChild`（internalGeometry 恰 1 条）时直接取用。
3. **clamp 上限**：无论走哪档，终值恒 ≤ 段真值（宁小不溢，flex 比例仍可拉伸补足）。缺真值 fail-open 保持旧兜底。

### 7.7.3 真机数据验证（tasks.json 30 段直跑）

- `89:44` → `chartBoxH=113`（**方案 §1.4 的图真值 113 被真机精确复现**）；`38:3154` → 161（>段 145，被 clamp 兜住）。
- 比例校验命中 12→2：被拦 10 个全部正确（`[74,74,74]` 等高卡片网格 = 平票拦；`[23,19,18,27]` 图标行 = 比例拦）。采样重复段去重后 ~20 独立段，多数本就不是图表段，2/30 非误拦。

### 7.7.4 改动文件

- `src/ai-engine/utils/post-process.js`：新增导出 `resolveChartMinHeightTruth`（纯函数）
- `src/ai-engine/roles/microcode-engineer.js`：import + T2 循环外 `_chartMinHeightTruthStats` + `:7834` 真值消费（①/②/clamp 三层）+ 循环尾计数行
- `src/ai-engine/utils/post-process-chart-minheight-truth.spec.ts`（**新增**，10 例）

### 7.7.5 测试与构建

- 新 spec **10/10**；回归 `chart-container-guard.f3-min-height-persistence.spec` 全绿（合计 14/14）。
- 构建 EXIT=0，stamp `2026-11-05T14:19:02Z`。计数行：`🎯 [mc] 图表 min-height 真值封顶评估 {evaluated, byChartBox, bySection, clamped}`（恒打，全 0 = 无图表单）。
- 真机验签（并入 §7.5.5 清单）：⑥ 投含图表任务 → 计数行出现且 `c-env-monitor` 类产物图表 min-height ≤ 段真值（113/145，不再 160）。

### 7.7.6 状态

**刀C 已改完、已构建、未提交、未部署**。三刀（β/α3/刀B）+ 刀C 均在 dist（stamp 14:19:02Z），`:13030` 当前进程（PID 85682）仍载 22:04 的 dist（含三刀、不含刀C），**需再次重启生效**。至此 §2 三刀方案全部落地。

---

## §8 附带发现：`figmaRoot` 包裹形态导致祖先链索引恒空（新假绿，未修）

`microcode-engineer.js:6704` 传 `figmaRoot: input.figmaNodeData`，而真机 `figma-node-data.json` 顶层键为
`{fileKey, nodeId, tokenHash, cachedAt, document}`（**包裹形态**）。`resource-mount-plan.js` 的
`walk(opts.figmaRoot, null)` 沿 `node.children` 走 ⇒ 顶层无 `children` ⇒ **`parentOf` 恒空**。

后果（两处判据静默失效，且无任何日志）：

1. `resolveOwner`（`:219-229`）的「沿 figma 祖先链上溯找 owner」分支**从不执行**；
2. `resolveSectionAnchor` 的 `candidates.length===0 && nid` 兜底分支（`parentOf` 走链）**从不执行**。

与 T-GROW 那次的 `indexFigmaNodes(opts.figmaNodeData?.document || ...)` 是**同一根因的第二次出现**
（同一包裹形态、同一类解包缺失）。

**建议**：解包 `.document` 作独立一刀，**不并入本批**。理由：解包后 `resolveOwner` 会真正开始沿祖先链
分配 owner，`owner` 从 `null` 变成具体组件 ⇒ 影响全语料所有 bg/icon 的落点，属独立 B 级风险，需单独 A/B。
本轮刀 A 刻意**不依赖** `figmaRoot`（锚点盒取自 `effectiveSections` 自带 `figmaBox`），故不受该假绿影响。
