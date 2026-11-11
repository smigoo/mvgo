#!/bin/bash
# 四路分发打包：按 客户端(mac/win) / 网页 拆分，产出三个 zip 到 dist/
# 默认零安装：插件直连 LLM 网关；start-relay-* 仅为「网关跨域被拦」时的可选兜底。
# 用法: ./pack-dist.sh
set -e
cd "$(dirname "$0")"

DATE="$(date +%Y%m%d)"
# 每次写入带时间戳的唯一目录：只创建、不删除/覆盖，规避安全中心对既有文件的删除拦截
DIST="$(pwd)/dist-$DATE-$(date +%H%M%S)"
mkdir -p "$DIST"

TMP="$(mktemp -d)"

# ---- 公共：插件本体 ----
copy_plugin () {
  local pkg="$1"
  mkdir -p "$pkg/src/cursor_mcp_plugin"
  cp src/cursor_mcp_plugin/manifest.json "$pkg/src/cursor_mcp_plugin/"
  cp src/cursor_mcp_plugin/code.js        "$pkg/src/cursor_mcp_plugin/"
  cp src/cursor_mcp_plugin/ui.html        "$pkg/src/cursor_mcp_plugin/"
}

# ---- 公共：可选本地代理 + ws 依赖（免联网） ----
copy_relay () {
  local pkg="$1"
  cp socket-server.mjs "$pkg/" 2>/dev/null || true
  cp package.json      "$pkg/" 2>/dev/null || true
  mkdir -p "$pkg/node_modules"
  if [ -d node_modules/ws ]; then
    cp -R node_modules/ws "$pkg/node_modules/"
  else
    echo "[pack] 警告: 未找到 node_modules/ws，代理用户需自行 npm install ws"
  fi
}

# ---- 公共：完整使用文档（zip 内用 ASCII 名 README.md，避免 Windows 中文名乱码） ----
copy_readme () {
  local pkg="$1"
  cp docs/mvgo-figma-structure-使用文档.md "$pkg/README.md" 2>/dev/null || true
}

# 统一打包：先在 $TMP 生成 zip，再 cp 到唯一 DIST 目录（纯新建，不覆盖/不删除）
zipit () {
  local pkg="$1" name="$2"
  ( cd "$TMP" && zip -qr "$name" "$(basename "$pkg")" )
  cp "$TMP/$name" "$DIST/$name"
  echo "[pack] 已产出: $DIST/$name ($(du -h "$DIST/$name" | cut -f1))"
}

# ============ 1) 客户端 · macOS ============
PKG_MAC="$TMP/mvgo-figma-structure-client-mac-$DATE"
mkdir -p "$PKG_MAC"
copy_plugin "$PKG_MAC"
copy_relay  "$PKG_MAC"
copy_readme "$PKG_MAC"
cp start-relay-mac.command "$PKG_MAC/" && chmod +x "$PKG_MAC/start-relay-mac.command"
cp docs/QUICKSTART-MAC.md "$PKG_MAC/"
zipit "$PKG_MAC" "mvgo-figma-structure-client-mac-$DATE.zip"

# ============ 2) 客户端 · Windows ============
PKG_WIN="$TMP/mvgo-figma-structure-client-win-$DATE"
mkdir -p "$PKG_WIN"
copy_plugin "$PKG_WIN"
copy_relay  "$PKG_WIN"
copy_readme "$PKG_WIN"
cp start-relay-win.bat "$PKG_WIN/"
cp docs/QUICKSTART-WIN.md "$PKG_WIN/"
zipit "$PKG_WIN" "mvgo-figma-structure-client-win-$DATE.zip"

# ============ 3) 网页版（团队发布） ============
PKG_WEB="$TMP/mvgo-figma-structure-web-$DATE"
mkdir -p "$PKG_WEB"
copy_plugin "$PKG_WEB"
copy_relay  "$PKG_WEB"          # 备用：网页 CORS 兜底（不稳定）
cp start-relay-mac.command "$PKG_WEB/" && chmod +x "$PKG_WEB/start-relay-mac.command"
cp start-relay-win.bat     "$PKG_WEB/"
copy_readme "$PKG_WEB"
cp docs/QUICKSTART-WEB.md  "$PKG_WEB/"
cp docs/PUBLISH-TEAM.md   "$PKG_WEB/"
zipit "$PKG_WEB" "mvgo-figma-structure-web-$DATE.zip"

rm -rf "$TMP" 2>/dev/null || true

echo ""
echo "========== 分发包清单 ($DIST) =========="
ls -lh "$DIST"
echo ""
echo "每个 zip 内容预览（以 mac 为例）:"
unzip -l "$DIST/mvgo-figma-structure-client-mac-$DATE.zip"
