# mvgo 项目速查

## 环境与构建
- 根目录 `/Users/smigoo/工作/mvgo`；子仓 `backend-node`、`frontend`、`docs`。Node 后端 13030，Java 8080，前端 2610。
- WorkBuddy 中运行 Node/npm 必须清环境：`env -i PATH="/Users/smigoo/.workbuddy/binaries/node/versions/22.22.2-3/bin:/usr/local/bin:/usr/bin:/bin" HOME="/Users/smigoo" ...`，避免 NODE_OPTIONS shim/代理导致构建或启动卡死。
- 后端构建：backend-node 下先 `rm -f tsconfig.build.tsbuildinfo`，再 `npm run build`；启动只能用根目录 `/Users/smigoo/工作/mvgo/start-node.js`。日志 `backend-node/server.log`。
- 杀端口只用 `lsof -ti:PORT -sTCP:LISTEN`，避免误杀客户端连接。重启前查看日志尾部及活动任务。
- 改源码、`.env` 或构建产物后必须重启；构建后用 `node --check` 检查关键 dist JS。API 探活使用 `curl --noproxy '*' http://localhost:13030/api`，不要假设 `/api/health` 存在。
- 不设置 `FIELD_ENCRYPTION_KEY`；AI 凭证在 `backend-node/data/ai-config.json`。本地开发自动登录由 `start-node.js` 注入。
- 生产 Nginx（容器 `nginx`，`/etc/nginx/vhost/gzxj.conf`）里 `location /api` **默认整体转发 Java 8080**（见 `docs/deployment/nginx/mvgo-nginx-frontend.conf:62-70` 注释「统一业务入口：全部进 Java」）。凡属 Node 13030 的 `/api/*`（component、mc-spec、tasks、progress、demo、admin…）**必须逐个写在 `/api` 之前**显式 `proxy_pass http://192.168.112.1:13030/...`；漏配的会被 Java 兜底吃掉 →（Java 未启动时）502。
- **`/api/auth/*` 归 Java 8080，不归 Node**：`backend-node/src/auth/auth.module.ts:29` 已写成 `controllers: [/* AuthController -- 已迁 Java */]`，AuthController 只是保留了源文件与 import，HTTP 路由不注册。实测本地 Node `POST /api/auth/{login,logout,register}`、`GET /api/auth/current` **全部 404**（而 `/api/tasks` 是 401、`/api` 是 200，证明服务正常、仅 auth 不挂载）。所以 `location /api/auth → 192.168.112.1:8080` 是**正确配置**，不要改指 13030。
- Java 部署形态：`/home/mvbt/mvgo/backend-java/` + `deploy-java.sh`（fat jar `mvgo-app-1.0.0-SNAPSHOT.jar`，健康检查 `/api/health`，冷启 30~60s）。必须 `export MONGODB_URI`（与 Node `.env.production` 同值）。`PORTAL_BASE_URL` 默认 `http://192.168.112.1:39680/portlet/api`——**门户 token 校验必须带 `/portlet/api` 前缀**，否则 401。`ADMIN_STATS_KEY` 未注入会让用户管理「使用统计」四格恒为 0（静默降级）。

## 项目原则
- 确定性事实只保留一个事实源；视觉确定内容由 pipeline facts/assembler 装配，不能修改单个生成产物。
- 删减法：每接管一个事实就删除或收缩对应 fallback/纠偏器；门禁总量原则上只能下降。
- 预览事实源：`last-good > candidate > partial > workspace`，workspace 为 `backend-node/workspace`。
- 修改后符号级验证使用 `grep -E`；混合 `.js/.ts` 搜索不要只限定 `*.ts`。

## 已完成
- Mode B 主题编译期差异化已确定为长期标准：业务 LESS 只用 `@color-*` 槽位；`var()` 仅允许在 `theme-vars.less` 的 `.common()` 透传映射；深浅 theme mixin 必须有不同硬编码值；ECharts 使用 `THEME_COLORS[props.theme]`。
- 主题文件级槽位覆盖已加入 `THEME-SLOT-LOCAL-OVERRIDE` 检测与自愈；内存产物和磁盘 common.less/.vue style 均清理；theme guard 回归曾达到 37 passed。
- 高度比例、stat 配对、资源绑定、componentId、LESS 编译及多项结构门禁已有修复，详见每日工作日志。

## 当前未竟
- **#719 主线（类名/装配契约）**：A、B 已完成（2026-09-26），C 待做。
  - ✅ **A 类名契约**：P-09 `injectStateSwitchInteraction` 模板类与样式类共用 `resolveComponentClassPrefix(template)`（① `c-<语义>-slot-con` → ② 全模板 `c-*` 类名按 `-` 段最长公共前缀（剔除落在类名末尾的段）→ ③ null 保持旧行为）。教训：**同一事实两处各自命名 → 后置门禁（CODE-003 前缀 autoFix）只修一侧就必然失配**；确定性注入器自己产出的类名必须自带组件前缀。
  - ✅ **B 装配契约**：新增 `code-generator.js#applyDeterministicIndexTemplate(content, input, options)`（保留 LLM `<script>`、整体替换 `<template>` 为 effectiveSections 骨架、随后 ensure/prune import 对称收口、失败只告警不 fail-closed）；`microcode-engineer#_applyDeterministicIndexTemplate` 在 **medium / simple** 两分支、`_detectSubComponents` 之前调用，透出 `input._indexTemplateFacts`。**教训：确定性装配此前只挂在 `complex` 分支，simple/medium 走 LLM 整文件 → 同类缺陷会按"复杂度分支"分叉复发，新增确定性能力时必须清点全部分支。**
  - ✅ **C 节点→类名映射**（2026-09-26）：新增 `layout-facts-injector#buildLayoutMappingFromSectionIds(files, nodeLayoutFacts)` —— 用**产物自带的 `data-section-id`** 建「真实 class ↔ 节点」映射（与既有 2.6.2 TODO 填充路径同法），在 `code-validator` 2.11 处 merge 为**最高优先级**；按 figma 节点名猜的 `inferredMapping` 保留兜底（子组件内部元素确实按 `kebab(节点名)` 命名且无 data-section-id）。真机对照：旧路径 39 条 key 落空 25 / 新桥 3 条 100% 精确；全语料 26 产物：旧路径 944 条**落空 743（79% 噪声）**、变体命中 38 条中 23 条已被新桥覆盖。⚠️ `LAYOUT_SUFFIX_VARIANTS` **暂不退役**：仍有 15/38 依赖，全是「子组件内部容器」（`.c-x-tabs → .c-x-tabs-section`）无 data-section-id。📌 后续删减法候选：收窄猜名路径为「只保留产物里确实存在的类名」。
- ✅ **资源挂载共享背景的幂等判据**（2026-09-26，`resource-mount-plan.js`）：幂等早退不能按「是否共享背景（`sharedBy>1`）」一刀切（`0c6b03a` 的写法 → 同图同 target 的多条 mount 会**重复挂载**，真机 `8d304bf9` 日志实证 `bg3…挂到 v-for item` 连打 3 次）。正确判据只看**当前位置**：已挂在 v-for item → 早退；变量存在但不在 v-for item（挂根/内层）→ 不早退去迁徙；无 v-for item 可迁 → 不动。
- 📌 **`assignSectionComponentNames` 命名规律**（2026-09-26 反推确认）：`type` 定基名（**无 type → `Content`**，body → `Main`，header → `Header`，tabs → `Tabs`）+ **同基名多 section 时用 `title` 做语义后缀**（active/default → `ContentActive`/`ContentDefault`）。**单卡无同基名兄弟 → 落回 `<Base>Section`**（`MainSection`）→ 资源挂载的 owner 解析会找不到文件（`owner-file-missing`）。真机 plan 派生名与实际文件名一致，链路健康；写夹具时必须复现「无 type + 兄弟」形态，否则测不到目标分支。
- ✅ **LESS 颜色函数参数含 `var()` → 编译期必失败**（2026-09-26，`code-healer.js#healLessColorFnVarArgs` + `file-writer.js` 门禁前置接线）：`fade/lighten/darken…` 是编译期函数，参数写运行期 `var(--slot, #hex)` → LESS 硬报错 → 写盘门禁 retry 仍失败 → **整文件被跳过**（不留 `degradedFiles` 痕迹，比坏文件隔离更隐蔽）。全日志 67 条跳过中 **37 条（55%）** 是此形态。改写：`fn(var(--slot[, #fb])` → 核心槽位（camel→kebab 命中 `color-/font-/radius-/spacing-`）用 `@slot`，否则用 fallback，否则不动。真机真编译对照（less@4.9）原始 ❌ → heal 后 ✅。
- 📌 **两条"下策"路径都要查**（2026-09-26 普查方法）：`P1-4 坏文件隔离降级`（隔离，12 条，全是 `SFC_PARSE`：`Invalid end tag` 11 + 元素级 `missing end tag` 1）与 **`写盘门禁失败（已跳过）`（67 条，量大 5 倍且不留痕）**。查法：解析日志里这两串标记后的 JSON，统计 `diagnostics[].category` 与 `rawErrors[].errors`。隔离侧已由 `stripSurplusBlockClosers` 收口（chunk 全语料 3019 个扫出 15 个 parse 失败 → 修好 7 个，其余 7 个是 index.vue 分块中间态、1 个元素级缺闭合不可机械修）。
- 📌 **`bgRole='container'` + `target∈{active,default}` 走 `container-state-root`**（更早且更强：含 P-08 根布局 + 跨文件误挂清洗）；`standalone-state-static-fallback` 对该输入被**遮蔽**，只有 `bgRole='sub-state'` 才可达。
- ✅ **R5 状态类归一的「样式侧跟随」**（2026-09-26，`class-dialect-normalizer`）：R1/R2 把模板侧裸状态类归一成 `base--mod` 后，样式侧独立选择器 `.base-mod` 也跟随改名（R3 只覆盖 `.base.is-active`）。触发源必须是**模板实际使用的类名**（`c-…--mod` → 旧式近似名 `c-…-mod`），**不能是「本轮 R1/R2 改动」**（归一常发生在更早一轮 → v1 因此静默失效）。两道收窄：`from` 必须 `c-*`（裸别名不跟随）+ `mod` 必须在状态/语义白名单。全语料 460 产物命中 105 条，全落在 `--active/--primary/--success/--danger/--warning` 等。
- ✅ **chart 注入的宿主语义守卫 + chart 多真值豁免**（2026-09-26，`chart-section.js` / `section-tree.js#dedupeDuplicateSections`）：
  ① 注入时若 @echarts 节点已由树中**同 id 且语义为图表**的 section 代表 → 就地替换；宿主非图表语义 → 退回根级追加（全语料：@echarts 分支 68 例撞 id 宿主 100% 是图表容器；chartsTruth 分支 0 例撞 id）。
  ② **⑤ chart 多真值**：`chartsTruth` 分支给 N 条真值同一个 `sourceNodeIds: [c.section]` 且 elementCount 全为 1（平局）→ 规则① **确定性只留 1 条、丢掉其余图表**（离线探针：bar/pie/line → 只剩 bar）。已加豁免：**两条都是 chart 且「图表签名」（chartType|chartSeries 条数|title）不同 → 都保留**；签名相同才是真重复；**chart↔非 chart 维持原行为**（作用域刻意收窄）。真机 459 任务里无实害案例（真机那三条 sourceNodeIds 恰是不同节点）→ 属潜在缺陷，命中即必丢图表。
- ✅ **P-11 计数文本状态色支持数据驱动形态**（2026-09-26，`post-process.js#injectPerCharTextSegments`）：原来只认 `{{ x.count }}`；现补第二条定位路径 —— 从产物**数据字面量**（`value: '(2/484)'`）收集计数属性名 → 替换 `{{ 表达式.<属性名> }}` 为同一套分段渲染 + 同一 helper。**收窄**：字面量必须**就是本次 per-char 真值文本之一**（否则会拿 A 处真值色染 B 处）。全语料：237 可配对产物 / 40 有真值 / 19 命中，抽查全部合法。遗留：P-11 仍是「整文件共用一组三色」，同文件多色系会串色（既有设计）。
- ✅ **坏子组件隔离的「重路」已收口**（2026-09-26 ③ 普查）：隔离 12 条记录全是 `SFC_PARSE`，其中 `Invalid end tag`（多余块闭合标签）11 条已由 `stripSurplusBlockClosers` 覆盖；剩 1 条是**元素级**缺闭合（`HeaderSection.vue:116:23`，列号定位指向行内元素）→ 不可机械修，属"真需重生成"。写盘跳过侧的 37 条已由 `healLessColorFnVarArgs` 覆盖。

## 本项目反复踩中的方法论错误（改管线前必读）
1. **触发源/口径必须用「当前事实」，不能用「本轮改动」**：跨轮次缺陷（如状态类归一发生在更早一轮）用"本轮改了什么"做触发条件 → 规则静默失效（R5 v1 真机 0 命中）。
2. **判据先取证再实现**：凭直觉设计的判据（如给 dedupe 加「节点归属包含」）经全语料验证会**误删合法内容**（同节点承载多个不同图表、合法父子结构都是合法情形）。先扫语料、看命中内容，再定实现。
3. **审计器必须复用实现的口径函数**：自造口径（用 `isLayoutContainer === true` 代替 `isLayoutContainerSection()`，后者还含 `layoutSource==='container-rebuild' && children>0`）会产出上千条假阳性。
4. **`base-mod` 与「另一个元素的完整类名」命名上不可区分** → 任何"按命名推对应关系"的规则都必须加白名单/来源限缩（R5 救回一次）。

- A1 其余部分：以模板 `classNamesList` 确定性生成样式骨架，LLM 只填值；需确认所有 complexity 分支、fallback 标记和 CODE-020 观测。
- D 图表消除层：`injectEchartsFallback` 仍需按视觉真值生成 type/series/legend/data，并对非笛卡尔图跳过坐标轴；最终建设 chart-builder 后删除旧 fallback。
- H item-level DOM contract 尚未完成；R2 目前主要只接管 section 根布局（R2 子项「模板子元素顺序」已由 #719-B 落地）。
- R3 header slots、R5 阶段 C、R6 图标/图例精确真值、R7 视觉覆盖门禁待推进。
- 文档 `docs/确定性收回清单-2026-09-16.md` 需同步 A1/D/E3/G/H、A2 方向及 E1→E2 依赖；本次 A/B 取证见 `docs/查证记录-2026-09-26.md` §14。

## 离线重放（无 LLM 取证）要点
- 任务 checkpoint 在 `temp-components/<userId>/<taskId>/.checkpoint/{analysis,context-shadow,figma,visual}.json`。
- 直接 `require('./dist/...')` 调真实函数可行（dist 为 CJS 主入口 + node 自动重解析 ESM 子文件）；**jest 里 import code-generator/prompt-builder 会因 `import.meta` 链（prompt-loader/sfc-semantics/config/backend-root）失败**，需按 `code-generator.deterministic-template.spec.ts` 顶部的 `jest.mock` 替身清单打桩。


## 验收与记忆
- Jest 基线按项目既有记录对比；通常使用 `NODE_OPTIONS="--max-old-space-size=1536" ... jest --runInBand --forceExit`。
- 每次 substantive 工作完成后，追加 `/Users/smigoo/工作/mvgo/.workbuddy/memory/YYYY-MM-DD.md`；长期项目事实才写本文件。
- 中文、结构化、优先给出根因/文件/验证证据；完成修改后确认是否提交，但未经用户要求不主动 commit。
