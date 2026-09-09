# 管线治理方案（2026-09-09）

> 覆盖 09-07 ~ 09-09 三日工作。结论先行：**方向在 09-07 已经写对，执行在 08/09 走偏成「prompt + 后处理 + 门禁」三层补丁堆。视觉越来越差，不是模型变弱，是装配契约没接管写盘，后处理开始自伤。**
>
> 本文不新增门禁。新增门禁 = 继续做错。



---

## 0. 一句话

LLM 不该决定布局、资源归属、类名、文案落位。这些必须来自 **Assembly Manifest（单一事实源 JSON）**，由确定性装配层写入产物。LLM 只做交互和 echarts option。

09-07 文档第七章写过这条，08/09 没有按这条做完。做的是：抽纯函数 → 单测绿 → prompt 注入 → **写盘仍走旧全量路径** → 再加 fail-open 把门禁降成 WARN → 任务 `completed`、视觉错。

---

## 1. 三日做错了什么（按错误类型，不按日期）

### 错 1：把「纯函数绿」当成「管线绿」

| 做了什么                                    | 实际接到哪                  | 写盘/规划仍怎样                                                                                               |
| --------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------ |
| L5 `buildResourceManifest`              | 单测 + prompt            | 写盘 `injectResourceImports` 仍全量 `effectiveMapping`（`prompt-builder.js:1428-1429` 注释明文保留）                |
| L6 `scopedResourceDomMapping`           | 子组件 prompt             | 同上，过滤只影响 LLM 看见的清单                                                                                     |
| L7 `detectCrossSectionResourceBindings` | 能 BLOCK                | `sectionKeyOf` 只取首个 `slot-*`；device 13 个 cons 全归 `slot-con`，同区错绑天然不拦。`fileSectionMap` 09-09 才补上，之前走启发式 |
| L8 `inferFlexDirection`                 | `inline-row-rebuilder` | 不防规划层漏抓竖 tab 头                                                                                         |
| L9 `genClassKey`                        | 注入 `figma.md` 表格       | `common.less` / scoped **不消费** Manifest，仍两套类名                                                          |
| L10 `normalizeFixedSizeFlex`            | validator 2.10         | fixer（A4 / `figma-section-heights`）曾把像素写回 `flex-grow`，与 FLEX-005 对打                                    |
| L11-L14 文案/结构表                          | 文档标 ✅                  | 规划层仍丢 `@antd/tab` 头；资源 prop 契约未进 plan                                                                  |

**判别失败点**：fixture 断言的是函数返回值，不是「生成一次真实组件后，磁盘上的 import / class / flex / slot 是否等于 Manifest」。


### 错 2：用后处理修 LLM，而不是让 LLM 看不见不该看见的东西

典型自伤（修 A 引入 B）：

| 补丁                                                       | 本意                | 实际伤害                                                                              | 证据                                                                                                                  |
| -------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| P1-1 `_inferHeaderSlotsFromInlineRows`                   | headerSlots 为空时兜底 | derived **绕过 C-1/C-2**，把已剔除的内容区统计加回 → 插槽双份                                        | `visual-parser.js`：`mergeHeaderSlots(existing, inline)` 无 bbox 过滤；任务 `021e3cf7` 日志 `vision 3（纠错后 0）+ derived 3 = 3` |
| `pruneOrphanSubComponents` 只查一层                          | 清未引用文件            | 嵌套子组件被当孤儿删掉，主体掏空                                                                  | 09-08 `mc-max-1788832532312`，已改 BFS，说明补丁层在猜结构                                                                       |
| FLEX fixer 写 `flex: 131 1 0`                             | 按设计稿高度分配          | 校验器禁像素量纲 → 自伤 BLOCK                                                               | `figma-section-heights` 曾读 `figmaHeightPx`；09-09 `a21f0c3` 才改系数                                                     |
| `autoFixPrefixViolations`                                | 统一前缀              | 重试 `componentId` 变 → 叠双前缀 → `common.less` 死样式 → 图表 0 高                            | `55e0f192` 三轮 `f6hse9td → 0jnt6qmr → vsdzs6p4`                                                                      |
| `autoMountUnusedBackgrounds` + `pickNextRegionContainer` | 消化未使用资源           | 关键词失败就挂任意容器 → 跨区错绑                                                                | RESOURCE-001 压力下的「用掉就行」                                                                                             |
| `autoWireSubComponentProps`                              | 解 CODE-019        | 只在父 script **已声明同名变量** 时补 `:prop`；子组件自己 import 时父永远空 → 永不连线                       | `props-wiring-guard.js:649-693`                                                                                     |
| `css-sanitizer` 分隔线正则                                    | 清注释               | 无行锚点 → `}====` → LESS 编译失败                                                        | 快照合法、落盘非法                                                                                                           |
| `post-process.js` 半成品改契约                                 | 想变纯校验             | `{code,warnings,fixed}` → `{valid,errors}`，T06 `fixedCode` undefined 崩整条 generate | 09-08 实锤                                                                                                            |
| `writeFiles` 自愈只写盘                                       | 补括号               | 内存 files map 仍是坏版 → 快照冻结漏 `}`，TaskDetail 空白                                       | 09-08 `06cfa312`                                                                                                    |

共同模式：**症状在产物，补丁打在产物之后。** 上游 Manifest 不变，下游永远有新症状。

### 错 3：fail-open 把失真封装成成功

| 后门                               | 效果                                    |
| -------------------------------- | ------------------------------------- |
| L6 未匹配 section → 全量资源            | prompt 过滤形同虚设                         |
| L7 无 `fileSectionMap` → 启发式      | 复杂 tab 误判或同 slot 失明                   |
| CODE-003 命中率 <60% 仅 WARN         | 死样式放行，图表 0 高仍 `pass=true`             |
| #278 未使用资源 BLOCK→WARN+自愈         | 乱挂资源换「用完」                             |
| SEMANTIC-BINDING 传未声明 `logger`   | ReferenceError → catch 成 WARN，语义错绑从未拦 |
| 运行时 `RUNTIME-004` 曾降 warning 后发布 | 渲染错误也能 completed                      |

结果：`codeValidationResult.pass=true`、`lessCompileGate.pass=true`、任务 completed，用户看到空白图、错背景、双份 header。

**门禁在报「文件能不能跑」，没在报「和 Figma 是不是同一个结构」。**

### 错 4：文档标完成 ≠ 装配接管

0907 文档进度：Phase 2/3/4/5 均标 ✅。  
代码事实：

- 资源表：生成器有，**装配写入没有**（写盘全量）。
- 布局表：inferrer 有，**CSS 不由 Manifest 写出**，仍靠 LLM + fixer。
- 类名表：prompt 表格有，**common.less/scoped 双轨仍在**。
- 结构表：文档完成，**`@antd/tab` 头仍在 L2 丢失**。
- 文案表：有注入能力，**TEXT-TRUTH 阈值 + 标题臆造仍漏**。

这是「把砖头运到工地」当成「房子盖好」。

### 错 5：工作方式放大了错 1–4

三日 backend-node ≈ 15 commit、+1.1 万行（含 fixture），新增 10+ guard/filter/manifest。并行线还在改用户管理、CAS、打包。

- 没有「同一 Figma 三组件、改完必须重生成对照」的硬门。
- 没有「新增后处理必须证明不破坏装配契约」的禁令。
- 症状驱动：用户截图 → 加一条 fix → 单测绿 → 下一张截图。

0907 自己写的判别标准（补丁 vs 根源）在 08/09 被违反了。

---

## 2. 真正的根因（四层，从上游往下）

```
Figma 真值
  → ① 结构/资源/文案 没有不可变中间契约（每层重新猜）
  → ② 规划不消费契约（tab 头丢、headerSlots 双通道、props 无合同）
  → ③ 写盘不消费契约（全量 import、乱挂背景、类名双轨、flex 自伤）
  → ④ 门禁不消费契约（只查语法/编译，fail-open 放行结构失真）
```

用户能看见的「图标没了 / 图 0 高 / 背景错 / 插槽两份」全部是 ③④ 的投影。修 ③④ 而不修 ①②，必然越修越差。

四条不可再绕过的上游事实（09-09 晚间取证）：

| 节点  | 事实                                                  | 末端补丁为什么无效                            |
| --- | --------------------------------------------------- | ------------------------------------ |
| A/B | 14 个 icon 全是矢量 GROUP，mapping 全叫 `"icon"`，无「对应哪张设备卡」 | autoMount 只能随机挂                      |
| C   | 13 张卡共用一张合法去重背景；下游只贴部分容器                            | 去重没错，缺「节点→容器」挂载表                     |
| D   | 资源归父还是归子从未进 plan；autoWire 要求父已声明                    | CODE-019 重试不收敛                       |
| 结构  | `@antd/tab` 头在规划层丢；vision 可把同行拆成垂直 section          | chrome filter / 行内 rebuilder 触发条件对不上 |

---


## 3. 正确架构（回到 0907，做完而不是再写一遍）

```
Figma 节点树 + 资源下载结果 + Vision（只作辅助，可被几何否决）
        │
        ▼
 Assembly Manifest（唯一 JSON，可 diff、可单测、可进 checkpoint）
   blocks[]        区块：id, figmaNodeId, bbox, parent, layout, chrome|content
   resources[]     资源：var, file, ownerBlockId, ownerRole, semanticName, figmaNodeId
   classNames[]    类名：blockId → token（template 与 less 同一生成器）
   texts[]         文案：figma TEXT 白名单，禁止 LLM 改字
   slots[]         插槽：每个 figmaNodeId 只能落 header 或 content 一次
   contracts[]     子组件：file, blockIds, resourceProps[], parentMustPass[]
        │
        ├──────────────┬──────────────┐
        ▼              ▼              ▼
   装配层（代码）    LLM（窄口）     门禁（对照 Manifest）
   写 layout CSS    交互 / echarts  结构≠Manifest → BLOCK
   写 import+绑定   option          不 fail-open 结构类
   写 class/文案/slot
   按 contract 注入父 props
```

**硬规则**

1. Manifest 字段缺失 = 生成失败，不许用启发式补全后标 completed。
2. 写盘路径禁止再读「全量 mapping」给子组件；只能读 `resources.filter(r => r.ownerBlockId ∈ contract.blockIds)` + panel 级共享资源。
3. 新增 prompt / fixer / 门禁，必须先回答：这条会不会被 Manifest 装配替代？能替代则删旧补丁，不叠加。
4. componentId 在 session 内只生成一次，写入 `declare.json.meta.checkpoint` 与磁盘 checkpoint，重试只读。
5. 后处理只允许：**对照 Manifest 的确定性写入**（缺则补、错则改回 Manifest）。禁止「关键词匹配随便挂」。

---

## 4. 治理执行（5 个 Loop，每个可独立 revert）

**冻结（从现在开始）**

- 冻结新的 CODE-xxx / VERT-xxx / RESOURCE-xxx 规则。
- 冻结新的 autoMount / autoFix / inferXxx 兜底，除非它的输出写入 Manifest 且经过同一过滤器。
- 用户管理、CAS、打包等旁线与管线隔离，不在同一 commit。

验收样本固定为 0907 三组件 Figma（env / traffic / device），**每次 Loop 结束必须重生成这三件并人工对照**，单测绿不算过。

### Loop 0 — 停出血（0.5 天，不改生成质量上限，只停自伤）

| 改动                              | 文件                     | 行为                                                                                |
| ------------------------------- | ---------------------- | --------------------------------------------------------------------------------- |
| derived headerSlots 必须过 C-1/C-2 | `visual-parser.js`     | `mergeHeaderSlots` 前用与 vision 相同的 bbox 过滤器；纠错后 0 就保持 0                            |
| 禁止 fail-open 结构类                | L6/L7/#278             | 未匹配 section **不要**回全量；无 fileSectionMap **不要**启发式乱挂；未使用资源保持 WARN，禁止 pickNextRegion |
| sanitizer 行锚定                   | `css-sanitizer.js`     | `^//\s*={10,}\s*$`；heal 保留 `}` 后换行                                                |
| componentId checkpoint          | `normalizeDeclareJson` | 已有内存 Map，**必须同时写 declare.json.meta.checkpoint**，进程重启仍稳                            |

完成标准：同一 session 三轮重试 prefix 不变；不再出现插槽「纠错 0 + derived 3」；不再 `}====`。

### Loop 1 — 资源契约真正接管写盘（P0，1–2 天）

这是唯一能同时解错绑、CODE-019、图标空壳的杠杆。

Manifest `resources[]` 每条必须有：

- `assignedVarName`
- `file`
- `ownerBlockId`（细到卡片/tab 项，**禁止**停在 `slot-con`）
- `semanticName`（从兄弟 TEXT / 父 FRAME 名反推：「摄像机」「风速风向仪」）
- `ownerRole`: `parent-import` | `child-import`（默认 parent-import）
- `figmaNodeId`

写盘：

1. 子组件 `injectResourceImports(content, mapping.filter(ownerBlockId ∈ this.blocks), relBase)`  
   删掉 `prompt-builder.js:1428`「仍走全量」这条设计。
2. `contracts[].parentMustPass` 由 Manifest 生成，不是由 LLM 的 defineProps 反推。
3. `autoWire` 改为：**按 contract 强制** `:icon1="icon1"`，并在父 script **插入 import**（现在缺的就是这一步）。父未声明不再 skip。
4. `autoMountUnusedBackgrounds` 改为：只挂 `ownerBlockId` 对应 DOM；找不到对应节点则 **不挂**，记诊断，不换容器。
5. L7：错绑 = 绑定的 var 其 `ownerBlockId` ∉ 本文件 blocks → 剥离绑定（修），不是只 BLOCK。

完成标准：traffic 不再出现「统计卡背景跑到标题」；device 13 张卡的 icon 能按 semanticName 对上；CODE-019 对契约内 prop 不再靠重试碰运气。

### Loop 2 — 结构表接管规划（P0，与 Loop 1 可部分并行）

确定性规则（不经过 LLM）：

- bbox y 重叠 ≥50% 且 x 基本不相交 → **同一 block 的 horizontal children**，禁止拆成两个 vertical section。
- 节点名 / 组件类型匹配 `@antd/tab`、`tabs`、竖向 nav → 强制 `structure: { nav, panels }` 二元，nav 不得丢。
- chrome（panel 标题/装饰线）标 `role:chrome`，**不进** `contentSections`，也不进 headerSlots，除非它是业务 tab/stat。
- 每个 `figmaNodeId` 只能出现在 slots **或** content **一次**。T09 注入推迟到 plan 完成之后；重叠则删 DOM，不只删合约。

Vision 的职责降为：给 block 加 label / chartType 建议。几何冲突时 **Figma bbox 赢**。

完成标准：env 顶行 tabs+icons 同行；device 左侧竖 tab 头在产物里；header 统计不再双份。

### Loop 3 — 类名与尺寸由 Manifest 写出（P1）

- `classNames[]` 唯一生成器（已有 `genClassKey`）→ **template class、scoped 选择器、common.less 选择器全部用这一份 token**。删除「短类 vs 实例长类」双轨。`style-class-consolidator` 的 rewriteMap 变成过渡期，目标是不再需要它。
- 尺寸：`blocks[].layout` 写 `flex: <系数> 1 0` 或定高 `flex: 0 0 <px>`，由装配层写入 CSS。**删除** LLM 写 flex-grow、删除 fixer 改写 flex。FLEX-005 只做「产物是否等于 Manifest」，发现不等就回写 Manifest 值，不调用 LLM 重试。
- 图表容器：Manifest 标记 `containsChart` 时装配层写 `min-height:0` + 主图 `min-height:160px` / 紧凑图 `100px`。VERT-004 并入装配，不再作为独立守卫叠一层。

完成标准：`CODE-003-HIT-RATE` 对三样本 ≥95%；echarts 容器 clientHeight > 0（可用现有 runtime gate 断言）。

### Loop 4 — 门禁对照 Manifest，并拆除补丁堆

门禁只保留三类：

1. **契约符合**：import ⊆ 本 block 资源；class ∈ classNames；text ⊆ texts；slot 不双份；结构含 tab 二元（若 Manifest 有）。
2. **可编译**：LESS / SFC / 语义（已有，保持 fail-closed）。
3. **运行时**：`is not defined` / 0 尺寸 chart → BLOCK（已有，升回 BLOCK）。

然后 **删除或停用** 已被装配替代的：关键词 autoMount、像素 flex fixer、双通道 headerSlots infer、prompt 里重复的 flex 示例。

重试：仅当失败项 **不在**「装配可修清单」里才打 LLM；可修项先装配回写再校验，不计 LLM attempt。

---

## 5. 明确不要做的

- 不要再为单个视觉症状加 CODE/VERT/RESOURCE 规则。
- 不要再「prompt 里强调一次」当修复。
- 不要把 `completed + pass=true` 当质量信号；质量信号 = 三样本对照 Manifest + 预览截图像素级（至少结构级）一致。
- 不要在 `microcode-engineer.js` 继续堆逻辑；装配渲染器应是无 `import.meta` 的纯函数，engineer 只调一次 `assemble(manifest, llmFiles)`。
- 不要并行改用户管理/门户和管线（09-09 下午就是这样把注意力打散的）。

---

## 6. 今晚已落地的半步（22:40 P0/D）——定位，不要叠第二层

已合并进运行 dist（PID 37977）：

| 动作                                     | 作用                                   | 还没做到                                                                                      |
| -------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------- |
| 子组件本地 `import iconN` → 改 `defineProps` | 消除「子自己 import 又要求父传」                 | 子组件仍可能被 `injectResourceImports` 按**全量**补回 import（注释写「改写后主要为 vue」，代码仍传 `effectiveMapping`） |
| 主组件 `forceAll: true` 全量 import         | autoWire 父作用域终于有变量，CODE-019 离线重放 2→0 | **全量**不是契约。traffic 跨区错绑会更容易：父手里什么图都有，子要什么都能传                                              |
| `autoWire` 补 `:prop`                   | 父已声明才连线的前提被 forceAll 强行满足            | 连的是「子 defineProps 里出现的名字」，不是 Manifest `ownerBlockId`                                      |

这是 Loop 1 的**接线脚手架**，不是装配完成。下一步禁止再加 forceAll 的兄弟补丁。下一步只做一件事：

**把 `forceAll` 收成 `forceContract(manifest, file)`**：主组件只 import `contracts` 里 `parentMustPass` 的并集 + panel 共享资源；子组件 `injectResourceImports` 的 mapping 必须是 `ownerBlockId ∈ this.blocks`。CODE-019 继续用 autoWire，但 wirable 集合 = 契约，不是全量 mapping。

若先重生成三样本：预期 CODE-019 会好，跨区错绑/竖 tab 丢失/插槽双份**不会**好。不要把这一刀的绿当成治理完成。

## 7. 建议的下一刀（确认后才动代码）

顺序锁死：

1. **Loop 0**：derived headerSlots 接 C-1/C-2；componentId 写盘 checkpoint；sanitizer 行锚定。不停 `forceAll`（先留着撑 CODE-019）。
2. **Loop 1 收口**：`forceAll` → `forceContract`；子组件写盘 mapping 按 block 过滤；autoMount 禁止换容器。
3. 三样本重生成对照。过了再动 Loop 2 结构表。

不做 Loop 3/4，直到资源+结构两件事在预览里肉眼过关。

---

## 8. 方案盲点修订（盲点一/二/三 补强，待过目后落地）

> 本节为对第 0–7 节的补强，**不动代码**。核心结论：新装配架构缺**独立校验者**（产物由装配层写、门禁由装配层消费同一 Manifest 判定 → 恒真），且 Loop 4 的「弱化 LLM 重试」会把「丑但完成」变成「自信地错且完不成」。三处盲点统一由 **Golden Manifest（独立事实源）+ 独立 ManifestAuditor（不依赖装配层）+ 窄 LLM retarget 通道** 堵上。

### 8.1 盲点一：自证闭环（产物=装配自写 → 门禁恒真）

**问题重述（第 3 节架构的断点）：**
新门禁判「产物 vs Manifest」，但 Manifest 与写盘逻辑来自同一台确定性机器。装配层按 Manifest 写、门禁按同一 Manifest 读 → 只要装配层不抽风，永远 `pass`。`codeValidationResult.pass=true` 会变成新的「无信息量」状态——只是来源从 fail-open 换成自证自洽。

```
Figma 真值 ──┐
             ├─→ [同一机器] ─→ Manifest ─→ 装配层写盘 ─→ 产物
             │                                      ↑
             │                                      └─ 门禁判 产物 vs Manifest（同一机器输出，恒真）
唯一独立裁判：产物 vs Figma 真值  ←─ 现靠人工对照，无快照、无机器判据
```

**修复：引入 Golden Manifest（GM）作为独立事实源，与装配层的「working manifest」分叉。**

#### 8.1.1 Golden Manifest 字段设计

GM 由**独立于装配层**的代码路径（或直接人工维护）从 Figma 真值离线生成、人类审核一次、版本化锁死。它不是装配层的即时输出，而是「Figma 设计意图的权威快照」。

```jsonc
{
  "version": "1.0",
  "figmaFileKey": "FigmaFileKey",
  "generatedAt": "2026-09-10T00:00:00Z",
  "generatedBy": "figma-golden-extractor@<commit>",   // 独立提取器，非装配层
  "hash": "sha256:ab12...",                             // 锁死后不可变，改需新 version
  "blocks": [
    {
      "id": "blk-header",
      "figmaNodeId": "2:1234",
      "bbox": { "x": 0, "y": 0, "w": 1440, "h": 96 },
      "parent": null,
      "layout": { "mode": "horizontal", "flex": "0 0 96px" },
      "role": "chrome",                                  // chrome | content
      "provenance": "figma-direct"                       // 见 8.3
    }
  ],
  "resources": [
    {
      "var": "icon1",
      "file": "resources/images/icon-1.png",
      "ownerBlockId": "blk-card-camera",                 // 细到卡片，禁止停在 slot-con
      "ownerRole": "parent-import",                      // parent-import | child-import
      "semanticName": "摄像机",                          // 反推字段，provenance=inferred
      "figmaNodeId": "2:8798",
      "provenance": "inferred"
    }
  ],
  "texts": [
    { "figmaNodeId": "2:9001", "text": "实时车速", "isWhiteListed": true, "provenance": "figma-direct" }
  ],
  "slots": [ { "figmaNodeId": "2:1234", "landing": "header", "owner": "blk-header" } ],
  "contracts": [
    { "file": "package/components/HeaderIcons.vue", "blockIds": ["blk-header"], "resourceProps": ["icon1","icon2"], "parentMustPass": ["icon1","icon2"] }
  ]
}
```

关键字段差异 vs 现有 `buildResourceManifest`：
- 新增 `blocks[].provenance`、`resources[].provenance`、`contracts[]`（现有仅有 `resources[]`，无 `contracts`、无 `ownerBlockId` 细化）。
- GM 的 `hash` 是锁死锚点；装配层产出的 working manifest 与 GM `diff` 时，差异即「装配层错读 Figma」的证据。

#### 8.1.2 独立校验器 ManifestAuditor 接口

`manifest-auditor.js` **不 import 装配层任何模块**，只读 GM + 产物文件。对齐用 `figmaNodeId`/`bbox` 结构级匹配，非字符串 diff。

```ts
interface ManifestAuditor {
  // GM 与装配层 working manifest 比对（结构级）
  diff(golden: GoldenManifest, working: Manifest): AuditReport;
  // 产物 .vue 文件与 GM 比对（结构级，非逐字节）
  verifyProduct(golden: GoldenManifest, productPaths: string[]): VerifyReport;
}

interface AuditReport {
  structural: { missing: Block[]; extra: Block[]; shifted: Block[] };  // shifted = bbox 位移超阈值(>8px 或 >5%)
  resource:   { orphan: Resource[]; misbound: { var: string; expectedOwner: string; actualOwner: string }[] };
  contract:   { missingPass: { file: string; prop: string }[] };
  summary:    { pass: boolean; score: number };   // score = 1 - (缺陷权重/总项)
}
```

判定纪律（fail-closed，结构类）：
- `structural.shifted / resource.misbound / contract.missingPass` 任一非空 → `pass=false`，BLOCK。
- 不读装配层代码，只认 GM 与磁盘产物 → 装配层错读 Figma 也能被拦（治本第 3 节「门禁不消费契约」的缺口）。

#### 8.1.3 Golden 生成与版本纪律

- 提取器 `figma-golden-extractor` 与装配层解耦，单独 commit、单独测试。
- GM 生成后人类**审核一次**锁死 `hash`；后续 Figma 真值变更 → 新 `version`，旧 GM 留档可 diff。
- 三样本（env/traffic/device）各一份 GM，作为「质量信号」的机器判据，替代「人工对照三样本」。

### 8.2 盲点二：弱化 LLM 重试 → 窄 retarget 通道

**问题重述（Loop 4 的隐含风险）：**
Loop 4 写「装配可修项回写后不计 LLM attempt，重试只留给非装配项」。但 LLM 当前承担**交互逻辑 + echarts option + 把规划意图翻成 Vue 代码**——这三者装配层**完全不碰**。一旦装配骨架里 LLM 因弱化重试没调对 `setOption` 或事件绑定写错：
- 旧模式：LLM 重试补出来，丑但完成。
- 新模式：装配层判「这是 LLM 事」不回写；LLM 重试被冻结压住 → **直接 failed**。

这是比补丁堆更隐蔽的失败：从「明显错但能完成」退化为「自信地错且完不成」。

**修复：定义 LLM 可写区 / 冻结区，给 LLM 受约束的 retarget 通道。**

```ts
interface LLMRetargetGate {
  // 判定失败项是否属 LLM 可控区
  isLLMResponsibility(failure: AuditIssue): boolean;
  writableRegions: ['<script> logic 段', 'echarts option 对象'];
  frozenRegions:  ['layout css', 'resource import', 'class token', 'whitelisted text', 'slot structure'];
}
```

纪律：
- 装配层只写 `frozenRegions` + 骨架 DOM；LLM 只填 `writableRegions`。
- 重试时复用一次生成产物，**只重跑 LLM 的 script 段**，不碰 frozen 区（避免重生成把装配写入冲掉）。
- LLM retarget attempt 有独立上限（如 3），不计入「装配契约冲突」计数；超限才升级人工。
- 冻结的是「新补丁规则」，不是「LLM 对交互/option 的迭代能力」。

### 8.3 盲点三：Manifest provenance 来源漂移

**问题重述：**
文档错 1 核心断言是「每层重新猜」。但 Manifest 由 `buildResourceManifest` 从 Figma 解析生成——**生成这步本身就在猜**（节点名反推 semanticName、bbox 重叠≥50% 判 horizontal、组件名匹配 `@antd/tab`）。Manifest 当不可变事实源，上游却是它要取代的启发式。Loop 2 的确定性规则正是新的启发式，只是搬了位置。

**修复：每条字段带 `provenance`，门禁对 `inferred` 字段不假装确定。**

```ts
type Provenance = 'figma-direct' | 'inferred';
// figma-direct: Figma API 直采，可信
// inferred:    反推/规则生成（semanticName 反推、bbox 重叠判 horizontal、tab 组件名匹配），需校验
```

消费规则（在 ManifestAuditor 内）：
- `figma-direct` 字段：装配层**必须等于** GM，偏差即 BLOCK。
- `inferred` 字段：装配层可偏离 GM，但须满足任一才放行：
  - vision 双源一致（几何冲突时 Figma bbox 赢，见 Loop 2）；
  - 或人类审核在 GM 标注 `accepted-inferred`。
- 不满足则降级 **WARN（非 fail-open、非假装确定）**，记入诊断，不标 completed。

这样「反推错了一路传到写盘、门禁拦不住」的链路被切断：inferred 字段永远带「待校验」标记，不会静默变成事实。

### 8.4 待决议（阻塞落地，非盲点一二三，但须一并过目）

- **盲点四（Loop 跳步）**：第 7 节顺序锁死「先 Loop 0 再 Loop 1」，但第 6 节的 `forceAll` 半步已落运行 dist，Loop 0（headerSlots 接 C-1/C-2、componentId 写盘、sanitizer 锚定）未做 → 当前是「Loop 1 脚手架 + 未做 Loop 0」的跳步态。
- **文档内部矛盾**：第 5 节硬规则「不要在 microcode-engineer.js 继续堆逻辑」，但第 6 节 P0/D 半步恰恰在 `microcode-engineer.js` 加了 `rewriteSubcomponentResourceImportsToProps` + `forceAll` + `skipResourceVars` 三处调用。这半步与第 5 节直接冲突。
- **建议**：P0/D 半步须标「临时态 + 删改判据」（最终由 `assemble(manifest, llmFiles)` 取代并删除），否则归类为文档自己批评过的补丁堆。

### 8.5 修订后落地顺序（建议）

```
1. §8.1 Golden Manifest 数据模型 + figma-golden-extractor（独立于装配层）
2. §8.1.2 ManifestAuditor（fail-closed，不依赖装配层）
3. §8.3 provenance 字段 + 门禁消费规则
4. 三样本 GM 生成 + 人类审核锁死 hash
5. 此后才做 Loop 0（headerSlots/componentId/sanitizer）
6. 再 Loop 1 收口（forceAll → forceContract，依赖 §8.1 contracts 字段就绪）
7. §8.2 LLM retarget 通道（与 Loop 4 重试纪律合并，不前置）
```

**不做 §8.1–§8.3 而直接 Loop 1 收口，会重演 09-07「文档说完成、实际没对齐」**：装配层再干净，也没有机器能发现它与 Figma 的偏差。Golden + Auditor 是治理闭环的缺失半环，优先级高于 Loop 1。
