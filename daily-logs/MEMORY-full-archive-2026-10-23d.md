# mvgo 速查（2026-10-22d｜详判据 `PIPELINE-DETAIL.md`（§装配层刀具详判据 10-22 / §装配层详判据 10-21 / §判据索引详版 / §K-L-M-N）｜归档 `MEMORY-full-archive-*`｜排障走 `mvgo-*-triage` Skill｜事件细节 `YYYY-MM-DD.md`）

> 本文件只放**一定会踩的**单行索引；凡有文件/行号/判据细节的，一律去 `PIPELINE-DETAIL.md` 对应小节。

## 硬约束
- 🔴 不得自行部署（重启 :13030/:2610、同步生产、`git push`）→ 等指令；交付必须说「已改完，未部署」。
- 🔴 治本非产物直改；自愈器须可辩驳判据 + 阳性对照；判据同构单一来源（副本 ≥2 份 = 事故温床）。
- 🔴 文本命名无关（契约 09-30）：只认 `type` TEXT/CHARACTER。角色唯一来源 `splitTitleValueByStyle`（不可辨返 null）。

## 环境
- 根 `/Users/smigoo/工作/mvgo`：backend-node(:13030) / frontend(:2610，`build:safe`)。
- 🔴 node 版本号会变，先 `ls ~/.workbuddy/binaries/node/versions/`。跑 npm/node 必须 `env -i PATH="…/<ver>/bin:/usr/local/bin:/usr/bin:/bin" HOME=/Users/smigoo NODE_OPTIONS="--max-old-space-size=2048" <cmd>`（否则 shim 卡死/137）。jest 加 `--runInBand --forceExit`（禁配 `--maxWorkers`）。
- 鉴权 `token` 头（非 Bearer）；`/api/tasks` 在 `data.tasks`；不设 `FIELD_ENCRYPTION_KEY`；AI 凭证 `data/ai-config.json`。
- 生产网关仅 GET/POST；前端 base `/mvgo/` + history。`nest build` 任一类型错中止整个 emit；判 dist = `grep -E` 新符号。
- 🔴 真机起后端**必须** `node <仓库根>/start-node.js`（`node dist/main.js` 会静默退出 502）。日志 `server.log`（追加、UTC）。

## 判据索引（单行；详版见 PIPELINE-DETAIL 对应小节）
- 🔴 两段式铁律：「合并/收敛 → 门禁」两侧必须同一实现。LESS 圆括号三件套；验证须 `less.render` 真编译。file-writer 回退三级：last-good → code-chunks → 兜底模板。
- 🔴 改 prompt/规范前「加载链三查」：生效根 `references/**`；`prompts/agents|references/**` 是死文件。
- 🔴 主题色门禁：`mc-check.cjs` 白名单只读 `css-vars.js` dark；三核心 less#dark 与 js#dark 同写；skill 副本两份同改。审计 `npm run verify:theme-color[:recent]`。
- 🔴 多主题真值在 `dualTruth.themes[].nodeData`；`// 自动添加（语义推断）` = 非真值；`auditSemanticGuessSlots` 挂 `check` 之后。
- 🔴🔴 LESS「Operation on an invalid type」双层同治（e2c61f62，`73420b3`）：**源头** `code-healer#healThemeMixinVarRefs` 透传 `var(--x)` 模板 ⇒ 自指双写；**防线** `theme-color-guard#healBusinessStyleVarsInCss` 惰性 `[^)]+?` 遇嵌套 var 提前截断 ⇒ 吞右括号（`calc(@x) * m);`）。刀 A = `safeMixinVarFallback` 三级取值 + **不认得就 return null 跳过**（fail-open，禁兜默认值）；刀 B = `isNestedVarFallback` 两处入口最先判、整段 `return m`。探针 `verify-calc-e2c61f62.mjs` 16 断言（含 E4「修前形态必须编译失败」阳性对照）⇒ 详 PIPELINE-DETAIL「LESS 编译门禁根治」。
- 🔴🔴 加新入参必查下游每层解构 + 白名单/initialState（漏一层 = 静默丢弃零报错）。`generateCode` 用 `input.x`、`execute` 用裸变量。
- 🔴 透传自检三铁律：区间锚点命中===1 / 每跳阳性对照 / 计数用「含字段行数」。方向类判据判「DOM 真实子项排布」；heal 翻转全部出现点。配额判据收集与裁剪解耦。
- 🔴 E1 只提升容器类型；孤儿段 `name` 才是文案（断言 `text ?? name`）。`:deep()`/`scoped` 在微码全局注入下是死规则 ⇒ 同名 class「后写者胜」= 覆盖不可证 ⇒ 确定性产物类名必须组件内唯一。
- 🔴 R24/刀 41/刀 51/刀 52 唯一有效挂载点 = `file-writer.js#writeFiles`（pre-write 后还有 4 个覆写/回退步骤）；刀 41 须 per-file 循环前整体跑；刀 50/52 几何裁决共用 `resolveStackGeometry`。R24 破图三成因 + 内容守卫 `ownerSectionId` 三判据 + `figmaRoot` 断路教训 ⇒ 详 PIPELINE-DETAIL「R24 / 破图 / 内容守卫」。
- 🔴🔴 几何/真值判据必须挂真机日志计数行（evaluated/hits/skipped），否则零命中与零问题不可区分；离线探针手工塞入参 = 假绿闭环。
- ✅ 装配层刀具：F1 展平 / 刀 37④渐变 / 刀 38 边框 / 刀 39 bg尺寸 / 刀 40 重复声明 / 刀 41 折叠网格 / 刀 42 面板三件套 / 刀 48 嵌套块 / 刀 49 图标槽位 / 刀 50 段内几何 / 刀 51 标题行 / 刀 52 父容器堆叠 / 刀 53 同构段确定性接管 / **53b 纯文本叶 / 53c 纯 icon 叶 / 53d 统计行整行接管（2026-10-23）** ⇒ 详 PIPELINE-DETAIL。
- 🔴🔴 `splitTitleValueByStyle`（section-tree.js）入参形状 = `{text, fontSize, y}`，**不是 Figma 原始节点**；喂错 ⇒ 恒 null ⇒ 判据假性零命中。53d 因此全 MISS 一次。
- 🔴 卡内横竖排/间距一律**几何判定**（x 区间不交叠且 y 区间有交叠 ⇒ 横排；间距按实际序取正向值，禁止两侧公式取 min）。Δy 阈值与 min 取法均已实锤误判。
- 🔴 刀 53d「统计行」按 `parentId` 分组**两阶段决策**：组内 memberIndex 最小者渲染整行，其余 `display:none`。因真值 x 最小成员常不在 plan ⇒ 只认 index===0 会让整行变空。
- ✅ **刀 55 plan 外编造副本（`utils/plan-orphan-guard.js`，2026-10-23）**：组件名 ∉ `assignSectionComponentNames(plan.effectiveSections)` 名集合 ∧ 可见文本集合是某 plan 内组件 Y 的**子集** ∧ Y **唯一** ⇒ 判编造副本；确定性删文件 + 摘 index.vue 标签/import（复用刀 54 的文本抽取器，避免两份实现）。挂 `pre-write-self-healing` ⑳（`planForOrphan = effectiveSections ? {effectiveSections} : null`，无 plan ⇒ fail-open）。
- ✅ **A 方案 plan 层覆盖门禁（`utils/section-plan-coverage.js`，2026-10-23）**：挂 `subcomponent-planner.js` plan 落定处（`applyFlexGrowFallback` 后、`uniqueSectionIds` 前，**双链路同一入口**）。三判据：① 覆盖缺口 / ② 兄弟重叠 **只诊断留痕**；③ 纯文本行段锚点膨胀（合成 id + children 全 TEXT + 锚点含容器 ⇒ 用 children 的 TEXT id 重建 `sourceNodeIds`）**确定性修复**。**①② 不做补建**：v-for 假阳实锤 —— `c-aiot-dpjh-bsjd-4e35965c` 5 张卡 30 条文本「未覆盖」但产物 `ContentSection.vue:34-38` 6 卡数据全在（plan 只锚第 1 张）⇒ 补建 = 给 ~42% 组件凭空加组件 + 双渲染。③ 在 137 组件上**零命中** ⇒ 零回归风险。
- ✅ **刀 53 家族已接 vue3（`b16a2a6`，2026-10-23）**：判据族/渲染器/**终裁出口**与 microcode 同一实现（`_fgTakeoverFiles` 由 `writeFiles` 自动带上，无需改 writer）。🔴 唯一差异 = **vue3 子组件名是 LLM 自由的**（清单从生成后的 index.vue 反解，`vue3-prompt` 里 `requiredSubComps` 是死变量、新 planner 不产出 `items`）⇒ **禁止照搬 microcode 的「tag 即文件名」**（恒零命中 = 假绿）。映射唯一实现 `matchFgTakeoverTargets`（两级：名命中跳 chunk / 产物 `data-section-id` 命中覆写；**主组件 `package/index.vue` 硬护栏**，不猜）。`vue3-prompt` 已下发 `assignSectionComponentNames` 派生的确定性文件名 + 强制 `data-section-id`。🟡 本地 **0 个 vue3 语料** ⇒ 真机验收只看计数行 `byName`/`bySectionId`。**prompt 侧（`b0d4ae4`）**：`vue3-prompt` **只下发接管名**（全量下发实测 avg 7.3 个/组件、仅 33% 与产物命名重合 ⇒ 会改写 LLM 拆分粒度）；**锚点规则与命名解耦**（只要有 `effectiveSections` 就下发）——锚点是资源挂载/内容守卫的公共锚，非刀 53 专属，嵌在命名块会因「本单零接管」丢失（实测 15 组件仅 1 个有接管）。A/B 开关 `MVGO_VUE3_NAMING_CONTRACT=0`；离线评测台 `scripts/ab-vue3-prompt.mjs`（**无模型密钥**⇒真 LLM A/B 不可行；下发名从 A 臂 prompt 文本解析，与实现同一口径）。
- 🔴🔴 覆盖缺口判据两铁律：**只算叶子 section 的覆盖**（算上容器 section 会恒 100% 覆盖 ⇒ 假阴）；**判定在 TEXT 级**（按容器 id 判会假阳：段常锚容器内裸 TEXT，如 `38:3137-tail-text` 的 `sourceNodeIds=['38:3139']`，容器 `38:3137` 从不进覆盖集）。Figma 根节点不算叶子容器。
- 🔴 `collectLeafSections` **只递归 `isLayoutContainerSection` 为真的段**（`isLayoutContainer:true` 或 `layoutSource==='container-rebuild'`）⇒ fixture/构造容器段必须带该标记，否则容器自己被当叶子、子段永不参与。
- 🔴🔴 `getFigmaBox` 形态陷阱（四元齐全，裸 `{width,height}` 判 null）；`resolveSectionFlexSize` 取 sourceNodeIds 并集。
- ✅ **刀 54 硬编码文本门禁（`utils/hardcoded-text-gate.js`，2026-10-23）**：truth = **Figma 全树** TEXT 全集（**不依赖 plan/section 归属** ⇒ 无 id 的编造组件也在网内）；扫产物可见文本字面量（静态文本/展示属性/`ref`/`const`/**v-for 数据源数组**字段值）∉ truth ∪ 白名单 ⇒ 硬编码；heal（唯一编辑距离候选，**禁语义推断**）→ strip → residual；两级「宁漏不误删」阀：`group-majority-untruth`（同字段多数非真值）+ `file-majority-untruth`（整文件多数非真值）。**多位数字不放行**（N1 是诊断型不做改写 ⇒ 臆造数字只能靠本刀拦；仅放行单个数字字符）。挂 `pre-write-self-healing` ⑲（**双链路**，`figmaRoot` ctx 已有 ⇒ 勿加调用方入参）。既有 `do-not-invent`/`section-content-guard` 都不判文本来源；`business-text-rules#isTextAllowedByRules` 判据存在但**零消费者**（死代码）。~~🟡 刀 53 家族只挂 microcode~~ → **已于 `b16a2a6` 接 vue3（见上）**，本条留作教训：盲照搬会假绿。
- 🔴 真机 DOM 验证入口 = `/preview/<componentId>?sessionId=<sid>&groupId=<gid>`（`:2610`）；`.mc-gen/screenshots/*-rendered.png` 是早期快照不可当验收。
- 🔴 **离线重放语料三陷阱**（2026-10-23 f98f7463 验收踩齐）：① 权威副本在 `temp-components/<sessionId>/<taskId>/`，`frontend/workspace/custom-components/` 是**交付副本**（package 可能被修过）⇒ 不可当验收对象；② `figma-node-data.json` 顶层是 `{fileKey,nodeId,cachedAt,document}` ⇒ 遍历 id 必须走 **`.document`**（走顶层会全 ❌ = 假绿）；③ plan 真实入参 = **`.checkpoint/visual.json.layoutStructure`**，不是 `preview-analysis.json`；且 **`.checkpoint/analysis.json.subComponentPlan` 就是真机落盘的 plan**（比 server.log 更硬，可直接与重放逐字对照验可信性）。
- ✅ **方案 F 文本删除形态扩维（`section-content-guard.js`，2026-10-23）**：旧 `removeStaticTextNode` 只认 `>text<` ⇒ 守卫算出 duplicate/borrowed 却零自愈（本单 8+8）。新 `removeTextBinding` 三类：① 静态；② `{{ expr }}` Mustache 整段（三条同时成立：expr 简单标识符/`.`路径 + 根标识符声明值 trim 后恰等于目标文本 + **全文仅出现 2 次**）；③ `removeBorrowedDataRows` 数组整行（行内字符串**全部** ∈ 借用集合才删，部分命中整行跳过，**按行独立**）。🔴 声明行删除正则必须用**标识符 root** 而非目标文本（混用会只删 mustache、留下未使用声明 = 比不删更糟，探针实锤）⇒ 加「声明没删掉就 continue，不许只删一半落地」。🔴 删引用与剪 import **同处完成**：删掉唯一 `ref('…')` 后要剪 `import { ref }`（`pruneUnusedReactiveImport`，**只认 ref/reactive**，判据 = 全文再无 `name(`）。接线：`healDuplicateTextIssues` + `healBorrowedEvidence` 同用一份；borrowed 侧**按文件聚合**文本后整行删（逐条删删不掉 8 行数据）。
- 🔴🔴 **方案文档里的判据只能当假设，不许照抄**：f98f7463 的 C 方案写「列容器**同宽 ±2**」，实测真值 4 列宽 **179/98/98/98**（差 81）⇒ 照抄恒零命中假绿。判据一律先 probe 真值再写。落地版：同高±2 + **同 y±2** + x 严格递增（**允许 ≤2px 咬合**）+ 各列 TEXT 数相同且 ≥3 + **跨列逐行 y 对齐 ±2** + **父的全部直接子项都在同一行带**（`band.length===sibs.length` —— 少了这条，「行数不同的列」被高度过滤后剩下的列仍会被误判成表格，单测实锤）。
- ✅ **刀 53e 列式表格整表接管（`detectTableLeaf`，2026-10-23）**：判定顺序 grid→header→statrow→**table**→text→icon（statrow 每卡 2 TEXT / table 每列 ≥3 TEXT ⇒ 天然互斥）；**两阶段分组同 statrow**（按 parentId，memberIndex 最小者渲染整表，其余 `display:none`）。渲染：column 包行、行内 row 包列，表头行 + `v-for` 数据行；列宽按 **`width/列宽和`** 转百分比（用父宽会因 1px 咬合让总和 >100%）。`FG_TAKEOVER_CLASS_RX` 加 `table` ⇒ 4 个消费者自动生效（单一来源纪律生效，无需改副本）。本单实测：整表 4 列 × 9 行含表头、行高 44、总高 388。🟡 「页脚组件重渲染表格内容」**不在本刀射程**（它在 plan 名集合内 ⇒ 刀 55 不拦、文本是真值 ⇒ 刀 54 不拦）⇒ 只能靠内容守卫「借用文本」自愈（方案 F）。
- ✅ **刀 56 字面量漂移（`hardcoded-text-gate.js#pickSiblingTruthCandidate`，2026-10-23）**：同字段 CJK 真值兄弟 + truth 中**唯一**最小编辑距离缺失真值 ⇒ healHardcodedText **全文**替换字符串字面量（数组值 + `=== 'x'` 判色键一并改，CSS class 名不动）；**先于 strip**（strip 清空值留永假比较键 = 文字颜色双丢）。🔴 三判据补丁：字面量 ∈ truth 不配对（真值「停用」被错配实锤）；heal 循环 `next` 初值须 `null`（content 会把 strip/residual 变死代码）；spec fixture 须让 name 值进 truth（否则撞 file-majority 阀整文件 residual 假阴）。本单实测 disabled→禁用、文本残留 0（剩 2 处全是 CSS class 后缀 `--disabled`，正确保留）。
- ✅ **刀 57 面板标题槽位归属（`panel-chrome-misplacement.js#healPanelTitleSlot`，2026-10-23）**：双标题治本 —— 五判据（`#header-right` 直接内容=单 PascalCase 组件标签 / 组件带 data-section-id / plan 段 `type==='header'` / Figma 子树恰 1 非空 TEXT / 同文件无既有 `#title-left`）⇒ slot 改挂 `#title-left`；挂 pre-write-self-healing ⑮-c。配套 default-panel `header-title` 加 `v-if="!slot['title-left']"` 让位（现有产物 0 个用 ⇒ 零回归）。本单实测 HeaderSection(807:3) 命中。🔴 前端 build:safe 堆上限须 ≥4096（2048 必 OOM，峰值 >2GB）。

## 诊断手法
- 门禁三查（形状量化/日志留痕/离线探针）；0 命中必配阳性对照；改判据先纯函数 A/B。改的人和验的人用同一正则 = 假绿闭环。
- 🔴 判据叠两层后，前层阳性对照会被后层掩盖 ⇒ 加兜底后重造可观察对照。
- 🔴 **prompt 阴性断言禁用例行通配字面量**（如 `package/components/` —— 产物形态段本就写有 ⇒ `not.toContain` 恒失败）；只认**下发块标题串**。A/B 评测台同样必须从 **A 臂 prompt 文本反解**下发名，不得另写一套枚举（两套口径 = 假绿）。
- 🔴 既有 flaky/failed（别算自己引入）：`thinking-escalation` / `build-node-layout-facts-integration` / `manifest-auditor` / `file-writer` 2 例 / `less-variable-checker` 1 例 / `quality-score-v1` 1 例 / `pipeline-regression-0908` P5-1~4 / `-0907-l6` T6b/T6c。归因法：`git stash push -m <tag> -- <全集>` → 基线 → **立即 pop** → `stash list` 必空 + 符号 grep。
- spec 禁 tryRequire 假绿；引 validator/logger 链 ⇒ `jest.mock('../../config/backend-root.js', ..., {virtual:true})`。
- 判生产 dist 一致 = 逐文件 md5 清单 diff（`tr -s ' '` 归一化）。僵尸进程：`ps -eo pid,cmd | grep -E '...' | grep -v grep | wc -l`。

## 陷阱
- BSD grep `-E` 无 `\b`、无 `\|`；`sed -i ''`；`git commit -m` 禁 `$(...)`；heredoc 展开 ⇒ 用 Write。
- 🔴 生产部署三件套：`COPYFILE_DISABLE=1 tar --no-xattrs` / 回滚锚 `dist.bak.<短sha>-<时间戳>`（按 `.build-stamp` 认锚）/ 验收 = 新 PID + 启动晚于 dist mtime + 符号 grep + `api=200`/`tasks=401` + 无僵尸。
- 取图：`resources/images/mc-preview.png`；`.mc-gen/screenshots/<taskId>-rendered.png`；`/api/component/:id/file?path=<rel>&raw=1`。

## 文本样式（R19）
- 🔴 唯一真值源 `utils/text-runs.js`；判「落位」不判「存在」；三坑（浅/深多定义、只取顶层声明、多子组件全错才报）；严重级 WARN。
