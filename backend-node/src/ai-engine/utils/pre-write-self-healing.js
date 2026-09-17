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

/**
 * @param {Record<string,string>} files 产物文件集（path → content）
 * @param {object} [ctx] 上下文
 * @param {Array} [ctx.resourceDomMapping] 资源映射（未 resolve 的原始映射或已 resolve 均可）
 * @param {string} [ctx.outputPath] 输出路径（resolveResourceDomMapping 磁盘兜底用）
 * @param {Function} [ctx.injectFn] 资源 import 注入函数
 *   （microcode 传 injectResourceImports，vue3 传 injectVue3ResourceUrls；签名均为 (content, mapping, relBase)）
 * @param {object} [deps]
 * @param {object} [deps.logger] 日志器
 * @returns {{ files: Record<string,string>, summary: object }} 自愈后的文件集 + 计数摘要
 */
export function runPreWriteSelfHealing(files, ctx = {}, deps = {}) {
  const { resourceDomMapping, outputPath, injectFn } = ctx;
  const { logger } = deps;
  const result = { ...files };
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

  return { files: result, summary };
}

export default runPreWriteSelfHealing;
