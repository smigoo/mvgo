# mvgo 每日工作摘要

## 2026-09-11

### 📊 变更统计

| 仓库 | Commits | 文件数 | 主要变更类型 |
|------|:-------:|:------:|-------------|
| backend-node | 12 | ~60 | 管线根治（SFC 模板提取/悬空标签/根容器塌陷/资源契约反转/双重解释去重/产物不变量） |
| frontend | 0 | 0 | - |
| backend-java | 0 | 0 | - |
| docs | 2 | 3 | 管线复发问题根治方案 + 类名结构单一事实源设计 |
| 主仓 | 0 | - | - |
| **合计** | **14** | **~63** | |

### 🔑 核心变更

#### backend-node（12 commits，~60 文件，+3500/-800 行）

**P0 级根治（5 commits）**：
- **悬空标签根治**（1e3b009）：lazy `</template>` 截断家族全面修复（0ca84358 实锤三例同根因），新增 `sfc-template-extractor.js` 边界法替代 lazy regex，16 文件统一改用
- **根容器塌陷双防**（274524e）：`fixSectionHeightsForResource` 规则②豁免补 `-slot-con` + 新增 `root-container-normalizer.js` 落盘终验归一（flex→height:100%）
- **资源契约反转**（f47eca9）：子组件资源改回本地 import，父不再透传——`stripResourcesPropsFromDefineProps` 去资源 prop，CODE-019 检测面归零
- **CODE-023 悬空子组件标签门禁**（f4cb6b4）：模板标签↔import↔文件三要素对齐 + `pruneUnmountedResourceImports` 修复器
- **planner 双重解释去重**（41cdf7a）：`dedupeDuplicateSections` 同 type=tabs 同 responsibility 分组去重，根治「左垂直tab栏+右设备网格」完整副本

**P1-P2 级治理（4 commits）**：
- **层① 确定性模板装配**（f0e6e7b）：有计划子组件时模板骨架由系统生成 + `pruneDeadSubComponentImports` 删死 import
- **层② 子组件清单并入模板标签**（1799dad）：`_unionTemplateTagSubComponents×3` + `class-prefix-fixer` 模板类名统一补前缀（CODE-020 确定性自愈）
- **P2-1 时序治理**（81a885b）：终验链 aspect-ratio 兜底 + 死接线审计（`mechanism-reachability-audit.mjs`）+ 删除 `generation-context.js` 死包装
- **R2-2 产物不变量**（9d034a2）：六条 invariants 落地（CLI + 管线终验双入口），`artifact-invariants.js` +318 行

**工程基础设施（3 commits）**：
- **死文件清理**（e07bdc9）：删除 3 个零引用零 spec 零立项记录机制文件（`chart-type-mapper.js`/`figma-meta-cache.js`/`progress-manager.js`，-418 行）
- **软失败兜底**（b87084e）：L0-B 门禁重试耗尽不再 throw，改为降级完成 + `gate-score.js` 评分明细透出
- **覆盖率虚低修复**（821add9）：`inline-row-merger.js` 子节点 name 由节点号改为子树文案拼接

#### docs（2 commits，3 文件，+342 行）
- **0911-管线复发问题根治方案.md**（fc212dd + 3913801）：P0-P3 四期根治方案 + 治愈验收标准 + R2-1 修正（修复管线非死代码，主嫌疑=consolidator 重建覆盖 anchor 补丁的修复时序）
- **P1-类名结构单一事实源-方案-2026-09-11.md**（3913801）：I7 修饰符类双向一致不变量设计

### 📝 今日摘要

今日 mvgo 项目核心进展集中在 **backend-node 微码管线系统性根治**，单日 12 commits 为近期高密度输出。主要完成：
- **SFC 模板提取根治**：废弃 lazy regex，新增 `sfc-template-extractor.js` 边界法，根治具名插槽 `</template>` 提前截断导致的内容丢失（0ca84358 实锤三例）
- **根容器塌陷双防**：`root-container-normalizer.js` 落盘终验归一 + 规则②豁免补 `-slot-con`，根治 flex:1 1 0 在 block 宿主失效导致的塌陷
- **资源契约反转**：子组件资源改回本地 import，CODE-019 检测面归零（旧全量透传 props 实测反复漏传）
- **planner 双重解释去重**：`dedupeDuplicateSections` 根治 tabs 重复生成完整副本
- **产物不变量六条落地**：CLI + 管线终验双入口，确定性保障产物结构正确性

docs 同步输出两份根治方案文档（管线复发问题 + 类名结构单一事实源）。frontend/backend-java 今日无实质变更。

---

## 2026-09-09

### 📊 变更统计

| 仓库 | 文件数 | 主要变更类型 |
|------|:------:|-------------|
| frontend | 0 | - |
| backend-node | 10 | 微码管线优化（phase2/prompt-builder/resource-mounter/visual-parser/subcomponent-planner） |
| backend-java | 0 | - |
| docs | 2 | 组件生成问题分析 + 管线优化方案 |
| 主仓 | 217 | slidev 演示 + figma-plugins（命名检查器）+ temp-components（微码组件产物） |
| **合计** | **229** | |

### 🔑 核心变更

#### backend-node（10 文件未提交，+500/-19）
- **mc-component-graph-phase2.js**（09-09 00:21）：Phase 2 图结构优化，+42 行
- **microcode/prompt-builder.js**（09-09 00:29）：prompt 构建器增强，+60 行
- **microcode/resource-mounter.js**（09-08 18:43）：资源挂载逻辑优化，+52 行
- **subcomponent-planner.js**（09-09 00:13）：子组件规划器新增，+96 行（核心新增）
- **visual-parser.js**（09-08 23:02）：视觉解析器大幅扩展，+138 行
- **screenshot-renderer.js**（09-08 18:44）：截图渲染器调整，+24 行
- **microcode-engineer.js**（09-08 17:08）：微码工程师微调，+26 行
- **style-class-consolidator.js**（09-08 21:51）：样式类整合器增强，+59 行
- **style-class-consolidator.spec.ts**（09-08 21:49）：对应测试用例补充，+21 行
- **nav-section.js**（09-09 00:16）：导航区块工具微调，+1 行

#### docs（2 文件未提交，+52）
- **0907-组件生成问题分析.md**：新增 09-07 组件生成问题分析文档（+34 行）
- **生成管线优化方案-2026-09-02.md**：新增 09-02 管线优化方案（+18 行）

#### 主仓（217 文件未提交，+22241/-4）
- **slidev 演示**：30 个 slides 文件（01-30.slide + t.slide）+ DESIGN.md + STORY.md + 培训 PPTX（微码组件培训演示）
- **figma-plugins**：
  - naming-checker-v2（新版命名检查器）：code.ts（478 行）+ ui.html（158 行）+ README.md + manifest.json
  - naming-checker（旧版）：code.ts（464 行）+ ui.html（468 行）+ README.md
- **temp-components**：多个微码组件产物目录（mc-1788138863742-f9bd0808、mc-max-1788086817483-4e4799ad、mc-max-1788176720155-9560d082、mc-max-1788179386544-86ab341b、mc-max-1788327432319-a6198738），包含 ChartArea/HeaderTabs/ConcentrationChart/TabsTools 等组件 + 资源图片 + 样式文件
- **其他**：package.json/package-lock.json（依赖更新）、probe-plan-b.cjs（探针脚本）

### 📝 今日摘要

今日无 git commits，但有大量未提交变更（229 文件，+22793 行）。核心工作集中在 **backend-node 微码管线系统性优化**：
- **subcomponent-planner.js 新增**（96 行）：子组件规划器独立成模块，职责更清晰
- **visual-parser.js 大幅扩展**（+138 行）：视觉解析能力增强
- **prompt-builder/resource-mounter/phase2 图结构** 同步优化（合计 +154 行）
- **style-class-consolidator** 增强 + 测试补充（+80 行）

docs 新增两份分析文档（组件生成问题分析 + 管线优化方案），主仓堆积大量 slidev 培训演示 + figma-plugins 命名检查器 + temp-components 微码产物。

**待办线索**：
- backend-node 10 个文件待提交（微码管线优化）
- docs 2 个文件待提交（分析文档）
- 主仓 217 个文件待提交（slidev + figma-plugins + temp-components）
- hourly 扫描服务已停摆 36 天

---

## 2026-09-08

### 📊 变更统计

| 仓库 | 已提交文件 | 未提交文件 | commits | 主要变更类型 |
|------|:---------:|:---------:|:-------:|-------------|
| frontend | 0 | 1 | 0 | Demo 页大幅扩展（+471 行） |
| backend-node | 29 | 0 | 1 | Phase 3-5 管线改造（L8-L14 表格化 + 7 utils 拆分 + 6 spec + 死分支清理） |
| backend-java | 0 | 0 | 0 | - |
| docs | 1 | 0 | 1 | 0907 文档 Phase 4/5 标记完成 |
| **合计** | **30** | **1** | **2** | |

*注：hourly-changes.md 扫描服务仍未运行（自 2026-08-04，第 35 天），数据来源为 git log + git diff*

### 🔑 核心变更

#### backend-node（1 commit，29 文件，+3792/-103）

**Commit** `6f2c188`（09:23）：Phase 3-5 管线改造——L8-L14 表格化 + 7 个 utils 拆分 + 6 个 spec + 死分支清理

**A. 7 个 utils 模块拆分（从大文件中提取独立职责）**
- `src/ai-engine/utils/class-name-generator.js`（+90 行）：类名生成器，从 resource-mounter 拆出
- `src/ai-engine/utils/fixed-size-normalizer.js`（+85 行）：定宽/定高区块归一化（flex:0 0 auto）
- `src/ai-engine/utils/flex-direction-inferrer.js`（+63 行）：flex 方向推断器
- `src/ai-engine/utils/prompt-loader.js`（+100 行）：prompt 加载器
- `src/ai-engine/utils/props-wiring-guard.js`（+180 行）：props 接线守卫（防 LLM 遗漏 props 传递）
- `src/ai-engine/utils/semantic-binding-guard.js`（+129 行）：语义绑定守卫
- `src/ai-engine/utils/text-constants-builder.js`（+72 行）：文本常量构建器
- `src/ai-engine/utils/vision-figma-cross-validator.js`（+149 行）：Vision-Figma 交叉验证器

**B. 6 个 spec 测试文件新增（+1023 行测试覆盖）**
- `class-name-generator.spec.ts`（+100）
- `fixed-size-normalizer.spec.ts`（+109）
- `flex-direction-inferrer.spec.ts`（+80）
- `props-wiring-guard.spec.ts`（+266）
- `text-constants-builder.spec.ts`（+119）
- `vision-figma-cross-validator.spec.ts`（+121）
- `code-healer.spec.ts`（+96）
- `resource-mounter.spec.ts`（+437 行大幅扩展）
- `semantic-binding-guard.spec.ts`（+262）

**C. 核心角色文件改造**
- `src/ai-engine/roles/microcode/resource-mounter.js`（+712 行大幅扩展）：资源挂载器重构，接入拆分出的 utils
- `src/ai-engine/roles/microcode-engineer.js`（+323 行扩展）：微码工程师接入表格化 L8-L14 阶段
- `src/ai-engine/roles/microcode/code-generator.js`（+163 行扩展）：代码生成器增强
- `src/ai-engine/roles/microcode/code-healer.js`（+26 行）：代码修复器小幅增强
- `src/ai-engine/roles/microcode/code-validator.js`（+21 行）：代码校验器增强
- `src/ai-engine/roles/microcode/prompt-builder.js`（+3 行）：prompt 构建器微调

**D. 校验器 + 其他**
- `src/ai-engine/validators/code-structure-validator.js`（+150 行）：结构校验器增强
- `src/ai-engine/validators/code-fix-rules.js`（+4/-1）：修复规则微调
- `src/ai-engine/validators/resource-attribution-validator.js`（+15 行）：资源归属校验器调整
- `src/ai-engine/prompts/engineer/stages/figma.md`（+6 行）：Figma 阶段 prompt 补充
- `src/tasks/tasks.service.ts`（+7 行）：任务服务微调

#### frontend（1 文件未提交，+471/-3）

- `src/views/demo/index.vue`（+471 行大幅扩展）：Demo/Playground 页面功能扩展（具体功能待确认）

#### docs（1 commit，1 文件，+17/-17）

- **Commit** `5eac545`（09:24）：`0907-组件生成问题分析.md`——Phase 4/5 标记为已完成（L11-L14 全部完成），反映昨日 backend-node 管线改造成果

### 📝 今日摘要

今日 mvgo 项目核心进展是 **backend-node Phase 3-5 管线大规模改造**（1 commit，29 文件，+3792/-103 行），这是近期单日改动量最大的一次：

1. **7 个 utils 模块拆分**：从 resource-mounter、microcode-engineer 等大文件中提取出 class-name-generator、fixed-size-normalizer、flex-direction-inferrer、props-wiring-guard、semantic-binding-guard、text-constants-builder、vision-figma-cross-validator 共 7 个独立工具模块（合计 +868 行），实现职责单一化，提升可维护性和可测试性。

2. **L8-L14 表格化**：microcode-engineer.js 接入表格化的 L8-L14 生成阶段（+323 行），将原本散落在代码中的逻辑结构化为表格驱动，配合 prompt 阶段文件 figma.md 补充。

3. **测试覆盖大幅扩展**：新增 9 个 spec 文件（+1608 行测试代码），覆盖所有拆分出的 utils 模块和核心校验器，resource-mounter.spec.ts 扩展 +437 行。

4. **docs 同步更新**：0907 组件生成问题分析文档标记 Phase 4/5（L11-L14）已完成。

**提交状态**：2 commits（backend-node 1 + docs 1），1 文件未提交（frontend demo/index.vue +471 行）。

**待办线索**：
- frontend demo/index.vue 的 471 行扩展需 review 并提交
- backend-node 此前累积的大量未提交文件（09-03 的 47 文件 + 09-04 的 ~12 文件）仍未整理
- hourly 扫描服务已停摆 35 天，需排查恢复
- Phase 3-5 管线改造需构建 dist + 重启验证 + 复测组件生成质量

---

## 2026-09-04

### 📊 变更统计

| 仓库 | 已提交文件 | 未提交文件 | commits | 主要变更类型 |
|------|:---------:|:---------:|:-------:|-------------|
| frontend | 23 | 0 | 11 | 网关兼容/SSE token 统一/任务详情页重构/命名展示/预览时序修复 |
| backend-node | ~51 | ~12 | 18 | 主题变量化门禁/组件语义命名/A4高度比例/Vision路由修复/网关兼容/deepseek治理 |
| backend-java | 3 | 1 | 1 | Admin 鉴权拦截器 |
| docs | 6 | 0 | 1 | 部署指南/微码管线改造方案/还原度实施设计/培训HTML迭代 |
| 主仓 | 3 | 0 | 3 | 子仓指针同步 |
| **合计** | **~86** | **~13** | **34** | |

*注：hourly-changes.md 扫描服务仍未运行（自 2026-08-04，第 32 天），数据来源为 git log + git diff*

### 🔑 核心变更

#### frontend（11 commits，23 文件）

**A. 网关兼容 + HTTP/SSE 统一（3 commits，11 文件）**
- `src/api/workflow.ts`：API 调用统一走 `core/http`（自动 token/upload、响应兼容 `res.data||res`），81 行重构
- `src/api/generator/generator.ts` + `src/composables/useSsePool.ts` + `src/utils/api-token.js` + `src/utils/preview-resolver.ts`：SSE 统一 `createProgressStream` 携带门户 token；api-token 支持 URL/hash token；预览链接附加 token query
- `src/api/page-skeleton.ts` + `src/api/screen-layout.ts` + `src/views/admin/ManagementView.vue` + `src/views/demo/index.vue`：DELETE→POST /delete 同步（网关兼容配套）

**B. 任务详情页重构（4 commits，4 文件）**
- `src/views/tasks/TaskDetail.vue`：任务号置顶、组件名次行、复制任务号、身份字段显式标签化、显示组件ID、概览卡复制图标绑定任务号（4 轮迭代）
- `src/components/generator/WorkflowMonitor.vue`：FAB 贴边几何修复（+133/-41 行大幅调整）

**C. 组件命名展示优化（1 commit，2 文件）**
- `src/views/generate/component.vue` + `src/views/generate/components.vue`：生成页 recent/历史/拆分列表展示优先 `displayName`（组件中文名），`componentName` 仅作回退

**D. 接口对接向导优化（2 commits，1 文件）**
- `src/views/workspace/ApiBindingWizard.vue`：默认分析方式改为需求文档分析；无匹配接口时禁用下一步

**E. 预览时序修复（1 commit，1 文件）**
- `src/views/components/ComponentLibrary.vue`：修复组件库卡片预览图永远停留占位的时序 bug——`observePreviewCards` 在 `loading=true` 的 `nextTick` 里执行时卡片 DOM 未渲染（v-else-if 分支），挪到 `finally` 中 `loading=false` 渲染完成后

#### backend-node（18 commits，~51 文件）

**A. 样式主题变量化「生成即规范+门禁兜底」（1 commit，6 文件，+467/-13）**
- 新增 `src/ai-engine/utils/theme-color-guard.js`（+224 行）+ `theme-color-guard.spec.ts`（+130 行）
- 新增 `prompts/engineer/shared/style-theme-rules.md`（+49 行）+ `prompts/references/css-variable-pattern.md`（+18 行）
- `code-structure-validator.js`：L0-B 新增 THEME-COLOR 门禁（槽位色抄写/预设名重声明 BLOCK，设计专色 WARN）
- `prompt-loader.js`：shared 注入 style-theme-rules

**B. 组件语义命名方案 A+C（1 commit，3 文件，+389/-46）**
- 新增 `src/ai-engine/utils/component-naming.js`（+214 行）：`c-<语义>-<sessionId尾8hex>` 确定性唯一化
- `src/ai-engine/roles/microcode-engineer.js`：Max normalizeDeclareJson 强制唯一 + class/onload 前缀 `classPrefixOf` 解耦
- `src/lite/lite.service.ts`：Lite derive 中文语义兜底替代编码 sessionId

**C. A4 高度比例修复系列（4 commits，~12 文件，+1200+行）**
- `bef073c`：新增 `figma-height-ratio.js`（+388 行）+ spec（+328 行）+ `figma-section-heights.js`（+119 行）+ spec（+102 行），A4 元素级高度比例修复（三根因+顶层 section 配对）
- `c8e3084`：A4 扁平读键修复 + Vision 路由撞槽修复
- `7f3b695`：A4 比例确定性落 CSS + max_tokens 提限修复
- `7fc422b`：Figma 区域配对 BG 层前缀+bbox 铺满剔除增强，修复 sections 高度整体错位

**D. Vision 路由 + deepseek 治理（5 commits，~8 文件）**
- `f5d3ab9`：**治本** vision 请求错路由——主配置池 ID 角色化 `__primary_text__`/`__primary_vision__`，修复 text/vision 两槽共用 `__primary__` 且 pool.get 恒先查 text 槽致 vision-agent 拿 deepseek-v4-flash 跑图片分析（视觉识别未完成中止根因）
- `df84b6d`：修复 deepseek 空响应根因 + 网关空输出遥测与快速熔断
- `304bde8`：deepseek 思考开关模型名级兜底（防前端陈旧 payload 旁路配置）
- `57c33c2`：空输出遥测 hint 三分支判读修正（按 minimax 实测遥测）
- `b0651e0`：全局默认关闭推理模型（`disableReasoning` 兜底 + `thinkingType=skip` 过滤）

**E. 网关兼容 + 截图隔离 + 配置管理（4 commits，~12 文件）**
- `701c16c`：DELETE/PUT 路由改 POST /delete、session.guard 支持 SSE query token（6 文件）
- `8391466`：修复截图串图——独立 BrowserContext 隔离截图会话、componentId 追加 sessionId 后缀
- `db26f6a`：config 全局模型模板管理（apply/create/update/delete）接入 `users.isAdmin` 校验
- `02f26cd`：api-catalogs 数据更新——江阴2 目录替换为最新同步的江阴 API

**F. 其他修复（3 commits）**
- `5fadb7d`：子组件规划优化——header-stats 复合词优先匹配、模板子组件语义化命名指导
- `30b9b23`：修复自优化路由循环误报（分块生成节点误判）
- `bef073c`：`.start-server.sh` 启动脚本调整

#### backend-java（1 commit，3 文件，+93/-18）

- `0f43cb2`：新增 `AdminInterceptor.java`（+76 行）鉴权拦截器；`AdminController.java` 精简（-22 行）迁移至拦截器；`WebMvcConfig.java` 注册拦截器

#### docs（1 commit，6 文件，+807/-300）

- `aeb1203`：部署指南更新（+27 行）；微码管线改造方案更新（+62 行）；新增微码还原度-A2A4 实施设计（+116 行）；前端培训 HTML 大幅迭代（+902 行重构）；新增 2 张培训截图

### 📝 今日摘要

今天是 mvgo 项目近期 **commit 数最多的一天**（34 commits，~86 已提交文件），四条主线并行推进：

1. **样式主题变量化**：backend-node 新增 theme-color-guard（+224 行）+ L0-B THEME-COLOR 门禁，实现「生成即规范」——LLM 生成时直接引用 CSS 变量，门禁兜底拦截硬编码色值。配合 shared prompt 注入 style-theme-rules，从 prompt→生成→校验三层保证主题色规范。

2. **组件语义命名落地**：新增 component-naming.js（+214 行），componentId 确定性唯一化为 `c-<语义>-<sessionId尾8hex>`，Max 模式 normalizeDeclareJson 强制唯一 + classPrefixOf 解耦，Lite 模式中文语义兜底。前端同步优先展示 displayName（组件中文名）。

3. **A4 高度比例 + Vision 路由根治**：figma-height-ratio.js（+388 行）+ figma-section-heights.js（+119 行）+ 4 个 spec 文件（+700+ 行测试），彻底解决 A4 扁平 section 高度错位问题。Vision 路由根因修复——配置池 ID 角色化 `__primary_text__`/`__primary_vision__`，杜绝 vision-agent 拿 text 模型跑图片分析。

4. **网关兼容全链路**：backend-node DELETE/PUT→POST /delete + SSE query token（6 文件）；frontend workflow.ts 统一 core/http + SSE token 携带（11 文件）；backend-java AdminInterceptor 鉴权；三端同步适配门户网关。

**deepseek 治理**：5 commits 系统性解决 deepseek 空响应、思考开关旁路、Vision 撞槽等问题，全局默认关闭推理模型。

**提交状态**：34 commits（frontend 11 + backend-node 18 + backend-java 1 + docs 1 + 主仓 3），~13 文件未提交（backend-node ~12 含 server.log 轮转 + backend-java 1）。

**明日待办**：
- backend-node 未提交管线改动整理提交
- 主题变量化门禁生效后复测新组件生成质量
- hourly 扫描服务已停摆 32 天，需排查恢复

---

## 2026-09-02

### 📊 变更统计

| 仓库 | 已提交文件 | 未提交文件 | 主要变更类型 |
|------|:---------:|:---------:|-------------|
| frontend | 10 | 0 | 功能新增（公共组件池前端、推送弹窗、紧凑度优化） |
| backend-node | 7 | 26 | 功能新增（组件可见性/scope/权限）+ 管线治理（未提交） |
| backend-java | 0 | 0 | - |
| docs | 0 | 2 | 文档更新（增量补丁方案 v2、前端培训 HTML） |
| **合计** | **17** | **28** | |

### 🔑 核心变更

#### frontend（3 commits，10 文件，+915/-66）

- **公共组件池前端**（`d4cd461`）：
  - `src/api/component.ts`：Component 类型加 `visibility/sharedAt/sharedBy`；`ListComponentsParams` 加 `scope`；新增 `publishComponent/unpublishComponent` API
  - `src/views/components/ComponentLibrary.vue`：标题改「组件库」，加「我的组件/公共组件池/全部」pill Tab；卡片右上「公共」徽标；发布/下架/编辑/删除按钮按提供者权限显隐；批量模式非自己的组件禁勾
  - `src/views/components/ComponentDetail.vue`：标题旁「公共」徽标 + 发布时间；发布/下架按钮（仅自己的）
- **任务详情页推送 + 紧凑度优化**（`4ef4d2d`）：
  - `src/views/tasks/TaskDetail.vue`：组件生成完成后 delivery 区新增「推送到公共池」琥珀主按钮；仅已完成且已入库、自己的组件显示；已入池态转「下架公共池」；收编 TaskCenter/ConfigPanel 紧凑度优化
  - `src/components/generator/ConfigPanel.vue`：布局微调
- **推送到公共池改为确认弹窗**（`df9335c`）：
  - 新增 `src/components/PublishToPoolModal.vue`（265 行）：无第三方依赖自绘弹窗；字段=组件名称(可编辑)、组件类型(只读徽标)、规格(默认 metadata.spec)
  - 新增 `src/utils/component-pool.ts`：类型标签/默认规格/发布逻辑单一事实源；`publishToPublicPool` 变更时先 `getComponent` 拉全量再增量 `updateComponent`（防丢 `figmaFileKey`）
  - 三入口接入弹窗：组件库卡片、组件详情页、任务详情页

#### backend-node（1 commit 已提交，7 文件，+617/-31）

- **公共组件池：组件可见性 + scope 查询 + 删除严格化**（`86696aa`）：
  - `src/schemas/component.schema.ts`：Component 加 `visibility('private'|'public')`/`sharedAt`/`sharedBy`，存量 undefined 视同 private 零迁移
  - `src/component/component.service.ts`：`listComponents` 加 `scope('mine'|'public'|'all')`；public/all 平台级范围忽略 groupId 约束；新增 `publishComponent/unpublishComponent`（严格仅提供者）；`checkComponentAccess` public 放行；新增 `checkComponentDeletePermission`
  - `src/component/component.controller.ts`：`POST :componentId/publish`、`:componentId/unpublish`
  - `src/component/dto/list-components.dto.ts`：`ListComponentsDto` 加 `scope(IsIn)`
  - `src/phase2/phase2.service.ts`：`packageComponent` 路径修复，跨 workspace 解析器 `resolveComponentDir`（backend→frontend→temp、vue3 跨 groupId）
  - 新增单测 17 例：`package-component.spec`(3) + `component.service.spec`(17)

#### backend-node（26 文件未提交，+1176/-430）

- 大量 ai-engine 管线文件改动未提交，涉及：
  - `resource-mounter.js`、`microcode-engineer.js`、`vue3-engineer.js`、`figma-connector.js`、`visual-parser.js`：管线核心角色
  - `code-structure-validator.js`（+112 行）：校验器增强
  - `model-config.js`、`model-suggestion.js`、`ai-request-gateway.js`：模型路由/请求网关
  - `text-order-guard.js`、`sfc-semantics.js`、`visual-trust.js`：防护工具
  - `config.service.ts`、`config-test.service.ts`：配置服务调整
  - 多个 spec 测试文件更新

#### docs（2 文件未提交，+646/-359）

- `architecture/增量补丁式更新方案-v2.md`：大幅扩充（+399 行）
- `感智晓界工坊-前端培训.html`：重构优化（606 行变更）

### 📝 今日摘要

今天 mvgo 项目核心推进**公共组件池**功能的前后端全链路落地：
- **后端**完成组件可见性（publish/unpublish）、scope 三态查询（mine/public/all）、平台级权限模型（public 组件所有登录用户可下载/详情，删除严格化仅限提供者），并修复了 phase2 跨 workspace 组件路径解析问题
- **前端**完成组件库 Tab 切换（我的/公共/全部）、发布弹窗（名称可改、类型/规格由原组件带入）、任务详情页推送按钮（按状态翻转）、权限按钮显隐等完整交互
- **未提交**的 backend-node 26 文件改动（ai-engine 管线治理 +1176/-430）是今日最大的工作体量，涵盖 resource-mounter、code-structure-validator、model-config 等核心模块，待后续提交
- 明日待办：提交 backend-node 未提交的管线治理改动；docs 的增量补丁方案 v2 和前端培训 HTML 待提交

---

## 2026-09-01

### 📊 变更统计

| 仓库 | 已提交文件数 | 未提交文件数 | 主要变更类型 |
|------|:------:|:------:|-------------|
| frontend | 0 | 5 | 工具函数、预览页、任务详情、Demo 页 |
| backend-node | 45 | 0 | 资源变量治理、质量门禁、Vision 后处理、分块策略、Prompt 约束 |
| backend-java | 0 | 0 | - |
| docs | 0 | 0 | - |
| 主仓 | 0 | 7 | 删除废弃脚本、submodule 引用更新 |
| **合计** | **45** | **12** | |

> 16 commits，+4898 / -1180 行。数据来源：git log（hourly-changes.md 扫描服务自 08-04 起停机，第 29 天）。

### 🔑 核心变更

#### backend-node（已提交 45 文件，16 commits）

**A. 资源变量臆造名根治（事故5 mc-max-1788239096135 系列，5 commits）**
- `resource-import-guard.js`（+114 行）：新增臆造名 fail-closed 检测 + 别名/主名撞名防护（W2/W3），杜绝 LLM 编造的资源变量名静默通过
- `resource-import-guard.spec.ts`（+549 行）：三组测试覆盖臆造名拦截、撞名防御、精确匹配
- `resource-mapping-formatter.js`（+75 行）：结构树节点→资源条目改用精确匹配，修复可用资源被误标「下载失败·禁止引用变量」（W5）
- `visual-parser.js`（+24 行）：结构树对下载失败资源显式声明「无变量名」（W4）
- `microcode-engineer.js`（+19 行）：接入臆造名 fail-closed 死循环阻断

**B. 质量门禁缺口治理（1 commit，17 文件，+1493/-953 行）**
- `code-structure-validator.js`（+398 行）：结构校验器大幅增强
- `less-compile-gate.js`（+136 行）：LESS 编译门禁补强
- `resource-mounter.js`（+85 行）：资源挂载器修复
- `code-validator.js` / `microcode/code-validator.js`：校验器统一
- `adversarial-checker.js` / `code-healer.js` / `file-writer.js` / `resource-attribution-validator.js`：门禁四条缺口补齐
- `component-assembler.js`（-798 行）：删除过时文件
- `phase2.service.ts` / `task-code-snapshot.service.ts`：快照质量闭环
- **修复 import.meta 死结**：17 个 jest 套件加载失败恢复

**C. Vision/LLM 后处理基础设施（5 commits）**
- `json-parser.js`（+96 行）：R2' Vision JSON 本地修复——状态机括号配平/截断补全/去尾逗号，15 测试用例全过，每次损坏省 ~36.5s LLM 重试
- `llm-tail-garbage.js`（+64 行）：G2 fence-tail 双 template 检测，LLM 重复输出按 fence 边界截断
- `code-structure-validator.js`（+135 行）：R1' 重试轮结构锚定——extractComponentSkeleton 提取组件树骨架，约束 LLM 不得重排结构
- `chunk-tier.js`（+99 行）+ `chunk-timeout.js`（+52 行）：S2 provider 延迟画像，分块档位分类与 P95 校准
- `subcomponent-planner.js`（+81 行）：S3 大分块拆分——多图表 section 按图表二次拆分为独立 chart chunk

**D. Prompt 约束与规划层优化（4 commits）**
- `prompt-builder.js`（+77 行）：P4' vision themeVars 真值补全 + P3' 阈值线规则（禁止伪造 series，强制 markLine/markArea）
- `post-process.js`（+111 行）：P3' 阈值线强制改写——检测伪造阈值线 series 改写为 echarts 原生 markLine
- `subcomponent-planner.js`（+128 行）：P2' 图例误识别治理——isLegendSection/isChartSection/mergeLegendSections 自动合并
- `base-panel-slots.md`（+25 行）：P1' headerSlots 契约硬约束——命名插槽仅用于 header 区控件
- `preview-analysis-schema.md`（+50 行）：图例识别规则章节

**E. 其他**
- `microcode-engineer.js`（V2 section 尺寸比例强制，+91/-106 行重构）
- 新增测试：`subcomponent-planner-p2.spec.ts`、`subcomponent-planner-phase2.test.js`、`post-process-phase2.test.js`、`chunk-tier.spec.ts`、`chunk-timeout.spec.ts`、`json-parser.spec.ts`、`llm-tail-garbage.spec.ts`、`code-structure-validator.spec.ts`、`resource-mapping.spec.ts`

#### frontend（未提交 5 文件）
- `src/utils/api-token.js`：API token 工具调整
- `src/utils/portlet.js`：portlet 工具函数增强（+30 行）
- `src/views/demo/index.vue`：Demo 页面大幅扩展（+293 行）
- `src/views/preview/index.vue`：预览页优化（+116 行）
- `src/views/tasks/TaskDetail.vue`：任务详情微调

#### 主仓（未提交 7 文件）
- 删除 `restart-all.sh`（-80 行）、`restart-services.sh`（-43 行）、`package.json` 部分配置
- submodule 引用更新（frontend/backend-node/backend-java/docs）

### 📝 今日摘要

今日 mvgo 项目 backend-node 产出 **16 commits / +4898 行**，是继昨日（22 commits）之后连续第二天高强度输出，核心围绕 **微码组件生成管线的系统性治理**：

1. **资源变量臆造名根治**（事故5 衍生，5 commits）：从 import 注入层（resource-import-guard）到结构树声明层（visual-parser）到精确匹配层（resource-mapping-formatter），三层防御彻底切断 LLM 编造资源变量名→静默通过→产物资源丢失的链路
2. **质量门禁缺口治理**（1 commit 涉及 17 文件）：修复 import.meta 导致 17 个 jest 套件加载失败的死结，删除过时的 component-assembler.js（-798 行），统一校验器口径
3. **Vision/LLM 后处理基础设施**（5 commits）：JSON 括号配平省 ~36.5s 重试成本、fence-tail 截断、重试轮结构锚定、分块档位 P95 校准、多图表 section 二次拆分
4. **Prompt 约束强化**（4 commits）：阈值线伪造→markLine 改写、图例误识别治理、headerSlots 契约硬约束、themeVars 真值补全

前端有 5 个文件未提交（Demo 页和预览页大幅扩展），主仓清理了废弃的 restart 脚本。

**明日待办**：
- 前端未提交改动需 review 并提交
- backend-node 16 commits 需构建 dist + 重启验证
- hourly 扫描自动化已停机第 29 天，需排查恢复

---

## 2026-08-29

### 📊 变更统计

| 仓库 | 已提交文件数 | 未提交文件数 | 主要变更类型 |
|------|:------:|:------:|-------------|
| frontend | 0 | 9 | 视图组件调整、交互原型页面 |
| backend-node | 20 | 11 | AI 引擎核心重构、管线修复、校验器增强 |
| backend-java | 0 | 0 | - |
| docs | 0 | 0 | 方案文档已生成（未独立 git 提交） |
| **合计** | **20** | **31** | |

### 🔑 核心变更

#### backend-node（已提交 20 文件 + 未提交 11 文件）
- **AI 引擎管线整改**（核心）：
  - `microcode-engineer.js`：新增 `_fixSectionHeights`（多区块高度比例分配）、`_injectEchartsAxisTicks`（轴刻度修复）、`_stripOrphanControls`（孤儿控件剥离）、`_resolveCssSubstituteRefs`（CSS 替代引用解析）；修复 bgm 未声明导致语义门禁 fail-closed、旧式重试标记误拖、资源归属 BLOCK 崩溃等多项 bug
  - `vue3-engineer.js`：接入完整 `fixPipeline`（与微码对齐通用化），新增 `_fixSectionHeights` 注册
  - `subcomponent-planner.js`：`extractLayoutMetadata` 补 `height` 字段（Figma 节点高度进入 prompt，支持 flex 比例分配）
  - `base-agent.js`：修复 `onProgress` getter 动态读，agent 模型事件不再丢失
  - `figma-connector.js`：`downloadStatus='css'` 条目 `semanticVarName=null`（杜绝 bgm 污染语义名空间）
  - `code-fix-pipeline.js` / `code-fix-rules.js`：新增 `fix-section-heights`、`inject-echarts-axis-ticks`、`strip-orphan-controls`、`unwrap-theme-scoped-common-less` 四条确定性规则
  - `resource-attribution-validator.js`：统一 `isResourceUsed` 判定口径，消除与 code-structure-validator 分裂
  - `retry-policy.js`：删除旧式 `_semanticRetried/_resourceRetried`，只留 `_pendingRetry` 单轨
  - `resource-mapping-formatter.js`：bg section 加「背景挂载速查表」
  - `visual-truth-validator.js` / `header-slot-validator.js`：校验器增强
  - `llm-tail-garbage.js`：sanitizeStyleFenceLeak 扩展覆盖 .vue
- **Prompt 约束强化**：
  - `ai-generation-constraints.md`：新增 7.7（标签形态对齐）、7.8（渐变背景与统计卡信息栏）、7.9（图标/实景图/关闭按钮不得丢弃）红线
  - `chart-standards.md`：红线 #8 强化轴刻度约束
  - `preview-analysis/`：annotation-filter-rules、header-rules 两份分析约束新增
- **任务服务**：`task-code-snapshot.service.ts` 更新

#### frontend（未提交 9 文件）
- `src/views/generate/components.vue`：生成页视图调整
- `src/views/login/index.vue`：登录页微调
- `src/components/generator/AppFooter.vue`：页脚组件更新
- `src/config/feature-flags.js`：功能开关配置
- `public/topology.html` + 4 个交互原型 HTML：网站能力拓扑图（交互版/关系版）

#### docs（已生成、未 git 提交）
- `docs/architecture/ai-engine-pipeline-rectification.md`：AI 引擎管线整改方案（三层架构 + 三条铁律 + P0/P1/P2 分阶段）
- `docs/architecture/l1-fidelity-optimization-plan.md`：L1 还原率优化方案（6 类失败模式 → S1/S2/S3 三阶段，预期 68%→88%）

### 📝 今日摘要

今日 mvgo 项目以 **AI 引擎管线全面整改** 为核心主线，完成了大量关键修复和架构优化：

1. **AI 引擎管线整改落地**：修复了 bgm 未声明导致语义门禁 fail-closed、旧式重试标记误拖（第 3 轮成功被拖回第 4 轮）、资源归属 BLOCK 崩溃（TypeError 放大可重试错误）等多个阻断性 bug；统一产物契约（generateCode 成功/失败返回规范化）、净化管线（.vue 文件也截断围栏垃圾）、资源挂载表（确定性约束）。

2. **L1 还原率基线建立**：落地 `eval-fidelity-loop.mjs` 评测脚本（puppeteer 截图 + vision 比对），跑完 7 组件基线——平均还原率 **68%**（微码 72%、Vue3 45%），识别 6 类系统性失败模式（轴刻度缺失、多出控件、标签形状、渐变信息栏、图标实景、Vue3 结构丢失）。

3. **确定性后处理规则落地**：新增 `_fixSectionHeights`（解决复杂组件多区块只显示首块的核心问题）、`_injectEchartsAxisTicks`（轴刻度）、`_stripOrphanControls`（孤儿控件）、`unwrap-theme-scoped-common-less`（主题包裹剥离），全部接入 fixPipeline + Vue3 通用化。

4. **复杂组件布局 bug 根因定位**：用户实测发现复杂组件「只出来一小部分」——根因是多子组件每个都写 `height:100%` 导致 5×600px 溢出被裁剪；修复为 `flex:1 1 0; min-height:0` 比例分配，并补充 Figma 高度数据进入 prompt。

5. **约束加载路径真相修正**：推翻前日「constraints 恒空」的误判——真正问题是 load 路径指向旧副本；已修正路径 + 复制编辑版到正确位置，重启后无告警。

**明日待办**：P0-5 子组件命名单一事实源（planner/引用/文件名三者对齐）；用新管线重生成回归组件复测 L1 还原率提升；评估 P0-2 废弃旧方法。

---


## 2026-08-27

### 📊 变更统计

| 仓库 | 文件数 | 主要变更类型 |
|------|:------:|-------------|
| frontend | 14 | 2 已提交 commit（日志模型名+providerType透传）+ 7 未提交（页面骨架占位视觉+路由修复） |
| backend-node | 11+ | 9 已提交 commit（template瘦身/模型优先级/资源compact/权威权重/连通性providerType）+ 3 未提交（page-skeleton回滚+指标+工程师微调） |
| backend-java | 0 | - |
| docs | 0 | - |
| **合计** | **25+** | AI 引擎治理日：模板瘦身、模型优先级、供应商池、日志准确性 |

*注：hourly-changes.md 扫描服务持续未运行（自 2026-08-04），数据来源为 git log + git diff + 工作记忆日志*

### 🔑 核心变更

#### frontend（2 commit + 7 未提交）

**已提交 commit：**
- `3fb60cb` [fix] 任务日志复制/下载补全模型名标签（渲染有 `[model]` 但 copyLogs/downloadLogs 漏了 `l.model`）
- `4529301` [fix] 测试接口透传 providerType：testUnified/testProvider/testModelCapability 均带协议类型给后端

**未提交变更（7 文件，110+/55-）：**
- `src/api/page-skeleton.ts`：+8，新增 API 接口
- `src/router/index.js`：+4/-1，路由修复
- `src/utils/loadVue3Runtime.js`：+13/-5，加载逻辑优化
- `src/utils/task-actions.ts`：+26，任务动作增强
- `src/views/demo/index.vue`：+71/-40，Playground 适配
- `src/views/page-skeleton/index.vue`：+41/-27，页面骨架占位视觉改进
- `src/views/preview/index.vue`：+2/-1，预览页微调

#### backend-node（9 commit + 3 未提交）

**已提交 commit（按时间顺序）：**

| 序号 | 哈希 | 类型 | 摘要 |
|:----:|------|------|------|
| #266 | `72f872a` | fix | 微码组件样式根作用域治本：消除 .dark/.light 嵌套致死作用域 + elementStyleMap 全量转 CSS 兜底 + headerSlots 确定性补齐 |
| #271 | `425260b` | fix | 模型优先级治本：供应商池同故障域排除 + 动态权重(健康×延迟系数) + 空串计熔断 + 冷却180s/熔断120s |
| - | `d4f2d43` | fix | 页面骨架 bbox 区域判定：组件按包围盒水平中心点归属 left/center/right |
| #273 | `d0434e4` | fix | 网关层空内容当失败：treatEmptyAsFailure 在网关内熔断+换 provider 重试 |
| #275 | `df9801a` | feat | template 分块瘦身：figma 树结构摘要 + esm 资源子集（-60% token），修复强制拆分注入条件恒 false 硬 bug |
| #275补充 | `7208127` | fix | buildCodePrompt 透传 segmentType，修复 template 结构摘要分支从未触发 |
| #275-3 | `caec9df` | fix | 模型名串号修复（仅 LLM 角色 logger 补标签）+ 延迟画像持久化（重启冷启动即有优先级） |
| #276 | `a8e6f5c` | feat | 资源映射 compact 模式：保留全部还原关键字段压缩冗余文案（-43%） |
| #278 | `9ad5a98` | feat | 连通性测试尊重 providerType 配置：anthropic 走 /v1/messages |

**未提交变更（3 文件，28+/225-）：**
- `data/metrics-history.jsonl`：+9，指标历史追加
- `src/ai-engine/roles/microcode-engineer.js`：+9/-，工程师微调
- `src/page-skeleton/page-skeleton.service.ts`：+28/-225，**233 行回滚改动**（buildComponentVue 从"贴近真实组件占位视觉"回退为"统一占位"），疑似回滚测试遗留

### 📝 今日摘要

今天是 mvgo AI 引擎深度治理日，核心围绕**模型调用稳定性与 prompt 瘦身**两大主线展开，工作记忆日志记录了 20+ 项修复/优化事项。

**模板 prompt 瘦身三连（#275/#276/#277）** 是今天最大的技术突破。template 分块从 90k tokens 大幅削减到预期 40-50k：figma 树结构摘要（23.4k→9.5k tokens，-59%）、elementStyleMap 仅保留资源引用、资源映射 compact 模式（-43%）。同时发现并修复了"强制拆分注入条件 `fileType==='code'` 恒 false"的硬 bug（从加入起从未执行过）和 `buildCodePrompt` 未透传 `segmentType` 导致瘦身分支从未触发的隐藏 bug。#277 纠偏了此前的错误诊断——vision 分析实际完整正确，真正根因是 1.5MB 全量 figma 树噪音淹没了 layoutStructure，新增"权威蓝图"铁律约束。

**模型优先级与供应商池治理（#271/#273/#275-3）** 彻底解决了慢 provider 反复撞墙的问题。核心修复：同故障域排除（同 host 不同 provider 切了等于没切）、动态权重 = baseWeight × 健康系数 × 延迟系数（p90 降权）、空串计熔断（2 次→open）、冷却 60s→180s / 熔断 30s→120s、延迟画像持久化（重启后冷启动即有优先级）。网关层 treatEmptyAsFailure 消除了"成功空串→上层 empty_output 再重试"的双请求路径。重试验证实录：deepseek→qwen→gpt-5.5 超时自动切 deepseek 全程 0 空串。

**日志准确性修复** 解决了三个关联问题：模型名串号（graph 节点日志被误补 LLM 模型标签）、日志复制缺模型名、连通性测试忽略 providerType 配置。页面骨架后端也做了大量视觉改进（深色主题、按 type 渲染占位视觉、bbox 区域判定、统一"占位"模式）。

**提交状态**：今日 11 次 commit（frontend 2 次 + backend-node 9 次），约 10 文件未提交。backend-java/docs 持续休整。

**明日待办**：
- 重启后端使 #275(figma树摘要) + #276(compact) + #277(权威权重) 三连生效，复测同组件验证 template 体积
- 确认 page-skeleton.service.ts 233 行回滚是否为测试遗留，决定是否提交或还原
- 提交 frontend 剩余 7 文件未提交变更
- 继续推进 Vision 模型覆盖率基线测试

---

## 2026-08-26

### 📊 变更统计

| 仓库 | 文件数 | 主要变更类型 |
|------|:------:|-------------|
| frontend | 32 | 新增页面骨架模块、Playground 全功能编辑、任务详情适配 |
| backend-node | 59 | 页面骨架后端、AI 引擎增强、缓存修复、配置管理 |
| backend-java | 0 | - |
| **合计** | **91** | |

*注：hourly-changes.md 扫描服务持续未运行（第 7 天），数据来源为 git log + git status*

### 🔑 核心变更

#### frontend (32 文件：21 已提交 + 11 未提交)

**已提交 commit (1a28caa)：新增页面骨架模块与文件差异查看器**
- **新增** `src/api/page-skeleton.ts`：+130 行，页面骨架 API 接口定义
- **新增** `src/views/page-skeleton/index.vue`：+749 行，页面骨架生成器主页面
- **新增** `src/components/FileDiffViewer.vue`：+92 行，文件差异查看器组件
- **新增** `src/types/api.ts`：+39 行，API 类型定义完善
- **扩展** `src/views/demo/index.vue`：+1721/-19，Playground 大幅扩展支持 page 模式全功能编辑
- **重构** `src/components/generator/ConfigPanel.vue`：+888/-889，配置面板大规模重构
- **调整** `src/components/generator/WorkflowMonitor.vue`：+56/-，工作流监控增强
- **修复** `src/utils/loadVue3Runtime.js`：+50/-，修复预览 page 组件加载判定逻辑
- **增强** `src/views/tasks/TaskDetail.vue`：+75/-，任务详情页适配页面骨架任务
- **路由** `src/router/generate-route.js`：+8，新增页面骨架路由

**未提交变更 (11 文件)：页面骨架异步化 + 任务详情完善**
- **增强** `src/views/tasks/TaskDetail.vue`：+331/-，页面任务真实进度展示、产物查看、预览、Playground 跳转、失败重试
- **调整** `src/views/page-skeleton/index.vue`：+42/-40，生成后直接跳转到任务详情页
- **扩展** `src/api/page-skeleton.ts`：+8，新增 retry 接口
- **修复** `src/components/generator/ConfigPanel.vue`：+75/-，头部新增帮助入口
- **新增** `src/router/help-routes.js`（untracked）：帮助页路由
- **新增** `src/views/help/TokensGuide.vue`（untracked）：密钥接入指南帮助页
- **调整** `src/utils/loadVue3Runtime.js`：+13/-13，修复 `data?.data?.exists` → `data?.exists` 判定
- **新增** `src/utils/task-actions.ts`：+26，页面任务类型判断与 Playground 构建
- **调整** `src/views/preview/index.vue`：+43/-41，预览页支持 page 类型
- **修复** `src/views/demo/index.vue`：+71/-69，Playground page 模式 16 处 API 调用适配

#### backend-node (59 文件：39 已提交 + 20 未提交)

**已提交 commit (086c2d9)：页面骨架后端 + AI 引擎增强**
- **新增** `src/page-skeleton/page-skeleton.service.ts`：+977 行，页面骨架生成核心服务（今日最大单文件）
- **新增** `src/page-skeleton/page-skeleton.controller.ts`：+98 行，页面骨架 API 控制器
- **新增** `src/page-skeleton/page-skeleton.module.ts`：+11 行，页面骨架模块定义
- **新增** `src/ai-engine/utils/error-humanizer.js`：+52 行，错误信息人化工具
- **新增** `src/ai-engine/utils/post-process.js`：+150 行，后处理工具集
- **新增** `src/ai-engine/utils/resource-attribution-validator.js`：+178 行，资源归属校验器
- **新增** `src/ai-engine/utils/shared-cache.js`：+95 行，共享缓存工具
- **增强** `src/ai-engine/roles/microcode-engineer.js`：+597/-，微码工程师角色大幅扩展
- **增强** `src/ai-engine/utils/sfc-semantics.js`：+254/-，SFC 语义分析增强
- **调整** `src/ai-engine/roles/vue3-engineer.js`：+134/-，Vue3 工程师角色优化
- **扩展** `src/ai-engine/utils/model-config.js`：+87/-，模型配置增强
- **增强** `src/ai-engine/utils/provider-pool.js`：+54/-，供应商池增强
- **修复** `src/ai-engine/graphs/mc-component-graph-phase2.js`：+27/-，缓存命中路径资源下载修复
- **修复** `src/ai-engine/graphs/mc-component-graph-vue3.js`：+28/-，Vue3 图缓存路径同步修复
- **配置** `package.json`：+107/-1，新增依赖

**未提交变更 (20 文件)：页面骨架异步化 + AI 引擎优化 + class 命名规范**
- **扩展** `src/page-skeleton/page-skeleton.service.ts`：+350/-107，改造为异步生成 + SSE 进度推送 + 失败重试
- **扩展** `src/page-skeleton/page-skeleton.controller.ts`：+113/-，新增 retry 端点 + 6 个文件管理端点
- **增强** `src/ai-engine/roles/microcode-engineer.js`：+105/-，class 命名规范（实例 ID 剥离/注入）
- **增强** `src/ai-engine/roles/style-mapper.js`：+88/-，样式映射器优化
- **增强** `src/ai-engine/graphs/mc-component-graph-phase2.js`：+91/-，日志降噪 + 缓存路径增强
- **调整** `src/ai-engine/graphs/mc-component-graph-vue3.js`：+60/-，Vue3 图缓存路径修复
- **增强** `src/ai-engine/utils/ai-request-gateway.js`：+35/-，统一调用增强
- **新增** `src/ai-engine/utils/session-model.js`（untracked）：会话模型注册表（日志显示用）
- **增强** `src/tasks/tasks.controller.ts`：+47/-，新增队列手动调度端点
- **修复** `src/ai-engine/utils/chat-url.js`：+12/-，修复 buildChatUrl 根路径缺 /v1 的 bug
- **测试** `tests/unit/class-naming-strip.test.mjs`（untracked）：class 命名规范单测（10/10 通过）
- **测试** `tests/unit/stub-loader.mjs`（untracked）：单测 stub 加载器

### 📝 今日摘要

今天是页面骨架生成器（page-skeleton）从 0 到 1 的里程碑式开发日，核心进展集中在三个方面：

**页面骨架生成器完整实现**：后端新增 977 行核心服务 + 98 行控制器 + 11 行模块定义，前端新增 749 行主页面 + 130 行 API + 92 行差异查看器。后续迭代将同步生成改造为异步任务 + SSE 实时进度 + 失败可续，对齐组件生成管线的进度展示体验。Playground 扩展支持 page 模式，实现文件树/读写/建目录/重命名/删除/实时预览/图片回显全功能。

**AI 引擎增强与缓存修复**：新增 4 个工具模块（error-humanizer + post-process + resource-attribution-validator + shared-cache，合计 475 行），微码工程师角色大幅扩展（+597），SFC 语义分析增强（+254）。关键修复：缓存命中路径资源下载（phase2 + vue3 双图同步），buildChatUrl 根路径缺 /v1 导致返回 HTML 的问题。class 命名规范落地（实例 ID 自动剥离/注入，10/10 单测通过）。

**任务详情与用户体验**：TaskDetail 页面全面适配页面骨架任务，支持真实分步日志、产物查看、预览、Playground 跳转、失败重试。新增密钥接入指南帮助页（Figma/Apifox/GitLab 三章），配置面板头部新增帮助入口。日志模型显示、去重日志精简、队列手动调度等 P0 需求落地。

**提交状态**：今日 2 次 commit（frontend 1 次 21 文件、backend-node 1 次 39 文件），仍有 31 文件未提交（frontend 11 + backend-node 20）。backend-java 持续休整。

**明日待办**：
- 提交剩余未 commit 的页面骨架异步化 + AI 引擎优化变更
- 重启后端使 #248-#253 + #75（class 命名）改造生效
- 继续 Prompt 瘦身 / 队列状态监控告警 / Vision 模型覆盖率基线测试
- 关注 hourly-changes.md 扫描服务恢复

---


## 2026-08-28

### 📊 变更统计

| 仓库 | 文件数 | 主要变更类型 |
|------|:------:|-------------|
| frontend | 0 | - |
| backend-node | 0 | - |
| backend-java | 0 | - |
| docs | 0 | - |
| **合计** | **0** | |

### 🔑 核心变更

今日无变更。

### 📝 今日摘要

今日 mvgo 项目无代码变更。hourly 扫描自 2026-08-04 后已停止运行，auto-commits 自 2026-08-27 17:04 后也无新提交。工作记忆日志未生成。

---


## 2026-08-30

### 📊 变更统计

| 仓库 | 文件数 | 主要变更类型 |
|------|:------:|-------------|
| frontend | 0 | - |
| backend-node | 0 | - |
| backend-java | 0 | - |
| docs | 0 | - |
| **合计** | **0** | |

### 🔑 核心变更

今日无变更。

### 📝 今日摘要

今日 mvgo 项目无代码变更。hourly-changes.md 最后记录停留在 2026-08-04，此后未再产生新的变更条目。auto-commits 和工作记忆日志同样无新内容。项目处于静默状态。

---


## 2026-08-31

### 📊 变更统计

| 仓库 | 已提交文件数 | commit 数 | 未提交文件数 | 主要变更类型 |
|------|:------:|:------:|:------:|-------------|
| frontend | 2 | 3 | 0 | 任务详情质量诊断展示、设计稿轮询重试 |
| backend-node | ~38 | 22 | 1 | 微码管线系统性修复、L0-B 门禁治理、自愈机制、单测新增 |
| backend-java | 0 | 0 | 0 | - |
| docs | 0 | 0 | 8 | 拆分方案文档、培训材料、治理方案（均为 untracked） |
| **合计** | **~40** | **25** | **9** | |

*注：hourly-changes.md 扫描服务仍未运行（自 2026-08-04，第 28 天），数据来源为 git log + git status*

### 🔑 核心变更

#### backend-node（22 commits，~38 文件，今日主力）

**主线一：微码管线稳定性 & 自愈机制（10 commits）**

| commit | 摘要 | 核心文件 |
|--------|------|----------|
| `161869e` | 微码管线 undefined error 堆栈追踪注入 + vue3 P0 防护 + 5 个诊断脚本(854行) | phase2.js, microcode-engineer.js, vue3-engineer.js |
| `37fb20c` | 微码解析失败时日志器为空导致二次异常覆盖原始错误 | code-parser.js, code-generator.js |
| `6d98907` | 解析失败 dump 安全序列化——不再落盘 `[object Object]` | code-parser.js |
| `ea4e4a9` | theme 变量与资源插值两类 SFC 编译失败确定性自愈 | code-healer.js(+198), file-writer.js(+92) |
| `5a9cac5` | 微码根容器固定像素宽高写盘自愈(healRootFixedSize) | file-writer.js, less-compile-gate.js |
| `adc4c33` | 失败任务预览·generateCode 早期预置最小可编译样式骨架（中断容错） | microcode-engineer.js(+81) |
| `8a674a0` | N2 图表兜底注入自检防线 + Tab UI 骨架注入 + 预览回退 workspace | microcode-engineer.js, code-healer.js(+334), file-writer.js, snapshot.service.ts |
| `2a55a46` | 修复 LESS 漏写右大括号导致 L0-B BLOCK 与预览不可用 | file-writer.js, less-compile-gate.js(+192), phase2.service.ts |
| `cbb4e61` | 修复 effectiveMapping 作用域致生成失败 + 根容器背景图不再下载 | microcode-engineer.js, figma-connector.js |
| `0c27e5e` | lite 管线 chart init 入口强制 watch 驱动（治 onMounted 时 ref 未填充→图表空白） | lite.service.ts |

**主线二：L0-B 门禁治理 & 误杀修复（5 commits）**

| commit | 摘要 | 核心文件 |
|--------|------|----------|
| `0f19fcb` | L0-B 门禁三处自相矛盾误杀：CODE-016/017 补豁免 + N4 根容器背景剥离再注入 | microcode-engineer.js(+463), code-structure-validator.js(+113), spec(+285) |
| `78f0d88` | CODE-016 挂载点匹配放宽 + 报错文案带挂载指引(R6) | code-structure-validator.js(+158), spec(+87) |
| `2ad12b8` | L0-B EMPTY_ARTIFACT 成因判定——写盘门禁跳过留痕贯通至校验层 | mc-component-graph-phase2.js, microcode-engineer.js, code-structure-validator.js |
| `8200c73` | L0-B 重试信号贯通 execute→generateCode，重试轮强制重新生成分块 | microcode-engineer.js |
| `0f29d6c` | G1·L0-B 主体空壳检测(EMPTY_BODY)——默认插槽空+命名插槽有内容→BLOCK | code-structure-validator.js(+94), spec(+151) |

**主线三：资源依赖治理 & 子组件修复（3 commits）**

| commit | 摘要 | 核心文件 |
|--------|------|----------|
| `f58b1b0` | 子组件资源依赖治理：生成前预校验 + L0-B CODE-018 拦截 + 降级路径错误分类 | microcode-engineer.js(+164), code-healer.js(+150), resource-mounter.js(+180), resource-import-guard.js(+117), resource-handling-guide.md(+139) |
| `83027f4` | 修复 Figma 资源提取把子树背景误判为组件根背景而跳过 | figma-connector.js |
| `4da4fac` | vue3 端 N2 图表兜底与 mc 端对齐治本（盲目 import 隐患消除） | vue3-engineer.js |

**主线四：工程基础设施（4 commits）**

| commit | 摘要 | 核心文件 |
|--------|------|----------|
| `9adad7e` | 统一 logger 兜底：新增 safeLogger 工厂 + microcode 模块 28 处入口归一化 | safe-logger.js(+62), 10 文件改造 |
| `00b307a` | style-mapper 空串双缺口：invokeWithTimeout 透传 treatEmptyAsFailure + extractModelText 兜底 | style-mapper.js, llm-timeout.js, 新增单测(+144) |
| `03c4b80` | 快照离线质量校验接口与强制预览闭环：逐文件行列级诊断 + 手改后重新校验 | snapshot-quality.service.ts(+470), task-code-snapshot.service.ts(+143), tasks.controller.ts |
| `fd972ad` | code-healer 新函数单测 13 例 + 运行时产物 gitignore | code-healer.spec.ts(+191), .gitignore |

#### frontend（3 commits，2 文件，961+/74-）

| commit | 摘要 |
|--------|------|
| `829287e` | 任务详情页质量诊断结构化展示与手改后重新校验/强制预览闭环（TaskDetail.vue +916/-72，generator.ts +50） |
| `44a3f6b` | 任务失败诊断新增「生成被中断」分类，避免服务重启类任务被误判为未知错误（TaskDetail.vue +25/-2） |
| `f5f10da` | TaskDetail 设计稿图片加载失败周期轮询重试（TaskDetail.vue +42） |

#### docs（8 untracked 文件，未 git 提交）

- `microcode-engineer-split-plan.md`：微码工程师拆分方案
- `vue3-engineer-split-plan.md`：Vue3 工程师拆分方案
- `quality/生成管线根源治理方案-2026-08-31.md`：管线根源治理方案
- `感智晓界工坊-前端培训.pptx` / `.html` / `培训方案.md` / `PPT分页内容.md`：前端培训材料
- `培训截图/`：培训截图目录

### 📝 今日摘要

今天是 mvgo 项目 **2026 年以来单日 commit 数最多** 的一天（backend-node 22 commits + frontend 3 commits = 25 commits），核心工作围绕**微码管线系统性治理**展开，覆盖从生成→校验→自愈→预览→重试的全链路：

1. **L0-B 门禁误杀根治**（5 commits）：修复了 CODE-016/017 的 bgRole/mountTarget 豁免缺失、N4 注入面板背景被误计、主体空壳检测(EMPTY_BODY)新增、重试信号未贯通等 5 处自相矛盾的误杀逻辑。这是导致"明明生成正确却被门禁 BLOCK"的核心原因。

2. **确定性自愈机制落地**（4 commits）：LESS 漏写右大括号自愈、theme 变量与资源插值 SFC 编译失败自愈、根容器固定像素宽高自愈——三类高频失败模式从"重试碰运气"升级为"写盘即修复"。code-healer.js 单日新增 700+ 行自愈规则。

3. **快照质量闭环**（2 commits）：新增 `snapshot-quality.service.ts`（470 行）实现逐文件行列级诊断接口 + 手改后重新校验 + 强制预览；前端 TaskDetail.vue 大改（+916/-72）实现质量诊断结构化展示。

4. **资源依赖治理**（3 commits）：子组件资源依赖生成前预校验 + CODE-018 拦截 + 降级路径错误分类 + resource-handling-guide.md 参考文档新增（139 行）。effectiveMapping 作用域 bug 修复（根因：定义在内层箭头函数内→外层不可见→ReferenceError）。

5. **工程基础设施**：safeLogger 工厂统一 28 处边界函数入口、style-mapper 空串双缺口修复、5 个诊断脚本批量新增（854 行）。

6. **前端培训材料**：docs 下新增 8 个未提交文件，包含感智晓界工坊前端培训 PPT/HTML/方案文档。

**提交状态**：25 commits（backend-node 22 + frontend 3），9 文件未提交（backend-node 1 + docs 8）。

**明日待办**：提交 docs 8 个未提交文件（拆分方案 + 培训材料）；确认 hourly-changes.md 扫描服务恢复（已停摆 28 天）；关注 L0-B 门禁治理后新组件生成的通过率。

---

## 2026-09-03

### 📊 变更统计

| 仓库 | 已提交文件 | 未提交文件 | 主要变更类型 |
|------|:---------:|:---------:|-------------|
| frontend | 0 | 0 | - |
| backend-node | 7 | 47 | 配置治理（AI 模型配置隔离）+ 管线修复（重试漂移）+ 大量未提交改动 |
| backend-java | 0 | 0 | - |
| docs | 0 | 25 | 培训材料迭代（HTML/PPT/截图） |
| **合计** | **7** | **72** | |

### 🔑 核心变更

#### backend-node（3 commits，7 文件已提交）

**Commit 1** `e0f283f`（00:00）：P1 重试子组件清单漂移修复
- `src/ai-engine/roles/microcode/vue3-prompt.js`：+17/-1，模板段修订约束
- `src/ai-engine/roles/vue3-engineer.js`：+50/-5，磁盘基线扫描机制
- **修复问题**：重试过程中子组件清单发生漂移，导致 echarts 等关键依赖丢失

**Commit 2** `de4787c`（01:28）：AI 模型配置每用户隔离
- `src/config/config.service.ts`：+76/-32，核心改造，支持 userId 维度配置隔离 + 全局保存审计（记录 lastModifiedBy/updatedAt）
- `src/config/config.controller.ts`：+10/-10，接口适配
- `src/ai-engine-v2/api/v2-pipeline.service.ts`：+10/-4，管线服务适配
- `src/lite/lite.service.ts`：+4/-4，Lite 服务适配
- **功能意义**：多用户场景下 AI 模型配置互不干扰，支持配置变更追溯

**Commit 3** `5b65905`（09:27）：AI_CONFIG_SCHEMA 白名单补全
- `src/config/config.service.ts`：+16/-1，strict 模式下补 lastModifiedBy/updatedAt 字段白名单
- **修复问题**：Commit 2 引入的审计字段被 strict schema 校验拦截

**未提交改动**（47 文件）：
- `config/dynamic-roles/`：24 个角色配置文件（code-analyzer、feat-generator、figma-analyzer、p2-* 系列等）
- `src/ai-engine/`：核心管线文件（mc-component-graph-phase2.js、figma-connector.js、microcode-engineer.js、resource-mounter.js、visual-parser.js）
- `src/ai-engine/utils/style-dedup-guard.js`：新增样式去重守卫（untracked）
- `server.log.1`：日志轮转

#### docs（25 文件未提交）

- `感智晓界工坊-前端培训.html`：+646/-502，大幅迭代培训材料
- `感智晓界工坊-前端培训.pptx`：二进制变更（78.9KB → 删除）
- `感智晓界工坊-前端培训PPT分页内容.md`：+22/-22，分页内容调整
- `培训截图/`：22 张新截图（P7/P11/P12/P13/P14/P15/P22 系列）
- `figma-plugin-screenshot.jpg`、`verify-new-user-scan.md`：新增辅助材料

### 📝 今日摘要

**核心进展**：
- backend-node 完成 AI 模型配置每用户隔离功能（3 commits），解决多用户场景下配置冲突问题，支持配置变更审计追溯
- 修复 P1 级重试子组件清单漂移 bug，防止 echarts 等关键依赖在重试过程中丢失
- 大量管线治理改动待提交（47 文件），涉及 dynamic-roles 配置体系重构 + ai-engine 核心管线优化 + 样式去重守卫新增

**文档建设**：
- 前端培训材料大幅迭代（HTML +646/-502），删除旧 PPT 转向纯 HTML 方案
- 新增 22 张培训截图，覆盖 P7/P11-P15/P22 关键页面

**待办线索**：
- backend-node 47 个未提交文件需整理提交（dynamic-roles 配置体系 + ai-engine 管线优化）
- docs 培训材料需最终提交（HTML + 截图）
- hourly-changes.md 扫描服务持续未运行（第 30 天），建议检查自动化配置

---

## 2026-09-05

### 📊 变更统计

| 仓库 | 已提交文件 | 未提交文件 | commits | 主要变更类型 |
|------|:---------:|:---------:|:-------:|-------------|
| frontend | 0 | 0 | 0 | - |
| backend-node | 0 | 3 | 0 | 管线修复（flex 比例 prompt 纠错）+ API 目录新增 |
| backend-java | 0 | 0 | 0 | - |
| docs | 0 | 1 | 0 | 培训 HTML 字号微调 |
| **合计** | **0** | **4** | **0** | |

*注：hourly-changes.md 扫描服务仍未运行（自 2026-08-04，第 33 天），数据来源为 git log + git diff*

### 🔑 核心变更

#### backend-node（3 文件未提交）

- **`src/ai-engine/roles/microcode-engineer.js`**（+4/-1）：**关键 bug 修复**——flex 比例 prompt 纠错。原 prompt 把 Figma 像素高度直接写成 `flex: ${meta.height} 1 0`（如 `flex: 600 1 0`），像素值被当作 flex-grow 系数，导致多区块叠加溢出。修正为 `flex: 1 0 ${meta.height}px`，明确区分 flex-grow（弹性系数 1）与 flex-basis（像素基准高度），并加注释强调禁止把像素高度写成 flex-grow。
- **`data/api-catalogs/index.json`**（+8）：新增「老山隧道」Apifox 项目目录（catalogId: cat-1788517502188，95 API / 19 模块），同步时间 2026-09-04。
- **`server.log.1`**：日志轮转（58k+ 行变更，无实质内容变化）。

#### docs（1 文件未提交）

- **`感智晓界工坊-前端培训.html`**（+3/-3）：架构图节点字号调大（11→13 / 12→14 / 9→11），副标题行间距微调（+2px），提升培训演示可读性。

### 📝 今日摘要

今天是 mvgo 项目的**轻量维护日**，无 commit，仅有 4 个文件的工作区变更：

1. **microcode-engineer.js flex 比例 prompt 纠错**是最有价值的改动——修复了此前多区块布局高度溢出的根因之一（像素高度被误写为 flex-grow 系数）。这是一个 prompt 层的确定性修复，直接影响后续所有微码组件的布局质量。
2. **API 目录新增「老山隧道」项目**（95 API / 19 模块），为后续接口绑定提供数据源。
3. **前端培训 HTML 字号微调**，提升演示可读性。

**提交状态**：0 commits。4 个文件未提交（backend-node 3 + docs 1），其中 server.log.1 为日志轮转无需提交。

**待办线索**：
- microcode-engineer.js flex 修复需提交并重启生效
- backend-node 此前累积的大量未提交文件（09-03 的 47 文件 + 09-04 的 ~12 文件）仍需整理提交
- hourly 扫描服务已停摆 33 天，需排查恢复

---

## 2026-09-07

### 📊 变更统计

| 仓库 | 已提交文件 | 未提交文件 | commits | 主要变更类型 |
|------|:---------:|:---------:|:-------:|-------------|
| frontend | 0 | 0 | 0 | - |
| backend-node | 0 | 0 | 0 | - |
| backend-java | 0 | 0 | 0 | - |
| docs | 0 | 0 | 0 | - |
| 主仓 | 0 | 0 | 0 | - |
| **合计** | **0** | **0** | **0** | |

*注：hourly-changes.md 扫描服务仍未运行（自 2026-08-04，第 34 天），数据来源为 git log + git status*

### 🔑 核心变更

今日无实质性代码变更。工作区存在少量未跟踪文件（调试脚本、备份文件、临时目录），无已跟踪文件的修改。

### 📝 今日摘要

今天是 mvgo 项目的**无变更日**（周一），所有仓库均无 commit，无已跟踪文件的修改：

1. **无实质性开发活动**：所有仓库 git log 为空，git status 显示仅有未跟踪的临时文件（调试脚本、备份文件等）。
2. **周末延续**：09-05（周六）和 09-06（周日）同样无变更，这是连续第三个无开发活动日。
3. **累积待办未处理**：backend-node 此前累积的大量未提交文件（09-03 的 47 文件 + 09-04 的 ~12 文件）仍未整理提交。

**提交状态**：0 commits。无已跟踪文件变更。

**待办线索**：
- backend-node 累积未提交文件已超 50 个，需尽快整理提交或清理
- microcode-engineer.js flex 修复（09-05）仍未提交
- hourly 扫描服务已停摆 34 天，需排查恢复
- 周一开工，建议回顾上周待办并规划本周任务

---

## 2026-09-10

### 📊 变更统计

| 仓库 | 文件数 | 主要变更类型 |
|------|:------:|-------------|
| frontend | 0 | - |
| backend-node | 16 | 管线契约治理、Loop 4 双裁判门禁、CODE-019 死锁治本 |
| backend-java | 0 | - |
| docs | 6 | Golden Manifest 锁定、Loop 2/3/4 实施切片、治理文档 |
| **合计** | **22** | |

> 共 6 次有效 commit（backend-node 5 + docs 1），+3368/-78 行。主仓 4 次子模块指针推进。

### 🔑 核心变更

#### backend-node（5 commits，16 文件，+1533/-78）

**Commit 1 — `7a1c585`（02:37）Loop0/0.5/1 管线契约治理落地 + 修 bcrypt 构建阻断**
- `src/ai-engine/roles/microcode-engineer.js`：Loop0/0.5/1 契约治理逻辑接入（+69/-8）
- `src/ai-engine/utils/resource-manifest.js`：资源清单大幅扩展（+148/-2），强化资源依赖追踪
- `src/ai-engine/utils/props-wiring-guard.js`：属性绑定守卫增强（+45/-1）
- `src/ai-engine/utils/resource-import-guard.js`：资源导入守卫补充（+20/-1）
- `src/ai-engine/graphs/mc-component-graph-vue3.js`：图结构微调（+35/-5）
- `src/types/bcrypt-shim.d.ts`：新增 bcrypt 类型声明（+11），修复构建阻断
- `src/ai-engine/pipeline-regression-0907-l7.spec.ts`：回归测试扩展（+33/-1）

**Commit 2 — `93536dc`（08:23）Loop1 forceAll 收口 + 1.C 错绑确定性剥离 + 0.A 验收**
- `src/ai-engine/roles/microcode-engineer.js`：forceAll 收口改造（+48/-12）
- `src/ai-engine/utils/header-slot-contract.spec.ts`：header-slot 契约测试（+64）
- `src/ai-engine/utils/validators/resource-attribution-validator.js`：资源归属校验器新增（+74）
- `src/ai-engine/utils/validators/resource-attribution-validator.spec.ts`：对应测试（+78）

**Commit 3 — `4cb797e`（08:57）Loop 4 双裁判门禁：figma-golden-extractor + manifest-auditor**
- `src/ai-engine/utils/figma-golden-extractor.js`：**新增** Figma Golden 提取器（+242），从 Figma 数据提取基准 manifest
- `src/ai-engine/utils/manifest-auditor.js`：**新增** Manifest 审计器（+328），双裁判之一，对比生成结果与 Golden 基准
- `src/ai-engine/utils/__gen-golden.mjs`：Golden 数据生成脚本（+45）
- `src/ai-engine/utils/manifest-auditor.spec.ts`：审计器测试（+128）

**Commit 4 — `53c2b0f`（09:08）Loop 4 双裁判门禁接入落盘（microcode-engineer）**
- `src/ai-engine/roles/microcode-engineer.js`：接入 Loop 4 门禁到落盘流程（+54）
- `src/ai-engine/utils/figma-golden-extractor.spec.ts`：提取器测试（+60）
- `src/ai-engine/utils/manifest-auditor.js`：审计器补充（+18）
- `src/ai-engine/utils/manifest-auditor.spec.ts`：审计器测试补充（+25）

**Commit 5 — `4f50fe0`（09:13）治本 CODE-019 死锁：子组件资源 prop 强制父级持有**
- `src/ai-engine/utils/props-wiring-guard.js`：子组件资源 prop 强制父级持有逻辑（+36/-6），根治 mc-max-1789002096933 暴露的 CODE-019 死锁
- `src/ai-engine/utils/__tests__/props-wiring-guard.spec.ts`：对应测试（+50）

#### docs（1 commit，6 文件，+1835）

**Commit — `66730a0`（08:58）Loop 4 三样本 Golden Manifest 锁定 + Loop2/3/4 实施切片**
- `golden-manifests/device.json`：**新增**设备监控组件 Golden Manifest（+637）
- `golden-manifests/env.json`：**新增**环境监控组件 Golden Manifest（+252）
- `golden-manifests/traffic.json`：**新增**交通流量组件 Golden Manifest（+871）
- `pipeline-loop-234-execution-2026-09-10.md`：Loop 2/3/4 执行切片文档（+75）

> 另有 auto-sync commit `cc0e819`（00:00）更新 `pipeline-governance-2026-09-09.md`（+104/-9）和 `pipeline-governance-playbook-2026-09-09.md`（+416）

#### frontend / backend-java

无变更。

### 📝 今日摘要

今天 mvgo 项目聚焦**管线治理（Pipeline Governance）系统性落地**，是继 09-08 Phase 3-5 改造后的又一次大规模管线推进：

1. **Loop 0/0.5/1 契约治理闭环**（凌晨 02:37）：修复 bcrypt 构建阻断（`bcrypt-shim.d.ts`），资源清单大幅扩展，属性绑定/导入守卫增强，Loop1 forceAll 收口 + 错绑确定性剥离。
2. **Loop 4 双裁判门禁体系建立**（上午 08:57-09:08）：新增 `figma-golden-extractor`（Figma 基准提取）+ `manifest-auditor`（Manifest 审计）两个核心模块（合计 +570 行），并接入 microcode-engineer 落盘流程，实现生成结果与 Golden 基准的自动对比校验。
3. **CODE-019 死锁治本**（09:13）：`props-wiring-guard` 强制子组件资源 prop 由父级持有，根治 mc-max 样本暴露的资源归属死锁问题。
4. **Golden Manifest 三样本锁定**：docs 新增 device/env/traffic 三个组件的 Golden Manifest（合计 +1760 行），为 Loop 4 门禁提供基准数据。

今日 6 commits 全部标注 `#ai-coding#`，合计 +3368/-78 行，管线治理进入 Loop 4 双裁判门禁可运行状态。

**待办线索**：
- Loop 4 双裁判门禁需构建 dist + 重启 Node 验证
- 三样本 Golden Manifest 跑通验证
- frontend/backend-java 今日无变更，前端侧尚未对接管线治理成果
- hourly 扫描服务已停摆 38 天

---

## 2026-09-12

### 📊 变更统计

| 仓库 | Commits | 文件数 | 主要变更类型 |
|------|:-------:|:------:|-------------|
| backend-node | 1 | 2 | auto-sync（备份 tar.gz 归档） |
| frontend | 1 | 11 | auto-sync（清理 .backups 历史备份文件，-3504 行） |
| backend-java | 0 | 0 | - |
| docs | 0 | 0 | - |
| 主仓 | 1 | - | 子仓指针同步 |
| **合计** | **3** | **13** | 清理/归档 |

### 🔑 核心变更

#### backend-node
- `daily auto-sync` commit：新增 2 个 09-11 备份 tar.gz（~248MB×2），归档 09-11 高密度开发日的完整快照

#### frontend
- `daily auto-sync` commit：清理 11 个 `.backups/` 历史备份文件（common.less ×5 + declare.json ×3 + index.css ×3），释放 -3504 行

### 📝 今日摘要

09-12 为 09-11 高密度开发日（12 commits）后的清理归档日。auto-sync 机制自动执行：backend-node 归档了完整 tar.gz 备份，frontend 清理了管线改造过程中产生的 11 个样式/配置备份文件。无功能性开发活动。

**待办线索**：
- 09-11 的 12 commits 仍需构建 dist + 重启验证
- hourly 扫描服务已停摆 39 天

---

## 2026-09-13

### 📊 变更统计

| 仓库 | Commits | 文件数 | 主要变更类型 |
|------|:-------:|:------:|-------------|
| frontend | 0 | 0 | - |
| backend-node | 0 | 0 | - |
| backend-java | 0 | 0 | - |
| docs | 0 | 0 | - |
| 主仓 | 0 | 0 | - |
| **合计** | **0** | **0** | 今日无变更 |

### 🔑 核心变更

今日无开发活动（周六）。各仓库工作树干净，无未提交变更。

最近一次提交停留在 09-12 00:00（auto-sync 归档/清理）。

### 📝 今日摘要

周末休息日，无实质性开发活动。

**待办线索**（延续 09-11）：
- 09-11 的 12 commits 管线根治需构建 dist + 重启 Node 验证
- Loop 4 双裁判门禁 + 三样本 Golden Manifest 待跑通验证
- hourly 扫描服务已停摆 40 天

---

## 2026-09-14

### 📊 变更统计

| 仓库 | 已提交文件 | 未提交文件 | 主要变更类型 |
|------|:----------:|:----------:|-------------|
| backend-node | 22（7 commits） | 8（+451/-21） | 治本刀 16b~20 系列 + 设备监测栅格事实源打通 |
| frontend | 0 | 1（+9/-4） | 预览页微调 |
| backend-java | 0 | 0 | - |
| docs | 0 | 1 | 管线治理日报 |
| 主仓 | 6（auto-sync） | 0 | 子仓指针同步 + mc-spec 报告归档 |
| **合计** | **28** | **10** | |

### 🔑 核心变更

#### backend-node — 治本刀 16b~20 + 设备监测根治（7 commits，凌晨 00:19~03:28）

- **刀 16b**（`e5f9bcb`）：LESS 颜色函数实参可求值收口 —— 新增 `less-color-funcs.js`（+131 行）+ 4 条取值路径统一收口，消费端事实优先于名字猜测。10 文件 +647/-55
- **刀 17**（`15c631a`）：`grid-template-*` 漏 `display:grid` → 多列塌一列被裁（L0-B 不可见）—— `css-sanitizer.js` 新增 `ensureGridDisplay`，与 `ensureFlexDirection` 共用叶子块扫描器。3 文件 +257/-63
- **刀 18**（`3d9842f`）：绑定表达式对象键被类名对齐改写成裸键 → 非法 JS → P1-4 剔除子组件 —— `code-healer.js` 新增 `healUnquotedObjectKeysInVue` 补引号。3 文件 +161
- **刀 18 扩展 + 刀 19**（`ecbadde`）：① 绑定对象键补引号覆盖数组/事件属性形态；② 数据键被 LLM 写成类名（`'c-device-monitor-error': '5'` 配 `{{ item.error }}` → 取值恒空）→ 以模板 `.prop` 为事实源确定性还原。3 文件 +203/-15
- **刀 20**（`d2b8ff3`）：父容器缺 `display:flex` → 子项 flex 值全部失效布局塌方 —— 新增 `flex-sibling-guard.js`（+136 行），复用 FLEX-003 兄弟组事实源检测，存量 2765 组件 0 命中零误伤。4 文件 +323/-1
- **设备监测 P1+P3**（`0c5bd14`）：无归属壳判别力去重 —— `section-tree.js` 大幅扩展 +102 行 + 验证脚本 +244 行。4 文件 +436/-7
- **设备监测 P4 治本-1**（`c85a057`）：栅格列数事实源打通 —— planner 透传 + dedupe 合并 + prompt 打印。4 文件 +134/-17
- **未提交 8 文件**（+451/-21）：`flex-sibling-guard.js` 继续扩展 +240 行、`style-class-consolidator.js` 增强 + 测试补充、`constraint-reinforcement.js` / `code-generator.js` / `code-validator.js` / `prompt-builder.js` 管线优化

#### frontend
- 未提交 `src/views/preview/index.vue`（+9/-4）：预览页微调

#### docs
- 未提交 `pipeline-governance-2026-09-14.md`：管线治理日报

#### 主仓
- auto-sync commit：子仓指针同步 + mc-spec 报告归档（c-device-monitor 检查报告 + 241MB tar.gz 备份）

### 📝 今日摘要

凌晨 00:19~03:28 高密度输出 7 commits，核心是**治本刀 16b~20 系列**——五条刀全部针对「代码门禁结构上不可见」的布局/数据塌方问题：LESS 颜色函数实参不可求值（刀 16b）、grid 缺 display 导致内容消失（刀 17）、绑定对象键被改写致 SFC 解析失败（刀 18）、数据键被 LLM 写成类名致取值恒空（刀 19）、父容器缺 display:flex 致布局塌方（刀 20）。每条刀都从管线层确定性后处理根治，不改产物本身。同步推进**设备监测组件视觉对齐**（section-tree 大幅扩展 + 栅格列数事实源打通）。backend-node 仍有 8 文件未提交（+451 行），需构建 dist + 重启验证。

**待办线索**：
- backend-node 8 文件未提交需整理提交
- 7 commits 需构建 dist + 重启 Node 验证
- hourly 扫描服务已停摆 41 天

---

## 2026-09-15

### 📊 变更统计

| 仓库 | 已提交文件 | 未提交文件 | Commits | 主要变更类型 |
|------|:----------:|:----------:|:-------:|-------------|
| backend-node | ~32（5 commits） | 2（+58） | 5 | 阶段B结构层接管（inline-row 确定性装配）+ 阶段A1事实源收口 + 后处理修复 |
| frontend | 1（1 commit） | 0 | 1 | ComponentLibrary.vue 大幅精简（-613/+54） |
| backend-java | 0 | 0 | 0 | - |
| docs | 1（5 commits） | 1（untracked） | 5 | 管线治理日报迭代 + 全量治理总纲新增 |
| 主仓 | 6（auto-sync） | 0 | - | 子仓指针同步 + mc-spec 报告归档 |
| **合计** | **~40** | **3** | **12** | |

### 🔑 核心变更

#### backend-node（5 commits，~32 文件已提交 + 2 文件未提交）

**Commit 1 — `5f968e5`：阶段A1收口共享Figma事实入口**
- `section-tree.js`：新增 +90 行，成为共享 Figma 事实入口（`extractSectionTree`），统一各下游模块对 section 树的访问
- 9 文件改造（-138 行冗余代码消除）：`container-rebuilder`/`figma-height-ratio`/`flex-direction-inferrer`/`inline-row-merger`/`inline-row-rebuilder`/`section-content-guard`/`tab-resource-guard` 全部改为调用 section-tree 共享入口
- 新增 `section-tree.spec.ts`（+43 行）

**Commit 2 — `3e56f77`：阶段B高置信统计型inline-row确定性成员装配**
- `inline-row-assembler.js`：新增 +167 行，核心装配器——对统计型 inline-row（标签+数值对）用确定性规则装配成员，不依赖 LLM 自由生成
- `inline-row-assembler.spec.ts`：新增 +256 行测试
- `section-content-guard.js`：+62/-24，接入装配器
- `microcode-engineer.js`：+7/-1，角色层接入

**Commit 3 — `779a6cb`：阶段B结构层接管——确定性统计行配对对齐**
- `inline-row-assembler.js`：+73 行，新增 `healStatRowMemberPairing`——统计行标签-数值配对确定性对齐
- `inline-row-assembler.spec.ts`：+88 行测试
- `microcode-engineer.js`：+38 行，角色层接入配对对齐

**Commit 4 — `04265a0`：阶段B评审修复——heal回调替换+限定template段扫描**
- `inline-row-assembler.js`：+30/-5，修复 heal 回调替换逻辑，限定扫描范围为 template 段（避免误改 script/style）
- `inline-row-assembler.spec.ts`：+39 行测试

**Commit 5 — `80f81bd`：daily auto-sync**
- 子仓指针同步 + mc-spec 检查报告归档（4 组 09-14 报告）
- `src/auth/current-user.decorator.ts`：新增 +10 行
- `src/component/component.controller.ts`：+8/-1
- `src/tasks/tasks.controller.ts`：+25/-9

**未提交 2 文件（+58 行）**：
- `src/ai-engine/utils/post-process.js`：+10 行——**R4-a 非容器后缀黑名单**（`injectChartMinHeight` 修复），`chart-title`/`chart-legend`/`chart-bridge` 等非 echarts 挂载容器不再被误注入 `min-height:160px`（此前撑裂布局的根因）
- `src/ai-engine/__tests__/t03-chart-min-height.js`：+48 行，对应测试

#### frontend（1 commit，1 文件）

- `eedf793` daily auto-sync：`src/views/components/ComponentLibrary.vue` 大幅精简（-613/+54），删除大量冗余代码

#### docs（5 commits，1 文件已提交 + 1 未跟踪）

- `pipeline-governance-2026-09-14.md`：5 次迭代提交（+12/+32/+24/+17/+20），记录阶段A1细化→A1批次验收→B批次验收→B真机验证结论→B结构层接管验收的完整证据链
- **未跟踪** `pipeline-governance-total-2026-09-15.md`（185 行）：**全量问题治理总纲**——取代此前散落的 4 份治理文档（09-09/09-10/09-13/09-14），提出「删减法」唯一方法论：把视觉确定性事实从 LLM 职责剥离，门禁/规则总数必须下降而非上升。收敛指标：规则总数递减

### 📝 今日摘要

今天 mvgo 项目核心推进**阶段B结构层接管**——将此前由 LLM 自由生成的 inline-row（统计行/标签值对）改为确定性装配，是「删减法」治理思路的又一次落地：

1. **inline-row 确定性装配器**（3 commits，+529 行代码+测试）：`inline-row-assembler.js` 从零新增，实现高置信统计型 inline-row 成员装配 + 标签-数值配对对齐（`healStatRowMemberPairing`），扫描范围严格限定 template 段。4 个 spec 文件 +422 行测试覆盖
2. **阶段A1事实源收口**（1 commit，9 文件改造 -138 行）：新增 `section-tree.js` 作为共享 Figma 事实入口，6 个下游模块统一改用 `extractSectionTree`，消除冗余的 figma 节点访问代码
3. **后处理 chart min-height 误伤修复**（未提交）：`injectChartMinHeight` 新增非容器后缀黑名单，修复 `chart-title`/`chart-legend` 等被误注入 `min-height:160px` 撑裂布局的问题
4. **全量治理总纲新增**（docs 未跟踪 185 行）：取代散落的 4 份治理文档，提出「删减法」唯一方法论——门禁/规则总数必须下降，继续加规则永不收敛

**提交状态**：12 commits（backend-node 5 + frontend 1 + docs 5），3 文件未提交/未跟踪。

**待办线索**：
- backend-node 2 文件未提交（post-process.js chart 黑名单修复）需提交
- docs 全量治理总纲（185 行）需 review 后提交
- 5 commits 需构建 dist + 重启 Node 验证
- hourly 扫描服务已停摆 42 天

---

## 2026-09-16

### 📊 变更统计

| 仓库 | Commits | 文件数 | 主要变更类型 |
|------|:-------:|:------:|-------------|
| frontend | 4 | 19 | 预览页语义建址 + 管理页 UI 统一 + 主题切换 + fenno.ai 清零 |
| backend-node | 14 | 143 | 确定性收回 A1/D/A2 + P0~P2 多项根因修复 + 门禁新增 + 管线治理 |
| backend-java | 0 | 0 | - |
| docs | 4 | 75 | 确定性收回清单更新 + 归档清理 + 系统架构文档 v1.1 |
| 主仓 | 3 | 18 | 根目录大清理（删 994M 备份 + 密码擦洗 + gitignore）+ 规则⑤收窄 |
| **合计** | **25** | **~255** | |

> 注：主仓 d5721df7 大清理（22446 files / -14.9M 行）为删除 .snapshots/备份/日志等历史垃圾，非功能性变更。

### 🔑 核心变更

#### backend-node（14 commits，本日核心产出）

**确定性收回系列（治本）**：
- `7f9290c` **A1 类名骨架化 + D 图表约束第一刀 + A2 componentId 收敛 S4**（43 files, +2623/-150）：本轮最大改动，系统性收回三项确定性事实到管线层
- `61a3541` **E2(R3) header 归属收回**（+360/-25）：事实优先装配 + 收缩行名启发式
- `b9d2ec9` **I 类治本：lite componentId 语义建址**（+28/-7）：由 sessionId 收敛为语义建址

**P0~P2 根因修复**：
- `86dddfa` **P0：input is not defined 致确定性修复整段崩溃**（+73/-21）—— f177f631 三卡消失根因
- `27f7b2d` **P1：chart-section 兜底漏识别 charts 真值**（+180/-50）—— d7334a67 环形图消失根因
- `19fa394` **P2：vision 亮度误判致黑白叠字**（+118/-9）—— a9a8edc9 根因
- `8bd3f44` **P0：截断误判治本 + M1.2 CLASS-PAIR 选择器级配对门禁 + M1.4 取消 fallback 兜底错配**（+269/-27）

**门禁 & 管线治理**：
- `d696edd` **P0-2 新增门禁 VAR-SUFFIX-ILLEGAL**（+72）：拦截 var()-后缀非法拼接
- `aa7b893` **P0-1 E1 治本：section id 唯一化**（+96）：vision 重复 id 致 LLM 混淆
- `472f6c2` 修复 `healThemeMixinVarRefs` 正则边界 bug（@color-bg 吞 @color-bg-card 前缀）
- `b62429e` 管线治理第 1 组：section 轴向映射 + 类状态/颜色槽位门禁 + vision 返回归一化（+627/-6）
- `70ca837` 管线治理治本 + query 脚本密码擦洗（20 files, +1112/-192）
- `cc54e00` resource-mounter 规则⑤补 flexGrow/inline-row 单测（+123）

#### frontend（4 commits）
- `d14e753` 预览页 `declare.json` 兜底路径改用 `resolvedId`（语义建址）+ 非阻断探测
- `24ecc0a` 预览/运行时/管理页调整（loadVue3Runtime / UsersView / demo / preview）
- `b1524bb` 更新日志页 + 管理页内边距统一 + 主题切换注入 + fenno.ai 占位清零（8 files, +332/-6）

#### docs（4 commits）
- `cca8137` 确定性收回清单与治理方案文档（5 files, +714）
- `cb798d7` 确定性收回清单更新：E2(R3) 标记已做（13/17，待收回 4）
- `9704520` 归档清理 + README 死链修复 + 系统架构文档 v1.1（65 files, +602/-19978）

#### 主仓（3 commits）
- `d5721df7` 根目录大清理：脚本归类 + 密码擦洗 + 删 994M 备份 + gitignore 更新
- `7efc9caf` 规则⑤收窄：row 容器不写 flexGrow / 已有 gap 不注入 justify-content（10 files, +1012/-1）

### 📝 今日摘要

今日是 2026 年以来单日 commit 数并列最高的一天（25 commits），核心主线是**确定性收回系统性落地**——A1 类名骨架化、D 图表约束第一刀、A2 componentId 收敛、E2(R3) header 归属收回，四项治本改动共涉及 ~50 文件、+3000 行，将视觉确定性事实从 LLM 猜测收回到管线确定性装配。同步修复了 4 个 P0~P2 级根因 bug（input is not defined 崩溃、chart-section 兜底漏识别、vision 亮度误判叠字、截断误判），并新增 VAR-SUFFIX-ILLEGAL 门禁和 section id 唯一化治理。前端完成预览页语义建址 + 管理页 UI 统一；docs 归档清理近 2 万行历史文档并输出系统架构文档 v1.1；主仓完成 994M 历史垃圾清理和密码擦洗。

**待办线索**：
- 14 个 backend-node commits 需构建 dist + 重启验证
- 确定性收回清单 13/17，剩余 4 项待收回
- hourly 扫描服务已停摆 43 天
- backend-java 有 3 个未提交文件（deploy-java.sh + AdminUserVO + AdminService）

---

## 2026-09-17

### 📊 变更统计

| 仓库 | 已提交文件 | 未提交文件 | Commits | 主要变更类型 |
|------|:----------:|:----------:|:-------:|-------------|
| backend-node | 23（3 commits） | 20（+1313/-83） | 3 | admin 使用统计导出 + 管线治理四阶段（vue3 主题确定性/资源精确挂载/门禁修复） |
| frontend | 0 | 3（+282） | 0 | 管理页用户视图 + 任务详情页增强 + vite 配置 |
| backend-java | 0 | 0 | 0 | - |
| docs | 0 | 2（untracked） | 0 | 任务遥测与 BadCase 反馈闭环设计方案 |
| 主仓 | auto-sync | 0 | 1 | 子仓指针同步 |
| **合计** | **~23** | **25** | **4** | |

> 注：hourly-changes.md 扫描服务仍未运行（自 2026-08-04，第 44 天），数据来源为 git log + git diff

### 🔑 核心变更

#### backend-node（3 commits，23 文件已提交 + 20 文件未提交）

**Commit 1 — `da4bf0c`（00:00）daily auto-sync**
- `mc-component-graph-phase2.js` / `mc-component-graph-vue3.js` / `figma-connector.js`：3 文件，+7/-81，死分支清理

**Commit 2 — `aec165a`（02:41）管线治理四阶段：vue3 主题确定性 + 资源精确挂载 + 门禁修复**
- `mc-component-graph-vue3.js`：+13，Vue3 图结构接入主题确定性阶段
- `figma-connector.js`：+1，Figma 连接器微调
- `microcode/prompt-builder.js`：+6，prompt 构建器增强
- `microcode/resource-mount-plan.js`：+28，资源挂载计划扩展
- `microcode/resource-mounter.js`：+59/-6，资源挂载器大幅增强（精确挂载）
- `microcode/resource-mounter.spec.ts`：+87，挂载器测试覆盖
- `microcode/vue3-prompt.js`：+6/-1，Vue3 prompt 微调
- `microcode/vue3-style-entry.js`：+28/-7，Vue3 样式入口治理
- `microcode/vue3-style-entry.spec.ts`：+19/-5，样式入口测试
- `vue3-engineer.js`：+68，Vue3 工程师角色接入主题确定性
- `utils/flex-sibling-guard.spec.ts`：+25，flex 兄弟守卫测试补充
- `utils/flex-sibling-guard.js`：+11/-1，flex 兄弟守卫增强
- `utils/theme-color-guard.js`：+5，主题色守卫增强
- `utils/theme-color-guard.spec.ts`：+23，主题色守卫测试补充
- **14 文件，+345/-34**

**Commit 3 — `798cedc`（02:41）admin 使用统计导出功能 + import 收尾**
- `admin/admin-stats.controller.ts`：+25，使用统计端点新增
- `admin/admin.controller.ts`：+20，管理控制器扩展
- `admin/admin.service.ts`：+70，管理服务增强
- `admin/usage-export-io.ts`：+123，导出 IO 层（文件读写/格式转换）
- `admin/usage-export.spec.ts`：+139，导出单测
- `admin/usage-export.ts`：+708，导出核心逻辑（统计聚合/CSV/Excel 生成）
- **6 文件，+1085**

**未提交 20 文件（+1313/-83）**：
- **admin 模块持续迭代**（5 文件，+268）：admin-stats.controller / admin.service / usage-export-io / usage-export.spec / usage-export 继续完善
- **管线核心角色增强**（5 文件，+330）：microcode-engineer.js（+44）、resource-mount-plan.js（+40/-1）、resource-mount-plan.spec.ts（+73）、resource-mounter.js（+123/-1）、resource-mounter.spec.ts（+83/-1）
- **section-tree 大幅扩展**（2 文件，+445）：section-tree.js（+244）、section-tree.spec.ts（+201）——共享事实入口继续承载更多确定性逻辑
- **theme-color-guard 增强**（2 文件，+100）：theme-color-guard.js（+67）、theme-color-guard.spec.ts（+33）
- **prompt/校验/规划层**（6 文件，+170）：base-panel-slots.md（+9）、resource-handling-guide.md（+18）、subcomponent-planner.js（+122/-）、visual-parser.js（+24/-）、vue3-engineer.js（+41/-）、code-structure-validator.js（+6/-）

#### frontend（3 文件未提交，+282）
- `src/views/admin/UsersView.vue`：+93，管理页用户视图增强
- `src/views/tasks/TaskDetail.vue`：+184，任务详情页大幅扩展
- `vite.config.js`：+5，Vite 配置微调

#### docs（2 文件未跟踪）
- `.pipeline-docx-20260917013339/`：管线文档生成临时目录
- `任务遥测与BadCase反馈闭环设计方案.docx`：新增任务遥测与 BadCase 反馈闭环设计方案文档

### 📝 今日摘要

今日 mvgo 项目凌晨 02:41 集中提交 3 commits（含 auto-sync），核心进展两条主线：

1. **admin 使用统计导出功能**（+1085 行）：从零新增使用统计导出能力——`usage-export.ts`（708 行）实现统计聚合与 CSV/Excel 生成，`usage-export-io.ts`（123 行）处理文件读写，配套 139 行单测。这是管理后台首次具备数据导出能力，为运营分析提供数据支撑。

2. **管线治理四阶段落地**（14 文件，+345/-34）：Vue3 管线接入主题确定性（theme-color-guard 增强 + vue3-style-entry 治理），资源挂载器精确化（resource-mounter +59 行 + resource-mount-plan +28 行），flex 兄弟守卫与门禁测试覆盖补充。延续昨日确定性收回思路，将 vue3 管线的主题色/资源挂载从 LLM 自由生成收回到确定性装配。

未提交方面，backend-node 20 文件（+1313/-83）是今日最大工作量——section-tree.js 大幅扩展 +244 行成为共享事实入口的核心承载，admin 导出功能继续迭代完善，resource-mounter/plan 精确挂载持续深化。frontend 有 3 文件未提交（管理页 + 任务详情页 +282 行）。docs 新增任务遥测与 BadCase 反馈闭环设计方案。

**待办线索**：
- backend-node 20 文件未提交（+1313 行）需整理提交
- frontend 3 文件未提交（+282 行）需 review 提交
- 3 commits 需构建 dist + 重启 Node 验证
- hourly 扫描服务已停摆 44 天

---

## 2026-09-18

### 📊 变更统计

| 仓库 | 文件数 | 主要变更类型 |
|------|:------:|-------------|
| frontend | 7 | 管理页大幅扩展（Dashboard/MyStats/TaskStats） |
| backend-node | 18+5 | 视觉管线治本（Figma 着色/fill 透明度/flex display）+ 进程防崩 + 背景问题族根治 |
| backend-java | 0 | - |
| docs | 5 | 背景问题族记录 + 任务遥测与 BadCase 闭环设计方案 |
| **合计** | **30+5** | **9 commits（含 3 auto-sync）** |

### 🔑 核心变更

#### backend-node（5 commits，18 文件已提交 + 5 文件未提交）

**Commit 1** `a209fa5`：P-11 Figma TEXT per-character 分段着色修复
- `src/ai-engine/roles/figma-connector.js`（+42）：保留 characterStyleOverrides + styleOverrideTable 白名单，修 device-count 分段色彩丢失（如「2」红/「/484」蓝被节点默认白 fill 吞掉）

**Commit 2** `8404de1`：子组件收敛 flex 信号补 display
- `src/ai-engine/utils/style-class-consolidator.js`（+38/-3）+ spec（+40）：scoped 有 align-items/justify-content/gap/flex 却漏 display → 确定性补 display:flex，修 ContentDefault icon+文字纵向堆叠

**Commit 3** `5c0c612`：进程级防崩网——redactSecrets 循环引用栈溢出修复
- `src/common/utils/redact.ts`（+75/-14）+ spec（+122）：WeakSet 循环检测 + [Circular] 占位，任务成功后崩溃四轮实锤
- `src/main.ts`（+14）：unhandledRejection 只记录不退出
- `src/progress/progress.service.ts`（+20/-）：完成消息脱敏 fail-safe 降级

**Commit 4** `89f28cb`：视觉管线双治本
- `src/ai-engine/roles/visual-parser.js`（+9/-9）+ spec（+45）：fillToRgba 抽纯函数，fill.opacity 优先于 color.a，修 stat-card 半透明底变全饱和
- `src/ai-engine/utils/section-tree.js`（+25）：布局声明缺则保留 common.less
- `src/ai-engine/utils/style-class-consolidator.js`（+64/-2）+ spec（+46）：修 tabs 横向变纵向

**Commit 5** `538bf83`：⭐ 背景问题族第二波治本（今日最大 commit，+1103/-50）
- `src/ai-engine/utils/post-process.js`（+682）+ spec（+215）：P-01b/c/d 剥壳保真 + P-07 wrapper unwrap + P-08 根布局几何注入 + P-09 状态切换装配 + P-10 死规则迁移 + pipeline 双路径覆盖
- `src/ai-engine/roles/microcode/resource-mount-plan.js`（+121/-）+ spec（+47/-）：资源挂载计划深化
- `src/ai-engine/validators/code-fix-rules.js`（+43）：P-10 死规则迁移
- `src/ai-engine/roles/microcode-engineer.js`（+45/-）：管线入口适配

**未提交 5 文件**：microcode-engineer.js / post-process.js / code-fix-rules.js / orphan-component-detector.js（新增）/ orphan-component-detector.spec.ts（新增）

#### frontend（1 commit auto-sync，7 文件）

- `src/views/admin/DashboardView.vue`（+863）：管理仪表盘大幅新增
- `src/views/admin/MyStatsView.vue`（+216）：个人统计页新增
- `src/views/admin/TaskStatsView.vue`（+244/-）：任务统计页扩展
- `src/views/admin/ManagementView.vue`（+196/-）：管理页增强
- `src/views/admin/AdminLayout.vue`（+27/-）：布局调整
- `src/router/basic-routes.js`（+20/-）：新增管理页路由
- `src/views/preview/index.vue`（+16）：预览页微调

#### docs（2 commits，5 文件）

- `新生成组件问题追踪-2026-09-17.md`（+51）：背景问题族第二波记录（P-01b/c/d + P-07~P-10 + pipeline 双路径 + c2026822 验证证据）
- `任务遥测与BadCase反馈闭环设计方案.docx`（45KB）+ pipeline-state.yaml（+70）+ final_draft.md（+361）+ formatted HTML（+881）：完整设计方案文档

### 📝 今日摘要

今天 mvgo 项目进入高密度开发日，backend-node 5 commits 聚焦三条主线：
1. **背景问题族第二波根治**（最大工作量，+1103 行）：post-process.js 大幅扩展，系统性解决 P-01b/c/d 剥壳保真、P-07 wrapper 残尸、P-08 根布局几何注入、P-09 状态切换装配、P-10 死规则迁移等 6 类视觉失真问题，配合 pipeline 双路径覆盖确保全场景生效
2. **视觉管线双治本**：Figma fill 透明度丢失（fillToRgba 抽纯函数）+ 子组件 flex display 覆盖丢失（确定性补 display:flex），两个高频视觉 bug 从管线层根治
3. **进程级防崩网**：redactSecrets 循环引用栈溢出修复（WeakSet 检测 + [Circular] 占位）+ unhandledRejection 降级 + 完成消息脱敏 fail-safe，解决任务成功后崩溃的四轮实锤问题

frontend 管理页大幅扩展（DashboardView +863 / MyStatsView +216 / TaskStatsView +244），管理后台功能基本成型。docs 完成「任务遥测与 BadCase 反馈闭环」设计方案文档。

### 📌 待办线索

- backend-node 5 文件未提交（含 orphan-component-detector 新模块）
- 5 commits 需构建 dist + 重启 Node 验证
- hourly 扫描服务已停摆 45 天

---
