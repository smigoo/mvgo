# 验证器系统

基于提示词规则文档实现的代码验证系统，用于检查生成的代码是否符合微码组件规范。

## 架构

```
validators/
├── rule-validator.js              # 基础验证器类
├── chart-validator.js             # 图表规则验证器
├── figma-node-validator.js        # Figma 节点验证器
├── vue-component-validator.js     # Vue 组件规范验证器
├── resource-path-validator.js     # 资源路径验证器
├── theme-validator.js             # 主题和 CSS 变量验证器
├── validator-coordinator.js       # 验证器协调类
└── index.js                       # 统一导出
```

## 快速开始

### 基础使用

```javascript
import { validate } from './validators/index.js'

const code = `
<script setup>
// 你的 Vue 组件代码
</script>
`

// 验证代码
const result = validate(code, 'preview')

if (result.passed) {
  console.log('✅ 验证通过')
} else {
  console.log('❌ 发现问题:', result.summary)
  result.violations.forEach(v => {
    console.log(`- [${v.level}] ${v.message}`)
  })
}
```

### 格式化输出

```javascript
import { validateAndFormat } from './validators/index.js'

// Markdown 格式
const markdown = validateAndFormat(code, 'figma', { format: 'markdown' })
console.log(markdown)

// 纯文本格式
const text = validateAndFormat(code, 'preview', { format: 'text' })

// JSON 格式
const json = validateAndFormat(code, 'req', { format: 'json' })
```

## 验证阶段

系统支持以下验证阶段：

- **preview**: 预览阶段，验证基础组件结构和图表配置
- **figma**: Figma 还原阶段，验证样式精确还原和 Figma 节点处理
- **req**: 需求阶段，验证业务逻辑实现
- **req-s**: 需求细化阶段

不同阶段会应用不同的规则集。

## 验证级别

规则按严重程度分为三个级别：

- **L3 (严重)**: 违反核心规范，必须修复
- **L2 (重要)**: 影响功能或性能，强烈建议修复
- **L1 (建议)**: 最佳实践建议，可选修复

### 按级别过滤

```javascript
// 只验证严重问题
const result = validate(code, 'preview', { level: 'L3' })

// 验证重要及以上问题 (L2 + L3)
const result = validate(code, 'figma', { level: 'L2' })
```

## 规则分类

验证器按功能分为以下类别：

- **vue-component**: Vue 组件基础规范
- **chart**: ECharts 图表配置规范
- **figma-node**: Figma 节点处理规范
- **resource-path**: 静态资源路径规范
- **theme**: 主题变量使用规范

### 按分类过滤

```javascript
// 只验证图表相关规则
const result = validate(code, 'preview', { categories: ['chart'] })

// 验证多个分类
const result = validate(code, 'figma', {
  categories: ['figma-node', 'theme']
})
```

## 高级用法

### 使用协调器

```javascript
import { ValidatorCoordinator } from './validators/index.js'

const coordinator = new ValidatorCoordinator()

// 验证代码
const result = coordinator.validate({
  code,
  stage: 'figma',
  level: 'L2',
  categories: ['chart', 'theme']
})

// 查询规则
const chartRules = coordinator.getRulesByCategory('chart')
const figmaRules = coordinator.getRulesByStage('figma')
const criticalRules = coordinator.getRulesByLevel('L3')

// 获取统计信息
const stats = coordinator.getStatistics()
console.log('总规则数:', stats.total)
console.log('按分类:', stats.byCategory)
console.log('按级别:', stats.byLevel)
```

### 自定义验证器

```javascript
import { RuleValidator } from './validators/index.js'

class MyCustomValidator extends RuleValidator {
  constructor() {
    super()
    this.registerMyRules()
  }

  registerMyRules() {
    this.registerRule('my-custom-rule', {
      name: '我的自定义规则',
      category: 'custom',
      level: 'L2',
      docRef: 'my-rules.md#custom-rule',
      stages: ['preview', 'figma'],
      check: (context) => {
        // 返回 true 表示通过，false 表示违规
        return /某个模式/.test(context.code)
      },
      message: '违规时显示的消息'
    })
  }
}
```

## 规则示例

### Vue 组件规范

- ✅ 必须使用 `<script setup>`
- ✅ 必须调用 `$mcComponentBuilder()`
- ✅ 必须使用 `<base-panel>` 作为根容器
- ❌ 禁止使用 Options API
- ❌ 禁止使用 `v-html`

### 图表规则

- ✅ 图表必须提供 `tooltip`
- ✅ 图表必须设置 `grid.containLabel`
- ✅ 图表容器必须设置 `height`
- ✅ 图表必须监听 `resize`
- ✅ 图表必须在 `onUnmounted` 中销毁

### Figma 节点规则

- ❌ bg 节点不应生成独立 DOM
- ✅ 背景图必须设置 `backgroundSize`
- ❌ 背景图不应使用 `<img>` 标签
- ✅ 圆角必须来自 Figma 数据
- ✅ 颜色必须精确提取

### 资源路径规则

- ✅ 图片必须使用 `import` 导入
- ✅ 图片导入必须带 `?url` 后缀
- ❌ 禁止使用 `@` 别名
- ❌ 禁止使用绝对路径
- ✅ 静态资源必须放在 `assets` 目录

### 主题规则

- ✅ 必须使用 `props.cssVars`
- ❌ 禁止硬编码颜色值
- ✅ CSS 变量必须正确解构
- ✅ 主题变量必须有默认值
- ❌ 禁止使用 `var(--xxx)` 语法

## API 参考

### validate(code, stage, options)

快捷验证函数。

**参数:**
- `code` (string): 要验证的代码
- `stage` (string): 验证阶段
- `options` (Object): 可选配置
  - `level` (string): 最低验证级别，默认 'L2'
  - `categories` (Array): 要验证的分类，默认所有

**返回:**
- `passed` (boolean): 是否通过验证
- `violations` (Array): 违规列表
- `summary` (string): 验证摘要

### validateAndFormat(code, stage, options)

验证并格式化输出。

**参数:**
- `code` (string): 要验证的代码
- `stage` (string): 验证阶段
- `options` (Object): 可选配置
  - `format` (string): 输出格式 ('markdown' | 'text' | 'json')
  - 其他选项同 `validate()`

**返回:** (string) 格式化的验证结果

### ValidatorCoordinator

验证器协调类。

**方法:**
- `validate(context)`: 验证代码
- `getAllRules()`: 获取所有规则
- `getRulesByCategory(category)`: 按分类获取规则
- `getRulesByStage(stage)`: 按阶段获取规则
- `getRulesByLevel(level)`: 按级别获取规则
- `getStatistics()`: 获取统计信息
- `formatAsMarkdown(result)`: 格式化为 Markdown
- `formatAsText(result)`: 格式化为文本
- `formatAsJson(result)`: 格式化为 JSON

## 使用示例

完整的使用示例请参考 `examples/validator-usage.js`。

运行示例：

```bash
node examples/validator-usage.js
```

## 与 LangGraph 集成

在 LangGraph 节点中使用验证器：

```javascript
import { validate } from './validators/index.js'

// 在代码生成节点之后
function validateCodeNode(state) {
  const { generatedCode, stage } = state

  const result = validate(generatedCode, stage)

  if (!result.passed) {
    console.log('代码验证失败:')
    result.violations.forEach(v => {
      console.log(`[${v.level}] ${v.message}`)
    })

    // 可以选择自动修复或重新生成
    return { needsRevision: true, validationResult: result }
  }

  return { needsRevision: false }
}
```

## 扩展开发

### 添加新规则

1. 在对应的验证器类中添加规则注册
2. 实现检查逻辑
3. 添加必要的辅助方法

```javascript
// 在 ChartValidator 中添加新规则
registerChartRules() {
  // ... 其他规则

  this.registerRule('my-new-chart-rule', {
    name: '我的新图表规则',
    category: 'chart',
    level: 'L2',
    docRef: 'chart-rules.md#new-rule',
    stages: ['preview', 'figma'],
    check: (context) => {
      return this.checkMyNewRule(context.code)
    },
    message: '违规时的提示消息'
  })
}

checkMyNewRule(code) {
  // 实现检查逻辑
  return /某个模式/.test(code)
}
```

### 添加新验证器

1. 创建新的验证器类，继承 `RuleValidator`
2. 注册规则
3. 在 `ValidatorCoordinator` 中添加实例

```javascript
// my-validator.js
import { RuleValidator } from './rule-validator.js'

export class MyValidator extends RuleValidator {
  constructor() {
    super()
    this.registerMyRules()
  }

  registerMyRules() {
    // 注册规则...
  }
}

// 在 validator-coordinator.js 中添加
import { MyValidator } from './my-validator.js'

initializeValidators() {
  this.validators = [
    // ... 其他验证器
    new MyValidator()
  ]
}
```

## 规则文档映射

验证器规则对应的文档：

- `ai-generation-constraints.md` - Vue 组件核心规范
- `static-resource-handling.md` - 静态资源处理规范

> 注：`segments/` 目录下的旧版规则文件（chart-configuration-rules、legend-tooltip-rules、figma-node-rules、image-verification-anti-hallucination）已于 2026-08-24 清理，其规则已被 `prompts/engineer/dynamic/` 下的新版替代。备份在 `/tmp/mvgo-segments-backup-20260824/`。

每个规则都通过 `docRef` 字段链接到具体的文档章节。

## 注意事项

1. **静态分析限制**: 验证器基于正则表达式和模式匹配，无法完全理解代码语义
2. **误报可能**: 某些复杂场景可能产生误报，需要人工判断
3. **持续更新**: 随着规则文档更新，验证器也需要相应更新
4. **性能考虑**: 对于大型代码文件，验证可能需要一定时间

## 贡献指南

欢迎贡献新的规则和验证器！请遵循以下步骤：

1. 确保规则有对应的文档依据
2. 编写清晰的规则名称和说明
3. 提供准确的文档引用
4. 添加必要的测试用例
5. 更新本 README

## 许可

MIT
