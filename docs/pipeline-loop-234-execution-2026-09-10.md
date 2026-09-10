# Loop 2/3/4 实施切片（2026-09-10）

> 承接 `pipeline-governance-playbook-2026-09-09.md` §Loop 2/3/4。本文只补「已确认的落点与验收」，
> 不重复设计动机。**每个 Loop 独立 commit、独立三样本对照**，禁止合并执行。

前置已完成：Loop 0（0.A/0.B/0.C/0.D）、Loop 0.5（contracts[]）、Loop 1（forceAll 收口 + 1.C 剥离）。

---

## Loop 2 — 结构表接管规划（P0，先做）

### 已确认现状（scaffolding 已在，缺接线）
| 件 | 现状 | 缺口 |
|----|------|------|
| `utils/chrome-section-filter.js` | `isChromeOnlySection` / `stripChromeSectionsInPlace` 已被 visual-parser 调用（:19） | chrome 只滤 section，未同步排除 headerSlots 误推断 |
| `utils/inline-row-rebuilder.js` | `rebuildSectionsPreservingInlineRows` 已接入（visual-parser:76） | 缺「y 重叠 ≥50% 且 x 不相交 → 同一 block horizontal children」的**明确判据** |
| `roles/subcomponent-planner.js` | 已有 planner + `@antd/tab` 识别（visual-parser:1583 竖向 nav 归类） | nav 未被强制进产物；`{nav, panels}` 结构未成文 |
| `roles/microcode/resource-mounter.js` | T09 几何过滤 | 「每 figmaNodeId 只落一次」未做确定性去重（现靠 T09 推迟） |

### 落点（按顺序）
1. **水平行判据**：`inline-row-rebuilder.js` 增加 `isHorizontalRow(a, b)`（y 重叠≥50% 且 x 基本不相交），在 `rebuildSectionsPreservingInlineRows` 内把命中的兄弟节点合并为同一 block 的 horizontal children，禁止拆成两个 vertical section。
2. **nav 强制**：`subcomponent-planner.js` 对 `@antd/tab` / `tabs` / 竖向 nav 节点，强制产出 `{nav, panels}`，nav 不得丢。
3. **chrome 不进 headerSlots**：`chrome-section-filter` 输出 chrome 节点名单，visual-parser 推断 headerSlots 时排除，除非是业务 tab/stat。
4. **节点只落一次**：`resource-mounter.js` 增加确定性 `dedupeByNodeId(files, manifest)`，同一 `figmaNodeId` 只允许出现一次（slots 或 content 二选一），重叠删 DOM 不只删合约。

### 验收
- 三样本肉眼：env 顶行 tabs+icons **同行**；device 有**左侧竖 tab 头**；traffic 车型=**数字卡**（非 pie）。
- 单测：`inline-row-rebuilder` 加 y 重叠/x 不相交 → 同行用例；planner 加 nav 强制用例；mounter 加去重用例。

---

## Loop 3 — 类名与尺寸由 Manifest 写出（P1）

### 已确认现状
| 件 | 现状 | 缺口 |
|----|------|------|
| `utils/style-class-consolidator.js` | 已接入 microcode-engineer（:114） | rewriteMap 是过渡态，未做到「template/scoped/common.less 同一 token」 |
| `classNamesList` 管道 | 存在（microcode-engineer:641/1689/1770…） | 非单一生成器；缺 `genClassKey` 同源 token |
| FLEX-005 / VERT-004 | 独立守卫叠加 | 未并入装配；flex 仍可能由 LLM/fixer 改写 |

### 落点
1. **classNames 唯一生成器**：`genClassKey` 作单一 token 源，template / scoped style / common.less 三处同一 token；`style-class-consolidator.rewriteMap` 标过渡，目标删除。
2. **flex 由装配写**：blocks[].layout → 装配写 `flex: <系数> 1 0` 或 `flex: 0 0 <px>`；删 LLM 写 flex-grow、删 fixer 改 flex。FLEX-005 只断言「产物 = Manifest」，不等则回写。
3. **containsChart 装配写**：装配写 `min-height:0` + 主图 160 / 紧凑 100；VERT-004 并入装配，停独立守卫叠加。

### 验收
- CODE-003-HIT-RATE 三样本 ≥95%。
- 不再 FLEX-005 自伤 BLOCK；runtime chart `clientHeight > 0`。

---

## Loop 4 — 双裁判门禁 + 拆补丁堆（最后做）

### 已确认现状
`figma-golden-extractor` / `manifest-auditor` **完全不存在**，需新建两个独立文件。

### 落点
1. **`utils/figma-golden-extractor.js`**（独立，不 import 装配层）：从 Figma 树 + 资源下载结果生成与 Working Manifest **同构** JSON。
2. **`docs/golden-manifests/{env,traffic,device}.json`**：三样本人类审核一次，锁 `hash`。
3. **`utils/manifest-auditor.js`**（独立，不 import engineer/mounter/parser）：`diff(golden, working)` + `verifyProduct(golden, files)`；`structural.shifted`（bbox>8px 或 >5%）/ `resource.misbound` / `contract.missingPass` 任一非空 → BLOCK。
4. **门禁只留三类**：契约符合 / 可编译 / 运行时（确定性 `is not defined`、chart 0 尺寸升回 BLOCK）。
5. **拆补丁堆**：关键词 autoMount、像素 flex fixer、双通道 headerSlots infer、deprecated forceAll 分支、style-class-consolidator（若 Loop 3 已同源）。

### 验收
- `manifest-auditor` 在 Golden 锁死样本上 BLOCK 数=0；人为注入错绑 → 必 BLOCK。
- 补丁堆拆除后三样本不回归。

---

## 执行顺序与纪律
```
Loop 2 → 三样本肉眼 → Loop 3 → 三样本肉眼 → Loop 4（Golden 锁死）
```
- 每个 Loop：改代码 → acorn → jest 相关 spec → nest build → env -i 重启 13030 → 三样本重生成对照 → commit。
- 严禁一次性盲改三个 Loop（三样本对照是本治理的核心证据，跳过即重蹈「越改越乱」）。
