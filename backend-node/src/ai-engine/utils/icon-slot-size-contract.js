/**
 * 🛡️ 刀 49（2026-10-22 · mc-1792643509867-db2d65f7 实锤）：**图标槽位尺寸契约**。
 *
 * ── 事故 ─────────────────────────────────────────────────────────────
 * 真机产物 `HeaderText2.vue`：
 *   `<img :src="icon5" class="c-db2d65-icon" alt="" />`
 * 而 `.c-db2d65-icon` 是**被三个元素共用的共享 class**（common.less:466）：
 *   · `ContentIcon.vue:2`  / `ContentIcon2.vue:3` —— 图标**容器** `<div>`，要 `width:100%`
 *   · `HeaderText2.vue:4`                         —— 图标**本体** `<img>`，真值 16×16
 * 容器语义被合并进同一条规则后：`width: 100%; flex: 1 1 0;`。
 * 实测渲染（真实预览页 puppeteer）：该 `<img>` 宽度 **570px**，把标题挤到 x=960，
 * 表现为「图标跑到面板中间、文字靠右」。同段另两个标题用的 class 没有共享规则 ⇒ 正常
 * —— 这就是「战略段效果最佳」的直接原因。
 *
 * 既有通道为何全都没拦住：
 *   · **刀 39** `ensureReferencedIconSize` 依赖 `mapping.figmaBox`，而
 *     `resource-dom-mapping.json` **没有 figmaBox 字段**（只有 assignedVarName /
 *     resourceFile / ownerSectionId / figmaNodeId / usage / semanticVarName）⇒
 *     `iconSizeFromFigmaBox(undefined)` 返 null ⇒ 整条路径**静默跳过**。
 *   · 即使补上尺寸，`applyPxSizeToImgTag` 写的 `dim` 是
 *     `width:Wpx;height:Hpx;object-fit:contain`，**没有 `flex:none`** ——
 *     而 flex 布局里 `flex-basis` 非 auto 时 `width` 直接失效 ⇒ 仍被拉满。
 *
 * ── 判据（确定性、命名无关、不依赖 figmaBox）──────────────────────────
 * 真值 = **导入图片的原始像素尺寸**。实测等价性：Figma 导出 1x，`icon-3164.png` = 16×16
 *   = 节点 `38:3164` 的 bbox；`icon-263.png` = 53×56 ≈ `187:263` 的 53×55.45。
 *   所以 PNG/GIF/JPEG 头里的 w×h 就是图标的设计尺寸，且**永不缺失**。
 *
 * 判定「尺寸已生效」= 该 `<img>` 的**内联 style** 同时满足：
 *   ① `width: W px`（±1，W = 原始宽）
 *   ② `height: H px`（±1，H = 原始高）
 *   ③ `flex` 为 `none` / `0 0 auto`（否则 class 的 `flex-grow` 会接管主轴尺寸）
 * 三项缺任一 ⇒ issue。自愈写内联（**inline 恒胜，绝不动共享 class** —— 铁律：
 *   class 被别的元素复用绝不改写）。
 *
 * ── fail-open（判不了就不猜）────────────────────────────────────────
 *   · `src` 不是**局部 import 的图片变量**（字面量 / 动态表达式 / 远程 URL）⇒ 不判
 *   · 图片文件读不到 / 非受支持格式 / 尺寸 ≤ 0 ⇒ 不判
 *   · 内联已写 `object-fit: cover` ⇒ 视为**有意的裁剪铺满**，不判
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

/** 单次读图上限（图标级，防御异常大文件） */
const MAX_HEAD_BYTES = 64 * 1024;

/**
 * 从图片字节头解析原始像素尺寸。
 * 支持 PNG / GIF / JPEG / WebP；其余返 null。
 * @param {Buffer} buf
 * @returns {{width:number, height:number}|null}
 */
export function parseImageSize(buf) {
  if (!buf || buf.length < 10) return null;
  // PNG：8 字节签名 + IHDR（width/height 在 offset 16..24，大端）
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return width > 0 && height > 0 ? { width, height } : null;
  }
  // GIF：'GIF8' + 逻辑屏宽/高（小端，offset 6..10）
  if (buf.length >= 10 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    const width = buf.readUInt16LE(6);
    const height = buf.readUInt16LE(8);
    return width > 0 && height > 0 ? { width, height } : null;
  }
  // WebP（VP8 / VP8L / VP8X）
  if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const fmt = buf.toString('ascii', 12, 16);
    if (fmt === 'VP8X') {
      const width = 1 + buf.readUIntLE(24, 3);
      const height = 1 + buf.readUIntLE(27, 3);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    if (fmt === 'VP8 ') {
      const width = buf.readUInt16LE(26) & 0x3fff;
      const height = buf.readUInt16LE(28) & 0x3fff;
      return width > 0 && height > 0 ? { width, height } : null;
    }
    return null;
  }
  // JPEG：扫 SOFn 段
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const height = buf.readUInt16BE(i + 5);
        const width = buf.readUInt16BE(i + 7);
        return width > 0 && height > 0 ? { width, height } : null;
      }
      if (len < 2) return null;
      i += 2 + len;
    }
    return null;
  }
  return null;
}

/**
 * 读磁盘图片的原始尺寸（只读文件头）。
 * @param {string} absPath
 * @returns {{width:number, height:number}|null}
 */
export function readImageSizeFromDisk(absPath) {
  try {
    if (!absPath || !existsSync(absPath)) return null;
    const fd = readFileSync(absPath).subarray(0, MAX_HEAD_BYTES);
    return parseImageSize(fd);
  } catch {
    return null;
  }
}

/**
 * 收集 `<script setup>` 里的**本地图片 import**：`import VAR from '../../resources/images/x.png'`。
 * 只认「变量 ← 静态字符串路径」，动态/包名导入一律不进表（fail-open）。
 * @param {string} code
 * @returns {Map<string, string>} varName → 图片路径（原样，未解析）
 */
export function collectLocalImageImports(code) {
  const out = new Map();
  const text = String(code || '');
  const re = /^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+\.(?:png|jpe?g|gif|webp|svg))['"]/gim;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.set(m[1], m[2]);
  }
  return out;
}

/** 模板区文本（无 `<template>` 时退回全文） */
function templateRegion(code) {
  const text = String(code || '');
  const open = text.indexOf('<template>');
  const close = text.lastIndexOf('</template>');
  return open >= 0 && close > open ? text.slice(open + 10, close) : text;
}

/** 取标签上的静态内联 style 串（排除 `:style`） */
function inlineStyleOf(tag) {
  const m = /(?:^|\s)style\s*=\s*"([^"]*)"/i.exec(String(tag || ''));
  return m ? m[1] : '';
}

/** `:src="VAR"` 的 VAR（只认单个裸标识符） */
function boundSrcVar(tag) {
  const m = /:src\s*=\s*"([A-Za-z_$][\w$]*)"|v-bind:src\s*=\s*"([A-Za-z_$][\w$]*)"/.exec(String(tag || ''));
  return m ? (m[1] || m[2]) : null;
}

/** 内联声明 → { prop: value }（只解析 `prop: value`，`calc()/url()` 不截断） */
export function parseInlineDecls(style) {
  const out = {};
  for (const seg of String(style || '').split(';')) {
    const m = /^\s*([a-zA-Z-]+)\s*:\s*([\s\S]+)$/.exec(seg);
    if (m) out[m[1].toLowerCase()] = m[2].trim();
  }
  return out;
}

/** `16px` → 16；其余（%/calc/auto）→ null */
function pxValue(raw) {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*px\s*$/i.exec(String(raw ?? ''));
  return m ? Number(m[1]) : null;
}

/** flex 简写是否「不参与主轴拉伸」（none / 0 0 auto / 0 0 <len>） */
function flexIsFixed(raw) {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v) return false;
  if (v === 'none') return true;
  const parts = v.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return false;
  const grow = Number(parts[0]);
  const shrink = Number(parts[1]);
  return Number.isFinite(grow) && grow === 0 && Number.isFinite(shrink) && shrink === 0;
}

/**
 * 唯一判据实现：单个 `<img>` 标签 vs 真值尺寸 → 违约项列表。
 * 检测与自愈共用本函数（两段式铁律：两侧必须同一实现）。
 *
 * @param {string} tag 完整 `<img …>` 标签
 * @param {{width:number,height:number}} truth 原始像素尺寸
 * @returns {Array<{code:string, actual:string, want:string}>}
 */
export function judgeIconSlotSize(tag, truth) {
  const out = [];
  if (!tag || !truth) return out;
  const decls = parseInlineDecls(inlineStyleOf(tag));

  // 有意裁剪铺满 ⇒ 不判（fail-open）
  if (/cover/i.test(String(decls['object-fit'] || ''))) return out;

  const w = pxValue(decls.width);
  const h = pxValue(decls.height);
  if (w === null || Math.abs(w - truth.width) > 1) {
    out.push({ code: 'width', actual: decls.width ?? '(未声明)', want: `${truth.width}px` });
  }
  if (h === null || Math.abs(h - truth.height) > 1) {
    out.push({ code: 'height', actual: decls.height ?? '(未声明)', want: `${truth.height}px` });
  }
  if (!flexIsFixed(decls.flex)) {
    out.push({ code: 'flex', actual: decls.flex ?? '(未声明)', want: 'none' });
  }
  return out;
}

/** 改写标签的内联 style：删旧 width/height/object-fit/flex，写入契约值 */
function applyIconSlotSize(tag, truth) {
  const w = Math.round(truth.width);
  const h = Math.round(truth.height);
  const dim = `width:${w}px;height:${h}px;object-fit:contain;flex:none`;
  const existing = /(?:^|\s)style\s*=\s*"([^"]*)"/i.exec(tag);
  if (existing) {
    const kept = String(existing[1])
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !/^(?:width|height|object-fit|flex|flex-basis|flex-grow|flex-shrink)\b/i.test(s))
      .join(';');
    const next = kept ? `${kept};${dim}` : dim;
    return tag.replace(existing[0], ` style="${next}"`);
  }
  return tag.replace(/\s*\/?>$/, (tail) => ` style="${dim}"${tail}`);
}

/**
 * 主判据：扫一份产物，找出「尺寸未生效的资源图标 `<img>`」。
 *
 * @param {string} code SFC 全文
 * @param {object} opts
 * @param {(imgPath:string)=>string|null} opts.resolveAbs 把 import 路径解析成磁盘绝对路径
 * @param {(absPath:string)=>({width:number,height:number}|null)} [opts.sizeOf] 尺寸读取（默认真实读盘）
 * @returns {{issues:Array, stats:Object}}
 */
export function detectIconSlotIssues(code, opts = {}) {
  const issues = [];
  const stats = { imgs: 0, bound: 0, judged: 0, skippedUnresolved: 0, skippedNoTruth: 0, skippedLiteral: 0 };
  const text = String(code || '');
  if (!text) return { issues, stats };
  const imports = collectLocalImageImports(text);
  if (imports.size === 0) return { issues, stats };
  const resolveAbs = typeof opts.resolveAbs === 'function' ? opts.resolveAbs : () => null;
  const sizeOf = typeof opts.sizeOf === 'function' ? opts.sizeOf : readImageSizeFromDisk;

  const tagRe = /<img\b((?:"[^"]*"|'[^']*'|[^>])*)>/gi;
  let m;
  while ((m = tagRe.exec(templateRegion(text))) !== null) {
    const tag = m[0];
    stats.imgs += 1;
    const varName = boundSrcVar(tag);
    if (!varName) { stats.skippedLiteral += 1; continue; }
    const imgPath = imports.get(varName);
    if (!imgPath) { stats.skippedLiteral += 1; continue; }
    stats.bound += 1;
    const abs = resolveAbs(imgPath);
    if (!abs) { stats.skippedUnresolved += 1; continue; }
    const truth = sizeOf(abs);
    if (!truth) { stats.skippedNoTruth += 1; continue; }
    stats.judged += 1;
    const violations = judgeIconSlotSize(tag, truth);
    if (violations.length === 0) continue;
    issues.push({ varName, tag, truth, violations, imgPath });
  }
  return { issues, stats };
}

/**
 * 主自愈：把违约的图标 `<img>` 确定性改写为内联契约形态（幂等）。
 * @param {string} code
 * @param {Array} issues detectIconSlotIssues 的 issues
 * @returns {{code:string, changed:boolean, healed:Array}}
 */
export function healIconSlotSize(code, issues) {
  let out = String(code || '');
  const healed = [];
  for (const issue of Array.isArray(issues) ? issues : []) {
    if (!issue || !issue.tag || !issue.truth) continue;
    const next = applyIconSlotSize(issue.tag, issue.truth);
    if (next === issue.tag) continue;
    if (!out.includes(issue.tag)) continue;
    out = out.replace(issue.tag, next);
    healed.push({
      varName: issue.varName,
      size: `${Math.round(issue.truth.width)}x${Math.round(issue.truth.height)}`,
      codes: issue.violations.map((v) => v.code),
    });
  }
  return { code: out, changed: healed.length > 0, healed };
}

/**
 * 便捷入口：检测 + 自愈（调用方要诊断信息时用 detectIconSlotIssues 单独跑）。
 * @returns {{code:string, changed:boolean, healed:Array, stats:Object}}
 */
export function enforceIconSlotSize(code, opts = {}) {
  const det = detectIconSlotIssues(code, opts);
  const healed = healIconSlotSize(code, det.issues);
  return { ...healed, stats: det.stats };
}

/** 把 import 路径落到 `resources/images/<basename>`（产物目录布局固定） */
export function resolveImageAbsPath(outputPath, imgPath) {
  if (!outputPath || !imgPath) return null;
  const name = basename(String(imgPath));
  if (!name) return null;
  const abs = join(outputPath, 'resources', 'images', name);
  return existsSync(abs) ? abs : null;
}

export default enforceIconSlotSize;
