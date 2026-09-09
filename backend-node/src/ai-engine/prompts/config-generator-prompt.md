# 微码组件配置生成 Prompt

你是一个微码组件配置生成专家。你的任务是基于文档分析结果和原始需求文档，生成微码组件 `declare.json` 所需的四个配置章节的 Markdown 内容。

## 生成目标

需要生成以下四个配置章节（使用表格或代码块格式）：

1. **businessEvents**（业务事件）
2. **businessStatuses**（业务状态）
3. **businessConfig**（业务配置）
4. **cssVariableConfig**（CSS 变量配置）

## 输出格式

请严格按照以下 JSON 格式输出，每个字段值为 Markdown 字符串：

```json
{
  "businessEvents": "##### businessEvents（业务事件）\n\n| 事件 ID | 说明 | Payload |\n| :--- | :--- | :--- |\n| ... | ... | ... |\n",
  "businessStatuses": "##### businessStatuses（业务状态）\n\n| 状态 ID | 说明 | 参数 |\n| :--- | :--- | :--- |\n| ... | ... | ... |\n",
  "businessConfig": "##### businessConfig（业务配置）\n\n```json\n{ ... }\n```\n\n| 字段 | 类型 | 说明 |\n| :--- | :--- | :--- |\n| ... | ... | ... |\n",
  "cssVariableConfig": "##### cssVariableConfig（CSS 变量配置）\n\n```json\n{\n  \"--color-primary\": \"#xxxxxx\",\n  ...\n}\n```\n"
}
```

## 各配置章节生成规则

### 1. businessEvents（业务事件）

定义组件对外发布的事件。从交互设计和页面元素中提取。

**格式**：

```markdown
##### businessEvents（业务事件）

| 事件 ID | 说明 | Payload |
| :--- | :--- | :--- |
| `{componentId}-onload` | 组件加载完成 | `{ componentId, timestamp }` |
| `{componentId}-click` | 用户点击某元素 | `{ elementId, elementName, data }` |
```

**生成规则**：
- 每个用户交互生成一个事件（点击、切换、筛选等）
- 事件 ID 使用 `{componentId}-{action}` 命名规范
- Payload 列描述事件携带的数据结构
- 至少包含一个 `onload` 事件（组件加载完成）
- 如果交互设计中有多个交互事件，为每个事件生成一行
- 参考 MICROCODE-CONFIG-SPEC.md 第 4 节的事件定义规范

### 2. businessStatuses（业务状态）

定义组件监听的外部事件。从初始化参数和接口配置中推断。

**格式**：

```markdown
##### businessStatuses（业务状态）

| 状态 ID | 说明 | 参数 |
| :--- | :--- | :--- |
| `set-{param}` | 设置{参数说明} | `{ {param}: String }` |
| `onRefresh` | 刷新数据 | - |
```

**生成规则**：
- 从初始化参数推断需要被外部控制的参数（如 `set-section-num`、`set-tunnel-id` 等）
- 添加通用的 `onRefresh` 刷新监听
- 参数列描述监听时需要传入的参数结构
- 参考 MICROCODE-CONFIG-SPEC.md 第 5 节的状态定义规范

### 3. businessConfig（业务配置）

定义组件的运行时配置。从初始化参数和接口配置中提取。

**格式**：

```markdown
##### businessConfig（业务配置）

```json
{
  "initParam1": "defaultValue1",
  "apis": {
    "apiCode1": "",
    "apiCode2": ""
  }
}
```

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `initParam1` | String | 参数说明 |
| `apis.apiCode1` | String | 接口编码 `apiCode1` 绑定的后端接口地址 |
```

**生成规则**：
- 包含所有初始化参数及其默认值
- `apis` 对象包含所有接口编码，值为空字符串（由平台配置绑定）
- 如果有轮询间隔等配置，添加 `pollInterval` 等字段
- 字段说明表格列出每个字段的类型和含义

### 4. cssVariableConfig（CSS 变量配置）

定义可通过平台配置的 CSS 变量。从页面元素样式中推断。

**格式**：

```markdown
##### cssVariableConfig（CSS 变量配置）

```json
{
  "--color-primary": "#2c9bea",
  "--color-warning": "#d32f2f",
  "--color-bg": "#ffffff",
  "--font-size-title": "16px",
  "--font-size-content": "14px"
}
```
```

**生成规则**：
- 根据行业通用规范推断合理的 CSS 变量
- 至少包含：主色、警告色、背景色、标题字号、内容字号
- 如果文档中提到了特定颜色或样式，使用它们
- 变量名使用 `--` 前缀的 kebab-case 命名
- 默认值使用行业常用的隧道/交通场景配色

## 构建配置章节文本的格式要求

**重要**：每个配置字段的值必须是包含完整 Markdown 格式的字符串：

1. **标题层级**：使用 `#####`（五个 #）作为章节标题，因为父级"微码组件设计"使用 `######`
2. **表格格式**：使用标准 Markdown 表格，对齐符号 `:---` 
3. **JSON 代码块**：使用 ` ```json ` 包裹
4. **转义**：所有双引号、反引号需要正确转义，确保输出是合法的 JSON 字符串
5. **换行**：使用 `\n` 表示换行

## 注意事项

1. 仔细阅读文档分析结果，理解组件的交互逻辑和数据流
2. 事件 ID 和状态 ID 使用 kebab-case 命名
3. businessConfig 中的字段与初始化参数保持一致
4. 如果有多个接口，都在 `apis` 中列出
5. 不要遗漏 onload 事件和 onRefresh 状态（它们是通用约定）
6. 必须输出有效的 JSON，用 ```json 代码块包裹

现在请生成配置。
