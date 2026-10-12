# 微码组件规范检查报告

> 规范版本：v1.0.20 | 检查时间：2026/10/12 14:16:51 | 共检查 1 个组件

## 汇总

| 检查组件数 | 允许上线 | 不允许上线 |
|---|---|---|
| 1 | 0 | 1 |

## 检查结果

| 组件目录 | 组件名称 | 版本 | 检查项 | 通过 | 失败 | 警告 | 上线状态 |
|---|---|---|---|---|---|---|---|
| `c-t` | t | v1.0.0 | 33 | 23 | 10 | - | ❌ 不允许上线 |

## 失败项明细

### c-t

- **[M1-2] componentName长度**："t" 长度 1，要求 2-50 字符
- **[M2-1] 必要文件存在性**：缺少：declare.js
- **[M2-2] mc-preview.png存在**：resources/images/mc-preview.png 不存在
- **[M2-6] layoutConfig预览图**：预览图 "mc-preview.png" 不存在于 resources/images/
- **[M3-1] declare.json必填字段**：缺少：attribute.aspectRatio
- **[M4-1] declare.js格式**：declare.js 未使用 $createMcDeclare
- **[M4-2] declare.js传入cssVars**：declare.js 未传入 cssVars（css-vars.js 为必须项）
- **[M4-7] css-vars.js字体变量格式**：fontSize: ".getCssSize()" 必须使用 $mcCssBuilder.getCssSize() 或 $mcCssBuilder.getCssSize(数字)
- **[M4-6] index.less被引用**：resources/styles/index.less 未在 package/ 文件中引用
- **[M5-1] <base-panel>包裹**：package/index.vue 未使用 <base-panel> 包裹

---
*由 微码平台 脚本生成，规范版本 v1.0.20*
