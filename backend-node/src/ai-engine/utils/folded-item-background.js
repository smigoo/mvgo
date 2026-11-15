/**
 * folded-item-background.js — 🛡️ S3-BG「折叠循环项背景归属」确定性绑定
 *
 * 背景（2026-11-15 · mc-max-1794677281125-0fde9c29 实锤）：
 *   `2:8023` 三张同构卡（136:129 / 136:128 / 136:127）在 vision → planner 折叠成
 *   `136:129-list`（collapsed:true / renderHint:'v-for' / items[3]）后，三张**各自不同**的
 *   卡底图（`bg-125.png` 140×74 / `bg-124.png` 120×74 / `bg-126.png` 141×74）没有进循环契约：
 *     - item 里只有 `bgPlaceholder: "card-bg-136-129"` 字符串 + `repeatedFill:"#e8f0fe"` 纯色；
 *     - `icon.resourceFile` 有值，`bg.resourceFile` 无值；`_vforData.resourceFiles` 只有 icon。
 *   ⇒ 刀 53 `detectListLeaf#itemBgs` 的 declared 通道（`it.bg.resourceFile`）读不到，
 *     subtree 通道又只认「卡节点子树里恰好 1 条背景证据」⇒ 三卡 `itemBgStats.skipped=3`；
 *   ⇒ 产物 `FG_LIST_ITEMS` 全部 `bg:false, bgVar:null`，模板只有 `backgroundColor: it.fill`，
 *     三张真 bg 一张都没消费；与此同时资源挂载兜底按 `ownerSectionId` 找不到已消失的锚点，
 *     把 3 张 bg 错挂到 `<base-panel>` / slot-con / 一个 inline px 的空 div 上。
 *
 * 本模块做什么（纯函数、零 LLM、零 IO）：
 *   在刀 53 接管入口，对「已折叠成 v-for 的段」按 `ownerSectionId` 从 resourceDomMapping
 *   **反查唯一背景证据**，把 `bg.resourceFile`（与 mapping 逐字一致）、变量名、
 *   `backgroundImage.src` 写回每个 item。这样：
 *     - `detectListLeaf` 的 declared 通道命中 ⇒ `toBgChannel` 取 `assignedVarName` ⇒
 *       `FG_LIST_ITEMS[].bgVar` + `:style backgroundImage: 'url(' + it.bgVar + ')'` 逐卡消费；
 *     - `microcode-engineer#bgForItem` 的 direct 通道也命中 ⇒ prompt 里不再丢 bg 文件名；
 *     - 折叠契约本身带上 bg 归属事实 ⇒ 下游不必再猜、审计可 grep。
 *
 * 设计约束（与 repeated-section-contract.js 同风格）：
 *   ① 纯函数（无 import、无 import.meta），jest 可直接 require/import；
 *   ② 原地修改 + 返回审计，幂等；不增删 section / item / children；
 *   ③ **严格收窄**：只处理已折叠段；每 item 必须「恰好 1 条」背景证据且该证据有
 *      已固化的变量名；同组内同一文件不得重复绑定；歧义/缺证据一律跳过（fail-open）；
 *   ④ 不改既有 `bg` 声明（模型已给真值时以模型为准，避免覆盖）。
 */

const MAX_DEPTH = 8;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const s = (v) => (v == null ? '' : String(v));
const IMG_RX = /\.(png|svg|jpe?g)$/i;

/** 折叠段判据：与 `detectListLeaf` 的入口判据逐字一致（避免两处判据漂移）。 */
export function isFoldedListSection(sec) {
  return (
    isObj(sec) &&
    (sec.collapsed === true || sec.renderHint === 'v-for') &&
    Array.isArray(sec.items) &&
    sec.items.length >= 2
  );
}

/** mapping 条目是否为「确实可用的背景图」（口径与刀 53 `backgroundImageOf` 对齐）。 */
function isUsableBgEntry(m) {
  if (!isObj(m)) return false;
  const role = s(m.previewAnalysisRole).toLowerCase();
  const usage = s(m.recommendedUsage).toLowerCase();
  const usage2 = s(m.usage).toLowerCase();
  const bgRole = s(m.bgRole).toLowerCase();
  const flagged =
    role === 'bg' ||
    usage === 'backgroundblock' ||
    usage2.includes('backgroundimage') ||
    bgRole === 'container';
  if (!flagged) return false;
  const st = s(m.downloadStatus);
  if (st === 'failed' || st === 'missing') return false;
  if (!IMG_RX.test(s(m.resourceFile))) return false;
  if (!s(m.assignedVarName || m.semanticVarName).trim()) return false;
  return true;
}

/** item 的合法归属 id：只用段自身锚点，不取 sourceNodeIds 全闭包（防把卡内装饰当归属）。 */
function itemOwnerIds(it) {
  const ids = new Set();
  for (const v of [it?.id, it?.figmaNodeId, it?.figmaNode, it?.figmaAnchorId]) {
    if (v != null && s(v).trim()) ids.add(s(v));
  }
  if (Array.isArray(it?.sourceNodeIds)) {
    for (const v of it.sourceNodeIds.slice(0, 2)) {
      if (v != null && s(v).trim()) ids.add(s(v));
    }
  }
  return ids;
}

/** vision / plan / generationInput 多种形态里的 sections 数组候选（按引用去重在 walk 内做）。 */
function sectionArrayCandidates(root) {
  if (!isObj(root)) return [];
  const ls = isObj(root.layoutStructure) ? root.layoutStructure : {};
  const nestedLS = isObj(root.analysisResult?.layoutStructure)
    ? root.analysisResult.layoutStructure
    : {};
  const plan = isObj(root.subComponentPlan) ? root.subComponentPlan : {};
  const genPlan = isObj(root.generationInput?.subComponentPlan)
    ? root.generationInput.subComponentPlan
    : {};
  return [
    root.sections,
    root.effectiveSections,
    root.layout?.sections,
    ls.layout?.sections,
    ls.sections,
    nestedLS.layout?.sections,
    nestedLS.sections,
    plan.effectiveSections,
    plan.sections,
    genPlan.effectiveSections,
    genPlan.sections,
  ];
}

/**
 * 收集所有「已被折叠进 v-for 的原始归属段 id」。
 * 供 `backstopMountBgOwnership` 跳过这些 id 的承载 div 注入（防孤儿空 div）。
 *
 * @param {Array|object} sections section 树（数组或 vision/plan 结果对象）
 * @returns {Set<string>}
 */
export function collectFoldedOwnerIds(sections) {
  const out = new Set();
  const seen = new Set();
  const walk = (arr, depth) => {
    if (!Array.isArray(arr) || depth > MAX_DEPTH) return;
    for (const sec of arr) {
      if (!isObj(sec) || seen.has(sec)) continue;
      seen.add(sec);
      if (isFoldedListSection(sec)) {
        for (const it of sec.items) {
          for (const id of itemOwnerIds(it)) out.add(id);
        }
        for (const id of sec._repeatContract?.members || []) {
          if (s(id).trim()) out.add(s(id));
        }
      }
      if (Array.isArray(sec.children)) walk(sec.children, depth + 1);
      if (isObj(sec.body) && Array.isArray(sec.body.children)) {
        walk(sec.body.children, depth + 1);
      }
    }
  };
  if (Array.isArray(sections)) walk(sections, 0);
  else if (isObj(sections)) {
    for (const arr of sectionArrayCandidates(sections)) walk(arr, 0);
  }
  return out;
}

/**
 * 给折叠段 items 绑定各自背景图（原地修改）。
 *
 * @param {Array|object} sections section 树 / plan 对象
 * @param {Array} resourceMapping resourceDomMapping（含 assignedVarName / ownerSectionId）
 * @returns {{checked:number, bound:number, alreadyBound:number, ambiguous:number, skipped:number, groups:Array}}
 */
export function bindFoldedItemBackgrounds(sections, resourceMapping) {
  const audit = {
    checked: 0,
    bound: 0,
    alreadyBound: 0,
    ambiguous: 0,
    skipped: 0,
    groups: [],
  };
  const mapping = Array.isArray(resourceMapping) ? resourceMapping : [];
  if (mapping.length === 0) return audit;
  const bgEntries = mapping.filter(isUsableBgEntry);
  if (bgEntries.length === 0) return audit;

  const seen = new Set();
  const walk = (arr, depth) => {
    if (!Array.isArray(arr) || depth > MAX_DEPTH) return;
    for (const sec of arr) {
      if (!isObj(sec) || seen.has(sec)) continue;
      seen.add(sec);
      if (isFoldedListSection(sec)) {
        audit.checked += 1;
        const usedFiles = new Set();
        const group = { id: s(sec.id), bound: 0, members: [] };
        for (const it of sec.items) {
          if (!isObj(it)) {
            audit.skipped += 1;
            continue;
          }
          if (s(it.bg?.resourceFile).trim()) {
            audit.alreadyBound += 1;
            continue;
          }
          const ownerIds = itemOwnerIds(it);
          if (ownerIds.size === 0) {
            audit.skipped += 1;
            continue;
          }
          const hits = bgEntries.filter(
            (m) => ownerIds.has(s(m.ownerSectionId)) || ownerIds.has(s(m.figmaNodeId)),
          );
          // 唯一命中 + 同组内该文件未被别卡占用 ⇒ 才写；歧义一律 fail-open。
          if (hits.length !== 1) {
            if (hits.length > 1) audit.ambiguous += 1;
            else audit.skipped += 1;
            continue;
          }
          const hit = hits[0];
          const fname = s(hit.resourceFile).split('/').pop();
          if (usedFiles.has(fname)) {
            audit.ambiguous += 1;
            continue;
          }
          usedFiles.add(fname);
          const varName = s(hit.assignedVarName || hit.semanticVarName);
          it.bg = {
            resourceFile: hit.resourceFile, // 与 mapping 逐字一致（刀 53 declared 通道按字符串比对）
            assignedVarName: varName,
            figmaNodeId: s(hit.figmaNodeId),
            ownerSectionId: s(hit.ownerSectionId),
            recommendedUsage: 'backgroundBlock',
          };
          it.backgroundImage = {
            src: hit.resourceFile,
            resourceFile: hit.resourceFile,
            assignedVarName: varName,
            recommendedUsage: 'backgroundBlock',
          };
          if (isObj(it._vforData)) {
            const files = Array.isArray(it._vforData.resourceFiles)
              ? it._vforData.resourceFiles.slice()
              : [];
            if (!files.includes(fname)) files.push(fname);
            it._vforData.resourceFiles = files.slice(0, 8);
          }
          audit.bound += 1;
          group.bound += 1;
          group.members.push({ id: s(it.id), file: fname, varName });
        }
        // `sec.body.items` 可能与 `sec.items` 是两份数组 ⇒ 同 id 同步补齐，防双轨不一致。
        if (Array.isArray(sec.body?.items) && sec.body.items !== sec.items) {
          for (const bit of sec.body.items) {
            if (!isObj(bit) || s(bit.bg?.resourceFile).trim()) continue;
            const twin = group.members.find((m) => m.id === s(bit.id));
            if (!twin) continue;
            const hit = bgEntries.find(
              (m) => s(m.resourceFile).split('/').pop() === twin.file,
            );
            if (!hit) continue;
            bit.bg = {
              resourceFile: hit.resourceFile,
              assignedVarName: twin.varName,
              figmaNodeId: s(hit.figmaNodeId),
              ownerSectionId: s(hit.ownerSectionId),
              recommendedUsage: 'backgroundBlock',
            };
            bit.backgroundImage = {
              src: hit.resourceFile,
              resourceFile: hit.resourceFile,
              assignedVarName: twin.varName,
              recommendedUsage: 'backgroundBlock',
            };
          }
        }
        if (group.bound > 0) audit.groups.push(group);
      }
      if (Array.isArray(sec.children)) walk(sec.children, depth + 1);
      if (isObj(sec.body) && Array.isArray(sec.body.children)) {
        walk(sec.body.children, depth + 1);
      }
    }
  };

  if (Array.isArray(sections)) walk(sections, 0);
  else if (isObj(sections)) {
    for (const arr of sectionArrayCandidates(sections)) walk(arr, 0);
  }
  return audit;
}

export default bindFoldedItemBackgrounds;
