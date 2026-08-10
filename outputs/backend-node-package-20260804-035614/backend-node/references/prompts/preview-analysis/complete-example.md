# 完整分析示例（必须参考）

## 错误示例 ❌

**绝对禁止：只识别一个控件**

```json
{
  "target": "顶部地点切换控件",
  "type": "tab-switch",
  "layout": {
    "sections": []  // ❌ 空数组是严重错误！
  }
}
```

## 正确示例 ✅

**必须像这样完整分析所有区域：**

```json
{
  "componentName": "重点车辆监测",
  "summary": "包含Tab切换、今日累计标题、三个统计卡片",
  "layout": {
    "type": "vertical-stack",
    "sections": [
      {
        "id": "section-tabs",
        "name": "Tab切换栏",
        "role": "tabs",
        "headerRelation": "title-same-row",
        "slotCandidate": "header-right",
        "children": [
          { "role": "tab", "name": "江阴靖江长江隧道", "active": true },
          { "role": "tab", "name": "江阴大桥", "active": false }
        ]
      },
      {
        "id": "section-total",
        "name": "今日累计",
        "role": "stats-header",
        "headerRelation": "content-below-title",
        "children": [
          { "role": "icon", "name": "菱形图标" },
          { "role": "text", "name": "今日累计" }
        ]
      },
      {
        "id": "section-cards",
        "name": "统计卡片",
        "role": "card-row",
        "layout": "horizontal-3-columns",
        "children": [
          { "role": "stat-card", "name": "危化品车", "value": "51次" },
          { "role": "stat-card", "name": "重型货车", "value": "2次" },
          { "role": "stat-card", "name": "超高车辆", "value": "19次" }
        ]
      }
    ]
  }
}
```

## 强制要求

1. **sections 数组不能为空** - 至少要有 1 个 section
2. **每个 section 必须有 children** - 列出所有可见元素
3. **不要只识别一个控件就停止** - 必须分析整个组件
4. **从上到下完整分析** - 标题、控件、内容区、卡片等全部识别

如果你只看到了切换按钮，**继续向下看**，还有什么？
- 是否有小节标题？
- 是否有数据卡片？
- 是否有图表？
- 是否有列表？

**全部识别后再输出 JSON！**
