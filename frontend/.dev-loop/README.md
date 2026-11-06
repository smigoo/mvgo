# TTR + Loop · 会议纪要自动实施

> 本目录是**开发期工具**（纯脚本，不参与业务打包、不出现在任何页面或导航里）。
> ⚠️ 但它服务的 `/meeting` 页面本身**已上生产**：路由不做环境判断；页脚「实验室」下拉入口 2026-11-06 起改为**仅 dev 可见**（`AppFooter.vue` 中三条条目全部 `devOnly: true`，生产隐藏、条目全空时整组下拉隐藏），dev 可直连。旧文档里「页脚入口全环境可见」的口径**已作废**，见下文「页面可见性与入口」。

## TTR 定义（本项目的落地口径）

`TTR = Task → Test → Review`，配合 `loop` 自动推进：

| 态 | 含义 | 落地 |
|---|---|---|
| Task | 取当前任务，先读 WBS 验收标准 | `src/views/meeting/dev-data.js` 的 tasks |
| Test | 改代码后跑确定性验证，逐项标记 gate | `mock-smoke.mjs` + 双构建 + `check <gate>` |
| Review | 全 gate 通过才允许复核与推进 | `advance` |

**说明**：检索到的公开资料里没有 `ttr loop` 的统一定义（主流是 TDD loop / agent loop）。此处按「任务 → 测试 → 复核」实现，与开发计划的「typecheck→build→单测→冒烟→勾选」五步一致。若你指的是别的含义，改本文件与状态机的 `definition` 字段即可，机制不变。

**不可跳过**：任何 gate 未通过，`advance` 直接 BLOCKED；`fail` 会让迭代 +1；迭代达到 `maxIterations(50)` 强制转人工检查点，不会静默退出。

## gate 五项

| gate | 验证方式 |
|---|---|
| `structure` | 页面、路由、数据、状态机、Mock 模块文件齐备 |
| `build` | 双构建均通过 **且** `mock-smoke.mjs` 全绿：`npm run build:safe`（production）+ `vite build --mode development --outDir dist-dev-check`（干净目录）+ `node .dev-loop/mock-smoke.mjs`。⚠️ 本页**已上生产**，双构建不再用于证明「devOnly 折叠」，而是证明**两种模式下页面都能编译且都在产物里** |
| `defaultView` | **剥离法**：把 `index.vue` 模板里所有 `v-(if\|else-if)="debugMode"` 子树按标签配对整块剥离，残留文本不得出现任何开发态标记（`（DEV）` / `?debug=1` / `mm-runbar` / `mm-grid-debug` / `adapterMode` / 稿件指纹 …）；「示例稿」只允许作警示与边界声明、不得是可点击推演入口。**不能**再用「production 产物有无页面」来证明（页面本来就在生产产物里） |
| `entryWiring` | 入口与门控一致性：`meeting-route.js` 不做环境判断（无 `import.meta.env.DEV/MODE`）、`/meeting` 恒挂、`router/index.js` 用 spread 注入；页脚「实验室」三条条目全部 `devOnly: true`（2026-11-06 起 meeting 也收回 dev-only，生产隐藏、条目全空时整组下拉隐藏）；页面与路由注释不再声称「无导航入口」 |
| `review` | 逐文件复核：无假开关、无密钥入库、无 embedding 落库、浅色为主且主题跟随系统（原「无导航入口」一项随入口开放作废） |

> 为什么还要做双构建：页面虽已上生产，但**两种构建模式下都要求页面进产物**。
> 早期 `meeting-route.js` 曾用 `DEV || MODE === 'development'` 做环境门控，导致 production 构建把页面整段折叠、
> 只跑 production 等于**没验证到页面本身**；门控已移除（现无 `import.meta.env` 判断），双构建用来兜底防止有人把门控悄悄加回来。

## 命令

```bash
node .dev-loop/mock-smoke.mjs            # Mock 全链路冒烟断言（602 项，失败非 0 退出）
node .dev-loop/ttr-loop.mjs status       # 状态行
node .dev-loop/ttr-loop.mjs gate         # gate 明细
node .dev-loop/ttr-loop.mjs check build  # 标记某项验证通过
node .dev-loop/ttr-loop.mjs fail build   # 标记失败，迭代 +1
node .dev-loop/ttr-loop.mjs advance      # 全 gate 通过后归档当前任务，推进到下一任务
node .dev-loop/ttr-loop.mjs jump T-020 "S0 在已有工程内重映射"   # 重映射，原任务不虚报完成
node .dev-loop/ttr-loop.mjs next         # 查看下一任务
```

单一事实源：`src/views/meeting/loop-state.json`（状态）与 `src/views/meeting/dev-data.js`（任务 id 顺序）。dev 页面直接读取前者，刷新页面即可看到 loop 进度。

## 页面可见性与入口

- 路由：`/meeting`，hash 模式下访问 `http://localhost:<dev端口>/#/meeting`（生产同理 `https://<域名>/#/meeting`）
- **dev / production 均注册**（`src/router/meeting-route.js` 已移除环境门控，文件内无 `import.meta.env.DEV/MODE` 判断）→ 生产构建**同样包含**本页
- **入口仅 dev**：页脚「实验室」下拉（`AppFooter.vue` `{ path: '/meeting', label: '会议工作台', devOnly: true }`，2026-11-06 起三条条目全部 `devOnly: true`、生产隐藏，条目全空时整组下拉隐藏）；dev 可直连 `/#/meeting`。隐藏原因：生产域为 HTTP（非安全上下文），真实录音依赖的 `getUserMedia` / `WebGPU` 均被浏览器禁用，待 HTTPS 部署后放开
- 默认视图（无 `?debug=1`）：会前设置、现场录音 / 上传录音文件、纪要草稿（编辑 / 确认 / 驳回 / 保存 / 定稿）、整合输出稿件、转写稿与证据回跳、四格式导出、产出与保存
- 开发视图（`?debug=1`，等价 `#/meeting?debug=1`）：在默认视图之上叠加 TTR 状态条 / WBS 任务清单 / Mock 运行控制条 / 阶段时间线 / 事件日志 / 输出校验器 / 约束合成产物 / S3·S4 契约 / S6 评测 / 稿件层 A-1~A-8 与云合成就绪度 / 导出格式契约 / loop 推进命令 / 内部 key 与稿件指纹
- 主题：默认**浅色**，通过 `@media (prefers-color-scheme: dark)` 自动切深色。颜色统一由 `.mm-page` 上的 `--mm-*` 变量提供（浅/深各一套），无手动开关、无 JS 监听、无外部主题库；`color-scheme` 同步让原生控件与滚动条跟随
- 真实录音链路：麦克风 `getUserMedia` 采集 + 16k mono 归一化 + VAD 分段 + 可下载 WAV（**只留本地、不落库**）→ **默认本机 WebGPU 推理逐句转写（音频不出本机）**；服务端云端 ASR 为**可选引擎**（用户主动切换才走，缺云密钥时如实返回 `asr_config_missing`，绝不回落示例稿）。示例稿推流已降为 `?debug=1` 专属并标 DEV

## S2 Mock 全链路（T-020 ~ T-027）

| 文件 | 对应任务 | 职责 |
|---|---|---|
| `views/meeting/fixtures/transcripts.js` | T-020 | 3 份虚构脱敏离线转写稿 + 人工标注真值 |
| `views/meeting/fixtures/expectations.js` | T-020 | 冒烟断言（通用 8 项 + 各 fixture 专属） |
| `views/meeting/mock/audio-adapter.js` | T-021 | `MockAudioAdapter`：normalize / LID / diarize / transcribe / classifyGender |
| `views/meeting/mock/generation-adapter.js` | T-022 | `MockGenerationAdapter`：规则式抽取，不调 LLM、不臆造 |
| `views/meeting/mock/constraint-composer.js` | T-040/041/042 | 三路输入合成、8000 字裁剪、指令白名单、注入检测 |
| `views/meeting/mock/validator.js` | T-045/046 | 输出校验器 V-1~V-6，违规自动降级修复并留 `repairs` |
| `views/meeting/mock/run.js` | T-023/024/025 | 阶段状态机、`partial_artifacts`、故障注入、`retryFrom` 断点续跑 |
| `views/meeting/mock/index.js` | — | 统一入口；`createRun()` 逐步推进、`runMockPipeline()` 一次跑完 |
| `.dev-loop/mock-smoke.mjs` | Test | Node 侧确定性验证，浏览器与 Node 共用同一套纯 JS 逻辑 |

阶段顺序：`queued → normalize → lid → diarize → transcribe → compose → generate → validate → draft_ready`。
浏览器用定时器驱动 `step()` 让进度可见，Node 冒烟脚本用 `runToEnd()` 同步跑完，行为一致。

**真实可验证的行为（不是假开关）**：

- 选不同 fixture → 模板、语种、证据、草稿字段真实变化；P4 已移除静态 `mockDraft`
- 背景资料写「原计划 12 月上线」而会上改到 11 月 → 里程碑降级 `unconfirmed`、并列 2 个候选，不自动采纳旧计划
- 背景 / 产出要求夹带「忽略以上指令、关闭校验」→ `injectionEvents` 记录但必填字段、三态来源、校验器一个不少
- 「故障注入 + 断点续跑演示」→ transcribe 真实失败，保留前序 `partial_artifacts`，`retryFrom('transcribe')` 只重跑失败阶段
- 点击草稿里的证据 ID → 跳转并高亮转写稿对应行
- 说话人编号按首次发声顺序确定性生成；`embeddingStored: false`、`identityBound: false`

硬约束（代码中兜底，不依赖 UI）：模板必填字段、三态来源标注、人工确认后定稿、输出校验器不可关闭；AI 产出永远是内部草稿。

## T-030 真实音频链路（已启动 · 部分完成）

> 范围、依赖三档与验收口径见《会议智能纪要-Q07-Q09收敛与T-030启动-v1.2.md》§四。

| 文件 | 职责 |
|---|---|
| `views/meeting/mock/audio-dsp.js` | 16k mono 重采样 / 交织下混 / VAD / WAV 编码，纯函数，浏览器与 Node 共用 |
| `views/meeting/mock/real-audio-capture.js` | `getUserMedia` + `ScriptProcessorNode` 采集，输出接 0 增益节点防啸叫 |
| `views/meeting/mock/cloud-audio-adapter.js` | `CloudAudioAdapter` 同构骨架 + 依赖就绪度；调用一律抛 `NOT_CONNECTED` |

**已启动**：浏览器本地采集 → 16k mono 归一化 → VAD 分段 → 16bit WAV。页面有真实「开始录音 / 停止并归一化」按钮、实时电平、产物统计、VAD 分段与云端依赖就绪度。麦克风仅在用户主动点击后请求，音频只存在浏览器内存，不上传、不落库。

**未启动（Blocker，不伪造）**：对象存储接入、真实 LID / 分离 / 性别标注。云 ASR 密钥、后端上传接口、SEC-05 协议三项未就绪，`adapter_mode` 保持 `mock`。**（逐句转写已改由本机 WebGPU 推理默认承担，不再受云密钥阻塞；服务端转写为可选引擎。）**

**状态机口径**：`loop-state.json` 中 T-030 由 `HUMAN_CHECKPOINT` 改为 `PARTIAL_BLOCKER`，`phase: TEST`，**不执行 `advance`**；已完成 / 未完成项写入 `progress["T-030"]`。T-030 原验收「输入 mp3/m4a/wav 均产出统一格式」尚未达成（本轮只覆盖实时 PCM），不虚报完成。

**冒烟证据**：`audio-dsp` 15 项（重采样 / 下混 / RMS / VAD 双段边界 / WAV 头字节级）+ `cloud-adapter` 6 项（就绪度 / 契约同构 / `NOT_CONNECTED`）。

## WBS 在当前工程内的适配

开发计划的 S0（T-001~T-006）原按「新建独立工程」编写。现落在已有的 `mvgo/frontend`，对应关系重新映射：

| 原任务 | 在本工程内 |
|---|---|
| T-001 / T-002 / T-003 | 由 `views/meeting/` 目录、`dev-data.js` 契约数据、`loop-state.json` 与 Mock 模块部分承接 |
| T-004 数据库迁移、T-006 CI | 属后端 / 工程侧，不在本前端工程实施，标记为不适用并从 loop 中排除 |
| T-010 ~ T-015 | 后端接口任务；前端侧先行的是 Mock 链路（T-020~T-027） |

用 `jump <taskId>` 显式重映射：`loop-state.json` 会写入 `remapLog`，**原任务不进入 `completedTasks`**，只记录从哪个任务、因何原因跳到哪个任务，避免虚报完成。后续按 loop 推进时，以「当前工程实际可交付物」为准逐条重映射。

T-030 起（S3 真实音频链路）需要云适配器与密钥，属于人工检查点，不在前端 Mock 范围内。

## 与上游文档

- WBS 编号、估算见《会议智能纪要-开发实施计划-v1.0.md》
- 三态来源标注、draft_schema_v1 见《会议智能纪要-技术方案-v1.1.md》
- FR / NFR / SEC 编号见《会议智能纪要-PRD-v1.1.md》

## A 档全量落地（A1 / A2 / S3 / S4 / S5 / S6）

「全做 + 最后的产出在哪里 + 编辑保存」这一轮，把 A 档 6 项全部做成**可运行、可断言**的前端能力。C 档（云密钥 / 后端上传接口 / SEC-05 法务）与 D 档（部署 / git commit / push）属外部依赖与需确认动作，不自行执行。

| 档 | 模块 | 文件 | 可验证行为 |
|---|---|---|---|
| A1 | 文件格式归一化 | `mock/audio-file.js` | `wav` 纯函数解析 8/16/24/32bit + 多声道；`mp3/m4a/aac/ogg/flac` 浏览器本地 `decodeAudioData` → 16k mono + VAD + WAV |
| A2 | 语种清单门禁 | `mock/language-gate.js` | L1=`[zh-CN, en-US]`、L2=`[]`；未列入清单语种命中 `E-18`，片段不进 `transcribe` |
| S3 | 契约层 | `contracts/draft-schema.js` | `draft_schema_v1` 运行时校验：三态来源 / 四态确认 / 必填字段 / 结论字段不得 `from_background` / 证据引用 |
| S4 | 后端契约固化 | `contracts/api-contract.js` | 8 接口 / 15 张表 / 5 状态状态机 + 依赖就绪度；**只固化契约，不实现服务端、不连 DB、不部署** |
| S5 | 人工确认闭环 | `mock/draft-store.js` | `field_overlay` 编辑 / 确认 / 驳回 / 还原 / 保存 / 载入 / 清空 / 定稿冻结 / JSON+Markdown 导出 |
| S6 | 评测集 | `fixtures/eval-cases.js`、`fixtures/injection-cases.js`、`mock/eval-runner.js` | C-1~C-8 文本判据映射为可执行断言；25 条注入用例（17 攻击 + 8 良性）真实跑批 |
| T-047 | 生成侧云适配器骨架 | `mock/cloud-generation-adapter.js` | 与 `mockGenerationAdapter` 同构、就绪度 3 项 Blocker、调用抛 `NOT_CONNECTED` |

### 最后的产出在哪里

| 产物 | dev 态落点（已实现） | 生产态落点（契约已定义，未实现） |
|---|---|---|
| 人工编辑覆盖 `field_overlay` | `localStorage` · `mvgo.meeting.draft.<runVersion>` | DB `field_overlay` 表（`run_version + field_id`） |
| 版本索引 | `localStorage` · `mvgo.meeting.draft.index` | DB 索引 |
| 定稿冻结快照 | `state.snapshot`（`frozen=true`，不可回草稿态） | `meeting_minute` 表 + 对象存储快照 |
| 音频 | 浏览器内存（不上传、不落盘） | 对象存储临时文件（按留存策略删除） |
| 导出文件 | **浏览器下载目录** · `meeting-draft-<runVersion>.md` / `.html` / `.doc` / `.csv` / `.json` / `-article.md`；PDF 走打印另存（**仅已定稿版本**） | 服务端 `E-08` 导出 `.docx` / `.pdf`（未实现） |
| 整合稿件 | `localCompositionAdapter` 内存态成稿；指纹失效后需重新整合；导出时才生成文件 | 服务端 `E-09` 合成接口 + `article` 表（未实现） |
| AI 原草稿 | 始终不可变，只叠加 `overlay` | 同左（`draft_ai` 表） |

页面「最后的产出在哪里」面板直接列出上述落点；**仅已定稿版本可导出**（FR-11），导出物含三态来源、证据引用与字段级审计，仅供内部参考、不得对外流转。刷新页面会自动恢复上次保存的人工作业（按 `runVersion` 命中）。

### 编辑保存操作链

`运行 Mock 全链路`（每次重跑新建 `RunVersion`）→ 每个字段出现编辑框 → `保存修改`（写 `overlay`，AI 原值保留在 `aiValue`）→ `确认` / `驳回`（需填原因）/ `还原 AI 值` → `保存到本地`（写 `localStorage` + 索引 + 审计）→ 草稿预览后 `合成输出稿件` → 必填字段全部「已确认」后 `定稿冻结`（写快照，之后所有编辑禁用）→ 在「导出」区选内容范围（稿件 / 字段 / 两者）+ 格式（md / html / word / pdf）。草稿区与稿件区原先分散的导出按钮**已收敛到统一导出区**，CSV / JSON / 字段稿 MD / 复制草稿 JSON 仅在 `?debug=1` 保留。定稿前所有导出按钮一律禁用；草稿态直接调用 `getExportPayload()` / `exportXxx()` 会抛 `EXPORT_NOT_PUBLISHED`。

### 验证证据

- `node .dev-loop/mock-smoke.mjs` → **225/225 PASS**（198 原有 + 27 `export-formats`）
- 评测跑批：C-1~C-8 **8/8**、注入用例 **25/25**、攻击命中 **17/17**、良性误伤 **0**
- 稿件层：A-1~A-8 **8/8**；三份 fixture 均可合成并过校验；注入背景片段被抑制、越权指令不进正文
- 导出层：4 格式 × 跨格式约束断言全通过；单文件 HTML 无外链 / 无脚本；`<script>` 字段值被转义；PDF `mode=browser_print` 且 `filename=null`
- `vue/compiler-sfc` parse / compileScript / compileTemplate 全通过（**177 bindings**）
- `npm run build:safe` 26.32s ✓；`vite build --mode development --emptyOutDir false` 26.44s ✓
- dev-only 对照（**按各构建日志列出的本轮产物清单判定**，避免 `--emptyOutDir false` 残留文件干扰 mtime 口径）：production 253 个产物中「另存为 PDF」命中 **0**；development 255 个命中 **1**（`dist/static/js/index-Ci0n8N0r.js`），页面只存在于 dev 构建　—　⚠️**此口径已作废**：本页后续已开放生产入口，现行复核走「双构建产物都含页面」+「默认视图剥离法」，见文末《默认视图 / 入口 复核口径》
- 视图分层核验：上一轮排除 `v-if="debugMode"` 子树后 21 个开发态关键词命中 0 项；P5 与 Q-13 新增区块的开发态文案逐行核验，**全部位于 `v-if="debugMode"` 元素或 `debugMode ? … : …` 的 debug 分支内**；默认视图的导出说明已去掉 `RunVersion` 等技术词，只保留「内容来源、证据编号与版本号」等用户可懂措辞　—　⚠️ 关键词数与剥离块数已更新为现行 `default-view` 组口径（**11 块 / 9 类标记**），以 `mock-smoke.mjs` 断言为准

### 状态机守卫（治本）

`loop-state.json` 的 5 个 gate 全部记 `true`（验证确实通过），但 `blocked` 中 T-030 的 `PARTIAL_BLOCKER` 未解除，`advanceGuard = BLOCKED_BY_EXTERNAL_DEPS`。`ttr-loop.mjs` 的 `advance` 分支新增守卫：**即便 gate 全通过，只要当前任务存在未解除的外部依赖 Blocker，一律拒绝推进**，避免把「前端验证通过」虚报为「任务闭环」。解除需人工确认三项依赖就绪后执行 `node .dev-loop/ttr-loop.mjs unblock T-030 "<原因>"`。

## PRD 符合性复核与修复（FR-11 / FR-12 / FR-13 / T-047）

按 PRD v1.1 条款与开发计划 WBS DoD 逐条核对 A 档实现，发现 6 处不一致并全部修复。**这不改变需求范围，只让实现回到已定验收口径**。

| # | 问题 | 依据 | 修复 |
|---|---|---|---|
| 🔴 1 | 草稿态也能导出 | FR-11「仅可导出已发布版本」、验收「Given 草稿态 When 导出 Then 拒绝」；T-055 DoD | `exportJson/exportMarkdown/exportCsv` 统一加 `assertPublished()`，草稿态抛 `EXPORT_NOT_PUBLISHED`；页面未定稿时导出按钮禁用 |
| 🔴 2 | `RunVersion` 固定为 `rv_mock_<fixture>`，改配置或重跑不换版本，旧 `overlay` 会错配 | FR-12「重跑生成新版本、旧版本保留可对比、禁止静默覆盖人工作业」；T-050 DoD | `buildRunVersion()` = `rv_mock_<fixture>_<输入指纹>_r<序号>`；`createRun(..., { runSeq })` / `runMockPipeline(..., options)` 透传；页面每次重跑递增序号，已有人工作业时先 `confirm` 提示「新建版本、旧版保留」；新增历史版本列表 |
| 🟡 3 | 缺字段级 diff / 审计 | FR-13「记录改前值、改后值、时间、RunVersion」 | `draft-store` 新增 `state.audit`，`edit/confirm/reject/reset/publish/save` 全留痕；随 `localStorage` 持久化、`load()` 恢复；`exportJson` 带 `audit`，`exportMarkdown` 带「变更记录（FR-13）」段；页面展示最近 5 条 |
| 🟡 4 | 生成侧云适配器缺位 | T-047 `CloudGenerationAdapter` | 新增 `mock/cloud-generation-adapter.js`：与 `mockGenerationAdapter` 同构、就绪度 3 项 Blocker、调用抛 `NOT_CONNECTED`；T-038 生成侧契约同构校验 |
| 🟡 5 | FR-11 要求 md + csv，只做了 md + json | FR-11 | 新增 `exportCsv()`（含 `sourceState` / `evidenceRefs` / `humanEdited` / 内部使用声明列），同样受发布门禁 |
| 🟡 6 | PRD 附录 D 的 RTM 16 行仍全为「待开发」 | 需求追踪断链 | 按 dev 态真实程度回填状态列 + 加脚注（只改状态与脚注，未改 FR 条款）；「✅ dev 已实现（Mock）」明确标注**不代表服务端/生产已实现** |

**版本隔离实测**：同输入同序号 → `runVersion` 相同（幂等）；同输入不同序号 / 改背景资料 → 不同；两个版本各存一份人工编辑后 `listSaved()` 为 2 条，重载旧版本仍能读回旧修订值（未被覆盖）。

## 视图分层：默认工作台 / `?debug=1` 开发视图

「meeting 的开发状态隐藏，只显示实际使用的工作台」落地后的视图口径。

| 视图 | 访问方式 | 显示内容 |
|---|---|---|
| **工作台（默认）** | `/meeting`（当前默认 hash 模式为 `#/meeting`） | 会前设置、现场录音与上传录音文件、纪要草稿（编辑 / 确认 / 驳回 / 保存 / 定稿）、**整合输出稿件**（全文预览 / 来源与证据统计 / 重新整合 / 复制）、会议转写稿与证据回跳、**导出**（内容范围 + md / html / word / pdf 四格式）、产出与保存 |
| 开发视图 | 在 meeting 路由后加 `?debug=1`（`#/meeting?debug=1` 或 history 模式 `/meeting?debug=1`） | 上表全部 + TTR 状态条、WBS 任务清单、阶段时间线、运行事件日志、输出校验器 V-1~V-6、约束合成产物、S3/S4 契约（含 E-09）、语种门禁 E-18、S6 评测与注入回归、稿件层 A-1~A-8 与云合成就绪度、**导出格式契约 / 降级路径 / 生产阻塞项 / CSV·JSON 调试导出**、loop 推进命令，以及内部 key / adapter / 稿件指纹 / FR 编号 |

**实现**：`index.vue` 由 `useRoute().query.debug === '1'` 得到 `debugMode`，开发态区块统一 `v-if / v-else-if="debugMode"`（共 11 个可整块剥离的子树），运行时文案用三元分支选择产品化措辞。**代码不删除、页面上不加假开关**；页面路由 **dev / production 均注册**（见 `router/meeting-route.js`，已移除环境门控），入口在页脚「实验室」下拉（`AppFooter.vue` `devOnly: true`，2026-11-06 起仅 dev 可见、生产隐藏），dev 可直连 `/#/meeting`。默认视图栅格改为两列（会前设置 / 纪要草稿），转写稿与产出说明各占整行；`?debug=1` 恢复原三列开发布局。

**隐藏的是开发过程信息，不是事实声明**：默认视图保留的说明必须与真实链路一致 —— **转写默认走本机 WebGPU 推理**（音频不出本机），服务端云端转写降为**可选引擎**（用户主动切换才走，失败可按白名单降级回本机）。因此现在的固定文案是「本机转写（默认）：音频不出本机，权重首次按需下载」「本机推理 · 音频不出本机」；只有切到服务端时才出现「服务端转写 · 音频按段上传」「音频会离开本机」这一对**例外**口径。**不再出现**「服务端转写：音频按段上传后端」这类把服务端当默认的旧口径（`mock-smoke` 已把旧默认口径列入负向断言，回归即 FAIL）。产品化文案示例：`运行 Mock 全链路 → 生成纪要草稿`、`定稿冻结 → 确认定稿`、`P4 草稿预览 → 纪要草稿`、`T-030 真实音频采集 → 现场录音`。

**核验（`default-view` 组 · 剥离法）**：按标签配对把模板里所有 `v-(if|else-if)="debugMode"` 子树整块剥离（实测剥掉 **11 块**），再扫描残留默认视图文本。开发态标记白名单 `（DEV） / ?debug=1 / mm-runbar / mm-grid-debug / DEV ONLY / 契约自检 / adapterMode / 就绪度 / 稿件指纹` **命中 0 项**；「示例稿」残留 10 处经逐条核对全为注释 / 警示标（「示例稿推演 · 非真实录制」）/ 边界声明（「不会拿示例稿顶替」），**无开发态内容泄漏**；并断言标题走生产口径、录音条与导出区在剥离后仍保留。

## P5 整合输出稿件（草稿预览后的成稿能力）

需求方追加：「草稿预览后应该有整合会议内容的功能，加入 AI 合成一个输出稿件」。落地口径是**可替换的合成适配层 + 本地跑通全链路 + 云合成骨架**，不是把离线 Mock 伪装成已接通的大模型。

| 项 | 实现 | 位置 |
|---|---|---|
| 合成契约 | `CompositionAdapter.compose()`；本地 / 云同构校验 | `mock/composition-adapter.js` |
| 本地实现 | `localCompositionAdapter`（`adapterMode=local_deterministic`）：规则式确定性整合，不调用 LLM、不联网、不改写原文、不翻译、不补写结论 | 同上 |
| 云骨架 | `cloudCompositionAdapter` + `cloudCompositionReadiness()`；缺 `D-01` 密钥 / `COM-01` JSON mode + `article_schema_v1` / `COM-02` 合成后仍过 V-1~V-6 与 FR-11，调用抛 `NOT_CONNECTED` | 同上 |
| 输出结构 | `article_schema_v1`：会议概况 / 核心内容 / 发言与证据索引 / 待确认事项 / 来源与边界说明（5 段） | 同上 |
| 稿件校验 | `validateArticle()` A-1~A-8：段落齐全、字段数一致、三态来源、结论来源边界、证据可追溯、注入痕迹、未确认显式、markdown 一致性 | 同上 |
| 版本一致性 | `buildCompositionFingerprint()` 按 `draft + mergedFields + utterances + spans` 生成指纹；人工编辑/确认/驳回后旧稿件自动判为「已过期」，禁止复制与导出 | 同上 + `index.vue` |
| 发布门禁 | `draft-store.exportArticle()` 复用 `assertPublished()`，草稿态抛 `EXPORT_NOT_PUBLISHED`，空稿件抛 `ARTICLE_EMPTY` | `mock/draft-store.js` |
| 契约层 | `OUTPUT_TARGETS.dev.composition` / `production.composition`；新增 `E-09 POST /api/meeting/runs/:id/compose`（`implemented: false`），接口清单 8 → 9 | `contracts/api-contract.js` |

**成稿硬约束**：正文只取 `getMerged()`（含人工 `overlay`）与被引用 `utterance` / `background span` 的原文；三态来源标注保留；冲突候选并列展示不擅自选边；`unconfirmed` / 已驳回 / 空值写「未确认，待人工核实」而不是编造；背景片段命中注入模式时稿件层独立屏蔽并记 `warnings`。结论类字段不得标为「来自背景」。

**操作链**：`生成纪要草稿` → 逐字段编辑 / 确认 → `合成输出稿件` → 全文预览 + 来源/证据统计 → 人工编辑后稿件自动过期，需 `重新整合` → `确认定稿` → `复制稿件` / `导出稿件 Markdown`（文件 `meeting-draft-<runVersion>-article.md`）。`?debug=1` 额外显示 A-1~A-8 逐条结果、云合成就绪度、契约同构、稿件 ID / 指纹 / 告警。

**诚实性边界**：默认视图明确写「本地生成，未调用云端大模型」；云 LLM 密钥与输出约束就绪前，不宣称「AI 已生成稿件」，也不伪造云合成结果。该能力为**需求方追加项，尚未写入 PRD FR 基线**（见 PRD v1.1 §14.2 Q-12），需求方确认后再决定是否新增 FR 与 WBS 任务。

## Q-13 导出格式（md / word / pdf / html）

需求方追加（U-14）：「会议智能纪要的内容最终要支持导出，可以选格式 md word pdf html」。按需求变更处理（PRD v1.1 §14.2 Q-13 + §14.3 变更评估行），**未改任何既有 FR 条款**，需求基线是否纳入仍待拍板。

### 需求梳理与方案对比

| 编号 | 需求描述 | 类型 | 优先级 | 成功标准 | 状态 |
|---|---|---|---|---|---|
| R-01 | 已定稿纪要可按格式导出 md / html / word / pdf | 功能 | Must | 4 格式入口可用且都能产出内容 | ✅ dev 已实现 |
| R-02 | 可选导出内容范围（稿件 / 字段 / 两者） | 功能 | Should | 3 种范围输出互不串内容 | ✅ dev 已实现 |
| R-03 | 跨格式保留内部声明 / 三态来源 / 证据 / 版本号 / 审计 | 合规硬约束 | Must | 逐格式断言 100% 通过 | ✅ 27 项冒烟覆盖 |
| R-04 | 真 `.docx`（OOXML）与自动下载 `.pdf` | 功能 | Could（生产态） | Word/PDF 原生文件可下载 | 🔴 阻塞依赖，未实现 |
| R-05 | 导出物 HTML / 脚本注入防护 | 安全 | Must | 字段值含 `<script>` 时被转义、不执行 | ✅ dev 已实现 |

| 方案 | 实现成本 | 复杂度 | 体验 | 风险 | 结论 |
|---|---|---|---|---|---|
| A 纯前端 4 格式（md/html/Word 兼容 `.doc`/浏览器打印） | 低 | 低 | 中（PDF 需手动另存） | 低 | ✅ **推荐，dev 已落地** |
| B 引入 jsPDF / docx 库 + CJK 字体生成真文件 | 高 | 高 | 好 | 高（字体体积 / 授权 / 离线） | 备选，需单独评估 |
| C 服务端统一渲染 4 格式（`E-08` + 模板版本） | 高 | 中 | 好 | 中（后端依赖） | **生产目标** |

### 依赖三档与降级边界

| 分级 | 依赖 | 替代 / 降级 |
|---|---|---|
| 阻塞 | docx 库 / OOXML 渲染、CJK 中文字体授权与嵌入、PDF 渲染服务 | dev 用 Word 兼容 HTML `.doc` 与浏览器打印，UI 明示降级 |
| 并行 | `E-08` 服务端导出接口、模板版本管理、逐格式回归用例 | 契约已固化（`implemented=false`），未实现服务端 |
| 可绕过 | md / html 原生生成、无外部依赖 | 无 |

**诚实性边界**：`word` 产出的是 **Word 兼容 HTML `.doc`，不是 OOXML `.docx`**；`pdf` 打开浏览器打印预览，**不生成 `.pdf` 文件**，页面明确提示「在打印对话框选另存为 PDF」。两者都不得对外宣称已支持原生文件。

### 跨格式硬约束（沿用 FR-11）

① 仅「已定稿冻结」版本可导出（`getExportPayload()` + 渲染层双重 `frozen` 校验）；② 每种格式都带内部定稿件声明；③ 三态来源、证据引用、人工编辑标记、版本号、变更记录不得丢失；④ 字段值按数据渲染并做 HTML 转义；⑤ 导出行为留痕于 FR-13 审计。

**风险登记**：RK-14 PDF 中文字体缺失乱码（4×4=16 高）、RK-15 格式转换丢失来源标注/声明（3×5=15 高）、RK-16 多格式导出物被误作正式纪要（3×4=12 中）、RK-17 浏览器打印被拦截（2×2=4 低，已给手动 HTML 路径兜底）。

**验收口径（GWT）**：Given 草稿态 When 选任一格式 Then 拒绝并提示先定稿；Given 已定稿 When 导出 html Then 单文件无外链、无脚本、含声明与证据；Given 字段值含 `<script>` When 导出 html/word Then 转义为文本不执行；Given 点击 PDF Then 打开打印预览且中文正常、提示另存为 PDF。

## 面板滚动（不无限增高）

需求方追加：「会议纪要不要无限增高高度，需要有 Y 滚动条」。口径是**面板内固定上限高度 + 区域内 Y 滚动**，而不是靠整页滚动去追内容。

| 区域 | 上限高度 | 滚动行为 | 说明 |
|---|---|---|---|
| 纪要草稿字段列表 `.mm-scroll-body` | `min(56vh, 540px)` | `overflow-y: auto` | 字段再多也不把整页顶长 |
| 纪要草稿外框 `.mm-scroll` | `min(58vh, 560px)` | `overflow-y: auto` | 兜底，防嵌套内容溢出 |
| 转写稿 `.mm-ev-table` | `min(46vh, 380px)` | `overflow-y: auto` | 逐句证据列表 |
| 稿件全文 `.mm-article` | `min(56vh, 520px)` | `overflow: auto` | 双向，防宽表格撑破 |
| 稿件侧栏 `.mm-article-side` | `min(56vh, 520px)` | `overflow-y: auto` | 来源 / 证据统计 |
| `max-width: 1100px` | 以上统一 `62vh` | 同左 | 窄屏按视口比例放宽 |

关键约定：**「编辑与定稿」区（`.mm-store` + 定稿按钮）必须留在滚动区之外**，保证字段列表怎么滚，定稿入口始终可见可点。滚动容器额外加 `overscroll-behavior: contain`（滚到底不带动外层）与 `scrollbar-gutter: stable`（出现滚动条时布局不跳）。

滚动条跟随主题：`scrollbar-width: thin` + `scrollbar-color: var(--mm-border-strong) transparent`，并补 `::-webkit-scrollbar-thumb/track`，浅色/深色下都不出现系统默认亮色滚动条。用 `vh` 而非固定 px，是为了在 1080p 与笔记本小屏下都不占满首屏。

冒烟 `layout-scroll` 组 5 项断言锁定该行为：字段列表被滚动容器包裹、容器同时具备 `max-height` 与 `overflow-y: auto`、滚动条走主题变量、定稿区在滚动区之外、稿件与转写稿同样有上限。

## 实时工作台版式（项目 / 主题 → 实时记录 → AI 分析 → 会议总结）

默认视图（不带 `?debug=1`）按参考界面重排为四段，是一屏能讲清楚的**实际使用**版式：

| 段 | 内容 | 关键点 |
|---|---|---|
| ① 项目 / 主题 | 项目下拉 + 主题输入 + 会议类型 + 状态灯与实时时钟 | `liveClock` 在录音中显示真实采集时长，否则回落演示推流计时 |
| ② 实时记录 | 示例会议选择、开始 / 暂停 / 结束并生成总结、`N/M 句` 进度条、**真实录音条**、人工记录入口 | 人工记录按 `kind` 分类打标，页面显式声明「不参与 AI 抽取」 |
| ③ AI 分析 | 逐项字段抽取结果 + 证据引用 + 来源态标注 | 抽取值与人工修订值分列，不覆盖 AI 原值 |
| ④ 会议总结 | `mm-live-summary-side`：生成 / 合成稿件 / 复制 / 确认定稿 / 保存 / 载入 + 逐项确认修订折叠区 + **导出区** | 导出 3 内容范围 × 4 格式常驻于此，不依赖 debug |

视图分层：默认只显示实际使用的工作台；`?debug=1` 才展开开发视图（状态条 / runbar / 契约 JSON / 审计 / 指纹 / 云就绪度），共 **11 个可整块剥离的 `v-(if|else-if)="debugMode"` 子树**。判断口径是 `debugMode = computed(() => route.query.debug === '1')`。

## 真实录音（本地麦克风 · 真实数据 · 默认本机推理转写）

需求方追加：「检查现在是否可以录制，要真实数据记录」。此前真实录音只在 `?debug=1` 的「现场录音」区块里（`beginCapture` / `endCapture`），**默认工作台没有入口**——默认工作台只有对示例转写稿的逐句推流演示，看着像能录、实际不能。本轮把它搬进默认工作台并接真实采集链路。

**链路**：`navigator.mediaDevices.getUserMedia({audio})` 多轨（一人一麦）→ 各轨 `AudioContext.createScriptProcessor(4096, 1, 1)` → 0 增益节点（防啸叫）→ `stopMultiTrackCapture` 收 `chunks` → 归一化为 16k mono + VAD 分段 → `{ mixed, wav, segments, durationMs, sourceRate, trackStats }`。逐句文字**默认由本机 WebGPU 推理产出**（音频不出本机）；服务端云端转写为**可选引擎**（用户主动切换才走），服务端失败时可按白名单自动降级回本机（见下节）。

| 界面元素 | 数据来源 | 是否真实 |
|---|---|---|
| 录音时长 `recClock` | `recElapsedMs`（`recStartedAt` 起算的真实墙钟） | ✅ 真实 |
| 电平条 + 百分比 | `startCapture({ onLevel })` 回调的实时峰值 | ✅ 真实 |
| 真实时长 / `sourceRate` / WAV 体积 / 语音段数 | `recResult`（`normalizeAudio` 返回值） | ✅ 真实 |
| 「保存音频 WAV」 | `URL.createObjectURL(new Blob([result.wav], {type:'audio/wav'}))` | ✅ 真实可下载 |
| 逐句文字 | 默认：本机 WebGPU 推理（Whisper 权重按需下载，音频不出本机）；可选：服务端云端转写（录音按 ~30s 切段 → 封 16k mono WAV → `POST /api/meeting-asr/transcribe`） | ✅ 真实（本机无需密钥；服务端需后端配好密钥） |

**诚实边界（页面已明示，不得暗示）**：录音与 WAV 留档在**本机**，**逐句转写默认也在本机完成**——音频不出本机，模型权重（默认 Base ≈138MB）首次按需下载。页面默认文案为「逐句文字由**本机推理**产出：音频不出本机，权重首次按需下载」。**已实测跑通的范围仅限 WebGPU 后端 + Chrome 内核**（详见下节实测证据），**不得宣称「所有浏览器都能本机转写」**。

**服务端例外（可选引擎 / 失败降级，口径必须成对出现）**：上面这句只描述**默认本机路径**。当用户主动把引擎切到「服务端」，或服务端路径失败被白名单降级回本机时，页面必须换口径：

- 切到服务端后，`.mm-live-note` 里追加 `<b v-if="!isLocalAsr">本次已切到服务端转写：音频会离开本机，按段上传到 backend-node。</b>`；
- 服务端链路失败会按白名单自动降级回本机（`asrFallbackReason` 非空 → 显示降级横条「服务端转写不可用，已自动降级到**本机推理**…原因：…」）；`BAD_AUDIO` / `AUDIO_TOO_LARGE` / `TRANSPORT_MISSING` / `unknown` 不降级，如实报错；
- 「实时记录」标签同步翻转：`本机推理 · 音频不出本机` ↔ `服务端转写 · 音频按段上传`（两个都只在本轮真实录音 `isRealLive` 时出现）。

> 默认（本机）路径下页面**正面声明「音频不出本机」**；服务端是**例外分支**，不得把服务端口径写成默认。旧口径「音频按段上传后端」的断言已改为**服务端分支**断言。

同一条边界还写死三件事：**只依据「设备轨」归属说话人**（不做声纹分离，行内「说话人未区分」）、**逐句置信度上游不返回故显示「—」**（不编造）、**转写失败/无语音如实显示 0 句 + 错误分类**（绝不回落示例转写稿）。**仅当切到服务端分支时**才会上传音频本身、且不含任何声纹特征；后端用 multer 内存态接收（`FileInterceptor` 未配 storage），**不落盘音频**，只在内存里转发一次。默认本机分支无任何网络上传。

**防泄漏 / 状态一致性处理**：

- `beginLive()` 改为**返回布尔**（`true` 已启动 / `false` 被取消或状态不允许）。`startRealRecording()` 先 `await startCapture()` 拿到真实流，再调 `beginLive()`；若返回 `false`（用户在「重开确认」里点了取消）则 `resetRealRecording()` **回滚已打开的麦克风**，不留半截录音。
- `resetRealRecording()`：`revokeObjectURL` 释放 blob URL、停采集、复位 `recState → idle`；`onBeforeUnmount` 一并调用 `stopRecClock()` / 停 `recHandle` / `releaseRecWav()`，离开页面不会留着麦克风。
- `resetLiveStream()` 里**录音进行中不把 `recElapsedMs` 归零**（否则真实时钟会被推流重置逻辑清掉）。
- 不支持时落 `recState = 'unsupported'` 并提示需要 HTTPS 或 localhost；采集/归一化异常落 `recState = 'error'` 且 `recError` 有可见出口。

冒烟 `real-recording` 组 56 项断言锁定（Task #39 后已随架构反转重写，本机默认后再度反转）：录音条在默认工作台且**不在** debug 分支、真调 `isMultiTrackSupported` / `startMultiTrackCapture` / `stopMultiTrackCapture`、时长与采样率与 WAV 体积与段数都取自采集结果、blob 与句柄有回收、**录音逻辑段无 `fetch` / `XMLHttpRequest` / 云 URL**、取消时 `if (!beginLive({ mode: 'mic' }))` 回滚、**转写段不裸写上传原语**（上传走注入的 `transport`）、适配器如实声明本机默认 `uploaded=false / remote=false / diarization=false` 与服务端可选分支 `uploaded=true / remote=true`、逐句 `speakerDiarized=false` 且 `confidence=null`（不编造）、失败分类覆盖全部错误码、不出现「录音已转写 / 自动转写」、**默认声明「本机推理 · 音频不出本机」**、**服务端分支声明「服务端转写 · 音频按段上传」「由后端调用云端 ASR」**、**旧默认口径「服务端转写：音频按段上传后端」已列为负向断言**。

> 锚点提醒：`mock-smoke.mjs` 用 `index.vue` 的**段头注释**（`// ---- …`）切分区域。本轮段头已由「`// ---- 服务端云端转写`」改名为「`// ---- 转写引擎：默认本机推理`」，两处段尾锚点必须同步跟改，否则 `indexOf` 返回 `-1`、切片为空、该组直接 FAIL。改段头注释时请一并检查。

## 本机推理转写（local-asr · 默认引擎 · WebGPU）

需求方口径（本轮追加）：「不走真实百炼密钥 走前端实现功能」——不再依赖后端百炼密钥打通服务端链路，把「真实录音 → 转文字」实现为**纯前端本机推理**可用，**没有后端密钥也能真出字**。Task #39 曾把转写放在服务端（前端只按段切音频并上传），本轮**反转回来**：本机推理为**默认引擎**，服务端降为**可选引擎**。

**只走 WebGPU，不回落 wasm**（`local-asr.js`）：`load()` 先 `probeComputeDevice()` 三步探测（`navigator.gpu` 存在 → `isSecureContext` → `requestAdapter()` 拿到适配器），拿不到就**当场如实拒绝**，不静默换后端。

**dtype 配方（运行时自动选）**：支持 `shader-f16` → `{encoder_model:'fp16', decoder_model_merged:'fp16'}`；不支持 → `{encoder_model:'fp32', decoder_model_merged:'q4'}`。

**模型档位**（`LOCAL_ASR_MODELS`，体积为 hf-mirror 真实 Content-Length，2026-11-06）：

| id | 标签 | 体积（encoder / 全套） | 备注 |
|---|---|---|---|
| `Xenova/whisper-tiny` | 最快 | 71MB / 113MB | 中文错字明显 · 只适合通路验证或弱网 |
| `Xenova/whisper-base` | **默认** | 138MB / 195MB | 中文日常会议可用 · 首次下载最慢的一步 |
| `Xenova/whisper-small` | 更准 | 462MB / 558MB | 中文最准 · 下载与耗时都明显更高 |

`LOCAL_ASR_DEFAULT_MODEL = 'Xenova/whisper-base'`（**显式写死，不取数组第 0 项**——第 0 项是「最快」而非「默认」）。

**实测证据（2026-11-06，puppeteer 无头 `--enable-unsafe-webgpu --use-angle=swiftshader` + 自托管 wasm 200/200）**：

- tiny：`device=webgpu` / `dtype={fp32,q4}` / `fallback=false`；load 27s、12.27s 中文音频 transcribe 46s、返回 4 段带时间戳文字（结构全对、错字明显）。
- base：`device=webgpu` / `dtype={fp32,q4}`；load 首跑 47s（缓存后 3s）、transcribe 87~91s、4 段（错字仍明显：「讨论」→「调论」、「项目进度」→「向路进度」、「风险应对」→「关闲议罪」）。

> ⚠️ 实测跑在**软渲染 SwiftShader** 上（`shader-f16=false` → 只能走 fp32+q4），错字明显是这一步的代价；**真机独显走 fp16 应显著更好，但未验证**。跑通范围仅限 **WebGPU 后端 + Chrome 内核**，**不得宣称「所有浏览器都能本机转写」**；生产域若为 HTTP（非 HTTPS / 非 localhost），`isSecureContext=false` → WebGPU 不可用 → 本机转写不可用，须如实提示。

**wall3 的真相（本轮实测推翻旧结论，详见 `loop-state.json` 的 `ORT_SELF_HOST.wall3` / `runtimeEvidence` / `honest`）**：`ort-wasm-simd-threaded.asyncify.wasm` 依赖 `SharedArrayBuffer`；本页无跨域隔离（`crossOriginIsolated=false`、`SharedArrayBuffer=undefined`、12 核）时 ORT **不退回单线程**，而是死等 pthread 池并**同步占死主线程**（连超时报错都跑不出）。**关键事实：wall3 只在 wasm 后端存在——WebGPU 后端不依赖 SAB，完全跑通。** 因此「换单线程 wasm」（该版本 dist 无单线程产物）与「必须加 COOP+COEP」（那是给 wasm 后端用的）两个旧备选均作废，**本轮未动任何响应头**。

## 服务端云端转写（meeting-asr · 可选引擎）

本节只描述**可选引擎**——用户在「转写引擎」处主动切到「服务端」时才走。此前 Task #39 的口径是「云端模型权重不适合浏览器端上生产 + 会议录音已获准离开浏览器，故把转写放服务端」；本轮反转后服务端**不再是默认**：前端默认只做本机推理，只有切到服务端时才按段切音频并上传。保留服务端的理由只剩「有密钥时可主动走云端、精度与耗时另有一条路」，且服务端链路失败仍可按白名单**降级回本机**。

**通道**（`frontend/src/api/meeting-asr.ts` ↔ `backend-node/src/meeting-asr/`）：

| 方法 | 端点 | 说明 |
|---|---|---|
| GET | `/api/meeting-asr/status` | 就绪度（是否已配密钥）；响应为 `configured / baseURL / model / providerKind / language / timeoutMs / maxBytes / keySource / granularity / configFile`，**绝不含 apiKey** |
| POST | `/api/meeting-asr/transcribe` | multipart，字段名 `file`（16k mono WAV），可选 `language`；单次上限 10MB |

**响应契约**：成功经 `ResponseEnvelopeInterceptor` 包一层，业务体在 **`data`**；失败经 `HttpExceptionFilter` 包一层，业务码在 **`detail.code`**。`upstream`（上游原文截断 500 字）虽在 service 层产生，但 controller 的 `toHttpException` 只透传 `{ code, message }`、全局 filter 白名单也不含它，**所以前端恒收不到上游原文** —— 任何「看 upstream 片段」的提示文案都是不实的，失败提示统一引导去看后端日志。

**错误码单一事实源**：`frontend/src/api/meeting-asr-codes.js`（纯 `.js`、无 `@/` 别名、无依赖）供 `meeting-asr.ts`、`mock/server-asr.js` 与 Node 冒烟脚本共用。**改码必须同步三处**：本文件 ↔ 后端 `meeting-asr.service.ts` 的 `MEETING_ASR_ERROR_CODES` ↔ `mock/server-asr.js` 的 `SERVER_ASR_FAILURES` 文案表（冒烟已断言「全部码都有文案」）。

**命名与优先级**（两侧都不硬编码）：

- 密钥解析顺序 `MEETING_ASR_API_KEY` → `DASHSCOPE_API_KEY` → `data/meeting-asr-config.json` → 内置默认；`/status` 用 `keySource`（`env` / `file` / `none`）如实上报来源。
- 语种优先级 `opts.language || cfg.language || ''`。**页面刻意传空串**：原 `'chinese'` 是 Whisper 档位写法（百炼要 `zh` 这类码），硬传会盖掉服务端配置并把识别带偏。

**适配器同构**（`mock/server-asr.js` ↔ `mock/local-asr.js`）：两者对外契约一致（`createXxx({ model, onPhase, onProgress })` → `{ phase, progress, load(), transcribe(), toUtterances(), describe() }`），因此页面的增量转写框架（按窗切片 / 重叠去重 / 时间游标 `asrCommittedEndMs` / 失败分类 / 设备轨覆写）整条复用，只换引擎实例。页面按当前引擎二选一调用 `createLocalAsr(...)`（默认）或 `createServerAsr(...)`（可选）；共享件 `ASR_PHASES` / `describeSpeaker` / `describeAsrNoAudio` 从 `local-asr.js` 取。`server-asr.js` 是**纯模块**（不 import `@/`、不 import `.ts`），`transport`（上传）与 `probeStatus`（就绪度探测）由页面注入，以便 Node 冒烟直接 import 做断言。

**水印级铁律 —— 时间量纲**：16k 采样率下 `samples / 16 = 毫秒`（`SAMPLES_PER_MS = 16`）。`pcm.length / SAMPLES_PER_MS` **已经是毫秒**，再乘 1000 就把 1 秒放大成 1000 秒。本处踩过两次（`baseMs` / `sliceMs` 一次，`durationMs` 一次），改动切片逻辑时请连带自查这三处。

**能力边界（不得放宽）**：上游 Qwen3-ASR-Flash 的 OpenAI 兼容模式**不返回时间戳**，所以只有**段级真实边界**（本段确实从 `offsetMs` 开始、时长 `sliceMs`），页面如实标「段级」，不伪造成句级；也**不返回逐句置信度** → `confidence: null` → 页面显示「—」。

**已知未验部分**：`DASHSCOPE_API_KEY` 未提供时接口**能编译、未做真机转写验证**；缺密钥时后端如实返回 `503 + asr_config_missing`，页面如实提示去配密钥，**不降级成示例稿**。**注意：缺密钥不再阻塞默认路径**——默认走本机推理，此密钥只影响「切到服务端」这一可选分支。

## 编译期核验（SFC）

`vue/compiler-sfc` 是 `vue` 包内置导出（本项目**未**单独安装 `@vue/compiler-sfc`，用后者会 `ERR_MODULE_NOT_FOUND`）。脚本固定在 `.dev-loop/sfc-check.mjs`：

```bash
cd frontend && node .dev-loop/sfc-check.mjs
# script bindings: 243 / template errors: 0 / style blocks: 1
# _ctx.* 命中: 0 / 模板引用新增符号: 10/13 / script 未定义: 无
```

原理：`parse` → `compileScript(descriptor, { id })` → `compileTemplate({ source, compilerOptions: { bindingMetadata: script.bindings } })`。产物里若仍有 `_ctx.*` 命中，说明模板引用了没绑定到 `script setup` 的符号；本次为 **0**，且新增 13 个符号在 script 中全部有定义（10 个被模板直接引用）。

> 脚本必须放在**项目内**：ESM 按文件位置解析依赖，放到 `/tmp` 下会找不到项目 `node_modules/vue`。

## 默认视图 / 入口 复核口径（双构建 + 剥离法）

⚠️ 本页**已上生产**，旧的「production 产物不含页面」判定法**已作废**（用它复核会永远得到「结论相反」的假象）。现行两条 gate：

### ① `defaultView` — 默认视图无开发态残留（剥离法）

对 `src/views/meeting/index.vue` 的 `<template>` 做**子树剥离**：按标签配对把每个 `v-(if|else-if)="debugMode"` 元素连同其内容整块删掉（`v-else` 分支属默认视图，保留），再扫残留文本。实测剥掉 **11 块**（`span,div,section,section,label,button,button,template,template,main,footer`）。断言：剥离块数 ≥ 8 且残留里再无 `debugMode` 属性（防止断言空转）、开发态标记白名单命中 0、标题走生产口径、录音条与导出区仍在。

> 边界：不能再拿「production 产物有没有页面」来证明「默认视图无开发态内容」——页面本来就在生产产物里。必须走剥离法。

### ② `build` — 双构建 + 产物含页面（干净目录 + 内容特征）

```bash
cd frontend
./node_modules/.bin/vite build --mode production  --outDir dist-prod-check
./node_modules/.bin/vite build --mode development --outDir dist-dev-check
```

**必须用干净输出目录 + 内容特征判定**，两个坑：

1. **不能按文件名 grep `meeting`**：路由是异步 chunk，产物文件名是 `index-<hash>.js`，不含 `meeting` 字样，按文件名判定会假阴性。
2. **不能用 `--emptyOutDir false` 的 `dist/` 复核**：`dist/` 是混合态，可能残留历史构建的 chunk，造成假阳性 / 假阴性。

判定特征字符串：`mm-live-rec-bar` / `需求会议智能纪要` / `MeetingDev`。注意本项目产物目录是 **`static/{js,css}`**，不是 `assets/`。

实测（本轮）：

| 构建 | 耗时 | `mm-live-rec-bar` | `需求会议智能纪要` | `MeetingDev` |
|---|---|---|---|---|
| production（`--outDir dist-prod-check`） | 28.78s | 命中 | 命中 | 命中 |
| development（`--outDir dist-dev-check`） | 33.08s | 命中 | 命中 | 命中 |

**两列都命中** = 页面在两种模式下都进产物 ⇒ 环境门控确实已移除（旧口径下 production 列应全 0）。

## 生产态待办（gate 5/5 通过 ≠ 任务闭环）

`advance` 被 `ttr-loop.mjs` 的 Blocker 守卫强制拒绝，`loop-state.json` 里 T-030 仍为 `PARTIAL_BLOCKER`。下列依赖未就绪前**不得宣称「服务端转写 / 合成 / 后端链路已接通」**（本机转写已实测跑通、可如实宣称，但不得顺带宣称服务端也通了）：

| 依赖 | 缺口 | 就绪后要做的 |
|---|---|---|
| **D-01 云 ASR 密钥** | `DASHSCOPE_API_KEY`（或 `MEETING_ASR_API_KEY` / `data/meeting-asr-config.json`）未配 | **不再阻塞默认路径**（默认走本机推理）；仅当切到服务端引擎时接口会如实返回 `asr_config_missing`，配好后才能真跑服务端转写 |
| **T-013 后端上传接口** | 已实现 `POST /api/meeting-asr/transcribe`（内存态、10MB 上限、音频不落盘） | 前端已接，需真实音频 + 密钥端到端联调 |
| **SEC-05 委托处理协议** | 法务确认未完成 | 采前告知同意门禁已从页面下线（`consentPanelRemoved`），仅在 debug 契约视图保留自检 |

## 边界

本目录与 dev 页面**不含任何部署动作**。构建验证、SFC 编译、冒烟断言可做；**重启服务（:2610 / :13030）、同步产物、生产发布、`git commit / push` 一律需你明确确认后再执行**。真发布走 `npm run build`（会清 dist），`build:safe` 只用于本地验证（`--emptyOutDir false`，产出的 `dist/` 是混合态，不可直接上线）。
