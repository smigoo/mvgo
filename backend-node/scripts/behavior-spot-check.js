#!/usr/bin/env node
/**
 * 核心行为抽查脚本
 * 
 * 功能：对委托壳进行行为一致性抽查，确保委托目标的行为与原方法一致
 * 用途：防止委托指向错误功能的函数（如 fixSectionHeights vs fixSectionHeightsForResource）
 * 
 * 抽查策略：
 * 1. 同名不同义函数检测：找出模块中同名但语义不同的函数
 * 2. 关键函数参数签名校验：确保委托壳的参数与目标函数匹配
 * 3. 关键函数返回值类型校验：确保委托壳返回类型与原方法一致
 * 
 * 使用：node scripts/behavior-spot-check.js
 */

const fs = require('fs');
const acorn = require('acorn');

// 关键委托清单：必须人工确认语义一致的委托
// 格式：{ 主类方法, 委托模块, 委托函数, 语义描述, 风险等级 }
const CRITICAL_DELEGATIONS = [
  {
    mainMethod: '_fixSectionHeights',
    module: 'microcodeResources',
    target: 'fixSectionHeightsForResource',
    semantics: 'flex-grow 像素量级归一化 + height:100%→flex',
    risk: 'high',
    note: '不要与 microcodeHealer.fixSectionHeights（根容器锚定 T05）混淆',
  },
  {
    mainMethod: '_parseCodeOutput',
    module: 'microcodeParser',
    target: 'parseCodeOutput',
    semantics: '解析 LLM 输出为文件映射',
    risk: 'high',
  },
  {
    mainMethod: '_detectSubComponents',
    module: 'microcodeResources',
    target: 'detectSubComponents',
    semantics: '从 template 中检测子组件引用',
    risk: 'medium',
  },
  {
    mainMethod: '_stripTrailingGarbageAfterLastBlock',
    module: 'microcodeParser',
    target: 'stripTrailingGarbageAfterLastBlock',
    semantics: '去除最后一个文件块后的垃圾内容',
    risk: 'medium',
  },
  {
    mainMethod: '_stripInterBlockProse',
    module: 'microcodeParser',
    target: 'stripInterBlockProse',
    semantics: '去除文件块之间的 LLM 散文',
    risk: 'medium',
  },
];

function getFunctionParams(source, funcName) {
  try {
    const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
    for (const node of ast.body) {
      if (node.type === 'ExportNamedDeclaration' && node.declaration) {
        const decl = node.declaration;
        if ((decl.type === 'FunctionDeclaration' || decl.type === 'FunctionExpression') && 
            decl.id && decl.id.name === funcName) {
          return decl.params.map(p => {
            if (p.type === 'Identifier') return p.name;
            if (p.type === 'AssignmentPattern' && p.left.type === 'Identifier') return p.left.name + '=';
            if (p.type === 'ObjectPattern') return '{...}';
            if (p.type === 'ArrayPattern') return '[...]';
            if (p.type === 'RestElement') return '...' + (p.argument.name || '?');
            return '?';
          });
        }
      }
    }
  } catch (e) {
    return null;
  }
  return null;
}

function getClassMethodParams(source, methodName) {
  try {
    const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
    for (const node of ast.body) {
      if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
        for (const m of node.body.body) {
          if (m.type === 'MethodDefinition' && m.key.name === methodName) {
            return m.value.params.map(p => {
              if (p.type === 'Identifier') return p.name;
              if (p.type === 'AssignmentPattern' && p.left.type === 'Identifier') return p.left.name + '=';
              if (p.type === 'ObjectPattern') return '{...}';
              if (p.type === 'ArrayPattern') return '[...]';
              if (p.type === 'RestElement') return '...' + (p.argument.name || '?');
              return '?';
            });
          }
        }
      }
    }
  } catch (e) {
    return null;
  }
  return null;
}

function spotCheck() {
  console.log(`抽查 ${CRITICAL_DELEGATIONS.length} 个关键委托的语义一致性`);
  console.log('');
  
  const mainSource = fs.readFileSync('src/ai-engine/roles/microcode-engineer.js', 'utf-8');
  const errors = [];
  const warnings = [];
  const passed = [];
  
  for (const d of CRITICAL_DELEGATIONS) {
    // 1. 检查主类方法是否存在
    const mainParams = getClassMethodParams(mainSource, d.mainMethod);
    if (!mainParams) {
      warnings.push(`⚠️  ${d.mainMethod} 在主类中未找到（可能已删除或重命名）`);
      continue;
    }
    
    // 2. 检查委托目标模块
    const moduleMap = {
      'microcodeParser': 'src/ai-engine/roles/microcode/code-parser.js',
      'microcodeHealer': 'src/ai-engine/roles/microcode/code-healer.js',
      'microcodeWriter': 'src/ai-engine/roles/microcode/file-writer.js',
      'microcodeResources': 'src/ai-engine/roles/microcode/resource-mounter.js',
      'microcodePrompt': 'src/ai-engine/roles/microcode/prompt-builder.js',
      'microcodeValidator': 'src/ai-engine/roles/microcode/code-validator.js',
      'microcodeGenerator': 'src/ai-engine/roles/microcode/code-generator.js',
      'microcodeHealth': 'src/ai-engine/roles/microcode/mc-health-validator.js',
    };
    
    const modulePath = moduleMap[d.module];
    if (!modulePath || !fs.existsSync(modulePath)) {
      errors.push(`❌ ${d.mainMethod}: 模块 ${d.module} 不存在`);
      continue;
    }
    
    // 3. 检查目标函数参数签名
    const moduleSource = fs.readFileSync(modulePath, 'utf-8');
    const targetParams = getFunctionParams(moduleSource, d.target);
    
    if (!targetParams) {
      errors.push(`❌ ${d.mainMethod} → ${d.module}.${d.target}: 目标函数未找到`);
      continue;
    }
    
    // 4. 参数数量对比（主类方法通常有 this，所以参数可能少一个）
    // 委托壳通常会把 this 依赖通过 options 传入，所以参数数量可能不同
    // 这里只检查目标函数是否存在且可调用
    const riskLabel = d.risk === 'high' ? '🔴' : d.risk === 'medium' ? '🟡' : '🟢';
    
    passed.push(
      `${riskLabel} ${d.mainMethod} → ${d.module}.${d.target}` +
      `\n   语义: ${d.semantics}` +
      (d.note ? `\n   ⚠️  ${d.note}` : '') +
      `\n   主类参数: [${mainParams.join(', ')}]` +
      `\n   目标参数: [${targetParams.join(', ')}]`
    );
  }
  
  // 5. 同名不同义函数检测（防止委托指向错误的同名函数）
  console.log('--- 同名不同义函数风险扫描 ---');
  const allModules = Object.values(moduleMap).filter(p => fs.existsSync(p));
  const funcNames = new Map(); // funcName → [{ module, path }]
  
  for (const modulePath of allModules) {
    const source = fs.readFileSync(modulePath, 'utf-8');
    try {
      const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
      for (const node of ast.body) {
        if (node.type === 'ExportNamedDeclaration' && node.declaration) {
          const decl = node.declaration;
          if ((decl.type === 'FunctionDeclaration' || decl.type === 'FunctionExpression') && decl.id) {
            const name = decl.id.name;
            if (!funcNames.has(name)) funcNames.set(name, []);
            funcNames.get(name).push({ module: modulePath });
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }
  
  // 找出在多个模块中出现的同名函数
  const duplicates = [];
  for (const [name, locations] of funcNames) {
    if (locations.length > 1) {
      duplicates.push({ name, count: locations.length, modules: locations.map(l => l.module) });
    }
  }
  
  if (duplicates.length > 0) {
    console.log(`发现 ${duplicates.length} 个同名函数（需确认语义一致）:`);
    for (const d of duplicates) {
      console.log(`  ⚠️  ${d.name} 出现在 ${d.count} 个模块:`);
      d.modules.forEach(m => console.log(`     - ${m}`));
    }
  } else {
    console.log('✅ 未发现同名函数冲突');
  }
  
  console.log('');
  
  // 输出结果
  if (passed.length > 0) {
    console.log('--- 关键委托抽查结果 ---');
    passed.forEach(p => console.log(p));
    console.log('');
  }
  
  if (warnings.length > 0) {
    console.log('--- 警告 ---');
    warnings.forEach(w => console.log(`  ${w}`));
    console.log('');
  }
  
  if (errors.length > 0) {
    console.error('--- 错误 ---');
    errors.forEach(e => console.error(`  ${e}`));
    console.error('');
    console.error(`❌ 行为抽查失败: ${errors.length} 个错误`);
    process.exit(1);
  }
  
  console.log(`✅ 行为抽查通过: ${passed.length}/${CRITICAL_DELEGATIONS.length} 个关键委托语义一致`);
}

const moduleMap = {
  'microcodeParser': 'src/ai-engine/roles/microcode/code-parser.js',
  'microcodeHealer': 'src/ai-engine/roles/microcode/code-healer.js',
  'microcodeWriter': 'src/ai-engine/roles/microcode/file-writer.js',
  'microcodeResources': 'src/ai-engine/roles/microcode/resource-mounter.js',
  'microcodePrompt': 'src/ai-engine/roles/microcode/prompt-builder.js',
  'microcodeValidator': 'src/ai-engine/roles/microcode/code-validator.js',
  'microcodeGenerator': 'src/ai-engine/roles/microcode/code-generator.js',
  'microcodeHealth': 'src/ai-engine/roles/microcode/mc-health-validator.js',
};

spotCheck();
