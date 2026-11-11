#!/bin/bash
# 打包给同事用的 mvgo-figma-structure zip（只挑必要文件，含 node_modules/ws 免联网）
# 默认零安装：插件直连 LLM 网关，不需要启动本地服务；
# start-relay-* 两个双击启动器仅为「网关跨域被拦」时的可选兜底，mac / Win 各一个。
# 用法: ./pack.sh   产出: mvgo-figma-structure-YYYYMMDD.zip
set -e
cd "$(dirname "$0")"

OUT="mvgo-figma-structure-$(date +%Y%m%d)"
TMP="$(mktemp -d)"
PKG="$TMP/$OUT"
mkdir -p "$PKG/src/cursor_mcp_plugin" "$PKG/node_modules"

# 1) 插件本体
cp src/cursor_mcp_plugin/manifest.json "$PKG/src/cursor_mcp_plugin/"
cp src/cursor_mcp_plugin/code.js        "$PKG/src/cursor_mcp_plugin/"
cp src/cursor_mcp_plugin/ui.html        "$PKG/src/cursor_mcp_plugin/"

# 2) 可选本地代理 + 依赖声明
cp socket-server.mjs "$PKG/"
cp package.json     "$PKG/"

# 2.5) 双平台双击启动器（默认零安装用不到，仅跨域兜底）
cp start-relay-mac.command "$PKG/"
cp start-relay-win.bat    "$PKG/"
chmod +x "$PKG/start-relay-mac.command"

# 3) 运行时依赖（socket-server 仅依赖 ws，已用 Node 内置 https 转发，无需 undici），免同事联网 npm install
for dep in ws; do
  if [ -d "node_modules/$dep" ]; then
    cp -R "node_modules/$dep" "$PKG/node_modules/$dep"
  else
    echo "[pack] 警告: 未找到 node_modules/$dep，同事需自行 npm install"
  fi
done

# 4) 文档（zip 内用 ASCII 名 README.md，避免 Windows 中文名乱码）
cp docs/mvgo-figma-structure-使用文档.md "$PKG/README.md" 2>/dev/null || true

# 5) 打包
ZIP="$(pwd)/$OUT.zip"
rm -f "$ZIP"
( cd "$TMP" && zip -qr "$ZIP" "$OUT" )

rm -rf "$TMP"
echo "[pack] 已产出: $ZIP"
echo "[pack] 大小: $(du -h "$ZIP" | cut -f1)"
unzip -l "$ZIP"
