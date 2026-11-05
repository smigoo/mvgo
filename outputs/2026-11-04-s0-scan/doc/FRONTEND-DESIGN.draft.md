# FRONTEND-DESIGN.md —— 前端设计（草稿 v0.1 · S0 骨架）

> 生成器 `s0-scan.cjs`｜2026-11-04T16:16:23Z｜项目根 `/Users/smigoo/工作/test`
> **当前形态 = S0 骨架**：5 章结构由扫描器钉死，**事实**（基座现有文件）已填，**设计**（目标页面 / 组件 / 落点）留白 —— 由 S4 的 `frontend-designer` 回填，回填后去掉 `.draft`。
> **字段级真值只在契约（`openapi.local.yaml`）里**，本文只写 JSON Pointer 引用与落点。
> 素材指纹见 `REQUIREMENTS.draft.md` §7 —— 同一轮扫描同一份指纹，此处**不复制**（复制即第二个真值）。

## 1. 页面清单 ↔ 路由表

### 1.1 原型侧页面（事实）

| # | 原型页面 | 字节 |
|---|---|---|
| 1 | `html/模块1/云资源监测.html` | 203409 |
| 2 | `html/模块1/数据安全审计.html` | 244210 |
| 3 | `html/模块1/服务概览.html` | 20020 |
| 4 | `html/模块1/本地资源监测.html` | 310858 |
| 5 | `html/模块1/调用日志.html` | 13349 |

### 1.2 基座侧现有路由（事实）

| # | 路由文件 | 字节 |
|---|---|---|
| 1 | `frontend/vue3-vite-base/src/router/basic-routes.js` | 170 |
| 2 | `frontend/vue3-vite-base/src/router/index.js` | 366 |
| 3 | `frontend/vue3-vite-base/src/router/permission.js` | 426 |

**路由装配线索（原文，未做解释）**

| 位置 | 原文 |
|---|---|
| `frontend/vue3-vite-base/src/router/index.js:1` | `import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router'` |
| `frontend/vue3-vite-base/src/router/index.js:2` | `import { basicRoutes } from './basic-routes'` |
| `frontend/vue3-vite-base/src/router/index.js:4` | `export const router = createRouter({` |
| `frontend/vue3-vite-base/src/router/index.js:5` | `history: $config.routerMode === 'history' ? createWebHistory() : createWebHashHistory(),` |
| `frontend/vue3-vite-base/src/router/index.js:6` | `routes: basicRoutes,` |
| `frontend/vue3-vite-base/src/router/permission.js:10` | `router.beforeEach(async () => {` |
| `frontend/vue3-vite-base/src/router/permission.js:15` | `router.afterEach(() => {` |

### 1.3 映射（**留白，S4 回填**）

> 原型页面名 ≠ 路由 path ≠ 组件文件名 —— 三者之间是**设计决策**，不是字符串变换。自动映射出来的东西看着像结论，实际是猜的，所以这里留空。

| # | 原型页面 | 目标路由 path | 目标组件文件 | 备注 |
|---|---|---|---|---|
| 1 | `云资源监测.html` | *(S4 定)* | *(S4 定)* | |
| 2 | `数据安全审计.html` | *(S4 定)* | *(S4 定)* | |
| 3 | `服务概览.html` | *(S4 定)* | *(S4 定)* | |
| 4 | `本地资源监测.html` | *(S4 定)* | *(S4 定)* | |
| 5 | `调用日志.html` | *(S4 定)* | *(S4 定)* | |

> 回填完成后，本节每个 path 必须与 S4 实际写入的路由表**逐字一致**；不一致即视为设计漂移。

## 2. 组件树（只到文件级）

### 2.1 基座现有组件（事实 · 供判断「复用 or 新建」）

**`src/components/`（2）**

- `frontend/vue3-vite-base/src/components/TsDemo.vue`
- `frontend/vue3-vite-base/src/components/base-components/svg-icon/index.vue`

**`src/views/`（1）**

- `frontend/vue3-vite-base/src/views/home/index.vue`

**`src/layouts/`（0）**

- *(无)*

### 2.2 目标组件树（**留白，S4 回填**）

> 骨架只到**文件级**（`路径 → 职责一句话`），不到 props / 事件级 —— 那是代码的事，写在设计文档里必然与代码漂移。

| 文件 | 职责 | 复用自 |
|---|---|---|
| *(S4 回填)* | — | — |

## 3. api 层组织

### 3.1 基座现有 api 文件（事实）

- `frontend/vue3-vite-base/src/api/test.js`

**状态层（事实）**：`frontend/vue3-vite-base/src/store/index.js`、`frontend/vue3-vite-base/src/store/modules/index.js`、`frontend/vue3-vite-base/src/store/modules/user.js`

### 3.2 端点 → api 落点（**待 S4 定名**）

> 端点清单来自 S1（12 条）。**「建议文件」一栏是待填位，不是建议值** —— 扫描器不知道你们的 api 层是按模块分文件还是按页面分文件。

| # | 端点 | 方法 | 置信度 | 建议 api 文件（S4 定） | 契约指针 |
|---|---|---|---|---|---|
| 1 | `/api/bridge/traffic/query` | ANY | candidate | *(S4 定)* | `openapi.local.yaml#/paths/~1api~1bridge~1traffic~1query` |
| 2 | `/api/etc/transactions/query` | ANY | candidate | *(S4 定)* | `openapi.local.yaml#/paths/~1api~1etc~1transactions~1query` |
| 3 | `/api/province/gantry/traffic/query` | ANY | candidate | *(S4 定)* | `openapi.local.yaml#/paths/~1api~1province~1gantry~1traffic~1query` |
| 4 | `/api/toll/entry/query` | ANY | candidate | *(S4 定)* | `openapi.local.yaml#/paths/~1api~1toll~1entry~1query` |
| 5 | `/api/toll/exit/query` | ANY | candidate | *(S4 定)* | `openapi.local.yaml#/paths/~1api~1toll~1exit~1query` |
| 6 | `/api/toll/lanes/traffic/query` | ANY | candidate | *(S4 定)* | `openapi.local.yaml#/paths/~1api~1toll~1lanes~1traffic~1query` |
| 7 | `/api/trajectory/query` | ANY | candidate | *(S4 定)* | `openapi.local.yaml#/paths/~1api~1trajectory~1query` |
| 8 | `/api/vehicles/mileage/query` | ANY | candidate | *(S4 定)* | `openapi.local.yaml#/paths/~1api~1vehicles~1mileage~1query` |
| 9 | `/api/weather/observations/query` | ANY | candidate | *(S4 定)* | `openapi.local.yaml#/paths/~1api~1weather~1observations~1query` |
| 10 | `/nhu-dp-show/api/fuwuyun/getCaiYunWeatherData` | GET | candidate | *(S4 定)* | `openapi.local.yaml#/paths/~1nhu-dp-show~1api~1fuwuyun~1getCaiYunWeatherData` |
| 11 | `/test/byId` | GET | partial | *(S4 定)* | `openapi.local.yaml#/paths/~1test~1byId` |
| 12 | `/test/cache` | GET | partial | *(S4 定)* | `openapi.local.yaml#/paths/~1test~1cache` |

### 3.3 请求封装（事实 · 基座接入点）

- `frontend/vue3-vite-base/src/core/request.js` —— 统一请求封装候选（文件名特征命中，**未读内容判定**）

## 4. 基座接入点（改哪个文件）

> 本节是**事实清单**：这些文件按「文件名特征」被识别为可能的接入点，每条都给了判据。「是否必然改动」一栏是判断，S4 若不同意须写明理由并改本表。

| 角色 | 文件 | 判据（短标签） | 是否必然改动 |
|---|---|---|---|
| 应用入口 | `frontend/vue3-vite-base/src/App.vue` | 文件名 `main.*` / `App.vue` | 必然 |
| 应用入口 | `frontend/vue3-vite-base/src/main.js` | 文件名 `main.*` / `App.vue` | 必然 |
| 路由注册 | `frontend/vue3-vite-base/src/router/basic-routes.js` | 路径 `src/router/**` | 必然 |
| 路由注册 | `frontend/vue3-vite-base/src/router/index.js` | 路径 `src/router/**` | 必然 |
| 路由注册 | `frontend/vue3-vite-base/src/router/permission.js` | 路径 `src/router/**` | 必然 |
| 路由守卫 / 鉴权 | `frontend/vue3-vite-base/src/router/permission.js` | 文件名 `permission` / `guard` / `auth` | 视鉴权需求 |
| 请求封装 / 拦截器 | `frontend/vue3-vite-base/src/core/request.js` | 文件名 `request` / `axios` / `http` | 必然（信封口径要落这里） |
| 构建 / 环境配置 | `frontend/vue3-vite-base/.env` | 文件名 `vite.config` / `package.json` / `.env*` / `src/config/**` | 视代理与环境变量 |
| 构建 / 环境配置 | `frontend/vue3-vite-base/.env.development` | 文件名 `vite.config` / `package.json` / `.env*` / `src/config/**` | 视代理与环境变量 |
| 构建 / 环境配置 | `frontend/vue3-vite-base/.env.production` | 文件名 `vite.config` / `package.json` / `.env*` / `src/config/**` | 视代理与环境变量 |
| 构建 / 环境配置 | `frontend/vue3-vite-base/.env.test` | 文件名 `vite.config` / `package.json` / `.env*` / `src/config/**` | 视代理与环境变量 |
| 构建 / 环境配置 | `frontend/vue3-vite-base/package.json` | 文件名 `vite.config` / `package.json` / `.env*` / `src/config/**` | 视代理与环境变量 |
| 构建 / 环境配置 | `frontend/vue3-vite-base/src/config/custom-config.js` | 文件名 `vite.config` / `package.json` / `.env*` / `src/config/**` | 视代理与环境变量 |
| 构建 / 环境配置 | `frontend/vue3-vite-base/src/config/default-config.js` | 文件名 `vite.config` / `package.json` / `.env*` / `src/config/**` | 视代理与环境变量 |
| 构建 / 环境配置 | `frontend/vue3-vite-base/src/config/index.js` | 文件名 `vite.config` / `package.json` / `.env*` / `src/config/**` | 视代理与环境变量 |
| 构建 / 环境配置 | `frontend/vue3-vite-base/vite.config.js` | 文件名 `vite.config` / `package.json` / `.env*` / `src/config/**` | 视代理与环境变量 |

> ⚠️ **信封口径必须落在「请求封装」这一层**，不要在每个 api 文件里各写一遍 —— 那是 12 处一致性问题，会变成 12 个真值。

## 5. 枚举值引用（指向契约）

> 扫描器**不解析枚举**（枚举是从需求文档语义抽取的，属 S2 的 `contract-freezer`）。
> 本节留空是**如实**：填上任何枚举名都是编的。S4 回填口径 = 枚举名 → `openapi.local.yaml#/components/schemas/<Name>`，并标明前端从哪里读（常量文件 / 契约生成）。

| # | 枚举 | 契约指针 | 前端读取位置 |
|---|---|---|---|
| — | *(S4 回填)* | — | — |

---

复现：`node outputs/s0-scan.cjs /Users/smigoo/工作/test --out /Users/smigoo/工作/mvgo/outputs/2026-11-04-s0-scan`
