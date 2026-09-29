# mvgo 项目速查

> 只留**跨会话复用的不变式与复发模式**；细节/取证见 `.workbuddy/memory/YYYY-MM-DD.md`；管线排障**优先用对应 Skill**（`mvgo-*-triage` 系列），本文件不重复其细节。

## 环境 / 构建 / 运维
- 根 `/Users/smigoo/工作/mvgo`；`backend-node`(NestJS :13030)、`frontend`(Vite :2610)、`docs`；Java :8080。
- 跑 node/npm **必须** `env -i PATH="/Users/smigoo/.workbuddy/binaries/node/versions/22.22.2-3/bin:/usr/local/bin:/usr/bin:/bin" HOME="/Users/smigoo" ...`（避 NODE_OPTIONS shim / 代理卡死）。前端构建用 `build:safe`（`emptyOutDir false` 防 safe-delete 钩子触发批量确认）。
- 后端重启：`lsof -ti:13030 -sTCP:LISTEN` → kill → 确认释放 → 仓库根 `start-node.js` 启动 → `pgrep -f "node.*dist/main.js"` = 1。⚠️ `start-node.js` P1-3 守护已死（Node22 下 `node-fetch` 必抛被吞），**重启前须自己确认无进行中任务**。改 `.ts` 就 build、改 `.js` 就 cp（nest-cli assets 拷贝 `**/*.js`）。
- **`start-node.js` 的 R3-B 版本护栏是假警报源（2026-09-29 实测）**：它比对的是 **`dist/main.js` 的 mtime** vs src 最新 mtime，而 `nest build` 只在 `.ts` 变化时重写 `main.js`；**只改 `.js`（走 nest-cli assets 拷贝）时必然报「dist 落后于源码 ⚠️ STALE」**。判「新代码是否真的生效」**不能信该护栏**，应直接 grep `dist/` 里被删/被改的符号（本次：`mountUnusedResourceIcons`/`autoFixRedundantFlex` 计数 = 0 即已生效）。
- **不设** `FIELD_ENCRYPTION_KEY`（永久破坏加密字段）；AI 凭证 `backend-node/data/ai-config.json`。杀端口 `lsof -ti:PORT -sTCP:LISTEN`。
- 生产 Nginx：`location /api` 默认转 Java 8080；属 13030 的 `/api/*` 须逐个写在 `/api` **之前**（漏配 502）；`/api/auth/*` 归 Java。
- 工作台路由 `/workbench/*` 走 `App.vue` 独立分支（`isWorkbenchPage`），**不渲染全局 `<WorkflowMonitor>`**（全局 FAB 仅挂传统 `app-layout` 分支）。需在工作台页内自行挂 `<WorkflowMonitor />`（自包含、轮询全局任务接口，可直接复用）。

## 不变式（治本，非产物直改）
- 确定性事实单一事实源；视觉确定内容由 pipeline facts/assembler 装配，**不能直改生成产物**。
- 删减法：每接管一个事实就删/收缩对应 fallback 与纠偏器，门禁总量只降不升。
- 「真值集」非最高权威：凡有不可辩驳的几何/结构特征（饼图 `radius/center/roseType`、布局 `layoutMode`）须优先于真值集/自动判定。
- 无事实最坏；预览事实源优先级 `last-good > candidate > partial > workspace`（直改 workspace 对刷新预览无效，回看加 `?snapshot=0`）。
- 产物两份副本：`backend-node/workspace/custom-components/<id>/` 与 `frontend/workspace/custom-components/<id>/` ⇒ 产物级改动须同步两份并 diff。
- 宿主插槽契约：一个槽名只能出现一次（`base-panel` 固定 4 槽名）；插槽名不可加编号/hash（否则 Vue 静默丢弃）。
- 资源挂载唯一答案 = `mapping.ownerSectionId` ⨯ 产物 `data-section-id="<ownerSectionId>"` 元素，有命中必须恒取、不得进语义评分。

## 布局事实层（详见 Skill：mvgo-layout-grid-undefined-triage / mvgo-internal-overflow-triage）
- 几何判据单一源 `section-tree#areBoxesSideBySide`（y 重叠>0.5×较矮 且 x 重叠<0.15×较窄）。
- A 类逐节点方向事实（纯几何无门槛）vs B 类归纳型事实（有门槛）；B 类越权覆盖 A 类 = 布局错误主因；B 类无 grid 概念，`return 'vertical'` 是无事实默认。
- 图表容器 min-height 三载体（`.vue` style / `.less` / inline style）须齐剥；`echarts 容器==组件根` 是结构性病灶 ⇒ 插内层 wrapper 拆开。

## 命名 / 目录契约
- `componentId` = `c-<语义段>-<sessionId 尾 8hex>`；收敛单点 `sanitizeComponentId`。
- `componentName` 不可信；任务号污染判据 `/\d{13}/`。temp 目录名单一源 `resolveTaskFolderName`，恒以 sessionId 开头（断点恢复依赖）。

## 复发模式（治本，详见对应 Skill）
- 按标签名/类名匹配必须带词边界 `<${name}(?=[\s/>])`（否则 `ChartChart2`/`CardGrid13` 误伤）。
- 静默吞异常 = P0；自愈器与门禁方向相反 ⇒ 无限振荡+重试耗尽；门禁在确定性后处理之前取内容/读磁盘 ⇒ 永久性冲突。
- 「收敛/自愈 N 处」≠ 生效≠好事：数日志「自愈」与紧随「回退」条数，1:1 即全废；先看门禁是否真减少。
- **「属性消失」= 多 pass 拉锯 + 按文件整批覆写回退**（09-29 实锤）：`display` 写入口 ≥5（LLM/Fix1/2.11/语义分流/FLEX-002）互相补删，单点修不根治；「覆写后语义校验命中，回退覆写前版本」（`microcode-engineer.js:7554-7575`）按文件整批回退 ⇒ 合法修复陪葬。根治 = 写入口收敛 + 删「WARN 门禁的自动删除器」（如 `autoFixRedundantFlex`，门禁只报不删）+ 回退粒度细化。定位手法：候选形态比对 → dist 真实函数离线复现 → 写盘字节数 diff + 日志时间线回放。
- **同类自愈器「被删减法删掉后又以新名字加回」**（09-29）：今天新增的 icon 自愈器 `mountUnusedResourceIcons` 就是 `81e9a08`（09-14）明令删除的 `autoMountUnusedIcons` 复活版，且违背当时确立的三条（**owner 驱动** / **fail-closed** / 候选域正确）⇒ 加回新器前**必须先 git 查它是否被删过**（`git log --oneline -S '<fnName>' -- src`）。
- **`healVueEmbeddedStyleBraces` 只增不减**（补括号+补分号，`code-healer.js:1362`）⇒ 可排除「它是属性删除者」，但其**反复触发**= 上游持续产出括号/分号不平衡 style 的可信症状。
- **「WARN 判定的自动修复器」= 越权，已三次复发**（2026-09-29 删净）：FLEX-002 的 issue 自身声明 `autoFix:false`，却存在专修它的 `autoFixRedundantFlex`（靠 `!i.autoFix` 过滤反选）——代码内自相矛盾。09-01「R0-7」只删了 phase2 的重复器，09-29 才删净 code-validator 2.8 段 + `mc-component-graph-vue3.js`（后者还 `fs.writeFileSync` **直写盘**，正是 R0-7 注释自己反对的「双写盘分叉点」）。守则：WARN **只报不删**；识别信号 = 修复器 filter 里出现 `!i.autoFix`。
- **判「某函数是否真的进过版本库」用 `git log -S '<fnName>' -- src`**（2026-09-29 实锤）：HEAD `1146049` 提交了 `pre-write-self-healing.js` 的 import + 调用（+110 行），却**漏提交** `resource-import-guard.js` 的函数定义 ⇒ 干净检出后可正常构建、但具名导入恒 `undefined`、被 try/catch 吞成「非阻断告警」= **静默失效**。新增函数必须与被调方**同一提交**。
- **主题重声明（A 批）真口径 = 「门禁报了但没人能消」**（2026-09-29 实锤，**原假设已被证伪**）：我原先假设「`injectThemeVarDeclsForLess` 顶层注入 `@color-text-base: #333333` ⇒ dark 失效」，用真 `less.render` A/B 差分**证伪** —— `.dark { … }` 是**嵌套作用域**，其内 `.theme-dark()` 的同名定义仍胜出，外层重声明**管不到它**。真致命的是：门禁 `detectThemeColorViolations` 判 **BLOCK `THEME-SLOT-LOCAL-OVERRIDE`**（3 处，**全在第 1 行**），而同源互逆的自愈器 `healFileLevelSlotOverrides` 返回 `{changed:false,removed:0}` —— **一条都删不掉** ⇒ BLOCK 无人能消 ⇒ 重试耗尽。根因：`healStyleContent`（`theme-color-guard.js`）逐行判 `/<style\b[^>]*>/`，**一进 `<style>` 行就 `continue`**（既不查该行 depth-0 声明、也不计深度）⇒ 与标签**共行**的声明永远漏删；而注入器恰把声明紧贴标签注入。修法三处：**A-①** `injectThemeVarDeclsForLess` 只注 `.common()` 里值为 `var(--x)` 的跨主题令牌（新增 `extractThemeScopedNames` 削源）、**A-①b** `healStyleContent` 改用与 `extractStyleText` **同源**的 `<style>` 抽取（抽出 `healPlainStyleText` 做 depth-0 删除）、**A-②** `healThemeMixinVarRefs` 对「被 LESS **颜色函数**当实参引用」的槽位豁免（新增 `collectColorFnVars`，并**删刀 16b**，因 `lighten()` 实参必须编译期可求值、`var()` 不可求值）。验收：全语料文件级重声明 **290 → 0**；`removed=0` 的残留产物 **0 个**；行为探针 4 形态（共行/换行/独立 .less 均 `removed=1`、块内不删）全绿。**教训：凡「门禁 BLOCK + 自愈器 0 删除」并存，先查两者是否同源（口径函数是否共用）——不同源即永久性冲突。**
- **echarts「防挤压」min-height 注入会覆盖真值高度**（2026-09-29 实锤，**已修 B-1**）：`CardGrid.vue` 内 `.c-x-chart{height:52px;…min-height:160px}` —— 真值只 52px 被注入成 160px（3 倍）⇒ 该 section(flex:0.163) 内容超高 ⇒ **溢出并与下一段重叠**；同一 selector 还被重复定义两次（`-container` 一处 160 一处 52）。修法（`post-process.js`）：新增 `hasChartTruthHeight`（类体内出现 `height:<正数><单位>` 即视为**已按 Figma 真值定高**）⇒ `injectChartMinHeightIntoClass` 直接跳过；`createChartClassBlockIfAbsent` 补真正的缺失检查（`.cls {` 已存在则**不新建**，否则会重复注入兜底块）。理由：CSS 中 `min-height` 优先于 `height`，硬编码阈值会压过几何事实。全语料影响面：558 注入块 → 45 块有显式 px 高度 → **34 块 `min-height > height`**（2–3×），全在 `c-traffic-monitor` 家族。回归 `post-process.spec.ts` 50/50。
- **资源背景层绝对定位时宿主必须 relative**（2026-09-29 实锤）：`-bg-m` 用 `position:absolute;height:80px` 承载背景图+装饰层，而宿主 `.c-x-card` **无 position 声明** ⇒ 相对更外层定位 ⇒ 背景/装饰被拉伸成横跨整行的大块。可作 pre-write 确定性补全项（「absolute 背景层 ⇒ 宿主补 position:relative」）。**B-2 时序坑（同日定位）**：`healAbsoluteOverlayParents` **本身正确**（实测能补 `position:relative`），但它在 `generateCode`(L3080) 内跑，而 `this.generateCode(...)` 到 `execute` **L6060** 才被调用 ⇒ execute 后段（`ensureFlexDisplayInVueSfc` L6372 / `fixedFiles` 合并 L7473 / `finalTruthFiles` 回退 L7558-7564）重写样式块 ⇒ **补丁丢失**。修法须在**后生成阶段**补跑，改前先全语料审计 `position:absolute` 元素。
- **`resource-dom-mapping.json` 自带几何真值**（`figmaBox`+`parentBox`）⇒ 背景层 `top/left/width/height` 可确定性算出，无需新增事实源。实证 `88:36 bg-[m]`：真值 `1px 31px / 99.5%×70.4%`，产物写成 `top:0;height:80px` ⇒ 上移 31px 压住卡片标题行。
- **🔴 T05 `fixBackgroundImageSize` —— 已于 09-29 删除**（「无条件改写确定性真值」家族，与 `autoFixRedundantFlex` 同族）：正则 `/background-?[Ss]ize:\s*['"]?(\d+)px\s+(\d+)px['"]?/g` **无条件**把 `.vue`/`.less` 的 `Xpx Ypx` 改成 `cover`（自认「治标 Pass 1」），而 `inferBackgroundStyle` **设计上**就给「局部背景层」输出 `${fw}px ${fh}px`+偏移 ⇒ **两子系统方向相反，链尾 T05 必胜** ⇒ 局部背景被撑满宿主。删前全语料取证：506 组件 / 2768 文件 → 命中 **14 处、14/14 全是真值**（`191px 80px`/`130px 9px`）、**B 类 0** ⇒ 100% 有害 0% 收益。5 个调用点全摘除（`post-process.js` 本体+墓碑 / `resource-mounter.js` / `microcode-engineer.js` 方法 / `vue3-engineer.js` / `code-fix-rules.js` 规则+`BUILTIN_RULE_IDS`）。**指纹**：`inferBackgroundSize` 永不产出字面量 `cover` ⇒ 产物里的 `cover` 必来自它。
- **背景「image + 四件套」多写入口 ⇒ 撕裂（09-29 已修，② 归属判据）**：`injectBgStyleBinding` 旧判据 `backgroundBoundToVar` **只按本 varName** 判（换 varName 就再追加一整套）；`resource-mount-plan.js:433` 的「已有 `backgroundImage` 即跳过」又**与 varName 无关**（外来背景**挡住**正确资源）⇒ **谁先谁后都错**（实证卡片根同含 `88:36` 的 `position:1px 31px` 与 `2:3475` 的 `url(bg2)`+`0px 16px`，JS 字面量**后键胜出**）。**治本**：新增导出 `bgBindingOwnership(text,varName) → 'none'|'self'|'other'|'literal'`（+`extractBgImageRef`/`extractBgImageFragment`）；`self`⇒幂等 null、`other`/`literal`⇒**fail-closed null + diagnostics**；`collectMountCandidates` 加 `bgOwner`、`skipBound` 改判 `bgOwner==='none'`。全语料 290 条：`blocked-other 19`（全抢位）/`blocked-literal 0` ⇒ **零功能回归**。
- **🔴 按关键词找挂载宿主必须用 class 片段边界，裸 `includes` 有两族劫持**（09-29 实锤，① 已修）：单字符 `mountTarget='t'`（Figma 卡片内标题行图层名就叫 `t`）⇒ `"c-traffic-monitor-card".includes('t')` ⇒ **标题背景挂到卡片根**；去复数裸子串 `cons`→`'con'` ⇒ `"c-device-monitor-active-icon".includes('con')`（i**con**）⇒ **挂到图标上**。正确口径 = token 四式（`===`/`startsWith(kw+'-')`/`endsWith('-'+kw)`/`includes('-'+kw+'-')`），**且必须解析 `:class`**（激活态类名只在表达式里）+ **片段化保留 CJK**（`\u4e00-\u9fa5`；图层子层名 `点背景`/`默认`/`激活`）。同下「词边界」铁律。
- **锚点标签正则含嵌套量词 = ReDoS**（09-29 实锤）：`(?:"[^"]*"|'[^']*'|[^>])*?` 这类 `(?:A|B|C)*?` 在全语料遍历时被 OOM/Kill（SIGTERM）⇒ 改**线性扫描** `findTagBySectionAnchor(content, anchor)`（`indexOf` 引号形态 → `lastIndexOf('<')` → 校验标签名起始&中间无 `>` → 向后扫描跳过引号内 `>`），**导出**供审计复用。
- **`ownerSectionId` 不总是真 section ⇒ 禁止「锚点缺失即 fail-closed」**（09-29 实锤）：`c-device-monitor-21518cf1` 的 `ownerSectionId=2:8438` 是 **tab 项内层 GROUP**，产物无该锚点；全语料锚点缺失 **203 条**，其中关键词路径 `keyword-hit 203 / keyword-miss 0` ⇒ 缺陷是「**命中错**」而非「命中不到」。故 ① 只做「词边界 + ② 归属 fail-closed」。
- **资源「宿主缺失」fail-closed 的适用范围**（09-29）：装配器扁平化中间容器层（卡片标题行 `2:3474 t` ⇒ 产物无该 `data-section-id`）⇒ 宿主永不命中 ⇒ 退化挂祖先抢位。09-21 只覆盖 `bgRole==='container'`，**`sub-state` 仍会退化** ⇒ 待补齐（但**不得**扩成「锚点缺失即拒挂」）。
- **`injectResourceImports` 削源的真口径**：默认模式只注入「剥注释后代码里真实出现」的变量 ⇒ 与 `isResourceVarMounted`/门禁同源、**无空转**。「无引用也补」只有两条：`forceAll`（**已于 09-29 删除**，全仓零调用者）与 `contractMapping`（唯一调用者 `props-wiring-guard#ensureParentImport` 的外层 `autoWireSubComponentProps` 于 2026-09-11 整块移除 ⇒ 生产不可达，其 spec 成**孤儿测试**，待决策）。
- 评分制有能力推翻确定性事实 = 最坏形态；失败后也用 resolve 返回 ⇒ 复用须显式校验成功标记。
- 同名 class 可能两生产者 ⇒ 属性序=生产者指纹，判归属不能只看 class 名。
- **加「出口净化器」必须枚举全部出口，别只修被报错点名的那条**（09-29 实锤）：`__parent` 反链（生成期 `microcode-engineer.js:5578` 注入，供几何判定）与 `children` 成环 ⇒ `JSON.stringify` 抛 `Converting circular structure to JSON`。已有三道防护（`tasks.service.ts#stripParentRefs` 用于 `getTaskStatus`/`getTaskById`/列表、`progress.service.ts#sendComplete` 用 `redactSecrets`、`redact.ts` 的 `'[Circular]'` 占位）**唯独漏 `progress.service.ts:99-106` 的 SSE 重连分支**（直接 `{type:'complete', ...existingTask.result}`）⇒ 18 次 WARN、重连客户端拿不到 complete。出口全集 = REST 列表 + REST 详情 + **SSE 首连** + **SSE 重连** + 落库 + 日志。治本单点 = 在 `sendEvent` 内做循环安全序列化兜底，而非逐出口补剥离。

## 诊断手法
- header 槽重名：`Duplicate slot names found.` 的 N 条 error ⇒ N+1 个同名槽，行号=第 2..N+1 槽起始行（`dist/.../sfc-syntax-validation.js#findDuplicateSlotNames`）。
- 判是否引入类型错：本仓 `tsc --noEmit` 208 条既有错全在 `*.spec.ts`；看「非 spec + 本次改文件」有无错。
- Jest：cwd=backend-node，`NODE_OPTIONS="--max-old-space-size=1536" npx jest <spec> --runInBand --forceExit`。
- 进程假死：`sample <pid> 3`；卡死不响应 SIGTERM ⇒ `kill -9`。判装载新代码 = 运行时源 mtime vs `dist/main.js` mtime。
- 写盘门禁跳过 ⇒ 坏版本在 F3 候选快照 `partial`（非磁盘）；离线复现须连 `lessGlobalVars` 复原。
- 管线排障（资源挂载/图表/LESS/快照/undefined/视觉/重试耗尽）**优先调对应 Skill**，本文件不复述细节。

## 本机 shell 陷阱
- 见用户级 MEMORY：BSD `grep` 用 `-E`；`--include` 会静默排除 `.js`；`sed -i ''`；heredoc `${}` 被展开 ⇒ 用 Write 写脚本。

## 质量评分面板 / 图片取源契约
- **「设计图（Figma）」= `resources/images/mc-preview.png`**（真值图，微码另有 `package/resources/images/` 兼容路径）；**「产物预览」= `.mc-gen/screenshots/<taskId>-rendered.png`**（产物渲染截图）。后端 `quality-score-v1.js` 分别产出 `quality.designImages` / `quality.screenshots`，前端 `QualityScoreAdminButton.vue` 两个框各取其一。
- **`/api/component/:id/preview` 端点不存在**（预览是 Vue 路由页 `/preview/:componentId`，非图片）⇒ `<img>` 直指它必破图。取图一律走 `/api/component/:id/file?path=<rel>&raw=1`，该端点**已允许 dotfiles**（可读 `.mc-gen/screenshots/`）。
- 评分抽屉是**深色固定主题**（`body-style` 写死 `#0f1722`），次要文字用 `#a3b8cb`/`#c5d5e5`（原 `#7f93a8`/`#9fb3c8` 观感偏灰）。
