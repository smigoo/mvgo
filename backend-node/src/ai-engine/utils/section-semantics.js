/**
 * 🛡️ Phase A-1（2026-10-31 治理方案）：section-semantics 结构语义归一层。
 *
 * 治理方案 §Phase A：同一语义只在一处识别；下游只读规范结论。
 * 单一来源布局：
 *  - `canonicalSectionType`：section 语义类型唯一入口（实现在 section-type-derive.js
 *    的 `deriveSectionType` 优先级链——显式 type > 表格契约 > id 前缀 > 关键词兜底；
 *    本模块薄壳出口，供下游统一 import 路径）；
 *  - `canonicalTableHeaders` / `canonicalHeaderRelation`：vision-facts 薄壳；
 *  - `canonicalListItem` / `canonicalItemStats`：列表项内容归一唯一实现
 *    （逐字迁自 folded-grid-section-takeover.js 的 normListItem 家族，含统计
 *    5+ 形态回退链；takeover 薄壳引用；collapser 轨只做纯文本拍平，
 *    唯一允许差异 = E1 几何优先，由 section-semantics.spec.ts 结构判据防回潮）；
 *  - `isBusinessContent`：header 兜底业务内容判据唯一实现
 *    （逐字迁自 header-geometry-fallback.js 内联闭包）。
 *
 * 迁移纪律：全部实现**逐字迁入**（零行为漂移由既有各刀 spec 全绿证明）；
 * 本模块不做任何新判定，只收拢。
 */
import {
  roleOf,
  ROLE_VALUE_SET,
  ROLE_LABEL_SET,
  isIconRole,
  isContentRole,
  isStatRole,
  BUSINESS_TYPE_SET,
  BUSINESS_ROLE_SET,
  declaredTableHeaders,
  declaredHeaderRelation,
} from './vision-facts.js';
import { deriveSectionType } from './section-type-derive.js';

// ── 薄壳出口：唯一实现放 vision-facts / section-type-derive ──────────────────
export const canonicalSectionType = deriveSectionType;
export const canonicalTableHeaders = declaredTableHeaders;
export const canonicalHeaderRelation = declaredHeaderRelation;

/** 单条文本真值归一：{ t, c, fs, fw }（缺样式即 null 字段，渲染端缺啥省啥） */
function normListText(el) {
  const t = String(el?.text ?? el?.characters ?? '').trim();
  if (!t) return null;
  const st = el?.styles || el?.style || {};
  // 字号真值兼容数值与 '16px' 字符串形态（vision 子树轨实测为字符串，刀 23）
  const fsNum =
    typeof st.fontSize === 'string' ? Number.parseFloat(st.fontSize) : Number(st.fontSize);
  return {
    t,
    c: st.color || null,
    fs: Number.isFinite(fsNum) ? fsNum : null,
    fw: st.fontWeight || null,
  };
}

/** 刀 23：children 子树轨递归收集文本节点（树序即 vision 阅读序）；装饰节点跳过。 */
function collectSubtreeTexts(node, out) {
  if (!node || typeof node !== 'object') return;
  const type = String(node.type || node.role || '').toLowerCase();
  if (type === 'decoration') return;
  const n = normListText(node);
  if (n) out.push(n);
  for (const c of Array.isArray(node.children) ? node.children : []) {
    collectSubtreeTexts(c, out);
  }
}

/** number + label/unit parts → 单项统计；多个数值属歧义，fail-open 不猜。 */
function normListPartsStat(entry) {
  if (!Array.isArray(entry?.parts)) return null;
  const numbers = entry.parts.filter((p) => String(p?.type || '').toLowerCase() === 'number');
  const label = entry.parts.find((p) => ['label', 'unit'].includes(String(p?.type || '').toLowerCase()));
  if (numbers.length !== 1) return null;
  const vn = normListText(numbers[0]);
  // 🛡️ 形态⑤'（mc-max-1793454777941-85ec897d 真机实锤）：parts 内仅 number、标签在
  //    顶层 unit 字符串/对象——旧读法只扫 parts 内部 ⇒ l="" ⇒ 「在线/离线」全丢。
  //    补位规则：parts 内 label/unit 节点优先（就近事实），顶层 unit 仅在缺位时补
  //    （字符串直取；对象走 normListText 带 styles）。与刀26 兜底 `s?.label ?? s?.unit`
  //    同一口径，非新语义。
  let ln = label ? normListText(label) : null;
  if (!ln && entry.unit != null) {
    ln = typeof entry.unit === 'object' ? normListText(entry.unit) : normListText({ text: entry.unit });
  }
  if (!vn) return null;
  return {
    v: vn.t, l: ln ? ln.t : '', vc: vn.c, vfs: vn.fs, vfw: vn.fw,
    lc: ln ? ln.c : null, lfs: ln ? ln.fs : null,
  };
}

/**
 * valueGroup.elements 的成对统计轨：value + label/unit 相邻成组。
 * 任一位置不成对即整组 fail-open，避免把两组数值/标签交叉错配。
 */
function normListValueGroupStats(group) {
  const els = Array.isArray(group?.elements) ? group.elements : [];
  if (els.length === 0 || els.length % 2 !== 0) return [];
  const out = [];
  for (let i = 0; i < els.length; i += 2) {
    const value = els[i];
    const label = els[i + 1];
    if (roleOf(value) !== 'value' || !['label', 'unit'].includes(roleOf(label))) return [];
    const vn = normListText(value);
    const ln = normListText(label);
    if (!vn || !ln) return [];
    out.push({
      v: vn.t,
      l: ln.t,
      vc: vn.c,
      vfs: vn.fs,
      vfw: vn.fw,
      lc: ln.c,
      lfs: ln.fs,
    });
  }
  return out;
}

/** 单项归一：{ texts, stats, icon:{file,w,h}, fill } */
export function canonicalListItem(it) {
  const texts = [];
  const contentStats = [];
  const els = Array.isArray(it?.content?.elements)
    ? it.content.elements
    : Array.isArray(it?.texts)
      ? it.texts
      : Array.isArray(it?.textRuns)
        ? it.textRuns
        : [];
  for (const el of els) {
    // 🛡️ parts 形态：value 容器自身无 text，数值/标签在 parts 的角色节点中。
    if (Array.isArray(el?.parts)) {
      const stat = normListPartsStat(el);
      if (stat) contentStats.push(stat);
      continue;
    }
    const n = normListText(el);
    if (n) texts.push(n);
  }
  // 🛡️ 刀 28a（mc-max-1793252160457-54ae6ee3 实锤）：children 子树**角色结构轨**——
  //   vision 把卡内分区标成 role：icon（自带 resourceFile/width/height）/
  //   content（label 文本对）/ stat-value（value+label 子节点）。旧实现用
  //   collectSubtreeTexts 把全部后代文本拍平 ⇒ 统计值/标签混进 texts 纵堆、
  //   stats=0、icon 节点自带 resourceFile 不读 ⇒ null ⇒ 卡内布局全失效
  //   （6 行文本堆进 72px 卡高溢出叠字）。按 role 分区提取：texts 只收
  //   content 子树；stats 收 stat-value 子树的 value/label（带各自 styles）；
  //   icon 读子树 icon 节点自带资源事实。无任何角色结构 ⇒ 回退刀 23 拍平轨
  //   （b2086a9c 形态：伪造 id + 无 role，保持不破）。
  let roleStats = null;
  let roleIcon = null;
  if (Array.isArray(it?.children)) {
    const contentTexts = [];
    const statsTmp = [];
    for (const child of it.children) {
      if (!child || typeof child !== 'object') continue;
      const r = roleOf(child);
      // 🛡️ 刀31c：role 归一词表 + 资源事实兜底（child 自带 resourceFile ⇒ icon，
      //   与 28a 读法同口径；词表未覆盖但带资源事实的 icon 不再静默落空）。
      if (isIconRole(r) || (child.resourceFile || child.resource)) {
        const res = String(child?.resourceFile || child?.resource || '');
        const file = res.split('/').pop();
        if (file && !roleIcon) {
          roleIcon = {
            file,
            w: Number.isFinite(Number(child.width)) ? Number(child.width) : null,
            h: Number.isFinite(Number(child.height)) ? Number(child.height) : null,
          };
        }
      } else if (isContentRole(r)) {
        collectSubtreeTexts(child, contentTexts);
      } else if (isStatRole(r)) {
        let v = null;
        let l = null;
        for (const d of Array.isArray(child.children) ? child.children : []) {
          const dr = roleOf(d);
          if (ROLE_VALUE_SET.has(dr) && !v) v = d;
          else if (ROLE_LABEL_SET.has(dr) && !l) l = d;
        }
        const vn = v && normListText(v);
        if (vn) {
          const ln = l && normListText(l);
          statsTmp.push({
            v: vn.t,
            l: ln ? ln.t : '',
            vc: vn.c,
            vfs: vn.fs,
            vfw: vn.fw,
            lc: ln ? ln.c : null,
            lfs: ln ? ln.fs : null,
          });
        }
      }
    }
    if (contentTexts.length > 0 || statsTmp.length > 0) {
      texts.push(...contentTexts);
      roleStats = statsTmp;
    }
  }
  // 🛡️ 刀 23（b2086a9c 实锤）：children 子树轨——卡内容是嵌套子树
  //   （bg/icon/常驻组 → text 叶），无 content.elements/texts/textRuns。
  if (texts.length === 0 && Array.isArray(it?.children)) {
    collectSubtreeTexts(it, texts);
  }
  const stats = [];
  // 🛡️ 刀 21b（mc-max-1793181937804-3e301cdb 实锤）：vision 另一种 stat 形态——
  //   对象映射 `stat: { online: {value, unit, styles}, offline: {...} }`（非数组）。
  //   label 取 unit 真值（「在线」/「离线」），缺 unit 不留 label，绝不拿键名
  //   （英文语义名）冒充文案。键序即 vision 给出的事实顺序。
  const directPartsStats = [it?.value, it?.offline].filter((s) => Array.isArray(s?.parts));
  // 🛡️ 769789af（mc-max-1793431342807 实锤）：value **容器**形态——成对数值收在
  //   it.value.elements[]，每项 {type:'value', parts:[number,unit]}。旧回退链对
  //   value 容器走 Object.values ⇒ ['horizontal','right',elementsArray] 垃圾条目
  //   静默跳过 ⇒ stats 全空 ⇒ 每张卡的在线/离线整列丢失。容器判据：value 自带
  //   elements 数组 ⇒ 逐项走 normListPartsStat（与 content.elements.parts 同口径）。
  const valueContainerElements = Array.isArray(it?.value?.elements)
    ? it.value.elements
    : null;
  // 容器轨严格只认 parts 项：元素声明为 value 组，缺 parts 即残缺组，
  // 不得落入刀26 的 text 兜底被当成单文本 stat（宁跳过不编造）。
  let statEntriesStrictParts = false;
  let statEntries;
  if (Array.isArray(it?.stats)) {
    statEntries = it.stats;
  } else if (it?.stat && typeof it.stat === 'object') {
    statEntries = Object.values(it.stat);
  } else if (directPartsStats.length > 0) {
    statEntries = directPartsStats;
  } else if (valueContainerElements) {
    statEntries = valueContainerElements;
    statEntriesStrictParts = true;
  } else if (it?.value && typeof it.value === 'object') {
    statEntries = Object.values(it.value);
  } else {
    statEntries = [];
  }
  // 显式 stats/stat 优先；缺失时才消费 content.elements.parts / children 角色轨，杜绝双份。
  if (statEntries.length === 0 && contentStats.length > 0) stats.push(...contentStats);
  // 🛡️ 刀 28a：角色结构轨的 stats 并入（与 it.stats/it.stat 形态互斥——
  //   有显式 stats 字段时角色轨不重复；角色轨无 stats 时保持空数组）。
  if (stats.length === 0 && Array.isArray(roleStats) && roleStats.length > 0) {
    stats.push(...roleStats);
  }
  // valueGroup 是独立右值区，不属于 content.elements；仅在其它显式统计轨为空时消费。
  if (stats.length === 0 && statEntries.length === 0) {
    stats.push(...normListValueGroupStats(it?.valueGroup));
  }
  for (const s of statEntries) {
    // 顶层 value.parts + offline.parts 与 content.elements.parts 共用同一归一，
    // 保证数值、标签及样式口径一致；显式 stats/stat 仍优先，绝不双份追加。
    if (Array.isArray(s?.parts)) {
      const stat = normListPartsStat(s);
      if (stat) stats.push(stat);
      continue;
    }
    // 🛡️ 769789af：容器轨残缺组（声明 value 组但无 parts）⇒ 跳过，不走 text 兜底。
    if (statEntriesStrictParts) continue;
    // 🛡️ 刀 26（mc-max-1793191766917-329a3781 实锤）：vision 富卡第三种 stat
    //   形态——`stats: [{label:'在线', text:'3,792', styles:{...}}]`（值字段是
    //   `text` 而非 `value`）。缺这一读法 ⇒ 富卡归一 stats=0 条 ⇒ 「更全者胜出」
    //   比分 2 < 子树扁平轨 6 ⇒ 富卡（含样式/icon/fill）被劣轨顶掉。value/text
    //   同为数值真值字段，零语义猜测。
    const v = String(s?.value ?? s?.text ?? '').trim();
    if (!v) continue;
    const st = s?.styles || {};
    const unitRun = s?.unit && typeof s.unit === 'object' ? normListText(s.unit) : null;
    stats.push({
      v,
      l: unitRun ? unitRun.t : String(s?.label ?? s?.unit ?? '').trim(),
      vc: st.color || null,
      vfs: Number.isFinite(Number(st.fontSize)) ? Number(st.fontSize) : null,
      vfw: st.fontWeight || null,
      lc: unitRun ? unitRun.c : s?.labelStyles?.color || null,
      lfs: unitRun
        ? unitRun.fs
        : Number.isFinite(Number(s?.labelStyles?.fontSize))
          ? Number(s.labelStyles.fontSize)
          : null,
    });
  }
  let icon = null;
  // 🛡️ 刀 28a：子树 icon 节点自带 resourceFile 是最直接事实，优先于
  //   resourceMapping 反查（mapping 缺该节点 id 时不再丢 icon）。
  if (roleIcon) icon = roleIcon;
  if (it?.icon && typeof it.icon === 'object') {
    const res = String(it.icon.resource || it.icon.resourceFile || '');
    const file = res.split('/').pop();
    if (file) {
      icon = {
        file,
        w: Number.isFinite(Number(it.icon.width)) ? Number(it.icon.width) : null,
        h: Number.isFinite(Number(it.icon.height)) ? Number(it.icon.height) : null,
      };
    }
  }
  return { texts, stats, icon, fill: it?.repeatedFill || null };
}

/** 派生访问器：只要统计结论、不要整卡归一（避免下游复制回退链）。 */
export function canonicalItemStats(it) {
  return canonicalListItem(it).stats;
}

/**
 * header 兜底业务内容判据（逐字迁自 header-geometry-fallback.js 内联闭包）：
 * 顶层 type/role 命中业务词表，或 children/items/body 递归任一后代命中。
 * value 角色元素不在本口径（另有 vision-facts#hasStatValueElement 第二闸门）。
 */
export function isBusinessContent(node) {
  if (!node || typeof node !== 'object') return false;
  if (BUSINESS_TYPE_SET.has(String(node.type || '').toLowerCase())) return true;
  if (BUSINESS_ROLE_SET.has(String(node.role || '').toLowerCase())) return true;
  for (const child of [...(node.children || []), ...(node.items || [])]) {
    if (isBusinessContent(child)) return true;
  }
  if (node.body && typeof node.body === 'object' && isBusinessContent(node.body)) return true;
  return false;
}
