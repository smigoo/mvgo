#!/usr/bin/env node
/**
 * diagnose-code026-false-positive.mjs — CODE-026「骨架缺失」假阳性诊断探针
 *
 * 症状：L0-B 门禁报 `[CODE-026] 微码产物骨架不完整：缺少 resources/config/css-vars.js /
 *       resources/styles/index.less / themes/{dark,light}.less ...`，且同一 blockId
 *       连续多轮重试复现 → 重试耗尽 → 软失败降级。
 *
 * 第一判据（5 秒定性）：门禁报「缺失」的文件**在磁盘上其实都在** ⇒ 假阳性。
 * 根因（2026-09-13 刀 10 治本前）：喂给校验器的**文件集残缺**，两条来源叠乘——
 *   ① state.generatedFiles 被赋为 result.writtenFiles（本轮实际写盘清单）
 *      ——file-writer 对内容未变化文件走增量补丁「跳过写盘 reason=identical」，
 *        这些路径不进 written 数组；buildMcPlatformFiles 的 css-vars.js 也可能未聚合；
 *   ② L0-B 增量校验把校验集裁成「变更文件 ∪ {common.less, declare.json}」
 *      —— 整产物级检查（CODE-024/025/026 + EMPTY_* + 死变量定义/消费面）在残缺集上必误报。
 *
 * 本脚本对指定产物目录做 A/B 复算，量化两条残缺各自造成的误报。
 *
 * 用法：
 *   node scripts/diagnose-code026-false-positive.mjs <产物目录> [componentId]
 * 例：
 *   node scripts/diagnose-code026-false-positive.mjs \
 *     ../temp-components/<groupId>/<componentId>
 *
 * 退出码：0 = 全量路径 CODE-026 为 0（管线已治本）；1 = 全量路径仍报 CODE-026（真缺文件）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_VALIDATOR = path.resolve(
  __dirname,
  '../dist/ai-engine/validators/code-structure-validator.js',
);
const DIST_SKELETON = path.resolve(
  __dirname,
  '../dist/ai-engine/utils/mc-skeleton.js',
);

const dir = process.argv[2];
if (!dir) {
  console.error(
    '用法：node scripts/diagnose-code026-false-positive.mjs <产物目录> [componentId]',
  );
  process.exit(2);
}
if (!fs.existsSync(dir)) {
  console.error(`❌ 目录不存在：${dir}`);
  process.exit(2);
}
if (!fs.existsSync(DIST_VALIDATOR)) {
  console.error(`❌ 未找到 dist 校验器：${DIST_VALIDATOR}\n   请先构建：rm -f tsconfig.build.tsbuildinfo && npm run build`);
  process.exit(2);
}

const { CodeStructureValidator } = await import(DIST_VALIDATOR);
const { checkSkeletonCompleteness } = await import(DIST_SKELETON);

const componentId = process.argv[3] || 'c-diagnose-00000000';

/** 收集产物全量文件（.vue/.less/.css/.js/.json），跳过点目录与 node_modules。 */
function collectAll(root) {
  const out = [];
  const walk = (rel) => {
    const abs = path.join(root, rel);
    if (fs.statSync(abs).isDirectory()) {
      for (const e of fs.readdirSync(abs)) {
        if (e === 'node_modules' || e.startsWith('.')) continue;
        walk(path.join(rel, e));
      }
    } else if (/\.(vue|less|css|js|json)$/i.test(rel)) {
      out.push({ path: rel, content: fs.readFileSync(abs, 'utf-8') });
    }
  };
  for (const e of fs.readdirSync(root)) if (!e.startsWith('.')) walk(e);
  return out;
}

const codes26 = (r) =>
  (r.issues || []).filter((i) => (i.code || i.id || '').includes('CODE-026'));

const full = collectAll(dir);

// 从全量里找出「门禁会报缺失」的骨架文件（= 磁盘上没找到的必需骨架）
const REQUIRED = [
  'resources/config/css-vars.js',
  'resources/styles/common.less',
  'resources/styles/themes/theme-vars.less',
  'resources/styles/themes/dark.less',
  'resources/styles/themes/light.less',
  'resources/styles/index.less',
  'declare.js',
  'declare.json',
];
const present = new Set(full.map((f) => f.path));
const missingOnDisk = REQUIRED.filter(
  (p) => ![...present].some((x) => x === p || x.endsWith(`/${p}`)),
);

console.log('══════════════════════════════════════════════════════════');
console.log(`产物目录：${dir}`);
console.log(`全量产物：${full.length} 个文件`);
console.log('──────────────────────────────────────────────────────────');
console.log('【第 1 判据】必需骨架文件在磁盘上的存在性：');
for (const p of REQUIRED) {
  const ok = !missingOnDisk.includes(p);
  console.log(`  ${ok ? '✅' : '❌'} ${p}`);
}
if (missingOnDisk.length === 0) {
  console.log('  → 全部存在。若门禁报「缺失」，即为**输入集残缺型假阳性**（本脚本主题）。');
} else {
  console.log(`  → 磁盘真的缺 ${missingOnDisk.length} 个 ⇒ 可能是真缺，非本主题。`);
}
console.log('──────────────────────────────────────────────────────────');

// A：模拟「部分写盘清单」——含 package/index.vue + declare.json（CODE-026 由此启用），
//    但不含 missingOnDisk 之外被误剔除的骨架（此处保守用：剔掉 4 个最典型的 identical 文件）
const identicalSuspects = missingOnDisk.length
  ? missingOnDisk
  : [
      'resources/config/css-vars.js',
      'resources/styles/index.less',
      'resources/styles/themes/dark.less',
      'resources/styles/themes/light.less',
    ];
const partial = full.filter((f) => !identicalSuspects.includes(f.path));

// C：模拟「增量校验子集」——变更文件 ∪ {common.less, declare.json}
//    非干跑场景无法知道真实变更集，这里用「骨架缺席 + 业务文件在场」的最坏形态近似
const subset = full.filter(
  (f) =>
    !identicalSuspects.includes(f.path) ||
    f.path.endsWith('common.less') ||
    f.path.endsWith('declare.json'),
);

const A = CodeStructureValidator.validate(partial, componentId, { target: 'microcode' });
const B = CodeStructureValidator.validate(full, componentId, { target: 'microcode' });
const C = CodeStructureValidator.validate(subset, componentId, { target: 'microcode' });
const D = CodeStructureValidator.validate(subset, componentId, {
  target: 'microcode',
  productFiles: full,
});

const row = (tag, r, note) => {
  const n = codes26(r).length;
  console.log(
    `  ${n === 0 ? '✅' : '🔴'} ${tag.padEnd(28)} CODE-026=${n}  issues=${(r.issues || []).length}  ${note}`,
  );
};

console.log('【第 2 判据】A/B 复算（新 dist）：');
row('A 部分写盘清单直传', A, '（旧 state.generatedFiles=writtenFiles）');
row('B 全量产物直传', B, '（刀 10：Object.keys(generatedFiles)）');
row('C 增量子集直传', C, '（旧：整产物检查跑在残缺集）');
row('D 增量子集 + productFiles', D, '（刀 10：整产物检查读全量）');
console.log('──────────────────────────────────────────────────────────');

const toMap = (arr) => Object.fromEntries(arr.map((f) => [f.path, f.content]));
console.log('【第 3 判据】checkSkeletonCompleteness 直测：');
console.log(`  部分清单 → 缺 ${checkSkeletonCompleteness(toMap(partial)).length} 项`);
console.log(`  全量产物 → 缺 ${checkSkeletonCompleteness(toMap(full)).length} 项`);
console.log('══════════════════════════════════════════════════════════');

const fullOk = codes26(B).length === 0;
if (fullOk) {
  console.log('结论：全量路径 CODE-026 = 0 ⇒ 骨架齐备，门禁「缺失」为输入集残缺型假阳性。');
  if (codes26(A).length > 0 || codes26(C).length > 0) {
    console.log(
      '      A/C 仍报 ⇒ 说明「部分写盘清单 / 增量子集」确实会制造误报，必须走全量（刀 10）。',
    );
  }
  process.exit(0);
} else {
  console.log('结论：全量路径仍报 CODE-026 ⇒ 磁盘真缺骨架文件，请检查骨架生成器（buildMcSkeleton）。');
  process.exit(1);
}
