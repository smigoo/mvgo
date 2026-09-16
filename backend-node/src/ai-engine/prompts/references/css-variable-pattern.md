---
name: mc-gen-css-variable-pattern
description: 微码组件 CSS 变量配置规范与最佳实践
type: reference
---

# 微码组件 CSS 变量配置规范

## 核心规则

### 变量命名格式

微码平台将 `cssVariableConfig.key` 转换为 **camelCase** CSS 变量注入。

| declare.json key | CSS 变量 | ❌ 错误写法 | ✅ 正确写法 |
|------------------|----------|------------|------------|
| `fontSize` | `--fontSize` | `--font-size` | `var(--fontSize)` |
| `colorTextBase` | `--colorTextBase` | `--color-text-base` | `var(--colorTextBase)` |
| `fontWeightStrong` | `--fontWeightStrong` | `--font-weight-strong` | `var(--fontWeightStrong)` |
| `colorPrimary` | `--colorPrimary` | `--color-primary` | `var(--colorPrimary)` |
| `colorPrimaryActive` | `--colorPrimaryActive` | `--color-primary-active` | `var(--colorPrimaryActive)` |

**关键区别：**
- ❌ `--font-size`（kebab-case，错误）
- ✅ `--fontSize`（camelCase，正确）

## 文件规范

### 1. theme-vars.less（变量映射）

```less
// ===== 主题变量定义 =====

// ① CSS 变量默认值（在 :root 中定义）
:root {
  --fontSize: 14px;
  --fontWeightStrong: 400;
  --colorTextBase: #011025;
  --colorPrimary: #3677f8;
  --colorPrimaryActive: #3677f829;
  --colorPrimaryBg: transparent;
  --colorPrimaryBgHover: #3677f829;
}

// ② .common() mixin：映射 CSS 变量到 Less 变量（关键！）
.common() {
  @fontSize: var(--fontSize);
  @fontWeightStrong: var(--fontWeightStrong);
  @colorTextBase: var(--colorTextBase);
  @colorPrimary: var(--colorPrimary);
  @colorPrimaryActive: var(--colorPrimaryActive);
  @colorPrimaryBg: var(--colorPrimaryBg);
  @colorPrimaryBgHover: var(--colorPrimaryBgHover);
}
.common();

// ③ 主题特定变量（作为 CSS 变量的回退值）
.theme-dark() {
  @color-text-primary: #ffffff;
  @color-text-secondary: #cccccc;
  // ...
}

.theme-light() {
  @color-text-primary: #333333;
  @color-text-secondary: #666666;
  // ...
}

// 默认主题：必须与面板 backgroundBrightness 一致（深色面板=.theme-dark()，浅色面板=.theme-light()）
.theme-dark();
```

### 2. index.less（入口文件）

> ⚠️ index.less 由系统自动生成，**不要输出**。结构如下（供理解变量可见性）：

```less
// ① 引入主题变量定义（只有 mixin 定义，不产出 CSS）
@import './themes/theme-vars.less';

// ② 根作用域激活默认主题（与面板 backgroundBrightness 一致）
.common();
.theme-dark();

// ③ 根作用域导入业务样式 —— 规则必须落在根作用域，否则真实 DOM 上 0 命中
@import (multiple) './common.less';
```

### 3. common.less / layout-xxx.less（样式使用）

> 🔴 **统一铁律（2026-09-16 定，模式 B）**：**`var()` 只允许出现在 `theme-vars.less` 的
> `.common()` 映射里**。业务样式（common.less / layout-xxx.less / .vue `<style>`）一律写
> **Less 变量**（`@fontSize` / `@color-xxx`），**禁止直接写 `var(...)`**。

```less
.c-component {
  // ✅ 正确：颜色用槽位变量（编译期由 .dark/.light 决定值）
  color: @color-text-primary;
  background: @color-bg-container;

  // ✅ 正确：尺寸/框架预设用 .common() 映射好的 Less 变量（其值是 var(--fontSize)）
  font-size: @fontSize;
  font-weight: @fontWeightStrong;

  // ❌ 禁止：业务样式直接写 var()
  // color: var(--colorTextBase, @color-text-primary);
  // font-size: var(--fontSize, 14px);
}
```

**为什么颜色不用 `var(--colorX, @槽位)`？**

1. `var()` 是运行期值，Less 编译期无法解析 → `lighten()` / `darken()` / `fade()` /
   `saturate()` 等颜色函数**全部报错**，业务里想做透明度/明暗派生就做不到。
2. 纯槽位值编译期确定，Less 函数正常工作。
3. **不依赖宿主注入**：深浅差异由 `.theme-dark()` / `.theme-light()` 两套槽位值保证。
   历史上写成 `var(--colorXxx, #ffffff)` 的组件里，**49% 的 CSS 变量名是臆造的**
   （`--colorTextLight` / `--colorCardBg` / `--colorSecondary`… 平台根本不注入），
   fallback 又是写死字面量 → 深浅两侧渲染完全相同，主题开关完全失效。

> ⚠️ 代价须知：改用纯槽位后，**平台侧运行时调整 CSS 变量不再影响颜色**，只影响
> `fontSize` 等经 `.common()` 映射的尺寸变量。这是模式 B 的既定取舍（规范
> `skills/frontend-mc-guideline/references/style-guide.md` L220-223 有论证）。

## 配置对应关系

### declare.json

```json
{
  "cssVariableConfig": [
    {
      "name": "最广泛的字体大小",
      "key": "fontSize",
      "type": "size",
      "describe": "基础字体大小"
    },
    {
      "name": "最广泛的字体颜色",
      "key": "colorTextBase",
      "type": "color",
      "describe": "基础文字颜色"
    },
    {
      "name": "字体粗细",
      "key": "fontWeightStrong",
      "type": "weight",
      "describe": "字重"
    }
  ]
}
```

### css-vars.js（可选）

```javascript
const common = {
  fontSize: $mcCssBuilder.getCssSize(),
  colorTextBase: $mcCssBuilder.getConfig('colorTextBase'),
  // ...
}

const light = {
  colorTextBase: '#011025',
  // ...
}

const dark = {
  colorTextBase: '#ffffff',
  // ...
}

export default { common, light, dark }
```

## 常见错误

### ❌ 错误 1：空的 .common() mixin

```less
// ❌ 错误：空的 mixin，CSS 变量无法映射到 Less 变量
.common() {
}
.common();
```

### ❌ 错误 2：kebab-case 命名

```less
// ❌ 错误：微码平台注入的是 camelCase
.c-component {
  color: var(--color-text-base);  // 错误！
}

// ✅ 正确：使用 camelCase
.c-component {
  color: var(--colorTextBase);
}
```

### ❌ 错误 3：直接使用静态 Less 变量

```less
// ❌ 错误：不响应 CSS 变量配置
.c-component {
  color: @color-text-primary;
}

// ✅ 正确：使用 CSS 变量，带 Less 变量回退
.c-component {
  color: var(--colorTextBase, @color-text-primary);
}
```

### ❌ 错误 4：缺少 .common() 调用

```less
// ❌ 错误：定义了 mixin 但没有调用
.common() {
  @colorTextBase: var(--colorTextBase);
}
// 缺少 .common();
```

### ❌ 错误 5：把颜色真值写进 .common()（最隐蔽，主题静默失效）

```less
// ❌ 错误：.common() 先定义 → 随后 .theme-dark() 的同名定义被 LESS **静默忽略**
.common() {
  @color-text-primary: #333333;   // 抢跑
}
.theme-light() { @color-text-primary: #333333; }
.theme-dark()  { @color-text-primary: #ffffff; }  // 永远不生效！

// ✅ 正确：.common() 只放「var() 透传映射」+ 非颜色令牌（字号/圆角）
.common() {
  @fontSize: var(--fontSize);
  @colorTextBase: var(--colorTextBase);   // 透传：名字与 cssVariableConfig.key 一致
  @border-radius-base: 4px;
}
.theme-light() { @color-text-primary: #333333; }
.theme-dark()  { @color-text-primary: #ffffff; }
```

**原理**：LESS 的 mixin 变量**不覆盖** caller 作用域已存在的同名变量（**首个定义胜出**，不是「后定义覆盖」）。
`index.less` / `dark.less` / `light.less` 都是 `.common(); .theme-X();` 顺序调用，所以 `.common()` 里
一旦出现颜色槽位名，主题开关就彻底失效（`.dark` 与 `.light` 编译结果完全相同）。

**命名分离是硬要求**：
- CSS 变量（运行期注入）＝ camelCase，与 `cssVariableConfig.key` 同名 → `--colorTextBase`
- theme mixin 槽位（编译期回退真值）＝ 语义 kebab → `@color-text-primary`

两者**禁止同名**。`.common()` 里只允许出现前者的透传映射。

## 颜色值铁律（2026-09-04 增补，L0-B 门禁 BLOCK 兜底；2026-09-16 改为模式 B）

> 与 `engineer/shared/style-theme-rules.md` 同源。生成/精修/修订一律遵守：
> **颜色值只允许出现在 theme-vars.less 的主题 mixin 槽位里；业务样式（common.less /
> 布局 less / .vue `<style>`）一律槽位变量引用，禁止抄写色值字面量，也禁止直接写 `var()`。**

| 视觉意图 | 引用写法 | ❌ 禁止 |
|----------|----------|--------|
| 文字 | `color: @color-text-primary` | `color: #333333` / `var(--colorTextBase, #fff)` |
| 主色 | `background: @color-primary` | `background: #1990FF` |
| hover/按压 | `@color-primary-hover` / `@color-primary-active`（theme-* 各给一份） | 各 hover 态再抄一份值 |
| 主色浅底 | `@color-primary-bg` / `@color-primary-bg-hover` | `rgba(主色, 0.12)` |
| 弱化文字 | `@color-text-secondary`，或 `inherit` + `opacity: 0.6~0.85` | 另抄灰值 `#666666` |

- ❌ 样式内 `@colorTextBase: #333;` / `--colorPrimary: #fff;`（预设名本地重声明，BLOCK）
- ❌ 业务样式直接写 `var(--colorX, ...)`（模式 A 残留，BLOCK）
- ✅ **`.theme-dark()` 与 `.theme-light()` 必须给出不同的槽位值** —— 模式 B 的深浅差异
  **100% 来自这两套槽位**，写成相同值＝主题开关彻底失效（历史上 41% 组件栽在这）
- ✅ 需要透明度 / 明暗派生时直接用 Less 函数：`fade(@color-primary, 30%)`、
  `lighten(@color-primary, 10%)` —— **只有纯槽位值支持，`var()` 不支持**
- 设计专色（图例/状态/数据系列）：可在 theme-* mixin 各给一份深浅槽值并引用；实在无法变量化的专色保持 Figma 真值（WARN 提示，不阻断）

## 调试方法

### 1. 浏览器 DevTools

检查组件根元素是否有 CSS 变量：

```css
/* 期望看到的样式 */
.c-component {
  --fontSize: 16px;
  --colorTextBase: #d81b43;
  /* ... */
}
```

### 2. 控制台日志

在组件中添加调试：

```javascript
const builder = $mcComponentBuilder()
console.log('cssVars:', builder.componentProps?.cssVars)
console.log('colorTextBase:', builder.componentProps?.cssVars?.colorTextBase)
```

### 3. 样式计算检查

在 DevTools 的 "Computed" 面板中检查最终计算值：

```css
/* 最终计算值应随配置变化 */
color: #d81b43; /* 用户配置的颜色 */
```

## 校验清单

- [ ] `theme-vars.less` 中有 `.common()` mixin 定义
- [ ] `.common()` mixin 中映射了所有 `cssVariableConfig` 的 key
- [ ] `.common()` 中**没有**颜色槽位名（`@color-text-primary` 这类 kebab 语义槽）—— 颜色真值只允许在 `.theme-light()` / `.theme-dark()` 内
- [ ] `.common();` 在文件末尾被调用
- [ ] CSS 变量使用 camelCase 格式（`--colorTextBase`）
- [ ] 样式中使用 `var(--key, @fallback)` 形式
- [ ] `declare.json` 包含 `cssVariableConfig` 配置
- [ ] 浏览器 DevTools 能看到 CSS 变量注入到组件根元素

## 快速修复命令

```bash
# 修复 CSS 变量命名（camelCase）
sed -i 's/--color-text-base/--colorTextBase/g' *.less
sed -i 's/--font-size/--fontSize/g' *.less
sed -i 's/--font-weight/--fontWeightStrong/g' *.less

# 添加 .common() mixin 调用检查
grep -n "\.common();" theme-vars.less
```
