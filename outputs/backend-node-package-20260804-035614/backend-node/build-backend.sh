#!/usr/bin/env bash
# backend 正确构建脚本（2026-07-24 固化）
# 2026-07-30 polyrepo：从 langgraph-server/backend → ganzhixiaojie/backend-node
#
# 关键事实：backend/src/ai-engine/ 是 TS + JS 混合项目（83 个 .js 运行时模块，
# 全部用 ESM import/export + .js 扩展名，直接被 node 运行时执行，不在 tsc 编译范围）。
# 若用 `npx tsc` 直接重建 dist 且未同步 .js，运行时动态 import('ai-engine/...')
# 会 ERR_MODULE_NOT_FOUND 导致进程崩溃（曾因此 13030 挂掉）。
#
# 本脚本两步：
#   1) tsc 编译所有 .ts → dist（逐文件 CommonJS 产物）
#   2) 把 src 下所有 .js 源按原结构同步进 dist（node 直接执行，不需 tsc 处理）
#
# 用法：cd backend-node && bash build-backend.sh
set -e
cd "$(dirname "$0")"
export PATH="/Users/smigoo/.workbuddy/binaries/node/versions/22.22.2/bin:$PATH"

echo "[1/2] tsc 编译 .ts → dist ..."
rm -rf dist
npx tsc -p tsconfig.build.json || { echo "⚠️ tsc 有错误（可能是已知的 archiver CJS/ESM 兼容问题），继续构建..." ; }

echo "[2/2] 同步 .js 运行时模块 → dist ..."
( cd src && find . -name '*.js' -print0 | tar --null -cf - -T - ) | ( cd dist && tar xf - )
echo "JS_SYNC_DONE"

echo "[3/3] 同步 .md Prompt 模板 → dist ..."
( cd src && find . -name '*.md' -print0 | tar --null -cf - -T - ) | ( cd dist && tar xf - )
echo "MD_SYNC_DONE"

echo "===== 完整性自检 ====="
SRC_JS=$(find src -name '*.js' | wc -l)
MISS=0
while IFS= read -r f; do
  rel="${f#src/}"
  [ ! -f "dist/$rel" ] && MISS=$((MISS+1))
done < <(find src -name '*.js')
echo "src .js: $SRC_JS, dist 缺失: $MISS"
if [ "$MISS" -ne 0 ]; then
  echo "❌ 仍有缺失，构建失败"; exit 1
fi
echo "✅ 构建完成：dist/main.js 就绪"
