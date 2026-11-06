# Header 分析规则（headerRelation + 插槽 + controls）

## 一、headerRelation 5 种取值

| 取值 | 含义 | 判断条件 |
|------|------|---------|
| `content-below-title` | 标题在上、内容在下（最常见） | 有标题 + 标题下方有内容区 |
| `title-same-row` | 标题与控件/内容同行 | 标题和主要内容在同一水平行 |
| `no-header` | 无标题 | 整个 section 没有可见标题文字 |
| `header-only` | 只有标题 | 只有标题行，无实质内容 |

**判断流程**：有标题？→ 否 = `no-header` → 是：同行？→ 是 = `title-same-row` → 否：有内容？→ 是 = `content-below-title` / 否 = `header-only`

## 二、header.controls（标题行右侧控件）

**关键规则**：标题行右侧有任何可点击元素都必须报告，哪怕是很小的图标。

```json
{ "header": { "title": "环境监测", "controls": [
  { "type": "icon-button", "icon": "refresh", "label": "刷新" },
  { "type": "icon-button", "icon": "more", "label": "更多" }
]}}
```

**常见错误**：`controls: []` — 当预览图中确实有按钮/图标时（这是当前最常见缺陷）。
常见控件：刷新、导出、全屏、设置、更多、关闭。

## 三、Header 插槽检测（headerSlots）

**关键原则**：只有**与面板标题文字在同一水平线上**的控件才是插槽候选。

### 识别条件
1. 定位面板标题（最顶部文字）
2. 标题文字上下一定阈值区域内的功能性控件
3. 小型、紧凑的控件（统计指标/Tab切换/图标操作）

### headerSlots vs header.controls 区分

**header.controls**（二节）用于：
- ✅ 纯操作类按钮：刷新、设置、导出、全屏、更多、关闭
- ✅ 可点击的图标按钮
- ✅ 无数据展示，仅触发动作

**headerSlots**（本节）用于：
- ✅ 数据展示类元素：统计指标、状态标签
- ✅ 内容切换控件：Tab 切换、segmented control
- ✅ 辅助说明文字：单位、副标题
- ✅ 装饰性图标（非可点击）

### 排除规则（不是插槽）
- ❌ 标题行**下方**的任何元素（即使只有 2-4 个选项的紧凑 Tab，只要位于标题行下方，就是内容区筛选 Tab，不是 header 插槽）
- ❌ **Tab 切换控件（tab/segmented/switch）本质是「内容筛选控件」**，默认不在 header 插槽；只有与标题文字严格同一水平线、且确实悬挂在标题行上的小型切换件才可判 header 插槽
- ❌ 大型 Tab 控件（宽度 >150px 或选项 ≥4 个）→ 那是内容区筛选 Tab
- ❌ 占据整行的筛选条/导航栏
- ❌ 纯操作按钮（应该放入 header.controls）

### 输出格式

```json
{ "headerSlots": [
  {
    "slotType": "header-right",
    "elementType": "statistic",
    "content": "设备类型 28",
    "figmaNodeId": "123:456"
  },
  {
    "slotType": "header-right",
    "elementType": "tab",
    "content": "列表/图表 两选项",
    "figmaNodeId": "123:457"
  }
]}
```

**字段说明：**
- `slotType` (必填): 插槽位置
  - `title-left` - 标题左侧（装饰图标、状态徽章）
  - `title-right` - 标题右侧紧邻（副标题、单位说明）
  - `header-right` - 头部右侧远离标题（统计指标、Tab切换）
- `elementType` (必填): 元素类型
  - `statistic` - 统计指标（包含数字的数据展示）
  - `tab` - Tab 切换控件
  - `icon` - 装饰性图标（非可点击）
  - `label` - 辅助文字、说明
- `content` (必填): 元素的文本内容或简要描述
- `figmaNodeId` (可选): 对应的 Figma 节点 ID（如有 Figma 数据时必填）

### 易错对比

❌ 将内容区顶部筛选 Tab 误识别为插槽：
```
[面板标题]              ← 标题行
[全部][桥梁][边坡]       ← 内容区第一行（不是插槽！）
```

✅ 只识别与标题同行的小型 Tab：
```
[面板标题]  [列表][图表]  ← 同一行，是插槽 ✅
```

❌ 将操作按钮放入插槽：
```json
// 错误
{ "headerSlots": [{ "slotType": "header-right", "elementType": "icon", "content": "刷新按钮" }]}
```

✅ 操作按钮应该放入 header.controls：
```json
// 正确
{ "header": { "controls": [{ "type": "icon-button", "icon": "refresh", "label": "刷新" }]}}
```

## 四、title-same-row 时的 slotCandidate

`headerRelation = "title-same-row"` 时必须填写 `slotCandidate`（如 `"tab-bar"` / `"filter-bar"`）。其他取值时 `slotCandidate: null`。
