# mvgo 速查（2026-11-02｜详判据 `PIPELINE-DETAIL.md`｜排障 `mvgo-*-triage`｜细节 `YYYY-MM-DD.md`）
> 纯索引，越靠前越保真。子仓：`backend-node`／`frontend`／`docs`（各自独立 Git）。

## 当前状态
- ✅ 生产（11-02 实测）：Node `37d0983`（pm2 id=0 PID 11504，:13030）；Java :8080 PID 2393626；nginx 容器 1.30.4；前端 `/home/mvbt/nginx/www/mvgo/` = 10-09 09:57 构建（入口 `index-Chu2mHxQ.js`）。回滚锚 `dist.bak.37d0983-20261026-164559`；前端旧锚 `www/mvgo.old`（9/30）。磁盘 61G。
- ✅ **401 报告已闭环**：`/api/mc-spec/report/<id>/<stamp>` 无 `raw=1`→401，带→200。生产 guard 有 `raw === '1'` 放行；生产前端 chunk 逐字含 `window.open(\`${a}${s}raw=1\`)`。修在 `McSpecCheckButton.vue#openReport`（`a82f785` 10-09，已上线）。再遇 401 = 缓存旧包／手开缺参。
- 🚧 本地已提交未部署 ~30+ commit（落后生产）：刀32 系 `0013ba8`→`b52346d`；刀33/33b；G-5 `c4298a6`／I-3 `9234c86`／I-1/2 `33942ef`／H `8cf367a`；R2/R1/R3 `d057805`→`47657ca`→`e2c8ecc`；R6 `1b870fc`；R4b-A+R6-B1 `16ec079`+`2c95738`；R6-2 `fe80049`；Figma 多 Token `d0b07e8`；R8-3 `eb68508`。✅ 本地 :13030 已于 11-02 23:26 重启（pid=66607，build-stamp git=`396f7c2`，护栏✅与源码一致）⇒ 样式评分双治本已上线；`396f7c2`+工作区并行 WIP 一并在内存中。✅ **存量 styleScore 已于 11-02 23:31 离线批量重算**：544 目录（A 341 + B `temp-components/<hash>/<task>` **两层** 203）→ 跳 12 死目录 → **532 成功/0 失败**，变化 512（升 11/降 81），旧值→null 0，null→有值 420；备份 `/tmp/meta-backup-20261102-233039.tgz`；「降 81」= 9-18 老一代 scorer 重标定（A/B 实证 206 升 0 降）。主仓指针落后子仓。
- 🆕 R8 系列（50d7793f/3a7d3fb3 评审定案）：R8-3 畸形属性名拼接自愈 `eb68508` ✅、R8-2 透明容器臆造背景修复化 `2091b9e` ✅（TRANSPARENT-CONTAINER-BG WARN-only→确定性剥 background，border/radius 挂观测）、R8-1 幻觉段整段收敛 `fe5123b` ✅（healDuplicateTextIssues 双判据 sourceNodeIds 空+剥后空壳 ⇒ index.vue 挂载/import/组件文件三处移除；保护档=真锚段空壳 emptyShellSections 计数）；**待做：重启验收 + R8-4 主题槽位取证**（theme_2 全深值+`@color-card-bg` 白底矛盾=白底白字；需 `dualTruth.themes` 对照）。50d7793f 另有 ListSection 4 列 grid 挤压值截断（LLM 布局 bug）未立项。
- ⚙️ 本地 `:13030`／`:2610`／`:8080`；Mongo `brew services start mongodb-community`。

## 硬约束
- 🔴 **不得自行部署**（:13030/:2610 重启、同步生产、`git push`）⇒等指令；交付必说「已改完，未部署」。
- 🔴 治本非产物直改 + 可辩驳判据 + 阳性对照；判据同构单一来源；文本命名无关（只认 `type` TEXT/CHARACTER；角色唯一来源 `splitTitleValueByStyle`）。

## 关键契约
- 🔴🔴 E1 骨架=Figma 树待改 vision（`subcomponent-planner.js:2113-2138`）；用户拍板 **结构骨架=vision／精确尺寸=Figma**。`e1Derived` 4 处 ⇒ vision 下 `refineDerivedContainerLayout` 失效；`:2473-2500` 兜底可升主路径。
- ✅ 刀33 第1步：锚点单一来源 `sectionAnchorCandidates/sectionAnchorKey`（**不做形态校验**，否则合成 id 变空键 fail-closed）+planner 三处 Map `:2145/2161/2485`；`decideCollapsedShape` 复用 `decideLayoutForBoxes`。
- 🔴 `repeated-section-collapser.js:449` 全库唯一赋 type 处；`section-tree.js:1545` 据 `CardGrid`/`ListSection` ⇒ 合并列表项必撞 6 项悬崖。
- 🔴 刀53 家族序 `grid→header→statrow→table→text→icon→legend→kvgrid`；新 kind 须登记 `FG_TAKEOVER_CLASS_RX`+计数分支；vue3 映射唯一 `matchFgTakeoverTargets`。
- 🔴🔴 刀53d/e：资源变量绝不拼进静态 style/JSON；CODE-028 补 CODE-022。
- 🔴🔴 几何/真值判据必挂真机日志计数行（塞入参=假绿）；改的人=验的人同正则=假绿；方案文档判据只当假设。
- 🔴 **quality-score-v1 已修 2 / 待修 1**：①内联 style 补扫（`396f7c2`）②`scoreResourceMount` 改 `targetDomSelector`+`ownerSectionId`+shared alias 回退（`396f7c2`）③**未修**：`extractActualResourceMounts`(`:706`) 非贪婪 `/<template[^>]*>([\s\S]*?)<\/template>/` 遇嵌套 `<template #slot>`（产物 `<base-panel><template #header-right>` 常态）**在第一个内层闭合处截断**，根级 section 全丢（实测 5015→98 字符）⇒ 118/544 目录受影响、59 个可完整恢复；次要：合并列表段 id 带 `-list` 后缀与精确匹配失配（25 目录）。修法=depth 配平扫描 + 后缀容错。
- 🔴 字号守卫覆盖双形态（`ai-engine/utils/font-size-guard.js`）：`calc(@fontSize*X)` + 裸 px（Lite vue3 不归一）。`5<px<10.5`→提 10.5，≤5 豁免。日志 `hits/calc/rawpx/rawUnderMin`（恒 0）。
- 🔴 守卫群单一事实源 = `docs/2026-11-02-写盘前pass执行顺序总纲.md`（新增守卫必须登记）。
- 🔴 刀8/9–32、T4、令牌化、A1-A2、方向判据、LESS、透传三铁律、`:deep()`、`writeFiles`、R24、`getFigmaBox`、R19 ⇒ **P-DETAIL**。

## 环境
- 根 `/Users/smigoo/工作/mvgo`。node 版本先 `ls ~/.workbuddy/binaries/node/versions/`。
- 🔴 npm/node/jest 一律 `env -i`；jest `--runInBand --forceExit`、`--testPathPatterns`（复数）、`--config package.json`。
- 🔴 Bash cwd 不持久⇒绝对路径／`git -C`／`npm --prefix`。
- 🔴 生产 pm2 日志 `/root/.pm2/logs/backend-node-{out,error}.log`；离线重放 `.checkpoint/`。
- 🔴 ECS `root@47.98.216.206:65522`（无 `sshpass`⇒`/usr/bin/expect`；长命令 base64 传）。

## 陷阱
- 基线恒 **21 套件/36 用例**环境失败；两态 FAIL diff 须空且先 `wc -l`。
- 🔴 jest 全量 `FAIL` 行出现两次⇒`sed -E 's#^FAIL +##; s#^src/##' | sort -u`。
- 🔴🔴 「本地跑一次」前必核进程启动时间 vs dist mtime。
- 🔴 BSD grep 多模式必 `-E`；`sed -i ''`；commit -m 禁 `$(...)`；heredoc `${}` 展开⇒用 Write。
- 🔴🔴 git daily auto-sync 会拆改工作区⇒A/B 基线用刀前 commit id（禁 `git show HEAD:`）；两态回归前后 src 全量 `md5 -r` diff。
- 🔴🔴 worktree 三假象：无 `dist/`⇒假失败；无未跟踪样本⇒静默 skip；`ln -sfn` 塞已存在目录⇒逐项 `ln -s`。
- 🔴 `parseLessVars` 要变量独占一行；`normalizeCssColor` 对渐变/url 返 null；`container-background-truth#collectClassProp` 为刀32/37/panel-chrome 三方共用。
