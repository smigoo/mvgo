# 微码组件检查脚本变更记录

## v1.0.20 (2026-09-02)

### 检查体系重构（破坏性变更）

按「检查对象」重构检查项分类，取消隔离的 M6 / W 系列，统一为 M1~M5 五大系列，结果三态解耦。

1. **检查项按「检查对象」划分 M1~M5**
   - M1 命名规范、M2 必要文件、M3 declare.json 字段、M4 文件格式、M5 代码实现
   - 原 M6（一体化适配）各项并入 M3/M4/M5（如 M6-1a → M3-12、M6-2a → M3-13）
   - 原 W 系列（警告）并入 M3/M4/M5，如 W-DEPRECATED-1 → M3-14、W-CSS-1 → M5-10

2. **结果三态解耦，级别作为结果属性**
   - `issue()` 新增 `level` 参数，取值 `error`（阻断）/ `warning`（提醒）
   - `results[]` 统一承载所有检查项（含 warning 级），不再单独维护 `warnings[]`
   - `canRelease = failCount === 0`，`failCount` 仅统计 `level === 'error'` 的失败项

3. **组件类型简化为两类**
   - `business` / `service`（原 utility 概念取消）
   - `c-mc-micro-*` 模式组件通过 `businessExemptionList` 白名单豁免 business 项检查
   - 配置项 `m6ExemptionList` 更名为 `businessExemptionList`

4. **废弃字段 / 硬编码颜色归为 warning 级**
   - `versionCode` 废弃字段 → `M3-14`（warning）
   - 硬编码颜色 → `M5-10`（warning）

**迁移指南**：

- 后端消费方需启用 `level` 字段区分 `error`/`warning`，`warnings[]` 独立数组已废弃
- 历史报告需重新执行检查生成

---

## v2.3.1 (2026-08-25)

### 改进内容

#### validateScore 数据校验增强

1. **增加总分一致性校验**
   - 校验 `totalScore` 是否等于各维度 `score` 之和（误差 ≤0.1）
   - 防止 AI 计算错误导致数据不一致

2. **放宽维度限制，支持扩展**
   - 从硬编码 `Q1-Q5` 改为动态检查 `Q\d+`
   - 支持未来扩展到 Q6、Q7 等维度

3. **修复 --init 目录创建 bug**
   - 目录不存在时递归创建，避免 ENOENT 错误

---

## v2.3 (2026-08-25)

### 破坏性变更：warnings 结构统一

**变更内容**：

将 `components[].warnings` 由字符串数组改为与 `results[]` 完全一致的结构化对象数组。

```json
// v2.2（旧）
"warnings": ["[W-CSS-1] 样式中存在硬编码颜色值..."]

// v2.3（新）
"warnings": [
  {
    "id": "W-CSS-1",
    "name": "样式硬编码颜色",
    "passed": false,
    "message": "样式中存在硬编码颜色值，建议改用 CSS 变量：..."
  }
]
```

**变更原因**：

- 后端可用同一张表/同一套字段映射存储 `results` 和 `warnings`
- 支持按 `id` 聚合统计（如"哪类警告最多"）
- HTML/MD 报告中警告项与失败项渲染对齐

**警告项 ID 台账**：

| ID | 名称 | 触发条件 |
|----|------|---------|
| `W-CSS-1` | 样式硬编码颜色 | 样式中存在 hex/rgb/rgba 且未使用 `var(--)` |
| `W-CSS-2` | 样式硬编码字体大小 | `font-size` 使用 > 5px 的固定 px 值 |
| `W-DEPRECATED-1` | versionCode字段废弃 | declare.json 中存在 `versionCode` 字段 |

**迁移指南**：

后端消费方需要修改代码，将 `warnings` 从 `List<String>` 改为 `List<Issue>`：

```java
// v2.2
List<String> warnings = component.getWarnings();
for (String w : warnings) {
    System.out.println(w);
}

// v2.3+
List<Issue> warnings = component.getWarnings();
for (Issue w : warnings) {
    System.out.printf("[%s] %s: %s%n", w.getId(), w.getName(), w.getMessage());
}
```

历史报告需要重新执行检查生成，v2.3 的 `mc-report.cjs` 无法正确渲染 v2.2 的 JSON。

---

## v2.2 (2026-08)

### 新增功能

#### 支持 `--format` 参数

控制报告输出格式，满足前后端不同需求：

| 格式 | 使用场景 | 生成文件 |
|------|---------|---------|
| `json` | 后端服务（存入数据库） | 仅 check-result.json |
| `html` | 前端可视化查看 | mc-report.html |
| `md` | 文档归档 | mc-report.md |
| `all` | 前端开发（默认） | JSON + HTML + MD |

**用法**：

```bash
# 后端模式
node mc-check.cjs --format json

# 前端模式（默认）
node mc-check.cjs
node mc-check.cjs --format all
```

#### 支持 `--component-path` 参数

支持绝对路径输入，便于后端服务调用：

```bash
node mc-check.cjs --component-path <组件绝对路径>
```

#### 新增 AI 质量评分流程

新增 4 个脚本支持完整的质量评分工作流：

- `add-score.cjs` - 增量写入 AI 评分
- `quality-merge.cjs` - 合并评分到检查结果
- `mc-report.cjs` - 重新生成报告（含质量评分列）
- `mc-check-config.json` - 配置文件

详见 ARCHITECTURE.md。

---

## v2.1 及更早版本

详见 Git 历史记录。
