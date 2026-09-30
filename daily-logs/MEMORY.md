# mvgo 项目速查

> 本文件只留**最高频**不变式与判据（控制在注入上限内）。
> 🔴 **详细版判据集（K/L/M/N 类完整分支、门禁两个坑、布局方向 A/B 数字、取证链、行号）见同目录 `PIPELINE-DETAIL.md`** —— 涉及资源挂载 / 内容归属 / 布局方向 / 门禁排查时**必读**。
> 逐日取证见 `YYYY-MM-DD.md`；管线排障优先用 `mvgo-*-triage` 系列 Skill。

## 环境 / 运维
- 🔴 **硬约束：任何改动不得自行部署**。可改码/跑测试/本地 commit/写文档；重启 `:13030`/`:2610`、同步生产、生产发布、`git push` → 停下等指令。交付须显式说「已改完，未部署」。
- 根 `/Users/smigoo/工作/mvgo`：`backend-node`(NestJS :13030)、`frontend`(Vite :2610)、`docs`；Java :8080。
- 跑 node/npm 必须 `env -i PATH="/Users/smigoo/.workbuddy/binaries/node/versions/22.22.2-3/bin:/usr/local/bin:/usr/bin:/bin" HOME="/Users/smigoo" ...`（避 NODE_OPTIONS shim/代理卡死）。前端构建用 `build:safe`；jest/npx cwd=backend-node。
- 后端重启：`lsof -ti:13030 -sTCP:LISTEN`→kill→确认释放→根 `start-node.js`→`pgrep -f "node.*dist/main.js"`=1 + `curl :13030/api/tasks` 401=存活。重启前确认无进行中任务。
- 🔑 **后端接口鉴权契约**：走 **`token` 请求头**（`session.guard.ts:31` 只读 `headers['token']` / `query.token`）—— **不是** `Authorization: Bearer`（恒 401）。`GET /api/tasks` → `{success,code,data:{tasks:[],count}}`（数组在 `data.tasks`，**非顶层**）。
- ✅ **`start-node.js` 的 graceful-drain 护栏已修**（2026-09-30，此前**三处缺陷叠加 ⇒ 从未生效过一次**）：① `require('node-fetch')` 拿到 namespace 对象而非函数；② 鉴权头写成 `Authorization: Bearer dev`（恒 401）；③ 顶层 `tasks.filter` 而数组实际在 `data.tasks`。三者任一都让它恒走 catch 无条件放行。修法 = `globalThis.fetch` + `token: dev` + `data.tasks` + `AbortSignal.timeout`，并补**阳性留痕** `✅ 活动任务检查通过（历史 N 条，进行中 0 条）` —— **没这行就无法区分「护栏通过」与「护栏压根没跑」**（原代码只有失败路径吭声，还伪装成环境小问题）。
- `start-node.js` R3-B 护栏只比 `dist/main.js` mtime ⇒ **`nest build` 增量编译不刷新它**，故每次启动都刷 STALE 横幅（含并行会话 WIP 的 src 也会触发）= **假警报**；判生效 = grep `dist/` 目标符号。**不设** `FIELD_ENCRYPTION_KEY`；AI 凭证 `backend-node/data/ai-config.json`。
- 🔴 **`nest build` 类型错会中止 tsc emit**（dist 整体不更新，并行会话 WIP 改 `src/workbench/*` 常触发）。判我 dist 停哪版 = grep 本次新增独有符号；绕法 = `.js` emit 是原样拷贝 ⇒ 单文件 `cp src→dist`，不把并行 WIP emit 进去；事后 `diff src dist` IDENTICAL。
- 生产 Nginx：`/api` 默认转 Java 8080，属 13030 的路由须写在 `/api` 前。🔴 **生产网关仅 GET/POST**（其余 405）⇒ 新接口一律 GET/POST + 语义后缀。
- 前端生产 `base='/mvgo/'` + `routerMode:'history'` ⇒ history 路由 URL 必带 `/mvgo/` 前缀（`withAppBase`/`getRouteUrl`）；`/workbench/*` 走 `App.vue` 独立分支，不渲染全局 `<WorkflowMonitor>`。

## 不变式（治本，非产物直改）
- 确定性事实单一事实源；视觉确定内容由 facts/assembler 装配，**不能直改生成产物**。删减法：每接管一个事实就删对应 fallback/纠偏器，门禁总量只降不升。
- 预览事实源优先级 `last-good > candidate > partial > workspace`；快照根 = `<仓库根>/temp-components/.task-code-snapshots/<sessionId>/`。
- 产物三处同步：backend/frontend workspace + 快照，须 diff；**同步面必须含 `resources/styles/index.css`**（less 产物），改 .less 后 `index-css-recompiler.js#recompileIndexCss` 重编。
- 资源挂载唯一答案 = `mapping.ownerSectionId` ⨯ `data-section-id`，有命中恒取、不进语义评分；**幂等护栏 = `isResourceRendered(files,var)`（「已渲染」唯一判据，宽正则不要求 class，N3 两处**无条件**先拦）**；重复 sid 归属 = `anchorOwnerRank`（`package/index.vue` > 其它 `index.vue` > 其它，同文件取最外层）；宿主插槽一个槽名只出现一次；中文 class 出口 `component-naming.js#autoFixNonAsciiClassNames`。
- **消费面审计通式**：扩字段取值域四类归档（严格相等 / `||默认` / 二值三元收缩 / 显式新值分支）；只查 `=== 'x'` 必漏。
- 加自愈器/新函数前 `git log -S '<fnName>' -- src` 查是否被删过；清扫类自愈器排在注入器**之后**；修复器 filter 出现 `!i.autoFix` = 越权（WARN 只报不删）；加出口净化器须枚举全部出口（REST/SSE 首连+重连/落库/日志）。
- 🔴 **K/L/M/N 四类高频缺陷 + 门禁设计的两个坑**：K 资源清单语义坍缩、L scriptSplit 拼接畸形、M 内容归属文案真值、**N 锚点优先（已闭环：锚点选择 + fallback 幂等护栏 + owner 归属）**、vue3 产物 0 个 data-section-id（**立项项**）、门禁「不可达」两成因、跨文件 CSS 层叠口径。**完整判据/行号/A-B 数字/取证链见 skill `mvgo-resource-mount-layer-triage`（K:429 / L:474 / M:529 / N:621）**；`PIPELINE-DETAIL.md` 只留指针。
- ⚠️ **N3 的「不做」也要留档**：`fallback 拦跨 section 宿主容器`（判据「子树含其它 sid」）**评估后不做** —— 嵌套 section 容器子树含 sid 属正常形态，判据不可辩驳性不足、误伤风险 > 收益；且 fallback 幂等护栏已覆盖真实事故形态。兜底层与计划层（`resource-mount-plan` L403）的宽松度差异是**层级设计**而非缺陷。
- ⚠️ **同一常量/判据在仓内出现 ≥2 份副本 = 事故温床**。审计口径：`grep -rnE "^(export )?const <NAME>" src dist` 看**行首真定义数**；提废留 **🗑️ 墓碑注释**（原位置/为什么删/收敛到哪），别直接抹掉——便于后续 grep 追因。2026-09-30 收敛 2 例：① `HOST_SHELL_TAG_RE` 3 份（其一**从未被引用**）→ `utils/mount-target-scoring.js`；② `THEME_WRAPPER_TEMPLATES` 2 份，`mc-skeleton.js` **自称「成为单一来源」却仍有第二份被 engineer 使用**（⚠️ 两份内容逐字相同 ⇒ **跑测试永远发现不了**，只能靠「自称来源却仍有第二份」的文本信号主动 grep）→ 收敛到 `mc-skeleton.js`。**同名 ≠ 副本**（`SKIP_DIRS` 等各模块独立配置合法），须看语义 + 是否都被引用。
- ⚠️ 「P1」同仓两份清单，引用须指明文档：`确定性收回清单-2026-09-16 §7.5` ≠ `评审-四bug-根因与影响面-2026-09-29 §5.1`。

## 布局方向
- 单一来源 `sections[].layout` 只认 `figma-node-layout-facts#buildNodeLayoutFacts`（依赖成环 ⇒ 由 `subcomponent-planner#plan` 算好传入）。
- **三态范式**：判据 `code-generator.js:648-661`（`layoutKind ∈ {horizontal,vertical,grid}`，否则 null 不内联方向）；护栏 `layout-facts-injector.js:90-115`；`horizontal*` 必须前缀匹配；`gridColumns` 统一读 `sec.gridColumns ?? sec.body?.gridColumns`。LAYOUT-001 已收口（换证据源 + WARN，详见 DETAIL）。

## 管线要点 / 复发模式
- E1 选根 `section-tree#findRootFrame`：doc 自身是容器且有 children ⇒ doc 即根（GROUP 也算）。
- header 三道防线：节点名 `/header/i` → vision type 回填 → 几何兜底 `utils/header-geometry-fallback.js`；装配只认 leaf `type==='header'`。
- `componentId` = `c-<语义段>-<尾8hex>`；任务号污染判据 `/\d{13}/`。⚠️ class 级污染 `c-mc-max-<13位>-<8hex>` 旧式 `\bc-(mc|mv)-[0-9]{13}` 恒空 ⇒ 假通过，正解 = 查 `class="…[0-9]{13}…"` 与基线同形对比。
- 静默吞异常=P0；「自愈 N 处」≠ 生效（自愈 vs 回退 1:1 即全废）。「属性消失」= 多 pass 写入口拉锯 + 整批覆写回退 ⇒ 写入口收敛 + 删越权修复器。
- 背景：bg = 宿主容器 CSS 背景；`healStandaloneBgLayers` 先于 `healAbsoluteOverlayParents`；同父多子层 Map 记账；absolute 背景层宿主须 `position:relative`。
- **透明度契约**（d368e7d8）：透明度只属 bg 层（容器 relative + `<firstCls>-bg`），严禁挂容器 class；定位/透明度一律 inline `:style`，禁写 CSS 规则；幂等 = 层 `:style` 已含 `position`。
- 锚点标签正则禁嵌套量词 ⇒ `findTagBySectionAnchor` 线性扫描；`ownerSectionId` 不总是真 section ⇒ 禁「锚点缺失即 fail-closed」；循环结构导出前净化 `__parent` 反链。
- LessCompileGate：heal 在 createFileManager **前**；`healUnclosedLessComments` 8 行窗口（splice 后禁用「已处理下标」跳过）。图表样式豁免：`style-class-consolidator` 以 `/echarts/.test(sfc)` 标 `isChartComponent`。

## 诊断手法
- 🔑 **门禁「活不活」三查**：① 守卫形状全语料量化；② 日志 id 留痕（「查不到」是有效负证据）；③ 离线探针三态。工具在 `mvgo-deterministic-replay-triage/scripts/`。
- 🔑 **门禁「改完 0 命中」必须配阳性对照**：把真实产物**证据源那一层**故意改错 ⇒ 断言 `mismatches 0→1` 且定位正确（变异打在真正生效层）。
- 🔑 **门禁「判定域 ≠ 事实落点」必查**：门禁读 A 域、事实写 B 域 ⇒ 一放开就成群误杀。
- 🔑 **两态差分对跑**（证「零行为变化」最强）：`/tmp/x.json` → 跑改动后 → `git checkout -- <单文件>` 回 HEAD 再跑 → diff → 恢复；旧逻辑在探针内联逐字副本。
- 🔑 **混合工作区提交隔离**：`git diff` 按 hunk 切分 → `git apply --cached /tmp/mine.patch`；严禁对他人文件 `git checkout --`。
- 🔑 **量化口径纪律**：`forEachLeafSection` 递归排除容器 = 生产语义；统计前按 `generatedAt` 剔除历史快照（live ≥ 2026-09-16）；「全语料审计」前先数不同输入（1069 目录只来自 7 个 Figma 设计）。
- 🔑 **真机 A/B 可归因面只有计划层**（两轮最大变量是模型侧）：产物级 diff 不可归因，只答「有没有退化」；判「真 A/B」用 `component-meta.json#codeVersion.gitHash`。
- jest 只跑 `.spec.ts`；ESM spec 撞 `import.meta` 拖垮整套件 ⇒ import 前 `jest.mock('../../logger/index.js', ...)`；命令 `cd backend-node` + `NODE_OPTIONS="--max-old-space-size=1536" npx jest <spec> --runInBand --forceExit`。
- `server.log` 取段按行号窗口；`promptChars`/BLOCK 行不含 sessionId（按 sid 过滤漏 95%）；`GET /api/tasks/status/<sid>` 字段在 `data.task.*`；真机 lite/max 实测 83–90s。
- 🔴 整段函数体逐字提取不能用朴素花括号计数 ⇒ 用 JS 感知扫描器。
- ⚠️ **「改判据修 X」前必须先跑纯函数 A/B 证伪**（反面教材留档）：`isTitle` 认裸 `t`/`d` 曾被当作「统计行装配从不执行」的根因，全语料 898 产物 / 2702 section A/B 实测 **零影响**（`beforeHigh===afterHigh===20`，双向 flip=0；裸 `t`/`d` 各 346 但不在被评估的横向 section 成员子树内）⇒ 真瓶颈是 `member-shape-mismatch` 的「**成员子树文本数 ≠ 2**」（成员粒度）。**且「从不执行」的描述本身就不准确**（实测 20 条 high）⇒ 流传的「根因」要实测复核，别顺着注释改判据。配方：复刻目标纯函数全链（私有依赖一并复刻）+ 参数化被改判据 + 全语料跑 before/after 分布。

## 本机 shell 陷阱
- BSD `grep`：多模式用 `-E`（`\|` 静默空）；**`\b` 不支持**（用 `[^A-Za-z]`）；`sed -i ''`；heredoc `${}` 会展开 ⇒ 用 Write 写脚本。
- 🔴 `git commit -m` 禁写 `$(...)`（zsh 先替换写坏消息），改完 `git log --oneline -1` 复核。子仓指针提交必须 `git add <submodule>`。

## 质量评分面板 / 图片取源
- 「设计图」= `resources/images/mc-preview.png`；「产物预览」= `.mc-gen/screenshots/<taskId>-rendered.png`。
- 取图走 `/api/component/:id/file?path=<rel>&raw=1`（允许 dotfiles）；`/api/component/:id/preview` 不存在。评分抽屉深色固定主题 `#0f1722`。

## 大屏布局（`/screen`）
- 前端 `frontend/src/views/screen-layout/`；后端 `backend-node/src/screen-layout/` + `ai-engine/agents/layout-responsive-agent.js` + `graphs/layout-responsive-graph.js`；规则引擎 `utils/layout-spatial-analyzer.js`。
- 🔑 「XY 都自适应」正解 = `fluid`/`hybrid`（骨架弹性内容不变形），**不是 `stretch`**（scaleX≠scaleY ⇒ 圆变椭圆）。六类参数契约只有「适配策略」「兜底」值得反问；歧义不弹窗、改「先渲染 + 一键切换理解」。详见 `docs/大屏布局快速生成-体验方案-2026-09-30.md` + 原型 `outputs/screen-layout-ux-prototype.html`。
- 🔑 **`outputScaleMode` 已从死字段接通为全链路单一事实源**（2026-09-30 P0 修复）。**唯一来源** = `backend-node/src/ai-engine/utils/layout-fit-strategy.js`（`FIT_MODES`/`normalizeFitMode`/`readFitMode`/`buildFitConstraint`/`buildPreviewAppCss`/`checkFitHonored`），三处消费：① agent 注入 prompt `{{fitStrategy}}`；② graph 生成预览 `#app` 缩放；③ graph `fitModeHonored` 校验。**要改这个字段只改那一个模块**，别再在 agent/graph/service 各写一份（过去就是这样退化成死字段的）。改完必跑离线探针 `backend-node/scripts/check-fit-strategy.mjs`（51 断言，含负向断言）。
  ⚠️ 历史坑：`screen-layout.service.ts:15` 曾只有一行类型声明、全仓零消费 ⇒ 前端扩 `fluid`/`hybrid` 后用户选什么都拿到同一份 ZIP（假选项）。**「扩取值域」判定必须做「端到端留痕」而非「查读取点」——读取点为空集时查读取点必然查不出来。**
- 🔑 **「上下 N 块」的正确 DSL 表达**：middle 层 zone 在列内是 `flex:1` **纵向等分**（`ZoneRenderer.vue`）⇒ 同列放 N 个 middle zone，**不是** 1 个 zone 里套 flex column。
- 🔑 **`fluid` 的实现路径是「改盒子」而非「加 transform」**：`contain/fillWidth/fillHeight/none/fluid` 一律只算内容盒尺寸（盒=视口 ⇒ 骨架用 fr 自然伸缩），**不动内容** ⇒ 任何策略下都不变形。要演示"变形"必须显式做非等比 `transform: scale(sx, sy)`。
- 🔑 **枚举扩语义时不要用已有枚举承载语义相反的场景**：实例 = 解析器曾把「拉伸（会变形）」映射成 `hybrid`（语义为"等比+弹性，不变形"）⇒ 同一枚举两套含义，下游按 `hybrid` 理解必被误导。正解 = 按最接近的合法值生成（`fluid`）+ 告知差异，**不引入该语义**。
- 🔴 线框/缩略图底色**必须与 `canvas.backgroundColor` 解耦**（设计稿默认 `#ffffff`）⇒ 浅蓝标签+虚线边框直接失去对比度，结构反而看不清。固定蓝图深色 `#0b1219`。
- 🔑 **8 个预设的 `outputScaleMode` 已统一为 `fluid`**（2026-09-30，原为历史值 `contain`）⇒ 预设与一句话生成的默认终于一致，之前「fluid · 推荐」只是下拉框里的一句话。`screen-layout-presets.ts` 文件头已写约定注释：**新预设一律 `fluid`**，别再漂回 `contain`/`none`（那是与产物实际用的 fr+minmax 流式布局哲学脱节的「等比缩放派」遗留）。
- 一句话生成（纯前端、零模型）：解析器 `utils/nl-layout-parser.ts`（`parseLayoutPrompt`；增量修改见 `utils/nl-layout-refine.ts#parseRefine`，两者由 `npm run check:screen` 回归 —— 解析器 144 + 导出器 56 断言，跑**真 TS 源**，**改解析器前必跑**）；组件 `PromptQuickGen.vue` / `LayoutWireframe.vue` / `AdaptivePreviewModal.vue`（策略切换经 `update:fit` 回写编辑器，`fitWritable=false` 时只提示不写）。入口：页脚 `AppFooter.vue` 的「大屏布局」（受 `screen` 开关控制，dev base `/` ⇒ `:2610/screen`，生产 base `/mvgo/`）。
- 🔑 **有兜底的解析函数不能无条件调**：`parseFitMode` 恒返回一个值 ⇒ refine 里必须先过意图守卫（`FIT_CUE`），否则任何命令都被判成「要改适配策略」。refine 用**普通赋值**（复用 `useHistory` deep watch 撤销栈，可控 Z）而非 `resetHistory`。
- 🔑 **`navigator.clipboard` 只在安全上下文存在**（内网 http 下 undefined）⇒ 复制功能必须留 `execCommand` 降级。**前端加「复制」类按钮前先确认内容有没有被截断**（`codePreview` 曾只给 500 字符 ⇒ 复制到半截代码）。
- ⏳ 大屏布局**原缺口已全部做完**（2026-09-30 一次做完：refine / 持久化+分享 / 结果闭环单文件 HTML / 覆盖面 / 测试落仓）。下一步 = 后端「取完整生成代码」接口（现在只给 20000 字符片段）、refine 精确定位、refine 的 AI 版。详见 `PIPELINE-DETAIL.md` 的大屏布局章节 + `2026-09-30.md`。
