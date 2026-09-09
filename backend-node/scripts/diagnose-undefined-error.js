#!/usr/bin/env node
/**
 * 诊断脚本：定位 "Cannot read properties of undefined (reading 'error')" 的根因
 * 
 * 扫描所有可能的 .error 属性访问点，识别未做 null/undefined 检查的位置
 */

import { readFileSync } from 'fs';
import { parse } from 'acorn';
import { walk } from 'estree-walker';

const TARGET_FILES = [
  'src/ai-engine/roles/microcode-engineer.js',
  'src/ai-engine/roles/microcode/code-generator.js',
  'src/ai-engine/roles/microcode/code-parser.js',
  'src/ai-engine/roles/microcode/code-healer.js',
  'src/ai-engine/roles/microcode/file-writer.js',
  'src/ai-engine/roles/microcode/resource-mounter.js',
];

console.log('🔍 诊断 "Cannot read properties of undefined (reading \'error\')" 根因\n');

const risks = [];

for (const file of TARGET_FILES) {
  try {
    const src = readFileSync(file, 'utf-8');
    const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
    
    walk.simple(ast, {
      MemberExpression(node) {
        // 查找 .error 属性访问
        if (node.property.type === 'Identifier' && node.property.name === 'error') {
          const line = node.loc.start.line;
          const lineContent = src.split('\n')[line - 1];
          
          // 检查是否有可选链 ?.error
          const hasOptionalChaining = lineContent.includes('?.error');
          
          // 检查对象类型
          let objectType = 'unknown';
          if (node.object.type === 'Identifier') {
            objectType = `变量: ${node.object.name}`;
          } else if (node.object.type === 'MemberExpression') {
            if (node.object.property.type === 'Identifier') {
              objectType = `属性访问: .${node.object.property.name}`;
            }
          } else if (node.object.type === 'CallExpression') {
            objectType = '函数返回值';
          }
          
          // 标记高风险模式
          const isHighRisk = !hasOptionalChaining && 
            (lineContent.includes('result.error') || 
             lineContent.includes('res.error') ||
             lineContent.includes('response.error') ||
             lineContent.includes('ret.error') ||
             lineContent.includes('data.error'));
          
          if (isHighRisk || !hasOptionalChaining) {
            risks.push({
              file,
              line,
              lineContent: lineContent.trim(),
              objectType,
              hasOptionalChaining,
              risk: isHighRisk ? 'HIGH' : 'MEDIUM',
            });
          }
        }
        
        // 查找 .debug 属性访问（同样可能出问题）
        if (node.property.type === 'Identifier' && node.property.name === 'debug') {
          const line = node.loc.start.line;
          const lineContent = src.split('\n')[line - 1];
          const hasOptionalChaining = lineContent.includes('?.debug');
          
          if (!hasOptionalChaining) {
            risks.push({
              file,
              line,
              lineContent: lineContent.trim(),
              property: 'debug',
              hasOptionalChaining,
              risk: 'HIGH',
              note: '直接访问 .debug 而未做 null 检查',
            });
          }
        }
      },
    });
  } catch (e) {
    console.error(`❌ 解析 ${file} 失败: ${e.message}`);
  }
}

// 按风险等级排序
risks.sort((a, b) => {
  if (a.risk === 'HIGH' && b.risk !== 'HIGH') return -1;
  if (a.risk !== 'HIGH' && b.risk === 'HIGH') return 1;
  return a.line - b.line;
});

console.log(`\n📊 发现 ${risks.length} 个潜在风险点\n`);

// 按文件分组显示
const byFile = {};
for (const r of risks) {
  if (!byFile[r.file]) byFile[r.file] = [];
  byFile[r.file].push(r);
}

for (const [file, items] of Object.entries(byFile)) {
  console.log(`\n📄 ${file}`);
  console.log('─'.repeat(80));
  
  for (const item of items) {
    const icon = item.risk === 'HIGH' ? '🔴' : '🟡';
    console.log(`${icon} 行 ${item.line} [${item.risk}]`);
    console.log(`   ${item.lineContent}`);
    if (item.note) console.log(`   💡 ${item.note}`);
    if (!item.hasOptionalChaining) {
      console.log(`   ⚠️  缺少可选链 ?. 保护`);
    }
  }
}

// 特别检查 runChunk 返回值的使用
console.log('\n\n🔬 重点检查：runChunk 返回值使用模式');
console.log('═'.repeat(80));

for (const file of TARGET_FILES) {
  try {
    const src = readFileSync(file, 'utf-8');
    const lines = src.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // 查找 await runChunk 调用
      if (line.includes('await runChunk')) {
        const nextLines = lines.slice(i, i + 5).join('\n');
        
        // 检查是否立即访问属性而未做 null 检查
        if (nextLines.match(/await runChunk[\s\S]*?\.files/) && 
            !nextLines.includes('?.files') &&
            !nextLines.includes('if (') &&
            !nextLines.includes('try {')) {
          console.log(`\n⚠️  ${file}:${i + 1}`);
          console.log(`   ${line.trim()}`);
          console.log(`   💡 runChunk 返回值直接访问 .files，未做 null 检查`);
        }
        
        if (nextLines.match(/await runChunk[\s\S]*?\.debug/) && 
            !nextLines.includes('?.debug')) {
          console.log(`\n⚠️  ${file}:${i + 1}`);
          console.log(`   ${line.trim()}`);
          console.log(`   💡 runChunk 返回值直接访问 .debug，未做 null 检查`);
        }
      }
    }
  } catch (e) {
    // ignore
  }
}

console.log('\n\n✅ 诊断完成');
