/**
 * 🛡️ pre-write-self-healing.js —— 双链路（microcode / vue3）共用落盘前自愈链（方案 E）。
 *
 * 背景（2026-09-16 治理）：microcode-engineer 每补一个落盘前修复器，vue3-engineer 不会自动获得，
 * 同一类 bug 在双端反复复发（f68aedb6 的 `.value` 误用 + CODE-022 + 运行库 import 缺失在 vue3 全漏）。
 * 本模块把「无产物结构假设」的通用自愈抽成纯函数，两个 engineer 共用；新增守卫只加一处、双端生效。
 *
 * 职责边界（刻意排除以下，保留在 engineer 原位，因含 base-panel 假设或 import.meta）：
 *   - 子组件 import 终验（ensureSubComponentImport，microcode 专属 base-panel 标签提取）
 *   - 内容根容器归一（normalizeRootContainerLayout，依赖 base-panel `.pannel-content` block 假设）
 *   - 覆写后重校验（validateVueScriptSemantics，sfc-semantics.js 含 import.meta，jest CJS 会炸）
 *
 * 全部步骤幂等、只补不删/只修不覆盖；任一异常不阻断（fail-open，交由下游门禁兜底）。
 * 纯函数、零 import.meta、零 backend-root，可独立单测。
 */

import {
  resolveResourceDomMapping,
  ensureRuntimeLibraryImports,
  pruneUnmountedResourceImports,
  stripResourceValueMisuse,
  stripResourceWriteback,
} from './resource-import-guard.js';
import {
  normalizeFlexSourceConflicts,
  normalizeFlexSiblingScale,
} from './flex-sibling-guard.js';
// 🛡️ S6（2026-09-16）：背景 :style 补全自愈（backgroundImage 缺 size/repeat/position → 补默认值）
import { ensureBackgroundStyleComplete } from './post-process.js';
// 🛡️ D1（2026-09-20）：per-card 样式确定性改写（bg 图/数值色/icon 按 vision 真值）
import { enforceCardVisualTruth } from './card-visual-truth-rewriter.js';

/**
 * @param {Record<string,string>} files 产物文件集（path → content）
 * @param {object} [ctx] 上下文
 * @param {Array} [ctx.resourceDomMapping] 资源映射（未 resolve 的原始映射或已 resolve 均可）
 * @param {string} [ctx.outputPath] 输出路径（resolveResourceDomMapping 磁盘兜底用）
 * @param {Function} [ctx.injectFn] 资源 import 注入函数
 *   （microcode 传 injectResourceImports，vue3 传 injectVue3ResourceUrls；签名均为 (content, mapping, relBase)）
 * @param {Array} [ctx.effectiveSections] planner section 树（D1 per-card 真值源，含 F1 回填的 body.items）
 * @param {object} [deps]
 * @param {object} [deps.logger] 日志器
 * @returns {{ files: Record<string,string>, summary: object }} 自愈后的文件集 + 计数摘要
 */
/**
 * 🛡️ A2（2026-09-29）：同一资源 var 在同一 .vue 内被多处 backgroundImage 引用（卡根 cover + 内层 bg-m 100%）。
 * 确定性收口：保留「内层」那处（bg-[m] 语义背景层），剥离「section 根（带 data-section-id）」上的那处。
 * 命名无关：判据只用 data-section-id 存在性 + 同一 var 是否在模板更深处重复引用。
 * 保守：仅当根元素带 data-section-id 且其 backgroundImage 引用的 var 在更深处也有 backgroundImage 时，才剥离根处。
 */
export function stripDuplicateSectionRootBg(content) {
  if (typeof content !== 'string' || !content) return content;
  const tpl = content.match(/<template>([\s\S]*?)<\/template>/i);
  if (!tpl) return content;
  const tplBody = tpl[1];
  const rootRe = /<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>])*?data-section-id="[^"]+"(?:"[^"]*"|'[^']*'|[^>])*)>/;
  const rm = tplBody.match(rootRe);
  if (!rm) return content;
  const rootTag = rm[0];
  const afterRoot = tplBody.slice(rm.index + rootTag.length);
  // 根元素上「url(' + v + ')」拼接形态的 bg 变量
  const vars = [...rootTag.matchAll(/url\(\s*['"]\s*\+\s*(\w+)\s*\+\s*['"]\s*\)/g)].map((m) => m[1]);
  if (vars.length === 0) return content;
  let newRoot = rootTag;
  let changed = false;
  for (const v of vars) {
    // 该 var 在模板更深处（内层 bg 层）也出现 → 剥离根上这一处
    if (!new RegExp(`url\\([\\s\\S]{0,20}${v}`).test(afterRoot)) continue;
    const clause = new RegExp(
      `backgroundImage\\s*:\\s*['"\`]url\\(['"\`]\\s*\\+\\s*${v}\\s*\\+\\s*['"\`]\\)['"\`]\\s*,?\\s*`,
      'g',
    );
    const next = newRoot.replace(clause, '');
    if (next !== newRoot) {
      newRoot = next;
      changed = true;
    }
  }
  if (!changed) return content;
  return content.replace(rootTag, newRoot);
}

/**
 * 🛡️ 2026-09-29 治本（mc-max-1790678096786-f5cac254 实锤）：
 * 把「自闭合斜杠 ` /` 之后仍跟属性」的**畸形开始标签**还原为规范写法。
 *
 * 病灶（N3「bg→父容器强制挂载」对**自闭合**元素拼接 `:style` 时，把属性写到了 `/` 的后面）：
 *   `<ContentDefault :class="…" / :style="{ … }">`   ← 畸形：`/` 与 `>` 之间夹着 `:style`
 * 规范：
 *   `<ContentDefault :class="…" :style="{ … }" />`
 *
 * 后果链：`@vue/compiler-sfc` 报 `Illegal '/' in tags.` + `Element is missing end tag.`
 *   → 写盘门禁 `validateVueSfc` 判死 → **整文件被跳过**（进 `component-meta.json#gateSkippedFiles`）
 *   → 产物缺失（磁盘/workspace 均无 `package/index.vue`）→ 前端「组件资源加载失败 / 找不到文件」。
 *   全语料 68 个任务带 `gateSkippedFiles`，其中 **21 个**跳过的正是 `package/index.vue`
 *   （含 `f5cac254` / `428bda42` / `cf90ebda` / `8c815194` / `6e065bd7` / `b37db550` …）⇒ 复发型 P0。
 *
 * 判据（命名无关、纯局部语法、零产物结构假设）：
 *   ① 只处理**开始标签**（`<` 后紧跟字母），天然跳过 `</x>` / `<!-- -->` / `<!doctype` / `<?xml`；
 *   ② 标签内**引号之外**（`"` `'` `` ` `` 三种引号均不可穿透）存在「属性位斜杠」：
 *      斜杠之后（跳过空白）仍跟着一个属性 token（`@` / `:` / `v-` / 字母开头，且该 token 以 `=` 收尾
 *      或直接到标签尾）—— 即「`/` 后面还有属性」，这在语法上只可能是错位；
 *      `href=/foo`（斜杠后**无**空白）与 `http://…`（引号内）**天然不命中**；
 *   ③ 命中即：删掉该斜杠，并统一在标签收尾 `>` 之前补一个 ` /`。
 *
 * 幂等：修复后属性位不再存在「后跟属性」的斜杠 ⇒ 二次调用零改动（已实测）。
 * 保守：`<br/>`、`<X a="1" />`、属性值内的 `/`（URL / 正则 / 模板字符串）一律不动；
 *       解析不出结束 `>` 的标签（未闭合引号等）整段跳过，交给下游门禁兜底（fail-open）。
 *
 * @param {string} source SFC / 模板全文
 * @returns {string} 修复后的全文（无命中时**原样返回**，引用相等）
 */
export function repairSelfClosingSlashInsideTag(source) {
  if (typeof source !== 'string' || source.length === 0) return source;
  if (source.indexOf('/') < 0) return source;
  return source.replace(
    /<([a-zA-Z][\w.:-]*)((?:"[^"]*"|'[^']*'|`[^`]*`|[^>"'`])*)>/g,
    (full) => repairTagSlash(full),
  );
}

/**
 * 单个开始标签的斜杠错位修复。抽成独立函数以便复用与单测。
 * @param {string} tag 形如 `<X a="1" / b="2">` 的完整开始标签（含 `<` 与 `>`）
 * @returns {string} 修复后标签（无命中时原样返回）
 */
function repairTagSlash(tag) {
  const inner = tag.slice(1, -1);
  // ① 标记「引号之外」的字符位置：`"` / `'` / 反引号包裹的内容一律视为不可穿透，
  //    这样 URL（`http://`）、模板串（`` `url(${bg2})` ``）、含 `/` 的正则都不会误判。
  const outside = [];
  let quote = null;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    outside.push(i);
  }
  // ② 找「斜杠之后仍跟属性」的属性位斜杠（` / :style=` 的 `/`，而非收尾的 ` />` 的 `/`）。
  const hits = [];
  for (const i of outside) {
    if (inner[i] !== '/') continue;
    const after = inner.slice(i + 1);
    if (
      !/^\s+[@:a-zA-Z][\w.:-]*\s*=/.test(after) &&
      !/^\s+[@:a-zA-Z][\w.:-]*\s*$/.test(after)
    ) {
      continue;
    }
    hits.push(i);
  }
  if (hits.length === 0) return tag;
  // ③ 从后往前删斜杠（避免下标漂移），再统一在标签尾补 ` /`。
  let out = inner;
  for (let k = hits.length - 1; k >= 0; k--) {
    const i = hits[k];
    out = out.slice(0, i) + out.slice(i + 1);
  }
  return '<' + out.replace(/\s+$/, '') + ' />';
}

export function runPreWriteSelfHealing(files, ctx = {}, deps = {}) {
  const { resourceDomMapping, outputPath, injectFn, effectiveSections } = ctx;
  const { logger } = deps;
  let result = { ...files };
  const summary = {
    resourceInject: 0,
    runtimeImport: 0,
    pruned: 0,
    valueFixed: 0,
    writebackFixed: 0,
    flex003: 0,
    flex005: 0,
    bgStyleComplete: 0,
  };

  // ① 资源 import 终验兜底注入（幂等只补缺失，绝不删已有）。
  const mapping = resolveResourceDomMapping(resourceDomMapping, outputPath);
  if (typeof injectFn === 'function' && Array.isArray(mapping) && mapping.length > 0) {
    for (const [fp, fc] of Object.entries(result)) {
      if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
      const relBase = /^package\/components\//.test(fp)
        ? '../../resources/images/'
        : '../resources/images/';
      const injected = injectFn(fc, mapping, relBase);
      if (injected !== fc) {
        result[fp] = injected;
        summary.resourceInject++;
        logger?.info?.('🛡️ 资源 import 终验兜底注入（落盘前）', { file: fp });
      }
    }
  }

  // ② 运行库 import 兜底（vue/echarts 只补缺失）。
  for (const [fp, fc] of Object.entries(result)) {
    if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
    const ensured = ensureRuntimeLibraryImports(fc);
    if (ensured !== fc) {
      result[fp] = ensured;
      summary.runtimeImport++;
      logger?.info?.('🛡️ 运行库 import 兜底补齐（落盘前）', { file: fp });
    }
  }

  // ③ CODE-022 修复器（未挂载的资源 import 确定性删除）。
  //
  // 🗑️ 已删除（2026-09-29，删减法）：此前的「③-a CODE-022 图标自愈」（mountUnusedResourceIcons）
  //   与 ③ 是**方向相反而候选域不等**的一对：
  //   - 门禁 findUnmountedResourceVars 的候选域 = 本文件 `<script>` 里 import 了的资源；
  //   - 该自愈器的候选域 = **整个 mapping 的 icon**（`for (const [varName] of varToMapping)`）。
  //   二者只共用 isResourceVarMounted 谓词、不共用候选集 ⇒ 差值全是「映射里有、本文件没 import」
  //   ⇒ 挂上去就是**悬空引用**，必然被「覆写后语义校验」判死。实测：触发 121 次 → 回退 121 次
  //   （1:1 全废），且回退是**按文件整批**的，连带把 S6 背景补全 / CODE-028 等合法修复一起作废。
  //   本函数上线前，同名自愈器 autoMountUnusedIcons 已被 81e9a08「删减法批次2-loop1」明令删除
  //   （资源挂载改为 owner 驱动计划化：buildResourceMountPlan + mountPlannedResources）。
  //   复活版同时违背当时确立的三条（owner 驱动 / fail-closed / 候选域正确），故本次彻底移除。
  //   图标若要挂载，唯一正道 = mapping.ownerSectionId ⨯ 产物 data-section-id 的确定性计划。
  if (Array.isArray(mapping) && mapping.length > 0) {
    for (const [fp, fc] of Object.entries(result)) {
      if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
      try {
        const pr = pruneUnmountedResourceImports(fc, mapping);
        if (pr.changed) {
          result[fp] = pr.content;
          summary.pruned += pr.pruned.length;
          logger?.warn?.('🛡️ CODE-022 修复：删除未挂载的资源 import', {
            file: fp,
            pruned: pr.pruned,
          });
        }
      } catch (err) {
        logger?.warn?.('🛡️ CODE-022 修复器异常（非阻断）', {
          file: fp,
          error: err?.message || String(err),
        });
      }
    }
  }

  // ④ .value 误用自愈（CODE-027）：静态 import 图片变量写 X.value → 去掉 .value。
  for (const [fp, fc] of Object.entries(result)) {
    if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
    const stripped = stripResourceValueMisuse(fc);
    if (stripped !== fc) {
      result[fp] = stripped;
      summary.valueFixed++;
      logger?.warn?.('🛡️ CODE-027 修复：静态资源 .value 误用已去掉 .value', { file: fp });
    }
  }

  // ④-b CODE-028 自愈（2026-09-17 · ef00bb27 实锤）：静态 import 图片变量被写回 → 删除。
  // 注入侧把 `const bg2 = ref('')` 换成只读 `import bg2` 后，残留 `bg2.value = props.bg2`
  // （经 ④ 变 `bg2 = props.bg2`）→ 对 ESM 只读绑定赋值 → 运行时 "bg2 is read-only." → 渲染失败。
  // 只读绑定不可写，这些写回语句既无效又致命，确定删除（正确写法直接引用 props.bg2）。
  // 必须排在 .value 自愈（④）之后：先 `X.value`→`X`，再删裸 `X = ...`，避免二次残留。
  for (const [fp, fc] of Object.entries(result)) {
    if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
    const stripped = stripResourceWriteback(fc);
    if (stripped !== fc) {
      result[fp] = stripped;
      summary.writebackFixed = (summary.writebackFixed || 0) + 1;
      logger?.warn?.('🛡️ CODE-028 修复：删除对静态资源只读绑定的写回（避免 "is read-only"）', { file: fp });
    }
  }

  // ④-c A2（2026-09-29）：同一资源 var 在同一 .vue 内被多处 backgroundImage 引用（卡根 cover + 内层 bg-m 100%）。
  // 确定性收口：保留「内层」那处（bg-[m] 语义背景层），剥离「section 根（带 data-section-id）」上的那处。
  for (const [fp, fc] of Object.entries(result)) {
    if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
    const deduped = stripDuplicateSectionRootBg(fc);
    if (deduped !== fc) {
      result[fp] = deduped;
      summary.a2Dedup = (summary.a2Dedup || 0) + 1;
      logger?.warn?.('🛡️ A2 修复：剥离 section 根上重复的背景引用（保留内层 bg 层）', { file: fp });
    }
  }

  // ⑤ FLEX-003 量纲归一（同 class 跨文件 flex grow 量纲冲突 → 像素量级）。
  const flexArr = Object.entries(result).map(([path, content]) => ({ path, content }));
  const flexNormalized = normalizeFlexSourceConflicts(flexArr);
  if (flexNormalized !== flexArr) {
    for (const nf of flexNormalized) {
      const prev = result[nf.path];
      if (prev !== undefined && prev !== nf.content) {
        result[nf.path] = nf.content;
        summary.flex003++;
      }
    }
    if (summary.flex003 > 0) {
      logger?.info?.('🛡️ FLEX-003 量纲归一（落盘前）', { files: summary.flex003 });
    }
  }

  // ⑥ FLEX-005 量纲归一（兄弟 class 量纲混用 → 等分 flex:1 1 0）。
  const flexSiblingArr = Object.entries(result).map(([path, content]) => ({ path, content }));
  const flexSiblingNormalized = normalizeFlexSiblingScale(flexSiblingArr);
  if (flexSiblingNormalized !== flexSiblingArr) {
    for (const nf of flexSiblingNormalized) {
      const prev = result[nf.path];
      if (prev !== undefined && prev !== nf.content) {
        result[nf.path] = nf.content;
        summary.flex005++;
      }
    }
    if (summary.flex005 > 0) {
      logger?.info?.('🛡️ FLEX-005 量纲归一（落盘前，统一到比例量级）', {
        files: summary.flex005,
      });
    }
  }

  // ⑦ 背景 :style 补全自愈（缺 size/repeat/position → inferBackgroundStyle，无 mapping 才兜底铺满）。
  for (const [fp, fc] of Object.entries(result)) {
    if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
    const completed = ensureBackgroundStyleComplete(fc, mapping);
    if (completed !== fc) {
      result[fp] = completed;
      summary.bgStyleComplete++;
      logger?.warn?.('🛡️ S6 修复：背景 :style 补全 size/repeat/position', { file: fp });
    }
  }

  // ⑨ D1 per-card 样式确定性改写（2026-09-20 · mc-1789869245851 实锤）：
  //   F1 已把 vision 卡片语义送进 prompt，但 LLM 对「同形资源」（bg-124/125/126）与
  //   「色值写法」仍随机漂移。此处按 effectiveSections 的 body.items 真值在落盘前
  //   确定性改写：bg 图引用 / 数值颜色 / icon 文件。归属不明（多卡声明同文件）时跳过。
  if (Array.isArray(effectiveSections) && effectiveSections.length > 0) {
    try {
      const d1 = enforceCardVisualTruth(result, effectiveSections, {
        logger,
        resourceDomMapping: mapping,
      });
      result = d1.files;
      summary.d1BgFixed = d1.summary.bgFixed;
      summary.d1ColorFixed = d1.summary.colorFixed;
      summary.d1IconFixed = d1.summary.iconFixed;
      summary.d1BgInjected = d1.summary.bgInjected || 0;
      summary.d1ImgSized = d1.summary.imgSized || 0;
      summary.d1Skipped = d1.summary.skipped;
    } catch (d1Err) {
      logger?.warn?.('🛡️ D1 per-card 改写异常（fail-open 跳过）', {
        error: d1Err?.message || String(d1Err),
      });
    }
  }

  // ⑧ data-section-id 重复锚定检测（2026-09-19 · mc-max-1789811323065 实锤）：
  //   R2 element-group 拆分 + scopedInput 缓存污染曾导致两个子组件都锚定同一 section
  //   （ContentSection 与 ContentSection5 均写 data-section-id="136:127"）→ 卡片内容
  //   同源混淆、危化品车整卡丢失。同一 section id 只应由一个组件渲染；重复 = 锚定错位。
  //   本步骤 fail-open：只检测告警不修改内容（确定性事实不足以自愈「哪个该改」），
  //   issues 汇入 summary 供上游（重试 prompt / 门禁 / 日志取证）消费。
  //   合法豁免：v-for 模板组件（多实例同 id 属正常，子组件文件内模板只有一处）。
  summary.duplicateSectionAnchors = [];
  const anchorMap = new Map(); // sectionId -> [{ file, count }]
  for (const [fp, fc] of Object.entries(result)) {
    if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
    const ids = new Set();
    for (const m of fc.matchAll(/data-section-id="([^"]+)"/g)) {
      ids.add(m[1]);
    }
    for (const sid of ids) {
      if (!anchorMap.has(sid)) anchorMap.set(sid, []);
      anchorMap.get(sid).push({ file: fp });
    }
  }
  for (const [sid, files] of anchorMap) {
    if (files.length > 1) {
      const issue = {
        sectionId: sid,
        files: files.map((f) => f.file),
        hint: '同一 Figma section 被多个组件锚定，疑似 R2 拆分组件归属错位（检查该 section 各分组的成员清单）',
      };
      summary.duplicateSectionAnchors.push(issue);
      logger?.warn?.(
        `🛡️ SECTION-ANCHOR-DUP：section ${sid} 被 ${files.length} 个组件锚定`,
        { files: issue.files },
      );
    }
  }

  return { files: result, summary };
}

export default runPreWriteSelfHealing;
