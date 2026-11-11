# 发布到 Figma 团队/组织（网页版可用）

> 前提：公司 Figma 为付费团队/组织（Professional/Enterprise 团队），且你有该团队的插件发布权限（或请管理员操作）。

## 为什么必须发布
Figma 网页端没有"导入本地 manifest"入口，只能运行**已上架**的插件。要让同事在 figma.com 网页里用，必须先把插件发布到团队。

## 发布步骤
1. **先本地验证**：用 Figma 桌面端导入本包 `src/cursor_mcp_plugin/manifest.json`，自检功能无误（发布后难改，务必先验）。
2. 桌面端 → 插件菜单 → 右键本插件 → **Publish（发布）**。
3. 填写名称 / 描述 / 图标；确认 `manifest.json` 中：
   - `networkAccess.allowedDomains: ["*"]`（已设置，允许连任意 LLM 网关）
   - `editorType: ["figma","figjam","dev"]`（已设置）
4. 提交发布，等待 Figma 审核通过（内部团队插件通常秒过）。
5. 团队成员在 **Figma 网页端** → 插件菜单 → 搜「mvgo-figma-structure」→ 安装/运行。
6. 后续更新：重新发布新版本，团队成员会收到更新提示。

## 发布后须知（转告同事）
- 网页版必须用 `https` 网关；若网关不允许跨域，可让同事在本机起本地代理兜底（与桌面端同理，web 包内已带启动器 + `ws`），或改用允许跨域的 `https` 网关。
- 插件本体与桌面端完全一致，命名规范、整理能力无差别。

## 如果不想走团队发布
让同事全部用**桌面客户端侧载**（发 `client-mac` / `client-win` 两个 zip），效果相同，只是每人需手动导入一次。
