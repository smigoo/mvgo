# BACKEND-DESIGN.md —— 后端设计（草稿 v0.1 · S0 骨架）

> 生成器 `s0-scan.cjs`｜2026-11-04T16:16:23Z｜项目根 `/Users/smigoo/工作/test`
> **当前形态 = S0 骨架**：5 章结构由扫描器钉死，**事实**（基座现有包 / 类 / 配置）已填，**设计**（表结构 / 落点 / 事务口径）留白 —— 由 S5 的 `backend-engineer` 回填（表结构源头在 S2 的 `contract-freezer`），回填后去掉 `.draft`。
> **字段级真值只在契约（`openapi.local.yaml`）里**，本文只写 JSON Pointer 引用与落点。
> 素材指纹见 `REQUIREMENTS.draft.md` §7 —— 同一轮扫描同一份指纹，此处**不复制**。

> **本期技术栈口径：只做 Java（Spring Boot）** —— 由已裁决项确定。非 Java 基座不纳入本文件。

## 1. 包结构

### 1.1 基座现有包（事实 · 由 java 文件路径派生）

- `cn.microvideo.mvsc`
- `cn.microvideo.mvsc.config`
- `cn.microvideo.mvsc.controller`
- `cn.microvideo.mvsc.entity`
- `cn.microvideo.mvsc.mapper`

### 1.2 分层归类（事实）

| 层 | 文件数 | 文件 |
|---|---|---|
| 启动类 | 0 | — |
| Controller | 1 | `XxlJobController.java` |
| Service | 0 | — |
| Mapper | 1 | `XxlJobMapper.java` |
| Entity / Domain | 1 | `XxlJob.java` |
| Config | 1 | `MybatisPlusConfig.java` |
| 异常 / 全局处理 | 0 | — |

### 1.3 建议新增包（**留白，S5 回填**）

> 新增包的命名要跟基座已有风格一致（上表就是风格事实）。包名一旦定下就写进这里，别在代码里另起一套。

| 包 | 职责 |
|---|---|
| *(S5 回填)* | — |

## 2. 表结构 DDL

> 表结构是**契约（实体）的投影**，源头在 S2 的 `contract-freezer`。扫描器不解析需求文档里的字段语义 ⇒ 本节留空是**如实**。
> S2 交付物应为 `ddl/*.sql`（可重复执行：`CREATE TABLE IF NOT EXISTS` + 索引显式命名），本节只写「表 → 契约指针」的索引。

> ⚠️ **禁止由后端工程师凭空设计表结构** —— 那会让 DDL 与契约各说一套。

| # | 表名 | 契约指针 | DDL 文件 |
|---|---|---|---|
| — | *(S2 回填)* | — | — |

## 3. entity / service / controller 落点

### 3.1 基座现有 Controller（事实）

| Controller | 抽到的端点数 |
|---|---|
| `backend/03-microvideo-framework3.x-lite-example-master/src/main/java/cn/microvideo/mvsc/controller/XxlJobController.java` | 2 |

> 端点明细（含行号与原文）见 `spec/endpoints.json` 的 `fullEvidence.backend`。

### 3.2 端点 → 落点（**待 S5 回填**）

> **置信度一栏直接决定落点策略**：`partial`（仅后端有实现）= 基座已存在，S5 是**改造**；`candidate`（仅原型/仅前端）= 后端全无，S5 是**新建**。两者工作量与风险不同，不得混在一张待办里。

| # | 端点 | 方法 | 置信度 | Controller | Service | Entity | 类型 |
|---|---|---|---|---|---|---|---|
| 1 | `/api/bridge/traffic/query` | ANY | candidate | *(S5 定)* | *(S5 定)* | *(S5 定)* | 新建 |
| 2 | `/api/etc/transactions/query` | ANY | candidate | *(S5 定)* | *(S5 定)* | *(S5 定)* | 新建 |
| 3 | `/api/province/gantry/traffic/query` | ANY | candidate | *(S5 定)* | *(S5 定)* | *(S5 定)* | 新建 |
| 4 | `/api/toll/entry/query` | ANY | candidate | *(S5 定)* | *(S5 定)* | *(S5 定)* | 新建 |
| 5 | `/api/toll/exit/query` | ANY | candidate | *(S5 定)* | *(S5 定)* | *(S5 定)* | 新建 |
| 6 | `/api/toll/lanes/traffic/query` | ANY | candidate | *(S5 定)* | *(S5 定)* | *(S5 定)* | 新建 |
| 7 | `/api/trajectory/query` | ANY | candidate | *(S5 定)* | *(S5 定)* | *(S5 定)* | 新建 |
| 8 | `/api/vehicles/mileage/query` | ANY | candidate | *(S5 定)* | *(S5 定)* | *(S5 定)* | 新建 |
| 9 | `/api/weather/observations/query` | ANY | candidate | *(S5 定)* | *(S5 定)* | *(S5 定)* | 新建 |
| 10 | `/nhu-dp-show/api/fuwuyun/getCaiYunWeatherData` | GET | candidate | *(S5 定)* | *(S5 定)* | *(S5 定)* | 新建 |
| 11 | `/test/byId` | GET | partial | *(S5 定)* | *(S5 定)* | *(S5 定)* | 改造 |
| 12 | `/test/cache` | GET | partial | *(S5 定)* | *(S5 定)* | *(S5 定)* | 改造 |

> 每个端点必须回填到「契约 `paths` 里的 operationId / 落点类名」两处，缺一不可 —— 只有类名没契约指针，等于没接进契约体系。

## 4. 基座接入点（改哪个文件）

| 角色 | 文件 | 判据 | 是否必然改动 |
|---|---|---|---|
| 配置类 | `backend/03-microvideo-framework3.x-lite-example-master/src/main/java/cn/microvideo/mvsc/config/MybatisPlusConfig.java` | 文件名 `*Config*.java` | 视数据源 / 拦截器 / 序列化 |
| 应用配置 | `backend/03-microvideo-framework3.x-lite-example-master/src/main/resources/application.yml` | 文件名特征 `application.*` / `bootstrap.*` | 视数据源与外部系统 |

> 🔴 **基座无异常 / 全局处理类**（未见 `*Advice*` / `*Exception*` / `*Handler*.java`）⇒ 信封口径**无既有宿主**，必须新建一个（`@RestControllerAdvice` + 统一返回体），而不是散在各个 Controller 里。这条是结论、有判据，S5 若不同意须给出反例文件。

> ⚠️ **信封口径必须落在「异常 / 全局处理」这一层**（`@ControllerAdvice` / 统一返回体），不要每个 Controller 各包一次。当前口径见 `spec/project.manifest.json` 的 `S1.envelope`。

## 5. 事务与异常口径

### 5.1 基座现有事实（内容特征扫，非文件名）

| 特征 | 命中文件数 | 说明 |
|---|---|---|
| `@Transactional` | 0 | **基座无既有事务口径** ⇒ 新代码的事务边界与回滚规则需先裁决 |
| `@ControllerAdvice` / `@ExceptionHandler` | 0 | **基座无全局异常处理** ⇒ 信封口径要新建宿主，禁止各 Controller 自包 |

> 🔴 命中为 0 的那一项意味着基座没有既有口径 ⇒ 该口径需由人裁决后写入 `spec/decisions.md`，不得由 S5 自作主张（两个工程师会写出两套）。

### 5.2 新代码口径（**留白，人裁决 + S5 回填**）

| 项 | 口径 | 依据 |
|---|---|---|
| 事务边界 | *(待定)* | — |
| 回滚规则 | *(待定)* | — |
| 异常 → 信封映射 | *(待定)* | 须与 `S1.envelope.source` 一致：`detected-未证实`（**待追认**，追认前不得据此写死） |

> 本节的每一条定下来后，都应有一条对应的可执行断言（否则口径只活在文档里）。

---

复现：`node outputs/s0-scan.cjs /Users/smigoo/工作/test --out /Users/smigoo/工作/mvgo/outputs/2026-11-04-s0-scan`
