# 管线侧改造方案（以 mc-check 为准，check 侧不改）

> 日期：2026-10-12
> 目标：**管线产出 100% 通过 mc-check v1.0.20**，支持多主题 + 自定义主题变量
> 约束：不改判据逻辑（除必要的 ROOT 健壮性），靠管线侧对齐

---

## 0. 实测结论先行：目标可达，且现状已接近

### 结论 1：全绿基准存在

我构造了一个严格按 check 规范写的组件，跑 mc-check：

```
✅ c-align-demo 通过:35 失败:0 ← 允许上线
```

**⇒ 目标不是理论可达，是已实测可达。**

### 结论 2：管线真实产物现在也是全绿的

```
c-aiot-dpjh-bsjd-5831962c   通过:34 失败:0
c-aiot-dpjh-bsjd-e38ee16b   通过:34 失败:0
c-aiot-dpjh-bsjd-9f7bad18   通过:33 失败:0
c-aiot-dpjh-bsjd-13f19781   通过:33 失败:0
c-cba840-cba8407d           通过:33 失败:0
```

**⇒ 管线对 check 基础项（骨架/命名/主题三件套/事件契约）已经对齐了。**

### 结论 3：但「全绿」的代价是 —— 深色主色放弃了设计稿真值

产物的 `css-vars.js`：
```js
const dark = {
  colorTextBase:   '#ffffff',     // ← M4-10 白名单值
  colorPrimary:    '#44E4FF',     // ← M4-10 白名单值（不是设计稿色）
  colorPrimaryBg:  '#414141',     // ← M4-10 白名单值
}
const light = {
  colorTextBase:   '#546881',     // ← 真值（Figma 提取）
  colorPrimary:    '#a6ceff',     // ← 真值
  colorPrimaryBg:  'rgba(166,206,255,0.12)',  // ← 真值
}
```

`theme-vars.less` 的 `.theme-dark()` 同理：3 个核心写死，其余（`color-bg-container`/`color-border`/`color-danger`…）用真值。

**⇒ 现状 = 「dark 三核心固定 + 其余真值」。这是能过检的实用折中，但不是设计稿驱动的多主题。**

---

## 1. 现状与目标的差距（真实待办）

| # | 项 | 现状 | 目标 | 优先级 |
|---|---|---|---|---|
| **A1** | **N 主题覆盖层** | 只产出 `light.less`/`dark.less` | 每个 `themeConfig.list[].key` 一份 | 🔴 P0 |
| **A2** | **`index.less` 按 key import** | 硬编码 2 行 | 动态 N 行（本轮已改，待真机验证） | 🔴 P0 |
| **A3** | **`css-vars.js` 导出每个 key** | 只 `common/light/dark` | 含全部 themeKeys | 🔴 P0 |
| **A4** | **dark 三核心 vs 设计稿真值** | 写死枚举值 | 二选一（见 §3） | 🟡 决策 |
| **A5** | **`cssVariableConfig` 产出** | 管线不产出该字段 | 产出并与 css-vars.js 双向一致 | 🟡 P1 |
| **A6** | **`@fontSize` 写法** | 我今天改成字面量 | **回退为 `var()`**（M5-6 硬要求） | 🔴 P0 |
| **A7** | **字号倍数写法** | 裸乘 `@fontSize * 1.5` 会炸 | 统一 `calc(@fontSize * N)` | 🔴 P0 |
| **A8** | **默认 dark 兜底** | 无 | 用户只给浅色稿时补派生 dark（M3-13） | 🟡 P1 |

---

## 2. A1–A3：主题三件套（多主题的硬门槛）

check 对**每个** `themeConfig.list[].key` 强制三份产物（实测：加一个条目欠 3 份，M2-4/M4-4/M4-5 同时红）：

| check 项 | 产物 | 判据 |
|---|---|---|
| M2-4 | `themes/<key>.less` | `mc-check.cjs:238-249` |
| M4-4 | `css-vars.js` 导出 `common` + 每个 key | `:689-703` |
| M4-5 | `index.less` 含 `<key>.less` 子串 | `:745-756` |

**管线改动**：

```
A1  microcode-engineer.js:4871  _collectNThemeKeys(themeMeta) → 逐 key 生成 <key>.less
    ⚠️ 已写但取值链有洞：themeMeta 来自 input.styleTokens?.themeMeta，
       需确认 generateCode 是否真的把 styleTokens 透传进来（否则恒空 ⇒ 退化 2 主题）
A2  code-healer.js:1041  buildIndexLessTemplate(bg, emit, themeKeys)  ✅ 本轮已改
A3  file-writer.js:1302  buildCssVarsFile 需按 themeKeys 循环产出 const <key> + 导出
```

**A1 的取值链必须先验证**（我之前已栽过一次：写了但 `themeMeta` 取不到，静默退化）。

---

## 3. A4：dark 主色要不要设计稿真值？（**唯一决策点**）

### 现状（可行但打折）

dark 三核心写死枚举值 → 过 M4-10，但**深色主题的视觉不是用户设计稿定的**。

### 两个选项

| | 选项 1：保持枚举（现状） | 选项 2：真值 + 产物内标记豁免 |
|---|---|---|
| 是否改 check | 不改 | 需在 M4-10 加约 20 行分叉 |
| dark 主色 | 固定 `#44E4FF` | 设计稿真值 |
| 多主题保真度 | ❌ 深色侧失真 | ✅ |
| 改动范围 | 无 | check 侧（但**已验证可行**，我们本地曾有实现） |

**我的建议：分两步。**

1. **短期**：保持现状（枚举），先把 A1–A3、A6–A8 做掉 —— 这些是「多主题能不能跑起来」的问题，与 A4 无关。
2. **中期**：与微码方谈 A4（已写进沟通材料第 4/5 条）。若对方支持，我们再改判据。

⚠️ **不要在 A4 未定前把 dark 改成真值** —— 会立刻让所有新产物 M4-10 红灯。

---

## 4. A6/A7：字号写法（**我今天改错了，必须回退**）

### 现状问题

我今天加的 `deVarMathLessVars` / `MATH_OPERAND_VARS` 把 `@fontSize` 降成字面量 —— 编译能过，但**违反 M5-6**（`mc-check.cjs:1122-1134` 正则硬要求 `@fontSize: var(--fontSize)`）。

而且实测发现：现在产物之所以还能 0 失败，是因为 `LESS 变量检查器` 又把 `var()` 写回去了 —— 两处互相覆盖，谁最后跑谁赢。

### 正确解法（回退 + 补写法规范）

| 改动 | 内容 |
|---|---|
| **A6** | `deVarMathLessVars` 与 `MATH_OPERAND_VARS`：**移除对 `fontSize` 的字面量化**（或整体回退），恢复 `@fontSize: var(--fontSize)` |
| **A7** | 在 prompt 与自愈器里统一：字号倍数必须写 **`calc(@fontSize * N)`**，禁裸乘 |
| 验证 | `calc(@fontSize * 1.5)` + `@fontSize: var(--fontSize)` ⇒ LESS ✅ / M5-6 ✅（双通过，已实测） |

**保留的部分**：`lineHeight`/`borderRadius`/`spacing` 等**不参与 Less 算术**的变量，`var()` 透传无害；M5-6 只查 `fontSize`，所以只改这一个即可。

---

## 5. A5：`cssVariableConfig`（自定义主题变量）

### check 侧有 3 项，但有 3 个洞

| 项 | 判定 |
|---|---|
| M3-6 | 每项有 `name`/`key`/`type`，`type` ∈ 枚举 |
| M3-7 | 声明的 key 必须在 css-vars.js 出现 |
| M3-8 | css-vars.js 的非框架变量必须都在 cssVariableConfig 声明 |

**洞（实测）**：
1. `cssVariableConfig` **整段可省略**（`:393` 守卫）⇒ 不声明则三项都不查；
2. **`extractCssVarsKeys` 只扫 `['common','dark','light']`**（`:1034`）⇒ 自定义主题（`dusk_mode`）里的变量 **M3-7 看不见**（实测报「缺失」）；
3. **色值零判据**（M3-6 只查 type 字符串）⇒ 自定义变量色值可自由取真值。

### 管线侧可行做法（不改 check）

**关键洞察：把自定义变量放在 `common` 里，而不是放在第 3+ 个主题对象里。**

```js
// css-vars.js
const common = {
  fontSize: $mcCssBuilder.getCssSize(),
  accentColor: '#4B7BEC'      // ← 自定义变量放这里，M3-7/M3-8 才看得见
}
```
✅ 已在本轮全绿基准里验证过（`accentColor` 放 common，M3-6/7/8 全过）。

**⇒ A5 的实现**：
- `cssVariableConfig[]` 从 `styleTokens` 的显著色派生（排除 3 个核心与其他框架预设）；
- 同源写入 css-vars.js 的 `common`（**保证 M3-7/M3-8 天然一致**，不要分两处生成）；
- 预留 `layoutTypes` 字段（多布局扩充位）。

⚠️ **多主题变量分域暂时做不到**（洞 2）。若后续要「第 3 个主题专属变量」，需要微码方放宽 `:1034`。

---

## 6. A8：默认 dark 兜底

用户只提供一份浅色稿时，M3-13 强制要求 `themeConfig.list` 含 `key="dark"`。

**管线做法**：由浅色真值**确定性派生** dark（已有能力：`buildStyleTokens` 的派生算法），并在 `themeConfig` 写 `derived: true` 之类标记（仅留痕，不参与判据）。

---

## 7. 落地顺序

```
第 1 步：A1 取值链验证（确认 styleTokens.themeMeta 能到 _buildBootstrapStyleFiles）
         └─ 这是我栽过的坑：不验证就会「写了但没执行」
第 2 步：A6 回退 fontSize 字面量化 + A7 统一 calc 写法   ← 越早越好，当前是错的
第 3 步：A1/A3 补齐 N 主题覆盖层与 css-vars 导出
第 4 步：A2 真机验证（跑一次真实生成 + mc-check）
第 5 步：A5 cssVariableConfig（同源写 common）+ A8 dark 兜底
第 6 步：加 verify:mc-check-align 脚本做回归护栏
```

### 建议新增的护栏脚本

```bash
npm run verify:mc-check-align
# 对最近 N 个产物逐个 spawn mc-check --component-path，
# 断言 error 项数 = 0；按检查项 ID 聚合输出 Top-N
```

**这一步很关键**：mc-check 不在生成链路里（只有前端按钮手动触发），没有自动护栏的话，回归全靠人记。

---

## 8. 需要微码方确认的（不阻塞，但影响上限）

| # | 问题 | 影响 |
|---|---|---|
| 1 | `extractCssVarsKeys` 能否按 `themeConfig.list[].key` 动态扫描 | 决定「自定义变量能否按主题分域」 |
| 2 | M4-10 能否对设计稿真值豁免 | 决定「深色主色能否用真值」 |
| 3 | 业务样式字号倍数能否规范为 `calc(@fontSize * N)` | 决定 M5-6 与编译能否共存（我方已实测可共存） |

> 第 3 条我们已有实测结论，可直接附证据给对方。