# ⚠️ 此文件不是事实源（指针存根）

微码 CSS 变量规范**唯一生效副本**在：

```
backend-node/references/patterns/css-variable-pattern.md
```

加载链（已实测确认）：

- `src/ai-engine/roles/style-mapper.js` → `loadReferenceFiles(['references/patterns/css-variable-pattern.md'])`
  经 `base-agent.js#loadReferenceFiles` → `_resolveProjectRoot(__dirname)` → `backend-node/references/`
- `src/ai-engine-v2/specs/definitions/microcode.json` → `references/patterns/css-variable-pattern.md`
  （`prompt-resolver.js`：`BUILTIN_REFERENCES_ROOT = backend-node/references`）
- 构建时 `npm run build` 把整份 `references/` 拷进 `dist/references/`（运行期真正读的是 dist）

## 为什么本文件被留成存根

`src/ai-engine/prompts/` 下的文件由 `src/ai-engine/utils/prompt-loader.js` 加载
（`PROMPTS_ROOT = join(__dirname, '../prompts')`），但实测：

- 全部 `loadMd()` 调用点只使用 `engineer/...` 前缀（`grep -rn "loadMd(" src/`）；
- **没有任何调用方加载 `prompts/agents/` 或 `prompts/references/` 目录**；
- 本目录**不参与** `npm run build` 的 `references/` 拷贝（`dist/src/ai-engine/prompts/references/` 不存在）。

代价已实际发生（两次）：

1. 本目录 `preview-analysis-schema.md` 曾是 `references/schemas/` 那份的陈旧副本 ——
   commit `68f3443` 把「图例识别规则」写进了它，**该规则从未生效**；
2. 2026-10-09 本文件（12.6KB，含已作废的「模式 A」示例）被当成生效版修了一轮，
   **改动完全没进 prompt** —— 真正生效的 `references/patterns/css-variable-pattern.md`
   （9.3KB）当时仍在教 `color: var(--colorTextBase, @color-text-primary)` 是「✅ 正确」。

## 要改规范请改这里

👉 `references/patterns/css-variable-pattern.md`

改完记得同步 `dist/references/patterns/css-variable-pattern.md`（或重新构建）。

## 同目录其余文件的漂移情况（2026-10-09 审计，**未处理，待决策**）

| 本目录文件 | 生效副本 | 状态 |
|-----------|---------|------|
| `ai-generation-constraints.md`（34.8KB） | `references/constraints/ai-generation-constraints.md`（33.2KB） | 已漂移，DIFF |
| `css-variable-pattern.md` | `references/patterns/css-variable-pattern.md` | 本次已改为存根 |
| `multi-layout-pattern.md`（6.0KB） | 无 | 死文件（仅被同样不加载的 `prompts/agents/layout-refiner.md` 的 `{{...}}` 引用） |
| `resource-handling-guide.md`（16.2KB） | 无 | 死文件 |
| `stage-gate-rules.md`（14.2KB） | 无 | 死文件 |
| `preview-analysis-schema.md` | `references/schemas/preview-analysis-schema.md` | 已是存根 |
