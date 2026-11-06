# 三案根因分析（fe2b79ed tabs / 038b65ae 几何 / 5bf49590 双6+tab背景）

日期：2026-11-06 ｜ 状态：**分析完成，未实施**。三案根因均已落到代码行/真机数据。

## 案① fe2b79ed —「没有生成 tab 也没有交互」

### 数据面（vision 三通道完备）
- `interactions`：`{target:"标题右侧Tab切换栏", type:"tab-switch", defaultState:"江阴靖江长江隧道为激活态", evidence:"两个tab项，第一个有蓝色高亮背景"}`
- `headerSlots`：`{slotType:"header-right", content:"江阴靖江长江隧道 江阴大桥", figmaNodeId:"2:7954"}`
- 段内节点：`{id:"2:7955", type:"tab", role:"tab", text:"江阴靖江长江隧道"}` / `2:7957` 同构

### 根因（产物实锤，两层）
`package/index.vue`：
```html
<template #header-right>
  <!-- 由生成器按 Figma headerSlots 确定性补齐（模型漏生成兜底） -->
  <span ...>江阴靖江长江隧道 江阴大桥</span>
</template>
```
1. LLM **漏生成 HeaderSection**（components 里无此组件）；
2. **headerSlots 确定性补齐兜底器把含 tab-switch 的槽按纯文本拼接**——它只读
   `headerSlots.content` 字符串，**不消费 `interactions`**（tab-switch 数据在另一通道）。
   prompt-builder:319-336 虽有「type=tab-switch → 生成可切换标签」教学，但兜底器
   绕过了 LLM 路径，教学到不了它。

### 治本方案
- **主修**：headerSlots 兜底渲染器消费 interactions——槽位关联的 `tab-switch`
  存在时渲染真 tab 组件（v-for 两个 tab 项 + activeTab 状态 + click 切换 + 激活底图），
  不再拼纯文本。判据：`interactions.some(i => i.type==='tab-switch')` 且 target 指向
  该槽（header-right）；tab 项文本/激活态取 interactions.evidence + defaultState 真值。
- **辅修**：prompt 层补「header 槽含 tab-switch 时必须生成 HeaderSection」教学，
  减少漏生成概率（双通道归因同刀70：兜底计数归零=提示词生效）。
- 影响面：所有 headerSlots 兜底任务；旧行为（无 tab-switch 槽拼文本）逐字保留。
- 回归：阳性=fe2b79ed 形态夹具（2 tab+激活态）；阴性=普通文本槽不变化。

### 案① Loop 实施设计（2026-11-06，用户已授权实施）

#### 查重与真机数据收窄
- 续接本案；`2026-11-05-8deeb6c4-fg-list多余底色与tab交互治本方案.md` 管 folded-grid 接管段，
  与 T09 headerSlots 兜底是不同消费路径，不合并判据、不互相替代。
- 顶层 `headerSlots[0]` 是 `{elementType:'label',figmaNodeId:'2:7954',content:'江阴靖江长江隧道 江阴大桥'}`；
  但 `layoutStructure.layout.sections[0].headerSlots[0]` 是同 node 的 `elementType:'tab'` 结构契约。
- 同 section `body.children` 直接含 `2:7955(active:true)` / `2:7957(active:false)` 两个
  `type/role='tab'` 项及外观样式；因此不解析“（激活）/”、不用 defaultState 猜、不做文本相似度关联。
- 真实断点：`resource-mounter.js#ensureHeaderSlots` 的 pending 只存 content 字符串并统一包 `<span>`；
  prompt-builder 已有 tab-switch 教学，第一刀不改 prompt。

#### 统一修法
1. 新增 `utils/header-tab-slots.js` 纯函数单一事实源：
   - `resolveHeaderTabModels(input)` 复用 `figma-format#extractSections`，以 `figmaNodeId` 关联顶层槽与
     section 的 `elementType='tab'` 契约；要求存在 tab-switch、≥2 个有效 tab、id 唯一、文本非空、
     恰好一个 active 且非激活样式存在，否则弃权并分档计数。
   - 输出 `{nodeId,items,activeId,activeStyle,inactiveStyle}`；样式只取 color/backgroundColor/borderRadius/
     padding/fontSize/fontWeight 等外观，剔除 vision 的 width 等布局值。
   - `renderHeaderTabTemplate/Script` 由 nodeId 派生合法私有变量，输出 v-for + `@click` + ref 激活态；
     无数据绑定契约时只切换本地激活样式，不伪造 API、事件名或数据刷新。
2. `ensureHeaderSlots` 的 pending 从字符串升级为 `{kind:'text'|'tabs'}` 描述符；P1-3 重叠去重、
   C-2 越界过滤和非空 slot 跳过仍先执行。普通文本走旧 `<span>`，命中模型的槽才生成 tabs。
3. script setup 合并 `ref` 到既有 vue import（已有则复用），注入模型和样式函数；JSON 防 `</script>`
   闭合，注入后 `validateVueSfc`，失败回退原始 code，不把兜底器变成坏 SFC 来源。
4. 新增 `🛡️ T09 头部Tab结构升级 {evaluated,resolved,upgraded,skippedNoStructure,skippedAmbiguous,failed}`；
   真机阳性 upgraded>0，未命中结构时 upgraded=0 可区分「无 tab」与「判据失效」。

#### 影响面 / 回滚
- A：只改 microcode T09 既有出口，不新增 pass、不改 W7 顺序、不碰 folded-grid、resource mount、
  V6/V8/W4；vue3 仍按既有 componentType 早退。多 tab 组按 nodeId 独立生成，无共享可变模块状态。
- B：普通文本 slot、资源型 slot 拦截、P1-3/P5 去重及既有非空 slot 行为保持；无 interaction/结构不全/
  激活歧义一律旧行为。无真实业务 binding 时不生成假交互副作用。
- C：不直改 fe2b79ed 产物、不改 LLM prompt、不引入 antd 组件或新运行时依赖。
- 回滚：删除新纯函数模块及 T09 描述符分支即恢复纯文本兜底；无数据迁移。
- 回归：真实形态阳性、普通文本/无 interaction/结构缺失/激活歧义/已有 ref/幂等/vue3 阴性；
  resource-mounter 与 P5 全族、全量同树 FAIL 差集、Nest build。真机验收仍需部署后重投并点击第二 tab。

### 案① Loop 实施与验证记录（已完成，未部署）
- **新增**：`utils/header-tab-slots.js` 单一事实源（模型解析、外观白名单、模板与 script 渲染）；
  `resource-mounter.js#ensureHeaderSlots` pending 改 text/tabs 描述符，合并 ref、SFC 校验失败回退。
- **Loop 1**：专项首轮 2 套件 136/136 绿。真实任务回放却得 `resolved=1,upgraded=0`——旧产物已有
  T09 纯文本，被「非空 slot 跳过」挡住。补第二判据：仅允许结构 tabs 替换**带 T09 自有标记**的旧兜底，
  LLM/自定义非空 slot 仍跳过；新增防覆盖用例后 137/137 绿。
- **真实回放**：使用 `tasks.json.prev` 中 fe2b79ed 的 `_visualParserCache` 和真实 index.vue，
  dist 输出 `changed=true / upgraded=1`，含 `v-for + @click + ref('2:7955')`，旧合并文本 span 消失、
  vue import 仅一条；结果写 `/tmp/fe2b79ed-header-tabs-replay.vue`（未直改原产物）。
- **回归**：T09/装配族 4 套件通过；0908 的 4 个 `tryRequire=object` 与 0907-l6 的 2 个资源过滤失败
  为基线既有，不冒充本刀修复。全量当前 20 套件/49 用例失败、6297 通过；保留 T4 的同树基线
  23/62、6253 通过，FAIL 归一差集 **current-only=0**；baseline-only 3 当前转绿。
- **构建**：Nest build 成功，dist 真实回放证明不是只过夹具。真机验收仍需部署后重投 fe2b79ed，
  点击第二 tab 检查激活样式互换；当前只切换本地激活态，不伪造数据刷新。
- **范围**：未改 prompt、未新增 pass、未碰 folded-grid/V6/V8/W4，未 commit、未重启、未部署。

## 案② 038b65ae —「list 高度失效，背景/padding/margin 消失」

### 根因（真机数据）
- `sec.items`（E1 顶层几何轨）= **不存在**（段 keys 仅 id/name/role/body/footer/styles/geometryPx）；
- `body.items`（vision 富卡轨）**无任何 box**（keys: id/name/layout/repeatedFill/icon/content/value/styles）；
- fg-list 接管的 gaps/cardH 依赖 **E1 卡盒 absoluteBoundingBox**（detectListLeaf
  刀21d 注释：「几何轨仍用顶层 items，E1 卡盒真值」）——本任务该轨缺失 ⇒
  `FG_LIST_GAPS=null`、无 `cardH`、无 item 几何 ⇒ 行高塌、间距零、背景裸排。

### 治本方案
- fg-list 几何兜底：items[i].id（如 48:5798）在 **figmaRoot 按 id 回查
  absoluteBoundingBox**——复用 `geoBoxWithRoot`/`findFigmaNodeById` 的单一兜底来源
  （与 collapser 排序/形状判定同一思路），补齐每卡 box ⇒ gaps/cardH 可算；
- 无 figmaRoot 或节点查不到 ⇒ 维持 null 不写（缺事实不兜底）；
- 影响面：所有 vision 富卡无 box 任务；有 E1 box 的旧路径逐字不动。
- 回归：阳性=038b65ae 形态（items 无 box、figmaRoot 有）⇒ GAPS/cardH 非 null；
  阴性=有 E1 box 路径零漂移、查不到节点维持 null。

## 案③ 5bf49590 —「两个6」+「tab 激活背景没撑开+多边」

### 3a 双6 = 同一角标被两段各渲染一次（Figma 物理实锤）
- `89:43`（图标切换区）：x=1816,y=905,52×24，内含 icon-badge=6；
- `2:7949`（ChartSection 红块 #f53f3f）：x=1861,y=898,**14×14**——恰在图标区右上缘
  = **角标物理位置**。vision 把角标独立成段（ChartSection），宿主段内又渲染 badge ⇒ 双6。
- 修复域：**段归属去重**——角标尺寸（<24px）+ 位置在宿主段 bbox 内/缘上 ⇒
  并入宿主段（icon badge），不独立成段。判据=几何（面积<阈值+bbox 包含/重叠率），
  命名无关。
- 回归：阳性=本形态只留一个 6；阴性=独立告警计数块（不在任何宿主 bbox 内）保留。

### 3b tab 激活背景 = parentBox 与 DOM 挂载容器不一致（**T4 口径的回归风险，需立即记录**）
- `bg-tab-active-7891.png`=79×22（激活胶囊）；`bg-7890.png`=295×27（整条 tab 背景，
  挂 tabs-section `100% 100%` ✓ 正确）；
- 产物激活 tab 项：`backgroundSize:'26.44% 77.78%'` = 79/299 × 22/28.3——**parentBox
  是整条（299px）**，但 DOM 绑定在**单个 tab 项**（宽 ~60-90px，由文本撑开）上 ⇒
  26.44% × 60px ≈ 16px 实际渲染宽 ⇒「背景缩成一小块、没撑开」。
- **刀70 T4 的百分比口径前提是「parentBox 即 DOM 挂载容器」**——本任务 mapping 的
  parentBox（整条）≠ DOM 容器（tab 项）⇒ T4 把不一致忠实放大。px 旧口径下
  `79px 22px` 在 tab 项上虽溢出但视觉「撑开」——**这是 T4 引入的回归面，必须修**。
- 修复方案（A/B 择一，建议 A 先行）：
  - **A（口径防御）**：inferBackgroundStyle 系列对「mapping.parentBox 与 DOM 挂载容器
    尺寸不一致」的场景**回落 px**（无法证明一致时不臆造百分比）——需要 mapping 侧
    补充 DOM 容器尺寸证据；无证据 ⇒ px（保守，恢复旧行为）。
  - **B（锚点根修）**：resource-mounter 把激活底图锚到**单个 tab 项容器**而非整条
    （parentBox 修正为 tab 项 bbox）——治本但动锚点层，影响面大。
- 「多了不应该有的边框」：common.less 中无 `.c-env-monitor-tab` 规则（已 grep 核实），
  边框来源待查（疑似 elementStyleMap/主题变量或 LLM 在 .vue style 块内写 border）——
  实施时补查，不阻塞 3a/3b。

## 实施顺序建议
1. **3b-A（T4 口径防御）**——当前线上 T4 回归面，优先级最高；
2. 案①（tabs 兜底消费 interactions）——用户可感知功能缺失；
3. 案②（fg-list 几何兜底）+ 3a（角标归属去重）。

---

## 3b-A 实施前复核与方案收窄（2026-11-06）

### 查重结论
- 续接本文既有 3b-A 与《刀70》T4 单一事实源，不新建第二套背景判据、不新增写盘 pass。
- `background-size-inference.js` 近期历史均为同一背景语义链（scaleMode / D2 / F3′）；本次修的是 T4 新增的百分比换算前提，不改 scaleMode、repeat、cover 判据。
- 回滚基线：backend-node HEAD `16de09e817b093c9e7663ebb17ac8c1800947f1a`；刀70 尚未提交，回滚时只撤销本次 3b-A hunk，不用 `git show HEAD:` 覆盖工作区。

### 真机证据补齐
- `tasks.json.prev[16]`：任务 `mc-max-1793908210246-5bf49590`，资源 `bg-tab-active-7891.png` 的 mapping 明确为
  `bgRole:'sub-state'`、`mountTarget:'tabs-list'`、`figmaBox=78×21@(1500,906)`、
  `parentBox=295×27@(1495,903)`。
- 真实产物 `package/components/TabsSection.vue:4-10`：背景绑定在 `v-for="tab in tabs"` 的单个
  `.c-env-monitor-tab`，且 `:class` 含 active 条件；第 10 行实收 `backgroundSize:'26.44% 77.78%'`。
  ⇒ 「Figma 父容器」与「DOM 状态子项」不一致不是推测，而是产物与 mapping 的对账事实。
- 同文件第 64 行另证实边框来自 LLM 的 `.c-env-monitor-tab--active { border:1px solid #fff }`，
  不归本刀；本刀只修背景四件套，不顺手改边框。

### 关键设计收窄：不新增 DOM 尺寸通道
初稿「无 DOM 容器尺寸证据 ⇒ 全部 px」不可实施：现有 mapping 普遍没有 DOM 测量值，若照做会把普通容器
背景也全部退回 px，等于误撤 T4。代码已存在更可靠的结构证据：
- `resource-mounter.js#mountSubStateBackground` 只把 `bgRole='sub-state'` 绑到带 active 条件的元素；
- `resource-mapping-formatter.js` 对 sub-state 的契约也是「容器内某个子项的状态背景」；
- 因而 **sub-state + 局部几何** 已足够证明不能把 `figmaBox/parentBox` 直接当 DOM 百分比口径。
  普通 container/未标角色路径没有这项反证，继续保留百分比。

### 统一修法
- 在 `background-size-inference.js#percentSizeFrom` 单一换算出口增加结构判据：
  `mapping.bgRole === 'sub-state'` 且原本满足局部百分比条件时，返回 null 并记录
  `backgroundPercentFallback='sub-state-mount-container'`，调用方沿用既有 px 回落。
- `inferBackgroundSize`、`sizingFromScaleMode`、`areaBackgroundSizing` 三入口复用同一换算函数，
  消除三处手写百分比公式；position 因 size 已为 px 自动走既有真实像素偏移，不另写分支。
- `inferBackgroundStyle` 返回 `percentFallback` 供观测；`mountSubStateBackground` 打
  `🛡️ T4 状态背景口径评估 { evaluated:1, percentFallbackSubState:0|1 }`，阳性必须非零。
- 本例预期由 `26.44% 77.78% @ 2.30% 50.01%` 回到 `78px 21px @ 5px 3px`；
  普通局部容器（无 sub-state）仍保持刀70 百分比，满铺/scaleMode/cov=0 行为不变。

### 影响面与风险清单
- **A（共享判据）**：三个背景推断入口共用 percentSizeFrom；直接调用方已核对 microcode 两处、
  microcode-engineer、vue3-engineer、visual-parser、folded-grid takeover、post-process。
  仅 sub-state 局部背景行为改变，普通容器百分比不变。
- **B（观测与兼容性）**：新增返回字段是可选字段，不改既有 size/position/repeat 结构；
  mapping 冻结时不得写回，回退行为仍须生效；无真值仍走原兜底，不臆造。
- **C（范围外）**：不碰锚点提升、bgRole 分类、repeat/cover、段规划、active 边框与 tab 布局；
  不新增守卫、不改 pass 顺序、不碰 V6/V8/W4，无 microcode/Vue3 双端口径分叉。
- 回滚：撤 `percentSizeFrom` 的 sub-state 分支及三入口接线即恢复原 T4；无需数据迁移。

### 回归与验收
- 阳性：5bf49590 同构 mapping 在三入口都回落 px；挂载器真实模板断言不再出现 26.44%，日志命中 1。
- 阴性：普通局部背景继续百分比；sub-state 满铺仍 100% 100%；cov=0、无 parentBox、冻结 mapping 不变。
- 跑两套 background-size-inference、resource-mounter、背景相关族与严格全量基线 diff；
  判据在文档阶段仍为假设，须待重投 5bf49590 后看真实产物和日志才能标记真机治愈。

### 3b-A 实施与验证记录（已完成，未部署）
- **代码**：`background-size-inference.js` 的 `percentSizeFrom` 成为三入口唯一百分比换算点；
  sub-state 局部背景回落 px 并写 `backgroundPercentFallback`，`inferBackgroundStyle` 返回
  `percentFallback`；`resource-mounter.js` 在状态背景挂载时输出评估计数。
- **测试**：专项 4 套件 **208/208**；背景与挂载全族 6 套件 **155/155**。全族首跑发现
  `background-truth-declaration.spec.ts` 3 条刀70 过期 px 断言，已按普通容器 T4 百分比真值修正，
  未把它们误归为既有失败。
- **严格全量差集**：当前态 20 套件/49 用例失败、6287 通过；同树临时目录基线 23/62、6246 通过。
  归一化 FAIL 名单后 **current-only=0**，20 个当前失败全部与基线相同；baseline-only=3
  （meeting-contract-parity / mc-check-m5-7-fg-exemption / rename-with-copy-fallback），当前已转绿。
  基线目录 `/tmp/mvgo-t4-baseline-1793911785` 保留了刀71 等其它在途改动，仅背景 6 文件取 HEAD。
- **构建**：`npm run build` 成功，dist 含 `PERCENT_FALLBACK_SUB_STATE` 与日志计数符号。
- **真实 mapping 回放**：直接调用构建产物，`bg-tab-active-7891` 返回
  `size=78px 21px / position=5px 3px / repeat=no-repeat / percentFallback=sub-state-mount-container`。
- **环境留痕**：安全策略中断临时 `git stash push`，备份 `stash@{0}: t4-3ba-baseline-20261106`
  仍在，6 个背景文件处于 staged；没有再次执行同类 Git 操作，改用临时目录完成基线。
- **边界**：本刀不修第 64 行 active 白边框、不重投旧产物、不重启。真机验收仍需部署后重投
  5bf49590，期待新 tab 不再出现 26.44% 77.78%，且日志 `percentFallbackSubState=1`。
