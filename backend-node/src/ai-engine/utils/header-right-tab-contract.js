/**
 * header-right-tab-contract.js — header-right 插槽契约恢复 + 交互 Tab 确定性提升（纯函数、零 IO）
 *
 * 🛡️ 2026-11-15 实锤（mc-max-1794706325675-693c8d17）：
 *   ① vision 已装配 header-right/label「江阴靖江长江隧道 江阴大桥」(figmaNodeId=2:7954)，
 *      但 engineer 侧 state.headerSlots 为空 ⇒ `buildSectionStructureContract` 的
 *      headerSlotNodeIds 为空；同时 2026-11-15「sub-header 降级治理」后 planner 不再产
 *      `type==='header'` 叶子 ⇒ headerLeavesBefore=0 ⇒ headerSlotsEmitted=0 ⇒
 *      整条 header 行（136:120）被当 body 首段塞进 slot-con，头部右侧内容跑到内容区。
 *   ② T09 终写前补跑条件 `headerSlots.length>0` 恒假；S4 G1-v2 注入的 @click 被终态
 *      合并冲掉；`resolveHeaderTabModels` 只认 section.headerSlots(elementType=tab)，
 *      而本次视觉只给 `slotCandidate:'header-right'` + body.children[].type=tab ⇒
 *      Tab 无 @click / 无 active 切换。
 *
 * 本模块两件事，均只消费已存在的结构真值，不猜文本、不造数据：
 *   - recoverHeaderSlotContract：headerSlots 断供时，从 layoutStructure 的
 *     slotCandidate / body.children(tab) / interactions(tab-switch) 回查契约（幂等）。
 *   - promoteHeaderRightTabs：终写前把该契约落为 `<template #header-right>` 的真实
 *     交互 Tab（@click + ref active），并把 body 里重复的静态 tab 组件摘掉。
 *
 * 硬约束：尺寸一律进 less class（px2rem 生效），DOM 上不写 inline px。
 */

import {
  evaluateSlotFlowCoResidency,
  collectSectionIdSet,
} from './inline-header-slot-inferrer.js';

const SLOT_HEADER_RIGHT = 'header-right';

function isObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function normSlotType(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
}

function isHeaderRight(slot) {
  return isObj(slot) && normSlotType(slot.slotType) === SLOT_HEADER_RIGHT;
}

/** 递归收集 section 节点（含 children[] 里的嵌套段），带父段 id。 */
function collectSectionNodes(layoutStructure) {
  const out = [];
  const roots = [];
  if (Array.isArray(layoutStructure)) roots.push(...layoutStructure);
  else if (isObj(layoutStructure)) {
    for (const key of ['sections', 'effectiveSections']) {
      if (Array.isArray(layoutStructure[key])) roots.push(...layoutStructure[key]);
    }
    for (const key of ['layout', 'layoutStructure']) {
      const sub = layoutStructure[key];
      if (isObj(sub)) {
        if (Array.isArray(sub.sections)) roots.push(...sub.sections);
        if (Array.isArray(sub.effectiveSections)) roots.push(...sub.effectiveSections);
      }
    }
  }
  const seen = new Set();
  const walk = (list, parentId) => {
    for (const sec of Array.isArray(list) ? list : []) {
      if (!isObj(sec)) continue;
      const id = String(sec.id ?? '');
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      out.push({ section: sec, parentId });
      if (Array.isArray(sec.children)) walk(sec.children, id || parentId);
    }
  };
  walk(roots, '');
  return out;
}

function tabItemsOf(section) {
  const body = isObj(section?.body) ? section.body : null;
  const children = body && Array.isArray(body.children) ? body.children : [];
  return children.filter((item) => {
    if (!isObj(item)) return false;
    const kind = String(item.type || item.role || '').toLowerCase();
    return kind === 'tab' && String(item.text || '').trim();
  });
}

function cssNum(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? `${n}px` : fallback;
}

/** Figma 节点索引（id → node），只在存在 figmaNodeData 时构建。 */
function buildFigmaIndex(figmaNodeData) {
  const index = new Map();
  const walk = (node, depth = 0) => {
    if (!isObj(node) || depth > 24) return;
    const id = String(node.id ?? '');
    if (id && !index.has(id)) index.set(id, node);
    if (Array.isArray(node.children)) for (const c of node.children) walk(c, depth + 1);
  };
  const doc = isObj(figmaNodeData) ? figmaNodeData.document || figmaNodeData : null;
  walk(doc);
  return index;
}

function figmaColor(fill) {
  if (!isObj(fill) || !isObj(fill.color)) return '';
  const c = fill.color;
  const rgba = [c.r, c.g, c.b].map((v) => Math.round(Number(v || 0) * 255));
  const alpha = Number.isFinite(Number(fill.opacity))
    ? Number(fill.opacity)
    : Number.isFinite(Number(c.a))
      ? Number(c.a)
      : 1;
  if (alpha >= 0.999 && rgba.every((v) => Number.isFinite(v))) {
    const hex = rgba.map((v) => v.toString(16).padStart(2, '0')).join('');
    return `#${hex}`;
  }
  return `rgba(${rgba.join(',')},${Number(alpha.toFixed(3))})`;
}

/** 从 Figma 真值取 tab 卡面填充与其 TEXT 子节点色/字号/字重（视觉近似值的上位真值）。 */
function appearanceFromFigma(tabId, figmaIndex) {
  const out = {};
  const node = figmaIndex.get(String(tabId));
  if (!node) return out;
  const solid = (Array.isArray(node.fills) ? node.fills : []).find(
    (f) => isObj(f) && String(f.type || '').toUpperCase() === 'SOLID',
  );
  const bg = figmaColor(solid);
  if (bg) out.backgroundColor = bg;
  const text = (Array.isArray(node.children) ? node.children : []).find(
    (c) => isObj(c) && String(c.type || '').toUpperCase() === 'TEXT',
  );
  if (text) {
    const textSolid = (Array.isArray(text.fills) ? text.fills : []).find(
      (f) => isObj(f) && String(f.type || '').toUpperCase() === 'SOLID',
    );
    const color = figmaColor(textSolid);
    if (color) out.color = color;
    const style = isObj(text.style) ? text.style : {};
    if (Number(style.fontSize) > 0) out.fontSize = `${Number(style.fontSize)}px`;
    if (Number(style.fontWeight) > 0) out.fontWeight = `${Number(style.fontWeight)}`;
    if (Number(style.lineHeightPx) > 0) out.height = `${Number(style.lineHeightPx)}px`;
  }
  return out;
}

/** 从 tab 项的 styles 提取 less 用的尺寸/颜色真值（不产生 inline style）。 */
function appearanceOf(styles, figmaTabId, figmaIndex) {
  const s = isObj(styles) ? styles : {};
  const base = {
    backgroundColor: String(s.backgroundColor || s['background-color'] || '').trim(),
    color: String(s.color || '').trim(),
    fontSize: cssNum(s.fontSize || s['font-size'], '13px'),
    borderRadius: String(s.borderRadius || s['border-radius'] || '9px').trim() || '9px',
    padding: String(s.padding || '2px 10px').trim() || '2px 10px',
    height: String(s.height || '19px').trim() || '19px',
    fontWeight: Number.isFinite(Number(s.fontWeight)) ? `${Number(s.fontWeight)}` : '400',
  };
  // Figma SOLID 填充 / TEXT 子节点颜色是比视觉近似值更高位的真值；有则覆盖。
  return { ...base, ...appearanceFromFigma(figmaTabId, figmaIndex) };
}

function hasTabSwitch(input) {
  const direct = Array.isArray(input?.interactions) ? input.interactions : [];
  const nested = Array.isArray(input?.layoutStructure?.interactions)
    ? input.layoutStructure.interactions
    : [];
  return [...direct, ...nested].some((i) => isObj(i) && String(i.type || '').toLowerCase() === 'tab-switch');
}

/**
 * 恢复 header-right 插槽契约 + 结构化 tab 模型。
 * 幂等：已有 header-right 契约时不新增条目，只补 tab 结构证据。
 *
 * @param {{headerSlots?:Array, layoutStructure?:any, interactions?:Array}} input
 * @returns {{headerSlots:Array, models:Array, stats:Object}}
 */
export function recoverHeaderSlotContract(input = {}) {
  const original = Array.isArray(input.headerSlots) ? input.headerSlots : [];
  const slots = original.map((s) => (isObj(s) ? { ...s } : s));
  const stats = {
    existing: original.length,
    recovered: 0,
    tabGroups: 0,
    tabItems: 0,
    skippedAmbiguous: 0,
    skippedNoEvidence: 0,
    // 🛡️ 2026-11-15 P0-2：兜底搬运被插槽资格判据拦下的条数（恒打，便于真机对账）。
    guardRejected: 0,
    hasTabSwitch: hasTabSwitch(input),
  };
  const models = [];
  const nodes = collectSectionNodes(input.layoutStructure);
  const figmaIndex = buildFigmaIndex(input.figmaNodeData);

  for (const { section, parentId } of nodes) {
    const tabs = tabItemsOf(section);
    if (tabs.length < 2) continue;
    const active = tabs.filter((t) => t.active === true);
    const inactive = tabs.filter((t) => t.active === false);
    if (active.length !== 1 || inactive.length === 0) {
      stats.skippedAmbiguous += 1;
      continue;
    }
    const candidate =
      String(section.slotCandidate || '').trim() === SLOT_HEADER_RIGHT ||
      String(section.headerRelation || '') === 'title-same-row' ||
      slots.some((s) => {
        if (!isHeaderRight(s)) return false;
        const ids = [s.figmaNodeId, s.sectionId, s.id].map(String);
        return ids.includes(String(section.id ?? '')) || ids.includes(String(parentId));
      });
    if (!candidate) {
      stats.skippedNoEvidence += 1;
      continue;
    }
    // 无 tab-switch 交互事实时仍需 active/inactive 样式差异作第二证据，防把静态标签当 tab。
    const activeStyle = appearanceOf(
      active[0].styles,
      active[0].id || active[0].figmaNode,
      figmaIndex,
    );
    const inactiveStyle = appearanceOf(
      inactive[0].styles,
      inactive[0].id || inactive[0].figmaNode,
      figmaIndex,
    );
    const hasAppearance =
      (activeStyle.backgroundColor || activeStyle.color) &&
      (inactiveStyle.backgroundColor || inactiveStyle.color);
    if (!stats.hasTabSwitch && !hasAppearance) {
      stats.skippedNoEvidence += 1;
      continue;
    }

    const nodeId = String(section.id ?? '');
    if (!nodeId) continue;
    const items = tabs.map((t) => ({
      id: String(t.id || t.figmaNode || t.text),
      text: String(t.text).trim(),
    }));
    if (new Set(items.map((i) => i.id)).size !== items.length) {
      stats.skippedAmbiguous += 1;
      continue;
    }
    const content = items.map((i) => i.text).join(' ');
    const model = {
      nodeId,
      sectionId: String(parentId || ''),
      items,
      activeId: String(active[0].id || active[0].figmaNode || active[0].text),
      activeStyle,
      inactiveStyle,
    };
    models.push(model);
    stats.tabGroups += 1;
    stats.tabItems += items.length;

    const hit = slots.find((s) => {
      if (!isHeaderRight(s)) return false;
      const ids = [s.figmaNodeId, s.sectionId, s.id].map(String);
      return ids.includes(nodeId) || ids.includes(String(parentId));
    });
    if (hit) {
      // 已有契约：补齐结构化证据，不改 slotType/content 语义（防影响既有prompt/去重）
      if (!hit.tabs) hit.tabs = items;
      if (!hit.tabNodeId) hit.tabNodeId = nodeId;
    } else {
      slots.push({
        slotType: SLOT_HEADER_RIGHT,
        elementType: 'tab',
        figmaNodeId: nodeId,
        sectionId: String(parentId || ''),
        content,
        tabs: items,
        tabNodeId: nodeId,
        _recoveredFrom: 'slotCandidate+tabChildren',
      });
      stats.recovered += 1;
    }
  }

  // 无结构化 tab 但有 header-right 文字契约断供时，从 layoutStructure.headerSlots 补回，
  // 让 T09 / 结构契约仍能拿到 figmaNodeId（不做文本臆造，只搬运既有真值）。
  //
  // 🛡️ 2026-11-15 P0-2（mc-max-1794717024986-bb0c260b 实锤）：兜底搬运必须过**同一**插槽
  //   资格判据。病灶：vision 把 body 首段 `88:32 '0sub-header'`（当日总流量标题行，
  //   380×30.4 + 24h 筛选控件）标成 slotCandidate=header-right；visual-parser 装配前的
  //   刀65-B 复核已撤销 `sections[0].slotCandidate`，但顶层 `layoutStructure.headerSlots`
  //   是**另一份独立数据**、仍留着同一条 ⇒ 本兜底无条件搬回 ⇒ 整段 ContentDailyTotalFlow
  //   被装进 38px 面板头，与主题开关重叠。
  //   判据单一事实源 = inline-header-slot-inferrer.js#evaluateSlotFlowCoResidency（与
  //   装配前复核同源），此处只消费；缺 Figma 真值时 verdict=no-evidence ⇒ 放行（原行为）。
  if (stats.recovered === 0 && !slots.some(isHeaderRight)) {
    const candidates = [];
    if (Array.isArray(input?.layoutStructure?.headerSlots)) {
      candidates.push(...input.layoutStructure.headerSlots);
    }
    const sectionIdSet = collectSectionIdSet(nodes.map((n) => n.section));
    for (const entry of candidates) {
      if (!isHeaderRight(entry)) continue;
      const anchorId = String(
        entry.sectionId ?? entry.figmaNodeId ?? entry.id ?? '',
      );
      const verdict = evaluateSlotFlowCoResidency(
        anchorId,
        sectionIdSet,
        input.figmaNodeData,
      );
      if (verdict.verdict === 'reject') {
        stats.guardRejected += 1;
        continue;
      }
      slots.push({ ...entry });
      stats.recovered += 1;
    }
  }

  return { headerSlots: slots, models, stats };
}

function identifierOf(nodeId) {
  const suffix = String(nodeId).replace(/[^A-Za-z0-9_$]/g, '_');
  return {
    tabs: `__mcHeaderTabs_${suffix}`,
    active: `__mcActiveHeaderTab_${suffix}`,
  };
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function buildTemplateBlock(model) {
  const { tabs, active } = identifierOf(model.nodeId);
  return [
    `      <template #${SLOT_HEADER_RIGHT}>`,
    `        <!-- 头部右侧交互 Tab：由 Figma tab 真值确定性提升（非 fake toggle） -->`,
    `        <div class="mc-header-tab-bar" data-mc-header-tab-node="${model.nodeId}">`,
    `          <button v-for="tab in ${tabs}" :key="tab.id" type="button"`,
    `            class="mc-header-tab"`,
    `            :class="{ 'mc-header-tab--active': ${active} === tab.id }"`,
    `            @click="${active} = tab.id">{{ tab.text }}</button>`,
    '        </div>',
    '      </template>',
    '',
  ].join('\n');
}

function buildScriptDeclarations(model) {
  const { tabs, active } = identifierOf(model.nodeId);
  return [
    `// 🛡️ header-right 交互 Tab（Figma 真值，@click 切换 active）`,
    `const ${tabs} = ${safeJson(model.items)}`,
    `const ${active} = ref(${safeJson(model.activeId)})`,
  ].join('\n');
}

function buildLessRules(model) {
  const a = model.activeStyle;
  const i = model.inactiveStyle;
  const common = model.activeStyle;
  return [
    '',
    '/* header-right 交互 Tab：尺寸走 less 由 postcss-pxtorem 转 rem，禁止 inline px */',
    '.mc-header-tab-bar { display: inline-flex; align-items: center; gap: 4px; margin-left: 8px; white-space: nowrap; }',
    `.mc-header-tab { display: inline-flex; align-items: center; justify-content: center; border: 0; cursor: pointer; font-family: inherit; line-height: 1; font-size: ${common.fontSize}; border-radius: ${common.borderRadius}; padding: ${common.padding}; height: ${common.height}; font-weight: ${i.fontWeight}; background: ${i.backgroundColor || 'transparent'}; color: ${i.color || 'inherit'}; }`,
    `.mc-header-tab--active { font-weight: ${a.fontWeight}; background: ${a.backgroundColor || 'transparent'}; color: ${a.color || 'inherit'}; }`,
  ].join('\n');
}

function ensureRefImport(code) {
  if (/\bref\b/.test(code.match(/<script\s+setup[^>]*>([\s\S]*?)<\/script>/i)?.[1] || '')) return code;
  const vueImportRe = /import\s*\{([^}]+)\}\s*from\s*(['"])vue\2/;
  if (vueImportRe.test(code)) {
    return code.replace(vueImportRe, (_all, names, quote) =>
      `import { ${names.trim()}, ref } from ${quote}vue${quote}`,
    );
  }
  return code.replace(/(<script\s+setup[^>]*>)/i, `$1\nimport { ref } from 'vue'`);
}

/** 移除 body 中与 header-right Tab 重复的静态组件（标签 + import + 组件文件）。
 *  双通道判据（都是已有真值，不猜）：
 *   ① tab 文本全命中且组件内无 @click ⇒ 静态重复（本次 TabsSection.vue 形态）；
 *   ② data-section-id 命中契约 nodeId（视觉把宿主段作为锚点的形态）。
 *  只有 index.vue 里真的移掉了标签，才删组件文件，避免制造孤儿/丢内容。
 */
function pruneDuplicateTabComponent(files, indexCode, model) {
  const stats = { removedTags: 0, removedImports: 0, removedFiles: 0 };
  let code = indexCode;
  const texts = model.items.map((i) => i.text).filter((t) => t.length >= 2);
  const idEsc = String(model.nodeId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const anchorRe = new RegExp(`data-section-id="${idEsc}"`);
  for (const [path, content] of Object.entries(files)) {
    if (!/\.vue$/i.test(path) || typeof content !== 'string') continue;
    if (path === 'package/index.vue' || path.endsWith('/index.vue')) continue;
    // 文件名带 tab 语义才认「文本全命中」通道，防误删恰好含同文案的业务组件。
    const byText =
      texts.length > 0 &&
      /tab/i.test(String(path).split('/').pop() || '') &&
      texts.every((t) => content.includes(t)) &&
      !/@click/.test(content);
    const byAnchor = anchorRe.test(content);
    if (!byText && !byAnchor) continue;
    const fileName = String(path).split('/').pop().replace(/\.vue$/i, '');
    const tagRe = new RegExp(
      `<${fileName}\\b[^>]*?\\/>|<${fileName}\\b[^>]*>[\\s\\S]*?<\\/${fileName}>`,
      'gi',
    );
    const before = code;
    code = code.replace(tagRe, '');
    if (code === before) continue;
    stats.removedTags += 1;
    const importRe = new RegExp(
      `^[ \\t]*import\\s+${fileName}\\s+from\\s+['"][^'"]+['"];?[ \\t]*\\r?\\n`,
      'im',
    );
    if (importRe.test(code)) {
      code = code.replace(importRe, '');
      stats.removedImports += 1;
    }
    delete files[path];
    stats.removedFiles += 1;
  }
  return { code, stats };
}

/**
 * 终写前确定性提升：把 header-right Tab 契约落为具名插槽 + 真实交互，并清理 body 重复。
 * 幂等：已有非兜底的 #header-right 内容 ⇒ 不覆盖；标识符/less 已存在 ⇒ 不重复声明。
 *
 * @param {Object} files 产物文件 map（本函数不修改入参）
 * @param {Object} input engineer 输入（layoutStructure/interactions/headerSlots）
 * @returns {{files:Object, stats:Object}}
 */
export function promoteHeaderRightTabs(files, input = {}) {
  const out = { ...files };
  const recovered = recoverHeaderSlotContract(input);
  const { models } = recovered;
  const stats = {
    models: models.length,
    injected: 0,
    skippedExistingSlot: 0,
    skippedNoIndex: 0,
    scriptInjected: 0,
    lessInjected: 0,
    removedTags: 0,
    removedImports: 0,
    removedFiles: 0,
    ...recovered.stats,
  };
  if (models.length === 0) return { files: out, stats };

  const idxPath =
    Object.keys(out).find((p) => p === 'package/index.vue') ||
    Object.keys(out).find((p) => p.endsWith('/index.vue'));
  if (!idxPath || typeof out[idxPath] !== 'string') {
    stats.skippedNoIndex = 1;
    return { files: out, stats };
  }
  let code = out[idxPath];
  if (!/<base-panel/i.test(code)) return { files: out, stats };

  for (const model of models.slice(0, 1)) {
    const existingRe = /([ \t]*)<template\s+#header-right\s*>([\s\S]*?)<\/template>\s*\n/i;
    const existing = existingRe.exec(code);
    const inner = existing ? existing[2].replace(/<!--[\s\S]*?-->/g, '').trim() : '';
    const isFallback =
      existing &&
      (existing[0].includes('确定性补齐') || existing[0].includes('确定性提升'));
    if (inner && !isFallback) {
      stats.skippedExistingSlot += 1;
      continue;
    }
    const block = buildTemplateBlock(model);
    if (existing) code = code.replace(existingRe, block);
    else code = code.replace(/(<base-panel[^>]*>\s*\n)/i, `$1${block}`);
    stats.injected += 1;

    const { tabs, active } = identifierOf(model.nodeId);
    let scriptChanged = false;
    let next = ensureRefImport(code);
    if (next !== code) scriptChanged = true;
    if (!new RegExp(`\\bconst\\s+${tabs}\\b`).test(next)) {
      next = next.replace(/<\/script>/i, `\n${buildScriptDeclarations(model)}\n</script>`);
      scriptChanged = true;
    }
    if (!new RegExp(`\\bconst\\s+${active}\\b`).test(next)) {
      next = next.replace(
        /<\/script>/i,
        `\nconst ${active} = ref(${safeJson(model.activeId)})\n</script>`,
      );
      scriptChanged = true;
    }
    if (scriptChanged) stats.scriptInjected += 1;
    code = next;

    if (!/\.mc-header-tab\b/.test(code)) {
      if (/<style[^>]*lang=["']less["'][^>]*>/i.test(code)) {
        code = code.replace(/<\/style>/i, `${buildLessRules(model)}\n</style>`);
      } else {
        code = code.replace(
          /(<\/template>)/i,
          `$1\n\n<style lang="less" scoped>\n${buildLessRules(model)}\n</style>`,
        );
      }
      stats.lessInjected += 1;
    }

    const pruned = pruneDuplicateTabComponent(out, code, model);
    code = pruned.code;
    stats.removedTags += pruned.stats.removedTags;
    stats.removedImports += pruned.stats.removedImports;
    stats.removedFiles += pruned.stats.removedFiles;
    out[idxPath] = code;
  }
  return { files: out, stats };
}

export default { recoverHeaderSlotContract, promoteHeaderRightTabs };
