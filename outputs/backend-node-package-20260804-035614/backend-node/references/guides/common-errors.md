# 常见错误案例集

> 收集视觉分析阶段最容易犯的错误，帮助模型避开陷阱。

## 错误案例 1：header.controls 遗漏（最高频）

**现象**：
```json
{ "header": { "title": "环境监测", "controls": [] } }
```

**实际图像**：标题右侧明显有刷新按钮和更多按钮

**原因**：
- 小图标（<20px）被忽略
- 认为是"装饰性"而非功能性控件
- 对比度低时看不清

**正确做法**：
```json
{
  "header": {
    "title": "环境监测",
    "controls": [
      { "type": "icon-button", "icon": "refresh", "confidence": "medium" },
      { "type": "icon-button", "icon": "more-ellipsis", "confidence": "medium" }
    ]
  }
}
```

---

## 错误案例 2：backgroundBrightness 颠倒

**现象**：深色大屏系统被判为 light

**原因**：
- 采样到卡片内部（白色）而非外层背景（深蓝）
- 渐变背景取了亮端采样点

**正确做法**：
- 采样**主容器/外层背景**，非卡片内背景
- 渐变背景取加权平均或起始端
- 用文字颜色交叉验证（白字→dark 背景）

---

## 错误案例 3：交互遗漏

**现象**：明显有 tab 切换功能，但 interactions 为空

**原因**：
- 将 tab 标签误判为普通文字
- 认为"不是标准 tab 组件"

**正确做法**：
任何水平排列的可点击文字项都应报告为 tab-switch 交互：
```json
{
  "type": "tab-switch",
  "options": ["监控", "照明", "通风", "供配电"],
  "activeIndex": 0
}
```

---

## 错误案例 4：图表信息不完整

**现象**：
```json
{
  "type": "line",
  "legend": [],
  "legendPosition": "",
  "seriesColors": []
}
```

**原因**：
- 认为图例"不重要"
- 颜色值"无法精确提取"就放弃

**正确做法**：
即使不完全准确也要填写最佳估计值：
```json
{
  "type": "line",
  "legend": ["CO₂", "能见度"],
  "legendPosition": "top-right",
  "seriesColors": ["#1890ff", "#52c41a"],
  "seriesColorsConfidence": "estimated"
}
```

---

## 错误案例 5：臆造不存在的元素

**现象**：输出了图像中没有的元素

**典型例子**：
- 添加了图像中没有的"导出 CSV"按钮
- 臆造了不存在的筛选条件
- 编造了不确定的数据单位

**原则**：**看不到就不写**。宁可少报，不可多报。
