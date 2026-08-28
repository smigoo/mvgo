---
name: frontend-mc-guideline
description: 微码组件开发规范查询与辅助开发工具。当用户询问微码组件开发规范、如何开发新的微码组件、declare.json 如何配置、css-vars.js 怎么写、$mcComponentBuilder 怎么用、组件目录结构是什么、业务事件/状态如何配置、businessConfig 怎么写等问题时触发。也适用于辅助 AI 生成符合规范的新组件代码。遇到任何微码组件开发相关问题都应优先使用此 Skill。
---

# microcode-dev — 微码组件开发规范查询 & 辅助开发

## 规范文档（references/）

本 Skill 的规范内容已精简提炼至 `references/` 目录，按需读取：

| 文件 | 内容 | 何时读取 |
|------|------|----------|
| `references/declare-json.md` | declare.json 所有字段规范、枚举值、示例 | 涉及 declare.json 配置时 |
| `references/code-patterns.md` | 代码规范：base-panel、布局、$mcComponentBuilder、componentApi、事件方法、开发约束 | 涉及组件代码编写时 |
| `references/style-guide.md` | 样式规范：css-vars.js、主题 | 涉及样式开发时 |
| `references/framework-events.md` | mc-framework-* 事件列表及用法 | 涉及框架级事件时 |

参考组件案例：`src/workspace/custom-components/c-mc-micro-image`（结构完整，推荐参考）

---

## 使用场景

### 场景 A：规范查询

用户询问规范相关问题时，读取对应 reference 文件，再给出准确答案。

常见问题对应文件：
- `componentId` 命名规则 → `declare-json.md`
- `declare.js` 怎么写 → `code-patterns.md`
- `css-vars.js` 结构 → `style-guide.md`
- `$mcComponentBuilder` 用法 → `code-patterns.md`
- 框架事件（如 `mc-framework-init`）→ `framework-events.md`
- 组件上传要求 → `code-patterns.md`

### 场景 B：辅助新组件开发

生成新组件代码前，先读取所有 reference 文件，再严格按规范生成。

#### 目录结构（必须完整）

```
<componentId>/
├── component.js          # 组件导出文件
├── declare.js            # 组件声明信息
├── declare.json          # 组件配置元数据
├── package/              # 组件核心代码
│   ├── index.vue         # 组件主入口 顶层必须 <base-panel> 包裹，$mcComponentBuilder 只调用一次
│   └── components/       # 子组件目录
└── resources/            # 资源文件目录
    ├── config/           # 配置文件
    │   └── css-vars.js   # CSS变量配置
    ├── images/           # 图片资源
    │   └── mc-preview.png# 预览图片
    └── styles/           # 样式文件
        ├── index.less    # 样式入口文件
        ├── common.less   # 通用样式
        └── themes/       # 主题相关样式
            ├── theme-vars.less  # 主题变量
            ├── dark.less        # 深色主题
            └── light.less       # 浅色主题
```

---

## 生成代码后的自检

- [ ] 目录名 = componentId，`c-` 开头，kebab-case
- [ ] declare.json 所有必填字段已填写（含 `businessEvents`/`businessStatuses`）
- [ ] declare.js 使用 `$createMcDeclare`
- [ ] `$mcComponentBuilder` 只调用一次
- [ ] 有 cssVariableConfig → 有 css-vars.js → declare.js 传入 cssVars
- [ ] 有 themeConfig → 有 themes/ 目录
- [ ] 有 layoutConfig.previewName → 图片文件存在于 resources/images/
- [ ] mc-preview.png 存在于 resources/images/
- [ ] listenEvent 有对应 removeListener（在 onUnmounted 中）
- [ ] 无禁用 API 调用（axios/fetch/createRequest）
