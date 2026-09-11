#!/usr/bin/env node
/**
 * 组件命名一致性只读盘点（naming-audit）
 *
 * 用途：在「任务号不变、目录名 + 规范 ID 统一为 c-*」的改造前后，
 *       判断各 workspace 根里是否存在
 *         ① 同一组件多份副本名字不一致
 *         ② 「编码型目录名」（mc-/mv- + 13 位时间戳）未被归一
 *         ③ declare.componentId 被写回任务号（规范化回退）
 *         ④ 该目录是否已被 git 跟踪（决定存量改名用 mv 还是 git mv）
 *
 * 覆盖的根（family 决定是否参与组件分析）：
 *   component : projectRoot/workspace/{custom,vue3}-components、frontend/workspace/{custom,vue3}-components
 *               （搜索根） + backend-node/workspace/{custom,vue3}-components（非搜索根）
 *   page      : {backend-node,frontend}/workspace/vue3-pages
 *   api-module: frontend/workspace/api-modules
 *   other     : frontend/workspace/custom-panels
 *
 * 只读。不创建、不重命名、不删除任何文件。
 *
 * 用法：
 *   cd backend-node
 *   node scripts/naming-audit.mjs                # 表格输出
 *   node scripts/naming-audit.mjs --json         # 机器可读
 *   node scripts/naming-audit.mjs --limit 40     # 限制清单条数（默认 30）
 *
 * 生产机（先确认路径）：
 *   FRONTEND_WORKSPACE=/home/mvbt/mvgo/frontend/workspace \
 *     node /home/mvbt/mvgo/backend-node/scripts/naming-audit.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..'); // backend-node/
const projectRoot = path.dirname(backendRoot); // 部署根

const jsonMode = process.argv.includes('--json');
const limitIdx = process.argv.indexOf('--limit');
const LIMIT = limitIdx > -1 ? Number(process.argv[limitIdx + 1]) || 30 : 30;

/**
 * 任务号形态（编码型）目录名 / componentId。
 * 覆盖全部历史形态：
 *   mc-lite-<ts>-<hex> / mc-max-<ts>-<hex>   （lite 管线）
 *   mc-<ts>-<hex>                            （phase2 无 tier）
 *   mv-lite-<ts>-<hex> / mv-<ts>-<hex>       （vue3）
 * 判据：以 mc-/mv- 开头 **且** 含 13 位毫秒时间戳。
 */
const ENCODED_RE = /^(mc|mv)-[a-z-]*(\d{13})-[0-9a-f]{4,}$/i;
/** 尾 8 hex（跨副本关联键，与 resolveComponentDirStrict 一致） */
const TAIL_RE = /-([0-9a-f]{8})$/;
/** 规范目录名：c-<语义段>[-<8hex>]，不含 13 位时间戳 */
const SPEC_RE = /^c-[a-z][a-z0-9-]*$/;

const frontendWorkspaceRoot =
  process.env.FRONTEND_WORKSPACE?.trim() || path.join(projectRoot, 'frontend', 'workspace');

/**
 * 全部 workspace 子根。
 *
 * family 说明（决定该根是否参与「组件命名」分析）：
 *   component —— 受本次「目录名 + 规范 ID 统一为 c-*」改造影响，参与尾缀/编码/4a-4c 分析
 *   page      —— 页面骨架，独立命名体系（page-<12hex> + page-meta.json），仅做分布展示
 *   api-module—— 接口生成产物（无 c-/mc- 语义命名），仅做分布展示
 *   other     —— 其他辅助目录，仅做分布展示
 *
 * inSearchRoot: 是否属于 component-resolver.js#componentSearchRoots() 的解析搜索根
 *
 * 🆕 S5（2026-09-10）：`workspaceRoot` 已由 `projectRoot/workspace` 统一到
 *   `backend-node/workspace`，搜索根随之变为
 *   [be/ws/custom, be/ws/vue3, fe/custom, fe/vue3]。
 *   `projectRoot/workspace` 退役（retired: true，不再参与解析），
 *   其残留目录只在 `--scan-retired` / `--include-retired-roots` 场景下清理。
 */
const ROOTS = [
  { key: 'root-ws/custom', family: 'component', inSearchRoot: false, retired: true, label: 'projectRoot/workspace/custom-components [退役根]', dir: path.join(projectRoot, 'workspace', 'custom-components'), twoLevel: false },
  { key: 'root-ws/vue3', family: 'component', inSearchRoot: false, retired: true, label: 'projectRoot/workspace/vue3-components [退役根]', dir: path.join(projectRoot, 'workspace', 'vue3-components'), twoLevel: true },
  { key: 'fe/custom', family: 'component', inSearchRoot: true, label: 'frontend/workspace/custom-components', dir: path.join(frontendWorkspaceRoot, 'custom-components'), twoLevel: false },
  { key: 'fe/vue3', family: 'component', inSearchRoot: true, label: 'frontend/workspace/vue3-components', dir: path.join(frontendWorkspaceRoot, 'vue3-components'), twoLevel: true },
  { key: 'be/ws/custom', family: 'component', inSearchRoot: true, label: 'backend-node/workspace/custom-components [写入根]', dir: path.join(backendRoot, 'workspace', 'custom-components'), twoLevel: false },
  { key: 'be/ws/vue3', family: 'component', inSearchRoot: true, label: 'backend-node/workspace/vue3-components [写入根]', dir: path.join(backendRoot, 'workspace', 'vue3-components'), twoLevel: true },
  { key: 'be/ws/pages', family: 'page', inSearchRoot: false, label: 'backend-node/workspace/vue3-pages [页面骨架]', dir: path.join(backendRoot, 'workspace', 'vue3-pages'), twoLevel: true },
  { key: 'fe/pages', family: 'page', inSearchRoot: false, label: 'frontend/workspace/vue3-pages [页面骨架]', dir: path.join(frontendWorkspaceRoot, 'vue3-pages'), twoLevel: true },
  { key: 'fe/panels', family: 'other', inSearchRoot: false, label: 'frontend/workspace/custom-panels [面板]', dir: path.join(frontendWorkspaceRoot, 'custom-panels'), twoLevel: false },
  { key: 'fe/api-modules', family: 'api-module', inSearchRoot: false, label: 'frontend/workspace/api-modules [接口产物]', dir: path.join(frontendWorkspaceRoot, 'api-modules'), twoLevel: false },
];

/**
 * 实际参与解析的搜索根顺序（与 component-resolver.js#componentSearchRoots() 一致）
 * 🆕 S5：顺序 = customComponentsDir → vue3ComponentsDir → frontendCustom → frontendVue3
 *         （均指向 backend-node/workspace 与 frontend/workspace，不再含退役根）
 */
const SEARCH_ROOT_ORDER = ['be/ws/custom', 'be/ws/vue3', 'fe/custom', 'fe/vue3'];

function readDirSafe(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
  } catch {
    return [];
  }
}

/**
 * 该根有多少内容被所在 git 仓库跟踪。
 * 目的：S4 存量改名若直接批量 mv，会把已入库目录变成「删除 + 新增」，
 *       必须先知道某根是否入库、入库多少，再决定 `git rm -r --cached` 或分批 commit。
 */
function gitTrackedInfo(absDir) {
  if (!fs.existsSync(absDir)) return { tracked: 0, repo: null };
  try {
    const repo = execSync(`git -C "${absDir}" rev-parse --show-toplevel`, {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    const rel = path.relative(repo, absDir) || '.';
    const out = execSync(`git -C "${repo}" ls-files -z -- "${rel}"`, {
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    })
      .toString()
      .split('\0')
      .filter(Boolean);
    return { tracked: out.length, repo: path.basename(repo), files: out };
  } catch {
    return { tracked: 0, repo: null, files: [] };
  }
}

/** 已跟踪内容里的「组件目录名」集合（twoLevel 时取 group/dir） */
function trackedDirNames(info, root) {
  const set = new Set();
  if (!info?.files?.length) return set;
  const relPrefix = path.basename(root.dir);
  for (const f of info.files) {
    const parts = f.split('/');
    const i = parts.indexOf(relPrefix);
    if (i < 0) continue;
    if (root.twoLevel) {
      if (parts[i + 1] && parts[i + 2]) set.add(`${parts[i + 1]}/${parts[i + 2]}`);
    } else if (parts[i + 1]) {
      set.add(parts[i + 1]);
    }
  }
  return set;
}

function collectComponentDirs(root) {
  const out = [];
  for (const entry of readDirSafe(root.dir)) {
    if (entry.name.startsWith('.')) continue;
    if (!root.twoLevel) {
      out.push({ name: entry.name, abs: path.join(root.dir, entry.name) });
      continue;
    }
    for (const sub of readDirSafe(path.join(root.dir, entry.name))) {
      if (sub.name.startsWith('.')) continue;
      out.push({ name: sub.name, abs: path.join(root.dir, entry.name, sub.name), group: entry.name });
    }
  }
  return out;
}

function describe(abs, name) {
  const declPath = path.join(abs, 'declare.json');
  let componentId = null;
  let name_ = null;
  try {
    const d = JSON.parse(fs.readFileSync(declPath, 'utf8'));
    componentId = typeof d.componentId === 'string' ? d.componentId : null;
    name_ = d.name || d.componentName || null;
  } catch {
    /* 无 declare.json 或解析失败 */
  }
  // 目录内最新文件时间（跳过内部目录）
  let newest = 0;
  let newestRel = '';
  const walk = (dir, rel) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (['.snapshots', '.backups', '.cache', '.checkpoint', '.mc-gen', 'node_modules'].includes(e.name)) continue;
      const p = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        walk(p, r);
      } else {
        try {
          const m = fs.statSync(p).mtimeMs;
          if (m > newest) {
            newest = m;
            newestRel = r;
          }
        } catch { /* ignore */ }
      }
    }
  };
  walk(abs, '');
  const tailMatch = name.match(TAIL_RE);
  return {
    name,
    componentId,
    displayName: name_,
    tail: tailMatch ? tailMatch[1] : null,
    encoded: ENCODED_RE.test(name),
    newest,
    newestRel,
    hasArtifact: fs.existsSync(path.join(abs, 'package', 'index.vue')) || fs.existsSync(declPath),
  };
}

// ---------- 采集 ----------
const inventory = {};
for (const root of ROOTS) {
  const gitInfo = gitTrackedInfo(root.dir);
  const trackedNames = trackedDirNames(gitInfo, root);
  const items = collectComponentDirs(root).map((d) => {
    const key = d.group ? `${d.group}/${d.name}` : d.name;
    return { ...describe(d.abs, d.name), group: d.group, gitTracked: trackedNames.has(key) };
  });
  inventory[root.key] = { root, gitInfo, trackedNames, items };
}

// ---------- 分析 ----------
/** 只有 component 族参与命名一致性分析；page / api-module / other 仅做分布展示 */
const componentEntries = Object.entries(inventory).filter(([, v]) => v.root.family === 'component');

const byTail = new Map();
for (const [key, { root, items }] of componentEntries) {
  for (const it of items) {
    if (!it.tail) continue;
    if (!byTail.has(it.tail)) byTail.set(it.tail, []);
    byTail.get(it.tail).push({ rootKey: key, ...it });
  }
}

const crossRootMismatch = []; // 同一尾缀 → 多个不同目录名
for (const [tail, hits] of byTail) {
  const names = new Set(hits.map((h) => h.name));
  if (names.size > 1) crossRootMismatch.push({ tail, hits: hits.sort((a, b) => b.newest - a.newest) });
}
crossRootMismatch.sort((a, b) => (b.hits[0]?.newest || 0) - (a.hits[0]?.newest || 0));

/** 编码型目录名（任务号派生）清单 */
const encodedDirs = [];
/** 4a 🔴 任务号被写进 declare.componentId（规范化被反向覆盖，最严重） */
const idFallenBack = [];
/** 4b ⚠️ 目录名仍是任务号形态，但 declare 已归一（残留老目录，可清理） */
const dirLeftBehind = [];
/** 4c ⚠️ 目录名与 declare 都不含时间戳，但两者不一致（-2/-10 重名后缀） */
const nameDrift = [];
for (const [key, { items }] of componentEntries) {
  for (const it of items) {
    if (it.encoded) encodedDirs.push({ rootKey: key, ...it });
    const idEncoded = it.componentId ? ENCODED_RE.test(it.componentId) : false;
    if (idEncoded) {
      idFallenBack.push({ rootKey: key, ...it });
    } else if (it.componentId && it.componentId !== it.name) {
      if (it.encoded) dirLeftBehind.push({ rootKey: key, ...it });
      else if (!SPEC_RE.test(it.name)) nameDrift.push({ rootKey: key, ...it });
    }
  }
}
encodedDirs.sort((a, b) => b.newest - a.newest);
const byNewest = (a, b) => b.newest - a.newest;
idFallenBack.sort(byNewest);
dirLeftBehind.sort(byNewest);
nameDrift.sort(byNewest);

// ---------- 输出 ----------
const fmtTime = (ms) => {
  if (!ms) return '-';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
const pad = (s, n) => String(s ?? '').padEnd(n);
const short = (s, n) => {
  const v = String(s ?? '');
  return v.length > n ? `${v.slice(0, n - 1)}…` : v;
};
/** 目录名形态标签 */
const kindOf = (it) => (it.encoded ? '任务号名' : SPEC_RE.test(it.name) ? '规范 c-名' : '其他');

if (jsonMode) {
  console.log(JSON.stringify({
    projectRoot,
    backendRoot,
    frontendWorkspaceRoot,
    roots: Object.fromEntries(Object.entries(inventory).map(([k, v]) => [k, {
      label: v.root.label,
      family: v.root.family,
      inSearchRoot: !!v.root.inSearchRoot,
      retired: !!v.root.retired,
      count: v.items.length,
      gitRepo: v.gitInfo?.repo ?? null,
      gitTrackedFiles: v.gitInfo?.tracked ?? 0,
      gitTrackedDirs: v.trackedNames.size,
      gitTrackedComponentDirs: v.items.filter((i) => i.gitTracked).length,
    }])),
    crossRootMismatch,
    encodedDirs,
    idFallenBack,
    dirLeftBehind,
    nameDrift,
  }, null, 2));
  process.exit(0);
}

console.log('\n=== 组件命名一致性盘点（只读） ===');
console.log(`projectRoot          = ${projectRoot}`);
console.log(`backendRoot          = ${backendRoot}`);
console.log(`frontendWorkspace    = ${frontendWorkspaceRoot}`);
console.log(`时间均为本地时间 (${Intl.DateTimeFormat().resolvedOptions().timeZone})`);

console.log('\n--- 1. 各 workspace 根的前缀分布 ---');
console.log('  族: component=受命名改造影响 / page=页面骨架 / api-module=接口产物 / other=辅助');
console.log(`${pad('根', 52)} ${pad('族', 11)} ${pad('总数', 6)} ${pad('任务号名', 10)} ${pad('规范 c- 名', 12)} ${pad('其他', 6)} ${pad('git跟踪目录', 12)} 搜索根`);
for (const [, { root, items, trackedNames }] of Object.entries(inventory)) {
  const enc = items.filter((i) => i.encoded).length;
  const c = items.filter((i) => !i.encoded && SPEC_RE.test(i.name)).length;
  console.log(`${pad(short(root.label, 50), 52)} ${pad(root.family, 11)} ${pad(items.length, 6)} ${pad(enc, 10)} ${pad(c, 12)} ${pad(items.length - enc - c, 6)} ${pad(trackedNames.size, 12)} ${root.inSearchRoot ? '是' : '否'}`);
}

console.log(`\n--- 2. 同一尾缀、多个不同目录名（${crossRootMismatch.length} 组，仅 component 族）---`);
if (!crossRootMismatch.length) console.log('  无');
for (const m of crossRootMismatch.slice(0, LIMIT)) {
  console.log(`\n  尾缀 ${m.tail} —— ${m.hits.length} 份副本，${new Set(m.hits.map((h) => h.name)).size} 种名字`);
  for (const h of m.hits) {
    console.log(`    ${pad(kindOf(h), 10)} ${pad(short(h.name, 40), 42)} ${pad(h.rootKey, 15)} ${pad(fmtTime(h.newest), 15)} ${h.gitTracked ? '[git√]' : '[git×]'} declare=${h.componentId ?? '(无)'}`);
  }
  const inSearch = m.hits
    .filter((h) => SEARCH_ROOT_ORDER.includes(h.rootKey))
    .sort((a, b) => SEARCH_ROOT_ORDER.indexOf(a.rootKey) - SEARCH_ROOT_ORDER.indexOf(b.rootKey));
  console.log(`    → 解析会最先命中: ${inSearch[0]?.name ?? '(无)'}  （来源 ${inSearch[0]?.rootKey ?? '-'}）`);
}

console.log(`\n--- 3. 任务号形态目录名清单（未归一）共 ${encodedDirs.length} 个（仅 component 族）---`);
for (const e of encodedDirs.slice(0, LIMIT)) {
  console.log(`  ${pad(short(e.name, 42), 44)} ${pad(e.rootKey, 15)} ${pad(fmtTime(e.newest), 15)} ${e.gitTracked ? '[git√]' : '[git×]'} declare=${e.componentId ?? '(无)'}`);
}
if (encodedDirs.length > LIMIT) console.log(`  … 其余 ${encodedDirs.length - LIMIT} 个省略（--limit 调整）`);

const section = (title, arr, render) => {
  console.log(`\n--- ${title} 共 ${arr.length} 条 ---`);
  if (!arr.length) {
    console.log('  无');
    return;
  }
  for (const it of arr.slice(0, LIMIT)) render(it);
  if (arr.length > LIMIT) console.log(`  … 其余 ${arr.length - LIMIT} 条省略（--limit 调整）`);
};

section('4a 🔴 declare.componentId 被写成任务号（规范化已回退）', idFallenBack, (f) => {
  console.log(`  ${pad(short(f.name, 42), 44)} ${pad(f.rootKey, 15)} ${pad(fmtTime(f.newest), 15)} ${f.gitTracked ? '[git√]' : '[git×]'}`);
  console.log(`      目录名 = ${f.name}`);
  console.log(`      declare.componentId = ${f.componentId}   ← 应为 c-* 规范 ID`);
});

section('4b ⚠️ 目录名仍是任务号形态，但 declare 已归一（残留老目录）', dirLeftBehind, (f) => {
  console.log(`  ${pad(short(f.name, 42), 44)} ${pad(f.rootKey, 15)} ${pad(fmtTime(f.newest), 15)} ${f.gitTracked ? '[git√]' : '[git×]'} declare=${f.componentId}`);
});

section('4c ⚠️ 目录名与 declare 都不含时间戳但不一致（-2/-10 重名后缀）', nameDrift, (f) => {
  console.log(`  ${pad(short(f.name, 42), 44)} ${pad(f.rootKey, 15)} ${f.gitTracked ? '[git√]' : '[git×]'} declare=${f.componentId}`);
});

// ---------- 5. 非 component 族（不受命名改造影响，但同属 workspace，需知情） ----------
console.log('\n--- 5. 其他命名族（不受本次改造影响）---');
for (const [, { root, items }] of Object.entries(inventory)) {
  if (root.family === 'component') continue;
  console.log(`  ${pad(short(root.label, 50), 52)} 族=${pad(root.family, 11)} 目录 ${pad(items.length, 4)} ${items.length ? `示例: ${items.slice(0, 3).map((i) => i.name).join(', ')}` : ''}`);
}

// ---------- 6. git 跟踪面（决定 S4 存量改名的操作方式） ----------
console.log('\n--- 6. git 跟踪面（S4 存量改名前置条件）---');
let anyTracked = false;
for (const [, { root, gitInfo, trackedNames, items }] of Object.entries(inventory)) {
  const trackedComponentDirs = items.filter((i) => i.gitTracked).length;
  if (!gitInfo?.tracked) continue;
  anyTracked = true;
  console.log(`  ${pad(short(root.label, 50), 52)} repo=${pad(gitInfo.repo, 12)} 跟踪文件 ${pad(gitInfo.tracked, 6)} 其中组件目录 ${trackedComponentDirs}/${items.length}`);
}
if (!anyTracked) console.log('  无任何根被 git 跟踪（可自由 mv）');
else console.log('  ⚠️ 已入库目录批量改名会变成「删除+新增」，须先 `git rm -r --cached <dir>` 或分批 rename commit');

console.log('\n=== 盘点结束（未修改任何文件） ===\n');
