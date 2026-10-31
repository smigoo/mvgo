# mvgo 速查（2026-10-29h｜详判据 `PIPELINE-DETAIL.md`｜排障 `mvgo-*-triage` Skill｜细节 `YYYY-MM-DD.md`）
> 纯索引，越靠前越保真。

## 当前状态
- ✅ 生产 `37d0983`（`go.microvideo.cn:13030`，回滚锚 `dist.bak.37d0983-20261026-164559`），线上全绿。
- 🚧 本地已提交未部署 `0013ba8`→`b52346d`（刀32）约 30 刀；**刀33 第1步已改完**；**刀33b＝方案A（用户指定 componentId 不被追尾段）已改完未提交**（`component-naming.js` +117 纯新增 `decideDeclareComponentIdFinal`；`microcode-engineer.js#normalizeDeclareJson` 只赋值+检查点自愈；`code-validator.js:1657` 透传 `userComponentId`；spec 26/26，两态回归 added=∅）。本地 `:13030` PID 80699。刀↔commit 全表⇒P-DETAIL 末节。
- 🔴 主仓 push 未做（远端日同步镜像已分叉，禁 force），指针停 `681e572c`；刀32 WARN-only，升 BLOCK(CODE-029) 待裁决。
- 🔴 遗留：`布局真值守卫 hits:0`=无病灶非失效；`COMP-002` 未修。部署包必剔 `dist/workspace`、`.DS_Store`、`dist/app.controller.spec.*`。

## 硬约束
- 🔴 不得自行部署（:13030/:2610 重启、同步生产、`git push`）⇒等指令；交付必说「已改完，未部署」。
- 🔴 治本非产物直改+可辩驳判据+阳性对照；判据同构单一来源；文本命名无关（只认 `type` TEXT/CHARACTER；角色唯一来源 `splitTitleValueByStyle`）。

## 关键契约
- 🔴🔴 **E1 骨架=Figma 树，待改 vision**（`subcomponent-planner.js:2113-2138`）。用户拍板 **结构骨架=vision／精确尺寸=Figma**。`e1Derived` 4 处（`:1218/2124/2432/2601,2608`）⇒ vision 骨架下 `refineDerivedContainerLayout` 失效；`:2473-2500` 兜底可升主路径。
- ✅ **刀33 第1步**：① 锚点单一来源 `sectionAnchorCandidates/sectionAnchorKey`（`figmaAnchorId→figmaNodeId→id`，**不做形态校验**否则合成 id `43:4791-list` 变空键⇒fail-closed）+planner 三处 Map 键 `:2145/2161/2485`；② `decideCollapsedShape` 复用 `decideLayoutForBoxes`（治 6 纵卡误判 `list`+`horizontal`）。spec 7/7。
- 🔴 `repeated-section-collapser.js:449` 全库唯一赋 type 处（刀33 改几何优先）；`section-tree.js:1545` 据渲染 `CardGrid`/`ListSection`⇒「合并列表项」必撞 6 项悬崖。
- 🔴 刀53 家族序 `grid→header→statrow→table→text→icon→legend→kvgrid`；新 kind 须登记 `FG_TAKEOVER_CLASS_RX`+计数链分支；vue3 映射唯一 `matchFgTakeoverTargets`。
- 🔴🔴 刀53d/e：资源变量**绝不拼进静态 style/JSON**（`:style="{backgroundImage:'url('+var+')'}"`）；CODE-028 补 CODE-022。
- 🔴🔴 几何/真值判据必挂真机日志计数行（离线探针塞入参=假绿）；**改的人=验的人用同一正则=假绿**；方案文档判据只当假设（f98f7463「同宽±2」恒零命中）。
- 🔴 **字号下限守卫必须覆盖双形态**（`ai-engine/utils/font-size-guard.js`，lite 4 写盘点 + engineer writeFiles 共用）：① `calc(@fontSize*X)`（微码，extractor 归一后）② **裸 px**（Lite **vue3** 分支不做归一，真机实证裸 px 8/9/10 → 旧实现 `hits:0 changes:0` 产物一字未改＝死守卫）。`MIN_FONT_PX(5)<px<MIN_BODY_FONT_PX(10.5)` → 提 10.5，≤5px 豁免（隐藏文本），rem/em/% 不覆盖。日志 `hits:N calc:C rawpx:M minRatio:0.75 minPx:10.5 rawUnderMin:K`（**rawUnderMin 已改为「改后残留」，恒 0**，非 0=形态漏网）。判据＝`lite.font-size-guard-wiring.spec.ts` 行为断言（病灶阶梯过守卫零残留）+ 反证（合规 11/13/15 不得抬高）。
- 🔴 刀8/9–32、T4、令牌化、A1-A2、方向判据、LESS、透传三铁律、`:deep()`、`writeFiles`、R24、`getFigmaBox`、R19 ⇒ **P-DETAIL**。

## 环境
- 根 `/Users/smigoo/工作/mvgo`：backend-node(:13030)／frontend(:2610，`build:safe` 堆 4096)。
- 🔴 node 版本先 `ls ~/.workbuddy/binaries/node/versions/`（现 `22.22.2-6`）；npm/node/jest 一律 `env -i`，jest 加 `--runInBand --forceExit`、`--testPathPatterns`（复数）、`--config package.json`；stderr⇒`> f 2>&1`。
- 🔴 **Bash cwd 不持久**⇒绝对路径／`git -C`／`npm --prefix`；FAIL 行双写⇒basename sort -u。
- 🔴 后端 `node <根>/start-node.js`（`server.log`／生产 `/root/.pm2/logs/backend-node-out.log`）；DOM `/preview/<id>?sessionId=&groupId=`(:2610)；Mongo `brew services start mongodb-community`；离线重放 `.checkpoint/`、`figma-node-data.json` 走 `.document`。

## 陷阱
- 门禁三查；0 命中必配阳性对照；改判据先纯函数 A/B。基线恒 23 套件/44 用例环境失败（别当回归）；两态 FAIL 集合 diff 须空且先 `wc -l` 确认非空。flaky⇒P-DETAIL。
- 🔴🔴 「本地跑一次」前必核进程启动时间 vs dist mtime。
- 🔴 BSD grep：多模式必 `-E`（`\|` 静默空）；`sed -i ''`；commit -m 禁 `$(...)`；heredoc `${}` 展开⇒用 Write。
- 🔴🔴 git daily auto-sync 会拆改到一半的工作区⇒A/B 基线用刀前明确 commit id（禁 `git show HEAD:`）；两态回归前先 commit；临时脚本跑完 rm；变异/还原禁 `git checkout --` 未提交文件。**并行编辑污染⇒两态跑前后必做 src 全量 `md5 -r` diff、排除非本轮文件（2026-10-31 实测：高度修复 WIP 在回归窗口内被外部改动，制造假回归差异）**。
- 🔴🔴 worktree 回归三假象：无 `dist/`⇒套件假失败；无未跟踪样本（`workspace/**/.checkpoint`）⇒静默 skip；`ln -sfn <dir> <已存在目录>` 塞进目录⇒须逐项 `ln -s`。
- 🔴 `parseLessVars` 要变量**独占一行**；`normalizeCssColor` 对渐变/url 返 null⇒须单独 helper 用例；`container-background-truth#collectClassProp` 为刀32/37/panel-chrome **三方共用**。
