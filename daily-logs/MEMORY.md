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
- A1 类名骨架化：以模板 `classNamesList` 确定性生成样式骨架，LLM 只填值；需确认所有 complexity 分支、fallback 标记和 CODE-020 观测。
- D 图表消除层：`injectEchartsFallback` 仍需按视觉真值生成 type/series/legend/data，并对非笛卡尔图跳过坐标轴；最终建设 chart-builder 后删除旧 fallback。
- H item-level DOM contract 尚未完成；R2 目前主要只接管 section 根布局。
- R3 header slots、R5 阶段 C、R6 图标/图例精确真值、R7 视觉覆盖门禁待推进。
- 文档 `docs/确定性收回清单-2026-09-16.md` 需同步 A1/D/E3/G/H、A2 方向及 E1→E2 依赖。

## 验收与记忆
- Jest 基线按项目既有记录对比；通常使用 `NODE_OPTIONS="--max-old-space-size=1536" ... jest --runInBand --forceExit`。
- 每次 substantive 工作完成后，追加 `/Users/smigoo/工作/mvgo/.workbuddy/memory/YYYY-MM-DD.md`；长期项目事实才写本文件。
- 中文、结构化、优先给出根因/文件/验证证据；完成修改后确认是否提交，但未经用户要求不主动 commit。
