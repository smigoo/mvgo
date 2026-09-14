/**
 * 🎯 2026-09-14 治本①②：section 内容映射守卫（验证优先，不自动重排/删除）。
 *
 * 两类真机实锤（c-traffic-monitor-29570c8e / 3147d679）：
 *   ① 左右镜像：inline-row（横向）section 的成员在产物模板中的 DOM 序与 Figma bbox.x 序相反
 *      —— 统计行「江阴大桥」渲染在左（设计稿隧道在左）、次行「24小时」渲染在左（设计稿标题在左）。
 *      注：TEXT-001 healer（code-healer.fixTextSiblingOrder）导出后从未被调用（死代码），
 *      且其范围（同父文本兄弟）也不覆盖「复合单元」级互换 → 本守卫补位。
 *   ② 跨组件内容错装：HeaderSection（顶栏）被装入次行 88:32 的「当日总流量+24小时」，
 *      与 ContentSubHeader 重复渲染。归属真值 = Figma 子树文本：
 *      文本只属于子树包含它的 section；若某文本唯一归属于 section X，却渲染在 ≥2 个组件文件
 *      → 错装/重复（如「当日总流量」只属 88:32，却出现在 HeaderSection.vue + ContentSubHeader.vue）。
 *      合法重复自动豁免：文本在多个 section 的子树中都存在（如图例「北京方向」同属两张图表）。
 *
 * 铁律：**验证优先于自愈**——不盲目重排 DOM（会与 CSS 左右专属样式打架）、不静默删文本；
 *       只产出可读 issues，由调用方决定留痕/BLOCK/重试。
 */
import { indexFigmaNodes } from './section-tree.js';

const MIN_SIG_LEN = 2; // 成员签名文本最小长度（如「24小时」=3）
const MIN_DUP_LEN = 4; // 重复检测文本最小长度（排除「24小时」类短共享词）

/** 由扁平索引重建 parentId → children[] 邻接表 */
function buildChildrenMap(index) {
  const childrenOf = new Map();
  for (const node of index.values()) {
    if (!node.parentId) continue;
    if (!childrenOf.has(node.parentId)) childrenOf.set(node.parentId, []);
    childrenOf.get(node.parentId).push(node.id);
  }
  return childrenOf;
}

/**
 * 归一化 Figma 文本节点名：剥掉单字母命名前缀（t-/d-/n-/v- 等）。
 * 真机实证：统计行成员子树文本名为 "t-江阴大桥"/"d-82,379"（t-=标题、d-=数据），
 * 不归一化则无法与产物模板里的裸文本「江阴大桥」匹配 → 漏判。
 */
function normalizeTextName(name) {
  return String(name || '').replace(/^[a-zA-Z]-/, '').trim();
}

/** 收集节点子树内所有文本（TEXT/CHARACTER 节点 name），返回 [{text, isTitle, x}] 去重数组（x=文本节点自身 bbox.x） */
function collectSubtreeTexts(nodeId, index, childrenOf) {
  const out = [];
  const seenKeys = new Set();
  const seen = new Set();
  const walk = (id) => {
    if (seen.has(id)) return;
    seen.add(id);
    const node = index.get(id);
    if (!node) return;
    if (node.type === 'TEXT' || node.type === 'CHARACTER') {
      const raw = String(node.name || '');
      const isTitle = /^[tT]-/.test(raw);
      const text = normalizeTextName(raw);
      const key = `${isTitle ? 't' : 'd'}:${text}`;
      if (text && !seenKeys.has(key)) {
        seenKeys.add(key);
        out.push({
          text,
          isTitle,
          x: typeof node.bbox?.x === 'number' ? node.bbox.x : null,
        });
      }
    }
    for (const c of childrenOf.get(id) || []) walk(c);
  };
  walk(nodeId);
  return out;
}

/**
 * 取成员视觉签名：优先「最独特」文本 —— 在组件文件中出现次数最少者（避免标题类文本
 * 跨 tabs/车型分布/预测多处重复导致的宿主文件歧义，如「江阴大桥」同现于 4 个组件）。
 * 同频时优先标题（t- 前缀），再取更长者。
 */
function signatureText(nodeId, index, childrenOf, vueFiles) {
  const items = collectSubtreeTexts(nodeId, index, childrenOf).filter(
    (i) => i.text.length >= MIN_SIG_LEN,
  );
  if (items.length === 0) return null;
  const scored = items
    .map((i) => ({
      ...i,
      hostCount: vueFiles.filter((f) => f.content.includes(i.text)).length,
    }))
    .filter((i) => i.hostCount >= 1); // 未在任何组件渲染的文本无法作为定位签名
  if (scored.length === 0) return null;
  scored.sort(
    (a, b) =>
      a.hostCount - b.hostCount || // 独特者优先
      (b.isTitle ? 1 : 0) - (a.isTitle ? 1 : 0) || // 标题优先
      b.text.length - a.text.length, // 更长者优先
  );
  return scored[0].text;
}

/** 递归收集 plan.effectiveSections 的所有 section */
function collectSections(sections, out = []) {
  for (const s of sections || []) {
    if (!s) continue;
    out.push(s);
    if (Array.isArray(s.children)) collectSections(s.children, out);
  }
  return out;
}

/**
 * 校验产物内容映射。
 *
 * @param {object} params
 * @param {Array<{path:string, content:string}>} params.files 产物文件（只分析 package/components/*.vue）
 * @param {object} params.plan subComponentPlan（含 effectiveSections）
 * @param {object} params.figmaRoot figmaNodeData（document 树）
 * @returns {{memberOrderIssues: Array, duplicateTextIssues: Array}}
 */
export function checkSectionContent({ files, plan, figmaRoot }) {
  const result = { memberOrderIssues: [], duplicateTextIssues: [] };
  if (!Array.isArray(files) || files.length === 0) return result;
  if (!plan || !Array.isArray(plan.effectiveSections)) return result;

  const index = indexFigmaNodes(figmaRoot);
  if (index.size === 0) return result;
  const childrenOf = buildChildrenMap(index);

  const vueFiles = files.filter(
    (f) =>
      typeof f?.path === 'string' &&
      /package\/components\/[^/]+\.vue$/.test(f.path) &&
      typeof f.content === 'string',
  );
  if (vueFiles.length === 0) return result;

  const sections = collectSections(plan.effectiveSections);

  // ── ① inline-row 成员序校验（DOM 序 must == Figma x 序）──
  for (const sec of sections) {
    if (sec?.body?.layout !== 'horizontal') continue;
    const ids = Array.isArray(sec.sourceNodeIds) ? sec.sourceNodeIds : [];
    const memberIds = ids.filter((id) => String(id) !== String(sec.id));
    if (memberIds.length < 2) continue;

    const entries = memberIds
      .map((id) => {
        const box = index.get(String(id))?.bbox;
        return {
          id: String(id),
          x: typeof box?.x === 'number' ? box.x : null,
          sig: signatureText(String(id), index, childrenOf, vueFiles),
        };
      })
      .filter((e) => e.x !== null && e.sig);
    if (entries.length < 2) continue;

    // 签名互为子串时跳过（indexOf 定位会互相污染，保守不判）
    const sigs = entries.map((e) => e.sig);
    if (sigs.some((a, i) => sigs.some((b, j) => i !== j && a.includes(b)))) continue;

    const expected = [...entries].sort((a, b) => a.x - b.x); // 视觉左→右
    const hostFiles = vueFiles.filter((f) =>
      expected.every((e) => f.content.includes(e.sig)),
    );
    if (hostFiles.length === 0) continue; // 找不到同载体的宿主文件 → 无法判定

    const allWrong = hostFiles.every((f) => {
      const idx = (e) => f.content.indexOf(e.sig);
      let prev = -1;
      for (const e of expected) {
        const cur = idx(e);
        if (cur < prev) return true; // 期望靠左者的文本反而在后面
        prev = cur;
      }
      return false;
    });
    if (allWrong) {
      result.memberOrderIssues.push({
        sectionId: sec.id,
        sectionTitle: sec.title || '',
        expectedLeftToRight: expected.map((e) => e.sig),
        hostFiles: hostFiles.map((f) => f.path),
      });
    }
  }

  // ── ② 唯一归属文本跨组件重复校验（Figma 子树 = 归属真值）──
  const textOwners = new Map(); // text -> Set(sectionId)
  const sectionTexts = new Map(); // sectionId -> Set(text)
  for (const sec of sections) {
    const ids = Array.isArray(sec.sourceNodeIds) ? sec.sourceNodeIds : [];
    const own = new Set();
    for (const id of ids) {
      for (const item of collectSubtreeTexts(String(id), index, childrenOf)) {
        const t = item.text;
        if (t.length < MIN_DUP_LEN) continue;
        own.add(t);
        if (!textOwners.has(t)) textOwners.set(t, new Set());
        textOwners.get(t).add(String(sec.id));
      }
    }
    sectionTexts.set(String(sec.id), own);
  }

  for (const [text, owners] of textOwners) {
    if (owners.size !== 1) continue; // 多 section 共有（图例类）→ 合法重复
    const ownerSection = [...owners][0];
    const hostFiles = vueFiles.filter((f) => f.content.includes(text));
    if (hostFiles.length >= 2) {
      result.duplicateTextIssues.push({
        text,
        ownerSection,
        renderedIn: hostFiles.map((f) => f.path),
        hint: `文本仅归属 section ${ownerSection}（Figma 子树真值），却被 ${hostFiles.length} 个组件渲染`,
      });
    }
  }

  return result;
}

/**
 * 🎯 2026-09-14 治本·阶段1：构建 per-section 内容归属契约（prompt 预防层）。
 *
 * 事实源 = Figma 子树文本 + bbox.x。给每个 section 列出「只属于它自己的文本 + 左右坐标」，
 * 注入 prompt 后从源头防两类 LLM 段错误：
 *   ① 左右镜像（横向 section 内成员按 x 排序的事实直接给到）；
 *   ② 借邻居内容（每个 section 只渲染自己子树内的文本）。
 * 与 checkSectionContent 共用同一套 normalize/collectSubtreeTexts 事实源（单点）。
 *
 * @param {object} plan subComponentPlan（含 effectiveSections）
 * @param {object} figmaRoot figmaNodeData（document 树）
 * @returns {Array<{id:string, title:string, direction:string, texts:Array<{text:string,x:number|null,isTitle:boolean}>}>}
 */
export function buildSectionContentContract(plan, figmaRoot) {
  const contract = [];
  if (!plan || !Array.isArray(plan.effectiveSections) || !figmaRoot) return contract;
  const index = indexFigmaNodes(figmaRoot);
  if (index.size === 0) return contract;
  const childrenOf = buildChildrenMap(index);

  const walk = (sections) => {
    for (const sec of sections || []) {
      if (!sec) continue;
      const ids = Array.isArray(sec.sourceNodeIds) ? sec.sourceNodeIds : [];
      const isHorizontal = sec.body?.layout === 'horizontal';

      if (isHorizontal) {
        // 🎯 横向 section：输出「成员级配对」——每个成员的标题↔数值成对 + 按 x 从左到右。
        // 实锤（2:3660 统计行）：LLM 不仅左右反，还把卡片 2 内部的标题/数值也写反；
        // 扁平文本列表治不了「配对错乱」，必须按成员配对给到。
        const memberIds = ids.filter((id) => String(id) !== String(sec.id));
        const members = memberIds
          .map((id) => {
            const items = collectSubtreeTexts(String(id), index, childrenOf);
            const title = items.find((i) => i.isTitle)?.text || null;
            const value = items.find((i) => !i.isTitle)?.text || null;
            const bbox = index.get(String(id))?.bbox;
            return {
              title,
              value,
              x: typeof bbox?.x === 'number' ? Math.round(bbox.x) : null,
            };
          })
          .filter((m) => m.title || m.value)
          .sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
        if (members.length > 0) {
          contract.push({
            id: String(sec.id),
            title: sec.title || '',
            direction: 'row',
            members,
          });
        }
      } else {
        const merged = new Map();
        for (const id of ids) {
          for (const item of collectSubtreeTexts(String(id), index, childrenOf)) {
            if (merged.has(item.text)) continue;
            merged.set(item.text, {
              text: item.text,
              x: item.x,
              isTitle: item.isTitle,
            });
          }
        }
        if (merged.size > 0) {
          contract.push({
            id: String(sec.id),
            title: sec.title || '',
            direction:
              sec.layoutMetadata?.direction ||
              (sec.body?.layout === 'horizontal' ? 'row' : 'column'),
            texts: [...merged.values()],
          });
        }
      }
      if (Array.isArray(sec.children)) walk(sec.children);
    }
  };
  walk(plan.effectiveSections);
  return contract;
}

export default checkSectionContent;
