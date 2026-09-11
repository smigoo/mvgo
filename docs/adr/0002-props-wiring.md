# 0002-props 接线与 declare.json 契约

- **状态**：Accepted
- **日期**：2026-09-11

## 决策

组件的对外 props / 业务事件 / 状态契约以 `declare.json`（`declare.componentId` + businessConfig）为**单一事实源**；
前端 `ApiBindingWizard` 绑定数据 slot 时，通过后端 `GET /operation/device/monitor` 等 device monitor API 与
Apifox 目录绑定，把「数据 slot ↔ 后端 API 端点」映射写回契约，不做 fake toggle。

## 背景 / 动机

- 组件生成页（components.vue v4）与接口生成页（GenerateApiView.vue）视觉/输出需对齐；数据 slot 绑定若靠前端硬编码 mock，会出现「接了假开关」的 fake toggle（用户明确拒绝）。
- declare.json 若与模板实际引用的 slot/状态不一致 → 运行时数据不显示、绑定向导落空。

## 方案与理由

- **单一事实源**：declare.json 是组件对外契约的唯一出处；模板引用的每个 slot / 业务状态必须在 declare 有对应声明（语义门禁 + CODE-0XX 兜底）。
- **绑定落点**：ApiBindingWizard 把「Apifox 目录 + device monitor API（`GET /operation/device/monitor`）」绑定到数据 slot，端点删除走 `/api/apifox/tasks/:taskId/delete`；所有交互直连后端，不做本地假数据。
- **否决替代**：前端写死 mock 数据 → fake toggle、行为不可追溯；已拒绝。

## 影响面（当前）

- `frontend/.../ApiBindingWizard.vue` / `ApiCatalogDetail.vue` / `GenerateApiView.vue`
- `backend` device monitor API、`/api/apifox/tasks/:taskId/delete`
- P5 requirementDoc 闭环：后端 DTO/service ↔ 前端绑定向导端到端

## 后果

- 正面：绑定行为可追溯、与后端真实连通。
- 负面：绑定向导依赖后端 API 可用性（后端未起时向导降级为只读）。
- 债务：props 接线反转类变更（如重命名 slot）须同步 declare.json + 绑定向导 + spec，走「影响面清单」。
