# declare.json 字段规范


## 顶层必填字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `componentId` | String | 组件唯一标识，`c-` 开头，kebab-case，与目录名一致，最大 50 字符 |
| `componentName` | String | 组件显示名称，2-50 字符 |
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
      { 
        "name": "userId", 
        "type": "string", 
        "comment": "用户ID",
        "defVal": "default_value"
      }
    ]
  }
]
```

### 必填字段

- `sourceName`：必填，驼峰命名，是 `componentApi` 调用时的 `dsName` 参数
- `columns`：必填，可为空数组 `[]`；一旦配置了字段项，每个字段必须包含以下属性：

### columns 字段规范

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | String | ✅ | 字段 key 值 |
| `type` | String | ✅ | 字段类型，可选值：`string` / `number` |
| `comment` | String | ✅ | 字段描述信息 |
| `defVal` | String/Number/null | ❌ | 数据库默认值，类型必须与 `type` 一致 |

**defVal 类型约束：**
- 当 `type="string"` 时，`defVal` 应为 `string` 或 `null`
- 当 `type="number"` 时，`defVal` 应为 `number` 或 `null`
- `defVal` 不可为 `array`、`object`、`boolean` 等其他类型

**注意**：如果字段类型是 `object` 或 `array`，该字段可不填入 `columns` 中。

### 系统保留字段

字段名禁止使用以下系统保留字段：`id`、`date_create_time`、`date_del_flag`、`version`、`inc_id`、`date_update_time`

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
