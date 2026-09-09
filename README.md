# 感智晓界

> Polyrepo 架构：4 个独立 GitLab 仓库 + Docker Compose 统一编排

> Polyrepo 架构：4 个独立 GitLab 仓库 + Docker Compose 统一编排

## 仓库结构

| 仓库 | 技术栈 | 端口 | 职责 |
|------|--------|------|------|
| `frontend/` | Vue 3 + Vite + Ant Design Vue | 2610 | 用户界面 |
| `backend-node/` | NestJS + LangGraph + AI 引擎 | 13030 | Figma 管线、微码/Vue3 生成、SSE |
| `backend-java/` | Spring Boot 3.2 + Maven 多模块 | 8080 | 业务 CRUD、权限、数据管理 |
| `docs/` | Markdown | — | 技术文档、架构设计、API 契约 |

## 路由分发

Nginx 统一入口（端口 80）：

```
/api/progress|phase2|vue3|demo|preview|models → Node.js:13030
其余 /api/*                                      → Java:8080
/                                                → 前端:2610
```

## 快速启动

### 本地开发

```bash
# 1. Node.js 后端
cd backend-node
bash build-backend.sh
bash .start-server.sh

# 2. Java 后端（需要 Maven + JDK 17）
cd backend-java
mvn clean package -pl mvgo-app -am
java -jar mvgo-app/target/mvgo-app-1.0.0-SNAPSHOT.jar

# 3. 前端
cd frontend
npm install
npm run dev
```

### Docker Compose

```bash
docker compose up -d
```

## API 契约

OpenAPI 文档为前后端之间的唯一真相源，存放在 `backend-java/api-contract/`。
前端 CI 时拉取该文件生成 API 客户端。

## 迁移进度

- [x] Polyrepo 目录拆分
- [x] Node.js 后端路径适配（process.cwd() 引用修复）
- [x] 前端代理路由拆分
- [x] Java Maven 骨架
- [ ] 22→7+15 模块迁移（AI 保留 Node.js，业务迁 Java）
- [ ] 前端 API 客户端生成
- [ ] CI/CD 流水线
