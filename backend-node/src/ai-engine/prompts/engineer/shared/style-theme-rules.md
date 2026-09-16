## 🎨 样式颜色主题变量铁律（生成即规范，2026-09-04；2026-09-16 改为模式 B）

> **模式 B（编译期差异化）**：深浅差异由 `.theme-light()` / `.theme-dark()` 两套槽位值，
> 配合 `&.light` / `&.dark` 作用域，在**编译期**决定。业务样式一律引用 **Less 槽位变量**。
> 不依赖宿主运行时注入 CSS 变量。
> 规范出处：`skills/frontend-mc-guideline/references/style-guide.md` L161-241。

### 1. 颜色值只能出现在主题槽位里

- ✅ **theme-vars.less 的 `.theme-light()` / `.theme-dark()` mixin 内**（每主题一份 `#hex`/`rgba` 槽值）——
  这是**唯一**允许直接写颜色值的位置。
- ❌ common.less / 布局 less / `.vue` 的 `<style>` 内**禁止**直接写 `#hex` / `rgb()` / `rgba()` 字面量。
- ❌ **theme-vars.less 的 `.common()` mixin 内同样禁止颜色槽位**（如 `@color-text-primary: #333333;`）：
  `.common()` 在 `.theme-X()` **之前**调用，会**抢先定义**同名变量 → 随后的 `.theme-dark()` 被 LESS
  静默忽略（mixin 变量**不覆盖** caller 已有同名变量，首个定义胜出）→ 深浅主题编译结果完全相同、
  切主题零失效。`.common()` 只放 `@fontSize: var(--fontSize)` 这类 var() 透传映射 + 字号/圆角等非颜色令牌。

### 2. 样式消费形态（统一：Less 槽位变量）

> 🔴 **`var()` 只允许出现在 `theme-vars.less` 的 `.common()` 映射里。**
> 业务样式一律写 **kebab 槽位变量**，禁止直接写 `var()`。

| 场景 | 写法 | 说明 |
|------|------|------|
| 颜色 | `color: @color-text-primary;` | 槽位值由 `&.dark` / `&.light` 作用域在编译期决定 |
| 尺寸/字重 | `font-size: @fontSize;` | `.common()` 内已映射为 `var(--fontSize)`，运行期仍可响应平台配置 |

- ✅ 需要透明度 / 明暗派生：**用 Less 函数**，纯槽位值才支持
  `fade(@color-primary, 30%)` / `lighten(@color-primary, 10%)` / `darken(...)`
- ❌ 业务样式写 `var(--colorTextBase, #ffffff)`（模式 A 残留，BLOCK）
- ❌ `.vue` / common.less 内 `@colorTextBase: #333333;` / `--colorPrimary: #fff;`
  （框架预设名本地重声明，BLOCK）

**为什么不再用 `var(--colorX, fallback)`？**

1. `var()` 是运行期值，Less 编译期无法解析 → `lighten()` / `darken()` / `fade()` / `saturate()`
   **全部报错**，业务里做透明度 / 明暗派生就做不到。
2. 历史上 **49% 的组件臆造了平台根本不注入的变量名**（`--colorTextLight` / `--colorCardBg` /
   `--colorSecondary` / `--colorSecondaryText` …），fallback 又是写死字面量 → 深浅两侧渲染
   完全相同，主题开关彻底失效。

### 3. 语义槽位对照（按语义选，不要按色值选）

| 视觉意图 | 槽位变量 | 深色建议值 | 浅色建议值 |
|----------|----------|-----------|-----------|
| 正文/标题文字 | `@color-text-base` | #ffffff | #333333 |
| 次要/弱化文字 | `@color-text-secondary` | rgba(255,255,255,.8) | #666666 |
| 强调文字 / 链接 / active 色块 | `@color-primary` | #44E4FF | #0c9d60 |
| hover 态主色 | `@color-primary-hover` | #78ECFF | #10cc7d |
| 按压/选中态主色 | `@color-primary-active` | #00BBFF | #086e43 |
| 主色浅底 | `@color-primary-bg` | #414141 | rgba(12,157,96,.1) |
| 主色浅底 hover | `@color-primary-bg-hover` | #4B4B4B | rgba(12,157,96,.16) |
| 容器背景 | `@color-bg-container` | #1f1f1f | #ffffff |
| 边框 | `@color-border` | #4b4b4b | #e8e8e8 |
| 基准字号 | `@fontSize` | — | — |
| 字重强调 | `@fontWeightStrong` | — | — |

- 🔴 **深色列与浅色列必须给出不同的值** —— 模式 B 的深浅差异 **100% 来自这两列**，
  写成相同值＝主题开关彻底失效（历史上 41% 组件栽在这）。
- **次要/弱化文字**：用 `@color-text-secondary`，或继承文字色 + `opacity`（0.6~0.85）弱化，
  不要另抄一个灰值 —— 深浅都自适应，不会出现"深色主题下灰字看不清"。
- **需要独立深浅两值的专色**（图例/功能/装饰线等）：在 `.theme-light()` 与 `.theme-dark()`
  mixin 内各给一份同名槽值并让样式引用 —— **microcode 与 vue3 都支持**，靠 `&.light`/`&.dark` 作用域。

### 4. 硬性清单（L0-B 门禁会检查）

- [ ] common.less 与所有 `.vue <style>` 中没有裸颜色值（一律 `@color-xxx` 槽位引用）
- [ ] common.less 与 `.vue <style>` 中**没有** `var(--colorX, ...)` 直引（模式 A 残留）
- [ ] 没有 `@colorTextBase:` / `--colorPrimary:` 这类框架预设名本地重声明
- [ ] 深浅主题的槽值差异全部收口在 theme-vars.less 的 theme-* mixin
- [ ] **`.theme-dark()` 与 `.theme-light()` 对应槽位值不完全相同**
- [ ] `.common()` 内**没有**颜色槽位名（只允许 `@fontSize: var(--fontSize)` 这类 var() 透传映射与非颜色令牌）
      —— 否则 theme-* mixin 被静默忽略、切主题零生效
