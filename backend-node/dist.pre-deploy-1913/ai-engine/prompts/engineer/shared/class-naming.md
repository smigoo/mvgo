## 3️⃣ Class 命名规范（L4-003 · 2026-11-13 新范式：根类命名空间 + LESS 嵌套）

✅ **必须做**：
- common.less **顶层只有**带组件前缀的根类块：`.c-{{COMPONENT_ID}}-root { ... }`（或 `.c-{{COMPONENT_ID}} { ... }`）
- 所有业务样式 **LESS 嵌套在根类内**；内层 class 用语义短名 kebab-case：`.header`、`.stats-item`、`.chart-wrap`
- 主题色一律引用 `@xxx` 变量（index.less 在根作用域调用主题 mixin 后编译期注入），与嵌套无关
- ⚠️ **禁止用组件中文名/文件名代替组件 ID 作为根类前缀**（`{{COMPONENT_NAME}}` ≠ `{{COMPONENT_ID}}` 时，必须用 `{{COMPONENT_ID}}`）

❌ **绝对禁止**：
- 顶层裸类（`.wrapper {}` / `.item {}`）——会污染全局命名空间
- `.dark {}` / `.light {}` / 宿主类 / 实例 ID 类作顶层包裹（**宿主不给组件根加主题类**，包裹后编译成 `.dark .c-xxx` 真实 DOM 0 命中 → 样式全部失效）
- 双 `c-` 前缀、不完整前缀

**正确示例**：
```less
// common.less
.c-{{COMPONENT_ID}}-root {
  .tabs-container { display: flex; }
  .stat-item { padding: 12px; }
  .chart-wrapper {
    width: 100%;
    height: 300px;
    &.active { opacity: 1; }
  }
}
@media (max-width: 768px) {
  .c-{{COMPONENT_ID}}-root { .tabs-container { flex-wrap: wrap; } }
}
```
> 根类作命名空间：编译产物 `.c-xxx-root .header` 特异性 (0,2,0)，恒压过宿主裸 `.header` (0,1,0)——既防外部样式侵入，也不外泄到别的组件。

---

🆔 **根容器实例 ID（系统注入，无需手写）**

- 组件实例 ID 形如 `mc-max-1787742124556-3c15fc26`（运行时随机标识，每次生成都不同）。
- 系统会在 `package/index.vue` 根元素**自动追加** `c-mc-max-{INSTANCE_ID}` 作为作用域标记（即用户要求的「最外层编码 id」）。
- 你**只需**给根元素一个语义 class（如 `.c-{{COMPONENT_ID}}-root`），**不要**手写 `c-mc-max-...`，也**不要**把实例 ID 拼到内部 class 前缀上（如 `c-mc-max-1787742124556-3c15fc26-c-monitor-title-left` ❌）。
- 内部 class 一旦带上 `c-mc-max-{id}-` 长前缀，会被后处理强制剥离，造成 `.vue`/`.less` 选择器错配、预览 RUNTIME-004 render-error。
- 正确形态：根元素 `class="c-monitor-root c-mc-max-1787742124556-3c15fc26"`（语义类 + 系统追加的实例 id 类），内部元素 `class="title-left"`（语义短名，由根类嵌套作用域保护）。
