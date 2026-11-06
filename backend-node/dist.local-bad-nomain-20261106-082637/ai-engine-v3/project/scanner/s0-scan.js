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
 *   <out>/doc/REQUIREMENTS.draft.md    前后端需求唯一源 · 7 章骨架（草稿）
 *   <out>/doc/FRONTEND-DESIGN.draft.md 前端设计 · 5 章骨架（草稿）
 *   <out>/doc/BACKEND-DESIGN.draft.md  后端设计 · 5 章骨架（草稿）
 *
 * 三份人读文档的共同准绳（已裁决「三份一起定死」）:
 *   · 章节结构由本脚本**钉死**，重跑不变形；`.draft` = 尚未由 S2/S4/S5 回填。
 *   · 扫描器只填**事实**（文件、行号、端点、哈希），设计类内容一律留白 ——
 *     留白是如实的，手写一个看似完整的假象才是失真。
 *   · 三份共用同一轮扫描：指纹只在 REQUIREMENTS §7 出现一次，另两份只引用不复制
 *     （复制即制造第二个真值）。
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
    /* 嵌套仓 = 仓落在子目录而非顶层。多见于「基座是从上游 clone 来的」，带的就是上游的
     * remote 与分支 —— 直接在其中提交会推到**别人的仓库**（高危）。
     * 这里只报事实 + 风险提示，**不自动处置**：处置须先备份、先经人确认（已裁决口径）。 */
    nested: gitRepos.filter((r) => r.path !== '(顶层)').map((r) => ({ path: r.path, branch: r.branch || null, origin: r.origin || null })),
    hasTopLevel: gitRepos.some((r) => r.path === '(顶层)'),
    verdict: gitRepos.length === 0 ? '无 .git ⇒ S8 无可提交目标'
      : (gitRepos.length === 1
        ? '单仓（落点 ' + gitRepos[0].path + (gitRepos[0].path === '(顶层)' ? '' : '，**非顶层**') + '）'
        : '多仓 ' + gitRepos.length + ' ⇒ S8 必须逐仓提交'),
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

function buildManifest(s0, srcStats, aligned, gaps, envelopes, env, srcHashes) {
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
      /* 输入素材指纹：逐文件 sha256 的汇总（明细在 doc/REQUIREMENTS.draft.md §7）。
       * 消费方可用 total + digest 判「素材是否变过」而不必读整篇文档。 */
      sourceHashes: srcHashes
        ? {
            total: srcHashes.total,
            digest: srcHashes.digest,
            groups: srcHashes.groups.map((g) => ({ label: g.label, count: g.count, digest: g.digest })),
          }
        : null,
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

/* 单文件 sha256：读不出来就返回 null（不编哈希）。 */
function sha256File(abs) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex'); }
  catch (e) { return null; }
}
function sha256Text(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

/* 输入素材指纹：对本轮**实际被读取**的文件逐个 sha256，再按源分类汇总。
 * 用途（设计文档 §13 第 3 条）：S4/S5 注入 prompt 时记下指纹 ⇒ 出问题能判「设计错了 / 代码没按设计写」。
 * 注意：这是「输入素材」的指纹；本文档**自身的** sha256 无法自证（写入即改变），交给消费者算。 */
function buildSourceHashes(s0, srcs) {
  const groups = [];
  const defs = [
    { label: '① 需求文档', files: srcs.docSrc.scannedFiles },
    { label: '② 原型 HTML/JS', files: srcs.protoSrc.scannedFiles },
    { label: '③ 前端 api 封装', files: srcs.feSrc.scannedFiles },
    { label: '④ 后端 controller', files: srcs.beSrc.scannedFiles },
  ];
  if (s0.projectJson.found) defs.push({ label: '⑤ 声明层', files: ['mvgo.project.json'] });

  for (const d of defs) {
    const rows = d.files.map((relPath) => {
      const abs = path.join(ROOT, relPath);
      let bytes = null;
      try { bytes = fs.statSync(abs).size; } catch (e) { /* 读不到就留 null */ }
      return { path: relPath, bytes: bytes, sha256: sha256File(abs) };
    });
    // 分类摘要：对「路径:sha256」排序后拼接再哈希 ⇒ 与逐文件表同源，不是另算一遍
    const digest = sha256Text(rows.map((r) => r.path + ':' + (r.sha256 || 'NOHASH')).sort().join('\n'));
    groups.push({ label: d.label, count: rows.length, digest: digest, files: rows });
  }
  const total = groups.reduce((a, g) => a + g.count, 0);
  const digest = sha256Text(groups.map((g) => g.label + ':' + g.digest).join('\n'));
  return { groups, total, digest };
}

/* JSON Pointer 转义：`~` → `~0`，`/` → `~1`（RFC 6901）。
 * 端点总表里那一栏不是字段表，是指向契约的指针 —— 转义错了就是悬空引用。 */
function jsonPtr(s) {
  return String(s).replace(/~/g, '~0').replace(/\//g, '~1');
}

/* 从 java 文件路径推包名：`…/src/main/java/<pkg…>/X.java` ⇒ `<pkg…>`。
 * 推不出来返回 null —— 不编。 */
function javaPackage(relPath) {
  const m = /\/src\/main\/java\/(.+)\/[^/]+\.java$/.exec('/' + relPath);
  return m ? m[1].replace(/\//g, '.') : null;
}

/* 前/后端「文件盘面」：两份设计文档生成器的**唯一事实来源**。
 * 只做「按路径特征分类」，不做语义判断 —— 分类要改就改这一处，
 * 不让两份文档各自 walk 一遍、各自漏不同的文件（那会变成两个真值）。 */
function buildInventory() {
  const relAll = (dir, rx) => walk(dir, (f) => rx.test(f)).map(rel).sort();
  const feRoot = path.join(ROOT, 'frontend');
  const beRoot = path.join(ROOT, 'backend');
  const javaFiles = relAll(beRoot, /\.java$/);

  return {
    fe: {
      pages: relAll(path.join(ROOT, 'html'), /\.html?$/i),
      routes: relAll(feRoot, /\/src\/router\/[^/]+\.(js|ts)$/),
      apis: relAll(feRoot, /\/src\/api\/.*\.(js|ts)$/),
      components: relAll(feRoot, /\/src\/(components|views|layouts)\/.*\.(vue|js|ts)$/),
      store: relAll(feRoot, /\/src\/(store|stores)\/.*\.(js|ts)$/),
      entry: relAll(feRoot, /\/src\/(main|App)\.(js|ts|vue)$/),
      request: relAll(feRoot, /(request|axios|http)[^/]*\.(js|ts)$/),
      guard: relAll(feRoot, /(permission|guard|auth)[^/]*\.(js|ts)$/),
      configs: relAll(feRoot, /(vite\.config\.|package\.json$|\.env|\/src\/config\/)/),
    },
    be: {
      java: javaFiles,
      packages: [...new Set(javaFiles.map(javaPackage).filter(Boolean))].sort(),
      controllers: javaFiles.filter((f) => /Controller\.java$/.test(f)),
      services: javaFiles.filter((f) => /Service(Impl)?\.java$/.test(f)),
      mappers: javaFiles.filter((f) => /Mapper\.java$/.test(f)),
      entities: javaFiles.filter((f) => /(entity|domain|model)\//.test(f)),
      configs: javaFiles.filter((f) => /(Config|Configuration)\.java$/.test(f)),
      apps: javaFiles.filter((f) => /Application\.java$/.test(f)),
      advice: javaFiles.filter((f) => /(Advice|Exception|ExceptionHandler|GlobalHandler)\.java$/.test(f)),
      txFiles: javaFiles,   // 事务口径靠内容扫，见生成器
      resources: relAll(beRoot, /\.(xml|yml|yaml|properties)$/),
    },
  };
}

function buildRequirementsMd(ctx) {
  const { s0, aligned, gaps, now, srcHashes } = ctx;
  const docHasEndpoints = !gaps.some((g) => g.id === 'GAP-DOC-NO-ENDPOINT');
  let m = '# REQUIREMENTS.md —— 前后端需求唯一源（草稿 v0.1 · 自动生成）\n\n';
  m += '> 生成器 `s0-scan.cjs`｜' + now + '｜项目根 `' + ROOT + '`\n';
  m += '> **本文件是契约（OAS）的第 1 种视图，不是新真值。字段级真值只在契约里；本文只写 JSON Pointer 引用与落点。**\n\n';
  m += '> **章节骨架已定死（7 章）**：① 系统概述 ② 功能点清单 ③ 端点总表 ④ 数据实体索引 ⑤ 外部系统与定时任务 ⑥ 已裁决冲突 ⑦ sourceHashes。\n';
  m += '> 结构由扫描器产出、不随重跑变形；② 的语义描述由 S2 的 `requirements-writer` 在本骨架上回填。\n\n';

  /* ---------------------------------------------------- ① 系统概述 --- */
  m += '## 1. 系统概述\n\n';
  m += '### 1.1 输入素材（S0 坑位识别结果）\n\n';
  m += '| 坑位 | 状态 | 依据 |\n|---|---|---|\n';
  m += '| `docs/**` | ' + (s0.docs.found ? '✅ ' + s0.docs.files.length + ' 个文件' : '🔴 缺失') + ' | 唯一必需项 |\n';
  m += '| `html/**` | ' + (s0.html.found ? '✅ ' + s0.html.pages.length + ' 页' : '🔴 缺失') + ' | ' + s0.html.featureHit + ' |\n';
  m += '| `frontend/**` | ' + (s0.frontend.found ? '✅ ' + s0.frontend.verdict : '🔴 缺失') + ' | 特征：vite |\n';
  m += '| `backend/**` | ' + (s0.backend.found ? '✅ ' + s0.backend.verdict : '🔴 缺失') + ' | 特征：spring-boot |\n';
  m += '| `mvgo.project.json` | ' + (s0.projectJson.found ? '✅' : '🔴 缺失') + ' | 外链 / 口径 / 交付分支声明 |\n';
  m += '| `.git` | ' + (s0.git.repos.length ? '✅ ' + s0.git.verdict : '🔴 缺失') + ' | ' + s0.git.repos.map((r) => r.path).join('、') + ' |\n';
  if (s0.git.nested.length) {
    m += '\n> ⚠️ **嵌套仓警告**：' + s0.git.nested.length + ' 个 `.git` 落在子目录而非顶层 —— ';
    for (const n of s0.git.nested) {
      m += '`' + n.path + '`' + (n.branch ? '（分支 `' + n.branch + '`' : '') + (n.origin ? '，origin `' + n.origin + '`' : '') + '）';
    }
    m += '。\n> 常见成因：**基座是从上游 clone 来的**，带的就是上游的 remote 与分支 —— '
      + '在其中直接提交会推到**别人的仓库**。按已裁决口径（见 §6）：删嵌套 `.git` 并纳管为上层仓的普通子目录，'
      + '**处置前先整仓备份、先经人确认**，扫描器不自动执行。\n';
  }
  m += '\n> 业务语义概述（这个系统做什么）由 S2 的 `requirements-writer` 从 `docs/**` 抽取后回填本节 1.2。\n';

  /* ------------------------------------------- ② 功能点清单（三锚点） --- */
  m += '\n## 2. 功能点清单（每个功能点挂三锚点）\n\n';
  m += '> 三锚点 = **文档段号 / 画板 nodeId / 端点**。下表由扫描器**机械**给出其中两个（文档命中位置、端点），'
    + '画板 nodeId 需要 Figma 输入（本项目 ' + (s0.projectJson.found ? '见 `mvgo.project.json` 的 `links.figma`' : '未声明 `links.figma`')
    + '）⇒ 留 `—` 待 S2 回填。**无锚点的功能点不得进入本节**。\n\n';
  m += '| # | 功能点 | 文档锚点（file:line） | 画板锚点（nodeId） | 端点锚点 |\n|---|---|---|---|---|\n';
  if (!aligned.list.length) {
    m += '| — | *(空)* | — | — | — |\n';
  } else {
    aligned.list.forEach((e, i) => {
      const d = (e.evidence.doc && e.evidence.doc[0]) || null;
      m += '| ' + (i + 1) + ' | *(待 S2 命名)* | '
        + (d ? '`' + d.file + ':' + d.line + '`' : '<span>—</span>') + ' | — | `' + e.path + '` |\n';
    });
  }
  m += '\n> 功能点名称留白是**故意的**：扫描器不做语义摘要（那是 LLM 的活）。手写一个名字上来，'
    + '就等于给「没读过文档的人」一个看似完整的假象。\n';

  /* ---------------------------------------------------- ③ 端点总表 --- */
  m += '\n## 3. 端点总表（' + aligned.list.length + ' 条）\n\n';
  m += '> 置信度口径：`high` = ≥2 源交叉命中；`declared` = 仅需求文档声明；`partial` = 仅后端有实现；`candidate` = 仅原型/仅前端，**未交叉验证**。\n';
  m += '> 「字段定义」一栏是 **JSON Pointer**（指向 `openapi.local.yaml`），不是字段表 —— 字段级真值只在契约里。\n\n';
  m += '| # | 路径 | 方法 | 来源 | 置信度 | 标记 | 字段定义（JSON Pointer） |\n|---|---|---|---|---|---|---|\n';
  aligned.list.forEach((e, i) => {
    m += '| ' + (i + 1) + ' | `' + e.path + '` | ' + e.verb + ' | ' + e.sources.join('+') + ' | ' + e.confidence
      + ' | ' + (e.flags.length ? e.flags.join('<br>') : '—')
      + ' | `openapi.local.yaml#/paths/' + jsonPtr(e.path) + '` |\n';
  });
  if (!aligned.list.length) m += '| — | *(空)* | — | — | — | — | — |\n';

  m += '\n### 3.1 端点来源缺口\n\n';
  if (docHasEndpoints) m += '- 需求文档提供了端点声明，主源正常。\n';
  else {
    m += '🔴 **需求文档未提供任何接口路径** —— 上表全部端点的 `sources` 均不含 `doc`。\n\n';
    m += '这意味着 S2 的第五处对账（`REQUIREMENTS.md` 端点 ↔ 契约 `paths` 双向差集为空）在**当前素材上无法成立**，因为「文档侧集合」是空的。\n';
    m += '必须先由用户裁决（见 `spec/conflicts.md` 的 `CF-DOC-ZERO-ENDPOINT`）。\n';
  }

  /* ------------------------------------------------ ④ 数据实体索引 --- */
  m += '\n## 4. 数据实体索引\n\n';
  m += '> 扫描器**不解析实体**（实体是从需求文档语义抽取出来的，属 S2 的 `contract-freezer`）。\n';
  m += '> 本节留空是**如实**：填上任何实体名都是编的。S2 回填口径 = 实体名 → `openapi.local.yaml#/components/schemas/<Name>`。\n\n';
  m += '| # | 实体 | 契约指针 | 出现于端点 |\n|---|---|---|---|\n';
  m += '| — | *(S2 回填)* | — | — |\n';

  /* ------------------------------------- ⑤ 外部系统与定时任务 --- */
  m += '\n## 5. 外部系统与定时任务\n\n';
  const links = (s0.projectJson.content && !s0.projectJson.content.__parseError
    && s0.projectJson.content.links) || null;
  m += '### 5.1 外部系统（声明层）\n\n';
  m += '| 外链 | 状态 |\n|---|---|\n';
  m += '| Figma | ' + (links && links.figma ? '✅ `' + links.figma + '`' : '🔴 未声明') + ' |\n';
  m += '| Apifox | ' + (links && links.apifox ? '✅ `' + links.apifox + '`' : '🔴 未声明') + ' |\n';
  if (!s0.projectJson.found || !links || (!links.figma && !links.apifox)) {
    m += '\n> 未声明不等于没有：**扫描器只报事实，不替你填**。按已裁决口径（见 §6），无 Apifox 时先出本地 mock，后期对接。\n';
  }
  m += '\n### 5.2 定时任务 / 调度器（由后端文件特征派生）\n\n';
  const schedRx = /(xxl|xxljob|quartz|schedul|\bcron\b|\bjob\b|\btask\b)/i;
  const schedFiles = walk(ROOT, (x) => /\.(java|xml|yml|yaml|properties)$/i.test(x))
    .map((x) => rel(x))
    .filter((r) => /^backend\//.test(r) && schedRx.test(path.basename(r)))
    .sort();
  if (schedFiles.length) {
    m += '发现 ' + schedFiles.length + ' 个疑似调度器文件（**文件名特征命中**，未读内容判定）：\n\n';
    for (const f of schedFiles) m += '- `' + f + '`\n';
    m += '\n> 「本期要不要加任务」属需求裁决，不在本节结论内。\n';
  } else {
    m += '后端未见调度器特征文件（`xxl` / `quartz` / `schedul` / `cron` / `job` / `task` 文件名特征）。\n';
  }

  /* ------------------------------------------------ ⑥ 已裁决冲突 --- */
  m += '\n## 6. 已裁决冲突\n\n';
  const decPath = path.join(OUT, 'spec', 'decisions.md');
  if (fs.existsSync(decPath)) {
    const buf = fs.readFileSync(decPath);
    m += '- 裁决台账：`spec/decisions.md`（**已存在**，' + buf.length + ' B，md5 `'
      + crypto.createHash('md5').update(buf).digest('hex') + '`）。\n';
  } else {
    m += '- 裁决台账：`spec/decisions.md` **尚未落盘** ⇒ 冲突全部待裁决。\n';
  }
  m += '- 待裁决冲突的**扫描快照**在 `spec/conflicts.md`（每次重跑整篇重写）。\n';
  m += '- **本文不复制裁决内容**：复制即制造第二个真值。要看裁决，读 `decisions.md`。\n';

  /* -------------------------------------------------- ⑦ sourceHashes --- */
  m += '\n## 7. 输入素材指纹（sourceHashes）\n\n';
  m += '> 对本轮**实际被读取**的每个输入文件逐个 sha256。S4/S5 注入 prompt 时记下这些指纹 ⇒ '
    + '出问题能判「是设计错了，还是代码没按设计写」。\n';
  m += '> ⚠️ **本文档自身的 sha256 不在这里** —— 自指哈希无法自证（写入即改变自身哈希），由消费者在注入前计算并记录。\n\n';
  m += '### 7.1 分类摘要\n\n';
  m += '| 源 | 文件数 | 分类 sha256（对「路径:文件sha256」排序拼接后再哈希） |\n|---|---|---|\n';
  for (const g of srcHashes.groups) m += '| ' + g.label + ' | ' + g.count + ' | `' + g.digest + '` |\n';
  m += '| **合计** | **' + srcHashes.total + '** | `' + srcHashes.digest + '` |\n';

  m += '\n### 7.2 逐文件\n\n';
  m += '| 源 | 路径 | 字节 | sha256 |\n|---|---|---|---|\n';
  for (const g of srcHashes.groups) {
    for (const r of g.files) {
      m += '| ' + g.label + ' | `' + r.path + '` | ' + (r.bytes === null ? '?' : r.bytes)
        + ' | ' + (r.sha256 ? '`' + r.sha256 + '`' : '*(读失败)*') + ' |\n';
    }
  }

  m += '\n---\n\n';
  m += '复现：`node outputs/s0-scan.cjs ' + ROOT + ' --out ' + OUT + '`（**只读输入目录**，退出码 1 = 存在 blocker）。\n';
  return m;
}


/* ====================================================================== *
 * FRONTEND-DESIGN.md —— 5 章骨架
 * 同一准绳：**扫描器只出事实，设计留白**。本文件在 S0 阶段是「基座盘面 +
 * 待回填位」；S4 的 frontend-designer 回填后去掉 `.draft` 后缀。
 * ====================================================================== */
function buildFrontendDesignMd(ctx) {
  const { now, inv, s0, aligned } = ctx;
  const F = inv.fe;
  let m = '# FRONTEND-DESIGN.md —— 前端设计（草稿 v0.1 · S0 骨架）\n\n';
  m += '> 生成器 `s0-scan.cjs`｜' + now + '｜项目根 `' + ROOT + '`\n';
  m += '> **当前形态 = S0 骨架**：5 章结构由扫描器钉死，**事实**（基座现有文件）已填，'
    + '**设计**（目标页面 / 组件 / 落点）留白 —— 由 S4 的 `frontend-designer` 回填，回填后去掉 `.draft`。\n';
  m += '> **字段级真值只在契约（`openapi.local.yaml`）里**，本文只写 JSON Pointer 引用与落点。\n';
  m += '> 素材指纹见 `REQUIREMENTS.draft.md` §7 —— 同一轮扫描同一份指纹，此处**不复制**（复制即第二个真值）。\n\n';

  /* -------------------------------------------------- ① 页面清单 ↔ 路由表 --- */
  m += '## 1. 页面清单 ↔ 路由表\n\n';
  m += '### 1.1 原型侧页面（事实）\n\n';
  if (F.pages.length) {
    m += '| # | 原型页面 | 字节 |\n|---|---|---|\n';
    for (let i = 0; i < F.pages.length; i++) {
      const abs = path.join(ROOT, F.pages[i]);
      let b = '?';
      try { b = fs.statSync(abs).size; } catch (e) { /* 读不到留 ? */ }
      m += '| ' + (i + 1) + ' | `' + F.pages[i] + '` | ' + b + ' |\n';
    }
  } else {
    m += '*(无 `html/**` 页面 ⇒ 无视觉锚点)*\n';
  }

  m += '\n### 1.2 基座侧现有路由（事实）\n\n';
  if (F.routes.length) {
    m += '| # | 路由文件 | 字节 |\n|---|---|---|\n';
    F.routes.forEach((r, i) => {
      let b = '?';
      try { b = fs.statSync(path.join(ROOT, r)).size; } catch (e) { /* 读不到留 ? */ }
      m += '| ' + (i + 1) + ' | `' + r + '` | ' + b + ' |\n';
    });
    /* 装配线索：把路由相关文件里**含 router/routes 关键字**的行原样列出。
     * 为什么给原文而不是「已注册/未注册」的布尔判断：布尔值是扫描器的**结论**，
     * 而扫描器读不懂「`import './router'` 其实注册了 index.js」这种目录导入
     * ⇒ 布尔判断会给出假否定。原文不会骗人，S4 自己读一眼就够。 */
    const clues = [];
    const routeRx = /\b(createRouter|createWebHistory|createWebHashHistory|router\.|routes\s*[:=]|\broutes\b)/;
    for (const r of F.routes.concat(F.entry)) {
      const abs = path.join(ROOT, r);
      let lines;
      try { lines = read(abs).split('\n'); } catch (e) { continue; }
      for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();
        if (!t || t.startsWith('//') || t.startsWith('*')) continue;
        if (routeRx.test(t)) clues.push({ file: r, line: i + 1, text: t });
      }
    }
    m += '\n**路由装配线索（原文，未做解释）**\n\n';
    if (clues.length) {
      m += '| 位置 | 原文 |\n|---|---|\n';
      for (const c of clues.slice(0, 30)) {
        m += '| `' + c.file + ':' + c.line + '` | `' + c.text.replace(/\|/g, '\\|').slice(0, 160) + '` |\n';
      }
      if (clues.length > 30) m += '| ... | *（另有 ' + (clues.length - 30) + ' 行，见源文件）* |\n';
    } else {
      m += '*(未见 `createRouter` / `routes` 等装配关键字 ⇒ 基座可能未装配路由，或装配方式不在上述文件里)*\n';
    }
  } else {
    m += '*(基座未见 `src/router/**` ⇒ 需 S4 建立路由层)*\n';
  }

  m += '\n### 1.3 映射（**留白，S4 回填**）\n\n';
  m += '> 原型页面名 ≠ 路由 path ≠ 组件文件名 —— 三者之间是**设计决策**，不是字符串变换。'
    + '自动映射出来的东西看着像结论，实际是猜的，所以这里留空。\n\n';
  m += '| # | 原型页面 | 目标路由 path | 目标组件文件 | 备注 |\n|---|---|---|---|---|\n';
  if (F.pages.length) {
    for (let i = 0; i < F.pages.length; i++) m += '| ' + (i + 1) + ' | `' + path.basename(F.pages[i]) + '` | *(S4 定)* | *(S4 定)* | |\n';
  } else {
    m += '| — | *(空)* | — | — | — |\n';
  }
  m += '\n> 回填完成后，本节每个 path 必须与 S4 实际写入的路由表**逐字一致**；不一致即视为设计漂移。\n';

  /* -------------------------------------------------- ② 组件树（文件级） --- */
  m += '\n## 2. 组件树（只到文件级）\n\n';
  m += '### 2.1 基座现有组件（事实 · 供判断「复用 or 新建」）\n\n';
  if (F.components.length) {
    const bucket = { components: [], views: [], layouts: [] };
    for (const c of F.components) {
      if (/\/src\/views\//.test(c)) bucket.views.push(c);
      else if (/\/src\/layouts\//.test(c)) bucket.layouts.push(c);
      else bucket.components.push(c);
    }
    for (const k of ['components', 'views', 'layouts']) {
      m += '**`src/' + k + '/`（' + bucket[k].length + '）**\n\n';
      if (bucket[k].length) { for (const c of bucket[k]) m += '- `' + c + '`\n'; }
      else m += '- *(无)*\n';
      m += '\n';
    }
  } else {
    m += '*(基座未见 `src/components|views|layouts/**` ⇒ S4 组件全新建)*\n\n';
  }
  m += '### 2.2 目标组件树（**留白，S4 回填**）\n\n';
  m += '> 骨架只到**文件级**（`路径 → 职责一句话`），不到 props / 事件级 —— 那是代码的事，写在设计文档里必然与代码漂移。\n\n';
  m += '| 文件 | 职责 | 复用自 |\n|---|---|---|\n';
  m += '| *(S4 回填)* | — | — |\n';

  /* -------------------------------------------------------- ③ api 层组织 --- */
  m += '\n## 3. api 层组织\n\n';
  m += '### 3.1 基座现有 api 文件（事实）\n\n';
  m += F.apis.length ? F.apis.map((a) => '- `' + a + '`').join('\n') + '\n' : '*(基座未见 `src/api/**` ⇒ S4 新建 api 层)*\n';
  if (F.store.length) {
    m += '\n**状态层（事实）**：' + F.store.map((s) => '`' + s + '`').join('、') + '\n';
  }

  m += '\n### 3.2 端点 → api 落点（**待 S4 定名**）\n\n';
  m += '> 端点清单来自 S1（' + aligned.list.length + ' 条）。**「建议文件」一栏是待填位，不是建议值** —— '
    + '扫描器不知道你们的 api 层是按模块分文件还是按页面分文件。\n\n';
  m += '| # | 端点 | 方法 | 置信度 | 建议 api 文件（S4 定） | 契约指针 |\n|---|---|---|---|---|---|\n';
  if (aligned.list.length) {
    aligned.list.forEach((e, i) => {
      m += '| ' + (i + 1) + ' | `' + e.path + '` | ' + e.verb + ' | ' + e.confidence
        + ' | *(S4 定)* | `openapi.local.yaml#/paths/' + jsonPtr(e.path) + '` |\n';
    });
  } else {
    m += '| — | *(空)* | — | — | — | — |\n';
  }

  m += '\n### 3.3 请求封装（事实 · 基座接入点）\n\n';
  if (F.request.length) {
    for (const r of F.request) m += '- `' + r + '` —— 统一请求封装候选（文件名特征命中，**未读内容判定**）\n';
  } else {
    m += '*(基座未见 `request*.js` / `axios*.js` ⇒ S4 需自建请求封装，或确认基座用的是别的名字)*\n';
  }

  /* ------------------------------------------------------ ④ 基座接入点 --- */
  m += '\n## 4. 基座接入点（改哪个文件）\n\n';
  m += '> 本节是**事实清单**：这些文件按「文件名特征」被识别为可能的接入点，每条都给了判据。'
    + '「是否必然改动」一栏是判断，S4 若不同意须写明理由并改本表。\n\n';
  m += '| 角色 | 文件 | 判据（短标签） | 是否必然改动 |\n|---|---|---|---|\n';
  const rows = [];
  for (const e of F.entry) rows.push(['应用入口', e, '文件名 `main.*` / `App.vue`', '必然']);
  for (const r of F.routes) rows.push(['路由注册', r, '路径 `src/router/**`', '必然']);
  for (const p of F.guard) rows.push(['路由守卫 / 鉴权', p, '文件名 `permission` / `guard` / `auth`', '视鉴权需求']);
  for (const r of F.request) rows.push(['请求封装 / 拦截器', r, '文件名 `request` / `axios` / `http`', '必然（信封口径要落这里）']);
  for (const c of F.configs) rows.push(['构建 / 环境配置', c, '文件名 `vite.config` / `package.json` / `.env*` / `src/config/**`', '视代理与环境变量']);
  if (rows.length) { for (const r of rows) m += '| ' + r[0] + ' | `' + r[1] + '` | ' + r[2] + ' | ' + r[3] + ' |\n'; }
  else m += '| — | *(基座未见可识别接入点)* | — | — |\n';
  m += '\n> ⚠️ **信封口径必须落在「请求封装」这一层**，不要在每个 api 文件里各写一遍 —— '
    + '那是 12 处一致性问题，会变成 12 个真值。\n';

  /* --------------------------------------------------- ⑤ 枚举值引用 --- */
  m += '\n## 5. 枚举值引用（指向契约）\n\n';
  m += '> 扫描器**不解析枚举**（枚举是从需求文档语义抽取的，属 S2 的 `contract-freezer`）。\n';
  m += '> 本节留空是**如实**：填上任何枚举名都是编的。S4 回填口径 = 枚举名 → `openapi.local.yaml#/components/schemas/<Name>`，'
    + '并标明前端从哪里读（常量文件 / 契约生成）。\n\n';
  m += '| # | 枚举 | 契约指针 | 前端读取位置 |\n|---|---|---|---|\n';
  m += '| — | *(S4 回填)* | — | — |\n';

  const gate = s0.frontend.found ? '' : '\n> 🔴 **基座前端缺失**（`frontend/` 无 package.json）⇒ 本文件全部落点无宿主，S4 无法开工。\n';
  m += gate;
  m += '\n---\n\n复现：`node outputs/s0-scan.cjs ' + ROOT + ' --out ' + OUT + '`\n';
  return m;
}


/* ====================================================================== *
 * BACKEND-DESIGN.md —— 5 章骨架（同准绳：事实填、设计留白）
 * ====================================================================== */
function buildBackendDesignMd(ctx) {
  const { now, inv, s0, aligned } = ctx;
  const B = inv.be;
  let m = '# BACKEND-DESIGN.md —— 后端设计（草稿 v0.1 · S0 骨架）\n\n';
  m += '> 生成器 `s0-scan.cjs`｜' + now + '｜项目根 `' + ROOT + '`\n';
  m += '> **当前形态 = S0 骨架**：5 章结构由扫描器钉死，**事实**（基座现有包 / 类 / 配置）已填，'
    + '**设计**（表结构 / 落点 / 事务口径）留白 —— 由 S5 的 `backend-engineer` 回填（表结构源头在 S2 的 `contract-freezer`），'
    + '回填后去掉 `.draft`。\n';
  m += '> **字段级真值只在契约（`openapi.local.yaml`）里**，本文只写 JSON Pointer 引用与落点。\n';
  m += '> 素材指纹见 `REQUIREMENTS.draft.md` §7 —— 同一轮扫描同一份指纹，此处**不复制**。\n\n';
  m += '> **本期技术栈口径：只做 Java（Spring Boot）** —— 由已裁决项确定。非 Java 基座不纳入本文件。\n\n';

  /* ------------------------------------------------------------ ① 包结构 --- */
  m += '## 1. 包结构\n\n';
  m += '### 1.1 基座现有包（事实 · 由 java 文件路径派生）\n\n';
  if (B.packages.length) {
    for (const p of B.packages) m += '- `' + p + '`\n';
  } else {
    m += '*(基座未见 `src/main/java` 下的 java 文件 ⇒ S5 全新建包结构)*\n';
  }

  m += '\n### 1.2 分层归类（事实）\n\n';
  m += '| 层 | 文件数 | 文件 |\n|---|---|---|\n';
  const layerRows = [
    ['启动类', B.apps], ['Controller', B.controllers], ['Service', B.services],
    ['Mapper', B.mappers], ['Entity / Domain', B.entities], ['Config', B.configs],
    ['异常 / 全局处理', B.advice],
  ];
  for (const [name, list] of layerRows) {
    m += '| ' + name + ' | ' + list.length + ' | '
      + (list.length ? list.map((x) => '`' + path.basename(x) + '`').join(' ') : '—') + ' |\n';
  }

  m += '\n### 1.3 建议新增包（**留白，S5 回填**）\n\n';
  m += '> 新增包的命名要跟基座已有风格一致（上表就是风格事实）。包名一旦定下就写进这里，别在代码里另起一套。\n\n';
  m += '| 包 | 职责 |\n|---|---|\n';
  m += '| *(S5 回填)* | — |\n';

  /* -------------------------------------------------------- ② 表结构 DDL --- */
  m += '\n## 2. 表结构 DDL\n\n';
  m += '> 表结构是**契约（实体）的投影**，源头在 S2 的 `contract-freezer`。扫描器不解析需求文档里的字段语义 ⇒ 本节留空是**如实**。\n';
  m += '> S2 交付物应为 `ddl/*.sql`（可重复执行：`CREATE TABLE IF NOT EXISTS` + 索引显式命名），本节只写「表 → 契约指针」的索引。\n\n';
  m += '> ⚠️ **禁止由后端工程师凭空设计表结构** —— 那会让 DDL 与契约各说一套。\n\n';
  m += '| # | 表名 | 契约指针 | DDL 文件 |\n|---|---|---|---|\n';
  m += '| — | *(S2 回填)* | — | — |\n';

  /* ------------------------------- ③ entity/service/controller 落点 --- */
  m += '\n## 3. entity / service / controller 落点\n\n';
  m += '### 3.1 基座现有 Controller（事实）\n\n';
  if (B.controllers.length) {
    m += '| Controller | 抽到的端点数 |\n|---|---|\n';
    for (const c of B.controllers) {
      const n = (ctx.beSrc ? ctx.beSrc.api : []).filter((x) => x.file === c).length;
      m += '| `' + c + '` | ' + n + ' |\n';
    }
    m += '\n> 端点明细（含行号与原文）见 `spec/endpoints.json` 的 `fullEvidence.backend`。\n';
  } else {
    m += '*(基座未见 `*Controller.java` ⇒ S5 全新建 controller 层)*\n';
  }

  m += '\n### 3.2 端点 → 落点（**待 S5 回填**）\n\n';
  m += '> **置信度一栏直接决定落点策略**：`partial`（仅后端有实现）= 基座已存在，S5 是**改造**；'
    + '`candidate`（仅原型/仅前端）= 后端全无，S5 是**新建**。两者工作量与风险不同，不得混在一张待办里。\n\n';
  m += '| # | 端点 | 方法 | 置信度 | Controller | Service | Entity | 类型 |\n|---|---|---|---|---|---|---|---|\n';
  if (aligned.list.length) {
    aligned.list.forEach((e, i) => {
      const kind = e.confidence === 'partial' ? '改造' : (e.confidence === 'candidate' ? '新建' : '待定');
      m += '| ' + (i + 1) + ' | `' + e.path + '` | ' + e.verb + ' | ' + e.confidence
        + ' | *(S5 定)* | *(S5 定)* | *(S5 定)* | ' + kind + ' |\n';
    });
  } else {
    m += '| — | *(空)* | — | — | — | — | — | — |\n';
  }
  m += '\n> 每个端点必须回填到「契约 `paths` 里的 operationId / 落点类名」两处，缺一不可 —— '
    + '只有类名没契约指针，等于没接进契约体系。\n';

  /* -------------------------------------------------------- ④ 基座接入点 --- */
  m += '\n## 4. 基座接入点（改哪个文件）\n\n';
  m += '| 角色 | 文件 | 判据 | 是否必然改动 |\n|---|---|---|---|\n';
  const brows = [];
  for (const a of B.apps) brows.push(['启动类', a, '文件名 `*Application.java`', '否（新增依赖时）']);
  for (const c of B.configs) brows.push(['配置类', c, '文件名 `*Config*.java`', '视数据源 / 拦截器 / 序列化']);
  for (const x of B.advice) brows.push(['异常 / 全局处理', x, '文件名特征 `Advice` / `Exception` / `Handler`', '必然（信封口径要落这里）']);
  for (const r of B.resources) {
    if (/(application|bootstrap)[^/]*\.(yml|yaml|properties)$/.test(path.basename(r))) brows.push(['应用配置', r, '文件名特征 `application.*` / `bootstrap.*`', '视数据源与外部系统']);
    else if (/\/mapper\/.*\.xml$/.test(r) || /mybatis/.test(r)) brows.push(['MyBatis 映射', r, '路径/文件名特征 `mapper/**` / `mybatis`', '必然（新增 Mapper 时）']);
  }
  if (brows.length) { for (const r of brows) m += '| ' + r[0] + ' | `' + r[1] + '` | ' + r[2] + ' | ' + r[3] + ' |\n'; }
  else m += '| — | *(基座未见可识别接入点)* | — | — |\n';
  if (!B.advice.length) {
    m += '\n> 🔴 **基座无异常 / 全局处理类**（未见 `*Advice*` / `*Exception*` / `*Handler*.java`）⇒ '
      + '信封口径**无既有宿主**，必须新建一个（`@RestControllerAdvice` + 统一返回体），'
      + '而不是散在各个 Controller 里。这条是结论、有判据，S5 若不同意须给出反例文件。\n';
  }
  m += '\n> ⚠️ **信封口径必须落在「异常 / 全局处理」这一层**（`@ControllerAdvice` / 统一返回体），'
    + '不要每个 Controller 各包一次。当前口径见 `spec/project.manifest.json` 的 `S1.envelope`。\n';

  /* ---------------------------------------------------- ⑤ 事务与异常口径 --- */
  m += '\n## 5. 事务与异常口径\n\n';
  m += '### 5.1 基座现有事实（内容特征扫，非文件名）\n\n';
  let txHits = 0, advHits = 0;
  for (const f of B.java) {
    let txt = '';
    try { txt = read(path.join(ROOT, f)); } catch (e) { continue; }
    if (/@Transactional\b/.test(txt)) txHits++;
    if (/@ControllerAdvice|@RestControllerAdvice|@ExceptionHandler/.test(txt)) advHits++;
  }
  m += '| 特征 | 命中文件数 | 说明 |\n|---|---|---|\n';
  /* 说明栏必须随命中数改口 —— 命中 0 还写「基座已有…」是自相矛盾（文案与事实打架）。 */
  m += '| `@Transactional` | ' + txHits + ' | '
    + (txHits ? '基座已有事务注解用法；新代码须与之同口径（注解位置 / 回滚规则）'
      : '**基座无既有事务口径** ⇒ 新代码的事务边界与回滚规则需先裁决') + ' |\n';
  m += '| `@ControllerAdvice` / `@ExceptionHandler` | ' + advHits + ' | '
    + (advHits ? '基座已有全局异常处理；**新代码禁止另起一套**'
      : '**基座无全局异常处理** ⇒ 信封口径要新建宿主，禁止各 Controller 自包') + ' |\n';
  if (txHits === 0 || advHits === 0) {
    m += '\n> 🔴 命中为 0 的那一项意味着基座没有既有口径 ⇒ 该口径需由人裁决后写入 `spec/decisions.md`，'
      + '不得由 S5 自作主张（两个工程师会写出两套）。\n';
  }

  m += '\n### 5.2 新代码口径（**留白，人裁决 + S5 回填**）\n\n';
  m += '| 项 | 口径 | 依据 |\n|---|---|---|\n';
  m += '| 事务边界 | *(待定)* | — |\n';
  m += '| 回滚规则 | *(待定)* | — |\n';
  m += '| 异常 → 信封映射 | *(待定)* | 须与 `S1.envelope.source` 一致：'
    + (ctx.env ? '`' + ctx.env.source + '`' + (ctx.env.confirmed ? '（已证实）' : '（**待追认**，追认前不得据此写死）') : '(未解析)') + ' |\n';
  m += '\n> 本节的每一条定下来后，都应有一条对应的可执行断言（否则口径只活在文档里）。\n';

  const gate = s0.backend.found ? '' : '\n> 🔴 **基座后端缺失**（`backend/` 无 pom.xml）⇒ 本文件全部落点无宿主，S5 无法开工。\n';
  m += gate;
  m += '\n---\n\n复现：`node outputs/s0-scan.cjs ' + ROOT + ' --out ' + OUT + '`\n';
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

  const srcHashes = buildSourceHashes(s0, { docSrc, protoSrc, feSrc, beSrc });
  // 前后端「文件盘面」：两份设计文档生成器的唯一事实来源（一次 walk，两个消费者）
  const inv = buildInventory();

  const manifest = buildManifest(s0, srcStats, aligned, gaps, envelopeShapes, env, srcHashes);
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
  fs.writeFileSync(path.join(OUT, 'doc', 'REQUIREMENTS.draft.md'),
    buildRequirementsMd({ s0, aligned, gaps, now, srcHashes }));
  fs.writeFileSync(path.join(OUT, 'doc', 'FRONTEND-DESIGN.draft.md'),
    buildFrontendDesignMd({ s0, aligned, now, inv }));
  fs.writeFileSync(path.join(OUT, 'doc', 'BACKEND-DESIGN.draft.md'),
    buildBackendDesignMd({ s0, aligned, now, inv, env, beSrc }));

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
  L.push('  ' + path.join(OUT, 'doc', 'FRONTEND-DESIGN.draft.md'));
  L.push('  ' + path.join(OUT, 'doc', 'BACKEND-DESIGN.draft.md'));
  console.log(L.join('\n'));

  process.exit(gaps.some((g) => g.severity === 'blocker') ? 1 : 0);
}

main();
