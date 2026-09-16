# A′ 治本方案：slot-con 容器层级保留（上游视觉分区保真）

日期：2026-09-10（15:1x 立项，用户拍板方案 A）
样本：`mc-1789015934816-1003d7d3`（device `c-device-monitor-hnhl49no-1003d7d3`）
依据：`.checkpoint/{figma.json,visual.json,context-shadow.json}` 真值取证 + 源码 `visual-parser.js` / `inline-row-merger.js` / `subcomponent-planner.js` 实证。

> 本文替代 `docs/device-traffic-remediation-plan-2026-09-10.md` §1b 中被推翻的「plan() 携带 sec.children」原始方案。
> 原方案**已被证伪**：`visual.json` 的 41 个 sections 里 `89:40(slot-con)` 完全不存在，`plan()` 根本没有「带 children 的容器 section」可透传（详见该文档 §1b 顶部「真值二次取证」段）。

---

## 0. 一句话结论

device「大 tab 应该在最上」的本质是 **slot-con 纵向容器层级在视觉分区阶段被整层丢弃**：Vision 把 slot-con 的两个子（switch 在上、tab 在下）拆散，merger 又只把「左右并列」的子节点提升为 section、对「上下堆叠」的容器父节点不保留 → 最终 `plan()` 拿到的是 switch 与 section-main(tabs+cons) 两个平级 section，无从得知二者同属 slot-con 且 switch 在 tab 上方 → LLM 把 switch 塞进右内容区顶、tab 竖栏甩最左。

方案 A = 在**视觉分区 / merger 阶段**恢复 slot-con 容器层级，让 `layout.sections` 里存在 `89:40` 这个带 `children=[switch, tab]` 的嵌套 section，下游 planner/engineer 据此还原真实空间归属。

---

## 1. 链路溯源（决定改哪一层）

`layoutStructure.layout.sections` 的构建链路（按代码顺序）：

| 阶段 | 文件·函数 | 行为 | device 实证 |
|---|---|---|---|
| ① Vision 分区 | （多模态模型） | 把 Figma 树语义化为 section 列表 | `section-header` / `section-main`（仅含 `section-tabs`+`section-content`，**不含 switch**） |
| ② 扁平→结构化 | `visual-parser.js:899-964` | 仅当 `!hasStructuredSections` 时兜底生成 1 个 chart entry；**非 chart 场景 sections 由 Vision 直接给** | 本组件走 Vision 直给，不经过此兜底 |
| ③ 行内复合重建 | `visual-parser.js:1450-1472` → `rebuildSectionsPreservingInlineRows` + `mergeInlineRowsIntoSections` | 把「左右并列」的兄弟节点提升为顶层 inline-row section | 为 `89:38(switch)`/`89:37(@antd/tab)`（二者各自子节点左右并列）各生成一个顶层 section；**不为 `89:40`（两子上下堆叠）生成** |

**关键取证**（`.checkpoint/figma.json` 复刻 merger 算法）：
```
merger 实际提升的 section（id=父节点）：
  2:8419 header, 2:8428, 2:8431, 2:8434, 89:38 switch, 89:37 @antd/tab, 2:8437 cons, ...（共 ~38 个）
89:40(slot-con) 是否被提升? → false   ← 容器层丢失点
```

**根因定位**：容器层丢失是 ①+③ 合力：
- ①Vision 把 switch 拆到 section-main 之外（section-main.body.children 只有 `[section-tabs, section-content]`，**没有 switch**）；
- ③merger 把 switch 单独提升为顶层 section（index 6），且对「上下堆叠的父容器 89:40」不保留。

`89:40` 的两个直接子 bbox 关系（figma.json 真值）：
- switch `89:38`：y475 / h65
- tab `89:37`：y538 / h317
- `yOverlap ≈ 1.8`，远低于 merger 的 50% 阈值 → 判定为「上下堆叠」→ 不触发左右并列聚类 → 容器父 `89:40` 永不成为 section。

> ⚠️ **改哪层**：只改 merger（③）不够——因为 Vision（①）已经把 switch 拆出 section-main。必须**在 merger 之后、planner 之前**补一道确定性重建：基于 figma 真值回查「被拆散的平级 section 是否同属一个纵向容器」，把该容器恢复为嵌套 section。这一层放在 `visual-parser.js` 行内重建段之后最稳妥（已有 `figmaData` 入参、已 import merger）。

---

## 2. 容器判定算法（确定性，无 LLM）

放在 `visual-parser.js` 新增纯函数 `rebuildSlotConContainers(layout, figmaData)`（与 merger 同风格：纯函数、零依赖、无 import.meta，便于 jest）。

**输入**：`layout.layout.sections`（含 merger 已提升的顶层 switch/tab）+ `figmaData`（原始树）。

**算法（普适信号，不认名字）**：
1. 遍历 figma 树，找出所有候选容器 `C`：满足「`C.children.length>=2` **且** `C` 的全部直接子 `c1..cn` 的 id **都出现在** `layout.sections` 顶层（即 `secIds.has(c.id)` 全 true）**且** `C` 自身 id **不在** `layout.sections` 顶层」。
   - 这个信号天然排除了：① 横向容器（如 device `cons` 12 子、merger 已提升为 horizontal 行，满足但被下方判定筛掉）；② 自身已是 section 的节点；③ `env 89:41` 这类只有 1 个子命中顶层的（不满足「全部直接子都命中」→ 安全跳过，实测 env `89:42` 子 `2:7898` 不在顶层 → 跳过）。
2. 对候选容器 `C`，取其命中顶层的子作为 `members = C.children.filter(c => secIds.has(c.id))`。
3. **纵向判定**（复用 `inline-row-merger.js` 的 `sideBySide` 单一事实源，不另造阈值）：对 `members` 两两计算 `yOverlap/sideBySide`——**只要存在一对是左右并列（sideBySide=true），就判定为横向容器，不重建**（避免与 merger 冲突、误并横向行）。
4. 若 `members.length>=2` 且**全部成员两两非左右并列**（即整体纵向堆叠）→ 判定为纵向容器，需要恢复：
   - 从 `layout.sections` 中**移除**这些 members（不再作为顶层平级 section）；
   - 生成容器 section（按 members bbox.y 升序）：
     ```js
     {
       id: C.id,                          // 89:40
       name: C.name,                     // slot-con
       role: 'content-container',
       layout: 'vertical',               // 纵向容器
       layoutSource: 'container-rebuild',
       figmaNodeId: C.id,
       children: membersSortedByY,       // [switch(89:38, y475), @antd/tab(89:37, y538)]
       header: { title: C.name },
       body: { layout: 'vertical', children: membersSortedByY },
     }
     ```
   - 把该容器 section 插入原 members 中第一个的**位置**（保持整体 Y 顺序）。

**安全护栏（防误伤，均已真值验证）**：
- **env 89:41**：2 子仅 1 个（89:42）命中顶层 → `全部直接子都命中` 不满足 → 跳过 ✅
- **device cons 2:8437**：12 子全命中顶层，但内部含左右并列（group 行）→ sideBySide 命中 → 判定横向 → 跳过 ✅（merger 已正确处理）
- **device switch 89:38**：2 子左右并列 → 横向 → 跳过 ✅
- **device slot-con 89:40**：2 子（89:38/89:37）上下堆叠（yOverlap≈1.8 < 50%×minH）→ 纵向 → **重建** ✅
- 若 members 中存在某个已是 `collapsed`/`renderHint:'v-for'` 的列表 section → 跳过（避免破坏已折叠的重复卡片逻辑）；
- 不改任何 section 的内部结构，只调整容器层归属。

---

## 3. 下游兼容面全量盘点（改上游必查）

`plan()` 收到嵌套 section 后，下游所有消费方必须能处理 `children`。逐处核查：

| 消费方 | 文件·位置 | 现状 | 兼容性 | 处理 |
|---|---|---|---|---|
| planner `plan()` map | `subcomponent-planner.js:740` | 逐顶层 section 映射，**不读 children** | ⚠️ 容器 section 的 children 会被忽略 | 需改：遇到 `layoutSource==='container-rebuild'` → 递归展开 children 进 effectiveSections，容器自身标记 `isContainer:true` |
| planner 折叠 | `collapseRepeatedSiblingSections` | 对顶层 sections 做同构折叠 | ✅ 不影响（容器 children 内部已是叶子/inline-row，不参与顶层折叠） | 无需改 |
| planner 复杂度 | `calculateSplitScore`/`countElements` | `getChildren` 已兼容 `sec.children` | ✅ 容器 children 可被正确计数 | 无需改 |
| `effectiveSections` 21 处消费 | graph / assembler / validator / mounter | 多为 `.map` / `.some` / `.filter` 遍历 | ✅ 容器 section 作为一项参与遍历，其 children 仅 planner 内部消费 | 视情况：若消费方需要「扁平所有区块」语义，需补 `flattenSections()` |
| `generation-context-assembler` | `normalizeComponentPlan` | 透传顶层字段，不进 children | ⚠️ 若 prompt 需要容器提示，需把 `children`/`isContainer` 透传 | 需评估 |
| microcode-engineer prompt | 子组件职责生成 | 基于 flat effectiveSections | ⚠️ 需在 prompt 里告知「X 是容器，含 Y/Z 子区块，Y 在最上」 | 需评估 |
| COMP-001 section-coverage | `section-coverage-guard.js` | 按 section 点名覆盖 | ✅ 容器作为 1 个 section 计入 | 无需改 |
| S3 `splitMultiChartSectionIntoChunks` | `subcomponent-planner.js:895` | 读 `sec.internalSubcomponents` | ✅ 容器 section 无非内部子组件 | 无需改 |
| nav-section 注入 | `nav-section.js` | 在顶层 sections 注入 nav | ✅ 不影响 | 无需改 |
| **元素高度比例** | `figma-height-ratio.js:492-499` `applyFigmaSectionRatios` + `collectSiblingGroups` 遍历 `layout.sections` 顶层与 `section.body` | ⚠️ 容器 section 进入顶层后，`collectSiblingGroups` 会把它当 group 处理，但其 children（switch/tab）已被移出顶层 → **不影响**（容器本身无 flexGrow 比例意义）；其原顶层 members 移除后，父列比例由容器 section 承接 | ⚠️ 需验证：重建后 `applyFigmaSectionRatios` 对容器 section 的处理是否保真（device 重跑探活 `figmaElemRatioApplied` 计数不退化） | Phase 2 后必须纳入重跑验证 |

**关键风险**：`plan()` 若把容器 section 直接映射为 effectiveSections 顶层项、却不展开 children → 容器里的 switch/tab 在 effectiveSections 里**消失**（因为已从顶层 sections 移除）→ 比现在更糟（现在至少 switch/tab 是顶层可见）。**因此 planner 必须先展开 children，再映射**——容器只作为结构提示，不独占 effectiveSections 槽位。

---

## 4. 分阶段实施（对齐 Loop 锁序，先红后绿）

### Phase 1：纯函数 + 单测（不动字段）
- 新增 `src/ai-engine/utils/container-rebuilder.js`：`rebuildSlotConContainers(layout, figmaData)`（纯函数、无 import.meta）。
- 新 spec `container-rebuilder.spec.ts` 钉死：
  - device 真值输入 → 输出含 `89:40` 容器 section 且 `children=[89:38,89:37]`、原顶层 89:38/89:37 已移除；
  - 无 figmaData → 原样返回（零回归）；
  - 上下堆叠判定：两子 y 重叠<50% 才合并，左右并列不动；
  - 护栏：collapsed section 不参与、跨容器不合并。

### Phase 2：接线（visual-parser）
- `visual-parser.js:1472` 之后调用 `rebuildSlotConContainers(parsed.layoutStructure.layout, figmaData)`（同 merger 调用方式）。
- `parsed.layout` 同步调用（保持 merger 双写约定）。

### Phase 3：planner 展开
- `subcomponent-planner.js:740` map 内：若 `sec.layoutSource==='container-rebuild'`，递归把 `sec.children` 展平为 effectiveSections 项，容器自身**不**作为独立 effectiveSection（或作为带 `isContainer` 的占位提示）；子项保留 `parentContainerId: sec.id`。
- 新增 `flattenContainerSections(sections)` 辅助函数，统一处理嵌套。

### Phase 4：prompt 提示（可选，验证后再做）
- `normalizeComponentPlan` 透传 `parentContainerId`；microcode-engineer prompt 增加「容器归属」提示。
- 若 Phase 3 验证已能还原布局，此步可暂缓（避免 prompt 过度约束）。

---

## 5. 验证矩阵（每项有确定性证据）

| 项 | 方法 | 通过标准 |
|---|---|---|
| 单测 | `container-rebuilder.spec.ts` | 4+ 用例全绿 |
| 回归 | 受影响套件（inline-row-merger / repeated-section-collapser / subcomponent-planner×3 / section-coverage / generation-context） | 全绿 |
| 构建 | `npm run build` + dist 符号 grep `rebuildSlotConContainers` | BUILD_EXIT=0，符号入 dist |
| 重启 | `env -i node start-node.js`（13030，先确认端口释放） | 新 PID，health 200 |
| 真值重跑 | device 重跑（需额度授权） | `package/index.vue` 模板顺序：switch 横贯最上 → 其下 tab 竖栏(左) + cons(右)；不再 tab 在最左、switch 在右区顶 |
| 结构断言 | 重跑后读 `.checkpoint/visual.json` | `layout.sections` 含 `89:40` 且 `children=[89:38,89:37]` |
| 回归样本 | env / traffic 重跑（需额度） | 子组件数、布局不退化（尤其 env 顶部 tab 行不丢、traffic 不重新过细） |

---

## 6. 回滚与红线

- **回滚**：Phase 2 接线处用 `if (process.env.MC_DISABLE_CONTAINER_REBUILD) ` 开关；异常时设 `MC_DISABLE_CONTAINER_REBUILD=1` 即回到 merger-only 行为（零回归）。
- **红线（禁止补丁式）**：
  - 不改 `MainContent.vue` 的 flex 方向假装修复；
  - 不在 planner 里硬编码 `89:40` 特例（必须普适的容器判定）；
  - 不把容器 children 直接塞进 effectiveSections 却不展开（会丢失 switch/tab）；
  - 不删除 merger（merger 负责横向行，与容器重建正交，二者并存）。

---

## 7. 当前状态（2026-09-10 18:25 更新）

- 根因已用真值取证钉死（①Vision 拆散 + ③merger 不保留纵向容器）。
- 方案 A 已定稿（本文），**代码已落地**（下文 §7.1）。
- **真实验收未完成**：三样本重生成肉眼对照未做（需额度授权），故 A′ 不得宣称「管线绿」。

### 7.1 已落地（结构层 + 消费层）

| 层 | 落点 | 状态 | 提交 |
|---|---|---|---|
| 结构层 | `utils/container-rebuilder.js`（`rebuildSlotConContainers`）+ `roles/visual-parser.js:82` 接线 | ✅ | `003437b` |
| planner | `roles/subcomponent-planner.js:702,859` 保留 `container-rebuild` 嵌套，停 flatten | ✅ | `fe403de` |
| assembler | `context/generation-context-assembler.js:11-36` `normalizeSectionNode` 递归透传 `children`/`isLayoutContainer`/`layoutSource` | ✅ | `fe403de` |
| prompt（vue3） | `roles/microcode/vue3-prompt.js:121,349-354` 叶子计数 + 注入嵌套树 | ✅ | `fe403de` |
| prompt（微码） | `roles/microcode/prompt-builder.js:1796-1820` 职责表叶子+树 | ✅ | `fe403de` |
| engineer | `roles/microcode-engineer.js` 补 `leafSections = collectLeafSections(...)` 定义；强制拆分/布局/高度块统一叶子遍历 | ✅ | `e21c92d` |
| code-generator | `roles/microcode/code-generator.js:31` 补 `collectLeafSections` import；charts 判定走叶子 | ✅ | `e21c92d` |
| COMP-001 | `utils/section-coverage-guard.js` 顶部 import + 叶子遍历 | ✅ | `472fb92` |
| nav / heights | `utils/nav-section.js` / `utils/figma-section-heights.js` 叶子遍历，容器不计槽 | ✅ | `472fb92` |

### 7.2 验证证据

- 嵌套回归 **6 suites / 45 tests 全绿**（planner-nested / prompt-builder-nested / coverage-guard / figma-heights / nav-nested / section-tree-import-contract）。
- `npm run build` 成功，dist 18:24 > src 18:21；grep 确认 `const leafSections = collectLeafSections(effectiveSections)` 已入 dist，`effectiveSections.(length|forEach|filter)` 残留 **0**。
- 13030 重启 PID **11453**，`Nest application successfully started`，`GET /api` 200。

### 7.3 未完成

- **三样本（env / traffic / device）重生成肉眼对照** —— 唯一真实验收，需额度授权。
- 关联：原文档 `docs/device-traffic-remediation-plan-2026-09-10.md` §1b（已更正为考古段）。

## 8. 算法真值验证（2026-09-10 15:2x 实测，非推测）

用 `.checkpoint/` 真值离线跑「普适信号 + 纵向判定」算法，结果：

| 样本 | 候选容器（全部直接子命中顶层 & 自身非 section） | 判定 | 结论 |
|---|---|---|---|
| device `c-device-monitor-hnhl49no-1003d7d3` | `89:40 slot-con` [FRAME] children=2 | 两子上下堆叠 | **需重建** ✅（精确命中真凶，无误伤） |
| env `c-env-monitor-wzk1763d-fb0a0de7` | 无（`89:41` 只有 1 子 `89:42` 命中顶层） | — | 跳过 ✅（安全） |
| traffic（14 个样本） | 无 slot-con 类容器 | — | 跳过 ✅（安全） |

关键：算法在 device 上**只命中 1 个容器（89:40）**，不误伤 device 内部的 `cons`(12 子横向 grid)、`switch`(2 子横向)——因为它们均含左右并列对，被 `sideBySide` 判定筛除。纵向判定阈值直接复用 `inline-row-merger.js` 的 `sideBySide`（单一事实源），不另造。

**旁证**：`device` 的 `switch(89:38)` 在 `visual.json` sections 中**只出现 1 次**（顶层 index 6），确认它不在 `section-main` 内 → Vision 拆散 + merger 提升的双源问题成立，方案必须同时覆盖容器重建（本文核心）。
