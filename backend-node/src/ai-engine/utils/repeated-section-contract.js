/**
 * repeated-section-contract.js — 🛡️ S3「同构循环契约」确定性注入（vision 出口门禁）
 *
 * 背景（2026-11-15 · mc-max-1794674989994-dd4be3be 实锤）：
 *   视觉模型把「N 张同构并列卡」稳定输出成 N 个独立 section（危化品车/重型货车/超高车辆），
 *   从不写 `items` / `collapsed` / `renderHint`，尽管 prompt 明确要求用 items 描述重复项。
 *   系统侧其实**数到了**这组同形兄弟，但只以「几何/数量事实」存在：
 *     - `inlineCompositeRows: [{ id:'2:8023', members:['136:129','136:128','136:127'] }]`
 *     - `isoSectionTruth.sections: [{ id:'2:8023', entryCount:3, declaredGroups:[] }]`
 *     - Figma `countSameShapeSiblings()` = 2
 *   而下游判重（prompt-builder#declaredRepeated、engineer#listLike、repeated-section-collapser）
 *   恰好**只认结构契约字段** ⇒ 三卡被切成 3 个 leaf section ⇒ 三次独立 LLM 分块生成
 *   ⇒ StatsCard/2/3 三套 DOM、三套样式值、三套补缺规则。
 *
 * 本模块做什么（确定性后处理，零 LLM）：
 *   在 vision 结果出口，对「有独立几何证据 + 本地结构签名同构 + 尚无契约」的并列卡容器，
 *   补齐标准折叠契约（与 repeated-section-collapser#buildCollapsedSection 同构）：
 *     - 顶层 `collapsed:true` / `renderHint:'v-for'` / `itemCount` / `items[]`
 *     - `body.items`（供 subcomponent-planner 刀 20a 富卡通道）
 *     - 每个 item 携带卡面**原始真值**：icon/背景/文本/parts(字号·字重·颜色)/几何/flexGrow
 *       ⇒ 顺带修掉「样式真值在 plan 归一化时被剥、engineer 只能猜字号颜色」的断供。
 *
 * 设计约束：
 *   ① 纯函数（无 import、无 IO、无 import.meta），jest 可直接 require/import；
 *   ② 原地修改 + 返回审计（与 reconcileSectionLayoutWithFacts 同风格），幂等；
 *   ③ **严格收窄**：必须有独立几何证据，且全部子卡结构签名 + 高度一致，才注入；
 *      已有契约 / 异构兄弟 / 缺证据 / 缺参一律跳过（fail-open 不臆造）；
 *   ④ 不改 section 数量、层级、顺序、children 内容 —— 只加字段，避开 vision-structure-guard
 *      与 section 守恒门禁。
 */

const MAX_DEPTH = 6;
const HEIGHT_TOL_RATIO = 0.12;
const HEIGHT_TOL_MIN_PX = 2;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const s = (v) => (v == null ? '' : String(v));

/** 装饰元素（icon / 背景色块）不参与语义骨架签名，但会作为差异真值进 item。 */
function isDecorElement(el) {
  if (!isObj(el)) return true;
  const r = s(el.role).toLowerCase();
  const t = s(el.type).toLowerCase();
  if (r === '装饰' || r === 'decoration' || r === 'decor') return true;
  return /^(icon|bg|background|image|divider|separator)$/.test(t);
}

/**
 * 卡结构签名：语义元素 role 序列 + 是否有 icon + 数值是否为多段 parts + 卡高。
 * 三卡实测（危化品车/重型货车/超高车辆）：过滤装饰后均 [label, value]，
 * 且都有 icon、value 都有 number+unit parts、高均 74 ⇒ 签名一致。
 */
function cardSignature(card) {
  if (!isObj(card)) return null;
  const els = Array.isArray(card.body?.children) ? card.body.children : [];
  if (els.length < 2) return null;
  const semantic = els.filter((e) => !isDecorElement(e));
  if (semantic.length < 1) return null;
  const roles = semantic.map((e) => s(e.role || e.type).toLowerCase()).filter(Boolean);
  if (roles.length === 0) return null;
  const hasIcon = els.some(
    (e) => isObj(e) && (/icon/i.test(s(e.type) + s(e.role)) || !!e.resourceFile),
  );
  const hasParts = els.some((e) => isObj(e) && Array.isArray(e.parts) && e.parts.length > 0);
  const hRaw = card.geometryPx?.h ?? card.geometryPx?.height ?? card.styles?.figmaHeightPx;
  const h = Number(hRaw);
  return {
    shape: `${roles.join('|')}#icon:${hasIcon ? 1 : 0}#parts:${hasParts ? 1 : 0}`,
    h: Number.isFinite(h) ? h : null,
  };
}

/** 已有循环契约 ⇒ 幂等跳过（含 planner 刀 20a 的 body.items 轨）。 */
function hasRepeatContract(sec) {
  return (
    sec.collapsed === true ||
    sec.renderHint === 'v-for' ||
    (Array.isArray(sec.items) && sec.items.length > 1) ||
    (Array.isArray(sec.body?.items) && sec.body.items.length > 1)
  );
}

/** 从卡内元素抽取文件名（供 engineer #bgForItem / iconFiles 消费）。 */
function collectResourceFiles(els) {
  const out = [];
  const walk = (x, d) => {
    if (!isObj(x) || d > 4) return;
    for (const k of ['resourceFile', 'src']) {
      const v = x[k];
      if (typeof v === 'string' && /\.(png|svg|jpe?g)$/i.test(v)) out.push(v.split('/').pop());
    }
    if (isObj(x.backgroundImage)) walk(x.backgroundImage, d + 1);
    if (Array.isArray(x.parts)) for (const p of x.parts) walk(p, d + 1);
  };
  for (const e of els) walk(e, 0);
  return out;
}

/**
 * 构造一个「富卡 item」：字段形态同时满足
 *   - repeated-section-collapser#extractRichBodyItems（content.elements / icon / texts / children 签名）
 *   - microcode-engineer#vforItems / #bgForItem（backgroundImage.src / sourceNodeIds / _vforData）
 * 且**原样保留**卡面样式真值，绝不臆造数值、颜色、资源名。
 */
function buildRichItem(card) {
  const els = Array.isArray(card.body?.children) ? card.body.children : [];
  const icon = els.find(
    (e) => isObj(e) && (/icon/i.test(s(e.type) + s(e.role)) || !!e.resourceFile),
  );
  const label = els.find(
    (e) => isObj(e) && (s(e.role).toLowerCase() === 'label' || (typeof e.text === 'string' && !Array.isArray(e.parts) && /label|标签/i.test(s(e.name)))),
  );
  const value = els.find(
    (e) => isObj(e) && (s(e.role).toLowerCase() === 'value' || Array.isArray(e.parts)),
  );
  const bg = els.find((e) => isObj(e) && /^(bg|background)$/i.test(s(e.type)) && e.styles?.backgroundColor);
  const texts = els
    .filter((e) => isObj(e) && typeof e.text === 'string' && e.text.trim())
    .map((e) => e.text.trim());
  const textStyles = els
    .filter((e) => isObj(e) && typeof e.text === 'string' && e.styles?.color)
    .map((e) => String(e.styles.color));
  const resourceFiles = collectResourceFiles([{ backgroundImage: card.body?.backgroundImage }, ...els]);

  return {
    id: s(card.id),
    name: card.name || null,
    figmaNodeId: s(card.figmaNodeId || card.id),
    sourceNodeIds: [s(card.id)],
    // —— 富卡判据字段 ——
    content: { elements: els },
    children: els,
    texts,
    icon: icon
      ? {
          resourceFile: icon.resourceFile || null,
          width: Number(icon.width) || null,
          height: Number(icon.height) || null,
          figmaNode: s(icon.id),
        }
      : null,
    // —— 卡面语义真值（差异项，供 v-for 数据数组原样照抄）——
    label: label?.text ?? null,
    labelStyles: label?.styles || null,
    value: value?.text ?? null,
    parts: Array.isArray(value?.parts) ? value.parts : [],
    accentColor: bg?.styles?.backgroundColor || null,
    backgroundImage: card.body?.backgroundImage || null,
    bgPlaceholder: card.body?.bgPlaceholder || null,
    // —— 布局真值（等宽 / 等高，防止三卡 flex 比例被 LLM 猜成 0.350/0.299/0.351）——
    styles: card.styles || null,
    geometryPx: card.geometryPx || null,
    // —— engineer #vforItems 读取的深层确定性数据 ——
    _vforData: {
      texts: texts.slice(0, 8),
      textStyles: textStyles.slice(0, 8),
      resourceFiles: resourceFiles.filter(Boolean).slice(0, 6),
    },
  };
}

/** 收集所有可能的 sections 数组入口（缓存形态 / 实时形态），按引用去重。 */
function collectSectionArrays(result) {
  const out = [];
  const candidates = [
    result?.layout?.sections,
    result?.layoutStructure?.layout?.sections,
    result?.layoutStructure?.sections,
  ];
  for (const arr of candidates) {
    if (Array.isArray(arr) && !out.includes(arr)) out.push(arr);
  }
  return out;
}

/**
 * 在 vision 结果上注入同构循环契约（原地修改）。
 *
 * @param {object} result visual-parser 的分析结果（缓存命中或实时出口皆可）
 * @param {object} [options] { sourceRows?:Array, isoSections?:Array } 便于单测直接喂证据
 * @returns {{checked:number, injected:number, groups:Array, skipped:Array}} 审计
 */
export function injectRepeatedSectionContract(result, options = {}) {
  const audit = { checked: 0, injected: 0, groups: [], skipped: [] };
  if (!isObj(result)) return audit;

  const ls = isObj(result.layoutStructure) ? result.layoutStructure : {};
  const rows = [
    ...(Array.isArray(options.sourceRows) ? options.sourceRows : []),
    ...(Array.isArray(result.inlineCompositeRows) ? result.inlineCompositeRows : []),
    ...(Array.isArray(ls.inlineCompositeRows) ? ls.inlineCompositeRows : []),
  ];
  const isoSections = [
    ...(Array.isArray(options.isoSections) ? options.isoSections : []),
    ...(Array.isArray(result.isoSectionTruth?.sections) ? result.isoSectionTruth.sections : []),
    ...(Array.isArray(ls.isoSectionTruth?.sections) ? ls.isoSectionTruth.sections : []),
  ];

  const seen = new Set();
  const walk = (sections, depth) => {
    if (!Array.isArray(sections) || depth > MAX_DEPTH) return;
    for (const sec of sections) {
      if (!isObj(sec) || seen.has(sec)) continue;
      seen.add(sec);
      // 先递归子层（深层同构组优先），再判本层
      if (Array.isArray(sec.children)) walk(sec.children, depth + 1);

      const kids = Array.isArray(sec.children) ? sec.children : [];
      if (kids.length < 2) continue;
      audit.checked += 1;
      if (hasRepeatContract(sec)) {
        audit.skipped.push({ id: s(sec.id), reason: 'alreadyDeclared' });
        continue;
      }
      if (kids.some((k) => hasRepeatContract(k))) {
        audit.skipped.push({ id: s(sec.id), reason: 'childAlreadyDeclared' });
        continue;
      }

      const kidIds = new Set(kids.map((k) => s(k?.id)));
      const rowHit = rows.find(
        (r) =>
          isObj(r) &&
          s(r.id) === s(sec.id) &&
          Array.isArray(r.members) &&
          r.members.filter((m) => kidIds.has(s(m))).length >= 2,
      );
      const isoHit = isoSections.find(
        (t) => isObj(t) && s(t.id) === s(sec.id) && Number(t.entryCount) >= 2,
      );
      const source = rowHit ? 'inlineCompositeRows' : isoHit ? 'isoSectionTruth' : null;
      if (!source) {
        audit.skipped.push({ id: s(sec.id), reason: 'noGeometricEvidence' });
        continue;
      }

      const sigs = kids.map(cardSignature);
      if (sigs.some((x) => !x)) {
        audit.skipped.push({ id: s(sec.id), reason: 'notCardLike' });
        continue;
      }
      const shapes = new Set(sigs.map((x) => x.shape));
      if (shapes.size !== 1) {
        audit.skipped.push({ id: s(sec.id), reason: 'heterogeneousShape' });
        continue;
      }
      const hs = sigs.map((x) => x.h).filter((x) => Number.isFinite(x));
      if (hs.length === kids.length) {
        const spread = Math.max(...hs) - Math.min(...hs);
        const tol = Math.max(HEIGHT_TOL_MIN_PX, Math.max(...hs) * HEIGHT_TOL_RATIO);
        if (spread > tol) {
          audit.skipped.push({ id: s(sec.id), reason: 'heightMismatch' });
          continue;
        }
      }

      const items = kids.map(buildRichItem);
      sec.collapsed = true;
      sec.renderHint = 'v-for';
      sec.itemCount = items.length;
      sec.items = items;
      sec.body = isObj(sec.body) ? sec.body : {};
      sec.body.items = items;
      sec._repeatContract = {
        source,
        injectedBy: 'S3-repeated-section-contract',
        members: kids.map((k) => s(k.id)),
        itemCount: items.length,
      };
      audit.injected += 1;
      audit.groups.push({ id: s(sec.id), source, itemCount: items.length, members: kids.map((k) => s(k.id)) });
    }
  };

  for (const arr of collectSectionArrays(result)) walk(arr, 0);

  // 与 S1 layoutFacts / analysisFixes 同址留痕：让「已注入什么、多少组」可 grep。
  // 缓存形态的 analysisFixes 在 layoutStructure 内、实时形态在顶层，两处都写（按引用去重）。
  result.repeatContractAudit = audit;
  if (isObj(result.layoutStructure)) ls.repeatContractAudit = audit;
  const fixEntry = {
    kind: 'repeatContract',
    detail: '已为几何证据确证的同构并列卡注入 v-for 循环契约（含卡面样式/资源真值）',
    count: audit.injected,
  };
  const seenFixes = new Set();
  for (const fixes of [result.analysisFixes, ls.analysisFixes]) {
    if (Array.isArray(fixes) && !seenFixes.has(fixes)) {
      seenFixes.add(fixes);
      fixes.push(fixEntry);
    }
  }
  return audit;
}

/* ────────────────────────────────────────────────────────────────────────────
 * B（2026-11-15）：几何证据 → `declaredRepeated` 判定的单一来源
 *
 * 病灶：prompt-builder 的 `declaredRepeated` 只读 3 个**可选契约字段**
 *   （itemCount>1 / collapsed / renderHint='v-for'）。A 门禁补契约后这些字段有了，
 *   但只要 A 未命中（如证据只存在于 `countSameShapeSiblings()` 或 `isoSectionTruth`），
 *   真机日志就仍是 `siblings=2 declaredRepeated=false` —— 几何事实白拿、不生效。
 * 这里把「几何证据」抽成纯函数，供 prompt-builder 两处共用（避免两处各写一份判据）。
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * @param {object} sec 段对象（可为 undefined）
 * @param {object} evidence { siblings?:number, isoEntryCount?:number, inlineMembers?:number }
 * @returns {{declared:boolean, geometric:boolean, repeated:boolean, sources:string[]}}
 */
export function isDeclaredOrGeometricRepeated(sec, evidence = {}) {
  const declared =
    Number(sec?.itemCount) > 1 || sec?.collapsed === true || sec?.renderHint === 'v-for';
  const sources = [];
  const siblings = Number(evidence?.siblings);
  const isoEntryCount = Number(evidence?.isoEntryCount);
  const inlineMembers = Number(evidence?.inlineMembers);
  if (Number.isFinite(siblings) && siblings > 1) sources.push('sameShapeSiblings');
  if (Number.isFinite(isoEntryCount) && isoEntryCount > 1) sources.push('isoSectionTruth');
  if (Number.isFinite(inlineMembers) && inlineMembers > 1) sources.push('inlineCompositeRows');
  if (isObj(sec?._repeatContract) && Number(sec._repeatContract.itemCount) > 1) {
    if (!sources.includes(sec._repeatContract.source)) sources.push(sec._repeatContract.source || 'repeatContract');
  }
  const geometric = sources.length > 0;
  return { declared, geometric, repeated: declared || geometric, sources };
}

/**
 * 段身份候选 id：只用**段自身锚点**（id / figmaAnchorId / figmaNodeId）。
 * ⚠️ 刻意不含 sourceNodeIds —— 那是整棵子树闭包（折叠叶可达 20+ 节点），
 *   拿它去匹配 inlineCompositeRows 会把「卡内任意一行」都误认成本段的重复组证据，
 *   导致过度阻止精确裁图。收窄到段自身 id 才能与容器级事实一一对应。
 */
function sectionCandidateIds(sec) {
  const out = new Set();
  for (const v of [sec?.id, sec?.figmaAnchorId, sec?.figmaNodeId]) {
    if (v != null && String(v)) out.add(String(v));
  }
  return out;
}

/**
 * 从 input 的多种形态里解析「本段的几何重复证据」。
 * 只认**系统性事实**（isoSectionTruth.entryCount / inlineCompositeRows.members /
 * A 注入的 _repeatContract），不认图层名、不认自然语言 summary。
 * 找不到 ⇒ 0（既有行为零漂移）。
 */
export function resolveRepeatEvidence(input, sec) {
  const ids = sectionCandidateIds(sec);
  if (ids.size === 0) return { isoEntryCount: 0, inlineMembers: 0 };
  const ls = isObj(input?.layoutStructure) ? input.layoutStructure : {};
  const nestedLS = isObj(input?.analysisResult?.layoutStructure)
    ? input.analysisResult.layoutStructure
    : {};
  const isoArrays = [
    input?.isoSectionTruth?.sections,
    ls.isoSectionTruth?.sections,
    nestedLS.isoSectionTruth?.sections,
    input?.designFacts?.isoSectionTruth?.sections,
  ].filter(Array.isArray);
  const rowArrays = [
    input?.inlineCompositeRows,
    ls.inlineCompositeRows,
    nestedLS.inlineCompositeRows,
  ].filter(Array.isArray);

  let isoEntryCount = 0;
  for (const arr of isoArrays) {
    for (const t of arr) {
      if (isObj(t) && ids.has(s(t.id))) {
        const n = Number(t.entryCount);
        if (Number.isFinite(n)) isoEntryCount = Math.max(isoEntryCount, n);
      }
    }
  }
  let inlineMembers = 0;
  for (const arr of rowArrays) {
    for (const r of arr) {
      if (isObj(r) && ids.has(s(r.id)) && Array.isArray(r.members)) {
        inlineMembers = Math.max(inlineMembers, r.members.length);
      }
    }
  }
  return { isoEntryCount, inlineMembers };
}

export default injectRepeatedSectionContract;
