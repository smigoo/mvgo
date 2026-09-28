# mvgo 项目速查

## 环境与构建
- 根目录 `/Users/smigoo/工作/mvgo`；子仓 `backend-node`、`frontend`、`docs`。Node 13030，Java 8080，前端 2610。
- WorkBuddy 跑 Node/npm 必须清环境：`env -i PATH="/Users/smigoo/.workbuddy/binaries/node/versions/22.22.2-3/bin:/usr/local/bin:/usr/bin:/bin" HOME="/Users/smigoo" ...`（避免 NODE_OPTIONS shim/代理卡死）。
- 后端构建：backend-node 下先 `rm -f tsconfig.build.tsbuildinfo` 再 `npm run build`；启动只能用根目录 `/Users/smigoo/工作/mvgo/start-node.js`；日志 `backend-node/server.log`。
- 杀端口只用 `lsof -ti:PORT -sTCP:LISTEN`；重启前看日志尾部与活动任务。改源码/`.env`/产物后必须重启；构建后 `node --check` 关键 dist JS；探活 `curl --noproxy '*' http://localhost:13030/api`（无 `/api/health`）。
- 不设置 `FIELD_ENCRYPTION_KEY`（随机化会永久破坏加密字段）；AI 凭证 `backend-node/data/ai-config.json`；本地自动登录由 `start-node.js` 注入。

## 生产 Nginx（容器 nginx，`/etc/nginx/vhost/gzxj.conf`）
- `location /api` **默认整体转发 Java 8080**（见 `docs/deployment/nginx/mvgo-nginx-frontend.conf:62-70`）。凡属 Node 13030 的 `/api/*`（component、mc-spec、tasks、progress、demo、admin…）**必须逐个写在 `/api` 之前**显式 `proxy_pass http://192.168.112.1:13030/...`；漏配被 Java 兜底吃掉 →（Java 未启动）502。
- **`/api/auth/*` 归 Java 8080，不归 Node**：`backend-node/src/auth/auth.module.ts:29` 已 `controllers: [/* 已迁 Java */]`，实测本地 Node auth 全 404（而 `/api/tasks` 401、`/api` 200 → 服务正常仅 auth 不挂载）。`location /api/auth → 8080` 是**正确**的，不要改指 13030。
- Java 部署：`/home/mvbt/mvgo/backend-java/` + `deploy-java.sh`（fat jar，健康检查 `/api/health`，冷启 30~60s）。必须 `export MONGODB_URI`。`PORTAL_BASE_URL` 默认 `.../portlet/api`——门户 token 校验**必须带 `/portlet/api` 前缀**否则 401。未注入 `ADMIN_STATS_KEY` → 使用统计四格恒为 0（静默降级）。

## 项目原则
- 确定性事实只保留一个事实源；视觉确定内容由 pipeline facts/assembler 装配，**不能直改单个生成产物**。
- 删减法：每接管一个事实就删除/收缩对应 fallback/纠偏器；门禁总量原则上只能下降。
- 预览事实源：`last-good > candidate > partial > workspace`（workspace = `backend-node/workspace`）。
- 符号级验证用 `grep -E`（BSD grep 不支持 `\|`）；混合 `.js/.ts` 仓库搜符号时 `--include` 会漏 `.js`，不要只限 `*.ts`。

## 布局/样式事实层（长期架构）
- **容器级方向** `utils/figma-node-layout-facts.js#buildNodeLayoutFacts`：对有子节点的容器产 `{display,flexDirection,source,confidence}`。标准读 `layoutMode`；不标准读 `absoluteBoundingBox` 几何（`areBoxesSideBySide`）→ 默认 flex（**不还原 absolute**）；均匀网格（`detectGridColumns`→grid+columns）先于 side-by-side；方向模糊默认 row 低置信；单子默认 column。经 `design-facts-compiler`→`nodeLayoutFacts`，由 `prompt-builder#buildNodeLayoutFactsReinforcement` 强制下发，`code-validator` 按 `data-section-id` 校验。
- **item 级** `utils/figma-item-facts.js`：治卡内兄弟 TEXT 无中间容器 → `textStack`/`textRow`/`siblingAsset`/`itemAxis`。
- 几何判据单一源 `section-tree#areBoxesSideBySide(a,b)` = y 重叠 > 0.5×较矮 **且** x 重叠 < 0.15×较窄 → 左右并列。
- **嵌套布局几何事实** `section-tree#describeContainerLayout`：治非重复混合容器内部无方向；仅 section 根且非重复、非图表、≥2 列×≥2 行才输出；**仅当 DOM 序 ≠ 视觉阅读序**才输出。
- 真值表 `buildSectionStyleFacts`（`section-tree.js`）每次生成注入逐节点样式真值。主色提取 `style-tokens#isVividColor` 需叠加明度带 L∈[0.12,0.90]+彩度 ≥0.15（近白会骗过纯 HSL）。⚠️ 重放该函数必须传 `figma-node-data.json` 的 **`.document`**。
- **判不了**（需兜底）：绝对定位 vs 流式意图、gap 归属、对齐、wrap、响应式、装饰层 vs 内容、平铺未分组父子归属。

## 预览尺度（rem 基准）—— 长期事实
- `rem.js#setRem` 是**唯一**写 `documentElement.style.fontSize` 的地方：`rem = vW × pxtorem.baseSize/uiSize`（1920 设计宽），且 `max(当前计算值, rem)` 兜底。
- 全局 `frontend/src/assets/styles/reset.less:9-11` 设 `html { font-size: 12px }` → 窗口 ≤1440 时 `12 > rem` → **预览基准恒为 12px**（实测 420/900/1440/1920 四视口均为 12）。生产门户 ~1920 宽屏 → rem≈16 → 组件 1:1 ✅；**预览只有 12/16 = 0.75×** ✗。
- 目标不变式：预览内组件 1:1 ⇒ `--fontSize` 必须是 **px（= 设计基准）**，或把 html font-size 钉成 `pxtorem.baseSize`。
- **组件样式零裸 rem**（抽样 120 组件/234 文件 = 0 处）：全部尺寸走 `var(--fontSize)` / `calc(var(--fontSize) * N)`（M5-7 门禁保证）⇒ 折算 `--fontSize` 一处即可令整组件 1:1。
- 推荐修法 A2：预览注入 cssVars 时把 rem 值按 `pxtorem.baseSize` 折算为 px（`0.875rem → 14px`）→ 不动 html/全局 CSS/rem.js，生产零影响。

## 预览首开「未找到组件 mc-max-*，刷新就好」= 落库竞态（2026-09-28 治本）
- **时序实测（同一任务）**：`lastGood` 快照 `createdAt` 06:39:24.301 → workspace 发布 .375 → **组件记录 createdAt 06:39:27.878（晚 ~3.6s）**。
- `preview/index.vue#ensureLatestSnapshot` 原**零重试**单次探测；`resolveWorkspaceComponentId`（`by-session` 反查）原仅 3s 退避 → 首开时两者都可能未就绪 → 退到 **workspace 源并用 sessionId 拼目录**（`custom-components/mc-max-…`）→ 必然 404。刷新后两者都在 ⇒ 「刷新就好」。
- **治本**：`ensureLatestSnapshot` 加有界退避（5 次 ≈ 0.4+0.8+1.2+1.6s，命中即停）；**仅对 sessionId 形态重试**（URL 带 `sessionId` query 或 path 段 `mc-*`/`mv-*`）—— 语义 componentId 入口对 `latest` 必然 404，不能重试否则白等；`resolveWorkspaceComponentId` 提到 6 次≈6s 同预算。
- 接口自检：`/api/tasks/<sid>/code-snapshots/latest`（取 lastGood>candidate>partial）、`/api/component/by-session/<sid>`、`/api/tasks/resolve-session`。

## 重启 Node 的进程竞态（2026-09-28 实测）
- `start-node.js` 会先杀端口占用者再 spawn；**若上一实例仍在启动中（未 listen），`lsof` 抓不到 → 杀不掉 → 新实例撞 EADDRINUSE**，变成一个「Nest 已 bootstrap、任务执行器已注册、但 HTTP 不监听」的**僵尸实例**（双实例抢队列 + 重复写产物）。
- 守则：重启后**必须核对 `lsof -ti:13030` 的 PID == 新 spawn 的 PID**；`grep EADDRINUSE server.log` 非 0 就 `pgrep -fl "dist/main.js"` 找多余实例并 kill 掉。冷启动较慢（10~60s），别在 Nest 日志出现前就判「挂了」。

## 微码 CSS 变量（`--fontSize` 等）的注入契约
- **唯一注入方 = 组件容器**：`core.js#setComponentProps` → `getCssVarsConfig()` → `componentProps.style`（内联到组件根）。全仓 **`--fontSize` 静态定义 0 处**；`demo/index.vue` 用 postMessage 推、`TaskDetail` 不推、截图渲染器独立打开。
- **`@fontSize: var(--fontSize)` 必须无 fallback**（mc-check M5-6 正则硬性要求；`style-tokens` 生成的 `var(--fontSize, 14px)` 会被 `file-writer` 归一掉）→ **只能由宿主提供**，不能靠 fallback。
- 独立/质量预览由 `preview/index.vue#loadMicrocodeCssVars` 自注入组件声明的 `resources/config/css-vars.js`（2026-09-28, commit `4ac8e15`；**只补未设置的键**；fail-open）。前提：`loadVue3Runtime` 必须把 `$` 前缀导出注入全局（**含对象型** `$mcCssBuilder`）。
- 预览路由 = `/preview/:componentId`（history 模式）；dev 访问 `http://localhost:2610/preview/<componentId>`；`#/preview/...` 会被改写成 components 页。
- **未解残余**：①`rem.js` 按视口缩放 html font-size → 预览绝对值偏小（管线截图视口=组件宽时 ≈2.6px，P-05）；②`getCssSize(12)` 硬编码（`file-writer.js` + `mc-skeleton.js:168`，463/463 组件命中）应为设计基准 14。

## 主题（Mode B，长期标准）
- 业务 LESS 只用 `@color-*` 槽位；`var()` 仅允许在 `theme-vars.less` 的 `.common()` 透传；深浅 theme mixin 必须有不同硬编码值；ECharts 用 `THEME_COLORS[props.theme]`。文件级槽位覆盖有 `THEME-SLOT-LOCAL-OVERRIDE` 检测+自愈。

## 关键缺陷史（复发点，改前必读）
- **LESS 颜色函数参数含 `var()` → 编译期必失败**（`code-healer.js#healLessColorFnVarArgs`）：`fade/lighten…` 是编译期函数，参数写运行期 `var()` → 硬报错 → 写盘门禁 retry 仍失败 → **整文件被跳过且不留痕**。全日志 67 条跳过中 37 条（55%）此形态。
- **两条"下策"路径**：`P1-4 坏文件隔离降级`（12 条，全 SFC_PARSE，`Invalid end tag` 11 条已由 `stripSurplusBlockClosers` 收口）与 `写盘门禁失败（已跳过）`（67 条，量大 5 倍且不留痕）。查法：解析这两串标记后 JSON 的 `diagnostics[].category`/`rawErrors[].errors`。
- **类名单一写入者契约**：`scripts/classname-writer-audit.mjs` 白名单；新增写者必须登记。
- **确定性装配只挂 complex 分支 → 同类缺陷按复杂度分叉复发**；新增确定性能力必须清点 medium/simple 全部分支（`code-generator.js#applyDeterministicIndexTemplate`）。
- **同一事实两处各自命名 → 后置门禁只修一侧必失配**（P-09 类名前缀契约）。
- **触发源必须用「当前事实」而非「本轮改动」**（跨轮缺陷用本轮 diff 做条件 → 静默失效，R5 v1 0 命中）。
- **判据先取证再实现**：凭直觉的判据经全语料验证常误删合法内容。**审计器必须复用实现的口径函数**（自造口径产上千假阳性）。
- **`base-mod` 与「另一元素完整类名」命名不可区分** → 按命名推对应关系的规则必须加白名单/来源限缩。

## 方法论
- Jest：`NODE_OPTIONS="--max-old-space-size=1536" npx jest <spec> --runInBand --forceExit`（`--runInBand` 与 `--maxWorkers` 二选一）；cwd 必须 backend-node。
- 离线重放：任务 checkpoint 在 `temp-components/<userId>/<taskId>/.checkpoint/{analysis,context-shadow,figma,visual}.json`；可直接 `require('./dist/...')` 调真实函数；jest 里 import code-generator/prompt-builder 会因 `import.meta` 链失败，需 `jest.mock` 打桩。
- 每次 substantive 工作后追加 `/Users/smigoo/工作/mvgo/.workbuddy/memory/YYYY-MM-DD.md`；长期事实才写本文件。中文、结构化、优先根因/文件/验证证据。
