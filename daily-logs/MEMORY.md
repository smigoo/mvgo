# mvgo 速查（2026-10-03 精简，全量归档 MEMORY-full-archive-2026-10-03.md；详判据 PIPELINE-DETAIL.md；排障 mvgo-*-triage Skill）

## 硬约束
- 🔴 不得自行部署（重启 :13030/:2610、同步生产、`git push`）→ 等指令；交付说「已改完，未部署」。
- 🔴 治本非产物直改；自愈器须可辩驳判据 + 阳性对照。
- 🔴 文本命名无关（契约 09-30）：只认 type TEXT/CHARACTER；命名仅限 bg/icon/img 与 `@` 技术栈。角色唯一来源 `splitTitleValueByStyle`（不可辨返 null）。

## 环境
- 根 `/Users/smigoo/工作/mvgo`：backend-node(:13030) / frontend(:2610, `build:safe`)。
- 🔴 node 版本号会变（-3→-5→**-6**），先 `ls ~/.workbuddy/binaries/node/versions/` 再拼路径；执行用 `bash -c 'cd <abs> || exit 9; export PATH=".../22.22.2-6/bin:/usr/local/bin:/usr/bin:/bin" HOME=/Users/smigoo; cmd'`（Bash 沙箱 NODE_OPTIONS shim 卡死；cwd 每条漂回仓库根）。**长跑脚本（扫全量产物）用 `env -i PATH=... HOME=... NODE_OPTIONS="--max-old-space-size=2048" node x.mjs`，否则 Exit 137 SIGTERM**。jest：`NODE_OPTIONS="--max-old-space-size=1536" npx jest <spec> --runInBand --forceExit`。
- 鉴权 `token` 头（非 Bearer）；`/api/tasks` 在 `data.tasks`；不设 FIELD_ENCRYPTION_KEY；AI 凭证 `backend-node/data/ai-config.json`。
- 生产网关仅 GET/POST；前端 base `/mvgo/` + history。`nest build` 类型错中止整个 emit；判 dist = grep 新符号。

## 判据索引
- `collectSubtreeTexts` 三类真值（文案/样式/几何，无 isTitle）。
- 产物三处同步（workspace×2 + 快照）须 diff，含 `resources/styles/index.css`。
- 资源挂载：`ownerSectionId`⨯`data-section-id` 恒取；幂等护栏 `isResourceRendered`；重复 sid `anchorOwnerRank`。K/L/M/N 详判据 → skill `mvgo-resource-mount-layer-triage`。
- 副本纪律：同判据 ≥2 份=事故温床；`techStackRequiredPatterns` 单一来源（element-coverage-validator，已导出）。
- 🔴 **改 prompt/规范文档前必须做「加载链三查」**（09 日踩坑：改了 12.6KB 的 `src/ai-engine/prompts/references/css-variable-pattern.md`，那是死文件）：① `grep -rn "loadMd(" src/` 看调用前缀；② 看 `referenceFiles`/`microcode.json` 清单里写的 ref 字符串；③ `ls dist/**` 确认构建是否拷贝。生效规范根 = `backend-node/references/**`（`BUILTIN_REFERENCES_ROOT`，构建整份拷进 `dist/references/`），引用串一律 `references/xxx`。`prompts/agents/**` 与 `prompts/references/**` 全目录**无加载点**（先例存根：`prompts/references/preview-analysis-schema.md`，commit 68f3443 教训）。
- 模式 B 主题规范生效版：`references/patterns/css-variable-pattern.md`（style-mapper.js + microcode.json 加载）与 `references/specs/style-guide.md`（microcode-engineer/style-mapper/adversarial-checker/microcode.json 加载）。门禁 `theme-color-guard.js`：`.common()` 禁「语义颜色槽位名或字面量色值」（`isColorVarName(name)||COLOR_LITERAL_RE.test(value)`，**value 以 `var(` 开头豁免**）；业务样式禁 `var()`。生成器缺口：`style-tokens.js#renderMicrocodeThemeVarsLess` L871 的 `.common()` **原样沿用 LLM prior 未过滤**；自愈器 `less-variable-checker#healCommonColorVars` L465 只清「light+dark 都定义」的颜色。
- 🔴 **M4-10/M4-11 判据机制（改主题色判据前必读）**：`mc-check.cjs` L794-820 从 `mc-check-config.json:40-49` 取白名单，**只读 `css-vars.js` 的 `dark` 对象，完全不读 `theme-vars.less`**；不读 meta / 无任务上下文 ⇒ **判据无法「按模式分叉」**。`darkThemeCoreVars=[colorTextBase,colorPrimary,colorPrimaryBg]`（M4-9 只查完整性）、`darkThemeColorRules` 是硬枚举白名单（M4-10 判 error）、`darkThemeOptionalVars` 是另一套（滚动条，M4-11）。⚠️ **放三核心真值必须 `theme-vars.less#dark` 与 `css-vars.js#dark` 两处同写** —— M4-10 看不见 less，只查 js，少一处就「运行时一套、门禁另一套」。内置 skill 副本有两份需同改：`backend-node/skills/` 与 `aidocs/skills/`；文档 `references/checklist.md` + 规范说明表要同步。
- ⚠️ **M4-10 僵尸规则**：`darkThemeColorRules` 里 `colorTextSecondary`/`colorPrimaryHover`/`Active`/`BgHover` **配置有白名单但 M4-10 只遍历 `darkThemeCoreVars`（三核心）⇒ 这 4 个键从无判据消费**。别误以为改它们会被拦。
- 🔴 **双主题 Figma 输入（2026-10-10 D8 已落地，仅微码 Max 档）**：核心事实源 `style-tokens.js#buildStyleTokens(input.dualTruth)`（双真值时两侧均 `figma-extract`、派生算法**完全不执行**）；副稿拉取与 fail-closed 在 `graphs/mc-component-graph-phase2.js#fetchSecondaryFigmaNode`（只 `getNode` 不 `exportImage` 省限流）；纯函数 `utils/dual-truth-figma.js`（角色解析/错误归类/明暗矛盾校验）。**判据分叉靠产物内标记** `// dualTruth: figma-derived`（由 `buildCssVarsFile` 确定性写入，LLM 不可伪造）⇒ 无标记即走铁律 1。一条命令验全部：`npm run check:dual-truth`（根仓）/ `verify:dual-truth`。
  - 🔴 **两个必踩的坑**：① `buildDesignVars` 返回描述符数组 `{key,name,type,value}`，**不能直接展开进槽位对象**，须经 `key→value` 映射；② 设计变量轨必须**按主题分开**（`lightDesign`/`darkDesign`），合并会让深色主题读到浅色稿色值。
  - 🔴 `FigmaConnector.fetchNodeData` 把 HTTP 状态挂在 **`err.figStatus`**（不在 axios 的 `status`/`response.status`），错误消息格式是 `Figma API 错误 (HTTP 403): ...` —— 归类错误必须读它，否则 403/429 全退化成「未知失败」。
  - 🔴 `microcode-engineer.js#generateCode(input)` 通篇用 `input.xxx` 口径，写裸变量恒 undefined（双真值会静默失效）。
  - 🔴🔴 **加新入参必查下游每一层是否显式解构 + 是否进 initialState**：`runPhase2Generation` 用 `const {...}=options` 白名单解构并手工构造 `initialState`，漏一层则字段**静默丢弃、零报错零日志**（2026-10-10 实测 `secondaryNode` 丢失导致副稿永不拉取）。
  - 🔴 `microcode-engineer.js` 有两个易混作用域：`generateCode(input)`（用 `input.xxx`）vs **`execute(params)`（L6149 把 params 解构成局部变量 ⇒ 应用裸变量）**。写错抛 `input is not defined`，被外层 catch 非阻断吞掉 ⇒ 症状是「一体化平台文件生成失败」+ `css-vars.js` 从不落盘。判断裸用对错**必须查作用域归属**，不能只 grep「有没有裸用」。
  - 🔴 真机起后端**必须 `node /Users/smigoo/工作/mvgo/start-node.js`**（⚠️ 在**仓库根**、不在 backend-node/，误用后者路径 MODULE_NOT_FOUND；L133-136 自补 NODE_ENV/MONGODB_URI/DEV_AUTO_LOGIN，启动前自验 build-stamp 与源码一致）；直接 `node dist/main.js` + `env -i` 会在 InstanceLoader 后静默退出（表现为 502）。真实日志在 `backend-node/server.log`（追加式、UTC），重定向到别处会看不到。
  - 🔴 **接跨端字段前必须先读后端消费函数的真实语义**（谁恒定、谁可变），不能按字段名想当然：`resolvePrimarySecondary(firstInput=fileKey/nodeId, secondInput=secondaryNode)` 中 `firstInput` **恒为第一个框**，故 `secondaryNode` 须恒放第二稿；写反会让两稿同源、双真值**静默失效**（2026-10-10 实测）。
  - ⚠️ `frontend` 里 `ReturnType<typeof window.setTimeout>` 与 `ReturnType<typeof setTimeout>` 在 vue-tsc 下**结果不同**（前者 +1 错）。抄邻近代码前先看它是否已在报错区。
  - 🔴 **E1 推导（`deriveSectionsFromFigmaTree`）只提升容器类型**（FRAME/GROUP/INSTANCE/COMPONENT），容器直接子级的**裸 TEXT 永不进 section 树**；又因 E1 **整体替代** vision sections ⇒ 这类文案（footer 汇总行等）**整段消失**（91544b38 footer 实锤）。补回判据见 `collectTailOrphanTextKids`（只补「尾部 + 未被兄弟覆盖 + TEXT 非空」）。
  - 🔴 **做「Figma 覆盖/去重」判据的三条铁律**（`utils/figma-coverage-dedupe.js`，2026-10-15 首版全踩）：① 锚点必须**展开为后代闭包**（items 段只有卡组 id、折叠段只有卡内部 id，不展开零交集）；② **索引外的合成 id（如 `48:5813-list`）绝不能原样计入闭包**，否则子集恒差一个 id；③ **`removed` 必须跨层级聚合**，只统计顶层会静默留痕为空（真机删除发生在嵌套层，`console.error` 插桩才现形）。离线重放验证脚本：`npm run verify:coverage-dedupe`。

- 技术栈接管 #78：`techstack-section-contract.js`；table 契约成功才吸收（fail-open）。
- 10-03 治本三件：① 循环 import 门禁 `findEntrypointCircularImports`（子组件禁 import 父 index.vue，正解 `$mcComponentBuilder()`）；② `style-conflict-detector.js`（字号乘数 calc + 跨文件同名 class）挂 pre-write-self-healing 只报不改；③ `section-content-guard.js#checkTechStackContractTags`（techstack 契约 per-section 断言；全产物 0 个 data-section-id ⇒ fail-open；**corpus 级 ElementCoverageValidator 是死代码勿依赖**；违规进 meta.contentMappingIssues.techStackTagViolations 只留痕）。

## 诊断手法
- 门禁三查（形状量化/日志留痕/离线探针）；0 命中必配阳性对照；判定域≠事实落点必查；改判据先纯函数 A/B（只答有没有用不答该不该判）。
- 🔴 **主题色审计一条命令**：`npm run verify:theme-color`（全量按规则聚合）/ `verify:theme-color:recent`（新鲜度+近 N 天收口率；根仓 `npm run check:theme-color`）。脚本 `backend-node/scripts/audit-theme-color.mjs`，判据直接 import 门禁、不写副本；筛单规则 `--rule ID`，机器可读 `--json`，CI 用 `--strict`。
- 🔴 **`.common()` 颜色迁出离线验证**：`npm run verify:theme-migrate`（根仓 `npm run check:theme-migrate`）。脚本 `backend-node/scripts/verify-theme-common-migrate.mjs` —— A 拿真产物 theme-vars.less 当 prior 重放生成器、B 在 tmp 副本上演练自愈器 `healCommonColorVars`；判据同上门禁；结尾断言真产物 SHA1 未变（变了 exit 2）。`--limit/--all/--dir/--theme`。
- 🔴 **既有 flaky suite 清单**（别误算作自己引入）：`thinking-escalation.spec.ts` 同命令会 2↔3 failed 交替 —— 与另外 4 个 spec 共用 `/tmp/mvgo-test-data/model-capability-cache.json`，且 `model-config.js` 的 `_capPersistTimer` 去抖异步落盘会晚于 spec 的 `beforeEach unlinkSync`；**新增任何 spec 文件都会改 jest 排序从而翻动骰子**。归因方法：把本轮改的逻辑文件显式路径 stash 后单跑对比。
- spec 禁 tryRequire 解构假绿；引 validator/logger 链 ⇒ `jest.mock('../../config/backend-root.js', ..., {virtual:true})`；并行 WIP 用显式路径 checkout 不用 stash。
- 🔴 **判「生产 dist == 本地 dist」最强判据 = 逐文件 md5 清单 diff**（胜过「端口 LISTEN」「main.js mtime」）：远端 `find dist -type f | LC_ALL=C sort | xargs md5sum | LC_ALL=C sort -k2 | tr -s ' ' > /tmp/prod-dist-md5.txt` → scp 回本地与同口径清单 `diff`。**必须 `tr -s ' '` 归一化空格**——`md5sum` 输出双空格、macOS `md5 -r` 单空格，不归一化会让最终哈希对不上而误判「部署没生效」（实测踩过：`23a3ed01…` vs `35def421…`，归一化后两边都是 `35def421…`，1151 文件零差异）。
- 🔴 **进程数判僵尸别用 `ps | grep -c`**：`grep` 会把自身命令行算进去（实测返回 2，实为 1 真进程 + grep 自身）。一律 `ps -eo pid,cmd | grep -E 'node .*dist/main.js' | grep -v grep | wc -l`。

## 陷阱
- BSD grep `-E` 无 `\b`；`sed -i ''`；`git commit -m` 禁 `$(...)`；子仓指针 `git add <submodule>`；heredoc 展开 ⇒ 用 Write。
- 🔴 **生产 Node 部署三件套**（详 mvgo-deploy / mvgo-backend-build-restart skill）：① 打包 `COPYFILE_DISABLE=1 tar --no-xattrs -czf /tmp/dist-node.tar.gz dist`（`--no-xattrs` 必须放选项位）；② 上传/回滚锚命名 `dist.bak.<HEAD短sha>-<时间戳>`，**回滚要用内部 `.build-stamp` 里 git 等于部署前版本的那个锚**（重复部署会产生多个同名锚，按内部 stamp 认、不按目录名认）；③ 验收 = 新 pm2 PID + 启动时间晚于 dist mtime + 符号 grep + `api=200`/`tasks=401` + 无僵尸 + EADDRINUSE 零新增。expect 脚本里 Tcl 的 `[...]` 是命令替换（`puts "[1/2]"` 会报 `invalid command name "1/2"`），`$var` 在双引号内也会被插值 ⇒ 远端 shell 变量一律用 `{...}` 大括号包住、`\r` 留在括号外。
- 取图：设计图 `resources/images/mc-preview.png`；预览 `.mc-gen/screenshots/<taskId>-rendered.png`；`/api/component/:id/file?path=<rel>&raw=1`。
