# vision 拆行实证 · 9e5406fb（部署节点概览，2026-11-16）

> 用户指令「输出 vision 拆行」——把 vision 把单卡误读为多行 items 的原始输出与 Figma 真值逐字段对照。

---

## 一、Figma 真值（`48:5798` 卡子树，vision 拆行前的事实）

```
48:5798 Group 2136638415 GROUP  y=51606 h=72     ← 一张卡（高 72）
├─ 48:5799 Rectangle（卡底）
├─ 48:5800 image 313（顶部高亮条 h=29）
└─ 48:5801 Group 2136638414 GROUP y=51622 h=41   ← 内容行（一张图标+四组文字）
   ├─ 48:5806 江苏联网节点  TEXT y=51622 h=18     ← 标题（左上）
   ├─ 48:5804 江苏省南京市建邺区江东中路 TEXT y=51649 h=14 ← 地址（左下）
   ├─ 48:5802 3,792 TEXT y=51623 h=18            ← 在线数（右上）
   ├─ 48:5805 在线 TEXT y=51649 h=14             ← 「在线」标签（右下）
   ├─ 48:5803 28 TEXT y=51625 h=14               ← 离线数（右右上）
   ├─ 48:5807 离线 TEXT y=51649 h=14             ← 「离线」标签
   └─ 48:5808 icon GROUP y=51623 h=40            ← 蓝色图标（仅 1 个）
```

**真值语义**：一张卡 = 左列（标题+地址）+ 右列（在线数/离线数两组），图标 1 个，全卡高 72。

---

## 二、vision 输出（拆行后，`.checkpoint/visual.json` 原文）

`body.items` 被拆成 **3 个横向 item**：

```jsonc
[
  {
    "layout": "horizontal",
    "repeatedFill": "#a6ceff",                    // ← 整卡蓝底被记到第一行
    "icon":  { "figmaNode": "48:5801", "resource": "icon-5808.png" },   // 图标①
    "content": { "elements": [
      { "type": "label", "text": "江苏联网节点", "styles": { "fontSize": 14, "fontWeight": "bold" } },
      { "type": "value", "parts": [ { "text": "江苏省南京市建邺区江东中路" } ] }
    ]}
  },
  {
    "layout": "horizontal",
    "icon":  { "figmaNode": "48:5808", "resource": "icon-5808.png" },   // 图标②（同一图标第二次）
    "content": { "elements": [
      { "type": "label", "text": "在线",   "styles": { "color": "#00b42a" } },
      { "type": "value", "parts": [ { "text": "3,792", "type": "number" } ] }
    ]}
  },
  {
    "layout": "horizontal",
    "icon":  { "figmaNode": "48:5808", "resource": "icon-5808.png" },   // 图标③（同一图标第三次）
    "content": { "elements": [
      { "type": "label", "text": "离线",   "styles": { "color": "#f53f3f" } },
      { "type": "value", "parts": [ { "text": "28", "type": "number" } ] }
    ]}
  }
]
```

---

## 三、逐字段错位对照

| Figma 真值 | vision 输出 | 错误类型 |
|---|---|---|
| 1 张卡（48:5798，h=72） | 3 个并列 item | **卡容器未识别**：把卡内两列文字组拆成 3 行记录 |
| 1 个图标（48:5808） | 3 个 icon（同一 `icon-5808.png` 重复 3 次） | 图标凭空复制 ×3 |
| 标题+地址 = 左列一段 | item[0] 的两 elements | 半对（被并进第一行，但与在线/离线割裂） |
| 在线数+「在线」标签 = 右列组① | item[1] 独立一行 | **列拆行**：右列两组被拆成两条记录 |
| 离线数+「离线」标签 = 右列组② | item[2] 独立一行 | 同上 |
| 卡底 `#a6ceff`（整卡） | `repeatedFill` 挂在 item[0] | 背景归属错位 |
| 全卡高 72 | 无 item 高度概念（lines 平铺） | 行高失控的源头 |

**连锁后果**（此前已归因）：LLM 按 3-item 结构生成 ⇒ 图标重复 3 次、在线/离线错行；6 卡同构但 declaredGroups=0 ⇒ 刀66 不触发 ⇒ 六份代码；72px 塞 3 条 item ⇒ 结构性 y 重叠 ⇒ RUNTIME-016 3 轮重试全败 ⇒ **任务失败**。

---

## 四、拆行的判定学特征（供 vision 卡容器识别立项用）

1. **触发形态**：卡内多组「label + value」纵向对（在线/离线、标题/地址）被逐组拆行；
2. **可辨反证信号**（当时全部存在但未被利用）：
   - 3 个 item 的 icon **同一 resource**（icon-5808.png）⇒ 同一视觉实体被复制；
   - 3 个 item 的 figmaNode 全部落在**同一父 Group**（48:5801/48:5808 同为 48:5798 子树）；
   - items 总高（3×~24px）远小于段高 72px 的合理卡高分布；
   - `repeatedFill` 只挂 item[0] ⇒ 三行共享同一底的强信号。
3. **修复方向**（vision 提示词/后处理双路）：
   - prompt：增补「卡内 label/value 纵向对属于同一卡的两列，禁止按行拆 items；同 icon 多行 ⇒ 合并」反例；
   - 后处理：`同 icon + 同父 Group + repeatedFill 单挂` 三信号命中 ⇒ 确定性合并回单卡两列（与幻觉剔除同族，幂等纯函数）。
