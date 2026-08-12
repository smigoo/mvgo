# QS 门户权限中心对接契约与映射方案

> 模块：`backend-node/src/auth/qs-permission-adapter.ts`
> 状态：**已实现并编译通过，默认未启用（PERMISSION_SOURCE=node）**
> 日期：2026-08-07

## 1. 目标与边界

迁移到 QS 门户后，**权限真相源放在门户侧**，本系统不维护第二套权限库（避免与门户组织/角色双写漂移）。`QSPermissionAdapter` 通过 HTTP 调门户"用户权限"接口拿到门户权限码，映射成本系统的 `resource:action` 权限码，并缓存。

业务代码（Guard / Controller / 前端）只依赖 `PermissionAdapter` 抽象接口，**零改动即可切换数据源**：

| 组件 | 依赖 | 切换影响 |
|---|---|---|
| `PermissionsGuard` | `PermissionAdapter.checkPermission` | 无 |
| `AuthController.getCurrentUser` | `PermissionAdapter.getUserPermissions` | 无 |
| 前端按钮显隐 | `/api/auth/current` 返回的 `permissions` | 无 |

## 2. 架构位置

```
SessionGuard（身份:谁）
      ↓ userId
PermissionsGuard（授权:能干啥）
      ↓
PermissionAdapter（接口）
   ├── NodePermissionAdapter    ← 默认，查本地 GroupMember
   └── QSPermissionAdapter      ← PERMISSION_SOURCE=qs 时启用，查门户权限中心
```

切换在 `auth.module.ts` 一行 env 决定：
```ts
const permissionAdapterProvider =
  process.env.PERMISSION_SOURCE === 'qs'
    ? { provide: PermissionAdapter, useClass: QSPermissionAdapter }
    : { provide: PermissionAdapter, useClass: NodePermissionAdapter };
```

## 3. 门户权限接口契约（HTTP）

**请求**
```
GET {PORTAL_BASE_URL}/getUserAuths?{PORTAL_PERMISSION_UID_PARAM}={uid}
（权限中心地址由 PORTAL_BASE_URL 自动拼接为 `${PORTAL_BASE_URL}/getUserAuths`，兼容旧键 PORTAL_PERMISSION_URL）
Authorization / Token: 复用门户 token（如门户需要）
```
- `uid` 来源：本系统 `User.portalInfo.uid`（登录时由门户 token 校验响应写入）。
- 默认 `PORTAL_PERMISSION_UID_PARAM=uid`，可按门户实际参数名覆盖。
- 超时 5s。

**响应解析（宽松兼容，无需门户严格对齐）**

适配器从响应中按以下优先级提取权限码数组：
```
data.data.auths[] | data.data.list[] | data.data.permissions[] | data.data[] | data.auths[] | data[]
每个元素取 .code（或字符串本身）
```
兼容形态示例：
```json
{ "code": 200, "data": { "auths": [ { "code": "pl-co1de", "name": "统计查询" } ] } }
{ "code": 200, "data": [ { "code": "qs00001" } ] }
```

## 4. 门户码 → 系统码映射方案

本系统权限码格式为 `resource:action`（见 `permission.constants.ts`）：
`component:create/read/update/delete`、`project:*`、`group:*`。

| 配置项 | 作用 | 示例 |
|---|---|---|
| `QS_ADMIN_CODES` | 命中任一门户码即视为 admin，返回全部权限 | `qs-admin,admin` |
| `QS_PERMISSION_MAPPING` | JSON：门户码 → 系统码（串或数组），`*` 通配 | `{"pl-co1de":["component:read"],"qs00001":["component:create","component:read"]}` |
| `QS_DEFAULT_PERMISSIONS` | 给所有门户登录用户的默认权限（如只读） | `component:read` |

**映射判定顺序**（每次 `getUserPermissions`）：
1. 提取门户码数组 → 逐个匹配 `QS_ADMIN_CODES`，命中即 `role=admin` + 全部权限。
2. 否则按 `QS_PERMISSION_MAPPING`（含 `*` 通配）+ `QS_DEFAULT_PERMISSIONS` 收集系统权限码。
3. 返回 `{ role, permissions }`。

> 注意：dev-config 的 `getUserAuths` 是**菜单级码**（`pl-co1de`/`qs00001`），与本系统 `resource:action` 码无直接对应。启用 qs 前必须由你确认门户返回的"用户权限"接口语义，并通过 `QS_PERMISSION_MAPPING` 明确映射，否则门户用户权限可能为空。

## 5. 缓存策略

内存 `Map<userId, {exp, data}>`，TTL 由 `QS_PERMISSION_CACHE_TTL`（秒，默认 300）控制。
- 缓存命中直接返回，避免每次请求打门户。
- `checkPermission` 复用 `getUserPermissions` 的缓存。
- 本地兜底结果同样进缓存。

## 6. 失败兜底（fail-safe）

以下情况自动回落到本地 `GroupMember`（与 `NodePermissionAdapter` 行为一致），**保证可用性而非拒绝服务**：
1. 用户无门户 `uid`（`portalInfo.uid` 为空，如本地注册账号、开发态用户）；
2. `PORTAL_BASE_URL` / `PORTAL_PERMISSION_URL` 均未配置；
3. 门户接口调用失败（网络/超时/解析错误）。

因此：即便切换到 qs 模式但门户未就绪，**系统仍可正常登录与鉴权**（走本地私人组 admin）。

## 7. 启用步骤

1. 在 `.env`（或 `.env.production`）确认门户 API 基准地址 `PORTAL_BASE_URL`；
2. 设置：
   ```env
   PERMISSION_SOURCE=qs
   # 权限中心地址由 PORTAL_BASE_URL 自动拼接为 ${PORTAL_BASE_URL}/getUserAuths
   PORTAL_BASE_URL=https://go.microvideo.cn/portlet/api
   QS_ADMIN_CODES=qs-admin
   QS_PERMISSION_MAPPING={"pl-co1de":["component:read"],"qs00001":["component:create","component:read"]}
   QS_DEFAULT_PERMISSIONS=component:read
   QS_PERMISSION_CACHE_TTL=300
   ```
3. 重启后端。验证 `/api/auth/current` 返回的预期 `permissions`。

## 8. 当前状态与待确认项

- ✅ `QSPermissionAdapter` 已实现、编译通过、可经 `PERMISSION_SOURCE=qs` 注入。
- ✅ 运行时验证：qs 模式（未配 url）fallback 正常，dev 用户仍 `admin/11` 权限，不崩。
- ⏸ 默认仍为 `node`（`.env` 中 `PERMISSION_SOURCE` 保持注释），生产暂不强切。
- ⏳ **待你确认**：门户"用户权限"接口的真实契约（地址 / 返回形态 / 权限码语义），以及期望的门户角色→系统权限映射表。拿到后可一步启用 qs 并删除本地 `GroupMember` 权限写入依赖（保留私人组仅用于组件数据隔离）。
