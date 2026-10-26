# mvgo 速查（2026-10-23e｜详判据 `PIPELINE-DETAIL.md`｜归档 `MEMORY-full-archive-*`｜排障走 `mvgo-*-triage` Skill｜事件细节 `YYYY-MM-DD.md`）

> 只放**一定会踩的**单行索引；带文件/行号/判据细节的一律去 `PIPELINE-DETAIL.md` 对应小节。

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

## 判据索引（单行；详版见 PIPELINE-DETAIL 同名小节）
- 🔴 基础族判据（详版见 PIPELINE-DETAIL「判据索引详版」）：① 两段式铁律「合并/收敛 → 门禁」两侧同一实现，LESS 圆括号三件套须 `less.render` 真编译；② 主题色门禁白名单只读 `css-vars.js` dark，less#dark 与 js#dark 同写；③ 多主题真值在 `dualTruth.themes[].nodeData`，`// 自动添加（语义推断）` = 非真值；④ E1 只提升容器类型，孤儿段 `name` 才是文案（断言 `text ?? name`）；⑤ 覆盖缺口只算**叶子 section**且**判定在 TEXT 级**，Figma 根不算叶子容器。
- 🔴 改 prompt/规范前「加载链三查」：生效根 `references/**`；`prompts/agents|references/**` 是死文件。
- 🔴🔴 LESS「Operation on an invalid type」（e2c61f62，`73420b3`，已闭环）：源头 `code-healer#healThemeMixinVarRefs` 自指双写 + 防线 `theme-color-guard#healBusinessStyleVarsInCss` 惰性 `[^)]+?` 吞右括号。刀 A = `safeMixinVarFallback` 三级取值 + 不认得 `return null` 跳过；刀 B = `isNestedVarFallback` 两处入口最先判、整段 `return m`。探针 `scripts/verify-calc-e2c61f62.mjs`（19 断言，含 E4 阳性对照）⇒ 详「LESS 编译门禁根治」。
- 🔴🔴 加新入参必查下游每层解构 + 白名单/initialState（漏一层 = 静默丢弃零报错）。`generateCode` 用 `input.x`、`execute` 用裸变量。
- 🔴🔴 「组件加载失败 / `'import' and 'export' may appear only with sourceType: "module"'」（mc-max-1792934332868-389dd460，`d3d103a`+`db6c46a`，已闭环）：**vue3-sfc-loader 按扩展名定 sourceType**（`.js`=script / `.mjs`|`.ts`=module）⇒ `.js` 里顶层 ESM 必抛。双层同治、判据独立：① 管线侧 `file-writer.js#sanitizeFileContent` **4J 分支**剥「独占一行的 `</?template|script|style>`」（比 4L-b 窄：JS 里 `<div>` 合法；行级豁免行内字面量）；② 加载器侧 `frontend/src/utils/sfc-loader-esm-js.js#resolveJsModuleTypeOverride` 双闸（只 `.js` ∧ 行首 ESM 标记 ∧ `new Function` 抛 SyntaxError）⇒ `getFile` 返 `{type:'.mjs',getContentData}` 走 `getResource` 类型覆写口。🔴 `</script>` 两模式都解析不了 ⇒ 单层修不了。🔴 `.js` 在三管线零防护（`sanitizeFileContent` 只 `.less/.css/.vue`；`stripLlmTailGarbage` 显式跳 `.js`；`microcode-engineer` 语法循环只 `.vue`）。🔴 `createJSModule` 未从包导出 ⇒ 类型覆写口是唯一挂点。探针：spec 10/10 + 前端离线 16/16；两态差分 **必先 `wc -l` 确认捕获非空**（`2>&1 > f` 顺序错 ⇒ 0 字节 ⇒ diff 假绿）。
- 🔴 透传自检三铁律：区间锚点命中===1 / 每跳阳性对照 / 计数用「含字段行数」。方向类判据判「DOM 真实子项排布」；heal 翻转全部出现点。配额判据收集与裁剪解耦。
- 🔴 E1 只提升容器类型；`:deep()`/`scoped` 在微码全局注入下是死规则 ⇒ 确定性产物类名必须组件内唯一。
- 🔴 装配层刀具唯一有效挂载点 = `file-writer.js#writeFiles`（pre-write 后还有 4 个覆写/回退步骤）；刀 41 须 per-file 循环前整体跑；刀 50/52 几何裁决共用 `resolveStackGeometry`。R24 破图三成因 + 内容守卫 `ownerSectionId` 三判据 + `figmaRoot` 断路 ⇒ 详「R24 / 破图 / 内容守卫」。
- 🔴🔴 几何/真值判据必须挂真机日志计数行（evaluated/hits/skipped），否则零命中与零问题不可区分；离线探针手工塞入参 = 假绿闭环。
- ✅ 装配层刀具：F1 展平 / 37④渐变 / 38 边框 / 39 bg尺寸 / 40 重复声明 / 41 折叠网格 / 42 面板三件套 / 48 嵌套块 / 49 图标槽位 / 50 段内几何 / 51 标题行 / 52 父容器堆叠 / 53 同构段确定性接管 / 53b 纯文本叶 / 53c 纯 icon 叶 / 53d 统计行整行接管 / 53e 列式表格整表接管 ⇒ 详 PIPELINE-DETAIL。
- 🔴🔴 **刀 53 家族接管改模板 class 却不维护 stylesheet** ⇒ 接管段全裸样式 + 旧规则成孤儿（见「接管后样式失配」；**孤儿侧已由刀 53h 闭环**）。
- 🔴🔴 `splitTitleValueByStyle`（section-tree.js）入参形状 = `{text, fontSize, y}`，**不是 Figma 原始节点**；喂错 ⇒ 恒 null ⇒ 判据假性零命中。
- 🔴 卡内横竖排/间距一律**几何判定**（x 区间不交叠且 y 区间有交集 ⇒ 横排；间距按实际序取正向值，禁止两侧公式取 min）。
- 🔴 刀 53d/53e「整行/整表」按 `parentId` 分组**两阶段决策**：组内 memberIndex 最小者渲染，其余 `display:none`。真值 x 最小成员常不在 plan ⇒ 只认 index===0 会让整行变空。
- ✅ 刀 55 plan 外编造副本（`utils/plan-orphan-guard.js`）：名 ∉ plan 名集合 ∧ 文本集合是某 plan 组件 Y **子集** ∧ Y 唯一 ⇒ 删文件 + 摘 index.vue 标签/import（复用刀 54 文本抽取器，避免两份实现）。挂 ⑳，无 plan ⇒ fail-open ⇒ 详「刀 54/55/56/57」。
- ✅ A 方案 plan 层覆盖门禁（`utils/section-plan-coverage.js`）：挂 `subcomponent-planner.js` plan 落定处（双链路同一入口）。①② 覆盖缺口/兄弟重叠**只诊断**；③ 纯文本行段锚点膨胀**确定性修复**。🔴 ①② **不做补建**（v-for 假阳实锤）。③ 137 组件零命中 ⇒ 详「刀 54/55/56/57」。
- ✅ 刀 53 家族已接 vue3（`b16a2a6`）：判据族/渲染器/终裁出口与 microcode 同一实现（`_fgTakeoverFiles` 由 `writeFiles` 自动带）。🔴 唯一差异 = **vue3 子组件名 LLM 自由** ⇒ **禁止照搬 microcode「tag 即文件名」**（恒零命中 = 假绿）；映射唯一实现 `matchFgTakeoverTargets`（名命中跳 chunk / 产物 `data-section-id` 命中覆写；主组件 `package/index.vue` 硬护栏）。prompt 侧 `b0d4ae4`：**只下发接管名** + 锚点规则与命名解耦。开关 `MVGO_VUE3_NAMING_CONTRACT=0`；评测台 `scripts/ab-vue3-prompt.mjs`（无密钥 ⇒ 下发名须从 A 臂 prompt 反解）。
- 🔴 `collectLeafSections` **只递归 `isLayoutContainerSection` 为真的段**（`isLayoutContainer:true` 或 `layoutSource==='container-rebuild'`）⇒ fixture 构造容器段必须带该标记。
- 🔴🔴 `getFigmaBox` 形态陷阱（四元齐全，裸 `{width,height}` 判 null）；`resolveSectionFlexSize` 取 sourceNodeIds 并集。
- ✅ 刀 54 硬编码文本门禁（`utils/hardcoded-text-gate.js`）：truth = Figma 全树 TEXT 全集（不依赖 plan 归属）；两级阀 `group-majority-untruth` + `file-majority-untruth`；**多位数字不放行**；挂 ⑲（双链路）。`business-text-rules#isTextAllowedByRules` 零消费者（死代码）⇒ 详「刀 54/55/56/57」。
- 🔴 真机 DOM 验证入口 = `/preview/<componentId>?sessionId=<sid>&groupId=<gid>`（`:2610`）；`.mc-gen/screenshots/*-rendered.png` 是早期快照不可当验收。
- 🔴 **离线重放语料三陷阱**：① 权威副本在 `temp-components/<sessionId>/<taskId>/`（`frontend/workspace/custom-components/` 是交付副本，可能被修过）；② `figma-node-data.json` 顶层 `{fileKey,nodeId,cachedAt,document}` ⇒ 遍历必须走 **`.document`**；③ plan 真实入参 = **`.checkpoint/visual.json.layoutStructure`**，`.checkpoint/analysis.json.subComponentPlan` = 真机落盘 plan（比 server.log 更硬）。
- ✅ 方案 F 文本删除形态扩维（`section-content-guard.js#removeTextBinding`）：三类（静态 / Mustache 整段 / `removeBorrowedDataRows` 整行）+ **声明行删除正则用标识符 root** + 删引用与剪 import 同处完成 + borrowed **按文件聚合** ⇒ 详「刀 54/55/56/57」。
- 🔴🔴 **方案文档里的判据只能当假设，不许照抄**：f98f7463 C 方案写「列容器同宽 ±2」，实测 4 列宽 179/98/98/98 ⇒ 照抄恒零命中假绿。落地版：同高±2 + 同 y±2 + x 严格递增（允许 ≤2px 咬合）+ 各列 TEXT 数相同且 ≥3 + 跨列逐行 y 对齐 ±2 + **父的全部直接子项都在同一行带**（`band.length===sibs.length`）。
- ✅ 刀 53e 列式表格整表接管（`detectTableLeaf`）：判定顺序 grid→header→statrow→**table**→text→icon；列宽按 **`width/列宽和`** 转百分比。`FG_TAKEOVER_CLASS_RX` 加 `table` ⇒ 4 消费者自动生效 ⇒ 详「刀 54/55/56/57」。
- ✅ 刀 56 字面量漂移（`hardcoded-text-gate.js#pickSiblingTruthCandidate`）：同字段 CJK 真值兄弟 + truth 中**唯一**最小编辑距离缺失真值 ⇒ 全文替换字面量；**先于 strip**（否则文字颜色双丢）。🔴 字面量 ∈ truth 不配对；heal 循环 `next` 初值须 `null`；spec fixture 须让 name 值进 truth ⇒ 详「刀 54/55/56/57」。
- ✅ 刀 57 面板标题槽位归属（`panel-chrome-misplacement.js#healPanelTitleSlot`）：五判据 ⇒ slot 改挂 `#title-left`；挂 ⑮-c；default-panel `header-title` 加 `v-if="!slot['title-left']"`（现有产物 0 个用 ⇒ 零回归）。🔴 前端 build:safe 堆上限须 ≥4096（2048 必 OOM）⇒ 详「刀 54/55/56/57」。

## 接管后样式失配（cd8938f8 实锤，2026-10-23；全量报告 `.workbuddy/reports/2026-10-23-layout-fidelity-cd8938f8.md`）
- 🔴🔴 **接管改模板 class 却不维护 stylesheet** ⇒ 接管段全裸样式 + 旧规则成孤儿（第三态「既失效又误导」）。实测：模板 class **48** / 命中样式 **11** / 裸类名 **37** / 业务孤儿 **2**（`.c-device-content-section4`、`-col`，其 `#e2ecfe`/`#bdd5ff` 与真值逐位一致却已失联）。
- ✅ **刀 53h 已闭环「孤儿侧」（commit `8f7acc0`）**：`utils/orphan-style-rule-guard.js`，挂 `file-writer.js#writeFiles` 循环外整体一次（刀 41 后、逐文件循环前），回灌 `filesForWrite`；真机 13 候选 → **2 删 / 11 留 / 4 mixin 跳过 / residual 0**。🔴 只能走**孤儿判定**不能重命名（接管渲染器不读旧模板 ⇒ 无类名映射）；引用池**必须排除 `.css`/`.json`**（否则「永不判孤儿」假绿）；只改 `.less`（`.css` 由下游 `recompileIndexCss` 重生成）。⇒ 详 PIPELINE-DETAIL「刀 53h」。
- ✅ **方向 1 契约扩维（commit `01868d8`）**：`folded-grid-section-takeover.js` table/statrow/grid/header 四分支补 `{bg,border,pad}` 并**内联输出**；`section-tree.js` 导出 `fillsToCss/strokesToCss/nodeAppearanceTruth`。🔴 根因 = **数据契约缺维**（原模型只有 `{text,color,fs,fw}` ⇒ 斑马纹/表头底色/白网格线/卡渐变底全丢）；该代码曾属**未提交悬挂态**，本会话补提交。
- 🔴 两处**死分支**（勿挂错层）：① 判「动态选择器」须看**选择器头原文**（token 正则永不捕获 `$`/`` ` ``）；② 判「动态变体保护」须用**插值前缀干**（`` `c-x--${k}` `` → `c-x--`），挂 `fact.bases` 会被 `referencedByDom` 覆盖 = 恒不触发。🔴 判定手法：模板 `class` 集合 ⊖ `.css/.less` 选择器集合（剔 `.png/.less/.light/.dark/.theme_2/.common` 噪声）；截模板必须 `lastIndexOf('</template>')`。
- 🔴 分析侧同单实锤：`stat-cards` 段元素绑定错位到 **TEXT 子节点**（`flexGrow`=文本宽度比、`figmaHeightPx`=文本高、`repeatedFill #a6ceff`=图例 dot 色），同文件 `device-table` 段准确 ⇒ **错误集中于「items 类卡片组」**；门禁全绿（96/19-19）却漏两类（叶段真值有 bg/border 而产物零声明；同 y 兄弟被渲成纵向 stack）⇒ 详「接管后样式失配」。

## 诊断手法（详 PIPELINE-DETAIL「诊断手法」/「本机 shell 陷阱」/「环境 / 运维」）
- 门禁三查（守卫形状全语料量化 / 日志 id 留痕 / 离线探针三态）；🔴 0 命中必配阳性对照（变异须打在真正生效的那一层）；改判据先纯函数 A/B；判据叠两层后前层对照会被后层掩盖 ⇒ 加兜底后重造对照。改的人和验的人用同一正则 = 假绿闭环。
- 🔴 **prompt 阴性断言禁用例行通配字面量**（如 `package/components/`）；只认**下发块标题串**；A/B 评测台须从 **A 臂 prompt 文本反解**下发名。
- 🔴 既有 flaky/failed（别算自己引入）：`thinking-escalation` / `build-node-layout-facts-integration` / `manifest-auditor` / `file-writer` 2 例 / `less-variable-checker` 1 例 / `quality-score-v1` 1 例 / `pipeline-regression-0908` P5-1~4 / `-0907-l6` T6b/T6c。归因：路径级 `git stash push -m <tag> -- <全集>` → 基线 → **立即 pop**（或两态差分对跑）。spec 禁 tryRequire 假绿；引 validator/logger 链 ⇒ `jest.mock('../../config/backend-root.js', …, {virtual:true})`。
- 🔴🔴 **全量 `env -i` 基线恒有 22 套失败 / 36 例**（10-23 实测）——别当回归。全是**环境类**：`join(dataDir…)` 得 undefined（`json-parser`/`safe-logger`/`code-parser`/`model-config` 链）+ logger mock 路径（`generation-context-assembler-rowpeers`）+ Nest 服务套无 env（`config.*`/`component.service`/`phase2.service`/`tasks-config-snapshot`/`api-binding.service`/`http-exception.filter`）+ 上述 flaky 名单。归因法：`git checkout <base> -- <被改文件>`（+移开新增文件）→ 跑 → **`git checkout HEAD -- .` 恢复**，两态 `FAIL` 集合 `diff` 须为空。
- 判生产 dist 一致 = 逐文件 md5 清单 diff（`tr -s ' '` 归一化）；僵尸进程 `ps -eo pid,cmd | grep -E '…' | grep -v grep | wc -l`。

## 陷阱
- 🔴 BSD grep：多模式用 `-E`（`\|` **静默空**，老坑已踩 N 次）；`\b` 同样不支持（用 `[^A-Za-z]`）；`sed -i ''`；`git commit -m` 禁 `$(...)` + 子仓指针须 `git add <submodule>`；heredoc `${}` 会展开 ⇒ 用 Write。
- 取图 `/api/component/:id/file?path=<rel>&raw=1`；`mc-preview.png` = 设计图、`.mc-gen/screenshots/<taskId>-rendered.png` = 产物预览。
- 🔴 生产部署三件套：`COPYFILE_DISABLE=1 tar --no-xattrs` / 回滚锚 `dist.bak.<短sha>-<时间戳>`（按 `.build-stamp` 认锚）/ 验收 = 新 PID + 启动晚于 dist mtime + 符号 grep + `api=200`/`tasks=401` + 无僵尸。
- 离线探针跑 `figma-node-data.json`：`node <probe> <json路径> "<id>:depth=N"`（argv[2] 必须是路径）。

## 文本样式（R19）
- 🔴 唯一真值源 `utils/text-runs.js`；判「落位」不判「存在」；三坑（浅/深多定义、只取顶层声明、多子组件全错才报）；严重级 WARN。（详 PIPELINE-DETAIL「G. 文本样式 R19 补充」）

