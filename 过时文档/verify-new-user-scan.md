# 新用户扫码验收 Checklist（坑 #12：门户用户自动建号）

> 目的：验证「全新门户用户首次扫码进 mvgo 报 401『用户不存在』+ 一直回跳」已通过 Java 新 jar 修复。
> 根因回顾：Java `SessionAuthService.authenticate` 迁移时漏了 Node `findOrCreateByPortalToken` 的 upsert 建号；新 jar 已补 `upsertPortalUser` + `GroupService.ensureUserPrivateGroup`。Node 端本就有建号逻辑，未传 Node 不影响本 bug。

## 前置（部署侧已确认）

- [ ] Java 新 jar 部署完成，`/api/health` 返回 ok（PID 1556054，已确认）
- [ ] jar 含修复：`size=91184519`、sha256=`d3ea84d0c4b3a4faa7927def710fc884f0453d42a389200bab1e379d08467506`
- [ ] Node 未传（**不影响本 bug**：Node 本就有自动建号，回归只在 Java 侧）

## 验收步骤

1. **准备账号**：找一个**从未登录过 mvgo** 的企业微信 / 门户用户（请同事用没进过系统的号，别用你自己已建过号的号）。
2. **扫码进入**：从门户 / 企业微信扫码进 `https://go.microvideo.cn/portlet/?childRoute=/mvgo/...`
3. **前端观察**：
   - [ ] 不弹红色 toast「用户不存在」
   - [ ] 浏览器不疯狂回跳（地址栏稳定，不再反复 reload）
   - [ ] 正常进入 mvgo 首页
4. **后端日志（ECS 上）**：
   ```bash
   tail -f /home/mvbt/mvgo/backend-java/java.log
   ```
   - [ ] 应出现：`✅ 已为门户用户 <姓名> (uid=<门户uid>) 确保私人工作空间 (<groupId>)`
   - （来自 `GroupService.ensureUserPrivateGroup` 的 logger）
5. **MongoDB 复核（生产库）**：
   ```bash
   mongo "mongodb://root:Microvideo%402026@dds-bp13ae3414783164.mongodb.rds.aliyuncs.com:3717/langgraph-server" --eval '
   const uid = "<门户uid>";
   printjson(db.users.find({uid}).toArray());
   printjson(db.groups.find({name:"私人空间:"+uid}).toArray());
   const g = db.groups.findOne({name:"私人空间:"+uid});
   printjson(db.group_members.find({groupId:g && g._id}).toArray());
   '
   ```
   - [ ] `users` 集合新增 `uid=<门户uid>` + `portalInfo` 文档
   - [ ] `groups` 集合新增 `name=私人空间:<uid>` 文档
   - [ ] `group_members` 集合新增 `role=admin` 记录
6. **接口验证（ECS 上）**：
   ```bash
   curl -s http://localhost:8080/api/auth/current
   ```
   - [ ] 返回 200，body 含 `user` / `group` / `role`（应为 `admin`）

## 失败排查

- **仍 401「用户不存在」**：
  - `SessionAuthService` 是 fail-closed：若 `PORTAL_BASE_URL` 未配，门户校验直接返回空 → 不建号。查 `java.log` 有无 `PORTAL_BASE_URL/PORTAL_TOKEN_VERIFY_URL 未配置`。
  - 门户连通性（坑 #7）：确认 Java 进程实际拿到内网 `PORTAL_BASE_URL=http://192.168.112.1:39680/portlet/api`（`SessionAuthService` 读 `PORTAL_BASE_URL` 环境变量）。日志有无 `门户 token 校验失败（fail-closed）`。
  - upsert 异常：日志有无 `门户用户 upsert 异常`。
- **仍回跳**：确认 ECS 上跑的确实是新 jar（`sha256sum` 比对 `d3ea84d0...`），旧 jar 没有 `upsertPortalUser` 方法。

## 关联验收（顺带，非阻塞）

- **坑 #9 `/api/page-skeleton`**：`curl -s http://localhost:8080/api/page-skeleton` 应 200（不再是 500）。
- **坑 #11 ticket 死票（挂机刷新弹「系统维护中」）**：需**前端 dist** 部署，本次尚未做，不在本 checklist 范围内。
