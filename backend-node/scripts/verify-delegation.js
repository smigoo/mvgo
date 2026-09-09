#!/usr/bin/env node
/**
 * 委托关系验证器
 * 
 * 功能：扫描 microcode-engineer.js 中的所有委托壳，验证目标函数是否存在
 * 用途：防止委托指向错误（如 fixSectionHeights vs fixSectionHeightsForResource）
 * 
 * 使用：node scripts/verify-delegation.js
 */

const fs = require('fs');
const path = require('path');

// 模块映射表：委托目标模块名 → 实际文件路径
const MODULE_MAP = {
  'microcodeParser': 'src/ai-engine/roles/microcode/code-parser.js',
  'microcodeHealer': 'src/ai-engine/roles/microcode/code-healer.js',
  'microcodeFileWriter': 'src/ai-engine/roles/microcode/file-writer.js',
  'microcodeWriter': 'src/ai-engine/roles/microcode/file-writer.js',  // 别名
  'microcodeResources': 'src/ai-engine/roles/microcode/resource-mounter.js',
  'microcodePrompt': 'src/ai-engine/roles/microcode/prompt-builder.js',
  'microcodeValidator': 'src/ai-engine/roles/microcode/code-validator.js',
  'microcodeGenerator': 'src/ai-engine/roles/microcode/code-generator.js',
  'microcodeHealth': 'src/ai-engine/roles/microcode/mc-health-validator.js',
};

function verifyDelegation() {
  const mainFile = 'src/ai-engine/roles/microcode-engineer.js';
  
  if (!fs.existsSync(mainFile)) {
    console.error(`❌ 主文件不存在: ${mainFile}`);
    process.exit(1);
  }
  
  const source = fs.readFileSync(mainFile, 'utf-8');
  
  // 匹配委托壳模式：return microcodeXxx.yyy(...)
  // 支持多行匹配，如：
  //   return microcodeResources.fixSectionHeightsForResource(content, ctx, {
  //     logger: this.logger,
  //   });
  const delegationPattern = /return\s+(microcode\w+)\.(\w+)\s*\(/g;
  const delegations = [];
  let match;
  
  while ((match = delegationPattern.exec(source)) !== null) {
    delegations.push({ 
      module: match[1], 
      method: match[2],
      position: source.substring(0, match.index).split('\n').length
    });
  }
  
  console.log(`发现 ${delegations.length} 个委托壳`);
  console.log('');
  
  // 验证每个委托目标是否存在
  const errors = [];
  const warnings = [];
  const verified = [];
  
  for (const { module, method, position } of delegations) {
    const modulePath = MODULE_MAP[module];
    
    if (!modulePath) {
      errors.push(`❌ [L${position}] 未知模块: ${module}`);
      continue;
    }
    
    if (!fs.existsSync(modulePath)) {
      errors.push(`❌ [L${position}] 模块文件不存在: ${modulePath}`);
      continue;
    }
    
    const moduleSource = fs.readFileSync(modulePath, 'utf-8');
    
    // 检查函数是否存在并导出
    const hasExport = 
      moduleSource.includes(`export function ${method}`) || 
      moduleSource.includes(`export async function ${method}`);
    
    // 检查函数是否存在但未导出（可能是内部函数）
    const hasFunction = 
      moduleSource.includes(`function ${method}`) ||
      moduleSource.includes(`async function ${method}`);
    
    if (hasExport) {
      verified.push(`✅ [L${position}] ${module}.${method}`);
    } else if (hasFunction) {
      warnings.push(`⚠️  [L${position}] ${module}.${method} 存在但未导出`);
    } else {
      errors.push(`❌ [L${position}] ${module}.${method} 不存在`);
    }
  }
  
  // 输出结果
  if (verified.length > 0) {
    console.log('已验证的委托:');
    verified.forEach(v => console.log(`  ${v}`));
    console.log('');
  }
  
  if (warnings.length > 0) {
    console.log('警告:');
    warnings.forEach(w => console.log(`  ${w}`));
    console.log('');
  }
  
  if (errors.length > 0) {
    console.error('错误:');
    errors.forEach(e => console.error(`  ${e}`));
    console.error('');
    console.error(`❌ 委托关系验证失败: ${errors.length} 个错误`);
    process.exit(1);
  }
  
  console.log(`✅ 委托关系验证通过: ${verified.length}/${delegations.length} 个委托目标存在`);
}

// 执行验证
verifyDelegation();
