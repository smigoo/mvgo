/**
 * 🛡️ P1-A（2026-10-25 · mc-max-1792934367321-ab7bb76c 实锤）：plan `body.children[].id` 一致性校验。
 *
 * ## 病灶（vision/LLM 输出的 section.body.children[].id 错位，两种形态）
 *
 *   ① **self-reference**：`child.id === section 的 Figma 锚点 id`
 *      - `807:2`（底部图例与链接）的 3 个 body child 全是 `807:2`（真值应为
 *        `43:4869` 运行中图例 / `43:4875` 离线图例 / `43:4878` 查看详情）
 *      - `807:3`（面板标题栏）第 3 个 child = `807:3`（真值 `43:4890` 标题文字）
 *      - `43:4788`（设备列表表格）的 body child 与内层 table-row 都复用 `43:4788`
 *   ② **duplicate-sibling**：同一 body 下两个 child 共用 id 而 **name 不同**
 *      - `807:3` 下 `43:4879` 出现两次：「标题装饰线」与「菱形图标」（真值后者应为 `43:4886`）
 *
 *   ⇒ 下游按 id 取真值全落空（`43:4869`/`43:4875`/`43:4891`/`43:5688` 均取不到）⇒
 *     无刀接管 ⇒ LLM 自由发挥 ⇒ 文案串味（ContentSection4 渲成「1/离线」、ContentSection5
 *     渲成「● 运行中」，两者互换）。
 *
 * ## 🔴 判据边界（为什么不重写「锚点不是内容祖先」那一条）
 *
 *   上游 `section-anchor-truth.js#auditSectionAnchors` 已有同构判据 `anchor-not-ancestor`
 *   （「section 锚点是否为其内容 id 的祖先」），在真实链路上确实命中过本单的 `43:4893`
 *   （`sectionAnchorAudit.fixes: 43:4893 → 43:4892`，写在 `figmaAnchorId` 上）。
 *   **同构判据不得写第二份**（副本 ≥2 份 = 事故温床）⇒ 本模块**不做** not-a-descendant，
 *   锚点层级维度的敏感度提升（既有实现是「全部内容都不是后代才报」的全称式，对
 *   `807:3`/`807:2` 这类「部分错位」漏报）属该模块的职责，不在此处重写。
 *
 *   🔴 因此本模块只覆盖 `auditSectionAnchors` 的**盲区维度**：它只看 section 锚点，
 *      完全不看 `body.children[].id` 的自引用与复用。
 *
 * ## 🔴 为什么只诊断、不改数据（对齐 `section-plan-coverage.js` ①② 纪律）
 *
 *   id 错位后**无法确定性反推正确 id** —— 需要「Figma 树 + 几何回溯 + 语义匹配」三者联合，
 *   任何单点猜错都会静默丢掉真实内容（`43:4788` → 真值表格 frame 是 `43:4784`，猜成
 *   `43:4785` 就会把整张表挂到第一行上）。因此本模块**只留痕**：把「人肉取证 4 小时」
 *   压缩成「一条日志」，既有降级路径（刀 53 两段式决策 / coverage 门禁 / 锚点守卫）一律保持原样。
 *
 * ## 判据（两条，全部可证伪、纯树结构、命名无关、零外部依赖）
 *
 *   A1 `self-reference`   ：`child.id === 该 section 的 Figma 锚点 id`
 *                            （同一 Figma 节点不能既是父又是己的子项）
 *   A2 `duplicate-sibling`：同 body 下同 id ≥2 次 ∧ 至少两项 name 不同
 *                            （同一 id 不可能对应两个不同名字的节点）
 *
 *   🔴 锚点解析优先级 `figmaAnchorId` → `figmaNodeId` → `id`（上游锚点守卫修复写在
 *      `figmaAnchorId` 上；只有它才代表真实 Figma 节点，`id` 可能是合成/被修复前的旧值）。
 *   🔴 只在 id 匹配 `FIGMA_ID_RE`（`section-anchor-truth.js` 单一来源）时判定：
 *      planner 合成的段 id（`43:4791-list` / `807:2-tail-text` / `43:4812-list`）含后缀，
 *      天然不匹配 ⇒ 不会被误判。
 */

import { FIGMA_ID_RE } from './section-anchor-truth.js';

/** 🔴 单一来源：Figma 节点 id 形态（勿再写第二份正则） */
function isFigmaId(v) {
  return typeof v === 'string' && FIGMA_ID_RE.test(v);
}

/** 单次审计最多保留的明细条数（日志只留痕，防爆量） */
const MAX_ISSUES = 40;
/** 日志/返回的样本上限 */
const SAMPLE_LIMIT = 6;

/** 一层深度即够：`body.children[i].children[j]`（表格 row / 统计卡内部） */
const CHILD_DEPTH = 1;

function nodeChildren(node) {
  return Array.isArray(node?.children) ? node.children : [];
}

/**
 * section 的 Figma 锚点：`figmaAnchorId`（上游锚点守卫的修复落点）优先，
 * 其次 `figmaNodeId`（vision 显式声明），最后 `id`。都不是合法 Figma id ⇒ null。
 */
function resolveAnchorId(section) {
  for (const cand of [section?.figmaAnchorId, section?.figmaNodeId, section?.id]) {
    if (isFigmaId(cand)) return cand;
  }
  return null;
}

/**
 * 收集一个 section 的 body.children 里所有「带合法 Figma id」的条目（含一层深）。
 * @returns {Array<{path: string, id: string, name: string|null, depth: number}>}
 */
function collectBodyChildEntries(bodyChildren) {
  const entries = [];
  bodyChildren.forEach((child, i) => {
    if (!child || typeof child !== 'object') return;
    const base = `body.children[${i}]`;
    if (isFigmaId(child.id)) {
      entries.push({ path: base, id: child.id, name: child.name ?? null, depth: 0 });
    }
    if (CHILD_DEPTH >= 1) {
      (Array.isArray(child.children) ? child.children : []).forEach((grand, j) => {
        if (grand && typeof grand === 'object' && isFigmaId(grand.id)) {
          entries.push({
            path: `${base}.children[${j}]`,
            id: grand.id,
            name: grand.name ?? null,
            depth: 1,
          });
        }
      });
    }
  });
  return entries;
}

/**
 * 审计 `sections[].body.children[].id` 的自引用与复用。
 *
 * @param {Object} input
 * @param {Array}  [input.sections] vision 原始 sections（`layout.sections` / `layoutStructure.sections`）
 * @returns {{
 *   evaluated: number,        // 遍历的 section 总数（计数行硬要求）
 *   bodySections: number,     // 其中带非空 body.children 的 section 数
 *   entries: number,          // 参与判定的 child 条目数（含一层深）
 *   issues: Array,            // 明细（≤ MAX_ISSUES）
 *   byCode: Record<string, number>,
 * }}
 */
export function auditPlanBodyChildIds(input = {}) {
  const sections = Array.isArray(input?.sections) ? input.sections : [];

  const byCode = { 'self-reference': 0, 'duplicate-sibling': 0 };
  const issues = [];
  let evaluated = 0;
  let bodySections = 0;
  let entryCount = 0;

  const push = (item) => {
    byCode[item.code] = (byCode[item.code] || 0) + 1;
    if (issues.length < MAX_ISSUES) issues.push(item);
  };

  const scanSections = (list) => {
    for (const sec of list) {
      if (!sec || typeof sec !== 'object') continue;
      evaluated += 1;

      const bodyChildren = Array.isArray(sec?.body?.children) ? sec.body.children : [];
      if (bodyChildren.length > 0) {
        bodySections += 1;
        const entries = collectBodyChildEntries(bodyChildren);
        entryCount += entries.length;

        // ── A1 self-reference ───────────────────────────────────────────
        const anchorId = resolveAnchorId(sec);
        if (anchorId) {
          for (const e of entries) {
            if (e.id !== anchorId) continue;
            push({
              code: 'self-reference',
              sectionId: typeof sec.id === 'string' ? sec.id : null,
              anchorId,
              childId: e.id,
              childName: e.name,
              path: e.path,
              depth: e.depth,
              message: 'body child 的 id 等于该 section 的 Figma 锚点 id（真值应为其子节点）',
            });
          }
        }

        // ── A2 duplicate-sibling ───────────────────────────────────────
        if (entries.length > 1) {
          const groups = new Map();
          for (const e of entries) {
            if (!groups.has(e.id)) groups.set(e.id, []);
            groups.get(e.id).push(e);
          }
          for (const [childId, group] of groups) {
            if (group.length < 2) continue;
            const names = [...new Set(group.map((g) => g.name).filter((n) => n != null))];
            // 同 id 同名 = LLM 复制了同一模板项（另一类问题，非 id 错位）⇒ 不报，避免噪声
            if (names.length < 2) continue;
            push({
              code: 'duplicate-sibling',
              sectionId: typeof sec.id === 'string' ? sec.id : null,
              anchorId,
              childId,
              names,
              paths: group.map((g) => g.path),
              occurrences: group.length,
              message: `同一 body 下 ${group.length} 个 child 共用 id 但 name 不同（至少一个 id 是错的）`,
            });
          }
        }
      }

      scanSections(nodeChildren(sec));
    }
  };

  scanSections(sections);

  return {
    evaluated,
    bodySections,
    entries: entryCount,
    issues,
    byCode,
  };
}

/** 明细样本（日志用，避免运维看到满屏 JSON） */
export function compactBodyChildIssues(issues, limit = SAMPLE_LIMIT) {
  return (Array.isArray(issues) ? issues : []).slice(0, limit).map((i) => ({
    code: i.code,
    sectionId: i.sectionId ?? null,
    anchorId: i.anchorId ?? null,
    childId: i.childId ?? null,
    childName: i.childName ?? null,
    path: i.path ?? null,
    ...(i.names ? { names: i.names } : {}),
  }));
}
