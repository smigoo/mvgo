# FIGMA-ORGANIZE-GUIDE.md — Figma 大屏文件 AI 自动整理手册

> 给 AI 助手（Cursor / Claude Code / WorkBuddy 等）读的操作手册。  
> 用户说「按 FIGMA-ORGANIZE-GUIDE 整理这个 Figma 文件」时，按本手册执行。  
> 语义命名由 AI 实时分析，**不使用任何词典或映射表**。

## 一、前置条件（一次性）

1. **启动 socket**（用户终端或后台）:
   ```bash
   cd cursor-talk-to-figma-mcp && ./start.sh   # 监听 ws://localhost:3055
   ```
2. **Figma 插件**: 画布右键 → Plugins → Development → 运行 cursor-talk-to-figma 插件 → Join 任意 channel（名字随意）
3. 连通验证:


   ```bash
   node figma-cli.mjs auto get_document_info
   ```
   - `auto` = 自动发现活跃 channel（socket 需为新版）；失败时让用户把插件面板上的 channel 名发来，手动替换 `auto`

## 二、整理工作流（核心）

### Step 1 扫描

```bash
node figma-auto-organize.mjs auto scan <根节点ID>
# → /tmp/figma-scan-report-<ts>.json
```

报告含：`treeBrief`（前3层结构）、`pending`（每个待命名节点的 id/类型/尺寸/坐标/所在路径/子树文本/图片填充）。

### Step 2 AI 实时分析生成命名清单

读报告，按下方命名规范给每个 pending 节点定名，生成 ops JSON：

```json
{ "ops": [
  {"action":"rename","nodeId":"23:1972","name":"header-brightness"},
  {"action":"move_node","nodeId":"1:2","x":10,"y":0},
  {"action":"set_export_settings","nodeId":"1:3","settings":[{"format":"PNG","constraint":{"type":"SCALE","value":1},"suffix":""},{"format":"PNG","constraint":{"type":"SCALE","value":2},"suffix":"@2x"}]}
]}
```

分析要点：

- **从子树文本推语义**（"亮度监测"→brightness，自行翻译，无词典）
- **从结构签名推角色**：500-750×30-50 含标题文本的 FRAME = 标题条；IMAGE fill = 静态图；≤40×40 含图形子级 = 小图标
- **跳过**：图表柱体内部最小装饰（VECTOR 高光面/柱帽等，已被语义父级包裹，改了无益）
- 同名冲突：同父级下同类部件带序号（dimming-progress-1..4），不同父级可重名

### Step 3 执行

```bash
node figma-auto-organize.mjs auto apply /tmp/my-ops.json
# 输出: 执行完成: 成功 N / 失败 M
```

### Step 4 验证

```bash
node figma-cli.mjs auto scan_tree '{"nodeId":"<某节点>"}'   # 抽查结构
```

改名节点数对比 scan 前后；必要时 export_node_as_image 截图确认视觉。

## 三、命名规范

| 前缀                    | 用途                           | 例                             |
| --------------------- | ---------------------------- | ----------------------------- |
| `cp-`                 | 业务组件/面板                      | cp-energy-overview            |
| `@echarts/类型`         | 图表占位（折线图/柱状图/环形图/bars+lines） | @echarts/折线图                  |
| `bg-`                 | 背景（全尺寸打底图/标题底图/装饰底）          | bg-title-bar、bg-header        |
| `img-`                | 内容静态图                        | img-battery-icon              |
| `icon-`               | 小图标（≤40×40）                  | icon-rank-badge-1             |
| `header-`             | 标题条容器                        | header-running                |
| `chart-*` `tooltip-*` | 图表内部结构                       | chart-legend / tooltip-row-2  |
| 语义名                   | 其他结构                         | dimming-card-bj、ratio-row-max |

header 内部标准结构：`bg-header`（文件夹）← [header-deco-l, bg-header-base, bg-header-border, bg-header-glow, header-deco-r]，文字与插槽（slot-xxx）留在外层。

## 四、可用命令速查

```bash
node figma-cli.mjs [ch|auto] <command> '{"json":"params"}'   # 单命令
node figma-batch.mjs [ch|auto] <ops.json>                    # 批量（失败继续，末尾汇总）
node figma-auto-organize.mjs [ch|auto] scan <rootId>          # 扫描报告
node figma-auto-organize.mjs [ch|auto] apply <ops.json>       # 执行清单
```

常用 command：`get_document_info` `scan_tree{"nodeId"}` `get_node_info{"nodeId"}` `rename_node{"nodeId","name"}` `set_export_settings` `move_node{"nodeId","x","y"}` `create_frame{...}` `set_parent{"nodeId","parentId","index"}` `delete_node` `export_node_as_image`。

## 五、血泪坑清单（必读）

|   |   |   |
| - | - | - |

1. **透明度 0 陷阱**：插件旧代码 `opacity: a || 1` 会把 a=0 变不透明。已修复；若创建透明 frame 后出现黑块，即此 bug（重跑插件加载新代码）。
2. **create_frame 的 x/y 是页面绝对坐标**，不是相对父级！合并容器时：先 create（页面级）→ set_parent 到目标（自动保绝对）→ 子元素 set_parent（自动保绝对）。手动 move 前先 scan 确认相对坐标。
3. **setParent 保绝对坐标**：移动后 node.x = 绝对差值，子元素视觉位置不变；但若父级坐标错，子元素 rel 坐标会系统性偏移（=父级偏移的负值），修正法：子元素先 move 到 `现rel+父错位`，再把父 move 到目标位。
4. **FRAME 默认 clipsContent=true**：子元素越界即被裁剪（背景"消失"常见根因）。排查先 scan 子元素坐标 vs frame 尺寸。
5. **get_node_info 对单个 VECTOR 返回 null**（JSON_REST_V1 导出限制），验证节点用 `scan_tree`。
6. **rename 的命令名是 `rename_node`**。
7. **GROUP 不支持 layoutSizing**；GROUP 不建立坐标系（child.x 相对 group.parent）。
8. **scan_tree 大文件一次 ~2s**，优先用 Scan 而非逐节点 get_node_info。
9. socket 由用户终端常驻跑（AI 后台进程可能被回收）；插件重连后 channel 会变，用 `auto` 自动发现。

## 六、MCP 方式（可选）

本仓库同时是 MCP server（`node dist/server.cjs`），可在支持 MCP 的客户端（Cursor 的 mcp.json 等）配置 `talk-to-figma`。但 MCP 工具列表为原版固定集（不含 scan_tree 等新命令），**推荐直接用终端 CLI 流程**（上述 Step 1-4），能力更全。
