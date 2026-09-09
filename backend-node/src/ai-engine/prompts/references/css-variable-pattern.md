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

```less
.c-component {
  // ✅ 正确：使用 var() + Less 变量回退
  font-size: var(--fontSize, @fontSize);
  font-weight: var(--fontWeightStrong, @fontWeightStrong);
  color: var(--colorTextBase, @color-text-primary);
}
```

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

## 颜色值铁律（2026-09-04 增补，L0-B 门禁 BLOCK 兜底）

> 与 `engineer/shared/style-theme-rules.md` 同源。生成/精修/修订一律遵守：
> **颜色值只允许出现在 theme-vars.less 的主题 mixin 槽位里；业务样式（common.less /
> 布局 less / .vue <style>）一律变量引用，禁止抄写槽位色值字面量。**

| 视觉意图 | 引用写法 | ❌ 禁止 |
|----------|----------|--------|
| 文字 | `color: var(--colorTextBase, #ffffff)` / vue3 `@colorTextBase` | `color: #333333` |
| 主色 | `var(--colorPrimary, ...)` | `background: #1990FF` |
| hover/按压 | `var(--colorPrimaryHover / colorPrimaryActive, ...)` | 各 hover 态再抄一份值 |
| 主色浅底 | `var(--colorPrimaryBg / colorPrimaryBgHover, ...)` | `rgba(主色, 0.12)` |
| 弱化文字 | `inherit` + `opacity: 0.6~0.85` | 另抄灰值 `#666666` |

- ❌ 样式内 `@colorTextBase: #333;` / `--colorPrimary: #fff;`（预设名本地重声明，BLOCK）
- ✅ fallback 写默认主题槽值：`var(--colorX, <槽值>)`；渐变内也可用 `var(--colorPrimary, ...)`
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
