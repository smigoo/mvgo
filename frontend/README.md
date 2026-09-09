# frontend（感智晓界前端）

mvgo 平台的**用户界面层**，基于 Vue 3 + Vite 的 SPA。承担组件生成（微码 / Vue3 / Lite / Max 多档）、Figma 管线、AI 工作区、预览调试、管理与权限等全部前端交互。

> Polyrepo 架构：父仓库 `mvgo` 统一编排，前端、Node 后端（`backend-node`，端口 13030）、Java 后端（`backend-java`，端口 8080）为三个独立 Git 仓库，经 Nginx（端口 80）统一入口分发。

## 技术栈

| 维度 | 选型 |
|------|------|
| 框架 | Vue 3.5 + Vite 6 |
| UI 组件库 | Ant Design Vue 4.2 |
| 状态管理 | Pinia 2.2（+ pinia-plugin-persistedstate） |
| 路由 | Vue Router 4.4 |
| 样式 | Tailwind CSS 4 + Less（设计 Token 见 `src/assets/styles/variables.less`） |
| 微码能力 | `@microcode/designer`、`@microcode/microcode-framework`、`microvideo-component` |
| 公司框架封装 | `microvideo-request`（平台/门户服务请求层） |

## 环境要求

- **Node.js**：`>=18 <=20`
- **包管理器**：**pnpm**（`>=8 <=10`，见 `package.json` 的 `engines` 与 `pnpm-lock.yaml`）。请勿用 npm/yarn 安装，避免依赖树不一致。

## 快速开始

```bash
# 1. 安装依赖（必须 pnpm）
pnpm install

# 2. 启动开发服务器（默认端口 2610，host 0.0.0.0）
pnpm dev
# 浏览器打开 http://localhost:2610
```

开发服务器依赖本地后端：

- **Node 后端（13030）**：`cd backend-node && bash build-backend.sh && bash .start-server.sh`
- **Java 后端（8080）**：`cd backend-java && mvn clean package -pl mvgo-app -am && java -jar mvgo-app/target/mvgo-app-1.0.0-SNAPSHOT.jar`

> 本地未起后端时，前端代理会返回 500/空响应（属正常，非前端 bug）。dev 环境免登录：`NODE_ENV=development DEV_AUTO_LOGIN=true` 启动 Node 后可免鉴权访问。

## 脚本

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 本地开发（Vite，端口 2610） |
| `pnpm dev:test` / `pnpm dev:pro` | 以 test / production 模式跑 dev |
| `pnpm build` | 生产构建（`vite build --mode production`） |
| `pnpm build:test` | test 环境构建 |
| `pnpm build:safe` | 不清空输出目录的构建（`--emptyOutDir false`） |
| `pnpm preview` | 预览构建产物 |
| `pnpm lint:fix` | ESLint 自动修复 `src/` |
| `pnpm lint:prettier` | Prettier 格式化全量文件 |

## 环境变量

| 文件 | 用途 |
|------|------|
| `.env` | 全局（打包标题 `VITE_DIST_TITLE`） |
| `.env.development` | 开发：`VITE_LANGGRAPH_API='/api'`、`VITE_LANGGRAPH_WS='ws://localhost:13030'` |
| `.env.production` | 生产：`VITE_LANGGRAPH_WS='wss://go.microvideo.cn'` |
| `.env.test` | test 模式 |

## 代理路由（vite.config.js）

开发服务器将 `/api/*` 按前缀转发到对应后端（`proxy` 按声明顺序前缀匹配）：

- **Node 后端（13030）**：`/api/auth`、`/api/group`、`/api/component`、`/api/projects`、`/api/tasks`、`/api/sessions`、`/api/chat`、`/api/skills`、`/api/documents`、`/api/screen-layout`、`/api/workflows`、`/api/phase2`、`/api/vue3`、`/api/preview`、`/api/models`、`/api/config`、`/api/lite` 等
- **Java 后端（8080）**：`/api/admin`、`/api/component-split`（须排在 `/api/component` 之前）、以及未显式列出的**兜底 `/api` → 8080**

### 两套请求层（重要约定）

- `src/core/request.js`：基于公司框架 `microvideo-request`，面向**平台/门户**服务（`{code,message,detail}` 契约，注入 projectId/operatorCode/pageId）。
- `src/core/http.js`：独立 `fetch` 封装，**不依赖公司包**，面向**自研 NestJS `/api/*`** 后端（支持 SSE / blob / FormData）。

两套分工明确，新增接口时按目标服务选择对应封装。

## 目录结构（src/）

```
src/
├── api/            接口定义（按业务模块）
├── assets/        静态资源 + 全局样式（variables.less 为设计 Token 源）
├── components/     通用业务组件
├── composables/   组合式函数
├── config/        运行时配置（devPort=2610 等，见 default-config.js）
├── core/          请求层（request.js / http.js）
├── hooks/         钩子
├── layouts/       布局组件
├── router/        路由表
├── store|stores/  Pinia 状态（store 为旧目录，stores 为活跃目录）
├── types/         类型定义
├── utils/         工具函数 + 自动导入
├── views/         页面级视图
│   ├── login/         登录
│   ├── generator/     组件生成（Vue3）
│   ├── mc-generator/  微码生成
│   ├── lite/          Lite 档
│   ├── pipeline-lab/  Figma 管线实验室
│   ├── preview/       预览调试
│   ├── admin/         管理与权限
│   ├── tasks/         任务中心
│   ├── workspace/     工作区
│   └── ...
└── workspace/      运行时生成的组件产物（Playground 实时写回，已被 Vite watch 忽略）
```

## 代码规范

- ESLint + Prettier（配置继承 `scaffold-config/.eslint-global-variables.json`）。
- `unplugin-auto-import` 自动导入 `vue / pinia / vue-router` 及 `src/store/modules`、`src/utils/auto-import` 下的 API（声明见 `scaffold-config/auto-imports.d.ts`、`components.d.ts`）。
- 组件 class 命名规范：`c-{语义名}`（禁止使用组件 ID 作前缀）。

## 常见问题

- **dev 启动后页面接口 500**：后端未起或被沙箱回收，重启对应后端进程即可（Node 约 6min 会被回收一次）。
- **改了后端接口但前端读不到字段**：Node 后端经全局拦截器统一返回 `data.xxx` 嵌套信封，前端消费点需读 `res.data.xxx`（兼容式信封下 `res.xxx` 与 `res.data.xxx` 双读法均可用）。
- **`pnpm install` 失败**：确认 Node 在 18–20、pnpm 在 8–10，避免混用 npm。

## 相关仓库

- `backend-node/`：NestJS + LangGraph + AI 引擎（Figma 管线、微码/Vue3 生成、SSE），端口 13030
- `backend-java/`：Spring Boot 3.2 业务 CRUD、权限、数据管理，端口 8080
- `docs/`：技术文档、架构设计、API 契约
