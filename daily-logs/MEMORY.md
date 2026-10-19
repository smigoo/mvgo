# mvgo 速查（2026-10-19 精简；全量归档 MEMORY-full-archive-2026-10-03.md；详判据 PIPELINE-DETAIL.md；排障 mvgo-*-triage Skill；事件细节看 .workbuddy/memory/YYYY-MM-DD.md）

## 硬约束
- 🔴 不得自行部署（重启 :13030/:2610、同步生产、`git push`）→ 等指令；交付说「已改完，未部署」。
- 🔴 治本非产物直改；自愈器须可辩驳判据 + 阳性对照。
- 🔴 文本命名无关（契约 09-30）：只认 type TEXT/CHARACTER；命名仅限 bg/icon/img 与 `@` 技术栈。角色唯一来源 `splitTitleValueByStyle`（不可辨返 null）。

## 环境
- 根 `/Users/smigoo/工作/mvgo`：backend-node(:13030) / frontend(:2610, `build:safe`)。
- 🔴 node 版本号会变（-3→-5→**-6**），先 `ls ~/.workbuddy/binaries/node/versions/` 再拼路径；执行用 `bash -c 'cd <abs> || exit 9; export PATH=".../22.22.2-6/bin:/usr/local/bin:/usr/bin:/bin" HOME=/Users/smigoo; cmd'`（Bash 沙箱 NODE_OPTIONS shim 卡死；cwd 每条漂回仓库根）。**长跑脚本用 `env -i PATH=... HOME=... NODE_OPTIONS="--max-old-space-size=2048" node x.mjs`，否则 Exit 137 SIGTERM**。jest：`NODE_OPTIONS="--max-old-space-size=1536" npx jest <spec> --runInBand --forceExit`。
- 鉴权 `token` 头（非 Bearer）；`/api/tasks` 在 `data.tasks`；不设 FIELD_ENCRYPTION_KEY；AI 凭证 `backend-node/data/ai-config.json`。
- 生产网关仅 GET/POST；前端 base `/mvgo/` + history。`nest build` 类型错中止整个 emit；判 dist = grep 新符号（🔴 BSD grep 不支持 `\|`，多模式一律 `grep -E`）。
- 🔴 真机起后端**必须 `node /Users/smigoo/工作/mvgo/start-node.js`**（在**仓库根**、不在 backend-node/；L133-136 自补 NODE_ENV/MONGODB_URI/DEV_AUTO_LOGIN，启动前自验 build-stamp）。直接 `node dist/main.js` + `env -i` 会在 InstanceLoader 后静默退出（502）。日志 `backend-node/server.log`（追加式、UTC）。

## 判据索引
- `collectSubtreeTexts` 三类真值（文案/样式/几何，无 isTitle）。
- 产物三处同步（workspace×2 + 快照）须 diff，含 `resources/styles/index.css`。
- 资源挂载：`ownerSectionId`⨯`data-section-id` 恒取；幂等护栏 `isResourceRendered`；重复 sid `anchorOwnerRank`。K/L/M/N 详判据 → skill `mvgo-resource-mount-layer-triage`。
- 副本纪律：同判据 ≥2 份=事故温床；`techStackRequiredPatterns` 单一来源（element-coverage-validator，已导出）。
- 🔴 **改 prompt/规范文档前必须做「加载链三查」**：① `grep -rn "loadMd(" src/` 看调用前缀；② `referenceFiles`/`microcode.json` 清单里的 ref 字符串；③ `ls dist/**` 确认构建拷贝。生效规范根 = `backend-node/references/**`（构建整份拷进 `dist/references/`），引用串一律 `references/xxx`。`prompts/agents/**` 与 `prompts/references/**` **无加载点**（死文件）。模式 B 生效版：`references/patterns/css-variable-pattern.md` + `references/specs/style-guide.md`。
- 🔴 **M4-10/M4-11 判据机制（改主题色判据前必读）**：`mc-check.cjs` L794-820 从 `mc-check-config.json:40-49` 取白名单，**只读 `css-vars.js` 的 `dark`，完全不读 `theme-vars.less`**；不读 meta ⇒ **判据无法按模式分叉**。`darkThemeCoreVars=[colorTextBase,colorPrimary,colorPrimaryBg]`、`darkThemeColorRules`（硬枚举，M4-10 error）、`darkThemeOptionalVars`（滚动条，M4-11）。⚠️ **放三核心真值必须 less#dark 与 js#dark 两处同写**。⚠️ **僵尸规则**：`colorTextSecondary`/`colorPrimaryHover`/`Active`/`BgHover` 有白名单但 M4-10 只遍历三核心 ⇒ **从无判据消费**。内置 skill 副本两份需同改：`backend-node/skills/` + `aidocs/skills/`；文档 `references/checklist.md` 同步。
- 门禁 `theme-color-guard.js`：`.common()` 禁语义颜色槽位名/字面量色值（`value` 以 `var(` 开头豁免）；业务样式禁 `var()`。生成器缺口：`style-tokens.js#renderMicrocodeThemeVarsLess` L871 `.common()` 原样沿用 LLM prior；自愈器 `less-variable-checker#healCommonColorVars` L465 只清「light+dark 都定义」的颜色。
- 🔴 **多主题（N 稿）色值真值（2026-10-19 #127 实锤）**：
  - **透传链**：`graph(state.dualTruth)` → `engineer.execute(params.dualTruth:6518)` → **`this.generateCode({...})` 显式白名单（曾漏 `dualTruth` ⇒ 分块 prompt 零副稿色值）** → prompt-builder。带 nodeData 的逐稿数据在 `state.dualTruth.themes`（`themeNodes` 是用户原始输入、无 nodeData）。`fetchNodeData` 返回 **document 本体**（非 `{document}` 包装；只有 `figma-node-data.json` 缓存才是包装，须 `raw.document||raw` 解包）。
  - 真值下发：`utils/color-slot-mapper.js#buildCrossThemeColorFacts`（树路径对齐「主稿色↔各副稿色」+ 每稿主色板；同色值组合去重、跨稿无差异不入表、单稿⇒null）+ `formatCrossThemeColorFacts`（markdown 硬约束，明令禁止 `#2b2b2b/#e6e6e6/#333333` 中性灰）；`prompt-builder#buildCrossThemeColorBlock` 注入 theme-vars / common.less / legacy dual 三处。
  - 🔴 **`// 自动添加（语义推断）` 注释 = 非真值**（`addMissingVariables` 用 `safeLessVarValue` 按名+明暗猜）⇒ 被 common.less 引用即「深色稿 ≈ 默认 dark」。审计 `auditSemanticGuessSlots`（挂在 `LessVariableChecker.check` **之后**，顺序错了抓不到）。
  - `buildColorSlotMapping`：主通道（主稿 hex 精确命中既有槽位）/ 扩展通道（`@color-custom-N`）/ 兜底（跨稿无差异保留字面量）；**同一主稿色重复出现须复用槽位**（否则同值孤儿槽位刷屏）。只处理 common.less 的 **hex 字面量**——LLM 若用自造槽位名则映射无从下手（靠 prompt 端真值下发治本）。
  - 双真值（2026-10-10 D8，仅微码 Max）：`style-tokens.js#buildStyleTokens(input.dualTruth)`；副稿拉取 fail-closed 在 `graph-phase2#fetchSecondaryFigmaNode`；判据分叉靠产物标记 `// dualTruth: figma-derived`。坑：① `buildDesignVars` 返回描述符数组须 `key→value` 映射；② 设计变量轨必须按主题分开（`lightDesign`/`darkDesign`）。`FigmaConnector.fetchNodeData` 的 HTTP 状态在 **`err.figStatus`**（不在 axios `status`）。`resolvePrimarySecondary` 的 `firstInput` **恒为第一个框** ⇒ `secondaryNode` 须恒放第二稿。一条命令：`npm run check:dual-truth`。
- 🔴🔴 **加新入参必查下游每一层是否显式解构 + 是否进白名单/initialState**：`runPhase2Generation` 与 `generateCode` 都是白名单式重组，漏一层 ⇒ **静默丢弃、零报错零日志**（实测：secondaryNode 丢失、dualTruth 丢失）。
- 🔴 `microcode-engineer.js` 两个易混作用域：`generateCode(input)` 用 `input.xxx`；**`execute(params)`（L6149 解构成局部变量）用裸变量**。写错抛 `input is not defined` 并被外层 catch 非阻断吞掉（症状：「一体化平台文件生成失败」+ `css-vars.js` 从不落盘）。判裸用对错**必须查作用域归属**。
- 🔴 **透传自检三条铁律**（#123/#127）：① 锚点用 `[from,to)` 区间 + 区间内命中行数 ===1（「锚点±窗口」会盖到相邻出现 ⇒ 删字段仍绿）；② 每跳配**阳性对照**（删字段必红）；③ 计数用「含字段行数」非子串数。业务规则引擎 `utils/business-text-rules.js`；零影响判据 `npm run verify:business-text-zero-impact`。
- 🔴 **方向类判据必须判定「DOM 节点的真实子项排布」**，不能只比 section 自身真值（LAYOUT-001 只比根元素 ⇒ 恒不命中）。`utils/vfor-list-direction-guard.js`：wrapper/item 期望按段角色分叉（折叠段 id ⇒ wrapper 期望在段 layout、item 期望在子段；叶子段 id ⇒ 反之；集合段 item 不判）；段内嵌套 `data-section-id` 子容器交 LAYOUT-001。**自愈已启用**：pre-write-self-healing ④-h 刀 30，ctx 需透传 `layoutStructure`（microcode execute 域裸变量；vue3 无真值源 fail-open）。**多份同名规则盲区**：`extractFlexProps` 只取首个 `.cls{}` ⇒ 判据与 heal 打到不同份 ⇒ 复检恒红；治本 `collectDirectionKinds` 聚合全部块（矛盾入 `conflicts`）+ heal 翻转**全部出现点**（含 .vue，`(?!\w-)` 边界挡变体）。
- 🔴 **配额类判据：收集与裁剪必须解耦，类型一等公民优先**：收集闸门 `collectCap=max(4×quota,48)`，输出用 `pickTextPriorityLines`（TEXT 全留、余量给装饰、按原始序），配额 `max(quota, textCount)`。**写配额逻辑先问「被砍的是不是只有这一条通道能下发的真值」**（文本只有本通道；图片/资源另有 injectResourceImports）。
- 🔴 **E1 推导只提升容器类型**，容器直接子级的裸 TEXT 永不进 section 树（且 E1 整体替代 vision sections ⇒ 整段消失）；补回靠 `collectTailOrphanTextKids`。
- 🔴 **Figma 覆盖/去重判据三铁律** `utils/figma-coverage-dedupe.js`：① 锚点展开为后代闭包；② 索引外合成 id（如 `48:5813-list`）不入闭包；③ `removed` 跨层级聚合。验证 `npm run verify:coverage-dedupe`。
- 🔴 **LESS 括号判据要同时数圆括号**（旧三处只数 `{}` ⇒ 孤立 `)` 零命中 ⇒ LessCompileGate BLOCK 重试耗尽）。已补 `rebalanceOrphanCloseParens` + LESS-WRITE-004。
- 🔴 **`:deep()`/`::v-deep()` 在微码全局注入下是死规则**（无 scoped 编译器）⇒ `less-compile-gate#stripDeepSelectors` 确定性改写 + 缺陷 LESS-WRITE-005。
- 🔴 **class 门禁只认 prefixId** ⇒ 对 LLM 自造前缀/antd 接管前缀空转；`code-validator#auditTemplateStyleClassCrossRef`（XCLASS-001~004，前缀无关、只报不改）兜底。antd form-item label 需在 common.less 用**裸后代选择器**写 color（勿用 :deep）。
- 技术栈接管 #78：`techstack-section-contract.js`（table 契约成功才吸收，fail-open）。10-03 治本三件：① `findEntrypointCircularImports`（子组件禁 import 父 index.vue，正解 `$mcComponentBuilder()`）；② `style-conflict-detector.js`（只报不改）；③ `section-content-guard.js#checkTechStackContractTags`（**corpus 级 ElementCoverageValidator 是死代码勿依赖**）。

## 诊断手法
- 门禁三查（形状量化/日志留痕/离线探针）；0 命中必配阳性对照；判定域≠事实落点必查；改判据先纯函数 A/B（只答有没有用不答该不该判）。**改的人和验的人用同一正则/判据 = 假绿闭环**，必须有独立阳性对照。
- 🔴 主题色审计：`npm run verify:theme-color` / `verify:theme-color:recent`（根仓 `check:theme-color`）。`.common()` 迁出验证：`npm run verify:theme-migrate`。判据直接 import 门禁、不写副本。
- 🔴 **既有 flaky/failed suite 清单**（别算作自己引入）：`thinking-escalation.spec.ts`（与其它 4 spec 共用 `/tmp/mvgo-test-data/model-capability-cache.json` + `_capPersistTimer` 去抖落盘，新增 spec 会改排序翻动骰子）；`manifest-auditor.spec.ts`（fixture 缺失批量红）；`less-variable-checker` 1 例、`quality-score-v1` 1 例；若干 suite 缺 `backend-root` mock 加载即崩（file-writer.* / code-parser / json-parser）。**归因方法：把本轮改的逻辑文件显式路径 `git stash push -- <paths>` 后单跑对比，再 `git stash pop`**（实测有效）。
- spec 禁 tryRequire 解构假绿；引 validator/logger 链 ⇒ `jest.mock('../../config/backend-root.js', ..., {virtual:true})`。
- 🔴 判「生产 dist == 本地 dist」最强判据 = 逐文件 md5 清单 diff（**必须 `tr -s ' '` 归一化空格**，否则误判「部署没生效」）。远端：`find dist -type f | LC_ALL=C sort | xargs md5sum | LC_ALL=C sort -k2 | tr -s ' '`。
- 🔴 进程数判僵尸别用 `ps | grep -c`（grep 算自身）⇒ `ps -eo pid,cmd | grep -E '...' | grep -v grep | wc -l`。

## 陷阱
- BSD grep `-E` 无 `\b`、不支持 `\|`；`sed -i ''`；`git commit -m` 禁 `$(...)`；子仓指针 `git add <submodule>`；heredoc 展开 ⇒ 用 Write。
- 🔴 **生产 Node 部署三件套**（详 mvgo-deploy / mvgo-backend-build-restart skill）：① 打包 `COPYFILE_DISABLE=1 tar --no-xattrs -czf /tmp/dist-node.tar.gz dist`；② 上传/回滚锚 `dist.bak.<HEAD短sha>-<时间戳>`，**回滚要按内部 `.build-stamp` 的 git 认锚**（不按目录名）；③ 验收 = 新 pm2 PID + 启动时间晚于 dist mtime + 符号 grep + `api=200`/`tasks=401` + 无僵尸 + EADDRINUSE 零新增。expect 里 Tcl 的 `[...]` 是命令替换、`$var` 双引号内插值 ⇒ 远端 shell 变量用 `{...}` 包住、`\r` 留括号外。
- 取图：设计图 `resources/images/mc-preview.png`；预览 `.mc-gen/screenshots/<taskId>-rendered.png`；`/api/component/:id/file?path=<rel>&raw=1`。
