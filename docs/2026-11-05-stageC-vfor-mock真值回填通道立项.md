# 立项：Stage C「v-for/mock 数据驱动形态」真值回填通道（83cfb20e nav 标签实锤）

## 背景与症状

83cfb20e（设备监测）左侧竖排分类标签（监控/照明/通风/供配电/消防/交通诱导）渲染与 UI 不符：
- 非激活字色产物 `#1F2329` vs 真值 `#3b80e7`（figma TEXT fill，nodeId 2:8832/8838/8843/8848/8853）
- 激活胶囊产物纯色 `#2A7FEC` vs 真值 GRADIENT_LINEAR 右→左 `#31A8FF→#70BFFF`（nodeId 2:8826）

## 根因（结构性，非单点）

这些元素是 **Stage A LLM 生成的 `tabs`/`navs` mock 数组 + `v-for` + `{{ x.label }}` 插值** 渲染。
Stage C 现有回填通道的形态盲区：

| 通道 | 处理形态 | 对 v-for/mock 形态 |
|---|---|---|
| 文本色回填（exact/substr） | 模板静态文本节点 | ❌ 文本在 script mock 数组里（83cfb20e：evaluated=74, miss=43, interpSkipped=7, colorApplied=3） |
| Q2 容器 fill 回填 | 容器 childTexts 交集 | ❌ 文本不在模板 DOM 静态层 |
| script 字面量回填 | echarts option 配置 | ❌ 只覆盖图表配置，不覆盖样式类 mock 字段 |

结果：Stage A LLM 臆造的近似色（`#C5D6EC/#1F2329`）无通道纠正。
同类症状族：bg 图锚定（AI label 对但锚定链路对 v-for 产物跳过）、汇总卡背景（投影组 dark 副本，已修）。

## 方案要点（假设，需真机验证后细化）

1. **mock 数组样式字段回填**：script 中 `const navs/tabs = [{ key, label, badge }]` 形态 →
   按 label ↔ figma TEXT 真值锚定（已有 wordsMatch/归一化判据复用）→
   若真值带独立色（激活/非激活分组色）→ 注入 `color` 字段到数组项 + 模板 `:style` 绑定；
2. **激活态真值**：figma `tab-active` 命名组 → 激活底真值（渐变/纯色）注入 `.nav--active` 规则；
   初始激活项 = tab-active 组对应的数组项（对齐 `ref('<key>')` 初始值）；
3. **判据纪律**：复用现有归一化/唯一性裁决（多命中弃权），不新造第二套文本匹配口径；
   真机日志计数行（`vforColorApplied/vforSkipped*` 桶）；阳性对照 = 83cfb20e nav 标签。

## 影响面（预评估）

- 新通道挂 Stage C 文本回填之后（C3 前），不改动既有通道判据；
- 消费 figma-node-cache 全量节点树（现有缓存，无需新请求）；
- 双端：仅 lite-lab 管线。

## 待细化

- 渐变真值 → css `linear-gradient()` 的角度换算（gradientHandle → deg）；
- mock 数组形态多变体（数组项含 icon/color 字段 vs 纯 label）的注入位置；
- 与 LiteService 生成约束（prompt 层要求 mock 数组预留 style 字段）的分工。

## 状态

2026-11-05 立项（用户裁决：原地修复 + 管线立项）。原地修复已完成
（candidate r-6e4942f8：nav 字色 #3B80E7 + 激活渐变，4 目录 × 3 投影）；本通道**未实施**。
