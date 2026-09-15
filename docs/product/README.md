# 产品设计文档

本目录包含产品功能设计、PRD、用户体验设计等文档。

---

## 🤖 Agent Builder

Agent Builder 是平台的核心功能之一，允许用户快速构建和部署智能代理。

- [PRD](./agent-builder/prd.md) - 产品需求文档
- [体验设计](./agent-builder/experience-design.md) - 用户体验设计方案
- [功能差距分析](./agent-builder/gap-analysis.md) - 当前功能与目标的差距
- [模板增长 SOP](./agent-builder/template-growth-sop.md) - 模板增长标准操作流程
- [生态冷启动](./agent-builder/ecosystem-cold-start.md) - Agent 生态系统冷启动方案

---

## 🔌 API 生成

API 生成功能帮助用户快速生成 RESTful API 接口。

- [设计规范](./api-generation/design-spec.md) - API 生成功能设计规范

---

## ⚙️ 模型配置 (Profile)

模型配置功能允许用户自定义和管理模型参数。

- [需求分析](./model-profile/requirement-analysis.md) - Profile 功能需求分析
- [API 变更](./model-profile/api-changes.md) - API 变更说明
- [功能概览](./model-profile/feature-overview.md) - Profile 功能概览

---

## 📊 管线监控

管理员专属的组件生成管线监控看板：用户 / 模型归属根域名 / 组件类型 / 来源（截图·Figma）/ 成功失败 / 耗时 / 门禁拦截。

- [PRD 与开发计划](./pipeline-monitoring/prd.md) - 需求冻结版（v1.0，2026-09-15，待开工）

---

## 🎯 文档分类

| 分类 | 文档数量 | 说明 |
|------|---------|------|
| Agent Builder | 5 | 核心产品功能 |
| API 生成 | 1 | API 生成设计 |
| 模型配置 | 3 | Profile 功能设计 |
| 管线监控 | 1 | 管理员监控看板（待开发） |

---

## 📝 文档维护

### 命名规范

```
产品功能目录命名: kebab-case
例: agent-builder/, api-generation/

文档命名: kebab-case.md
例: prd.md, experience-design.md
```

### 生命周期

| 文档类型 | 保留期限 | 更新频率 |
|---------|---------|---------|
| PRD | 永久 | 按需更新 |
| 体验设计 | 1 年 | 迭代时更新 |
| 功能分析 | 6 个月 | 季度复盘 |

---

## 📚 相关文档

- **用户研究**: [../ux-research/](../ux-research/)
- **组件生成**: [../component-generation/](../component-generation/)
- **系统架构**: [../architecture/系统架构文档.md](../architecture/系统架构文档.md)

---

**最后更新**: 2026-09-15  
**维护团队**: Product Team
