# REQUIREMENTS.md —— 前后端需求唯一源（草稿 v0.1 · 自动生成）

> 生成器 `s0-scan.cjs`｜2026-11-04T15:57:33Z｜项目根 `/Users/smigoo/工作/test`
> **本文件是契约（OAS）的第 1 种视图，不是新真值。字段级真值只在契约里；本文只写 JSON Pointer 引用与落点。**

## 0. 项目坑位（S0 识别结果）

| 坑位 | 状态 | 依据 |
|---|---|---|
| `docs/**` | ✅ 1 个文件 | 唯一必需项 |
| `html/**` | ✅ 5 页 | echarts / vue.global 全局包存在 ⇒ 判定为「可运行原型」而非设计稿 |
| `frontend/**` | ✅ vite 工程 ⇒ 可作为 S4 落点 | 特征：vite |
| `backend/**` | ✅ spring-boot 工程 ⇒ 可作为 S5 落点 | 特征：spring-boot |
| `mvgo.project.json` | 🔴 缺失 | 外链 / 口径 / 交付分支声明 |
| `.git` | ✅ 单仓 | frontend/vue3-vite-base |

## 1. 端点清单（12 条）

> 置信度口径：`high` = ≥2 源交叉命中；`declared` = 仅需求文档声明；`partial` = 仅后端有实现；`candidate` = 仅原型/仅前端，**未交叉验证**。

| # | 路径 | 方法 | 来源 | 置信度 | 标记 | 字段落点 |
|---|---|---|---|---|---|---|
| 1 | `/api/bridge/traffic/query` | ANY | prototype | candidate | prototypeOnly-未交叉验证 | *(JSON Pointer 占位)* |
| 2 | `/api/etc/transactions/query` | ANY | prototype | candidate | prototypeOnly-未交叉验证 | *(JSON Pointer 占位)* |
| 3 | `/api/province/gantry/traffic/query` | ANY | prototype | candidate | prototypeOnly-未交叉验证 | *(JSON Pointer 占位)* |
| 4 | `/api/toll/entry/query` | ANY | prototype | candidate | prototypeOnly-未交叉验证 | *(JSON Pointer 占位)* |
| 5 | `/api/toll/exit/query` | ANY | prototype | candidate | prototypeOnly-未交叉验证 | *(JSON Pointer 占位)* |
| 6 | `/api/toll/lanes/traffic/query` | ANY | prototype | candidate | prototypeOnly-未交叉验证 | *(JSON Pointer 占位)* |
| 7 | `/api/trajectory/query` | ANY | prototype | candidate | prototypeOnly-未交叉验证 | *(JSON Pointer 占位)* |
| 8 | `/api/vehicles/mileage/query` | ANY | prototype | candidate | prototypeOnly-未交叉验证 | *(JSON Pointer 占位)* |
| 9 | `/api/weather/observations/query` | ANY | prototype | candidate | prototypeOnly-未交叉验证 | *(JSON Pointer 占位)* |
| 10 | `/nhu-dp-show/api/fuwuyun/getCaiYunWeatherData` | GET | frontend | candidate | outsideDeclaredPrefix(/api)<br>frontendOnly-疑似模板示例 | *(JSON Pointer 占位)* |
| 11 | `/test/byId` | GET | backend | partial | outsideDeclaredPrefix(/api)<br>backendOnly | *(JSON Pointer 占位)* |
| 12 | `/test/cache` | GET | backend | partial | outsideDeclaredPrefix(/api)<br>backendOnly | *(JSON Pointer 占位)* |

## 2. 端点来源缺口

🔴 **需求文档未提供任何接口路径** —— 上表全部端点的 `sources` 均不含 `doc`。

这意味着 S2 的第五处对账（`REQUIREMENTS.md` 端点 ↔ 契约 `paths` 双向差集为空）在**当前素材上无法成立**，因为「文档侧集合」是空的。
必须先由用户裁决（见 `spec/conflicts.md` 的 `CF-DOC-ZERO-ENDPOINT`）。

## 3. 功能条目（待人工从文档补全）

> 扫描器不做语义摘要（那是 LLM 的活，S2 阶段由 `requirements-writer` role 生成）。本文件此节留空，等待角色回填。

## 4. 待裁决冲突

见 `spec/conflicts.md`。本文件不复制冲突内容，避免两处真值。
