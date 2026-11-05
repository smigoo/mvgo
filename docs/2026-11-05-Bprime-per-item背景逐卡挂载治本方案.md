# B′：per-item 背景逐卡挂载（续接刀33 第3步）治本方案

> 2026-11-05 · 用户裁决：矛盾二选 A「保禁令+换出口」，A② 代码层选 **B′ 修 v-for 锚点**
> 触发真机：`mc-max-1793841507552-f461f30f`（`c-aiot-dpjh-bsjd-f461f30f`）「下面的 list 样式错误、背景没有」
> 依据：`mvgo-node-pipeline-governance` 六阶段门禁；`docs/2026-11-02-写盘前pass执行顺序总纲.md`
> **状态：Phase 1~4 完成，Phase 5 实施未开始（代码一行未动）**

---

## 0. 裁决与范围

- `docs/2026-11-05-七项治本方案评审与落地裁决.md` §5：F 项撤销，`targetDomSelector` 生成规则**继续冻结**；`docs/2026-11-05-资源挂载祖先锚点与背景缩放真值治本.md:83/:51` 禁令有效；`docs/2026-11-04-视觉布局权威性治本…md` §7.6 冻结。
- 本方案**不碰** `targetDomSelector`、**不加根容器回退**、**不改 `visual-parser.js`**、不新增守卫 pass。
- 目标现象：6 张 list 卡片应各自带 `image_313-5800.png` 背景；现状是整块 list 根节点一次性 `backgroundImage` + 固定 `459px 29px`。

---

## 1. Phase 1 查重（🔴 关键结论：既有方案已存在，必须续接，不得另起炉灶）

| 既有痕迹 | 位置 | 裁决 |
|---|---|---|
| **刀33 第3步**「per-item 资源不落本文件」 | `resource-mount-plan.js:555-577` | ✅ **续接**。注释里的实锤样本 `48:5798` / `image_313-5800.png`(bg1) / `ListSection.vue` 与 `f461f30f` 是**同一 Figma 稿、同一资源、同一组件名** |
| `findExternalVForItemHost` / `findPerItemYieldHost` | `resource-mount-plan.js:101-111` / `:128-132` | ✅ **单一判据已存在**，供所有 bg 写入分支在确定落点后统一调用 |
| 计划 owner 路径守卫 | `resource-mount-plan.js:579-595` | ✅ 已有，`reason:'per-item-host-external'` + 日志 |
| 事实链落点路径守卫 | `resource-mount-plan.js:636-647` | ✅ 已有（修过「落点 ≠ owner 文件」的看错文件问题） |
| 对应 spec | `resource-mount-plan.spec.ts:647` 起 | ✅ 已有负例留痕（初版 `sharedBy>1` 判据真机恒假＝死代码） |
| `mountSubStateBackground` | `resource-mounter.js:1302-1374` | ✅ 已有 active 条件绑定注入原语，不改 |

⇒ **B′ 的正确形态不是「新写 v-for 锚点」，而是「查清既有 `findPerItemYieldHost` 为何在 `f461f30f` 没让位」**。任何新写的 per-item 判据都会形成第三套口径，违反门禁。

---

## 2. Phase 2 根因取证

### 2.1 产物事实（实锤）

`package/components/ListSection.vue:1-9`：

```vue
<div class="…-list-section" data-section-id="565:3"
     :style="{ backgroundImage: 'url(' + bg1 + ')', backgroundSize: '459px 29px',
               backgroundPosition: '6px 0px', backgroundRepeat: 'no-repeat' }" v-bind="$attrs">
  <div class="…-node-list">
    <div v-for="(node, index) in nodeList" :key="node.name"
         class="…-node-card"
         :class="{ '…-node-card--active': index === 0 }">   ← v-for item 上无任何 :style
```

- 产物 `package/` 里**唯一** `data-section-id` = `565:3`。
- 根背景 `48:5796`（`missing` + `fillsSummary` 渐变）的 `ancestorIds=["48:5796"]`，链上无产物锚 ⇒ 与 `targetDomSelector` 无关的独立问题（见评审文档 §5.2）。
- `image_313-5800.png` 的 mapping：`bgRole:'sub-state'`、`sharedBy` 6 个 figma 节点、`downloadStatus:'success'`。

### 2.2 实测：既有原语本身可用（实锤）

把 `resource-mounter.js:1314-1315` 的 `ACTIVE_BINDING_RE` 原样喂真机 `ListSection.vue`：

```
ACTIVE_BINDING_RE 命中: true
match[0]   : :class="{ 'c-aiot-dpjh-bsjd-node-card--active': index === 0 }"
condition  : "index === 0"
between    : "\n      "            → 不含 :style ⇒ :1330 的 continue 不触发
根节点 :style 是否条件式: false    → 根节点那个绑定不是 mountSubStateBackground 生成的
```

⇒ `mountSubStateBackground` 本可把 `bg1` 以 `index===0 ? {…} : null` 挂到 v-for item；产物却是**无条件**根节点绑定 ⇒ 走的是 `resource-mount-plan.js:796-821` 的 `standalone-state-static-fallback`（或同类静态回退），而非条件原语。

### 2.3 待验证假设（🟡 推断，Phase 5 前必须先验证）

`findExternalVForItemHost(:101-111)` 要求外部宿主**同时**满足 `rx.test(fc)`（`varName` 已被引用）与 `findVForItemTag(fc)`。推测存在**时序鸡生蛋**：

- `injectResourceImports`（`microcode-engineer.js:3062`）只注入「代码里已出现过的资源变量」；
- `_mountPlannedResources`（`:3226` / `:3443`）在其后执行，`injectBgStyleBinding` 才把 `bg1` 写进模板；
- 让位判据执行时 `ListSection.vue` 里可能尚无 `bg1` ⇒ `rx.test` 恒 false ⇒ 不让位 ⇒ 静态回退挂根节点并顺带注入引用 ⇒ 下一轮幂等判据看到「已绑定」直接跳过。

**验证方式**：在 `_mountPlannedResources` 入口对 `allFiles` 打一次性快照，记录 `findPerItemYieldHost` 调用时的 `varName` / `candidateFile` / 各文件 `rx.test` 结果 / `findVForItemTag` 结果，重投 `f461f30f` 的 checkpoint。**未经此验证不得改判据**。

### 2.4 证据纠正留痕（避免二次误判）

- ❌ 前序引用 `component-meta.json#repeatUnitStats {groupFound:0, skippedNoAnchor:1}`：**`f461f30f` 整个产物目录 grep 零命中**，`component-meta.json` 顶层键只有 9 个，无该字段。
- ❌ 把 `vfor-repeat-unit-guard.js:312-361` 当挂载器：它是 `detectRepeatUnitIssues` **几何矛盾检出守卫**（`VFOR-UNIT-HEIGHT/WIDTH`），不挂资源；`skippedNoAnchor` 指 v-for item/wrapper 缺 `data-section-id`，与 `sub-state` 背景挂载无因果关系。
- ❌ 前序判断「全链路无确定性 CSS 写盘器」：`code-healer.js:2542 injectMissingBgFallback`（G11a，`microcode-engineer.js:3097` 调用）**就是**。

---

## 3. Phase 3 治本判据（续接既有，零新增守卫）

**唯一允许方向**：在 `findPerItemYieldHost` / `findExternalVForItemHost` 既有单一判据内，把「外部宿主必须**已引用** `varName`」这一**时序依赖**改为「外部宿主是 `varName` 的真实 per-item 宿主」的**结构事实**，判据来源限于：

1. `mapping.ancestorIds` ∪ `ownerSectionId` 与产物 `data-section-id` 集合的交集（`c72bbe2` 的 `productAnchorIds` 已是单一事实源，**复用不新造**）；
2. 该文件存在 `v-for` item 标签（`findVForItemTag`，既有原语）；
3. 该文件不含与 `varName` 无关的已绑定背景（沿用 `bgBindingOwnership` 的 fail-closed 口径）。

三条同时满足 ⇒ 让位并把 `varName` 交给 `mountSubStateBackground` 在 v-for item 上做条件绑定；任一不满足 ⇒ **保持现状 fail-open**（不猜、不挂根）。

**计数行（恒 0 也打，可辩驳）**：`perItemYieldHit` / `perItemYieldSkippedNoVarRef` / `perItemYieldSkippedNoItemTag`，沿既有 `diagnostics` + `logger.info` 出口，不新增 pass。

---

## 4. Phase 4 影响面

| # | 条目 | 结论 |
|---|---|---|
| 1 | 直接改动面 | `resource-mount-plan.js` 内 `findExternalVForItemHost` / `findPerItemYieldHost`（文件内私有）；`buildResourceMountPlan` 签名不变 |
| 2 | 调用点 | `:580`（owner 路径）、`:640`（事实链落点路径）两处，**不新增第三处** |
| 3 | 共享工具 | `productAnchorIds` 收集逻辑已在 `_mountPlannedResources`（`:6540` 起）存在，复用；不触 `resource-import-guard.js` / `orchestrator` / `withTimeout` |
| 4 | 双端 | 仅 microcode 路径；vue3 走 `selectAnchorMountCandidate`，本次不改（沿用 11-05 锚点方案 :85） |
| 5 | 行为变化面 | 仅「落点无 v-for item ∧ 外部存在 per-item 宿主 ∧ 该宿主尚未引用 varName」的样本：从「静态回退挂根」改为「让位给条件绑定」。已验收样本（`resource-mount-plan.spec.ts` 现有用例）不受影响 |
| 6 | 风险 | **B 级**：改变挂载目标，须跑 `resource-mount-plan.spec.ts` / `mount-target-scoring` / `resource-mounter.spec.ts` 全量；阴性对照必须覆盖「外部宿主无 v-for item」「外部宿主与 mapping 祖先链无交集」「varName 已被外来背景占用」三态 |
| 7 | 总纲合规 | 不新增 pass、不改 W1~W7 顺序、不新增修补型守卫（避开 `:115`）；改的是既有判据的输入事实 |
| 8 | 回滚 | revert `resource-mount-plan.js` 单文件；无数据迁移、无产物格式变更 |

---

## 5. Phase 5 实施清单（**本轮未执行**）

1. 按 §2.3 打快照、重投 checkpoint 验证时序假设；**假设不成立则回到 Phase 2 重新定域，不得硬改**。
2. 在 `findExternalVForItemHost` 内替换时序依赖为结构事实；两处调用点不改。
3. 补 spec：阳性（真机 `f461f30f` 形态 ⇒ `perItemYieldHit=1`、v-for item 得到条件 `:style`、根节点无无条件绑定）+ 三条阴性。
4. `npm run build` + 定向 jest + 消费端回归。
5. 真机重投验证 `ListSection.vue` 六卡各自背景。

---

## 6. Phase 6 回归预案 / 明确不做

- 回归：`resource-mount-plan.spec.ts`、`resource-mounter.spec.ts`、`mount-target-scoring.spec.ts`、`code-healer.g11a-bg-fallback.spec.ts`、`patch-chain-*`；再全量 `--runInBand --forceExit` 两态对照。
- **不做**：① 不改 `targetDomSelector` 生成规则（裁决冻结）；② 不加根容器回退（`:51`）；③ 不改 `visual-parser.js:2652` 兜底字面量（会影响 `subcomponent-planner.js:714`）；④ 不新写第三套 per-item 判据；⑤ 不直改产物 `ListSection.vue`；⑥ 不按任务 id / 组件名特判。

---

## 7. 状态

- 本文件为 **Phase 1~4 方案与影响面**，`backend-node` 源码**未改一行**。
- 全部改动**未部署**：未重启 `:13030`、未同步 ECS、未 `git push`。
