# mvgo 速查（细节→ docs/PIPELINE-DETAIL.md ｜ memory/YYYY-MM-DD.md ｜ mvgo-*-triage skills）
> 子仓 backend-node/frontend/docs 独立 Git。

## 流程硬约束（用户指令）
- 🔴 **修改前六问评审**：①根治/补丁 ②判据落层 ③补丁防什么、根治项是什么 ④上游（入参/结构不变、新输出纯附加）⑤下游（消费者/剥除范围严格限定）⑥其他类型逐条枚举不命中＋真错仍 FAIL。逐条落交付说明，不得把补丁报成根治。
- 🔴 **测试反馈后四问回检**：①有效（真值/产物/日志三证，不凭状态单证）②撤回否（无效/回归⇒给回滚建议）③殃及否（回归 spec+相关产物抽查）④次生缺口登记为下一根治项。逐条落回复。
- 🔴 **每步交付附「受影响组件测试清单」**：直接命中＋同管线受扰面＋建议重发任务（含回归锚），不漏低概率形态。
- 🔴 **所有修改同步 vue3/mc × max/lite 四象限**：总分叉 `lite.controller.ts:329`(max)/`:553`(lite)；vue3-max 双入口跑同张 `mc-component-graph-vue3.js`（Vue3Service 跳过 less 预编译）；两张 max 图各一份须分别改；lite 私有 `.checkpoint/lite-state.json`；`/phase2/refine` 仅 mc-max 可靠。禁只改 mc-max 报「已支持」。
- 🔴 **不得自行部署**（重启/生产同步/构建上线/push）；仅用户明确授权才重启本地。交付必说「已改完，未部署」。
- 🔴 治本：非产物直改＋可辩驳判据＋阳性对照；判据单一来源；只认 TEXT/CHARACTER；角色唯一 `splitTitleValueByStyle`。判据收紧前先确认修复轮有能力过（配方化=可照抄代码形态+归属段定位，是修复轮唯一实证有效回灌形态；配方必须自适应产物建模差异，指空段=没给）。
- 🔴 **提交**：显式路径（禁 `git add .`）、`git commit -F msg -- <pathspec>`（索引常有他会话 staged 文件）、先子仓后主仓、禁 stash/reset 清场；并行会话会 stash+reset ⇒ 判「改动丢失」须 `git show HEAD:<path>`+`hash-object` 双证，恢复源 `git fsck --no-reflogs`/file-history 快照库。**交付分支统一走 `main`**（11-12 用户指令：撤销原「默认 `go-dev` 永不落 main」规范；`go-dev` 已于 11-12 10:10 并入 main 并删除本地分支，四仓一律 `main`；仅留 `backup/pre-merge-go-dev-20261112-100759` 作回滚锚）。**发布前必校验当前分支 + 产物来源分支**（11-12 生产前端误用 go-dev 构建 ⇒ main 独有的「任务反馈/续跑徽章/单元拆分」整块消失）。
- 🔴 **`git commit -- <pathspec>` 取【工作区】内容、绕过 index**（11-13 实锤踩坑）：同一文件混有他人 WIP 时，即使 index 已用 `git apply --cached` 精确到 hunk，`git commit -- path` 仍会把**工作区全量**写入提交 ⇒ 他人 WIP 被我方提交污染。正确姿势：① `git diff -U3 <file> > full.patch` ② python 按 hunk 切出自己那几段 → `mine.patch` ③ `git apply --cached mine.patch`（或 `git hash-object -w` + `git update-index --cacheinfo 100644,<blob>,<path>`）④ `git commit --amend -F msg`（**不带 pathspec**，让它取 index）⑤ 把含他人 WIP 的工作区版本 `cp` 回来（提交前务必先备份）。验证：`git show HEAD -- <file> | grep '^@@'` 逐 hunk 对账 + `diff -q` 与备份逐字比对。
- 🔴 几何/真值判据必挂真机日志计数行（塞入参=假绿）；改的人=验的人同正则=假绿。

## 状态（11-12）
- 本地 :13030 跑 dist（改源码须 build+重启）；:2610 Vite；:8080 java。生产：前端 11-03；Node 11-05 `da19f6e`；⚠️ 生产 backend-node 目录多会话同操作。
- **组件生成质量线**（详见 memory/2026-11-12.md）：acceptance 门禁现有 G2 props 断链、E3-v4 v5（bg 只许挂直接父级 ancestorIds[0]，祖先 FAIL）、E2-v3 前景零消费 FAIL＋hardConstraints 挂载配方（含归属段不存在⇒建宿主容器指令）、G1-v2 carrier 三级解析、C1b 祖先链定位；T09 插槽去重 corpus 纳入 index.vue。已实证：修复轮一轮 FAIL=0（ce185bd1）。待办：P0#1 C1 代码片段误报（`$emit('legen`、`/>` 被当展示文本）、P1 段内子块顺序（「今日累计」标题定位、「产品描述」重复）、6f4a2525 三项视觉（环形图挤压/面板遮挡数字/预测tab空胶囊）、ce185bd1 图标偏大 P2。
- 常驻并行 WIP 勿 commit/勿 revert：microcode-engineer.js、section-tree/anchor 系列、app.module.ts(v3)、ai-engine-v3/、project-runs/、quality-score-v1、dist.old-*/dist.bak.*。
- 🔴 **main↔go-dev 差异定性（11-12 复核结论）**：`merge-base(main, go-dev)=a13f28a=go-dev HEAD` ⇒ go-dev **完全在 main 祖先链内，无提交丢失**；`git diff go-dev main` 的 33 文件差异全是**内容级**（main 后续演进），非遗漏。唯一「go-dev 有、main 缺且需移植」= 页脚「实验室」入口，已按 go-dev 形态恢复（frontend `cb62107`，`labLinks` 补回 meeting `devOnly:false`）。判别口诀：`git diff --numstat` 第 2 列(DELETED)>0 才是 go-dev 独有内容；main 侧新增文件=更晚功能。`AppHeader.vue` 不在差异清单 ⇒ 「大屏布局」在 header 是两分支共同决策，非合并遗漏。生产门禁：`/api/v2/pipeline`、`/api/v3/project`、`/api/meeting/runs/*` 生产 404 ⇒ 实验室下拉中 components-test / project-lab 必须保持 devOnly（与 go-dev 生产行为逐字一致）。

## 关键契约（跨切面陷阱）
- 🔴 响应信封：controller 返回值再包 `{success,code,message,data,source}`；前端三特征同时成立才剥（漏剥=接口 200 页面全白）。
- 🔴 archiver@8 纯 ESM ⇒ jest 加载 project-pipeline.service 须 `jest.mock('archiver',...)`；spec import tasks.service 还须 mock `config/backend-root.js`（否则整套件 0 运行）。
- 🔴 unit id 只由锚点派生（中文目录名 slug 后塌成 'c'）；`readProjectFigmaUrl` 与 s0-scan 判据逐字同源；`freeze().digests` 字段名。
- 🔴 A4 高度比例：编排层缓存短路必须补跑 A4；`WRAPPER_RE` 不放松 slot-*；刀17 `collectDeclaredBindings` 须 splitTopLevel 字符串感知；`CodeStructureValidator` 两键 resourceDomMapping+resourceMapping 同时传；刀54 段内分区只归一 member.box。
- 🔴 conflicts.md 选项解析：先剥列表前缀+`**` 再分类。
- v3 /project-lab：开关 `isV3ProjectExposed()`（注册与守卫同函数）；改扫描器必同步 md5 常量；产物只落 `data/project-runs/`。

## 环境/陷阱
- 🔴 npm/jest 用 `env -i`+显式 PATH(`~/.workbuddy/binaries/node/versions/22.22.2-6/bin:/usr/local/bin:/usr/bin:/bin`)+HOME；jest `--runInBand --forceExit --testPathPatterns`；Bash cwd 重置⇒绝对路径/`git -C`。
- 🔴 常驻 node：spawn 前同一调用内 rename 探针（EPERM=spawn 时沙箱态终身继承），`dangerouslyDisableSandbox`；**启动器须删 NODE_OPTIONS**（shim broker.sock 生命周期<进程，vite 11-12 00:16 实锤）；冒烟 curl `--noproxy '*'`（502=代理劫持）；重启前 `pgrep -fl` 确认无他会话在重启、kill 后等 2-3s 复核。
- 🔴 构建：先移 `tsconfig.build.tsbuildinfo`，后验 `ls dist/main.js`+`find dist -type f|wc -l`(~1379)+新符号 grep；`.js` 源码走 nest assets 不进 tsc；改 ESM 具名导出必须同轮构建验证。
- 🔴 BSD：grep 多模式 `-E`；`sed -i ''` 失效⇒python3；退出码落文件取（PIPESTATUS zsh 空）；判据阴阳对照用未过滤原始输入；基线断言用 `in`。
- 生产 ECS `root@47.98.216.206:65522`；pm2 日志 `/root/.pm2/logs/`；长命令 base64 落地；前端 `build:safe`（emptyOutDir false），旧 dist 用 mv 留回滚不 rm。

## 原型线（outputs/）
- 扫描快照（`spec/*`+`doc/*.draft.md` 重跑覆盖）vs 决策层 `spec/decisions.md`（扫描器只读不写）；手写数字必派生或删；画板引用 fileKey+nodeId 双键；`PROTO-DATA` 由 build-prototype.cjs 生成/--check 防漂移。
