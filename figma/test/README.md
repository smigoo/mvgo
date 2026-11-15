# Figma 整理插件回归安全网

> 阶段 1 交付。目的：把「改了会不会坏别处」从靠推理变成可测量的门禁。
> 所有脚本只读消费 `backend-node/data/figma-node-cache/*.json` 与 `figma/src/cursor_mcp_plugin/code.js`，
> 不写产品文件、不部署、不重启、不 push。

## 为什么需要它（假绿根因）

之前 13 个验证脚本全是手工桩树，`absRect` 是 mock、reparent 是纯 `children.push`，
**不模拟 Figma `insertChild`/`appendChild` 自动保持绝对位置、x/y 相对父级的语义**。
结果：`hoistContentBackdrops` 里 reparent 后手动补 `n.x = ox + (pBox.x - rootBox.x)`，
真机二次补偿导致 bbox 漂移走回滚，桩树却 100% 全绿。改的人=验的人，同正则假绿。

本安全网用 **29 个真实缓存节点树** + **忠实的 Plugin API 节点 shim** 解决这一点。

## 文件

| 文件 | 作用 |
|---|---|
| `figma-node-shim.cjs` | REST 节点升格成 Plugin API 语义节点：几何精确还原、reparent 保绝对位置、x/y 联动、pluginData |
| `corpus-harness.cjs` | 加载真实 code.js 到 vm，对 29 树跑 `structure-only`，输出结构快照；`--baseline` / `--check` / `--summary` / `--list` |
| `verify.cjs` | 统一入口：语法 + 几何还原 + reparent 语义 + corpus diff + 阴阳对照，一条命令 |
| `mark-backdrop-verify.cjs` | 阶段4 手工背景打标入口验证（7 项：写标记/几何零变化/不误标/幂等/空选区） |
| `slot-con-inplace-verify.cjs` | 4.1 定点回归：目标样本原地建槽 8 项 + 阴性对照仍建 wrapper |
| `corpus-snapshots/baseline.json` | 固化基线（29 样本 × 结构快照）；4.1 有意变更后已单样本放行重建 |

## 用法

```bash
cd figma/test

# 一条命令全量自检（改完产品代码后必跑）
node verify.cjs

# 只看 corpus diff（29 真树 vs 基线）
node corpus-harness.cjs --check

# 允许某几个样本变化（改功能时显式列出目标样本，其余仍必须零差异）
node corpus-harness.cjs --check --allow Q1QuWz0j9YdIsxUnu6F1oV_1-479_9e4c1b4f.json

# 调试：看每样本 summary 计数
node corpus-harness.cjs --summary

# 阶段4 手工背景打标入口验证
node mark-backdrop-verify.cjs

# 确认行为变更是有意的，才重建基线（重建即宣布新行为为 accepted）
node corpus-harness.cjs --baseline && node verify.cjs
```

## 门禁判据（阶段 2/3/4 必须遵守）

1. **零差异为默认**：任何改动后，`node corpus-harness.cjs --check` 必须 29/29 零差异。
2. **变化需显式授权**：若改动就是为了让某组件变好，用 `--allow=<文件名>` 列出目标样本；
   **名单外的 28 个仍必须零差异**。任一非目标样本变化 = 误伤 = 立即停下。
3. **阴阳对照**：`verify.cjs` 的 Y01 证明注入判据篡改会被抓。若哪天 Y01 不再 FAIL，
   说明安全网本身失效，先修安全网再改产品。
4. **基线更新即声明**：`--baseline` 会把当前行为固化为 accepted。只有在你确认
   「这 29 个样本的新行为都正确」后才能跑；禁止用它掩盖回归。

## 阶段 2/3/4 + 4.1 落地状态（4.1 为唯一有意行为变更）

| 阶段 | 内容 | 提交 |
|---|---|---|
| 2 作用域控制 | `detectRootScope()` 只读检测多组件 Frame / 非组件根，UI 警告；「保持现状先跳过」不拆分 | `380af3101` |
| 3 判据硬化 | 预演实证去掉 `isBgLike` 名字短路会让 11/29 样本背景识别退化（破坏非修复）⇒ 改为 `auditBackdropEvidence()` 只读审计（打标/几何/仅名字三分类）。实测打标0/几何16/仅名字16 | `23664388f`(auto-sync 抢先) + `78e507e2e`(时机修复) |
| 4 功能收尾 | 切段护栏实测 `1:479` 当前不切 3 段⇒跳过；L0 AL 报告已含完整建议值⇒不加；仅落地手工背景打标入口 `🏷 标记选中为根背景`（写 pluginData，零几何变化） | `485da48ad` |
| 4.1 双 section 原地建槽（v20261116） | `createSlotConGroup` 新增 `hasTwoContentBands`：唯一内容容器**恰好 2 个直接子节点**、非骨架/非 TEXT/非资源夹、按 y 不重叠且每块 ≥12%·容器高/合计 ≥50% ⇒ 原地改名 `slot-con` + 写 `mvSlotCon`，不再套 wrapper。目标 `Q1QuWz…1-479`；阴性对照 `GTcJm0…38-3134` 仍建 wrapper | 工作区待提交 |

## 当前基线

- 产品代码 tag：`backup/plugin-reliable-baseline-20261116`（`485da48ad`，4.1 之前）
- 阶段 2/3/4 只读检测/手工入口零行为变更；**4.1 是唯一有意行为变更**：`--allow` 单样本放行后重建基线（目标 hash `eac1b4619ec9 -> ab80552b1ea1`，其余 28 hash 不变）
- 样本数：29；目标样本不再多一层 `content` wrapper，`slotConCreated=0 / slotConReused=1`
- 统一验证：PASS 6 / FAIL 0；手工打标验证：PASS 7 / FAIL 0；定点回归 `slot-con-inplace-verify.cjs`：PASS 8 / FAIL 0（232 节点几何零漂移）
- 阴阳对照：几何篡改被抓、判据篡改被抓（5/5）

## 纳入样本（按 fileKey 分组）

- `1t7Dmm…`（5）：环境监测 / 重点车辆 / 设备监测 / 智能检测 / 流量监测
- `GTcJm0…`（6）：部署节点概览 / 设备详情 / 合作厂商 / 设备列表等
- `GsHTml…`（5）：处置效率 / 快速发现 / 事件分析等
- `Phqur1…`（2）：设备监测 / 智能检测
- `Q1QuWz…`（3）：今日巡查（原始）/ 隐患排查（两版）
- `XK5lAc…`（1）：隐患排查 Copy
- `cseWS8…`（1）：监测预警
- `t8Cp4K…`（6）：流量预警 / 饱和度 / 预测 / 告警详情 / 交通状态 / 低速并行
