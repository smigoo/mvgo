/**
 * @file lite-brief-intact.js — Lite 视觉分析输出（brief）完整性判据
 *
 * 背景（2026-11-12 生产实锤 mv-lite-1794450313160-4d463e6d）：
 *   `VisionAgent#_isAnalysisIntact` 只有一套 **JSON 分析口径**，其结构判据查的是
 *   `sections | charts | interactions`（那是 preview-analysis / visual-parser 的产物键）。
 *   而 Lite 视觉分析（analyzeImage + buildAnalysisPrompt）输出的是 **brief**，键为
 *   `layout / regions / spacing / theme / colors / typography / ...`——
 *   三键一个都不存在 ⇒ 完整 brief 也恒判「JSON 损坏」⇒ **每轮分析都白烧一次
 *   temperature 0→0.6 的高温重试**（且抬温本身会劣化抽取质量）。
 *   同一事故里 codegen 那次（outputKind='sfc'）与本次（outputKind='brief'）是**两个独立白烧点**。
 *
 * 本模块是 brief 口径的**判据唯一来源**：vision-agent 具名导入，禁止在 agent 内另写一份。
 * 与 `lite-truncation-telemetry#missingSfcBlocks`（SFC 口径）同属「Lite 输出结构判据」，
 * 但刻意分文件：SFC 是「三块闭合标签」，brief 是「JSON 对象 + schema 键命中」，
 * 两者判据形态不同，混在一个文件反而制造「同文件即同判据」的错觉。
 *
 * 🔴 语义边界：本判据只回答「这次输出**是不是完整可用的 brief**」，用于决定**要不要高温重试**；
 *    不做修复。宽松修复（缺失字段补默认值、截断 JSON 兜底）归 `lite.service#parseBrief`
 *    + `repair-json.util` 那条链，二者职责不同、不得互相替代。
 */

/**
 * `lite.service#buildAnalysisPrompt` 声明的 brief JSON schema 键（唯一来源见该函数）。
 * 与 prompt 同步由 `lite-brief-intact.spec.ts` 的源码锁保证（prompt 改键 ⇒ 测试红）。
 */
export const BRIEF_SCHEMA_KEYS = [
  'layout',
  'regions',
  'spacing',
  'theme',
  'colors',
  'typography',
  'components',
  'textContent',
  'name',
  'visualDetails',
  'interactions',
];

/**
 * 判定为「完整 brief」所需的最少 schema 键命中数。
 * 取 2 而非 1：单键命中无法区分「模型照 schema 输出但截断在早期字段」
 * 与「模型返回了无关 JSON（如 {"error":"..."} / {"raw":"..."}）」，二者都会只命中 0–1 键。
 * prompt 明确允许字段为空值（`字段缺失时给空字符串或空数组`），故**只要求键存在、不要求值非空**——
 * 静态截图 regions 可以非空、interactions 必然为 []，用「值非空」当判据会把满屏静态稿误判损坏
 * （这正是本次事故的同类错误形态）。
 */
export const BRIEF_MIN_KEY_HITS = 2;

/**
 * Lite 视觉分析输出是否为「完整 brief」。
 * @param {string} content 模型原始输出（可带 ```json 围栏，prompt 要求不带但模型常不听）
 * @returns {boolean} true = 结构完整可消费；false = 截断/损坏/非对象（调用方据此触发自愈重试）
 */
export function isBriefAnalysisIntact(content = '') {
  if (!content || typeof content !== 'string') return false;
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(content);
  const raw = (fence ? fence[1] : content).trim();
  if (!raw) return false;
  let parsed;
  try {
    // 严格解析：中部有非法字符即抛错 ⇒ 判「损坏」（与 json 口径同哲学：损坏则重试一次）
    parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const hits = BRIEF_SCHEMA_KEYS.filter((k) =>
    Object.prototype.hasOwnProperty.call(parsed, k),
  ).length;
  return hits >= BRIEF_MIN_KEY_HITS;
}
