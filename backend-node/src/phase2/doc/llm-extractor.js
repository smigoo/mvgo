/**
 * D2 LLM 轻量提取器（仅 interactions + funcDesc 两维，~1-2K Token）
 * 设计：依赖注入 invokeLLM（可测试可替换），核心逻辑 = prompt 构建 + 响应解析 + 结构校验
 * 纪律：输出仅按 Schema，禁止臆造字段；提取不到返回空数组/空摘要，不阻塞
 */

/** 构建交互设计提取 prompt（component-agnostic） */
function buildInteractionsPrompt(sectionContent) {
  return `你是需求文档结构化提取器。从以下「交互设计」段落中提取交互行为清单。

## 交互设计原文
${sectionContent}

## 任务
提取每个交互行为，返回 JSON 数组（纯 JSON，不要 markdown 围栏）：
[
  {
    "trigger": "触发方式（如：点击系统面板）",
    "behavior": "行为描述（如：收起其他面板，展开当前明细）",
    "type": "交互类型归类（accordion/toggle/drilldown/switch/input/other）",
    "target": "作用目标元素（无法确定则为 null）"
  }
]

## 规则
- 只提取原文明确描述的交互，禁止推测补充
- 初始化/数据加载类描述不属于交互，不要提取
- 原文无交互描述时返回 []`;
}

/** 构建功能说明摘要 prompt */
function buildFuncDescPrompt(sectionContent) {
  return `你是需求文档结构化提取器。从以下「功能说明」段落中提取摘要信息。

## 功能说明原文
${sectionContent}

## 任务
返回 JSON 对象（纯 JSON，不要 markdown 围栏）：
{
  "summary": "一句话功能摘要（30字内）",
  "targetUser": "目标用户（原文有则提取，无则 null）",
  "dataSource": "数据来源系统（原文有则提取，无则 null）",
  "keywords": ["功能涉及的核心名词，3-8个，必须是原文中出现的词"]
}

## 规则
- 所有字段只能来自原文，禁止推测
- keywords 必须是原文中实际出现的名词`;
}

/** 健壮 JSON 解析（去围栏/提取首个 JSON 结构/容错） */
function parseLLMJson(raw, expectType) {
  if (!raw || typeof raw !== 'string') return null;
  let cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const match = expectType === 'array'
    ? cleaned.match(/\[[\s\S]*\]/)
    : cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (expectType === 'array' && !Array.isArray(parsed)) return null;
    if (expectType === 'object' && (typeof parsed !== 'object' || Array.isArray(parsed))) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** interactions 结构校验（只保留合法字段） */
function sanitizeInteractions(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((i) => i && typeof i === 'object' && (i.trigger || i.behavior))
    .map((i) => ({
      trigger: String(i.trigger || ''),
      behavior: String(i.behavior || ''),
      type: ['accordion', 'toggle', 'drilldown', 'switch', 'input', 'other'].includes(i.type) ? i.type : 'other',
      target: i.target ? String(i.target) : null,
    }));
}

/** funcDesc 结构校验 */
function sanitizeFuncDesc(obj) {
  if (!obj || typeof obj !== 'object') return { summary: '', targetUser: null, dataSource: null, keywords: [] };
  return {
    summary: String(obj.summary || ''),
    targetUser: obj.targetUser ? String(obj.targetUser) : null,
    dataSource: obj.dataSource ? String(obj.dataSource) : null,
    keywords: Array.isArray(obj.keywords) ? obj.keywords.map(String).filter(Boolean).slice(0, 8) : [],
  };
}

/**
 * 主入口
 * @param {object} sections - { interactions?: string, funcDesc?: string } 章节原文
 * @param {function} invokeLLM - async (prompt: string) => string，由调用方注入（真实 LLM 或 mock）
 */
async function extract(sections, invokeLLM) {
  const result = { interactions: [], funcDesc: null, llmUsed: [] };

  if (sections.interactions && sections.interactions.trim().length > 10) {
    const raw = await invokeLLM(buildInteractionsPrompt(sections.interactions));
    result.interactions = sanitizeInteractions(parseLLMJson(raw, 'array'));
    result.llmUsed.push('interactions');
  }

  if (sections.funcDesc && sections.funcDesc.trim().length > 10) {
    const raw = await invokeLLM(buildFuncDescPrompt(sections.funcDesc));
    result.funcDesc = sanitizeFuncDesc(parseLLMJson(raw, 'object'));
    result.llmUsed.push('funcDesc');
  }

  return result;
}

module.exports = { extract, buildInteractionsPrompt, buildFuncDescPrompt, parseLLMJson, sanitizeInteractions, sanitizeFuncDesc };
