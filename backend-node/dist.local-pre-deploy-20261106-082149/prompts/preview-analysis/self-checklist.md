# 强制自检 Checklist（10 项）

输出 JSON 前，**必须逐项确认**以下 10 个检查点：

## BLOCK 级别（必须全部通过）

- [ ] **1. layout.sections 存在且为数组**
  - 不能是 null、undefined、空对象
  - 至少有 1 个 section

- [ ] **2. styles.backgroundBrightness 值合法**
  - 只能是 `"dark"` 或 `"light"`
  - 不能是 "black"、"white"、"unknown" 等

- [ ] **3. theme 与 backgroundBrightness 一致**
  - dark → theme 以 "深色" 开头
  - light → theme 以 "浅色" 开头

## WARN 级别（建议通过）

- [ ] **4. 每个 section 都有 headerRelation**
  - 取值: "content-below-title" / "title-same-row" / "no-header" / "header-only"

- [ ] **5. title-same-row 时有 slotCandidate**
  - headerRelation = "title-same-row" 时必须指明 slotCandidate

- [ ] **6. 图表 legend 信息完整**
  - 有图表时: legend[] 非空, legendPosition 有值, seriesColors[] 非空

- [ ] **7. interactions 不为空（如果有可交互元素）**
  - 存在 tab/按钮/图表时，interactions 应有对应条目

- [ ] **8. body.children 与布局一致**
  - 有 children 时 body.layout 不能为空

- [ ] **9. 视觉元素颜色已提取**
  - styles.colors 数组应包含主要颜色值

- [ ] **10. 组件类型(type)已识别**
  - 如果整体是一个特定组件（如 tab-switch/chart），type 字段应有值

- [ ] **11. 细粒度文本已完整识别**
  - 坐标轴刻度值、图例文字、时间轴标签（如「2小时前」「当前时间」）、
    数据方向标注（如「北京方向」「上海方向」）、百分比/准确率标签、
    下拉选项文字等小文本（<14px）必须逐一识别，不能只识别大标题
