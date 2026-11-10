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
