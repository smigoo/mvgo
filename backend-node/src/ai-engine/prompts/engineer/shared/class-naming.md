## 3️⃣ Class 命名规范（L4-003）

✅ **必须做**：
- common.less 中的所有 class 必须以 `.c-{{COMPONENT_ID}}-` 为前缀
- 格式：`.c-{{COMPONENT_ID}}-{语义名称}`（组件 ID 固定为 `{{COMPONENT_ID}}`，语义名称用 kebab-case）
- 语义名称示例：tabs-container, stat-item, chart-wrapper
- ⚠️ **禁止用组件中文名/文件名代替组件 ID 作为前缀**（如 `{{COMPONENT_NAME}}` 不等于 `{{COMPONENT_ID}}` 时，必须用 `{{COMPONENT_ID}}`）

❌ **绝对禁止**：
- 使用无前缀的通用 class：.item, .box, .wrapper, .container
- 使用错误的前缀（如 `.c-{{COMPONENT_NAME}}-`）或不完整的前缀

**正确示例**：
```less
// common.less
.c-{{COMPONENT_ID}}-tabs-container { display: flex; }
.c-{{COMPONENT_ID}}-stat-item { padding: 12px; }
.c-{{COMPONENT_ID}}-chart-wrapper { width: 100%; height: 300px; }
```

---

🆔 **根容器实例 ID（系统注入，无需手写）**

- 组件实例 ID 形如 `mc-max-1787742124556-3c15fc26`（运行时随机标识，每次生成都不同）。
- 系统会在 `package/index.vue` 根元素**自动追加** `c-mc-max-{INSTANCE_ID}` 作为作用域标记（即用户要求的「最外层编码 id」）。
- 你**只需**给根元素一个语义 class（如 `.c-{{COMPONENT_ID}}-root`），**不要**手写 `c-mc-max-...`，也**不要**把实例 ID 拼到内部 class 前缀上（如 `c-mc-max-1787742124556-3c15fc26-c-monitor-title-left` ❌）。
- 内部 class 一旦带上 `c-mc-max-{id}-` 长前缀，会被后处理强制剥离，造成 `.vue`/`.less` 选择器错配、预览 RUNTIME-004 render-error。
- 正确形态：根元素 `class="c-monitor-root c-mc-max-1787742124556-3c15fc26"`（语义类 + 系统追加的实例 id 类），内部元素 `class="c-monitor-title-left"`（仅语义短名）。
