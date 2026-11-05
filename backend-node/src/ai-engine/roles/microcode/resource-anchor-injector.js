/**
 * 🛡️ α3（2026-11-05 · `c-env-monitor-c324a730` 实锤）：资源宿主锚点补标——单一来源。
 *
 * ## 病灶（刀A β 的另一半根因）
 * 折叠段接管把内层节点（如 `2:7889` Tab列表）的 DOM 折进父组件（`MainSection.vue`）后，
 * 产物里**没有** `data-section-id="2:7889"` ⇒ `resolveSectionAnchor` 在
 * `[owner, ...ancestorIds]` 里找不到产物锚点，β 的几何共位判据只能 fail-closed
 * ⇒ 背景从「错挂段根」变成「不挂」。用户要的是**挂对**，不是只拦错。
 *
 * ## 治本
 * 按「section 树父子结构 ↔ 模板 DOM 父子结构」**结构对位**，给内层宿主补
 * **专用属性 `data-resource-anchor="<id>"`**，让既有事实链（`findTagBySectionAnchor`
 * 次优先级识别）精确挂载。
 *
 * 🔴 红线（`code-generator.js:776-779` 既有不变量）：**绝不复用 `data-section-id`**——
 *   它是资源挂载锚 + 评分选择器，25+ 消费文件（healer / code-validator / section-content-guard
 *   / plan-orphan-guard…）多处依赖「一个文件恰好 1 个不同 data-section-id」，同名会双命中。
 *   `data-absorbed-host`（`code-generator.js:782`）是同构先例：专用标注属性、自产自销。
 *
 * ## 判据（三条同时满足才补，任一不满足 fail-open 不补）
 *   ① owner 的最近产物锚点祖先能唯一命中（沿 `data-section-id` 上溯）；
 *   ② 每层下探时 section 子节点数 === 元素子节点数（防 v-for/wrapper 错位）；
 *   ③ 语义弱校验（**仅落笔层**）：目标节点 name/role 词集与元素 class 词集有交集
 *      （防 LLM 交换同级子元素顺序——数量相等但对位全错）。
 *      中间层不做：真机实证 `89:42`(tabs) 对 `.c-env-monitor-sub-t` 词集零交集，
 *      中间层校验会把正解误杀。
 *
 * ## 幂等
 * 属性已存在（或该 id 已有任意锚点）⇒ 跳过；重跑 / 缓存补跑安全。
 *
 * 纯函数（内存改 `allFiles`，不落盘）、无 import.meta，可单测。
 */
import {
  parseTemplateElementTree,
  findElementByAttr,
  classTokensOf,
  tokenizeWords,
} from '../../utils/template-element-tree.js';

/**
 * section 树的子节点统一读取：vision 形态里根段是 `body.children`，
 * 内层节点是 `children`。两者并存时优先 `body.children`（根段语义）。
 */
function kidsOf(node) {
  if (!node || typeof node !== 'object') return [];
  const b = node.body;
  if (b && Array.isArray(b.children) && b.children.length > 0) return b.children;
  return Array.isArray(node.children) ? node.children : [];
}

/** 对位节点的语义词集（name + role） */
function semanticTokensOf(node) {
  return new Set([...tokenizeWords(node?.name), ...tokenizeWords(node?.role)]);
}

/** 语义弱校验：节点词集与元素 class 词集必须相交；节点零词 ⇒ 不可验证 ⇒ 拒绝 */
function semanticOk(node, el) {
  const a = semanticTokensOf(node);
  if (a.size === 0) return false;
  const b = classTokensOf(el);
  for (const t of a) if (b.has(t)) return true;
  return false;
}

/**
 * @param {Object} allFiles 产物文件表（path → content），**会被就地修改**
 * @param {Array} effectiveSections 批次 1 锚定后的 sections
 * @param {Array} resourceDomMapping 资源映射
 * @returns {{injected:number, skippedAnchored:number, skippedCountMismatch:number,
 *            skippedSemanticMiss:number, skippedNoRoot:number}}
 */
export function injectResourceAnchors(
  allFiles,
  effectiveSections,
  resourceDomMapping,
) {
  const stats = {
    injected: 0,
    skippedAnchored: 0,
    skippedCountMismatch: 0,
    skippedSemanticMiss: 0,
    skippedNoRoot: 0,
  };
  if (
    !allFiles ||
    typeof allFiles !== 'object' ||
    !Array.isArray(resourceDomMapping)
  ) {
    return stats;
  }
  const sections = Array.isArray(effectiveSections) ? effectiveSections : [];

  // ① 候选 = bg 资源的 ownerSectionId（🔴 仅 bg：图标真值盒天然小、不走 background-size 拉伸，
  //    且 bgRole=sub-state 有独立挂载原语（mountSubStateBackground / B′ 方案），不在此域）
  const owners = new Set();
  for (const m of resourceDomMapping) {
    if (!m || typeof m !== 'object') continue;
    if ((m.previewAnalysisRole || '') !== 'bg') continue;
    if (m.downloadStatus !== 'success') continue;
    const oid = m.ownerSectionId != null ? String(m.ownerSectionId) : '';
    if (oid) owners.add(oid);
  }
  if (owners.size === 0) return stats;

  // ② 已有锚点（两种属性都算，幂等判据）
  const anchored = new Set();
  for (const c of Object.values(allFiles)) {
    if (typeof c !== 'string') continue;
    for (const mm of c.matchAll(/data-(?:section-id|resource-anchor)="([^"]+)"/g)) {
      anchored.add(mm[1]);
    }
  }

  // ③ section 树索引（首见为准，不覆盖）
  const nodeById = new Map();
  const parentOf = new Map();
  const walkNode = (node, parent) => {
    if (!node || typeof node !== 'object' || node.id == null) return;
    const id = String(node.id);
    if (!nodeById.has(id)) {
      nodeById.set(id, node);
      parentOf.set(id, parent);
    }
    for (const c of kidsOf(node)) walkNode(c, id);
  };
  for (const s of sections) walkNode(s, null);

  const findFileWithSectionAnchor = (sid) => {
    const needle = `data-section-id="${sid}"`;
    for (const [fp, c] of Object.entries(allFiles)) {
      if (typeof c === 'string' && c.includes(needle)) return fp;
    }
    return null;
  };

  // 编辑缓冲：tpl 内偏移，最后统一回写（倒序插入防偏移失效）
  const edits = [];

  for (const oid of owners) {
    if (anchored.has(oid)) {
      stats.skippedAnchored += 1;
      continue;
    }
    if (!nodeById.has(oid)) {
      stats.skippedNoRoot += 1;
      continue;
    }

    // ④ 最近产物锚点祖先（沿 section 树上溯，找 `data-section-id`）
    let rootId = parentOf.get(oid) || null;
    let rootFile = null;
    while (rootId) {
      rootFile = findFileWithSectionAnchor(rootId);
      if (rootFile) break;
      rootId = parentOf.get(rootId) || null;
    }
    if (!rootId || !rootFile) {
      stats.skippedNoRoot += 1;
      continue;
    }

    // ⑤ 根锚 → 目标 的后代路径
    const path = [];
    let up = oid;
    let guard = 0;
    while (up && up !== rootId && guard < 32) {
      path.unshift(up);
      up = parentOf.get(up) || null;
      guard += 1;
    }
    if (up !== rootId || path.length === 0) {
      stats.skippedNoRoot += 1;
      continue;
    }

    // ⑥ 该文件模板里解析元素树，逐层对位下探。
    const content = allFiles[rootFile];
    //    🔴 不能用 extractSfcTemplateRegion 做解析载体：它会剥 HTML 注释
    //    （sfc-template-extractor.js:32 `replace(/<!--[\s\S]*?-->/g,'')`），返回值
    //    不再是原文子串 ⇒ 解析坐标无法映射回原文（真机 chunk 含注释，indexOf 必 -1，
    //    端到端实测「injected=1 但文件零改动」假绿）。此处用**同一边界口径**、保留原文。
    const tplStartM = /<template\b[^>]*>/i.exec(content);
    if (!tplStartM) {
      stats.skippedNoRoot += 1;
      continue;
    }
    const tplStart = tplStartM.index;
    const restFromTpl = content.slice(tplStart);
    const tplEndM = /<script[\s>]|<style[\s>]/i.exec(restFromTpl);
    const tplEnd =
      tplEndM && tplEndM.index > 0 ? tplStart + tplEndM.index : content.length;
    const tpl = content.slice(tplStart, tplEnd);
    const tree = parseTemplateElementTree(tpl);
    let el = findElementByAttr(tree, 'data-section-id', rootId);
    if (!el) {
      stats.skippedNoRoot += 1;
      continue;
    }

    let stamped = false;
    for (const stepId of path) {
      const stepNode = nodeById.get(stepId);
      const parentSectionNode = nodeById.get(
        stepId === path[0] ? rootId : path[path.indexOf(stepId) - 1],
      );
      const kids = kidsOf(parentSectionNode);
      const elKids = el.children || [];
      const idx = kids.findIndex((k) => String(k?.id) === stepId);
      // 判据②：数量必须相等（不等 ⇒ 该层结构不可信，弃权）
      if (idx < 0 || kids.length === 0 || elKids.length !== kids.length) {
        stats.skippedCountMismatch += 1;
        break;
      }
      const childEl = elKids[idx];
      if (!childEl) {
        stats.skippedCountMismatch += 1;
        break;
      }
      // 判据③：语义弱校验——**只在落笔层做**。
      //   中间层不可做（真机实证）：`89:42`(name=Tab切换栏/role=tabs) 对
      //   `.c-env-monitor-sub-t` 词集零交集（sub/t ≠ tab），中间层校验会把正解误杀。
      //   落笔层校验足以防「同级子元素被 LLM 交换顺序」：数量相等但对位错时，
      //   目标节点的 role/name（如 tab-list）与错位元素 class 大概率零交集。
      if (stepId === oid) {
        if (!semanticOk(stepNode, childEl)) {
          stats.skippedSemanticMiss += 1;
          break;
        }
        // 落笔：开标签 `>` 前插入专用属性（自闭合 `/>` 同样正确）
        edits.push({
          file: rootFile,
          tpl,
          tplStart,
          pos: childEl.openEnd - 1,
          text: ` data-resource-anchor="${oid}"`,
        });
        anchored.add(oid);
        stats.injected += 1;
        stamped = true;
        break;
      }
      el = childEl;
    }
  }

  // ⑦ 统一回写：按 (file,tpl) 分组、tpl 内倒序插入，再按 tplStart 原位拼回
  //    （tpl 与原文坐标同源，见 ⑥ 的边界口径说明；不再用 indexOf 反查）
  const byFileTpl = new Map();
  for (const e of edits) {
    const key = `${e.file}\u0000${e.tplStart}\u0000${e.tpl.length}`;
    if (!byFileTpl.has(key)) byFileTpl.set(key, []);
    byFileTpl.get(key).push(e);
  }
  for (const [, group] of byFileTpl) {
    const { file, tpl, tplStart } = group[0];
    const content = allFiles[file];
    if (typeof content !== 'string') continue;
    let patched = tpl;
    for (const e of group.sort((a, b) => b.pos - a.pos)) {
      patched = patched.slice(0, e.pos) + e.text + patched.slice(e.pos);
    }
    allFiles[file] =
      content.slice(0, tplStart) + patched + content.slice(tplStart + tpl.length);
  }

  return stats;
}

export default injectResourceAnchors;
