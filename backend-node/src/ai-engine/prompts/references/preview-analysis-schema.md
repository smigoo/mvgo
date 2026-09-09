# preview-analysis 中间产物规范

本文件定义 `mc-gen --preview` 阶段的 **预览图分析中间产物** 规范。

目标：
- 在生成代码前，先把预览图结构、样式、交互线索固化为可复用的结构化 JSON
- 让后续代码生成基于同一份分析结果继续执行，减少“首轮识图”和“二轮生成”之间的偏差
- 在 `--check / --cleck / --preview-check` 模式下，作为可人工检查的阶段产物

## 产物位置

- 固定输出到：`.mc-gen/config/preview-analysis.json`
- 调试缓存可放在：`.mc-gen/cache/preview-analysis-*`

## 使用规则

1. `preview-analysis.json` 是 **preview 阶段的中间产物**，不是最终组件代码
2. 若同一张 `mc-preview.png` 未变化，应优先复用已有分析结果
3. 后续代码生成必须把该分析结果作为硬约束输入之一，不可忽略
4. `tooltip / popover / 下拉展开态 / hover 态` 默认识别为 **瞬态**
5. 若截图无法证明某交互存在，不要在分析中臆造
6. 若分析与 Figma 精修阶段冲突，以更高证据等级为准：
   - Figma API 数据
   - 预览图结构分析
   - 默认保守生成

## JSON 顶层结构

```json
{
  "generatedAt": "2026-04-27T10:19:15.595Z",
  "stage": "preview-analysis",
  "componentName": "流量监测",
  "componentTitle": "流量监测",
  "analysisModel": "gpt-5.4",
  "sourceImage": {
    "path": "src/workspace/custom-components/c-lljc/resources/images/mc-preview.png",
    "size": 709937,
    "mtimeMs": 1777285034334,
    "sha1": "4ef988ae2dbf004f8a071940c71e9b64e4a43dd7"
  },
  "summary": "",
  "layout": {
    "type": "",
    "direction": "",
    "sections": []
  },
  "styles": {
    "theme": "",
    "colors": [],
    "background": "",
    "decorations": [],
    "emphasis": []
  },
  "interactions": [],
  "charts": [],
  "doNotInvent": [],
  "notes": []
}
```

## `layout.sections` 结构

`layout.sections` 表示从上到下的主模块列表。

每个 section 节点允许递归嵌套，并支持 `header/body` 分层结构：

```json
{
  "id": "daily-total",
  "name": "当日总流量",
  "role": "常驻",
  "layout": "vertical",
  "headerRelation": "content-below-title",
  "slotCandidate": null,
  "header": {
    "title": "当日总流量",
    "controls": [
      {
        "id": "time-selector",
        "name": "时间选择",
        "role": "dropdown",
        "value": "24小时"
      }
    ]
  },
  "body": {
    "layout": "horizontal-2-columns",
    "children": [
      {
        "id": "stats-1",
        "name": "项目主体",
        "role": "stat-card",
        "value": "34,620"
      },
      {
        "id": "stats-2",
        "name": "大桥",
        "role": "stat-card",
        "value": "82,379"
      }
    ]
  }
}
```

### 分层结构说明

每个 section 分为两个层级：

1. **`header`**（可选）：标题行区域
   - `title`: section 标题文字
   - `controls`: 标题行右侧的控件数组（下拉框、tab、按钮等）
   
2. **`body`**（必须）：内容区区域
   - `layout`: 内容区内部布局
   - `children`: 内容元素数组（数据卡片、图表、列表等）

### 错误示例（禁止）

❌ **错误：把 header 控件和 body 内容混为一谈**
```json
{
  "layout": "horizontal-3-columns",
  "children": [
    {"role": "stat-card"},
    {"role": "stat-card"},
    {"role": "dropdown"}
  ]
}
```

✅ **正确：header 和 body 分层**
```json
{
  "layout": "vertical",
  "header": {
    "title": "当日总流量",
    "controls": [{"role": "dropdown"}]
  },
  "body": {
    "layout": "horizontal-2-columns",
    "children": [{"role": "stat-card"}, {"role": "stat-card"}]
  }
}
```

字段要求：
- `id`: 稳定标识，建议 kebab-case
- `name`: 中文名称
- `role`: `常驻` / `瞬态` / `装饰` / `未知`
- `layout`: 简短布局描述
- `gridColumns`: **新增字段**（可选），当 layout 为 `"grid"` 或 role 为 `"content-grid"` 时，标识网格的列数
  - 类型：整数（如 `3` 表示一行3列）
  - 识别方法：观察预览图中一行显示几个卡片
  - 默认值：如果无法确定，默认为 `3`
  - 示例：`"gridColumns": 3`
- `headerRelation`: **新增字段**，判断该 section 与面板标题的位置关系
  - `"title-same-row"` — 与面板标题在同一水平行（面板插槽候选）
  - `"content-below-title"` — 在面板标题下方的内容区（不是插槽）
  - `"title-itself"` — 该 section 就是面板标题本身
- `slotCandidate`: **新增字段**，仅当 `headerRelation: "title-same-row"` 时有效，判断属于哪个插槽
  - `"title-left"` — 标题左侧（装饰图标、状态标识等）
  - `"title-right"` — 标题右侧紧邻（副标题、更新时间、单位等）
  - `"header-right"` — 标题右侧靠右对齐（统计指标、地点切换 Tab、视图切换按钮）
  - `"close"` — 最右侧关闭按钮
  - `null` — 不在标题行，无插槽归属
- `children`: 子节点数组，可递归

### header/body 分层判断规则（CRITICAL）

**核心原则：准确区分 section 内部的"标题行"和"内容区"两个层级。**

#### 判断方法

观察元素相对于 section 标题的位置：

| 视觉位置 | 所属层级 | 对应字段 | 示例 |
|---------|---------|---------|------|
| 与 section 标题在同一水平行 | header | `header.controls` | "24小时"下拉框 |
| 在 section 标题下方 | body | `body.children` | 统计数据卡片、图表 |

#### 关键区分点

1. **section 标题** vs **面板标题**
   - 面板标题：来自 `declare.json`，位于 `base-panel` 的 header
   - section 标题：每个 section 自己的小标题（如"当日总流量"）
   - **不要混淆**：section 标题不是面板插槽！

2. **header controls** vs **body content**
   - header controls：标题行右侧的**交互控件**（下拉框、tab、按钮）
   - body content：标题下方的**纯展示内容**（数据、图表、文本）
   - **禁止混用**：控件不放 body，内容不放 header

#### 典型布局识别

```
◆ 当日总流量        [24小时 ▼]    ← header（标题 + 控件）
────────────────────────────────
┌─────────┐  ┌─────────┐         ← body（内容区）
│ 34,620  │  │ 82,379  │
└─────────┘  └─────────┘
```

对应 JSON：
```json
{
  "header": {
    "title": "当日总流量",
    "controls": [{"role": "dropdown", "value": "24小时"}]
  },
  "body": {
    "layout": "horizontal-2-columns",
    "children": [
      {"role": "stat-card", "value": "34,620"},
      {"role": "stat-card", "value": "82,379"}
    ]
  }
}
```

### 图例识别规则（P2' 防误识别）

**核心原则：图例是图表的附属元素，不得作为独立 section。**

图例的典型特征：
- 紧贴图表上方/下方/左侧/右侧
- 由"色块 + 短文本"组合构成（如：🟥 北京方向、🟦 上海方向）
- 无交互元素（无按钮、下拉框、开关等）
- 内容仅为系列名称标识

**正确做法：**
- 图例信息应记录在 `charts[].legend`、`legendPosition`、`seriesColors`、`legendType` 字段中
- 图例区域**不**应成为 `layout.sections` 中的独立 section
- 如果 vision 分析时将图例识别为独立 section，规划层会自动合并回相邻图表 section（兜底机制）

**错误示例（禁止）：**
```json
{
  "layout": {
    "sections": [
      { "id": "chart-section", "name": "流量趋势图", "body": {...} },
      { "id": "legend-section", "name": "图例", "body": { "children": [
        {"type": "color-block", "name": "红色"},
        {"type": "text", "name": "北京方向"}
      ]}}
    ]
  }
}
```

**正确示例：**
```json
{
  "layout": {
    "sections": [
      { "id": "chart-section", "name": "流量趋势图", "body": {...} }
    ]
  },
  "charts": [
    {
      "section": "chart-section",
      "legend": ["北京方向", "上海方向"],
      "legendPosition": "top-right",
      "seriesColors": ["#ff0000", "#0000ff"],
      "legendType": "horizontal"
    }
  ]
}
```

### headerRelation 判断规则（面板插槽专用）

**核心规则：只有与面板标题文字在同一水平行的元素，才能作为面板插槽的候选。**

面板标题来自 `declare.json` 的 `componentName`，渲染在 `default-panel` 的 `.header-title` 位置。

`default-panel` 的 header 行 DOM 结构（从左到右）：

```
[title-left] [header-title] [title-right] [header-right] [close]
```

| 位置特征 | headerRelation | slotCandidate | 示例 |
|---------|---------------|---------------|------|
| 在面板标题左侧，与标题同行 | `title-same-row` | `title-left` | 装饰图标、状态指示灯 |
| 在面板标题右侧紧邻，与标题同行 | `title-same-row` | `title-right` | 副标题、更新时间说明 |
| 在面板标题右侧靠右对齐，与标题同行 | `title-same-row` | `header-right` | 地点切换 Tab、统计指标 |
| 在最右侧，与面板标题同行 | `title-same-row` | `close` | 关闭按钮（×） |
| 在面板标题下方，是内容区的一部分 | `content-below-title` | `null` | 所有 section 及其内部元素 |
| 该元素本身就是面板标题 | `title-itself` | `null` | "流量监测"文字 |

**重要约束：**
- **严禁**把 section 内部的元素（如"当日总流量"的下拉框）错误标注为面板插槽
- section 内部的标题行控件属于 `section.header.controls`，**不属于** `panel-header-right`
- 如果无法确定，保守选择 `"content-below-title"`

## `styles` 结构

只描述 **有证据的视觉信息**：

- `backgroundBrightness`: 🔴 **必填，优先判断**，取值只能是 `”dark”` 或 `”light”`
  - 判断方法：观察**背景色**和**主体文字颜色**
    - 背景深色（黑/深灰/深蓝）+ 文字浅色（白/浅灰）→ `”dark”`
    - 背景浅色（白/浅灰/中灰蓝）+ 文字深色（黑/深灰/深蓝）→ `”light”`
  - ❌ 禁止凭主色调（蓝色、科技感）推断，必须看背景和文字的实际亮度
  - 此字段决定 `declare.json` 的 `themeConfig.default`，识别错误会导致主题颠倒
- `theme`: 总体风格描述，**必须以 `backgroundBrightness` 为前缀**
  - 格式：`”<深色|浅色>+风格描述”`，如 `”浅色科技监测风”`、`”深色大屏数据风”`
  - ❌ 禁止写 `”深色科技风”` 但 `backgroundBrightness` 是 `”light”`，两者必须一致
- `colors`: 关键颜色名称或简述，不要求精确色值
- `background`: 模块背景特征
- `decorations`: 装饰元素，如发光圆环、细线、菱形图标
- `emphasis`: 强调信息，如”大号蓝色数值”

## `interactions` 结构

每项交互线索统一用：

```json
{
  "target": "当日总流量右侧“24小时”控件",
  "type": "dropdown",
  "description": "时间范围筛选",
  "defaultState": "常驻，收起态",
  "evidence": "右侧有向下箭头"
}
```

常见 `type`：
- `dropdown`
- `tooltip`
- `tab-switch`
- `legend-toggle`
- `link`
- `chart-hover`

若只有视觉线索、没有明确证据，不要强行写成可点击。

## `charts` 结构

每张图表单独一项：

```json
{
  "section": "示例隧道项目小时流量",
  "type": "双系列分组柱状图",
  "series": ["北京方向", "上海方向"],
  "legend": ["北京方向", "上海方向"],
  "legendPosition": "top-right",
  "seriesColors": ["#1890ff", "#52c41a"],
  "legendType": "horizontal",
  "axes": "X轴为小时，Y轴为车辆数",
  "tooltip": "截图中显示 16 时的瞬态提示框",
  "notes": ["有橙色建议分流阈值线"]
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `section` | string | ✅ | 所属section的id | `"tunnel-flow"` |
| `type` | string | ✅ | 图表类型 | `"bar"` / `"line"` / `"pie"` / `"area"` |
| `series` | array | ✅ | 系列名称数组 | `["北京方向", "上海方向"]` |
| `legend` | array | ✅ | 图例文本数组（可为空） | `["北京方向", "上海方向"]` |
| `legendPosition` | string | 🔴 | **图例位置（有图例时必填）** | `"top-right"` / `"bottom-center"` / `"right"` |
| `seriesColors` | array | 🔴 | **系列颜色数组（有系列时必填）** | `["#1890ff", "#52c41a"]` |
| `legendType` | string | 🔴 | **图例布局类型（有图例时必填）** | `"horizontal"` / `"vertical"` |
| `axes` | string | ⚠️ | 坐标轴说明（坐标系图表必填） | `"X轴为小时，Y轴为车辆数"` |
| `tooltip` | string | ✅ | tooltip说明 | `"显示时间点、流量"` |
| `notes` | array | ✅ | 其他备注 | `["有橙色虚线"]` |

### legendPosition 可选值

- `"top-left"` / `"top-center"` / `"top-right"`
- `"bottom-left"` / `"bottom-center"` / `"bottom-right"`
- `"left"` / `"right"`

### 识别规则

1. **legendPosition**：观察预览图中图例相对于图表的位置
   - 图例在图表上方 → `top-*`
   - 图例在图表下方 → `bottom-*`
   - 图例在图表左侧 → `left`
   - 图例在图表右侧 → `right`
   - 再判断水平对齐：左对齐(`-left`)、居中(`-center`)、右对齐(`-right`)

2. **seriesColors**：观察预览图中图例的颜色块，提取颜色值
   - 必须按照 series 数组的顺序提取颜色
   - 颜色值使用十六进制格式（如 `#1890ff`）
   - 如果无法精确识别，使用常见配色方案

3. **legendType**：观察图例是横向排列还是纵向排列
   - 横向排列 → `"horizontal"`
   - 纵向排列 → `"vertical"`

### 常见模式

- **柱状图**：`legendPosition="bottom-center"`, `legendType="horizontal"`
- **折线图/面积图**：`legendPosition="top-right"`, `legendType="horizontal"`
- **饼图**：`legendPosition="right"`, `legendType="vertical"`

### 要求

- 重复结构图表也要分别列出
- 不要把截图里瞬态 tooltip 当作常驻 DOM 结构
- 🔴 **如果图表有图例（legend数组不为空），必须填写 legendPosition、seriesColors、legendType 三个字段**

## `doNotInvent`

这里专门列出 **后续代码生成禁止臆造** 的内容，例如：

- 下拉选项全集
- tooltip 固定显示逻辑
- 未被截图证明的联动规则
- 未显示的详细数据标签
- 未显示的跳转路径、告警机制、自动刷新逻辑

后续代码生成阶段应优先遵守该字段。

## checkpoint 模式

当执行：

- `mc-gen --preview --check`
- `mc-gen --preview --cleck`
- `mc-gen --preview --preview-check`

要求：

1. 只生成 `preview-analysis.json`
2. 写入阶段状态，如 `analysis-checkpoint`
3. 自动停止，不继续生成代码
4. 等人工检查确认后，再继续普通 `--preview`

## 代码生成阶段如何消费

后续代码生成必须：

1. 先读 `preview-analysis.json`
2. 以 `layout.sections` 为主结构依据
3. 以 `styles` / `charts` / `interactions` 作为补充约束
4. 把 `doNotInvent` 作为禁止项
5. 若分析结果与截图不一致，以截图和更高证据重新修正
