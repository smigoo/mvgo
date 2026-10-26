# mvgo 管线详细判据集（PIPELINE-DETAIL）

> 🔴 本文件是 `MEMORY.md` 的**详细展开版**（按需查阅，不随每次会话注入）。`MEMORY.md` 只留最高频不变式 + 指向本文件的指针；两文件职责不同，本文件存 K/L/M/N 类完整分支、门禁两个坑、布局方向 A/B 数字、取证链与行号。
> 逐日取证见 `.workbuddy/memory/YYYY-MM-DD.md`；管线排障优先用 `mvgo-*-triage` 系列 Skill。

## 环境 / 运维
- 🔴 **硬约束：任何改动不得自行部署**。可改码/跑测试/本地 commit/写文档；重启 `:13030`/`:2610`、同步生产、生产发布、`git push` → 停下等指令。交付须显式说「已改完，未部署」。
- 根 `/Users/smigoo/工作/mvgo`：`backend-node`(NestJS :13030)、`frontend`(Vite :2610)、`docs`；Java :8080。
- 跑 node/npm 必须 `env -i PATH="/Users/smigoo/.workbuddy/binaries/node/versions/22.22.2-3/bin:/usr/local/bin:/usr/bin:/bin" HOME="/Users/smigoo" ...`（避 NODE_OPTIONS shim/代理卡死）。前端构建用 `build:safe`。jest/npx 必须 cwd=backend-node。
- 后端重启：`lsof -ti:13030 -sTCP:LISTEN`→kill→确认释放→根 `start-node.js`→`pgrep -f "node.*dist/main.js"`=1 + `curl :13030/api/tasks` 401=存活。重启前确认无进行中任务。
- `start-node.js` R3-B 护栏只比 `dist/main.js` mtime ⇒ 只改 .js 必报 STALE（假警报）；判生效 = grep `dist/` 目标符号。**不设** `FIELD_ENCRYPTION_KEY`；AI 凭证 `backend-node/data/ai-config.json`。
- 🔴 **`nest build` 的类型错会中止 tsc emit**（dist 整体不更新）——并行会话 WIP 改了 `src/workbench/*` 时必报 `workbench.service.ts TS2739/TS2741`（`ToolContext` 缺属性）⇒ **我的 dist 会停在上一版**。**暴露手法**：grep dist 本次新增的**独有符号**为 0。**绕法**：`nest` 对 `.js` 的 emit = **原样拷贝**（用未改动文件的 `git show HEAD:<f>` vs `dist/<f>` 逐字相同可实证）⇒ **单文件 `cp src→dist` 与重建等价**，且不把并行 WIP emit 进去。事后 `diff src dist` 必须 IDENTICAL。
- 生产 Nginx：`/api` 默认转 Java 8080，属 13030 的路由须写在 `/api` 之前。🔴 **生产网关仅 GET/POST**（其余 405）⇒ 新接口一律 GET/POST + 语义后缀。
- 前端生产 `base='/mvgo/'` + `routerMode:'history'` ⇒ history 路由 URL 必带 `/mvgo/` 前缀（用 `withAppBase`/`getRouteUrl`）；API 走 `/api/*` 无需 base。工作台 `/workbench/*` 走 `App.vue` 独立分支，不渲染全局 `<WorkflowMonitor>`，需页内自挂。

## 不变式（治本，非产物直改）
- 确定性事实单一事实源；视觉确定内容由 facts/assembler 装配，**不能直改生成产物**。删减法：每接管一个事实就删掉对应 fallback 与纠偏器，门禁总量只降不升。
- 「真值集」非最高权威：不可辩驳的几何/结构特征优先。
- 预览事实源优先级 `last-good > candidate > partial > workspace`（直改 workspace 对预览无效）。预览样式 = `/api/preview/{groupId}/{componentId}/resources/styles/index.css` 全量注入 + sfc-loader 编译 `.vue` `<style>`；快照根 = `<仓库根>/temp-components/.task-code-snapshots/<sessionId>/`。
- 产物三处同步：backend/frontend workspace + 快照，须 diff；**同步面必须含 `resources/styles/index.css`**（less 编译产物），改 .less 后须 `index-css-recompiler.js#recompileIndexCss(outputPath)` 重编。
- 资源挂载唯一答案 = `mapping.ownerSectionId` ⨯ `data-section-id`，有命中恒取、不进语义评分。宿主插槽：一个槽名只出现一次，不可加编号/hash。中文 class 出口 `component-naming.js#autoFixNonAsciiClassNames`（只认 class 语境）。
- 🔴 **K 类「资源清单语义坍缩」**（`visual-parser.js` 清单渲染）：清单只渲染 `m.hint`（=`card → card区域`）⇒ 同父名下多条标签**逐字相同** ⇒ LLM 物理上不可区分 ⇒ 必然张冠李戴。**判据：清单里两条标签逐字相同而变量名不同**。治本 = 补 `figmaPath` + `figmaBox` 尺寸 + `⚠️仅此落点 data-section-id`（mapping 里本就有，白拿）。全语料 **1454 → 61 不可区分行**（残留皆良性同资源重复）；**「有不可区分行的组件 = 38.5%」与 `contentMappingIssues` 的 38.5% 完全吻合** ⇒ K 类即那批内容映射问题的根因。
- 🔴 **L 类「scriptSplit 拼接畸形」+ 两条写盘门禁**（`utils/sfc-syntax-validation.js`，接线 `microcode-engineer.js` 内存校验段 `_stripSurplusBlockClosers` 之后 / `validateVueSfc` 之前）：
  · `detectScriptBlockLeakage` —— 每个 `</script>` 到**下一个顶层块开标签**或 EOF 之间剥注释后仍有非空白 ⇒ 泄漏。**必须独立判据**（`@vue/compiler-sfc#parse` 容忍顶层游离文本 ⇒ `validateVueSfc` 全绿而 `onMounted` 永不执行）。
  · `healScriptBlockLeakage` —— 按「能否 parse 成 JS 模块」两形态分流：JS ⇒ `</script>` **后移**；markdown 说明 ⇒ **整段删除**（后移会把 markdown 塞进 script 块）。**🔑 自愈候选不得引入新 script 语法错**（`validateVueScriptSyntax` 前后比对）：泄漏段常与块内已有声明重复 ⇒ 后移触发 `already been declared` ⇒ 退化删除；两者都失败才 `unfixable` 交 fail-fast。**「删标签、保内容」是铁律，禁 `slice` 截断**（实测最长丢 784 字符）。
  · `findHostReservedComponentCollisions` + `HOST_RESERVED_COMPONENT_NAMES`=`['base-panel']` —— 产物 `package/components/<name>.vue` 与宿主**全局注册**组件同名 ⇒ 命中（`base-panel.vue` 自引用宿主外壳 + 自带 `#header-right` = 两个头部插槽）。**名单单一事实源 = 前端全局注册点**（`loadVue3Runtime.js:450` / `preview/index.vue:954`），新增须先确认注册点。
  · 命中都走既有 `syntaxIssues` + `badVueFiles` ⇒ `package/components/*.vue` 由 P1-4 隔离（`isDegradableVuePath` 正则恰好匹配）+ `pruneDanglingSubComponentImports`；`package/index.vue` 不可降级 ⇒ fail-closed 重试。
- 🔴 **M 类「内容归属判据的文案真值」+ 三条越权兜底**（`utils/section-tree.js#collectSubtreeTexts` + `utils/section-content-guard.js`）：
  · **文案真值 = Figma TEXT 的 `characters`，不是图层名 `name`** —— 图层名极不可靠（`t`/`d`/`but-xxx[m]`/`Frame 2136637410`）。真机 `6d7082a1`：§2:3446 的「客车」节点 `name="t"`、`characters="客车"`，邻居 §2:3496 的 `name` 恰是文本本身 ⇒ 只读 `name` 使真值文本全丢 ⇒ 独占性守卫误判「借用」⇒ 自愈器把**它自己的** `客车`/`货车` 从 `CardGrid.vue` 删掉。**认证手段 = 用 `section.sourceNodeIds` 做祖先链取证**（§2:3446 的 sourceNodeIds 本就含 `2:3461`）。`isTitle` 仍按 `t-` 前缀判（翻它=改变 `inline-row-assembler` 确定性装配，须独立一轮）。同源证据：`section-leaf-assembler.js` 文件头已自认该缺陷。
  · 兜底① `checkSectionExclusiveEvidence`：section 子树 `size===0`（`sourceNodeIds=[]` 或指向不存在节点 = **未锚定合成 section**，如 `section-vehicle-type`）⇒ **不判借用**。否则 `ownTexts` 恒空 + `intersects(∅,…)` 恒 false ⇒ 两道豁免同时失效 ⇒ 群体误删。全语料消除 **189 条 / 29 组件**资源误报，新增 0。
  · 兜底② `healDuplicateTextIssues`：`ownerFile` **不在 files 里**或**不在 `renderedIn` 里** ⇒ 跳过（落实该函数 docblock 早已写明、代码从未实现的规则）。🔑 **`assignSectionComponentNames` 的确定性名 ≠ LLM 写盘的文件名**（真机 4 变体全不匹配）⇒ 旧 `filter(p=>p!==ownerFile)` **一个都过滤不掉** ⇒ 对**合法归属**组件照删。
  · 兜底③ `healBorrowedEvidence`（接线 phase2/vue3 两图）：删引用与剪 import **必须同处完成**（`pruneUnmounted` 内置，只删引用不剪 import ⇒ 撞 CODE-022 ⇒ 重试耗尽）；文本侧复用 `removeStaticTextNode`（只认 `>text<`，JS 字符串里的文案保守不删）；`validateSfc` 差分判据任一失败即回退。
  · 全语料 A/B（431 例）：`borrowedText` 误报 **−381**、`borrowedAsset` **−189**、自愈删除 **−269 / +23**（新增仅 2 文本 × 21 变体，逐条已证指向非归属组件）、`COMP-002`（BLOCK）**89→75**（无新阻断类别）、prompt 真值契约 227 组件 / 536 section 由 `t`/`d` 伪文本变真 `characters`、`memberOrder` +12 但**只写 meta + WARN**（无 healer）⇒ 零风险。
  · ⏳ 未做（已定位、有证据）：`isTitle` 不认裸 `t`/`d` ⇒ `member-shape-mismatch` ⇒ 统计行确定性装配从不触发；双归属文本不再触发 `COMP-002` ⇒ 净少 14 条 BLOCK，补它属**放宽 BLOCK 面**、须单独评估。
- 🔴 **N 类「N3 锚点优先」**：N3（bg→父容器强制挂载，`microcode-engineer.js` / `vue3-engineer.js` 的 `let best` 段）此前**自算私有词重叠评分**（`wordsOf(cls) ∩ targetWords`），不看 `data-section-id`/`ownerSectionId` ⇒ 锚点元素 class 与 mountTarget token 覆盖率恒 0 ⇒ **必输给语义祖先** ⇒ 426×91 卡片背景挂到 420×807 整槽再被 `100% 100%` 拉满 = 「背景图整块丢失」。现与 `scoreMountTarget` 的 `DETERMINISTIC_ANCHOR_SCORE=1000` 短路**共用同一函数** `mount-target-scoring.js#selectAnchorMountCandidate`（三态：`null`=无锚点⇒走既有 fallback 逐字不变 / `{skip:true,reason}`=锚点已定性禁注入且**禁退化到语义评分** / `{skip:false,cand}`=锚点干净且资源未渲染）。
  · 🔑 **安全底线 = `var-already-referenced`（该 bg 变量已在任意元素上以 background 形式被引用 ⇒ 不再注入）**：实测 `anchorClean` 里约 1/4 是「bg 挂在锚点**子树内**的 `-bg` 独立层」（透明度归属契约产物）；N3（`microcode-engineer.js:7021`）**早于** `fixPipeline.apply`（`:7473`）的 `dedupe-bg-multi-refs`，而后者 keep 规则**同为锚点优先** ⇒ N3 硬挂锚点会被后续去重判为「层的重复」并剥掉层的 `:style` ⇒ 透明度层语义丢失。**凡「下游有锚点优先的去重器」的上游注入器，必须先自证「已渲染不重复注入」**。
  · 全语料 A/B（1031 产物目录 / 4008 条合格 bg，**按引擎真实可达集计**——锚点分支前还有 `targetWords.size===0` 与 `!hasImage && !fills` 两道 `continue`，裸跑选择器会多算收益）：`null` 3760；skip 桶 193（**其中旧实现会另挂一处 = 159 ⇒ 拦下 159 处重复挂载**）；新动手 25（纯新增 4 / 旧=同点 9 / **旧=不同点 12 = 真收益**）；注入畸形 0。
  · 🔑 **vue3 产物 0 个 `data-section-id`**（全语料 0 命中；只有 `microcode/code-generator.js:665` 容器 + S1 子组件补锚在写）⇒ vue3 侧该改动是**同构前瞻**（恒返回 null，零风险）；**推论：`resource-mounter` 的确定性锚短路在 vue3 路径同样是死代码**（能力缺口，未修）。
- 🔴 **动「共用事实源」（`collectSubtreeTexts`/`indexFigmaNodes`/`buildChildrenMap`/`getFigmaBox`）前必做两遍全语料快照 A/B**：同一 spec 跑前后两次（label 走 env）落 JSON → 按「**字段 × 方向**」聚合（新增 = 风险面，须逐条证伪；消失 = 收益面，按文本聚合看规模）。**「净减少」不是验收依据**。三个必踩坑：① healer **原地改 `content`** ⇒ 每次调用必须传深拷贝；② `figmaRoot` 必须用 `.checkpoint/figma.json`（document 本体），用 `figma-node-data.json` wrapper ⇒ 全 0 结果、会误判「没生效」；③ 报「全语料」数字**必须写分母**（551 组件中 443 有 figma.json、431 可跑全链）。规模感：431 例 / 176MB / `--max-old-space-size=3072` **4~6 秒**。
- 加自愈器/新函数前先 `git log -S '<fnName>' -- src` 查是否被删过。清扫类自愈器必须排在注入器**之后**（注入器只改写已存在规则，前置删空壳会让事实无锚点）。
- WARN 门禁**只报不删**；修复器 filter 出现 `!i.autoFix` = 越权。凡「门禁 BLOCK + 自愈器 0 删除」并存，先查两者是否同源口径。
- 加「出口净化器」必须枚举全部出口（REST/SSE 首连+重连/落库/日志）。按标签/类名匹配必须词边界；裸 `includes` 有劫持族。
- **消费面审计通式**：扩字段取值域必须四类归档 —— 严格相等 / `|| 默认` / 二值三元收缩 / 显式新值分支；只查 `=== 'x'` 必漏破坏点。
- **「占位债」族**（`/* TODO: 补充样式 */`）复活即复发。已收口：`code-validator#stripEmptyTodoRules(cssText)` + `stripEmptyTodoRulesInSfc`（.vue 全部 `<style>` 块），接线 `code-validator.js:2143-2156`。判「空块是死债还是注入锚点」= 对同文案块做「已有声明 vs 仍零声明」两分统计，两半并存 ⇒ 是锚点（只后置清扫，禁提前删）。
- ⚠️ 「P1」同仓两份清单，引用须指明文档：`确定性收回清单-2026-09-16 §7.5`（B15/B7，已做）≠ `评审-四bug-根因与影响面-2026-09-29 §5.1`（Bug1 TODO 填充器）。
- 🔴 **门禁「不可达」的两种成因（必查，两者都零留痕）**：① **守卫字段路径 ≠ 真实数据形态** —— 例 `if (options?.layoutStructure?.sections)` 而真实形态是 `layout.sections`（**443/443** 全语料实锤）⇒ 恒 false、日志 0 次。**判据：任何读嵌套结构的守卫，必须与全仓既有口径对齐**（本仓通式 `layoutStructure?.layout?.sections || layoutStructure?.sections`，见 `subcomponent-planner.js:1434`），并把运行统计挂进返回值，让「跑了没命中」≠「根本没跑」。② **证据源用「整份文件全局正则」** —— 判据只依赖整份文本、**不含循环变量** ⇒ 对同一产物是**全局谓词** ⇒ 要么全报要么全不报（`LAYOUT-001` 的 `horizontal` 分支即此）。**正解：证据源必须按「条目 → 宿主文件/元素」定位**（本仓范式 `data-section-id` 锚）。
- 🔑 **跨文件 CSS 层叠解析口径**（`layout-direction-guard.js`，可复用）：方向取值 = inline `style` > `:style` 绑定（**窄解析 JS 对象字面量**，解析不出即放弃）> class 规则（同文件 `<style>` 块 + **`common.less`** + 其它 `less/css`）。⚠️ **方向常写在 `common.less` 而非组件自身 `<style>`** ⇒ 只查同文件必漏。歧义（多 class 冲突）⇒ **不判**。类名→选择器块复用 `layout-facts-injector#extractFlexProps`（已 export），标签扫描复用其 `matchTemplateTags`（已 export，属性顺序无关、引号内 `>` 不截断）。

## 布局方向（09-30 专项，已大部分闭环）
- 单一来源：`sections[].layout` 只认 `figma-node-layout-facts#buildNodeLayoutFacts`。⚠️ 依赖成环 ⇒ 由 `subcomponent-planner#plan` 算好传入。
- **三态范式（照抄）**：判据 ← `code-generator.js:648-661`（`layoutKind ∈ {horizontal,vertical,grid}`，否则 **null 且不内联 display/方向**）；护栏 ← `layout-facts-injector.js:90-115`（无有效方向不写 + 清残留 `undefined|null|NaN`）。
- ✅ 已修：`280cdf4`（写产物层四分支 h/v/grid/null + `deriveChildGridColumns` 仅容器）；`a5de83e`（容器分支去硬编码）；`6ca660b`（`extractLayoutMetadata` 字符串感知 + 三态，**`horizontal*` 必须前缀匹配**——语料有 `horizontal-2-columns`，全等会误落 null；`microcode-engineer` 1108 已加 `if (meta.direction)` 护栏，否则打印 `flex-direction: null`）。
- ① ✅ **已收口（换证据源 + 先 WARN）**：旧 `LAYOUT-001` 是**死代码**——守卫读顶层 `layoutStructure.sections`，而真实形态是 `layout.sections`（443/443 实锤，顶层命中 0）⇒ 可达面 0、日志 0 次。**新证据源 = 该 section 宿主 `.vue` 的根元素（`data-section-id` 定位）上「实际生效」的方向，按 CSS 层叠取值**（同文件 `<style>` + `common.less` + 其它 less/css，**必须跨文件**——实测 `.c-traffic-monitor-card` 方向写在 `common.less`）。检测器独立成 `utils/layout-direction-guard.js`（+28 例 spec），severity 先 **WARN**，fail-open 六种情形一律不判（真值空 / grid / 宿主未物化 / **根元素未显式声明方向** / 多 class 冲突 / 内部异常）。真值口径与 `extractLayoutMetadata` **逐字同源**（`grid*` 的方向真值**也是 null**，网格事实走 `gridColumns` 通道 ⇒ 另设「网格被排成 flex」「列数不符」两项检查）。**`gridColumns` 读取统一为 `sec.gridColumns ?? sec.body?.gridColumns`**（旧门禁只读 body 命中 **23** / 统一后 **71**）。全语料 443 份：`judged` **466** / `mismatches` **0**；**阳性对照证明「0 命中」非盲**。⚠️ 校验须传 **`productFiles`（全量）**，传增量 `files` 会裁掉宿主 ⇒ 门禁空转。🔴 **覆盖率诚实边界**：section id 两形态 —— A Figma 纯 id（`2:3683`，可锚）/ B 语义合成 id（`header-section` 等，**天然无锚**）⇒ truth 2390 中可锚 1510、**实际找到宿主 481（20.1%）**；差额是「未独立物化成带锚组件」而非漏判，**补它只能靠名字模糊匹配＝猜 ⇒ 刻意不做**。⚠️ 锚按代际：最近 1–2 天产物 **100%** 带锚，无锚全是 09-27 前老产物。详见 `docs §8.10`。
- ② **叶子栅格靠 LLM 手写**：`constraint-reinforcement.js:60-70` 明令 LLM 手写 `display:grid;grid-template-columns:repeat(N,1fr)` ⇒ 改确定性注入须同批删这条铁律与 prompt 文案（漏删 = 双写错乱）。
- ③ `resource-mounter.js:2842` 的 `facts.flexDirection || 'column'` 是**既有有意设计**，改它属写产物层行为变更，须先量化影响面。
- ④ ✅ **已结案（保留 `column`，不改 null）**：`chart-section.js` / `nav-section.js` 合成的 section（id `chart-*` / `nav` 在 Figma 树**不存在**）**自带** `layoutMetadata` ⇒ **完全绕过** `extractLayoutMetadata`（全仓**仅** `subcomponent-planner.js:1116` 容器 / `:1134` 叶子两处调用）、**不受「无事实→null」三态约束**；且 `microcode-engineer.js:1108` **直读** `sec.layoutMetadata` **不重算** ⇒ 其 `direction` **会进 prompt**（改 null 是真改产物，非 no-op）。对 `nav` 是与自身 semantics 一致的真值、对 `chart` 是 vacuous 但无害 ⇒ 保留（源码注释 + `docs §8.8.11`）。
- ⚠️ `elementStyleMap` 相关：`isLayoutContainerSection` 判定偏差 ⇒ 后果是「**提示缺失**」非「写错值」（无门禁、无报错，故长期静默）。⚠️ **`elementStyleMap` 不只有 prompt 消费者**：还被 `adversarial-checker.js` 的 `_checkStyleCoverage`/`_checkMixedLayout` 消费（high ⇒ `needs_revision`）⇒ 任何「让它多写属性」的改动必须先 `grep -rnE "elementStyleMap" src/` 枚举全部消费者。详见 `docs §8.9`/`§8.9.7`。

## 管线要点 / 复发模式
- E1 选根 `section-tree#findRootFrame`：doc 自身是容器且有 children ⇒ doc 即根（GROUP 也算）。
- header 三道防线：节点名 `/header/i` → vision type 回填 → 几何兜底 `utils/header-geometry-fallback.js`；装配 `code-generator.js:459` 只认 leaf `type==='header'`。
- 图表子组件样式豁免：`style-class-consolidator` 以 `/echarts/.test(sfc)` 标 `isChartComponent`。**52px 三层通道全堵**（bc33c27d）。
- LessCompileGate：heal 在 createFileManager **之前**；`healUnclosedLessComments` 8 行窗口扫描（splice 后**禁用**「已处理下标集合」跳过，偏移会漏修）。
- `componentId` = `c-<语义段>-<尾8hex>`（`sanitizeComponentId` 单点）；任务号污染判据 `/\d{13}/`。⚠️ class 级污染 `c-mc-max-<13位>-<8hex>` 不在旧判据覆盖内（旧式 `\bc-(mc|mv)-[0-9]{13}` 恒空 ⇒ 假通过），正解 = 查 `class="…[0-9]{13}…"` 并与基线同形对比。
- 静默吞异常=P0；「自愈 N 处」≠ 生效（自愈 vs 回退 1:1 即全废）。「属性消失」= 多 pass 写入口拉锯 + 整批覆写回退 ⇒ 写入口收敛 + 删越权修复器 + 回退粒度细化。
- 背景：bg = 宿主容器 CSS 背景；`healStandaloneBgLayers` 迁移须先于 `healAbsoluteOverlayParents`；同父多子层注入必须 Map 记账合并。absolute 背景层宿主须 `position:relative`，补丁在**后生成阶段**补跑。
- **透明度契约**（d368e7d8）：透明度只属 bg 层（容器 relative + `<firstCls>-bg` 层），严禁挂容器 class；定位/透明度一律 inline 写 `:style`，**禁写 CSS 规则**（预览注入链不可靠）；幂等 = 层 `:style` 已含 `position`；真值不唯一 → fail-open。
- 锚点标签正则禁嵌套量词 ⇒ `findTagBySectionAnchor` 线性扫描。`ownerSectionId` 不总是真 section ⇒ 禁「锚点缺失即 fail-closed」。循环结构导出前必须净化 `__parent` 反链。

## 诊断手法
- 🔑 **判某门禁「活不活」三查**（缺一必误）：① 守卫形状全语料量化；② 日志 id 留痕（L0-B 逐条打印 issue id ⇒ 「查不到」是有效负证据）；③ 离线探针三态（真实形状 / 假定形状 / 合成触发）。工具在 skill `mvgo-deterministic-replay-triage/scripts/`。
- 🔑 **门禁「改完 0 命中」必须配阳性对照**（否则「健康」与「仍然瞎」不可区分）：把真实产物里**证据源那一层**故意改错 ⇒ 断言 `mismatches 0 → 1` 且**文件/section 定位正确**；再补合成用例覆盖每类判据 + 每类 fail-open。⚠️ 变异必须打在**真正生效的那一层**（`LAYOUT-001` 首轮变异打在 class 规则上、门禁没开火，反而是「层叠顺序实现正确」的反证）。
- 🔑 **门禁「判定域 ≠ 事实落点」必查**：门禁读 A 域、事实写在 B 域 ⇒ 一放开就成群误杀。定量法 = 全语料模拟判定，按「A 无 B 有」分类误判数。
- 🔑 **两态差分对跑**（证「零行为变化」最强证据）：临时 spec 把函数输出写 `/tmp/x.json` → 跑「改动后」→ `git checkout -- <单文件>` 回 HEAD 再跑 → `diff` → `cp` 备份恢复。比 `git stash` 安全（不碰并行 WIP）。⚠️ **旧逻辑要在探针里内联逐字副本**，别去改他人文件。
- 🔴 **模拟 prompt 旁路必须逐字照抄该行的取值路径**（读谁 / 是否重算）：曾把 `microcode-engineer.js:1108` 代理成「按 `extractLayoutMetadata` 重算」，而生产是「**直读** `sec.layoutMetadata`」⇒ 造出**实际不存在**的改善项（已在 docs §8.8.11-B 作废）。凡代理某行，先抄它的取值表达式。
- 🔑 **混合工作区提交隔离**：`git diff` 按 hunk 切分（保留 `diff --git`/`index`/`---`/`+++` 头，只留自己的 hunk）→ `git apply --cached /tmp/mine.patch`。**严禁**对他人在改的文件用 `git checkout --`。
- 🔑 **量化口径纪律**：`forEachLeafSection` 递归排除容器 = 生产语义；统计前按 `generatedAt` 剔除历史快照（assembler 透传 `layoutMetadata` 修复日 = **2026-09-16** ⇒ live 口径 = generatedAt ≥ 该日）。同一问题不同口径曾差 64 倍。**「全语料审计」前先数不同输入**（1069 个组件目录只来自 7 个 Figma 设计）。
- 🔑 **真机 A/B 的可归因面只有计划层**：两轮之间最大变量是模型侧 ⇒ 产物级 diff 一律不可归因，真机只答「有没有退化」；要主张因果 ⇒ 比 `.checkpoint/analysis.json` 的确定性派生。**归因前必看 `chunk-meta.json`**（`segmentType`/`index` 是否跳号，决定 `<template>` 是模型直出还是装配器合成）；判「真 A/B」用 `component-meta.json#codeVersion.gitHash`，不靠时间戳。
- jest 只跑 `.spec.ts` ⇒ `*.test.js`/`*.spec.js` 永不运行，别当回归证据。ESM 源 spec 撞 `import.meta`（`logger.js`→`config/backend-root.js`）会让整套件加载失败 ⇒ import 前 `jest.mock('../../logger/index.js', ...)`。命令：`cd backend-node` + `NODE_OPTIONS="--max-old-space-size=1536" npx jest <spec> --runInBand --forceExit`。⚠️ tsc/jest 基线有时效，判「我有没有引入问题」必须用路径级回退后**现跑**的基线。
- `server.log` 取段按**行号窗口**（挂 `wc -l` 基线 → 触发 → 新窗口）；`promptChars`/BLOCK 行不含 sessionId，按 sid 过滤会漏 95%。`GET /api/tasks/status/<sid>` 字段在 `data.task.*`。真机 lite/max 实测 83–90s（视觉缓存命中）。`Duplicate slot names found.` N 条 ⇒ N+1 个同名槽。tsc 既有错全在 `*.spec.ts`。
- 🔴 整段函数体逐字提取**不能用朴素花括号计数**（正则 `\{([^}]*)\}` 会让 `[^}]` 计成 -1）⇒ 用 JS 感知扫描器（跳过注释/字符串/正则字面量）。
- ⚠️ **「改判据修 X」前必须先跑纯函数 A/B 证伪**（反面教材，2026-09-30）：`isTitle` 认裸 `t`/`d`
  曾被当作「统计行确定性装配**从不执行**」的根因。全语料 898 产物 / 2702 section 对
  `assessStatRowConfidence` 跑 A/B（改前 `/^[tT]-/` vs 改后 `+ /^[tT]$/`）⇒ **零影响**
  （`beforeHigh === afterHigh === 20`，双向 flip 均 0）。裸 `t`/`d` 各 **346**（成对 ⇒ 设计稿约定）
  但**不在被评估的横向 section 成员子树内**。**真瓶颈 = `member-shape-mismatch` 的「成员子树文本数 ≠ 2」**
  （成员粒度 / 文本收集），reason 分布：`not-horizontal`(1754) > `title=0,value=0`(子树无文本)
  > `title=0,value=1`(仅 1 个文本)。另：`beforeHigh=20>0` ⇒ 「从不执行」的说法本身不准确。
  **配方（最小可复用）**：复刻目标纯函数的**全链**（私有依赖 `isHorizontalSection`/`collectMemberIds`/
  `subtreeHasImageResource` 一并复刻）+ **参数化被改判据** + 全语料跑 before/after 分布；
  数据源 = `<组件>/.checkpoint/analysis.json#subComponentPlan.effectiveSections` + `figma.json`（即 figmaRoot）。
  结论已固化到 `section-tree.js#collectSubtreeTexts`（🔬 段）与 `section-leaf-assembler.js` 文件头。
- 📋 **未立项缺口**：统计行装配的「**成员子树文本数 ≠ 2**」（真瓶颈，`member-shape-mismatch`）。
- 📋 **vue3 零锚点（修正表述）**：vue3 产物**无 `resource-dom-mapping.json` 落盘**（398×2 全 0；微码 551 中 514 有），
  且产物由 **LLM 生成**（`Vue3Engineer`）**无确定性容器模板** ⇒ 无 `data-section-id` 注入点。
  （`ownerSectionId` 唯一生产方 `figma-connector.js:2425`；落盘 `:1650-1653` 与路径无关 ⇒ 生成期内存里有。）
  要修需新增「section ↔ DOM 映射」推导 ⇒ **新能力建设，立项**。

## 本机 shell 陷阱
- BSD `grep`：多模式用 `-E`（`\|` 静默空）；**`\b` 同样不支持**（用 `[^A-Za-z]`）；`sed -i ''`；heredoc `${}` 会展开 ⇒ 用 Write 写脚本。
- 🔴 `git commit -m` 禁写 `$(...)`（zsh 先替换会写坏消息），改完 `git log --oneline -1` 复核。子仓指针提交必须 `git add <submodule>`。`.gitignore` 只有行首 `#` 是注释。

## 质量评分面板 / 图片取源
- 「设计图」= `resources/images/mc-preview.png`；「产物预览」= `.mc-gen/screenshots/<taskId>-rendered.png`。
- 取图走 `/api/component/:id/file?path=<rel>&raw=1`（允许 dotfiles）；`/api/component/:id/preview` 不存在。评分抽屉深色固定主题 `#0f1722`（次要文字 `#a3b8cb`/`#c5d5e5`）。

## 大屏布局（`/screen`）
- 前端 `frontend/src/views/screen-layout/`（绝对定位编辑器 + 8 预设 + wireframe 雏形 `index.vue:80-97`）；后端 `backend-node/src/screen-layout/`（service/controller）+ `ai-engine/agents/layout-responsive-agent.js` + `graphs/layout-responsive-graph.js`。
- 接口仅 `download` / `analyze-spatial` / `analyze-responsive` / `progress/:sid` / `download-responsive/:sid` ⇒ **后端仍然没有自然语言入口**（一句话生成 / 增量修改是纯前端规则解析，见下）；后端输入仍是「已摆好坐标的 ScreenLayout」。
- 🔴 `types/screen-layout.ts` 的 `outputScaleMode` 已扩为 `contain|fillWidth|fillHeight|none|fluid|hybrid`（2026-09-30 起 `fluid` 为默认，双轴自适应走 `fluid`/`hybrid`）；历史上曾与 `ai-engine/prompts/layout-responsive-prompt.md`（流式派：`fr`+`clamp()`+`minmax(0,1fr)`+断点）**哲学互不相通**（UI 选择器 ≠ 产出代码）。
- 规则引擎 `ai-engine/utils/layout-spatial-analyzer.js`：Y 聚类行 / X 聚类列 / 重叠四分类（major/intentional/minor/edge_touch）/ Zone 树 / 断点建议 / 复杂度评分。
- 🔑 「XY 都自适应」正解 = `fluid`/`hybrid`（骨架弹性、内容不变形），**不是 `stretch`**（`scaleX≠scaleY` ⇒ 圆变椭圆、字变扁）。六类参数契约中**只有「适配策略」与「兜底」值得反问用户**。歧义（如「左边两栏右边两栏」）**不弹窗追问**，改为「先按最可能理解渲染 + 一键切换其他理解」。详见 `docs/大屏布局快速生成-体验方案-2026-09-30.md` + 原型 `outputs/screen-layout-ux-prototype.html`。
- 前端模块清单（2026-09-30 全部落地）：`utils/nl-layout-parser.ts`（`parseLayoutPrompt` 从零生成 + 原子助手 `scanWeights`/`scanGrid`/`scanHFHeight`/`scanSide`/`fitWeights`/`createMiddleZone`）、`utils/nl-layout-refine.ts`（`parseRefine(current, cmd)` 增量修改）、`utils/export-standalone-html.ts`（单文件 HTML 导出）、`utils/clipboard.ts`（带降级路径的复制）、`composables/useLayoutPersistence.ts`（本地存档 + URL 分享）、`components/{PromptQuickGen,LayoutWireframe,AdaptivePreviewModal}.vue`（PromptQuickGen 的 create/refine 两态复用同一输入框）。
- 回归入口：`cd frontend && npm run check:screen`（解析器 **144** + 导出器 **52** 断言；用 `ts.transpileModule` 跑**真 TS 源**，不是另写 JS 副本）。跨文件依赖靠自建 `Module` + 覆写 `m.require` 注入 —— `Module.prototype._compile` 内部走 `mod.require(path)`，所以实例上覆写有效。
- 有兜底的解析函数**不能无条件调用**：`parseFitMode` 恒返回一个值 ⇒ refine 里必须先过意图守卫（`FIT_CUE`），否则任何命令都会被判成「要改适配策略」。`parseSize` 则用 `clue === null` 自证未命中，可直接调。**改解析器前先跑 `check:screen`。**
- refine 走**普通赋值**而非 `resetHistory`：`useHistory` 的 deep watch 会自动把新状态入撤销栈 ⇒ Ctrl+Z 能退回修改前。`applyPresetObj` 那套（`resetHistory`）只适合「从零换一套预设」，用于连续微调会让用户回不去。
- 先剥头尾词再做区域增删：`rest = cmd.replace(HEADER_WORD|FOOTER_WORD, ' ')`，否则「加个底栏」的「个」会被区域正则当成单位。区域单位表**刻意不含「个」**。列数变化时被裁列的 zone **迁到最后一列**，不静默丢组件。
- **hybrid 的纯 CSS 表达**：`clamp(var(--kmin), var(--kmax), calc(var(--kmin) * 1.1364))` —— clamp 天然是条件分支（val&lt;min 取 min、val&gt;max 取 max），正好表达「比例差 ≤12% 时吃掉留边，否则等比内接」。导出器全程只做等比缩放，**绝不做非等比拉伸**；导出内容必须 HTML 转义（文件会被直接双击打开，是真实攻击面）。
- **`navigator.clipboard` 只在安全上下文存在**（内网 http 下是 undefined）⇒ 复制功能必须留 `execCommand` 降级，否则在真实部署环境静默失效。
- **`codePreview` 截断会让「复制代码」变成复制半截代码**：`screen-layout.service.ts` 原 `substring(0, 500)` → 已提到 20000（**需重启才生效**）。**前端加「复制」类按钮前先确认拿到的内容有没有被截断。**
- 持久化/分享口径：恢复优先级 **URL 参数 > localStorage > 内置预设**；URL 读完立即 `replaceState` 抹参数（否则继续改布局后刷新会「穿越」回旧快照）；base64 必须走 `TextEncoder`（`btoa` 只吃 latin1，中文布局名会抛异常）；链接超 8000 字符**拒绝**而不是给半截链接。
- 🔴 **导出物的骨架装饰色必须随画布明暗自适应，不能写死深色主题**：设计稿画布默认白色，写死浅蓝描边 + 浅色文字 ⇒ 白底浅字、虚线看不见。用相对亮度（`0.2126R+0.7152G+0.0722B)/255 > 0.6`）判定明暗。⚠️ 这与编辑器 `LayoutWireframe` 的做法**方向相反但都对**：线框是结构预览（不表达真实配色）⇒ 固定蓝图深色；导出物要**忠实画布背景** ⇒ 配色自适应。**判据是「这东西要不要忠实用户配色」。**
- ⚠️ **断言全绿 ≠ 产物没问题**：上面那个白底 bug 是在 52 条断言全绿时，靠「拿真实预设跑出文件肉眼看」才发现的。**视觉类缺陷必须真产物目视，断言只保行为。**
- ✅ `screen-layout-presets.ts` 的 8 个预设 `outputScaleMode` **已于 2026-09-30 统一为 `fluid`**（原为历史值 `contain`），与一句话生成的默认对齐；文件头已写约定注释「新预设一律 fluid」。改前先做消费面审计：该字段后端仅一行类型声明、零消费 ⇒ 扩展安全。
- ✅ 入口：**2026-09-30 已从页脚移入头部主导航**（`AppHeader.vue` `mainTabsConfig` 第 5 项，受 `screen` 开关控制），页脚 `AppFooter.vue` 的重复项已移除。原「保持注释」的判断已被用户推翻——`/screen` 是生产级生成页，属主入口；页脚的定位是「低频入口」（页面开发 / 工作流编排）。
- ⏳ 下一步：后端「取完整生成代码」接口（`codePreview` 已从 500 提到 20000 字符，仍是片段，ZIP 才是完整产物）、refine 精确定位（「第 N 块」/「中间那列的第二个」）、refine 的 AI 版（当前是规则版）。

## K/L/M/N 四类高频缺陷（**完整判据 / 行号 / A/B 数字 / 取证脚本**见 skill `mvgo-resource-mount-layer-triage`）

> ⚠️ 本条原指「见 PIPELINE-DETAIL.md」，但 K/L/M/N 完整判据实际落在上述 **skill** 里（429 K 类 / 474 L 类 / 529 M 类 / 621 N 类），本文件只留指针（2026-09-30 修正）。

- **K 资源清单语义坍缩**：清单只写「第 N 张图」⇒ LLM 无从区分同父名资源。
- **L scriptSplit 拼接畸形**：多段 `<script>` 合并把标签保留进内容 ⇒ 语法坏；产物宿主同名组件须门禁。
- **M 内容归属「文案真值」**：判归属应比 Figma `characters`，不比节点 `name`。
- **N 锚点优先（N3）**：确定性挂载点唯一答案 = `mapping.ownerSectionId` ⨯ `data-section-id`；
  已落地 `utils/mount-target-scoring.js#selectAnchorMountCandidate`（三态）+ 两处 N3 插桩；
  `HOST_SHELL_TAG_RE` **唯一事实源**在同文件（**改外壳名单只改这一处**）。
- **vue3 产物 0 个 `data-section-id`** ⇒ 该路径锚点机制（含 `DETERMINISTIC_ANCHOR_SCORE` 短路）是死代码（能力缺口）。
- **N 锚点优先（已闭环，2026-09-30 四轮）**：
  ① **锚点选择** = `selectAnchorMountCandidate`（三态，与 `scoreMountTarget` 的 `DETERMINISTIC_ANCHOR_SCORE` 同源）；
  ② **fallback 幂等护栏** = `isResourceRendered(files, varName)`（「已渲染」**唯一判据**；用宽正则
  `ANY_TAG_RE` **不要求 class**，与找候选的 `N3_TAG_RE` 刻意不同；两处 N3 在锚点选择**之前无条件**先拦）
  —— 修「同一 bg 重复注入」**723 条 / 314 唯一产品**（全语料 4008 eligible 口径）；
  ③ **重复 sid 归属** = `anchorOwnerRank`（`package/index.vue` > 其它 `index.vue` > 其它，同文件取最外层）
  —— 修 96 个 sid 跨文件重复（`sameFile` 仅 2）的漂移；当前语料改道 **0**（纯确定性预防）；
  ④ 死代码 `findExistingResourceBinding`（`resource-mounter.js:67`）**已删除**，职责收敛到 `isResourceRendered`。
- ⚠️ **明确「不做」的项也要留档**：`fallback 拦跨 section 宿主容器`（判据 = legacy 选中元素子树含其它
  `data-section-id`，实测 20 条）**评估后不做** —— 嵌套 section 容器子树含子 sid 属正常形态 ⇒ 判据
  不可辩驳性不足、误伤风险 > 收益；且 ② 已覆盖真实事故形态。与 `resource-mount-plan.js:184-194` L403
  的宽松度差异是**计划层 vs 兜底层**的层级设计，不是缺陷。
- **立项项**：vue3 产物 0 个 `data-section-id` ⇒ 该路径锚点机制（含 `DETERMINISTIC_ANCHOR_SCORE` 短路）
  是死代码（vue3 无锚点写入方）。

## 2026-10-21 装配层详判据（从 MEMORY.md 迁出，供按需细读）

### A. e3ab048a 实例：行→卡双层重复只折一层（✅ 2026-10-21 已修 F1，未部署）

真值形态 = 段 group → N 个**行容器**（宽 564，每行 4 张 126×30 卡，列距 20、行距 50）→ 卡。
`deriveNestedSections` 把行容器当「重复 item」折叠，**只留第 1 行、其余整行丢弃**；模板行内部 4 张卡
又被折成内层 list ⇒ 优质 12→3、普通 15→4；战略段残余 2 段（行1 + 行2）⇒ 三段各拿不同残骸。

- 数字对照（视觉真值 vs 产物）：战略 6→8（含 2 项重复）、优质 12→3、普通 15→4。
- **根因（已闭合）**：`groupSections` 的①精确签名组**只比结构签名、零几何校验**，而
  `normalizeRepeatName` 把 `Frame 2136639905/906/907` 统一归一成 `frame` ⇒ 3 个行容器签名相同。
- **实施（`repeated-section-collapser.js`）**：`flattenNestedCollapsedItems(items)` /
  `nestedCollapsedLists(item)` / `unionBoxOf(list)`。判据 = 组内**每一项**（自身是 list，或
  `children` 里有 list）⇒ 该层比真实重复单元高一层 ⇒ 把内层 `items` 展开拼平。
  **要求「全部」而非「任一」**（混合组说明子列表只是卡内局部）。展平后 `type = 项数≥6 ? 'grid' : 'list'`，
  `buildCollapsedSection` 走 `opts._template/_box/_sourceNodeIds`：模板取最内层首项、
  bbox/`figmaHeightPx` 取各行**并集**、sourceNodeIds 取并集（否则资源挂载只认第一行）。
- **真机重放（`.checkpoint/figma.json`，主判据=厂商名逐项相等）**：优质 `38:3162` **12 项**/1 段 grid、
  普通 `38:3206` **15 项**/1 段 grid（含末行 3 卡）、战略 `38:3137` **6 项**/**2 段**。
- ⚠️ **边界（属 F2，非回归）**：展平依赖「每项内部已有折叠 list」，而某行卡数 < `minRepeat` 时
  该行不折（战略段第 2 行仅 2 卡）⇒ 两行签名不同 ⇒ 整组不展平。普通段末行 3 卡恰好够 `minRepeat=3`。
- 完整缺陷清单 + 复现命令：`docs/2026-10-21-合作厂商弹窗-e3ab048a-三段还原缺陷与待修清单.md`
  （§7 实施记录含逐条根因/判据/踩坑/重放表/归因）。

### B. 视觉分析（`visual.json`）路径与三处系统性错误

- **正确路径是 `layoutStructure.layout.sections`**（`layoutStructure` 下还有一层 `layout`），
  顶层没有 `sections` 键。误读会得出「vision 没产出布局」的错误结论（已发生一次，须避免）。
- 它做得对的：`layout.type/direction`、4 段骨架、三段 item 名单/顺序/数值、`styles.colors`
  前三项 = 三段面板底色、`notes` 里「三块各有黄/绿/蓝高亮」= 三段各自的 `INNER_SHADOW`。
- 三处系统性错误（却恰好是下游真正消费的字段）：
  ① `body.layout:'horizontal-4-items'` —— 把「N 行 × 每行 4 卡」压平成一维「4 项」；
  ② `items[].figmaNode` **错位一整级** —— 把行容器 id 当卡片 id（`38:3167` 是行容器，
     卡片是 `38:3168/3171/3174/3177`，间隔 3 不是 5）；`38:3266` 是 icon VECTOR 却标成
     文本「合作厂商」（真值文本是 `38:3263`）；
  ③ `repeatedCardTruth.fill = #679bbe` / `items[].repeatedFill = #ffffff` 是幻觉色
     （真值三段各不同：`#fffdf1` / `#f6fff7` / `#f2fdff`，且都不是白）。
- `anchorValidation` 报 100% valid **只证明「id 在真值树里存在」**，不证明类型/角色正确 ⇒
  与 P1-7 `validateVisionAnchors` 同一盲区（memory 「存在 ≠ 可信」）。

### C. 刀 36 自嵌套折叠的已知盲区

判据 = 元素 `W[S]` 内存在组件实例 I 且 I 的文件根 `data-section-id` 也是 S；修复 = 删「内容被 I
覆盖」的同级实例 + I 的 `flex:<ratio>`→`flex:1` + 清失效 import。

- **删除前提是「内容覆盖」**：`collectRenderedSurface` = 模板静态文本 ∪ defineProps 默认值 ∪ hasImg。
- **盲区**：父 div 内还有其他兄弟段时 `surfaceCovers` 不成立 ⇒ 不触发。e3ab048a 战略段即此形态
  （`div[38:3137]` 内还有 `HeaderText` / `ContentSection8`），代价是标题重复 + 尾部 2 项重复；
  同源根因其实是 §A（行容器没被聚合），不宜为它单独放宽判据。

### D. 刀 37 的判据与盲区（`container-background-truth.js`）

现有判据：① class 背景解析后等于**另一 section** 的背景真值 ⇒ 借用，覆盖；② 未声明且真值是渐变
⇒ 缺失，补齐；✅**④ 已声明但 ≠ 本节真值 ⇒ mismatch，覆盖**（2026-10-21 新增，**只对渐变生效**；
纯色面板 class 引 `@color-border-*` 明暗两套，覆盖成字面量会丢主题）。写 inline `background`
（不污染 class、幂等）。

- ~~盲区 1「已声明但写错」~~（✅ 已由判据 ④ 闭合）：卡 1 `linear-gradient(180deg,#d4e3ff,#c1d6ff)`
  + `border:1px solid #a0c1ff`；border 那半由刀 38 兜（见 §E）。真机重放仅 1 处变更（`38:3260 mismatch`）。
- **盲区 2 渐变方向不可证（已降级为「只比 stops」）**：`figma.json` 常缺 `gradientHandlePositions`
  （本例 `38:3261`/`38:3283` 均为 `null`）⇒ `fillsToCss` 默认给 `180deg` 属静默硬猜。
  `resolveSectionBackground()` 返回 `angleGuessed=true` 时：比较用 `stripGradientAngle`（**只比 stops**），
  覆盖用 `mergeGradientAngle`（**保留产物原有角度**）。⚠️ 不做这个分叉会把卡 2（class 写 180deg、
  truth 缺 handle 猜 90deg）误判成写错而覆盖掉一个本来正确的背景。
- **盲区 3 N1 全盲（未修）**：`truth-color-usage-guard`（`mc-component-graph-phase2.js:3819`，只 WARN）
  判据②「纯色才判，渐变跳过」⇒ 渐变背景/渐变描边全部不判。

### E. 「无 strokes ⇒ 不得写 border」（✅ 2026-10-21 已实施 刀 38）

容器 `strokes=[]` 时产物仍出现 `border:*`（本例 `#a0c1ff` 全树不存在，只等于
`theme-vars.less:26 @color-bg-design`）。同时**段面板的 `INNER_SHADOW` 不是边框** ⇒ 任何新增自愈器
都不得把 `box-shadow` 当 `border` 删掉（阴性对照）。

- 实施：新增 `backend-node/src/ai-engine/utils/border-without-strokes.js`，挂
  `pre-write-self-healing` ⑯（刀 37 之后），计数 `summary.borderWithoutStrokes`。
- 判据 `isStrokeFree(node)`：`strokes` 为空数组或每项 `!s || s.visible === false` ⇒ 删该元素
  inline 与**独占 class**（`isClassExclusiveTo`）的 `border*`/`outline*`；类名判定用
  `BORDER_PROP_RE = /^(?:border|outline)(?:-[a-z]+)*$/i` 且**排除 `radius` 结尾**。
- 三条边界：`border-radius` 不是边框 / `box-shadow` 不是边框 / 共享 class（任一使用点无
  `data-section-id` 或属别的 section）一律不动。
- ⚠️ 实施踩坑：`stripBorderFromInline` 会归一化结尾分号，若用 `!==` 判变更，**每个无边框元素都产生
  一次假变更**（真机重放实测 6 处）⇒ 必须先 `hasBorderDeclInInline()` 判「真的有没有边框」。
- spec `utils/__tests__/border-without-strokes.spec.ts` 12 例；真机重放仅 1 处变更（删
  `.c-e3ab04-stats-con` 的 border），`border-radius:4px` 与面板 `box-shadow: inset` 保留。

### F. 图标尺寸：`backgroundImage` 形态（✅ 2026-10-21 已实施 刀 39）

`resource-mounter#ensureReferencedIconSize`（L509）正则只匹配 `:src="${varName}"`，即只处理
`<img>`。`backgroundImage:url(x)` + `backgroundSize:'100% 100%'` 的写法完全绕过 ⇒ 真值
`53×55.45` 被拉伸变形。

- 实施：`ensureReferencedIconSize` 返回 `{content, patched, mode:'img'|'bg'|null}`；`<img>` 分支保持
  原行为并早返回，随后新增 `backgroundImage` 分支 + `bgTagHasPxSize(tag)` / `applyPxSizeToBgImageTag`。
- 判据（与 `<img>` 同构）：标签里某 `backgroundImage` 的引用标识符 === varName，且 `backgroundSize`
  不是「两个 px 值」⇒ 改写为真值 `${w}px ${h}px`；无该键则对象写法在 `backgroundImage` 值后插一项、
  原生 style 末尾追加。
- ⚠️ 原症状之所以是「静默」：`patched=false` 时调用方 `doneKeys.add(key); continue;` **直接放弃**，
  零日志。判「分支没生效」要先确认「分支有没有被调用」（`previewAnalysisRole === 'icon'` 为真）。
- spec `roles/microcode/resource-mounter-bg-image-size.spec.ts` 8 例（**该文件必须与
  `resource-mounter.spec.ts` 同目录**，否则 `jest.mock('../../../config/backend-root.js')` 路径错）。
  真机重放 `patched=true, mode='bg'`，`100% 100%` → `53px 55px`。

### G. 文本样式 R19 补充

- **槽位判据三坑**：`@var` 浅/深多定义 ⇒ 候选集任一命中即放行；只取规则块顶层声明
  （`&--active` / `:hover` 内的不算）；同段文本多子组件 ⇒ 全错才报。
- `injectNodeLevelColorTruth` 按 run 边界拆 span；P-11 只服务运行时 `{{ }}` 绑定，两者判定域互斥。
- 严重级本轮定 **WARN**：BLOCK 会触发 L0-B 重试 → 兜底模板覆盖，比「色不准」更糟。
- 基线 c-bb8-304bb8d3：`mixed=33 / judged=25 / mismatch=19 / skipUnmapped=8`。

## 判据索引详版（从 MEMORY.md 迁出）

### 多主题色值真值（N 稿）
- **透传链**：`graph(state.dualTruth)` → `engineer.execute(params.dualTruth:6518)` → **`this.generateCode({...})`
  显式白名单（曾漏 `dualTruth` ⇒ 分块 prompt 零副稿色值）** → prompt-builder。
- 带 nodeData 的逐稿数据在 `state.dualTruth.themes`（`themeNodes` 是用户原始输入、无 nodeData）。
- `fetchNodeData` 返回 **document 本体**（非 `{document}` 包装）；只有 `figma-node-data.json` 缓存才是
  包装，须 `raw.document || raw` 解包。HTTP 状态在 **`err.figStatus`**（不在 axios `status`）。
- 真值下发：`utils/color-slot-mapper.js#buildCrossThemeColorFacts`（树路径对齐「主稿色↔各副稿色」
  + 每稿主色板；同色值组合去重、跨稿无差异不入表、单稿 ⇒ null）+ `formatCrossThemeColorFacts`
  （markdown 硬约束，明令禁止 `#2b2b2b/#e6e6e6/#333333` 中性灰）；
  `prompt-builder#buildCrossThemeColorBlock` 注入 theme-vars / common.less / legacy dual 三处。
- 🔴 `// 自动添加（语义推断）` 注释 = **非真值**（`addMissingVariables` 用 `safeLessVarValue` 按名+明暗猜）
  ⇒ 被 common.less 引用即「深色稿 ≈ 默认 dark」。审计 `auditSemanticGuessSlots` 挂在
  `LessVariableChecker.check` **之后**（顺序错了抓不到）。
- `buildColorSlotMapping`：主通道（主稿 hex 精确命中既有槽位）/ 扩展通道（`@color-custom-N`）/
  兜底（跨稿无差异保留字面量）；**同一主稿色重复出现须复用槽位**。只处理 common.less 的 **hex
  字面量** —— LLM 若用自造槽位名则映射无从下手（靠 prompt 端真值下发治本）。
- 双真值（2026-10-10 D8，仅微码 Max）：`style-tokens.js#buildStyleTokens(input.dualTruth)`；副稿拉取
  fail-closed 在 `graph-phase2#fetchSecondaryFigmaNode`；判据分叉靠产物标记 `// dualTruth: figma-derived`。
  坑：① `buildDesignVars` 返回描述符数组须 `key→value` 映射；② 设计变量轨必须按主题分开
  （`lightDesign`/`darkDesign`）。`resolvePrimarySecondary` 的 `firstInput` **恒为第一个框** ⇒
  `secondaryNode` 须恒放第二稿。一条命令：`npm run check:dual-truth`。

### 主题色门禁（M4-10 / M4-11）
- `mc-check.cjs` L794-820 从 `mc-check-config.json:40-49` 取白名单，**只读 `css-vars.js` 的 `dark`，
  完全不读 `theme-vars.less`**；不读 meta ⇒ 判据无法按模式分叉。
- `darkThemeCoreVars=[colorTextBase,colorPrimary,colorPrimaryBg]`、`darkThemeColorRules`（硬枚举，
  M4-10 error）、`darkThemeOptionalVars`（滚动条，M4-11）。
- ⚠️ 放三核心真值必须 less#dark 与 js#dark 两处同写。
- ⚠️ **僵尸规则**：`colorTextSecondary`/`colorPrimaryHover`/`Active`/`BgHover` 有白名单但 M4-10 只遍历
  三核心 ⇒ **从无判据消费**。内置 skill 副本两份需同改（`backend-node/skills/` + `aidocs/skills/`），
  文档 `references/checklist.md` 同步。
- `theme-color-guard.js`：`.common()` 禁语义颜色槽位名/字面量色值（`value` 以 `var(` 开头豁免）；
  业务样式禁 `var()`。生成器缺口：`style-tokens.js#renderMicrocodeThemeVarsLess` L871 `.common()`
  原样沿用 LLM prior；自愈器 `less-variable-checker#healCommonColorVars` L465 只清「light+dark 都定义」的颜色。

### 技术栈接管 #78
- `techstack-section-contract.js`（table 契约成功才吸收，fail-open）。
- `findEntrypointCircularImports`（子组件禁 import 父 index.vue，正解 `$mcComponentBuilder()`）。
- `style-conflict-detector.js`（只报不改）；`section-content-guard.js#checkTechStackContractTags`
  （**corpus 级 ElementCoverageValidator 是死代码勿依赖**）。

### 方向类判据（LAYOUT-001 / vfor-list-direction-guard）
- 🔴 方向类判据必须判定「DOM 节点的真实子项排布」，不能只比 section 自身真值（LAYOUT-001 只比根元素
  ⇒ 恒不命中）。`utils/vfor-list-direction-guard.js`：wrapper/item 期望按段角色分叉（折叠段 id ⇒
  wrapper 期望在段 layout、item 期望在子段；叶子段 id ⇒ 反之；集合段 item 不判）；段内嵌套
  `data-section-id` 子容器交 LAYOUT-001。
- 自愈已启用：pre-write-self-healing ④-h 刀 30，ctx 需透传 `layoutStructure`
  （microcode execute 域裸变量；vue3 无真值源 fail-open）。
- 🔴 **多份同名规则盲区**：`extractFlexProps` 只取首个 `.cls{}` ⇒ 判据与 heal 打到不同份 ⇒ 复检恒红；
  治本 `collectDirectionKinds` 聚合全部块（矛盾入 `conflicts`）+ heal 翻转**全部出现点**
  （含 .vue，`(?!\w-)` 边界挡变体）。

### 配额类判据
- 🔴 **收集与裁剪必须解耦，类型一等公民优先**：收集闸门 `collectCap=max(4×quota,48)`，输出用
  `pickTextPriorityLines`（TEXT 全留、余量给装饰、按原始序），配额 `max(quota, textCount)`。
- **写配额逻辑先问「被砍的是不是只有这一条通道能下发」**（文本只有本通道；图片/资源另有
  `injectResourceImports`）。

### E1 推导与「孤儿文本」
- 🔴 **E1 推导只提升容器类型**，容器直接子级的裸 TEXT 永不进 section 树（且 E1 整体替代 vision
  sections ⇒ 整段消失）；补回靠 `collectTailOrphanTextKids`。
- 深度 >2 的裸 TEXT 走「孤儿独立段」轨：id = `` `${parentId}-orphan-text-${i}` ``，`name` 才是文案
  （写 spec 断言时用 `text ?? name`）。

### Figma 覆盖/去重三铁律
`utils/figma-coverage-dedupe.js`：① 锚点展开为后代闭包；② 索引外合成 id（如 `48:5813-list`）不入闭包；
③ `removed` 跨层级聚合。验证 `npm run verify:coverage-dedupe`。

### 两段式 / LESS / 门禁
- L477 实锤：`style-class-consolidator#isBalanced` 只数 `{}` 不数圆括号，而写盘门禁
  `scanStandaloneLessDefects` 数圆括号 ⇒ 合并器放行「缺 1 个 `)`」的合并稿 → 门禁判死 → 6 轮全跳过
  → `_hasLastGood` 只查磁盘（不查分块缓存）→ `code-validator.js:2243` 兜底模板覆盖
  （641 行 / 覆盖 53/56 class 的合格样式表被换成 15 行，19 个布局容器 class 零定义）。
- 根治口径：合并器自写判据**删除**，合并产物直接交 `gateStandaloneLessWrite` 判定并接受其 heal 结果
  ⇒ 输出恒能过门禁、写盘退化为幂等。`less-compile-gate` 零内部 import，无循环依赖。
- **凡是「合并/收敛 → 门禁」两段式，两侧判据必须同一实现，不是同一逻辑各写一份。**
- 改 prompt/规范前必须做「加载链三查」，生效规范根 = `backend-node/references/**`。

## 2026-10-22 刀 43：R24 破图三成因（P0-1）

**症状**：真机 `mc-1792635919906-88b9c3a5` 三个面板标题图标全破图，`RES-UNREF` 报 `header-3136` / `icon-战略厂商-3160`。

**三成因（一条判据覆盖不了）**

| 组件 | 模板形态 | 旧判据为何零命中 |
|---|---|---|
| `HeaderText.vue` | 裸 `<img class="…-icon" alt="战略厂商" />`，**有** `data-section-id="38:3137-tail-text"` | 离线能修；但生成内阶段 R24（`microcode-engineer:2884`）之后仍有重生成覆盖 ⇒ 产物里还是裸 img |
| `HeaderText2.vue` | 裸 img，模板**无** `data-section-id` | `no-section-id` 直接放弃 |
| `HeaderText3.vue` | `:src="icon普通厂商"`（模型自造中文名），`<script setup>` 零 import | `hasSrc=true` 一律当已完成 ⇒ 运行时 `is not defined` |

**判据（`utils/resource-img-src-healer.js`）**
- `findImgTags` 带 `srcVar`（`simpleBindingName`，允许 Unicode 标识符）；`isDeclared` Unicode 安全（转义 + 无 `\b`）。
- 目标两类，其余一律不动：A 无任何 src 绑定 → 补 `:src="权威名"`；B `:src` 变量未声明 **且** `normVarName(变量) === normVarName(assignedVarName|semanticVarName|varName)` → 换名 + 补 import。
- 归属三级：文件内 `data-section-id` 唯一 → `opts.ownerSectionId`（装配层推断）→ 否则 `skipped`。多个不同 section id 恒 `ambiguous-section`，**owner 不得压过它**（spec ⑭ 锁死）。
- `buildComponentOwnerMap(files)`：栈式扫模板标签，PascalCase 标签的归属 = 最近祖先 `data-section-id`；同组件出现在两个 section ⇒ 剔除。
- `ownerSectionIdForFile(map, relPath)` + `componentNameOf`：**唯一**换算实现（kebab/snake 归一），两处调用点共用。

**挂载位置（铁律）**：`pre-write-self-healing` 新增 **②-c**，必须排在 ③ CODE-022 剪枝**之前**（先补 `:src` = 挂载，再判「未挂载」）。summary：`imgSrcBackfilledPreWrite` / `imgSrcAliasRenamed` / `imgSrcOwnerResolved`。

**离线验证数字**
- 真机产物重放：3 文件变动，`icon4` / `icon5`（owner `38:3162`）/ `icon6`（alias `icon普通厂商`），其余 `<img>` 零改动。
- 资源 import 路径：4 个产物全部 `existsSync` 通过（`package/` → `../resources/images/`；`package/components/` → `../../resources/images/`）。
- 语料面：150 产物 / 145 含 img ⇒ 45 文件 47 img 命中、6 处 alias、0 报错；`skipNoSection=195`、`skipNoResource=25`（fail-open 正确）。

## 2026-10-22 装配层刀具详判据（从 MEMORY.md 迁出；单行索引在 MEMORY.md）

### 刀 41 折叠网格布局契约（`grid-list-layout-contract.js`）
- **挂载点 = `file-writer#writeFiles`，且必须在 per-file 循环之前整体跑一次**（判据跨文件统计 class 复用，逐文件跑会把共享 class 误判成独占），结果回灌 `filesForWrite`。原挂 `pre-write-self-healing` ⑱ 时 `data-section-id` 还没补齐 ⇒ 整段 skip。
- 真值 = `items[].absoluteBoundingBox`（`sec.items`/`sec.body.items` 都认）＋ **Figma 兜底**（plan 段无 items 时按 id 查 `figmaIndex` 取 `children[].bbox`，否则 `skipNoTruth` 静默全盲）。
- 自愈写 `display:grid; repeat(N, Wpx)`（**不能写 flex**，否则 LAYOUT-001 转红）。
- 🔴 三条铁律：① class 被别的元素复用绝不改写（`frame-2136639905` 双身份）；② 级联按**样式文件顺序**合并，非 class 属性顺序；③ 赢不了层叠就写**元素级内联**（`ensureHostInlineGrid`：按 `data-section-id` 找宿主 tag，复用刀 51 `upsertInlineDecls` + 刀 38 `stripDeclsFromInline`。基础名共享 + BEM 修饰名并存时，共享块的 `display:flex` 会按文件序顶掉修饰块的 grid，只有内联能定论）。
- 🔴 行距真值 = y pitch − cardH（50−30=20），不是 pitch；**`rows===1` 时行距未知 ⇒ 不写也不删 `row-gap`/`gap`**。
- 🔴 卡高两维同时成立：`grid-auto-rows: cardH` ＋ `align-items: stretch`（残留 center ⇒ 子项不拉伸，实测卡高 13.8px vs 真值 30）。新增判据 `grid-align-items`；`canonicalWrapperDecls` 加 `align-items:stretch`。
- 🔴 grid 实现下 `flex` 系列对子项**惰性** ⇒ 不判 `item-stretch`（只有 `width` 百分比/calc 才真改卡宽）；也不判子项 height。
- 🔴 判据读样式必须用 `flex-sibling-guard#extractStyleBlocksDeep`（花括号深度+字符串/注释状态扫描，返回 `{selector,body,declText,depth}`；正则版 `extractStyleBlocks` 只认一层嵌套，留给 FLEX-001~005 **不动**）。detect 与 heal 共用同一份（两段式铁律）。
- 四层病灶链（2026-10-22 逐层实锤修复）：挂载点错位 → 真值缺几何（figmaIndex 兜底）→ 判据读不到声明（Deep 版）→ 自愈赢不了层叠（内联通道）。
- 宿主 class 无任何规则块时 `appendClassBlock` 在宿主 .vue `<style>` 末尾新建（只挑 `issue.file` 精确匹配）。

### 刀 42 面板三件套 + 宽度兜底
- A=`container-background-truth.js`（`resolveSectionPanel` 同一次遍历取 bg+`cornerRadius`(+`rectangleCornerRadii` max)+`effectsToBoxShadow`+`fullWidth`；逐属性判定 `missing-solid/radius/glow/width`，**只补空白不猜已有值**）＋ B=`panel-chrome-misplacement.js`（装饰归属反查：自身无面板真值 ∧ `radius==P.radius` ∧ 发光 RGB==P 发光 ∧ owner 唯一 ⇒ 删三件套；元素级 + class 级兜底）。
- 🔴 旧豁免「纯色未声明 ⇒ 交主题变量」是伪前提（该层无背景槽位 ⇒ 永远不补）；🔴 补 A 不摘 B = 面板里再套同色条，必须成对；🔴 class 级兜底必须收紧成「唯一使用点且无 section 归属」（`orphanTags===1 && sids.size===0`）；`missing-width` = 段宽/figma 父宽 ≥0.95。`figma-effects.js` = effects→box-shadow 单一来源。块改写复用刀 38 `stripDeclsFrom*`（通用谓词版）。

### 刀 50 段内固有几何 / 刀 51 标题行 / 刀 52 父容器堆叠
- 刀 50（`section-intrinsic-layout.js`，挂 `code-generator#buildDeterministicIndexTemplate` 生成期）：bbox 全可解析 ∧ vertical ∧ 严格堆叠 ∧ 间距≥0 ∧ 不溢出 ⇒ 容器 padding-top/left + 子项 `flex:0 1 auto;height:Npx` + margin-top:gap。比例分配表达不了「固定高+固定间距+padding+剩余留白」。
- 刀 51（`header-row-geometry.js`，挂 writeFiles）：真值只从 Figma 树推：恰 1 `<img>` → assignedVarName 反查 figmaNodeId → 同父同行（顶边 Δy≤2）仅 1 TEXT 在右侧 ⇒ gap/行高/`padding:0`。🔴 `(?:^|\s):src`（`\b:src` 在空格后不成立）；文案同源证据 = 字面量 或（模板含 `{{ }}` 且本文件 `default:` === Figma 文案）。**漏钉 `justify-content` 时共享表 center 会赢（普通段标题居中实锤）→ 已由刀 53 根治**。
- 刀 52（`section-stack-contract.js`，挂 writeFiles）：治「段高按 flex:比例摊」。判据只在 DOM 层成立（`data-rowpeers-wrap` 按直接子元素算，wrap box=内部后代并集）。输出：容器 padding-top + 子项 `flex:0 1 <单元高>px;min-height:0` + margin-top:间距。纯几何裁决收敛 `section-intrinsic-layout#resolveStackGeometry`（刀 50/52 同一份）。
- 🔴🔴 `getFigmaBox` 形态陷阱：只吃 `{absoluteBoundingBox|bbox:{x,y,width,height}}` 或 `{x,y,w,h}`，不吃裸 `{x,y,width,height}`；x/y/w/h 四元齐全，plan 节点常只带尺寸 ⇒ 判 null。`resolveSectionFlexSize` 取 `sourceNodeIds` 并集。

### R24 / 破图 / 内容守卫
- R24 唯一有效挂载点 = `file-writer.js#writeFiles`（不是 pre-write-self-healing；pre-write 后还有 4 个覆写/回退步骤）。三种破图成因：裸 img / 模板无 `data-section-id`（`buildComponentOwnerMap` 父子推断）/ `:src` 自造名未声明（`normVarName` 归一相等才换名）。
- 🔴🔴 内容映射守卫必须认 `ownerSectionId`（`section-content-guard.js#checkSectionExclusiveEvidence` 三条并列：节点∈子树 / `ownerSectionId===section` / section 是它的派生子 id）；只比 `figmaNodeId∈子树` 会把合法引用当「借用」删掉（图标破图三轮零进展真因）。文件名→组件名换算只许一份：`ownerSectionIdForFile`。
- 🔴🔴 `figmaRoot` 曾整条断路（2026-10-22 实锤）：`engineer#writeFiles` 条件变量 `_figmaRootForTruthPalette` 只读未赋值 ⇒ 恒 undefined ⇒ 刀 51 静默全盲。已解耦恒透传。凡几何/真值判据必须挂真机日志计数行（evaluated/singleImg/mapped/matched/healed）。

### 刀 53 同构段确定性接管（2026-10-22 新增）
- `folded-grid-section-takeover.js` + 接线 `microcode-engineer.js#genSubComponents`（chunk 构建前评估，命中 subPath **跳过 LLM chunk**）。
- 判据：`detectHeaderRowLeaf`（锚点子树恰 1 TEXT + ≥1 ≤32px 图形、同行 Δy≤2、icon 在左 gap 0..48；**icon 必须在资源映射**否则 fail-open）；`detectGridLeaf`（几何复用刀 41 `buildGridContract`；内容 `resolveCardNodes` 两路径 A=items[].id→figmaIndex / B=`geometryFrom:'figma:<id>'` 直接子项；**部分解析即整体失败**）。
- 渲染 `renderFoldedGridLeafVue`：数据内联（无 defineProps ⇒ 0 卡结构性不可能）、`justify-content:flex-start` 显式内联、类名 `c-{sem}-fg-{header|grid}-{idSlug}`（section id 派生、组件内唯一 ⇒ 免疫全局注入后写者胜）、颜色 `fillToRgba` 单一口径、`<`→`\u003c` 防 `</script>` 注入。
- 确定性文件走 `_ensureSubComponentStyleAttrs/_ensureSubComponentStyleImport/injectResourceImports` 最小管线；`fileSectionMap[subPath]=ownerSectionId`；写入异常回退补 LLM chunk。日志 `🛡️ 刀 53 …已评估 {leaves, headerTaken, gridTaken, skipped[]}`。
- 合成段 id 剥一段后缀回真节点（`38:3137-tail-text`→`38:3137`、`38:3167-list`→`38:3167`）；`-list` 段内容必须走 items 路径（剥后缀只回第一行）。
- 单测 17/17；真机离线重放 5/7 命中（3 header + 2 整行 grid；`-list` 探针缺 items 属 fixture 问题，真实 plan 自带）。

#### 刀 53 配套：后置污染三源头治理（2026-10-22 round-12~15 实锤）
- **常量唯一来源** `FG_TAKEOVER_CLASS_RX = /-fg-(?:header|grid)-/`（导出于 `folded-grid-section-takeover.js`）：`code-validator.js` / `font-size-normalizer.js` / `layout-facts-injector.js` 一律 import，**禁副本**。
- **① font-size-normalizer**（`file-writer.js:830` 对 .less/.css/.vue **全文**归一）：把 `font-size:16px` → `calc(@fontSize * 1.1429)` ⇒ DOM 13.71px（真值 16px）。修：`options.skipSelectors`（默认 `DEFAULT_SKIP_SELECTOR_RXS`）+ `protectSkippedBlocks()` 把命中 fg- 的整块占位抠出；`skipSelectors: []` 可显式关闭（阴性对照）。
- **② layout-facts-injector#injectLayoutFacts**：给 fg- 宿主写 `display:flex;flex-direction:column;flex:1.548 1 0;height/width:100%`，只靠内联优先级侥幸赢。修：命中 fg- 的 className `continue`。
- **③ 「LLM 照抄 + consolidator 回写」链（最难缠，①②挡不住）**：第二轮生成 LLM 从既有产物上下文看到 fg- 类名 → common.less 编造规则 → `style-class-consolidator` 以「common.less 丰富版」回写子组件 style 块（并补 `v-bind="$attrs"`）。修（两者都在 file-writer#writeFiles，**先 strip 后终裁**）：
  - `stripFgTakeoverRules()`：剔除样式内容里所有 fg- 规则块（契约：`fg-` 类只允许存在于接管文件自带 style 块）；对所有 `.less/.css/.vue` 调用。
  - `options.fgTakeoverFiles`（Map<path, 确定性内容>）：在**所有内容级自愈之后、写盘/diff 之前**终裁覆写；microcode-engineer 存 `this._fgTakeoverFiles` 并在 `writeFiles()` 包装（:5341）透传（新入参漏透传 = 静默丢弃，同 truthPalette/sections 族）。
- ⚠️ `stripFgTakeoverRules` 正则：两段捕获、选择器段排除 `;` 与 `/` `*` —— 否则吞掉前置 `@import`/注释一起误删（单测实锤）。
- ⚠️ DOM 读数坑：卡容器 computed `font-size=12px` 是继承值（`--fontSize`），真值在卡内 `span`（内联 `t.fs`）⇒ 字号断言必须读 span。
- 真机终局 round-15 `mc-1792662399514-2b715fa0`：7/7 全对（三段标题 row/flex-start/gap8 + **16px 真值**；四段网格 4/2/12/15 卡、126×30、r6、三色底、jc=start、步长 146；卡内 span 14px、数值色逐段精确）。
- round-14 出现「标题整段缺失」= 该轮 plan 未把标题段拆成子组件（刀 53 只接管子组件叶），属**单轮随机**，非回归（round-15 恢复）。后续若要根治需把接管扩展到 index.vue 内联叶。

#### 刀 53b：纯文本叶接管（2026-10-22 round-16~17 实锤）
- 病灶：stat 条数字叶（`38:3262`="33" fs24 fw600 蓝 / `38:3284`="66"）与标题叶（`38:3285`）是**纯文本 plan 叶**，LLM chunk 臆造成无 `:src` 的 `<img>` ⇒ 数字消失+破图同源（ContentSection3/5/6.vue）。
- `detectTextLeaf`：锚点子树恰 1 非空 TEXT、0 图形（GROUP 纯包装允许）+ color/fs/fw 齐全；walk 用 **Set 去重**（collectAnchorNodes 返回锚点+直接子项，GROUP 锚点父子重复进入 ⇒ texts 翻倍）。渲染纯 span 数据内联、**绝不 img**。`FG_TAKEOVER_CLASS_RX` 扩 `text`（单点三消费者生效）。顺序 grid→header→text；日志 `textTaken`。
- 🔴 **预览运行时 scoped style 块不生效**（round-16：54 个 stylesheet 无 fg- 规则，span 塌回继承 12px）⇒ 推翻 round-10「font-size 放 style 块」结论：**必须内联**；配套 `font-size-normalizer#protectFgTagInlineStyles()`——fg- 类标签的 style 属性整段占位保护（开标签扫描、属性顺序无关），否则内联 px 被归一成非法 `calc(@fontSize*N)`（round-10）。归一器占位族：C 注释 / L 行注释 / S 规则块 / I 内联，还原顺序 注释→内联→块。
- 真机 round-17 `mc-1792664016166-36520fb1`：33/66 fs24 fw600 蓝全对、标题 fs16 #333、破图 0/6。遗留：纯 icon 叶（`187:262` texts=0）仍走 LLM 偶发丢失，「纯 icon 叶接管」未做；workspace publisher 链另有归一+flex 注入（内联赢它，暂不追）。

#### 刀 53c：纯 icon 叶接管（2026-10-23 round-18 实锤）
- 病灶：`187:262`/`187:263`（stat 条图标 GROUP，内部十几个 VECTOR、0 TEXT）不属于前三判据任何一域（标题行要 1 TEXT+icon、纯文本叶要 1 TEXT 无图形）⇒ 全 fail-open 走 LLM ⇒ **偶发整段丢失**（round-17 左卡 MISSING）。
- `detectIconLeaf`：子树 **0 TEXT** + 锚点自身在资源映射里（`resourceFile` + 变量名 + `downloadStatus !== 'failed'`）⇒ 接管；尺寸取 Figma bbox 真值（53×55，LLM 之前猜 53×56）。渲染 `<img>` 尺寸/object-fit 全内联（scoped style 不生效），import 由 `injectResourceImports` 补。
- `FG_TAKEOVER_CLASS_RX = /-fg-(?:header|grid|text|icon)-/`（**唯一来源**，四消费者：code-validator / font-size-normalizer / layout-facts-injector + 判据自身渲染器）。
- 判定顺序 **grid → header → text → icon**（互斥域递减）；日志字段 `iconTaken`。
- 真机 round-18 `mc-1792718336301-cad5cd6e`：leaves13 / header3 / grid4 / text4 / **icon2**；文本叶全真值（33/66 fs24 fw600 蓝）、icon 叶 53×55 `imgOk=true`、破图 0/6。互斥性重放：icon 叶 icon-HIT+text-miss、文本叶反之。

## 2026-10-23 LESS 编译门禁「Operation on an invalid type」根治（e2c61f62；commit `73420b3`）

**症状**：`resources/styles/common.less:201:3 Operation on an invalid type`；报错行产物形态
`font-size: calc(@fontSize) * 1.7143);`（乘号在 `calc()` 外 + 多一右括号）。

**根因双层（必须同治，单修任一层其余路径仍会复发）**
| 层 | 位置 | 缺陷 |
|---|---|---|
| 源头 | `roles/microcode/code-healer.js#healThemeMixinVarRefs` | 把 mixin 闭包 `@fontSize` 改写为 `var(--fontSize, <def>)` 时未防 `def` 已是 `var(--fontSize)`（theme-vars 里 @fontSize 定义即 var 透传）⇒ **自指双写** `var(--fontSize, var(--fontSize))` |
| 防线 | `utils/theme-color-guard.js#healBusinessStyleVarsInCss` | `VAR_RE` 用惰性 `[^)]+?` 匹配 `var(--x, fallback)`，嵌套 var fallback 时**提前截断**（内层 var 一半进 fallback、括号错配）⇒ 吞右括号 |

**刀 A（源头，+57）**：`MIXIN_VAR_CSS_FALLBACKS` 设计基准表 + `safeMixinVarFallback(name, def)` 三级取值：
① `def` 是字面量 ⇒ 原样；② `def` 是 `var(--y, z)` ⇒ 取内层 `z`；③ `def` 是纯 `var(--y)` 无内层 ⇒ 查设计基准表；
**表里没有 ⇒ return null ⇒ 该行跳过不改写**（fail-open：宁保留 `@name` 也不产自指双写）。
🔴 这是本刀的**关键设计**——「不确定就不改」而非「兜个默认值」。`healThemeMixinVarRefsInVue`（:1843 导出）复用同实现。

**刀 B（防线，+10）**：`isNestedVarFallback(fb) = /var\(/i.test(fb)`；在 `replaceIn`（normal-line）与
declaration 分支**两处入口最先判定** ⇒ fallback 含嵌套 var 时整段 `return m`（不替换 `@slot`、不降级取 fallback）。

**验收探针**：`scripts/verify-calc-e2c61f62.mjs`（只读，16 断言）。语料自检优先走
`temp-components/<sid>/<taskId>/.mc-gen/cache/code-chunks`（**权威副本**，非 `frontend/workspace/...` 交付副本）。
- S0 chunk13 原文含 `calc(@fontSize * 1.7143)` 且无畸形 / A1 阴性自指双写计数 0 / A2 阳性 fallback 落 `14px`
- B1 阴性嵌套 var 零改动 + **B2 阳性对照字面量仍转 `@fontSize`**（证明 B1 非恒真，即刀 B 不是把功能关掉）
- E1 全链阴性零畸形 / E2 全链阳性含正确字号形态
- E3 `less.render` 真编译通过（3963B；产物 CSS 字号链路 `calc(var(--fontSize) * 1.7143)`）
- E4 **阳性对照：修前畸形形态必须编译失败** —— 实测抛 `Operation on an invalid type`，与真机报错同源

🔴 **坑 1：E2 断言过窄 ⇒ 真绿被误报假红**。全链里 `injectThemeVarDeclsForLess` 已在局部声明 `@fontSize`
⇒ heal **不再改写** ⇒ 合法产物形态实为 `calc(@fontSize * 1.7143)`，而非 `calc(var(--fontSize ...`。
断言须同时接受两种合法形态。

🔴 **坑 2：spec 里 `await import('./x.js')` ⇒ `A dynamic import callback was invoked without
--experimental-vm-modules`（TypeError）**。改**静态 ESM import**（`import { healThemeMixinVarRefsInVue } from './code-healer.js'`）。

🔴 **坑 3：过宽否定断言** `expect(out).not.toMatch(/1\.7143\);/)` 会把**合法** calc 收尾 `);` 判为畸形。
否定断言必须锚到明确的畸形特征（如 `/calc\(@\w+\)\s*\*/`），不能用泛化的闭合括号片段。

**回归口径**：三 spec 合计 166/166；全量 `36 failed/3945 passed` vs 基线 `36 failed/3936 passed`
（failed 数与 suite 逐字一致、全在既有 flaky 名单）⇒ **零新增失败**，+9 为新增通过。
`nest build` exit=0，dist 验 `safeMixinVarFallback`×2 / `isNestedVarFallback`×3。

### 补充：两处假绿通道（原探针 16/16 绿仍不足以定因）

1. 🔴🔴 **`injectThemeVarDeclsForLess` 对 `fontSize` 不注入**（实测注入增量 0 字节）。
   机制：`extractThemeScopedNames()` 扫 `.theme-dark()`/`.theme-light()` 内的声明名进 `themeScoped` 黑名单
   （A-① 主题作用域豁免：值随主题变化者不在业务文件顶层重声明）。而 `fontSize` **同时**声明在
   `.theme-dark()` 里 ⇒ 即便 `.common()` 里也有，也被黑名单吃掉 ⇒ 不注入 ⇒ `localDeclared` 不含
   `fontSize` ⇒ `healThemeMixinVarRefs` **必然触发**。
   ⚠️ `extractThemeScopedNames` 的 mixin 名正则只有 `.(theme-dark|theme-light)`，**不含 `.theme-theme_2()`**
   ⇒ N 主题（theme_2/theme_3…）里的声明不进黑名单。当前不影响本单（fontSize 在 dark/light 都有），
   但换一个「只在 theme_2 里声明」的槽位时行为会不同 —— 排查时注意。
   ⇒ 教训：**不能凭「有注入机制」推断源头改写被绕过**；必须实测 `注入增量` 断言（探针 F1）。

2. 🔴 **手工构造的畸形串只是旁证，不是因果证据**。定因必须能在**真实语料那一行**上重放出真机产物。
   做法（探针 R 节）：把修前两刀做成 fixture ——
   - 旧刀 A：`text.replace(/@fontSize(?![\w-])(?!\s*:)(?!\{)/g, 'var(--fontSize, ' + def + ')')`（def 原样塞）
   - 旧刀 B：`VAR_RE` **去掉** `isNestedVarFallback` 守卫
   在 `  font-size: calc(@fontSize * 1.7143);` 上重放 ⇒ 第 1 轮得到
   `  font-size: calc(@fontSize) * 1.7143);`（与真机 `common.less:201` 逐字一致）。
   🔴 并发现该链路 **非幂等**：第 2 轮 `calc(@fontSize)) * 1.7143);`，每轮多一个孤儿 `)` ——
   因为匹配只吃掉内层 `)`、替换文本里没有对应 `)`，残骸留在原位。这解释了「必然炸门禁」而非偶发，
   也提示：**任何「替换后括号计数不守恒」的 heal 都必须配幂等性断言**（多轮重放）。
   fixture 须显式标注「仅供对照，非生产实现」，否则会被误当第二份判据副本（事故温床）。

## 2026-10-23 接管后样式失配（cd8938f8 实锤；**孤儿侧已由刀 53h 闭环**，契约扩维持续；全量报告 `.workbuddy/reports/2026-10-23-layout-fidelity-cd8938f8.md`）

被测：`mc-max-1792745153977-cd8938f8`（Figma `43:4782 cp-设备列表` 510×617）。
权威副本 = `frontend/workspace/custom-components/c-device-cd8938f8`（`temp-components/<sid>/...` 已不存在）。
版本锚 `codeVersion.gitHash=baeba88`、`writtenAt=1792745245218`。

### 机理（两类）
1. **接管渲染器无「外观维度」**：`backend-node/src/ai-engine/utils/folded-grid-section-takeover.js:857-909`（table 分支）
   的数据模型 `tr.cols[].cells[]` 只承载 `{text, color, fs, fw}` —— **不是忘了写 background，是模型里没有这个维度**。
   `statrow`（`:815-836`）与 `grid`（`:986-997`）、`header`（`:965-984`）同族分支同样只吐布局 + 文字样式内联。
   ⇒ 表格斑马纹 / 表头底色 / 1px 白网格线 / 单元格内边距 / 统计卡渐变底**全部丢失**。
2. **接管改模板 class 但不维护 stylesheet**：刀 53 家族把模板类名换成 `c-device-fg-table-434785-*` /
   `-fg-statrow-434893list-*` / `-fg-header-8073*`，旧 CSS 规则原地留下 ⇒ 出现第三态「既失效又误导」。

### 量化（探针口径，只读）
模板 class **48** / 命中样式 **11** / 零样式裸类名 **37** / 真实 CSS 类名 **13** / 业务孤儿 **2**
（`resources/styles/index.css:44-61` 的 `.c-device-content-section4-col`：`height:44px; background:#e2ecfe;
border:1px solid #ffffff;` 与 `:first-child { background:#bdd5ff }` —— **值与 Figma 真值逐位一致**却已失联）。
命中清单：`c-device-con-con / slot-con / frame-2136639911-con / frame-2136639921-con / detail-root /
detail-text / group-2136638436 / legend-con / legend-item / legend-text / legend-dot`。

🔴 **探针坑**：截模板必须用 `src.lastIndexOf('</template>')`。用 `src.split('</template>')[0]` 会命中
`<template #title-left>` 的**闭合**标签 ⇒ 只取到插槽那几行、漏掉整段主体 ⇒ 统计假阴（初版得「43/7」，
修正后「48/11/37」）。噪声类 `.png/.less/.light/.dark/.theme_2/.common` 必须剔除，否则孤儿数假高。

### Figma 真值要点
- 每个单元格是 **FRAME 带 fill + stroke**：`43:4786` 179×44 `#bdd5ff` + 白 stroke；`43:4788` `#e2ecfe` + 白 stroke；
  `43:4855` 98×44 `#d6e5ff` + 白 stroke。列容器 `43:4785/4812/4831/4850` = 179/98/98/98 ×388，
  `43:4784 HORIZONTAL spacing=-1` ⇒ 9 行 × 44 − 8×1 = 388（1px 白边互相压盖）。
- 首列格内 `81:37 RECTANGLE "image 473938"` 28×28（x 偏移 16）+ 兄弟 `81:38 TEXT 服务区巡检狗K1`（x 偏移 54）。
- 根 `43:4782 GROUP 无 fill`；真正的底是 `43:4783 "bg"` 510×617 `GRADIENT_LINEAR` op=0.9 + stroke
  `rgba(160,193,255,1)` —— **从未下载成图**。
- 统计卡 `43:4892 HORIZONTAL spacing=34`；`43:4893/4898/4903` 各 134×66，bg 组 `48:5909/187:265/187:266`
  各含 2 个 `GRADIENT_LINEAR VECTOR`（134×56 + 134×10）；数值 TEXT 24px fw400（`rgba(57,101,255,1)` /
  `rgba(0,172,46,1)` / `rgba(255,115,0,1)`）、标签 14px fw400 `#333`。
- 尾部同 y 带 `y=52138`：`43:4869` 53×14 @x=29636 / `43:4875` 39×14 @x=29708 / `43:4878` 84×14 @x=30001 /
  `43:4911` icon 8×8 @x=30095,52141；`43:5688` RECTANGLE 6×218 r=3 `rgba(20,105,169,1)` @x=30113。
- 图例：`43:4871 ELLIPSE` 8×8 `rgba(0,199,43,1)` @x=29636 **在** `43:4870 TEXT "运行中"` @x=29647 **之前**；
  文本 `rgba(84,104,129,1)` = `#546881` fs14 fw400。

### 产物侧其余实锤（A2~A10）
- 根背景挂错：`bg-5909.png`（= 第 1 张统计卡的 bg 组 `48:5909`）挂在组件根（`index.vue:6` + `:24`）。
- 表格首列设备图标零渲染（`81:37`）；`component-meta.json` `RES-UNREF` 清单 4 条中 `icon-4911` **误报**
  （`ContentDetail.vue:9` 实际有引用）。
- 图例「运行中」重复：`ContentSection4.vue:3-4` 硬编码 + `ContentSection5.vue:11` `legendItems=[运行中,离线]`。
- 尾部四节点真值同 y 横排，产物是 `flex-direction:column` 下三个 `flex:0.028` 兄弟 ⇒ 纵排三行。
- 表格被 `index.vue:11-12` 按 `flex:0.380`(表格) : `flex:0.620`(`CardGrid`，`display:none`) 切分 ⇒ 只占 38%。
- 表格 396px 溢出 8px（产物无负间距）。
- 🔴 `chunk-meta.json` 只记 7 个 LLM 分块，缺 `ContentSection/ListSection/HeaderSection/CardGrid`
  ⇒ 这 4 个文件确系刀 53 确定性接管产物（「接管 vs LLM」的硬边界证据）。

### 布局分析侧（`.checkpoint/visual.json#layoutStructure.layout.sections`）
顶层只有 `header / stat-cards / device-table` **三段**；尾部一行（图例 + 链接）**没有独立段**。
- `stat-cards` 段系统性偏离：`layout:vertical`（真值横排）、`repeatedFill:"#a6ceff"`（真值双 GRADIENT_LINEAR）、
  label `#ffffff`（真值 `#333`）、value `36/bold`（真值 `24/400`）、value 色 `#0362a6`/`#00c72b`（真值
  `rgba(57,101,255,1)`/`rgba(0,172,46,1)`；`#00c72b` 其实是**图例 dot** 的绿）、`flexGrow` `1.286/0.857/1.286`
  （真值三卡等宽 134px）、`figmaHeightPx` `21/14`（真值卡高 66）。
  **特征高度一致**：`flexGrow` = 42/28 **文本宽度比**、`figmaHeightPx` = **文本高度**、`repeatedFill` = **图例 dot 色**
  ⇒ 元素绑定错位到 **TEXT 子节点**，而非卡片 GROUP。
- **对照**：同一份 `visual.json` 的 `device-table` 段**很准**（表头 4 列齐、每行 `icon + 4×text` 齐、列宽/行高在）
  ⇒ 错误**集中于「items 类卡片组的元素绑定」**，非全链路失效。
- `coverageReport.coverageRate=96`、`anchorValidation 19/19` —— 门禁全绿但视觉有明显差异 ⇒ 门禁缺两维度：
  ① 叶段真值有 bg/border 而产物零声明；② 同 y 兄弟被渲染为纵向 stack。

### 治本方向（1 契约扩维 / 3~6 未实施；**2 已由刀 53h 落地**，见下节）
1. 接管渲染器数据契约扩维：`tr.cols[].cells[]` 增 `{bg, border, pad:{t,r,b,l}}`，从 `fills/strokes/padding*`
   取真值并**内联输出**（与 font-size 同套路，规避微码预览 scoped style 失效）⇒ 落 `folded-grid-section-takeover.js`
   table/statrow/grid/header 四分支。
2. ✅ **已实施（刀 53h）**：接管时同步处置 stylesheet。🔴 落地时**否掉了「重命名保其值」分支**（根因见下节
   「为何只能走孤儿判定」）⇒ 实为**显式删除零引用孤儿 + 留痕**（消灭第三态：既失效又误导）。
3. 同 y 兄弟合并判据（**父段级**）：父段无 `layoutMode`（GROUP）时用子节点 y 带聚类判同排，产出横排容器段。
4. 图标型 cell 支持：cell 出现 `RECTANGLE + TEXT` 兄弟时契约要能带 icon（复用刀 53c 的 img 渲染）。
5. 资源挂载：`43:4783` 需下载；`bg-5909` 只能挂到对应统计卡；`theme-vars.less` 相对层级修正 + 零消费定义剔除。
6. 门禁补维度：① 叶段「真值 bg/border 非空 ∧ 产物零声明」= 告警；② 同 y 兄弟纵向 stack = 告警。

### 刀 53h 孤儿样式规则处置（写盘出口；`utils/orphan-style-rule-guard.js`；2026-10-23 落地）

#### 🔴 为何只能走「孤儿判定」，不能走「重命名保其值」
治本方向 §2 原写「旧规则**重命名为新 fg- 类名并保其值**」——**落地前证伪**：
`folded-grid-section-takeover.js#collectFoldedGridTakeover` **完全不读**旧 LLM 模板内容，改从 section tree **确定性渲染**
⇒ 「旧类名 → 新 `c-<sem>-fg-<kind>-<id>`」之间**没有任何映射可依**。故只能做孤儿判定：
零引用 ⇒ 删块 + 留痕（`.c-device-content-section4` / `-col` 的值「与真值逐位一致」也只能删——**它已永久失联**，
留着只会误导后人以为它在生效）。要「保其值」须先做 §1 契约扩维把值搬进渲染器，那是**另一刀**。

#### 判定模型（`findOrphanStyleRules`）
枚举 `.less`（`resources/styles/**`）里每个顶层类块（`splitTopLevelClassBlocks`）。**选择器头全部类名均孤儿 ⇒ 整块删**
（`.a, .b {}` 有一个被引用即整块保留）。三类保留（任一命中即保留整块）：
- `dom-referenced`：`resolveDomClass` 命中 **或** `fact.bases[base]` 有基名分组（含修饰符 `--x` 的变体）。
- `literal-elsewhere`：`new RegExp(\`(^|[^A-Za-z0-9_-])${escapeRx(cls)}([^A-Za-z0-9_-]|$)\`)` 在**定义文件之外**的引用池命中。
- `dynamic-prefix`：`cls.toLowerCase().startsWith(stem)`，`stem` 来自 `collectDynamicClassPrefixes`（见下「死分支」）。

跳过（不删也不算孤儿）五类：`not-class-selector` / `less-mixin`（`LESS_MIXIN_HEAD_RX`）/ `fg-takeover-namespace`
（`FG_TAKEOVER_CLASS_RX` 命中，`-fg-` 命名空间归接管器管）/ `no-class-token` / `dynamic-selector`（块头原文含 `$`/`` ` ``/`{}`）。

#### 🔴 单一来源（禁造第三份解析）
- 枚举 = `style-class-consolidator.js#splitTopLevelClassBlocks`（既有导出）。
- 删除 = 同文件 `#removeClassBlocks`（本次**升为 export**，实现**零改动**；JSDoc 标注「单点实现，禁止调用方另写一份」）。
- DOM 事实 = `class-facts.js#collectClassFacts` / `resolveDomClass`（既有）。
- `.css` **不手改** = 下游 `recompileIndexCss`（`layout-style-refiner.js:521` / `layout-refiner.js:452` / `style-refiner.js:570` /
  `lite.service.ts:638`；调用者 `mc-component-graph-phase2.js:4477/4557/4581` 串行）会自动重编 ⇒ **只改 `.less` 源**。

#### 挂点
`file-writer.js` **循环外整体一次**（照抄刀 41 形态：`:806-841`，位于刀 41 执行块之后、逐文件循环 `:843` 之前）：
先对 `filesForWrite` 跑一次 `dropOrphanStyleRules` → 回灌变化文件 → 留痕。fail-open（异常只 warn）。

#### 🔴 探针/判据护栏（三条）
1. **引用池必须排除 `.css` / `.json`**：`.css` 是编译产物、`component-meta.json` 会**回显类名**（实测 2 处）⇒ 纳入即「永不判孤儿」假绿。
   `REF_POOL_RE` 含 `vue|js|mjs|cjs|ts|mts|cts|jsx|tsx|less|scss|sass|styl|html|htm`，**刻意不含 css/json**。
2. **插值前缀干保护**：`c-daily-overview-c310c7e3/package/index.vue:23` 有 `` `c-daily-overview-card--${card.key}` ``
   （实测真存在）。`collectDomTokensFromTemplate` 的 token 白名单 `/^-?[a-zA-Z][\w-]*$/` 会**丢弃**含 `${` 的整段
   ⇒ 静态 DOM 事实里**没有**该变体 ⇒ 不额外保护就会误删 `--` 变体块。故用 `collectDynamicClassPrefixes` 单独提「插值前缀干」
   （`DYN_PREFIX_TEMPLATE_RX` / `DYN_PREFIX_CONCAT_RX`，要求 `stem.length ≥ 4` 且 `endsWith('-')`）。
3. **删后复检**：`dropOrphanStyleRules` 删除后重枚举，`still.length` 累加进 `stats.residual`（=0 才算干净）；
   `remove-noop` 进 `skipped`；异常 fail-open 返回空 map。

#### 🔴 两处死分支教训（自查发现，非测试暴露）
- **`dynamic-selector` 曾真死**：`hasDynamicFragment` 原挂在 `classes` token 上，而 token 正则 `\.[a-zA-Z][\w-]*`
  **永不捕获** `$` / `` ` `` ⇒ 恒不触发。修：新增 `headHead(blockText)`（取块头首个 `{` 前**原文**）改判 `hasDynamicFragment(headHead(b.text))`；
  `headClassTokens` / `isMixinHead` 一并复用 `headHead`。**教训：判「动态」必须判选择器头原文，不能挂在 token 上。**
- **`dynamic-sibling` 恒不触发**：原判 `fact.bases[base]` 存在，被 `referencedByDom` 的**同一子句完全覆盖** ⇒ 死分支。
  改造为真正生效的 `dynamic-prefix`（`collectDynamicClassPrefixes` + `startsWith`）。spec 阴性④专门构造「静态无该 token」做阳性对照。

#### 真机探针证据（只读，产物 `c-device-cd8938f8`）
`FILES 22 / domFiles 8 / scanned 6 / blocks 17 / candidates 13`；
`REMOVED = common.less :: .c-device-content-section4 | .c-device-content-section4-col`（**恰好 2 条业务孤儿**，与报告一致）；
`KEPT 11`（全 `dom-referenced`）；`SKIPPED 4`（全 `less-mixin`：`.common/.theme-light/.theme-theme_2/.theme-dark`）；
`CHANGED = ['resources/styles/common.less'] residual 0`。**`dynamic-prefix` 重构前后逐项不变**。

#### 验证证据
- spec 12 例全绿（`utils/__tests__/orphan-style-rule-guard.spec.ts`）：阳性①真机同形双孤儿删+留痕；阳性②真删块含嵌套
  `&:first-child` + 只回灌变化文件；阴性①`-fg-` 命名空间；阴性②Less mixin；阴性③跨文件字面引用；**阴性④插值前缀变体（阳性对照）**；
  阴性⑤选择器含 `${`；**阴性⑥`.json`/`.css` 不算引用（防假绿）**；护栏 `scannedFiles=0`；分组选择器整块保留；fail-open。
- 联合回归 87/87（`orphan-style-rule-guard` + `folded-grid-section-takeover` + `plan-orphan-guard`）。
- 路径级基线对照：同命令同 189 套范围，改动前后**均 9 个非本刀 suite 失败、集合完全一致**（全在既有 flaky / `env -i` logger 环境类名单）⇒ 无新增失败。
- `npm run build` 成功（写戳 `git=baeba88`）；dist 核验 `dist/ai-engine/utils/orphan-style-rule-guard.js` 存在、
  `file-writer.js` 含 `dynamicPrefixes`×2 / 刀 53h 留痕串 5 处。

#### 🔴 已知残留（本刀不处理）
- **注释横幅不属于任何块**：`splitTopLevelClassBlocks` 剥离行注释（`line.replace(/\/\/.*$/, '')`）⇒ 删块后
  `.c-device-content-section4` 上方的 `// 电量数据列…` 注释**残留**。若该注释语义写错，会留下误导文字。
  要清需扩展块模型（把注释归属到紧邻块），属**独立刀**。
- `component-meta.json` 里失效类名回显仍在（本刀只清理 `.less` 源；元数据回显是另一层）。

## 刀 54 / 55 / 56 / 57 与方案 F 详判据（2026-10-23；单行索引在 MEMORY.md）

### 刀 55 plan 外编造副本（`utils/plan-orphan-guard.js`）
判据：组件名 ∉ `assignSectionComponentNames(plan.effectiveSections)` 名集合 ∧ 可见文本集合是某 plan 内组件 Y 的
**子集** ∧ Y **唯一** ⇒ 判编造副本；确定性删文件 + 摘 `index.vue` 标签/import（复用刀 54 的文本抽取器，
**避免两份实现**）。挂 `pre-write-self-healing` ⑳（`planForOrphan = effectiveSections ? {effectiveSections} : null`，
无 plan ⇒ fail-open）。

### A 方案 plan 层覆盖门禁（`utils/section-plan-coverage.js`）
挂 `subcomponent-planner.js` plan 落定处（`applyFlexGrowFallback` 后、`uniqueSectionIds` 前，**双链路同一入口**）。
三判据：① 覆盖缺口 / ② 兄弟重叠 **只诊断留痕**；③ 纯文本行段锚点膨胀（合成 id + children 全 TEXT + 锚点含容器
⇒ 用 children 的 TEXT id 重建 `sourceNodeIds`）**确定性修复**。
🔴 **①② 不做补建**：v-for 假阳实锤 —— `c-aiot-dpjh-bsjd-4e35965c` 5 张卡 30 条文本「未覆盖」但产物
`ContentSection.vue:34-38` 6 卡数据全在（plan 只锚第 1 张）⇒ 补建 = 给 ~42% 组件凭空加组件 + 双渲染。
③ 在 137 组件上**零命中** ⇒ 零回归风险。

### 刀 54 硬编码文本门禁（`utils/hardcoded-text-gate.js`）
truth = **Figma 全树** TEXT 全集（**不依赖 plan/section 归属** ⇒ 无 id 的编造组件也在网内）；
扫产物可见文本字面量（静态文本 / 展示属性 / `ref` / `const` / **v-for 数据源数组**字段值）∉ truth ∪ 白名单 ⇒ 硬编码；
heal（唯一编辑距离候选，**禁语义推断**）→ strip → residual；两级「宁漏不误删」阀：
`group-majority-untruth`（同字段多数非真值）+ `file-majority-untruth`（整文件多数非真值）。
**多位数字不放行**（N1 是诊断型不改写 ⇒ 臆造数字只能靠本刀拦；仅放行单个数字字符）。
挂 `pre-write-self-healing` ⑲（**双链路**，`figmaRoot` ctx 已有 ⇒ 勿加调用方入参）。
既有 `do-not-invent` / `section-content-guard` 都不判文本来源；`business-text-rules#isTextAllowedByRules`
判据存在但**零消费者**（死代码）。

### 刀 53e 列式表格整表接管（`detectTableLeaf`）
判定顺序 grid→header→statrow→**table**→text→icon（statrow 每卡 2 TEXT / table 每列 ≥3 TEXT ⇒ 天然互斥）；
**两阶段分组同 statrow**（按 `parentId`，memberIndex 最小者渲染整表，其余 `display:none`）。
渲染：column 包行、行内 row 包列，表头行 + `v-for` 数据行；列宽按 **`width/列宽和`** 转百分比
（用父宽会因 1px 咬合让总和 >100%）。`FG_TAKEOVER_CLASS_RX` 加 `table` ⇒ 4 消费者自动生效。
本单实测：整表 4 列 × 9 行含表头、行高 44、总高 388。
🟡 「页脚组件重渲染表格内容」**不在本刀射程**（它在 plan 名集合内 ⇒ 刀 55 不拦、文本是真值 ⇒ 刀 54 不拦）
⇒ 只能靠内容守卫「借用文本」自愈（方案 F）。

### 方案 F 文本删除形态扩维（`section-content-guard.js`）
旧 `removeStaticTextNode` 只认 `>text<` ⇒ 守卫算出 duplicate/borrowed 却零自愈。新 `removeTextBinding` 三类：
① 静态；② `{{ expr }}` Mustache 整段（三条同时成立：expr 简单标识符/`.` 路径 + 根标识符声明值 trim 后恰等于目标文本
+ **全文仅出现 2 次**）；③ `removeBorrowedDataRows` 数组整行（行内字符串**全部** ∈ 借用集合才删，部分命中整行跳过，
**按行独立**）。
🔴 声明行删除正则必须用**标识符 root** 而非目标文本（混用会只删 mustache、留下未使用声明 = 比不删更糟，探针实锤）
⇒ 加「声明没删掉就 continue，不许只删一半落地」。
🔴 删引用与剪 import **同处完成**：删掉唯一 `ref('…')` 后要剪 `import { ref }`（`pruneUnusedReactiveImport`，
**只认 ref/reactive**，判据 = 全文再无 `name(`）。接线：`healDuplicateTextIssues` + `healBorrowedEvidence` 同用一份；
borrowed 侧**按文件聚合**文本后整行删（逐条删删不掉 8 行数据）。

### 刀 56 字面量漂移（`hardcoded-text-gate.js#pickSiblingTruthCandidate`）
同字段 CJK 真值兄弟 + truth 中**唯一**最小编辑距离缺失真值 ⇒ `healHardcodedText` **全文**替换字符串字面量
（数组值 + `=== 'x'` 判色键一并改，CSS class 名不动）；**先于 strip**（strip 清空值留永假比较键 = 文字颜色双丢）。
🔴 三判据补丁：字面量 ∈ truth 不配对（真值「停用」被错配实锤）；heal 循环 `next` 初值须 `null`
（content 会把 strip/residual 变死代码）；spec fixture 须让 name 值进 truth（否则撞 file-majority 阀整文件 residual 假阴）。
本单实测 disabled→禁用、文本残留 0（剩 2 处全是 CSS class 后缀 `--disabled`，正确保留）。

### 刀 57 面板标题槽位归属（`panel-chrome-misplacement.js#healPanelTitleSlot`）
双标题治本 —— 五判据（`#header-right` 直接内容 = 单 PascalCase 组件标签 / 组件带 `data-section-id` /
plan 段 `type==='header'` / Figma 子树恰 1 非空 TEXT / 同文件无既有 `#title-left`）⇒ slot 改挂 `#title-left`；
挂 `pre-write-self-healing` ⑮-c。配套 default-panel `header-title` 加 `v-if="!slot['title-left']"` 让位
（现有产物 0 个用 ⇒ 零回归）。本单实测 HeaderSection(807:3) 命中。
🔴 前端 `build:safe` 堆上限须 ≥4096（2048 必 OOM，峰值 >2GB）。

## 2026-10-25 从 MEMORY.md 迁出的索引详版（MEMORY.md 瘦身用；单行索引仍在 MEMORY.md）

### 基础族判据详版（①~⑤）
① 两段式铁律「合并/收敛 → 门禁」两侧必须同一实现；LESS 圆括号三件套须经 `less.render` 真编译。
② 主题色门禁白名单只读 `css-vars.js` 的 dark 表；`less#dark` 与 `js#dark` 必须同写。
③ 多主题真值在 `dualTruth.themes[].nodeData`；带 `// 自动添加（语义推断）` 注释的**不是**真值。
④ E1 只提升容器类型；孤儿段的 `name` 才是文案（断言用 `text ?? name`）。
⑤ 覆盖缺口只算**叶子 section**且判定在 **TEXT 级**；Figma 根不算叶子容器。
`collectLeafSections` 只递归 `isLayoutContainerSection` 为真的段（`isLayoutContainer:true` 或 `layoutSource==='container-rebuild'`）⇒ fixture 造容器段必须带该标记。

### 装配层「接管后样式失配」详版（cd8938f8）
- 机理：刀 53 家族接管改写模板 class，但不维护 stylesheet ⇒ ① 接管段全裸样式；② 旧规则成孤儿（第三态「既失效又误导」）。
- 实测：模板 class 48 / 命中样式 11 / 裸类名 37 / 业务孤儿 2（`.c-device-content-section4`、`-col`，其 `#e2ecfe`/`#bdd5ff` 与真值逐位一致却已失联）。
- 刀 53h（`8f7acc0`）：`utils/orphan-style-rule-guard.js` 挂 `file-writer.js#writeFiles` 循环外整体一次（刀 41 后、逐文件循环前），回灌 `filesForWrite`；真机 13 候选 → 2 删 / 11 留 / 4 mixin 跳过 / residual 0。
  🔴 只能走**孤儿判定**不能重命名（接管渲染器不读旧模板 ⇒ 无类名映射）；引用池**必须排除 `.css`/`.json`**（否则「永不判孤儿」假绿）；只改 `.less`（`.css` 由下游 `recompileIndexCss` 重生成）。
- 契约扩维（`01868d8`）：`folded-grid-section-takeover.js` 的 table/statrow/grid/header 四分支补 `{bg,border,pad}` 并内联输出；`section-tree.js` 导出 `fillsToCss/strokesToCss/nodeAppearanceTruth`。根因 = 数据契约缺维（原模型只有 `{text,color,fs,fw}` ⇒ 斑马纹/表头底色/白网格线/卡渐变底全丢）。
- 两处死分支：① 判「动态选择器」须看**选择器头原文**（token 正则永不捕获 `$`/`` ` ``）；② 判「动态变体保护」须用**插值前缀干**（`` `c-x--${k}` `` → `c-x--`），挂 `fact.bases` 会被 `referencedByDom` 覆盖 = 恒不触发。判定手法：模板 class 集合 ⊖ `.css/.less` 选择器集合（剔 `.png/.less/.light/.dark/.theme_2/.common` 噪声）；截模板必须 `lastIndexOf('</template>')`。
- 分析侧同单实锤：`stat-cards` 段元素绑定错位到 TEXT 子节点，同文件 `device-table` 段准确 ⇒ 错误集中于「items 类卡片组」；门禁全绿（96/19-19）却漏两类。

### 诊断手法详版
- 门禁三查 = 守卫形状全语料量化 / 日志 id 留痕 / 离线探针三态。🔴 0 命中必配阳性对照，且变异须打在**真正生效的那一层**；改判据先纯函数 A/B；判据叠两层后前层对照会被后层掩盖 ⇒ 加兜底后重造对照。**改的人和验的人用同一正则 = 假绿闭环**。
- 归因：路径级 `git stash push -m <tag> -- <全集>` → 基线 → **立即 pop**（或两态差分对跑）。
- 判生产 dist 一致 = 逐文件 md5 清单 diff（`tr -s ' '` 归一化）；僵尸进程 `ps -eo pid,cmd | grep -E '…' | grep -v grep | wc -l`。

### 刀 53 家族 / 刀 54-57 索引详版
- 刀 53 判定顺序（`folded-grid-section-takeover.js:1322-1345`）：网格 → 标题行 → **统计行** → **表格** → 纯文本 → 纯 icon。`detectHeaderRowLeaf`（`:165-234`）判据 = 恰 1 TEXT + ≥1 ≤32px 图标 + 图标在文本左侧同 y（Δy≤2）+ gap 0..48 + 图标须在 `resourceMapping` 且 `downloadStatus !== 'failed'`。
- 刀 53d/53e 两阶段（`statRowPending`/`tablePending`）：按 `parentId` 分组，组内 `memberIndex` 最小者渲染、其余渲 `display:none` 空壳。`folded-grid-section-takeover.js:1308-1316/1370/1396-1401` 注释明写「真值 x 最小的成员/列**未必在 plan 里**（本单 plan 只切了 `43:4785` 与折叠段 `43:4812-list`）⇒ 若要求 memberIndex===0 才渲染，本单会整表变空」。
- 🔴 空档（本单 ab7bb76c）：`43:4869`/`43:4875` = `TEXT + ELLIPSE` 圆点图例，被 `text:hasGraphic(ELLIPSE:43:4871)` 否掉 text 分支、`icon:hasText(1)` 否掉 icon 分支 ⇒ **无刀认领**。
- 刀 53 家族接 vue3（`b16a2a6`）：判据族/渲染器/终裁出口与 microcode 同一实现（`_fgTakeoverFiles` 由 `writeFiles` 自动带）。🔴 唯一差异 = vue3 子组件名 LLM 自由 ⇒ **禁止照搬 microcode「tag 即文件名」**（恒零命中 = 假绿）；映射唯一实现 `matchFgTakeoverTargets`（名命中跳 chunk / 产物 `data-section-id` 命中覆写；主组件 `package/index.vue` 硬护栏）。prompt 侧 `b0d4ae4`：只下发接管名 + 锚点规则与命名解耦。开关 `MVGO_VUE3_NAMING_CONTRACT=0`；评测台 `scripts/ab-vue3-prompt.mjs`（无密钥 ⇒ 下发名须从 A 臂 prompt 反解）。
- 方案 F（`section-content-guard.js#removeTextBinding`）：三类形态（静态 / Mustache 整段 / `removeBorrowedDataRows` 整行）+ 声明行删除正则用标识符 root + 删引用与剪 import 同处完成 + borrowed 按文件聚合。
- 刀 54（`utils/hardcoded-text-gate.js`）：truth = Figma 全树 TEXT 全集（不依赖 plan 归属）；两级阀 `group-majority-untruth` + `file-majority-untruth`；**多位数字不放行**；挂 ⑲（双链路）。`business-text-rules#isTextAllowedByRules` 零消费者（死代码）。
- 刀 55（`utils/plan-orphan-guard.js`）：名 ∉ plan 名集合 ∧ 文本集合是某 plan 组件 Y **子集** ∧ Y 唯一 ⇒ 删文件 + 摘 index.vue 标签/import（复用刀 54 文本抽取器）。挂 ⑳；无 plan ⇒ fail-open。
- A 方案覆盖门禁（`utils/section-plan-coverage.js`）：挂 `subcomponent-planner.js` plan 落定处（双链路同一入口）。①② 覆盖缺口/兄弟重叠**只诊断不补建**（v-for 假阳实锤）；③ 纯文本行段锚点膨胀确定性修复（137 组件零命中）。
- 🔴🔴 方案文档判据只能当假设：f98f7463 C 方案写「列容器同宽 ±2」，实测 4 列 179/98/98/98 ⇒ 照抄恒零命中假绿。落地版 = 同高±2 + 同 y±2 + x 严格递增（允许 ≤2px 咬合）+ 各列 TEXT 数相同且 ≥3 + 跨列逐行 y 对齐 ±2 + **父的全部直接子项都在同一行带**（`band.length===sibs.length`）。

### sourceType 事故详版（mc-max-1792934332868-389dd460；`d3d103a`+`db6c46a`）
- 表现：`'import' and 'export' may appear only with 'sourceType: "module"' (6:0)`；产物 `runtime.js` 第 6 行 `export {...}`、第 7 行游离 `</script>`。
- 根因：vue3-sfc-loader@0.9.5 `handleModuleInternal` `case ".js": createJSModule(src, false)` = script；`.mjs`/`.ts` 传 `true` = module ⇒ `.js` 顶层 ESM 必抛。🔴 `</script>` 两模式都解析不了 ⇒ 单层修不了。
- 治理：① 管线侧 `file-writer.js#sanitizeFileContent` **4J 分支**（`:187-213`，插在 4L-b 之后、`.vue` 分支之前）只剥「独占一行的 `</?template|script|style>`」（比 4L-b 窄：JS 里 `<div>` 合法；行级豁免行内字面量）；② 加载器侧新建 `frontend/src/utils/sfc-loader-esm-js.js#resolveJsModuleTypeOverride` 双闸（只 `.js` ∧ 行首 ESM 标记 ∧ `new Function` 抛 SyntaxError）⇒ `getFile` 返 `{type:'.mjs',getContentData}` 走 `getResource` 类型覆写口。🔴 `createJSModule` 未从包导出 ⇒ 类型覆写口是唯一挂点。两侧接入 `views/preview/index.vue`（微码生产路径）+ `utils/loadVue3Runtime.js`（Vue3 路径）。
- 🔴 `.js` 在三管线零防护（`sanitizeFileContent` 只 `.less/.css/.vue`；`stripLlmTailGarbage` 显式跳 `.js`；`microcode-engineer` 语法循环只 `.vue`）。
- 验证：spec 10/10 + 前端离线 16/16；两态差分 **必先 `wc -l` 确认捕获非空**（`2>&1 > f` 顺序错 ⇒ 0 字节 ⇒ diff 假绿）。

## 2026-10-26 从 MEMORY.md 再迁出（MEMORY.md 二次瘦身；单行索引仍在 MEMORY.md）

### P1-A `plan-body-child-id-audit.js` 详版（案例 mc-max-1792934367321-ab7bb76c）
- 病灶：vision 给的 `body.children[].id` 出现 ① 自引用（`child.id` 恰等于该 section 的 Figma 锚点 id）② 同父复用（同一 body 内同 id ≥2 次且 name 各异）。后果 = 下游按 id 到 Figma 树取真值全落空 ⇒ 没有任何刀接管该段。
- 实测：`807:3` 的 `body.children` = `[{id:43:4879,name:标题装饰线},{id:43:4879,name:菱形图标},{id:807:3,name:标题文字,text:具身机器人设备列表}]`（3 项 2 个 id，且含自引用）。
- **只诊断不改数据**：id 错位后无法确定性反推正确 id（需 Figma 树 + 几何回溯 + 语义匹配三者联合；`43:4788`→真值 frame 是 `43:4784`，猜 `43:4785` 会把整表挂到第一行）⇒ 只留痕，既有降级路径（刀 53 两段式 / coverage 门禁 / 锚点守卫）保持原样。
- **挂点铁律**：必须在 E1 `deriveSectionsFromFigmaTree` **之前**（`subcomponent-planner.js` `rawSections` 定义后、E1 调用前）。E1 会用 Figma 树重建结构把 `body` 拍平 ⇒ 之后校验永远零命中（假绿）。
- 判据 A1 `self-reference` + A2 `duplicate-sibling`；锚点解析优先级 `figmaAnchorId → figmaNodeId → id`；id 必须过 `section-anchor-truth.js#FIGMA_ID_RE`（`/^\d+:\d+$/`）⇒ 合成段 id（`43:4791-list` / `807:2-tail-text`）天然不匹配，不误判。
- 不做 `not-a-descendant` —— 与 `section-anchor-truth.js#auditSectionAnchors` 的 `anchor-not-ancestor` 判据同构，遵守「同构判据不得写第二份」。
- 计数行硬要求：`evaluated/bodySections/entries/selfReference/duplicateSibling`，否则「零命中」与「没跑」不可区分。`MAX_ISSUES=40`、`SAMPLE_LIMIT=6`、`CHILD_DEPTH=1`。
- spec：`utils/__tests__/plan-body-child-id-audit.spec.ts` 15/15（A1 3 例 / A2 3 例含「name null 不构成 name 不同」阴性 / 锚点解析优先级 4 例 / 健壮性计数行 5 例）。

### P0「面板标题段被还原」根因链详版（mc-max-1792934367321-ab7bb76c）
1. `visual-parser` 把 Figma `807:3 header` 当普通内容节写入 plan：`sections[0]={id:'807:3',name:'面板标题栏',role:'常驻',headerRelation:'title-itself',title:'具身机器人设备列表'}`。
2. `section-tree` 给该节 `type='header'`（`isHeader = /header/i.test(name)`，Figma 节点名正是 `header`）。
3. `chromeOnly` 标记 = `headerIsChromeOnly(child)`，但 `807:3` 子树含 `43:4879` **FRAME**（`BUSINESS_CONTAINER_TYPES` 命中）⇒ `business=true` ⇒ `chromeOnly=false` ⇒ **不被 `stripChromeOnly` 剥离**（关键盲区）。
4. 刀 53 同构段接管 `headerTaken:1` → `HeaderSection.vue`（`data-section-id="807:3"`）。
5. `code-generator` 发射 `<template #header-right><HeaderSection /></template>`。
6. 刀 57 `healPanelTitleSlot`（`panel-chrome-misplacement.js:336`）五判据全中 → `#header-right` 改挂 `#title-left`；前端 `default-panel` 的 `header-title` 因 `v-if="!slot['title-left']"` 让位 ⇒ **Figma 设计稿标题取代 componentName**。
- 🔴 漏网真因：`isPanelHeader`（`subcomponent-planner.js:417`，`PANEL_HEADER_PATTERN = /panel[-_ ]?header|标题栏|^header$/i` ∧ `countElements(sec) < 4`）**只作用于 vision `rawSections`**；E1 分支用 `derived.sections` 整体替换 `sections` ⇒ 取而代之只受 `stripChromeOnly`（`type==='header' && chromeOnly===true`）管辖 ⇒ 漏网。
- 🔴 可复用线索：`inline-header-slot-inferrer.js#ensureHeaderSlots` 会算出 `headerSectionIds`（含 `title-itself` 段），但 `visual-parser.js:3629` **只在 logger 打印，未写回 `parsed`** ⇒ 该「应剥 chrome 段」清单被丢弃。
- 张力：`ai-generation-constraints.md:223-235` 明禁生成面板标题栏/文字/装饰线，与刀 57 取向相反（已知）。
- 候选治本：① plan 层抑制「面板标题段」（`role=常驻 ∧ headerRelation=title-itself ∧ 子树 TEXT 与 componentName/componentTitle 同义`）；② 刀 57 fail-closed（删组件 + 保留 chrome）。🔴 不可把「含 FRAME 的业务 header」误删 —— `headerIsChromeOnly` 的「FRAME=业务」保守判定正是漏网原因，放宽须配阳性/阴性双向对照。

### 通用铁律详版（MEMORY.md 二次瘦身迁出）
- 🔴 **透传自检三铁律**：① 区间锚点命中数 === 1；② 每一跳都要有阳性对照；③ 计数用「含字段行数」。
- 🔴 方向类判据判「DOM 真实子项排布」，不判声明顺序；heal 必须翻转**全部**出现点；配额判据的「收集」与「裁剪」必须解耦。
- 🔴 `:deep()` / `scoped` 在微码全局注入（`resources/styles/index.css` 统合）下是**死规则** ⇒ 确定性产物类名必须组件内唯一。
- 🔴 **装配层刀具唯一有效挂载点 = `file-writer.js#writeFiles`**（pre-write-self-healing 之后仍有 4 个覆写/回退步骤）；刀 41 必须 per-file 循环前整体跑；刀 50/52 几何裁决共用 `resolveStackGeometry`。
- 🔴 **加新入参必查下游每层解构 + 白名单 / initialState**（漏一层 = 静默丢弃、零报错）。`generateCode` 用 `input.x`、`execute` 用裸变量。
- 🔴 `splitTitleValueByStyle`（`section-tree.js`）入参形状 = `{text, fontSize, y}`，**不是 Figma 原始节点**；喂错 ⇒ 恒 null ⇒ 判据假性零命中。
- 🔴 `getFigmaBox` 形态陷阱：必须四元齐全（x/y/width/height），裸 `{width,height}` 判 null；`resolveSectionFlexSize` 取 `sourceNodeIds` 并集。
- 🔴 卡内横竖排 / 间距一律**几何判定**：x 区间不交叠且 y 区间有交集 ⇒ 横排；间距按实际序取正向值（**禁止两侧公式取 min**）。
- 🔴 改 prompt / 规范前「**加载链三查**」：生效根是 `references/**`；`prompts/agents|references/**` 是死文件。
