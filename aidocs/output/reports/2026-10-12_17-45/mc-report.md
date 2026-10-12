# 微码组件规范检查报告

> 规范版本：v1.0.20 | 检查时间：2026/10/12 17:45:12 | 共检查 1 个组件

## 汇总

| 检查组件数 | 允许上线 | 不允许上线 |
|---|---|---|
| 1 | 0 | 1 |

## 检查结果

| 组件目录 | 组件名称 | 版本 | 检查项 | 通过 | 失败 | 警告 | 上线状态 |
|---|---|---|---|---|---|---|---|
| `c-aiot-dpjh-bsjd-fca166e8` | aiot-dpjh-bsjd | v1.0.0 | 36 | 34 | 1 | 1 | ❌ 不允许上线 |

## 失败项明细

### c-aiot-dpjh-bsjd-fca166e8

- **[M5-7] 禁止硬编码字体大小**：以下位置使用了硬编码字体大小（>5px），必须改用 @fontSize 或相对单位：resources/styles/common.less:124 (font-size: 18px)、resources/styles/common.less:133 (font-size: 14px)、resources/styles/common.less:141 (font-size: 14px)…等8处
- ⚠️ **[M5-10] 硬编码颜色**：样式中存在硬编码颜色值，建议改用 CSS 变量：resources/styles/common.less:126、resources/styles/common.less:151、package/components/ContentSection.vue <style>:26…等5处

---
*由 微码平台 脚本生成，规范版本 v1.0.20*
