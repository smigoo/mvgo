# mvgo 速查（详判据 docs/PIPELINE-DETAIL.md｜排障 mvgo-*-triage skills｜细节 memory/YYYY-MM-DD.md）
> 子仓 backend-node/frontend/docs 各自独立 Git。本文件刻意压缩，细节下沉上述三处。

## 硬约束
- 🔴 不得自行部署（重启/生产同步/构建上线/git push）⇒ 交付必说「已改完，未部署」；仅用户明确授权才重启本地服务。
- 🔴 治本非产物直改＋可辩驳判据＋阳性对照；判据单一来源；只认 type TEXT/CHARACTER；角色唯一 `splitTitleValueByStyle`。
- 🔴 提交必显式列路径（禁 `git add .`）；先子仓后主仓；主仓指针 `-dirty` 是并行 WIP，message 注明。
- 🔴 Git 交付分支可配置，默认 `go-dev`（永不落 `main`）：任务选项 `deliveryBranch` > `mvgo.project.json`→`delivery.branch` > 内置默认；11-04 核查四仓均无 `go-dev`。
- 🔴🔴 几何/真值判据必挂真机日志计数行（塞入参=假绿）；改的人=验的人同正则=假绿。

## 状态（11-05）
- 生产：前端 11-03 15:25 构建（回滚 `mvgo.bak.20261103-1525`）；Node **11-05 08:21 部署 `da19f6e`**（pm2 2158109，回滚 `dist.bak.da19f6e-20261105-082056`；回 3502de2 用 `dist.bak.3502de2-20261104-080443`）。⚠️ 生产 backend-node 目录会被多会话同时操作（11-05 08:20 两会话同刻各部署一次）。
- 🔴 **本地多会话重启互踩（11-05 15:0x 实锤）**：并行会话会跑**逐字相同**的重启验证命令 ⇒ 一度并存 4 个 `dist/main.js`（含本会话 EADDRINUSE 空转的那个）。**重启前先 `pgrep -fl "start-node|sleep 30|dist/main.js"` 确认无他会话在重启；`kill` 后等 2–3s 再复核 `lsof`/`pgrep`（SIGTERM 可能延迟生效，勿凭单次快照判定"kill 无效"）**——本次误判"无权限"而二次 kill，打死正在跑 Figma 任务的服务，2 条任务 failed「服务重启导致任务中断」。
- 本地 :13030 跑 dist（改源码须 build+重启）；:2610 Vite；:8080 java；Mongo `brew services start mongodb-community`。
- git：主仓 main `5dbffe9e`；子仓 backend-node `da19f6e`(**ahead 37**)/docs `c595253`(23)/frontend `4fec696`(10)，均未 push。常驻并行 WIP：`microcode-engineer.js`(G14a nestedExempt)、`section-tree.js`/`section-anchor-truth.js`/`section-anchor-identity.js`、`app.module.ts`(注册 v3)、未跟踪 `src/ai-engine-v3/`+`data/project-runs/`、`quality-score-v1.js`+.spec、`data/api-catalogs/*`、`data/figma-node-cache/*`、`dist.old-*`/`dist.bak.*` —— 勿 commit/勿 revert。后端提交链见 `git -C backend-node log --oneline`。

## v3 项目管线 /project-lab（M1=S0+S2，本地已跑通；11-05 已随 `da19f6e` 上生产但**休眠**：`NODE_ENV=production` + 开关 unset ⇒ 模块不注册，路由实测 404）
- 开关单一来源 `project-dev-only.guard.ts#isV3ProjectExposed()`：①`AI_ENGINE_V3_PROJECT_ENABLED` 显式 true/false → ②未声明时 `NODE_ENV !== 'production'`；`app.module.ts` 注册与控制器守卫**调同一函数**（否则「已注册但守卫 404」静默失效）；未开放抛 404。
- 扫描器 `scanner/s0-scan.js` == `outputs/s0-scan.cjs` 逐字节（md5 `52b7788b33e800c3d1a19b291c6b8e9d`，`health()` 现算比对）；assets `**/*.js` 自动进 dist。**改扫描器必同步 md5 常量**。
- 产物落 `data/project-runs/<runId>/`（`PROJECT_RUNS_ROOT` 可覆盖）；**绝不写用户项目目录**；`manifest.S0.readOnly` 由扫前扫后 `snapshotTree/diffSnapshots` 自证（口径不跳 `.git`）。
- 🔴 `freeze()` 字段名必须是 `digests`（指纹 Map）；`artifacts` 留给 `inspectRun()` 的文件数组——混用会让指纹校验静默恒假。`verb=ANY` 三处留痕（`x-mvgo-verb-inferred`/`stats.verbDefaulted`/`x-mvgo-verb-note`）；`decisions.md` 追加式、同 id 末条生效；指纹排除 `decisions.md` 与 `REQUIREMENTS.md`。
- 🔴🔴 **conflicts.md 形态**：缺口块 `- **选项**：` + `  - A 文本`；冲突块选项在 `**要你定**：…请选 A（…）/ B（…）/ C（…）` 行内 ⇒ 前端 `parseSegs` **必须先剥「列表前缀 + `**` 强调」再分类**（旧实现被 `^-\s+` 吞掉 ⇒ 选项全丢、裁决退化成盲输）。

## 全局响应信封（跨功能，踩过）
- 🔴🔴 `common/response-envelope.interceptor.ts` 把 controller 返回值**再包一层**：`{success,code,message,data:<返回值>,source}`。业务字段在**外层 `data`**；前端解包须三特征 `('data' in d && 'code' in d && 'source' in d)` 同时成立才剥。漏剥症状＝「接口 200 但页面全空白且无报错」。

## 关键契约（只留跨切面陷阱，其余见 PIPELINE-DETAIL.md）
- 刀33 锚点单一来源 `sectionAnchorCandidates`；刀53 新 kind 四处登记（`FG_TAKEOVER_CLASS_RX`＋计数分支＋reject-summary HIT_KEYS＋mc-check.cjs 内嵌正则）；刀55 列表方向几何真值优先；刀54 段内分区 🔴 只归一 `member.box`，`run.box` 仍是画布绝对坐标 ⇒ 消费者以 `member.box` 为准；资源变量绝不拼静态 style/JSON。
- 🔴🔴 A4 高度比例（`a347671`+`8b20c59`）：**编排层缓存短路必须补跑 A4**（`mc-component-graph-phase2.js` `_uiCache?.previewAnalysis` 分支），否则 reuseCache 全失效；`slotAncestorHeightFor` ≤4 跳只升级；🔴 `WRAPPER_RE` 不放松 `slot-*`。
- 🔴🔴 刀17：`collectDeclaredBindings` 必须 `splitTopLevel` 且字符串感知（裸 `split(',')` 让数组中段误登记 ⇒ R2 失效 ⇒ CODE-025 静默）。
- 🔴🔴 `CodeStructureValidator.validate` 两键 `resourceDomMapping`(事实源)/`resourceMapping`(幽灵引用独用)**必须同时传**。
- 🔴 杂项：语义别名守卫须接在 `file-writer.js#safeLessVarValue` 的 N3 丢弃判定**之前**（primary 分治：kebab `@color-primary`→`#1890ff`、驼峰 `@colorPrimary`→`#409EFF`）；两档豁免禁回退名字白名单、过滤用 filter 不能靠 dedupe；P3 面板自持 `buildPanelInlineCss` 单一来源；结构维度不可自动修复（`scoreStructure()` 不产 issues）；`nodes` 子项只罚少不罚多；高级选项三字段四处齐落、`requirementDocText` 永不进列表；`SIZE_POLICY_VERSION` 改 default 必 +1；块注释内禁 `*/`。

## 环境/陷阱
- 🔴 npm/node/jest 一律 `env -i` + 显式 PATH(`~/.workbuddy/binaries/node/versions/22.22.2-6/bin:/usr/local/bin:/usr/bin:/bin`) 与 HOME；jest `--runInBand --forceExit --testPathPatterns`（复数）；Bash cwd 每次重置 ⇒ 绝对路径/`git -C`。
- 🔴 常驻 node 服务须**同一 Bash 调用里先跑 rename 探针**再 spawn（EPERM 风暴＝spawn 时沙箱态继承、终身不愈），`dangerouslyDisableSandbox`+`env -i`；`start-node.js` 只 spawn 不 kill ⇒ 先 `lsof -tiTCP:13030` TERM 并轮询端口释放。ps 被拦 ⇒ `pgrep -fl`/`lsof`。
- 🔴 /tmp 下脚本解析不到项目依赖 ⇒ `createRequire('<repo>/backend-node/package.json')`。
- 🔴 生产 ECS `root@47.98.216.206:65522`；pm2 日志 `/root/.pm2/logs/backend-node-{out,error}.log`；长命令 `echo <base64>|base64 -d|bash`。
- 前端发布 `build:safe`（`--emptyOutDir false`）⇒ dist 叠加态，按 `dist/index.html` 引用入口定版；打包 `tar --no-xattrs --uid 0 --gid 0`；判据禁用被 minify 改名的函数名。
- BSD shell：grep 多模式必 `-E`（`\|`/`\b` 静默失效）；`sed -i ''` 静默失效⇒用 python3；`PIPESTATUS` 空⇒紧接 `EXIT=$?`；`find -not -path './.git/*'` 挡不住嵌套子仓 ⇒ 用 `'*/.git/*'` 或 `-prune`。
- 基线 21 套件/36 用例环境失败；`FAIL` 去重 `sed -E 's#^FAIL +##; s#^src/##' | sort -u`；tsc `allowJs` 未开 ⇒ `npx tsc -p tsconfig.build.json --outDir /tmp/nbcheck`。

## 原型线（outputs/）
- 🔴🔴 两层产物：`<scan>/spec/*` + `doc/*.draft.md` 是**扫描快照**（重跑整篇覆盖）；`spec/decisions.md` 是**决策层**，扫描器只读不写。
- 🔴 手写数字自证不了自己：每个数要么派生要么删掉；跨文件引用必须配断言钉回真值＋阳性对照。演示 HTML 的 `PROTO-DATA:BEGIN/END` 由 `build-prototype.cjs --write` 生成，`--check` 漂移 exit 1；画板引用一律 `fileKey + nodeId` 双键。验证器 `/tmp/artifacts-verify.rb` 117 PASS；v3 `/tmp/v3-project-harness.cjs` 45 PASS。
