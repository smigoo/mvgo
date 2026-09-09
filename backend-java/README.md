# backend-java — 感智晓界业务后端

> Spring Boot 3.2.5 + Maven 多模块
> 端口：**8080**
> 在 mvgo Polyrepo 架构中负责：业务 CRUD、权限管理、组件拆分（docx 需求 + HTML 原型 → 组件交付包）、操作日志审计，**以及 Node 后端 AI 能力的服务端编排调用**。

## 技术栈

| 维度 | 选型 |
|------|------|
| 语言 / 构建 | Java 17 + Maven（多模块，`mvgo-parent` 聚合 POM） |
| 框架 | Spring Boot 3.2.5（starter-parent） |
| 数据层 | MyBatis-Plus 3.5.6 + JPA（classpath 已带，但**当前未启用关系型库**） |
| 文档处理 | Hutool 5.8.28、POI 5.2.5（组件拆分解析 docx / html） |
| 数据库 | MongoDB（与 Node 共用同一实例与库，存 `operation_logs` 等） |
| 通信 | `mvgo-node` 模块以 HTTP 客户端调用 Node.js（13030）AI 引擎 |

## 模块依赖链

```
mvgo-app (启动模块，含 main)
  └── mvgo-api        (Controller 层 + 拦截器/全局异常/鉴权)
        └── mvgo-business   (业务逻辑 / Service / DTO)
              ├── mvgo-common    (公共：DTO、枚举、异常、BizException)
              ├── mvgo-data      (数据层：MongoTemplate / MyBatis-Plus / JPA 装配)
              └── mvgo-node      (Node.js 后端 HTTP 通信客户端)
```

> `mvgo-data` 把 JPA / MyBatis-Plus / MySQL 驱动带进了 classpath，但当前业务（组件拆分、操作日志）无状态、无需关系库。`application.yml` 已 `exclude` 三个 DataSource/JPA 自动配置，避免启动因缺 MySQL 而失败。后续需持久化时与 Node 一致统一接 MongoDB，不再引入第二种数据库。

## 已实现接口（实际控制器）

| 控制器 | 路由前缀 | 端点 |
|--------|----------|------|
| `HealthController` | `/api` | `GET /api/health` |
| `ComponentSplitController` | `/api/component-split` | `POST /analyze`（解析 docx 需求 + HTML 原型）、`POST /build`（产出组件 MD 交付包） |
| `AdminController` | `/api/admin` | `GET users`；`POST users/{id}`（设/取消管理员）；`DELETE users/{id}`；`POST users/{id}/delete`（级联删其组件）；`GET components`；`GET/POST components/{id}`；`POST components/{id}/delete`；`DELETE components/{id}`；`POST components/batch-delete` |
| `OperationLogController` | `/api/operation-log` | `POST`（写入，由 Node 全局拦截器 fire-and-forget 上报）；`GET`（分页读取审计流水，含 user 富化） |

> ⚠️ **迁移状态**：Node 侧的 `auth/group/component/task/workflow/document/...` 业务仍主要在 Node（13030）。当前 Java 仅承接已明确迁来的子集——**admin（用户 + 组件管理）、operation-log（审计读）、component-split（组件拆分）**。前端 `vite.config.js` 的 `proxy` 已将这些路径转发到 8080（其余 `/api/*` 兜底仍指向 13030）。

### 鉴权

- `/api/admin/**` 挂 `SessionGuardInterceptor`：同源 `raw=1` 放行；读 `Token` 头委托 `SessionAuthService` 校验门户 token（dev 态 `DEV_AUTO_LOGIN=true` 接纳任意 token 为 `dev-local`，production 强制忽略）。
- 跨语言会话（express-session cookie）不可共享，故 Java 侧仅做认证、未做 admin 角色二次校验（prod 由网关把关）。

### 统一响应信封

所有响应经 `GlobalExceptionHandler` / 控制器返回 `Result<T>` 严格嵌套信封（含 `source: "java"`）：

```json
{ "success": true, "code": 200, "message": "ok", "data": { ... }, "source": "java" }
```

`BizException(404/400/401)` 映射为对应 code 的规范错误体。

## 构建与启动

```bash
# 构建全部模块（JDK 17）
mvn clean package -pl mvgo-app -am

# 运行（默认 dev profile）
java -jar mvgo-app/target/mvgo-app-1.0.0-SNAPSHOT.jar

# 开发模式（热加载）
mvn spring-boot:run -pl mvgo-app

# 指定 profile 运行
java -jar mvgo-app/target/mvgo-app-1.0.0-SNAPSHOT.jar --spring.profiles.active=dev
```

> 需要 **JDK 17**。本地若用 Homebrew OpenJDK：`export JAVA_HOME=/opt/homebrew/opt/openjdk@17`。

## 配置（application.yml）

| 项 | 说明 |
|----|------|
| `server.port` | 8080 |
| `spring.profiles.active` | `dev`（默认）/ `prod` |
| `mvgo.node.base-url` | Node 后端地址，dev `http://localhost:13030/api`，Docker `http://backend-node:13030/api` |
| `spring.data.mongodb.uri` | dev `mongodb://localhost:27017/langgraph-server`（与 Node 共用）；`auto-index-creation: false`（索引由 Node schema 创建） |
| `logging.level.com.mvgo` | dev `debug` |

> 安全红线：`DEV_AUTO_LOGIN=true`、明文密钥不进 production 配置或提交。

## 与 Node.js 后端的关系

- **调用方向（Java → Node）**：`mvgo-node` 模块 HTTP 客户端按 `mvgo.node.base-url` 调用 Node AI 引擎（如组件拆分后续生成能力）。
- **上报方向（Node → Java）**：Node 全局拦截器在每次请求完成后，将操作日志 fire-and-forget `POST /api/operation-log` 上报到 `JAVA_BACKEND_URL`（Node 侧环境变量）。
- **前端视角**：Nginx / Vite proxy 把 `/api/admin`、`/api/component-split`、`/api/operation-log`（兜底 `/api`）转发到 8080，其余 `/api/*` 到 13030。

## 本地联调依赖

- **MongoDB**：`mongod` 本地 27017（与 Node 共享库 `langgraph-server`）。
- **Node 后端（13030）**：`mvgo-node` 调用目标；操作日志上报目标（Node 需 `JAVA_BACKEND_URL=http://localhost:8080/api`）。
- **前端（2610）**：经 proxy 访问本服务 `/api/admin` 等。

## Polyrepo 说明

- 根仓库 `mvgo` 记 `backend-java/` 为 gitlink（子模块指针），提交需进本仓库 `mvgo-java` 提交后再更新父指针。
- 无 remote，仅本地提交。
