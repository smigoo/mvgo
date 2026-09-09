# 感智晓界项目记忆

## 环境与部署
- 根目录 `/Users/smigoo/工作/mvgo`；子仓：`backend-node`、`backend-java`、`frontend`、`docs`。本地端口：Node 13030、Java 8080、前端 2610。
- 本地常驻服务用根目录 `start-node.js`/`start-frontend.js`/`start-java.js`；WorkBuddy Bash 起常驻 Node 要用 `env -i` 清 `NODE_OPTIONS`/代理环境。curl 本地接口常加 `--noproxy '*'`。
- Node 构建：`rm -f tsconfig.build.tsbuildinfo && npm run build`，不删 `dist`。本地 `.env` 保持空占位，`.env.development` 放开发配置；本地勿设 `FIELD_ENCRYPTION_KEY`，AI 凭证在 `backend-node/data/ai-config.json`。
- 生产 ECS：nginx docker 80；Java 8080 是 `/api` 门面；Node 13030 是 AI 引擎/SSE；`/api/progress` 唯一直连 Node，必须放在 `/api` 路由前。nginx 容器内 proxy_pass 用 `192.168.112.1`，不用 localhost。
- 生产必备 env：Java `PORTAL_BASE_URL=https://go.microvideo.cn/portlet/api`、`MONGODB_URI` 带 `authSource=admin`、`NODE_BACKEND_URL=http://192.168.112.1:13030/api`；Node `FIELD_ENCRYPTION_KEY` 固定不可变、`OPERATION_LOG_BACKEND=http://192.168.112.1:8080`、`MC_PREVIEW_BASE_URL=https://go.microvideo.cn`、`JAVA_BACKEND_URL=http://192.168.112.1:8080`。

## 生成链路与微码契约
- Phase2：Figma→预览/资源→Vision/LayoutReviewer/StyleMapper→子组件规划→MicrocodeEngineer→L0-B→重试/发布。
- 微码产物：`package/index.vue`、`package/components/*.vue`、同级 `resources/styles/index.less`；主组件样式引 `../resources/styles/index.less`，子组件引 `../../resources/styles/index.less`。
- `downloadStatus` 契约：`buildVarToMapping` 只收 `downloadStatus==='success'`；缺字段会导致资源校验静默假通过。勿放宽为兼容，否则破坏与 `injectResourceImports` 的事实源一致性。
- `effectiveMapping` 必须在主干作用域、内层箭头函数定义前；否则易出现 `ReferenceError` 或校验假通过。
- 常错签名：`validateVueScriptSemantics(content, filePath='', opts={})` 返回 `{issues, content}`；`injectResourceImports(content, mapping, resourceRelBase, diag)` 的 `resourceRelBase` 必须带尾斜杠。
- `implicitlyDeclared` 只包含 success 资源变量；missing 容器臆造名必须 fail-closed。
- AI engine 多为 ESM `.js`；改后做 acorn 解析、动态 import、冒烟和关键符号 Grep（至少 1 定义 + 1 调用）。

## 快照、预览与运行时
- 快照重校验：`POST /api/tasks/:sessionId/code-snapshots/:revision/validate`；权威诊断在 `task.result.codeValidationResult` / `lessCompileGate.diagnostics` / `runtimeGate.issues`。
- 预览优先读快照 `temp-components/.task-code-snapshots/{sessionId}/revisions/{revision}/`，其次 workspace。workspace 成品可能被 DemoService 自动修复，查生成态要看 `temp-components/<gid>/<cid>/` 或快照。
- `publishToWorkspace` 候选源必须含 `package/`；temp 被清时回退快照；从快照发布走 tmpdir 副本；发布目标目录需排除。
- generate 模式运行时门禁曾把 `RUNTIME-004 render-error` 降级 warning 后发布；确定性 `is not defined`/`Cannot read properties of undefined` 应升级 BLOCK。

## 已知根因与治本
- LESS-COMPILE-001：`common.less` 根选择器漏 `}`；治本在 `less-compile-gate.js` 加自愈、`file-writer.js` 写盘自愈、phase2 如实回写 terminalError。
- **快照冻结自愈前坏版（2026-09-08 mc-max-...06cfa312 实锤）**：`microcode-engineer.writeFiles` 写盘门禁自愈（SFC style 括号补全/Tab 骨架等）只写磁盘**不回写内存 files map** → 候选快照源 `finalTruthFiles` 仍是自愈前坏版（index.vue style 漏 `}`），而 workspace 发布从磁盘复制拿到自愈版 → 「TaskDetail 走快照源预览空白/LESS 编译失败、workspace 源可看」。治本在统一终态落盘后从磁盘回读 `finalTruthWritten` 回写 map（microcode-engineer.js R2，~6090 行）。
- **post-process.js 契约劈叉（2026-09-08 实锤）**：`validateContainerSize` 必须返回 `{code,warnings,fixed}`（auto-fix），`validateResourceUsage` 返回 `{code,warnings}`——`resource-mounter.postProcessIndexVue`(T06/T07) 与 code-validator/microcode-engineer/vue3-engineer 均按此解构。若改纯校验返回 `{valid,errors}` 会在 T06 处 `fixedCode` undefined → `assembleIndexVue` 返回 undefined → `generateIndexVue:280` 崩 `Cannot read properties of undefined (reading 'length')`。改 post-process 前先全仓 grep 消费方。
- 高度坍塌：宿主 `.pannel-content` 非 flex，根 `flex:1` 失效；`resource-mounter.js` 规则②对组件根 `.xxx-root` 豁免 height→flex 改写。
- 资源去重：GROUP 无 fills 时用 `generateContainerSignature` 子树结构签名；IMAGE fill 的 imageRef 不能被 `pruneRedundantFields` 误删。
- TEXT-001：同一数组元素内文本字段顺序不等于兄弟渲染顺序，`detectTextOrderDrift` 需跳过。
- 定宽/定高区块：显式 px 尺寸 + `flex-grow` 归一为 `flex:0 0 auto`，避免尺寸被撑破。
- deepseek 空响应：deepseek 推理模型默认 `thinkingType:'disabled'`；前端 payload 陈旧配置可旁路服务端文件，resolveProvider 需模型名级兜底。
- import 去重正则禁用尾部 `.*$` 和 `\s` 跨换行，避免二次 `injectResourceImports` 吞掉 `vue/echarts` import。

## 测试与构建
- backend-node Jest 既有失败基线：多套件因 `import.meta`、`roles-request-context`、`config.service` 等失败；判断回归需与基线 FAIL 集合比对。
- 单测稳定参数：`NODE_OPTIONS="--max-old-space-size=1536" npx jest <spec> --runInBand --forceExit`，`--runInBand` 与 `--maxWorkers` 不并用。
- 本地 Java 无 JDK 时可用 `/tmp/jdksetup` 的 JDK17+Maven3.9.6；fat jar 打包 `mvn -pl mvgo-app -am package -DskipTests`。

## 工作约定
- 中文技术化，回答给根因、文件/行号、验证证据。实质修改后构建、确认 dist、重启/探活、冒烟验证、追加当日日志。
- commit 标题含 `#code#`/`#reqcode#`/`#note#[类型] 描述`，AI 生成加 `#ai-coding#`。
- 两类生成失败：服务中断看进程/日志；质量门禁 BLOCK 看 `tasks.json`、`lessCompileGate`、`codeValidationResult`。