# 8deeb6c4：fg-list 多余底色 / 字号 / tab 交互 —— 查重·根因·治本方案

> 2026-11-05 · 任务 `mc-max-1793846560547-8deeb6c4`（`c-vehicle-monitor-8deeb6c4`）
> 用户症状：① `c-vehicle-monitor-fg-list-136122-item` 出现设计上没有的背景色；② 文字大小似乎错误；③ tab 没有交互
> 依据：`mvgo-node-pipeline-governance` 六阶段门禁；`docs/2026-11-02-写盘前pass执行顺序总纲.md`
> **状态：Phase 1~4 完成；Phase 5 未开始（源码一行未动）**

---

## 0. 覆盖性结论（回答用户第一问）

**三个问题均未被 2026-11-05 上面几轮修复覆盖。**

| 本轮之前的修复 | 实际管辖 | 是否覆盖 |
|---|---|---|
| A① `figma-height-ratio.js` ② 视觉序护栏 | Figma 区域 y 排序 / flex 高度比例 | ❌ 零交集 |
| A② 冻结 `targetDomSelector` + B′ per-item 背景逐卡挂载（Phase 5 未开始） | 资源挂载锚点 / `ListSection` 的 v-for item 背景 | ❌ 本次是 `fg-list` 确定性接管渲染，不经过 `resource-mount-plan` |
| `589661a` P1-2 传递闭包 / `scopedResourceDomMapping` / `sortByVisualOrder` | 孤儿子组件、prompt 资源裁剪、高度配对 | ❌ 零交集 |
| `a27dd01` T09 headerSlots 资源型插槽文本拦截 | header 右侧插槽 | ❌ 本次 tab 在 `TabsSection`，非 headerSlots 注入 |
| `c72bbe2` `productAnchorIds` + `sizeFromScaleMode` | 锚点存在性 / background-size 真值 | ❌ 本次底色是 `backgroundColor`，非 size |

沾边但**未覆盖到本出口**的是 11-03 的「图色互斥」方案（见 §1）。

---

## 1. Phase 1 查重

| 查重对象 | 结论 | 门禁处置 |
|---|---|---|
| `docs/2026-11-03-背景图色互斥与资源挂载根治方案.md` M1/M3 | **已实施**：`container-background-truth.js:247` 有 `bgTruthlessStripped`；`prompts/engineer/shared/root-container.md:19`、`resource.md:12` 有「图色互斥」反向禁令 | ⚠️ **已有完整方案但管辖不全**（见 §2 R1）⇒ 续接补全，禁止第三次打补丁 |
| `docs/2026-11-03-列表逐项背景归属.md` / commit `b520026`「列表背景按逐项归属禁止同色扩散」 | 已实施，解决「同色扩散」 | 与本次「同时写色+图」不同，不重复修 |
| `docs/2026-11-03-列表段卡内布局与卡盒填充真值治本.md:27` | 记录「字号/字重/文本色与真值一致」为已排除项（别的组件） | 供 R2 参考，不作为本次结论 |
| 守卫总纲 `2026-11-02-写盘前pass执行顺序总纲.md` | 无 `tab 交互` / `fg-grid 静态` 条目；`:148` 只涉及 planner 锚点并集 | R3 属**无既有方案**，新建 |
| 代码痕迹 `folded-grid-section-takeover.js` | `fill` 数据轨 `:2162-2204` 明写「vision repeatedFill 在场时仍以 vision 为准（不覆盖）」；`:3151` 注释「卡底走 backgroundColor 长写」；全文件 `@click / interactive / activeIndex / cursor` **零命中** | R1 已有半修痕迹；R3 无痕迹 |
| `git log -- folded-grid-section-takeover.js` | 近期 `68a8c04 / 8780a6e / 9aa34a6 / beeafdb / 66b800d / b520026` 反复修同一文件 | 属「修过多次」信号 ⇒ 更需上溯到单一事实源，不得再加散点 |
| 家族 spec | `src/ai-engine/utils/__tests__/folded-grid-list-takeover.spec.ts` 等 15 个 | 回归面已明确 |

**查重定性**：R1 = 「已有完整方案但被新出口绕过」；R2 = 「真值与产物一致，非管线错误（需定域）」；R3 = 「无既有方案」。

---

## 2. Phase 2 根因（文件:行号 + 真值对照）

产物只有 3 个 Vue：`package/index.vue`、`components/TabsSection.vue`（`fg-grid` 接管）、`components/ListSection.vue`（`fg-list` 接管）。`reject-summary.json`：`takeover.hits.grid=1 / list=1 / candidates=2`，即两段**全被确定性接管**，不是 LLM 自由发挥。

### R1 多余背景色 —— 实锤

`package/components/ListSection.vue:3`：

```js
:style="{ ..., backgroundColor: it.fill || undefined,
          backgroundImage: it.bgVar ? 'url(' + it.bgVar + ')' : undefined, ... }"
```

`FG_LIST_ITEMS` 三卡均 `fill: "#3a4a5c"` **且** `bgVar: bg1/bg2/bg3` ⇒ 图片与纯色同时生效。

| 真值层 | 值 | 判定 |
|---|---|---|
| `.checkpoint/visual.json#layoutStructure...body.items[].repeatedFill` | `#3a4a5c` | vision 分析模型写入 |
| `.checkpoint/figma.json` 卡片节点 `136:127/128/129` 的 `fills` | **全部 `[]`** | Figma 无 SOLID fill |
| `.checkpoint/visual.json#...body.items[].bgPlaceholder` | `body-bg-136:12x` | 卡片底是**图片** |
| `.checkpoint/reject-summary.json#takeover.listItemBgs` | `{total:3, declared:0, subtree:3, skipped:0}` | 背景图由子树证据推断，非 declaration |

⇒ `#3a4a5c` 是**从背景图暗色像素误读出的臆造 fill**，不是设计真值。

**注入链**：`visual.json repeatedFill` → `detectListLeaf` 的 `norm[].fill`（`folded-grid-section-takeover.js:2167-2204` 明确「vision 在场时不覆盖」）→ `renderFoldedGridLeafVue:3097` 输出 `fill: "#3a4a5c"` → `:3151` 模板绑定 `backgroundColor: it.fill`。

**为何既有 M1 没拦住**：`container-background-truth.js:605-612` 只解析**静态 `style="..."` 属性**（`/\bstyle="([^"]*)"/`），而接管器写的是 Vue **动态 `:style="{...}"` 绑定**。M1 的判据定义（「有 IMAGE 填充的节点，其色值真值视为已被图片承载，不构成写底色的合法来源」）完全适用本例，只是**管辖面缺了接管渲染器这一出口**。

### R2 文字大小 —— 🔴 管线层无错，不硬改

| 项 | 视觉真值 `content.elements[].styles.fontSize` | 产物 `FG_LIST_ITEMS` | 结论 |
|---|---|---|---|
| 卡片标题「危化品车」 | `14` | `fs: 14` | ✅ 一致 |
| 数值「51」 | `28` | `vfs: 28` | ✅ 一致 |
| 单位「次」 | `12` | `lfs: 12` | ✅ 一致 |
| tab 文案 | `14` | `fs: 14` | ✅ 一致 |

字号采集在 `folded-grid-section-takeover.js:2938 const fsNum = Number(st.fontSize)`，逐字段取自真值、无改写。**在定域前改字号就是打补丁**。待查三条（🟡 推断）：① `font-size-normalizer#protectFgTagInlineStyles` 是否覆盖 `:style` 动态绑定（文件头 `:75-88` 说明 fg 内联受保护）；② 主题 `@fontSize` 缩放对硬编码 px 的影响；③ R1 的 `#3a4a5c` 深色底改变视觉权重，造成「字变大/变小」的观感差异。**R1 修复后需重投复看，很可能的确随之消失。**

### R3 tab 无交互 —— 实锤，无既有方案

`.checkpoint/visual.json#interactions` 有明确真值：

```json
[{ "target": "江阴靖江长江隧道 Tab", "type": "tab-switch", "defaultState": "激活态" },
 { "target": "江阴大桥 Tab",         "type": "tab-switch", "defaultState": "非激活态" }]
```

`#layoutStructure.layout.sections[0].body.children[]` 亦带 `role:'tab'` + `active:true/false`。

但 `package/components/TabsSection.vue:2-5` 是纯静态：

```vue
<div v-for="(it, i) in items" :key="i" class="...-fg-grid-27954-card" :style="{ background: it.bg, ... }">
  <span v-for="(t, ti) in it.runs" ...>{{ t.text }}</span>
</div>
```

- `detectGridLeaf`（`folded-grid-section-takeover.js:1570`）只按几何/文本把这段判成 `grid`，`reject-summary.hits.grid=1`；**全文件不消费 `interactions` / `role:'tab'` / `active`**。
- 产物 `index.vue:27-37` 里 LLM 写的 `tabs` / `activeTab` / `handleTabChange` 因此成为**悬空死代码**（接管器抢走渲染权却没接管交互）。
- 结论：交互真值在链路中途**降级为「只用于视觉样式」后断头**，与 11-05 三组件分析的共性一致。

---

## 3. Phase 3 治本方案（三刀，均不含硬编码/产物直改）

### 刀 A（R1）· 续接 M1：图色互斥口径推广到接管渲染出口

- **修复点**：`renderFoldedGridLeafVue:3079-3098` 构造 `FG_LIST_ITEMS` 时，若该 item 的背景图资源有效（`itemBgs[i]?.varName` 存在）⇒ 输出 `fill: null`。
- **只改渲染输出，不动 `tr.items[].fill` 数据本身**：`:2301-2310` 的「卡盒 = 能解释该行 fill 的自绘底祖先盒」几何真值仍依赖它，改数据会波及布局。
- **上游补强（可选，同一判据）**：`detectListLeaf:2167-2204` 的 fill 数据轨，当 Figma 节点 `fills=[]` 且该行有 `bgPlaceholder`/子树 IMAGE 证据时，不采信 vision `repeatedFill` —— 与 `container-background-truth` 的「真值权威性」同源，不新造口径。
- **计数行**：`fgListBgColorMutexSuppressed`（恒 0 也打），沿 `collectFoldedGridTakeover` 既有 `out` 聚合 + `microcode-engineer.js:2073` 既有日志出口，不新增 pass。
- **阳性对照**：`8deeb6c4` 的 `visual.json` + `figma.json` fixture ⇒ 三卡 `fill:null`、`backgroundImage` 保留；阴性：无背景图的列表（`fill` 有合法 Figma SOLID 来源）⇒ `fill` 原样保留、计数 0。

### 刀 B（R2）· 先定域，暂不改码

R1 重投后复看字号；若仍有差异，再查 `font-size-normalizer` 对 `:style` 动态绑定的覆盖。**未定域前不得改渲染器字号表达式**。

### 刀 C（R3）· 新建 tab 交互接管（C 级）

- **判据**：section 同时满足 ① `interactions[]` 含 `type:'tab-switch'`（真值来源 `.checkpoint/visual.json`，经 context 透传）；② `body.children[].role==='tab'` 且含 `active` 字段；③ ≥2 个 tab 成员 ⇒ 判为 `tab` kind，优先于 `grid` 命中（当前 `:3907` grid 先判）。
- **渲染**：`<div v-for>` 上生成 `@click` + `activeTab` ref + `:class` 激活态切换，激活态样式取各成员自身 `styles`（不猜、不硬编码）；事件名沿用既有 `runtimeBuilder.publishEvent` 契约。
- **不做**：不新增游离守卫、不改 `index.vue` 的 LLM 悬空代码（它由接管产物自持后自然不再被引用）、不改 `FG_TAKEOVER_CLASS_RX` 之外的正则口径。
- **同步登记**（git log `66b800d` 先例，三处必须同步）：`FG_TAKEOVER_CLASS_RX`（`:91`）、`reject-summary` 的 `HIT_KEYS`、`mc-check.cjs` 内嵌正则；并登记守卫总纲。
- **计数行**：`tabInteractionTaken`（0 也打）；阳性对照 = `8deeb6c4` 的 `interactions` 真值产出可点击 tab；阴性 = 无 `interactions` 的普通 grid 零位移。

---

## 4. Phase 4 影响面 + A/B/C 风险清单

| 面 | 刀 A | 刀 C |
|---|---|---|
| 直接改动 | `folded-grid-section-takeover.js` 1 处渲染输出（+可选 1 处数据轨）+ 日志聚合 2 处 | 同文件：`detectGridLeaf` 之后新增判据分支 + 渲染 kind + 三处正则登记 |
| 调用方 | `renderFoldedGridLeafVue(:3045)` ← `collectFoldedGridTakeover(:3866)` ← `microcode-engineer.js:2073`（唯一） | 同左，另加 `FG_TAKEOVER_CLASS_RX` 的 3 个消费者：`code-validator.js`、`orphan-style-rule-guard.js`、`style-dedup-guard.js` |
| 管线顺序 | 不新增 pass、不改 W1~W7 顺序；不动共享工具 | 新增 kind 需登记总纲；**改 `:3907` 判据优先级** ⇒ grid 家族全部回归 |
| 双端 | `folded-grid-section-takeover` 为 microcode/vue3 共用的接管渲染器 ⇒ **双端都要验** | 同左，且 `vue3-fg-takeover.spec.ts` 必跑 |
| 共享机制 | 不触 orchestrator / withTimeout / figma-rate-limiter / 限流槽 | 同左 |
| 回归面 | 家族 15 个 spec（`folded-grid-list-takeover.spec.ts` 等）+ 全量两态 | 家族 15 个 + `vue3-fg-takeover.spec.ts` + `code-validator.fg-takeover-classes.spec.ts` + 全量两态 |
| 回滚 | revert 单文件；无数据迁移、无产物格式变更 | 同左 |

**风险分级（交用户授权）**

| 档 | 内容 | 级别 | 说明 |
|---|---|---|---|
| **A** | 只做刀 A（R1 多余底色） | **A 低** | 续接既有 M1 判据，改 1 处渲染输出；证据铁（Figma `fills=[]`）；最可能顺带消除 R2 观感问题 |
| **B** | A + 刀 B 定域（R2 重投复看） | **B 中** | 需重投一发生成任务（属部署/运行范畴，须单独指令） |
| **C** | A + B + 刀 C（tab 交互接管） | **C 高** | 新增 kind、改判据优先级、动三处共享正则与总纲；家族 15+ 套件全回归 |

---

## 5. Phase 5/6 实施与回归预案（未执行）

1. 按授权档位分刀实施，每刀独立 commit（`#code#`）+ 独立定向 spec。
2. 判据阳性：`fgListBgColorMutexSuppressed` / `tabInteractionTaken` 恒打且真机非零（刀 A/C）。
3. 家族回归：`folded-grid-*.spec.ts` 15 套件 + `vue3-fg-takeover.spec.ts` + `code-validator.fg-takeover-classes.spec.ts`。
4. 全量 jest 两态 FAIL diff 为空（同仓 stash 法现建基线，`--runInBand --forceExit`）；`npm run build` EXIT=0。
5. 真机重投 `8deeb6c4` 同一 Figma 节点：三卡无 `#3a4a5c` 底色、tab 可点击切换、字号复核。
6. 写当日 memory；刀 C 登记守卫总纲。

---

## 6. 明确不做

① 不按任务 id / 组件名 / `136122` 特判；② 不直改产物（禁止改 `ListSection.vue` / `TabsSection.vue`）；③ 不新增修补型守卫（避开总纲 `:115`）；④ 不在 R2 未定域前改字号；⑤ 不动 `visual-parser.js:2652`、不动 B′ 的 `resource-mount-plan.js`（两条独立待办）；⑥ 不自行部署/重启/`git push`。
