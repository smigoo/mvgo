# 布局分析规则

## 任务
只分析预览图的结构、样式和交互线索，不生成任何代码。

## 分析要求

1. 先识别整体布局层级，再识别每个主模块
2. 从预览图中提取组件的中文显示名称（通常是页面标题/顶部大标题），写入 componentName 字段
3. 明确哪些是常驻元素，哪些更像 tooltip / hover / 下拉展开等瞬态
4. 识别图表类型、图例、时间筛选、tab/切换项等交互线索
5. 样式只描述有证据的内容，不要臆造
6. 若无法确定，用保守表述，不要编造

---

## 🔴 Panel 标题 vs Section 识别（关键）

**核心原则：不要将 panel 标题识别为 section。**

### base-panel 的标题（不是 section）
- 整个面板的总标题，位于最顶部
- 通常字体较大，如"流量监测"、"设备监控"
- **禁止**添加到 sections 数组中
- **禁止**生成 id 为 "header"、"title"、"panel-header" 的 section

### section 标题（才是 section）
- 内容区域的小标题，如"当日总流量"、"车型分布"
- 位于各功能模块的顶部
- 字体通常比 panel 标题小

---

## 🔴 Section 标题及周围元素识别（关键）

**必须明确识别每个 section 是否有标题及其周围的所有元素。**

### 识别方法
仔细观察预览图中 section 顶部是否有独立的标题行，标题行中有哪些元素。

### Children 顺序
按**从左到右**的顺序添加到 children 数组：

1. 标题左侧的图标：
   ```json
   { "name": "标题图标", "role": "title-icon" }
   ```

2. 标题文字本身：
   ```json
   { "name": "当日总流量", "role": "section-title" }
   ```

3. 标题右侧的选择器：
   ```json
   { "name": "时间选择器", "role": "dropdown" }
   ```

4. 标题右侧的链接：
   ```json
   { "name": "节假日预测", "role": "link" }
   ```

5. 标题右侧的 tabs：
   ```json
   { "name": "隧道/大桥切换", "role": "tabs" }
   ```

### 常见布局模式
- 左对齐标题 + 右侧选择器：`[title-icon, section-title, dropdown]`
- 居中标题：`[section-title]`
- 标题 + 右侧链接：`[section-title, link]`
- tabs在标题位置：`[tabs]`（此时tabs本身就是标题）

---

## 🔴 HeaderRelation 和 SlotCandidate 字段（必须）

**每个 section 必须包含这两个字段。**

### headerRelation
描述 section 与 panel 标题的位置关系。

**可选值**：
- `"title-same-row"` - 与 panel 标题在同一行（通常是右上角的统计卡片）
- `"content-below-title"` - 在 panel 标题下方（最常见）
- `"title-itself"` - 本身就是 panel 标题（少见）

**判断规则**：
- ✅ 如果 section 有独立的标题（如"当日总流量"），则 headerRelation = `"content-below-title"`
- ✅ 如果 section 在 panel 标题的右侧（如统计卡片），则 headerRelation = `"title-same-row"`

### slotCandidate
判断是否可作为 base-panel 的插槽候选。

**可选值**：
- `null` - 不是插槽候选（默认值）
- `"title-left"` - panel 标题左侧
- `"title-right"` - panel 标题右侧
- `"header-right"` - 头部区域右侧
- `"close"` - 关闭按钮位置

**判断规则**：
- ✅ 只有 headerRelation = `"title-same-row"` 时，slotCandidate 才可能有值
- ✅ 如果 headerRelation = `"content-below-title"`，则 slotCandidate = `null`

---

## 🔴 图表图例不作为 Children（关键）

**图表的图例不要添加到 section.children 中。**

### 错误示例
```json
{
  "id": "traffic-chart-section",
  "children": [
    { "name": "北京方向", "role": "text" },  // ❌ 错误：图例不应该在这里
    { "name": "上海方向", "role": "text" }   // ❌ 错误
  ]
}
```

### 正确做法
图例信息只在 charts 数组中通过 legend 和 legendPosition 字段描述：

```json
{
  "charts": [
    {
      "section": "traffic-chart-section",
      "legend": ["北京方向", "上海方向"],
      "legendPosition": "top-right"
    }
  ]
}
```

---

## 🔴 布局层级关系识别（关键）

**核心原则：准确识别复杂嵌套布局，在 description 字段中明确描述布局层级关系。**

### 识别步骤

#### 1. 识别顶层布局方向
- 观察整个内容区域的主要排列方向（垂直/水平）
- 填写 `layout.direction` 字段

#### 2. 识别是否有跨列元素
- 观察是否有元素横跨整个宽度（如顶部汇总卡片）
- 这些元素通常在其他元素之上，独占一行

#### 3. 识别下层布局结构
- 观察跨列元素下方是否有左右分栏布局
- 识别每个分栏内的元素

#### 4. 在 description 中描述层级关系
- 使用"顶部"、"下方"、"左侧"、"右侧"等方位词
- 明确说明哪些元素在同一层级，哪些元素是嵌套关系

### 视觉识别关键技巧

**如何判断"顶部跨列 + 下方左右分栏"布局：**

#### 顶部跨列元素的视觉特征
- ✅ 元素宽度 ≈ 整个内容区宽度（占比 > 90%）
- ✅ 元素下方有明显的水平分割线或间距
- ✅ 元素通常包含汇总数据、统计卡片、标题栏等
- ❌ 如果元素只占一半宽度，不是跨列元素

#### 左右分栏的视觉特征
- ✅ 下方区域有明显的垂直分割（左右两部分）
- ✅ 左侧通常是窄条（导航、菜单、筛选器），宽度 < 30%
- ✅ 右侧通常是宽区域（列表、网格、内容），宽度 > 70%
- ✅ 左右两部分的顶部Y坐标基本对齐

#### 常见误判情况
- ❌ **错误**：把左侧导航识别为独立的顶部元素
  - **正确**：观察Y坐标，如果与右侧内容对齐，说明是并列关系
  
- ❌ **错误**：把所有元素识别为垂直堆叠
  - **正确**：观察X坐标，如果有元素X坐标明显不同，说明是左右分栏
  
- ❌ **错误**：忽略顶部跨列元素
  - **正确**：先识别最上方的元素，判断是否横跨全宽

---

## 嵌套容器识别

**某些 section 可能包含多个子元素，需要用 children 字段描述。**

### 何时使用 children
- ✅ Section 内有多个并列的卡片/图表/区块
- ✅ Section 有标题行 + 内容区的结构
- ✅ Section 内有明显的子布局

### Children 结构
```json
{
  "id": "stat-cards-section",
  "name": "统计卡片组",
  "role": "stat-cards-group",
  "layout": "horizontal",
  "children": [
    {
      "name": "隧道设备",
      "role": "stat-card",
      "widthRatio": 0.5
    },
    {
      "name": "南北接线设备",
      "role": "stat-card",
      "widthRatio": 0.5
    }
  ]
}
```

---

## WidthRatio 和 HeightRatio

**用于描述 section 的宽度和高度占比。**

### WidthRatio
- 相对于父容器宽度的占比
- 范围：0.0 ~ 1.0
- 示例：
  - 独占一行：`1.0`
  - 左右各半：`0.5`
  - 左侧导航栏：`0.12`
  - 右侧内容区：`0.88`

### HeightRatio
- 相对于整个内容区高度的占比
- 范围：0.0 ~ 1.0
- 示例：
  - 头部区域：`0.08`
  - 统计卡片：`0.15`
  - 主内容区：`0.62`

### 计算方法
观察预览图，估算各部分的视觉占比。

**提示**：所有 section 的 heightRatio 之和 ≈ 1.0（允许误差 ±0.1）
