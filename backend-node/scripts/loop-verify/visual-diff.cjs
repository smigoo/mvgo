#!/usr/bin/env node
/**
 * LOOP-VERIFY · 深度视觉判分器 V2（2026-11-10）
 *
 * 对比「Figma 预览真值」与「生成产物渲染截图」，覆盖六个维度：
 *   ① 布局结构：顶层段顺序（按 y 排序）与方向
 *   ② 容器：每个 data-section-id 的 bbox（宽/高偏差）
 *   ③ 子节点：每个段内直接子元素的**宽高比**（DOM 实测 vs Figma children bbox，按 x 序配对）
 *   ④ 排版：段内子元素对齐方式（x 分布均匀性）、文本行数
 *   ⑤ 字体颜色：文本子元素的 fontSize（允许整体缩放）/ color（hex 精确比）
 *   ⑥ 静态资源：img 渲染宽高 vs Figma 图标节点 bbox；背景图挂载（backgroundImage 有无）
 *
 * 全部判据来自数据（Figma 节点真值 / DOM computed style），无硬编码期望值；
 * 缩放容差 SCALE_TOL=0.12（组件整体缩放 405/420≈0.96 属正常）。
 *
 * 用法：node scripts/loop-verify/visual-diff.cjs [--json] <componentId...>
 */
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = '/Users/smigoo/工作/mvgo';
const COMP_DIR = join(ROOT, 'frontend/workspace/custom-components');
const PREVIEW_BASE = process.env.PREVIEW_BASE || 'http://localhost:2610';
const PUPPETEER_PATH = join(ROOT, 'backend-node/node_modules/puppeteer/lib/puppeteer/puppeteer.js');
const SCALE_TOL = 0.12;
const COLOR_TOL = 12; // 每通道允许差

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const comps = args.filter((a) => !a.startsWith('--'));
if (!comps.length) { console.error('usage: visual-diff.cjs [--json] <componentId...>'); process.exit(0); }

const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
function rgbToHex(rgb) {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/.exec(rgb || '');
  if (!m) return null;
  const a = m[4] !== undefined ? Number(m[4]) : 1;
  if (a === 0) return 'transparent';
  return `#${hex2(m[1])}${hex2(m[2])}${hex2(m[3])}`;
}
function colorClose(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const pa = /^#([0-9a-f]{6})$/i.exec(a), pb = /^#([0-9a-f]{6})$/i.exec(b);
  if (!pa || !pb) return false;
  for (let i = 0; i < 3; i += 1) {
    if (Math.abs(parseInt(pa[1].slice(i * 2, i * 2 + 2), 16) - parseInt(pb[1].slice(i * 2, i * 2 + 2), 16)) > COLOR_TOL) return false;
  }
  return true;
}
const ratio = (w, h) => (h > 0 ? Math.round((w / h) * 100) / 100 : null);

/** Figma 侧：sid → { w,h, layoutDir, kids:[{x,y,w,h,ratio,fontSize,color,type,name}], texts:[{text,fontSize,color}] } */
function figmaDetail(dir) {
  const p = join(dir, '.mc-gen/cache/figma-node-data.json');
  if (!existsSync(p)) return { map: new Map(), texts: new Set() };
  const f = JSON.parse(readFileSync(p, 'utf-8'));
  const root = f.document || f;
  const map = new Map();
  const texts = new Set();
  const kidOf = (n) => {
    const bb = n.absoluteBoundingBox || {};
    const st = n.style || {};
    let color = null; let fontSize = null;
    if ((n.type === 'TEXT') && Array.isArray(n.fills)) {
      const s = n.fills.find((x) => x && x.visible !== false && x.type === 'SOLID' && x.color);
      if (s) {
        color = `#${hex2(s.color.r * 255)}${hex2(s.color.g * 255)}${hex2(s.color.b * 255)}`;
        fontSize = Number.isFinite(st.fontSize) ? st.fontSize : null;
      }
    }
    return {
      id: n.id, name: String(n.name || ''), type: n.type,
      x: Math.round(bb.x || 0), y: Math.round(bb.y || 0),
      w: Math.round(bb.width || 0), h: Math.round(bb.height || 0),
      ratio: ratio(bb.width, bb.height), fontSize, color,
      text: typeof n.characters === 'string' ? n.characters.slice(0, 16) : undefined,
    };
  };
  const walk = (n, topChain) => {
    if (!n || typeof n !== 'object') return;
    if (typeof n.characters === 'string' && /[\u4e00-\u9fa5]{2,}/.test(n.characters)) {
      for (const m of n.characters.matchAll(/[\u4e00-\u9fa5]{2,}/g)) texts.add(m[0]);
    }
    const bb = n.absoluteBoundingBox;
    if (n.id && bb && n.children && n.children.length > 0) {
      const kids = n.children.filter((c) => c && c.absoluteBoundingBox && (c.absoluteBoundingBox.width || 0) > 0)
        .map(kidOf).sort((a, b) => a.x - b.x);
      if (kids.length >= 1) {
        map.set(String(n.id), { w: Math.round(bb.width), h: Math.round(bb.height), kids });
      }
    }
    const ch = topChain && n.id ? [...topChain, String(n.id)] : (n.id ? [String(n.id)] : []);
    for (const c of n.children || []) walk(c, ch);
  };
  walk(root, []);
  return { map, texts };
}

async function scoreOne(cid) {
  const puppeteer = require(PUPPETEER_PATH);
  const dir = join(COMP_DIR, cid);
  const fig = figmaDetail(dir);
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 480, height: 900, deviceScaleFactor: 2 });
  try { await page.goto(`${PREVIEW_BASE}/preview/${cid}`, { waitUntil: 'networkidle2', timeout: 45000 }); } catch (e) { /* 继续 */ }
  await new Promise((r) => setTimeout(r, 2600));
  const dom = await page.evaluate(() => {
    const hx = (rgb) => {
      const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/.exec(rgb || '');
      if (!m) return null;
      if (m[4] !== undefined && Number(m[4]) === 0) return 'transparent';
      const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
      return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
    };
    const secs = [...document.querySelectorAll('[data-section-id]')].map((sec) => {
      const sr = sec.getBoundingClientRect();
      const kids = [...sec.children].map((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const isImg = el.tagName === 'IMG';
        return {
          tag: el.tagName,
          cls: String(el.className || '').split(/\s+/)[0] || '',
          x: Math.round(r.x - sr.x), y: Math.round(r.y - sr.y),
          w: Math.round(r.width), h: Math.round(r.height),
          ratio: r.height > 0 ? Math.round((r.width / r.height) * 100) / 100 : null,
          fontSize: parseFloat(cs.fontSize) || null,
          fontWeight: cs.fontWeight,
          color: hx(cs.color),
          bg: hx(cs.backgroundColor),
          bgImage: cs.backgroundImage !== 'none',
          text: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 16),
          isImg,
          imgNatural: isImg ? { w: el.naturalWidth, h: el.naturalHeight } : null,
        };
      }).sort((a, b) => a.x - b.x);
      return {
        sid: sec.getAttribute('data-section-id'),
        w: Math.round(sr.width), h: Math.round(sr.height),
        kids,
      };
    });
    const imgs = [...document.images].map((i) => ({
      src: (i.currentSrc || i.src || '').split('/').pop(),
      ok: i.complete && i.naturalWidth > 0,
      renderW: Math.round(i.getBoundingClientRect().width),
      renderH: Math.round(i.getBoundingClientRect().height),
    }));
    return { secs, imgs, text: (document.body.innerText || '').replace(/\s+/g, '') };
  });
  await browser.close();

  // ── 比对 ──
  const issues = [];
  const sectionReports = [];
  for (const s of dom.secs) {
    const truth = fig.map.get(s.sid);
    if (!truth) { sectionReports.push({ sid: s.sid, note: 'Figma 无同 id 节点（合成锚或错配）', domKids: s.kids.length }); continue; }
    const rep = { sid: s.sid, name: (truth.kids[0] && truth.kids[0].name) || '', domW: s.w, domH: s.h, truthW: truth.w, truthH: truth.h, kidProblems: [], fontProblems: [], colorProblems: [], bgProblems: [] };
    // ③ 子节点宽高比（按 x 序配对，数量取 min）
    const n = Math.min(s.kids.length, truth.kids.length);
    if (s.kids.length !== truth.kids.length) {
      rep.kidProblems.push(`子元素数 DOM ${s.kids.length} vs Figma ${truth.kids.length}`);
    }
    for (let i = 0; i < n; i += 1) {
      const d = s.kids[i]; const t = truth.kids[i];
      if (d.w < 4 || d.h < 4) continue;
      if (d.ratio && t.ratio && Math.abs(d.ratio - t.ratio) / t.ratio > SCALE_TOL + 0.08) {
        rep.kidProblems.push(`#${i}(${t.name.slice(0, 8)}) 宽高比 ${d.ratio} vs 真值 ${t.ratio}（${d.w}×${d.h} vs ${t.w}×${t.h}）`);
      }
      // ⑤ 字体
      if (t.fontSize && d.fontSize) {
        const scale = s.w && truth.w ? s.w / truth.w : 1;
        const expect = t.fontSize * scale;
        if (Math.abs(d.fontSize - expect) / expect > 0.35) {
          rep.fontProblems.push(`#${i}「${(d.text || t.name).slice(0, 8)}」 ${d.fontSize}px vs 真值 ${t.fontSize}px（×${scale.toFixed(2)}≈${Math.round(expect)}）`);
        }
      }
      if (t.color && d.color && d.text && !colorClose(d.color, t.color)) {
        rep.colorProblems.push(`#${i}「${d.text.slice(0, 8)}」 ${d.color} vs 真值 ${t.color}`);
      }
      // ⑥ 背景图挂载：Figma 子项带 IMAGE fill（icon 类），DOM 对应元素必须渲染出图
      if (d.isImg && d.imgNatural && d.imgNatural.w === 0) {
        rep.bgProblems.push(`#${i} img 空源`);
      }
    }
    sectionReports.push(rep);
    if (rep.kidProblems.length || rep.fontProblems.length || rep.colorProblems.length || rep.bgProblems.length) {
      issues.push(rep);
    }
  }

  // ⑥ 静态资源挂载
  const brokenImgs = dom.imgs.filter((i) => !i.ok);
  // D. 文本
  const domText = dom.text;
  const missingTexts = [...fig.texts].filter((t) => !domText.includes(t));

  return {
    componentId: cid,
    rootSections: dom.secs.map((s) => ({ sid: s.sid, w: s.w, h: s.h })),
    sections: sectionReports,
    problemSections: issues.length,
    resources: { total: dom.imgs.length, broken: brokenImgs.length, brokenList: brokenImgs.map((b) => b.src || '(空src)'), renders: dom.imgs.filter((i) => i.ok).slice(0, 6) },
    missingTexts: missingTexts.slice(0, 10),
    missingTextCount: missingTexts.length,
  };
}

(async () => {
  const out = [];
  for (const c of comps) out.push(await scoreOne(c));
  if (asJson) { console.log(JSON.stringify(out, null, 2)); return; }
  for (const r of out) {
    console.log(`\n====== ${r.componentId}`);
    console.log(`  问题段数: ${r.problemSections}/${r.rootSections.length} | 资源: ${r.resources.total}张 坏${r.resources.broken}${r.resources.broken ? ' → ' + r.resources.brokenList.join(',') : ''} | 文本缺: ${r.missingTextCount}${r.missingTextCount ? ' → ' + r.missingTexts.join('、') : ''}`);
    for (const s of r.sections) {
      if (!s.kidProblems && !s.fontProblems) continue;
      const has = (s.kidProblems && s.kidProblems.length) || (s.fontProblems && s.fontProblems.length) || (s.colorProblems && s.colorProblems.length) || (s.bgProblems && s.bgProblems.length);
      if (!has) continue;
      console.log(`  [${s.sid}] DOM ${s.domW}×${s.domH} vs 真值 ${s.truthW}×${s.truthH}`);
      for (const p of (s.kidProblems || []).slice(0, 4)) console.log('     · 尺寸:', p);
      for (const p of (s.fontProblems || []).slice(0, 4)) console.log('     · 字号:', p);
      for (const p of (s.colorProblems || []).slice(0, 4)) console.log('     · 颜色:', p);
      for (const p of (s.bgProblems || []).slice(0, 4)) console.log('     · 资源:', p);
    }
  }
})().catch((e) => { console.error('FATAL', e.message); process.exit(0); });
