# 管线治理落地手册（2026-09-09）

> 可执行版。诊断见 `pipeline-governance-2026-09-09.md`。  
> 本文件只回答：**现在改哪、怎么改、怎么验收、什么不许做。**  
> 原则：**先停自伤，再让写盘吃契约，Golden 作独立裁判；不新增 CODE/VERT/RESOURCE 规则。**

---

## 0. 一句话目标

LLM 只写交互和 echarts option。布局 / 资源归属 / 类名 / 文案 / 插槽由 **Working Manifest** 确定性写入。门禁分两裁判：

| 裁判 | 比什么 | 防什么 |
|------|--------|--------|
| 装配符合 | 产物 vs Working Manifest | 写盘没按契约走 |
| 独立校验 | 产物/Working Manifest vs Golden（或 Figma 几何） | 装配层自己猜错还自证自洽 |

`completed + pass=true` 不是质量信号。质量信号 = 三样本预览结构级对照 Figma。

---

## 1. 冻结（从打开本文开始）

| 冻结（运行态后处理） | 例外 / 架构新增（不算破冻结） |
|------|------|
| 新 CODE-xxx / VERT-xxx / RESOURCE-xxx | 无 |
| 新 autoMount / autoFix / inferXxx 兜底 | 输出写入 Working Manifest 且过同一过滤器 |
| prompt「再强调一次」当修复 | 无 |
| 并行会话 Step 2：改 CODE-018 / prompt 去适应 defineProps | 停。契约由 Working Manifest 生成，不由 LLM 反推 |
| 在 `microcode-engineer.js` 继续堆逻辑 | Loop 0/1 允许改**调用点**；新逻辑进纯函数 util。`forceAll` 调用点 TEMP 到 Loop 1 |
| 用户管理 / CAS / 打包与管线同 commit | 旁线另开 commit |

`forceAll` = **临时桥**，Loop 1 收口即删。禁止兄弟补丁。Golden Manifest 是 Loop 4，禁止提前开工。

**WARN 边界**：结构类（错绑、slot 双份、未匹配回全量、region-fallback）BLOCK 或跳过写入。WARN 只给诊断（未使用资源）。inferred 无双源不得标 completed。

---

## 2. 当前事实（2026-09-09 23:00 接线）

| 项 | 现状 | 缺口 |
|----|------|------|
| `buildResourceManifest` | `{sections, sectionOrder, panel, unassigned}` + `ownerSectionId`（`sectionKeyOf` 已下钻 `slot-con/Group N`） | **无** `contracts[]` / `ownerBlockId` / `provenance` |
| 写盘子组件 | `injectResourceImports(..., effectiveMapping, ..., {skipResourceVars:true})`（`microcode-engineer.js` ~1550） | mapping 仍是全量；靠 skip 挡 import，DOM 仍可能绑错 var |
| 写盘主组件 | `forceAll:true` 全量 success 资源（~2012 / ~5154 / ~6117） | CODE-019 能绿，跨区错绑更容易 |
| 契约改写 | `rewriteSubcomponentResourceImportsToProps` 在 inject 前执行 | 改写依据是 mapping 全量名字，不是 contract |
| `autoWireSubComponentProps` | 父 script **已声明**才补 `:prop`（`props-wiring-guard.js:649-693`） | forceAll 强行满足前提；wirable ≠ 契约 |
| `autoMountUnusedBackgrounds` | 关键词失败 → `pickNextRegionContainer` 任意容器（`resource-mounter.js`） | 跨区乱挂 |
| headerSlots | vision C-1 后 derived `contractSlots` 再加回（`mc-component-graph-phase2.js` 契约回写） | 任务 `021e3cf7`：纠错后 0 + derived 3 = 3 |
| `mergeHeaderSlots` | 只按 content 去重（`inline-header-slot-inferrer.js:97-108`） | **无 bbox / C-1/C-2** |
| componentId | 内存 `_componentIdCheckpoints` Map | **不写** `declare.json.meta.checkpoint`，进程重启丢 |
| sanitizer | 已有行锚定 `^[ \t]*//{3,}[^\n]*$`（`css-sanitizer.js:38-40`） | 仍需补 `}====` 粘合行用例；heal 必须保留 `}` 后换行 |
| L6 `scopedResourceDomMapping` | 只滤 prompt；未匹配返回 `undefined`=全量 | 写盘不消费 |
| 并行会话 Step 2 | 拟改 validator/prompt | **禁止开工** |

验收样本（固定，每次 Loop 结束必须重生成对照）：

| 样本 | 代表 session / 组件 | 必须看见 | 必须看不见 |
|------|---------------------|----------|------------|
| env | `c-env-monitor-*`（0907 `ffb74dd8` 同源 Figma） | 顶行 tabs+icons 同行 | header 统计双份 |
| traffic | `23d4e35f` 同源 | 柱/折线可见；车型=数字卡 | pie 环形、标题错背景、图表 0 高 |
| device | `7fdf8e59` / `021e3cf7` 同源 | 左侧竖 tab 头；13 卡 icon 对得上 | 大卡双份、竖 tab 丢、CODE-019 靠重试 |

---

## 3. 正确数据模型（Loop 0.5，Loop 1 的前置，不是 Golden）

**Working Manifest** 由现有 `buildResourceManifest` **扩展**产出，进 checkpoint，可 diff。  
**不要**等独立提取器。Golden 是 Loop 4 的锁死快照，字段同构。

### 3.1 在 `resource-manifest.js` 增加，不另起炉灶

现有 `ownerSectionId`（已是 `slot-车型分布` 或 `slot-con/Group 2136637321`）**暂时等于** `ownerBlockId`。Loop 2 再把 block 从「section 段」升级为「卡片/tab 项」。

扩展返回值（保持旧字段，避免砸 L6/L7）：

```js
{
  // 旧
  sections, sectionOrder, panel, unassigned,
  // 新
  version: 'wm-1',
  resources: [ /* 扁平，每条带归属 */ ],
  contracts: [ /* 每子组件一份 */ ],
}
```

`resources[]` 每条（由 mapping + `annotateResourceOwnership` 填）：

| 字段 | 来源 | provenance |
|------|------|------------|
| `assignedVarName` | mapping 已有 | figma-direct |
| `file` / `resourceFile` | mapping，且 `downloadStatus==='success'` 才进可写盘集 | figma-direct |
| `figmaNodeId` / `figmaPath` | mapping | figma-direct |
| `ownerBlockId` | **= `ownerSectionId`**（已下钻 Group） | inferred |
| `ownerRole` | `parent-import` 默认；子组件本地独有才 `child-import` | inferred |
| `semanticName` | 兄弟 TEXT / 父 FRAME 名；填不出就空字符串，**禁止**全叫 `"icon"` 还假装具名 | inferred |
| `provenance` | 上表 | — |

`contracts[]` 每条（由 `fileSectionMap` + subComponentPlan 生成，**禁止**从 defineProps 反推）：

```js
{
  file: 'package/components/DeviceCards.vue',
  blockIds: ['slot-con/Group 2136637321', 'slot-con/Group ...'],
  resourceProps: ['bg1', 'icon1'],      // 本文件 DOM 允许出现的 var
  parentMustPass: ['bg1', 'icon1'],     // 父必须 import + :prop
}
```

panel 级共享资源（根 bg、主题图）进入主组件 import，**不**进任何子合同，除非 plan 明确拥有。

### 3.2 消费规则（写进函数注释，Loop 1 接线）

1. 子组件 `injectResourceImports` 的 mapping = `resources.filter(r => contract.blockIds.includes(r.ownerBlockId) && r.ownerRole!=='parent-import')`；P0/D 阶段子组件继续 `skipResourceVars:true`，但 **DOM 绑定的 var 必须 ∈ contract.resourceProps**，否则剥离。
2. 主组件 import = `∪ contracts.parentMustPass` ∪ `panel`（success）。**禁止** `forceAll`。
3. `autoWire` 的 wirable 集合 = 上述 import 名；父未声明则 **先插 import 再接线**，不再 skip。
4. Manifest 缺 `contracts` 且存在 `package/components/*.vue` = 生成失败，不许启发式补全后 `completed`。
5. `inferred` 字段偏差 → WARN + 诊断，不假装确定；`figma-direct` 偏差 → BLOCK。

---

## 4. Loop 执行（顺序锁死，每 Loop 可独立 revert）

```
Loop 0 停自伤  →  Loop 0.5 数据模型  →  Loop 1 写盘契约
      → 三样本肉眼过资源/插槽  →  Loop 2 结构表
      → 肉眼过 tab/同行  →  Loop 3 类名尺寸  →  Loop 4 Golden+拆补丁
```

单测绿不算过。每个 Loop：**改代码 → acorn → jest 相关 spec → nest build → env -i 重启 13030 → 三样本重生成对照**。

---

### Loop 0 — 停出血（0.5 天）

不提高质量上限，只停已知自伤。`forceAll` **先留着**撑 CODE-019。

#### 0.A derived headerSlots 必须过 C-1

| 文件 | 改法 |
|------|------|
| `graphs/mc-component-graph-phase2.js` 契约回写段 | `contractSlots` 并入前用 **同一套** `rejectedKeys`（C-1 `rejectedNodes`）过滤。纠错后 0 且 derived 全在 rejectedKeys 里 → 保持 0。日志必须能看出 `derived kept=0` |
| `utils/inline-header-slot-inferrer.js` `mergeHeaderSlots` | 增加可选第 3 参 `{ rejectedKeys?: Set, headerBBox?: {x,y,w,h}, slotsBBoxOf?: fn }`。命中 rejected 或与 header 容器不相交（C-2 同几何）→ 不加 |
| `roles/visual-parser.js` ~3148 | 调用 `mergeHeaderSlots` 时传入已有 rejected/bbox（没有则不加 derived） |

**不要**再在 visual-parser 里发明第二套 bbox 算法。复用 `header-slot-validator` / T09 C-2。

验收：用 `021e3cf7` 日志口径复放 fixture——「vision 3（纠错后 0）+ derived 3」必须变成 derived 0。预览 header 统计不再双份。

单测：在现有 0908 headerSlots spec 加一条「C-1 rejected 的 inline slot 不得 merge 回来」。

#### 0.B componentId 写盘 checkpoint

| 文件 | 改法 |
|------|------|
| `microcode-engineer.js` `normalizeDeclareJson` | `_componentIdCheckpoints.set` 的同时写入 `d.meta.checkpoint = { sessionId, componentId, classPrefix }` |
| 读路径 | 内存 Map miss → 读 `declare.json.meta.checkpoint.componentId` → 都 miss 才新建 |
| 重试 | 只读，禁止重掷随机中段 |

验收：同 session 人为触发 3 轮 L0-B 重试，`componentId` 与 `common.less` 前缀三轮一致；重启 Node 后再重试仍一致。

单测：纯函数测「Map 空 + declare 有 checkpoint → 用盘上的」。

#### 0.C sanitizer 粘合行

`css-sanitizer.js:38-40` 行锚定已在。补两刀：

1. 增加 `}={3,}` / `}//=*{3,}` 粘合修复：保留 `}`，丢掉等号垃圾，**换行**。
2. heal 链（写盘前补括号）禁止把 `}` 与下一行 `// ===` 粘成一行。

验收：把 `55e0f192` 的 `}====` 样例放进 `css-sanitizer.spec.ts`，lessc 可编译。

#### 0.D 关掉三条 fail-open（结构类）

| 点 | 现状 | Loop 0 行为 |
|----|------|-------------|
| L6 未匹配 section | 返回 `undefined`→全量 prompt | 返回 `[]`，记诊断；主组件仍可见 panel。**先改 prompt，写盘等 Loop 1** |
| L7 无 `fileSectionMap` | 启发式 | 不传启发式；无 map 则 **跳过 L7 自动挂载**，只 WARN「未归因」 |
| `pickNextRegionContainer` | 任意空容器 | Loop 0 即可删调用：关键词失败 → **不挂**，记诊断。不要等 Loop 1 |

`#278` 未使用资源保持 WARN，禁止为「用完」而挂。

**Loop 0 完成标准**

- 同 session 三轮 prefix 不变（含进程重启）
- 不再出现「纠错 0 + derived 3」
- 不再 `}====`
- autoMount 不再 `keyword: '(region-fallback)'`
- 三样本允许仍有错绑/竖 tab 丢（那是 Loop 1/2）；不允许再因本 Loop 四项自伤而坏

---

### Loop 0.5 — Working Manifest 扩展（0.5–1 天，可与 Loop 0 尾并行）

只改 `resource-manifest.js` + 一个新纯函数，**不改写盘**。

| 函数 | 行为 |
|------|------|
| `buildResourceManifest` | 追加 `resources[]`（扁平，含 `ownerBlockId=ownerSectionId`、`provenance`） |
| **新** `buildContracts(manifest, fileSectionMap, subComponentPlan)` | 产出 `contracts[]`。`fileSectionMap` 已在 generateCode 主干（#657）。plan 缺失 → contracts 空 + 诊断，不编 |
| `semanticName` | 从 mapping 邻近 TEXT / `figmaPath` 最后非框架段填；填不出留空 |

单测（新 spec `resource-manifest-contracts.spec.ts`）：

1. device 风格 path `slot-con/@antd/tab/cons/Group 1/icon` → `ownerBlockId=slot-con/Group 1`，两张卡两个 block。
2. `fileSectionMap={'package/components/A.vue':'slot-con/Group 1'}` → 该文件 contract.blockIds 含 Group 1，resourceProps 含其 success var。
3. 无 fileSectionMap → contracts=`[]`，不抛。

**完成标准**：fixture 能打印出 13 张 device 卡 13 个 block；**写盘行为不变**（仍 forceAll）。这是「砖头运到工地」的可 diff JSON，不是房子。

把一份 Working Manifest JSON 写进 checkpoint（`temp-components/.../checkpoint.manifest.json`），三样本各留一份，供 Loop 1/4 diff。

---

### Loop 1 — 写盘吃契约（P0，1–2 天）

唯一同时解错绑、CODE-019、图标空壳的杠杆。依赖 0.5 的 `contracts[]`。

#### 1.A `forceAll` → `forceContract`

`resource-import-guard.js` `injectResourceImports` 第 5 参：

```js
options = {
  skipResourceVars?: boolean,
  forceAll?: boolean,          // 保留但标 @deprecated，Loop 1 后主路径禁止传 true
  contract?: { parentMustPass: string[], resourceProps: string[] },
  role: 'main' | 'sub',
}
```

新纯函数（同文件或 `resource-manifest.js`）：

```js
function mappingForContract(effectiveMapping, manifest, contract, role) {
  // main: parentMustPass ∪ panel（downloadStatus===success）
  // sub:  ownerBlockId ∈ contract.blockIds 且 success；P0/D 阶段仍 skip 注入 import
}
```

接线（`microcode-engineer.js`，只改调用点）：

| 位置 | 现状 | 改为 |
|------|------|------|
| 子 ~1550 | `effectiveMapping` + `skipResourceVars:true` | mapping=`mappingForContract(..., 'sub')`；仍 skip import |
| 主 ~2012 / ~5154 / ~6117 | `{forceAll:true}` | `{ role:'main', contract: mergedParentMustPass }` |
| `rewriteSubcomponentResourceImportsToProps` | 全量 mapping | 只改写 **本 contract.resourceProps** |

搜 `forceAll: true`，主路径必须清零（spec 里允许测 deprecated 分支）。

#### 1.B autoWire 按契约强制

`autoWireSubComponentProps`：

- 增加 `contracts` 入参。
- 对 `parentMustPass`：父 script 没有该 import → **插入 import**（调现有 inject，mapping 仅这几个 var）→ 再补 `:prop`。
- 不再 `wirable.has(rp)` 才 push missing；契约内缺失 = 必补。
- 契约外的 defineProps 资源名 → **剥离子组件对该 prop 的使用或标 BLOCK**，不要为了绿而给父加全量。

#### 1.C 错绑：修，不只 BLOCK

L7 `detectCrossSectionResourceBindings`：绑定 var 的 `ownerBlockId` ∉ 本文件 `blockIds` → **剥离该绑定 + 对应 import**，记 WARN。不要只 BLOCK 等 LLM 重试。

DOM 里 `url(${iconN})` / `<img :src="iconN">` 的 N 不在 contract.resourceProps → 同样剥离。空壳 img 删掉（已有 `stripUndefinedResourceRefs`），但 **先保证 contract 里有对的 var**，否则又变「很多元素没展示」。

#### 1.D 子组件校验

`_validateSubcomponentResourceDeps` 第 3 参改传 **合同 mapping**，不要全量 `effectiveMapping`（全量会让「用了别人的图」假通过）。

**Loop 1 完成标准（三样本重生成）**

| 样本 | 过 | 不过（留给 Loop 2） |
|------|----|---------------------|
| traffic | 统计卡背景不再跑到标题；icon 不跨 section 复用 3 次 | 车型若仍被规划成 pie——结构表问题 |
| device | CODE-019 首次过，不靠重试；13 卡 import/prop 来自各自 Group | 竖 tab 头仍可能丢 |
| env | HeaderIcons 的 icon1/icon2 由父传入 | 顶行是否同行 |

离线重放：`d2311f17` 上 CODE-019 保持 0，且主组件 import 数 **小于** success 资源总数（证明不是 forceAll）。

回滚：`git revert` 本 Loop commit 后 `forceAll` 仍能撑 CODE-019（Loop 0 未拆脚手架）。

---

### Loop 2 — 结构表接管规划（P0）

确定性，不经 LLM。几何冲突时 **Figma bbox 赢**。

| 规则 | 落点 | 完成标准 |
|------|------|----------|
| y 重叠 ≥50% 且 x 基本不相交 → 同一 block 的 horizontal children，禁止拆成两个 vertical section | `inline-row-rebuilder` / planner | env 顶行 tabs+icons 同行 |
| 节点名/组件类型 `@antd/tab`、`tabs`、竖向 nav → 强制 `{nav, panels}`，nav 不得丢 | subcomponent-planner | device 产物有左侧竖 tab 头 |
| chrome（标题/装饰线）`role:chrome`，不进 contentSections，也不进 headerSlots，除非业务 tab/stat | chrome-section-filter | header 统计不双份（与 Loop 0 叠加） |
| 每个 `figmaNodeId` 只落 slots **或** content 一次；T09 推迟到 plan 完成后；重叠删 DOM 不只删合约 | resource-mounter T09 | 大卡不出现两次 |

Vision 只给 label / chartType **建议**。Figma 无图表节点 → 装配层禁止 pie/line（这是结构真值，不是新 VERT 规则：写在 Manifest `containsChart`）。

**完成标准**：三样本肉眼过结构。traffic 车型=数字卡；device 有竖 tab；env 顶行水平。

---

### Loop 3 — 类名与尺寸由 Manifest 写出（P1）

| 项 | 做法 | 完成标准 |
|----|------|----------|
| `classNames[]` 唯一生成器（已有 `genClassKey`） | template / scoped / common.less **同一 token**。`style-class-consolidator` 的 rewriteMap 标过渡，目标删除 | CODE-003-HIT-RATE 三样本 ≥95% |
| `blocks[].layout` | 装配写 `flex: <系数> 1 0` 或 `flex: 0 0 <px>`。删 LLM 写 flex-grow、删 fixer 改 flex。FLEX-005 只断言「产物=Manifest」，不等就回写 | 不再 FLEX-005 自伤 BLOCK |
| `containsChart` | 装配写 `min-height:0` + 主图 160 / 紧凑 100。VERT-004 并入装配，停独立守卫叠加 | runtime：chart `clientHeight>0` |

componentId 已在 Loop 0 冻结，本 Loop 不再靠 `autoFixPrefixViolations` 叠前缀。

---

### Loop 4 — 双裁判门禁 + 拆补丁堆

#### 4.A 门禁只留三类

1. **契约符合**：import ⊆ 本 block 资源；class ∈ classNames；text ⊆ texts；slot 不双份；有 tab 二元则产物含 nav。
2. **可编译**：LESS / SFC / 语义，fail-closed（已有）。
3. **运行时**：`is not defined` / chart 0 尺寸 → BLOCK（升回，禁止再降 warning 后发布）。

结构类 **禁止 fail-open**。

#### 4.B Golden + ManifestAuditor（独立校验者）

这是对方方案该采纳的半环，**放在装配已经按契约写盘之后**，否则 Golden 比对的是乱写盘产物，噪声淹没信号。

| 件 | 要求 |
|----|------|
| `figma-golden-extractor` | **独立文件**，不 import 装配层。从 Figma 树 + 资源下载结果生成与 Working Manifest **同构** JSON |
| 三样本 GM | 人类审核一次，锁 `hash`，放 `docs/golden-manifests/{env,traffic,device}.json` |
| `manifest-auditor.js` | **不 import** engineer / mounter / parser。`diff(golden, working)` + `verifyProduct(golden, files)` |
| 判定 | `structural.shifted`（bbox >8px 或 >5%）/ `resource.misbound` / `contract.missingPass` 任一非空 → BLOCK |
| provenance | `figma-direct` 必须等于 GM；`inferred` 须 vision 双源一致或 GM 标 `accepted-inferred`，否则 WARN 且不标 completed |

不要把 Working Manifest 复制一份改名 Golden。Golden 必须来自另一条代码路径或人工锁死。

#### 4.C LLM 窄口（不要冻交互/option）

| 区 | 谁写 | 重试 |
|----|------|------|
| frozen：layout css / import / class token / 白名单文案 / slot 结构 | 装配 | 不等 LLM，回写 Manifest |
| writable：`<script>` 逻辑、echarts option | LLM | 只重跑 script 段，上限 3，不冲 frozen |

冻结的是「新补丁规则」，不是 LLM 把 option 写对的能力。

#### 4.D 拆除已被装配替代的

关键词 autoMount、像素 flex fixer、双通道 headerSlots infer、prompt 里重复 flex 示例、deprecated `forceAll` 分支、`style-class-consolidator`（若 Loop 3 已同源）。

`forceAll` / `rewriteSubcomponent...` 在 engineer 里的调用点：**删改判据** = `assemble(manifest, llmFiles)` 一次调用取代后删除。未取代前保持「临时态」注释，禁止再扩。

---

## 5. 明确不要做

- 不要为单张截图加规则。
- 不要把 Step 2（validator/prompt 适应 defineProps）当 Loop 1。
- 不要先做 Golden 提取器再止血——止血被拖成「先造裁判」。
- 不要在 Loop 1 前拆 `forceAll`（CODE-019 会回潮）。
- 不要改 `post-process.js` 返回契约（消费方按 `{code,warnings,fixed}` 解构）。
- 不要写盘自愈只写磁盘不回写 files map。
- 不要旁线（用户管理/CAS）和管线同一 commit。

---

## 6. 验证命令（每个 Loop 共用）

```bash
# cwd = backend-node
# 1) 语法
node --check src/ai-engine/utils/resource-manifest.js
# 相关文件用 acorn parse（ESM）

# 2) 单测（与基线 FAIL 集比对，不扩失败）
NODE_OPTIONS="--max-old-space-size=1536" npx jest <spec> --runInBand --forceExit

# 3) 构建（沙箱勿直接 nest；清 NODE_OPTIONS shim）
rm -f tsconfig.build.tsbuildinfo
NODE_OPTIONS="--max-old-space-size=4096" npm run build

# 4) 重启
# 先确认 :13030 释放，再：
env -i PATH="$HOME/.workbuddy/binaries/node/versions/22.22.2-2/bin:/usr/bin:/bin" \
  HOME="$HOME" node /Users/smigoo/工作/mvgo/start-node.js
# 探活
curl --noproxy '*' -sS http://127.0.0.1:13030/api/v2/pipeline/health
```

符号级验收：每个新函数 Grep **1 定义 + 1 真实调用**（不要只在 spec 里出现）。

三样本：同一 Figma 节点重跑 max 生成，对照预览，不要只看 `codeValidationResult.pass`。

---

## 7. 与已有文档的关系

| 文档 | 角色 |
|------|------|
| `pipeline-governance-2026-09-09.md` | 诊断（错 1–5、架构、盲点） |
| **本文** | 落地顺序、函数、验收、冻结 |
| `root-cause-matrix-2026-09-09.md` | traffic/device 症状→层 |
| `fix-resource-cross-section-misbinding-2026-09-09.md` | 方向 4 四阶段；**并入 Loop 1**，不要单独再开一条 Phase |
| `optimization-plan-2026-09-09.md` | P0–P6；P1/P0/P4 被 Loop 0 覆盖，P3 被 Loop 3 覆盖。按本文执行，避免两份计划抢 commit |
| `upstream-root-cause-audit-2026-09-09.md` | A/B 矢量无名 icon → Loop 0.5 `semanticName`；C 去重 → 挂载按 block 不按去重组；D → Loop 1 契约 |

冲突时以**本文顺序**为准。

---

## 8. 建议的下一刀（确认后动代码）

只做 Loop 0，按 0.A → 0.C → 0.B → 0.D。  
0.5 的字段设计已写在 §3，代码可在 Loop 0 合入后立刻做，**仍不改写盘**。

Loop 1 必须看到 0.5 的 contracts fixture 绿才开工。
