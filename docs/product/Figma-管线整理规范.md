# Figma 前端开发 · 管线可用整理规范

> 目标：明确 Figma 设计稿在提交平台生成前，必须整理的结构/命名/属性清单
> 适用对象：产品经理、前端开发、设计对接人
> 更新日期：2026-09-01

---

## 一、为什么必须整理？

平台管线通过 **Figma API** 读取节点树数据，依赖以下确定性事实进行代码生成：

| 管线阶段 | 依赖的 Figma 事实 | 缺失后果 |
|---------|-----------------|---------|
| **Figma Connector** | 节点名称、类型、层级关系 | 资源节点识别错误 → 图片丢失 |
| **节点优化器** | Auto Layout 属性（`layoutMode`/`padding`/`itemSpacing`） | 布局还原失败 → 元素重叠/错位 |
| **资源映射** | `bg-*`/`icon-*` 命名约定 | 资源不下载 → 组件残缺 |
| **Vision 解析** | 节点尺寸、颜色、字体 | Vision fallback 不可靠 → 颜色/尺寸失真 |
| **质量门禁 L0-B** | 完整节点树结构 | LESS 编译失败 / 语义校验 BLOCK |

**核心原则：Figma API 提供的事实越确定，生成质量越高。Vision 是 fallback，不可依赖。**

---

## 二、必须整理的 5 个维度

### 2.1 图层命名（P0 · 影响最大）

管线通过 `_identifyNodeType()` 函数识别节点类型，判定逻辑如下：

#### ① 背景图节点（`bg`）

**命名规则（满足任一即可）：**

| 命名模式 | 示例 | 说明 |
|---------|-----|------|
| `bg` | `bg` | 根背景 |
| `bg-*` | `bg-header`、`bg-card`、`bg-tab-active` | 语义化背景 |
| `bg `（空格后缀） | `bg main` | 兼容旧规范 |
| 含「背景」关键词 | `点背景`、`卡片背景` | 中文兼容 |

**管线行为：**
- 根节点如果是 `bg` → **跳过下载**（透明底要求，组件内容不设背景色）
- 根容器直接子 `bg`（路径 2 段，如 `cp-xxx/bg`）→ **跳过挂载**
- 嵌套容器内 `bg`（路径 ≥3 段，如 `cp-xxx/tabs-list/bg`）→ **挂载到父容器**
- 大面积 bg（宽高都 >120px 且至少一边 >200px）→ 绑定 `backgroundStyle`
- 小面积 bg → 作为 `backgroundBlock` 独立元素

**不规范的后果：**
- `Frame 123` / `Rectangle 45` → 识别为 `unknown` → 不下载 → 背景消失
- 名字含 `bg` 但实际是装饰矢量 → 误识别为 bg → 资源爆炸

#### ② 图标节点（`icon`）

**命名规则（满足任一即可）：**

| 命名模式 | 示例 | 说明 |
|---------|-----|------|
| `icon` | `icon` | 通用图标 |
| `icon-*` | `icon-close`、`icon-tab-active`、`icon-arrow-right` | 语义化图标 |
| 含「图标」关键词 | `关闭图标`、`箭头图标` | 中文兼容 |
| 含 `arrow`/`箭头` | `arrow-right`、`arrow-down` | 箭头专用 |

**管线行为：**
- 命名级整体 icon（`icon`/`图标`/`arrow`/`箭头`）→ **整体导出 1 张图，不钻内部 VECTOR 碎片**
- 例外：`tabs-icon` / `*-list` / `*-group` / `icons`（多 icon 容器）→ 继续拆分
- ≤12px 的 icon → 判定为装饰性元素（圆点/短线/分隔符）→ **跳过**
- <50px 的 VECTOR/COMPONENT 且无文字 → 疑似 icon → 下载
- 大尺寸 icon（≥50px）→ `decorativeBlock`；小尺寸 → `img :src`

**不规范的后果：**
- `Vector 78` / `Component 9` → 识别为 `unknown` → 不下载 → 图标消失
- 含多个独立 icon 的容器命名为 `icon` → 被整体导出为 1 张合并图 → LLM 无法拆分

#### ③ 图表容器（`@echarts` 技术栈标记）

**命名规则：**

| 命名模式 | 示例 | 说明 |
|---------|-----|------|
| `@echarts/*` | `@echarts/bar`、`@echarts/line`、`@echarts/pie` | 图表区域标记 |
| `@chart/*` | `@chart/trend` | 备用标记 |

**管线行为：**
- `@echarts` / `@chart` 开头的节点 → **整棵子树跳过资源导出**（运行时渲染，不导出静态图）
- 避免导出 3~4px 宽的柱子/坐标轴碎片

**不规范的后果：**
- 未标记 `@echarts` → 图表内每个柱状分片被导出为独立 png → 资源爆炸（实锤 107 条映射里 96 条是碎片）

#### ④ UI 控件库容器（`@antd` / `@element` 技术栈标记）

**命名规则：**

| 命名模式 | 示例 | 说明 |
|---------|-----|------|
| `@antd/*` | `@antd/tab`、`@antd/table` | Ant Design 控件区域 |
| `@element/*` | `@element/dialog` | Element UI 控件区域 |

**管线行为：**
- `@antd` / `@element` 开头的节点 → **下钻「业务内容」子节点，跳过「控件内部构件」**
- 控件内部构件判定：`cons/` 以外的子节点

**不规范的后果：**
- 未标记 → 控件内部装饰矢量被导出 → 资源冗余
- 标记错误 → 业务内容被跳过 → 图标丢失

#### ⑤ 通用业务容器（语义化英文命名）

**命名规则：**

| 元素类型 | 推荐命名 | 示例 |
|---------|---------|-----|
| 标题 | `title` / `subtitle` | `title`、`subtitle` |
| 图例 | `legend` | `legend`、`chart-legend` |
| 按钮 | `btn-*` | `btn-submit`、`btn-cancel` |
| Tab | `tab-*` | `tab-active`、`tab-inactive` |
| 筛选栏 | `filter` / `search` | `filter-bar`、`search-input` |
| 表格 | `table` | `table`、`data-table` |
| 统计卡 | `stat` / `card` | `stat-card`、`data-card` |

**管线行为：**
- 语义化命名 → 生成代码时保留节点名称作为 class/注释
- 无意义命名（`Frame 123` / `Group 456`）→ 生成代码中用 `div` / `span` 占位 → 可读性差

---

### 2.2 Auto Layout 属性（P0 · 影响布局还原度）

管线节点优化器 `figma-node-optimizer.js` 保留的 Auto Layout 关键字段：

| 属性 | 类型 | 说明 | 缺失后果 |
|-----|------|-----|---------|
| `layoutMode` | `HORIZONTAL` / `VERTICAL` / `null` | 布局方向 | **布局完全错乱** → 元素重叠 |
| `layoutGrow` | `0` / `1` | 是否自适应增长 | 容器宽度/高度固定，不响应内容 |
| `layoutAlign` | `INHERIT` / `STRETCH` / `MIN` / `CENTER` / `MAX` | 交叉轴对齐 | 元素对齐错误 |
| `primaryAxisAlignItems` | `MIN` / `CENTER` / `MAX` / `SPACE_BETWEEN` | 主轴对齐 | 间距分布错误 |
| `counterAxisAlignItems` | `MIN` / `CENTER` / `MAX` / `BASELINE` | 交叉轴对齐 | 垂直/水平对齐错误 |
| `primaryAxisSizing` | `FIXED` / `AUTO` | 主轴尺寸模式 | 内容溢出或留白 |
| `counterAxisSizing` | `FIXED` / `AUTO` | 交叉轴尺寸模式 | 容器尺寸不匹配 |
| `itemSpacing` | number (px) | 子元素间距 | 元素贴在一起或间距过大 |
| `paddingLeft` / `paddingRight` / `paddingTop` / `paddingBottom` | number (px) | 内边距 | 内容贴边 |

#### 如何检查 Auto Layout 是否完整？

1. 打开 Figma → 选中图层 → 右侧面板
2. 看是否有 **「+ Add auto layout」** 按钮
   - 有 → 未添加 → **点击添加**
   - 显示 `Shift+A` 快捷键 → 已添加 → 检查下方属性
3. 检查关键属性是否填写：
   - `layoutMode`：必须是 `HORIZONTAL` 或 `VERTICAL`（不能是 `null`）
   - `padding`：至少有一边 > 0
   - `itemSpacing`：子元素间需要有间距（通常 8~16px）

#### 常见 Auto Layout 问题

| 问题 | 现象 | 修复方法 |
|-----|------|---------|
| 根容器无 Auto Layout | 整个组件元素重叠 | 选中根容器 → `Shift+A` |
| `layoutMode` 为 `null` | 布局方向不确定 | 右侧面板选择 `HORIZONTAL` 或 `VERTICAL` |
| `padding` 全为 0 | 内容贴边 | 设置 `paddingLeft/Right/Top/Bottom` ≥ 8px |
| `itemSpacing` 为 0 | 子元素贴在一起 | 设置 `itemSpacing` ≥ 8px |
| 嵌套容器无 Auto Layout | 局部布局错乱 | 逐层检查子容器 |

---

### 2.3 节点层级结构（P1 · 影响生成逻辑）

#### 推荐的层级结构

```
组件根容器（Frame，语义化命名，如 cp-流量监测）
├── bg（背景图，可选。根 bg 会被跳过下载，透明底）
├── title（标题文本）
├── filter-bar（筛选栏，含 btn-* / input 等子节点）
├── stat-cards（统计卡容器，Auto Layout HORIZONTAL）
│   ├── stat-card-1（含 title / value / trend）
│   ├── stat-card-2
│   └── stat-card-3
├── @echarts/bar（图表区域，标记 @echarts 跳过资源导出）
│   ├── 柱-1（运行时渲染，不导出）
│   ├── 柱-2
│   └── 坐标轴
├── @echarts/pie（饼图区域）
└── data-table（表格区域）
```

#### 必须避免的结构

| 问题结构 | 后果 | 修复方法 |
|---------|------|---------|
| 根容器命名为 `bg` | 根背景被跳过 → 透明底 → 背景消失 | 根容器用语义化命名（如 `cp-xxx`） |
| 多个独立 icon 放在一个 `icon` 命名的容器内 | 被整体导出为 1 张合并图 | 容器命名为 `icons` 或 `tab-icons`（触发拆分） |
| 图表区域未标记 `@echarts` | 每个柱子被导出为独立 png → 资源爆炸 | 图表根节点命名为 `@echarts/bar` 等 |
| 背景节点内含业务资源 | 背景子节点被跳过 → 业务资源丢失 | 业务资源放在背景节点外 |
| 过深嵌套（>5 层） | 生成代码可读性差 | 扁平化结构，最多 3~4 层 |

---

### 2.4 资源节点识别规则汇总（P0 · 核心）

管线 `_identifyNodeType()` 函数的判定优先级（从高到低）：

```
1. 命名级识别（最高优先级）
   ├── bg / bg-* / 背景 → 'bg'
   ├── icon / icon-* / 图标 / arrow / 箭头 → 'icon'
   ├── @echarts/* / @chart/* → 跳过整棵子树
   ├── @antd/* / @element/* → 下钻业务内容
   └── chrome 关键词 → 跳过（面板装饰元素）

2. IMAGE fill 优先
   ├── 大面积（>200px）→ 'bg'
   └── 小面积 → 'icon'

3. GROUP/FRAME 矢量组
   └── 全 VECTOR 子节点 → 'icon'（整体导出）

4. 小尺寸 VECTOR/COMPONENT（<50px）且无文字
   └── → 'icon'

5. 其他 → 'unknown'（不下载）
```

**关键结论：**
- **命名 > 视觉属性**。有正确命名，管线 100% 识别；无命名，靠视觉属性 fallback，不可靠。
- **整体 > 碎片**。命名级整体 icon 不拆分；无命名的小 VECTOR 逐个识别 → 资源爆炸。
- **技术栈标记 > 一切**。`@echarts` 跳过整棵子树，避免导出运行时渲染产物。

---

### 2.5 提交前自检清单（P0 · 必做）

产品/开发提交 Figma URL 生成前，按以下清单逐项检查：

```
□ 1. 根容器命名
   - 是否为语义化英文？（如 cp-流量监测、cp-环境监测）
   - 是否不是 bg / icon / Frame 123？

□ 2. 背景图命名
   - 有背景图的节点是否命名为 bg / bg-* / 背景？
   - 根容器的直接子 bg 是否必要？（透明底要求下，根 bg 会被跳过）

□ 3. 图标命名
   - 所有图标节点是否命名为 icon / icon-* / 图标 / arrow / 箭头？
   - 多个独立 icon 的容器是否命名为 icons / tab-icons（触发拆分）？
   - 是否有 ≤12px 的装饰性 icon？（会被跳过，确认是否 intentional）

□ 4. 图表区域标记
   - 所有图表区域是否标记了 @echarts/* 或 @chart/*？
   - 图表内柱子/坐标轴是否不会被导出为静态图？

□ 5. Auto Layout 完整性
   - 根容器是否有 Auto Layout？（Shift+A 检查）
   - layoutMode 是否为 HORIZONTAL 或 VERTICAL？
   - padding 是否至少有一边 > 0？
   - itemSpacing 是否 ≥ 8px？
   - 嵌套容器是否也添加了 Auto Layout？

□ 6. 节点层级深度
   - 是否 ≤ 4 层？（根容器 → 模块容器 → 子模块 → 元素）
   - 是否有过深嵌套（>5 层）需要扁平化？

□ 7. 隐藏/锁定图层
   - 是否有隐藏图层？（确认是否 intentional）
   - 是否有锁定图层？（确认是否影响生成）

□ 8. Figma 文件权限
   - 平台是否有读取权限？（检查分享设置）
```

---

## 三、正反面案例对比

### 3.1 正面案例（可正常生成）

```
cp-流量监测（Frame，Auto Layout VERTICAL，padding 16，itemSpacing 12）
├── bg-header（Frame，bg 命名，header 背景图）
├── title（Text，"流量监测"）
├── filter-bar（Frame，Auto Layout HORIZONTAL，itemSpacing 8）
│   ├── btn-filter（Frame，btn-* 命名）
│   │   ├── icon-filter（Vector，icon 命名，24×24）
│   │   └── 筛选（Text）
│   └── search-input（Frame）
├── stat-cards（Frame，Auto Layout HORIZONTAL，itemSpacing 16）
│   ├── stat-card-1（Frame）
│   │   ├── 今日流量（Text）
│   │   ├── 12,345（Text，value）
│   │   └── icon-trend-up（Vector，icon 命名，16×16）
│   ├── stat-card-2
│   └── stat-card-3
├── @echarts/bar（Frame，@echarts 标记，整棵子树跳过资源导出）
│   ├── 柱-流量（运行时渲染）
│   ├── 柱-峰值
│   └── 坐标轴
└── data-table（Frame）
    ├── 表头（Text × 4）
    └── 行-1（Frame × N）
```

**生成结果：** 还原度高，资源完整，布局正确。

### 3.2 反面案例 1（命名不规范）

```
Frame 123（Frame，无 Auto Layout）
├── Rectangle 45（背景图，无 bg 命名）
├── Text 78（"流量监测"）
├── Group 90（筛选栏）
│   ├── Rectangle 123（按钮）
│   │   ├── Vector 456（图标，无 icon 命名）
│   │   └── Text 789（"筛选"）
│   └── Rectangle 234（输入框）
├── Group 567（统计卡容器）
│   ├── Group 678
│   ├── Group 789
│   └── Group 890
├── Group 345（图表区域，无 @echarts 标记）
│   ├── Rectangle 567（柱子，3px 宽）
│   ├── Rectangle 568（柱子，3px 宽）
│   └── ...（100+ 柱子）
└── Group 456（表格）
```

**生成结果：**
- 背景图（Rectangle 45）→ 识别为 `unknown` → **不下载** → 背景消失
- 图标（Vector 456）→ 识别为 `unknown` → **不下载** → 图标消失
- 图表区域未标记 `@echarts` → 100+ 柱子被导出为独立 png → **资源爆炸**
- 根容器无 Auto Layout → **布局完全错乱** → 元素重叠

### 3.3 反面案例 2（Auto Layout 缺失）

```
cp-流量监测（Frame，无 Auto Layout）
├── bg（Frame，背景图）
├── title（Text）
├── stat-cards（Frame，无 Auto Layout）
│   ├── stat-card-1
│   ├── stat-card-2
│   └── stat-card-3
└── @echarts/bar（Frame）
```

**生成结果：**
- 根容器无 Auto Layout → `layoutMode` 为 `null` → **布局方向不确定** → 元素重叠
- `stat-cards` 无 Auto Layout → 3 个统计卡**堆叠在一起**，无间距

---

## 四、省略整理步骤的演进路径

### 4.1 现状：为什么必须整理？

| 阶段 | 当前方案 | 痛点 |
|-----|---------|-----|
| Figma → 节点解析 | 依赖命名 + Auto Layout 确定性事实 | 设计稿不规范 → 生成质量差 |
| Vision fallback | 视觉解析颜色/尺寸/布局 | 不可靠，还原度低 |
| 资源映射 | `downloadStatus` 契约 + 命名识别 | 无命名 → 资源丢失 |

### 4.2 短期优化（1-2 周，降低整理成本）

**目标：把 5-15 分钟降到 2-3 分钟，不改变管线逻辑，只降低人工成本。**

| 方案 | 说明 | 工作量 | 效果 |
|-----|------|-------|-----|
| **Figma 插件辅助检查** | 开发 Figma 插件，提交前自动检查命名/Auto Layout，高亮不合规节点 | 2-3 人天 | 产品/设计 1 分钟自检，减少返工 |
| **命名规范模板** | 提供 Figma 组件库模板（预命名 bg/icon/tab 等，含 Auto Layout） | 1-2 人天 | 设计直接用模板，无需手动整理 |
| **Lite 模式增强** | 截图/低保真原型 → 秒级出布局 | 已有基础，增强中 | 不依赖 Figma 规范，快速验证 |

**短期方案的技术可行性：**
- Figma 插件通过 Figma Plugin API 读取节点树，检查 `name` 模式和 `layoutMode` 属性，逻辑与后端 `figma-connector.js` 一致
- 模板库只需创建 5-10 个常用布局模板（统计卡、图表容器、筛选栏等），设计拖拽复用

### 4.3 中期优化（1-2 个月，部分省略整理）

**目标：不规范稿还原度 70-85%，整理耗时降到 0-1 分钟。**

| 方案 | 说明 | 工作量 | 效果 |
|-----|------|-------|-----|
| **Vision 增强** | 训练专用 Vision 模型，从 Figma 截图推断布局/颜色/资源类型 | 2-3 周 | 命名不规范时，Vision 兜底还原度 70%+ |
| **Auto Layout 几何推断** | 从节点 bbox 位置（重叠检测/间距分布/对齐关系）推断布局意图 | 1-2 周 | 无 Auto Layout 时，几何推断兜底布局方向 |
| **资源智能识别** | 结合命名 + 视觉属性（尺寸/形状/颜色）+ 上下文（父容器类型）综合判定 | 1-2 周 | 无命名时，多信号融合识别资源 |

**中期方案的技术可行性：**
- **Vision 增强**：当前管线已有 Vision 解析（`visual-parser.js`），但仅作为 fallback。中期需要：① 用标注数据训练专用模型（区分 bg/icon/text/chart）；② 从截图推断 Auto Layout 方向（水平/垂直）；③ 识别图表区域（柱状图/饼图/折线图）自动加 `@echarts` 标记
- **几何推断**：核心算法是 bbox IoU + 间距聚类。例如：多个节点水平排列且间距均匀 → 推断 `layoutMode=HORIZONTAL`；垂直堆叠 → `layoutMode=VERTICAL`。已有开源方案（如 Figma 自身的 Auto Layout 算法）可参考
- **多信号融合**：当前 `_identifyNodeType()` 是单一信号（命名优先，失败后视觉 fallback）。中期改为加权评分：命名信号 0.4 + 尺寸信号 0.2 + 形状信号 0.2 + 上下文信号 0.2，综合判定节点类型

### 4.4 长期目标（3-6 个月，完全省略整理）

**目标：任意 Figma 稿（含乱稿）还原度 80%+，整理耗时 0。**

| 方案 | 说明 | 工作量 | 效果 |
|-----|------|-------|-----|
| **Figma → 代码端到端** | 不依赖 Figma API 节点树，直接输入 Figma 截图 → Vision 解析 → 生成代码 | 2-3 个月 | 设计稿任何状态均可生成，无需整理 |
| **自然语言驱动** | 产品描述需求 → AI 生成 Figma 草稿 → 确认 → 生成代码 | 3-4 个月 | 跳过 Figma 设计阶段，直接文字驱动 |
| **设计系统同步** | 接入企业 Figma Design System，自动同步组件规范 | 1-2 个月 | 设计稿天然符合规范，无需整理 |

**长期方案的技术可行性：**
- **端到端模型**：这是行业前沿方向（Vercel v0、Lovable、bolt.new 等已验证可行性）。核心挑战：① Figma 截图信息损失（矢量→栅格）；② 复杂布局的精确还原；③ 交互逻辑的理解。当前 GPT-4o / Claude 4 的视觉能力已能处理简单组件，复杂大屏仍需优化
- **自然语言驱动**：需要构建「需求描述 → Figma 结构 → 代码」的完整链路。短期可先用 LLM 生成 Figma JSON（模拟节点树），中期直接用 Vision 模型从文字生成组件代码
- **设计系统同步**：依赖企业 Figma 团队建立 Design System（组件库 + 命名规范 + Auto Layout 模板）。平台侧只需接入 Figma Dev Mode API，自动读取规范

### 4.5 各阶段对比

| 维度 | 当前（必须整理） | 短期（降低整理） | 中期（部分省略） | 长期（完全省略） |
|-----|---------------|---------------|---------------|---------------|
| **Figma 命名** | 必须规范 | 插件辅助检查 | Vision 兜底 | 不需要 |
| **Auto Layout** | 必须完整 | 模板预配置 | 几何推断 | 不需要 |
| **资源标记** | 必须 bg/icon/@echarts | 模板预标记 | 多信号融合 | 不需要 |
| **整理耗时** | 5-15 分钟/组件 | 2-3 分钟/组件 | 0-1 分钟/组件 | 0 |
| **生成还原度** | 90%+（规范稿） | 90%+（规范稿） | 70-85%（不规范稿） | 80%+（任意稿） |
| **适用场景** | 正式生产 | 正式生产 + 快速验证 | 快速验证 + 正式生产 | 任意场景 |
| **总工作量** | — | ~3-5 人天 | ~4-7 人周 | ~3-6 人月 |

---

## 五、需求分析：为什么需要这个演进？

### 5.1 当前痛点

| 角色 | 痛点 | 影响 |
|-----|------|-----|
| **产品经理** | 不懂 Figma 管线规范，提交的稿子命名随意、无 Auto Layout | 生成还原度低，反复返工 |
| **设计师** | 整理规范增加工作量，每个组件多花 5-15 分钟 | 抵触使用平台，回到本地 AI |
| **前端开发** | 拿到还原度低的产物，手动改代码时间 > 直接写 | 平台价值感低，推广困难 |
| **平台团队** | 大量工单来自"生成效果差"，排查后发现是输入不规范 | 支持成本高，口碑受损 |

### 5.2 业务价值

| 指标 | 当前 | 短期目标 | 中期目标 | 长期目标 |
|-----|------|---------|---------|---------|
| 单组件整理耗时 | 5-15 min | 2-3 min | 0-1 min | 0 |
| 生成还原度（规范稿） | 90%+ | 90%+ | 90%+ | 90%+ |
| 生成还原度（不规范稿） | 40-60% | 40-60% | 70-85% | 80%+ |
| 用户满意度 | 6/10 | 7/10 | 8/10 | 9/10 |
| 平台推广阻力 | 高（需培训规范） | 中（插件辅助） | 低（AI 兜底） | 极低（无门槛） |

### 5.3 优先级建议

```
P0（立即做）：短期方案 — Figma 插件 + 模板库
  ✅ 工作量小（3-5 人天），见效快
  ✅ 不改变管线逻辑，风险低
  ✅ 培训时可演示插件自检，增强信心

P1（Q4 规划）：中期方案 — Vision 增强 + 几何推断
  ⚠️ 需要标注数据和模型训练，周期长
  ⚠️ 但能显著降低使用门槛，提升推广速度

P2（2027 H1 规划）：长期方案 — 端到端模型
  🔮 行业前沿，需持续跟踪 GPT-5 / Claude 4 等模型能力
  🔮 可考虑接入第三方 API（v0 / Lovable）快速验证
```

---

## 六、快速参考卡片

### 提交前 3 分钟自检（必做）

```
1. 根容器是否语义化命名？（不是 Frame 123 / bg）
2. 所有图标是否命名为 icon / icon-* ？
3. 图表区域是否标记 @echarts/* ？
4. 根容器是否有 Auto Layout？（Shift+A）
5. layoutMode 是否为 HORIZONTAL 或 VERTICAL？
```

### 命名速查表

| 元素 | 命名 | 管线行为 |
|-----|------|---------|
| 背景图 | `bg` / `bg-*` / `背景` | 下载为资源，挂载到父容器 |
| 图标 | `icon` / `icon-*` / `图标` / `arrow` | 下载为资源，img 标签使用 |
| 图表 | `@echarts/*` / `@chart/*` | 跳过资源导出（运行时渲染） |
| UI 控件 | `@antd/*` / `@element/*` | 下钻业务内容，跳过控件构件 |
| 按钮 | `btn-*` | 保留命名，生成可读代码 |
| Tab | `tab-*` | 保留命名，生成可读代码 |
| 标题 | `title` / `subtitle` | 保留命名，生成可读代码 |

### 省略整理的演进路线

```
现在（必须整理）
  → 短期：Figma 插件 + 模板（降低整理成本）
  → 中期：Vision 增强 + 几何推断（部分省略）
  → 长期：Figma→代码端到端（完全省略）
```

---

**文档维护**：本文档随平台管线演进持续更新，下次评审时间：培训后 1 周（2026-09-11）
**反馈渠道**：如有补充建议，请在群内反馈或编辑本文档提交 PR
