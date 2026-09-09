#!/usr/bin/env node
/**
 * 死代码检测器
 * 
 * 功能：检测 microcode-engineer.js 和 vue3-engineer.js 中未被使用的方法
 * 用途：防止误删活跃方法，同时识别可安全删除的死代码
 * 
 * 检测策略：
 * 1. 扫描类中所有方法定义
 * 2. 扫描所有 this.xxx 调用
 * 3. 找出未被调用的方法（排除 constructor、getter/setter）
 * 4. 检查是否被子类（vue3-engineer.js）调用
 * 5. 检查是否是公开 API（被外部模块调用）
 * 
 * 使用：node scripts/detect-dead-code.js
 */

const fs = require('fs');
const acorn = require('acorn');
const walk = require('acorn-walk');

// 已知的外部调用入口（这些方法即使类内未调用也不能删）
const PUBLIC_API = new Set([
  'execute',
  'generateCode',
  'parseOutput',
  'buildCodePrompt',
  'assessComplexity',
  'estimateIndexVueSize',
  'shouldSplitIndexVue',
]);

// 已知的生活周期方法（框架调用）
const LIFECYCLE_METHODS = new Set([
  'constructor',
  'execute',
  'parseOutput',
]);

function detectDeadCode(filePath) {
  console.log(`\n=== 检测 ${filePath} ===`);
  
  const source = fs.readFileSync(filePath, 'utf-8');
  const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  
  // 找到主类（支持 export class 和 class）
  let mainClass = null;
  for (const node of ast.body) {
    if (node.type === 'ClassDeclaration') {
      mainClass = node;
      break;
    }
    if (node.type === 'ExportNamedDeclaration' && node.declaration && node.declaration.type === 'ClassDeclaration') {
      mainClass = node.declaration;
      break;
    }
  }
  
  if (!mainClass) {
    console.log('❌ 未找到类定义');
    return;
  }
  
  // 1. 收集所有方法定义
  const methods = new Map(); // methodName → { node, isPrivate, isStatic, isAsync }
  for (const item of mainClass.body.body) {
    if (item.type === 'MethodDefinition' && item.key.type === 'Identifier') {
      const name = item.key.name;
      methods.set(name, {
        node: item,
        isPrivate: name.startsWith('_'),
        isStatic: item.static,
        isAsync: item.value.async,
        line: item.loc.start.line,
      });
    }
  }
  
  console.log(`发现 ${methods.size} 个方法定义`);
  
  // 2. 收集所有 this.xxx 调用
  const calledMethods = new Set();
  walk.simple(ast, {
    MemberExpression(node) {
      if (node.object.type === 'ThisExpression' && node.property.type === 'Identifier') {
        calledMethods.add(node.property.name);
      }
    },
  });
  
  console.log(`发现 ${calledMethods.size} 个 this.xxx 调用`);
  
  // 3. 找出未被调用的方法
  const uncalled = [];
  for (const [name, info] of methods) {
    if (!calledMethods.has(name) && !LIFECYCLE_METHODS.has(name) && !PUBLIC_API.has(name)) {
      uncalled.push({ name, ...info });
    }
  }
  
  // 4. 检查是否被子类调用
  let subclassCalls = new Set();
  if (filePath.includes('microcode-engineer.js')) {
    const vue3Path = 'src/ai-engine/roles/vue3-engineer.js';
    if (fs.existsSync(vue3Path)) {
      const vue3Source = fs.readFileSync(vue3Path, 'utf-8');
      const vue3Ast = acorn.parse(vue3Source, { ecmaVersion: 'latest', sourceType: 'module' });
      
      walk.simple(vue3Ast, {
        MemberExpression(node) {
          if (node.object.type === 'ThisExpression' && node.property.type === 'Identifier') {
            subclassCalls.add(node.property.name);
          }
        },
      });
    }
  }
  
  // 5. 分类输出
  const deadPrivate = [];
  const potentiallyDead = [];
  
  for (const item of uncalled) {
    if (subclassCalls.has(item.name)) {
      // 被子类调用，不算死代码
      continue;
    }
    
    if (item.isPrivate) {
      deadPrivate.push(item);
    } else {
      potentiallyDead.push(item);
    }
  }
  
  // 输出结果
  if (deadPrivate.length > 0) {
    console.log(`\n🔴 发现 ${deadPrivate.length} 个未使用的私有方法（可安全删除）:`);
    for (const item of deadPrivate) {
      console.log(`  - L${item.line} ${item.name}() ${item.isAsync ? '(async)' : ''}`);
    }
  }
  
  if (potentiallyDead.length > 0) {
    console.log(`\n🟡 发现 ${potentiallyDead.length} 个未使用的公开方法（需人工确认）:`);
    for (const item of potentiallyDead) {
      console.log(`  - L${item.line} ${item.name}() ${item.isAsync ? '(async)' : ''} ${item.isStatic ? '(static)' : ''}`);
    }
  }
  
  if (deadPrivate.length === 0 && potentiallyDead.length === 0) {
    console.log('✅ 未发现死代码');
  }
  
  return {
    deadPrivate,
    potentiallyDead,
    totalMethods: methods.size,
    calledMethods: calledMethods.size,
  };
}

// 主流程
console.log('========================================');
console.log('  死代码检测器');
console.log('========================================');

const files = [
  'src/ai-engine/roles/microcode-engineer.js',
  'src/ai-engine/roles/vue3-engineer.js',
];

let totalDead = 0;
for (const file of files) {
  if (fs.existsSync(file)) {
    const result = detectDeadCode(file);
    if (result) {
      totalDead += result.deadPrivate.length + result.potentiallyDead.length;
    }
  } else {
    console.log(`\n⚠️  文件不存在: ${file}`);
  }
}

console.log('\n========================================');
if (totalDead > 0) {
  console.log(`总计发现 ${totalDead} 个可能的死代码方法`);
  console.log('💡 建议：删除前先用 grep 确认无外部调用');
} else {
  console.log('✅ 未发现死代码');
}
console.log('========================================');
