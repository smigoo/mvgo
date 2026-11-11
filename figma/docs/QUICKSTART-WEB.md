# mvgo-figma-structure · 网页版使用注意

适用：Figma 网页端（figma.com）。前提是管理员已把本插件**发布到公司 Figma 团队/组织**。

## 同事怎么装
1. 打开 figma.com，进入公司团队文件。
2. 菜单 **插件 → 搜索「mvgo-figma-structure」→ 运行/安装**。
3. 填 **AI 接口地址(Base URL) / Key / 模型名** → 保存设置。

## 网页版必读限制
- **必须用 `https` 的 LLM 网关**。浏览器会拦截非 localhost 的 `http://` 请求（混合内容策略）。
- **CORS 兜底同样可用**：网页端插件运行在同事本机浏览器，同样能连 `ws://localhost:3055` 本机中继（localhost 不受跨域限制），由本机 Node 代发请求绕开 CORS，与桌面端同一机制。
  - 若网关不允许跨域（保存报 `Failed to fetch`）：
    - 首选改用**允许跨域的 `https` 网关**；
    - 次选在本机双击 `start-relay-mac.command` / `start-relay-win.bat` 起中继，再点「连接本地代理」（web 包内已带双启动器 + `ws`）。
- 其余用法（选区、整理、命名规范）与桌面端完全一致，见 `README.md`。

## 管理员：如何发布
详见同包 `PUBLISH-TEAM.md`。
