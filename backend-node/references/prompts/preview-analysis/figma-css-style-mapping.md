# Figma → CSS 样式映射清单

> 本清单定义 Visual Parser 输出中每个元素的 `style` 字段**必须包含的 CSS 属性**，
> 以及下游 Microcode Engineer / Style Mapper 如何消费这些属性。
> 目的：消除"LLM 只输出 fontSize+color，漏掉 width/padding/background 等"的问题。

---

## 一、元素类型 → 必检 CSS 属性

每个元素根据其 `type` 字段，`style` 对象中**必须包含**对应列的属性。
缺失的属性被视为"样式覆盖不全"，Adversarial Checker 将标记为 HIGH。

### 1. 容器/布局类（container, section, panel, area）

| 必检属性 | JSON 字段名 | CSS 属性 | 说明 |
|---------|------------|---------|------|
| ✅ 宽度 | `width` | `width` | 像素值（如 "460px"），不遗漏 |
| ✅ 高度 | `height` | `height` | 像素值（如 "138px"） |
| ✅ 内边距 | `padding` | `padding` | 四值或单值（如 "20px 16px"） |
| ✅ 间距 | `gap` | `gap` | 子元素间距（如 "12px"） |
| ✅ 布局方向 | `layout` | `flexDirection` | "horizontal" → row, "vertical" → column |
| ✅ 水平对齐 | `justifyContent` | `justify-content` | center / space-between / space-around |
| ✅ 垂直对齐 | `alignItems` | `align-items` | center / flex-start / flex-end |
| ✅ 背景 | `background` 或 `resourceFile` | `background` / `backgroundImage` | 纯色用 CSS 色值，图片用 resourceFile |
| ✅ 圆角 | `borderRadius` | `border-radius` | 像素值（如 "8px"），无圆角写 "0" |
| ✅ 溢出 | `overflow` | `overflow` | hidden / visible / scroll |
| ⚡ 边框 | `border` | `border` | "1px solid rgba(255,255,255,0.1)" 等 |
| ⚡ 阴影 | `boxShadow` | `box-shadow` | "0 2px 8px rgba(0,0,0,0.3)" 等 |

### 2. 文本类（text, label, value, title, unit, number）

| 必检属性 | JSON 字段名 | CSS 属性 | 说明 |
|---------|------------|---------|------|
| ✅ 字号 | `fontSize` | `font-size` | 像素值（如 "14px"），**禁止遗漏** |
| ✅ 字重 | `fontWeight` | `font-weight` | bold / normal / 数字（如 700） |
| ✅ 颜色 | `color` | `color` | **必须写明确值**（rgba 或 hex），禁止只写"白色" |
| ✅ 行高 | `lineHeight` | `line-height` | 数字或像素值（如 1.2 或 "20px"） |
| ⚡ 字间距 | `letterSpacing` | `letter-spacing` | 像素值（如 "0.5px"） |
| ⚡ 对齐 | `textAlign` | `text-align` | center / left / right |

### 3. 图标/图片类（icon, img, image, logo）

| 必检属性 | JSON 字段名 | CSS 属性 | 说明 |
|---------|------------|---------|------|
| ✅ 宽度 | `width` | `width` | 像素值（如 "43px"） |
| ✅ 高度 | `height` | `height` | 像素值（如 "44px"） |
| ✅ 资源文件 | `resourceFile` | `img :src` 或 `backgroundImage` | 已下载资源的相对路径 |
| ✅ 资源用法 | `recommendedUsage` | — | imgSrc / backgroundStyle |
| ⚡ 适配模式 | `objectFit` | `object-fit` | contain / cover / fill |
| ⚡ 透明度 | `opacity` | `opacity` | 0~1 |

### 4. 背景类（background, bg）

| 必检属性 | JSON 字段名 | CSS 属性 | 说明 |
|---------|------------|---------|------|
| ✅ 资源文件 | `resourceFile` | `backgroundImage` | 已下载的 bg 图片路径 |
| ✅ 尺寸模式 | `backgroundSize` | `background-size` | cover / contain / 像素值 |
| ✅ 定位 | `backgroundPosition` | `background-position` | center / top left 等 |
| ✅ 重复 | `backgroundRepeat` | `background-repeat` | no-repeat（默认） |
| ✅ 宽度 | `width` | `width` | 容器宽度 |
| ✅ 高度 | `height` | `height` | 容器高度 |

### 5. 装饰类（decoration, base-glow, divider, line）

| 必检属性 | JSON 字段名 | CSS 属性 | 说明 |
|---------|------------|---------|------|
| ✅ 背景/渐变 | `background` | `background` | CSS 渐变值（如 "linear-gradient(...)"） |
| ✅ 宽度 | `width` | `width` | 像素值 |
| ✅ 高度 | `height` | `height` | 像素值（如 "10px"） |
| ✅ 定位 | `position` | `position` | relative / absolute |
| ⚡ 阴影 | `boxShadow` | `box-shadow` | 发光效果等 |
| ⚡ 透明度 | `opacity` | `opacity` | 0~1 |

### 6. 按钮/控件类（button, tab, dropdown, toggle）

| 必检属性 | JSON 字段名 | CSS 属性 | 说明 |
|---------|------------|---------|------|
| ✅ 字号 | `fontSize` | `font-size` | |
| ✅ 颜色 | `color` | `color` | |
| ✅ 背景色 | `backgroundColor` | `background-color` | |
| ✅ 圆角 | `borderRadius` | `border-radius` | |
| ✅ 内边距 | `padding` | `padding` | |
| ⚡ 边框 | `border` | `border` | |

### 7. 图表类（chart, chart-container）

| 必检属性 | JSON 字段名 | CSS 属性 | 说明 |
|---------|------------|---------|------|
| ✅ 宽度 | `width` | `width` | |
| ✅ 高度 | `height` | `height` | |
| ✅ 背景 | `background` | `background` | |

---

## 二、布局类型 → 必检属性

当元素的 `layout` 字段为以下值时，`style` 中必须额外包含：

| layout 值 | 必检属性 | 说明 |
|-----------|---------|------|
| `horizontal` | `flexDirection: "row"`, `alignItems`, `gap` | 子元素横向排列 |
| `vertical` | `flexDirection: "column"`, `alignItems`, `gap` | 子元素纵向排列 |
| `horizontal-*items` | 同 `horizontal` + 子项数量 | 如 `horizontal-4-items` |
| `grid` | `gridColumns` | 网格列数 |
| `mixed` | **必须拆成嵌套子结构** | 如 icon+label 同行 + value 在下行 → 顶层 vertical，子 row horizontal |

### ⚠️ 混合布局识别规则（CRITICAL）

**禁止把混合布局平铺为纯 vertical！**

当观察到：
- icon 和文字在同一行（水平排列）
- 数值在下方（垂直排列）

必须输出嵌套结构：
```json
{
  "layout": "vertical",
  "children": [
    {
      "type": "row",
      "layout": "horizontal",
      "alignItems": "center",
      "children": [
        { "type": "icon", ... },
        { "type": "label", ... }
      ]
    },
    { "type": "value", ... },
    { "type": "base-glow", ... }
  ]
}
```

禁止输出：
```json
{
  "layout": "vertical",
  "children": [icon, label, value, base-glow]
}
```

---

## 三、主题变量 vs 直接值规则

### 核心规则：明确值优先，禁止主题变量覆盖

| 场景 | 正确做法 | 错误做法 |
|------|---------|---------|
| JSON 中有明确 `color: "rgba(255,255,255,0.8)"` | CSS 直接写 `color: rgba(255,255,255,0.8)` | 写 `color: @color-stat-label`（主题变量默认值可能是黑色） |
| JSON 中只有描述"白色文字" | 可以用主题变量 `@color-text-base` | — |
| 深色面板的 label 颜色 | 直接用 JSON 里的 `rgba(255,255,255,0.8)` | 用浅色主题变量 `rgba(0,0,0,0.65)` |

### 什么时候用主题变量？

**只有当 JSON 中没有明确色值，只有描述性文字时**才使用主题变量：
- `"color": "白色"` → 可以用 `@color-text-base`
- `"color": "rgba(255,255,255,0.8)"` → **必须直接写**，禁止替换为变量

### 主题变量的正确默认值

如果组件的 `backgroundBrightness` 是 `"dark"`：
- `@color-stat-label` 默认值必须是 `rgba(255,255,255,0.8)`（白字）
- `@color-stat-value` 默认值必须是 `rgba(255,255,255,1)`（纯白）
- 禁止用浅色默认值（`rgba(0,0,0,...)`）

如果 `backgroundBrightness` 是 `"light"`：
- 默认值用深色文字

---

## 四、属性缺失时的处理

如果某个必检属性在预览图中无法确定：

- **尺寸类**（width/height）：写观察到的估算值，不要写 "auto"
- **颜色类**（color）：写最接近的 rgba/hex 值，不要写 "白色" "蓝色"
- **布局类**（layout/alignItems）：必须根据视觉关系推断，禁止写 "unknown"
- **间距类**（padding/gap）：写合理估算值，禁止写 0 如果视觉上有明显间距
