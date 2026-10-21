# mvgo 速查（2026-10-21c｜**详判据 `PIPELINE-DETAIL.md`（§A-G 装配层 / §判据索引详版）**｜全量归档 `MEMORY-full-archive-2026-10-21c.md`/`-21b`/`-10-03`｜排障走 `mvgo-*-triage` Skill｜事件细节 `YYYY-MM-DD.md`）

> 本文件只放**一定会踩的**；凡有文件/行号/判据细节的，一律去 `PIPELINE-DETAIL.md` 对应小节。

## 硬约束
- 🔴 不得自行部署（重启 :13030/:2610、同步生产、`git push`）→ 等指令；交付必须说「已改完，未部署」。
- 🔴 治本非产物直改；自愈器须可辩驳判据 + 阳性对照。
- 🔴 文本命名无关（契约 09-30）：只认 `type` TEXT/CHARACTER。角色唯一来源 `splitTitleValueByStyle`（不可辨返 null）。

## 环境
- 根 `/Users/smigoo/工作/mvgo`：backend-node(:13030) / frontend(:2610，`build:safe`)。
- 🔴 node 版本号会变，先 `ls ~/.workbuddy/binaries/node/versions/`。沙箱 `NODE_OPTIONS` shim 卡死 node ⇒ `env -i PATH="…/22.22.2-6/bin:/usr/local/bin:/usr/bin:/bin" HOME=/Users/smigoo NODE_OPTIONS="--max-old-space-size=2048" <cmd>`（否则 137）。jest 加 `--runInBand --forceExit`（禁配 `--maxWorkers`）。
- 鉴权 `token` 头（非 Bearer）；`/api/tasks` 在 `data.tasks`；不设 `FIELD_ENCRYPTION_KEY`；AI 凭证 `data/ai-config.json`。
- 生产网关仅 GET/POST；前端 base `/mvgo/` + history。`nest build` 任一类型错中止整个 emit；判 dist = `grep -E` 新符号（BSD grep 无 `\|`）。
- 🔴 真机起后端**必须** `node <仓库根>/start-node.js`（自补 NODE_ENV/MONGODB_URI/DEV_AUTO_LOGIN + 校验 build-stamp）。`node dist/main.js` 会在 InstanceLoader 后静默退出（502）。日志 `server.log`（追加、UTC）。

## 判据索引（改前必读）
- **副本纪律**：同判据 ≥2 份 = 事故温床。已收敛单一来源：`techStackRequiredPatterns`、`collectSectionFigmaRefs`。
- 🔴 **两段式铁律**：「合并/收敛 → 门禁」两侧必须**同一实现**（L477 合并器只数 `{}` ⇒ 放行缺 `)` ⇒ 6 轮判死 ⇒ 兜底模板 15 行覆盖 641 行）。
- **LESS 圆括号三件套**：`rebalanceOrphanCloseParens` / `healMissingCloseParens` / `scanStandaloneLessDefects`；验证须 `less.render` 真编译。
- **file-writer 回退三级**：磁盘 last-good → `.mc-gen/cache/code-chunks` → 兜底模板。
- 🔴 **改 prompt/规范前「加载链三查」**：`grep -rn "loadMd(" src/` + `referenceFiles` ref 串 + `ls dist/**`。生效根 `references/**`；`prompts/agents|references/**` 是死文件。
- 🔴 **主题色门禁**：`mc-check.cjs` 白名单**只读 `css-vars.js` 的 dark ⇒ 无法按模式分叉**；三核心 less#dark 与 js#dark 必须同写；skill 副本两份同改。
- 🔴 **多主题真值**在 `dualTruth.themes[].nodeData`；`fetchNodeData` 返 **document 本体**；`// 自动添加（语义推断）` = 非真值，`auditSemanticGuessSlots` 必须挂 `check` **之后**。
- 🔴🔴 **加新入参必查下游每层解构 + 白名单/initialState**：漏一层 ⇒ 静默丢弃零报错（实测 secondaryNode、dualTruth）。
- 🔴 `microcode-engineer`：`generateCode` 用 `input.x`、`execute` 用裸变量；写错被外层 catch 吞。
- 🔴 **透传自检三铁律**：区间锚点命中 ===1 / 每跳阳性对照 / 计数用「含字段行数」。
- 🔴 **方向类判据判「DOM 真实子项排布」**（只比 section 自身 ⇒ 恒不命中）；heal 翻转**全部出现点**。
- 🔴 **配额判据：收集与裁剪解耦**；先问「被砍的是不是只有这条通道能下发」。
- 🔴 **E1 只提升容器类型**，裸 TEXT 永不进 section 树 ⇒ `collectTailOrphanTextKids` 补回；孤儿段 `name` 才是文案（断言用 `text ?? name`）。
- 🔴 `:deep()`/`scoped` 在微码全局注入下**都是死规则** ⇒ 同名 class 两处出现「后写者胜」= 覆盖关系不可证。
- 🔴 class 门禁只认 prefixId ⇒ 对自造前缀空转；`auditTemplateStyleClassCrossRef`（只报不改）兜底。

## 诊断手法
- 门禁三查（形状量化/日志留痕/离线探针）；0 命中必配阳性对照；改判据先纯函数 A/B。**改的人和验的人用同一正则 = 假绿闭环**。
- 🔴 判据叠两层后，前一层的阳性对照会被后一层掩盖 ⇒ 加兜底后必须重造可观察对照。
- 🔴 主题色审计 `npm run verify:theme-color[:recent]`；判据直接 import 门禁、不写副本。
- 🔴 **既有 flaky/failed**（别算自己引入）：`thinking-escalation` / `build-node-layout-facts-integration`（共用 `/tmp/mvgo-test-data/model-capability-cache.json` + 去抖落盘）、`manifest-auditor`、`file-writer` 的 `safeLessVarValue` 2 例、`less-variable-checker` 1 例、`quality-score-v1` 的 `extractDeclaredStyleLiterals` 1 例、`pipeline-regression-0908` P5-1~4、`-0907-l6` T6b/T6c。
- 🔴 **归因法**：`git stash push -m <tag> -- <改动全集>` → 跑基线 → **立即 pop** → `git stash list` 必空 + 符号 grep 复核。已实测 3 例为 HEAD 既有失败。
- spec 禁 tryRequire 假绿；引 validator/logger 链 ⇒ `jest.mock('../../config/backend-root.js', ..., {virtual:true})`。
- 判生产 dist 一致 = 逐文件 md5 清单 diff（必须 `tr -s ' '` 归一化）。
- 僵尸进程别用 `ps | grep -c` ⇒ `ps -eo pid,cmd | grep -E '...' | grep -v grep | wc -l`。

## 陷阱
- BSD grep `-E` 无 `\b`、无 `\|`；`sed -i ''`；`git commit -m` 禁 `$(...)`；heredoc 展开 ⇒ 用 Write。
- 🔴 **生产部署三件套**：`COPYFILE_DISABLE=1 tar --no-xattrs` / 回滚锚 `dist.bak.<短sha>-<时间戳>`（按 `.build-stamp` 认锚）/ 验收 = 新 PID + 启动晚于 dist mtime + 符号 grep + `api=200`/`tasks=401` + 无僵尸。expect 里 `[...]`、`$var` 会插值 ⇒ 远端变量用 `{...}`。
- 取图：`resources/images/mc-preview.png`；`.mc-gen/screenshots/<taskId>-rendered.png`；`/api/component/:id/file?path=<rel>&raw=1`。

## 装配层（✅ = 2026-10-21 已实施、未部署；详 §A-G）
- ✅ **F1 行→卡双层重复**：`flattenNestedCollapsedItems` 展平到最内层（组内**每项**内部已有 list ⇒ 展平；要求「全部」）。重放 12/15/6 名单全对。⚠️ 某行卡数 < `minRepeat` 不折 ⇒ 整组不展平（战略 4+2 仍 2 段 = F2）。
- ✅ **刀 38 无 strokes 不得写 border**：`border-without-strokes.js` + 自愈 ⑯；独占 class 才删；`border-radius`/`box-shadow` 不是边框。⚠️ 先 `hasBorderDeclInInline()`，否则分号归一化造 6 处假变更。
- ✅ **刀 39 `backgroundImage` 图标尺寸**：`ensureReferencedIconSize` 扩到 bg 形态；`patched=false` 时调用方**静默 `continue`**，判「没生效」先确认分支被调用。
- ✅ **刀 40 同块同属性重复声明**：`block-duplicate-decl-guard.js` + 自愈 ⑰；删前面留最后（渲染不变、只消歧）。**四豁免**：厂商前缀值 / `var()`/`env()` / `!important` 混存 / 纯色+渐变双层；块内含注释整块跳过。⚠️ **不修视觉**（删 grid 后仍 flex column 散架）——「消歧」与「修正取值」职责分离。
- ✅ **刀 37 ④ mismatch**：只对渐变；`angleGuessed` 时**只比 stops** + 覆盖时保留原角度。
- ✅ **刀 41 折叠网格布局契约**：`grid-list-layout-contract.js` + 自愈 ⑱。治「grid 段方向/卡宽/间距没人管 ⇒ 两轮真机方向正好互换」（T3 对 `isGrid` 直接 `continue`）。真值 = `items[].absoluteBoundingBox`（`sec.items` 与 `sec.body.items` 都认）；自愈写 `display:grid; repeat(N, Wpx)`（**不能写 flex**，否则 LAYOUT-001 转红）。🔴 两条铁律：① **class 被别的元素复用绝不改写**（`frame-2136639905` 双身份；`.mc-gen/cache` 是镜像副本须排除）；② **级联按样式文件顺序合并**，非 class 属性顺序。🔴 行距真值 = y pitch − cardH（50−30=**20**），不是 pitch。🔴 **卡高必须由容器钉死**：`grid-auto-rows: cardH`（缺它 ⇒ 单行网格出「巨型卡」、卡高随文字行数变，真机截图铁证）；grid 实现下**不再判子项 height**（子项常是共享 class，改了就是消不掉的残留）。
- ✅ **刀 42 面板三件套（底色/圆角/外发光）**：A=`container-background-truth.js`（`resolveSectionPanel` 同一次遍历取 bg+`cornerRadius`(+`rectangleCornerRadii` max)+`effectsToBoxShadow`；逐属性判定 `missing-solid`/`missing-radius`/`missing-glow`，**只补空白不猜已有值**）＋ B=`panel-chrome-misplacement.js`（装饰归属反查：自身无面板真值 ∧ `radius==P.radius` ∧ 发光 RGB==P 发光 ∧ owner 唯一 ⇒ 删三件套）。🔴 旧豁免「纯色未声明 ⇒ 交主题变量」是**伪前提**：该层根本没有背景槽位 ⇒ 永远不补。🔴 补 A 不摘 B = 面板里再套同色条，必须成对。`figma-effects.js` = effects→box-shadow **单一来源**（section-tree 已改 import）。块改写复用刀 38 `stripDeclsFrom*`（通用谓词版），class 独占用 `isClassExclusiveTo`。
- 🔴 **面板高度塌陷（未解）**：三段 `flex:0.204/0.268/0.335` 全按**内容高**而非父高（`icon-con` 的 `height:100%` 链上有一环高度不确定）⇒ 属 flex 高度链/`percent-height-resolver`（刀 28）。
- 🔴 **视觉分析路径 = `layoutStructure.layout.sections`**（多一层 `layout`）。三处系统性错：`body.layout` 压平一维 4 项 / `items[].figmaNode` 错位一整级 / `repeatedFill` 幻觉色。`anchorValidation` 100% 只证「id 存在」。
- **刀 36 自嵌套**：删兄弟实例前必须先证「内容被覆盖」；父 div 内另有兄弟段 ⇒ 不触发（别为它放宽判据）。
- **P2 顺序**：`mapChildNode` 照抄 Figma `children`（z-order 非阅读序）、孤儿文本 `push` 恒在末尾 ⇒ 必须 `compareReadingOrder` 重排。
- **P0 空 `<img>`**：`injectResourceImports` 只注入「代码出现过的变量」⇒ `resource-img-src-healer` 三口径补 `:src`（候选不唯一不动）。
- **E1 会抹平 merger**：判 merger 对不对必须看 **merger 后 / planner 前**。
- `buildNodeLayoutFacts`：`layoutMode=NONE` 一律 `geometric-inference`；R23 用 `decideLayoutForBoxes` + `refineDerivedContainerLayout`（只换输入）。
- **R22**：`auditSectionAnchors` 只写新字段 `figmaAnchorId`，**绝不改写 `id`/`figmaNodeId`**（下游拿它作 key）。

## 文本样式（R19，详 §G）
- 🔴 唯一真值源 `utils/text-runs.js`（A/B 形态归一为 `Run`）；勿再写逐字符 walker。通道：折叠段 `_vforData.lines`、叶子段现场取真值。
- 🔴 **判「落位」不判「存在」**；三坑：浅/深多定义任一命中即放行、只取顶层声明、多子组件全错才报。严重级 **WARN**（BLOCK → L0-B → 兜底覆盖更糟）。
