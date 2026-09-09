## 🎨 样式颜色主题变量铁律（生成即规范，2026-09-04）

> 平台按主题（浅色/深色）切换时，通过 CSS 变量把对应主题色注入组件（宿主在组件根/`:root`
> 写入 `--colorTextBase` 等）。**样式里凡是想"随主题切换/可在设置面板调色"的颜色，
> 必须写变量引用；直接抄写颜色值 = 切主题零生效，会被 L0-B 门禁 BLOCK。**

### 1. 颜色值只能出现在主题槽位里

- ✅ **theme-vars.less 的 `.theme-light()` / `.theme-dark()` mixin 内**（每主题一份 `#hex`/`rgba` 槽值）——
  这是**唯一**允许直接写颜色值的位置。
- ❌ common.less / 布局 less / `.vue` 的 `<style>` 内**禁止**直接写 `#hex` / `rgb()` / `rgba()` 字面量。

### 2. 样式消费形态（二选一，产物编译后等价）

| 管线 | 写法 | 说明 |
|------|------|------|
| microcode | `color: var(--colorTextBase, #ffffff);` | `var()` 直引，fallback 填默认主题槽值 |
| vue3 | `color: @colorTextBase;` | mixin 接收变量（.common() 内 `@colorTextBase: var(--colorTextBase, #fff)`），编译后即 var() |

- 整体值为 `var(--x, <fallback>)` 合法；禁止把颜色写成局部变量再手抄：
  - ❌ `.vue`/common.less 内 `@colorTextBase: #333333;`（会覆盖 .common() mixin 接收变量，已实测 BLOCK）
  - ❌ `.vue`/common.less 内 `--colorPrimary: #fff;`（自定义属性覆盖框架预设）

### 3. 语义槽位对照（按语义选，不要按色值选）

| 视觉意图 | 槽位 | 默认（深色主题） |
|----------|------|------------------|
| 正文/标题文字 | `var(--colorTextBase)` | #ffffff |
| 强调文字 / 链接 / active 色块 | `var(--colorPrimary)` | #44E4FF |
| hover 态主色 | `var(--colorPrimaryHover)` | #78ECFF |
| 按压/选中态主色 | `var(--colorPrimaryActive)` | #00BBFF |
| 主色浅底（选中底/标签底/弱强调底） | `var(--colorPrimaryBg)` | #414141 |
| 主色浅底 hover | `var(--colorPrimaryBgHover)` | #4B4B4B |
| 基准字号 | `var(--fontSize)` | — |
| 字重强调 | `var(--fontWeightStrong)` | — |

- **次要/弱化文字**：继承 `var(--colorTextBase)` + `opacity`（0.6~0.85）弱化，不要另抄一个灰值
  —— 深浅主题都自适应，且不会出现"深色主题下灰字看不清"。
- **需要独立深浅两值的专色**（图例/功能/装饰线等）：在 `.theme-light()` 与 `.theme-dark()`
  mixin 内各给一份同名槽值并让样式引用（vue3：同名 mixin 变量；microcode：无宿主类覆盖机制，
  专色保持 Figma 真值即可，属允许的 WARN 场景，勿臆造变量）。
- 渐变/阴影里若要带主题色：渐变内可直接写 `var(--colorPrimary, #44E4FF)`（CSS 合法）。

### 4. 硬性清单（L0-B 门禁会检查）

- [ ] common.less 与所有 `.vue <style>` 中没有裸颜色值（背景/边框/文字色一律 var/@ 变量引用）
- [ ] 没有 `@colorTextBase:` / `--colorPrimary:` 这类框架预设名本地重声明
- [ ] 深浅主题的槽值差异全部收口在 theme-vars.less 的 theme-* mixin
- [ ] 默认（fallback）色值与当前默认主题槽值一致（不闪变）
