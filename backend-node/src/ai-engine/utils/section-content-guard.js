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
import {
  buildChildrenMap,
  collectSubtreeTexts,
  indexFigmaNodes,
  assignSectionComponentNames,
} from './section-tree.js';
import { assessStatRowConfidence } from './inline-row-assembler.js';
import { extractRenderedText } from './text-truth-guard.js';

const MIN_SIG_LEN = 2; // 成员签名文本最小长度（如「24小时」=3）
const MIN_DUP_LEN = 4; // 重复检测文本最小长度（排除「24小时」类短共享词）


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
      hostCount: vueFiles.filter((f) => f.renderedText.includes(i.text)).length,
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

  const vueFiles = files
    .filter(
      (f) =>
        typeof f?.path === 'string' &&
        /package\/components\/[^/]+\.vue$/.test(f.path) &&
        typeof f.content === 'string',
    )
    .map((f) => ({
      ...f,
      // 🛡️ R5-dup：预提取「渲染文本」（剥离 HTML 注释/标签/插值），供下方 includes 判定。
      // 裸 f.content.includes(text) 会把注释（`<!-- 当日总流量区域背景 -->`）误判为渲染 → 假阳性。
      renderedText: extractRenderedText(f.content),
    }));
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
      expected.every((e) => f.renderedText.includes(e.sig)),
    );
    if (hostFiles.length === 0) continue; // 找不到同载体的宿主文件 → 无法判定

    const allWrong = hostFiles.every((f) => {
      // 🛡️ 2026-09-15（真机 mc-1789464855419 实锤）：序判定必须用 renderedText（剥离标签后），
      //   与宿主判定同口径。旧实现用 `f.content.indexOf(e.sig)`（原始文本），而 sig 是归一化后
      //   的纯文本（如「南北接线设备」），产物里却是「南北接线<br/>设备」（被 <br/> 断开）
      //   → indexOf 返回 -1 → 被误判为「序反」（假阳性）。两处口径不一致是根因。
      const idx = (e) => f.renderedText.indexOf(e.sig);
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
    const hostFiles = vueFiles.filter((f) => f.renderedText.includes(text));
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
 * 🛡️ 阶段 C（2026-09-15 · 序 5）：内容守卫分级——高置信自愈。
 *
 * 从 checkSectionContent 的 duplicateTextIssues 里挑「高置信」条目做确定性自愈：
 *   · 唯一归属文本（Figma 子树真值）却渲染在 ≥2 组件 → 从**非 owner 组件**删除该文本的
 *     模板静态文本节点（如 `<span>24小时</span>`）。
 *   · owner 组件 = ownerSection 经 assignSectionComponentNames 得到的组件名；
 *     renderedIn 里除 owner 组件外的其余文件 = 错装文件。
 *
 * 铁律（与 checkSectionContent 一致，验证优先于自愈）：
 *   - 只在「模板里找到该文本的**独立静态文本节点**」时删除（`>…text…<` 且无其它语义文本），
 *     绝不裸 split/join 字符串（会误删 script 数据字段、chart 配置、注释）。
 *   - owner 组件不在 renderedIn 里（无法确定谁是错装）→ 跳过，不猜。
 *   - 删除后校验 SFC 语法，非法则回退（fail-closed，宁可漏删不可删坏）。
 *
 * @param {object} params
 * @param {Array<{path:string, content:string}>} params.files 产物文件（package/components/*.vue）
 * @param {object} params.plan subComponentPlan（含 effectiveSections）
 * @param {object} params.figmaRoot figmaNodeData（document 树）
 * @param {Function} [params.validateSfc] 可选 SFC 语法校验（content, path）=> {valid}
 * @returns {{files:Array, healed:Array<{text:string, removedFrom:Array<string>}>}}
 */
export function healDuplicateTextIssues({ files, plan, figmaRoot, validateSfc }) {
  if (!Array.isArray(files) || files.length === 0) return { files, healed: [] };
  if (!plan || !Array.isArray(plan.effectiveSections)) return { files, healed: [] };

  const { duplicateTextIssues } = checkSectionContent({ files, plan, figmaRoot });
  if (duplicateTextIssues.length === 0) return { files, healed: [] };

  // section id → 组件名（owner 组件定位）
  let nameOf;
  try {
    nameOf = assignSectionComponentNames(plan.effectiveSections);
  } catch {
    return { files, healed: [] };
  }

  const byPath = new Map(files.map((f) => [f.path, f]));
  const healed = [];

  for (const issue of duplicateTextIssues) {
    const ownerName = nameOf.get(String(issue.ownerSection));
    if (!ownerName) continue; // 无法确定 owner 组件 → 不猜
    const ownerFile = `package/components/${ownerName}.vue`;
    const renderedIn = Array.isArray(issue.renderedIn) ? issue.renderedIn : [];
    // 错装文件 = renderedIn 里除 owner 组件外的其余文件
    const wrongFiles = renderedIn.filter((p) => p !== ownerFile);
    if (wrongFiles.length === 0) continue;

    const removedFrom = [];
    for (const wrongPath of wrongFiles) {
      const rec = byPath.get(wrongPath);
      if (!rec || typeof rec.content !== 'string') continue;
      const text = String(issue.text);
      const cleaned = removeStaticTextNode(rec.content, text);
      if (cleaned === null) continue; // 未找到可安全删除的静态文本节点
      if (validateSfc) {
        const r = validateSfc(cleaned, wrongPath);
        if (!r?.valid) continue; // 删坏 → 回退
      }
      rec.content = cleaned;
      removedFrom.push(wrongPath);
    }
    if (removedFrom.length > 0) {
      healed.push({ text: issue.text, removedFrom });
    }
  }

  return { files: [...byPath.values()], healed };
}

/**
 * 从 SFC 模板里删除「text 作为独立静态文本节点」的出现，返回新内容；
 * 找不到可安全删除的节点时返回 null（不裸删字符串）。
 *
 * 仅匹配 `>…text…<`（标签之间纯文本，可含空白）这一种形态，且该节点内除 text 外
 * 无其它中文字符（避免把 `<span>24小时趋势</span>` 里的「24小时」误删成「趋势」）。
 */
function removeStaticTextNode(content, text) {
  const esc = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 静态文本节点：标签闭合后、下一个 < 之前，纯 text（含空白），且无其它中文
  const rx = new RegExp(
    `>[\\s]*${esc}[\\s]*<(?![^>]*${esc})`,
    'g',
  );
  const matches = [...content.matchAll(rx)];
  if (matches.length === 0) return null;
  let out = content;
  // 从后往前替换，避免 offset 漂移
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    // 仅当该文本片段左右无其它中文才删（避免子串误删）
    const before = content.slice(Math.max(0, m.index - 12), m.index);
    const after = content.slice(m.index + m[0].length, m.index + m[0].length + 12);
    const hasOtherCJK = /[\u4e00-\u9fa5]/.test(before + after);
    if (hasOtherCJK) continue;
    // 删除整个文本片段（含包裹空白），保留空标签
    out = out.slice(0, m.index) + '><' + out.slice(m.index + m[0].length);
  }
  return out === content ? null : out;
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
        // 🎯 阶段 B（2026-09-15）：先尝试「高置信确定性装配」。
        // 铁律：仅当 assessStatRowConfidence 判 high（成员唯一、x 可解析且严格递增、
        //       「1标题+1数值」配对完整、无重复归属、无资源冲突）才确定性配对；
        //       否则整节回退既有 LLM 路径（成员级配对，非确定性），不产生半确定性混合。
        const assembly = assessStatRowConfidence(sec, figmaRoot);
        if (assembly.verdict === 'high') {
          contract.push({
            id: String(sec.id),
            title: sec.title || '',
            direction: 'row',
            deterministic: true,
            members: assembly.members.map((m) => ({
              title: m.title,
              value: m.value,
              x: Math.round(m.x),
              figmaNodeId: m.figmaNodeId,
            })),
          });
        } else {
          // 回退 LLM：输出「成员级配对」——每个成员的标题↔数值成对 + 按 x 从左到右。
          // 实锤（2:3660 统计行）：LLM 不仅左右反，还把卡片 2 内部的标题/数值也写反；
          // 扁平文本列表治不了「配对错乱」，必须按成员配对给到（仍作预防，非确定性）。
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
              deterministic: false,
              members,
            });
          }
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
