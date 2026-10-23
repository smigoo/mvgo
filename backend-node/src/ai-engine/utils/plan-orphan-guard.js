/**
 * @file plan-orphan-guard.js — 刀 55（2026-10-23 · mc-max-1792718704810-f98f7463 实锤）
 *   「plan 之外的编造组件」确定性移除。
 *
 * ## 病灶（真机产物）
 * 统计行真值是 3 张同构卡（8/总设备、2/运行中、1/离线），产物却出现**两张「运行中/2」**：
 *   · `ContentSection.vue`（`data-section-id=43:4898`）—— plan 内有对应 section，内容正确；
 *   · `ContentSection3.vue` —— **没有** `data-section-id`，是 LLM 凭空复制 `43:4898` 的第 2 份，
 *     且用 `ref('运行中')` / `ref('2')` 写死内容。
 * 后者**不在任何判据网内**：
 *   · 刀 53 家族按「plan section → 组件名」映射接管，无 section ⇒ 从不进 map；
 *   · 刀 54 硬编码门禁按「文本 ∉ Figma 真值」判，「运行中」/「2」**都是真值文本** ⇒ 合法放行
 *     （重复渲染属另一类问题，不是内容臆造）；
 *   · `section-content-guard` 的 duplicate 处置依赖 `removeStaticTextNode`（只认 `>纯文本<`），
 *     `{{ statLabel }}` 形态删不掉 ⇒ 8 条 duplicate 全部 no-op。
 *
 * ## 判据（命名无关、不猜语义、可证伪）
 *   组件 X（`package/components/X.vue`）同时满足：
 *     ① **plan 外**：X 不在 `assignSectionComponentNames(plan.effectiveSections)` 的名集合里
 *        （= plan 里根本没有这个 section，属 LLM 自由发挥）；
 *     ② **内容被完整包含**：X 的可见文本集合非空，且是某个 **plan 内**组件 Y 的可见文本
 *        集合的**子集**（X 没带来任何新内容 ⇒ 删掉零信息损失）；
 *     ③ 存在**唯一**这样的 Y（多个 ⇒ 证据不足，fail-open 不删）。
 *   ⇒ 判定「X 是 Y 的编造副本」，确定性移除：删文件 + 从 index.vue 摘掉标签与 import。
 *
 * ## 边界（阴性对照，务必不误伤）
 *   · X 在 plan 名集合里 ⇒ 不判（plan 认可的组件）；
 *   · 无 `effectiveSections` / 拿不到 nameOf ⇒ 整链 fail-open（无 plan 不能定义「编造」）；
 *   · X 的文本集合**不是**任何 plan 内组件的子集 ⇒ 不判（它带来了新内容，可能是合理拆分）；
 *   · 候选 Y 不唯一 ⇒ 不判；
 *   · 删除会引入新 SFC 错误 ⇒ 回退（沿用既有铁律）。
 *   · `index.vue` / 非 `components/` 下的文件永不作为 X。
 *
 * 纯函数、幂等（删除后 X 已不存在 ⇒ 复跑零命中）。
 */
import { assignSectionComponentNames, collectLeafSections } from './section-tree.js';
import { extractArtifactTextLiterals } from './hardcoded-text-gate.js';

/** 归一化 files 入参：支持 {path:content} 与 [{path,content}]。 */
function normalizeFiles(files) {
  if (!files) return [];
  if (Array.isArray(files)) {
    return files
      .filter((f) => f && typeof f.path === 'string' && typeof f.content === 'string')
      .map((f) => ({ path: f.path, content: f.content }));
  }
  return Object.entries(files)
    .filter(([, c]) => typeof c === 'string')
    .map(([path, content]) => ({ path, content }));
}

/** `package/components/X.vue` → `X`；否则 null。 */
function componentNameOf(path) {
  const m = /^package\/components\/([^/]+)\.vue$/.exec(String(path || ''));
  return m ? m[1] : null;
}

/** 组件可见文本集合（复用刀 54 的抽取器，避免两份实现）。 */
function visibleTexts(content) {
  const set = new Set();
  for (const lit of extractArtifactTextLiterals(content)) {
    if (lit.text) set.add(lit.text);
  }
  return set;
}

/**
 * 检测「plan 之外的编造副本组件」。
 *
 * @param {object} p
 * @param {object|Array} p.files 产物文件
 * @param {object} p.plan subComponentPlan（含 effectiveSections；无 ⇒ fail-open）
 * @returns {{issues:Array, evaluated:number, hits:number, planNames:number,
 *   skippedReason?:string}}
 */
export function detectOrphanDuplicateComponents({ files, plan } = {}) {
  const list = normalizeFiles(files);
  const planNames = new Set();
  let ok = false;
  try {
    const treeSections = Array.isArray(plan?.effectiveSections)
      ? plan.effectiveSections
      : (Array.isArray(plan?.treeSections) ? plan.treeSections : null);
    if (treeSections && collectLeafSections(treeSections).length > 0) {
      for (const n of assignSectionComponentNames(treeSections).values()) planNames.add(String(n));
      ok = true;
    }
  } catch {
    ok = false;
  }
  if (!ok || planNames.size === 0) {
    return {
      issues: [],
      evaluated: 0,
      hits: 0,
      planNames: 0,
      skippedReason: 'no-plan-sections',
    };
  }

  const comps = [];
  for (const f of list) {
    const name = componentNameOf(f.path);
    if (!name) continue;
    comps.push({ path: f.path, name, texts: visibleTexts(f.content) });
  }
  const inPlan = comps.filter((c) => planNames.has(c.name));
  const orphan = comps.filter((c) => !planNames.has(c.name));

  const issues = [];
  let evaluated = 0;
  for (const o of orphan) {
    evaluated += 1;
    if (o.texts.size === 0) continue; // 无内容 ⇒ 不构成「副本」证据
    const hosts = inPlan.filter((y) => y.texts.size > 0 && [...o.texts].every((t) => y.texts.has(t)));
    if (hosts.length !== 1) continue; // 0 = 有新内容；≥2 = 证据不足
    issues.push({
      orphanPath: o.path,
      orphanName: o.name,
      duplicateOf: hosts[0].path,
      duplicateOfName: hosts[0].name,
      texts: [...o.texts].sort(),
    });
  }
  return { issues, evaluated, hits: issues.length, planNames: planNames.size };
}

/** 从 index.vue 摘掉组件标签（自闭合 / 成对）与 import 行。 */
export function stripComponentFromIndex(indexContent, name) {
  if (typeof indexContent !== 'string' || !indexContent || !name) return indexContent;
  const esc = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let out = indexContent;
  // import 行（整行删除）
  out = out.replace(new RegExp(`^\\s*import\\s+${esc}\\s+from\\s+['"][^'"]+['"];?\\s*$`, 'gm'), '');
  // 自闭合标签（可能跨行属性）
  out = out.replace(new RegExp(`\\n?\\s*<${esc}\\b[^>]*?/>`, 'g'), '');
  // 成对标签
  out = out.replace(new RegExp(`\\n?\\s*<${esc}\\b[^>]*?>[\\s\\S]*?</${esc}>`, 'g'), '');
  return out;
}

/**
 * 确定性处置：删除编造副本组件文件 + 从 index.vue 摘除引用。
 *
 * @param {object} p 同 detectOrphanDuplicateComponents，另加：
 * @param {Function} [p.validateSfc] (content, path) => {valid:boolean}
 * @returns {{files:object, removed:Array, residual:Array, evaluated:number, hits:number}}
 */
export function healOrphanDuplicateComponents({ files, plan, validateSfc } = {}) {
  const isMap = files && !Array.isArray(files);
  const list = normalizeFiles(files);
  const det = detectOrphanDuplicateComponents({ files: list, plan });
  const byPath = new Map(list.map((f) => [f.path, f.content]));
  const removed = [];
  const residual = [];

  for (const it of det.issues) {
    const indexPath = 'package/index.vue';
    const idx = byPath.get(indexPath);
    if (typeof idx !== 'string') {
      residual.push({ ...it, reason: 'no-index' });
      continue;
    }
    const nextIdx = stripComponentFromIndex(idx, it.orphanName);
    if (nextIdx === idx) {
      residual.push({ ...it, reason: 'index-ref-not-found' });
      continue;
    }
    if (typeof validateSfc === 'function') {
      let okIdx = true;
      try {
        const r = validateSfc(nextIdx, indexPath);
        okIdx = !r || r.valid !== false;
      } catch {
        okIdx = false;
      }
      if (!okIdx) {
        residual.push({ ...it, reason: 'validateSfc-rejected' });
        continue;
      }
    }
    byPath.set(indexPath, nextIdx);
    byPath.delete(it.orphanPath);
    removed.push({
      path: it.orphanPath,
      duplicateOf: it.duplicateOf,
      texts: it.texts,
    });
  }

  const outFiles = isMap
    ? Object.fromEntries([...byPath.entries()])
    : [...byPath.entries()].map(([path, content]) => ({ path, content }));

  return {
    files: outFiles,
    removed,
    residual,
    evaluated: det.evaluated,
    hits: det.hits,
  };
}

export default detectOrphanDuplicateComponents;
