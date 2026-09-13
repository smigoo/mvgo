/**
 * 🛡️ 软失败评分（2026-09-11）：L0-B 门禁 issue 列表 → 单一 0-100 分 + 维度拆解。
 * 用途：fail-closed 门禁 BLOCK 重试耗尽时，不再写「失败」，而是降级完成 + 展示评分明细
 * （结构 / 资源 / 类名 / 语义 四个维度的小分 + issue 清单），供前端呈现「完成（降级）」。
 * 纯函数、无 import.meta，供 graph 与测试共用。
 */

const DIMENSION_RULES = [
  { dim: '结构', test: /^(CODE-001|CODE-021|COMP-|FLEX-|STRUCT-|EMPTY_ARTIFACT|SFC-COMPILE|CODE-012)/ },
  { dim: '资源', test: /^(CODE-008|CODE-019|CODE-022|RES-)/ },
  { dim: '类名', test: /^(CODE-003|CODE-018|CODE-020)/ },
  { dim: '语义', test: /^(CODE-014|CODE-016|CODE-017|TEXT-|DO-NOT-INVENT|SFC-|LESS-)/ },
];

const BLOCK_PENALTY = 10;
const WARN_PENALTY = 2;
const MAX_ISSUES_PER_DIM = 5; // 单维度明细最多列 5 条，防止超长

function dimensionOf(id = '') {
  const s = String(id || '');
  const hit = DIMENSION_RULES.find((r) => r.test.test(s));
  return hit ? hit.dim : '结构';
}

/**
 * @param {Array<{id:string, severity:string, message:string, file:string}>} issues
 * @returns {{ score:number, blockCount:number, warnCount:number, dimensions:Array }}
 */
export function computeGateScore(issues = []) {
  const list = Array.isArray(issues) ? issues : [];
  const dims = { 结构: [], 资源: [], 类名: [], 语义: [] };
  let totalBlock = 0;
  let totalWarn = 0;

  for (const issue of list) {
    const severity = issue?.severity === 'BLOCK' ? 'BLOCK' : 'WARN';
    if (severity === 'BLOCK') totalBlock += 1;
    else totalWarn += 1;
    dims[dimensionOf(issue?.id)].push({
      id: issue?.id || 'UNKNOWN',
      severity,
      message: String(issue?.message || '').slice(0, 120),
      file: issue?.file || '',
    });
  }

  const score = Math.max(
    0,
    100 - totalBlock * BLOCK_PENALTY - totalWarn * WARN_PENALTY,
  );

  const dimensions = Object.entries(dims).map(([name, issues]) => {
    const blocks = issues.filter((i) => i.severity === 'BLOCK').length;
    const warns = issues.length - blocks;
    const dimScore = Math.max(
      0,
      100 - blocks * BLOCK_PENALTY - warns * WARN_PENALTY,
    );
    return {
      name,
      blockCount: blocks,
      warnCount: warns,
      score: dimScore,
      issues: issues.slice(0, MAX_ISSUES_PER_DIM),
    };
  });

  return { score, blockCount: totalBlock, warnCount: totalWarn, dimensions };
}

// 🛡️ 发布硬闸（2026-09-13）：这些 BLOCK 一旦命中，无论软失败评分如何，都禁止
// publish-to-workspace / copyToWorkspace / 标 completed——它们代表「产物结构确定性地
// 不可用」（死子组件 import 未挂、悬空标签渲染空白、资源只 import 不挂），软失败降级
// 只该放行「布局/视觉欠佳」，不该放行「预览必然空白/缺块」的硬伤。
// 事实源：单一 ids 集 + hasHardPublishBlock 纯函数，graph / service / publisher 三处共用。
const HARD_PUBLISH_BLOCK_IDS = new Set([
  'CODE-021', 'CODE-021-ERROR', // 子组件死代码 import
  'CODE-022', 'CODE-022-ERROR', // 资源变量只 import 不挂载
  'CODE-023', 'CODE-023-ERROR', // 悬空子组件标签（三要素不齐备）
]);

/**
 * 判断 issue 列表中是否存在「禁止发布」的硬闸 BLOCK。
 * @param {Array<{id:string, severity:string}>} issues
 * @returns {boolean}
 */
export function hasHardPublishBlock(issues = []) {
  const list = Array.isArray(issues) ? issues : [];
  return list.some(
    (i) => i?.severity === 'BLOCK' && HARD_PUBLISH_BLOCK_IDS.has(i?.id),
  );
}
