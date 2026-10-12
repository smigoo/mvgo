# 微码组件规范检查报告

> 规范版本：v1.0.20 | 检查时间：2026/10/12 16:08:41 | 共检查 1 个组件

## 汇总

| 检查组件数 | 允许上线 | 不允许上线 |
|---|---|---|
| 1 | 0 | 1 |

## 检查结果

| 组件目录 | 组件名称 | 版本 | 检查项 | 通过 | 失败 | 警告 | 上线状态 |
|---|---|---|---|---|---|---|---|
| `c-ntheme-replay` | aiot-dpjh-bsjd | v1.0.0 | 36 | 33 | 3 | - | ❌ 不允许上线 |

## 失败项明细

### c-ntheme-replay

- **[M1-1] componentId规范**：与目录名 "c-ntheme-replay" 不一致
- **[M3-8] css-vars.js自定义变量声明**：css-vars.js 中定义的以下自定义变量未在 cssVariableConfig 中声明：colorTextSecondary、colorDanger、colorWarning、colorSuccess、colorBorder
- **[M5-4] publishEvent与businessEvents一致性**：publishEvent 未在 businessEvents 中声明：replay-onload

---
*由 微码平台 脚本生成，规范版本 v1.0.20*
