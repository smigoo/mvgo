# 感智晓界项目记忆（精简版，详史见同目录日志 2026-*.md）

## 环境 / 构建 / 部署
- 根 `/Users/smigoo/工作/mvgo`；子仓 backend-node/frontend/docs。端口 Node 13030 / Java 8080 / 前端 2610。
- WorkBuddy Bash 常驻/构建必须 `env -i PATH=".../node/versions/22.22.2-2/bin:..." HOME=/Users/smigoo`（清 NODE_OPTIONS shim+代理）；curl 加 `--noproxy '*'`；ps 被拦用 pgrep -fl；jest 加 `--max-old-space-size=1536 --runInBand --forceExit`。
- 构建：`rm -f tsconfig.build.tsbuildinfo && npm run build`（增量缓存会让改动不进 dist，收尾 grep 新符号）；tsc 不清理已删源文件的 dist 残留，需手动 rm。前端 `npm run build:safe`。构建输出重定向 /tmp 再读（管道 tail 会被吞/杀）。
- 启动 `node start-node.js`（项目根）；重启前必看 server.log 尾部近 1–2 分钟生成活动（浅层 find 探不到深层写入→误杀中断任务，被杀不自动 resume）；真 PID=dist/main.js；判据 `Mapped {...}` / lsof 13030。
- 本地勿设 FIELD_ENCRYPTION_KEY；AI 凭证在 data/ai-config.json；勿给 package.json 加 type:module；bcrypt shim 勿删。
- 新增 Node 路由三处同步：docker nginx + 公司 nginx(192.168.112.1) + Java NodeProxyController。
- ⚠️ ECS 部署：主机 root@iZbp1hik17it6sucvjuotaZ（内网名，仅 FlClash 增强模式可达；掉线报 Connection closed by 127.0.0.1:7890，修=选可用节点走普通 scp 或走弹性公网 IP）；scp 须 Mac 终端发起。Node 生产 `set -a; . ./.env.production; set +a; NODE_ENV=production nohup node dist/main.js`；Java 须先 cd backend-java + SPRING_PROFILES_ACTIVE=prod。**新增依赖必须同步 package.json+lock 再 npm ci**（`PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true` 必设，否则装 Chromium 卡死）；node_modules 残缺可从 Mac rsync 兜底。

## 组件定位 / 快照 / 预览
- 定位单一事实源 `component-resolver.js#resolveComponentDirStrict()`；S5 workspaceRoot=backendRoot/workspace，搜索根=[be/ws/custom, be/ws/vue3, fe/custom, fe/vue3]。
- 预览候选根：custom-components + 前端镜像 + temp-components/{groupId}/{componentId} 回退根（未提升组件也能匿名预览）。
- 微码 index.less→index.css 由生成期 precompileCss 产出（预览只认 .css）；就地修产物须 less+css 两份、backend+frontend 两副本。命名审计 scripts/naming-audit.mjs。

## 门禁 / 根因（固化）
- 🔴 图表看不到=两缺陷叠加：① 内容根 flex:1 1 0 在 block 宿主失效（宿主 .pannel-content 无 display:flex，正确写 height:100%）；② series[].type 非法→ECharts 丢整条 series（`Unknown series area-line`）。判据：agent-browser console + canvas 像素取证。
- 🔴 Loop 2.1.E 真值洗白：normalizeChartOptionType fallback 取未校验 truth → 非法值「收敛」成同一非法值。治本=resolveEchartsType(~90 别名表)+括号配平 findSeriesArraySpans+normalizeSeriesInSource；存量脚本 scripts/fix-chart-series-types.mjs（86 文件/146 处）。凡「收敛/校验」日志先确认收敛目标合法。
- 🔴 死接线盲区（P2-1 治本，commit 81a885b）：generation-context.js 死包装漏传 figmaNodeData → anchor-root-container 从未注册潜伏 10+ 天。治本三件：① 死包装已删；② 终验链 normalizeRootContainerLayout 补 aspect-ratio（figma bbox W/H>50 且缺 width/height 时注入，I4 不变量）——**consolidateSubComponentClasses 挂 writeFiles 出口会重建 common.less，凡布局关键修复必须在写盘前最后一刻重跑**；③ scripts/mechanism-reachability-audit.mjs 死接线审计（BFS 含动态 import+TS 消费方；现报 10 个死文件待清理立项）。
- L0-B fail-closed：CODE-020 反向类名/021 子组件死代码/022 资源未挂/023 悬空组件标签（模板标签↔import↔文件三向对齐，三全缺=BLOCK）。COMP-001 fail-open。
- 🔴 SFC 模板区提取禁用 lazy `/<template>([\s\S]*?)<\/template>/`——具名插槽的 </template> 提前截断、后续标签全丢（0ca84358 三例实锤：union 漏生成+pruneDead 误删 import+内容根误判）。统一用 `utils/sfc-template-extractor.js` 边界法（首 <template> → <script|<style>）。
- 图表 type 值只改 series 元素第一层；`grep -E` 代替 `\|`（BSD 陷阱）；jest spec 不得 import 含 import.meta 的模块（sfc-semantics）。

## AI 模型 / 修复
- 不带 config 入口走 resolveTextConfig 兜底；温度不硬编码；agent 失败返 200+success:false，前端须判。

## 测试 / 约定
- commit 标 #code#/#reqcode#/#note#[类型]，AI 加 #ai-coding#；绝不用 git add -A；中文技术化：根因+文件:行号+验证证据；风险操作前列 A/B/C 清单授权；产物三处同步（backend+frontend 副本、less+css）。

## 布局事实数据流（R1-2，2026-09-11 固化）
- 根容器类不再靠词尾猜（`ROOT_SELECTOR_RE`/`detectContentRootClass`）：单一事实源 = `buildDeterministicIndexTemplate` 返回 `{template, rootContainerClass, sectionRoots}` → `input._indexTemplateFacts` → generateCode `indexTemplateFacts` → execute `rootLayoutFacts` → pipeline.context → `fixSectionHeightsForResource` 规则② + `normalizeRootContainerLayout`。词尾猜测仅 LLM 回退路径兜底。
- planner 双重解释去重新增 sourceNodeIds 交集判定（`dedupeDuplicateSections` ① 分支，优先于 tabs 措辞兜底）；`collectSourceNodeIds` 在 subcomponent-planner 产出。
- R3-B 版本护栏：`start-node.js` 启动打印 dist 构建时间 vs src mtime（STALE 打 WARN）+ git hash；产物 `component-meta.json.codeVersion` 记录 `{gitHash, distBuildAt}`。排障「旧 dist 产物被当新代码效果」先看这个。
- 既有 bug（code-healer.js:819）：`quoteBareObjectKeysInVue` 改用 extractSfcTemplate 后残留 `tplMatch.index` → ReferenceError 炸穿生成；正确写法 `vueContent.indexOf(body)`。
