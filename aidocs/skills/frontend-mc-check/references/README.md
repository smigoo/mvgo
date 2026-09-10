# 微码组件规范检查 Skill

微码组件规范检查工具，支持前端开发和后端服务两种模式。

---

## 快速开始

### 前端开发使用

```bash
# 检查所有组件
node aidocs/skills/frontend-mc-check/scripts/mc-check.cjs

# 检查单个组件
node aidocs/skills/frontend-mc-check/scripts/mc-check.cjs c-mc-tree-crud

# 通过 skill 触发（推荐，含 AI 质量评分）
/frontend-mc-check
```

**输出位置**：`aidocs/output/reports/<日期_时间>/`

### 后端服务调用

```bash
node <mc-check.cjs绝对路径> \
  --component-path <组件绝对路径> \
  --output-dir <输出目录绝对路径> \
  --format json
```

---

## 命令行参数

### mc-check.cjs

| 参数 | 说明 | 示例 |
|------|------|------|
| `[组件名]` | 检查单个组件（可选） | `c-mc-tree-crud` |
| `--component-path <路径>` | 指定组件绝对路径（后端模式） | `--component-path <组件绝对路径>` |
| `--output-dir <目录>` | 指定报告输出目录 | `./output` |
| `--format <格式>` | 输出格式：`json` \| `html` \| `md` \| `all`（默认 `all`） | `--format json` |

### 格式说明

| 格式 | 生成文件 | 使用场景 |
|------|---------|---------|
| `json` | check-result.json | 后端服务（存入数据库） |
| `html` | mc-report.html | 前端可视化查看 |
| `md` | mc-report.md | 文档归档 |
| `all` | JSON + HTML + MD | 前端开发（默认） |

---

## 输出结果

### check-result.json

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
      ]
    }
  ]
}
```

> **结构约定**：`results[]` 统一承载所有检查项（含 warning 级），通过 `level` 字段区分：
> - `level: "error"` → 失败即不允许上线（计入 `failCount`）
> - `level: "warning"` → 提醒不阻断（不计入 `failCount`，不影响 `canRelease`）
>
> 所有检查项使用相同 issue 结构（`id` / `name` / `passed` / `level` / `message`）。

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `specVersion` | string | 规范版本 |
| `checkedAt` | string | 检查时间（ISO 8601） |
| `components` | array | 组件检查结果列表 |
| `components[].dirName` | string | 组件目录名 |
| `components[].componentId` | string | 组件 ID |
| `components[].componentName` | string | 组件名称 |
| `components[].version` | string | 组件版本 |
| `components[].passCount` | number | 通过项数量 |
| `components[].failCount` | number | 失败项数量（仅 `level: "error"` 未通过项） |
| `components[].warningCount` | number | 提醒项数量（`level: "warning"` 未通过项） |
| `components[].canRelease` | boolean | 是否允许上线（`failCount === 0`） |
| `components[].results` | array&lt;issue&gt; | 详细检查结果（M1~M5 系列，含 warning 级） |
| `issue.id` | string | 检查项编号（`M1-1` ~ `M5-10`） |
| `issue.name` | string | 检查项名称 |
| `issue.passed` | boolean | 是否通过 |
| `issue.level` | string | 结果级别：`error` / `warning` |
| `issue.message` | string | 详细说明 |

---

## 使用示例

### 示例 1：前端开发检查

```bash
# 检查所有组件，生成完整报告
node aidocs/skills/frontend-mc-check/scripts/mc-check.cjs

# 输出：
# aidocs/output/reports/2026-08-25_10-30/
# ├── check-result.json    # JSON 结果
# ├── mc-report.html       # HTML 报告
# └── mc-report.md         # Markdown 报告
```

### 示例 2：后端服务调用

```bash
# 仅生成 JSON，指定绝对路径
node <mc-check.cjs绝对路径> \
  --component-path <组件绝对路径> \
  --output-dir <输出目录绝对路径> \
  --format json

# 输出：
# <输出目录>/2026-08-25_10-30/check-result.json
```

### 示例 3：检查单个组件

```bash
# 前端模式
node aidocs/skills/frontend-mc-check/scripts/mc-check.cjs c-mc-tree-crud

# 后端模式
node <mc-check.cjs绝对路径> \
  --component-path <组件绝对路径> \
  --format json
```

---

## 前后端差异对比

| 特性 | 前端模式 | 后端模式 |
|------|---------|---------|
| **路径类型** | 相对路径 | 绝对路径 |
| **工作目录** | Skill 所在工程根目录 | 任意目录 |
| **默认格式** | `all`（JSON + HTML + MD） | 建议 `json` |
| **报告位置** | `aidocs/output/reports/` | 通过 `--output-dir` 指定 |
| **组件查找** | 自动扫描 `src/workspace/custom-components/` | 通过 `--component-path` 指定 |

---

## AI 质量评分（可选）

通过 `/frontend-mc-check` skill 触发 AI 自动评分，包含 4 个步骤：

1. **规范检查**：执行 M1~M5 系列检查
2. **AI 评分**：AI 读取组件代码，逐个评分（Q1-Q5）
3. **合并评分**：将评分数据合并到检查结果
4. **生成报告**：重新生成报告（含质量评分列）

详见 [SKILL.md](SKILL.md)。

---

## 常见问题

### Q1: 为什么 warning 级结果不影响上线？

**A**: warning 级是建议性的（如 `M3-14` 废弃字段、`M5-10` 硬编码颜色），不影响功能。只有 `level: "error"` 的失败项才会阻止上线。

### Q2: 如何只生成 JSON？

**A**: 使用 `--format json` 参数。

```bash
node mc-check.cjs --format json
```

### Q3: 后端如何解析 check-result.json？

**A**: 所有检查项在 `results[]` 中，使用同一个 DTO（包含 `id`/`name`/`passed`/`level`/`message` 字段），通过 `level` 区分 `error` 与 `warning`。

```java
class Issue {
    private String id;      // "M1-1" ~ "M5-10"
    private String name;    // "componentId规范"
    private Boolean passed; // true/false
    private String level;   // "error" / "warning"
    private String message; // 详细说明
}

List<Issue> results = component.getResults();
List<Issue> errors = results.stream()
        .filter(r -> !r.getPassed() && "error".equals(r.getLevel()))
        .collect(Collectors.toList());  // 阻断项
List<Issue> warnings = results.stream()
        .filter(r -> !r.getPassed() && "warning".equals(r.getLevel()))
        .collect(Collectors.toList());  // 提醒项
```

### Q4: 如何查看报告？

**A**: 
- **HTML**：双击 `mc-report.html` 在浏览器打开
- **MD**：用 Markdown 编辑器打开 `mc-report.md`
- **JSON**：直接读取 `check-result.json`

---

## 相关文档

- [ARCHITECTURE.md](ARCHITECTURE.md) - 架构设计文档
- [CHANGELOG.md](CHANGELOG.md) - 变更记录
- [SKILL.md](SKILL.md) - AI 执行手册
- [references/checklist.md](references/checklist.md) - 检查项清单

---

**版本**：v1.0.20  
**最后更新**：2026-08-31
