# 表格接管补契约门（T-CONTRACT）治理方案

- 日期：2026-11-05
- 触发单：`mc-max-1793880532372-38f97905`（c-device-monitor，用户截图「布局都没还原」）
- 状态：**方案已定，代码未动**
- 前置门禁：`mvgo-node-pipeline-governance` Phase 1–4 已走（查重结论见 §1）

---

## 1. 查重结论（Phase 1）

| 检查项 | 结果 |
|---|---|
| 方案文档 | **命中既有方案**：`docs/2026-10-31-vision形态漂移治理方案.md` §1.3 与 Phase A 交付物 3，已明确把 `folded-grid-section-takeover`（`detectTableLeaf`）列为 `canonicalSectionType` 的**消费者迁移目标** |
| 归一器现状 | ✅ **已存在**：`src/ai-engine/utils/section-semantics.js`（2026-11-02），`canonicalSectionType = deriveSectionType`（`section-semantics.js:35`） |
| 代码内痕迹 | `2026-10-31` 方案 §1.3 结论原文：「继续加分支的边际成本递增……且无法保证下一个形态不漏」 |
| git log | `src/ai-engine/utils/folded-grid-section-takeover.js` **历史被改 49 次** ⇒ 典型「反复修同一文件」信号 |
| 判定 | **续接既有方案（Phase A 的第一个消费者迁移小步）**，禁止另起第二套归一器、禁止给 table 判据再加一条几何约束 |

### 为什么不是「给 table 加一条 if」

该文件里 11 个 `detect*` 判据是并列、first-match-wins，彼此没有优先级仲裁。过去 49 次修复都是「给某个判据加更紧的几何约束」，属于在同一平面上持续收窄 —— 结构同构的段（2 张统计卡 vs 2 列表格）永远无法靠几何区分。本次改为**上游契约仲裁**，一次覆盖全部判据的同类问题。

---

## 2. 根因（Phase 2，证据链）

### 2.1 真机事实

`mc-max-1793880532372-38f97905` 的 Figma 真值（`.mc-gen/cache/figma-node-data.json` → `document` 树）：

| 节点 | 名字/类型 | bbox | 说明 |
|---|---|---|---|
| `2:8419` | `header` GROUP | 388×30 @1495,441 | section 锚点，**只有 30px 高** |
| `89:38` | `switch` FRAME | 396×65 @1486,475 | 两张统计卡的父容器 |
| `2:8787` | `active` GROUP | 193×65 @1486,475 | 统计卡 A，5 个 TEXT |
| `2:8806` | `default` GROUP | 193×65 @1689,475 | 统计卡 B，5 个 TEXT |

vision 对该段声明：`type='stats'`，`body.children[].role='stat-card'`，`layoutMetadata.direction='row'`、`height=30`、`flexGrow=0.14`。

### 2.2 判据链断裂点

1. `detectStatRowLeaf`（`folded-grid-section-takeover.js:888`）要求每个兄弟节点**恰好 2 个 TEXT**；两张卡各有 5 个 TEXT（标题 + 两组 KV）⇒ `parsed.length=0` ⇒ 放空。
2. `detectTableLeaf`（`:1095-1122`）先走 `detectTableLeafByAnchors`（`:1124`）**纯几何**判定；契约门 `resolveDeclaredTableLca` 只在 `declaredTableHeaders(sec)` 非空时生效。本段表头契约为空 ⇒ 直接采信纯几何。
3. 纯几何四关全过：两列同高同 y（±2）、每列 5 个 TEXT ≥3 且逐项 y 对齐、x 严格递增无咬合 ⇒ **判成 table**。
4. 生成 2 列 ×（1 表头 + 4 数据行）的 `a-table`，`StatsSection.vue:2` 根 `height:65px` 且**无 overflow**，表格固有高 325px ⇒ **纵向溢出 ≈308px**，盖住下方 tab 轨与卡片网格。

### 2.3 文档与代码不一致

`folded-grid-section-takeover.js:2954` 注释声称「`detectTableLeaf`：要求 `role:'stat-card'` / `table-header`+`list` 契约」，但实现里**没有**这条门 —— 纯几何路径绕过了契约。本次即补齐这条已承诺的判据。

### 2.4 阳性对照（真机）

```
canonicalSectionType(2:8419) === 'stats'   // vision 声明 type='stats'，归一器同判
```

即：上游已有正确结论，table 接管未消费它。

---

## 3. 修法（Phase 3）

**唯一实现下沉：`detectTableLeaf` 入口加契约门，消费 `canonicalSectionType`。**

```js
export function detectTableLeaf(sec, figmaIndex, parentOf, resourceMapping) {
  // 契约门（T-CONTRACT）：vision 归一类型存在且不是 table ⇒ 表格判据不得接管。
  // 依据 docs/2026-10-31-vision形态漂移治理方案.md Phase A「下游只读规范结论」。
  const canonical = canonicalSectionType(sec);
  if (canonical && canonical !== 'table') {
    return { ok: false, reason: `contractMismatch:${canonical}` };
  }
  // ……以下原逻辑逐字不动
}
```

硬约束遵守情况：

| 约束 | 落实 |
|---|---|
| 禁止硬编码 | 判据只认 `canonicalSectionType`（结构/语义归一结果），**不认 id、不认组件名、不认 title**；无阈值、无魔法数 |
| 根源治理 | 改在「who may claim this section」的仲裁口，不是下游消费点兜底 |
| 单一事实源 | 复用既有 `section-semantics.js`，不新建第二套类型推导 |
| 判据可辩驳 | 新 reason 值 `contractMismatch:<kind>` 进入既有 `reject-summary.skipped[].reason`，**每段必记**（0 也可见）；阳性对照见 §2.4 |

---

## 4. 影响面（Phase 4）

只读评估脚本：`scripts/audit-table-contract-gate.mjs`（不写产物、不写 dist）。

语料：`workspace/custom-components`（775 个目录，75 个有可回放 checkpoint）

| 分类 | 段数 | 占比 |
|---|---|---|
| 被 table 接管的段（基线） | 76 | 100% |
| 契约门**放行**（`canonical==='table'`） | 3 | 3.9% |
| 契约门**放行**（无契约 / 泛化容器 / 找不到段 ⇒ 行为不变） | 54 | 71.1% |
| 契约门**会拒**（`canonical` 为形态语义且 ≠table） | **19** | **25.0%** |

被拒段的 canonical 分布：`list` 7 / `tabs` 5 / `stats` 5 / `card` 2。

> 首版判据曾把**泛化容器**（`body`/`content`/`main`）也当反对证据，影响面为 20 段（26.3%），
> 实测打崩 `code-generator.p1b-suppressed-flex.spec.ts`（夹具 sec 就是 `type:'content'`）。
> 依据 `vision-facts.js#TYPE_KEYWORDS` 的 body 桶定义，泛化容器不构成形态主张，已收窄。

去重后的唯一（组件, 段）组合：

| 组件 | section | vision 声明 | 现象 |
|---|---|---|---|
| `c-traffic-monitor` | `2:3438` / `2:3439`「车型分布」 | `list` | 长期被当表格（跨多个历史版本） |
| `c-device-monitor` | `89:38`「设备类型切换」 | `tabs` | 竖 tab 轨被当表格 |
| `c-device-monitor` | `2:8419` / `89:38`「设备监测」 | `stats` | 本单实锤（截图巨大表格） |
| `c-device-monitor` | `2:8787` / `2:8806` | `card` | 两张统计卡被当 2 列表格 |
| `c-device-monitor` | `89:40`「内容区」 | `body` | 内容区被当表格 |

### 风险分级

- **B 级**：改变 26.3% 的 table 接管行为，被拒段 fail-open 交给 LLM 按 vision 语义生成。
- 缓解 1：53 条无契约段**完全不受影响**（占 69.7%）。
- 缓解 2：被拒段原本就是被**错误 kind** 接管，fail-open 的方向是「回到 vision 声明」而非「放弃渲染」。
- 回滚：单个函数入口 4 行，`git revert` 即完全回到旧行为。

---

## 5. 回归读数（Phase 6，2026-11-05 20:49）

### 5.1 判据阳性/阴性对照（真机 checkpoint 直调）

| 输入 | `canonicalSectionType` | `detectTableLeaf` 结果 |
|---|---|---|
| 真机 `2:8419`「设备监测」 | `stats` | `contractMismatch:stats` ✅ |
| 真机 `89:39` | `tabs` | `contractMismatch:tabs` ✅ |
| 真机 `2:8437` | `grid` | `contractMismatch:grid` ✅ |
| 伪造 `type='table'` | `table` | 放行，落 `noAnchorNode`（空索引）✅ |
| 伪造 `type='TABLE'` | `table`（小写归一） | 放行 ✅ |
| 伪造 `header.type='table'` 且 `type` 空 | `table` | 放行 ✅ |
| 伪造无 `type` | `''` | 放行 ✅ |
| 伪造 `type='content'` | `content` | 放行 ✅ |
| 伪造 `type='tabs'` + 完整 `headers` | `table`（契约优先） | 放行 ✅ |

### 5.2 定向 spec

`folded-grid-section-takeover.spec.ts` **120/120 passed**（新增 7 例）；
与 `code-generator.p1b-suppressed-flex.spec.ts` 合跑 **129/129 passed**。

### 5.3 全量 jest（沙箱外 + `env -i` + `--runInBand --forceExit`，同仓现建 A/B 基线）

| 态 | Suites | Tests |
|---|---|---|
| before（移除本次改动，保留全部并行 WIP） | `21 failed / 1 skipped / 385 passed / 406 of 407` | `46 failed / 4 skipped / 5747 passed / 5797` |
| after（本次改动） | `21 failed / 1 skipped / 385 passed / 406 of 407` | `46 failed / 4 skipped / 5758 passed / 5808` |

**FAIL 套件集合 `comm` 双向为空**（新增 0 / 消失 0 / 共有 21）⇒ 零回归。
总数 +11 中 7 条为本次新增用例；余 4 条经核查为环境漂移（期间 `workspace/custom-components`
组件目录 769 → 775，文件系统驱动的参数化用例数随之增长），与本次改动无关。

### 5.4 中间态教训（必须留痕）

首版判据（拦所有 `canonical≠table`）在第一次全量跑出**新增 1 个失败套件**
`code-generator.p1b-suppressed-flex.spec.ts`（4 条用例）。归因：夹具 `sec` 为
`{ id, type: 'content', sourceNodeIds }` —— `content` 是泛化容器而非形态主张。
这说明「影响面只扫真实产物」不够，**必须同时用单元夹具反向验证判据的过窄边界**。

### 5.5 构建

`npm run build` EXIT=0，`[build-stamp] 2026-11-05T12:49:16.726Z git=e46e0c9`，
`✅ references copied to dist`；`dist/ai-engine/utils/folded-grid-section-takeover.js`
内含 `contractMismatch` ×2、`GENERIC_SECTION_KINDS` 已编入。

**未重启、未部署**：运行中的 PID 73313 于 20:33:40 启动、载入 20:31:11 的 dist；
本次 dist 为 20:49，需下一次重启才对后续任务生效。

---

## 6. 明确不做

- 不改 `detectStatRowLeaf` 的「恰好 2 TEXT」约束（本次让 table 退位即可；statRow 能否接住 5-TEXT 卡片是独立议题）。
- 不改 section 拓扑二维化（`LAYOUT-001` 根因：header 通栏 + `[tabs|cons]` 左右两栏被压成一维 column）—— 独立立项。
- 不改 `layoutMetadata.height` 取外层 bbox 而非子树真实内容高度 —— 独立立项。
- 不新增 graph 节点、不改路由、不动 refiner 链路。
