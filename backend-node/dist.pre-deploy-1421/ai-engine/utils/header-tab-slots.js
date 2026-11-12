/**
 * 🛡️ 2026-11-06 案①：headerSlots 中的结构化 tab 模型与确定性渲染。
 *
 * 顶层 headerSlots 可能只剩 label/content 文本，但 section.headerSlots 对同一
 * figmaNodeId 保留了 elementType='tab'，section.body.children 还含逐项 active/styles。
 * 本模块只消费这些结构事实：不用文本相似度、不解析“（激活）/”、不猜默认选中项。
 */
import { extractSections } from './figma-format.js';

const STYLE_KEY_MAP = Object.freeze({
  color: 'color',
  backgroundColor: 'backgroundColor',
  'background-color': 'backgroundColor',
  borderRadius: 'borderRadius',
  'border-radius': 'borderRadius',
  padding: 'padding',
  fontSize: 'fontSize',
  'font-size': 'fontSize',
  fontWeight: 'fontWeight',
  'font-weight': 'fontWeight',
});

function appearanceStyle(styles) {
  const out = {};
  if (!styles || typeof styles !== 'object') return out;
  for (const [rawKey, targetKey] of Object.entries(STYLE_KEY_MAP)) {
    const value = styles[rawKey];
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    if (String(value).trim() === '') continue;
    if (targetKey === 'fontSize' && typeof value === 'number') {
      out[targetKey] = `${value}px`;
    } else {
      out[targetKey] = value;
    }
  }
  return out;
}

function hasAppearance(style) {
  return style && typeof style === 'object' && Object.keys(style).length > 0;
}

function interactionsOf(input) {
  const direct = Array.isArray(input?.interactions) ? input.interactions : [];
  const nested = Array.isArray(input?.layoutStructure?.interactions)
    ? input.layoutStructure.interactions
    : [];
  return [...direct, ...nested];
}

/**
 * @returns {{byNodeId:Map<string,object>,stats:{evaluated:number,resolved:number,skippedNoStructure:number,skippedAmbiguous:number}}}
 */
export function resolveHeaderTabModels(input) {
  const byNodeId = new Map();
  const stats = { evaluated: 0, resolved: 0, skippedNoStructure: 0, skippedAmbiguous: 0 };
  const hasTabSwitch = interactionsOf(input).some((i) => i?.type === 'tab-switch');
  if (!hasTabSwitch) return { byNodeId, stats };

  const sections = extractSections(input?.layoutStructure);
  for (const section of sections) {
    const slots = Array.isArray(section?.headerSlots) ? section.headerSlots : [];
    for (const slot of slots) {
      if (String(slot?.elementType || '').toLowerCase() !== 'tab') continue;
      stats.evaluated += 1;
      const nodeId = String(slot?.figmaNodeId || '').trim();
      if (!nodeId) {
        stats.skippedNoStructure += 1;
        continue;
      }
      const children = Array.isArray(section?.body?.children) ? section.body.children : [];
      const candidates = children.filter(
        (item) => String(item?.type || item?.role || '').toLowerCase() === 'tab',
      );
      const valid = candidates.length >= 2 && candidates.every((item) => {
        return String(item?.id || '').trim() && String(item?.text || '').trim();
      });
      const ids = new Set(candidates.map((item) => String(item.id)));
      if (!valid || ids.size !== candidates.length) {
        stats.skippedNoStructure += 1;
        continue;
      }
      const activeItems = candidates.filter((item) => item.active === true);
      const inactiveItems = candidates.filter((item) => item.active === false);
      if (activeItems.length !== 1 || inactiveItems.length === 0) {
        stats.skippedAmbiguous += 1;
        continue;
      }
      const activeStyle = appearanceStyle(activeItems[0].styles);
      const defaultInactiveStyle = appearanceStyle(inactiveItems[0].styles);
      if (!hasAppearance(activeStyle) || !hasAppearance(defaultInactiveStyle)) {
        stats.skippedAmbiguous += 1;
        continue;
      }
      if (byNodeId.has(nodeId)) {
        stats.skippedAmbiguous += 1;
        continue;
      }
      const items = candidates.map((item) => ({
        id: String(item.id),
        text: String(item.text),
        inactiveStyle: item.active === true
          ? defaultInactiveStyle
          : appearanceStyle(item.styles),
      }));
      byNodeId.set(nodeId, {
        nodeId,
        items,
        activeId: String(activeItems[0].id),
        activeStyle,
        inactiveStyle: defaultInactiveStyle,
      });
      stats.resolved += 1;
    }
  }
  return { byNodeId, stats };
}

function identifiers(nodeId) {
  const suffix = String(nodeId).replace(/[^A-Za-z0-9_$]/g, '_');
  return {
    tabs: `__mcHeaderTabs_${suffix}`,
    active: `__mcActiveHeaderTab_${suffix}`,
    style: `__mcHeaderTabStyle_${suffix}`,
  };
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function renderHeaderTabTemplate(model) {
  const { tabs, active, style } = identifiers(model.nodeId);
  return [
    '<div style="display:inline-flex;align-items:center;gap:4px;margin-left:16px;line-height:1;white-space:nowrap;">',
    `  <button v-for="tab in ${tabs}" :key="tab.id" type="button" :style="${style}(tab)" @click="${active} = tab.id">{{ tab.text }}</button>`,
    '</div>',
  ].join('\n');
}

export function renderHeaderTabScript(model) {
  const { tabs, active, style } = identifiers(model.nodeId);
  const items = model.items.map((item) => ({
    id: item.id,
    text: item.text,
    activeStyle: model.activeStyle,
    inactiveStyle: item.inactiveStyle || model.inactiveStyle,
  }));
  return [
    `const ${tabs} = ${safeJson(items)}`,
    `const ${active} = ref(${safeJson(model.activeId)})`,
    `const ${style} = (tab) => ({`,
    "  display: 'inline-flex',",
    "  alignItems: 'center',",
    "  justifyContent: 'center',",
    "  border: '0',",
    "  cursor: 'pointer',",
    "  whiteSpace: 'nowrap',",
    "  fontFamily: 'inherit',",
    `  ...(tab.id === ${active}.value ? tab.activeStyle : tab.inactiveStyle),`,
    '})',
  ].join('\n');
}
