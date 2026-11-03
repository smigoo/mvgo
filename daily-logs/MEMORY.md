# mvgo 速查（详判据 docs/PIPELINE-DETAIL.md｜排障 mvgo-*-triage skills｜细节 memory/YYYY-MM-DD.md）
> 子仓 backend-node/frontend/docs 各自独立 Git。

## 硬约束
- 🔴 不得自行部署（重启、生产同步、git push）⇒交付必说「已改完，未部署」。
- 🔴 治本非产物直改＋可辩驳判据＋阳性对照；判据单一来源；只认 type TEXT/CHARACTER；角色唯一 `splitTitleValueByStyle`。
- 🔴 提交必显式列路径（禁 `git add .`）；先子仓后主仓；主仓指针 `-dirty` 是并行 WIP 所致（写入的是纯 SHA），message 注明。
- 🔴🔴 几何/真值判据必挂真机日志计数行（塞入参=假绿）；改的人=验的人同正则=假绿。

## 状态（11-03 15:40）
- 生产：前端 11-03 15:25 构建（入口 `index-Cem2KRQN.js`，含 `59fea37`/`1bf82a0`/`1e83dde`），回滚点 `mvgo.bak.20261103-1525`。Node `37d0983` 未更新，后端未部署 ~40+ commit。
- 本地 :13030 单进程跑 dist（源码改动须 build+重启才生效）；:2610 Vite / :8080 java / Mongo `brew services start mongodb-community`。11-03 22:26 已 `npm run build`（stamp `2026-11-03T14:26:43.099Z git=47b3ba4`，含 #1 双链路幂等/#2 `color:0px`/#3 根 `::before` 白蒙层/语义别名层/EPERM 兜底），**进程 PID 82358 启动 22:15:51 早于构建 ⇒ 仍跑旧 dist、未重启**。
- git：主仓 `main` 无 upstream；子仓 ahead = backend-node 37 / docs 17 / frontend 9，**均未 push**。工作区常驻并行 WIP（`quality-score-v1.js`+.spec、`data/api-catalogs/*`、`data/figma-node-cache/*`、`dist.old-*`）——**勿 commit/勿 revert**。
- 11-03 后端提交链：`95f26c6` 段级归属守卫 / `8ee4133` 方向判据 / `ac6b163` 表格 dedup / `8e548cf` region-partitioner / `dc4c483` P3 面板自持 / `62f5c83` L1 / `701c550` A1+B1 / `2980bd7` B3 / `a02fc43` C1 / `2fc4067` 两档豁免 / `22af320` Figma 跨境 / `a347671` A4 / `16e820c` quality structure+resource F1F2F3 / `8b20c59` A4 二轮 / `35726c7` 504 异步化 / `ac32ea0` 刀16b+刀17。styleScore 11-02 重算 532；component-meta 179 目录 11-03 落盘；⏸ HOLD 7 个 0→null 待拍板。

## 关键契约
- E1 骨架=Figma 树待改 vision（subcomponent-planner:2113）；拍板：结构骨架=vision／精确尺寸=Figma。
- 刀33 锚点单一来源 `sectionAnchorCandidates/sectionAnchorKey`（不做形态校验，防合成 id 空键）。
- `repeated-section-collapser.js:449` 全库唯一赋 type；`section-tree.js:1545` 合并列表 6 项悬崖。
- 刀53 家族序 `grid→header→statrow→table→text→icon→legend→kvgrid→footer→regions`；新 kind 须登记 `FG_TAKEOVER_CLASS_RX`＋计数分支＋reject-summary HIT_KEYS＋mc-check.cjs 内嵌正则（同构锁 spec）；vue3 映射唯一 `matchFgTakeoverTargets`；接管器=`folded-grid-section-takeover.js`（kv 单元=fgKvCellLines/fgKvCellConsts 共用、kv 事实=buildKvGridFacts 共用）。资源变量绝不拼静态 style/JSON（CODE-028 补 CODE-022）。
- 🔴🔴 刀55 列表方向几何真值优先（`bc473fa` 未部署）：`resolveListMemberDirection` 几何可证（inferListGeometryDirection 非 null，极保守）胜过 declared/缺省（档 geometry-overrides-*）——vision 段级 layout 是「标题/内容堆叠轴」非「重复成员轴」，plan 折叠段常丢 body.layout。遗留：①list 接管丢段头真值（R6 对 list kind 恒 0=盲区）②index chunk 把 header-right tabs 画成页顶 tab 行+死代码 statCards（95f26c6 只挡越界不挡错位）。
- 🔴🔴 段内分区接管（刀54 `66b800d` 未部署）：检测链最末位全 miss leaf 跑 `partitionLeafRegions`，kind=regions 复合渲染（kv 区=buildKvGridFacts 严格口径；全子区可渲染才接管否则 fail-open）；`regionHits` 计数+审计 regionsTaken；三处登记。🔴 分区器只归一 member.box，**run.box 仍是画布绝对坐标**——消费者必须以 member.box 为几何真值（否则 kvColGapUnstable 恒假阴性）。
- 本仓两个 `indexFigmaNodes`：cbt 版条目 `{node,parentId}` 自动解包 document；section-tree 版 `{id,name,type,bbox,parentId,rawNode}` 不解包。判据须 `entry.node||entry.rawNode`＋`if(!sec) return null`；测试须同口径喂入。
- 刀7c 根级宿主吸收：非容器段∧box≡图根±2px∧恰1吸收段⇒并入直系子（`expandCandidateIdsWithDirectChildren` 纯枚举，裁决单点 `resolveAbsorbedBgLayers`）；容器段零枚举；≥2/不自洽 fail-open。重放入参 `{generationInput, figmaNodeData: <dir>/.mc-gen/cache/figma-node-data.json>.document, componentName}`。
- 🔴🔴 A4 高度比例治理（`a347671` Loop1-3 + `8b20c59` 二轮，文档 `docs/2026-11-03-A4*.md`）：`applyFigmaSectionRatios` 配对优先级 `figmaNodeId > ②-α 根下直配（含 header 类∧根下非 bg 数==sections 数）> ①-β section.id 直配（全命中才采纳）> ② 顺序配对`，stats 挂 `visual-parser:1773` 计数行；`figma-section-heights.js` planLeaves 放宽 `>=1`、tags 只留严格相等；**slot 同名容器上溯** `slotAncestorHeightFor`（`slot-{name}` trim 全等、≤4 跳、失败开放、`writeSectionRatios:753` 取 max 只升级）＋①-β 追认 Vision 幻觉缺项（全 `anchorValid===false` 才追认、幻觉项不写比例、计数 `idDirectSkipHallucinated`）＋**编排层缓存短路补跑 A4**（`mc-component-graph-phase2.js` `state._uiCache?.previewAnalysis` 分支 return 前补跑 `applyFigmaElementHeightRatios`，否则 visual-parser.parse() 不执行 ⇒ 后处理对 reuseCache 全失效）。🔴 **WRAPPER_RE 刻意不放松 `slot-*`**（e1432017 契约）；修法=展开+剥离循环后按「恰好相等才采纳」再归并。遗留：断点② A4(1467) 仍早于 `_normalizeAnalysisOutput`(1469)；刀16 兄弟间距仍按 Figma 绝对坐标算 margin 与 flex 双计（`ChartTunnel 551px`/`91`，旧产物同病）。
- 字号守卫 `ai-engine/utils/font-size-guard.js` 双形态 calc+裸px（5<px<10.5→10.5）；守卫总纲 `docs/2026-11-02-写盘前pass执行顺序总纲.md`（新守卫必登记）。
- 🔴 语义别名守卫（`style-tokens.js#MC_SEMANTIC_COLOR_ALIASES`/`resolveSemanticColorSlot`/`isPrimaryAccentName`；spec=`file-writer.semantic-alias.spec.ts` 6 条）：只做「约定语义词→canonical 槽」**名字间接、零色值硬编码**（error/danger/fail/alert/notice→color-danger、warning/warn→color-warning、success/ok→color-success），取值`MC_CANONICAL_COLOR_SLOTS[light|dark]`。**接入点必须在 `file-writer.js#safeLessVarValue` 的 N3(#139) 丢弃判定之前**（N3 对非 canonical 名丢弃一切按名猜色 ⇒ `@color-alert` 曾变 `#333333`）。守卫① 名含 bg/background/border 不归位；守卫② 色相限定词（gold/cyan/red/green…）继续走真值桶。**primary 语义分治**：kebab `@color-primary`→canonical `#1890ff`（其 -hover/-active/-bg 全由它派生），框架驼峰 `@colorPrimary`/`@brand-accent`→`#409EFF`（`file-writer.js:633` 框架 `--colorPrimary` 既有契约，由 `isPrimaryAccentName` 保留）。
- quality-score-v1（`dabed55`/`396f7c2`/`d7eb6b1`）：template depth 配平、resourceMount 改 targetDomSelector+ownerSectionId、色彩委托 style-var-resolver（阈值 24 未动）。判据入口必解包 `findFigmaNodeData` 包装体 {document}。
- 🔴🔴 刀17（`ac32ea0` 未部署）：`resource-import-guard.js#collectDeclaredBindings` 旧用 `rest.split(',')` 裸切 ⇒ `const bgList = [bg2, bg1, bg3]` 切出中段 ` bg1` 误登记「已声明」⇒ `resource-facts:167` declared 命中即 continue ⇒ unresolved 漏项 ⇒ **R2 幽灵引用判据失效** ⇒ CODE-025 静默 ⇒ ESM ReferenceError ⇒ RUNTIME-004+VISUAL-002 双硬 BLOCK。🔴 **只有数组中段元素受害**（首元素被 `X = [` 挡、末元素被 `]` 挡）⇒ 既有单测用 1~2 元素恰好测不到。修法=`splitTopLevel(rest, [','])` 且增强其为字符串/模板字面量感知（`quote` 状态机；勿另立函数）。
- 🔴 刀16b（`ac32ea0`）：`code-generator.js#siblingGapStyle` 第 4 参 `prevEffectiveSize`——flex 用 `resolveSectionFlexSize`（段整体）而间距用 `resolveSectionBox`（常是段标题 GROUP h=24）⇒ prev 高度双计。prev 底取 `max(prevBox.h, prevEffectiveSize)`（只增不减；缺省/0 逐字回退旧行为）；计数 `{"applied":n,"rebased":n}`。残留 `ChartChart3 91px`。
- 🔴🔴 `CodeStructureValidator.validate` **两个 mapping 键名**：`resourceDomMapping`=事实源九处（`:172`/`:1280+`/`:1535`/`:1687`/`:1952`/`:2083`/`:2182`/`:2213`/`:2229`）；`resourceMapping`=` :3318` 幽灵引用独用。**新增调用点必须两键同时传**（改前只传后者 ⇒ 每条资源 import 恒判 CODE-008＝12 条假阳性）。配套：`quality-auto-fix.js:36 stripLlmResourceImports` mapping-aware（只删未登记，缺失 fail-safe 不删）＋`mc-spec.service.ts:609 ensureResourceImportsForRefs` 写盘终验（**严格幂等**；`injectResourceImports` 非严格幂等，禁用于可重入路径）。
- 🔴 判定侧两档豁免（`2fc4067`，事实源=`.mc-gen/resource-dom-mapping.json`）：档A 面板壳=`skipMount===true`（`figma-connector:2679-2704`：role bg ∧ figmaPath 段数≤2）只免 **radius**；档B 成品位图=`downloadStatus==='success'` 免 **color+radius**。收集器 `collectPanelShellNodeIds`/`collectExportedResourceNodeIds` 纯函数零 IO；`scoreComponentDir:1552/1591/1594` 与 `scoreResourceMount:940` 同字段同语义。🔴 **禁回退 `isPanelResource` 名字白名单**（反例 `36:1697 header` 名字命中但无 skipMount）；`dedupeExpectedEntries` 按 value 保留首个 ⇒ 过滤必须用 **filter 不能靠 dedupe**。改判据后**探针调用点必须同步补参**。
- P3 面板自持（`dc4c483`）：`buildPanelInlineCss` 单一来源，fg 注入点挂 tr.panelCss，审计 `panelBg=injected/tried`（0 也打）。合成 id 必 miss＝安全正确，禁剥后缀兜底。
- 🔴 **结构维度不可自动修复**（架构性）：`quality-score-v1.js:1109 scoreStructure()` **只回 `{scored,score,details}` 不产 issues** ⇒ `mc-spec.service.ts:564 fixableRules` 加宽也打不到；两处显式 `name==='structure' → continue/skip`（`:693 hasStyleFixable`、`style-auto-fix.js:289`）。结构类真问题在 spec/L0-B 规则侧（46 条 `CODE-*`+`FLEX-*`+`COMP-*`）：`FLEX-002` 冗余 flex、`CODE-023` 悬空子组件标签等确定性可修。⚠️ `nodes` 子项 `min(1, actual/expected)` **只罚少不罚多**（产物多 40% 仍满分）＝判据缺口。
- 🔴 高级选项三字段（`extraPrompt`≤4000 / `requirementDocText`≤20000 / `userComponentId`）：`TaskMetadata`+`Task`+`createTask`(tasks.service:1159)+lite.controller 两处 createTask 四处齐落；`getTaskStatus` 白名单必须显式列（:1504-1506，漏写即静默剥离）、`getRetryMetadata` 必须返回（:2720）；`data/tasks.json` 223MB 且 `/tasks/recent` 15s 轮询 ⇒ **`requirementDocText` 永不进列表**（slim 成 `requirementDocTextLen`），前端按 sessionId 拉详情；`configSnapshot` 带 `.strict()` 载不了 prompt（塞即 400）。
- 预览尺寸：`useResizableFrame` SIZE_POLICY_VERSION 再改 default 口径必 +1；fit 只按宽度收敛（预览区全层无确定高度，clientHeight=正反馈塌缩）；`generate/components.vue` 16:9 刻意不改；块注释内禁 `*/`。

## 环境/陷阱
- 🔴 npm/node/jest 一律 `env -i`；jest `--runInBand --forceExit`、`--testPathPatterns`（复数）、`--config package.json`；cwd 不持久⇒绝对路径/`git -C`。
- node 版本先 `ls ~/.workbuddy/binaries/node/versions/`（当前 `22.22.2-6`）；生产 pm2 日志 `/root/.pm2/logs/backend-node-{out,error}.log`；ECS `root@47.98.216.206:65522`（expect 自动输密码，长命令走 `echo <base64>|base64 -d|bash`，避 TCL 把 `[^,]` 当命令替换）。
- 前端发布：`build:safe`=`vite build --mode production --emptyOutDir false` ⇒ dist 是**叠加态**（曾 1101 文件/13 个 LiteGenerate 版本）⇒ 不能按「文件存在」判产物，必须按 `dist/index.html` 引用入口 + 干净重建定版（`mv dist dist.old-<TS>` + `mkdir -p dist/static/{css,js,png,svg,woff,woff2,ttf}`）。打包 `COPYFILE_DISABLE=1 tar --no-xattrs -czf … -C dist .`；macOS tar 带 uid/gid ⇒ 解包后 `chown -R root:root`（建包时 `--uid 0 --gid 0 --owner root --group root` 根治）。判据禁用被 minify 改名的函数名。
- 基线 21 套件/36 用例环境失败；jest 全量 FAIL 行出现两次⇒`sed -E 's#^FAIL +##; s#^src/##' | sort -u`；「本地跑一次」前必核进程启动时间 vs dist mtime。
- BSD grep 多模式必 `-E`；`sed -i ''`；commit -m 禁 `$(...)`；heredoc `${}` 展开⇒用 Write。
- git daily auto-sync 拆改工作区⇒A/B 基线用刀前 commit id（禁 `git show HEAD:`）；两态回归前后 src 全量 `md5 -r` diff。
- worktree 三假象：无 dist/⇒假失败；无未跟踪样本⇒静默 skip；`ln -sfn` 塞已存在目录⇒逐项 `ln -s`。
- tsc `allowJs` 未开⇒`npx tsc -p tsconfig.build.json --outDir /tmp/nbcheck` 避免覆写在跑 dist。
