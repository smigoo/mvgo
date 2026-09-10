# 微码组件检查 Skill 架构设计文档

## 概述

- **当前版本**: v1.0.20
- **功能**: 微码组件规范检查（M1~M5 系列）+ AI 质量评分（Q 系列）
- **设计原则**: 模块化、前后端兼容、数据结构标准化

---

## 架构设计

### 目录结构

```
aidocs/skills/frontend-mc-check/
├── ARCHITECTURE.md          # 本架构文档
├── README.md                # 用户使用手册
├── SKILL.md                 # AI 执行手册（Skill 定义）
├── CHANGELOG.md             # 变更记录
├── references/              # 参考文档
│   └── checklist.md         # M1~M5 检查项清单
└── scripts/                 # 核心脚本
    ├── mc-check.cjs         # 主检查脚本（M1~M5 规范检查）
    ├── mc-report.cjs        # 报告生成脚本（视图渲染）
    ├── add-score.cjs        # AI 评分写入脚本（增量评分）
    ├── quality-merge.cjs    # 评分合并脚本（数据合并）
    └── mc-check-config.json # 配置文件
```

### 脚本依赖关系

```
mc-check.cjs (规范检查)
    ↓ require
mc-report.cjs (报告生成) ←─────┐
    ↑                          │
    │ 手动调用 / 由 AI 编排    │ 手动调用 / 由 AI 编排
    │                          │
quality-merge.cjs (合并评分)   │
    ↑                          │
    │ 读取 quality-scores.json │
    │                          │
add-score.cjs (增量写入评分) ──┘
    ↑ 内置校验函数
validateScore() (数据校验)
```

**说明**：AI 通过 SKILL.md 编排完整流程，无需额外的 Node.js 编排脚本。

---

## 核心组件

### mc-check.cjs（主检查脚本）

**职责**：执行 M1~M5 系列规范检查，生成 `check-result.json`

**参数**：
- `[组件名]` - 检查单个组件（可选，默认检查所有）
- `--component-path <绝对路径>` - 后端模式，指定组件绝对路径
- `--output-dir <目录>` - 指定报告输出目录
- `--format <json|html|md|all>` - 输出格式（默认 all）

**输出**：`<output-dir>/<日期_时间>/check-result.json`

### mc-report.cjs（报告生成脚本）

**职责**：基于 `check-result.json` 生成 HTML/MD 报告

**参数**：
- `<check-result.json 路径>`
- `--format <html|md|all>` - 输出格式（默认 all）

**输出**：
- `mc-report.html` - 可视化报告
- `mc-report.md` - Markdown 报告

### add-score.cjs（AI 评分写入脚本）

**职责**：增量写入 AI 评分到 `quality-scores.json`

**参数**：
- `<报告目录> --init` - 初始化评分文件
- `<报告目录> <组件名> <JSON>` - 写入单个组件评分

**数据校验**（v2.3.1+）：

内置 `validateScore()` 函数校验：
- ✅ 必需字段：`totalScore` (0-100)、`grade` (枚举)、`scores` (至少 Q1-Q5)
- ✅ `details` 数组不可省略
- ✅ **总分一致性**：`totalScore` 必须等于各维度 `score` 之和（误差 ≤0.1）
- ✅ 支持维度扩展（Q1-Q99）

**输出**：`<报告目录>/quality-scores.json`

### quality-merge.cjs（评分合并脚本）

**职责**：将 `quality-scores.json` 合并到 `check-result.json`

**参数**：`<quality-scores.json 路径>`

**输出**：更新 `check-result.json`，添加 `aiReview` 字段

### mc-check-config.json（配置文件）

**内容**：
- `specVersion` - 规范版本号
- `reportOutputDir` - 报告输出目录（相对路径）
- `gradeEnums` - 评级枚举（优秀/良好/合格/待改进）
- `componentCategories` - 组件类型枚举
- `reportFormatOptions` - 报告格式配置

---

## 数据结构

### check-result.json（检查结果）

```json
{
  "specVersion": "v1.0.20",
  "checkedAt": "2026-08-31T10:30:00.000Z",
  "components": [
    {
      "dirName": "c-mc-tree-crud",
      "componentId": "c-mc-tree-crud",
      "componentName": "树形管理",
      "version": "v1.0.0",
      "passCount": 29,
      "failCount": 0,
      "warningCount": 2,
      "canRelease": true,
      "results": [
        {
          "id": "M1-1",
          "name": "componentId规范",
          "passed": true,
          "level": "error",
          "message": "通过"
        },
        {
          "id": "M3-14",
          "name": "废弃字段",
          "passed": false,
          "level": "warning",
          "message": "versionCode 等已废弃字段已存在，建议移除"
        }
      ],
      "aiReview": {  // 可选，由 quality-merge.cjs 添加
        "totalScore": 82,
        "grade": "良好",
        "scores": {
          "Q1": {
            "name": "代码质量",
            "score": 21,
            "max": 25,
            "details": [
              {
                "id": "Q1-1",
                "name": "注释完整性",
                "score": 5,
                "max": 5,
                "comment": "完整"
              }
            ]
          }
          // Q2-Q5...
        },
        "suggestions": ["建议1", "建议2"]
      }
    }
  ]
}
```

### issue 结构（results[] 元素）

自 v1.0.20 起，`results[]` 统一承载所有检查项（含 warning 级），通过 `level` 字段区分阻断/提醒：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 检查项编号（`M1-1` ~ `M5-10`） |
| `name` | string | 检查项简称，用于表格列展示 |
| `passed` | boolean | 是否通过 |
| `level` | string | 结果级别：`error`（阻断上线）/ `warning`（提醒不阻断） |
| `message` | string | 详细说明 |

**约束**：
- 统一结构：所有检查项（含 warning 级）都用 `issue(id, name, passed, message, level)` 构造
- warning 级（如 `M3-14` 废弃字段、`M5-10` 硬编码颜色）不进入 `failCount`，不影响 `canRelease`
- 报告侧从 `results[]` 派生 warning 级结果用于警告列展示

### warning 级结果（提醒不阻断）

| ID | 名称 | 触发条件 |
|----|------|---------|
| `M5-10` | 硬编码颜色 | `.less`/`<style>` 中出现 hex/rgb/rgba 字面量且未包裹 `var(--)` |
| `M3-14` | 废弃字段 | `declare.json` 中存在已废弃的 `versionCode` 字段 |

---

## 前后端调用差异

### 前端调用

**特点**：相对路径，完整报告（JSON + HTML + MD）

```bash
# 在 Skill 所在工程根目录执行
node aidocs/skills/frontend-mc-check/scripts/mc-check.cjs
```

**路径**：
- 工作目录：Skill 所在工程根目录
- 组件路径：`src/workspace/custom-components/<组件名>`
- 输出路径：`aidocs/output/reports/<日期_时间>/`

### 后端调用

**特点**：绝对路径，仅 JSON 输出

```bash
node <mc-check.cjs绝对路径> \
  --component-path <组件绝对路径> \
  --output-dir <输出目录绝对路径> \
  --format json
```

**路径**：全部使用绝对路径

---

## 工作流程

### 完整流程（规范检查 + AI 评分）

由 AI 通过 SKILL.md 编排执行：

```
步骤 1: 规范检查
  node mc-check.cjs
  → 生成 check-result.json

步骤 2: AI 质量评分（可选）
  node add-score.cjs <dir> --init
  → 初始化 quality-scores.json
  
  对每个组件：
    AI 读文件 → 推理评分
    → node add-score.cjs <dir> <组件> <<'EOF' {...} EOF
    → 写入评分

步骤 3: 合并评分
  node quality-merge.cjs <quality-scores.json>
  → 更新 check-result.json（添加 aiReview）

步骤 4: 重新生成报告
  node mc-report.cjs <check-result.json>
  → 生成 HTML/MD（含质量评分列）
```

### 仅规范检查（跳过 AI 评分）

```bash
node mc-check.cjs --format all
```

---

## 扩展性设计

### 新增检查规则

1. 在 `mc-check.cjs` 中添加新的 `checkMX()` 函数
2. 每个检查项通过 `issue(id, name, passed, message, level)` 生成结果（`level` 缺省为 `error`，warning 级需显式传 `'warning'`）
3. 更新 `references/checklist.md` 文档

### 新增 warning 级结果

1. 在 `mc-check.cjs` 中添加新的检测逻辑
2. 使用 `issue('Mx-N', '名称', false, '说明', 'warning')` 生成 warning 级结果
3. 更新 ARCHITECTURE.md 的 warning 级结果清单

### 评分维度扩展

`validateScore()` 支持动态维度（Q1-Q99），只需在 SKILL.md 中定义新维度的评分标准。

---

## 约束与限制

### 环境约束

- Node.js ≥ 14.0.0
- 前端模式需在 Skill 所在工程根目录执行
- 后端模式支持任意工作目录（使用绝对路径）

### 性能约束

- 单组件检查：< 1s
- 全量检查：< 1min
- AI 评分：取决于 AI 服务响应时间

### 数据约束

- 组件名：kebab-case，不含特殊字符
- 评分 totalScore：0-100
- 评分 comment：建议 ≤20 字符

---

## 版本兼容性

### v1.0.20 破坏性变更

- 检查项由「结果级别」分类改为「检查对象」分类（M1~M5），取消 M6 独立系列与 W 警告系列
- `results[]` 元素新增 `level` 字段（`error`/`warning`），warning 级结果合入 `results[]`，不再单独维护 `warnings[]`
- 组件类型简化为 `business`/`service` 两类，`c-mc-micro-*` 模式组件通过 `businessExemptionList` 白名单豁免
- 后端消费方需按 `level` 区分阻断与提醒，历史报告需重新生成

### 升级建议

- 历史版本 → v1.0.20：需修改后端代码（`level` 字段、warning 合入 results），历史报告需重新生成

---

## 维护者

- **文档版本**: v1.0.20
- **最后更新**: 2026-08-31
- **维护团队**: 基础研发部
