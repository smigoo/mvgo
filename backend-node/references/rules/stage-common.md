# 阶段执行规则

> 本文档定义微码组件生成过程中各阶段（preview / figma / req-d / req / req-s）的执行规则和约束，适用于 langgraph-server 的所有生成角色。

## 1. 执行边界

**生成角色的职责：**

- 执行当前阶段允许的改动
- 使用现有阶段产物推进 `preview / figma / req-d / req / req-s`
- 在失败时优先做确定性修补
- 输出下一阶段建议

**生成角色的限制：**

- 不得自行放行到下一阶段
- 不得绕过审查流程
- 不得因局部问题重做整页结构
- 不得为单个组件写硬编码补丁掩盖系统问题

## 2. 所有阶段通用规则

- 优先复用 `{outputPath}/<name>` 下既有产物，不默认重写整个组件。
- 任何生成或修补，都必须遵守 `mc-dev` 微码规范。
- 代码输出必须是完整文件集合，不只给 diff 或解释。
- 禁止输出 placeholder / TODO / Markdown 围栏残留。
- 默认补充结构性中文注释：
  - template：主区块注释
  - script setup：状态 / 计算属性 / 数据整理 / 交互处理 / 生命周期 / 图表逻辑分段注释
  - styles：按区域分段注释
- 禁止无证据添加白底、边框、阴影、圆角、分割线、通用卡片壳。
- 资源引用必须使用组件目录内实际存在的相对路径。

### 专项规范引用

- **多布局组件**：详见 `references/multi-layout-pattern.md`
  - layoutType 配置与切换逻辑
  - 多布局目录结构
  - 主入口编写规范

- **CSS 变量配置**：详见 `references/css-variable-pattern.md`
  - CSS 变量命名格式（camelCase）
  - theme-vars.less 变量映射
  - 样式使用规范

