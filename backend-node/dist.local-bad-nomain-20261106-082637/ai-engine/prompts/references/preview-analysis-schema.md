# ⚠️ 此文件不是事实源（指针存根）

`preview-analysis` 的 schema 规范**唯一生效副本**在：

```
backend-node/references/schemas/preview-analysis-schema.md
```

加载点：`src/ai-engine/roles/visual-parser.js:110`

```js
this.schemaPath = config.schemaPath || join(projectRoot, 'references/schemas/preview-analysis-schema.md')
```

（`projectRoot` = 含 `references/` 目录的 backend-node 根；构建时 `npm run build` 会把 `references/` 整份拷进 `dist/`。）

## 为什么这个文件被留成存根

`src/ai-engine/prompts/` 下的文件由 `src/ai-engine/utils/prompt-loader.js` 加载
（`PROMPTS_ROOT = join(__dirname, '../prompts')`），但**没有任何调用方加载 `prompts/references/` 目录**，
本文件此前是 `references/schemas/` 那份的陈旧副本（含硬编码的「流量监测」示例，内容相对落后 200+ 行）。

代价已实际发生：commit `68f3443`「P2' 图例误识别治理」把「图例识别规则」章节写进了本文件，
而真正被读取的是 `references/schemas/` 那份 → **该规则从未生效**。

## 要改 schema 请改这里

👉 `references/schemas/preview-analysis-schema.md`

改完记得同步 `dist/references/schemas/preview-analysis-schema.md`（或重新构建）。
