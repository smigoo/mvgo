#!/bin/bash
# 沙箱隔离测试部署脚本
# 用法: bash test/deploy-sandbox-fixtures.sh [clean]
# 在 frontend/workspace 中部署测试夹具，然后打开预览页验证

set -e
cd "$(dirname "$0")/.."

FIXTURES_DIR="test/fixtures"
PREVIEW_BASE="http://localhost:2610/preview"
MC_COMPONENT_BASE="http://localhost:2610/mc-component"

# 测试用例定义：ID 前缀 | 类型 | 夹具文件
declare -A TESTS
TESTS=(
  # Vue3 Max - 编译错误
  ["mv-max-test-syntax"]="vue3-default|err-dup-import"
  # Vue3 Lite - LESS 错误
  ["mv-lite-test-less"]="vue3-default|err-less-unclosed"
  # 微码 Max - 编译错误
  ["mc-max-test-syntax"]="microcode|err-dup-import"
  # 微码 Lite - LESS 错误
  ["mc-lite-test-less"]="microcode|err-less-unclosed"
  # Vue3 Max - 运行时引用错误
  ["mv-max-test-runtime"]="vue3-default|err-runtime-ref"
  # 微码 Max - 运行时引用错误
  ["mc-max-test-runtime"]="microcode|err-runtime-ref"
)

clean_mode=false
if [ "$1" = "clean" ]; then
  clean_mode=true
fi

echo "============================================"
echo "  沙箱隔离测试夹具部署脚本"
echo "============================================"
echo ""

for id in "${!TESTS[@]}"; do
  IFS='|' read -r type fixture <<< "${TESTS[$id]}"

  if $clean_mode; then
    # 清理
    if [ "$type" = "microcode" ]; then
      rm -rf "frontend/workspace/custom-components/$id"
      echo "[CLEAN] $id (custom-components)"
    else
      rm -rf "frontend/workspace/vue3-components/default-group/$id"
      echo "[CLEAN] $id (vue3-components/default-group)"
    fi
    continue
  fi

  # 部署
  if [ "$type" = "microcode" ]; then
    DST="frontend/workspace/custom-components/$id/package"
    mkdir -p "$DST"
    cp "$FIXTURES_DIR/$fixture.vue" "$DST/index.vue"
    # 微码组件需要 component.js 和 declare.json 才能被识别
    mkdir -p "$(dirname "$DST")/resources"
    echo 'import component from "./package/index.vue"; import "./resources/styles/index.css"; export default component;' > "$(dirname "$DST")/component.js"
    echo '{"componentId":"'$id'","type":"microcode","level":"max","size":{"width":400,"height":300}}' > "$(dirname "$DST")/declare.json"
    touch "$(dirname "$DST")/declare.js"
    echo "[DEPLOY] $id → frontend/workspace/custom-components/$id/"
  else
    DST="frontend/workspace/vue3-components/default-group/$id/package"
    mkdir -p "$DST"
    cp "$FIXTURES_DIR/$fixture.vue" "$DST/index.vue"
    echo "[DEPLOY] $id → frontend/workspace/vue3-components/default-group/$id/"
  fi
done

if $clean_mode; then
  echo ""
  echo "清理完成。"
  exit 0
fi

echo ""
echo "============================================"
echo "  验证步骤（手动）"
echo "============================================"
echo ""
echo "前提：前端 dev server 已启动 (http://localhost:2610)"
echo ""
echo "打开以下 URL，逐一验证："
echo ""

for id in "${!TESTS[@]}"; do
  echo "  - ${PREVIEW_BASE}/$id"
  echo "    预期：页面显示「组件加载失败」卡片，Vite 终端无红字报错"
  echo ""
done

echo "============================================"
echo "  验证检查清单"
echo "============================================"
echo ""
echo "  [ ] 每个损坏组件页面 → 显示 ErrorBoundary 卡片（非空白/崩溃）"
echo "  [ ] Vite 终端 → 无 [plugin:vite:vue] 编译错误"
echo "  [ ] 打开一个正常预览页 → 不受坏组件影响"
echo "  [ ] 修正某个坏组件后 → 调 /__invalidate → 正常渲染"
echo ""
echo "  curl -X POST http://localhost:2610/__invalidate  # 清缓存"
echo ""
echo "清理: bash $0 clean"
