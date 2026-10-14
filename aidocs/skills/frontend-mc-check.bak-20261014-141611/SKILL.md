---
name: frontend-mc-check
description: 微码组件规范检查工具（v1.0.20）。当用户输入 /frontend-mc-check 或要求检查微码组件规范、查看组件质量报告、检查组件是否符合规范、组件能否上线时触发。支持检查单个组件或全部组件，输出检查结果（业务组件 25 项、服务组件 21 项，决定能否上线）和 AI 质量评分（提升组件质量评分），并生成 HTML + Markdown 报告。检查项按「检查对象」划分 M1~M5 五大系列，结果三态 pass/error/warning；组件类型分为 business/service 两类。
---

# frontend-mc-check — 微码组件规范检查

## 使用方式

- `/frontend-mc-check` — 检查 src/workspace/custom-components 下所有组件
- `/frontend-mc-check <组件名>` — 检查单个组件，如 `/frontend-mc-check c-mc-micro-image`

## 脚本位置

所有脚本位于本 skill 目录下：`aidocs/skills/frontend-mc-check/scripts/`

| 脚本                   | 职责                                                   |
| ---------------------- | ------------------------------------------------------ |
| `mc-check.cjs`         | M1~M5 系列脚本检查（独立闭环）                           |
| `mc-check-config.json` | 枚举值、路径配置                                       |
| `mc-report.cjs`        | 报告生成（读 JSON → HTML/MD）                          |
| `quality-merge.cjs`    | AI 评分合并（quality-scores.json → check-result.json） |
| `add-score.cjs`        | 逐个组件追加评分（解决批量写入过大问题）               |

---

## 评分体系说明

**必须项检查（M 系列，决定能否上线）**

- 必须 100% 通过，任何一项失败即不允许上线
- 由脚本客观检查，结果明确（通过/失败）
- 涵盖：
  - M1 命名规范
  - M2 必要文件
  - M3 declare.json 字段
  - M4 文件格式
  - M5 代码规范

**警告项（warning 级结果）**

- 不影响上线，但建议修复
- 由脚本检测（M3-14 废弃字段、M5-10 硬编码颜色），输出在报告警告列

**质量评分（Q 系列，Quality）**

- 不影响上线，但决定组件质量等级
- 由 AI 审查，满分 100 分，输出百分制评分和等级

| 评级   | 分数区间 | 含义                     |
| ------ | -------- | ------------------------ |
| 优秀   | 85–100   | 质量优秀，可作为参考组件 |
| 良好   | 70–84    | 质量达标，可正常上线     |
| 合格   | 55–69    | 基本可用，建议改进后上线 |
| 待改进 | 0–54     | 质量不足，建议修复后上线 |

完整 M1~M5 检查项清单见 `references/checklist.md`（由 mc-spec-upgrade 维护）。

---

## 组件类型区分

微码组件分为两类，`business` 适用范围的检查项仅适用于**业务组件**（服务组件自动豁免）：

| 类型 | componentCategory | business 项检查 | 说明 |
|------|-------------------|-----------------|------|
| 业务组件 | `business`（默认） | ✅ 需要 | 需要主题/布局，适配一体化平台 |
| 服务组件 | `service` | ❌ 豁免 | 纯逻辑无 UI（后台任务、数据处理等） |

### 配置方式

在 `declare.json` 中添加 `componentCategory` 字段（可选）：

```json
{
  "componentId": "c-mc-micro-image",
  "componentCategory": "service",  // 豁免 business 项检查
  // ...
}
```

### 白名单豁免

无需配置 `componentCategory`，以下组件通过白名单自动豁免 business 项检查：
- `c-mc-micro-*` 模式

配置位置：`scripts/mc-check-config.json` 的 `businessExemptionList`

---

## 执行步骤

### 步骤 1：运行脚本检查（M1~M5 系列）

```bash
# 检查所有组件
node aidocs/skills/frontend-mc-check/scripts/mc-check.cjs

# 检查单个组件
node aidocs/skills/frontend-mc-check/scripts/mc-check.cjs <组件名>

# 外部智能体调用（指定组件绝对路径）
node aidocs/skills/frontend-mc-check/scripts/mc-check.cjs --component-path /abs/path/to/component --output-dir /abs/path/to/output
```

脚本输出：

1. `aidocs/output/reports/<日期_时间>/check-result.json`
2. 同目录生成 `mc-report.html` 和 `mc-report.md`

**注意**：服务组件（`componentCategory: "service"`）或白名单豁免组件（`c-mc-micro-*`）会跳过 business 项检查

如果脚本执行失败，告知用户并跳到步骤 2 仅做 AI 审查。告知用户报告路径。

### 步骤 2：AI 质量评分（Q 系列）

读取 `check-result.json`，获取通过必须项的组件列表（canRelease=true），然后**逐个组件**进行评分。

#### 2.1 初始化评分文件

```bash
node aidocs/skills/frontend-mc-check/scripts/add-score.cjs aidocs/output/reports/<报告目录> --init
```

#### 2.2 逐个组件评分（核心循环）

对每个通过的组件，执行以下子步骤：

**a) 读取该组件的关键文件**（仅读当前组件，不要一次读取所有组件）：

- `package/index.vue`（必读）
- `declare.json`（检查 businessConfig.describe、cssVariableConfig、layoutConfig）
- `resources/config/css-vars.js`（检查 CSS 变量配置）
- 如有子组件目录 `package/components/`，抽查 1-2 个子组件

**b) 按评分维度打分**（见下方评分标准）

**c) 立即写入该组件评分**（推荐使用 heredoc 方式，避免命令行过长）：

```bash
node aidocs/skills/frontend-mc-check/scripts/add-score.cjs aidocs/output/reports/<报告目录> <组件名> <<'EOF'
{
  "totalScore": 78,
  "grade": "良好",
  "scores": {
    "Q1": {"name": "代码质量", "score": 20, "max": 25, "details": [
      {"id": "Q1-1", "name": "注释完整性", "score": 4, "max": 5, "comment": "逻辑有注释"},
      {"id": "Q1-2", "name": "命名规范性", "score": 5, "max": 5, "comment": "命名清晰"},
      {"id": "Q1-3", "name": "代码复用性", "score": 6, "max": 8, "comment": "少量重复"},
      {"id": "Q1-4", "name": "错误处理", "score": 5, "max": 7, "comment": "缺少提示"}
    ]},
    "Q2": {"name": "样式规范", "score": 15, "max": 20, "details": [...]},
    "Q3": {"name": "用户体验", "score": 16, "max": 20, "details": [...]},
    "Q4": {"name": "可复用性扩展配置", "score": 15, "max": 20, "details": [...]},
    "Q5": {"name": "性能与维护性", "score": 12, "max": 15, "details": [...]}
  },
  "suggestions": ["建议1", "建议2"]
}
EOF
```

也支持单行参数方式（适合简单组件）：

```bash
node aidocs/skills/frontend-mc-check/scripts/add-score.cjs aidocs/output/reports/<报告目录> <组件名> '{"totalScore":85,"grade":"优秀",...}'
```

**重要约束**：

- 每个组件评分后**立即写入**，不要等所有组件评完再写
- 推荐使用 heredoc（`<<'EOF'`）方式传入 JSON，可读性好且不受命令行长度限制
- 每次 Bash 调用只处理一个组件
- comment 字段控制在 6 个汉字以内
- **details 字段必须完整**：每个评分维度（Q1-Q5）的 `scores` 对象必须包含 `details` 数组，不能省略！示例格式：

```json
"scores": {
  "Q1": {"name": "代码质量", "score": 20, "max": 25, "details": [
    {"id": "Q1-1", "name": "注释完整性", "score": 4, "max": 5, "comment": "逻辑有注释"},
    {"id": "Q1-2", "name": "命名规范性", "score": 5, "max": 5, "comment": "命名清晰"},
    {"id": "Q1-3", "name": "代码复用性", "score": 6, "max": 8, "comment": "少量重复"},
    {"id": "Q1-4", "name": "错误处理", "score": 5, "max": 7, "comment": "缺少提示"}
  ]}
}
```

**❌ 错误示例（缺少 details）**：

```json
"scores": {
  "Q1": {"name": "代码质量", "score": 20, "max": 25}
}
```

上述格式会导致报告生成时缺少明细说明，必须避免！

#### 2.3 评分标准

##### Q1 代码质量（25分）

| ID   | 检查项     | 满分 | 说明                                |
| ---- | ---------- | ---- | ----------------------------------- |
| Q1-1 | 注释完整性 | 5    | 关键逻辑有注释，复杂方法有说明      |
| Q1-2 | 命名规范性 | 5    | 变量/方法命名语义清晰，符合驼峰规范 |
| Q1-3 | 代码复用性 | 8    | 公共逻辑抽取为方法，无明显重复代码  |
| Q1-4 | 错误处理   | 7    | API 调用有 try/catch，异常有提示    |

##### Q2 样式规范（20分）

| ID   | 检查项          | 满分 | 说明                                       |
| ---- | --------------- | ---- | ------------------------------------------ |
| Q2-1 | scoped 样式隔离 | 5    | `<style scoped>` 或 CSS Modules            |
| Q2-2 | CSS 变量使用    | 5    | 颜色/尺寸使用 `var(--xxx)` 而非硬编码      |
| Q2-3 | 响应式单位      | 5    | 优先使用 em/rem/vw/vh，避免大于5px的固定px |
| Q2-4 | 主题适配        | 5    | 支持 light/dark 主题切换                   |

##### Q3 用户体验（20分）

| ID   | 检查项     | 满分 | 说明                      |
| ---- | ---------- | ---- | ------------------------- |
| Q3-1 | 加载状态   | 7    | 数据加载时有 loading 状态 |
| Q3-2 | 空数据提示 | 7    | 无数据时有友好提示        |
| Q3-3 | 交互反馈   | 6    | 点击/悬浮等操作有明确反馈 |

##### Q4 可复用性扩展配置（20分）

| ID   | 检查项                  | 满分 | 说明                                      |
| ---- | ----------------------- | ---- | ----------------------------------------- |
| Q4-1 | businessConfig 描述完整 | 5    | 每个 businessConfig 项有 describe 字段    |
| Q4-2 | cssVariableConfig 合理  | 5    | 样式自定义点已通过 cssVariableConfig 暴露 |
| Q4-3 | layoutConfig 实现       | 5    | 多布局时正确实现切换（N/A 时满分）        |
| Q4-4 | README.md 存在          | 5    | 组件根目录有使用说明文档                  |

##### Q5 性能与维护性（15分）

| ID   | 检查项       | 满分 | 说明                                                  |
| ---- | ------------ | ---- | ----------------------------------------------------- |
| Q5-1 | 子组件懒加载 | 5    | 多子组件切换时使用 defineAsyncComponent（N/A 时满分） |
| Q5-2 | 无跨目录引用 | 5    | import 路径不包含 `../../` 跳出当前组件目录           |
| Q5-3 | 内存管理     | 5    | 定时器/监听器在 onUnmounted 中清理                    |

**N/A 原则**：不适用的检查项默认满分，不影响总分。

### 步骤 3：合并评分并重新生成报告

```bash
# 合并 AI 评分到 check-result.json
node aidocs/skills/frontend-mc-check/scripts/quality-merge.cjs aidocs/output/reports/<日期_时间>/quality-scores.json

# 重新生成报告（含质量评分列和明细）
node aidocs/skills/frontend-mc-check/scripts/mc-report.cjs aidocs/output/reports/<日期_时间>/check-result.json
```

告知用户更新后的报告路径。

### 步骤 4：输出最终摘要

以 Markdown 表格输出每个被检查组件的结果：

```
## 检查摘要

| 组件 | 必须项 | 能否上线 | 质量评分 | 评级 | 主要问题 |
|------|--------|---------|---------|------|---------|
| c-mc-xxx | 13/13 通过 | ✅ 允许 | 78/100 | 良好 | Q1-4 缺少错误处理 |
| c-mc-yyy | 10/13 通过 | ❌ 阻止 | - | - | M3-1 缺少 themeConfig |
```

> 不允许上线的组件不显示质量评分，优先修复 M 系列问题。

对每个存在问题的组件，给出具体的修复建议（必须项问题优先）。

---

## 注意事项

- 必须项检查是客观的（基于文件结构和代码模式），结果不可商量
- 质量评分是建议性的，帮助提升组件质量
- 测试组件（`camera-add-edit`、`camera-list`、`mc-demo`）会被标记为不合规，这是预期行为
- 规范版本见 `scripts/mc-check-config.json` 中的 `specVersion` 字段

## 执行约束（防止工具调用失败）

- **禁止使用 Write/Edit 工具写入 JSON 文件**：必须通过 `add-score.cjs` 脚本逐个写入
- **逐个组件处理**：读取一个组件 → 评分 → 写入，再处理下一个。不要一次性读取所有组件文件
- **推荐 heredoc 写入**：使用 `<<'EOF'` 传入 JSON，避免单行命令过长导致参数构造失败
- **comment 字段精简**：每个 comment 控制在 6 个汉字以内，减少输出量
- **路径变量**：从步骤 1 脚本输出中提取报告目录路径，后续步骤复用该路径
- **每次只处理一个组件**：一次 Bash 调用 = 一个组件的评分写入，绝不合并多个组件
