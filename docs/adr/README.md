# ADR（Architecture Decision Records）— 组件生成管线契约

> 目的：把「资源归属 / props 接线 / 命名规范」等**反转类契约**的当前结论与理由固化为可检索记录。
> 任何反转类变更（改变既有契约语义）动手前，必须先产出「影响面清单」（见文末模板），否则视为未完成设计。

## 索引

| # | 主题 | 状态 | 记录 |
|---|---|---|---|
| 0001 | 资源归属与 import 白名单 | Accepted | [0001-resource-attribution.md](./0001-resource-attribution.md) |
| 0002 | props 接线与 declare.json 契约 | Accepted | [0002-props-wiring.md](./0002-props-wiring.md) |
| 0003 | 组件命名规范（c-* / v-*） | Accepted | [0003-component-naming.md](./0003-component-naming.md) |

## ADR 模板

```markdown
# NNNN-<简短主题>

- **状态**：Proposed / Accepted / Deprecated / Superseded by NNNN
- **日期**：YYYY-MM-DD
- **决策**：一句话结论。
- **背景 / 动机**：要解决什么问题、实锤证据（任务号）。
- **方案与理由**：为什么这么做，否决了哪些替代。
- **影响面**：受影响的确定性函数 / spec / 回滚点。
- **后果**：正面 / 负面 / 未来要还的债。
```

## 反转类变更「影响面清单」（动手前强制产出）

1. **受影响确定性函数清单**（`grep` 契约关键词生成，逐条列文件:行号）
2. **需同步更新的 spec 清单**（jest 用例文件）
3. **回滚点**（revert 单 commit 即可回到旧契约；标出 commit 与涉及的子仓库）
