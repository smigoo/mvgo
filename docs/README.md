# docs — 感智晓界平台文档

项目文档统一存放在本目录，按用途分类维护。

## 文档分类

| 目录 | 内容 |
|------|------|
| `architecture/` | 系统架构、双运行时职责边界、数据库设计 |
| `operations/` | 部署指南、生成正确性根治方案 |
| `component-generation/` | ⭐ 组件生成规范、管线设计、优化方案 |
| `product/` | 产品设计、PRD、Agent Builder、API 生成 |
| `ux-research/` | 用户研究、UX 建议、设计交接 |
| `quality/` | 质量门禁、实时预览、原型验证 |
| `deployment/` | 前端部署、Nginx 配置 |
| `prototypes/` | HTML 原型文件 |
| `archive/` | 历史文档归档 |

## 推荐阅读顺序

### 用户视角

1. `product/agent-builder/prd.md` — 产品功能与交互说明
2. `architecture/系统架构文档.md` — 技术全景
3. `product/` — 产品功能设计

### 开发者 / 运维视角

1. `architecture/系统架构文档.md` — 技术栈、双运行时、路由、数据流
2. `architecture/Node-Java-职责边界.md` — Java/Node 详细职责与代理矩阵
3. `operations/部署指南.md` — 生产 ECS + Docker Compose 部署步骤
4. `deployment/` — 前端部署与配置

### AI 引擎开发者

1. `component-generation/rules-and-optimization.md` ⭐⭐⭐⭐⭐ — 组件生成完整规范
2. `component-generation/pipeline-nodes.md` — 管线节点文档
3. `quality/` — 质量门禁与预览机制
4. `operations/生成正确性根治方案.md` — 生成质量优化

## 配套文档速查

| 文档 | 路径 | 适合谁看 |
|------|------|---------|
| Agent Builder 产品说明 | `product/agent-builder/prd.md` | 产品经理 / 开发者 |
| 系统架构文档 | `architecture/系统架构文档.md` | 开发者 / 架构师 |
| 双运行时职责边界 | `architecture/Node-Java-职责边界.md` | 后端开发者 |
| 部署指南 | `operations/部署指南.md` | 运维 / 部署人员 |
| 组件生成规范 ⭐ | `component-generation/rules-and-optimization.md` | AI 引擎开发者 |
| Agent Builder PRD | `product/agent-builder/prd.md` | 产品经理 / 开发者 |
| 质量门禁 | `quality/` | QA / 开发者 |
| 前端部署 | `deployment/mvgo-frontend-deploy.md` | 前端开发 / 运维 |

## Polyrepo 架构要点

- **4 仓库独立**：frontend、backend-node、backend-java、docs
- **API 契约**：当前前后端以实际接口约定为准
- **Nginx 路由分发**：仅 `/api/progress`（SSE）直连 Node，其余 `/api` 经 Java（原生 CRUD 或代理 AI 管线）

## 维护规则

- 新增文档先判断分类，再放入对应子目录
- 用户级文档（使用指南、架构总览）放根目录；技术细节放子目录
- 文档中的代码路径使用项目根目录作为相对路径基准
- 文档移动后同步更新相对链接和 README 索引
- 每个专区目录包含独立的 README.md 导航文档

## 文档生命周期

| 文档类型 | 保留期限 | 归档策略 |
|---------|---------|---------|
| 核心规范 | 永久 | 定期更新，保留历史版本 |
| 系统架构 | 永久 | 按需更新 |
| 产品设计 | 1 年 | 产品上线后归档 |
| 用户研究 | 6 个月 | 完成后归档 |
| 周报汇报 | 3 个月 | 归档到 archive/ |

---

**最后更新**: 2026-08-28  
**变更记录**: 合并 artifacts 目录，新增 6 个专区分类
