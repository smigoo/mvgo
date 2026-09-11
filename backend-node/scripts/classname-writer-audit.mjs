#!/usr/bin/env node
/**
 * @file classname-writer-audit.mjs — 🛡️ P1.5 机制审计（2026-09-11）
 *
 * 「类名单一写入者」原则的守卫：**允许改写类名的模块必须登记**。
 * 本脚本扫描 src/ai-engine 下所有可能「生成/改写类名」的模块，与白名单比对：
 *   - 白名单内 = 已登记的写者（附职责）
 *   - 白名单外命中 = 新增写者（**违规**：绕过了归一器 / facts 事实源）
 *
 * 这样下一轮「某修复器顺手改了类名」会在 CI/自检阶段立刻暴露，而不是等到产物出问题。
 *
 * 用法：node scripts/classname-writer-audit.mjs [--json]
 * 退出码：白名单外命中 → 1（可直接挂 CI）
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '..', 'src', 'ai-engine');

/**
 * 合法写者白名单（职责单一，缺一不可）：
 *   role=producer  类名产出（骨架阶段，唯一生成源）
 *   role=consumer  读 facts 对齐（不自行发明类名）
 *   role=normalizer 归一（单一写入者，事实源之前）
 */
const ALLOWLIST = {
  'utils/component-naming.js': 'producer：实例前缀唯一产出方（classPrefixOf / buildComponentId）',
  'roles/microcode/code-generator.js': 'producer：确定性模板装配，产出结构类名 + section 根类',
  'utils/class-facts.js': 'producer：DOM 类事实采集（事实源）',
  'utils/class-dialect-normalizer.js': 'normalizer：布尔方言/修饰符形态归一（事实源之前）',
  'utils/style-class-consolidator.js': 'consumer：scoped 短类 → DOM 形态重写（读 facts）',
  'utils/class-prefix-fixer.js': 'consumer：模板类名补前缀（读 facts）',
  'utils/root-container-normalizer.js': 'consumer：内容根类识别/归一（读 facts 词尾兜底）',
  'roles/microcode/code-healer.js': 'producer(受控)：修复骨架类名，输出经归一器兜底',
  'roles/microcode/vue3-style-entry.js': 'consumer：vue3 路 import 接线',
  'roles/vue3-engineer.js': 'producer(受控)：vue3 路模板类名',
  'utils/artifact-invariants.js': 'checker：不变量校验（只读）',
  'utils/classname-contract.js': 'checker：类名契约（只读）',
  'validators/code-structure-validator.js': 'checker：CODE-020/023/024 门禁（只读）',
  'validators/code-fix-rules.js': 'checker：修复规则（只读/受限）',
  'validators/structure-order-validator.js': 'checker：结构顺序（只读）',
  'validators/do-not-invent-validator.js': 'checker：臆造文字（只读，含模板提取）',
  // ——— 2026-09-11 P1.5 审计登记（经核实均为只读类名 / 编排，非绕过） ———
  'roles/microcode/code-validator.js': 'checker：解析 class/:class 做校验（只读，不改类名）',
  'roles/microcode/resource-mounter.js': 'consumer：按 class 定位根/挂载点（只读类名，写 import/style）',
  'utils/post-process.js': 'consumer：按 class 推断图表 min-height（只读类名，写 style）',
  'roles/microcode-engineer.js': 'orchestrator：编排 归一 → facts → 收敛/补前缀（自身不改类名）',
  // ——— 2026-09-11 P1.7 资源写者登记（资源变量同样适用「单一事实源」原则）———
  'utils/resource-facts.js': 'producer：资源事实源 + 资源契约（引用采集单一实现）',
  'utils/resource-import-guard.js': 'consumer：资源 import 注入（按 used/contract 模式）',
  'utils/props-wiring-guard.js': 'consumer：props 接线 + 父级资源 import 补齐',
  'utils/resource-manifest.js': 'producer：资源归属清单/契约（事实源组装）',
  'utils/resource-mapping-formatter.js': 'formatter：资源映射分组/过滤（只读，供 prompt）',
  'validators/resource-attribution-validator.js': 'checker：资源归属校验 + 跨 section 绑定剥离',
};

/**
 * 资源变量写者信号（P1.7：资源变量也不允许多链各自推导 —— 13890774 事故即
 * 「注入只认模板形态」与「script 引用」两套口径不一致）。
 */
const RESOURCE_WRITER_SIGNALS = [
  /injectResourceImports\s*\(/,
  /ensureResourceImportInVue\s*\(/,
  /ensureResourceImportsForRefs\s*\(/,
  /assignedVarName/,
  /resourceDomMapping/,
  /resources\/images\//,
];

/** 疑似「类名写者」的信号（生成或改写 class token / 类选择器） */
const WRITER_SIGNALS = [
  /classPrefixOf\s*\(/,
  /buildComponentId\s*\(/,
  /\bclass\s*=\s*["'`][^"'`]*\$\{/, // 动态拼 class="..." 
  /\.replace\([^)]*class/i,
  /fixMissingClassPrefixes|normalizeClassNameDialect|rewriteBlockTextVariants/,
  /\bclassName\s*=/,
  /:class\s*=\s*["'{]/,
];

function walk(dir, base = SRC) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p, base));
    else if (/\.(js|ts)$/.test(name) && !/\.spec\.|__tests__/.test(p)) {
      out.push({ path: relative(base, p).split('\\').join('/'), abs: p });
    }
  }
  return out;
}

function main() {
  const json = process.argv.includes('--json');
  const files = walk(SRC);
  const writers = [];
  const unexpected = [];

  for (const f of files) {
    let src = '';
    try {
      src = readFileSync(f.abs, 'utf8');
    } catch {
      continue;
    }
    const hits = WRITER_SIGNALS.filter((re) => re.test(src)).length;
    const resHits =
      f.path.includes('resource') || f.path.includes('props-wiring')
        ? RESOURCE_WRITER_SIGNALS.filter((re) => re.test(src)).length
        : 0;
    const total = hits + resHits;
    if (total < 2) continue; // 单信号可能是只读引用，双信号才视为写者
    const allowed = ALLOWLIST[f.path];
    const entry = { path: f.path, signals: total, role: allowed || null };
    writers.push(entry);
    if (!allowed) unexpected.push(entry);
  }

  if (json) {
    console.log(JSON.stringify({ writers, unexpected }, null, 1));
  } else {
    console.log('\n[classname-writer-audit] 类名写者清单（单一写入者审计）');
    console.log('-'.repeat(84));
    for (const w of writers.sort((a, b) => a.path.localeCompare(b.path))) {
      console.log(`${w.role ? '✓' : '✗'} ${w.path.padEnd(52)} signals=${w.signals}`);
      if (w.role) console.log(`    ${w.role}`);
    }
    console.log('-'.repeat(84));
    console.log(`已登记写者 ${writers.length - unexpected.length} 个；未登记写者 ${unexpected.length} 个`);
    if (unexpected.length > 0) {
      console.log('\n❌ 未登记写者（违反 P1.5 单一写入者：必须改造成 facts 消费者，或登记职责后归一器兜底）：');
      for (const u of unexpected) console.log(`   - ${u.path}`);
    } else {
      console.log('✅ 全部写者已登记，无绕过 facts 的类名改写。');
    }
  }
  if (unexpected.length > 0) process.exitCode = 1;
}

main();
