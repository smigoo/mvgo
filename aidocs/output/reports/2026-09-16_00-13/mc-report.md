# 微码组件规范检查报告

> 规范版本：v1.0.20 | 检查时间：2026/9/16 00:13:51 | 共检查 1 个组件

## 汇总

| 检查组件数 | 允许上线 | 不允许上线 |
|---|---|---|
| 1 | 1 | 0 |

## 检查结果

| 组件目录 | 组件名称 | 版本 | 检查项 | 通过 | 失败 | 警告 | 上线状态 |
|---|---|---|---|---|---|---|---|
| `c-env-monitor-1cffd7ce` | 环境监测 | v1.0.0 | 34 | 33 | 0 | 1 | ✅ 允许上线 |
## 警告项（允许上线，建议修复）

### c-env-monitor-1cffd7ce

- ⚠️ **[M5-10] 硬编码颜色**：样式中存在硬编码颜色值，建议改用 CSS 变量：package/components/ContentSection.vue <style>:24、package/components/ContentSection.vue <style>:40、package/components/ContentSection.vue <style>:43

---
*由 微码平台 脚本生成，规范版本 v1.0.20*
