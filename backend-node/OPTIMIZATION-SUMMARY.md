# Prompt 优化总结 (2026-08-27)

## ✅ 完成项

### 1. 修复 CODE-013 验证器（图表容器高度检查）
**问题**：验证器检查 `height` 和 `min-height`，但 `min-height` 是合理的兜底高度
**修复**：只检查固定 `height`，允许 `min-height` 兜底

```diff
- // 检查是否有固定 height/min-height（>100px）且没有 flex
- const hasFixedHeight = /(^|;|\s)(height|min-height)\s*:\s*(\d+)px/i.test(rules)
+ // 只检查固定 height（>100px），不检查 min-height（兜底高度是合理的）
+ const hasFixedHeight = /(^|;|\s)height\s*:\s*(\d+)px/i.test(rules)
```

**收益**：消除与 `ai-generation-constraints.md` 第 632 行规则的矛盾

---

### 2. 删除僵尸文件（包含过时规则）
**删除文件**：
- `references/rules/stage-execution-rules.md` (665 行)
- `references/rules/stage-preview-rules.md` (320 行)
- `references/rules/stage-req-rules.md` (138 行)
- `references/rules/stage-feedback-format.md` (108 行)

**问题**：
1. 未被任何代码引用（已验证）
2. 包含过时的图例规则："图表图例必须使用 ECharts 内置 legend 组件"
3. 与当前规则矛盾："禁止使用 ECharts 内置 legend 替代自定义图例（除非设计稿明确使用）"

**收益**：节省 ~48KB（1231 行），消除规则矛盾

**备份位置**：`.archived/僵尸文件-2026-08-27/`

---

## 📊 统计

| 项目 | 数量 |
|------|------|
| 修复验证器矛盾 | 1 个 (CODE-013) |
| 删除僵尸文件 | 4 个 (1231 行, 48KB) |
| 消除规则矛盾 | 2 处 (图表高度 + 图例规则) |

---

## ✅ 验证清单

- [x] CODE-013 只检查固定 `height`，不检查 `min-height`
- [x] 删除的 4 个文件未被代码引用（已验证）
- [x] 图例规则统一："按设计稿决定，禁止用内置 legend 替代自定义图例"
- [x] 图表高度规则统一："flex 比例分配 + min-height 兜底"
- [x] 僵尸文件已备份到 `.archived/僵尸文件-2026-08-27/`

---

## 🎯 核心改进

1. **消除验证器与 Prompt 矛盾**：CODE-013 现在与 constraints.md 第 632 行对齐
2. **统一图例规则**：所有文件都是"按设计稿决定"，删除了"必须用内置 legend"的过时规则
3. **清理僵尸文件**：删除 33KB 未使用的文件，减少维护负担


---

## 📋 当前 Prompt 文件清单

### 被代码引用的文件（保留）
**references/rules/** (3 个文件，仍在使用)：
- `stage-common.md` (45 行) - 通用阶段规则
- `stage-figma-rules.md` (54 行) - Figma 阶段规则
- `adversarial-l4-style-compliance.md` (70 行) - L4 样式合规检查

**references/constraints/** (使用中)：
- `ai-generation-constraints.md` (884 行) - 核心生成约束

**references/prompts/** (使用中)：
- `figma.md` (462 行) - Figma 解析规则
- `preview-analysis/` - 预览分析模块

**references/schemas/** (使用中)：
- `preview-analysis-schema.md` (471 行) - 预览分析 schema

### 已归档的僵尸文件（.archived/僵尸文件-2026-08-27/）
- `stage-execution-rules.md` (665 行) - 未被引用
- `stage-preview-rules.md` (320 行) - 未被引用  
- `stage-req-rules.md` (138 行) - 未被引用
- `stage-feedback-format.md` (108 行) - 未被引用

---

## 🎯 本次会话成果

### 问题修复
1. ✅ CODE-013 验证器：修复 `min-height` 误报
2. ✅ 图例规则矛盾：删除 4 个包含过时规则的僵尸文件
3. ✅ Token 优化：归档 48KB 未使用文件

### 验证通过
- ✅ 图表容器高度规则一致：`flex` 比例 + `min-height` 兜底
- ✅ 图例规则一致：按设计稿决定，禁止用内置 legend 替代
- ✅ 所有被引用的文件检查完毕，无其他矛盾

### 文件变更
```
M  src/ai-engine/validators/code-structure-validator.js  (修复 CODE-013)
D  references/rules/stage-execution-rules.md             (归档)
D  references/rules/stage-preview-rules.md               (归档)
D  references/rules/stage-req-rules.md                   (归档)
D  references/rules/stage-feedback-format.md             (归档)
```

---

## ✅ 下一步

本次 Prompt 优化任务**已完成**，核心矛盾已消除：
- CODE-013 与 constraints.md 对齐
- 图例规则统一
- 僵尸文件已清理

**建议**：提交本次修改，无需重启后端（只修改了验证器和删除了未使用文件）
