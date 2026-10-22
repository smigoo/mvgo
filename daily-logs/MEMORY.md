# mvgo 速查（2026-10-22d｜详判据 `PIPELINE-DETAIL.md`（§装配层刀具详判据 10-22 / §装配层详判据 10-21 / §判据索引详版 / §K-L-M-N）｜归档 `MEMORY-full-archive-*`｜排障走 `mvgo-*-triage` Skill｜事件细节 `YYYY-MM-DD.md`）

> 本文件只放**一定会踩的**单行索引；凡有文件/行号/判据细节的，一律去 `PIPELINE-DETAIL.md` 对应小节。

## 硬约束
- 🔴 不得自行部署（重启 :13030/:2610、同步生产、`git push`）→ 等指令；交付必须说「已改完，未部署」。
- 🔴 治本非产物直改；自愈器须可辩驳判据 + 阳性对照；判据同构单一来源（副本 ≥2 份 = 事故温床）。
- 🔴 文本命名无关（契约 09-30）：只认 `type` TEXT/CHARACTER。角色唯一来源 `splitTitleValueByStyle`（不可辨返 null）。

## 环境
- 根 `/Users/smigoo/工作/mvgo`：backend-node(:13030) / frontend(:2610，`build:safe`)。
- 🔴 node 版本号会变，先 `ls ~/.workbuddy/binaries/node/versions/`。跑 npm/node 必须 `env -i PATH="…/<ver>/bin:/usr/local/bin:/usr/bin:/bin" HOME=/Users/smigoo NODE_OPTIONS="--max-old-space-size=2048" <cmd>`（否则 shim 卡死/137）。jest 加 `--runInBand --forceExit`（禁配 `--maxWorkers`）。
- 鉴权 `token` 头（非 Bearer）；`/api/tasks` 在 `data.tasks`；不设 `FIELD_ENCRYPTION_KEY`；AI 凭证 `data/ai-config.json`。
- 生产网关仅 GET/POST；前端 base `/mvgo/` + history。`nest build` 任一类型错中止整个 emit；判 dist = `grep -E` 新符号。
- 🔴 真机起后端**必须** `node <仓库根>/start-node.js`（`node dist/main.js` 会静默退出 502）。日志 `server.log`（追加、UTC）。

## 判据索引（单行；详版见 PIPELINE-DETAIL 对应小节）
- 🔴 两段式铁律：「合并/收敛 → 门禁」两侧必须同一实现。LESS 圆括号三件套；验证须 `less.render` 真编译。file-writer 回退三级：last-good → code-chunks → 兜底模板。
- 🔴 改 prompt/规范前「加载链三查」：生效根 `references/**`；`prompts/agents|references/**` 是死文件。
- 🔴 主题色门禁：`mc-check.cjs` 白名单只读 `css-vars.js` dark；三核心 less#dark 与 js#dark 同写；skill 副本两份同改。审计 `npm run verify:theme-color[:recent]`。
- 🔴 多主题真值在 `dualTruth.themes[].nodeData`；`// 自动添加（语义推断）` = 非真值；`auditSemanticGuessSlots` 挂 `check` 之后。
- 🔴🔴 加新入参必查下游每层解构 + 白名单/initialState（漏一层 = 静默丢弃零报错）。`generateCode` 用 `input.x`、`execute` 用裸变量。
- 🔴 透传自检三铁律：区间锚点命中===1 / 每跳阳性对照 / 计数用「含字段行数」。方向类判据判「DOM 真实子项排布」；heal 翻转全部出现点。配额判据收集与裁剪解耦。
- 🔴 E1 只提升容器类型；孤儿段 `name` 才是文案（断言 `text ?? name`）。`:deep()`/`scoped` 在微码全局注入下是死规则 ⇒ 同名 class「后写者胜」= 覆盖不可证 ⇒ 确定性产物类名必须组件内唯一。
- 🔴 R24/刀 41/刀 51/刀 52 唯一有效挂载点 = `file-writer.js#writeFiles`（pre-write 后还有 4 个覆写/回退步骤）；刀 41 须 per-file 循环前整体跑；刀 50/52 几何裁决共用 `resolveStackGeometry`。R24 破图三成因 + 内容守卫 `ownerSectionId` 三判据 + `figmaRoot` 断路教训 ⇒ 详 PIPELINE-DETAIL「R24 / 破图 / 内容守卫」。
- 🔴🔴 几何/真值判据必须挂真机日志计数行（evaluated/hits/skipped），否则零命中与零问题不可区分；离线探针手工塞入参 = 假绿闭环。
- ✅ 装配层刀具：F1 展平 / 刀 37④渐变 / 刀 38 边框 / 刀 39 bg尺寸 / 刀 40 重复声明 / 刀 41 折叠网格 / 刀 42 面板三件套 / 刀 48 嵌套块 / 刀 49 图标槽位 / 刀 50 段内几何 / 刀 51 标题行 / 刀 52 父容器堆叠 / **刀 53 同构段确定性接管（folded-grid-section-takeover.js，跳 LLM chunk，数据内联+类名唯一+标题左对齐，2026-10-22）** ⇒ 详 PIPELINE-DETAIL「2026-10-22 装配层刀具详判据」。
- 🔴🔴 `getFigmaBox` 形态陷阱（四元齐全，裸 `{width,height}` 判 null）；`resolveSectionFlexSize` 取 sourceNodeIds 并集。
- 🔴 真机 DOM 验证入口 = `/preview/<componentId>?sessionId=<sid>&groupId=<gid>`（`:2610`）；`.mc-gen/screenshots/*-rendered.png` 是早期快照不可当验收。

## 诊断手法
- 门禁三查（形状量化/日志留痕/离线探针）；0 命中必配阳性对照；改判据先纯函数 A/B。改的人和验的人用同一正则 = 假绿闭环。
- 🔴 判据叠两层后，前层阳性对照会被后层掩盖 ⇒ 加兜底后重造可观察对照。
- 🔴 既有 flaky/failed（别算自己引入）：`thinking-escalation` / `build-node-layout-facts-integration` / `manifest-auditor` / `file-writer` 2 例 / `less-variable-checker` 1 例 / `quality-score-v1` 1 例 / `pipeline-regression-0908` P5-1~4 / `-0907-l6` T6b/T6c。归因法：`git stash push -m <tag> -- <全集>` → 基线 → **立即 pop** → `stash list` 必空 + 符号 grep。
- spec 禁 tryRequire 假绿；引 validator/logger 链 ⇒ `jest.mock('../../config/backend-root.js', ..., {virtual:true})`。
- 判生产 dist 一致 = 逐文件 md5 清单 diff（`tr -s ' '` 归一化）。僵尸进程：`ps -eo pid,cmd | grep -E '...' | grep -v grep | wc -l`。

## 陷阱
- BSD grep `-E` 无 `\b`、无 `\|`；`sed -i ''`；`git commit -m` 禁 `$(...)`；heredoc 展开 ⇒ 用 Write。
- 🔴 生产部署三件套：`COPYFILE_DISABLE=1 tar --no-xattrs` / 回滚锚 `dist.bak.<短sha>-<时间戳>`（按 `.build-stamp` 认锚）/ 验收 = 新 PID + 启动晚于 dist mtime + 符号 grep + `api=200`/`tasks=401` + 无僵尸。
- 取图：`resources/images/mc-preview.png`；`.mc-gen/screenshots/<taskId>-rendered.png`；`/api/component/:id/file?path=<rel>&raw=1`。

## 文本样式（R19）
- 🔴 唯一真值源 `utils/text-runs.js`；判「落位」不判「存在」；三坑（浅/深多定义、只取顶层声明、多子组件全错才报）；严重级 WARN。
