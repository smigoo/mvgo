/**
 * resource-mounter.js — 资源自动挂载与后处理模块
 *
 * 方案 A 拆分自 microcode-engineer.js。职责：
 * 1. 资源自动挂载（bg/icon/img 未引用资源的确定性兜底挂载）
 * 2. bg 多引用去重（P2-3）
 * 3. CSS 替代资源修复（url(${var}) → backgroundColor）
 * 4. LESS 变量归一化（style 内错误变量引用修复）
 * 5. 孤儿资源迁移 + 孤儿子组件剔除
 * 6. Phase 2 后处理（T02-T09）
 * 7. 尺寸联动 clamp（min-height 超根容器）
 * 8. 语义分流修复（flex-grow 像素量级误填）
 * 9. 下载失败资源 CSS 兜底注入（B2：背景/图标下载失败时自动注入渐变/纯色替代）
 *
 * 所有函数均为纯函数，logger 通过 options 注入。
 */

import {
  injectChartMinHeight,
  deduplicateBackgroundImages,
  fixBackgroundImageSize,
  validateContainerSize,
  validateResourceUsage,
} from '../../utils/post-process.js';
import { inferBackgroundStyle } from '../../utils/background-size-inference.js';
import {
  scoreMountTarget,
  inferComponentPrefix,
} from '../../utils/mount-target-scoring.js';
import { safeLogger } from '../../logger/safe-logger.js';
import { extractSfcTemplate } from '../../utils/sfc-template-extractor.js';
import { collectResourceVarRefsFromSfc } from '../../utils/resource-facts.js';
import { normalizeFixedSizeFlex } from '../../utils/fixed-size-normalizer.js';
// 量纲阈值与 FLEX 校验单点同源（code-structure-validator.js），杜绝「修复器一套、校验器一套」
import { FLEX_GROW_SCALES } from '../../validators/code-structure-validator.js';
import {
  buildResourceUsageCorpus,
  isResourceUsedInCorpus,
  filterAvailableResources,
} from '../../utils/resource-import-guard.js';
import { normalizeFileSegments } from '../../utils/chunk-meta-files.js';
import {
  extractLessVarReferences,
  isLessVarDeclared,
  safeLessVarValue,
} from './file-writer.js';
import { join } from 'node:path';
import { removeOverlappingSlotDom } from '../../utils/slot-dom-deduper.js';

/**
 * 宿主外壳标签正则：base-panel / mc-panel（含变体后缀）。
 * 禁止往宿主外壳挂载业务背景——外壳不是组件自有根容器，
 * 挂上去会被 100% 100% 拉伸成整面板大背景（Figma/UI 上不存在）。
 */
const HOST_SHELL_TAG_RE = /^(base-panel|mc-panel)(-[a-z0-9]+)*$/i;

/**
 * 🛡️ 修复（2026-09-08）：查找资源变量在文件表中的现有绑定位置
 * 用于防止同一资源被多个组件重复挂载
 * @param {Object} allFiles 文件表（path → content）
 * @param {string} varName 资源变量名（如 bg1, icon2）
 * @returns {{file: string, tag: string}|null} 已绑定的文件和标签，或 null
 */
export function findExistingResourceBinding(allFiles, varName) {
  if (!allFiles || typeof varName !== 'string') return null;
  // 按文件路径排序，确保确定性（index.vue 优先）
  const sortedPaths = Object.keys(allFiles).sort((a, b) => {
    if (a === 'package/index.vue') return -1;
    if (b === 'package/index.vue') return 1;
    return a.localeCompare(b);
  });
  for (const filePath of sortedPaths) {
    const content = allFiles[filePath];
    if (typeof content !== 'string') continue;
    // 检查是否包含该变量的 import 或 :style 绑定
    if (
      content.includes(`import ${varName} from`) ||
      (content.includes(`:style="`) && content.includes(varName))
    ) {
      // 提取包含该变量的标签
      const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>/])*)>/g;
      let m;
      while ((m = tagRe.exec(content)) !== null) {
        const fullTag = m[0];
        if (fullTag.includes(varName) && (fullTag.includes(':style=') || fullTag.includes(':src='))) {
          return { file: filePath, tag: fullTag };
        }
      }
    }
  }
  return null;
}

// ══════════════════════════════════════════════════════════════
//  Section 1: 挂载点发现工具
// ══════════════════════════════════════════════════════════════

/**
 * 提取挂载关键词：mountTarget / 资源名 / targetDomHint / figmaPath 倒数第二段，
 * 词长≥3，剔除通用词（bg/background/icon/img 等）。
 */
export function extractMountKeywords(mapping) {
  const raw = [
    mapping.mountTarget,
    mapping.name,
    mapping.targetDomHint,
    String(mapping.figmaPath || '')
      .split('/')
      .slice(-2, -1)[0] || '',
  ];
  const words = [];
  const seen = new Set();
  for (const s of raw) {
    if (!s) continue;
    for (const w of String(s).split(/[^a-zA-Z0-9一-鿿]+/)) {
      const lw = w.toLowerCase();
      if (lw.length < 3) continue;
      if (
        /^(bg|background|icon|img|image|area|region|container|slot|con|switch|card|active|default|state)$/i.test(
          lw,
        )
      )
        continue;
      if (!seen.has(lw)) {
        seen.add(lw);
        words.push(lw);
      }
    }
  }
  return words;
}

/** 在 vue 文件中找第一个 class 含关键词的开标签，返回完整开标签字符串 */
export function findTagByClassKeyword(content, kw) {
  if (!content || typeof content !== 'string') return null;
  const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>/])*)>/g;
  let m;
  while ((m = tagRe.exec(content)) !== null) {
    const attrs = m[2] || '';
    const classMatch =
      attrs.match(/class="([^"]*)"/) || attrs.match(/class='([^']*')/);
    if (classMatch && classMatch[1].toLowerCase().includes(kw)) {
      if (/^script$/i.test(m[1]) || /^style$/i.test(m[1])) continue;
      return m[0];
    }
  }
  return null;
}

/**
 * 找模板根元素（<template> 后第一个开标签）。
 *
 * P0-5：根元素是宿主外壳（base-panel / mc-panel）时返回 null。
 * 外壳不是组件自己的根容器，往它上面兜底挂背景会被 100% 100% 拉伸。
 * 内部用法如需「无论是不是外壳都要拿到根标签」，可传 { allowHostShell: true }。
 */
export function findTemplateRootTag(content, options = {}) {
  if (!content || typeof content !== 'string') return null;
  const tm = content.match(
    /<template[^>]*>\s*<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>/])*)>/,
  );
  if (!tm) return null;
  if (/^script$/i.test(tm[1]) || /^style$/i.test(tm[1])) return null;
  if (!options.allowHostShell && HOST_SHELL_TAG_RE.test(tm[1])) return null;
  return tm[0].replace(/^<template[^>]*>\s*/, '');
}

/**
 * 提取 index.vue 模板里「区域级容器」候选（按出现顺序）。
 *
 * 用途：当 styleEvidence 确认根容器无背景（background.allowed===false）时，区域背景
 * 不能挂根容器（会触发 CODE-014 根容器臆造 BLOCK），必须挂到对应 section 容器。
 * 本方法定位「内容根」（base-panel 外壳下的真实 <div class=root> 或模板根元素）的
 * 直接子容器（通常是各 <section> / 区域 div），供区域背景轮流挂载。
 *
 * @returns {string[]} 开标签字符串数组（直接子容器，已过滤插槽 <template>）
 */
export function findRegionContainerCandidates(content) {
  if (!content || typeof content !== 'string') return [];
  // ⚠️ 必须用贪婪匹配到【最外层】</template>
  const tplMatch = content.match(/<template[^>]*>([\s\S]*)<\/template>/i);
  const tpl = tplMatch ? tplMatch[1] : content;

  // 1. 模板根元素
  const rootMatch = tpl.match(
    /<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>/])*)>/,
  );
  if (!rootMatch) return [];
  const rootTag = rootMatch[1];
  const rootOpenEnd = tpl.indexOf(rootMatch[0]) + rootMatch[0].length;

  const isContentTag = (t) =>
    /^(div|section|article|main|header|footer|aside)$/i.test(t);

  let contentRootTag;
  let contentRootOpenEnd;
  if (isContentTag(rootTag)) {
    // 根本身就是内容容器
    contentRootTag = rootTag;
    contentRootOpenEnd = rootOpenEnd;
  } else {
    // 组件外壳（base-panel 等）：找其下第一个「非 <template> 插槽」的真实内容子元素作为内容根
    const childRe =
      /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>/])*)(\/?)>/g;
    let depth = 0;
    let cm = null;
    const s = tpl.slice(rootOpenEnd);
    let mk;
    while ((mk = childRe.exec(s)) !== null) {
      const isClose = mk[1] === '/';
      const isSelf = mk[4] === '/';
      if (depth === 0 && !isClose && !isSelf && !/^template$/i.test(mk[2])) {
        cm = mk;
        break;
      }
      if (!isClose && !isSelf) depth++;
      else if (isClose) depth--;
    }
    if (!cm) return [];
    contentRootTag = cm[2];
    contentRootOpenEnd = rootOpenEnd + (cm.index + cm[0].length);
  }

  // 2. 从内容根内部按【相对深度】收集其直接子元素（depth===0），过滤插槽 <template>
  // P1-5：结果只保留内容容器标签（isContentTag）
  const rest = tpl.slice(contentRootOpenEnd);
  const tagRe =
    /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>/])*)(\/?)>/g;
  const result = [];
  let depth = 0;
  let m;
  while ((m = tagRe.exec(rest)) !== null) {
    const isClose = m[1] === '/';
    const isSelfClose = m[4] === '/';
    if (isSelfClose) continue;
    if (isClose) {
      depth--;
      if (depth < 0) break;
    } else {
      if (
        depth === 0 &&
        !/^template$/i.test(m[2]) &&
        isContentTag(m[2]) &&
        !HOST_SHELL_TAG_RE.test(m[2])
      ) {
        result.push(m[0]);
      }
      depth++;
    }
  }
  return result;
}

/** 从区域容器候选里挑第一个尚未被占用的 */
export function pickNextRegionContainer(content, usedSet) {
  const candidates = findRegionContainerCandidates(content);
  for (const tag of candidates) {
    if (!usedSet.has(tag)) {
      usedSet.add(tag);
      return tag;
    }
  }
  return null;
}

/**
 * 收集模板里全部可作为挂载点的元素（跨 .vue，index.vue 优先）。
 * @returns {Array<{file:string, tag:string, tagName:string, cls:string, depth:number, isHostShell:boolean, hasBgBinding:boolean}>}
 */
export function collectMountCandidates(files) {
  const out = [];
  const entries = Object.entries(files || {})
    .filter(
      ([p, c]) =>
        typeof p === 'string' && /\.vue$/i.test(p) && typeof c === 'string',
    )
    .sort(([a], [b]) =>
      a === 'package/index.vue' ? -1 : b === 'package/index.vue' ? 1 : 0,
    );
  const VOID_TAGS = /^(img|br|hr|input|meta|link|source|path|circle|rect)$/i;
  for (const [file, content] of entries) {
    const tpl = content.match(/<template>([\s\S]*?)<\/template>/i);
    const body = tpl ? tpl[1] : content;
    const tagRe =
      /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>/])*)(\/?)>/g;
    let depth = 0;
    let m;
    while ((m = tagRe.exec(body)) !== null) {
      const [, slash, tagName, attrs, selfClose] = m;
      if (slash === '/') {
        depth = Math.max(0, depth - 1);
        continue;
      }
      if (/^(script|style|template)$/i.test(tagName)) continue;
      const clsM = attrs.match(/\bclass\s*=\s*["']([^"']*)["']/);
      const cls = clsM ? clsM[1].trim().split(/[\s,]+/)[0] : '';
      out.push({
        file,
        tag: m[0],
        tagName,
        cls,
        depth,
        isHostShell: HOST_SHELL_TAG_RE.test(tagName),
        hasBgBinding: /background/i.test(attrs || ''),
      });
      if (!selfClose && !VOID_TAGS.test(tagName)) depth++;
    }
  }
  return out;
}

/**
 * 从候选池里用统一评分挑最优挂载点。
 * @param {Object} mapping
 * @param {Array} pool
 * @param {{componentPrefix?:string, skipBound?:boolean, usedTags?:Set<string>}} [opts]
 * @returns {{file:string, tag:string, keyword:string, score:number, cls:string}|null}
 */
export function pickBestMountTarget(mapping, pool, opts = {}) {
  if (!Array.isArray(pool) || pool.length === 0) return null;
  const usedTags = opts.usedTags || new Set();
  let usable = pool.filter(
    (c) => c && c.tag && !c.isHostShell && !usedTags.has(c.tag),
  );
  if (opts.skipBound) {
    const noBg = usable.filter((c) => !c.hasBgBinding);
    if (noBg.length > 0) usable = noBg;
  }
  const ranked = usable
    .map((c) => ({
      cand: c,
      score: scoreMountTarget(mapping, c, {
        componentPrefix: opts.componentPrefix || '',
      }),
    }))
    .filter((r) => Number.isFinite(r.score) && r.score > 0)
    .sort((a, b) => b.score - a.score);
  if (ranked.length === 0) return null;
  const top = ranked[0];
  return {
    file: top.cand.file,
    tag: top.cand.tag,
    cls: top.cand.cls || '',
    score: top.score,
    keyword: `${top.cand.keyword || top.cand.cls || top.cand.tagName}(score:${top.score.toFixed(2)})`,
  };
}

/**
 * 向开标签注入/合并 :style 背景绑定。
 * @param {Object} [mapping] - resourceDomMapping 条目；有 figmaBox 时用实际尺寸
 */
export function injectBgStyleBinding(content, tag, varName, mapping = null) {
  if (!content || !tag) return null;
  const bg = inferBackgroundStyle(mapping);
  const styleExpr = `{ backgroundImage: 'url(' + ${varName} + ')', backgroundSize: '${bg.size}', backgroundPosition: '${bg.position}', backgroundRepeat: '${bg.repeat}' }`;
  let newTag;
  const styleRe = /:style="([^"]*)"/;
  if (styleRe.test(tag)) {
    const inner = (tag.match(styleRe)[1] || '').trim();
    if (!/^\{[\s\S]*\}$/.test(inner)) return null;
    newTag = tag.replace(
      styleRe,
      `:style="{ ...${inner}, backgroundImage: 'url(' + ${varName} + ')', backgroundSize: '${bg.size}', backgroundPosition: '${bg.position}', backgroundRepeat: '${bg.repeat}' }"`,
    );
  } else {
    newTag = tag.replace(/\/?>$/, (tail) => ` :style="${styleExpr}"${tail}`);
  }
  if (!newTag || newTag === tag) return null;
  const pos = content.indexOf(tag);
  if (pos < 0) return null;
  return content.slice(0, pos) + newTag + content.slice(pos + tag.length);
}

/**
 * 🛡️ P1.7（2026-09-11）：**引用驱动的资源 import 补齐**（治本 13890774 `icon4 is not defined`）。
 *
 * 旧注入只认「模板里可识别的使用形态」（`${var}` / `:src`），而模型常把资源变量用在
 * **script 内**（如 `const deviceIcons = [icon3, icon4, …]`）→ 看不见 → 不注入 import
 * → 运行时 ReferenceError（整个组件渲染失败）。
 *
 * 本函数以「引用采集（模板 + script，单一实现 utils/resource-facts）」为准，
 * 对每个「被引用但未 import 且事实源有该变量」的项，按 mapping 的文件补齐 import。
 *
 * @param {Object<string,string>} files 产物文件表
 * @param {Array} resourceDomMapping 资源映射（含 assignedVarName / resourceFile）
 * @param {{logger?:object}} [options]
 * @returns {{ files: Object<string,string>, injected: Array<{path:string,varName:string}>, unresolved: Array<{path:string,varName:string}> }}
 */
export function ensureResourceImportsForRefs(files = {}, resourceDomMapping = [], options = {}) {
  const logger = safeLogger(options.logger);
  const out = { ...files };
  const injected = [];
  const unresolved = [];
  if (!Array.isArray(resourceDomMapping) || resourceDomMapping.length === 0) {
    return { files: out, injected, unresolved };
  }

  const byVar = new Map();
  for (const m of resourceDomMapping) {
    const varName = m?.assignedVarName || m?.semanticVarName;
    if (varName && m?.resourceFile) byVar.set(varName, m);
  }
  if (byVar.size === 0) return { files: out, injected, unresolved };

  for (const [p, c] of Object.entries(out)) {
    if (!/\.vue$/i.test(p) || typeof c !== 'string') continue;
    let updated = c;
    const refs = collectResourceVarRefsFromSfc(updated);
    for (const varName of refs.all) {
      if (new RegExp(`import\\s+${varName}\\s+from`).test(updated)) continue;
      const m = byVar.get(varName);
      if (!m) {
        unresolved.push({ path: p, varName });
        continue;
      }
      updated = ensureResourceImportInVue(updated, varName, m, p);
      injected.push({ path: p, varName });
    }
    if (updated !== c) out[p] = updated;
  }

  if (injected.length > 0 && logger) {
    logger.info('🧩 资源 import 引用驱动补齐（含 script 内引用）', {
      count: injected.length,
      samples: injected.slice(0, 6),
      unresolved: unresolved.length,
    });
  }
  return { files: out, injected, unresolved };
}

/** 确保目标 vue 文件 script 中存在该资源变量的 import */
export function ensureResourceImportInVue(content, varName, mapping, filePath) {
  if (new RegExp(`import\\s+${varName}\\s+from`).test(content)) return content;
  const file = String(mapping.resourceFile || '')
    .split('/')
    .pop();
  if (!file) return content;
  const relBase = /^package\/components\//.test(filePath)
    ? '../../resources/images/'
    : '../resources/images/';
  const importLine = `import ${varName} from '${relBase}${file}'`;
  const scriptRe = /<script\s+setup[^>]*>/;
  if (scriptRe.test(content)) {
    return content.replace(scriptRe, (m) => `${m}\n${importLine}`);
  }
  if (/<\/template>/i.test(content)) {
    return content.replace(
      /<\/template>/i,
      `</template>\n<script setup>\n${importLine}\n</script>`,
    );
  }
  return content;
}

// ══════════════════════════════════════════════════════════════
//  Section 2: bg 多引用去重（P2-3）
// ══════════════════════════════════════════════════════════════

/**
 * bg 整块背景多引用自动去重。
 * 同一 bg 变量（bgRole==='container'）被挂到多个容器时，保留评分最高者。
 */
export function dedupeBgMultiRefs(files, resourceDomMapping, options = {}) {
  const logger = safeLogger(options.logger);
  if (
    !files ||
    !Array.isArray(resourceDomMapping) ||
    resourceDomMapping.length === 0
  )
    return files;
  const bgContainers = resourceDomMapping.filter(
    (m) =>
      m &&
      m.previewAnalysisRole === 'bg' &&
      m.assignedVarName &&
      m.resourceFile &&
      m.bgRole === 'container',
  );
  if (bgContainers.length === 0) return files;
  const out = { ...files };
  const componentPrefix = inferComponentPrefix(out);
  const allCands = collectMountCandidates(out);
  const depthOf = new Map(allCands.map((c) => [c.tag, c.depth]));
  for (const bg of bgContainers) {
    const varName = bg.assignedVarName;
    const refs = [];
    for (const [p, c] of Object.entries(out)) {
      if (typeof c !== 'string' || !p.endsWith('.vue')) continue;
      const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>/])*)>/g;
      let m;
      while ((m = tagRe.exec(c)) !== null) {
        const tag = m[0];
        if (!tag.includes(varName) || !/:style\s*=/.test(tag)) continue;
        const classMatch =
          tag.match(/class="([^"]*)"/) || tag.match(/class='([^']*')/);
        const cls = classMatch ? classMatch[1].toLowerCase() : '';
        refs.push({
          file: p,
          tag,
          cls,
          keyword: cls,
          depth: depthOf.get(tag) ?? 0,
        });
      }
    }
    if (refs.length <= 1) continue;
    const best = pickBestMountTarget(bg, refs, { componentPrefix });
    if (!best) {
      logger.warn('🛡️ P2-3 去重跳过：无候选能给出正分挂载评分', {
        var: varName,
        refs: refs.map((r) => r.cls),
      });
      continue;
    }
    const keep = refs.find((r) => r.tag === best.tag) || refs[0];
    const removeList = refs.filter((r) => r.tag !== keep.tag);
    for (const ref of removeList) {
      const styleMatch = ref.tag.match(/:style="([^"]*)"/);
      if (!styleMatch) continue;
      const inner = styleMatch[1].trim();
      const isObjectLiteral = /^\{[\s\S]*\}$/.test(inner);
      const hasSpread = /\.\.\./.test(inner);
      const nonBgPart = inner.replace(
        /\bbackground(?:Image|Size|Position|Repeat)?\s*:/g,
        '',
      );
      const hasOtherKey = /[a-zA-Z]+\s*:/.test(nonBgPart);
      if (!isObjectLiteral || hasSpread || hasOtherKey) continue;
      const newTag = ref.tag.replace(/\s*:style="[^"]*"/, '');
      const pos = out[ref.file].indexOf(ref.tag);
      if (pos < 0) continue;
      out[ref.file] =
        out[ref.file].slice(0, pos) +
        newTag +
        out[ref.file].slice(pos + ref.tag.length);
      logger.warn('🛡️ P2-3 已去重 bg 多引用（统一挂载点评分最高者保留）', {
        var: varName,
        kept: keep.cls,
        keptScore: Number(best.score.toFixed(3)),
        removed: ref.cls,
        file: ref.file,
      });
    }
  }
  return out;
}

// ══════════════════════════════════════════════════════════════
//  Section 2b: C1 同图多别名去重（#568）
// ══════════════════════════════════════════════════════════════

/**
 * 🛡️ C1（2026-09-07，#568）：同图多别名去重。
 *
 * 问题：同一张背景图被 LLM 以多个别名（bg4~bg14）绑进多层 spread 嵌套 :style，
 * 最终只生效一张，其余都是噪音。根因是 figma-connector 按 Figma 节点分配编号，
 * 同一张图可能被多个容器节点引用，产生多个 assignedVarName 指向同一 resourceFile。
 *
 * 修复策略：按 resourceFile 聚合所有 success 的 bg 资源，若同一 resourceFile
 * 对应 ≥2 个 mapping，保留评分最高者（复用 pickBestMountTarget），其余别名的
 * 模板引用全部剥离（:style 仅含 background 相关属性则整条删除，否则只删 background 属性）。
 *
 * 与 dedupeBgMultiRefs 的区别：
 *   - dedupeBgMultiRefs：同一变量被挂到多个容器 → 保留评分最高者
 *   - dedupeSameImageAliases：不同变量指向同一张图 → 合并为一个变量
 */
export function dedupeSameImageAliases(files, resourceDomMapping, options = {}) {
  const logger = safeLogger(options.logger);
  if (
    !files ||
    !Array.isArray(resourceDomMapping) ||
    resourceDomMapping.length === 0
  )
    return { files, fixes: [] };

  // 按 resourceFile 聚合 success 的 bg 资源
  const fileToMappings = new Map();
  for (const m of resourceDomMapping) {
    if (
      !m ||
      m.downloadStatus !== 'success' ||
      m.previewAnalysisRole !== 'bg' ||
      !m.resourceFile ||
      !m.assignedVarName
    )
      continue;
    const key = m.resourceFile;
    if (!fileToMappings.has(key)) fileToMappings.set(key, []);
    fileToMappings.get(key).push(m);
  }

  // 找出同图多别名（≥2 个 mapping 指向同一 resourceFile）
  const dupGroups = [];
  for (const [file, mappings] of fileToMappings) {
    if (mappings.length >= 2) {
      dupGroups.push({ resourceFile: file, mappings });
    }
  }
  if (dupGroups.length === 0) return { files, fixes: [] };

  const out = { ...files };
  const fixes = [];
  const componentPrefix = inferComponentPrefix(out);
  const allCands = collectMountCandidates(out);
  const depthOf = new Map(allCands.map((c) => [c.tag, c.depth]));

  for (const group of dupGroups) {
    // 为每个 alias 收集模板引用
    const aliasRefs = new Map(); // varName -> refs[]
    for (const m of group.mappings) {
      const varName = m.assignedVarName;
      const refs = [];
      for (const [p, c] of Object.entries(out)) {
        if (typeof c !== 'string' || !p.endsWith('.vue')) continue;
        const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>/])*)>/g;
        let tm;
        while ((tm = tagRe.exec(c)) !== null) {
          const tag = tm[0];
          if (!tag.includes(varName)) continue;
          const classMatch =
            tag.match(/class="([^"]*)"/) || tag.match(/class='([^']*')/);
          const cls = classMatch ? classMatch[1].toLowerCase() : '';
          refs.push({
            file: p,
            tag,
            cls,
            depth: depthOf.get(tag) ?? 0,
          });
        }
      }
      if (refs.length > 0) aliasRefs.set(varName, refs);
    }

    if (aliasRefs.size <= 1) continue; // 只有一个别名实际被引用，无需去重

    // 选最佳别名：按评分最高者保留（复用 pickBestMountTarget）
    let bestVarName = null;
    let bestScore = -Infinity;
    for (const [varName, refs] of aliasRefs) {
      const m = group.mappings.find((mm) => mm.assignedVarName === varName);
      const pool = refs.map((r) => ({
        tag: r.tag,
        cls: r.cls,
        keyword: r.cls,
        depth: r.depth,
      }));
      const best = pickBestMountTarget(m, pool, { componentPrefix });
      const score = best ? best.score : -1;
      if (score > bestScore) {
        bestScore = score;
        bestVarName = varName;
      }
    }
    if (!bestVarName) continue;

    // 剥离其余别名的引用
    const removeVars = [...aliasRefs.keys()].filter((v) => v !== bestVarName);
    for (const varName of removeVars) {
      const refs = aliasRefs.get(varName);
      for (const ref of refs) {
        const styleMatch = ref.tag.match(/:style="([^"]*)"/);
        if (!styleMatch) continue;
        const inner = styleMatch[1].trim();
        const isObjectLiteral = /^\{[\s\S]*\}$/.test(inner);
        const hasSpread = /\.\.\./.test(inner);

        // 提取非 background 属性
        const bgKeys = [
          'background',
          'backgroundImage',
          'backgroundSize',
          'backgroundPosition',
          'backgroundRepeat',
        ];
        let nonBgParts = [];
        if (isObjectLiteral) {
          // 简单解析对象字面量，提取非 background 属性
          const stripped = inner.replace(
            /\b(background(?:Image|Size|Position|Repeat)?)\s*:/g,
            '__BG_KEY__:',
          );
          const pairs = stripped.split(',').map((s) => s.trim()).filter(Boolean);
          for (const pair of pairs) {
            if (!pair.startsWith('__BG_KEY__')) {
              nonBgParts.push(pair);
            }
          }
        }

        let newTag;
        if (!isObjectLiteral || hasSpread || nonBgParts.length > 0) {
          // 只删 background 相关属性，保留其他
          let newInner = inner;
          for (const bgKey of bgKeys) {
            newInner = newInner.replace(
              new RegExp(`\\b${bgKey}\\s*:[^,}]+,?`, 'g'),
              '',
            );
          }
          newInner = newInner.replace(/\{\s*,/g, '{').replace(/,\s*\}/g, '}').trim();
          if (newInner === '{}' || !/[a-zA-Z]+\s*:/.test(newInner)) {
            newTag = ref.tag.replace(/\s*:style="[^"]*"/, '');
          } else {
            newTag = ref.tag.replace(
              /:style="[^"]*"/,
              `:style="${newInner}"`,
            );
          }
        } else {
          // 整条 :style 都是 background，直接删除
          newTag = ref.tag.replace(/\s*:style="[^"]*"/, '');
        }

        const pos = out[ref.file].indexOf(ref.tag);
        if (pos < 0) continue;
        out[ref.file] =
          out[ref.file].slice(0, pos) +
          newTag +
          out[ref.file].slice(pos + ref.tag.length);
        fixes.push({
          resourceFile: group.resourceFile,
          keptVar: bestVarName,
          removedVar: varName,
          file: ref.file,
          tag: ref.cls,
        });
      }
    }
  }

  if (fixes.length > 0 && logger) {
    logger.warn('🛡️ C1 已去重同图多别名（同一张图只保留一个最佳挂载点）', {
      fixCount: fixes.length,
      groups: dupGroups.length,
    });
  }

  return { files: out, fixes };
}

// ══════════════════════════════════════════════════════════════
//  Section 2c: C2 空壳解绑（#568）
// ══════════════════════════════════════════════════════════════

/**
 * 🛡️ C2（2026-09-07，#568）：空壳解绑。
 *
 * 问题：T1 标题剥离后，原标题元素（如 <div class="title-group">标题文字</div>）
 * 被替换为注释，但其父容器可能残留 :style="{ backgroundImage: `url(${bg4})` }" 绑定，
 * 变成只有 style 绑定的空壳 div。该绑定指向的资源变量可能已被其他后处理剥离，
 * 导致运行时 ReferenceError 或静默渲染失败。
 *
 * 修复策略：扫描所有 .vue 文件的 template 段，找出「只有 :style 绑定、无 class、无子内容」
 * 的 div 标签，若 :style 内仅含 background 相关属性且引用的变量不在 availableVars 中，
 * 则删除整个 :style 属性。
 *
 * 安全守卫：
 *   - 只处理 template 段（不动 <script> / <style>）
 *   - 只删除 :style 属性，不删除标签本身（标签可能还有 class/其他属性）
 *   - 若 :style 内含有非 background 属性（如 width/height/color），保留整个 :style
 */
export function stripEmptyShellBindings(files, resourceDomMapping, options = {}) {
  const logger = safeLogger(options.logger);
  if (!files || typeof files !== 'object') return { files, fixes: [] };

  // 收集所有可用的资源变量名
  const availableVars = new Set();
  if (Array.isArray(resourceDomMapping)) {
    for (const m of resourceDomMapping) {
      if (!m) continue;
      if (m.assignedVarName) availableVars.add(m.assignedVarName);
      if (m.semanticVarName) availableVars.add(m.semanticVarName);
    }
  }

  const out = { ...files };
  const fixes = [];

  for (const [p, c] of Object.entries(out)) {
    if (typeof c !== 'string' || !p.endsWith('.vue')) continue;

    // 提取 template 段
    const tplMatch = c.match(/<template>([\s\S]*?)<\/template>/);
    if (!tplMatch) continue;
    const tplContent = tplMatch[1];
    let newTpl = tplContent;

    // 匹配只有 :style 绑定的 div 标签（无 class、无子内容的空壳）
    // 形如：<div :style="{ backgroundImage: `url(${bg4})` }">
    const shellRe =
      /<div(\s+[^>]*?:style="([^"]*)"[^>]*)>/g;
    let m;
    while ((m = shellRe.exec(newTpl)) !== null) {
      const fullTag = m[0];
      const attrs = m[1];
      const styleValue = m[2];

      // 检查是否有 class 属性（有 class 的不是空壳）
      if (/\bclass\s*=/.test(attrs)) continue;

      // 检查 :style 内是否仅含 background 相关属性
      const bgKeys = [
        'background',
        'backgroundImage',
        'backgroundSize',
        'backgroundPosition',
        'backgroundRepeat',
      ];
      const stripped = styleValue.replace(
        new RegExp(`\\b(${bgKeys.join('|')})\\s*:[^,}]+,?`, 'g'),
        '',
      );
      const hasNonBg = /[a-zA-Z]+\s*:/.test(stripped.replace(/\s/g, ''));
      if (hasNonBg) continue; // 含有非 background 属性，保留

      // 检查引用的变量是否在 availableVars 中
      const varRefs = [...styleValue.matchAll(/\$\{([^}]+)\}/g)].map(
        (mm) => mm[1],
      );
      const hasDeadVar =
        varRefs.length > 0 &&
        varRefs.some((v) => !availableVars.has(v));
      if (!hasDeadVar) continue; // 所有变量都可用，无需清理

      // 删除整个 :style 属性
      const newAttrs = attrs.replace(
        /\s*:style="[^"]*"/,
        '',
      );
      const newTag = newAttrs.trim()
        ? `<div${newAttrs}>`
        : '<div>';
      const pos = newTpl.indexOf(fullTag);
      if (pos < 0) continue;
      newTpl =
        newTpl.slice(0, pos) +
        newTag +
        newTpl.slice(pos + fullTag.length);
      fixes.push({ file: p, styleValue: styleValue.slice(0, 60), vars: varRefs });
      // 重置 lastIndex 避免跳过
      shellRe.lastIndex = pos + newTag.length;
    }

    if (newTpl !== tplContent) {
      out[p] = c.replace(tplMatch[0], `<template>${newTpl}</template>`);
    }
  }

  if (fixes.length > 0 && logger) {
    logger.warn('🛡️ C2 已清理空壳绑定（T1 剥离后残留的无效 :style）', {
      fixCount: fixes.length,
    });
  }

  return { files: out, fixes };
}

// ══════════════════════════════════════════════════════════════
//  Section 3: 自动挂载 — 背景
// ══════════════════════════════════════════════════════════════

/**
 * sub-state 状态背景专用挂载。
 * bgRole='sub-state' 的资源只能挂「状态元素」：模板中 :class 含 active 动态绑定的元素。
 * @returns {{var, file, keyword, bgRole, mountTarget}|null}
 */
export function mountSubStateBackground(allFiles, varName, m, options = {}) {
  if (!varName) return null;
  const entries = Object.entries(allFiles)
    .filter(
      ([p, c]) =>
        typeof p === 'string' && p.endsWith('.vue') && typeof c === 'string',
    )
    .sort(([a]) => (a === 'package/index.vue' ? -1 : 1));
  const ACTIVE_ARRAY_RE =
    /:class="\[\s*['"][^'"]*['"]\s*,\s*\{\s*active\s*:\s*([^}]+?)\s*\}\s*\]"/;
  const ACTIVE_OBJECT_RE = /:class="\{\s*active\s*:\s*([^}]+?)\s*\}"/;
  for (const [p, c] of entries) {
    const match = c.match(ACTIVE_ARRAY_RE) || c.match(ACTIVE_OBJECT_RE);
    if (!match) continue;
    const condition = (match[1] || '').trim();
    if (!condition) continue;
    const attrEnd = match.index + match[0].length;
    const tagClose = c.indexOf('>', attrEnd);
    if (tagClose < 0) continue;
    const between = c.slice(attrEnd, tagClose);
    if (/:style\s*=/.test(between)) continue;
    const styleAttr =
      ` :style="${condition} ? { backgroundImage: 'url(' + ${varName} + ')',` +
      ` backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' } : null"`;
    let updated = c.slice(0, tagClose) + styleAttr + c.slice(tagClose);
    updated = ensureResourceImportInVue(updated, varName, m, p);
    if (!updated || updated === c) continue;
    allFiles[p] = updated;
    return {
      var: varName,
      file: p,
      keyword: 'active-state',
      bgRole: m.bgRole || 'sub-state',
      mountTarget: m.mountTarget || null,
    };
  }
  return null;
}

/**
 * P0-1 主入口：自动挂载未被引用的 bg 资源。
 * @returns {Array<{var, file, keyword, bgRole, mountTarget}>} 挂载结果清单
 */
export function autoMountUnusedBackgrounds(
  allFiles,
  resourceDomMapping,
  styleEvidence = null,
  options = {},
) {
  const logger = safeLogger(options.logger);
  if (process.env.BG_AUTO_MOUNT === 'false') return [];
  if (!Array.isArray(resourceDomMapping) || resourceDomMapping.length === 0)
    return [];

  const usageCorpus = buildResourceUsageCorpus(allFiles);
  // R0-6（2026-09-01）：可用资源过滤统一走 filterAvailableResources 单一帮手
  const candidates = filterAvailableResources(resourceDomMapping).filter(
    (m) =>
      m.previewAnalysisRole === 'bg' &&
      m.assignedVarName &&
      !m.skipMount &&
      !m.isTinyDecoration &&
      !isResourceUsedInCorpus(usageCorpus, m),
  );
  if (candidates.length === 0) return [];

  const mounted = [];
  const usedSectionContainers = new Set();
  const mountPrefix = inferComponentPrefix(allFiles);
  const usedMountTags = new Set();
  for (const m of candidates) {
    const varName = m.assignedVarName;
    if (m.bgRole === 'sub-state') {
      const stateMounted = mountSubStateBackground(
        allFiles,
        varName,
        m,
        options,
      );
      if (stateMounted) {
        mounted.push(stateMounted);
        continue;
      }
      // 🛡️ 修复（2026-08-31）：sub-state 背景找不到目标时，禁止回退
      // 原逻辑：回退到普通容器挂载（可能误挂到根容器）
      // 新逻辑：直接放弃挂载，避免误挂
      logger.warn(
        '🛡️ sub-state 背景未找到 active 状态元素，放弃挂载（禁止回退避免误挂）',
        {
          var: varName,
          mountTarget: m.mountTarget || m.name || '',
          reason: 'no-active-element-found',
        },
      );
      continue; // 跳过，不再回退到普通容器挂载
    }
    const kws = extractMountKeywords(m);
    const ordered = kws;
    const mountCandidates = collectMountCandidates(allFiles);

    const shortlist = [];
    const vueEntries = Object.entries(allFiles)
      .filter(
        ([p, c]) =>
          typeof p === 'string' && p.endsWith('.vue') && typeof c === 'string',
      )
      .sort(([a]) => (a === 'package/index.vue' ? -1 : 1));
    const candIndex = new Map(
      mountCandidates.map((c) => [`${c.file}::${c.tag}`, c]),
    );
    for (const [p, c] of vueEntries) {
      for (const kw of ordered) {
        const tag = findTagByClassKeyword(c, kw);
        if (!tag) continue;
        const meta = candIndex.get(`${p}::${tag}`);
        if (shortlist.some((s) => s.file === p && s.tag === tag)) continue;
        shortlist.push({
          file: p,
          tag,
          keyword: kw,
          cls: meta?.cls || '',
          depth: meta?.depth ?? 0,
          isHostShell: meta?.isHostShell ?? HOST_SHELL_TAG_RE.test(tag),
          hasBgBinding: meta?.hasBgBinding ?? /background/i.test(tag),
        });
      }
    }
    let target = pickBestMountTarget(m, shortlist, {
      componentPrefix: mountPrefix,
      skipBound: true,
      usedTags: usedMountTags,
    });
    if (!target) {
      target = pickBestMountTarget(m, mountCandidates, {
        componentPrefix: mountPrefix,
        skipBound: true,
        usedTags: usedMountTags,
      });
    }
    if (!target) {
      // Loop 0.D：关键词失败 → 不挂 region-fallback，记诊断。不要为「用完」乱挂。
      logger.warn('🛡️ 背景兜底挂载已放弃：关键词未命中，禁止 region-fallback', {
        var: varName,
        reason: 'region-fallback-disabled',
      });
      continue;
    }
    if (!target) continue;

    // 🛡️ 修复（2026-09-08）：资源归属精确化 — 检查该资源是否已被其他组件引用
    // 同一 bg 被多个组件引用时，只允许挂载到第一个匹配的组件（按文件路径排序）
    // 避免同一资源在多个子组件中重复挂载导致视觉混乱
    const existingBinding = findExistingResourceBinding(allFiles, varName);
    if (existingBinding && existingBinding.file !== target.file) {
      logger.warn('🛡️ 资源已被其他组件引用，跳过重复挂载', {
        var: varName,
        existingFile: existingBinding.file,
        existingTag: existingBinding.tag,
        attemptedFile: target.file,
        attemptedTag: target.tag,
      });
      continue;
    }

    const before = allFiles[target.file];
    let updated = injectBgStyleBinding(before, target.tag, varName, m);
    if (!updated) continue;
    updated = ensureResourceImportInVue(updated, varName, m, target.file);
    if (updated === before) continue;
    allFiles[target.file] = updated;
    usedMountTags.add(target.tag);
    mounted.push({
      var: varName,
      file: target.file,
      keyword: target.keyword,
      bgRole: m.bgRole || null,
      mountTarget: m.mountTarget || null,
    });
  }
  return mounted;
}

// ══════════════════════════════════════════════════════════════
//  Section 4: 自动挂载 — 图标 / 图片
// ══════════════════════════════════════════════════════════════

/**
 * 🛡️ 自动挂载 icon 的尺寸上限（px，2026-09-02）。
 *
 * 事故实证 mc-max-1788306653919-a57e4409（设备监测）：两张大统计卡在规划阶段
 * 被丢（planner 只规划 3 个 section），其卡内 icon（icon-8798 隧道 / icon-8817
 * 控制面板，Figma 真值 35×28）变成孤儿资源，被 P0-1 图标兜底以裸
 * `<img class="auto-mounted-icon">`（无任何尺寸约束）塞进 main-content →
 * 按原图自然尺寸渲染、失去卡片容器约束，把设备网格挤到布局外。
 * 裸挂载必须兜底一个合理尺寸上限，避免「正确图片挂到容器后失控放大」。
 * 取 48px：与 device 图标 wrapper（48×48）一致，且大于多数卡内/导航小图标的设计尺寸。
 */
export const AUTO_MOUNT_ICON_MAX_PX = 48;

/** 向容器开标签【之后】插入 <img :src="varName" /> 子元素（带尺寸兜底约束） */
export function injectImgChild(content, openTag, varName, alt = '', size = null) {
  if (!content || !openTag || !varName) return null;
  if (/\/>\s*$/.test(openTag)) return null;
  const pos = content.indexOf(openTag);
  if (pos < 0) return null;
  const safeAlt = String(alt || '').replace(/"/g, '');
  // 🛡️ D-1（2026-09-02，mc-max-1788349399134-9c3aff7f）：尺寸真值化。
  // 旧版只写 max-width/max-height:48（AUTO_MOUNT_ICON_MAX_PX）→ 实际渲染尺寸 = PNG 原始像素
  // （Figma 常导出 2x/3x），48 仅拦上界 → 24×24 图标被放大 + 撑行。
  // 传入 size（来自 mapping 子资源自身 figmaBox，24×24）时输出精确 width/height；
  // 无尺寸才回落 max-* 兜底（孤儿裸挂仍防失控放大）。
  let dimStyle;
  if (size && Number(size.width) > 0 && Number(size.height) > 0) {
    const w = Math.round(Number(size.width));
    const h = Math.round(Number(size.height));
    dimStyle = `width:${w}px;height:${h}px;object-fit:contain`;
  } else {
    dimStyle = `max-width:${AUTO_MOUNT_ICON_MAX_PX}px;max-height:${AUTO_MOUNT_ICON_MAX_PX}px;object-fit:contain`;
  }
  const imgTag = `<img :src="${varName}" class="auto-mounted-icon" style="${dimStyle}" alt="${safeAlt}" />`;
  // 🛡️ D-2（2026-09-02）：同容器多图标顺序保真——多个 icon 挂同一 openTag 时旧逻辑都插在
  // openTag 之后（后插者反而在前），icon2(x=1844) 排在 icon1(x=1816) 前。改为插到该容器内
  // 已有的 auto-mounted-icon 之后（首次注入时即紧跟 openTag），保持候选按 figmaBox.x 升序
  // 处理即最终 DOM 顺序。
  const afterOpen = content.slice(pos + openTag.length);
  const existingImgRe = /^(\s*<img\b[^>]*class="auto-mounted-icon"[^>]*\/>\s*)/;
  const existing = afterOpen.match(existingImgRe);
  const insertAt =
    pos + openTag.length + (existing ? existing[1].length : 0);
  return content.slice(0, insertAt) + imgTag + content.slice(insertAt);
}

/**
 * 自动挂载未被引用的 icon / img 资源。
 * @returns {Array<{var, file, keyword, role, mountTarget}>} 挂载结果清单
 */
export function autoMountUnusedIcons(
  allFiles,
  resourceDomMapping,
  options = {},
) {
  const logger = safeLogger(options.logger);
  if (process.env.ICON_AUTO_MOUNT === 'false') return [];
  if (!Array.isArray(resourceDomMapping) || resourceDomMapping.length === 0)
    return [];

  const usageCorpus = buildResourceUsageCorpus(allFiles);
  // R0-6（2026-09-01）：可用资源过滤统一走 filterAvailableResources 单一帮手
  const candidates = filterAvailableResources(resourceDomMapping).filter(
    (m) =>
      (m.previewAnalysisRole === 'icon' ||
        m.previewAnalysisRole === 'img' ||
        m.previewAnalysisRole === 'image') &&
      m.assignedVarName &&
      !m.skipMount &&
      !m.isTinyDecoration &&
      !isResourceUsedInCorpus(usageCorpus, m),
  );
  if (candidates.length === 0) return [];

  const mounted = [];
  const usedContainers = new Set();
  // 🛡️ D-2（2026-09-02）：同一容器内多图标按 figmaBox.x 升序处理，配合 injectImgChild 追加
  // 到已有 auto-mounted-icon 之后 → 最终 DOM 顺序与 Figma x 一致（icon1 x=1816 在左、icon2 x=1844 在右）。
  // 优先取子资源自身 figmaBox（24×24），不取 missing 容器（52×24，父容器）。
  const sortable = [...candidates].sort((a, b) => {
    const ax = a.figmaBox?.x ?? a.visualMeta?.x ?? 0;
    const bx = b.figmaBox?.x ?? b.visualMeta?.x ?? 0;
    return ax - bx;
  });
  for (const m of sortable) {
    const varName = m.assignedVarName;
    const kws = extractMountKeywords(m);

    let target = null;
    const vueEntries = Object.entries(allFiles)
      .filter(
        ([p, c]) =>
          typeof p === 'string' && p.endsWith('.vue') && typeof c === 'string',
      )
      .sort(([a]) => (a === 'package/index.vue' ? -1 : 1));
    outer: for (const [p, c] of vueEntries) {
      for (const kw of kws) {
        const tag = findTagByClassKeyword(c, kw);
        if (tag) {
          target = { file: p, tag, keyword: kw };
          break outer;
        }
      }
    }

    if (!target) {
      // Loop 0.D：关键词失败 → 不挂 region-fallback / root-fallback。
      logger.warn('🛡️ 图标兜底挂载已放弃：关键词未命中，禁止 region-fallback', {
        var: varName,
        reason: 'region-fallback-disabled',
        role: m.previewAnalysisRole || null,
        mountTarget: m.mountTarget || null,
        resourceFile: m.resourceFile || m.name || null,
      });
      continue;
    }
    if (!target) continue;

    const before = allFiles[target.file];
    // 🛡️ D-1（2026-09-02）：icon 尺寸真值化——mapping 子资源自身 figmaBox（24×24）→ 精确
    // width/height，clamp [12,128] 防异常；无尺寸回落 injectImgChild 内 AUTO_MOUNT_ICON_MAX_PX 兜底。
    const _fb = m.figmaBox || m.visualMeta || {};
    const _iconSize =
      Number(_fb?.width) > 0 && Number(_fb?.height) > 0
        ? {
            width: Math.min(128, Math.max(12, Math.round(Number(_fb.width)))),
            height: Math.min(128, Math.max(12, Math.round(Number(_fb.height)))),
          }
        : null;
    let updated = injectImgChild(before, target.tag, varName, m.name || '', _iconSize);
    if (!updated) continue;
    updated = ensureResourceImportInVue(updated, varName, m, target.file);
    if (updated === before) continue;
    allFiles[target.file] = updated;
    mounted.push({
      var: varName,
      file: target.file,
      keyword: target.keyword,
      role: m.previewAnalysisRole || null,
      mountTarget: m.mountTarget || null,
    });
  }
  return mounted;
}

// ══════════════════════════════════════════════════════════════
//  Section 5: CSS 替代资源修复 + LESS 变量归一化
// ══════════════════════════════════════════════════════════════

/**
 * CSS 替代资源的语义名被模型写成 url(${var}) 时，替换为真实色值 backgroundColor。
 * @returns {Array<{file:string, vars:string[]}>} 修复清单
 */
export function resolveCssSubstituteRefs(allFiles, resourceDomMapping) {
  const cssSubs = (resourceDomMapping || []).filter(
    (m) =>
      m &&
      m.downloadStatus === 'css' &&
      m.cssValue &&
      (m.semanticVarName || m.assignedVarName),
  );
  if (cssSubs.length === 0) return [];
  const fixes = [];
  for (const [p, c] of Object.entries(allFiles)) {
    if (!p.endsWith('.vue') || typeof c !== 'string') continue;
    let out = c;
    const hitVars = [];
    for (const m of cssSubs) {
      const varName = m.semanticVarName || m.assignedVarName;
      const color = m.cssValue;
      const tplRe = new RegExp(
        `backgroundImage:\\s*\`url\\(\\$\\{${varName}\\}\\)\``,
        'g',
      );
      if (tplRe.test(out)) {
        out = out.replace(tplRe, `backgroundColor: '${color}'`);
        hitVars.push(varName);
      }
      const concatRe = new RegExp(
        `backgroundImage:\\s*['"]url\\(['"]\\s*\\+\\s*${varName}\\s*\\+\\s*['"]\\)['"]`,
        'g',
      );
      if (concatRe.test(out)) {
        out = out.replace(concatRe, `backgroundColor: '${color}'`);
        hitVars.push(varName);
      }
    }
    if (hitVars.length > 0) {
      allFiles[p] = out;
      fixes.push({ file: p, vars: [...new Set(hitVars)] });
    }
  }
  return fixes;
}

/**
 * 从失败资源映射提取背景 fallback CSS 值。
 * 优先级：visualMeta.fillsSummary > cssValue > 默认渐变。
 */
function extractBgFallbackValue(mapping) {
  const fills = mapping.visualMeta?.fillsSummary;
  if (fills && typeof fills === 'string' && fills.trim()) {
    // fillsSummary 可能是渐变色（含 gradient）或纯色 hex
    // 渐变形式：linear-gradient(#xxx 0%, #yyy 100%)
    // 纯色形式：#rrggbb 或 #rrggbb, #rrggbb2（多 SOLID 逗号分隔）
    if (/gradient/i.test(fills)) return fills;
    // 纯色：取第一个 hex 值
    const firstHex = fills.split(',')[0].trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(firstHex)) return firstHex;
  }
  if (mapping.cssValue) return mapping.cssValue;
  return 'linear-gradient(180deg, #edf4fb, #d6e8f5)';
}

/**
 * 兜底：通过关键词匹配找到目标容器，注入 fallback CSS 类。
 * 复用 autoMountUnusedBackgrounds 同一套关键词/容器匹配工具。
 */
function injectBgFallbackClass(
  content,
  filePath,
  mapping,
  fallbackValue,
  fallbackCls,
) {
  const kws = extractMountKeywords(mapping);
  let out = content;

  // 尝试关键词匹配找到目标标签
  for (const kw of kws) {
    const tag = findTagByClassKeyword(out, kw);
    if (!tag) continue;
    if (/\sclass="/.test(tag)) {
      const newTag = tag.replace(/\sclass="/, ` class="${fallbackCls} `);
      out = out.replace(tag, newTag);
    } else if (/\sclass=/.test(tag)) {
      const newTag = tag.replace(/\sclass=/, ` class="${fallbackCls}" `);
      out = out.replace(tag, newTag);
    } else {
      const newTag = tag.replace(/>$/, ` class="${fallbackCls}">`);
      out = out.replace(tag, newTag);
    }
    break;
  }

  // 注入 CSS 规则到 <style> 块
  if (out !== content) {
    out = out.replace(/<\/style>/i, (match) => {
      return `\n.${fallbackCls} { background-image: ${fallbackValue}; background-size: cover; background-position: center; }\n${match}`;
    });
  }
  return out;
}

/**
 * 🛡️ B2（2026-09-07）：下载失败背景资源的 CSS 渐变/纯色兜底注入。
 *
 * 根因（docs/0907-组件生成问题分析.md）：traffic 组件根背景 bg-[m] downloadStatus='missing'，
 * skipMount 后无替代方案 → 容器无背景（Figma 设计为渐变背景）。现有 resolveCssSubstituteRefs
 * 只处理 downloadStatus='css'，healUnavailableResourceRefs 只剥离引用（→ none），
 * 未注入任何视觉替代。
 *
 * 策略（确定性后处理，在 healUnavailableResourceRefs 之前运行）：
 *  1) template 内 :style 绑定 url(${failedVar}) → 静态 fallback 色值
 *  2) <style> 内 url(@failedVar) / url(none)（normalizeStyleLessVars 已转换的）→ fallback 值
 *  3) 兜底：注入 CSS fallback 类到目标容器（当 template 引用已被 heal 剥离时生效）
 *
 * 颜色来源优先级：visualMeta.fillsSummary > cssValue > 默认渐变。
 * 仅处理 previewAnalysisRole='bg'（背景才有渐变/纯色替代语义；icon/img 不适合）。
 * env BG_AUTO_MOUNT=false 时一并关闭（与 autoMount/normalizeStyleLessVars 一致）。
 *
 * @param {Object<string,string>} allFiles - 产物文件表
 * @param {Array} resourceDomMapping - 资源映射
 * @param {Object} [options]
 * @returns {Array<{file:string, var:string, role:string, method:string}>} 修复清单
 */
export function injectFailedResourceFallbacks(
  allFiles,
  resourceDomMapping,
  options = {},
) {
  const logger = safeLogger(options.logger);
  if (process.env.BG_AUTO_MOUNT === 'false') return [];
  if (!allFiles || typeof allFiles !== 'object') return [];

  // 收集失败背景资源（排除 'success' 和 'css'——后者由 resolveCssSubstituteRefs 处理）
  const failedBgs = (resourceDomMapping || []).filter(
    (m) =>
      m &&
      m.previewAnalysisRole === 'bg' &&
      m.downloadStatus !== 'success' &&
      m.downloadStatus !== 'css' &&
      (m.semanticVarName || m.assignedVarName),
  );
  if (failedBgs.length === 0) return [];

  const fixes = [];

  for (const m of failedBgs) {
    const varName = m.semanticVarName || m.assignedVarName;
    const fallbackValue = extractBgFallbackValue(m);
    const escVar = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const fallbackCls = `fb-bg-${varName}`;

    for (const [p, content] of Object.entries(allFiles)) {
      if (!p.endsWith('.vue') || typeof content !== 'string') continue;
      let out = content;
      const methods = [];

      // ① Template: :style 绑定 url(${var}) / url('+var+') → 静态 fallback 值
      //   覆盖模板字符串和字符串拼接两种形态
      const tplRe = new RegExp(
        `:style="(?:\`url\\(\\$\\{${escVar}\\}\\)\`|['"]url\\(['"]\\s*\\+\\s*${escVar}\\s*\\+\\s*['"]\\)['"])"`,
        'g',
      );
      if (tplRe.test(out)) {
        out = out.replace(
          tplRe,
          `:style="{ backgroundImage: '${fallbackValue}' }"`,
        );
        methods.push('tpl-style');
      }

      // ② Template: 残留 url(${var})（三元/对象内局部插值，无法整条删属性）→ fallback
      const residualRe = new RegExp(
        `url\\(\\s*\\$\\{\\s*${escVar}\\s*\\}\\s*\\)`,
        'g',
      );
      if (residualRe.test(out)) {
        out = out.replace(residualRe, fallbackValue);
        methods.push('tpl-residual');
      }

      // ③ <style> 内: url(@var) / url(${var}) / url($var) → fallback
      //   覆盖 normalizeStyleLessVars 尚未处理的原始引用
      let styleReplaced = false;
      out = out.replace(
        /<style\b[^>]*>([\s\S]*?)<\/style>/gi,
        (styleBlock) =>
          styleBlock.replace(
            /url\(\s*['"]?\s*(?:@([A-Za-z][\w-]*)|\$\{\s*([A-Za-z][\w-]*)\s*\}|\$([A-Za-z][\w-]*))\s*['"]?\s*\)/g,
            (match, atVar, tmplVar, dollarVar) => {
              const refVar = atVar || tmplVar || dollarVar;
              if (refVar === varName) {
                styleReplaced = true;
                return `url('${fallbackValue}')`;
              }
              return match;
            },
          ),
      );
      if (styleReplaced) methods.push('style-url');

      // ④ <style> 内: url(none) → fallback（仅当该 style 块所在文件模板曾引用 varName）
      //   覆盖 normalizeStyleLessVars 已把 @var 转为 none 的情况
      const fileHadVar = new RegExp(escVar).test(content);
      if (fileHadVar) {
        let noneReplaced = false;
        out = out.replace(
          /<style\b[^>]*>([\s\S]*?)<\/style>/gi,
          (styleBlock) => {
            const replaced = styleBlock.replace(
              /url\(\s*none\s*\)/g,
              () => {
                noneReplaced = true;
                return `url('${fallbackValue}')`;
              },
            );
            return replaced;
          },
        );
        if (noneReplaced) methods.push('style-none');
      }

      // ⑤ 兜底 CSS 类注入：当 template 曾引用该变量但 ①-② 未匹配（heal 已剥离引用），
      //   通过关键词匹配找到目标容器，注入 fallback 类 + CSS 规则
      if (
        fileHadVar &&
        !methods.some((m) => m.startsWith('tpl-')) &&
        !methods.includes('style-url')
      ) {
        const injected = injectBgFallbackClass(
          out,
          p,
          m,
          fallbackValue,
          fallbackCls,
        );
        if (injected !== out) {
          out = injected;
          methods.push('class-inject');
        }
      }

      if (methods.length > 0) {
        allFiles[p] = out;
        fixes.push({
          file: p,
          var: varName,
          role: 'bg',
          method: methods.join('+'),
        });
      }
    }
  }

  if (fixes.length > 0 && logger) {
    logger.warn('🛡️ B2 下载失败背景 CSS 兜底注入完成', {
      count: fixes.length,
      fixes,
    });
  }
  return fixes;
}

/**
 * 🛡️ P0-1 扩展：<style> 内错误 LESS 变量引用归一化（2026-08-27）
 * 根因（mc-1787833161983 复测实锤）：L0-B 资源 BLOCK 修复后，模型换了一种幻觉——
 * 把资源变量名 bg2/bg3 当 LESS 变量写成 url(@bg2)/url(@bg3)，并发明 theme-vars 里
 * 不存在的 @color-tab-default-text。validateVueSfc 的 less preprocess（strip 相对
 * @import 后）报 "variable @x is undefined" → 最终 SFC 校验 fail-closed。
 *
 * 策略（确定性后处理，env BG_AUTO_MOUNT=false 一并关闭）：
 *  1) 资源变量 url(@bgN) → url('<相对路径>/<真实文件名>')（bgN 匹配资源映射 assignedVarName）
 *  2) 其余「未声明且非资源、非 theme-vars 已定义」的 @变量 → 注入 @var: 安全默认值
 * 不误伤合法主题变量（theme-vars 里已定义的变量名跳过，避免用默认值覆盖主题色）。
 * @returns {Array<{file:string, resourceVars:string[], inventedVars:string[]}>}
 */
export function normalizeStyleLessVars(
  allFiles,
  resourceDomMapping,
  options = {},
) {
  const logger = safeLogger(options.logger);
  if (process.env.BG_AUTO_MOUNT === 'false') return [];
  if (!allFiles || typeof allFiles !== 'object') return [];

  // 资源变量名 → 真实文件名
  const resMap = {};
  for (const m of resourceDomMapping || []) {
    if (m && m.assignedVarName && m.resourceFile) {
      resMap[m.assignedVarName] = String(m.resourceFile).split('/').pop();
    }
  }
  // theme-vars 已定义变量（含 mixin 内），避免误伤合法主题变量
  const declaredTheme = new Set();
  const themeVarsSrc =
    allFiles['resources/styles/themes/theme-vars.less'] ||
    allFiles['resources/styles/theme-vars.less'];
  if (typeof themeVarsSrc === 'string') {
    for (const mm of themeVarsSrc.matchAll(/@([a-zA-Z][\w-]*)\s*:/g))
      declaredTheme.add(mm[1]);
  }

  const fixed = [];
  for (const [p, c] of Object.entries(allFiles)) {
    if (!p.endsWith('.vue') || typeof c !== 'string') continue;
    const relBase = /^package\/components\//.test(p)
      ? '../../resources/images/'
      : '../resources/images/';
    const resourceVars = [];

    // 1) url(@资源变量) / url(${资源变量}) / url($资源变量) → 真实路径；臆造资源变量 → none
    //    模型会把这三种都写进 <style>：@bg3(LESS 变量) / ${bg3}(Vue 模板插值，LESS 把它当 $bg3 变量)
    //    / $bg3(LESS $ 语法)。三者都会被 LESS 当变量 → 未声明则 "variable is undefined" fail-closed。
    //    这里统一归一化：真实映射 → 静态图片路径；臆造（资源前缀但无映射）→ none（合法 CSS，避免崩）。
    let updated = c.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (block) =>
      block.replace(
        // 🛡️ 同时覆盖带引号形式 url('${var}') / url("${var}") / url('@var') —— 模型常在 <style> 内
        // 把资源变量用引号包成 url('${bg3}')，旧正则未允许引号致漏判 → LESS 编译报 Property '$bg3' is undefined。
        /url\(\s*['"]?\s*(?:@([A-Za-z][\w-]*)|\$\{\s*([A-Za-z][\w-]*)\s*\}|\$([A-Za-z][\w-]*))\s*['"]?\s*\)/g,
        (m, atVar, tmplVar, dollarVar) => {
          const varName = atVar || tmplVar || dollarVar;
          const file = resMap[varName];
          if (file) {
            resourceVars.push(varName);
            return `url('${relBase}${file}')`;
          }
          if (/^(bg|icon|img|image|pic)/i.test(varName)) {
            resourceVars.push(`${varName}→none`);
            return 'none';
          }
          return m;
        },
      ),
    );

    // 2) 剩余未声明变量 → 默认值（排除资源变量 + theme 已定义 + 当前 style 已声明）
    const styleNow = (
      updated.match(/<style\b[^>]*>([\s\S]*?)<\/style>/gi) || []
    ).join('\n');
    const referenced = extractLessVarReferences(styleNow);
    const inventedVars = referenced.filter(
      (v) =>
        !resMap[v] && !declaredTheme.has(v) && !isLessVarDeclared(styleNow, v),
    );
    if (inventedVars.length > 0) {
      const decl = inventedVars
        .map((v) => `@${v}: ${safeLessVarValue('@' + v)};`)
        .join('\n');
      updated = updated.replace(/<style\b[^>]*>/g, (m) => `${m}\n${decl}\n`);
    }

    if (resourceVars.length > 0 || inventedVars.length > 0) {
      allFiles[p] = updated;
      fixed.push({ file: p, resourceVars, inventedVars });
    }
  }
  if (fixed.length > 0 && logger) {
    logger.warn('🛡️ P0-1 LESS 变量归一化已完成', { fixedCount: fixed.length });
  }
  return fixed;
}

/**
 * 🛡️ P0-3（2026-08-30）：孤儿剔除前，把待剔除文件里「确实被模板引用」的 bg 资源
 * 迁移到保留文件。
 *
 * 根因（mc-max-1788056145870-6e65dc88 实锤）：LLM 把 bg2 正确挂在 HeaderTabs.vue，
 * 但 HeaderTabs 被 P1-2 孤儿剔除删掉（index.vue 只用 EnvTabBar）→ 唯一正确挂载点消失
 * → autoMountUnusedBackgrounds 兜底时关键词匹配不到 → 降级 root-fallback 挂到 base-panel。
 * 治本：剔除前先迁移，正确挂载点不丢失，兜底不再错位。
 *
 * 只迁移 bg（icon 有独立 autoMountUnusedIcons 兜底，且 img 迁移语义与 bg 不同）。
 * @param {Object} allFiles - 产物文件表
 * @param {Array} resourceDomMapping - 资源映射
 * @param {string[]} orphanPaths - 待剔除的孤儿文件路径
 * @returns {Array<{var, from, to}>} 迁移结果
 */
export function migrateOrphanResourceRefs(
  allFiles,
  resourceDomMapping,
  orphanPaths,
  options = {},
) {
  const logger = safeLogger(options.logger);
  if (
    !Array.isArray(resourceDomMapping) ||
    !Array.isArray(orphanPaths) ||
    orphanPaths.length === 0
  )
    return [];
  const keepPaths = new Set(
    Object.keys(allFiles).filter((p) => !orphanPaths.includes(p)),
  );
  const migrated = [];
  for (const op of orphanPaths) {
    const orphanContent = allFiles[op];
    if (typeof orphanContent !== 'string') continue;
    const importRe =
      /import\s+(\w+)\s+from\s+['"]([^'"]*resources\/images\/[^'"]+)['"]/g;
    const templateContent = orphanContent.replace(
      /<script[\s\S]*?<\/script>/i,
      '',
    );
    let im;
    while ((im = importRe.exec(orphanContent)) !== null) {
      const varName = im[1];
      // 模板里确实引用了该变量才算「正确挂载」；仅 import 无挂载无需迁移
      if (!new RegExp(`\\b${varName}\\b`).test(templateContent)) continue;
      const mapping = resourceDomMapping.find(
        (mm) =>
          mm &&
          (mm.assignedVarName === varName || mm.semanticVarName === varName),
      );
      if (!mapping || mapping.previewAnalysisRole !== 'bg') continue;
      // 在保留文件里按 mountTarget 关键词找替代挂载点（复用挂载关键词提取）
      const kws = extractMountKeywords(mapping);
      const entries = Object.entries(allFiles)
        .filter(
          ([p, c]) =>
            keepPaths.has(p) && typeof c === 'string' && p.endsWith('.vue'),
        )
        .sort(([a]) => (a === 'package/index.vue' ? -1 : 1));
      let target = null;
      outer: for (const [p, c] of entries) {
        for (const kw of kws) {
          const tag = findTagByClassKeyword(c, kw);
          if (tag) {
            target = { file: p, tag };
            break outer;
          }
        }
      }
      if (!target) continue; // 找不到替代点，交 autoMountUnusedBackgrounds 兜底
      let updated = injectBgStyleBinding(
        allFiles[target.file],
        target.tag,
        varName,
        mapping,
      );
      if (!updated) continue;
      updated = ensureResourceImportInVue(
        updated,
        varName,
        mapping,
        target.file,
      );
      if (updated === allFiles[target.file]) continue;
      allFiles[target.file] = updated;
      migrated.push({ var: varName, from: op, to: target.file });
    }
  }
  if (migrated.length > 0 && logger) {
    logger.warn('🛡️ P0-3 孤儿资源已迁移到保留文件', { migrated });
  }
  return migrated;
}

/**
 * 🛡️ P1-2：孤儿子组件剔除 + chunk-meta 清退（2026-08-27）
 * 保留集 = index.vue import 链（复用 detectSubComponents）∪ 模板标签直接引用（PascalCase/kebab）。
 * 剔除 = allFiles 中不在保留集的 package/components/*.vue + 磁盘 chunk-meta 的 files/completed/分块文件。
 * 🛡️ P0-3（2026-08-30）：删除前先迁移孤儿文件里的资源引用（见 migrateOrphanResourceRefs），
 * 避免正确挂载点随孤儿文件消失后，兜底降级到 base-panel。
 * @param {Array} [resourceDomMapping] - 可选，资源映射；提供时执行剔除前资源迁移
 * @returns {string[]} 被剔除的孤儿路径清单
 */
/**
 * 🛡️ F5（2026-09-01）：L0-B 重试轮孤儿白名单——LESS 安全的续跑产物不剔除。
 *
 * 事故实证 mc-max-1788252098143-12469472「子组件震荡删除」：
 * R1 生成 5 个子组件 → R2 断点续跑恢复 9 文件但新 index.vue 结构漂移只引用 2 个
 * → P1-2 把 Bridge/Tunnel/VehicleType 当孤儿清退 → R3 又重新生成 5 个 → 3 轮烧
 * ~15 个子组件生成预算。三机制（续跑/孤儿清理/坏文件隔离）在重试轮间互相踩踏。
 *
 * 与 P1-2 的设计张力（mc-1787829888023，P1-2 的立项事故）：续跑恢复的旧子组件
 * 引用**上轮** theme-vars 的 less 变量 → 本轮编译 fail-closed，此时剔除是正确的。
 *
 * 区分信号 = LESS 安全性（确定性、纯静态）：
 *   - 候选孤儿引用的所有 less 变量在本轮样式产物（allFiles 的 .less + 自身 style 块）
 *     中均有定义 → 白名单保留（可复用，不浪费生成预算）；
 *   - 存在未定义变量引用（上轮遗留陈旧产物）→ 照旧剔除（P1-2 原语义回归保护）。
 * 仅在 isL0BRetry 上下文启用：首轮生成仍按 P1-2 全量剔除（清退混批旧命名）。
 *
 * @param {Record<string,string>} allFiles
 * @param {string[]} pruned 孤儿候选路径
 * @returns {string[]} LESS 安全、应白名单保留的路径
 */
function splitLessSafeOrphans(allFiles, pruned) {
  const lessCorpus = Object.entries(allFiles)
    .filter(([p]) => /\.less$/i.test(p))
    .map(([, c]) => String(c || ''))
    .join('\n');

  const kept = [];
  for (const p of pruned) {
    const content = String(allFiles[p] || '');
    const styles = [...content.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
      .map((m) => m[1])
      .join('\n');
    // 无样式块 → 无 LESS 编译风险 → 保留（模板/脚本部分可复用）
    if (!styles.trim()) {
      kept.push(p);
      continue;
    }
    const refs = extractLessVarReferences(styles);
    const corpus = `${lessCorpus}\n${styles}`;
    const undeclared = refs.filter((n) => !isLessVarDeclared(corpus, n));
    if (undeclared.length === 0) {
      kept.push(p);
    }
  }
  return kept;
}

export function pruneOrphanSubComponents(
  allFiles,
  outputPath,
  resourceDomMapping = null,
  options = {},
) {
  const logger = safeLogger(options.logger);
  const indexVue = allFiles['package/index.vue'];
  if (typeof indexVue !== 'string' || !indexVue) return [];

  // 🛡️ 传递闭包保留集（2026-09-08 实锤 mc-max-1788832532312-2ee5ad89）：
  // 原实现只查 index.vue 一层 import（detectSubComponents）+ 模板标签，chunk 一次输出
  // 「子组件的子组件」（MainContent chunk 输出 MainContent + SidebarNav + DeviceGrid
  // 三个文件，SidebarNav/DeviceGrid 仅被 MainContent 引用）时，二层文件不在 index.vue
  // 引用链里 → 被误判孤儿剔除 → 悬空 import 剥离把 MainContent 掏成空壳 div
  // → 主体内容（竖排 tabs/两大卡/12 设备项）全部丢失，页面只剩头部统计条。
  // 治本：保留集改为从 index.vue 出发沿相对 import 递归（BFS）的传递闭包，
  // 任何层级被引用的子组件都不再是孤儿；模板标签直查保留（覆盖动态/别名引用场景）。
  const keep = new Set(['package/index.vue', ...detectSubComponents(indexVue)]);
  const compPaths = Object.keys(allFiles).filter((p) =>
    /^package\/components\/[^/]+\.vue$/.test(p),
  );
  const importVueRe =
    /^[ \t]*import\s+[A-Za-z_$][\w$]*\s+from\s+(['"])(\.[^'"]*\.vue)\1\s*;?[ \t]*$/gm;
  const resolveRelativeVue = (fromFile, spec) => {
    const clean = String(spec || '').replace(/['"]/g, '').trim();
    if (!/\.vue$/i.test(clean) || !clean.startsWith('.')) return null;
    const stack = fromFile.split('/').slice(0, -1);
    for (const part of clean.split('/')) {
      if (part === '.' || part === '') continue;
      if (part === '..') stack.pop();
      else stack.push(part);
    }
    return stack.join('/');
  };
  const refQueue = ['package/index.vue'];
  while (refQueue.length > 0) {
    const cur = refQueue.shift();
    const curContent = allFiles[cur];
    if (typeof curContent !== 'string') continue;
    for (const m of curContent.matchAll(importVueRe)) {
      const target = resolveRelativeVue(cur, m[2]);
      if (target && allFiles[target] != null && !keep.has(target)) {
        keep.add(target);
        refQueue.push(target);
      }
    }
  }
  for (const p of compPaths) {
    const base = p.replace(/^package\/components\//, '').replace(/\.vue$/, '');
    const pascal = base.replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase());
    const kebab = base.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    const re = new RegExp(`<${pascal}\\b|<${kebab}\\b`);
    if (re.test(indexVue)) keep.add(p);
  }

  let pruned = compPaths.filter((p) => !keep.has(p));
  if (pruned.length === 0) return [];

  // 🛡️ F5：L0-B 重试轮白名单——LESS 安全的续跑产物保留，斩断「清退→重生成」震荡。
  // 保留者不进 pruned → 不剔除、不清退 chunk-meta（后续重试轮仍可断点复用）。
  if (options.isL0BRetry && pruned.length > 0) {
    const whitelisted = splitLessSafeOrphans(allFiles, pruned);
    if (whitelisted.length > 0) {
      pruned = pruned.filter((p) => !whitelisted.includes(p));
      if (logger) {
        logger.info(
          '🛡️ F5 L0-B 重试轮孤儿白名单：LESS 安全的续跑子组件保留复用（不剔除、不清退 chunk-meta）',
          { whitelisted },
        );
      }
    }
  }
  if (pruned.length === 0) return [];

  // 🛡️ P0-3：删除前，把孤儿文件里正确挂载的 bg 资源迁移到保留文件，
  // 避免正确挂载点随孤儿文件消失后兜底降级到 base-panel（错误大背景）。
  if (resourceDomMapping && resourceDomMapping.length > 0) {
    const migrated = migrateOrphanResourceRefs(
      allFiles,
      resourceDomMapping,
      pruned,
      options,
    );
    if (migrated.length > 0 && logger) {
      logger.warn('🛡️ P0-3 孤儿资源已迁移到保留文件', { migrated });
    }
  }

  for (const p of pruned) delete allFiles[p];

  // 磁盘 chunk-meta 清退（失败不阻断：allFiles 已剔除，主目标达成）
  if (outputPath) {
    (async () => {
      try {
        const {
          readFileSync: rfs,
          writeFileSync: wfs,
          existsSync: es,
          unlinkSync: uls,
        } = await import('fs');
        const chunkDir = join(outputPath, '.mc-gen', 'cache', 'code-chunks');
        const metaPath = join(chunkDir, 'chunk-meta.json');
        if (!es(metaPath)) return;
        const meta = JSON.parse(rfs(metaPath, 'utf-8'));
        if (!meta || typeof meta !== 'object') return;
        const orphanDiskFiles = [];
        if (meta.files && typeof meta.files === 'object') {
          for (const p of pruned) {
            if (!meta.files[p]) continue;
            // 🛡️ P1-5：files[p] 可能是段数组（多段文件）或旧格式单值，统一归一化取全部落盘文件
            for (const seg of normalizeFileSegments(meta.files[p])) {
              orphanDiskFiles.push(join(chunkDir, seg.file));
            }
            delete meta.files[p];
          }
        }
        if (Array.isArray(meta.completed)) {
          meta.completed = meta.completed.filter(
            (k) => !pruned.some((p) => k.includes(p)),
          );
        }
        meta.updatedAt = Date.now();
        wfs(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
        for (const f of orphanDiskFiles) {
          try {
            if (es(f)) uls(f);
          } catch {
            /* ignore */
          }
        }
        if (logger) {
          logger.info('🛡️ P1-2 chunk-meta 已清退孤儿条目', {
            pruned,
            clearedBlocks: pruned.length,
          });
        }
      } catch {
        /* meta 清退失败不阻断 */
      }
    })();
  }
  return pruned;
}

/**
 * 🛡️ Phase 2 后处理兜底（TDD: T02/T03/T04/T05/T06/T07）
 * 用代码强制约束布局/样式/资源，不依赖 prompt 遵守
 */
export function postProcessIndexVue(code, input, options = {}) {
  const logger = safeLogger(options.logger);
  if (!code || typeof code !== 'string') return code;
  let result = code;

  // T03: 图表容器 min-height 注入
  result = injectChartMinHeight(result);

  // T04: 背景图去重（如果子组件也引用了主组件的背景图）
  result = deduplicateBackgroundImages(result);

  // T05: bg-size 修正（治标 Pass 1）—— 硬编码 px 尺寸替换为 cover（背景铺满容器）
  result = fixBackgroundImageSize(result);

  // T06: 容器尺寸校验 + 确定性自动修正（治标 Pass 2）—— BBox fallback → auto，回写修正结果
  const rootBox = input?.figmaNodeData?.absoluteBoundingBox;
  if (rootBox) {
    const {
      code: fixedCode,
      warnings,
      fixed,
    } = validateContainerSize(result, rootBox.width, rootBox.height);
    result = fixedCode;
    if (fixed > 0 && logger) {
      logger.info(
        `🔧 Phase 2 T06: 已自动修正 ${fixed} 处 BBox fallback（子容器尺寸 → auto）`,
      );
    }
    if (warnings && warnings.length > 0 && logger) {
      logger.warn('🔧 Phase 2 T06: 容器尺寸校验发现异常', {
        warnings,
        fixed,
      });
    }
  }

  // T07: 资源引用校验（治标 Pass 3）—— 记录警告，不修改代码
  const { warnings: resWarnings } = validateResourceUsage(result);
  if (resWarnings && resWarnings.length > 0 && logger) {
    logger.warn('🔧 Phase 2 T07: 资源引用校验发现异常', {
      warnings: resWarnings,
    });
  }

  // T08: 剥离未定义的资源变量引用（治本，2026-08-26）
  //      模型在 resourceDomMapping 为空时常臆造 bg4/bg5/icon7 等变量并写进 :style，
  //      但 injectResourceImports 只会注入「真实存在的资源」，臆造变量最终无 import
  //      → 运行时 ReferenceError 或静默渲染失败（本次 tab 背景全丢就是这个原因）。
  result = stripUndefinedResourceRefs(result, options);

  // T09: headerSlots 补齐（治本）—— 设计稿头部有内容但模型只写注释时，确定性注入真实 DOM
  result = ensureHeaderSlots(result, input, options);

  return result;
}

/**
 * T08: 剥离未定义的资源变量引用（确定性修复）
 *
 * 判定：模板里 `url(${bgN})` / `:src="iconN"` 引用的资源变量，在 <script> 中既无 import
 * 也无本地声明 → 该引用必然是臆造，删除对应的内联 background-image / 整个 :style 绑定。
 * 保留 class 提供的视觉（common.less 通常已有对应背景规则）。
 */
export function stripUndefinedResourceRefs(code, options = {}) {
  const logger = safeLogger(options.logger);
  if (!code || typeof code !== 'string') return code;
  const scriptMatch = code.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  if (!scriptMatch) return code;
  const script = scriptMatch[1];
  const templateMatch = code.match(/<template>([\s\S]*)<\/template>/i);
  if (!templateMatch) return code;

  // 模板 + 🛡️ script 双覆盖（P1.7：script 内引用曾是盲区 —— 13890774 事故中
  // `const deviceIcons = [icon3, icon4, …]` 写在 script 里，只扫模板则完全看不见，
  // 幽灵引用直达运行时 → `icon4 is not defined`）。
  const referenced = new Set();
  const tplRefs = collectResourceVarRefsFromSfc(code);
  for (const name of tplRefs.all) referenced.add(name);
  if (referenced.size === 0) return code;

  const undefinedVars = [...referenced].filter((name) => {
    const declared = new RegExp(
      `(?:import\\s+${name}\\s+from|(?:const|let|var)\\s+${name}\\b|\\b${name}\\s*[,}]\\s*=|\\b${name}\\s*:)`,
    );
    return !declared.test(script);
  });
  if (undefinedVars.length === 0) return code;

  let result = code;
  for (const name of undefinedVars) {
    // ① 删除 `backgroundImage: \`url(${name})\`` 这类属性（含尾随逗号）
    result = result.replace(
      new RegExp(
        `\\s*background(?:-i|I)mage\\s*:\\s*\`?url\\(\\$\\{\\s*${name}\\s*\\}\\)\`?\\s*,?`,
        'g',
      ),
      '',
    );
    // ② 删除 `:src="name"`
    result = result.replace(new RegExp(`\\s*:src="\\s*${name}\\s*"`, 'g'), '');
    // ③ 🛡️ script 区收尾（P1.7）：把 script 内剩余的未定义资源引用替换为 `undefined`，
    //    避免 `[icon3, icon4]` / `getDeviceIcon()` 等形态直达运行时抛 ReferenceError。
    //    仅替换**非声明位置**的裸标识符（该变量已确认未 import/未声明 → 不可能是定义处）。
    result = result.replace(
      /(<script[^>]*>)([\s\S]*?)(<\/script>)/i,
      (whole, open, body, close) =>
        open +
        body.replace(new RegExp(`(?<![.\\w$])${name}(?![\\w$])`, 'g'), 'undefined') +
        close,
    );
  }
  // ③ 清理因上一步变空的 :style="{ }" 绑定
  result = result.replace(/\s*:style="\{\s*\}"/g, '');

  if (logger) {
    logger.warn('🔧 T08 已剥离未定义的资源变量引用（防臆造资源致渲染失败）', {
      undefinedVars,
    });
  }
  return result;
}

/**
 * 🛡️ P1-3 辅助函数：收集子组件中已渲染的文本内容
 *
 * 遍历 files 中 package/components/*.vue 的 <template> 部分，提取所有可见文本节点。
 * 返回 Set<string>，包含所有在子组件中出现的文本片段（长度 ≥ 2 的非空白字符串）。
 *
 * @param {Object} files - 文件映射 { 'package/components/XXX.vue': content, ... }
 * @returns {Set<string>} 子组件中已渲染的文本片段集合
 */
function collectSubcomponentTexts(files) {
  const texts = new Set();
  if (!files || typeof files !== 'object') return texts;

  for (const [filePath, content] of Object.entries(files)) {
    // 只处理子组件文件（package/components/*.vue）
    if (!filePath.startsWith('package/components/') || !filePath.endsWith('.vue')) {
      continue;
    }
    if (typeof content !== 'string') continue;

    // 提取 <template> 部分
    const templateMatch = content.match(/<template>([\s\S]*?)<\/template>/i);
    if (!templateMatch) continue;
    const templateContent = templateMatch[1];

    // 提取所有文本节点（标签之间的文本内容）
    // 匹配：>文本< 或 >文本</tag>
    const textNodeRe = />([^<>{}]+)</g;
    let match;
    while ((match = textNodeRe.exec(templateContent)) !== null) {
      const text = match[1].trim();
      // 过滤：长度 ≥ 2、非纯注释、非纯空白
      if (text.length >= 2 && !text.startsWith('<!--')) {
        texts.add(text);
      }
    }

    // 额外提取：插值表达式 {{ xxx }} 中的字面量字符串
    const interpRe = /\{\{\s*['"]([^'"]+)['"]\s*\}\}/g;
    while ((match = interpRe.exec(templateContent)) !== null) {
      const literal = match[1].trim();
      if (literal.length >= 2) {
        texts.add(literal);
      }
    }
  }

  return texts;
}

/**
 * 🛡️ P1-3 辅助函数：从 headerSlot content 提取关键文本片段
 *
 * 将 headerSlot.content（如 "设备类型 28" / "设备总数 68562"）拆分为多个片段，
 * 用于与子组件文本集合比对。提取规则：
 * 1. 整体作为一个片段
 * 2. 按空格/标点拆分的单词（长度 ≥ 2）
 * 3. 数字部分（长度 ≥ 2）
 *
 * @param {string} content - headerSlot.content
 * @returns {string[]} 文本片段数组
 */
function extractTextFragments(content) {
  if (!content || typeof content !== 'string') return [];
  const fragments = [];

  // 1. 整体作为一个片段
  const trimmed = content.trim();
  if (trimmed.length >= 2) {
    fragments.push(trimmed);
  }

  // 2. 按空格/标点拆分
  const words = content.split(/[\s,，。.;；:：!！?？]+/).filter(w => w.length >= 2);
  fragments.push(...words);

  // 3. 提取数字部分（长度 ≥ 2）
  const numbers = content.match(/\d{2,}/g);
  if (numbers) {
    fragments.push(...numbers);
  }

  // 去重
  return Array.from(new Set(fragments));
}

/**
 * T09: headerSlots 补齐（确定性兜底）
 *
 * 现象：设计稿标题栏右侧有统计指标（如「设备类型 28 / 设备总数 68562 / 完好率 98%」），
 * headerSlots 已确定性推导出来，但模型只在 `<template #title_right>` 里写了注释
 * 或干脆不生成插槽 → 预览里头部一片空白。
 * 处理：对每个未落地的 slotType，用 headerSlots[].content 注入最小可见 DOM。
 *
 * 🛡️ P1-3（2026-09-07，#565）：headerSlots/sections 重叠去重。
 * 根因：vision 把同一份统计数据同时放进 headerSlots 和 layout.sections（如 header-stats），
 * 下游两路消费：section → HeaderStats 子组件；headerSlots → T09 兜底注入插槽 → 重复渲染。
 * 治本：注入前检查子组件是否已渲染相同内容，重叠则跳过注入。
 */
export function ensureHeaderSlots(code, input, options = {}) {
  const { componentType, files } = options;
  const logger = safeLogger(options.logger);
  if (!code || typeof code !== 'string') return code;
  if (componentType === 'vue3') return code; // vue3 无 base-panel 宿主

  // 🛡️ 插槽名下划线→连字符归一化（2026-09-03，mc-max-1788369882821 实锤）：
  // LLM 可能直接生成 <template #header_right>/#title_left/#title_right（下划线），但
  // base-panel/default-panel 的真实插槽名是连字符（#header-right/#title-left/#title-right）。
  // 下划线插槽名不被宿主识别 → 插槽内容被 Vue 静默丢弃 → header 右侧 icon 消失。
  // 确定性归一化：无论 LLM 生成哪种写法，都落到连字符（与下方 slotNameMap 一致）。
  const beforeSlotNorm = code;
  code = code.replace(
    /<template\s+#(header_right|title_left|title_right)\b/gi,
    (m) => m.replace(/_/g, '-'),
  );
  if (code !== beforeSlotNorm) {
    logger?.warn('🔧 头部插槽名下划线→连字符归一化（header_right → header-right 等）');
  }

  let slots = Array.isArray(input?.headerSlots) ? input.headerSlots : [];
  if (slots.length === 0) return code;
  if (!/<base-panel/i.test(code)) return code;

  // 🛡️ P1-3（2026-09-07）：headerSlots/sections 重叠去重。
  // 收集子组件中已渲染的文本内容，与 headerSlots 比对，重叠则跳过注入。
  const subcomponentTexts = collectSubcomponentTexts(files);
  if (subcomponentTexts.size > 0) {
    const beforeDedup = slots.length;
    slots = slots.filter((slot) => {
      const content = String(slot?.content || '').trim();
      if (!content) return true;
      // 提取 slot content 中的关键数字/文本片段，检查子组件是否已渲染
      const fragments = extractTextFragments(content);
      for (const frag of fragments) {
        if (subcomponentTexts.has(frag)) {
          logger?.warn(
            `🛡️ T09 P1-3 重叠去重：headerSlots "${content.slice(0, 30)}" 与子组件内容重叠（片段 "${frag}"），跳过注入`,
          );
          return false;
        }
      }
      return true;
    });
    if (slots.length !== beforeDedup) {
      logger?.warn(
        `🛡️ T09 P1-3 已剔除 ${beforeDedup - slots.length} 个与子组件重叠的 headerSlots（防重复渲染）`,
      );
    }
  }

  // 🛡️ P5 DOM 级清理（2026-09-09）：被 P1-3 过滤掉的 slot 若已有 <template #XXX> DOM → 移除整个模板
  // P1-3 仅在 slots 契约层面跳过注入，但 LLM 直接生成的/缓存恢复的 <template> 节点仍留在代码中。
  // 子组件已渲染相同内容 + 主组件 template 里也挂了同一内容 → 双份渲染（T09 重复渲染）。
  // 🛡️ Loop 2.1.D（2026-09-10）：逻辑抽到 utils/slot-dom-deduper.js（纯函数、可单测），
  // 与 2.1.C 互斥裁决配套——契约删了 DOM 也要删。
  if (subcomponentTexts.size > 0) {
    const domResult = removeOverlappingSlotDom(code, { subcomponentTexts });
    if (domResult.removed > 0) {
      code = domResult.code;
      logger?.warn(
        `🛡️ T09 P5 已完成 DOM 级清理：移除 ${domResult.removed} 个与子组件内容重叠的 <template #header-right/title-left/title-right> 模板节点`,
      );
    }
  }
  if (slots.length === 0) return code;

  // 🛡️ C-2（2026-09-02，mc-max-1788349399134-9c3aff7f）：T09 兜底注入前越界几何过滤（双保险）。
  // C-1 已在 graph 层按 validator rejectedNodes 剔除误判；但 headerSlots 可能来自 checkpoint/
  // 缓存恢复（绕过 graph 校验路径），故注入前对每个候选做 bbox 相交判定：候选 figmaNodeId
  // 对应节点与「header 容器」bbox 完全不相交 → 内容区元素被误判为 header 插槽 → 跳过注入
  // （避免 T09 把图标当纯文字渲染 + 双份挂载）。找不到节点/容器 → 保守保留原行为。
  const figmaNodeData = input?.figmaNodeData?.document || input?.figmaNodeData;
  if (figmaNodeData && typeof figmaNodeData === 'object') {
    // 1) 定位 header 容器 bbox（与 figma-connector.findHeaderContainer 同款启发）
    let headerBox = null;
    const walkFindHeader = (node) => {
      if (headerBox || !node || typeof node !== 'object') return;
      const nm = String(node.name || '').toLowerCase();
      if (
        (nm.includes('header') || nm.includes('头部')) &&
        (node.type === 'FRAME' || node.type === 'GROUP') &&
        node.absoluteBoundingBox
      ) {
        headerBox = node.absoluteBoundingBox;
        return;
      }
      if (Array.isArray(node.children))
        node.children.forEach(walkFindHeader);
    };
    walkFindHeader(figmaNodeData);
    // 2) 候选定位（id 优先，其次 name——9c3aff7f 的误判候选 figmaNodeId 实为 name "tabs-icon"/"num"）
    const findNodeBox = (key) => {
      if (!key) return null;
      let box = null;
      const walkFind = (node) => {
        if (box || !node || typeof node !== 'object') return;
        if (
          String(node.id || '') === String(key) ||
          String(node.name || '') === String(key)
        ) {
          if (node.absoluteBoundingBox) box = node.absoluteBoundingBox;
          return;
        }
        if (Array.isArray(node.children)) node.children.forEach(walkFind);
      };
      walkFind(figmaNodeData);
      return box;
    };
    if (headerBox) {
      const before = slots.length;
      const hx = headerBox.x ?? 0;
      const hy = headerBox.y ?? 0;
      const hw = headerBox.width ?? 0;
      const hh = headerBox.height ?? 0;
      slots = slots.filter((slot) => {
        if (String(slot?.slotType || '').trim() !== 'header-right') return true;
        const sbox = findNodeBox(slot?.figmaNodeId || slot?.id || slot?.name);
        if (!sbox) return true; // 定位不到 → 保守保留
        const sx = sbox.x ?? 0;
        const sy = sbox.y ?? 0;
        const sw = sbox.width ?? 0;
        const sh = sbox.height ?? 0;
        // bbox 完全不相交（任一轴无重叠）→ 越界
        const xOverlap = sx < hx + hw && hx < sx + sw;
        const yOverlap = sy < hy + hh && hy < sy + sh;
        const intersect = xOverlap && yOverlap;
        if (!intersect) {
          logger.warn(
            `🛡️ T09 C-2 越界过滤：header-right 候选 ${slot?.figmaNodeId || slot?.name || slot?.content}（bbox ${Math.round(sx)},${Math.round(sy)} ${Math.round(sw)}x${Math.round(sh)}）与 header 容器（${Math.round(hx)},${Math.round(hy)} ${Math.round(hw)}x${Math.round(hh)}）不相交，跳过注入`,
          );
        }
        return intersect;
      });
      if (slots.length !== before) {
        logger.warn(
          `🛡️ T09 C-2 已剔除 ${before - slots.length} 个越界 header-right 候选（内容区元素误判，防文字兜底双份渲染）`,
        );
      }
    }
  }
  if (slots.length === 0) return code;

  // slotType → base-panel 插槽名
  // 🛡️ 修复（2026-09-03）：base-panel / default-panel 的真实插槽名是**连字符**（#header-right /
  // #title-left / #title-right，见 frontend base-panel/index.vue 与 default-panel/index.vue）。
  // 旧映射把 slotType 归一化到下划线（header_right 等）→ 注入/生成的 <template #header_right>
  // 与面板插槽名不匹配，插槽内容被 Vue 丢弃 → header 右侧 icon 静默消失（mc-max-1788369882821 实锤）。
  const slotNameMap = {
    'title-left': 'title-left',
    title_left: 'title-left',
    'title-right': 'title-right',
    title_right: 'title-right',
    'header-right': 'header-right',
    header_right: 'header-right',
  };

  // 按插槽名聚合待补内容
  const pending = new Map();
  for (const slot of slots) {
    const slotName = slotNameMap[String(slot?.slotType || '').trim()];
    if (!slotName) continue;
    const content = String(slot?.content || '').trim();
    if (!content) continue;

    // 已有该插槽且内部有非注释实体内容 → 跳过
    const existing = new RegExp(
      `<template\\s+#${slotName}\\s*>([\\s\\S]*?)</template>`,
      'i',
    ).exec(code);
    if (existing) {
      const inner = existing[1].replace(/<!--[\s\S]*?-->/g, '').trim();
      if (inner) continue;
    }
    if (!pending.has(slotName)) pending.set(slotName, []);
    pending.get(slotName).push(content);
  }
  if (pending.size === 0) return code;

  let result = code;
  const injected = [];
  // ⚠️ 内联样式而非 class：兜底注入时 common.less 里没有对应规则，
  //    用 class 会再次出现「有 DOM 没样式」；内联最小样式保证一定可见。
  const itemStyle =
    'display:inline-flex;align-items:center;gap:4px;margin-left:16px;' +
    'font-size:13px;line-height:1;white-space:nowrap;';
  for (const [slotName, contents] of pending) {
    const items = contents
      .map((text) => `        <span style="${itemStyle}">${text}</span>`)
      .join('\n');
    const block =
      `      <template #${slotName}>\n` +
      `        <!-- 由生成器按 Figma headerSlots 确定性补齐（模型漏生成兜底） -->\n` +
      `${items}\n` +
      `      </template>\n`;

    const existingRe = new RegExp(
      `([ \\t]*)<template\\s+#${slotName}\\s*>[\\s\\S]*?</template>\\s*\\n`,
      'i',
    );
    if (existingRe.test(result)) {
      result = result.replace(existingRe, block); // 空插槽 → 填充
    } else {
      // 插到 <base-panel ...> 开标签之后
      result = result.replace(/(<base-panel[^>]*>\s*\n)/i, `$1${block}`);
    }
    injected.push(slotName);
  }

  if (injected.length > 0 && logger) {
    logger.warn('🔧 T09 已确定性补齐 base-panel 头部插槽（模型漏生成）', {
      injected,
      slotCount: slots.length,
    });
  }
  return result;
}

/**
 * 🛡️ 尺寸联动 clamp：min-height 超根容器高 → 压至 85%
 */
export function clampOversizeMinHeight(files, options = {}) {
  const logger = safeLogger(options.logger);
  const idx = files['package/index.vue'];
  if (typeof idx !== 'string') return null;
  // 1. 根容器 class（base-panel 内第一个 div，取含 -root 的优先）
  const rootClassMatch =
    idx.match(/<div\s+class="([^"]*-root[^"]*)"/) ||
    idx.match(/<div\s+class="([^"]+)"/);
  if (!rootClassMatch) return null;
  const rootClass = rootClassMatch[1].trim().split(/\s+/).pop();
  if (!rootClass) return null;
  // 2. 根容器固定 height（从 less/css + vue style 块里找 .rootClass 规则）
  const esc = rootClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rootRuleRe = new RegExp(`\\.${esc}\\s*\\{([^}]*)\\}`);
  let rootH = null;
  for (const [p, c] of Object.entries(files)) {
    if (typeof c !== 'string') continue;
    if (!/\.(less|css)$/i.test(p) && !p.endsWith('.vue')) continue;
    const m = c.match(rootRuleRe);
    if (m) {
      const hm = m[1].match(/(?:^|;)\s*height:\s*(\d+(?:\.\d+)?)px/);
      if (hm) {
        rootH = parseFloat(hm[1]);
        break;
      }
    }
  }
  if (!rootH || rootH >= 600) return null;
  const cap = Math.round(rootH * 0.85);
  // 3. 所有样式文本里 min-height > rootH → clamp
  let changed = false;
  const out = {};
  for (const [p, c] of Object.entries(files)) {
    if (typeof c !== 'string') continue;
    if (!/\.(less|css)$/i.test(p) && !p.endsWith('.vue')) continue;
    const next = c.replace(/min-height:\s*(\d+(?:\.\d+)?)px/g, (whole, num) => {
      if (parseFloat(num) > rootH) {
        changed = true;
        return `min-height: ${cap}px`;
      }
      return whole;
    });
    if (next !== c) out[p] = next;
  }
  if (!changed) return null;
  if (logger) {
    logger.warn(
      `🛡️ 尺寸联动 clamp：min-height 超根容器高 ${rootH}px → 压至 ${cap}px`,
      { files: Object.keys(out) },
    );
  }
  return out;
}

/**
 * 🛡️ fix-section-heights 规则实现（语义分流校验，2026-08-29，mc-max-1788003319188-c32142f3 实锤）。
 *
 * 背景：该规则早已在 code-fix-rules.js 注册，但本方法从未实现（悬挂引用），
 * 导致 `flex: 180 1 0` 这类「设计稿像素高度误填 flex-grow」的布局崩坏无法被自动修复。
 *
 * 根因不是「flex-grow 值太大」——flex-grow 是纯比例、无上限，100+ 完全合法。
 * 真正的病灶是**语义混淆**：设计稿 chart `height: 180px` 是像素高度，模型把它直接填进了
 * flex-grow 字段（`flex: 180 1 0`）。正常作者用 flex-grow 表达比例时写 1~5 的小整数
 * （1:2:3 ≡ 100:200:300，写大数无意义），一旦 flex-grow 落在「像素量级」（20~5000），
 * 几乎必然是「px 高度误填比例字段」。故此处不查「绝对值是否超限」，而查「值是否落在
 * 像素量级」这一误填信号——这就是与「值域禁止」的本质区别。
 *
 * 三条规则（均确定性、幂等）：
 *  ① flex-grow 量纲检测（**只告警、不改写**）
 *  ② height:100% section 根：flex 容器（规则体含 display:flex）内的 `height:100%`
 *     → `flex: 1 1 0`（等比例分配，杜绝多 section 各自 100% 高度互相溢出）
 *  ③ 比例失衡告警（不 BLOCK）：同文件 flex-grow 最大/最小比值 > 50 → warn
 *
 * ⚠️⚠️ 规则① 重大修订（2026-09-01，缺口③ 取证实锤）——**禁止**把像素量级 grow 归一化成 1：
 *
 * 原实现把 `flex: <grow 20~5000> <shrink> <basis>` 一律改成 `flex: 1 1 0`（等比例归一化），
 * 其前提是「grow 落在像素量级 = px 高度误填比例字段」。但该前提已与现行规范矛盾：
 *   - `prompts/engineer/shared/root-container.md`：内容区块**必须**写 `flex: <Figma高度px> 1 0`
 *     （flex-grow 直接取设计稿高度值，引擎按各区块设计稿高度自动等比分配）；
 *   - `prompts/engineer/dynamic/chart-standards.md`：多图表时同样要求 `flex: <Figma高度px> 1 0`；
 *   - `validators/code-fix-rules.js` 规则注释亦写「→ `flex: <px> 1 0; min-height: 0`」。
 * 即「像素量级 grow」是**规范要求的正确写法**，归一化反而把设计稿比例抹平成 1:1:1。
 *
 * 实锤（mc-max-1788186816669-8f7b5097 快照 revisions）：历史 revision 中
 * `BridgeHourly.vue:265`/`FlowPrediction.vue:277`/`common.less:81,160,162,311,315,395,396`
 * 出现大面积 `flex: 1 1 0` —— 正是本规则把 110/100/180/131/142 抹平后的残骸，
 * 下一轮生成又写回像素值，形成「改坏 → 重生成 → 再改坏」的震荡。
 *
 * 真正的病灶不是「grow 值大」，而是**量纲混用**：同一组兄弟节点里部分写像素量级
 * （如 131/142/180）、部分写比例量级（如 12/15/17/20），比例才崩坏。
 * 故规则①改为纯检测：发现量纲混用只告警，交由 L0-B 的 FLEX-003/004 携带 Figma 真值拦截，
 * 由 LLM 统一量纲（后处理无 Figma 真值，无法自行换算）。
 *
 * @param {string} content 单个样式文件（.vue 的 <style> 或 .less/.css）内容
 * @param {object} ctx 规则上下文（含 path）
 * @returns {string} 修复后内容（规则① 不再改写 grow 值）
 */
export function fixSectionHeightsForResource(content, ctx, options = {}) {
  const logger = safeLogger(options.logger);
  if (typeof content !== 'string' || !content) return content;
  const path = ctx?.path || '';
  const growValues = [];
  let changed = false;

  // 规则①：flex-grow 量纲检测（**只收集、不改写**）
  // ⚠️ 严禁恢复「像素量级 grow → 归一化成 1」：flex: <flexGrow系数> 1 0 才是规范要求的正确写法
  //（系数来自 A4 figma-height-ratio.js 归一化 avg=1 量纲，如 0.978 / 1.061）。像素量级 grow
  //（flex: 131 1 0）是过时写法，会导致 FLEX-005 BLOCK（混用比例+像素量纲）。
  const FLEX_TRIPLE_RE = /flex\s*:\s*(\d+)\s+([01])\s+(0|auto)\b/g;
  for (const m of content.matchAll(FLEX_TRIPLE_RE)) {
    growValues.push(parseInt(m[1], 10));
  }
  const out1 = content;

  // 规则②：flex 容器（section 根）的 height:100% → flex: 1 1 0
  // 仅处理「规则体含 display:flex」的块，避免误伤固定尺寸父容器内的 icon/img（height:100% 正确）
  const RULE_BLOCK_RE = /([^{}]*\{)([^{}]*)\}/g;
  // ⚠️ 组件根豁免（2026-09-02 实锤，mc-max-1788280914596-25b10e4d 等三组件）：
  // 本规则改写的是「父级为组件内部 flex 容器」的内部 section——它们各写 height:100% 会
  // 互相溢出，改成 flex 分配正确。但**组件根**（-root 结尾的类，与本文件 :1407 的
  // 根选择器识别同约定）的父级是宿主 `.pannel-content`——block 定高容器
  // （height: calc(100% - 38px)，**无 display:flex**，见 frontend default-panel/index.vue），
  // `flex: 1 1 0` 在非 flex 父容器下完全失效 → 根高度退 auto → 内部
  // `flex:1; min-height:0` 的图表区拿到 0 → 内容整块消失。
  // 生成时间线放大了该 bug：chunk 级快照推的是模型原始产出（height:100% 还在，预览正常），
  // 收尾 code-fix pipeline 改写后才推最终快照 → 用户看到「中途是好的，完成时反而坏了」。
  // `-root\b` 词边界：.c-x-rooter 不误豁免。
  // 🔴 2026-09-11 二次实锤（c-env-monitor-xh8jdcpy-2aa25837）：层① 确定性模板的根内容容器
  // 是 `c-{semantic}-slot-con`（code-generator.js buildDeterministicIndexTemplate 硬编码），
  // 同样直连宿主 block 容器 .pannel-content——只豁免 -root 时 slot-con 的 height:100% 仍被
  // 改写成 flex:1 1 0 → 塌陷复发（flex:1 1 0 在非 flex 父容器下完全失效）。
  const ROOT_SELECTOR_RE = /\.[\w-]*-(root|slot-con)\b/;
  // 🆕 A4 加权（2026-09-04，实锤 mc-max-1788454423557-25e40782；2026-09-09 修订从 px 改系数）：
  // section 根类命中 ctx.sectionHeights（{根class: flexGrow系数}，由 engineer
  // _buildSectionHeightsMap 按「plan.effectiveSections 顺序 ↔ 主组件模板子组件标签顺序」
  // 1:1 构建）时，用 flexGrow 系数作 grow（规范写法 flex: <系数> 1 0，与 FLEX-005 兼容），
  // 不再盲注等比例 flex: 1 1 0。旧产物已被盲注 flex: 1 1 0 的（无 height:100% 残留），
  // 走升级分支同样改写——重跑修复管线即可修复存量坏产物。
  const sectionHeights = ctx?.sectionHeights || null;
  const lookupSectionPx = (head) => {
    if (!sectionHeights) return 0;
    for (const m of String(head).matchAll(/\.([A-Za-z][\w-]*)/g)) {
      const px = sectionHeights[m[1]];
      if (Number.isFinite(px) && px > 0) return px;
    }
    return 0;
  };
  const out2 = out1.replace(RULE_BLOCK_RE, (whole, head, body) => {
    if (!/display:\s*flex/i.test(body)) return whole;
    if (ROOT_SELECTOR_RE.test(head)) return whole;
    const px = lookupSectionPx(head);
    // 升级分支：无 height:100% 但残留盲注 flex: 1 1 0 → 命中映射时改写为真值 flexGrow 系数
    if (!/height:\s*100%\s*;?/i.test(body)) {
      if (px > 0 && /flex\s*:\s*1\s+1\s+0\s*;?/i.test(body)) {
        const newBody = body.replace(/flex\s*:\s*1\s+1\s+0\s*;?/gi, `flex: ${px} 1 0;`);
        if (newBody !== body) changed = true;
        return head + newBody + '}';
      }
      return whole;
    }
    let newBody;
    if (px > 0) {
      newBody = body.replace(/height:\s*100%\s*;?/gi, `flex: ${px} 1 0;`);
      if (!/min-height\s*:\s*0/i.test(newBody)) {
        newBody = newBody.replace(/(flex:\s*[^;]+;)/i, '$1\n  min-height: 0;');
      }
    } else {
      newBody = body.replace(/height:\s*100%\s*;?/gi, 'flex: 1 1 0;');
    }
    if (newBody !== body) changed = true;
    return head + newBody + '}';
  });

  // 规则④：固定 px 尺寸区块禁 flex-grow（2026-09-02 实锤，mc-max-1788280167414-49dfbe7d）
  // CategoryNav `width: 46px; flex: 1 1 0` → flex-grow 撑满剩余宽度（实测 186px，设计 46px）。
  // flex-grow 与显式 px 尺寸矛盾（grow+basis0 会忽略 width/height），固定尺寸区块的
  // 正确写法是 flex-shrink: 0（或 flex: 0 0 auto）。
  // ⚠️ 误伤面控制（全存量语料扫描实证）：精确 width/height:<px> + flex-grow 同块
  // 全仓仅此 1 处；图表 section 是 `min-height:<px> + flex:<px> 1 0`（合法组合，不触碰）；
  // `width: 100% + grow` 行父下等价、列父下无法静态判定（→ 不触碰）。
  // 规则② 输出的 section 根（height:100%→flex:1 1 0）无 px 尺寸 → 不落入本规则。
  const FIXED_PX_RE = /(?:^|[^-\w])(?:width|height)\s*:\s*\d+(?:\.\d+)?px/;
  const FLEX_GROW_TRIPLE_RE = /flex\s*:\s*[1-9]\d*\s+[01]\s+(?:0|auto)\b/;
  const out4 = out2.replace(RULE_BLOCK_RE, (whole, head, body) => {
    if (!FIXED_PX_RE.test(body)) return whole;
    const gm = body.match(FLEX_GROW_TRIPLE_RE);
    if (!gm) return whole;
    const newBody = body.replace(gm[0], 'flex: 0 0 auto');
    if (newBody !== body) changed = true;
    return head + newBody + '}';
  });

  // 规则③：量纲混用 / 比例失衡告警（不 BLOCK，只提示）
  // 真正的病灶是「同一组 grow 里像素量级与比例量级混用」，而非「grow 值大」。
  const nonZero = growValues.filter((g) => g > 0);
  if (nonZero.length >= 2) {
    const pixelScale = nonZero.filter((g) => g >= FLEX_GROW_SCALES.PIXEL_MIN);
    const ratioScale = nonZero.filter((g) => g <= FLEX_GROW_SCALES.RATIO_MAX);
    if (pixelScale.length > 0 && ratioScale.length > 0) {
      if (logger) {
        logger.warn(
          '⚠️ flex-grow 量纲混用：同一文件同时出现像素量级（设计稿高度）与比例量级 grow，区块高度比例将失真',
          {
            file: path,
            pixelScale,
            ratioScale,
            hint: '统一为 flexGrow 系数写法：flex: <系数> 1 0（如有映射节）',
          },
        );
      }
    } else {
      const max = Math.max(...nonZero);
      const min = Math.min(...nonZero);
      if (min > 0 && max / min > 50) {
        if (logger) {
          logger.warn(
            '⚠️ flex-grow 比例失衡（最大/最小 > 50x），疑似像素高度误填比例字段',
            { file: path, max, min, ratio: Math.round(max / min) },
          );
        }
      }
    }
  }

  if (changed && logger) {
    logger.warn(
      '🛡️ 语义分流修复：flex-grow 臆造值 / height:100% section 根 → 等比例分配；固定 px 尺寸区块 → flex: 0 0 auto',
      { file: path },
    );
  }
  return changed ? out4 : content;
}

/**
 * 检测 index.vue 中引用的子组件路径
 */
export function detectSubComponents(indexVueContent) {
  if (!indexVueContent) return [];
  const set = new Set();

  // 静态 import: import X from '...components/xxx'
  const staticRe = /from\s*['"]([^'"]*?components\/([^'"\/]+?))['"]/g;
  let m;
  while ((m = staticRe.exec(indexVueContent)) !== null) {
    const name = m[2].replace(/\.vue$/i, '');
    if (name) set.add(`package/components/${name}.vue`);
  }

  // 动态 import(): import('...components/xxx')
  const dynamicRe =
    /import\s*\(\s*['"]([^'"]*?components\/([^'"\/]+?))['"]\s*\)/g;
  while ((m = dynamicRe.exec(indexVueContent)) !== null) {
    const name = m[2].replace(/\.vue$/i, '');
    if (name) set.add(`package/components/${name}.vue`);
  }

  // require(): require('...components/xxx')
  const requireRe =
    /require\s*\(\s*['"]([^'"]*?components\/([^'"\/]+?))['"]\s*\)/g;
  while ((m = requireRe.exec(indexVueContent)) !== null) {
    const name = m[2].replace(/\.vue$/i, '');
    if (name) set.add(`package/components/${name}.vue`);
  }

  return [...set];
}

/**
 * 自动补齐子组件 import（script 段漏 import 子组件时）
 */
export function ensureSubComponentImport(content, options = {}) {
  const logger = safeLogger(options.logger);
  if (!content || typeof content !== 'string') return content;
  const tplMatch = content.match(/<template>([\s\S]*?)<\/template>/i);
  if (!tplMatch) return content;

  // 提取 template 里的 PascalCase 子组件标签（排除 Vue 内置组件）
  const VUE_BUILTINS = new Set([
    'RouterView',
    'RouterLink',
    'KeepAlive',
    'Transition',
    'TransitionGroup',
    'Suspense',
    'Teleport',
    'Component',
    'Slot',
  ]);
  const subComps = new Set();
  for (const m of tplMatch[1].matchAll(/<([A-Z][\w]*)\b/g)) {
    if (!VUE_BUILTINS.has(m[1])) subComps.add(m[1]);
  }
  if (subComps.size === 0) return content;

  // 提取 script 已 import 的绑定名（默认导入 + 具名导入）
  const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  const scriptBody = scriptMatch ? scriptMatch[1] : '';
  const declared = new Set();
  for (const m of scriptBody.matchAll(
    /import\s+([A-Za-z_$][\w$]*)\s+from\s*['"]/g,
  ))
    declared.add(m[1]);
  for (const m of scriptBody.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]/g)) {
    for (const n of m[1].split(',')) {
      const name = n
        .trim()
        .split(/\s+as\s+/)
        .pop()
        .trim();
      if (name) declared.add(name);
    }
  }
  // 🛡️ 也识别 const/let/var/function 声明：模型可能用 defineAsyncComponent 动态导入子组件
  // （如 `const TotalTraffic = defineAsyncComponent(() => import(...))`），此时标识符已声明，
  // 若再补静态 `import TotalTraffic from ...` 会报 "already been declared" 导致写盘失败。
  for (const m of scriptBody.matchAll(
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g,
  ))
    declared.add(m[1]);
  for (const m of scriptBody.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\b/g))
    declared.add(m[1]);

  const missing = [...subComps].filter((c) => !declared.has(c));
  if (missing.length === 0) return content;

  const importLines = missing
    .map((c) => `import ${c} from './components/${c}.vue'`)
    .join('\n');
  if (logger) {
    logger.warn('🔧 自动补齐子组件 import（script 段漏 import 子组件）', {
      missing,
    });
  }
  // 插到 <script ...> 之后
  return content.replace(
    /<script([^>]*)>(\s*)/i,
    (m, attrs, ws) => `<script${attrs}>${ws}${importLines}\n`,
  );
}

/**
 * 🛡️ 层①（2026-09-11）：删除死子组件 import —— 治 CODE-021（import 了但模板 0 处引用）。
 * ensureSubComponentImport 只「补缺失 import」，本函数做对称的「删多余 import」：
 * 脚本里 `import X from './components/X.vue'` 但 X 在 <template> 里 0 处引用（非 <X 标签、
 * 非 :is="X" 动态引用）→ 该 import 是死代码（真实结构只活在未挂载的子组件里），确定性移除。
 * 与层①确定性模板装配配套：模板由系统生成后，脚本段的子组件 import 以模板标签为唯一事实源，
 * LLM 臆造/多 import 的子组件名被裁剪，杜绝「import 与模板不一致」→ CODE-021 BLOCK。
 */
export function pruneDeadSubComponentImports(content, options = {}) {
  const logger = safeLogger(options.logger);
  if (!content || typeof content !== 'string') return content;
  // 🛡️ 2026-09-11（0ca84358 实锤）：模板区提取改用共享边界法 —— lazy `</template>`
  // 会被具名插槽提前闭合截断，插槽后的主内容标签全部不可见 → 全部 import 被误判
  // 「模板未引用」删除 → 悬空标签（SwitchSection/TabsSection/MainSection 事故）。
  const templateBody = extractSfcTemplate(content);
  if (!templateBody) return content;

  const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  if (!scriptMatch) return content;
  const scriptBody = scriptMatch[1];

  // 模板里实际引用的子组件名：<PascalCase ...> 或 <component :is="X">
  const used = new Set();
  for (const m of templateBody.matchAll(/<([A-Z][\w]*)\b/g)) used.add(m[1]);
  for (const m of templateBody.matchAll(/:is\s*=\s*["']([A-Za-z_$][\w$]*)["']/g))
    used.add(m[1]);

  const dead = [];
  const importRe = /import\s+([A-Za-z_$][\w$]*)\s+from\s*['"]\.\/components\/[^'"]+['"]/g;
  for (const m of scriptBody.matchAll(importRe)) {
    if (!used.has(m[1])) dead.push(m[1]);
  }
  if (dead.length === 0) return content;

  let newScript = scriptBody;
  for (const name of dead) {
    newScript = newScript.replace(
      new RegExp(`import\\s+${name}\\s+from\\s*['"]\\.\\/components\\/[^'"]+['"]\\s*\\n?`, 'g'),
      '',
    );
  }

  if (logger) {
    logger.warn('🔧 已删除死子组件 import（模板未引用）', { dead });
  }
  return content.replace(scriptBody, newScript);
}

/**
 * 将可点击的 icon div 重写为 button 元素
 */
export function rewriteClickableIconDivsToButtons(content) {
  if (!content || typeof content !== 'string') {
    return { content, changed: false, count: 0 };
  }

  const clickableIconDivPattern =
    /<div([^>]*\bclass=(['"])[^'"]*(?:icon|btn|button|action|control|close|refresh|setting|operate)[^'"]*\2[^>]*\s(?:@click|v-on:click|role=(['"])button\3|aria-label=|tabindex=)[^>]*)>([\s\S]*?)<\/div>/gi;

  let count = 0;
  const nextContent = content.replace(
    clickableIconDivPattern,
    (match, attrs = '', _quote, _roleQuote, inner = '') => {
      if (
        /<(?:div|section|article|header|footer|main|ul|ol|li|table|form)\b/i.test(
          inner,
        )
      ) {
        return match;
      }

      let nextAttrs = attrs
        .replace(/\srole=(['"])button\1/gi, '')
        .replace(/\stabindex=(['"])-?\d+\1/gi, '')
        .trim();

      // 加 role="button" 保证可访问性，但不使用原生 <button>（避免浏览器默认样式污染）
      if (!/\brole=/.test(nextAttrs)) {
        nextAttrs += ' role="button"';
      }

      count += 1;
      return `<div${nextAttrs}>${inner}</div>`;
    },
  );

  return {
    content: nextContent,
    changed: count > 0,
    count,
  };
}

/**
 * 清理 base-panel 壳层泄漏（重复的 bg-layer / panel-header）
 */
export function stripBasePanelShellLeak(content) {
  if (
    !content ||
    typeof content !== 'string' ||
    !/<base-panel\b/i.test(content)
  ) {
    return { content, changed: false, removedCount: 0 };
  }

  let removedCount = 0;
  let nextContent = content;

  // 仅清理非常明确的重复壳层节点，避免误删预览中应保留的 header 内容。
  const bgLayerPattern =
    /\n?\s*<div[^>]*class=(['"])[^'"]*\bbg-layer\b[^'"]*\1[^>]*>[\s\S]*?<\/div>\s*/gi;
  nextContent = nextContent.replace(bgLayerPattern, () => {
    removedCount += 1;
    return '\n';
  });

  const hasHeaderSlots =
    /<template\s+#(title-left|title-right|header-right)/i.test(nextContent);
  if (hasHeaderSlots) {
    const panelHeaderPattern =
      /\n?\s*<div[^>]*class=(['"])[^'"]*\bpanel-header\b[^'"]*\1[^>]*>[\s\S]*?<\/div>\s*/gi;
    nextContent = nextContent.replace(panelHeaderPattern, () => {
      removedCount += 1;
      return '\n';
    });
  }

  return {
    content: nextContent,
    changed: removedCount > 0,
    removedCount,
  };
}
