# mvgo（感智晓界）速查（详史见同目录 2026-*.md）

## 环境/构建/部署
- 根 `/Users/smigoo/工作/mvgo`；子仓 backend-node/frontend/docs；Node 13030 / Java 8080 / 前端 2610。
- Bash 跑构建/常驻服务必 `env -i PATH=".../22.22.2-3/bin:/usr/local/bin:/usr/bin:/bin" HOME=/Users/smigoo`（清 NODE_OPTIONS shim+代理）；jest 加 `NODE_OPTIONS=--max-old-space-size=1536 --runInBand --forceExit`；curl `--noproxy '*'`；多关键词 grep 必 `-E`。
- 构建 `rm -f tsconfig.build.tsbuildinfo && npm run build`；启动 `node start-node.js`（项目根）；日志 `backend-node/server.log`，重启前必看尾部活动。
- 勿设 FIELD_ENCRYPTION_KEY；AI 凭证 `data/ai-config.json`；勿加 package.json type:module；新增路由三处同步。
- 预览取源：`last-good > candidate > partial > workspace`。workspace 事实源 = `backend-node/workspace`。

## 核心原则
**同一概念只允许一处实现 + 全链路接入 + 落盘闸门收口。** 门禁误报先问：事实源唯一吗？采集是否被表达式/注释/别名/编译产物污染？
**删减法**：视觉确定性事实从 LLM 剥离，生成时装配，每接管一件事就删对应纠偏器。门禁总数只能降。
**禁止改单个产物**（`frontend/workspace` / `temp-components` 打 CSS 补丁）。

事实源：`class-facts`/`classname-contract`/`class-dialect-normalizer`/`less-selector-stack`/`collectDeclaredBindings`/`file-collection`/`resolveComponentDirStrict`/`rootLayoutFacts`/`state.productFiles`/`section-tree`/`inline-row-assembler`/`buildSectionLayoutFacts`。

## 复现/验收
- 复现：`POST /api/phase2/generate?reuseCache:true` + `GET /api/tasks/status/<sid>`（字段 `data.task.status`；`data.task.progress` 是日志数组）。
- 改后处理规则前先确认走哪条 Vision 链路（全新 / vision-cache / `_uiCache`；reuseCache 走③，cache 是加工后结构）。
- jest 基线 = `17 suite 加载失败（import.meta）+ 4 例断言红灯`，改动后须逐字同名同数。
- `BLOCK=0` ≠ 视觉正确。构建后 `node --check` 扫 `src/**/*.js`。

## 已治本（详见 2026-09-13/14/15.md）
- 刀 7~19：资源绑定、componentId、CODE-026/024、COMP-001、LESS var()/颜色函数、FLEX-003 目标元素、grid display、对象键引号、数据键类名化。
- 刀 20~23：图表 min-height 反杀、schema 双副本、悬空 import 闭包、幻觉 section（宽进严出 + 全语料误伤审计）、`.js` 裸反引号崩 dist、vision 缓存短路。
- 刀 24：success 资源不吐 fillsSummary + fillsSummary 补 g.opacity/方向。未竟：激活图 `owner-file-missing`+active 键正则；`formatFigmaStyleData` 仍丢填充级 opacity；`style-refiner`/`mountSubStateBackground` 硬编码 100%。
- 阶段 B：stat 配对 prompt 真机证伪 → 结构层 `healStatRowMemberPairing` 才归零。
- R4：aspect-ratio 误伤 / min-height 污染非图表容器已修（`82d5dab`）。
- 高度比例管线双 bug（c-device-monitor-44384241 实锤）：① `buildSectionHeightsMap`/`alignSectionClasses` 与 code-generator `resolvePlanSections` **不同源**（未 dedupe，冗余「设备网格」切片致叶子数 4≠3 → fail-open null → flex:1 平分）；② `fixSectionHeightsForResource` 正则只认三值 `flex:X Y Z`、漏单值 `flex:1`/双值 `flex:1 1`。均已治本 + 回归用例。

## 未竟（真机 09-15 再实锤）
- **R2 序 4 item 级契约仍待做**：批次 3 只补 section 根 CSS（缺则补 display/flex/grid），**不写 item 内部 DOM**。device-monitor 的 switch 两列、tabs 横向窄条、card 内部结构仍 LLM 自由生成 → 同批 bug 复发。
- R3：`ensureHeaderSlots` 延后。R5 阶段 C 待做。R7 视觉覆盖门禁待做。
- **R6 颜色 fills 提取部分解除**（09-15 深夜）：`utils/figma-color-truth.js` 已做 seriesColors 臆造色真值修正（collectFigmaChartColors + resolveSeriesColors），R6 剩余「图标资源逐节点提取」「图例精确配对（系列名→色块）」仍待做。
- **确定性 chart-builder（消除层）**：LLM 只声明 {sectionId,type,series,colors}，由确定性渲染器写 echarts，建好后删 `injectEchartsFallback`。与高度比例 dedupe 冲突：chart 叶子必须明确 flexGrow+排他 sourceNodeIds，否则 buildSectionHeightsMap fail-open。当前校验层已覆盖（do-not-invent 缺失方向 + 挂载点缺失 + seriesColors 真值）。
- header 叶子（type='header'）在 `#header-right` 插槽、不参与 slot-con flex，但其高度比例 flexGrow 仍会写进 header 根类 CSS（`flex:0.219 1 0`）——flex-basis:0 副作用，理想应排除 header 叶子 + `extractRootTemplate` 跳过内部具名插槽（改动较大，另开）。
- 复现样本：`c-device-monitor-228b63d5`（TabsSection 纵向+复制网格；`@color-text-base=#fff` 字看不见；自动修复 stub 给 label 灌 `display:flex`）。
- 复现样本：`c-traffic-monitor-cd7d0172`（seriesColors 臆造 #ff7875）+ `c-max-1789476464544-07e31fbb`（echarts 挂载点缺失，环形图消失）。
