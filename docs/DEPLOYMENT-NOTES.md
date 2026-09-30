# mvgo 生产部署注意事项

> 最后更新：2026-09-30 02:12  
> 适用环境：阿里云 ECS `47.98.216.206:65522`

---

## 一、架构概览

### 1.1 三端服务

| 服务 | 端口 | 目录 | 启动方式 |
|------|------|------|----------|
| **Node 后端** | 13030 | `/home/mvbt/mvgo/backend-node` | **PM2**（`pm2 reload/restart`，勿用 setsid） |
| **Java 后端** | 8080 | `/home/mvbt/mvgo/backend-java` | `java -jar xxx.jar` |
| **前端（静态）** | - | `/home/mvbt/nginx/www/mvgo/` | Nginx 直接服务 |

### 1.2 Docker 容器

| 容器 | 端口映射 | 用途 |
|------|----------|------|
| **nginx** | 80→80, 8888→8888 | 反向代理 + 静态文件服务 |
| component-pc-portlet | 39680 | CAS 认证门户（iframe 包裹 mvgo） |

### 1.3 Nginx Volume 映射（关键）

```bash
/home/mvbt/nginx/nginx.conf  →  /etc/nginx/nginx.conf
/home/mvbt/nginx/html        →  /etc/nginx/html
/home/mvbt/nginx/logs        →  /etc/nginx/logs
/home/mvbt/nginx/vhost       →  /etc/nginx/vhost
/home/mvbt/nginx/www         →  /www  ← 前端文件必须放这里！
```

**⚠️ 重要**：前端构建产物必须部署到 `/home/mvbt/nginx/www/mvgo/`，**不是** `/home/mvbt/mvgo/frontend/dist/`。

---

## 二、部署流程

### 2.1 前端部署

```bash
# 1. 本地构建
cd /Users/smigoo/工作/mvgo/frontend
env -i PATH="/Users/smigoo/.workbuddy/binaries/node/versions/22.22.2-3/bin:/usr/local/bin:/usr/bin:/bin" HOME="/Users/smigoo" \
  npx vite build --mode production

# 2. 打包
tar -czf dist-frontend.tar.gz dist/

# 3. 上传到 ECS
scp -P 65522 dist-frontend.tar.gz root@47.98.216.206:/home/mvbt/mvgo/frontend/

# 4. ECS 上解压到正确位置
ssh -p 65522 root@47.98.216.206
cd /home/mvbt/mvgo/frontend
tar -xzf dist-frontend.tar.gz
cp -r dist/* /home/mvbt/nginx/www/mvgo/  # ← 关键：复制到 Nginx 实际读取的目录
```

**验证**：
```bash
stat /home/mvbt/nginx/www/mvgo/index.html  # 检查修改时间
```

### 2.2 Node 后端部署

```bash
# 1. 本地构建
cd /Users/smigoo/工作/mvgo/backend-node
env -i PATH="/Users/smigoo/.workbuddy/binaries/node/versions/22.22.2-3/bin:/usr/local/bin:/usr/bin:/bin" HOME="/Users/smigoo" \
  npm run build

# 2. 打包
tar -czf dist-node.tar.gz dist/

# 3. 上传到 ECS
scp -P 65522 dist-node.tar.gz root@47.98.216.206:/home/mvbt/mvgo/backend-node/

# 4. ECS 上解压并重启
ssh -p 65522 root@47.98.216.206
cd /home/mvbt/mvgo/backend-node
tar -xzf dist-node.tar.gz

# 5. PM2 重启（生产 Node 由 PM2 v7.0.3 托管，勿用 setsid，否则与 PM2 抢端口 EADDRINUSE）
pm2 list                  # 先查 app 名
pm2 reload <app>          # 或 pm2 restart <app>（reload 平滑、restart 强停）

# 6. 确认端口 + 进程
lsof -iTCP:13030 -sTCP:LISTEN
pgrep -af 'dist/main.js'
```

### 2.3 Java 后端部署

```bash
# 1. 本地构建
cd /Users/smigoo/工作/mvgo/backend-java
mvn clean package -DskipTests

# 2. 上传 jar
scp -P 65522 target/*.jar root@47.98.216.206:/home/mvbt/mvgo/backend-java/

# 3. ECS 上重启
ssh -p 65522 root@47.98.216.206
cd /home/mvbt/mvgo/backend-java
pkill -9 -f 'java.*backend-java'
sleep 2
setsid java -jar target/*.jar > /tmp/java.log 2>&1 &
```

---

## 三、Nginx 路由规则

### 3.1 前端 SPA 路由重定向

所有缺少 `/mvgo/` 前缀的路由自动 301 重定向：

```nginx
location ~ ^/tasks(/.*)?$ { return 301 /mvgo/tasks$1; }
location ~ ^/generator(/.*)?$ { return 301 /mvgo/generator$1; }
location ~ ^/workbench(/.*)?$ { return 301 /mvgo/workbench$1; }
# ... 其他路由
```

### 3.2 API 路由转发

**Node 13030**（必须在 `/api` 之前定义）：
```nginx
location /api/tasks { proxy_pass http://192.168.112.1:13030; }
location /api/progress { proxy_pass http://192.168.112.1:13030; }
location /api/component { proxy_pass http://192.168.112.1:13030; }
location /api/lite { proxy_pass http://192.168.112.1:13030; }
location /api/workbench { proxy_pass http://192.168.112.1:13030; }
# ... 其他 Node 路由
```

**Java 8080**（默认 `/api` 转发）：
```nginx
location /api {
    proxy_pass http://192.168.112.1:8080/api;
}
```

**⚠️ 顺序很重要**：Node 路由必须写在 `location /api` 之前，否则会被 Java 拦截。

### 3.3 静态文件服务

```nginx
root /www;

location /mvgo/ {
    try_files $uri $uri/ /mvgo/index.html;
}
```

---

## 四、关键注意事项

### 4.1 前端部署路径

- **错误**：`/home/mvbt/mvgo/frontend/dist/`
- **正确**：`/home/mvbt/nginx/www/mvgo/`

Nginx 在 Docker 容器内运行，`root /www` 映射到宿主机 `/home/mvbt/nginx/www`。

### 4.2 Node 启动方式

- **不要**用 `start-node.js`（路径写死本地，ECS 不存在）
- **正确**：`pm2 reload/restart <app>`（生产 Node 由 PM2 v7.0.3 托管，`/root/.pm2` God Daemon）

### 4.3 端口占用处理

```bash
# 查找占用端口的进程
lsof -ti:13030

# 强制杀掉
lsof -ti:13030 | xargs kill -9

# ⚠️ 不要 pkill -f 'dist/main.js'：经 ssh 远程执行会「自杀」（远程 bash 命令行也含该串）
# 正确：lsof -ti:13030 | xargs kill -9，或直接 pm2 restart
```

### 4.4 日志查看

```bash
# Node 日志
tail -f /tmp/node.log

# Java 日志
tail -f /tmp/java.log

# Nginx 日志
docker exec nginx tail -f /etc/nginx/logs/proxy-access.log
```

### 4.5 前端路由跳转

**必须使用 `router.push()` 而非 `<a href>`**：

```vue
<!-- ✅ 正确：Vue Router 自动加 /mvgo/ 前缀 -->
<button @click="router.push(`/tasks/${sessionId}`)">查看任务</button>

<!-- ❌ 错误：绝对路径，无 /mvgo/ 前缀，脱离 portlet -->
<a href="/tasks/..." target="_blank">查看任务</a>
```

### 4.6 SessionGuard 鉴权

所有需要 `@CurrentUser()` 的路由必须加 `@UseGuards(SessionGuard)`：

```typescript
@Get('status/:sessionId')
@UseGuards(SessionGuard)  // ← 必须有
getTaskStatus(@CurrentUser() userId: string, ...) {
  // ...
}
```

否则 `request.session` 为空，`userId` 抛 401。

---

## 五、常见问题排查

### 5.1 前端页面 404

```bash
# 检查文件是否存在
ls -la /home/mvbt/nginx/www/mvgo/index.html

# 检查 Nginx 配置
docker exec nginx cat /etc/nginx/vhost/gzxj.conf | grep -A 5 'location /mvgo/'

# 重载 Nginx
docker exec nginx nginx -s reload
```

### 5.2 Node 服务 502

```bash
# 检查进程
pgrep -f 'node.*dist/main.js'

# 检查端口
lsof -iTCP:13030 -sTCP:LISTEN

# 查看日志
tail -50 /tmp/node.log
```

### 5.3 任务详情页显示"任务不存在"

**原因**：Node 服务重启后，内存中的任务数据丢失（任务存储在 `Map` 中）。

**解决**：新建任务即可，这是预期行为。

### 5.4 点击链接跳转到错误 URL

**检查**：
1. 前端代码是否用了 `router.push()` 而非 `<a href>`
2. 构建产物是否部署到 `/home/mvbt/nginx/www/mvgo/`
3. 浏览器是否强制刷新（Ctrl+Shift+R）清缓存

---

## 六、本次部署修复记录（2026-09-30）

### 6.1 修复内容

1. **Node 后端**：28 个路由缺少 `@UseGuards(SessionGuard)`，导致 `@CurrentUser()` 抛 401
2. **前端路由**：3 处 `<a href target="_blank">` 改为 `router.push()`，修复 `/mvgo/` 前缀缺失
3. **部署路径**：前端文件从 `/home/mvbt/mvgo/frontend/dist/` 复制到 `/home/mvbt/nginx/www/mvgo/`

### 6.2 关键发现

- Nginx 运行在 Docker 容器内，`root /www` 映射到 `/home/mvbt/nginx/www`
- 前端构建产物必须部署到 `/home/mvbt/nginx/www/mvgo/`，而非 `/home/mvbt/mvgo/frontend/dist/`
- `router.push()` 会自动加上 vite.config.js 中配置的 `base: '/mvgo/'` 前缀

---

## 七、快速部署脚本

### 7.1 前端一键部署

```bash
#!/bin/bash
# deploy-frontend.sh

set -e

echo "=== 构建前端 ==="
cd /Users/smigoo/工作/mvgo/frontend
env -i PATH="/Users/smigoo/.workbuddy/binaries/node/versions/22.22.2-3/bin:/usr/local/bin:/usr/bin:/bin" HOME="/Users/smigoo" \
  npx vite build --mode production

echo "=== 打包 ==="
tar -czf dist-frontend.tar.gz dist/

echo "=== 上传 ==="
scp -P 65522 dist-frontend.tar.gz root@47.98.216.206:/home/mvbt/mvgo/frontend/

echo "=== 部署到正确位置 ==="
ssh -p 65522 root@47.98.216.206 << 'EOF'
cd /home/mvbt/mvgo/frontend
tar -xzf dist-frontend.tar.gz
cp -r dist/* /home/mvbt/nginx/www/mvgo/
echo "部署完成"
stat /home/mvbt/nginx/www/mvgo/index.html
EOF
```

### 7.2 Node 一键部署

```bash
#!/bin/bash
# deploy-node.sh

set -e

echo "=== 构建 Node ==="
cd /Users/smigoo/工作/mvgo/backend-node
env -i PATH="/Users/smigoo/.workbuddy/binaries/node/versions/22.22.2-3/bin:/usr/local/bin:/usr/bin:/bin" HOME="/Users/smigoo" \
  npm run build

echo "=== 打包 ==="
tar -czf dist-node.tar.gz dist/

echo "=== 上传 ==="
scp -P 65522 dist-node.tar.gz root@47.98.216.206:/home/mvbt/mvgo/backend-node/

echo "=== 解压并重启 ==="
ssh -p 65522 root@47.98.216.206 << 'EOF'
cd /home/mvbt/mvgo/backend-node
tar -xzf dist-node.tar.gz

# PM2 重启（生产 Node 由 PM2 托管，勿用 setsid/pkill）
pm2 list                  # 查 app 名
pm2 reload <app>          # 平滑重启；或 pm2 restart <app>
sleep 4

# 验证
lsof -iTCP:13030 -sTCP:LISTEN
pgrep -af 'dist/main.js'
echo "Node 部署完成"
EOF
```

---

## 八、联系方式

- **ECS 登录**：`ssh -p 65522 root@47.98.216.206`（密码：`Microvideo@2026`）
- **生产地址**：https://go.microvideo.cn/mvgo/
- **Portlet 入口**：https://go.microvideo.cn/portlet/

---

**文档维护**：每次部署后更新本文档，记录新发现的问题和解决方案。
