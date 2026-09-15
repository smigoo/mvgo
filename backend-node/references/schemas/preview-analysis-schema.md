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
  "generatedAt": "<ISO8601_TIMESTAMP>",
  "stage": "preview-analysis",
  "componentName": "<设计稿识别的组件名称>",
  "componentTitle": "<组件展示标题>",
  "analysisModel": "<实际调用模型名>",
  "sourceImage": {
    "path": "<实际预览图路径>",
    "size": 0,
    "mtimeMs": 0,
    "sha1": ""
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

每个 section 节点允许递归嵌套，并支持 `header/body` 分层结构。

> ⚠️ **`id` 字段强制约束（源头治理，2026-09-14 · 流量监测 `34750940` 实证）**：
> `section.id` / `children[].id` / `items[].id` **必须用 Figma 节点真实 id（形如 `"2:3550"` 的 `数字:数字`）**，**禁止用语义化字符串**（如 `"daily-total"` / `"stats-1"` / `"time-selector"`）。
> 原因：下游 `collectSourceNodeIds`（`subcomponent-planner.js`）只认 `数字:数字` 正则，语义 id 会被直接丢弃 → `sourceNodeIds=[]` → section 变成「无归属壳」，触发不可锚去重误伤。即便本 schema 示例曾用语义 id，也已更正为节点 id 风格。

```json
{
  "id": "2:3550",
  "name": "当日总流量",
  "role": "常驻",
  "layout": "vertical",
  "headerRelation": "content-below-title",
  "slotCandidate": null,
  "header": {
    "title": "当日总流量",
    "controls": [
      {
        "id": "89:37",
        "name": "时间选择",
        "role": "dropdown",
        "value": "24小时"
      }
    ]
  },
  "body": {
    "layout": "horizontal-2-columns",
    "bgPlaceholder": "container-bg",
    "children": [
      {
        "id": "90:12",
        "name": "江阴靖江长江隧道",
        "role": "stat-card",
        "value": "34,620"
      },
      {
        "id": "90:13",
        "name": "江阴大桥",
        "role": "stat-card",
        "value": "82,379"
      }
    ]
  }
}
```

### 详细元素级结构示例（v2.0新增）

**用于需要精确Figma节点映射的场景**：

```json
{
  "id": "1452:1950",
  "name": "管辖范围",
  "role": "常驻",
  "layout": "vertical",
  "bgPlaceholder": "section-bg",
  "header": {
    "text": "管辖范围",
    "figmaNode": "1452:1950",
    "styles": {
      "fontSize": 24,
      "fontWeight": "bold",
      "color": "#ffffff"
    }
  },
  "body": {
    "layout": "horizontal-4-items",
    "bgPlaceholder": "body-bg",
    "items": [
      {
        "layout": "horizontal",
        "icon": {
          "placeholder": "icon-1",
          "figmaNode": "1452:1955",
          "position": "left",
          "resource": "icon-1955.png"
        },
        "content": {
          "layout": "vertical",
          "position": "right",
          "elements": [
            {
              "type": "label",
              "text": "主线",
              "figmaNode": "1452:1960",
              "position": "top",
              "styles": {
                "fontSize": 14,
                "color": "#ffffff"
              }
            },
            {
              "type": "value",
              "position": "bottom",
              "parts": [
                {
                  "text": "185.6",
                  "type": "number",
                  "figmaNode": "1452:1965",
                  "styles": {
                    "fontSize": 36,
                    "color": "#00f0ff"
                  }
                },
                {
                  "text": "km",
                  "type": "unit",
                  "figmaNode": "1452:1966",
                  "styles": {
                    "fontSize": 14,
                    "color": "#ffffff"
                  }
                }
              ]
            }
          ]
        }
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

### 正确示例（header 和 body 分层）

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
- `bgPlaceholder`: **新增字段**（可选），背景资源占位符，用于后续映射bg图片
- `items`: **新增字段**（可选），当body包含多个结构相似的项时使用，替代children
  - 每个item包含详细的内部结构：icon、content等
  - 支持嵌套布局描述
- `figmaNode`: **新增字段**（可选），对应的Figma节点ID
- `styles`: **新增字段**（可选），元素的样式信息（fontSize、color、fontWeight等）
- `placeholder`: **新增字段**（可选），资源占位符名称
- `resource`: **新增字段**（可选），实际资源文件名
- `parts`: **新增字段**（可选），文字元素的拆分部分（如数值+单位）
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

### 图表内部元素归属铁律（阈值线 / 图例 / 轴标注）

**核心原则：凡是在 ECharts 画布内绘制的元素（阈值线 markLine、图例 legend、轴单位、坐标刻度），其事实必须落在 `charts[]` 的对应字段上 —— 禁止拆成所属 section 的 `body.children` 兄弟节点。**

实锤（mc-1789445437366-5b19ce4f 环境监测）：视觉分析把图表内部的红色阈值线拆成兄弟文本节点
`{"id":"threshold-label","role":"text","text":"阈值线"}`，把右上角图例拆成
`{"id":"range-indicator","role":"text","text":"2k3-7R5C0-X隧道"}` ——
工程师阶段忠实照做，把它们渲染成图表容器**外部**的 DOM（`.c-env-monitor-threshold-label` / `.c-env-monitor-time-range`），
同时又在 option 里补了一遍 `series[].markLine` → 设计稿里"图表的一部分"变成了图表外的游离标注。

**禁止（错误示例）：**
```json
{
  "id": "chart-section",
  "body": { "children": [
    {"id": "range-indicator", "role": "text", "text": "zk3+785CO浓度"},
    {"id": "threshold-label", "role": "text", "text": "预警线"},
    {"id": "chart-container", "role": "chart", "type": "area"}
  ]}
}
```

**正确（阈值线/图例进 charts[]）：**
```json
{
  "id": "chart-section",
  "body": { "children": [
    {"id": "chart-container", "role": "chart", "type": "area"}
  ]},
  "charts": [{
    "section": "chart-section",
    "type": "area",
    "series": ["zk3+785CO浓度"],
    "legend": ["zk3+785CO浓度"],
    "legendPosition": "top-right",
    "legendType": "horizontal",
    "markLine": [{
      "axis": "y", "value": 30, "label": "预警线",
      "color": "#ff5555", "lineStyle": "dashed", "labelPosition": "right"
    }]
  }]
}
```

判定口径：
- 元素**画在画布内**（与曲线/网格同一块区域，坐标随数据轴走）→ 归 `charts[]`
- 元素在画布**外的独立 DOM 区**（图表上方的标题栏、下方的统计卡）→ 才可以作为 `body.children`
- `notes` 只是备注自由文本，**不是**结构事实源；阈值线必须写 `markLine`，不得只在 `notes` 里提一句

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
  "markLine": [
    {
      "axis": "y",
      "value": 30,
      "label": "预警线",
      "color": "#ff5555",
      "lineStyle": "dashed",
      "labelPosition": "right"
    }
  ],
  "notes": ["有橙色建议分流阈值线"]
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `section` | string | ✅ | 所属section的id | `"tunnel-flow"` |
| `type` | string | ✅ | 图表类型 | `"bar"` / `"line"` / `"pie"` / `"area"` |
| `series` | array | ✅ | 系列名称数组 | `["北京方向", "上海方向"]` |
| `legend` | array | ✅ | 图例文本数组（可为空，见下方一致性规则） | `["北京方向", "上海方向"]` |
| `legendPosition` | string | 🔴 | **图例位置（有图例时必填）** | `"top-right"` / `"bottom-center"` / `"right"` |
| `seriesColors` | array | 🔴 | **系列颜色数组（有系列时必填）** | `["#1890ff", "#52c41a"]` |
| `legendType` | string | 🔴 | **图例布局类型（有图例时必填）** | `"horizontal"` / `"vertical"` |
| `axes` | string | ⚠️ | 坐标轴说明（坐标系图表必填） | `"X轴为小时，Y轴为车辆数"` |
| `tooltip` | string | ✅ | tooltip说明 | `"显示时间点、流量"` |
| `markLine` | array | ⚠️ | **阈值/预警线（画布内横线竖线必填）** | 见下方 `markLine` 结构 |
| `notes` | array | ✅ | 其他备注（**不作为结构事实源**） | `["有橙色虚线"]` |

### `markLine` 结构（画布内阈值线）

设计稿在图表画布内画了横线/竖线（预警线、目标线、安全阈值），**必须**写进 `markLine`，
禁止把它拆成 section 的兄弟 `role:"text"` 节点（那样会渲染成图表外的游离 DOM）。

| 字段 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `axis` | string | ✅ | 线垂直于哪个轴 | `"y"`（横线，按 y 值画）/ `"x"`（竖线） |
| `value` | number | ✅ | 线所在轴的数值 | `30` |
| `label` | string | ⚠️ | 线旁标注文字（设计稿有则必填，无则省略） | `"预警线"` |
| `color` | string | ✅ | 线颜色（取设计稿实测色） | `"#ff5555"` |
| `lineStyle` | string | ⚠️ | 线型 | `"solid"` / `"dashed"` / `"dotted"` |
| `labelPosition` | string | ⚠️ | 标注方位（设计稿可见时填） | `"right"` / `"start"` / `"end"` / `"top"` |

识别规则：
- 横跨曲线区域的单条横线 + 旁边短文字（如「预警线」）→ `axis: "y"` + `value` 取该线对应的 Y 轴刻度
- 竖线（如「当前时刻」标线）→ `axis: "x"`，`value` 取类目/数值
- 多条阈值线 → `markLine` 数组每项一条
- **`value` 无法从刻度读出时**，按相邻刻度插值估算并在 `notes` 里说明「估算值」，**不得**凭空捏造精确值

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
- 🔴 **反向一致性（2026-09-15 治本）：一旦填了 `legendPosition` / `legendType`，就说明你已看见图例 —— `legend` 数组必须回填图例文本，禁止留空数组。**
  实锤 mc-1789445437366-5b19ce4f：`legend: []` 却填了 `legendPosition: "top-right"` + `legendType: "horizontal"` →
  下游 `chart-standards.md` 的「有图例必生成 legend」规则因事实源为空而无着力点 → 图例整段丢失。
  （仅当画布内确实**没有任何**图例时，才允许三个字段同时缺失；只要填了其中一个就必须配齐 `legend`。）
- 🔴 **画布内阈值线一律写 `markLine` 数组**（见 `markLine` 结构），禁止拆成 `body.children` 的 `role:"text"` 兄弟节点

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
6. 🔴 **图表内部元素一律从 `charts[]` 取，不从 `body.children` 取**：
   - `charts[].legend` + `legendPosition` + `legendType` → 生成 ECharts `legend` 配置（**禁止**用 `<div>` 色块+文字自绘图例）
   - `charts[].markLine` → 生成 `series[].markLine`（**禁止**在图容器外用绝对定位的 `<div class="...-threshold-label">` 画线/写标注）
   - 只有当某个文本节点**不在** `charts[]` 里、且位于画布外独立 DOM 区时，才按普通 DOM 渲染
