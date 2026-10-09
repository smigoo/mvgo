---
name: mc-gen-css-variable-pattern
description: 微码组件 CSS 变量配置规范与最佳实践
type: reference
---

# 微码组件 CSS 变量配置规范

> 🔴 **统一铁律（模式 B）**：`var()` **只允许出现在 `theme-vars.less` 的 `.common()` 映射里**，
> 且**只用于尺寸/字重类框架预设**（`@fontSize: var(--fontSize)`）。
> **业务样式（`common.less` / `layout-xxx.less` / `.vue <style>`）一律写 Less 变量**（`@fontSize` / `@color-xxx`），
> **禁止直接写 `var(...)`**；**颜色值只允许定义在 `.theme-light()` / `.theme-dark()` 内**（两侧都要有、且值必须不同）。
>
> 违反后的门禁后果：
> - `.common()` 里出现颜色变量 → LESS「首个定义者胜出」，主题 mixin 的同名定义被**静默忽略** → 浅/深渲染完全相同（`THEME-COMMON-COLOR-VAR`）；
> - 业务样式直引 `var()` → `--colorTextLight` 这类**臆造名平台不注入**、fallback 恒生效 → 切主题零变化（`THEME-VAR-NAME-MISMATCH`）。

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

> ⚠️ 上表第四列的 `var(--xxx)` 只是**声明名**，只应出现在 `theme-vars.less#.common()` 的映射里。
> **业务样式里要写对应的 Less 变量**（`@fontSize` / `@color-text-base`），**不要写 `var()`** —— 见下文「错误 3」。

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

// ② .common() mixin：只放「跨主题共享 + 尺寸/字重」令牌
.common() {
  @fontSize: var(--fontSize);
  @fontWeightStrong: var(--fontWeightStrong);
  // ❌ 禁止：@color-error / @color-predict-line / @color-tab-bg …（**语义颜色槽位**）
  // ❌ 禁止：@color-xxx: #333333;（**任何字面量色值**）
  //    一旦在这里定义 → LESS「首个定义者胜出」→ .theme-light()/.theme-dark() 的同名定义被静默忽略
  //    → 该颜色在浅/深两侧渲染完全相同（门禁 THEME-COMMON-COLOR-VAR）
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

// 默认主题
.theme-light();
```

### 2. index.less（入口文件）

```less
// ① 引入主题变量定义（包含 CSS 变量映射）
@import './themes/theme-vars.less';

// ② 引入 common.less
@import (multiple) './common.less';

// ③ 按主题引入
@import './themes/dark.less';
@import './themes/light.less';
```

### 3. common.less / layout-xxx.less（样式使用）

```less
.c-component {
  // ✅ 正确：尺寸/字重写 .common() 映射好的 Less 变量
  font-size: @fontSize;
  font-weight: @fontWeightStrong;

  // ✅ 正确：颜色写主题槽位 Less 变量（编译期由 .dark/.light 决定值）
  color: @color-text-base;
  background: @color-bg-container;

  // ❌ 禁止：业务样式直接写 var()
  //    臆造名（--colorTextLight 等）平台不注入 → 恒走 fallback；fallback 写死字面量 → 浅深完全相同
  // font-size: var(--fontSize, @fontSize);
  // color: var(--colorTextBase, @color-text-primary);
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

### ❌ 错误 2：CSS 变量名写成 kebab-case

```less
// ❌ 错误：微码平台注入的是 camelCase
.common() {
  @fontSize: var(--font-size);   // 平台不注入 --font-size
}

// ✅ 正确：camelCase
.common() {
  @fontSize: var(--fontSize);
}
```

> ⚠️ 别搞混两套名字：
> **CSS 变量名**（`var()` 括号里）→ camelCase（`--colorTextBase`）；
> **Less 槽位变量名**（业务样式里）→ kebab（`@color-text-base`）。

### ❌ 错误 3：业务样式直写 `var()`（模式 A 残留）

```less
// ❌ 错误：平台只注入 cssVariableConfig.key 那批名字，
//    臆造名（--colorTextLight / --colorCardBg 等）注入不到 → fallback 恒生效
.c-component {
  color: var(--colorTextBase, @color-text-primary);
}

// ❌ 错误：fallback 写死字面量 —— 浅/深两侧编译结果完全相同，主题开关彻底失效
.c-component {
  color: var(--colorTextBase, #333333);
}

// ✅ 正确：业务样式只写 Less 槽位变量；值由 .theme-light()/.theme-dark() 在编译期决定
.c-component {
  color: @color-text-primary;
}
```

**为什么（三条硬理由）**：
1. `var()` 是**运行期**值 → `lighten()` / `darken()` / `fade()` / `saturate()` 等 Less 颜色函数**无法编译**（业务里想做透明度/明暗派生就做不到）；
2. 平台只注入 `cssVariableConfig.key` 对应的名字，业务里臆造的名字**注入不到** → fallback 恒生效；
3. fallback 一旦写死字面量，**浅/深两侧渲染完全相同**，主题开关等于没有。

> 历史实测：写成 `var(--colorXxx, #ffffff)` 的组件里，**49% 的 CSS 变量名是臆造的**
> （`--colorTextLight` / `--colorCardBg` / `--colorSecondary`…平台根本不注入）。

### ❌ 错误 4：缺少 .common() 调用

```less
// ❌ 错误：定义了 mixin 但没有调用
.common() {
  @colorTextBase: var(--colorTextBase);
}
// 缺少 .common();
```

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
/* 模式 B：颜色的最终值 = .theme-light() / .theme-dark() 的槽位值。
   给组件根节点切换 .dark / .light class，颜色应随之改变 —— 不改变说明主题失效。 */
color: #333333;
```

> ⚠️ 模式 B 的既定取舍：**运行期调整平台颜色配置不再影响颜色**，只影响 `fontSize` 等
> 经 `.common()` 映射的尺寸变量。深浅差异 100% 由编译期两套槽位值保证。

## 校验清单

- [ ] `theme-vars.less` 中有 `.common()` mixin 定义
- [ ] `.common()` 中**没有**语义颜色槽位（`@color-error` 这类）与**字面量色值** ——
      颜色真值只允许在 `.theme-light()` / `.theme-dark()` 内
- [ ] `.theme-light()` 与 `.theme-dark()` 的槽位值**必须不同**（写相同值＝主题开关失效）
- [ ] `.common();` 在文件末尾被调用
- [ ] CSS 变量名使用 camelCase 格式（`--colorTextBase`）
- [ ] 业务样式（`common.less` / `layout-xxx.less` / `.vue <style>`）**禁止**写 `var()`
      （唯一例外：`theme-vars.less#.common()` 的尺寸/字重透传映射）
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
