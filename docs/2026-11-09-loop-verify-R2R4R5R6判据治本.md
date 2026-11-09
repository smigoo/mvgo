# LOOP-VERIFY R2/R4/R5/R6 判据治本汇总（真机验证记录）

> 日期：2026-11-09 · 主流程文档：`2026-11-08-修复验证loop与自动回滚流程.md`
> 本文档补齐门禁 Phase 3-4 要求的「每轮方案要点」，四轮合并一份（背景/根因/修法/判据/影响面/回归）。
> 状态：R1(`07a916d`)/R2(`7d45912`)/R5(`9d1523d`)/R4(`563df52`) 已提交判分通过；R6 待提交。

## R2 · 终裁覆写点快照语法校验

- **背景**：刀53 终裁覆写（`file-writer.js:2169` 起）在 SFC 写盘门禁（`:1470`）**之后**执行，locked 快照不经任何校验直接落盘。真机 `mc-max-1794142741765-e239c8c3`：门禁验 before:1053（合法）→ 换 after:1395 落盘 → 78ms 后「SFC 编译失败已隔离降级」，`degradedFiles` 假阳。
- **根因**：唯一写盘出口内部时序洞——「先验后换」。
- **修法**：覆写点对 locked 快照跑**同一** `validateVueSfc`（判据同源）；非法/异常 ⇒ 弃快照保 heal 版（已过门禁验证）落盘 + 计数行。
- **实现坑自纠**：首版引用 `lessGlobalVars`（声明于 `.vue` 分支内、覆写点在分支外，作用域不可达）⇒ try-catch 把 ReferenceError 吞成「校验失败」⇒ **合法快照也被全弃**（探针双路径实证）。修：`extractLessGlobalVars(files)` 同口径现算。
- **判据/计数行**：`🛡️ R2 终裁快照校验失败`（弃快照 warn）。真机四发 **0 次**（快照全合法，符合「多数单应为 0」预期）。
- **影响面**：`file-writer.js` 单点；双端共用 writeFiles（vue3 无 fgTakeoverFiles 入参，天然旁路）。
- **回归**：3 例单测 + 家族 12 套件 96 例绿。**判分通过**。

## R4 · LESS 根级裸属性判据（LESS-WRITE-007）

- **背景**：`mc-1794186438485-3c9509f8` 失败：`common.less:176-178` 混入三行 `font-size: calc();`（无选择器 + 空 calc() 双重非法）⇒ less `Properties must be inside selector blocks` ⇒ 最终编译门禁 BLOCK 整单失败。
- **根因**：`scanStandaloneLessDefects` 既有 001-006 均不认此形态（006 双冒号锚定不到单冒号游离声明；001 括号平衡对此透明）⇒ 结构级盲区，坏文件一路漏到最终编译。
- **修法**：新增 **LESS-WRITE-007**——逐行深度状态机：行首深度 0 + 行内无 `{` + `prop:` 游离声明形态 + 排除 `@/&///*` 前缀。**行首深度**而非行末深度判定（`display: flex;}` 行内闭合不影响本行层级，合法形态实证）。判死不臆修（与 006 同策略）。
- **判据/计数行**：门禁拒绝路径新增 `🧩 LESS 写盘门禁判死成因: defects=<ids>`（恒打，0 也打）。
- **影响面**：`scanStandaloneLessDefects` 单一调用方 = `gateStandaloneLessWrite`（`:1079`）；`healLessSource` 无根级行处理（提前消化不存在）。
- **回归**：4 例单测（阳性 3 条逐字复刻/阴性全合法零命中/阴性块内不判/出口判死接线）+ 家族 4 套件 58 例绿。fixture 首版截取不完整（漏开括号行）被扫描器正确判出 4 条——深度状态机正确性的反面实证。

## R5 · 终裁快照的跨轮冻结救回

- **背景**：R2 后真机 `dc734b85` 深挖：1395 快照**已过 R2 校验落盘成功**，下一修复轮 pass（语义分流 `resource-mounter.js:3254` 等）把回写内存的快照**改坏** ⇒ 门禁拦下 ⇒ 走不到终裁点 ⇒ 判死降级。刀53「内容完全由 Figma 真值决定」语义在**多轮 writeFiles 场景**被回写链打破（`folded-grid:4543` P3 注释 icon 0/110、header 0/219 同病历史证据）。
- **根因**：快照入口（R2 已守）与修复轮改写（无守卫）之间的时序缺口；门禁判死分支走不到终裁点。
- **修法**：两个门禁判死分支加 `_fgFinalSnapshotOf` 豁免——该文件在 `options.fgTakeoverFiles` 有快照 ⇒ 回退快照落盘（真值救回）而非判死降级。跨轮载体 = 同一份 Map（判据单源）；快照合法性由终裁点 R2 校验保证。
- **设计自纠 ×2**（均被 spec 抓出）：① 冻结 Set 挂循环内——门禁先于终裁点执行，Set 永远空；② diff 前回退方向写反（把快照回退成 heal 版）。
- **判据/计数行**：`🛡️ R5 冻结救回`。真机命中 **2 次**（TabsSection 1395B、CardGrid 8014B——正是两个反复降级文件），救回后零降级留痕。
- **影响面**：判死分支豁免只对「有快照的接管文件」生效；普通文件仍走原判死（spec 边界例锁定）。
- **回归**：5 例单测 + 家族 93 例绿；**真机 `2:7952` 首次 completed+零降级**（历次 3 发全挂）。

## R6 · 段级 headerSlots[] 收编（进行中，未提交）

- **背景**：用户指认三组件 UI 问题（header-stats 应在头部右插槽 / header-con 应为插槽 / tab 无交互）。真值核查：`2:8419` 段级**自带** `headerSlots[]`（title-left icon + header-right×3 statistic，含 figmaNodeId），但顶层 `visual.headerSlots = []` ⇒ T09/资源挂载全线拿不到插槽事实。
- **根因**：`inline-header-slot-inferrer.js#ensureHeaderSlots` 只消费段的 `slotCandidate` 标量（每段至多 1 个粗粒度 slot、figmaNodeId 空），**段级现成数组被完全无视**。离线复现：真值直跑 derivedCount 0→粗粒度 1 条；收编后 **4 条全量**（含 figmaNodeId）。
- **修法**：段带非空 `headerSlots[]` 时逐条 `normalizeSlotCandidate` + 既有 `slotKey` 去重 + `rejectedKeys` 拦截后收编（零新判据，同一出口）；收编后 `continue`（slotCandidate 粗粒度兜底不重复推）。
- **判据/计数行**：返回值新增 `sectionArrayCount`（收编条数）；`visual-parser` pushFix 与日志行透出——`sectionArrayCount>0` ⇒ R6 路径生效；`=0 且 derivedCount>0` ⇒ 全走粗粒度兜底（旧行为）。两条路径在真机日志**可区分**（改验分离）。
- **影响面**：`ensureHeaderSlots` 两处消费——visual-parser（vision 出口聚合）+ resource-mounter `:2454`（写盘前注入，microcode 端，`:2459` vue3 旁路）。既有 4 套件 27 例 + resource-mounter 140 例全绿。**B 级行为变化**：所有任务顶层 headerSlots 从恒空变为可能非空 ⇒ T09/P1-3 去重链激活——经用户授权后实施。
- **回归**：待真机三发回放（header-stats 进插槽 / tab 交互生效 / 对照 probe 不退化）。

## 明确不做

- ❌ 不在产物 .less/.vue 上手改（全部走管线判据）
- ❌ R7（tab/stats 颜色真值）不扩 vision 字段——倾向 `figma-node-data` fills 直读（`repeatedFill:"#3a5a7a"` 实证真值可直达），另起一轮
- ❌ ①流量监测 daily-total-flow 像素级：chartOwned 让出段走 LLM（随机层），loop 判分口径已豁免；子结构真值透传归 R8 另立项
