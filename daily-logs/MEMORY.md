# 感智晓界项目记忆（精简版，详史见同目录日志）

## 环境 / 构建 / 部署
- 根 `/Users/smigoo/工作/mvgo`；子仓 `backend-node`/`backend-java`/`frontend`/`docs`。端口 Node 13030、Java 8080、前端 2610。
- WorkBuddy Bash 起常驻服务/跑构建必须 `env -i PATH=... HOME=/Users/smigoo`（清 `NODE_OPTIONS` shim + 代理）；curl 本地加 `--noproxy '*'`；`ps` 被拦用 `pgrep -fl`。
- **重启 Node 必杀 `dist/main.js` 真 PID**（`start-node.js` detached 一层子进程，父/子两 PID）；kill 后 `lsof -iTCP:13030 -sTCP:LISTEN` 为空再起。判据：server.log 出现 `Mapped {...}`。
- 构建 `rm -f tsconfig.build.tsbuildinfo && npm run build`；`nest build` 只重编改动文件 → **src mtime 晚于 dist = 没进产物**；收尾必 `ls -l src/X dist/X` + `grep -c` 新符号（grep 一律 `-E`）。前端 `env -i ... npm run build:safe`（`--emptyOutDir false`），旧产物 `mv dist dist.old-<ts>`。
- **bcrypt TS2307 唯一解**：`src/types/bcrypt-shim.d.ts`（勿删）。
- 🔴 **`ai-engine/**/*.js` 是纯 ESM 但包没有 `"type":"module"`**：经 `nest-cli.json` assets `**/*.js` **原样拷贝**进 dist，靠 **node 22 模块类型自动探测 + `require(esm)`** 加载（运行时有 `MODULE_TYPELESS_PACKAGE_JSON` 提示属正常）。→ 给这类文件加相对 ESM import 安全；**不要**给 `backend-node/package.json` 加 `"type":"module"`（改变全后端模块解释方式，高危）。
- 本地勿设 `FIELD_ENCRYPTION_KEY`（随机化永久废掉已加密字段）；AI 凭证在 `data/ai-config.json`。
- **新增 Node 路由三处同步**（否则生产 404）：`docker/nginx/nginx.conf`（须排在 `location /api` 前）+ 公司 nginx 容器(192.168.112.1) + Java `NodeProxyController`。判据：生产 404 而直连 13030 200 = 纯代理问题。

## 组件定位 / 快照 / 预览
- **定位单一事实源** `component-resolver.js#resolveComponentDirStrict()`：任务 `componentId`（`mc-lite-...-c298235f`）与真实目录（`c-environment-monitor-c298235f`）**共享尾缀**；检查/AI修复/快照/下载/GitLab 推送必须共用（曾「检查 strict、修复走旧」→ 写盘被拒）。`resolveWritableComponentDirs` 必须返回全部正式副本。收敛点 `phase2.service.ts:2019`、`demo.service.ts:261/486`、`gitlab-push.service.ts`。
- 预览优先快照 `temp-components/.task-code-snapshots/{sessionId}/revisions/{rev}/`，其次 workspace；`publishToWorkspace` 候选源必须含 `package/`。
- **快照冻结自愈前坏版**：写盘自愈只写磁盘不回写内存 map → 治本 = 终态落盘后回读 `finalTruthWritten` 回写。
- **命名一致性盘点** `backend-node/scripts/naming-audit.mjs`（只读，`--json`/`--limit`，支持 `FRONTEND_WORKSPACE`；输出 6 段含 git 跟踪面）。判据：`component` 族才参与分析，`page`/`api-module`/`other` 仅分布展示。
- 🔴 **踩坑**：`resolveComponentDirStrict` 尾缀匹配**忽略传入名，只看尾 8 hex** → **传规范 ID 也会命中任务号目录**（因搜索根第 1 位 `projectRoot/workspace` 是脏数据）。别以为「传规范名就安全」。
- 🔴 **S4 存量改名 git 前置**：只有 `frontend/workspace` 被跟踪（3380 文件 / 169 目录 / 其中 152 条任务号形态）——`.gitignore` 有 `workspace/` 但被早期提交绕过；`backend-node/workspace` 与 `projectRoot/workspace` 跟踪数 = 0 可自由 `mv`。改名入库目录须 `git mv` + 单批 commit + **禁 `git add -A`**。
- **已知脏目录**：`v2-e2e-*`（前缀非 mc/mv → 逃过编码型正则）、`page-page-*`（页面骨架误落组件根，且 `declare.componentId` **是中文**如 `c-环境监测`，与 ASCII 假定冲突），二者都需单独立项。
- **`custom-components` 不进生产构建**的正确理由 = **glob 从未声明它**（`vcf.js:6,8,16,18` 只 glob `@/components/**` 与 `@/workspace/vue3-components/**`）；`vite.config.js:557-568` 的目录列表只是 `optimizeDeps.exclude`（dev 预扫描）。`vue3-components` 无 `component.js`/`declare.*`（glob 恒空）。
- **dev 第二条写盘链路**：`vite.config.js:113-134` 的 `workspace-raw-files` 插件**可写** `frontend/workspace`（Playground 实时编辑）→ 后端写盘断言管不到它（但只收绝对路径 + 前缀校验，不产生名字→目录解析）。
- ✅ **S1/S2/S3 已实施（2026-09-10）**：`component-resolver.js` 的 `resolveWritableComponentDirs` 改 `realName = readDeclaredComponentId(strict) || basename(strict)` 且候选循环改「ID 外层/根内层」；`resolveComponentDirStrict` 多命中改 `rankDirsByNaming(hits)[0]`（规范 c- 优先 / 任务号垫底）；`playground-tools.js#writeComponentFile` 写 `declare.json` 前经 `normalizeDeclareComponentId` **归一 + WARN**（**不是抛错** —— 存量 138 条污染若抛错会让 AI 修复全线失败）。实测：任务号查/规范 ID 查均返回规范目录；writable[0] 为规范目录。

## 已固化的门禁 / 根因
- **L0-B 确定性 fail-closed 门禁**（`code-structure-validator.js`）：CODE-021 子组件死代码（import 但模板 0 处 `<X>`）、CODE-022 资源未挂（词边界计数 + 剔注释）、CODE-020 反向类名不命中。
- **index.vue 内联渲染**（device-0quu3hqa 实锤）：模板段内联手写 DOM，脚本段无条件 import 全部子组件 → 7 个死 import。检查手法 `grep -cE "<(子组件名)" index.vue` = 0。子组件文件路径由 `detectSubComponents`（resource-mounter.js:2477）从脚本段 import 提取 → 模板/脚本/文件名三者由不同 LLM chunk 各自决定，天然不一致。
- **确定性子组件命名**（`section-tree.js#assignSectionComponentNames`，2026-09-10 2b8a60b）：给 leaf section 分配确定性 PascalCase 名（**type 优先**稳定映射 + 序号去重），`buildSubComponentNamingGuidance` 输出「强制名称」替代「建议名列表」。**坑**：`resp.includes('标签')` 会误命中「数据统计指标区（数字+标签+趋势）」→ type 必须优先于 responsibility 关键词，关键词用「标签页」/「切换栏」精确匹配。
- **结构树单一事实源**（R1，2026-09-10 a0f9e6a）：`buildLayoutSkeleton(layoutStructure, planSections)` 优先用 planner 的 `effectiveSections`（`resolvePlanSections(input)` 统一解析 `generationInput.componentPlan`→`subComponentPlan`），用 `formatSectionTreeForPrompt` 格式化；下游模板段/脚本段/样式段三个调用点不再从 layoutStructure 重新推断。`formatSectionTreeForPrompt` 的 `formatOne` 已加 layout 方向（非 vertical 标注）。
- **LESS-COMPILE-001**：`common.less` 漏 `}`，治本 `less-compile-gate.js` + `file-writer.js` 自愈。
- **`pruneRedundantFields` 误删 Auto Layout 属性**（待修）；IMAGE `imageRef` 不可误删。
- 高度坍塌：宿主非 flex → 根 `flex:1` 失效；`resource-mounter.js` 规则②豁免组件根。
- **COMP-001 fail-open**：`section-coverage-guard.js` 检测器异常走 WARN。
- **微码契约**：`injectResourceImports` 的 `resourceRelBase` 带尾斜杠；import 去重正则**禁用尾部 `.*$`/`\s`**；`post-process.js` 改前先 grep 消费方。
- **ID 双形态**：`user_ai_configs.userId`/`components.creatorId` 并存 ObjectId 与门户 UID → 聚合必须双候选键（`admin.service.ts` `configMap:183` 仍单键待修）。

## AI 模型 / 修复链路
- **不带 config 的入口**（Playground 修改器、mc-spec AI 修复）走 `resolveTextConfig({})` → 由 `ai-defaults.js#resolveSavedSlot(role)` 完整解析（binding 降维 → legacy 回退，mtime 缓存）。新增此类入口必须验证落到该兜底。
- temperature 不硬编码；`playground-agent-graph.js` 有 `TEMPERATURE_LOCKED_MODELS` 去温度重试。
- **AI 修复假成功三因**：配置错配（baseURL 空+model 硬编码）、temperature 400、提示词缺「缺字段补默认值、不要反问」。agent 失败返 HTTP 200 + `success:false`，前端必须判。

## 测试 / 约定
- 单测 `NODE_OPTIONS="--max-old-space-size=1536" npx jest <spec> --runInBand --forceExit`，cwd 必须在 backend-node。既有基线失败含 `import.meta`（`backend-root.js`）、`roles-request-context`、`config.service` → 判回归比对基线 FAIL 集合。
- **前端 `core/http.js` 两坑**：① `request()` 不自动解包 → 取 `res.data.*`；② `resolveUrl()` 对 `/` 开头原样透传 → 必须写全路径 `'/api/xxx'`。
- commit `#code#`/`#reqcode#`/`#note#[类型] 描述`，AI 生成加 `#ai-coding#`；**绝不用 `git add -A`**，只显式列路径。
- 中文技术化回答：根因 + 文件:行号 + 验证证据（表格化）。
