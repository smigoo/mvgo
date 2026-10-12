# 微码组件规范检查报告

> 规范版本：v1.0.20 | 检查时间：2026/10/12 16:01:18 | 共检查 1 个组件

## 汇总

| 检查组件数 | 允许上线 | 不允许上线 |
|---|---|---|
| 1 | 0 | 1 |

## 检查结果

| 组件目录 | 组件名称 | 版本 | 检查项 | 通过 | 失败 | 警告 | 上线状态 |
|---|---|---|---|---|---|---|---|
| `c-aiot-dpjh-bsjd-5dcaf7cc` | aiot-dpjh-bsjd | v1.0.0 | 31 | 26 | 4 | 1 | ❌ 不允许上线 |

## 失败项明细

### c-aiot-dpjh-bsjd-5dcaf7cc

- **[M2-3] css-vars.js存在性**：resources/config/css-vars.js 不存在（必须配置）
- **[M4-2] declare.js传入cssVars**：declare.js 未传入 cssVars（css-vars.js 为必须项）
- **[M4-4] css-vars.js导出结构**：css-vars.js 缺少导出：common、light、dark
- **[M4-8] css-vars.js导出dark**：css-vars.js 必须导出 dark 对象
- ⚠️ **[M5-10] 硬编码颜色**：样式中存在硬编码颜色值，建议改用 CSS 变量：resources/styles/common.less:20、resources/styles/common.less:21、resources/styles/common.less:98

---
*由 微码平台 脚本生成，规范版本 v1.0.20*
