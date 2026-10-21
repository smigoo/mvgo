# mvgo 速查（2026-10-21 精简；全量归档 MEMORY-full-archive-2026-10-21b.md / -2026-10-03.md；详判据 PIPELINE-DETAIL.md；排障 mvgo-*-triage Skill；事件细节看 YYYY-MM-DD.md）

## 硬约束
- 🔴 不得自行部署（重启 :13030/:2610、同步生产、`git push`）→ 等指令；交付说「已改完，未部署」。
- 🔴 治本非产物直改；自愈器须可辩驳判据 + 阳性对照。
- 🔴 文本命名无关（契约 09-30）：只认 type TEXT/CHARACTER；命名仅限 bg/icon/img 与 `@` 技术栈。角色唯一来源 `splitTitleValueByStyle`（不可辨返 null）。

## 环境
- 根 `/Users/smigoo/工作/mvgo`：backend-node(:13030) / frontend(:2610, `build:safe`)。
- 🔴 node 版本号会变（-3→-5→-6），先 `ls ~/.workbuddy/binaries/node/versions/` 再拼路径。Bash 沙箱继承的 `NODE_OPTIONS` shim 会卡死 node ⇒ 一律 `env -i PATH=".../22.22.2-6/bin:/usr/local/bin:/usr/bin:/bin" HOME=/Users/smigoo NODE_OPTIONS="--max-old-space-size=2048" <cmd>`（否则 Exit 137 SIGTERM）。jest：`--runInBand --forceExit`（q不与 `--maxWorkers` 同传）。
- 鉴权 `token` 头（非 Bearer）；`/api/tasks` 在 `data.tasks`；不设 FIELD_ENCRYPTION_KEY；AI 凭证 `backend-node/data/ai-config.json`。
- 生产网关仅 GET/POST；前端 base `/mvgo/` + history。`nest build` 任一类型错中止整个 emit；判 dist = grep 新符号（BSD grep 不支持 `\|`，多模式一律 `grep -E`）。
- 🔴 真机起后端**必须 `node /Users/smigoo/工作/mvgo/start-node.js`**（在**仓库根**；L133-136 自补 NODE_ENV/MONGODB_URI/DEV_AUTO_LOGIN 并校验 build-stamp）。直接 `node dist/main.js` 会在 InstanceLoader 后静默退出（502）。日志 `backend-node/server.log`（追加、UTC）。

## 判据索引（改前必读）
- **副本纪律**：同判据 ≥2 份 = 事故温床。已有单一来源：`techStackRequiredPatterns`（element-coverage-validator）、`collectSectionFigmaRefs`（utils/section-anchor-truth.js）。
- **两段式铁律**：「合并/收敛 → 门禁」两侧判据必须**同一实现**，不是同一逻辑各写一份（L477 实锤：合并器 `isBalanced` 只数 `{}` 不数圆括号 ⇒ 放行缺 `)` ⇒ 门禁判死 6 轮全败 ⇒ 兜底模板 15 行覆盖 641 行合格样式）。
- **LESS 圆括号三件套**（`0308dd8`）：`rebalanceOrphanCloseParens` / `healMissingCloseParens`（判据：括号不跨 `;`/`}`）+ `scanStandaloneLessDefects`。验证必须 `less.render` 真编译，别只看 gate 自己 `ok`。块级抽取天然保证 `{}` 平衡 ⇒ L1-a「单块被拒」基本不可达，别硬造阳性对照。
- **file-writer 回退三级**：磁盘 last-good → `.mc-gen/cache/code-chunks` 合格分块 → 兜底模板。
- **改 prompt/规范前「加载链三查」**：① `grep -rn "loadMd(" src/`；② `referenceFiles`/`microcode.json` 的 ref 串；③ `ls dist/**`。生效根 = `backend-node/references/**`（构建整份拷进 `dist/`），引用串 `references/xxx`。`prompts/agents|references/**` 无加载点（死文件）。模式 B 生效版：`references/patterns/css-variable-pattern.md` + `references/specs/style-guide.md`。
- **M4-10/M4-11**：`mc-check.cjs` L794-820 从 `mc-check-config.json:40-49` 取白名单，**只读 `css-vars.js` 的 dark，不读 theme-vars.less、不读 meta ⇒ 判据无法按模式分叉**。三核心真值必须 less#dark 与 js#dark 同写。僵尸规则：`colorTextSecondary/Hover/Active/BgHover` 有白名单但无消费。内置 skill 副本两份同改（`backend-node/skills/` + `aidocs/skills/`）+ `references/checklist.md`。
- **`theme-color-guard.js`**：`.common()` 禁语义色槽名/字面量色值（`value` 以 `var(` 开头豁免）；业务样式禁 `var()`。缺口：`style-tokens.js#renderMicrocodeThemeVarsLess` L871 原样沿用 LLM prior；`less-variable-checker#healCommonColorVars` L465 只清「light+dark 都定义」。
- **多主题色值真值**：透传 `graph(dualTruth)` → `engineer.execute` → **`generateCode` 显式白名单（曾漏 ⇒ 分块 prompt 零副稿色值）** → prompt-builder。真值在 `dualTruth.themes[].nodeData`；`fetchNodeData` 返 **document 本体**（缓存文件才是 `{document}`，须 `raw.document||raw`）。下发 `color-slot-mapper#buildCrossThemeColorFacts` + `formatCrossThemeColorFacts`（禁 `#2b2b2b/#e6e6e6/#333333`）。🔴 `// 自动添加（语义推断）` = 非真值；审计 `auditSemanticGuessSlots` 必须挂在 `LessVariableChecker.check` **之后**。`buildColorSlotMapping` 只处理 common.less hex 字面量。双真值仅微码 Max：`style-tokens#buildStyleTokens(dualTruth)`，fail-closed 在 `graph-phase2#fetchSecondaryFigmaNode`，标记 `// dualTruth: figma-derived`；`fetchNodeData` HTTP 状态在 **`err.figStatus`**；`resolvePrimarySecondary` 的 `firstInput` 恒为第一个框 ⇒ 副稿恒放第二。`npm run check:dual-truth`。
- 🔴🔴 **加新入参必查下游每层解构 + 白名单/initialState**：`runPhase2Generation`/`generateCode` 都是白名单重组，漏一层 ⇒ 静默丢弃零报错（实测 secondaryNode、dualTruth）。
- 🔴 `microcode-engineer`：`generateCode(input)` 用 `input.x`；`execute(params)`（L6149 解构）用裸变量。写错抛 `input is not defined` 被外层 catch 吞。判裸用必须查作用域归属。
- 🔴 **透传自检三铁律**：① 锚点 `[from,to)` + 区间命中 ===1（「锚点±窗口」会盖相邻 ⇒ 删字段仍绿）；② 每跳阳性对照；③ 计数用「含字段行数」。`utils/business-text-rules.js`；`npm run verify:business-text-zero-impact`。
- 🔴 **方向类判据必须判「DOM 真实子项排布」**（LAYOUT-001 只比 section 自身 ⇒ 恒不命中）。`utils/vfor-list-direction-guard.js`：wrapper/item 期望按段角色分叉；嵌套 `data-section-id` 交 LAYOUT-001。自愈 = pre-write-self-healing ④-h 刀 30，ctx 需透传 `layoutStructure`。多份同名 rule 盲区 ⇒ `collectDirectionKinds` 聚合 + heal 翻转全部出现点（含 .vue，`(?!\w-)` 挡变体）。
- 🔴 **配额判据：收集与裁剪解耦**：`collectCap=max(4×quota,48)`，`pickTextPriorityLines`（TEXT 全留、余量给装饰、原序），配额 `max(quota, textCount)`。先问「被砍的是不是只有这条通道能下发」。
- 🔴 **E1 推导只提升容器类型**，容器直接子级裸 TEXT 永不进 section 树（E1 整体替代 vision sections ⇒ 整段消失）；补回 `collectTailOrphanTextKids`。
- 🔴 **Figma 覆盖/去重三条** `figma-coverage-dedupe.js`：锚点展开后代闭包；索引外合成 id（`48:5813-list`）不入闭包；`removed` 跨层聚合。`npm run verify:coverage-dedupe`。
- 🔴 `:deep()`/`::v-deep()` 在微码全局注入下是死规则 ⇒ `less-compile-gate#stripDeepSelectors` 改写 + LESS-WRITE-005。
- 🔴 class 门禁只认 prefixId ⇒ 对 LLM 自造前缀空转；`code-validator#auditTemplateStyleClassCrossRef`（XCLASS-001~004，只报不改）兜底。antd form-item label 用**裸后代选择器**写 color。
- 技术栈接管 #78：`techstack-section-contract.js`（table 契约成功才吸收，fail-open）；`findEntrypointCircularImports`（子组件禁 import 父 index.vue，正解 `$mcComponentBuilder()`）；`style-conflict-detector.js`（只报不改）；`section-content-guard#checkTechStackContractTags`（corpus 级 ElementCoverageValidator 是死代码）。

## 诊断手法
- 门禁三查（形状量化/日志留痕/离线探针）；0 命中必配阳性对照；判定域≠事实落点必查；改判据先纯函数 A/B。**改的人和验的人用同一正则 = 假绿闭环**。
- 🔴 **判据叠两层后，前一层的阳性对照会被后一层掩盖** —— 加兜底后必须重造可观察的对照（R22 实证）。
- 🔴 主题色审计：`npm run verify:theme-color[:recent]`；`.common()` 迁出 `verify:theme-migrate`。判据直接 import 门禁、不写副本。
- 🔴 **既有 flaky/failed**（别算自己引入）：`thinking-escalation.spec`（共用 `/tmp/mvgo-test-data/model-capability-cache.json` + 去抖落盘，新增 spec 改排序就翻骰子）；`manifest-auditor.spec`（fixture 缺）；`less-variable-checker` 1 例、`quality-score-v1` 1 例；`pipeline-regression-0908` P5-1~4、`-0907-l6` T6b/T6c；缺 `backend-root` mock 即崩（file-writer.* / code-parser / json-parser / generation-context-assembler-rowpeers）。**归因：`git stash push -- <paths>` 后单跑对比，再 `stash pop`**。
- spec 禁 tryRequire 假绿；引 validator/logger 链 ⇒ `jest.mock('../../config/backend-root.js', ...)`。
- 判生产 dist 一致 = 逐文件 md5 清单 diff（**必须 `tr -s ' '` 归一化空格**）。
- 僵尸进程别用 `ps | grep -c` ⇒ `ps -eo pid,cmd | grep -E '...' | grep -v grep | wc -l`。

## 陷阱
- BSD grep `-E` 无 `\b`；`sed -i ''`；`git commit -m` 禁 `$(...)`；子仓指针 `git add <submodule>`；heredoc 展开 ⇒ 用 Write。
- 🔴 **生产 Node 部署三件套**（详 mvgo-deploy / mvgo-backend-build-restart skill）：① `COPYFILE_DISABLE=1 tar --no-xattrs -czf`；② 回滚锚 `dist.bak.<短sha>-<时间戳>`，回滚**按 `.build-stamp` 的 git 认锚**；③ 验收 = 新 PID + 启动晚于 dist mtime + 符号 grep + `api=200`/`tasks=401` + 无僵尸 + EADDRINUSE 零新增。expect 里 `[...]` 是 Tcl 命令替换、`$var` 会插值 ⇒ 远端变量用 `{...}`。
- 取图：`resources/images/mc-preview.png`；`.mc-gen/screenshots/<taskId>-rendered.png`；`/api/component/:id/file?path=<rel>&raw=1`。

## 视觉 section / inline-row（R22，2026-10-21 实施 · 未部署）
- 🔴 **根因链**：`ink[]` 幻觉 `section.id`（本例 `38:3258` 实为普通段 `38:3206` 下的 TEXT）⇒ `merged.some(s => s.id === row.id)` 恒不命中 ⇒ 几何块追加 ⇒ `keptSections` 把视觉段当「被覆盖的语义壳」删掉 ⇒ 卡片丢 `layout/role/type/bgPlaceholder`。回归提交 `c40af24`（`keptSections` 只问覆盖率不问「几何行是否信息超集」）。
- **几何块 `buildMemberNode` 信息量远小于视觉段**（只有 id/name/role:'item'/figmaNode/children），对 tab 够用，对结构化卡片必然丢信息。
- **R22 已实施三件**：`sameInlineRowRegion`（同一区域 = 全部根成员被引用 ‖ refs bbox ∪ ∩ row ≥ 80% 单向包含，不做双向）；`keptSections` 三态（纯文本删 / 结构化保留并撤回几何块 `withdrawnGeoIds` / 重复壳剔除）+ 删 `lostStructuralFacts`；`sectionY` 改用子级锚点。
- **R22-d（第 3 步，已完成）**：`utils/section-anchor-truth.js#auditSectionAnchors` —— 判据「锚点必须是自身内容（直接子级引用节点）的祖先」，类型无关；`anchor-not-ancestor` / `anchor-unknown`；修复只写新字段 `figmaAnchorId`（LCA），**绝不改写 `id`/`figmaNodeId`**（`subcomponent-planner:1526/1542/1727`、`microcode-engineer:182`、`code-generator:389` 用它作 key）。`FIGMA_ID_RE` + `collectSectionFigmaRefs` 已收敛为单一来源（merger / vision-anchor-validator 都转出）。
  - 🔴 **为什么 P1-7 `validateVisionAnchors` 拦不住**：它只判「id 在不在树里」。本例 `38:3258` **存在**（是「鲁邦通」TEXT）⇒ 绿灯放行。「存在」≠「可信」，必须另判祖先关系。
  - 🔴 **LCA 只对「几何」可信，不可用于「语义归属」**：实测 `deriveSectionsFromFigmaTree` 可能只产出 1 个根 section，而 LCA 恰为根 ⇒ 接进 `subcomponent-planner` 的 `visionSemantic` key 会把语义灌到组件根（张冠李戴）。故 `sectionY` 继续用 refs bbox 顶部，语义回填 key 保持原样。
- `carriesStructure` 刻意不计 `resourceFile`（否则 header-controls 因资源尾号被剔除会破；图标不构成布局语义）。

## 🔴 E1 会抹平 merger（2026-10-21 确定性重放实锤）
- `subcomponent-planner` 一旦 `deriveSectionsFromFigmaTree` 成功就 **整体替代 vision sections** ⇒ 对 `inline-row-*` / merger 的任何修复，**在 E1 路径上都看不到效果**（实测 A/B：28 vs 29 节点，只差小数级 grow）。判「merger 改得对不对」必须看 **merger 后 / planner 前** 的结构，别拿产物反推。
- `figma-node-layout-facts#buildNodeLayoutFacts` 对 layoutMode=NONE 的节点一律 `source:'geometric-inference'`，判据是 `areBoxesSideBySide` 的两两比例；**子节点只有「整卡背景 VECTOR + icon」时比例 0/1=0 ⇒ 判 column（confidence high）**，而真值可能是 row（icon 左｜文本列右）。⇒ 「内部布局没还原」优先查这里。
- 设计稿常见「无卡片容器」形态：`bg + icon` 作卡片子节点，`label/value` 是**根级兄弟 TEXT** ⇒ 任何下游都无法"还原"卡内布局，只能靠 vision 语义；而 `collectSemantic` **只递归 `s.children`，不递归 `body.children`** ⇒ 卡片级语义（stat-card/layout/bgPlaceholder）**永远进不了 `visionSemantic`**。
- 🔴 **R23（10-21 已实施，未部署）**：`figma-node-layout-facts#decideLayoutForBoxes`（薄包装、零新判据）+ `subcomponent-planner#refineDerivedContainerLayout`（在 `buildEffectiveSection` 容器分支**最前**调用）。判据不变、**只换输入**：用「派生归并后的子节点」复算方向。三道闸：只对 `ctx.e1Derived` 生效 / `layoutMode` 声明事实优先 / 派生 child 集合 === 原生集合时不复算。真机实测两卡 `vertical→horizontal`，`796:3` 正确不动。

## 产物装配层（P0/P1/P2，2026-10-21 实施 · 未部署）
- **P1 双重渲染真因 = 自嵌套**：同一张卡既被拆成「整卡组件」（根 `data-section-id=S`），又与它的子节点一起被拆成同级组件 ⇒ `div[S]` 内又渲染一个根也是 S 的实例。判据只看 id（`刀 36 healSelfNestedCardCollapse`，在 `structural-truth-healers.js`，排在刀 35 之后）；**删除兄弟实例前必须先证「内容被覆盖」**（`collectRenderedSurface` = 模板静态文本 ∪ defineProps 默认值 ∪ hasImg），否则会把当前正常显示的文案删掉（实测卡 2 的「在线设备」）。
- **P2 子项顺序**：`section-tree.js` 里两处会破坏阅读序 —— `mapChildNode` 照抄 Figma `children`（**z-order 非阅读序**）、孤儿文本吸收是 `children.push`（**恒追加末尾**）。统一比较器 `compareReadingOrder`（y → x，缺 bbox 排末尾），吸收后必须重排。
- **P0 空 `<img>`**：`injectResourceImports` 只注入「代码里出现过的变量」，裸 `<img>` 无从注入 ⇒ `resource-img-src-healer#healEmptyImgSrc` 按 `ownerSectionId` / `figmaNodeId` / 派生 id 前缀三口径补 `:src`（候选不唯一不动）。
- **刀 37 容器背景（`container-background-truth.js`）**：真值 = section 直接子级「纯图形 + 面积 ≥60% + 有 fills」；判据 = **色值反查归属**（产物 class 的 background 解析后等于**另一个 section** 的背景真值 ⇒ 借用他人背景）＋ 渐变缺失。命中写 **inline** `background`（不污染 class、幂等）。⚠️ 只补「渐变缺失」不补纯色：纯色面板引用 `@color-border-*`（明暗两套），覆盖成字面量会丢主题；inline 字面量本身也不随 dark 变色。

## 文本样式（R19，2026-10-21 实施 · 未部署）
- 🔴 **唯一真值源 `utils/text-runs.js`**：A 形态（同行多 TEXT 按 y 分行 + x 排序）与 B 形态（单 TEXT per-char）归一为 `Run{text,color,fontSize,fontWeight,nodeId}`。`extractPerCharTextTruth`/`extractNodeLevelColorTruth` 已全委托，勿再写 walker。颜色 = `rgb()/rgba()`。
- 通道：折叠段 `_vforData.lines`（权威，`texts/textStyles` 由 runs 展平保证同长）→ prompt「行内多段铁律」；叶子段走「文本行与逐段样式」。`_vforData` 只在折叠通道产生，`body.items` 通道要现场取真值。
- 🔴 **判「落位」不判「存在」**（RICH-TEXT-001 第一版「色全局零出现」真机 0 命中）。
- 🔴 元素级三坑：`@var` 浅/深多定义 ⇒ 候选集任一命中即放行；只取规则块顶层声明（`&--active`/`:hover` 不算）；同段文本多子组件 ⇒ 全错才报。
- `injectNodeLevelColorTruth` 按 run 边界拆 span；P-11 只服务运行时 `{{ }}` 绑定，两者判定域互斥。
- 严重级：RICH-TEXT 本轮 **WARN**（BLOCK 会触发 L0-B 重试 → 兜底模板覆盖，比色不准更糟）。基线 c-bb8-304bb8d3：`mixed=33/judged=25/mismatch=19/skipUnmapped=8`。
