# mvgo 速查（2026-10-03 精简，全量归档 MEMORY-full-archive-2026-10-03.md；详判据 PIPELINE-DETAIL.md；排障 mvgo-*-triage Skill）

## 硬约束
- 🔴 不得自行部署（重启 :13030/:2610、同步生产、`git push`）→ 等指令；交付说「已改完，未部署」。
- 🔴 治本非产物直改；自愈器须可辩驳判据 + 阳性对照。
- 🔴 文本命名无关（契约 09-30）：只认 type TEXT/CHARACTER；命名仅限 bg/icon/img 与 `@` 技术栈。角色唯一来源 `splitTitleValueByStyle`（不可辨返 null）。

## 环境
- 根 `/Users/smigoo/工作/mvgo`：backend-node(:13030) / frontend(:2610, `build:safe`)。
- 🔴 node 用 `versions/22.22.2-5`（-3 已删）；执行用 `bash -c 'cd <abs> || exit 9; export PATH=".../22.22.2-5/bin:/usr/local/bin:/usr/bin:/bin" HOME=/Users/smigoo; cmd'`（Bash 沙箱 NODE_OPTIONS shim 卡死；cwd 每条漂回仓库根）。jest：`NODE_OPTIONS="--max-old-space-size=1536" npx jest <spec> --runInBand --forceExit`。
- 鉴权 `token` 头（非 Bearer）；`/api/tasks` 在 `data.tasks`；不设 FIELD_ENCRYPTION_KEY；AI 凭证 `backend-node/data/ai-config.json`。
- 生产网关仅 GET/POST；前端 base `/mvgo/` + history。`nest build` 类型错中止整个 emit；判 dist = grep 新符号。

## 判据索引
- `collectSubtreeTexts` 三类真值（文案/样式/几何，无 isTitle）。
- 产物三处同步（workspace×2 + 快照）须 diff，含 `resources/styles/index.css`。
- 资源挂载：`ownerSectionId`⨯`data-section-id` 恒取；幂等护栏 `isResourceRendered`；重复 sid `anchorOwnerRank`。K/L/M/N 详判据 → skill `mvgo-resource-mount-layer-triage`。
- 副本纪律：同判据 ≥2 份=事故温床；`techStackRequiredPatterns` 单一来源（element-coverage-validator，已导出）。
- 技术栈接管 #78：`techstack-section-contract.js`；table 契约成功才吸收（fail-open）。
- 10-03 治本三件：① 循环 import 门禁 `findEntrypointCircularImports`（子组件禁 import 父 index.vue，正解 `$mcComponentBuilder()`）；② `style-conflict-detector.js`（字号乘数 calc + 跨文件同名 class）挂 pre-write-self-healing 只报不改；③ `section-content-guard.js#checkTechStackContractTags`（techstack 契约 per-section 断言；全产物 0 个 data-section-id ⇒ fail-open；**corpus 级 ElementCoverageValidator 是死代码勿依赖**；违规进 meta.contentMappingIssues.techStackTagViolations 只留痕）。

## 诊断手法
- 门禁三查（形状量化/日志留痕/离线探针）；0 命中必配阳性对照；判定域≠事实落点必查；改判据先纯函数 A/B（只答有没有用不答该不该判）。
- spec 禁 tryRequire 解构假绿；引 validator/logger 链 ⇒ `jest.mock('../../config/backend-root.js', ..., {virtual:true})`；并行 WIP 用显式路径 checkout 不用 stash。

## 陷阱
- BSD grep `-E` 无 `\b`；`sed -i ''`；`git commit -m` 禁 `$(...)`；子仓指针 `git add <submodule>`；heredoc 展开 ⇒ 用 Write。
- 取图：设计图 `resources/images/mc-preview.png`；预览 `.mc-gen/screenshots/<taskId>-rendered.png`；`/api/component/:id/file?path=<rel>&raw=1`。
