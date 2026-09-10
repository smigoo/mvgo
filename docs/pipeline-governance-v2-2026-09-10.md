# 管线治理方案 v2（2026-09-10）

> 替代执行顺序：本文 > `pipeline-governance-playbook-2026-09-09.md` > 其余 09-09 文档。  
> 09-09 诊断方向仍然成立；**作废的是互相打架的完成标准、半截接线和「单测绿 = 管线绿」**。  
> 本文不改生成产物，不打 CSS 补丁。

---

## 0. 一句话

昨日优化**方向对、落地半截、文档互斥、验收偷换**。今日 traffic/device 缺陷几乎全部是 09-09 已点名的同一组病，没有被挡住，不是「新病出现」，是「治理没有真正接管写盘」。

质量信号只有一个：同一 Figma 三样本（env / traffic / device）**重生成后肉眼结构对照**。单测绿、`pass=true`、Golden JSON 落盘、commit 标题写「Loop N 完成」都不算完成。

---

## 1. 昨日修复里的错误 / 矛盾 / 不严谨

分三类。证据给文件，不讲感觉。

### 1.1 文档互相打架（方案层错误）

| # | 甲方 | 乙方 | 为什么有害 |
|---|------|------|------------|
| D1 | `root-cause-matrix`：无 section 时 **fail-open 全量** | playbook / governance：结构类 **禁止 fail-open** | Loop 1 空契约仍回全量，错绑通道合法化 |
| D2 | Loop 3：图表装配写 `min-height:160px` | 根因矩阵：chart-header 被 `min-height:160px` **撑破** | 把病当成药；160 会写到 header 而不是 chart |
| D3 | P1-1：chrome 含业务 controls 时**保留 section** 给 infer 消费 | Loop 2：chrome **不进** headerSlots，除非业务 tab/stat | 同一节点两套归属；header 双份的设计源 |
| D4 | `optimization-plan` P0–P6（含 FLEX-005 自动修复） | playbook Loop 3：**删 fixer**，FLEX-005 只断言 | 两份计划抢同一段 CSS |
| D5 | governance：「**不新增门禁**」 | 今日根因稿列 `RESOURCE-OWNER-001` 等新码 | 继续用新 CODE 掩盖装配没写对 |
| D6 | playbook：「Golden 是 Loop 4，**禁止提前开工**」 | 09-10 08:58 已提交 extractor / auditor / `docs/golden-manifests/*` | 裁判建在乱写盘之前，diff 噪声或自证自洽 |
| D7 | 治理文用 Assembly Manifest | 代码/playbook 用 Working Manifest `wm-1`，Golden 又 `g-1` 同构 | 三份「单一事实源」 |

### 1.2 代码与方案不一致（落地半截）

| # | 方案承诺 | 代码事实 | 今日产物投影 |
|---|----------|----------|--------------|
| C1 | `ownerBlockId` 细到卡片；`provenance: figma-direct` 必须等于 Golden | `ownerBlockId = ownerSectionId`；**有** block 标 `inferred`，无 block 有 path 反而 `figma-direct`（`resource-manifest.js:79-87`） | 契约字段存在但不能当真值；Loop 4 按 provenance 分级会反着判 |
| C2 | Loop 1 主路径禁止 `forceAll` | `mappingForContract`：`allowed.size===0` **return 全量 success**（同文件） | 空契约 = 昨日全量风暴；收口被函数内部打穿 |
| C3 | contracts 在写盘子组件**之前**存在 | `buildContracts` 在 `genSubComponents` **之后**才算 | 子组件生成时仍看不见合同；LLM 继续全量选图 |
| C4 | y 重叠 ≥50% → **禁止拆成两个 vertical section** | `rebuildSectionsPreservingInlineRows` 只写入 `inlineCompositeRows` 旁路，**不改** `layout.sections` | env 顶行 / device 左右结构仍靠 LLM 拆 |
| C5 | chrome 业务 controls 不被误剥 | `isChromeOnlySection`：`CHROME_HEADER_RELATIONS.has(rel)` **无条件 return true**，`hasBusinessHeaderControls` 永远走不到（`chrome-section-filter.js:109-111`） | P1-1 的「保留业务 header」是死代码 |
| C6 | derived headerSlots 过 C-1/C-2 | `inferHeaderSlotsFromInlineRows` 行名含 `tab` 也当 `header-right statistic`；`applyHeaderSlotContractRewrite` 只做 rejected 去重 | traffic 6 个槽、device 把 `@antd/tab` 当 header 文本 |
| C7 | `@antd/tab` 强制 `{nav, panels}` | planner 只有 nav 关键词表，**无强制二元结构写出** | device 竖 tab 头仍可丢 |
| C8 | Golden 不 import 装配层 | `figma-golden-extractor.js` **import `buildResourceManifest`**；traffic golden `_ownerProvenance: mapping-fallback` | 裁判与选手共用归属算法；锁的是资源表不是结构表 |
| C9 | 每个资源唯一 mount | Manifest 无 `mountTarget` / `allowedConsumers`；1.C 只剥跨 section，**不剥同文件标题 vs 中央** | `icon1` 标题+中央双挂；default 内外双 `bg2` |
| C10 | 图表 type 由真值驱动 | 无装配/门禁对照 `chartType`；Loop 3 才提 containsChart | `series.type='分组柱状图'`；车型 4 个 pie |
| C11 | 高度由 Manifest 写出 | 未建模宿主；`.pannel-content` 是 **block 定高** | header-stats / slot-con-main / chart `flex-basis:0` → 高度 0 |
| C12 | Loop 1 完成标准「三样本重生成」 | 09-10 完成证据是 jest 155/163 + nest build；样本 visual.json `01:03/01:06Z`，Loop 1 commit `02:37` 之后 | 用旧样本证明新治理 |

### 1.3 不严谨（验收和工作方式）

1. **完成标准被偷换**：playbook 自己写「单测绿不算过」，09-10 memory 仍用测试全绿宣告 Loop 0/0.5/1 完成。
2. **P1-1 昨日已自伤**：`021e3cf7` 日志 `vision 3（纠错后 0）+ derived 3 = 3`。Loop 0.A 只挡 rejectedKeys，挡不住「从未进 rejected 的内容区行名」。
3. **冻结被破**：仍保留 T09 infer、autoMount、forceAll 函数内兜底；又提前开工 Loop 4。
4. **砖头当房子**：`contracts[]` 有了 ≠ 写盘吃了；`inlineCompositeRows` 有了 ≠ sections 被改写；golden JSON 有了 ≠ 生成门禁在用。
5. **漏项不在昨日范围**：非法 ECharts type、宿主 block 模型、无真值 CSS 装饰（group 渐变/边框）。不是「优化没生效」，是**方案根本没覆盖**，却被算进「昨日已治理」。

---

## 2. 为什么昨日优化看起来做了、今日仍失败

```
09-09 诊断（对）
  → 抽纯函数 / 扩 JSON 字段（砖头）
  → 单测绿、commit、重启
  → 写盘主路径仍：LLM 自由写 + 后处理猜 + 空契约回全量
  → 三样本未在新代码上重跑
  → 09-10 01:03 生成 = 旧行为
  → 视觉缺陷与 09-09 矩阵同一组病
```

四条独立阻断链（今日审计）对应昨日缺口：

| 今日链 | 昨日声称覆盖 | 实际缺口 |
|--------|--------------|----------|
| 资源跨区/跨角色复用 | Loop 1 契约 | 合同算得晚、空集全量、无 mountTarget、同 section 内标题≠中央 |
| 结构契约与装配脱节 | Loop 2 | inline 旁路、nav 未强制、chrome 早退、headerSlots 双通道 |
| 高度预算与宿主不一致 | Loop 3 / FLEX-005 | 未建模 host；160px 方案本身有害 |
| class token 双轨 | Loop 3 consolidator | rewriteMap 过渡态，template/scoped/common.less 仍两套 |

结论：**不是「再做一遍 Loop 2 四个函数」就能好。** 先关掉昨日留下的自伤通道，再让结构表改写 `sections`，最后才谈 Golden。

---

## 3. 治理原则（v2 硬规则）

1. **一份权威文档**。冲突以本文为准。09-09 文档改状态为 `superseded-by-v2`，禁止并行执行 P0–P6 与 Loop 2/3/4。
2. **完成 = 三样本重生成肉眼对照**。缺这一步，禁止把 Loop 标完成、禁止开下一 Loop。
3. **契约必须出现在 LLM 写该文件之前**。`buildContracts` 不得放在 `genSubComponents` 之后当补丁。
4. **空契约 ≠ 全量**。无 contract / allowed 为空 → 跳过资源注入 + 记诊断，**禁止** `return success`。任务不得标 completed。
5. **后处理只对照 Manifest 回写**。禁止关键词乱挂、禁止 derived 绕过几何、禁止新 CODE-xxx。
6. **几何冲突 Figma bbox 赢**。Vision 只给 label / chartType 建议。
7. **同一 `figmaNodeId` 只落 slots 或 content 一次**。重叠删 DOM，不只删合约。
8. **class / flex / chartType / 装饰** 由装配写。LLM 只写 script 交互和合法 echarts option（`series.type` ∈ 注册类型）。
9. **Golden 独立路径，且在装配已按契约写盘之后才接入生成门禁**。现有 extractor 可留作离线工具，不得宣称 Loop 4 完成。
10. **一次一个 Loop，可独立 revert**。旁线（用户管理/CAS）禁止同 commit。

---

## 4. 正确数据模型（补昨日漏字段）

Working Manifest `wm-2`（在 `wm-1` 上**加字段**，不另起炉灶）：

```
host
  contentDisplay: 'block' | 'flex'     // aio-light-panel = block
  contentHeight: 'calc(100% - 38px)'   // 事实，不是愿望

blocks[]
  id, figmaNodeId, bbox, parentId
  role: chrome | header-slot | content | nav | panel
  layoutMode, sizeBudget                  // px 固定 → flex:0 0 <px>；剩余 → 系数
  classToken                              // 唯一，三处同用
  containsChart, chartType                // bar|line|pie|none；无真值 = none
  mountTargets[]                          // 该 block 允许挂资源的 DOM 角色

resources[]
  assignedVarName, file, figmaNodeId, figmaPath
  ownerBlockId                            // = blocks[].id，禁止停在 slot-con
  semanticRole                            // title-icon | center-icon | card-bg | ...
  mountTarget                             // 唯一
  allowedConsumers[]                      // 文件路径
  provenance                              // figma-tree | mapping-fallback
                                          // 禁止用「有无 ownerBlockId」反推

slots[]
  slotType ∈ title-left|title-right|header-right|close
  figmaNodeId                             // 与 blocks 互斥

contracts[]
  file, blockIds, resourceProps, parentMustPass
  必须在生成该 file 之前算完
```

`provenance` 纠正（相对昨日实现）：

- 树推导出 path → `figma-tree`
- 树缺失、退回 mapping 字段 → `mapping-fallback`
- **禁止** `ownerBlockId ? 'inferred' : 'figma-direct'`

---

## 5. 执行顺序（锁死，取代 09-09 Loop 编号）

### Loop 2.0 — 停昨日自伤（先做，0.5 天，不扩功能）

只修会把结构继续写坏的通道。

| ID | 改什么 | 完成标准（代码级） |
|----|--------|-------------------|
| 2.0.A | `mappingForContract` 去掉 `allowed.size===0 → success` | 空契约返回 `[]`，并打诊断；spec 断言不再全量 |
| 2.0.B | `provenance` 按树/mapping 来源赋值，不按有无 block | 有 `figmaPath` 的 section 资源不再标反 |
| 2.0.C | `isChromeOnlySection`：`title-same-row` / 业务 controls **不得**被 `CHROME_HEADER_RELATIONS` 早退杀掉 | `hasBusinessHeaderControls` 有单测走到 true |
| 2.0.D | `inferHeaderSlotsFromInlineRows` 禁止把 `@antd/tab` / 内容区行名编成 header-right | 行名含 tab 且非 title-bar → 0 个 slot |
| 2.0.E | `buildContracts` 挪到子组件 LLM 调用**之前**（plan 已有 file↔section 即可） | grep：genSub 前 1 次调用 |

**本 Loop 不做**：nav 强制、node-once、Golden、class token、160px。

验收：jest 相关 spec + **不必**三样本（这是停自伤）。下一 Loop 才重生成。

### Loop 2.1 — 结构表真正改写规划（P0）

确定性，不经 LLM。几何冲突 bbox 赢。

| ID | 落点 | 行为 | 三样本肉眼 |
|----|------|------|------------|
| 2.1.A | `inline-row-rebuilder` + visual-parser | 命中的兄弟 **合并进同一个 `layout.sections` block** 的 horizontal children，不只写旁路字段 | env 顶行 tabs+icons 同行 |
| 2.1.B | `subcomponent-planner` | `@antd/tab` / `tabs` / 竖 nav → 强制 `{nav, panels}`，nav 不得丢 | device 有左侧竖 tab |
| 2.1.C | header vs content 互斥表 | 每个 `figmaNodeId` 只进 `slots[]` 或 `blocks[role=content]`；chrome 标题不进 content、不进 headerSlots（业务 stat/tab 除外） | header 统计不双份 |
| 2.1.D | `resource-mounter` `dedupeByNodeId` | 重叠 **删 DOM**；T09 推迟到 2.1.C 之后，且只消费 `slots[]` | 大卡不出现两次 |
| 2.1.E | chartType 冻结进 block | Figma/Manifest 无 pie → 装配/门禁拒绝 `type:'pie'`；option `series.type` 必须是 echarts 注册名（`bar` 不是 `分组柱状图`） | traffic 车型=数字卡；两 hourly 为 bar 且能 init |

验收：**必须**三样本重生成对照。不过则本 Loop 不标完成。

### Loop 3 — 类名、尺寸、宿主（P1）

| ID | 行为 | 禁止 |
|----|------|------|
| 3.A | `classToken` 唯一生成器 → template / scoped / common.less 同一 token | 再叠 `autoFixPrefixViolations` |
| 3.B | `host.contentDisplay=block` 时：组件根 `height:100%` + 内部 flex；**header/统计卡有 Figma 高度 → `flex:0 0 <px>`**；只有剩余图表区用系数 | 给 `.pannel-content` 打补丁；给 header 写 `min-height:160px` |
| 3.C | `containsChart`：chart 容器 `min-height:0` + **chart 节点**（不是 header）最小高度来自剩余预算，默认下限 100，主图 160 仅当 block 真值高度 ≥160 | 把 160 写到 section-header |
| 3.D | 无 Figma fills/strokes 证据 → 禁止生成 background-image 渐变 / border / radius | 删一条 CSS 当修复 |

验收：三样本 class 命中率 ≥95%；header-stats / slot-con-main / chart-wrap `clientHeight>0`；default/group 不出现无真值边框。

### Loop 4 — 双裁判接入生成（最后）

现有 `figma-golden-extractor` / `manifest-auditor` / `docs/golden-manifests` **降级为草稿**。

准入：Loop 2.1 + Loop 3 三样本肉眼过。

| ID | 行为 |
|----|------|
| 4.A | Golden 不得 `import` engineer/mounter/parser；归属算法若必须共享，抽到 **第三文件** `section-key.js`，Working 与 Golden 双边引用，禁止 Golden→Working |
| 4.B | Golden 锁的是 **blocks/slots/chartType/mount**，不是只锁 mapping 列表 |
| 4.C | 生成门禁：`diff(golden, working)` + `verifyProduct`；structural.shifted / resource.misbound / chartType mismatch / height0 → BLOCK |
| 4.D | 拆除：关键词 autoMount、像素 flex fixer、双通道 headerSlots infer、`forceAll` 函数与调用点、consolidator rewriteMap（若 3.A 已同源） |

---

## 6. 明确不要做

- 不要对当前 traffic/device 产物换图、写死高度、`display:none`。
- 不要「继续推进 Loop 2 四个函数」而不先做 2.0 自伤关闭。
- 不要把 Loop 4 脚手架当作已治理。
- 不要新增 CODE/VERT/RESOURCE 规则。
- 不要并行开 class token 与结构表。
- 不要改 `post-process.js` 返回契约。
- 不要写盘自愈不回写 files map。

---

## 7. 与旧文档关系

| 文档 | v2 状态 |
|------|---------|
| `pipeline-governance-2026-09-09.md` | 诊断仍有效；执行顺序作废 |
| `pipeline-governance-playbook-2026-09-09.md` | Loop 0/0.5/1 代码可保留；Loop 2/3/4 执行以本文 §5 为准 |
| `optimization-plan-2026-09-09.md` | **停止执行**，避免与 Loop 抢 commit |
| `root-cause-matrix-2026-09-09.md` | 症状矩阵仍有效；其中「fail-open 全量」「min-height:160 治本」两条作废 |
| `pipeline-loop-234-execution-2026-09-10.md` | 落点清单可参考；接线顺序改为 2.0 → 2.1 → 3 → 4 |
| `traffic-device-monitor-root-cause-2026-09-10.md` | 今日产物证据仍有效；治本顺序改引用本文 |
| `docs/golden-manifests/*` | 草稿，未锁 hash、未接入生成 |

---

## 8. 建议的下一刀

只做 **Loop 2.0**（2.0.A → 2.0.D → 2.0.C → 2.0.B → 2.0.E）。

做完：acorn / 相关 jest / nest build / `env -i` 重启 13030。  
**不要**在 2.0 未合入前重跑三样本（浪费额度，且旧自伤仍在）。

2.0 合入后再开 Loop 2.1，那时才重生成 env/traffic/device。
