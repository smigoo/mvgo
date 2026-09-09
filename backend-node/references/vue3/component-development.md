# 组件开发规范

## 组件分类与位置

### 基础组件 (Base Components)
**位置**: `src/components/base-components/`

**特征**:
- 无业务逻辑
- 高度可配置化
- 脱离业务上下文
- 职责单一

**示例**: 按钮、输入框、卡片、加载中、空状态等

### 业务组件 (Business Components)
**位置**: `src/components/business-components/{业务名}/`

**特征**:
- 包含业务逻辑
- 上下文相关
- 包含业务数据
- 复合功能

**示例**: 用户认证表单、订单卡片、数据表格等

## 组件文件结构
```
ComponentName/                  # PascalCase (组件文件夹)
├── resources/
│   ├── images/                 # 组件图片资源
│   └── styles/
│       └── component-name-style.less  # kebab-case (样式文件)
├── package/
│   ├── index.vue               # index.vue (主组件文件)
│   └── components/             # 子组件目录
├── readme.md                   # kebab-case (文档文件)
└── index.js                    # kebab-case (导出文件)
```

## 🔴 图片资源引用硬规则

Vue3 预览加载器 `loadVue3FromWorkspace` 已通过 `handleModule` 将 `import '*.png'` 解析为同源绝对 URL，开发/生产均可加载，**当前不会触发 RUNTIME-004**。但为与微码管线保持一致、并避免组件脱离预览加载器（如直接 `import` 进正式 Vite 工程）后路径失效，仍遵循以下硬规则：

- **禁止 ESM `import` 本地图片文件**（与微码硬规则一致），改用：
  1. **base64 内联（首选，小图标/装饰）**：`const icon = 'data:image/png;base64,...'`
  2. **同源 URL**：`<img :src>` 指向 `/api/preview/{gid}/{id}/resources/images/foo.png`（生产）或 `/__raw/workspace/vue3-components/{gid}/{id}/resources/images/foo.png`（开发）
  3. **外部在线 URL**：⚠️ 生产环境 CSP `img-src 'self'` 会拦截跨域图片，**禁止依赖**
- 背景图用 CSS `background-image: url(<base64 或同源URL>)`，不要用 `import` 引入背景图。

## 组件模板结构
```vue
<template>
  <div :class="['ComponentName']">
    <!-- 组件内容 -->
  </div>
</template>

<script setup>
// #region 1. Props定义
const props = defineProps({
  isVisible: { type: Boolean, default: false },
  hasError: { type: Boolean, default: false },
  userData: { type: Object, default: () => ({}) },
  itemList: { type: Array, default: () => [] }
})
// #endregion

// #region 2. Emits定义
const emit = defineEmits(['update:modelValue', 'change', 'submit', 'cancel'])
// #endregion

// #region 3. 响应式状态
// 🔴 数据槽位变量（需要接收 API 数据的）必须用 ref/reactive
const isLoading = ref(false)
const isSubmitting = ref(false)
const users = ref([])           // ✅ 数据槽位：ref([])
const config = reactive({})     // ✅ 数据槽位：reactive({})
// #endregion

// #region 4. 计算属性
// ✅ 派生值：基于已有数据计算，不作为 API 注入目标
const displayText = computed(() => {
  return props.userData?.name || '未知用户'
})
// ❌ 禁止：把需要接收 API 数据的变量声明为 computed
// const tableData = computed(() => { ... }) // 错误！API 无法改写
// #endregion

// #region 5. 方法
const handleClick = () => {
  console.log('ComponentName clicked')
}

const handleSubmit = () => {
  if (isSubmitting.value) return
  isSubmitting.value = true
  try {
    emit('submit')
  } finally {
    isSubmitting.value = false
  }
}
// #endregion

// #region 6. 生命周期
onMounted(() => {
  console.log('[ComponentName] mounted')
})

onUnmounted(() => {
  // 清理资源
})
// #endregion
</script>

<style scoped>
/* 使用相对路径引入组件内部样式 */
@import './resources/styles/component-name-style.less';

.ComponentName {
  /* 组件样式 */
}

/* 深度选择器 */
:deep(.child-element) {
  /* 子组件样式 */
}
</style>
```

## Props/Emits 设计规范

### Props 命名规范
| 类型 | 规则 | 示例 | 说明 |
|-----|-----|------|------|
| **布尔值** | is / has / should 前缀 | isVisible, hasError, shouldValidate | 清晰表示开关 |
| **回调函数** | on 前缀 | onChange, onSubmit, onCancel | 事件处理 |
| **配置对象** | Options 后缀 | tableOptions, chartOptions | 配置集合 |
| **数据传递** | 名词短语 | userData, itemList, config | 语义清晰 |

### Props 默认值规范
```javascript
// ✅ 正确
const props = defineProps({
  isVisible: { type: Boolean, default: false },           // 安全默认值
  itemList: { type: Array, default: () => [] },         // 数组使用工厂函数
  config: { type: Object, default: () => ({}) },        // 对象使用工厂函数
  defaultValue: { type: String, default: 'zh-CN' }      // 符合业务场景
})
```

### Emits 命名规范
```javascript
// ✅ 正确
const emit = defineEmits([
  'update:modelValue',  // v-model 使用
  'update:count',       // 更新特定属性  
  'change',             // 数据变化
  'submit',             // 动作事件
  'cancel'              // 取消事件
])
```

## 样式规范

### 🔴 样式文件自包含硬规则（LESS 编译门禁）

平台在生成后会对 `resources/styles/common.less` 等关键 LESS 文件执行**单独编译校验**（standalone），**不经过 `index.less` 的 import 链**。因此：

1. **凡在 LESS 文件中引用主题变量（`@color-primary`、`@border-radius` 等），必须在文件顶部自行 `@import` 变量定义文件**：
   ```less
   // theme-vars.less 与当前文件同目录时：
   @import './theme-vars.less';
   // 变量定义文件在 themes/ 子目录时：
   @import './themes/theme-vars.less';
   ```
2. 若文件只使用字面量颜色/尺寸（不引用任何主题变量），可不 import，但必须保证该文件能被 `less.render` **独立编译**通过。
3. ⚠️ 禁止依赖 `index.less` 的 import 链为 `common.less` 等文件提供变量——独立编译时该链不生效，会触发 `variable @xxx is undefined`，被 LESS 编译门禁阻断，导致组件无法进入 workspace（生成后前端报"未找到组件"）。
4. 若组件存在多个主题（`themes/` 目录），`themes/theme-vars.less` 应 `@import '../theme-vars.less'` 形成单一变量源。

### scoped 样式必须使用
```vue
<style scoped>
/* ✅ 正确：所有样式都 scoped */
.button {
  padding: 8px 16px;
}
</style>
```

### CSS 命名规范
```css
/* ✅ 语义化命名 */
.primary-button { }
.user-avatar { }
.navigation-menu { }
.error-message { }

/* ✅ 状态命名 */
.is-active { }
.has-error { }
.is-loading { }

/* ❌ 避免位置描述 */
/* .left-panel { }     不推荐 */
/* .red-text { }       不推荐 */
/* .box1 { }           不推荐 */

/* ❌ 避免使用通用选择器 */
/* * { margin: 0; }    性能差 */
```

### 零值单位规范
```css
/* ✅ 正确：零值无单位 */
margin: 0;
padding: 0;
border: 0;

/* ❌ 错误：零值带单位 */
/* margin: 0px; */
/* padding: 0em; */
/* border: 0rem; */

/* 例外：时间和百分比需要单位 */
transition-duration: 0ms;    /* 时间需要单位 */
width: 0%;                   /* 百分比需要单位 */
```

## 文档与注释规范

### README.md 标准结构
```markdown
# 组件名

## 概述
组件功能简述

## 版本信息
- 当前版本：v1.0.0
- 最后更新：2024-01-15
- 兼容性：Vue 3.2+, TypeScript 4.5+

## 基础用法
代码示例

## Props

| 参数名 | 说明 | 类型 | 默认值 |
|-------|------|------|--------|
| title | 标题 | string | - |
| disabled | 是否禁用 | boolean | false |

## Events

| 事件名 | 说明 | 回调参数 |
|-------|------|---------|
| change | 值变化 | (value: any) |
| submit | 提交 | () |

## Slots

| 插槽名 | 说明 | 作用域参数 |
|-------|------|-----------|
| default | 默认插槽 | - |
| header | 头部插槽 | - |

## Methods

| 方法名 | 说明 | 参数 |
|-------|------|------|
| reset | 重置组件 | - |
| validate | 验证数据 | - |
```