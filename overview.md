# QS 门户 Token 鉴权集成 — 已落地

## 接口契约（已确认）

```http
GET https://go.microvideo.cn/portlet/api/getTokenUser?token=AT-xxxxx
```

响应：

```json
{
  "code": 200,
  "message": "查询到用户信息成功",
  "data": {
    "uid": "shitianliang",
    "account": "shitianliang",
    "name": "史天亮",
    "expirise": 28800,
    "deptName": "桥隧研发部",
    "orgName": "感动科技",
    "...": "..."
  }
}
```

- 域名：与应用同源 `go.microvideo.cn`
- Token 有效期：`data.expirise = 28800` 秒（8 小时）
- 过期后：portal 会刷新 iframe 并注入新 token

---

## 已完成的改动

### 1. 后端 token 校验 — `backend-node/src/auth/auth.service.ts`

- 调用方式从 `Authorization: Bearer` 改为 **query token**：`?token=xxx`
- 按 QS 响应解析：
  - `uid = data.uid`
  - `username = data.account || data.uid`
  - `displayName = data.name`
  - `expiresInSeconds = data.expirise`
- 首次登录自动在 MongoDB 建本地用户（`uid` 字段索引，密码随机）
- 非首次登录更新 `portalInfo` 快照
- 返回 `{ user, expiresInSeconds }`，供 SessionGuard 写入过期时间

### 2. Session 过期校验 — `backend-node/src/auth/session.guard.ts`

- session 中新增 `tokenExpiresAt`
- 每次请求：
  - 若 `Date.now() < tokenExpiresAt`：直接放行
  - 若已过期：继续用 header 里的新 token 重新校验
  - 无新 token 或校验失败：抛 401

这样 portal token 过期后，前端会收到 401，触发 `window.parent.location.reload()`，portal 刷新后重新带新 token 进入。

### 3. 生产环境 cookie 安全 — `backend-node/src/main.ts`

- 生产环境 `NODE_ENV=production` 时：
  - `app.set('trust proxy', 1)` — Nginx 反向代理后识别 HTTPS
  - `cookie.secure = true` — 只允许 HTTPS 传输 session cookie
- 开发环境保持 `secure: false`

### 4. 生产配置 — `backend-node/.env.production`

新增：

```bash
PORTAL_TOKEN_VERIFY_URL=https://go.microvideo.cn/portlet/api/getTokenUser
```

---

## 前端行为（无需改动）

- `frontend/src/store/modules/user.js`：初始化时从 `window.parent.getToken()` 取 token
- `frontend/src/core/request.js`：每次请求把 token 注入 header `Token: xxx`
- 401 时调用 `portletUtils.isPermission(1)` → `window.parent.location.reload()`

---

## 验证结果

- `bash build-backend.sh`：tsc 无 error，dist 116 个 JS 全同步
- 服务已重启：PID `81335`，端口 `13030` 正常监听
- 本地开发环境注意：`.start-server.sh` 固定 `NODE_ENV=development`，不会加载 `.env.production`

---

## 下一步

1. **生产部署**：把最新 `dist/` 和 `.env.production` 同步到阿里云 ECS，重启 Node 后端。
2. **本地 iframe 测试（可选）**：若想在本地 `localhost:2610` 测试 portal 登录，把 `PORTAL_TOKEN_VERIFY_URL=https://go.microvideo.cn/portlet/api/getTokenUser` 也写入 `backend-node/.env.development`，然后重启。
3. **实测**：在门户 iframe 里访问应用，确认：
   - 首次进入自动建号登录，不再跳 `/login`
   - 8 小时后 portal 刷新 iframe，应用拿到新 token 继续无感使用
