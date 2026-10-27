# mvgo 速查（2026-10-26f｜详判据 `PIPELINE-DETAIL.md`｜历史归档 `MEMORY-full-archive-*`｜排障走 `mvgo-*-triage` Skill｜事件细节 `YYYY-MM-DD.md`）

> 只放**一定会踩的**索引行；带文件/行号/判据细节一律去 `PIPELINE-DETAIL.md`。
> 🆕 **当前状态（2026-10-26 16:46）**：**生产已部署到 `37d0983`**（用户「开工」放行第 3 步）。`go.microvideo.cn:13030` 热更完成：`pm2 reload` → 新 PID **11504**（旧 450438），build-stamp `37d0983`，回滚锚 `dist.bak.37d0983-20261026-164559`；验收全绿（`/api` 200 / `/api/tasks` 401 / 单进程无僵尸 / EADDRINUSE 0 / 模块加载致命错误 0）。**线上由此从 `69a54aa`（落后 17 天）跃到 `37d0983`**，ab7bb76c 四病灶 + A 批（层 4/5/7 `c91224e`）+ B 批（层 1/2 `37d0983`）全部生效。主仓指针 `b0f6adf0`（`04524b38 → 37d09836`）**仅本地** —— 主仓唯一远端 github 是日同步镜像、与本地已分叉非 ff，**未推**。**下一步 = 真机计数行核验**（需跑一次组件生成），HANDOFF 见 `HANDOFF-组件生成管线-2026-10-26.md`。🔴 **2026-10-26 17:30 核验受阻**：三任务打在**本地陈旧进程**（PID 39290 起于 11:02 < dist 重建 15:51）⇒ 新计数行恒 0；生产零生成（`out.log` 179316 行与基线逐字节相同）。**需二选一放行**：(a) 重启本地 `:13030` 后本地跑；(b) 生产触发（已是 `37d0983`）。四套新 spec 82 例已全绿（证明计数行会发）。
> 🆕 **当前状态（2026-10-26 17:51）**：**真机计数行核验已完成**（用户放行重启本地 `:13030`）。`kill 39290` → `start-node.js` 起新 PID **62623**（`✅ 与源码一致` `git=37d0983`）→ 代跑生成 `**mc-1793008064107-07542a2f**`（`nodeId 36:1693`，191.7s，`completed`，产物 `c-device-07542a2f`）⇒ **四条计数行全部打印**（重启前恒 0）：①`视觉 section 锚点审计` `judged:1/phantomRefs:0/unrepaired:0`；②`vision 文案-锚点对账` `evaluated:29/matched:29/mismatched:0/ratio:100`；③`布局真值守卫` `evaluated:68,71/hits:0/truthBoxes:41`（开关 ON）；④`P1-B 抑制成员` `takeoverLeaves:0/excluded:0`。`text-truth` **归零** ✅；层 7 升级真实命中（`escalated:["LAYOUT-001×2→WARN","RICH-TEXT-001×2→WARN","THEME-SPECIAL-COLOR×2→WARN"]`）。
> 🔴 **同时暴露两处待办**：(a) ③`hits:0` 是**无病灶**非判据失效（`evaluated` 非零 + `skippedReason:null`），**真机阳性命中仍缺**，阳性对照目前只在离线 spec；(b) **`COMP-002 内容归属错装` ×4**（`ContentSection/ContentText/Text2/Text3.vue`）—— L0-B iteration7 `pass=false BLOCK=4` → iteration9 `pass=true BLOCK=0`（自愈重试清掉），但遗留 8 WARN 含 **`TEXT-COVERAGE` 真值 29 条仅覆盖 13 条=45%** + `LAYOUT-001`（`801:3` 设计纵排 vs 产物横排）⇒ 与用户报障二同源；`COMP-002`（产物骨架 vs section 真值）与 `content-anchor`（vision JSON 挂 id）**分工不同，vision 干净≠产物干净**。
> 🔴 **部署包必剔三样**（本次差点随包上线）：`dist/workspace`（本地垃圾，生产真身在 `backend-node/workspace` —— dist 的**兄弟**目录，`src/config/backend-root.ts:42` 恒不读 `dist/workspace`）、`.DS_Store`、`app.controller.spec.*`。打包用 `--exclude='*/.DS_Store' --exclude='.DS_Store' --exclude='dist/workspace' --exclude='dist/app.controller.spec.*'`。

## 硬约束
- 🔴 不得自行部署（重启 :13030/:2610、同步生产、`git push`）→ 等指令；交付必须说「已改完，未部署」。
- 🔴 治本非产物直改；自愈器须可辩驳判据 + 阳性对照；判据同构单一来源。
- 🔴 文本命名无关：只认 `type` TEXT/CHARACTER；角色唯一来源 `splitTitleValueByStyle`（不可辨返 null）。⚠️ `ai-generation-constraints.md:223-235` 明禁生成面板标题栏/文字 ⇒ 与刀 57 取向相反（张力）。

## 环境
- 根 `/Users/smigoo/工作/mvgo`：backend-node(:13030) / frontend(:2610，`build:safe`，堆上限须 4096)。
- 🔴 先 `ls ~/.workbuddy/binaries/node/versions/` 取版本；npm/node 一律 `env -i` 清 env（完整配方见 user-MEMORY；否则 shim 卡死/137）；jest 加 `--runInBand --forceExit`。
- 鉴权 `token` 头；`/api/tasks` 在 `data.tasks`；不设 `FIELD_ENCRYPTION_KEY`；AI 凭证 `data/ai-config.json`；前端 base `/mvgo/`。`nest build` 任一类型错中止整个 emit；判 dist = `grep -E` 新符号。
- 🔴 真机起后端**必须** `node <仓库根>/start-node.js`（`dist/main.js` 静默退出 502）；日志 `server.log`（UTC）。真机 DOM 验证 = `/preview/<componentId>?sessionId=<sid>&groupId=<gid>`（`:2610`）；`.mc-gen/screenshots/*-rendered.png` 不可当验收。
- 🔴 离线重放三坑：① 权威副本 `temp-components/<sessionId>/<taskId>/`；② `figma-node-data.json` 遍历走 **`.document`**；③ plan 真实入参 = `.checkpoint/visual.json.layoutStructure`（`.checkpoint/analysis.json.subComponentPlan` 更硬）。

## 索引（详版一律见 PIPELINE-DETAIL）
- 🔴 基础族判据 / LESS invalid type / sourceType 事故 / 透传自检三铁律 / `:deep()` 死规则 / 装配层挂载点 = `file-writer.js#writeFiles` / R24 破图 / `getFigmaBox` 四元陷阱 / 卡内横竖排几何判定 ⇒ 均见 P-DETAIL 同名小节。
- 🔴🔴 几何/真值判据必须挂真机日志计数行（evaluated/hits/skipped）；离线探针手工塞入参 = 假绿闭环。
- 🔴 刀 53 判定顺序 `grid→header→statrow→table→text→icon→legend(刀 53f)`；statrow/table 按 `parentId` 分组两阶段决策（memberIndex 最小者渲染、其余 `display:none` 空壳）；plan 缺项降级是**有意设计**。
- 🔴🔴 刀 53 家族接管改模板 class 却不维护 stylesheet（孤儿侧已由刀 53h 闭环）；~~P1-B 未做~~ ✅ 已做；~~P2 无刀认领~~ ✅ 刀 53f `detectLegendDotTextLeaf` 已接（末位、互斥结构保证零误伤）。
- ✅ **刀 53f 图例「圆点+短文本」**：`text:hasGraphic` 与 `icon:hasText` 互否的缝。🔴 容器必须严格解析**本叶自身锚点**，禁 `collectAnchorNodes`（合成叶 `sourceNodeIds` 含别人子项 ⇒ 重复渲染）；`readDotTextPair` 是几何唯一来源（自己与兄弟共用）；要求同父 ≥2 组同构（单枚是状态徽标）。🔴 真值子项序是 `[TEXT, ELLIPSE]` ⇒ 禁依赖序。渲染用 **CSS 圆全内联**（scoped style 预览不生效 ⇒ 0×0 事故）。
- ✅ 刀 54 文本门禁 / 刀 55 编造副本 / 刀 56 字面量漂移（**先于 strip**）/ 刀 57 面板标题槽位（挂 ⑮-c）/ A 方案覆盖门禁（①② 只诊断）/ 方案 F 删除形态 ⇒ 详 P-DETAIL「刀 54/55/56/57」。
- 🔴🔴 **方案文档里的判据只能当假设，不许照抄**（f98f7463「列容器同宽 ±2」实测 179/98/98/98 ⇒ 恒零命中假绿）。
- ✅ 刀 53 家族已接 vue3（`b16a2a6`）：🔴 vue3 子组件名 LLM 自由 ⇒ 禁照搬「tag 即文件名」；映射唯一实现 `matchFgTakeoverTargets`；开关 `MVGO_VUE3_NAMING_CONTRACT=0`。
- 🆕 **P1-A `plan-body-child-id-audit.js`**（ab7bb76c）：vision `body.children[].id` 自引用/同父复用 ⇒ 无刀接管。**只诊断**；挂点必须在 E1 **之前**（之后被拍平 ⇒ 假绿）。A1 self-reference + A2 duplicate-sibling；锚点 `figmaAnchorId→figmaNodeId→id`；id 须过 `FIGMA_ID_RE`。
- 🆕 **P0 面板标题段被还原**（ab7bb76c）：`807:3` 含 FRAME ⇒ `headerIsChromeOnly` 判 `chromeOnly=false` ⇒ 逃过 `stripChromeOnly`；`isPanelHeader` 只作用于 vision `rawSections` ⇒ 详 P-DETAIL。

## 第 6 层令牌化（a0f93b25「深色主题和默认 dark 一模一样」；已提交 `bc24a91`，未部署）
- ✅ **RC1 `color-slot-mapper.js`**：`flattenTreeList` 带 alpha、阈值 `0.5`→`0.1`（实测双峰，半透明面板 0.2/0.32/0.35 被旧阈值整批丢）；颜色键 `cssColorKey`（不透明 `#rrggbb` 口径不变、半透明 `rgba()`）贯穿 key/value/`differs`；`applyColorSlotMapping` 改 `COLOR_TOKEN_RX` 令牌化 ⇒ **根治真机 `replacedCount:0`**（旧正则只认 `#hex`，rgba 全线逃逸）。半透明**刻意不给 canonical 通道**（themeSlots 值是 hex，强套会让面板变实心）。
- ✅ **RC2 `file-writer.js`**：`resolveCustomThemeExports(tokens)` 作导出主题名**单一事实源**，`buildCssVarsFile` 与 `buildDeclareJsFile` 共用（body 空即不导出 ⇒ 结构上杜绝「declare import 了/css-vars 没声明」断链）。缺省逐字节等价旧版（lite 两处 `buildMcSkeleton` 不传 styleTokens）。
- 🔴 `meta?.brightness === 'dark' ?? (...)` 的 `??` **不生效**（`===` 恒 boolean）⇒ 无 brightness 自定义主题走 light 语义；**照搬不改**（改了属行为变更）。
- 🔴 **RC1' 未收口**：产物 `.vue` 内联 `style="color:rgba(...)"` 是主导面（9 种全 alpha=1，8 种命中 light 槽位且 theme_2 有深色真值 ⇒ 真值算对、产物零引用）；内联不经 Less ⇒ 写不了 `@color-custom-N` ⇒ 文字色仍不跟随主题。生成者 `folded-grid-section-takeover.js:1191/1192/1255/1368/1392/1419`。上游 `prompt-builder.js:2630` vs `:2883` 两条互斥硬指令。

## 接管后样式失配（cd8938f8；报告 `.workbuddy/reports/2026-10-23-layout-fidelity-cd8938f8.md`）
- ✅ 刀 53h（`8f7acc0`）闭环孤儿侧（只能孤儿判定不能重命名；引用池须排除 `.css`/`.json`）；✅ 契约扩维（`01868d8`）补 `{bg,border,pad}`。两处死分支 + 判定手法 ⇒ 详 P-DETAIL。

## 诊断手法
- 门禁三查（守卫形状全语料量化 / 日志 id 留痕 / 离线探针三态）；0 命中必配阳性对照（打在真正生效那层）；改判据先纯函数 A/B。**改的人和验的人用同一正则 = 假绿闭环**。
- 🔴 判刀具是否命中必须全日志 grep 刀具名；prompt 阴性断言禁用例行通配字面量。
- 🔴 flaky 名单（别算自己引入）：`thinking-escalation`/`build-node-layout-facts-integration`/`manifest-auditor`/`file-writer`/`less-variable-checker`/`quality-score-v1`/`pipeline-regression-0908`/`-0907-l6` ⇒ 详 P-DETAIL。
- 🔴🔴 全量 `env -i` 基线恒有 22 套失败 / 36 例（全环境类）——别当回归。归因：`git stash push -m <tag> -- <全集>` → 基线 → 立即 pop；两态 FAIL 集合 diff 须空。

## B 批通用管线（层 1 结构 SSOT 锚点 / 层 2 内容守恒；已部署 `37d0983`，真机 29/0 已验证）
- ✅ 层 1 `section-anchor-truth.js#auditSectionAnchors`：幻影 ref 分离（`refsInTree`/`missingRefs` ⇒ `stats.phantomRefs`，祖先判定只在 `refsInTree` 上做）+ 修复门槛（`no-lca`/`lca-is-root`/`phantom-refs` ⇒ 落 `unrepaired`，不写坏锚）。`emptyStats` 导出为 `emptyAnchorStats()` 供聚合侧复用。
- ✅ 层 2 `vision-content-anchor-consistency.js`：**形态门禁单一来源** `isDeclaredContentEntry` / `readDeclaredTexts` / `collectDeclaredTexts`（同级条目 `id` 过 `FIGMA_ID_RE` ∧ `CONTENT_TEXT_FIELDS` 至少一非空 ⇒ 才算 vision 声称的可见文案；`CONTENT_TEXT_FIELDS=['text','characters','content']`，刻意不含 `name/title/role/type/layout/description/reason`）。`_extractVisionTexts` 收敛为 `collectDeclaredTexts(parsed)` 薄封装；`collectDeclaredPairs` 复用同一判定。
- 🆕 dist 端到端真机（58de7d47）：层 2b **29 串 / 可疑 0**（旧口径 475/44、键白名单 80/41）；全树口径 vs 仅 sections 口径**集合差 0** ⇒ 取全树（保留 `charts`/`headerSlots`/`elements` 非 section 位置的 OCR 误读检测力）。层 1 `{judged:3, phantomRefs:1, notAncestor:0}`。
- 🔴 诊断分工：`text-truth` = 「文案**读错**了吗」；`content-anchor` = 「文案**挂对 id** 了吗」。真机上 text-truth 应归零，缺陷由 content-anchor 承载。
- 🔴 两守卫计数行 `视觉 section 锚点审计·已评估` / `vision 文案-锚点对账·已评估` 无论命中与否全打；`sectionAnchorAudit` 含 `phantomRefs`/`unrepaired`/`unrepairedDetail`。

## 陷阱
- 🔴🔴 **「本地跑一次验证」前必核 `本地进程启动时间 vs dist mtime`**：Node 只在启动时加载模块 ⇒ 源码改完 + `nest build` 重建 dist 后，**不重启本地 `:13030` 服务跑的还是旧码**。实测三任务打在本机 PID 39290（起于 11:02）而 dist 重建于 15:51 ⇒ A/B 批新计数行**恒 0**，差点误判「判据不生效」。判据：新计数行 0 而**旧守卫照打**（如 R22-d 老 WARN、刀 54/55、P1-A/P1-B）= 进程陈旧，非代码问题。
- 🔴 **生产日志真身 = `/root/.pm2/logs/backend-node-out.log`**；`backend-node/server.log` 在生产只有 355 行（空壳），**别拿它核计数行**。本地才是 `backend-node/server.log`。生产 pm2 `created at`（=`08:45:59.652Z`）可直接当「进程启动时间」用。
- 🔴 BSD grep 多模式用 `-E`（`\|` 静默空）；`sed -i ''`；`git commit -m` 禁 `$(...)`；子仓指针须 `git add <submodule>`；heredoc `${}` 会展开 ⇒ 用 Write。
- 🔴 **幂等守卫做「加固前 vs 加固后」对比前必须剥掉其修复产物**（如 checkpoint 里已被写入的 `figmaAnchorId`），否则复跑 `repaired:0` 会被误读成「修好了」= 假绿。
- 🔴 **多挂载点聚合 stats 必须复用源模块导出的键表**（`emptyAnchorStats()`），不得自拼键列表 —— 源模块扩键时聚合侧静默丢键（曾致 `phantomRefs`/`unrepaired` 在日志中完全不可见）。
- 🔴 主仓 `mvgo` **无 `.gitmodules`**：`backend-node`/`frontend`/`docs` 是被当 **gitlink（mode 160000）** 追踪的嵌套仓 ⇒ `git submodule status` 恒报 `no submodule mapping` / `could not get object info`，**别被误导**；指针推进只能用 `git add <目录>`。推主仓前先 `git fetch`：唯一远端 `github` 是**日同步镜像**且与本地**已分叉**（本地领先 200+ 笔）⇒ 非 ff，**禁 force push**，按惯例只本地提交。
- 🔴 两态差分必先 `wc -l` 确认捕获非空（`2>&1 > f` 顺序错 ⇒ 0 字节 ⇒ diff 假绿）。
- 🔴 生产部署三件套：`COPYFILE_DISABLE=1 tar --no-xattrs` / 回滚锚 `dist.bak.<短sha>-<时间戳>` / 验收 = 新 PID + 晚于 dist mtime + 符号 grep + `api=200`/`tasks=401` + 无僵尸。
- 🔴 `布局真值守卫 hits:0` ≠ 守卫正常：只要 `evaluated` 非零 + `skippedReason:null`，只能证明**接线生效**；**0 命中仍需真机阳性样本**（含 J1/J2/J3 病灶的设计稿），否则与「判据恒不触发」不可区分。
- 🔴 **`COMP-002 内容归属错装` ≠ `content-anchor` 对账**：前者判**产物 .vue 骨架**是否渲染了本 section 的真值文案（`mc-component-graph` L0-B）；后者判 **vision JSON** 的文案是否挂对 id。实测两者可同时「对账干净 + 产物串味」⇒ 别用 `contentAnchorAudit.mismatched:0` 证明产物内容正确。
- 🔴 计数行核验的**唯一可靠基线** = 重启前 `wc -l server.log` 快照 + `sed -n '<BASE+1>,$p'` 窗口；跨组件比对（如「旧 `excluded:3` vs 新 `excluded:0`」）**不构成 A/B**，必须同 nodeId。

## 🆕 ② 根因：文本真值三级衰减 24 → 12 → 1（2026-10-26 侦察，未修）
- 🔴 **T1 配额吃文本**：`roles/subcomponent-planner.js:1417` `plainTextItems` 的 `.slice(0, 12)` 无差别作用于所有 section ⇒ figma 24 个 TEXT 只剩 12 条（后 6 行整段丢）。`elementCount` 仍 24 ⇒ 计划不自洽。同类第二处（首处 `5160a2ec`「全国」修在 `pickTextPriorityLines`）。
- 🔴 **T2 无事实臆造方向**：figma GROUP 无 `layoutMode` ⇒ 无方向真值，但 `deriveChildLayout`（`section-tree.js:2606`）读几何聚类的 `flexDirection=row` ⇒ plan horizontal ⇒ 产物 row，vision 是 vertical ⇒ LAYOUT-001。**`section-tree.js:2627-2632` 断言 LAYOUT-001 是死代码 = 已过时**（真机有留痕）。
- 🔴 **T3 声称拆却没拆**：`shouldSplitInternally=true` + `internalSubcomponents=[]` ⇒ grid 组被写成 stub（只渲 1 条）。
- 🔴 权威副本在 `workspace/custom-components/<componentId>/.checkpoint/`；`temp-components/<sid>/<taskId>/` 会被轮换删除。

## 文本样式（R19）
- 🔴 唯一真值源 `utils/text-runs.js`；判「落位」不判「存在」；严重级 WARN。
