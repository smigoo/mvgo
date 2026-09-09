#!/bin/bash
# 重构验证链脚本
# 用途：每次修改 microcode-engineer.js / vue3-engineer.js 或其子模块后，自动运行 4 层验证
# 使用：bash scripts/verify-refactoring.sh

set -e

echo "=========================================="
echo "  重构验证链 (4 层防护)"
echo "=========================================="
echo ""

# 第 1 层：acorn 语法校验
echo "=== 第 1 层：acorn 语法校验 ==="
node -e "
const fs = require('fs');
const acorn = require('acorn');
const path = require('path');

const files = [
  'src/ai-engine/roles/microcode-engineer.js',
  'src/ai-engine/roles/vue3-engineer.js',
];

// 添加 microcode/ 目录下所有文件
const microcodeDir = 'src/ai-engine/roles/microcode';
if (fs.existsSync(microcodeDir)) {
  const microcodeFiles = fs.readdirSync(microcodeDir)
    .filter(f => f.endsWith('.js'))
    .map(f => path.join(microcodeDir, f));
  files.push(...microcodeFiles);
}

let hasError = false;
for (const f of files) {
  try {
    const source = fs.readFileSync(f, 'utf-8');
    acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
    console.log('✅', f);
  } catch (e) {
    console.error('❌', f);
    console.error('   错误:', e.message);
    hasError = true;
  }
}

if (hasError) {
  process.exit(1);
}
"

if [ $? -ne 0 ]; then
  echo ""
  echo "❌ 第 1 层验证失败"
  exit 1
fi

echo ""
echo "✅ 第 1 层验证通过"
echo ""

# 第 2 层：ESM 动态加载验证
echo "=== 第 2 层：ESM 动态加载验证 ==="
node -e "
(async () => {
  try {
    await import('./src/ai-engine/roles/microcode-engineer.js');
    console.log('✅ microcode-engineer.js 加载成功');
    
    await import('./src/ai-engine/roles/vue3-engineer.js');
    console.log('✅ vue3-engineer.js 加载成功');
    
    console.log('✅ 所有模块加载成功');
  } catch (e) {
    console.error('❌ 加载失败:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
})();
"

if [ $? -ne 0 ]; then
  echo ""
  echo "❌ 第 2 层验证失败"
  exit 1
fi

echo ""
echo "✅ 第 2 层验证通过"
echo ""

# 第 3 层：委托关系验证
echo "=== 第 3 层：委托关系验证 ==="
if [ -f "scripts/verify-delegation.js" ]; then
  node scripts/verify-delegation.js
  if [ $? -ne 0 ]; then
    echo ""
    echo "❌ 第 3 层验证失败"
    exit 1
  fi
  echo ""
  echo "✅ 第 3 层验证通过"
else
  echo "⚠️  委托关系验证器尚未创建，跳过"
fi

echo ""

# 第 4 层：核心行为抽查
echo "=== 第 4 层：核心行为抽查 ==="
if [ -f "scripts/behavior-spot-check.js" ]; then
  node scripts/behavior-spot-check.js
  if [ $? -ne 0 ]; then
    echo ""
    echo "❌ 第 4 层验证失败"
    exit 1
  fi
  echo ""
  echo "✅ 第 4 层验证通过"
else
  echo "⚠️  行为抽查脚本尚未创建，跳过"
fi

echo ""
echo "=========================================="
echo "  ✅ 所有验证通过"
echo "=========================================="
