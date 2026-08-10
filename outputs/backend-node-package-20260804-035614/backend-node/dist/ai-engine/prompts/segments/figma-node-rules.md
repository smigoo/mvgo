# Figma 节点处理规则

## 1. bg（背景）节点处理规则

### 🔴 容器型 bg 节点识别

**识别模式：**
```text
slot-con (内容容器, GROUP/FRAME)
├── bg (FRAME, fills: [])           ← 容器型背景节点
│   ├── xxx (RECTANGLE, fills: [{type: IMAGE}])
│   └── yyy (VECTOR, fills: [{type: GRADIENT}])
└── list (内容区域)
```

**处理方式：**
1. **识别 bg 为内容容器的背景层**，不是独立 DOM 元素
2. **将 bg 子节点中的图片资源应用到父容器的 CSS `background-image`**
3. **不要在内容区生成独立的 `bg` DOM 元素**
4. **如果 bg 包含多层（底色 + 纹理），按 Figma 层级顺序合并为 CSS 多背景层**

**正确示例：**
```vue
<!-- ✅ 正确：slot-con 作为内容容器，通过 CSS 应用背景 -->
<div class="slot-con" :style="{ backgroundImage: `url(${bgImage})` }">
  <div class="list">
    <!-- 内容 -->
  </div>
</div>
```

```less
// ✅ 正确：CSS 多背景层
.slot-con {
  background-image: url('../images/bg-texture.png'), url('../images/bg-base.png');
  background-size: 100% 100%, cover;
  background-position: center, center;
  background-repeat: no-repeat, no-repeat;
}
```

**错误示例：**
```vue
<!-- ❌ 错误：生成独立的 bg DOM 元素 -->
<div class="slot-con">
  <div class="bg">  <!-- 禁止！应该作为 CSS background -->
    <img :src="bgImage" />
  </div>
  <div class="list">...</div>
</div>
```

### bg 节点类型判断

| bg 节点特征 | 处理方式 |
|-----------|---------|
| `type: RECTANGLE` + `fills: SOLID` | CSS `background: #RRGGBB` |
| `type: ELLIPSE` + `fills: SOLID` | CSS `border-radius: 50%; background: #RRGGBB` |
| `type: VECTOR` + `fills: SOLID` | **下载为图片**，`background-image: url(...)` |
| `type: RECTANGLE` + `fills: IMAGE` | 下载为图片，`background-image: url(...)` |
| `type: RECTANGLE` + `fills: GRADIENT_*` | CSS `background: linear-gradient(...)` |
| `type: VECTOR` + `fills: []` + `strokes: N` | **有描边的装饰线** → 用 CSS gradient 模拟或下载为图片 |

### 🔴 细长型 bg 定位规则

当 bg 节点尺寸与父容器尺寸差异较大时，**必须精确定位**：

| bg 尺寸 vs 父容器 | background-position | background-size | background-repeat |
|------------------|---------------------|-----------------|-------------------|
| bg 宽度 = 父容器宽度，高度 << 父容器高度 | `center bottom` | `100% {bg高度}px` | `repeat-x` |
| bg 高度 = 父容器高度，宽度 << 父容器宽度 | `left center` | `{bg宽度}px 100%` | `repeat-y` |
| bg 尺寸 << 父容器，居中 | `center center` | `{bg宽度}px {bg高度}px` | `no-repeat` |

**示例（底部装饰条 405x7，父容器 405x36）：**
```css
.stat-row {
  background-image: url('../resources/images/xxx.png');
  background-position: center bottom;  /* 定位到底部 */
  background-size: 100% 7px;          /* 宽度铺满，高度固定 7px */
  background-repeat: repeat-x;         /* 水平重复 */
}
```

### backgroundSize 精确计算规则

**必须根据 Figma 原始尺寸与父容器尺寸的比例计算：**

```javascript
widthRatio  = bgNode.box.width  / parentFrame.box.width
heightRatio = bgNode.box.height / parentFrame.box.height
```

| 场景 | 判断条件 | backgroundSize |
|------|---------|---------------|
| 完全匹配 | `0.9 <= 两比值 <= 1.1` | `100% 100%` |
| 细长横条 | `heightRatio < 0.3` 且 `widthRatio >= 0.8` | `100% auto` |
| 细长竖条 | `widthRatio < 0.3` 且 `heightRatio >= 0.8` | `auto 100%` |
| 小图标/装饰 | 两比值均 `< 0.5` | `contain` |
| 大图背景 | 任一比值 `> 1.2` | `cover` |
| 重复纹理 | 父容器 >> 背景图 | `auto` + `backgroundRepeat: 'repeat'` |

---

## 2. icon（图标）节点处理规则

### 资源引用路径规则

| 资源类型 | 实际存放目录 | 代码中 import 路径 | 使用方式 |
|---------|-------------|-------------------|---------|
| 图标 (icon-xxx) | `resources/images/` | `../../resources/images/icon-xxx.png` | `<img>` 标签 |
| 背景图 (bg-xxx) | `resources/images/` | `../../resources/images/xxx.png` | CSS `background-image` |

### 背景图与图标使用区分

| 资源类型 | 文件特征 | 使用方式 | 存放目录 |
|---------|---------|---------|---------|
| 背景图 (bg) | 文件名含 `bg`, `slot-`, `frame` | CSS `background-image` | `resources/images/` |
| 图标 (icon) | 文件名含 `icon`, 小尺寸 | `<img>` 标签 | `resources/images/` |

**正确示例：**
```javascript
// ✅ 正确：图标从 images 导入，使用 img 标签
import icon from '../../resources/images/icon-slot-sub-header-3441.png'

// ✅ 正确：背景图从 images 导入，使用 CSS background
import bg from '../../resources/images/slot-frame1280-8835.png'
```

**错误示例：**
```javascript
// ❌ 错误：图标使用 img 标签但路径错误（缺少 icon- 前缀）
import icon from '../../resources/images/slot-sub-header-3441.png'

// ❌ 错误：背景图使用 img 标签
<img :src="bgImage" class="card-bg">
```

### Preview 阶段 icon 占位规则

**Preview 阶段不能填入真实图标，但必须留好占位：**

```vue
<!-- TODO[figma]: 图标待补 -->
<div class="card-header card-header__has-bg">
  <span class="card-header-icon" />  <!-- TODO[figma]: 图标待补 -->
  <span class="card-header-text">{{ tunnelName }}</span>
</div>
```

```css
.card-header-icon {
  width: 24px;   /* 预留尺寸 */
  height: 24px;
  /* TODO[figma]: 图标背景图 */
}
```

---

## 3. image 节点处理规则

### 🔴 尺寸必须来自 Figma 数据

**禁止使用图片原始像素尺寸，必须使用 Figma 设计尺寸。**

### 数据来源优先级

**优先级 1：resource-dom-mapping.json**
```json
{
  "resourceFile": "resources/images/img-6311.png",
  "figmaNodeId": "1:6311",
  "figmaBox": {
    "width": 76,    // ← 必须使用此值
    "height": 31    // ← 必须使用此值
  }
}
```

**优先级 2：dom-figma-mapping.json**
```json
{
  "figmaId": "1:6311",
  "figmaData": {
    "absoluteBoundingBox": {
      "width": 76,
      "height": 31
    }
  }
}
```

### 代码标注要求

**所有尺寸必须在注释中标注 Figma 节点 ID：**

```css
.rescue-vehicle {
  width: 76px;   /* Figma 1:6311: figmaBox.width */
  height: 31px;  /* Figma 1:6311: figmaBox.height */
}
```

**常见错误：**
```css
/* ❌ 错误：使用图片原始尺寸 152px，而非 Figma 设计尺寸 76px */
.rescue-vehicle {
  width: 152px;  /* 图片文件的实际像素 */
  height: 62px;
}

/* ✅ 正确：使用 Figma 设计尺寸并标注来源 */
.rescue-vehicle {
  width: 76px;   /* Figma 1:6311: figmaBox.width */
  height: 31px;  /* Figma 1:6311: figmaBox.height */
}
```

---

## 4. @技术栈节点处理规则

### @echarts 节点

**节点命名含 `@echarts/xxx` 时，使用 ECharts 对应组件：**

| Figma 节点名 | 含义 | ECharts 处理 |
|-------------|------|-------------|
| `@echarts/legend` | 图例组 | 使用 ECharts `legend` 配置 |
| `@echarts/pie` | 饼图 | 使用 ECharts `series[{type: 'pie'}]` |
| `@echarts/line` | 折线图 | 使用 ECharts `series[{type: 'line'}]` |
| `@echarts/bar` | 柱状图 | 使用 ECharts `series[{type: 'bar'}]` |

**处理示例：**
```javascript
// Figma 节点: @echarts/legend
// → 查找色块节点尺寸
legend: {
  data: ['北京方向', '上海方向'],
  itemWidth: 12,    // ← 来自 Figma 色块宽度
  itemHeight: 12,   // ← 来自 Figma 色块高度
  right: 0,
  top: 0,
  orient: 'horizontal'
}

// Figma 节点: @echarts/pie 下有 Ellipse
// → 按 Ellipse 比例推算 radius
series: [{
  type: 'pie',
  radius: ['45%', '70%']  // 基于 Figma Ellipse 尺寸比例
}]
```

### @antd 节点

**节点命名含 `@antd/xxx` 时，使用 ant-design-vue 对应组件（项目已全局注册，直接使用 `<a-xxx>` 标签）：**

| Figma 节点名 | ant-design-vue 组件 | 典型场景 |
|-------------|---------------------|---------|
| `@antd/button` | `<a-button>` | 操作按钮、提交按钮 |
| `@antd/input` | `<a-input>` / `<a-textarea>` / `<a-input-password>` | 文本输入 |
| `@antd/select` | `<a-select>` | 下拉选择器 |
| `@antd/table` | `<a-table>` | 数据表格 |
| `@antd/date-picker` | `<a-date-picker>` / `<a-range-picker>` | 日期选择 |
| `@antd/switch` | `<a-switch>` | 开关切换 |
| `@antd/radio` | `<a-radio-group>` + `<a-radio>` | 单选组 |
| `@antd/checkbox` | `<a-checkbox-group>` + `<a-checkbox>` | 多选组 |
| `@antd/form` | `<a-form>` + `<a-form-item>` | 表单容器 |
| `@antd/modal` | `<a-modal>` | 弹窗 |
| `@antd/tabs` | `<a-tabs>` + `<a-tab-pane>` | 标签页 |
| `@antd/cascader` | `<a-cascader>` | 级联选择 |
| `@antd/tree-select` | `<a-tree-select>` | 树形选择 |
| `@antd/upload` | `<a-upload>` | 文件上传 |
| `@antd/pagination` | `<a-pagination>` | 分页 |

**⚠️ 样式覆盖规则（强制）**：

组件使用 `<style lang="less" scoped>`，antd 组件内部 DOM（`.ant-xxx` 类名）不携带 `data-v-xxx` 属性，直接写 `.ant-xxx` 选择器**不生效**。覆盖 antd 样式**必须使用 `:deep()`**：

```less
/* ✅ 正确 */
:deep(.ant-btn) { border-radius: 4px; }
:deep(.ant-input) { background: transparent; border-color: var(--border-color); }
:deep(.ant-select-selector) { background: transparent; }
:deep(.ant-table-thead) { background: rgba(0, 0, 0, 0.3); }
:deep(.ant-table-tbody > tr > td) { border-bottom: 1px solid var(--border-color); }

/* ❌ 错误 — scoped 下不生效 */
.ant-btn { border-radius: 4px; }
.ant-input { background: transparent; }
```

**默认技术栈规则**（即使 Figma 节点名未标注 `@antd/xxx`）：
- **表单组件**（输入框、下拉选择、日期选择、开关、单选、多选）→ 默认使用 ant-design-vue 对应组件
- **数据表格** → 默认使用 `<a-table>`
- **图表** → 默认使用 ECharts（`echarts.init()` + `ResizeObserver` + `watch(chartRef)`）
- antd 组件样式需匹配 Figma UI 效果时，必须用 `:deep(.ant-xxx)` 覆盖

---

## 检查清单

### bg 节点自检
- [ ] 容器型 bg 节点是否应用到父容器的 CSS background？
- [ ] bg 节点是否生成了独立的 DOM 元素（禁止）？
- [ ] 细长型 bg 是否设置了精确的 position/size/repeat？
- [ ] backgroundSize 是否按比例计算，而非固定 `100% 100%`？

### icon 节点自检
- [ ] 图标文件是否从 `resources/images/` 导入？
- [ ] 图标是否使用 `<img>` 标签而非 CSS background？
- [ ] 背景图是否从 `resources/images/` 导入？
- [ ] 背景图是否使用 CSS background 而非 `<img>` 标签？

### image 节点自检
- [ ] 图片尺寸是否来自 Figma `figmaBox` 而非图片原始像素？
- [ ] 是否添加了 `/* Figma X:YYYY: fieldName */` 来源注释？
- [ ] 子组件中的尺寸是否也标注了来源？

### @技术栈节点自检
- [ ] `@echarts/legend` 是否使用了 Figma 色块尺寸？
- [ ] `@echarts/pie` 的 radius 是否按 Ellipse 比例推算？
- [ ] `@antd/xxx` 是否使用了对应的 Ant Design 组件？
- [ ] 覆盖 antd 组件样式时是否使用了 `:deep(.ant-xxx)`？
- [ ] 表单组件（输入框/下拉/日期/开关等）是否默认使用了 ant-design-vue？
- [ ] 数据表格是否默认使用了 `<a-table>`？
