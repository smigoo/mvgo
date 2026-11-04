#!/usr/bin/env node
/* ============================================================================
 * s0-scan.cjs — 工坊端到端自动开发 · S0/S1 零依赖扫描器
 * ----------------------------------------------------------------------------
 * 用法:
 *   node s0-scan.cjs <项目目录> [--out <输出目录>]
 *
 * 职责（对应九阶段流水线 S0 输入准入 + S1 多源对齐）:
 *   S0 坑位识别 —— 按「特征」识别 docs / html / frontend / backend /
 *                  mvgo.project.json / .git 六个坑位，缺什么如实记录。
 *   S1 端点抽取 —— 四源抽取并三方对齐：
 *                  ① 需求文档(docx 正文，零依赖解 ZIP) ② 原型 HTML/JS
 *                  ③ 前端 api 封装 ④ 后端 controller
 *
 * 铁律:
 *   · 只读输入目录（一个字节都不写），全部产物写到 --out。
 *   · 零 npm 依赖（docx 用内置 zlib 自解 ZIP，不依赖系统 unzip）。
 *   · 判据可辩驳：每个结论都带「证据文件 + 行号 + 原文」。
 *   · 发现靠特征，覆盖靠声明 —— mvgo.project.json 缺失时不得瞎猜。
 *
 * 产物（镜像设计里的 .gen/ 结构）:
 *   <out>/spec/project.manifest.json   S0 坑位识别 + S1 抽源统计 + 缺失清单
 *   <out>/spec/endpoints.json          S1 四源端点 + 来源 + 置信度 + 标记
 *   <out>/spec/conflicts.md            必须由人裁决的冲突（不自动选择）
 *   <out>/doc/REQUIREMENTS.draft.md    前后端需求唯一源 · 草稿
 *
 * 明确不产出的文件:
 *   <out>/spec/decisions.md            人裁决留痕。本脚本只读它的存在性做交叉引用，
 *                                      绝不生成 / 覆盖 —— 否则人裁决会被下一次重跑抹掉。
 * ==========================================================================*/

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

/* ---------------------------------------------------------------- CLI ---- */

const argv = process.argv.slice(2);
const projArg = argv.find((a) => !a.startsWith('--'));
let outArg = null;
for (let i = 0; i < argv.length; i++) if (argv[i] === '--out') outArg = argv[i + 1];

if (!projArg) {
  console.error('用法: node s0-scan.cjs <项目目录> [--out <输出目录>]');
  process.exit(2);
}
const ROOT = path.resolve(projArg);
if (!fs.existsSync(ROOT) || !fs.statSync(ROOT).isDirectory()) {
  console.error('[S0] 不是目录: ' + ROOT);
  process.exit(2);
}
const OUT = outArg ? path.resolve(outArg) : path.join(process.cwd(), 's0-scan-out');

const rel = (p) => (path.relative(ROOT, p) || '.');
const nowISO = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

/* ------------------------------------------------------------- 工具 ----- */

const SKIP_DIR = new Set([
  'node_modules', '.git', 'dist', '.gen', 'target', 'build',
  '.idea', '.vscode', 'coverage', '.cache',
]);

function walk(dir, filter, acc) {
  acc = acc || [];
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return acc; }
  for (const e of ents) {
    if (SKIP_DIR.has(e.name)) continue;
    if (e.name === '.DS_Store') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, filter, acc);
    else if (!filter || filter(full)) acc.push(full);
  }
  return acc;
}

const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return ''; } };
const exists = (p) => { try { return fs.existsSync(p); } catch (e) { return false; } };

/* ---------- 只读自证：扫描前后各拍一次目录快照，比出「零改动」 ----------
 * 为什么存在：原型里「样本目录 0 个被新建或修改」原先是一句手写话 —— 它自证不了。
 * 现在扫描器在**开始与结束各拍一次**（相对路径 → `size:mtimeMs`），再比
 * 新增 / 删除 / 改动 三项。全 0 才算「只读」；非 0 如实报出，绝不粉饰。
 * 口径说明：`walk()` 会跳过 .git/dist/target 等，本函数**不跳**（否则「共 N 个
 * 文件」与 `find` 数不一致）；.git 内部单独计数，且同样参与比对 —— 承诺不碰它，
 * 就该被验。超大目录（如 node_modules）另设上限并置 truncated。
 */
const MAX_SNAP = 200000;
function snapshotTree(root) {
  const entries = new Map();
  const acc = { work: 0, dsStore: 0, gitInternals: 0, truncated: false };
  function rec(dir) {
    if (entries.size >= MAX_SNAP) { acc.truncated = true; return; }
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === '.git') {
          (function recGit(d) {
            let es;
            try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (err) { return; }
            for (const x of es) {
              const f2 = path.join(d, x.name);
              if (x.isDirectory()) { recGit(f2); continue; }
              if (!x.isFile()) continue;
              acc.gitInternals++;
              try {
                const st = fs.statSync(f2);
                entries.set(path.relative(root, f2), st.size + ':' + st.mtimeMs);
              } catch (err) { /* 拍不到就少一条，比对会表现为差异，不静默 */ }
            }
          })(full);
          continue;
        }
        rec(full);
        continue;
      }
      if (!e.isFile()) continue;
      if (e.name === '.DS_Store') acc.dsStore++; else acc.work++;
      try {
        const st = fs.statSync(full);
        entries.set(path.relative(root, full), st.size + ':' + st.mtimeMs);
      } catch (err) { /* 同上 */ }
    }
  }
  rec(root);
  return {
    entries,
    work: acc.work,
    dsStore: acc.dsStore,
    gitInternals: acc.gitInternals,
    treeFiles: acc.work + acc.dsStore,
    allFiles: acc.work + acc.dsStore + acc.gitInternals,
    truncated: acc.truncated,
  };
}

function diffSnapshots(a, b) {
  let added = 0, removed = 0, modified = 0;
  for (const [k, v] of b.entries) {
    if (!a.entries.has(k)) added++;
    else if (a.entries.get(k) !== v) modified++;
  }
  for (const k of a.entries.keys()) if (!b.entries.has(k)) removed++;
  return { added, removed, modified, changed: added + removed + modified };
}


/* 零依赖 ZIP 读取：只解 word/document.xml */
function readZipEntry(buf, entryName) {
  let eocd = -1;
  const floor = Math.max(0, buf.length - 22 - 65536);
  for (let i = buf.length - 22; i >= floor; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const cdCount = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < cdCount; n++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const cmtLen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const fname = buf.toString('utf8', off + 46, off + 46 + nameLen);
    if (fname === entryName) {
      const lNameLen = buf.readUInt16LE(lho + 26);
      const lExtraLen = buf.readUInt16LE(lho + 28);
      const start = lho + 30 + lNameLen + lExtraLen;
      const data = buf.subarray(start, start + compSize);
      try {
        if (method === 0) return data.toString('utf8');
        if (method === 8) return zlib.inflateRawSync(data).toString('utf8');
      } catch (e) { return null; }
      return null;
    }
    off += 46 + nameLen + extraLen + cmtLen;
  }
  return null;
}

function xmlToText(xml) {
  return xml
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function readDocx(file) {
  let buf;
  try { buf = fs.readFileSync(file); } catch (e) { return ''; }
  const xml = readZipEntry(buf, 'word/document.xml');
  return xml ? xmlToText(xml) : '';
}

/* ============================ S0 坑位识别 ================================ */

function stageS0() {
  const slots = {};
  const missing = [];

  /* docs/** —— 唯一必需 */
  const docsDir = path.join(ROOT, 'docs');
  const docFiles = walk(docsDir, (f) => /\.(docx|doc|md|markdown|txt|pdf)$/i.test(f));
  slots.docs = {
    required: true,
    found: docFiles.length > 0,
    dir: exists(docsDir) ? 'docs/' : null,
    files: docFiles.map((f) => ({ path: rel(f), bytes: fs.statSync(f).size })),
  };
  if (!docFiles.length) {
    missing.push({ slot: 'docs', level: 'required', why: 'docs/ 下无 .docx/.md/.pdf，需求唯一源缺失' });
  }

  /* html/** —— 端点候选 + 视觉锚点 */
  const htmlDir = path.join(ROOT, 'html');
  const htmlPages = walk(htmlDir, (f) => /\.html?$/i.test(f));
  const htmlScripts = walk(htmlDir, (f) => /\.(js|mjs)$/i.test(f) && !/\.bak[-.]/i.test(f));
  const htmlLibs = walk(htmlDir, (f) => /(echarts|vue\.global|chart\.min)/i.test(f));
  const bakFiles = walk(htmlDir, (f) => /\.bak[-.]/i.test(f));
  slots.html = {
    required: false,
    found: htmlPages.length > 0,
    dir: exists(htmlDir) ? 'html/' : null,
    pages: htmlPages.map((f) => ({ path: rel(f), bytes: fs.statSync(f).size })),
    scriptFiles: htmlScripts.map((f) => ({ path: rel(f), bytes: fs.statSync(f).size })),
    visualLibs: htmlLibs.map((f) => ({ path: rel(f), bytes: fs.statSync(f).size })),
    backupFiles: bakFiles.length,
    featureHit: htmlLibs.length
      ? 'echarts / vue.global 全局包存在 ⇒ 判定为「可运行原型」而非设计稿'
      : '未见可视化库 ⇒ 视觉锚点强度弱',
  };
  if (!htmlPages.length) {
    missing.push({ slot: 'html', level: 'optional', why: 'html/ 下无页面 ⇒ 视觉锚点与端点候选双缺' });
  }

  /* frontend/** —— S4 落点（特征：package.json 出现 vite） */
  const feDir = path.join(ROOT, 'frontend');
  const fePkgs = walk(feDir, (f) => /package\.json$/i.test(f));
  const feBases = fePkgs.map((f) => {
    let name = null; let vite = false;
    try {
      const j = JSON.parse(read(f));
      name = j.name || null;
      const deps = Object.assign({}, j.dependencies, j.devDependencies);
      vite = Object.keys(deps).some((d) => d === 'vite' || d.startsWith('@vitejs/'));
    } catch (e) { /* 解析失败如实记录 */ }
    return { dir: path.dirname(rel(f)) || '.', name, vite, parsed: name !== null };
  });
  slots.frontend = {
    required: false,
    found: fePkgs.length > 0,
    dir: exists(feDir) ? 'frontend/' : null,
    bases: feBases,
    verdict: feBases.some((b) => b.vite) ? 'vite 工程 ⇒ 可作为 S4 落点'
      : (fePkgs.length ? '有 package.json 但未见 vite' : '无 package.json ⇒ S4 无落点'),
  };
  if (!fePkgs.length) {
    missing.push({ slot: 'frontend', level: 'required-for-S4', why: 'frontend/ 无 package.json ⇒ S4 无落点' });
  }

  /* backend/** —— S5 落点（特征：pom.xml + spring-boot） */
  const beDir = path.join(ROOT, 'backend');
  const poms = walk(beDir, (f) => /pom\.xml$/i.test(f));
  const beBases = poms.map((f) => {
    const s = read(f);
    return {
      dir: path.dirname(rel(f)) || '.',
      artifactId: (s.match(/<artifactId>([^<]+)<\/artifactId>/) || [])[1] || null,
      springBoot: /spring-boot/i.test(s),
      javaVersion: (s.match(/<java\.version>([^<]+)</) || [])[1]
        || (s.match(/<maven\.compiler\.source>([^<]+)</) || [])[1] || null,
    };
  });
  slots.backend = {
    required: false,
    found: poms.length > 0,
    dir: exists(beDir) ? 'backend/' : null,
    bases: beBases,
    verdict: beBases.some((b) => b.springBoot) ? 'spring-boot 工程 ⇒ 可作为 S5 落点'
      : (poms.length ? '有 pom 但未见 spring-boot' : '无 pom ⇒ S5 无落点'),
  };
  if (!poms.length) {
    missing.push({ slot: 'backend', level: 'required-for-S5', why: 'backend/ 无 pom.xml ⇒ S5 无落点' });
  }

  /* mvgo.project.json —— 外链 + 口径声明 */
  const projJsonPath = path.join(ROOT, 'mvgo.project.json');
  let projJson = null;
  if (exists(projJsonPath)) {
    try { projJson = JSON.parse(read(projJsonPath)); }
    catch (e) { projJson = { __parseError: String(e.message) }; }
  }
  // 未决项按「实际声明了什么」现算：声明了就不再是未决项（旧版是写死的三项常量，
  // 声明了也不消失 ⇒ 消费方永远以为缺，属「只登记不消费」）。
  const pj = projJson && !projJson.__parseError ? projJson : null;
  const has = (v) => typeof v === 'string' && v.length > 0;
  const undecided = [];
  if (!(pj && pj.delivery && has(pj.delivery.branch))) undecided.push('delivery.branch（交付目标分支）');
  if (!(pj && pj.responseEnvelope && typeof pj.responseEnvelope === 'object')) undecided.push('responseEnvelope（响应信封口径）');
  if (!(pj && pj.links && (pj.links.figma || pj.links.apifox))) undecided.push('links.figma / links.apifox（外链）');
  slots.projectJson = {
    required: false,
    found: exists(projJsonPath),
    path: 'mvgo.project.json',
    content: projJson,
    parseError: pj ? null : (projJson ? projJson.__parseError : null),
    undecided: undecided,
  };
  if (!exists(projJsonPath)) {
    missing.push({
      slot: 'mvgo.project.json', level: 'declaration',
      why: '未声明 ⇒ 交付分支 / 信封口径 / 外链 ' + undecided.length
        + ' 项只能全部抛给用户选，禁止内置默认值蒙混',
    });
  } else if (undecided.length) {
    missing.push({
      slot: 'mvgo.project.json', level: 'declaration',
      why: '已声明但仍有 ' + undecided.length + ' 项未给值：' + undecided.join('、'),
    });
  }

  /* .git —— 多仓交付：逐仓探测 */
  const gitRepos = [];
  (function findGit(dir, depth) {
    if (depth > 3) return;
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      if (!e.isDirectory()) continue;
      if (e.name === 'node_modules' || e.name === 'target' || e.name === 'dist') continue;
      const full = path.join(dir, e.name);
      if (e.name === '.git') {
        const r = { path: rel(dir) === '.' ? '(顶层)' : rel(dir) };
        const headFile = path.join(full, 'HEAD');
        if (exists(headFile)) {
          const head = read(headFile).trim();
          r.head = head;
          r.branch = head.startsWith('ref: ') ? head.slice(5).replace('refs/heads/', '') : '(detached)';
        }
        const cfg = read(path.join(full, 'config'));
        const m = cfg.match(/\[remote "origin"\][\s\S]*?url\s*=\s*(\S+)/);
        if (m) r.origin = m[1];
        gitRepos.push(r);
        continue;
      }
      findGit(full, depth + 1);
    }
  })(ROOT, 0);

  slots.git = {
    repos: gitRepos,
    multiRepo: gitRepos.length > 1,
    verdict: gitRepos.length === 0 ? '无 .git ⇒ S8 无可提交目标'
      : (gitRepos.length === 1 ? '单仓' : '多仓 ⇒ S8 必须逐仓提交'),
  };
  if (!gitRepos.length) {
    missing.push({ slot: '.git', level: 'required-for-S8', why: '全项目无 .git ⇒ S8 交付无落点' });
  }

  slots.missing = missing;
  slots.gate = missing.filter((m) => m.level === 'required').length === 0 ? 'PASS' : 'BLOCK';
  return slots;
}

/* ============================ S1 端点抽取 ================================ */

const API_LIKE = /\/api\//i;

function collectAbsPathLiterals(file) {
  const lines = read(file).split('\n');
  const re = /['"`](\/[A-Za-z0-9_\-/@{}.:$]{4,})['"`]/g;
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    let m; re.lastIndex = 0;
    while ((m = re.exec(lines[i])) !== null) hits.push({ raw: m[1], file, line: i + 1 });
  }
  return hits;
}

function extractFromPrototype() {
  const dir = path.join(ROOT, 'html');
  const files = walk(dir, (f) => /\.(js|mjs|html?)$/i.test(f) && !/\.bak[-.]/i.test(f));
  const api = []; const other = [];
  for (const f of files) {
    for (const h of collectAbsPathLiterals(f)) {
      const p = h.raw.replace(/[?#].*$/, '').replace(/\/+$/, '') || h.raw;
      const rec = { path: p, file: rel(h.file), line: h.line, raw: h.raw, verb: 'ANY' };
      if (API_LIKE.test(p)) api.push(rec); else other.push(rec);
    }
  }
  return { api, other, scannedFiles: files.map(rel) };
}

function extractFromFrontend() {
  const dir = path.join(ROOT, 'frontend');
  const files = walk(dir, (f) => /\.(js|ts|mjs|vue)$/i.test(f));
  const re = /\.\s*(get|post|put|patch|delete|request)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  const api = []; const other = [];
  for (const f of files) {
    const lines = read(f).split('\n');
    for (let i = 0; i < lines.length; i++) {
      let m; re.lastIndex = 0;
      while ((m = re.exec(lines[i])) !== null) {
        const p = m[2].replace(/[?#].*$/, '');
        const rec = { path: p, verb: m[1] === 'request' ? 'ANY' : m[1].toUpperCase(), file: rel(f), line: i + 1 };
        if (/^\//.test(p)) api.push(rec); else other.push(rec);
      }
    }
  }
  return { api, other, scannedFiles: files.map(rel) };
}

function extractFromBackend() {
  const dir = path.join(ROOT, 'backend');
  const files = walk(dir, (f) => /\.java$/i.test(f));
  const out = [];
  for (const f of files) {
    const lines = read(f).split('\n');
    let classPrefix = '';
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      const m = L.match(/@(RequestMapping|GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping)\s*\(\s*(?:value\s*=\s*)?(?:[A-Za-z_$][\w$.]*\.class\s*,\s*)?\{?\s*"([^"]*)"/);
      if (!m) continue;
      const anno = m[1];
      const raw = m[2];
      const win = lines.slice(i, i + 8).join('\n');
      const isClass = /\bclass\s+\w+/.test(win) && lines[i].trim().startsWith('@');
      let verb = anno.replace('Mapping', '').toUpperCase();
      if (anno === 'RequestMapping') {
        const vm = /RequestMethod\.(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)/.exec(win);
        verb = vm ? vm[1] : 'ANY';
      }
      if (isClass && !classPrefix && raw) { classPrefix = raw; continue; }
      let full = raw;
      if (full && !full.startsWith('/')) full = (classPrefix.replace(/\/+$/, '') || '') + '/' + full;
      if (!full) full = classPrefix || '/';
      out.push({
        path: full.replace(/\/{2,}/g, '/'), verb, file: rel(f), line: i + 1, raw,
        classPrefix: classPrefix || null,
      });
    }
  }
  return { api: out, other: [], scannedFiles: files.map(rel) };
}

function extractFromDocs() {
  const dir = path.join(ROOT, 'docs');
  const files = walk(dir, (f) => /\.(docx|doc|md|markdown|txt)$/i.test(f));
  const api = []; const other = [];
  let totalLines = 0;
  const headings = [];
  for (const f of files) {
    const txt = /\.docx?$/i.test(f) ? readDocx(f) : read(f);
    const lines = txt.split('\n');
    totalLines += lines.length;
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      /* 章节号识别：编号后必须紧跟非数字字符（防「7 7 类资源」「20260924 20260924 V1」等
         列表项 / 日期行被误判为标题）——判据要带阳性对照，不做宽松前缀匹配。 */
      const h = L.match(/^\s*(\d+(?:\.\d+){0,3})[　 ]+(\D[^\n]{0,48})$/);
      const intOnly = h && h[1].indexOf('.') < 0;
      if (h && !(intOnly && Number(h[1]) > 200) && headings.length < 80) {
        headings.push({ file: rel(f), line: i + 1, no: h[1], title: L.trim().slice(0, 60) });
      }
      const re = /(\/[A-Za-z0-9_\-/@{}.:]{3,})/g;
      let m;
      while ((m = re.exec(L)) !== null) {
        const p = m[1].replace(/\/+$/, '');
        if (API_LIKE.test(p)) api.push({ path: p, file: rel(f), line: i + 1, raw: m[1], verb: 'ANY' });
        else other.push({ path: p, file: rel(f), line: i + 1, raw: m[1] });
      }
    }
  }
  return { api, other, scannedFiles: files.map(rel), totalLines, headings };
}

/* 信封口径探测：从项目内说明文档里找响应体字段签名 */
function detectEnvelope() {
  const cands = walk(ROOT, (f) => /\.(md|markdown|txt)$/i.test(f));
  const shapes = [];
  for (const f of cands) {
    const s = read(f);
    const keys = [];
    for (const k of ['code', 'message', 'msg', 'detail', 'data', 'success', 'total', 'rows']) {
      if (new RegExp('["\'`]?' + k + '["\'`]?\\s*[:：]').test(s)) keys.push(k);
    }
    if (keys.includes('code') && keys.includes('data') && keys.length >= 3) shapes.push({ file: rel(f), keys });
  }
  return shapes;
}

/* 信封口径：三级来源（声明 > 探测 > A7 默认）——见 decisions.md「信封口径」裁决。
 * 无论落在哪一级，都必须把 source 一起报出来，否则「兜底」就变成了「静默替你决定」。
 * A7 = yxjc-monitor 契约侧已收敛的口径，只作最后兜底，不是真相。 */
const ENVELOPE_DEFAULT = { code: 'code', message: 'message', data: 'data', successCode: 200 };

function resolveEnvelope(projJsonContent, shapes) {
  const pj = projJsonContent && !projJsonContent.__parseError ? projJsonContent : null;
  const raw = pj && pj.responseEnvelope && typeof pj.responseEnvelope === 'object' ? pj.responseEnvelope : null;
  const det = shapes && shapes.length
    ? { file: shapes[0].file, keys: shapes[0].keys.slice().sort() }
    : null;
  const declared = raw
    ? { keys: Object.keys(raw).slice().sort(), successCode: (raw.successCode === undefined ? null : raw.successCode) }
    : null;

  if (declared) {
    return {
      source: 'declared', confirmed: true, keys: declared.keys, successCode: declared.successCode,
      declared, detected: det, effective: raw,
      why: '取自 mvgo.project.json 的 responseEnvelope —— 唯一被采信为真值的来源',
    };
  }
  if (det) {
    return {
      source: 'detected-未证实', confirmed: false, keys: det.keys, successCode: null,
      declared: null, detected: det, effective: null,
      why: '无声明，退到探测值（来自 ' + det.file + '）。关键词共现启发式 ⇒ 可能混入子字段（如 detail），'
        + 'S2 冻结前必须由人追认，追认前不得写进契约真值',
    };
  }
  return {
    source: 'default-A7', confirmed: false, keys: Object.keys(ENVELOPE_DEFAULT).sort(),
    successCode: ENVELOPE_DEFAULT.successCode,
    declared: null, detected: null, effective: ENVELOPE_DEFAULT,
    why: '无声明且无探测 ⇒ 按 A7 收敛口径 {code,message,data} 兜底，S2 冻结前必须由人追认',
  };
}

/* 前端 api 基址声明（用于判断前缀是否被网关改写） */
function extractBaseUrls() {
  const dir = path.join(ROOT, 'frontend');
  const files = walk(dir, (f) => /\.(js|ts|mjs|vue)$/i.test(f));
  const baseUrls = [];
  for (const f of files) {
    const m = read(f).match(/(?:VITE_[A-Z_]*BASE[A-Z_]*|baseURL|baseUrl)\s*[:=]\s*['"`]([^'"`]*)['"`]/);
    if (m) baseUrls.push({ file: rel(f), value: m[1] });
  }
  return baseUrls;
}

const normalize = (p) => (p.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/');

function alignEndpoints(sources) {
  const map = new Map();
  const add = (p, kind, rec) => {
    const key = normalize(p).toLowerCase();
    if (!key) return;
    if (!map.has(key)) map.set(key, { path: normalize(p), sources: {}, kinds: [] });
    const e = map.get(key);
    if (!e.sources[kind]) { e.sources[kind] = []; e.kinds.push(kind); }
    e.sources[kind].push({ file: rec.file, line: rec.line, verb: rec.verb || null, raw: rec.raw || null });
  };
  for (const r of sources.doc.api) add(r.path, 'doc', r);
  for (const r of sources.prototype.api) add(r.path, 'prototype', r);
  for (const r of sources.frontend.api) add(r.path, 'frontend', r);
  for (const r of sources.backend.api) add(r.path, 'backend', r);

  const segCount = {};
  for (const p of sources.prototype.api) {
    const seg = '/' + p.path.split('/').filter(Boolean)[0];
    segCount[seg] = (segCount[seg] || 0) + 1;
  }
  const topSeg = Object.entries(segCount).sort((a, b) => b[1] - a[1])[0];
  const declaredPrefix = topSeg ? topSeg[0] : null;

  const list = [];
  for (const e of map.values()) {
    const kinds = e.kinds;
    const flags = [];
    if (declaredPrefix && !e.path.startsWith(declaredPrefix)) flags.push('outsideDeclaredPrefix(' + declaredPrefix + ')');
    if (kinds.length === 1) {
      if (kinds[0] === 'frontend') flags.push('frontendOnly-疑似模板示例');
      if (kinds[0] === 'backend') flags.push('backendOnly');
      if (kinds[0] === 'prototype') flags.push('prototypeOnly-未交叉验证');
      if (kinds[0] === 'doc') flags.push('docOnly');
    }
    const confidence = kinds.length >= 2 ? 'high'
      : (kinds[0] === 'doc' ? 'declared' : (kinds[0] === 'backend' ? 'partial' : 'candidate'));
    list.push({
      path: e.path,
      sources: kinds,
      verb: (e.sources.backend && e.sources.backend[0].verb)
        || (e.sources.frontend && e.sources.frontend[0].verb) || 'ANY',
      confidence,
      flags,
      evidence: e.sources,
    });
  }
  list.sort((a, b) => a.path.localeCompare(b.path));
  return { list, declaredPrefix };
}

/* ============================== 产出 ==================================== */

function buildGapsAndConflicts(s0, docSrc, protoSrc, feSrc, beSrc, aligned, env) {
  const gaps = [];
  const conflicts = [];

  if (docSrc.api.length === 0) {
    gaps.push({
      id: 'GAP-DOC-NO-ENDPOINT',
      severity: 'blocker',
      what: '需求文档里 0 个接口路径（已扫正文 ' + docSrc.totalLines + ' 行）',
      impact: '第五处对账「REQUIREMENTS.md 端点 ↔ 契约 paths 双向差集为空」无法在 S2 完成：文档主源为空',
      options: [
        'A 把原型候选（去重后 ' + aligned.list.filter((e) => e.sources.includes('prototype')).length
          + ' 个唯一点端点；原始字面量命中 ' + protoSrc.api.length + ' 次）升格为端点草案，逐条标「来源=原型，待补文档」',
        'B 中止 S1，请用户补需求文档的接口章节后重跑',
        'C 从 Apifox 反接端点（需要 mvgo.project.json 的 links.apifox）',
      ],
    });
    conflicts.push({
      id: 'CF-DOC-ZERO-ENDPOINT',
      title: '需求文档 0 个接口路径',
      evidence: docSrc.scannedFiles.map((f) => f + '（正文 ' + docSrc.totalLines + ' 行）'),
      ask: '文档只有功能描述、没有接口路径 ⇒ 端点「主源」为空。请选 A（原型升格为草案）/ B（补文档）/ C（Apifox 反接）',
    });
  }
  /* 信封口径三级来源（声明 > 探测 > A7 默认）：只有「声明与探测皆无」才是 blocker。
   * 探测命中不等于真值 —— 它是关键词共现启发式产物，须由人追认，因此报「待追认」而非报「缺」。 */
  if (env.source === 'detected-未证实') {
    conflicts.push({
      id: 'CF-ENVELOPE-UNCONFIRMED',
      title: '响应信封口径只有探测值，未经声明证实',
      evidence: [
        '探测命中：`' + env.detected.file + '` ⇒ 字段集 `' + env.keys.join(' / ') + '`',
        '启发式口径：同一文档里同时出现 code + data 且 ≥3 键即命中 ⇒ 可能把**子字段**（如 `detail`）误当顶层信封字段',
        'mvgo.project.json 未声明 `responseEnvelope` ⇒ 探测值只是候选，本平台不采信为真值',
      ],
      ask: '请追认该字段集，或直接写进声明：`mvgo.project.json` → `responseEnvelope: { code, message, data, successCode: 200 }`。'
        + '追认前 S2 不得把它写进契约真值。',
    });
  } else if (env.source === 'default-A7') {
    gaps.push({
      id: 'GAP-ENVELOPE-UNDECLARED',
      severity: 'blocker',
      what: '声明与探测均为空 ⇒ 信封口径只能落到 A7 默认 {code, message, data}，无任何素材依据',
      impact: 'S5 后端统一返回体无锚：字段名与 successCode 全凭默认值 ⇒ 产出等于「猜的」',
      options: [
        'A 接受 A7 默认 {code, message, data, successCode:200}，并回写 mvgo.project.json 落痕',
        'B 按上游素材给出的口径手动声明',
        'C 由用户显式指定字段集与 successCode',
      ],
    });
    conflicts.push({
      id: 'CF-ENVELOPE-UNDECLARED',
      title: '响应信封口径无声明且无探测（只剩 A7 默认兜底）',
      evidence: ['全项目 *.md 扫描：未找到同时含 code+data 的字段签名块', 'mvgo.project.json：无 responseEnvelope'],
      ask: '确认信封字段集，写进 mvgo.project.json 的 responseEnvelope（当前兜底值 `'
        + env.keys.join(' / ') + '`，successCode=' + env.successCode + '）',
    });
  }
  /* env.source === 'declared' ⇒ 已证实：不进 gaps / conflicts，只在 manifest 留痕（见 buildManifest.envelope） */
  if (!s0.projectJson.found) {
    conflicts.push({
      id: 'CF-PROJECTJSON-MISSING',
      title: 'mvgo.project.json 缺失（声明层为空）',
      evidence: ['S0 特征扫描：项目根无 mvgo.project.json'],
      ask: '请提供 mvgo.project.json（或口头指定）：交付分支 / 响应信封 / Figma 与 Apifox 外链',
      undecided: s0.projectJson.undecided,
    });
  }
  const feOnly = aligned.list.filter((e) => e.flags.includes('frontendOnly-疑似模板示例'));
  if (feOnly.length) {
    conflicts.push({
      id: 'CF-FRONTEND-ORPHAN',
      title: '前端 api 封装里的端点无任何其他来源印证（疑似模板自带示例）',
      evidence: feOnly.reduce((a, e) => a.concat((e.evidence.frontend || []).map((h) => h.file + ':' + h.line + '  ' + e.path)), []),
      ask: '确认这些是否属于本系统；不属于则加入抽取消音名单（避免 false positive 污染契约）',
    });
  }
  const outside = aligned.list.filter((e) => e.flags.some((f) => f.indexOf('outsideDeclaredPrefix') === 0));
  if (outside.length) {
    conflicts.push({
      id: 'CF-PREFIX-INCONSISTENT',
      title: '端点前缀各源不一致',
      evidence: [
        '原型统一前缀: ' + aligned.declaredPrefix,
        '越界端点: ' + outside.map((e) => e.path + ' ← ' + e.sources.join('+')).join(' | '),
        '后端映射: ' + (beSrc.api.map((r) => r.path).join(', ') || '(无)'),
      ],
      ask: '确认网关前缀以哪个为准（Nginx /api/ 到底代理到哪个服务）',
    });
  }
  if (s0.git.multiRepo) {
    conflicts.push({
      id: 'CF-MULTIREPO',
      title: '多仓交付（顶层无 .git）',
      evidence: s0.git.repos.map((r) => r.path + '  origin=' + (r.origin || '(无)') + '  HEAD分支=' + (r.branch || '?')),
      ask: 'S8 只能逐仓提交；确认每仓目标分支（三级取值：deliveryBranch > mvgo.project.json > 内置默认，永不落 main）',
    });
  }
  if (!s0.html.found) {
    conflicts.push({
      id: 'CF-NO-PROTOTYPE',
      title: '无原型页 ⇒ 视觉锚点缺失',
      evidence: ['S0 特征扫描：html/ 下无 .html'],
      ask: '补原型 HTML，或明确改走纯文档驱动（放弃视觉对齐）',
    });
  }
  return { gaps, conflicts };
}

function buildManifest(s0, srcStats, aligned, gaps, envelopes, env) {
  return {
    generator: 's0-scan.cjs',
    version: '1.0.0',
    scannedAt: nowISO(),
    projectRoot: ROOT,
    S0: s0,
    S1: {
      sources: srcStats,
      alignment: {
        total: aligned.list.length,
        high: aligned.list.filter((e) => e.confidence === 'high').length,
        candidate: aligned.list.filter((e) => e.confidence === 'candidate').length,
        partial: aligned.list.filter((e) => e.confidence === 'partial').length,
        declaredPrefix: aligned.declaredPrefix,
      },
      envelopeShapes: envelopes,
      /* 信封口径的三级来源留痕：source ∈ declared / detected-未证实 / default-A7。
       * 消费方（build-prototype.cjs、S2 冻结前的门禁）必须读 source，
       * 只认 declared 为真值；detected / default 一律按「待追认」处理。 */
      envelope: env,
      gaps,
      gate: gaps.some((g) => g.severity === 'blocker') ? 'BLOCK' : 'PASS',
    },
    missing: s0.missing,
  };
}

function buildConflictsMd(s0, gaps, conflicts, aligned, now, stats) {
  let m = '# S2 前置冲突清单（必须由人裁决，扫描器不自动选择）\n\n';
  m += '> 由 `s0-scan.cjs` 于 ' + now + ' 生成｜项目根 `' + ROOT + '`\n';
  m += '> 铁律：字段级真值只存在于契约里；三份人读文档只写 JSON Pointer 引用与落点。\n\n';

  m += '## 一、S0 缺项（' + s0.missing.length + ' 项）\n\n';
  if (!s0.missing.length) m += '- 无\n';
  else for (const x of s0.missing) m += '- **' + x.slot + '**（`' + x.level + '`）：' + x.why + '\n';

  m += '\n## 二、S1 抽源统计（判据底线在「多源交叉验证」，不在「扫到了几个」）\n\n';
  m += '| 源 | 扫了 | 命中原点 | 去重后唯一点 | 备注 |\n|---|---|---|---|---|\n';
  m += '| ① 需求文档 | ' + stats.docFiles + ' 文件 / 正文 ' + stats.docLines + ' 行 | ' + stats.docHits + ' | '
    + aligned.list.filter((e) => e.sources.includes('doc')).length + ' | '
    + (stats.docHits === 0 ? '🔴 **主源为空** ⇒ 第五处对账无法成立' : '主源正常') + ' |\n';
  m += '| ② 原型 JS/HTML | ' + stats.protoPages + ' 页 / ' + stats.protoScripts + ' 脚本（其中可视化库 '
    + stats.protoLibs + ' 个） | ' + stats.protoHits + ' | '
    + aligned.list.filter((e) => e.sources.includes('prototype')).length
    + ' | 候选锚点，须交叉验证；过滤非接口字面量 ' + stats.protoFiltered + ' |\n';
  m += '| ③ 前端 api 封装 | ' + stats.feFiles + ' 文件 | ' + stats.feHits + ' | '
    + aligned.list.filter((e) => e.sources.includes('frontend')).length + ' | 含模板示例风险 |\n';
  m += '| ④ 后端 controller | ' + stats.beFiles + ' 文件 | ' + stats.beHits + ' | '
    + aligned.list.filter((e) => e.sources.includes('backend')).length + ' | 相对路径须拼类级前缀 |\n';
  m += '\n> ⚠️ 「命中次数 ≠ 唯一点端点」：同一路径在多文件重复出现会重复计数（本样本原型 9 个端点 × 2 文件 = '
    + stats.protoHits + ' 次）。判据一律用**去重后**列。\n';

  m += '\n## 三、缺口（blocker，进 S2 前必须消解）\n\n';
  if (!gaps.length) m += '- 无\n';
  for (const g of gaps) {
    m += '### ' + g.id + '（' + g.severity + '）\n\n';
    m += '- **现象**：' + g.what + '\n';
    m += '- **影响**：' + g.impact + '\n';
    m += '- **选项**：\n';
    for (const o of g.options) m += '  - ' + o + '\n';
    m += '\n';
  }

  m += '## 四、待裁决冲突（' + conflicts.length + ' 条）\n\n';
  conflicts.forEach((c, i) => {
    m += '### ' + (i + 1) + '. ' + c.title + '　`' + c.id + '`\n\n';
    if (c.evidence && c.evidence.length) {
      m += '证据：\n';
      for (const e of c.evidence) m += '- `' + e + '`\n';
      m += '\n';
    }
    if (c.undecided && c.undecided.length) {
      m += '未决项：' + c.undecided.map((u) => '`' + u + '`').join('、') + '\n\n';
    }
    m += '**要你定**：' + c.ask + '\n\n';
  });

  m += '## 五、扫描器不做的事（防止「静默替你做决定」）\n\n';
  m += '- 不猜交付分支（缺 mvgo.project.json 时只记录，不填默认值）\n';
  m += '- 不猜响应信封（缺声明时列为 blocker，不选任何一边）\n';
  m += '- 不删「疑似模板示例」的端点，只加 flag 交给人工消音\n';
  m += '- 不把单源端点当既定事实（confidence 只到 `candidate`/`partial`）\n';

  // §六 只回答「裁决记到哪去了」，不复制裁决内容（避免两处真值）。
  // decisions.md 不在本脚本写盘清单里，故这里只读存在性 + md5 做证据。
  const decPath = path.join(OUT, 'spec', 'decisions.md');
  let decState;
  if (fs.existsSync(decPath)) {
    const buf = fs.readFileSync(decPath);
    decState = '**已存在**（' + buf.length + ' B，md5 `'
      + crypto.createHash('md5').update(buf).digest('hex')
      + '`）—— 重跑本脚本不覆盖它，裁决内容以该文件为准，本清单不复述。';
  } else {
    decState = '**尚未落盘** ⇒ §三 / §四 全部仍待裁决（本脚本不会生成该文件，须人工新建）。';
  }
  m += '\n## 六、裁决去向（本文件是扫描快照，不是结论）\n\n';
  m += '- §三 缺口与 §四 冲突是 `s0-scan.cjs` 的**扫描快照**，每次重跑整篇重写 ⇒「**要你定**」会重新出现。\n';
  m += '- 裁决结果与留痕写在同目录的 `spec/decisions.md`：**扫描器不生成、不覆盖**，重跑后裁决不丢。\n';
  m += '- 现状：`decisions.md` ' + decState + '\n';
  return m;
}

function buildRequirementsMd(s0, aligned, gaps, now) {
  const docHasEndpoints = !gaps.some((g) => g.id === 'GAP-DOC-NO-ENDPOINT');
  let m = '# REQUIREMENTS.md —— 前后端需求唯一源（草稿 v0.1 · 自动生成）\n\n';
  m += '> 生成器 `s0-scan.cjs`｜' + now + '｜项目根 `' + ROOT + '`\n';
  m += '> **本文件是契约（OAS）的第 1 种视图，不是新真值。字段级真值只在契约里；本文只写 JSON Pointer 引用与落点。**\n\n';

  m += '## 0. 项目坑位（S0 识别结果）\n\n';
  m += '| 坑位 | 状态 | 依据 |\n|---|---|---|\n';
  m += '| `docs/**` | ' + (s0.docs.found ? '✅ ' + s0.docs.files.length + ' 个文件' : '🔴 缺失') + ' | 唯一必需项 |\n';
  m += '| `html/**` | ' + (s0.html.found ? '✅ ' + s0.html.pages.length + ' 页' : '🔴 缺失') + ' | ' + s0.html.featureHit + ' |\n';
  m += '| `frontend/**` | ' + (s0.frontend.found ? '✅ ' + s0.frontend.verdict : '🔴 缺失') + ' | 特征：vite |\n';
  m += '| `backend/**` | ' + (s0.backend.found ? '✅ ' + s0.backend.verdict : '🔴 缺失') + ' | 特征：spring-boot |\n';
  m += '| `mvgo.project.json` | ' + (s0.projectJson.found ? '✅' : '🔴 缺失') + ' | 外链 / 口径 / 交付分支声明 |\n';
  m += '| `.git` | ' + (s0.git.repos.length ? '✅ ' + s0.git.verdict : '🔴 缺失') + ' | ' + s0.git.repos.map((r) => r.path).join('、') + ' |\n';

  m += '\n## 1. 端点清单（' + aligned.list.length + ' 条）\n\n';
  m += '> 置信度口径：`high` = ≥2 源交叉命中；`declared` = 仅需求文档声明；`partial` = 仅后端有实现；`candidate` = 仅原型/仅前端，**未交叉验证**。\n\n';
  m += '| # | 路径 | 方法 | 来源 | 置信度 | 标记 | 字段落点 |\n|---|---|---|---|---|---|---|\n';
  aligned.list.forEach((e, i) => {
    m += '| ' + (i + 1) + ' | `' + e.path + '` | ' + e.verb + ' | ' + e.sources.join('+') + ' | ' + e.confidence
      + ' | ' + (e.flags.length ? e.flags.join('<br>') : '—') + ' | *(JSON Pointer 占位)* |\n';
  });
  if (!aligned.list.length) m += '| — | *(空)* | — | — | — | 需先解决 GAP-DOC-NO-ENDPOINT | — |\n';

  m += '\n## 2. 端点来源缺口\n\n';
  if (docHasEndpoints) m += '- 需求文档提供了端点声明，主源正常。\n';
  else {
    m += '🔴 **需求文档未提供任何接口路径** —— 上表全部端点的 `sources` 均不含 `doc`。\n\n';
    m += '这意味着 S2 的第五处对账（`REQUIREMENTS.md` 端点 ↔ 契约 `paths` 双向差集为空）在**当前素材上无法成立**，因为「文档侧集合」是空的。\n';
    m += '必须先由用户裁决（见 `spec/conflicts.md` 的 `CF-DOC-ZERO-ENDPOINT`）。\n';
  }

  m += '\n## 3. 功能条目（待人工从文档补全）\n\n';
  m += '> 扫描器不做语义摘要（那是 LLM 的活，S2 阶段由 `requirements-writer` role 生成）。本文件此节留空，等待角色回填。\n\n';

  m += '## 4. 待裁决冲突\n\n';
  m += '见 `spec/conflicts.md`。本文件不复制冲突内容，避免两处真值。\n';
  return m;
}

function main() {
  const t0 = Date.now();
  const now = nowISO();
  const pre = snapshotTree(ROOT);   // ← 只读自证的「前」

  const s0 = stageS0();
  const docSrc = extractFromDocs();
  const protoSrc = extractFromPrototype();
  const feSrc = extractFromFrontend();
  const beSrc = extractFromBackend();
  const envelopeShapes = detectEnvelope();
  const env = resolveEnvelope(s0.projectJson.content, envelopeShapes);
  const baseUrls = extractBaseUrls();
  const aligned = alignEndpoints({ doc: docSrc, prototype: protoSrc, frontend: feSrc, backend: beSrc });
  const { gaps, conflicts } = buildGapsAndConflicts(s0, docSrc, protoSrc, feSrc, beSrc, aligned, env);

  const srcStats = {
    doc: { files: docSrc.scannedFiles, endpoints: docSrc.api.length, textLines: docSrc.totalLines, headings: docSrc.headings },
    prototype: { files: protoSrc.scannedFiles, endpoints: protoSrc.api.length, filteredNonApiLiterals: protoSrc.other.length },
    frontend: { files: feSrc.scannedFiles.length, endpoints: feSrc.api.length, otherCalls: feSrc.other.length, baseUrls },
    backend: { files: beSrc.scannedFiles, endpoints: beSrc.api.length },
  };

  const manifest = buildManifest(s0, srcStats, aligned, gaps, envelopeShapes, env);
  const post = snapshotTree(ROOT);   // ← 只读自证的「后」
  const readOnly = diffSnapshots(pre, post);
  manifest.S0.footprint = {
    allFiles: post.allFiles, treeFiles: post.treeFiles,
    work: post.work, dsStore: post.dsStore, gitInternals: post.gitInternals,
    truncated: post.truncated,
  };
  manifest.S0.readOnly = readOnly;
  manifest.elapsedMs = Date.now() - t0;

  const endpointsJson = {
    generatedAt: now,
    projectRoot: ROOT,
    declaredPrefix: aligned.declaredPrefix,
    total: aligned.list.length,
    byConfidence: {
      high: aligned.list.filter((e) => e.confidence === 'high').length,
      declared: aligned.list.filter((e) => e.confidence === 'declared').length,
      partial: aligned.list.filter((e) => e.confidence === 'partial').length,
      candidate: aligned.list.filter((e) => e.confidence === 'candidate').length,
    },
    endpoints: aligned.list.map((e) => ({
      path: e.path, verb: e.verb, sources: e.sources, confidence: e.confidence, flags: e.flags, evidence: e.evidence,
    })),
    fullEvidence: {
      doc: docSrc.api,
      prototype: protoSrc.api,
      prototypeFilteredNonApi: protoSrc.other.slice(0, 40),
      frontend: feSrc.api,
      backend: beSrc.api,
    },
  };

  const stats = {
    docFiles: s0.docs.files.length,
    docLines: docSrc.totalLines,
    docHits: docSrc.api.length,
    protoPages: s0.html.pages.length,
    protoScripts: s0.html.scriptFiles.length,
    protoLibs: s0.html.visualLibs.length,
    protoHits: protoSrc.api.length,
    protoFiltered: protoSrc.other.length,
    feFiles: feSrc.scannedFiles.length,
    feHits: feSrc.api.length,
    beFiles: beSrc.scannedFiles.length,
    beHits: beSrc.api.length,
  };

  fs.mkdirSync(path.join(OUT, 'spec'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'doc'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'spec', 'project.manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(OUT, 'spec', 'endpoints.json'), JSON.stringify(endpointsJson, null, 2) + '\n');
  fs.writeFileSync(path.join(OUT, 'spec', 'conflicts.md'), buildConflictsMd(s0, gaps, conflicts, aligned, now, stats));
  fs.writeFileSync(path.join(OUT, 'doc', 'REQUIREMENTS.draft.md'), buildRequirementsMd(s0, aligned, gaps, now));

  /* ---------------------------- stdout 摘要 ---------------------------- */
  const L = [];
  L.push('=== S0 坑位识别 ===');
  L.push('  docs      ' + (s0.docs.found ? 'OK  ' + s0.docs.files.length + ' 个' : 'MISS'));
  L.push('  html      ' + (s0.html.found ? 'OK  ' + s0.html.pages.length + ' 页 / ' + s0.html.scriptFiles.length + ' 脚本' : 'MISS'));
  L.push('  frontend  ' + (s0.frontend.found ? 'OK  ' + s0.frontend.verdict : 'MISS'));
  L.push('  backend   ' + (s0.backend.found ? 'OK  ' + s0.backend.verdict : 'MISS'));
  L.push('  projJson  ' + (s0.projectJson.found ? 'OK' : 'MISS (声明层为空)'));
  L.push('  .git      ' + (s0.git.repos.length ? 'OK  ' + s0.git.verdict : 'MISS'));
  L.push('  S0 gate   ' + s0.gate);
  L.push('  只读自证  快照变化 ' + readOnly.changed + '（新增 ' + readOnly.added
    + ' / 删除 ' + readOnly.removed + ' / 改动 ' + readOnly.modified + '）'
    + '  共 ' + post.allFiles + ' 个文件 = 工作 ' + post.work + ' + .DS_Store '
    + post.dsStore + ' + .git 内 ' + post.gitInternals
    + (post.truncated ? '  ⚠️ 快照被 ' + MAX_SNAP + ' 上限截断' : ''));
  L.push('');
  L.push('=== S1 端点抽取 ===');
  L.push('  ① 需求文档      命中 ' + docSrc.api.length + '  (正文 ' + docSrc.totalLines + ' 行, ' + docSrc.scannedFiles.length + ' 文件)');
  L.push('  ② 原型 JS/HTML  命中 ' + protoSrc.api.length + '  (过滤非接口字面量 ' + protoSrc.other.length + ')');
  L.push('  ③ 前端 api 封装 命中 ' + feSrc.api.length);
  L.push('  ④ 后端 controller 命中 ' + beSrc.api.length);
  L.push('  对齐后唯一点端点 ' + aligned.list.length
    + '  [high=' + endpointsJson.byConfidence.high
    + ' declared=' + endpointsJson.byConfidence.declared
    + ' partial=' + endpointsJson.byConfidence.partial
    + ' candidate=' + endpointsJson.byConfidence.candidate + ']');
  L.push('  声明前缀 ' + (aligned.declaredPrefix || '(无)'));
  L.push('  信封口径  ' + env.source + (env.confirmed ? ' [已证实]' : ' [待追认]')
    + '  字段 ' + env.keys.join('/') + '  successCode=' + (env.successCode === null ? '(未定)' : env.successCode));
  L.push('');
  L.push('=== 缺口 / 冲突 ===');
  L.push('  blocker 缺口 ' + gaps.length + '   待裁决冲突 ' + conflicts.length + '   S0 缺项 ' + s0.missing.length);
  for (const g of gaps) L.push('  ! ' + g.id);
  for (const c of conflicts) L.push('  ! ' + c.id);
  L.push('');
  L.push('=== 产物 ===');
  L.push('  ' + path.join(OUT, 'spec', 'project.manifest.json'));
  L.push('  ' + path.join(OUT, 'spec', 'endpoints.json'));
  L.push('  ' + path.join(OUT, 'spec', 'conflicts.md'));
  L.push('  ' + path.join(OUT, 'doc', 'REQUIREMENTS.draft.md'));
  console.log(L.join('\n'));

  process.exit(gaps.some((g) => g.severity === 'blocker') ? 1 : 0);
}

main();
