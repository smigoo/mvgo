# 微码组件规范检查报告

> 规范版本：v1.0.20 | 检查时间：2026/10/12 14:36:02 | 共检查 1 个组件

## 汇总

| 检查组件数 | 允许上线 | 不允许上线 |
|---|---|---|
| 1 | 0 | 1 |

## 检查结果

| 组件目录 | 组件名称 | 版本 | 检查项 | 通过 | 失败 | 警告 | 上线状态 |
|---|---|---|---|---|---|---|---|
| `c-nt` | 三主题组件测试 | v1.0.0 | 37 | 32 | 5 | - | ❌ 不允许上线 |

## 失败项明细

### c-nt

- **[M3-7] cssVariableConfig与css-vars.js一致性**：cssVariableConfig 中定义的以下变量在 css-vars.js 中缺失：accentColor
- **[M4-1] declare.js格式**：declare.js 未使用 $createMcDeclare
- **[M4-2] declare.js传入cssVars**：declare.js 未传入 cssVars（css-vars.js 为必须项）
- **[M4-7] css-vars.js字体变量格式**：fontSize: ".getCssSize()" 必须使用 $mcCssBuilder.getCssSize() 或 $mcCssBuilder.getCssSize(数字)
- **[M4-6] index.less被引用**：resources/styles/index.less 未在 package/ 文件中引用

---
*由 微码平台 脚本生成，规范版本 v1.0.20*
