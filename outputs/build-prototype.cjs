#!/usr/bin/env node
/* =====================================================================
 * build-prototype.cjs —— 「扫描产物 → 原型」注入链 + 漂移守卫
 *
 * 为什么存在：
 *   原型 HTML 里的 `SCAN` / `EP` 数据块原先靠**手抄**扫描产物。样本一变、
 *   扫描重跑，原型就静默说旧数字（本仓曾出现「样本目录 154 个文件」这种
 *   把子目录数字当整仓口径的错）。本脚本把该块变成**机器生成 + 可校验**：
 *   所有数字只有一个来源 —— outputs/<scan>/spec/ 下的真实产物。
 *
 * 用法：
 *   node outputs/build-prototype.cjs --write    # 重新生成并写回原型
 *   node outputs/build-prototype.cjs --check    # 只比对：漂移则 exit 1（CI/自检用）
 *   可选：--scan-dir <目录>（默认 outputs/2026-11-04-s0-scan）
 *         --html <文件>   （默认 outputs/2026-11-04-端到端开发工作台原型.html）
 *
 * 退出码：0 = 一致 / 通过；1 = 漂移；2 = 用法或产物缺失
 * ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const BEGIN = '/* ===== PROTO-DATA:BEGIN =====';
const END = '/* ===== PROTO-DATA:END ===== */';

const ARGS = process.argv.slice(2);
const MODE = ARGS.includes('--write') ? 'write' : ARGS.includes('--check') ? 'check' : null;
if (!MODE) {
  console.error('用法: node outputs/build-prototype.cjs --write | --check');
  process.exit(2);
}
function argOf(name, dflt) {
  const i = ARGS.indexOf(name);
  return i >= 0 && ARGS[i + 1] ? ARGS[i + 1] : dflt;
}
const REPO = path.resolve(__dirname, '..');
const SCAN_DIR = path.resolve(REPO, argOf('--scan-dir', 'outputs/2026-11-04-s0-scan'));
const HTML_PATH = path.resolve(REPO, argOf('--html', 'outputs/2026-11-04-端到端开发工作台原型.html'));

/* ---------- 读产物（唯一数据来源） ---------- */
// 仓外路径别渲染成 ../../../../ 一串，直接给绝对路径
function shown(p) {
  const r = path.relative(REPO, p);
  return r.startsWith('..') ? p : r;
}
function readJSON(p) {
  if (!fs.existsSync(p)) {
    console.error('✗ 产物缺失：' + p + '\n  先跑：node outputs/s0-scan.cjs /Users/smigoo/工作/test --out ' + shown(SCAN_DIR));
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const manifest = readJSON(path.join(SCAN_DIR, 'spec/project.manifest.json'));
const endpoints = readJSON(path.join(SCAN_DIR, 'spec/endpoints.json'));
const conflictsMd = fs.readFileSync(path.join(SCAN_DIR, 'spec/conflicts.md'), 'utf8');

/* ---------- 派生（每项都指向产物里的具体字段，零手抄） ---------- */
const S0 = manifest.S0;
const S1 = manifest.S1;

// conflicts.md §四 的条目数：`### N.` 计数（结构化解析，不读渲染文案）
function countConflictEntries(md) {
  let inSec = false;
  let n = 0;
  for (const line of md.split('\n')) {
    if (/^##\s*四、/.test(line)) { inSec = true; continue; }
    if (inSec && /^##\s/.test(line)) break;
    if (inSec && /^###\s+\d+\./.test(line)) n++;
  }
  return n;
}
// §四 标题自述的条数 `（N 条）` —— 与条目实数交叉校验用
function declarationInHeading(md) {
  const m = md.match(/^##\s*四、[^\n]*?（(\d+)\s*条）/m);
  return m ? Number(m[1]) : null;
}

const gapBlocker = (S1.gaps || []).filter((g) => g.severity === 'blocker');
// 只读自证：扫描器自己在开始/结束各拍一次目录快照并比对（S0.readOnly），
// 以及目录足迹（S0.footprint）。原型里「共 189 个文件 … 0 个被改」由此而来，
// 不再是手写数字。
const footprint = S0.footprint || null;
const readOnly = S0.readOnly || null;
// S0 坑位缺口数与声明层未决项数：原型里「6 个坑位命中 5 个」「下面 3 项」的两个数
const slotMissing = (S0.missing || []).length;
const pjUndecided = ((S0.projectJson && S0.projectJson.undecided) || []).length;
/* 信封口径：读三级来源判定（S1.envelope），不再直接采信探测值。
 * 只有 source==='declared' 才算真值；detected / default 一律按「待追认」展示。
 * 旧 manifest 无 S1.envelope 时退到 envelopeShapes[0]，并显式标成未证实。 */
const envResolved = S1.envelope || (S1.envelopeShapes && S1.envelopeShapes.length
  ? { source: 'detected-未证实', confirmed: false, keys: S1.envelopeShapes[0].keys,
      successCode: null, detected: S1.envelopeShapes[0], declared: null }
  : null);
const repo0 = (S0.git && S0.git.repos && S0.git.repos[0]) || null;
const protoEndpoints = endpoints.endpoints.filter((e) => e.sources.includes('prototype'));

// 证据条目（file:line → path）与三源前缀：原型里那几行「实测证据」单元格以前是手抄的
const feEv = (endpoints.fullEvidence.frontend || []).map((e) => ({
  p: e.path, v: e.verb, f: e.file, l: e.line
}));
const beEv = endpoints.fullEvidence.backend || [];
const firstSeg = (p) => {
  const s = String(p || '').split('/').filter(Boolean);
  return s.length ? '/' + s[0] : null;
};
const prefixes = {
  declared: S1.alignment.declaredPrefix || null,
  fe: feEv.length ? firstSeg(feEv[0].p) : null,
  be: beEv.length ? (beEv[0].classPrefix || firstSeg(beEv[0].p)) : null
};

const SCAN = {
  root: manifest.projectRoot,
  at: manifest.scannedAt,
  doc: {
    files: S1.sources.doc.files.length,
    lines: S1.sources.doc.textLines,
    hits: S1.sources.doc.endpoints
  },
  proto: {
    pages: S0.html.pages.length,
    scripts: S0.html.scriptFiles.length,
    libs: S0.html.visualLibs.length,
    hits: endpoints.fullEvidence.prototype.length,
    unique: protoEndpoints.length,
    filtered: endpoints.fullEvidence.prototypeFilteredNonApi.length
  },
  fe: { files: S1.sources.frontend.files, hits: S1.sources.frontend.endpoints },
  be: { files: S1.sources.backend.files.length, hits: S1.sources.backend.endpoints },
  envelope: envResolved
    ? {
        source: envResolved.source,
        confirmed: !!envResolved.confirmed,
        keys: envResolved.keys || [],
        successCode: (envResolved.successCode === undefined ? null : envResolved.successCode),
        file: envResolved.detected ? envResolved.detected.file : null
      }
    : null,
  git: repo0
    ? {
        repos: S0.git.repos.length,
        path: repo0.path,
        branch: repo0.branch,
        origin: String(repo0.origin || '').replace(/^https?:\/\//, '')
      }
    : null,
  blocker: gapBlocker.length,
  conflicts: countConflictEntries(conflictsMd),
  prefixes: prefixes,
  feEv: feEv,
  footprint: footprint
    ? {
        all: footprint.allFiles,
        tree: footprint.treeFiles,
        work: footprint.work,
        dsStore: footprint.dsStore,
        git: footprint.gitInternals,
        truncated: !!footprint.truncated
      }
    : null,
  readOnly: readOnly
    ? { changed: readOnly.changed, added: readOnly.added, removed: readOnly.removed, modified: readOnly.modified }
    : null,
  slots: { missing: slotMissing },
  pjUndecided: pjUndecided
};

const EP = endpoints.endpoints.map((e) => ({
  p: e.path,
  v: e.verb,
  src: e.sources,
  conf: e.confidence,
  flags: e.flags
}));

const GAP_ID = gapBlocker.length ? gapBlocker[0].id : null;

/* ---------- 渲染成原型里的 JS 字面量块 ---------- */
const q = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
const qn = (s) => (s === null || s === undefined ? 'null' : q(s));
const qa = (a) => '[' + a.map(q).join(',') + ']';

function renderScan() {
  const L = [];
  L.push('var SCAN={');
  L.push(' root:' + q(SCAN.root) + ',');
  L.push(' at:' + q(SCAN.at) + ',');
  L.push(' doc:{files:' + SCAN.doc.files + ',lines:' + SCAN.doc.lines + ',hits:' + SCAN.doc.hits + '},');
  L.push(' proto:{pages:' + SCAN.proto.pages + ',scripts:' + SCAN.proto.scripts + ',libs:' + SCAN.proto.libs
    + ',hits:' + SCAN.proto.hits + ',unique:' + SCAN.proto.unique + ',filtered:' + SCAN.proto.filtered + '},');
  L.push(' fe:{files:' + SCAN.fe.files + ',hits:' + SCAN.fe.hits + '},');
  L.push(' be:{files:' + SCAN.be.files + ',hits:' + SCAN.be.hits + '},');
  L.push(' envelope:' + (SCAN.envelope
    ? '{source:' + q(SCAN.envelope.source) + ',confirmed:' + SCAN.envelope.confirmed
      + ',keys:' + qa(SCAN.envelope.keys)
      + ',successCode:' + qn(SCAN.envelope.successCode === null ? null : String(SCAN.envelope.successCode))
      + ',file:' + qn(SCAN.envelope.file) + '}'
    : 'null') + ',');
  L.push(' git:' + (SCAN.git
    ? '{repos:' + SCAN.git.repos + ',path:' + q(SCAN.git.path) + ',branch:' + q(SCAN.git.branch)
      + ',origin:' + q(SCAN.git.origin) + '}'
    : 'null') + ',');
  L.push(' blocker:' + SCAN.blocker + ', conflicts:' + SCAN.conflicts + ',');
  L.push(' prefixes:{declared:' + qn(SCAN.prefixes.declared) + ',fe:' + qn(SCAN.prefixes.fe)
    + ',be:' + qn(SCAN.prefixes.be) + '},');
  L.push(' footprint:' + (SCAN.footprint
    ? '{all:' + SCAN.footprint.all + ',tree:' + SCAN.footprint.tree + ',work:' + SCAN.footprint.work
      + ',dsStore:' + SCAN.footprint.dsStore + ',git:' + SCAN.footprint.git
      + ',truncated:' + SCAN.footprint.truncated + '}'
    : 'null') + ',');
  L.push(' readOnly:' + (SCAN.readOnly
    ? '{changed:' + SCAN.readOnly.changed + ',added:' + SCAN.readOnly.added
      + ',removed:' + SCAN.readOnly.removed + ',modified:' + SCAN.readOnly.modified + '}'
    : 'null') + ',');
  L.push(' slots:{missing:' + SCAN.slots.missing + '}, pjUndecided:' + SCAN.pjUndecided + ',');
  L.push(' feEv:' + (SCAN.feEv.length
    ? '[\n' + SCAN.feEv.map((e) => '  {p:' + q(e.p) + ',v:' + q(e.v) + ',f:' + q(e.f) + ',l:' + e.l + '}').join(',\n') + '\n ]'
    : '[]'));
  L.push('};');
  return L.join('\n');
}

/* S2 前置 blocker 与其证据：以前是 HTML 里一段手写注释 + `var GAP='...'` 硬编码 */
function renderGap() {
  if (!GAP_ID) return '/* 本次扫描无 severity=blocker 的缺口 ⇒ 不阻塞 S2 */\nvar GAP=null;';
  return [
    '/* =====================================================================',
    ' * S2 前置 blocker = ' + GAP_ID + '（manifest.S1.gaps 里 severity=blocker 的首项）',
    ' * 实测证据：需求文档正文 ' + SCAN.doc.lines + ' 行、端点命中 ' + SCAN.doc.hits + ' 处',
    ' * 后果：第五处对账（REQUIREMENTS.md ↔ OAS paths 双向差集为空）不可能成立',
    ' *       —— 对账要的是「两边都非空且相等」，空集一侧没有差集可言',
    ' * 扫描器只报 blocker + 三个选项（GAP_OPTS），不替用户选。',
    ' * ===================================================================== */',
    'var GAP=' + q(GAP_ID) + ';'
  ].join('\n');
}

function renderEP() {
  const L = [];
  L.push('/* src=来源（去重后唯一点端点），flags=扫描器给的标记，name 留空等 S2 由 LLM 回填 */');
  L.push('var EP=[');
  EP.forEach(function (e, i) {
    L.push(' {p:' + q(e.p) + ',v:' + q(e.v) + ',src:' + qa(e.src) + ',conf:' + q(e.conf)
      + ',flags:' + qa(e.flags) + '}' + (i === EP.length - 1 ? '' : ','));
  });
  L.push('];');
  return L.join('\n');
}

function renderBlock() {
  return [
    BEGIN,
    ' * 本块由 `outputs/build-prototype.cjs` 从 `outputs/2026-11-04-s0-scan/spec/` 的真实',
    ' * 扫描产物生成 —— 不是手抄的。复现：',
    ' *   node outputs/s0-scan.cjs /Users/smigoo/工作/test --out outputs/2026-11-04-s0-scan',
    ' *   node outputs/build-prototype.cjs --write',
    ' * 漂移守卫（任一数字与产物不符即非零退出）：',
    ' *   node outputs/build-prototype.cjs --check',
    ' * ⚠️ 禁止手工编辑本块 —— 会被下次 --write 覆盖。样本目录全程只读，一个字节未改。',
    ' * ===== */',
    renderScan(),
    renderEP(),
    renderGap(),
    END
  ].join('\n');
}

/* ---------- 拼装 / 比对 ---------- */
const html = fs.readFileSync(HTML_PATH, 'utf8');
const i0 = html.indexOf(BEGIN);
const i1 = html.indexOf(END);
if (i0 < 0 || i1 < 0 || i1 < i0) {
  console.error('✗ ' + path.relative(REPO, HTML_PATH) + ' 里找不到 PROTO-DATA 标记');
  process.exit(2);
}
const i1e = i1 + END.length;
const current = html.slice(i0, i1e);
const next = renderBlock();

/* 附带的交叉校验：§四 标题自述条数 vs 条目实数 */
const declared = declarationInHeading(conflictsMd);
const crossWarn = declared !== null && declared !== SCAN.conflicts
  ? '⚠️ conflicts.md §四 标题自称 ' + declared + ' 条，实际 ' + SCAN.conflicts + ' 条（产物内部不自洽）'
  : null;

if (MODE === 'check') {
  const problems = [];
  if (current !== next) {
    const a = current.split('\n');
    const b = next.split('\n');
    const diffs = [];
    for (let i = 0; i < Math.max(a.length, b.length) && diffs.length < 8; i++) {
      if (a[i] !== b[i]) diffs.push('  L' + (i + 1) + '\n    - ' + (a[i] === undefined ? '<缺失>' : a[i]) + '\n    + ' + (b[i] === undefined ? '<缺失>' : b[i]));
    }
    problems.push('✗ 原型数据块与扫描产物漂移（' + diffs.length + ' 处起）：\n' + diffs.join('\n'));
  }
  if (crossWarn) problems.push('✗ ' + crossWarn);
  if (problems.length) {
    console.error(problems.join('\n'));
    // 处方按病因给：数据块漂移才补写，产物内部不自洽必须改 conflicts.md 本身
    if (current !== next) console.error('\n修法：node outputs/build-prototype.cjs --write');
    if (crossWarn) {
      console.error('\n修法：--write 治不了这个 —— ' + shown(path.join(SCAN_DIR, 'spec/conflicts.md'))
        + ' 的 §四 标题与「### N.」条目实数必须一致，改产物本身（改标题或补/删条目）');
    }
    process.exit(1);
  }
  const ok = '✓ 原型数据块与扫描产物一致：' + SCAN.proto.unique + ' 个唯一点端点 / ' + EP.length
    + ' 条对齐记录 / blocker ' + SCAN.blocker + ' / 冲突 ' + SCAN.conflicts
    + '（GAP=' + GAP_ID + '）';
  console.log(ok);
  if (crossWarn) console.log(crossWarn);
  process.exit(0);
}

const out = html.slice(0, i0) + next + html.slice(i1e);
fs.writeFileSync(HTML_PATH, out, 'utf8');
console.log('✓ 已回写 ' + shown(HTML_PATH));
console.log('  SCAN: proto.unique=' + SCAN.proto.unique + ' proto.hits=' + SCAN.proto.hits
  + ' blocker=' + SCAN.blocker + ' conflicts=' + SCAN.conflicts);
console.log('  EP: ' + EP.length + ' 条（' + EP.map(function (e) { return e.src.join('+'); }
  ).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(' / ') + '）');
if (crossWarn) console.log(crossWarn);
