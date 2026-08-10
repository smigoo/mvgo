/**
 * MatchArbitrator — LLM 裁决层（误配纠正）
 * 分层分工：确定性层（match-checker）= 召回（候选+证据透明），本层 = 精确（看证据纠错）
 * 实测依据：后缀共享中文统计标签（XX数/XX率）确定性相似度有天花板
 *   — 「在线设备数↔设备总数(60%)」这类假阳性必须由此层裁决
 * 输入：match-checker 的 s1.matches（含 ↔"匹配文本"(分数) 证据）+ S2 关键词缺失 + 双方摘要
 * 输出：逐条裁决（accepted/rejected/reassigned）+ 修正后匹配清单 + 理由（强制 evidence）
 */

/** 构建裁决 prompt（证据化，强制输出理由） */
function buildArbitrationPrompt({ matches, s2Missing, docSummary, figmaSummary }) {
  const candidates = matches
    .filter((m) => m.matched || m.enumHit)
    .map((m, i) => `${i + 1}. 文档元素「${m.element}」 ↔ Figma文本"${m.matchedText || '(枚举证据)'}"（相似度 ${(m.score * 100).toFixed(0)}%）`)
    .join('\n');

  return `你是文档-组件匹配裁决员。确定性算法已给出候选匹配，但其中可能存在**误配**（中���统计标签常共享后缀如"XX数"，算法无法区分）。

## 候选匹配清单（含证据）
${candidates}

## 辅助证据
- 文档关键词在 Figma 中缺失: ${s2Missing.length ? s2Missing.join('、') : '无'}
- 文档摘要: ${docSummary || '（无）'}
- Figma 组件摘要: ${figmaSummary || '（无）'}

## 裁决规则
1. 语义一致才接受：元素含义必须与 Figma 文本描述的是同一事物
2. 后缀相同不算匹配："在线设备数"↔"设备总数" 是典型误配（共享"设备/数"但含义不同）
3. 若候选文本不对但你能指出更合适的 Figma 文本 → 改判（reassigned）
4. 每条必须给理由，不允许只给结论

## 输出（纯 JSON 数组，不要 markdown 围栏）
[
  {
    "element": "文档元素名",
    "verdict": "accepted | rejected | reassigned",
    "matchedText": "最终认可的 Figma 文本（rejected 为 null，reassigned 为新文本）",
    "reason": "裁决理由（必须基于证据）"
  }
]`;
}

/** 健壮 JSON 解析 */
function parseArbitrationJson(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const m = cleaned.match(/\[[\s\S]*\]/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[0]);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** 裁决结果清洗（只保留合法字段，verdict 白名单） */
function sanitizeVerdicts(arr, originalMatches) {
  if (!Array.isArray(arr)) return [];
  const validVerdicts = ['accepted', 'rejected', 'reassigned'];
  return arr
    .filter((v) => v && typeof v === 'object' && v.element)
    .map((v) => ({
      element: String(v.element),
      verdict: validVerdicts.includes(v.verdict) ? v.verdict : 'rejected',
      matchedText: v.matchedText ? String(v.matchedText) : null,
      reason: String(v.reason || ''),
    }))
    .filter((v) => originalMatches.some((m) => m.element === v.element)); // 只认原候选中的元素
}

/**
 * 主入口
 * @param {object} matchResult - match-checker.check() 的输出
 * @param {object} options - { invokeLLM, docSummary?, figmaSummary?, figmaTexts? }
 * @returns 修正后的匹配结果（含裁决记录）
 */
async function arbitrate(matchResult, options = {}) {
  const { invokeLLM } = options;
  const s1 = matchResult?.signals?.s1;
  if (!s1 || !Array.isArray(s1.matches)) {
    return { arbitrated: false, reason: '无 S1 匹配数据', verdicts: [], adjustedMatches: [] };
  }
  if (!invokeLLM) {
    return { arbitrated: false, reason: '无 LLM 配置（降级保留确定性结果）', verdicts: [], adjustedMatches: s1.matches };
  }

  const s2Missing = (matchResult.signals?.s2?.detail || []).filter((d) => !d.hit).map((d) => d.keyword);

  const prompt = buildArbitrationPrompt({
    matches: s1.matches,
    s2Missing,
    docSummary: options.docSummary,
    figmaSummary: options.figmaSummary,
  });

  const raw = await invokeLLM(prompt);
  const parsed = parseArbitrationJson(raw);
  if (!parsed) {
    return { arbitrated: false, reason: 'LLM 响应解析失败（降级保留确定性结果）', verdicts: [], adjustedMatches: s1.matches };
  }

  const verdicts = sanitizeVerdicts(parsed, s1.matches);

  // 应用裁决修正匹配清单
  const adjustedMatches = s1.matches.map((m) => {
    const v = verdicts.find((x) => x.element === m.element);
    if (!v) return m; // 未裁决的保持原样（枚举证据/条件元素等）
    if (v.verdict === 'rejected') {
      return { ...m, matched: false, rejected: true, matchedText: null, arbitrationReason: v.reason };
    }
    if (v.verdict === 'reassigned') {
      return { ...m, matched: true, matchedText: v.matchedText, reassigned: true, arbitrationReason: v.reason };
    }
    return { ...m, arbitrationReason: v.reason };
  });

  // 修正后统计
  const correctedHit = adjustedMatches.filter((m) => m.matched || m.enumHit || m.conditional).length;
  const rejectedCount = adjustedMatches.filter((m) => m.rejected).length;

  return {
    arbitrated: true,
    verdicts,
    adjustedMatches,
    stats: {
      original: s1.hit,
      corrected: correctedHit,
      rejected: rejectedCount,
      reassigned: adjustedMatches.filter((m) => m.reassigned).length,
    },
  };
}

module.exports = { arbitrate, buildArbitrationPrompt, parseArbitrationJson, sanitizeVerdicts };
