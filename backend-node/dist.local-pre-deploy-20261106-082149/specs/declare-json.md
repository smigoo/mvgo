# declare.json 字段规范


## 顶层必填字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `componentId` | String | 组件唯一标识，`c-` 开头，kebab-case，与目录名一致，最大 50 字符 |
| `componentName` | String | 组件显示名称，4-50 字符 |
| `version` | String | 小写 `v` 开头，如 `v1.0.0` |
| `attribute.aspectRatio` | Array | 组件宽高比，如 `[16, 9]`，必填 |
| `businessEvents` | Object | 组件触发的输出事件，必填（可为空对象 `{}`） |
| `businessStatuses` | Object | 组件监听的输入状态，必填（可为空对象 `{}`） |

## businessEvents — 业务事件

组件触发的输出事件（组件 → 外部）。

```json
"businessEvents": {
  "component-click": {
    "eventId": "component-click",
    "eventName": "组件点击",
    "eventDataSchema": {
      "unitId": { "key": "unitId", "name": "单位ID", "type": "string" }
    }
  }
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `eventId` | ✅ | kebab-case，与对象 key 一致 |
| `eventName` | ✅ | 中文描述 |
| `eventDataSchema` | ❌ | 事件携带的数据结构 |
| `eventDataSchema[].key` | ✅ | 字段唯一标识，同一事件内不可重复 |
| `eventDataSchema[].name` | ✅ | 中文描述 |
| `eventDataSchema[].type` | ✅ | `string/number/boolean/object/array` |

## businessStatuses — 业务状态

组件监听的输入状态（外部 → 组件）。

```json
"businessStatuses": {
  "get-list": {
    "statusId": "get-list",
    "statusName": "获取列表",
    "parameters": {
      "unitId": { "key": "unitId", "name": "单位ID", "type": "string" }
    }
  }
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `statusId` | ✅ | kebab-case，与对象 key 一致 |
| `statusName` | ✅ | 中文描述 |
| `parameters` | ❌ | 状态接收的参数结构 |
| `parameters[].key` | ✅ | 参数唯一标识 |
| `parameters[].name` | ✅ | 中文描述 |
| `parameters[].type` | ✅ | `string/number/boolean/object/array` |

## dataSources — 数据源配置

```json
"dataSources": [
  {
    "sourceName": "userList",
    "columns": [
      { "name": "userId", "type": "string", "comment": "用户ID" }
    ]
  }
]
```

- `sourceName`：必填，驼峰命名，是 `componentApi` 调用时的 `dsName` 参数
- `columns`：v1.0.14 后可不填；字段名禁止使用系统保留字段（见下方）
- 系统保留字段（禁止使用）：`id`、`date_create_time`、`date_del_flag`、`version`、`inc_id`、`date_update_time`

## formSources — 表单数据源

```json
"formSources": [
  { "formName": "addForm" }
]
```

- `formName`：必填，表单唯一标识

## layoutConfig — 布局配置

```json
"layoutConfig": {
  "default": "one",
  "list": [
    { "name": "默认布局", "key": "one", "previewName": "mc-preview.png" },
    { "name": "紧凑布局", "key": "two", "previewName": "mc-preview-two.png" }
  ]
}
```

- `default`：必填，默认布局的 key
- `list[].name`、`list[].key`：必填
- `list[].previewName`：预览图文件名，必须以 `mc-preview` 开头，图片存放于 `resources/images/`

## themeConfig — 主题配置

```json
"themeConfig": {
  "default": "light",
  "list": [
    { "name": "深色主题", "key": "dark" },
    { "name": "亮色主题", "key": "light" }
  ]
}
```

- `default`：必填，默认主题的 key
- `list[].name`、`list[].key`：必填

## cssVariableConfig — CSS 变量配置

```json
"cssVariableConfig": [
  { "name": "字体大小", "key": "fontSize", "type": "size" },
  { "name": "主色调", "key": "colorPrimary", "type": "color" },
  { "name": "填充方式", "key": "objectFit", "type": "select",
    "list": [{ "name": "cover", "key": "cover" }, { "name": "contain", "key": "contain" }] }
]
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | ✅ | 中文描述 |
| `key` | ✅ | CSS 变量标识 |
| `type` | ✅ | `color / weight / size / number / string / select` |
| `describe` | ❌ | 详细说明 |
| `list` | type=select 时必填 | 可选项 `[{name, key}]` |

框架预设变量（优先使用）：`fontSize`、`colorTextBase`、`colorPrimary`、`colorPrimaryActive`、`colorPrimaryBg`、`colorPrimaryBgHover`

## businessConfig — 业务参数配置

```json
"businessConfig": [
  {
    "name": "导航类型", "key": "menuType", "type": "string",
    "renderType": "radio", "default": "master",
    "list": [{ "name": "主", "key": "master" }, { "name": "次", "key": "subordinate" }],
    "describe": "控制导航栏的展示类型"
  }
]
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | ✅ | 中文描述 |
| `key` | ✅ | camelCase，不可重复，不可使用 `payload` |
| `type` | ✅ | `string / number / boolean / object / array` |
| `describe` | ✅ | 参数用途说明 |
| `renderType` | ❌ | `radio / select / number` |
| `default` | ❌ | renderType 存在时有效 |
| `list` | ❌ | renderType 存在时有效，`[{name, key}]` |

注意：`renderType: radio` 时，`list` 缺省则自动提供"是/否"两个选项。

---

## 🔴 businessEvents 格式要求（重要）

在 requirement.md 中编写 businessEvents 表格时，**每个事件必须独立一行**：

### ✅ 正确格式

```markdown
### businessEvents（业务事件）
| 事件 ID | 说明 | Payload |
| :--- | :--- | :--- |
| `dimension-change` | 切换统计维度 | `{ dimension: '24' \| '1' }` |
| `flow-card-click` | 点击流量卡片 | `{ sectionNum, sectionName }` |
| `vehicle-card-click` | 点击车型卡片 | `{ sectionNum, sectionName }` |
| `modal-close` | 关闭弹窗 | `{ sectionNum }` |
```

### ❌ 错误格式（所有事件合并到一行）

```markdown
### businessEvents（业务事件）
| 事件 ID | 说明 | Payload |
| :--- | :--- | :--- |
| `dimension-change` | 说明 1 | {} | | `flow-card-click` | 说明 2 | {} | | `vehicle-card-click` | 说明 3 | {} |
```

**为什么**：mc-gen 的解析器 `parseEventsTable` 依赖每行一个事件的格式。如果合并成一行，会导致 `eventId` 异常长（包含整个表格内容），生成的 `declare.json` 无法使用。

**相关修复文档**：`req-d-business-events-fix.md`

---

## 🔴 弹窗组件特殊要求（重要）

### panelKey 必须为 model-panels

**如果组件配置了 `businessStatuses`（说明是弹窗类组件），`panelKey` 必须为 `"model-panels"`。**

```json
// ✅ 正确：弹窗组件
{
  "componentId": "c-xxx-modal",
  "panelKey": "model-panels",
  "businessStatuses": {
    "show-modal": {
      "statusId": "show-modal",
      "statusName": "显示弹窗",
      "parameters": {}
    }
  }
}

// ❌ 错误：弹窗组件使用了 default-panel
{
  "componentId": "c-xxx-modal",
  "panelKey": "default-panel",
  "businessStatuses": { ... }
}
```

### 为什么必须是 model-panels？

微码框架通过 `panelKey` 识别组件类型：
- `model-panels` → 弹窗面板组件，平台通过 `isLoadShow.value` 控制显示/隐藏
- `default-panel` → 默认面板组件，始终显示在页面中
- `empty` → 空面板组件，无框架头部，组件自行管理布局

如果弹窗组件使用 `default-panel` 或 `empty`，平台的 `isLoadShow` 机制无法生效，导致弹窗无法正确显示或关闭。

### 卡片组件 vs 弹窗组件对比

| 类型 | panelKey | businessEvents | businessStatuses | 显示控制 |
|------|----------|---------------|------------------|---------|
| 卡片组件（触发方） | `empty` | ✅ 有（如 `card-click`） | ❌ 无 | 始终显示 |
| 弹窗组件（接收方） | `model-panels` | ✅ 有（如 `modal-close`） | ✅ 有（如 `show-modal`） | 平台控制 |

**详细规范**：见 `modal-event-linkage.md`
