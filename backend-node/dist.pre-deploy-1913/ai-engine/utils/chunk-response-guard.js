/**
 * 🛡️ 分块响应守卫（2026-11-13 · mc-max-1794551009165-7dfc01e9 空壳覆写实锤）
 *
 * ## 事故形态（7dfc01e9）
 *
 * 重试轮 chunk 只请求 `package/index.vue` 的 script 状态段，LLM 越界返回 **8 个文件**
 * 的 script-only 残片（含 TunnelChart/BridgeChart）。管线照单全收后：
 *   - chunk-meta 登记：刀6「非 index.vue 后写覆盖」把完整段登记顶掉；
 *   - allFiles 合并：残片直接替换完整版（5001B → 572B 空壳）；
 *   - 统一终态落盘：空壳落盘，柱状图消失；
 *   - 后续轮 A6 把空壳当完好文件恢复 + 「内容未变化跳过写盘」⇒ 污染固化不可逆。
 *
 * ## 判据（为什么按「残片」收窄，而不是「越界」一刀切）
 *
 * 越界**完整 SFC** 是合法形态（同任务 chunk8 实锤：请求 ContentForecast 一个文件，
 * LLM 捎带产出嵌套图表 ForecastChart.vue 完整版且被宿主 import 消费；越界孤儿的
 * 覆盖度由既有 orphanCheck/覆盖度门禁把关）。越界**残片**（.vue 缺 template）才是
 * 事故形态——子组件不存在分段生成，残片必非法，且正是「残片覆盖完整文件」的凶器。
 *
 * 因此本守卫只剥「.vue 残片」（无论是否在请求清单内——子组件 chunk 返回自身残片
 * 同样非法，剥除后空文件集交由上层截断/重试机制处理）；越界完整文件仅计数放行。
 *
 * ## 消费点（接线一次覆盖全部下游）
 *
 * 在 runChunk 拿到 res.files 后立即 sanitize，下游四个消费者
 * （chunk 缓存/meta 登记、pushChunkSnapshot、allFiles 合并、统一终态落盘）全部只见到干净集合。
 *
 * 纯函数、无副作用（logger 可选）、可单测。
 */

import { isIndexVuePath } from './chunk-meta-files.js';

/** .vue 残片判据：.vue 文件、非 index.vue（index.vue 的 script 段有分段合并机制消费，合法）、缺 <template> */
export function isFragmentVueFile(relPath, content) {
  const p = String(relPath || '');
  if (!/\.vue$/i.test(p)) return false;
  if (isIndexVuePath(p)) return false;
  return !/<template[\s>]/i.test(String(content || ''));
}

/**
 * 剥除分块响应中的 .vue 残片。
 *
 * @param {Record<string,string>} resFiles LLM 响应解析出的文件集
 * @param {{index?:number,title?:string,files?:string[],segmentType?:string}} chunk 分块描述
 * @param {console|object} [logger] 可选 logger（单测可省）
 * @returns {{files: Record<string,string>, metrics: {kept: number, droppedFragments: string[], outOfScopeFull: string[]}}}
 */
export function sanitizeChunkResponse(resFiles, chunk, logger) {
  const files =
    resFiles && typeof resFiles === 'object' && !Array.isArray(resFiles)
      ? resFiles
      : {};
  const requested = new Set(
    (Array.isArray(chunk?.files) ? chunk.files : []).map((f) => String(f)),
  );
  const kept = {};
  const droppedFragments = [];
  const outOfScopeFull = [];
  for (const [path, content] of Object.entries(files)) {
    if (isFragmentVueFile(path, content)) {
      // 残片一律剥除（越界残片=7dfc01e9 事故形态；请求内残片=子组件不存在分段生成）
      droppedFragments.push(path);
      continue;
    }
    if (!requested.has(path)) {
      // 越界完整文件：合法捎带形态（chunk8 ForecastChart 实锤），放行 + 计数，
      // 孤儿风险由既有 orphanCheck/覆盖度门禁把关。本轮不扩剥除面。
      outOfScopeFull.push(path);
    }
    kept[path] = content;
  }
  // 观测纪律：计数行恒打（0 也打），「没拦」与「没检出」可区分
  if (typeof logger?.info === 'function') {
    const body = {
      chunk: `${chunk?.index ?? '?'}-${chunk?.title || (chunk?.files || []).join(',')}`,
      requested: requested.size,
      kept: Object.keys(kept).length,
      fragDropped: droppedFragments.length,
      outOfScopeFull: outOfScopeFull.length,
    };
    if (droppedFragments.length > 0) {
      logger.warn?.(
        `⛔ 分块响应守卫：剥除 .vue 残片 ${droppedFragments.length} 个 ${JSON.stringify(body)} dropped=[${droppedFragments.join(',')}]`,
        body,
      );
    } else {
      logger.info(
        `⛔ 分块响应守卫：无残片剥除 ${JSON.stringify(body)}`,
      );
    }
  }
  return { files: kept, metrics: { kept: Object.keys(kept).length, droppedFragments, outOfScopeFull } };
}

/**
 * 越界拒收回灌段（教学层）：把本任务已发生的剥除事实注入后续分块 prompt。
 *
 * 「注入即消费」：调用方传入 notes 数组，本函数取最近 3 条生成文本；
 * 是否清空由调用方决定（建议注入后清空，避免同一事实重复下发）。
 *
 * @param {Array<{chunk: string, dropped: string[]}>} notes
 * @returns {string} 无违规记录时返回空串
 */
export function buildScopeViolationFeedback(notes) {
  if (!Array.isArray(notes) || notes.length === 0) return '';
  const recent = notes.slice(-3);
  const lines = recent.map(
    (n) =>
      `- 分块「${n.chunk}」越界输出了 ${n.dropped.join('、')}（缺 <template> 的残片），已整段丢弃`,
  );
  return `

# ⛔ 输出范围修正（上一批响应被守卫剥除）

${lines.join('\n')}

**残片不会被合并、不会被保存**——只有请求清单内、含完整 <template>/<script>/<style> 的文件才会生效。本次严格只输出请求清单内的文件。`;
}
