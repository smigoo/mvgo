/**
 * 🛡️ F1a 段树完整性对账（2026-11-10 · 方案 v4，docs/2026-11-10-段树完整性校验门与游离根失效修复方案.md）
 *
 * 病灶：vision 段树 → planner effectiveSections 的变换（dedupe/过滤/合成锚/容器吞并）是
 * 无出口校验的黑盒——丢段（重点车辆 136:122）、容器吞并（流量监测 88:33 吞并后续全部段）、
 * 重排全部静默进入装配。
 *
 * 基准原则（用户裁决 2026-11-10）：**视觉分析（vision）结果是唯一事实源**。
 * 下游允许变换，但每次偏离必须被看见——本模块即「planner 出口 vs vision 段树」的对账纯函数。
 *
 * 判据（方案 v4 §3-F1a，reportOnly，阈值待真机分布）：
 * - missing       全树递归后 vision 有、出口没有的 id（内容真丢）
 * - reparented    两边都有、但父链改变（容器吞并归此类，不算丢段）
 * - missingParent reparented 中「vision 父段不在出口」的子集
 * - unexpectedParent reparented 中「出口父段不在 vision id 集合」的子集
 * - orderInversions / comparablePairs 顶层同父兄弟段、两边都存在者，按两树先后序两两比对
 *   相对次序不同的对数（Q2 裁决：基准用 vision 顺序，不引 Figma y）
 * - synthetic     出口有、vision 没有的新 id（如 chart- 前缀合成锚，合法机制，只计数）
 *
 * 纯函数、零 IO、零依赖；同名 id 重复出现时首次出现为准。
 */

/**
 * 全树递归收集段 id → 父 id 映射（含各级 children，非仅顶层）。
 * @param {Array} sections 段树（vision 或出口）
 * @returns {Map<string, string|null>} id -> parentId（顶层为 null）
 */
export function collectSectionIdMap(sections) {
  const map = new Map();
  const walk = (list, parentId) => {
    for (const sec of Array.isArray(list) ? list : []) {
      if (!sec || typeof sec !== 'object') continue;
      const id = String(sec.id ?? '');
      if (!id) continue;
      if (!map.has(id)) map.set(id, parentId ?? null);
      if (Array.isArray(sec.children) && sec.children.length > 0) {
        walk(sec.children, id);
      }
    }
  };
  walk(sections, null);
  return map;
}

/**
 * 顶层（同父兄弟）段 id 序列，仅保留两边都存在的 id（顺序对账参与集）。
 * @returns {string[]}
 */
function topLevelIds(sections, idSet) {
  const ids = [];
  for (const sec of Array.isArray(sections) ? sections : []) {
    if (!sec || typeof sec !== 'object') continue;
    const id = String(sec.id ?? '');
    if (id && idSet.has(id)) ids.push(id);
  }
  return ids;
}

/**
 * 段树完整性对账。
 * @param {Array} visionSections vision 段树（唯一事实源，layout.sections / sections 双形态由调用方归一）
 * @param {Array} exitSections 出口段树（dedupe 后 effectiveSections）
 * @returns {{
 *   missing: Array<{id:string,title:string}>,
 *   reparented: Array<{id:string,visionParent:string|null,exitParent:string|null}>,
 *   missingParent: number, unexpectedParent: number,
 *   orderInversions: number, comparablePairs: number,
 *   synthetic: number, syntheticSamples: string[],
 *   visionTotal: number, exitTotal: number,
 * }}
 */
export function auditSegTreeIntegrity(visionSections, exitSections) {
  const visionMap = collectSectionIdMap(visionSections);
  const exitMap = collectSectionIdMap(exitSections);
  const visionIds = new Set(visionMap.keys());
  const exitIds = new Set(exitMap.keys());

  // a. 丢段：全树递归后 vision 有、出口没有
  const missing = [];
  for (const id of visionMap.keys()) {
    if (!exitIds.has(id)) {
      missing.push({ id, title: _titleOf(visionSections, id) });
    }
  }

  // a/b. 重挂：两边都有、父链改变（容器吞并归此类）
  const reparented = [];
  let missingParent = 0;
  let unexpectedParent = 0;
  for (const [id, visionParent] of visionMap) {
    if (!exitIds.has(id)) continue;
    const exitParent = exitMap.get(id) ?? null;
    if ((exitParent ?? null) === (visionParent ?? null)) continue;
    reparented.push({ id, visionParent, exitParent });
    if (visionParent != null && !exitIds.has(visionParent)) missingParent += 1;
    if (exitParent != null && !visionIds.has(exitParent)) unexpectedParent += 1;
  }

  // c. 顶层顺序偏离：以 vision 顺序为基准的逆序对（Q2 裁决，不引 Figma y）
  const visionOrder = new Map();
  let vi = 0;
  for (const sec of Array.isArray(visionSections) ? visionSections : []) {
    const id = String(sec?.id ?? '');
    if (id && exitIds.has(id) && !visionOrder.has(id)) visionOrder.set(id, vi);
    vi += 1;
  }
  const exitTop = topLevelIds(exitSections, visionIds);
  let orderInversions = 0;
  for (let i = 0; i < exitTop.length; i++) {
    for (let j = i + 1; j < exitTop.length; j++) {
      if (visionOrder.get(exitTop[i]) > visionOrder.get(exitTop[j])) orderInversions += 1;
    }
  }
  const comparablePairs = Math.max(0, (exitTop.length * (exitTop.length - 1)) / 2);

  // d. 合成段：出口有、vision 没有（合法机制，只计数）
  const syntheticSamples = [];
  let synthetic = 0;
  for (const id of exitIds) {
    if (!visionIds.has(id)) {
      synthetic += 1;
      if (syntheticSamples.length < 6) syntheticSamples.push(id);
    }
  }

  return {
    missing,
    reparented,
    missingParent,
    unexpectedParent,
    orderInversions,
    comparablePairs,
    synthetic,
    syntheticSamples,
    visionTotal: visionMap.size,
    exitTotal: exitMap.size,
  };
}

/**
 * 🛡️ B（2026-11-12 · mc-max-1794458950336-47b996c3 实锤）：**丢段补建**。
 *
 * ## 病灶
 * F1a 对账只 reportOnly：真机 vision 顶层 3 段（`565:2` 头部区域 / `565:3` 列表 /
 * `48:5888` 底部汇总），planner 出口只剩 `565:3` ⇒ `missing=2` 仅进 warn 日志，
 * 一路下传。`565:2` 的 `header.title='部署节点概览'` 全树无任何承载段 ⇒ C1b
 * 「真值标签文本缺席」判定正确，且修复轮无段可修（最小 diff 契约下三轮 FAIL 逐字相同）。
 *
 * ## 判据（三分类，逐条可辩驳；figma 祖先链为唯一归属口径）
 * 对每个 `missing`（vision 有、出口全树无）的**顶层**段：
 * - `skipIds` 命中（dedupe 显式移除 / 已知合成锚）⇒ `dedupeDropped`，**不补建**
 *   （补建等于推翻 dedupe 的合法收敛决定）；
 * - **figma 祖先链命中出口段**（`figmaIndex` 上溯，任一祖先 ∈ 出口 id 集）⇒ `absorbed`，
 *   **不补建**——该节点是某出口段的子树，其内容由该段消费（真机 `48:5888` parent=`565:3`，
 *   两条统计文本已由列表接管的段尾 satellite 物化；补建会把同一串渲染两次）；
 * - 其余 ⇒ `restorable`，按 vision 真值**深拷贝补回**出口顶层。
 *
 * ## 插入位置（不重排既有段）
 * 按 vision 顶层序，插到「vision 中下一个仍在出口的兄弟」之前；没有则插到「上一个仍在
 * 出口的兄弟」之后；都没有则追加末尾。**绝不整体重排** —— 既有段序是下游已验证的装配序，
 * 一次重排会把无关段挪位（synthetic 段无处安放时尤其危险）。
 *
 * ## 不可判 / 可拦
 * - `figmaIndex` 缺失或节点不存在 ⇒ `undecidable`（观测能力缺失，**不拦**，fail-open，
 *   且不计入 `missingAfter` —— 否则缺索引的调用方会被一律拦下）；
 * - 嵌套层 missing ⇒ `nestedMissing`（跨层补建会错挂父，**不拦**，只计数）；
 * - 补建后仍 missing（`missingAfter > 0`）或 `nestedMissing > 0` ⇒ `blocked=true`
 *   —— 这才是「缺口确凿」的形态，由调用方决定拦还是降级交付（C 出口）。
 *
 * 纯函数、不原位修改入参（返回新数组）。
 *
 * @param {Array} visionSections vision 段树（唯一事实源）
 * @param {Array} exitSections 出口段树（dedupe 后 effectiveSections）
 * @param {{figmaIndex?: Map|null, skipIds?: Iterable<string>}} [opts]
 * @returns {{
 *   sections: Array,
 *   restored: Array<{id:string, at:number, title:string}>,
 *   absorbed: Array<{id:string, ancestor:string}>,
 *   dedupeDropped: string[],
 *   undecidable: Array<{id:string, reason:string}>,
 *   nestedMissing: string[],
 *   missingBefore: number, missingAfter: number, blocked: boolean,
 * }}
 */
export function restoreMissingSections(visionSections, exitSections, opts = {}) {
  const figmaIndex = opts.figmaIndex || null;
  const skipIds = new Set(Array.from(opts.skipIds || [], (x) => String(x)));
  const vision = Array.isArray(visionSections) ? visionSections : [];
  const sections = Array.isArray(exitSections) ? exitSections.slice() : [];

  const exitMap = collectSectionIdMap(sections);
  const exitAllIds = new Set(exitMap.keys());
  const visionMap = collectSectionIdMap(vision);

  const restored = [];
  const absorbed = [];
  const dedupeDropped = [];
  const undecidable = [];
  const nestedMissing = [];
  // 🔴 补建前基线（必须在任何 splice 之前取，否则「补建后仍缺」永远算成 0 = 假绿）
  const missingBefore = missingCountOf(visionMap, exitAllIds);

  // 顶层 / 嵌套分开：只有顶层可安全补建
  const visionTop = [];
  for (const sec of vision) {
    if (sec && typeof sec === 'object' && String(sec.id ?? '')) visionTop.push(sec);
  }
  const topSeen = new Set();
  for (const sec of visionTop) {
    const id = String(sec.id);
    topSeen.add(id);
    if (exitAllIds.has(id)) continue;
    if (skipIds.has(id)) {
      dedupeDropped.push(id);
      continue;
    }
    // figma 祖先链是否落在某个出口段内
    if (!figmaIndex || typeof figmaIndex.get !== 'function') {
      undecidable.push({ id, reason: 'noFigmaIndex' });
      continue;
    }
    const entry = figmaIndex.get(id);
    if (!entry) {
      undecidable.push({ id, reason: 'figmaNodeMissing' });
      continue;
    }
    let cur = entry.parentId == null ? null : String(entry.parentId);
    let hit = null;
    const guard = new Set([id]);
    while (cur && !guard.has(cur)) {
      guard.add(cur);
      if (exitAllIds.has(cur)) {
        hit = cur;
        break;
      }
      const pe = figmaIndex.get(cur);
      cur = pe?.parentId == null ? null : String(pe.parentId);
    }
    if (hit) {
      absorbed.push({ id, ancestor: hit });
      continue;
    }
    // 定位插入点：vision 中下一个仍在出口的兄弟之前 / 上一个仍在出口的兄弟之后
    const vi = visionTop.findIndex((s) => String(s.id) === id);
    let at = -1;
    for (let k = vi + 1; k < visionTop.length; k++) {
      const nid = String(visionTop[k].id);
      const idx = sections.findIndex((s) => String(s?.id ?? '') === nid);
      if (idx >= 0) {
        at = idx;
        break;
      }
    }
    if (at < 0) {
      for (let k = vi - 1; k >= 0; k--) {
        const pid = String(visionTop[k].id);
        const idx = sections.findIndex((s) => String(s?.id ?? '') === pid);
        if (idx >= 0) {
          at = idx + 1;
          break;
        }
      }
    }
    if (at < 0) at = sections.length;
    const clone = _deepClone(sec);
    sections.splice(at, 0, clone);
    exitAllIds.add(id);
    restored.push({ id, at, title: String(sec.title ?? sec.header?.title ?? '') });
  }

  // 嵌套层 missing：只计数，不补建（跨层补建会错挂父）
  for (const id of visionMap.keys()) {
    if (topSeen.has(id) || exitAllIds.has(id)) continue;
    if (skipIds.has(id)) {
      dedupeDropped.push(id);
      continue;
    }
    nestedMissing.push(id);
  }

  const exitAfter = collectSectionIdMap(sections);
  // 🔴 口径：`missingAfter` = 「**未被解释**的缺失」。absorbed（内容已被出口段子树消费）、
  //   dedupeDropped（合法收敛）与 undecidable（观测能力缺失 ⇒ 不可判）虽不在出口 id 集中，
  //   但缺口分别已被解释或无法判定 ⇒ 均不计入；否则真机 `48:5888` 被 `565:3` 吸收后仍报
  //   missing=1 ⇒ blocked 恒真 = 判据自我否定；而「缺 figma 索引」这种观测缺陷若计入，
  //   会把 fail-open 变成 fail-closed（任何没有 figma 树的调用方一律被拦）。
  const explained = new Set([
    ...absorbed.map((a) => a.id),
    ...dedupeDropped,
    ...undecidable.map((u) => u.id),
  ]);
  let missingAfter = 0;
  for (const id of visionMap.keys()) {
    if (exitAfter.has(id) || explained.has(id)) continue;
    missingAfter += 1;
  }

  return {
    sections,
    restored,
    absorbed,
    dedupeDropped,
    undecidable,
    nestedMissing,
    missingBefore,
    missingAfter,
    blocked: missingAfter > 0 || nestedMissing.length > 0,
  };
}

function missingCountOf(visionMap, exitIds) {
  let n = 0;
  for (const id of visionMap.keys()) if (!exitIds.has(id)) n += 1;
  return n;
}

function _deepClone(v) {
  if (v == null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(_deepClone);
  const out = {};
  for (const k of Object.keys(v)) out[k] = _deepClone(v[k]);
  return out;
}

/** 在段树中按 id 找 title（找不到返回 ''）。 */
function _titleOf(sections, targetId) {
  const found = _findById(sections, targetId);
  return typeof found?.title === 'string' ? found.title : '';
}

function _findById(sections, targetId) {
  for (const sec of Array.isArray(sections) ? sections : []) {
    if (!sec || typeof sec !== 'object') continue;
    if (String(sec.id ?? '') === targetId) return sec;
    const hit = _findById(sec.children, targetId);
    if (hit) return hit;
  }
  return null;
}

/**
 * 🛡️ F2 R11-B 追踪配套：内容指纹（长度 + djb2）。
 * 用途：归位后与最终写盘前各取一次指纹，不一致 ⇒ 归位成果被后段 pass 覆写。
 * 只读、零依赖，djb2 对等值比较足够（非加密用途）。
 * @param {string} content
 * @returns {string} "len:hash"
 */
export function contentFingerprint(content) {
  if (typeof content !== 'string') return 'non-string';
  let h = 5381;
  for (let i = 0; i < content.length; i++) {
    h = ((h << 5) + h + content.charCodeAt(i)) | 0;
  }
  return `${content.length}:${(h >>> 0).toString(16)}`;
}
