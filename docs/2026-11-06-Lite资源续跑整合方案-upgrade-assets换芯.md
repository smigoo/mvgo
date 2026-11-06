# Lite 资源续跑整合方案：upgrade-assets 换芯 lab 确定性链

日期：2026-11-06 ｜ 状态：方案（待用户确认后实施）
关联：docs/2026-11-06-架构评估-事实树基线四阶段.md（Legacy 模式定位）、docs/2026-11-06-lab静态图挂载第六形态与新元素插入.md

## 0. 定位（与 fidelity-v1 的关系）

- **不冲突、互不阻塞**：fidelity-v1 是新生成通道（P0 状态拆分另行推进）；本方案是 **Legacy 存量修复通道**——lab 的确定性能力（真值挂载/无源样式删除）从实验面板迁到 lite 详情页续跑，服务存量 Figma 源任务。与 04:41 方向「Lab 不再补救 Lite 产物」一致：**用户主动触发的存量修复 ≠ Lab 编排内自动补救**。
- lab 实验面板保留（继续做实验），lite 详情页获得同等能力。

## 1. 目标与非目标

**目标**（lite 详情页、仅有 figmaUrl/fileKey 的已完成任务，一键续跑）：
1. 静态资源下载（icon/img/bg）+ 复制到产物 `resources/images/`；
2. icon/img 确定性挂载（六形态兜底链）；
3. 背景图挂载（bg 命名锚定 + E2N bg + plan + AI 兜底四通道）；
4. 删多余样式（闸④检测 + 闸③落地：删 box-shadow / 改 border-radius）。

**非目标**：
- 不重生成布局（Stage A 不跑）；
- 不动 E2N 段级语义（v-for 合并字符串失明 = P2 独立立项，见 §7）；
- 不做文本/字号/颜色回填（lab 有但本端点先不做——那是「重做 Lite 的事」，用户只要资源三件套；后续可加开关）。

## 2. 现状与差距（代码证据）

| 能力 | lite 正式管线现状 | lab lib 现状 | 动作 |
|---|---|---|---|
| 下载+复制 | ✅ `upgradeAssets`（lite.service:938）步骤 1-4/6 已实现 | 同源（FigmaConnector） | 保留 |
| Figma 源定位 | ✅ 任务记录 fileKey + `.cache/figma-source.json` 兜底 + fallbackFigmaUrl | 同 | 保留 |
| 产物布局 | ✅ 同构 `package/index.vue + resources/` ⇒ `importDepthFor` 无需改 | — | 无 |
| AI 定位应用 | ⚠️ `analyzeAssetPlacement` + `applyAssetPlacementsToCode`（LLM 定位，弱） | 确定性六形态链（强） | **换芯**：LLM 路径降级 fallback（可配置关闭），确定性链为主 |
| bg 挂载 | ❌ 无 | 四通道 | **接入** |
| 删多余样式 | ❌ 无 | 闸③④ | **接入**（闸④报告先行，闸③按 E2N 命中率渐进） |
| truth 组装 | ❌ upgradeAssets 未组装 truth | 在 lab service 内联（collectFigmaTruth + imageRef 对齐 + VECTOR 反哺 + parentMeta） | **抽取共享** `src/lite-lab/lib/truth-inventory.ts`（新文件，lab service 改调它，单一来源） |
| userId 透传 | ⚠️ controller 未透（ownerId 隔离要求） | service 收 userId | controller 补 `@Req()` 透传 |
| 守卫 | ✅ 类级 SessionGuard 在 | — | 无需动 |

## 3. #26/#27 提回来的顺序调整（本方案第一步）

原排队理由（fidelity-v1 降级 Legacy）不成立——**本方案让 Legacy 链继续服务生产**，两个缺陷修复从「排队/搁置」提回应做队列且**前置**（否则移植后立刻复发）：

| 序 | 项 | 内容 | 为什么前置 |
|---|---|---|---|
| S1 | #26 x/y 采集 | `collectFigmaTruth` + 反哺两处补 `absoluteBoundingBox.x/y`；zip 轮按 (y,x) 视觉序（`byVisualOrder` helper 单一来源） | zip 错位（cec84299 B①）会在续跑原样复发；改动小、纯收益 |
| S2 | #27 assetClass 路由（收窄版） | truth 组装时结构派生 `assetClass`（container-bg / strip-bg / icon / decor，单函数 `classifyAsset`）；**只在新共享 truth-inventory + 挂载通道入口消费**，不动 bg AI 兜底内部 | `image_313` 459×29 走 icon 通道（bfac46ac A①）会复发；在共享层落一次，lab + lite 续跑两处受益 |
| — | ~~×叉双渲染（P0-2）~~ | **仍搁置**：属「占位识别移动靶」，等 fidelity-v1 P2（data-figma-id 结构覆盖）自然消灭，不投入 | 枚举关闭符集是续命不是根治 |

S1/S2 均按治理流程走（S1 影响面=truth 消费方只读 x/y，新增字段零破坏；S2 新增字段+两处消费，见 §6 回归）。

## 4. 架构形态

```
前端 lite 详情页（TaskDetail，已完成 + 有 fileKey 任务）
  └─ 「Figma 资源续跑」按钮（复用/升级现有素材升级入口）
      → POST /api/lite/upgrade-assets/:sessionId   [控制器补 userId 透传]
         ↓ LiteService.upgradeAssets（升级版，保持签名+返回结构兼容）
         1-4. 定位产物/figma 源 + fetchNodeData + 下载 + 复制（保留现状）
         5'. buildTruthInventory(nodeData, downloadedAssets)   ← 新共享 lib（从 lab service 抽出）
              - collectFigmaTruth + imageRef 对齐 + VECTOR 反哺 + parentMeta + [S1 x/y] + [S2 assetClass]
         6'. 确定性挂载（truth-inventory → truth-matcher 六形态 + bg 四通道）
              - AI 定位路径降级：requestBody.det determinsticOnly（默认 true）
         7'. 闸④ detectUnsourcedStyles + 闸③ applyUnsourcedStyles（只报+安全落地）
         8'. 快照/workspace 同步（复用 refreshRevisionFilesFromDisk 模式）+ 续跑报告
              （报告结构复用 LabReportSummary 子集，落 .cache/upgrade-report.json）
```

**代码落点**（全部 lite-lab/lib + lite/，不碰 ai-engine）：
- 新 `src/lite-lab/lib/truth-inventory.ts`：`buildTruthInventory(nodeData, downloadedAssets)`（纯函数）；lab service Stage B 改调它（删除内联组装，单一来源）。
- `src/lite/lite.service.ts#upgradeAssets`：步骤 5-6 换芯；步骤 7-8 新增。
- `src/lite/lite.controller.ts`：`@Req()` 透 userId（ownerId 隔离）。
- lab 与 lite 各自 spec 新增续跑用例。

## 5. 风险分级（A/B/C）

| 级 | 风险 | 缓解 |
|---|---|---|
| A | 确定性链改写产物出错（六形态对存量 Lite 产物形态未见过 → 误绑/误删） | 闸③只落 delete/override 白名单属性（既有 isAutoApplicable 单一来源）；挂载全部走「唯一锚定否则保守放弃」纪律；每步落 .cache 报告可审计；**dryRun 参数**（默认先只报告不改盘？——见待裁决 Q2） |
| B | LLM 路径与确定性路径双写冲突 | 互斥开关（determinsticOnly 默认 true 时 AI 定位整段跳过） |
| B | 存量任务产物结构差异大（旧版无 package/ 布局） | 入口探测 package/index.vue，不存在则报告「产物结构不支持」退出 |
| C | userId 透传改变匿名行为 | upgrade-assets 本就有类级 SessionGuard，只是没取 user —— 补上是收敛不是放宽 |

## 6. 回归设计

- **S1**：truth-matcher.spec 补「x/y 参与排序」用例（构造 y 交错资产断言 zip 序）；真机重放 cec84299 断言 strategicIcon↔38:3160 对位。
- **S2**：truth-inventory.spec 补 classifyAsset 四类阳性对照（bg-8788 container、image_313 strip、icon-262 icon、g-8421 decor+不消费断言）；真机重放 bfac46ac 断言 image_313 走 bg 通道。
- **换芯**：lite upgrade-assets 新 spec（mock connector 返回 fixture nodeData → 断言挂载/删除/报告/幂等二次跑零变更）；jest 基线两态 diff 空；本地 :13030 冒烟（真实已完成任务一键续跑，server.log 计数行非零）。
- **兼容**：upgrade-assets 旧返回结构字段保留（前端不改也能用），新字段（mountStats/unsourced）增量。

## 7. 待裁决

- ~~Q2 dryRun~~ **已消解**（04:56 决策：续跑=原任务新 revision 事务，跑失败 rejected 自动回退 last-good，跑成功可 rollback 一键还原；dryRun 的"观察模式"= 候选态，已有载体，不再需要）。
- **Q1**：闸④检测范围=「E2N 映射类」（no-e2n-edge 则盲区）——存量 Lite 产物 E2N 命中率未知，v1 先「报告驱动」（闸④只出报告+闸③只落白名单）是否符合预期？
- **Q3**：文本/颜色/字号回填（lab Stage C 有）是否也纳入续跑？默认**不纳入**（资源三件套聚焦），后续可加参数。

## 6.5 续跑事务形态（04:56 用户裁决）

**原任务 + 新 revision**（非新任务、非无版本原地改）：
- 续跑改产物前不动 last-good；改完走 SFC 结构校验（isRenderableRevision 同款判据）；
- 通过 → 注册新 revision + 晋升 last-good + workspace 同步；失败 → rejected 候选，预览自动回退 last-good（resolvePreviewRevision 现成），原版本零污染；
- 还原性基建已验证：`.task-code-snapshots/<sid>/last-good.json` + revisions/ + `POST /api/tasks/:sessionId/code-snapshots/:revision/rollback`（12 个 mc-lite 任务实存）；
- workspace custom-components 无 git ⇒ 不做无版本原地改。

## 8. 实施顺序

1. **S1 x/y**（半天级，先行独立提交）
2. **S2 assetClass 收窄版**（随 truth-inventory 抽取一起做）
3. **truth-inventory 抽取**（lab service 改调，lab 回归绿）
4. **upgradeAssets 换芯**（控制器 userId + 步骤 5'-8' + 互斥开关）
5. **前端入口**（TaskDetail 按钮条件渲染：completed + fileKey）
6. 冒烟 + 真机验证三个既有任务（cec84299 / bfac46ac / 24468462）

> 判据均为「假设」，以真机验证为准。实施全程按 mvgo-node-pipeline-governance 六阶段走，每步独立 commit。
