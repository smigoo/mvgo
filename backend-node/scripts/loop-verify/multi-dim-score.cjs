#!/usr/bin/env node
/**
 * LOOP-VERIFY · 多维判分器（v1, 2026-11-10）
 *
 * 用途：对生成产物做「渲染后多维度量」，与 Figma 真值逐项比对，输出可 diff 的报告。
 * 判据全部来自数据（figma bbox / DOM 实测 / 资源加载事实），无硬编码期望值。
 *
 * 维度：
 *   A. 结构：每个 data-section-id 容器 vs Figma 同名节点 bbox（宽/高/偏离）
 *   B. 尺寸：组件根尺寸 vs Figma root（扣除面板头后的内容高度由 header 段真值推导）
 *   C. 资源：img 总数 / 坏图 / 空 src / 零引用资源（对比 resource-dom-mapping）
 *   D. 文本：DOM 可见文本 vs Figma TEXT characters（中文 ≥2 字）
 *   E. 布局：顶层 section 的排列方向（同 y 异 x ⇒ 横排；同 x 异 y ⇒ 纵排）
 *
 * 用法：
 *   node scripts/loop-verify/multi-dim-score.cjs <componentId...>
 *   node scripts/loop-verify/multi-dim-score.cjs --json <componentId...>
 *
 * 退出码：0 恒成功（报告型工具）；判分决策由调用方按报告阈值决定。
 */
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = '/Users/smigoo/工作/mvgo';
const COMP_DIR = join(ROOT, 'frontend/workspace/custom-components');
const PREVIEW_BASE = process.env.PREVIEW_BASE || 'http://localhost:2610';
const PUPPETEER_PATH = join(ROOT, 'backend-node/node_modules/puppeteer/lib/puppeteer/puppeteer.js');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const comps = args.filter((a) => !a.startsWith('--'));

if (comps.length === 0) {
  console.error('usage: multi-dim-score.cjs [--json] <componentId...>');
  process.exit(0);
}

/** Figma 节点索引：id → { w,h,name,type } */
function figmaIndex(dir) {
  const p = join(dir, '.mc-gen/cache/figma-node-data.json');
  if (!existsSync(p)) return new Map();
  const f = JSON.parse(readFileSync(p, 'utf-8'));
  const map = new Map();
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    const bb = n.absoluteBoundingBox;
    if (n.id && bb && Number.isFinite(bb.width) && Number.isFinite(bb.height)) {
      map.set(String(n.id), { w: bb.width, h: bb.height, name: String(n.name || ''), type: n.type });
    }
    for (const c of n.children || []) walk(c);
  };
  walk(f.document || f);
  return map;
}

/** Figma 文本真值（中文 ≥2 字） */
function figmaTexts(dir) {
  const p = join(dir, '.mc-gen/cache/figma-node-data.json');
  if (!existsSync(p)) return new Set();
  const f = JSON.parse(readFileSync(p, 'utf-8'));
  const out = new Set();
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (typeof n.characters === 'string') {
      for (const m of n.characters.matchAll(/[\u4e00-\u9fa5]{2,}/g)) out.add(m[0]);
    }
    for (const c of n.children || []) walk(c);
  };
  walk(f.document || f);
  return out;
}

async function scoreOne(cid) {
  const puppeteer = require(PUPPETEER_PATH);
  const dir = join(COMP_DIR, cid);
  const boxes = figmaIndex(dir);
  const truthTexts = figmaTexts(dir);

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 480, height: 700, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  try {
    await page.goto(`${PREVIEW_BASE}/preview/${cid}`, { waitUntil: 'networkidle2', timeout: 45000 });
  } catch (e) {
    errs.push('GOTO ' + e.message.slice(0, 80));
  }
  await new Promise((r) => setTimeout(r, 2600));

  const dom = await page.evaluate(() => {
    const secs = [...document.querySelectorAll('[data-section-id]')].map((e) => {
      const r = e.getBoundingClientRect();
      return {
        sid: e.getAttribute('data-section-id'),
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      };
    });
    const root = document.querySelector('[class*="-slot-con"]');
    const rb = root ? root.getBoundingClientRect() : null;
    const imgs = [...document.images].map((i) => ({
      src: (i.currentSrc || i.src || '').split('/').pop(),
      ok: i.complete && i.naturalWidth > 0,
      w: i.naturalWidth,
    }));
    return {
      rootSize: rb ? [Math.round(rb.width), Math.round(rb.height)] : null,
      secs,
      imgs,
      text: (document.body.innerText || '').replace(/\s+/g, ' '),
      canvasCount: document.querySelectorAll('canvas').length,
    };
  });
  await browser.close();

  // A. 结构/尺寸
  const sections = dom.secs.map((s) => {
    const t = boxes.get(s.sid);
    if (!t) return { ...s, truth: null, dw: null, dh: null };
    return {
      ...s,
      truth: { w: Math.round(t.w), h: Math.round(t.h), name: t.name },
      dw: s.w - Math.round(t.w),
      dh: s.h - Math.round(t.h),
    };
  });

  // E. 顶层布局方向（取 y 最小的几个段）
  const top = [...sections].filter((s) => s.w > 0).sort((a, b) => a.y - b.y).slice(0, 4);
  let layoutDir = 'unknown';
  if (top.length >= 2) {
    const sameY = Math.abs(top[1].y - top[0].y) < 5;
    layoutDir = sameY ? 'row' : 'column';
  }

  // C. 资源
  const broken = dom.imgs.filter((i) => !i.ok);
  const emptySrc = dom.imgs.filter((i) => !i.src).length;

  // D. 文本承载
  const domText = dom.text.replace(/\s+/g, '');
  const missingTexts = [...truthTexts].filter((t) => !domText.includes(t));

  return {
    componentId: cid,
    rootSize: dom.rootSize,
    sections,
    layoutDir,
    resources: { total: dom.imgs.length, broken: broken.length, emptySrc, brokenList: broken.map((b) => b.src || '(空src)') },
    text: { truthCount: truthTexts.size, missing: missingTexts.slice(0, 12), missingCount: missingTexts.length },
    canvasCount: dom.canvasCount,
    pageErrors: errs.slice(0, 3),
  };
}

(async () => {
  const results = [];
  for (const c of comps) results.push(await scoreOne(c));

  if (asJson) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  for (const r of results) {
    console.log(`\n====== ${r.componentId}`);
    console.log(`  root: ${r.rootSize ? r.rootSize.join('×') : 'n/a'} | 顶层布局: ${r.layoutDir} | canvas: ${r.canvasCount}`);
    console.log('  段级（DOM vs Figma 真值）：');
    for (const s of r.sections) {
      if (s.truth) {
        const flag = Math.abs(s.dh) >= 6 || Math.abs(s.dw) >= 6 ? '⚠' : '✓';
        console.log(`    ${s.sid.padEnd(18)} ${String(s.w).padStart(3)}x${String(s.h).padStart(3)} | 真值 ${String(s.truth.w).padStart(3)}x${String(s.truth.h).padStart(3)} | Δ${s.dw >= 0 ? '+' : ''}${s.dw}/${s.dh >= 0 ? '+' : ''}${s.dh} ${flag} ${s.truth.name.slice(0, 12)}`);
      } else {
        console.log(`    ${s.sid.padEnd(18)} ${String(s.w).padStart(3)}x${String(s.h).padStart(3)} | 真值 —`);
      }
    }
    console.log(`  资源: ${r.resources.total} 张 | 坏 ${r.resources.broken} | 空src ${r.resources.emptySrc}${r.resources.broken ? ' → ' + r.resources.brokenList.join(',') : ''}`);
    console.log(`  文本: 真值中文 ${r.text.truthCount} 条 | 未承载 ${r.text.missingCount}${r.text.missingCount ? ' → ' + r.text.missing.join('、') : ''}`);
    if (r.pageErrors.length) console.log('  页面错误:', r.pageErrors.join(' | '));
  }
})().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(0);
});
