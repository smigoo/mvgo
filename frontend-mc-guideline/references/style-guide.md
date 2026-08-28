# 样式开发规范

## 样式文件结构

```
resources/styles/
├── index.less           # 入口，@import common 和 themes
├── common.less          # 通用样式（与主题无关）
└── themes/
    ├── theme-vars.less  # 主题变量定义
    ├── dark.less        # 深色主题
    └── light.less       # 浅色主题
```

仅当 `themeConfig` 存在时需要 `themes/` 目录。

> **规范要求**：`themeConfig` 为必须配置项（至少一个主题），`css-vars.js` 为必须文件，`resources/styles/index.less` 为必须文件。

### 业务样式文件规范

**核心原则：所有业务样式必须直接写到 `common.less` 中，不要创建其他业务样式文件。**

**✅ 正确做法：**

- 所有组件的布局、样式、交互样式都写在 `common.less` 中
- 使用注释分段组织样式（如 `// === 设备汇总 ===`）

**❌ 禁止做法：**

- ❌ 禁止创建以组件名命名的样式文件（如 `c-sbjc.less`、`c-traffic.less`）
- ❌ 禁止创建 `variables.less` 文件（变量统一在 `theme-vars.less` 的 mixin 中管理）

**示例：**

```less
// common.less
// === 组件容器 ===
.component-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

// === 设备汇总 ===
.summary-cards {
  display: flex;
  gap: 16px;
}
```

---

## 样式使用规范

### 响应式单位

优先级从高到低：
- `em`：首选，基于组件根字体大小，适合间距、字体
- `$mcCssBuilder.getCssSize(px)`：将设计图 px 转为 rem/px
- `$mcCssBuilder.getCssEm(px)`：将设计图 px 转为 em
- 避免使用大于 5px 的固定 px 值

### 样式隔离

- 必须使用 `<style scoped>` 或 CSS Modules
- 禁止全局样式污染

### CSS 变量使用

```css
.component {
  font-size: @fontSize;
  color: @colorTextBase;
  background: @colorPrimaryBg;
}
```

---

## 框架预设 CSS 变量

**优先使用平台提供的默认变量**

| 变量名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `fontSize` | size | 14px | 基础字体大小 |
| `colorTextBase` | color | #000000 | 基础文字颜色 |
| `colorPrimary` | color | - | 主色调 |
| `colorPrimaryActive` | color | - | 主色调激活态 |
| `colorPrimaryBg` | color | - | 主色调背景 |
| `colorPrimaryBgHover` | color | - | 主色调背景悬浮态 |

---


## css-vars.js 结构

```js
// resources/config/css-vars.js
// 仅当 declare.json 中有 cssVariableConfig 时需要此文件

const common = {
  // 主题无关的变量（字体大小、间距等）
  fontSize: $mcCssBuilder.getCssSize(),
  titleSize: $mcCssBuilder.getCssSize(20),
  colorTextBase: $mcCssBuilder.getConfig('colorTextBase')
}

const dark = {
  // 深色主题变量
  colorPrimary: '#3677f8',
  colorPrimaryBg: '#696969',
  colorTextBase: '#ffffff'
}

const light = {
  // 浅色主题变量
  colorPrimary: '#3677f8',
  colorPrimaryBg: 'transparent',
  colorTextBase: '#011025'
}

export default { common, dark, light }
```

**工具方法说明**：

| 方法 | 描述 | 参数 | 返回值 |
|------|------|------|--------|
| `$mcCssBuilder.getCssSize()` | 获取默认字体大小 | - | 默认字体大小对应的rem或px |
| `$mcCssBuilder.getConfig(key)` | 获取指定配置值 | key: 配置键名 | 配置值 |
| `$mcCssBuilder.getCssSize(number)` | 获取CSS尺寸值 | number: 设计图px尺寸 | 对应的rem或px尺寸 |
| `$mcCssBuilder.getCssEm(number)` | 获取em尺寸值 | number: 设计图px尺寸 | 对应的em尺寸 |

**配置规则**：
1. **通用变量**：不同主题下相同的变量（如字体大小）放在 `common` 中
2. **主题变量**：不同主题下不同的变量（如颜色）分别放在 `dark` 和 `light` 中

---


## theme-vars.less 变量定义规范

**混合模式：CSS 变量 + Less 变量**

### 架构概览

组件使用 **CSS 变量（框架注入） + Less 变量（主题特定）** 的混合模式实现主题切换。

```
theme-vars.less 定义三个 mixin：
  .common()      → 接收框架 CSS 变量（var(--xxx)）
  .theme-dark()  → 深色主题 Less 变量（硬编码值）
  .theme-light() → 浅色主题 Less 变量（硬编码值）

调用顺序：
  .common();        // 全局注入框架变量
  .theme-light();   // 全局默认为浅色（子组件 scoped 可用）
```

### 三个 mixin 的职责

| Mixin | 用途 | 变量类型 | 示例 |
|-------|------|---------|------|
| `.common()` | 接收框架 CSS 变量 | `@var: var(--cssVar);` | `@fontSize: var(--fontSize);` |
| `.theme-dark()` | 深色主题特定变量 | `@var: #hex;` 或 Less 函数 | `@bgColor: #1a1a1a;` |
| `.theme-light()` | 浅色主题特定变量 | `@var: #hex;` 或 Less 函数 | `@bgColor: #ffffff;` |

### 完整示例

```less
// resources/styles/themes/theme-vars.less

// 通用变量：接收框架注入的 CSS 变量
.common() {
  @fontSize: var(--fontSize);
  @fontWeightStrong: var(--fontWeightStrong);
  @colorTextBase: var(--colorTextBase);
  @colorPrimary: var(--colorPrimary);
  @colorPrimaryHover: var(--colorPrimaryHover);
  @colorPrimaryActive: var(--colorPrimaryActive);
  @colorPrimaryBg: var(--colorPrimaryBg);
  @colorPrimaryBgHover: var(--colorPrimaryBgHover);
}
.common();  // 必须调用，使变量全局可用

// 深色主题变量（不通过 CSS 变量传入，使用硬编码值）
.theme-dark() {
  @custom-bg-color: #1a1a1a;
  @custom-border-color: #333333;
  // 如果需要使用 Less 颜色函数，必须使用硬编码值
  @hover-color: lighten(#3677f8, 10%);
}

// 浅色主题变量（不通过 CSS 变量传入，使用硬编码值）
.theme-light() {
  @custom-bg-color: #ffffff;
  @custom-border-color: #e0e0e0;
  @hover-color: darken(#3677f8, 10%);
}
.theme-light();  // 全局默认为浅色主题
```

### 重要约束

#### ✅ 允许的用法

1. **在 `.common()` 中使用 `var(--xxx)` 接收框架 CSS 变量**
   - 支持通过 `cssVariableConfig` 动态配置
   - 框架预设变量（fontSize、colorTextBase、colorPrimary 等）
   - 可在设计器中实时调整

```less
// ✅ 正确：接收框架变量
.common() {
  @fontSize: var(--fontSize);
  @colorTextBase: var(--colorTextBase);
}
.common();
```

2. **在 `.theme-dark()` / `.theme-light()` 中使用 Less 变量或硬编码值**
   - 支持 Less 颜色函数（lighten、darken、saturate 等）
   - 主题特定的固定颜色值

```less
// ✅ 正确：使用硬编码值，支持 Less 函数
.theme-dark() {
  @color-primary: #3677f8;
  @color-hover: lighten(@color-primary, 10%);  // 正常编译
}
```

#### ❌ 禁止的用法

**禁止在需要 Less 颜色函数的地方使用 `var()`** — 会导致编译错误

```less
/* ❌ 错误：Less 颜色函数无法处理 CSS 变量 */
.theme-dark() {
  @color-primary: var(--colorPrimary);
  @color-hover: lighten(@color-primary, 10%);  // 编译报错！
}
```

**原因**：
- `var()` 是运行时 CSS 变量，Less 编译期无法解析
- Less 颜色函数需要在编译期确定颜色值
- 必须使用硬编码的颜色值才能使用 Less 颜色函数

### 使用场景总结

| 场景 | 位置 | 变量类型 | 原因 |
|------|------|---------|------|
| 框架预设变量 | `.common()` | `var(--xxx)` | 支持动态配置，跨组件复用 |
| cssVariableConfig 自定义变量 | `.common()` | `var(--xxx)` | 设计器实时调整 |
| 需要 Less 颜色函数 | `.theme-dark()` / `.theme-light()` | 硬编码值 | 编译期计算颜色 |
| 主题特定固定颜色 | `.theme-dark()` / `.theme-light()` | 硬编码值 | 主题切换时替换 |

---

## 开发建议

- 先设置组件根字体大小，再用 `em` 倍数设置其他尺寸
- 图片资源优先使用 SVG 格式
- 通用样式与主题样式分离，主题相关放 `themes/`，通用放 `common.less`
- 框架变量用 `var(--xxx)` 在 `.common()` 中接收，主题特定颜色用硬编码值在 theme mixin 中定义
- 主题分离：通用样式与主题样式分离，使用 CSS 变量实现主题切换
