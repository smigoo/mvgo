/**
 * 对齐护栏：批量对真实生成产物跑 mc-check，断言 error = 0。
 *
 * 🔴 为什么必须有这个（2026-10-12 查明）：
 *   mc-check **从不在生成链路里执行** —— 唯一执行者是
 *   `mc-spec.service.ts:377` spawnSync → `POST /api/mc-spec/check`（前端按钮手动触发）。
 *   生成管线跑的是另一套复刻 `mc-health-validator.js`，且
 *   `microcode-engineer.js:8351` 明写「仅记录告警，不 fail-closed 阻断」。
 *   ⇒ 没有自动护栏，任何判据偏离都要靠人记得手动点按钮才能发现。
 *
 * 用法：
 *   node scripts/verify-mc-check-align.mjs [--limit 20] [--dir <路径>]
 *   node scripts/verify-mc-check-align.mjs --component <单个组件绝对路径>
 *
 * ⚠️ 必须逐个 `--component-path`：mc-check 的 `ROOT = path.resolve(__dirname,'../../../..')`
 *   拼出的默认目录（仓库根/src/workspace/custom-components）不存在，裸跑会 ENOENT。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
const CHECK = path.join(REPO, 'backend-node/skills/frontend-mc-check/scripts/mc-check.cjs');

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

const SINGLE = arg('--component', null);
const LIMIT = Number(arg('--limit', '20'));
const DIR = arg('--dir', null);

function collectTargets() {
  if (SINGLE) return [SINGLE];
  const roots = DIR
    ? [DIR]
    : [
        path.join(REPO, 'backend-node/workspace/custom-components'),
        path.join(REPO, 'frontend/workspace/custom-components'),
      ];
  const out = [];
  for (const r of roots) {
    if (!fs.existsSync(r)) continue;
    const dirs = fs
      .readdirSync(r, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => path.join(r, e.name));
    dirs.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    out.push(...dirs);
  }
  return out.slice(0, LIMIT);
}

function runCheck(dir) {
  try {
    const stdout = execFileSync(process.execPath, [CHECK, '--component-path', dir], {
      encoding: 'utf8',
      timeout: 60_000,
    });
    return { stdout };
  } catch (e) {
    // mc-check 对「不允许上线」的组件会走非零退出码
    return { stdout: e.stdout || '', code: e.status };
  }
}

const targets = collectTargets();
if (!targets.length) {
  console.log('ℹ️  未找到可检查的组件目录（用 --dir 或 --component 指定）');
  process.exit(0);
}

console.log(`🔍 mc-check 对齐护栏：检查 ${targets.length} 个组件\n`);

const failByItem = new Map(); // 检查项ID -> 次数
const failBySample = new Map(); // 检查项ID -> 示例消息
const failComponents = [];

for (const dir of targets) {
  const name = path.basename(dir);
  const { stdout } = runCheck(dir);
  const m = stdout.match(/通过:(\d+)\s+失败:(\d+)/);
  const pass = m ? Number(m[1]) : -1;
  const fail = m ? Number(m[2]) : -1;
  if (fail === 0 && pass >= 0) {
    console.log(`  ✅ ${name.padEnd(38)} 通过:${pass} 失败:0`);
    continue;
  }
  failComponents.push({ name, pass, fail, dir });
  console.log(`  ❌ ${name.padEnd(38)} 通过:${pass} 失败:${fail}`);
  for (const line of stdout.split('\n')) {
    const im = line.match(/\[([MQ]\d+(?:-[a-z0-9]+)?)\]\s*(.+)$/i);
    if (im) {
      failByItem.set(im[1], (failByItem.get(im[1]) || 0) + 1);
      if (!failBySample.has(im[1])) failBySample.set(im[1], im[2].slice(0, 120));
    }
  }
}

const total = targets.length;
const clean = total - failComponents.length;
console.log(`\n📊 汇总：共 ${total} 个，合规 ${clean} 个，不合规 ${failComponents.length} 个`);

if (failByItem.size) {
  console.log('\n🔴 按检查项聚合（Top 10）：');
  const top = [...failByItem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [id, cnt] of top) {
    console.log(`   ${id.padEnd(10)} ×${String(cnt).padEnd(4)} ${failBySample.get(id)}`);
  }
  console.log('\n💡 对照 docs/管线侧对齐mc-check改造方案.md 的待办项处理。');
}

process.exit(failComponents.length ? 1 : 0);