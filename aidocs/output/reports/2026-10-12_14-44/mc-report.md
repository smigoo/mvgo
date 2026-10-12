# 微码组件规范检查报告

> 规范版本：v1.0.20 | 检查时间：2026/10/12 14:44:27 | 共检查 1 个组件

## 汇总

| 检查组件数 | 允许上线 | 不允许上线 |
|---|---|---|
| 1 | 0 | 1 |

## 检查结果

| 组件目录 | 组件名称 | 版本 | 检查项 | 通过 | 失败 | 警告 | 上线状态 |
|---|---|---|---|---|---|---|---|
| `c-aiot-dpjh-bsjd-80092f38` | aiot-dpjh-bsjd | v1.0.0 | 33 | 29 | 4 | - | ❌ 不允许上线 |

## 失败项明细

### c-aiot-dpjh-bsjd-80092f38

- **[M2-4] themes目录结构**：themes/ 缺少：theme_1.less、theme_2.less、theme_3.less
- **[M3-8] css-vars.js自定义变量声明**：css-vars.js 中定义的以下自定义变量未在 cssVariableConfig 中声明：colorTextSecondary、colorDanger、colorWarning、colorSuccess、colorBorder
- **[M3-13] dark主题配置**：themeConfig.list 中必须包含 key="dark" 的主题
- **[M4-5] index.less引入主题文件**：index.less 未引入主题文件：themes/theme_1.less、themes/theme_2.less、themes/theme_3.less

---
*由 微码平台 脚本生成，规范版本 v1.0.20*
