# 微码组件「一次生成即合规」管线改造方案（2026-09-10）

> 配套：`docs/remaining-issues-remediation-plan-2026-09-10.md` §P0-5（现状与量化）。
> 规范口径：`frontend-mc-check` v1.0.20（`scripts/mc-check.cjs`，M1~M5 五系列）。
> 目标：让管线**写盘即合规**，而不是生成完了再靠人或脚本修补。

---

## 0. 结论先行

1. **头号阻断项 M5-6（68/106）不是模型问题，是自愈层写反了。** LLM 按 prompt 写的是 `font-size: @fontSize`（正确），被后处理改成了 `var(--fontSize, var(--fontSize))`（错误）。
2. **正确形态管线本来就能产出**：`c-device-monitor-l0rxb0x4-c34eb871` 的 `common.less` 就是 `font-size: @fontSize;` / `calc(@fontSize * 1.1429)`，且该项检查通过。它没被改坏，是因为其 `@fontSize` 声明不在 mixin 闭包内 → 未命中替换。
3. 因此**不需要在 A1/A2 之间二选一**（那是产物侧的妥协方案）；管线侧有唯一正解：**保留 `@fontSize`，让 LESS 变量层真正生效**。
4. 修 1 处代码（M5-6）+ 加 1 层合规自愈（其余强制项）+ ID 单一事实源，可让 error 项从 ~140 降到接近 0，可上线率从 11/106 提升到预估 85–95/106。

---

## 1. 根因链（代码级，已实锤）

产物样例对照：

| 组件 | M5-6 | `common.less` 实际写法 |
|---|---|---|
| `c-device-monitor-l0rxb0x4-c34eb871` | ✅ 通过 | `font-size: @fontSize;` / `calc(@fontSize * 1.1429)` |
| `c-device-monitor-malvtjd5-50ae925f` | ✅ 通过（规避） | `calc(var(--fontSize, var(--fontSize)) * 0.857)` —— 因其 `css-vars.js` 未声明 fontSize，规则未触发 |
| `c-device-monitor-25hce807-18cf88ae` | ❌ 失败 | `calc(var(--fontSize, var(--fontSize)) * 0.857)` |

改写链路（三个环节互相打架）：

| # | 位置 | 动作 | 结果 |
|---|---|---|---|
| 1 | `file-writer.js:648-666` | 把 `theme-vars.less` 的 `@fontSize: 14px` 归一为 `@fontSize: var(--fontSize);` | ✅ 正确（规范要求的精确映射） |
| 2 | `code-healer.js:1431-1439` | 把业务样式里的 `@name` 替换为 `var(--${name}, ${def})` | ⚠️ 初衷是修 mixin 作用域不可见导致的 LESS 编译报错 |
| 3 | 上一步的 `def` 取自 `extractMixinScopedVars` | 因第 1 步，`def` 已是 `var(--fontSize)` | ❌ 得到 `var(--fontSize, var(--fontSize))` —— **fallback 指向自己**，且绕过 LESS 变量层 → M5-6 失败 |

**附注**：`file-writer.js:562` 对 **SFC 内嵌 `<style>`** 的缺失变量注入是**对的**（注入 `@fontSize: var(--fontSize);` 声明，保留 `@fontSize` 引用）；同一套正确做法**没有应用到独立的 `.less` 文件**，这才是分叉点。

---

## 2. 改造方案（五层，按依赖顺序）

### L1 — 修反向自愈：让 `.less` 文件也走「注入声明」而非「替换引用」（M5-6，68/106）

**落点**：`backend-node/src/ai-engine/roles/microcode/file-writer.js`，在 666 行（M5-6 归一）之后、678 行（`healThemeMixinVarRefs`）**之前**插入。

**做法**：对 `resources/styles/*.less`（**排除 `themes/`**）：

1. 取 `theme-vars.less` 的 mixin 作用域变量名集合；
2. 若业务 less 文件**顶层未声明**该变量（`isLessVarDeclared`），则在**文件顶部注入**声明：
   ```less
   @fontSize: var(--fontSize);
   ```
   （`fontSize` 固定用 `var(--fontSize)`；其余变量沿用 `safeLessVarValue`）
3. 因顶层已有声明，`code-healer.js:1413-1414` 的 `localDeclared` 会命中 → **自动跳过 var() 替换**，`@fontSize` 得以保留。

**为什么这样是对的**：既满足规范「业务样式实际使用 `@fontSize`」，又满足原有自愈的初衷「LESS 编译不报 variable undefined」，且**不需要改动 `code-healer.js` 的替换逻辑**（风险最小）。

**验收**：新生成组件的 `common.less` 出现 `font-size: @fontSize` 且 LESS 编译通过、M5-6 通过。

### L2 — 加「规范合规自愈层」（唯一漏斗）

**落点**：`backend-node/src/ai-engine/roles/microcode-engineer.js:3936` 之后、`3937` 之前（`writeFiles` 包装层内），插入：

```js
targetFiles = enforceMcSpecCompliance(targetFiles)
```

**为什么放这里**：`microcode-engineer.js:3915 writeFiles()` → `file-writer.js:358` 是**唯一写盘出口**，下游五个调用点（骨架 383 / LLM 产物 5931 / standardFiles 5971 / fixedFiles 6276 / 终态 6473）全部经过；且此处能看到**完整 files**（跨文件规则如 M5-6 需要同时看 theme-vars 与 common.less）。
**不要放 `file-writer.js:744-760`**：那是逐文件处理，缺跨文件上下文。

**职责（能补齐的补齐，不能补齐的 BLOCK 重试，绝不静默放过）**：

| 项 | 手段 | 确定性 |
|---|---|---|
| M2-3 / M4-2 / M4-4 / M4-8 | `css-vars.js` 缺失或导出缺 `common`/`light`/`dark` → 用模板兜底生成（`file-writer.js:1020-1066 buildCssVarsFile` 已存在，直接复用） | ✅ 100% |
| M4-6 `index.less` 被引用 | 主组件 `package/index.vue` 未 `@import` → 确定性注入 | ✅ 100% |
| M5-2 `$mcComponentBuilder` 只调用一次 | 重复调用 → 保留首个、移除多余（并告警） | ✅ 100% |
| M5-6 | 见 L1 | ✅ 100% |
| M1-1 | 见 L3 | ✅ 100% |
| M5-10 硬编码颜色（warning） | 见 L4 的 prompt + 后处理抽变量 | ⚠️ 部分 |

### L3 — ID 单一事实源（M1-1，50/106）

**现状**：`declare.json` 的 `componentId` 由 `normalizeDeclareJson`（`microcode-engineer.js:4004`）产出；最终目录名由 `workspace-preview-publisher.js:692` 读 declare.json 后用 `resolveWorkspaceComponentId:599-618` 决定；而 `resolveUniqueComponentId:712` 在**撞名时追加 `-2/-3`** → 目录名变了、declare.json 没回写 → 必然分叉。

**改法**：撞名重定目录后，**把最终目录名回写 `declare.json` 的 `componentId`**，并在发布链路加断言：两者不一致直接失败（不静默）。稳态单一事实源收敛到 `normalizeDeclareJson` 的输出。

### L4 — 门禁前移 + prompt 与自愈同向

- **门禁前移**：把 `mc-check.cjs` 的 **M 系列 error 规则**做成管线内可调用的校验器（或直接在写盘前 fork 该脚本、只读 JSON），error → BLOCK 并进入重试，与 L0-B 并列。避免「生成通过、投放被拒」。
- **prompt 与自愈同向**：`prompt-builder.js:2300-2304` 已要求 `font-size: @fontSize`（对的），`prompt-builder.js:975` 已有 M5-6 条目。**本次事故的教训是自愈层与 prompt 反向**——新增一条硬原则：**任何自愈都不得把「已经符合规范的形态」改写成不合规形态**。

### L5 — 防回归测试

新增 spec（建议 `src/ai-engine/roles/microcode/__tests__/mc-spec-compliance.spec.ts`）：

1. 构造含 `font-size: @fontSize;` 的 `common.less` + `@fontSize: var(--fontSize);` 的 theme-vars → 走完写盘自愈 → **断言结果仍是 `@fontSize`，且不含 `var(--x, var(--x))`**；
2. 构造缺 `css-vars.js` 的 files → 断言兜底生成且导出 `common/light/dark`；
3. 构造 `$mcComponentBuilder` 出现两次 → 断言收敛为一次；
4. 构造 `componentId ≠ 目录名` → 断言被归一或报 BLOCK。

---

## 3. 检查项 → 改造映射总表

| 检查项 | 命中/106 | 级别 | 管线落点 | 手段 |
|---|---|---|---|---|
| M5-6 `@fontSize` 声明与使用 | 68 | error | `file-writer.js`（666 后） | L1 注入顶层声明，保留 `@fontSize` |
| M1-1 componentId 规范 | 50 | error | `workspace-preview-publisher.js:712` | L3 目录名回写 + 断言 |
| M5-2 `$mcComponentBuilder` 一次 | 14 | error | `enforceMcSpecCompliance` | L2 去重 |
| M4-6 `index.less` 被引用 | 8 | error | `enforceMcSpecCompliance` | L2 注入 import |
| M2-3 / M4-2 / M4-4 / M4-8 css-vars | 6–7 | error | 复用 `buildCssVarsFile` | L2 模板兜底 |
| M5-10 硬编码颜色 | 102 | warning | prompt + 后处理抽变量 | L4（渐进） |
| M5-4 / M3-12 / M3-13 / M3-1 等零散 | 5–7 | error | `enforceMcSpecCompliance` | L2 能补则补，否则 BLOCK |

### M7 类名契约（2026-09-11 新增，P1.6）

同一视觉事实（类名）此前被 5 条变换链各自推导 → 反复复发（lazy 正则截断 3 例 / 资源占位 selector /
`--active` 后缀丢失 / `is-active` 方言 / 基类前缀不一致）。M7 把类名纳入**契约 + 门禁 + 单一写入者**。

| 条款 | 内容 | 级别 | 落点 |
|---|---|---|---|
| **C1** 方言标准 | 修饰符只允许 BEM `--mod`；`is-active`/`active`/`is-on` 等布尔别名必须在写盘前归一为「同元素基类 + `--mod`」 | error | 归一 `utils/class-dialect-normalizer.js`（单一写入者，**必须先于 classFacts 采集**） |
| **C2** 基类形态一致 | 修饰符类必须与**同一元素的基类**同前缀形态（DOM 事实）；复合选择器 `.base.is-active` 同样适用 | error | 门禁 `CODE-024`（fail-closed BLOCK）+ 归一器 R2 |
| **C3** 激活态可命中 | 模板出现的每个修饰符类，样式源必须有对应规则 | error | 门禁 `CODE-024` + 不变量 `I7`（`utils/classname-contract.js` 单一实现） |
| **C4** 无死修饰符规则 | 样式里的修饰符规则必须有模板使用（防被 base 化 / 拼写漂移） | warning | 门禁 `CODE-024-WARN` + `I7` warn |

**判据基准**：DOM 类事实（`utils/class-facts.js#collectClassFacts`）为唯一事实源；各链只消费、不再自行解析模板。
**单一实现**：门禁与不变量共用 `utils/classname-contract.js#checkClassNameContract`（防「门禁放过、不变量报警」双源漂移）。
**审计**：`scripts/classname-writer-audit.mjs` 枚举全部改写类名的模块，新增写者必须登记（禁止绕过归一器）。
**验收**：`scripts/r1-3-acceptance.mjs`（方言计数 / 契约违规 / DOM 命中率），可挂 build 前自检。

### M8 资源契约（2026-09-11 新增，P1.7）

事故 mc-max-1789096764029-13890774：资源映射变量名与模型引用一致（icon1…icon14），
但**注入只认模板使用形态** → script 内 `const deviceIcons = [icon3, icon4, …]` 是盲区
→ 只注入 3 个 import、模型引用 12 个 → 运行时 `icon4 is not defined` 整组件渲染失败；
兜底 T08 `stripUndefinedResourceRefs` 同样只扫模板 → 漏网。（实测原始块 R1 = 24 条）

| 条款 | 内容 | 级别 | 落点 |
|---|---|---|---|
| **R1** 引用即须 import | 引用的资源变量（模板 `${var}` / `:src` / 拼接 / **script 内数组·对象·函数引用**）必须已 import 且事实源登记 | error | 引用驱动补齐 `resource-mounter.ensureResourceImportsForRefs` + 门禁 CODE-025 + 不变量 I8 |
| **R2** 禁止幽灵引用 | 引用既无 import 也不在事实源 → 运行时必然报错 | error | 同上（T08 兜底降级为 `undefined`） |
| **R3** 无孤儿 import | import 了事实源未登记的变量（命名漂移） | warning | CODE-025-WARN |

**事实源**：`utils/resource-facts.js`（引用采集单一实现，模板 + script 双覆盖）；映射 `resourceDomMapping` 为变量名唯一来源。
**注入唯一写者**：引用驱动补齐（不再依赖「模板使用形态」识别）。
**审计**：资源写者一并纳入 `scripts/classname-writer-audit.mjs` 白名单（当前 14 个写者全登记）。

### M9 微码平台骨架完整性（2026-09-11 新增，P1.8）

事故（用户截图）：lite 产物微码检查全红（M2-3/M2-4/M3-5/M3-6/M4-8 + M5-6/M5-7）。
根因：**同一份产物规范被两条链各自实现** —— max 路径产全量骨架，lite 路径自造精简落盘（缺 css-vars.js /
common.less / themes/*，index.vue 亦未引用 styles/index.less）。实测 lite 11/11 全缺 vs max 138 个仅 5–8% 缺。

| 条款 | 内容 | 级别 | 落点 |
|---|---|---|---|
| **S1** 骨架齐备 | 微码产物必须含 config/css-vars.js、common.less、themes/{theme-vars,dark,light}.less、index.less、declare.json、declare.js | error | 生成器 `utils/mc-skeleton.buildMcSkeleton` + 门禁 CODE-026（BLOCK） |
| **S2** 样式入口连通 | index.vue 必须 `@import '../resources/styles/index.less'`（M4-8），且 index.less 引 theme-vars + 调默认主题 + 引 common.less | error | 同上门禁 + lite `prepareMicrocodeVueContent` |
| **S3** 字号契约 | 禁止硬编码 >5px 字号；统一 `var(--fontSize, 14px)` / `calc(var(--fontSize, 14px) * ratio)` | error | `utils/font-size-normalizer.normalizeFontSizeLiterals`（确定性归一，M5-6/M5-7） |

**单一生成器原则**：任何路径（max / lite / 未来新增）都必须调用 `buildMcSkeleton`，禁止自行拼装骨架
（本次 lite 的第二处写者 `writeMicrocodeAssets` 已收口）。
**验收**：`scripts/r1-3-acceptance.mjs` 输出「骨架完整性」统计。

---

## 4. 风险与前置验证

1. **必须先做 LESS 编译验证**：L1 改变了变量解析方式（从 `var()` 直连改为 LESS 变量展开），要在本地构造 3 个样例（含 mixin 内声明、顶层声明、calc 运算）验证编译不报 `variable undefined`。
2. **三样本回归**：改样式生成影响所有新组件，需重跑 env / traffic / device 并肉眼对照视觉（与 P0-1 合并执行，不重复消耗额度）。
3. **存量不回刷**：本次只保证**新增合规**。存量 397 个若要回刷，需单独写一次性脚本并逐组件验证，风险高，建议单独立项。
4. **统计口径**：验收时按 `^c-[a-z0-9-]+$` 过滤目录，否则 hash 名 / `v2-e2e-*` 会污染通过率。

---

## 5. 验收标准

重跑全量扫描（命令见 P0-5「复跑方法」），对比：

| 指标 | 现状 | 目标 |
|---|---|---|
| 合法命名组件可上线率 | 11/106（10.4%） | **≥ 85/106（80%）**，争取 ≥95 |
| M5-6 error | 68 | **0** |
| M1-1 error | 50 | **0** |
| M5-2 / M4-6 error | 14 / 8 | **0** |
| M5-10 warning | 102 | 显著下降（不要求归零） |
| 新生成组件首检 | — | **一次通过** |
