# mvgo-figma-structure · macOS 极简上手

适用：Figma 桌面端（macOS）。零安装，默认不需 Node / 终端。

1. 解压 `mvgo-figma-structure-client-mac-<日期>.zip`。
2. 打开 **Figma 桌面端**（不是浏览器里的网页版）。
3. 顶部菜单 **插件 → 开发 → 导入插件 / Import plugin from manifest…**，  
   选解压目录里的 `src/cursor_mcp_plugin/manifest.json`。
4. 运行插件（开发菜单 → mvgo-figma-structure）。
5. 填 **AI 接口地址(Base URL) / Key / 模型名** → 点「保存设置（仅存本机）」。
   - 仅用「零 token 工具」（结构化整理 / 结构方案 / 结构契约）连 Key 都不用填。
6. 画布选中要整理的框架 → 「当前选区」变绿 → 点「AI 全自动整理选中框架」。

## 网关跨域被拦时（可选兜底）

若保存设置报 `Failed to fetch`：

- 双击 `start-relay-mac.command`（首次若被拦：右键 → 打开 → 仍要打开）；
- 回插件点「连接本地代理（可选）」，状态变绿后再保存。
- 需本机 Node 18+；`ws` 已随包附带，无需联网装。

完整说明见同包 `README.md`。

