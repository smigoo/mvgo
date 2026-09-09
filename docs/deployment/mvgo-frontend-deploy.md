# mvgo 前端部署说明

## 1. 当前前端构建事实

基于代码实读结果：

| 项 | 当前值 | 来源 |
|---|---|---|
| 构建命令 | `npm run build` | `frontend/package.json` |
| 构建模式 | `production` | `frontend/package.json` |
| 输出目录 | `frontend/dist/` | `frontend/vite.config.js` |
| 静态资源目录 | `static/` | `frontend/src/config/default-config.js` |
| 生产 base | `/mvgo/` | `frontend/vite.config.js` |
| publicPath | `/mvgo` | `frontend/src/config/default-config.js` |
| 路由模式 | `history` | `frontend/src/config/default-config.js` |
| 生产访问前缀 | `https://<host>/mvgo/` | 由 `base + history` 决定 |

## 2. 部署目标

把 `frontend/dist/` 的产物发布到：

- **宿主机目录**：`/home/mvbt/nginx/www/mvgo/`
- **容器内映射目录**：`/www/mvgo/`
- **访问地址**：`https://<域名>/mvgo/`

> 注意：这是 **子路径部署**，不是站点根目录部署。前端构建已写死 `base: '/mvgo/'`，所以 nginx 必须保留 `/mvgo/` 前缀。

## 3. 前端发布步骤

### 3.1 本地构建

```bash
cd /Users/smigoo/工作/mvgo/frontend
npm install
npm run build
```

构建完成后检查：

```bash
ls -la /Users/smigoo/工作/mvgo/frontend/dist
ls -la /Users/smigoo/工作/mvgo/frontend/dist/static
```

### 3.2 发布到 ECS

推荐直接同步 **dist 内部文件** 到 nginx 静态目录，而不是再包一层 `dist/`：

```bash
rsync -av --delete /Users/smigoo/工作/mvgo/frontend/dist/ root@<ECS_IP>:/home/mvbt/nginx/www/mvgo/
```

发布后目录应类似：

```text
/home/mvbt/nginx/www/mvgo/
  ├─ index.html
  └─ static/
      ├─ js/
      ├─ css/
      ├─ png/
      └─ ...
```

### 3.3 nginx 校验与重载

```bash
docker exec nginx nginx -t
docker exec nginx nginx -s reload
```

## 4. 必须满足的 nginx 规则

### 4.1 静态站点规则

1. `/` 最好重定向到 `/mvgo/`
2. `/mvgo/` 必须 `try_files ... /mvgo/index.html`，因为前端是 **history 路由**
3. `/mvgo/index.html` 必须 **禁强缓存**
4. `/mvgo/static/` 可以 **长缓存**（文件名带 hash）

### 4.2 API 代理规则

1. **`/api/progress` 必须写在 `/api` 前面**
2. `/api/progress` → `192.168.112.1:13030`
3. 其余 `/api` → `192.168.112.1:8080`
4. nginx 在 docker 容器里，`proxy_pass` **不能写 `127.0.0.1` / `localhost`**，必须写宿主内网 IP `192.168.112.1`

## 5. 发布后验证

### 5.1 页面验证

```bash
curl --noproxy '*' -I http://<域名>/mvgo/
curl --noproxy '*' -I http://<域名>/mvgo/index.html
curl --noproxy '*' -I http://<域名>/mvgo/static/
```

重点看：

- `/mvgo/index.html` 返回 `200`
- `Cache-Control` 对 `index.html` 为 `no-cache` / `no-store`
- 静态 hash 资源可长缓存

### 5.2 接口验证

```bash
curl --noproxy '*' http://<域名>/api/auth/current
curl --noproxy '*' http://<域名>/api/health
curl --noproxy '*' http://<域名>/api/progress/<sessionId>
```

重点看：

- `/api/*` 经 Java 8080
- `/api/progress/*` 经 Node 13030

## 6. 最容易踩的坑

| 坑 | 现象 | 处理 |
|---|---|---|
| 忘了 `/mvgo/` 子路径 | 页面 404 / 资源 404 | 保证构建 base 与 nginx location 一致 |
| history 路由没回退到 index.html | 刷新子路由 404 | `try_files $uri $uri/ /mvgo/index.html;` |
| `index.html` 被缓存 | 发布后页面还是旧版 | 给 `index.html` 配 no-cache，浏览器硬刷新 |
| `/api` 仍指向 Node | 登录/业务接口异常 | 改为 `/api -> 8080`，仅 `/api/progress -> 13030` |
| `proxy_pass` 写 127.0.0.1 | nginx 502 | 改成 `192.168.112.1` |
| `dist` 多套一层目录 | `/mvgo/index.html` 找不到 | 同步 `dist/` 内容，不要同步成 `/mvgo/dist/*` |

## 7. 一句话结论

这套前端不是根路径站点，而是 **`/mvgo/` 子路径 + history 路由 + Java 统一 API 入口 + Node 仅负责 progress SSE**。nginx 配错这 4 个点，部署基本就会出问题。