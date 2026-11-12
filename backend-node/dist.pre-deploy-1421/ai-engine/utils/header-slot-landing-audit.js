/**
 * 🛡️ F1b headerSlots 落地审计（2026-11-10 · 方案 v4，docs/2026-11-10-段树完整性校验门与游离根失效修复方案.md）
 *
 * 病灶（重点车辆 31a9bb41 实锤）：headerSlots（R6/T09 通道）在产物端未落进
 * `<base-panel>` 具名插槽，胶囊被 LLM 塞进内容区压标题。既有确定性兜底
 * ensure-header-slots（code-fix-rules.js:1481）负责落地，本模块**只审计不落地**
 * （防双头口径），在写盘出口度量「兜底跑完后产物里到底落没落」。
 *
 * 身份链（方案 v4 §3-F1b，两级锚）：
 * - 结构锚（硬）：产物 index.vue 是否存在对应具名插槽开标签
 *   `<template #header-right>` / `slot="header-right"`（形态实证 percent-height-resolver.js:94）。
 *   缺失 ⇒ slotAbsent。
 * - 内容弱锚（软）：插槽块内部是否承载该 slot 的内容证据——figmaNodeId 命中
 *   （data-section-id 等）或 content 文本片段命中。命中 ⇒ landed；
 *   结构锚在但无证据 ⇒ unverified（不计为未落地，防误报）。
 *
 * 纯函数、零 IO、零依赖；插槽块提取用配平扫描（<template> 嵌套安全，
 * 吸取 lazy 正则在第一个内层 </template> 截断的教训，见 code-structure-validator.js:523）。
 */

/** slotType 归一：title_right → title-right（与 header-slot-validator.js:370 同口径）。 */
function _normalizeSlotType(slotType) {
  return String(slotType || '')
    .replace(/_/g, '-')
    .trim();
}

/**
 * 从 html 中提取 `<template #name …>` 起始的配平块内容（忽略注释干扰，token 级扫描）。
 * 嵌套 <template> 用计数配平；找不到闭合返回 null。
 * @returns {string|null}
 */
function _extractBalancedTemplateBlock(html, openTagStart) {
  const tokenRe = /<\/?template\b[^>]*>/gi;
  tokenRe.lastIndex = openTagStart;
  let depth = 0;
  let m;
  while ((m = tokenRe.exec(html)) !== null) {
    const token = m[0];
    if (/^<\/template/i.test(token)) {
      depth -= 1;
      if (depth === 0) {
        // 块内容 = 开标签结束 到 本闭合标签开始
        return html.slice(openTagEndOf(html, openTagStart), m.index);
      }
    } else {
      depth += 1;
    }
  }
  return null;
}

/** 开标签的结束位置（处理 '>' 出现在属性引号内的情形——简化：取第一个 '>'，模板开标签属性极少含 '>'）。 */
function openTagEndOf(html, openTagStart) {
  const gt = html.indexOf('>', openTagStart);
  return gt === -1 ? openTagStart : gt + 1;
}

/**
 * headerSlots 落地审计。
 * @param {Object} params
 * @param {Array}  params.headerSlots vision/planner 契约形态插槽（{slotType, content, figmaNodeId,…}）
 * @param {string} params.indexContent 产物 index.vue 全文（只读，本函数不改写）
 * @returns {{
 *   total: number, slotAbsent: number, landed: number, unverified: number,
 *   details: Array<{slotType:string, figmaNodeId:string, status:'slotAbsent'|'landed'|'unverified'}>,
 *   absentSlotKeys: string[],
 * }}
 */
export function auditHeaderSlotLanding({ headerSlots, indexContent }) {
  const slots = Array.isArray(headerSlots) ? headerSlots : [];
  const html = typeof indexContent === 'string' ? indexContent : '';
  const details = [];
  const absentSlotKeys = [];
  let slotAbsent = 0;
  let landed = 0;
  let unverified = 0;

  if (slots.length === 0 || !html) {
    return { total: slots.length, slotAbsent: 0, landed: 0, unverified: 0, details, absentSlotKeys };
  }

  for (const slot of slots) {
    if (!slot || typeof slot !== 'object') continue;
    const slotType = _normalizeSlotType(slot.slotType);
    if (!slotType) continue;
    const figmaNodeId = String(slot.figmaNodeId ?? '');
    // —— 结构锚：具名插槽开标签（三种语法形态：#name / v-slot:name / slot="name"）——
    const openRe = new RegExp(
      `<template\\s+[^>]*[#]${slotType}[\\s>=]|<template\\s+[^>]*v-slot:${slotType}[\\s>=]|<template\\s+[^>]*slot="${slotType}"[\\s>]`,
      'i',
    );
    const openMatch = openRe.exec(html);
    if (!openMatch) {
      slotAbsent += 1;
      absentSlotKeys.push(slotType);
      details.push({ slotType, figmaNodeId, status: 'slotAbsent' });
      continue;
    }
    // —— 内容弱锚：配平提取插槽块，找 figmaNodeId 或 content 文本证据 ——
    const block = _extractBalancedTemplateBlock(html, openMatch.index);
    let status = 'unverified';
    if (block) {
      if (figmaNodeId && block.includes(figmaNodeId)) {
        status = 'landed';
      } else {
        const contentText = String(slot.content ?? '');
        // 取 content 中首个 ≥4 字符的连续非空白片段做弱锚（中文/字母数字均可）
        const snippet = (contentText.match(/[^\s<>"]{4,}/g) || [])[0];
        if (snippet && block.includes(snippet)) status = 'landed';
      }
    }
    if (status === 'landed') landed += 1;
    else unverified += 1;
    details.push({ slotType, figmaNodeId, status });
  }

  return { total: slots.length, slotAbsent, landed, unverified, details, absentSlotKeys };
}
