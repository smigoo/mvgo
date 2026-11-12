/**
 * MatchChecker — 文档-组件匹配检测器（实测修正版）
 * 分层分工：确定性层 = 召回（候选 + 证据透明），LLM 层 = 精确（看证据纠错）
 * 实测修正：C1 多结构加载 / C2 元素名匹配 / C3 注释过滤同源 / C4 证据透明 / C5 枚举证据 / C6 条件元素
 */
const { ANNOTATION_PREFIXES, CONDITIONAL_ELEMENT_RE } = require('./doc-patterns');

// ---------- 文本归一与相似度 ----------
function normalize(s) {
  return String(s || '').toLowerCase().replace(/[\s\-_（）()【】\[\]:：]/g, '');
}
function lcsLen(a, b) {
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp[m][n];
}
/** LCS 相似度（实测教训：后缀共享中文标签用子序列/字符集均假阳性，LCS+证据透明为准） */
function similarity(a, b) {
  const na = normalize(a), nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  return lcsLen(na, nb) / Math.max(na.length, nb.length);
}

// ---------- Figma 数据加载（C1 多结构兼容） ----------
function loadFigmaRoot(figmaData) {
  if (!figmaData) return null;
  return figmaData.document || figmaData;
}

/** 递归提取 TEXT 节点 + 注释过滤（C3 与管线 pruneRedundantFields 同源规则） */
function extractVisualTexts(figmaRoot) {
  const texts = [];
  const walk = (node, depth) => {
    if (!node || depth > 12) return;
    if (node.type === 'TEXT' && node.characters) texts.push(node.characters);
    (node.children || []).forEach((c) => walk(c, depth + 1));
  };
  walk(figmaRoot, 0);
  const dropped = [];
  const clean = texts.filter((t) => {
    const isAnnotation = ANNOTATION_PREFIXES.some((p) => t.trim().startsWith(p));
    if (isAnnotation) dropped.push(t);
    return !isAnnotation;
  });
  return { texts, clean, dropped };
}

// ---------- 枚举证据（C5） ----------
/** 从描述提取 (a/b/c) 并列名词，计算子项命中 */
function enumerationEvidence(description, cleanTexts) {
  const m = String(description || '').match(/[（(]([^（）()/]+(?:\/[^（）()/]+)+)[）)]/);
  if (!m) return null;
  const nouns = m[1].split('/').map((s) => s.trim()).filter(Boolean);
  const hits = nouns.filter((n) =>
    cleanTexts.some((t) => normalize(t).includes(normalize(n)) || normalize(n).includes(normalize(t))),
  );
  return { nouns, hitCount: hits.length, total: nouns.length, hit: hits.length / nouns.length >= 0.6, source: m[1] };
}

// ---------- 条件元素（C6） ----------
function isConditionalElement(element) {
  return CONDITIONAL_ELEMENT_RE.test(element.description || '');
}

// ---------- 信号计算 ----------
/** S1 元素重合率（元素名匹配 + 枚举证据 + 条件元素 + 证据透明） */
function computeS1(uiElements, cleanTexts) {
  const matches = [];
  let hit = 0;
  for (const el of uiElements || []) {
    const name = el.paramName || el.name || '';
    // 最佳匹配（证据透明：记录匹配对象与分数）
    let bestText = '', bestScore = 0;
    for (const t of cleanTexts) {
      const sc = similarity(name, t);
      if (sc > bestScore) { bestScore = sc; bestText = t; }
    }
    const directHit = bestScore > 0.5;
    const conditional = isConditionalElement(el);
    const enumEv = enumerationEvidence(el.description, cleanTexts);
    const effectiveHit = directHit || (enumEv && enumEv.hit);

    if (effectiveHit || conditional) hit++; // 条件元素不扣分
    matches.push({
      element: name,
      matched: directHit,
      matchedText: directHit ? bestText : null,   // 证据透明（↔"文本"(分数)）
      score: Number(bestScore.toFixed(2)),
      enumEvidence: enumEv && enumEv.total ? `${enumEv.hitCount}/${enumEv.total}（${enumEv.source}）` : null,
      enumHit: enumEv ? enumEv.hit : false,
      conditional,
      note: conditional ? '条件显示元素，未命中不扣分' : null,
    });
  }
  const total = (uiElements || []).length || 1;
  return { score: hit / total, hit, total: (uiElements || []).length, matches };
}

/** S2 关键文本重合 */
function computeS2(keywords, cleanTexts) {
  const detail = (keywords || []).map((kw) => ({
    keyword: kw,
    hit: cleanTexts.some((t) => normalize(t).includes(normalize(kw))),
  }));
  const hit = detail.filter((d) => d.hit).length;
  return { score: keywords && keywords.length ? hit / keywords.length : 0, hit, total: (keywords || []).length, detail };
}

/** S3 名称语义 */
function computeS3(docModuleName, figmaNodeName) {
  const figmaName = String(figmaNodeName || '').replace(/^cp-/, '');
  return { score: similarity(docModuleName, figmaName), docName: docModuleName, figmaName };
}

// ---------- 主入口 ----------
const WEIGHTS = { s1: 0.4, s2: 0.2, s3: 0.3, s4: 0.1 };

/**
 * @param {object} docAnalysis - doc-analysis.json（uiElements/events/dataBinding 等）
 * @param {object} figmaData - figma-node-data.json（任意包装结构）
 * @param {object} options - { keywords?: string[], s4Score?: number, weights? }
 */
function check(docAnalysis, figmaData, options = {}) {
  const weights = { ...WEIGHTS, ...(options.weights || {}) };
  const figmaRoot = loadFigmaRoot(figmaData);
  if (!figmaRoot) {
    return { matchLevel: 'unknown', matchScore: 0, reason: 'figma 数据缺失', signals: null };
  }
  const { clean, dropped } = extractVisualTexts(figmaRoot);
  const figmaNodeName = figmaRoot.name || '';

  const s1 = computeS1(docAnalysis.uiElements || [], clean);
  const s2 = computeS2(options.keywords || [], clean);
  const s3 = computeS3(docAnalysis.moduleInfo?.moduleName || '', figmaNodeName);
  const s4Score = options.s4Score !== undefined ? options.s4Score : 0.5;

  const matchScore = s1.score * weights.s1 + s2.score * weights.s2 + s3.score * weights.s3 + s4Score * weights.s4;
  const matchLevel = matchScore >= 0.8 ? 'matched' : matchScore >= 0.5 ? 'partial' : 'mismatched';

  // 不匹配信号（证据化，供 LLM 裁决与用户卡片）
  const mismatchSignals = [];
  for (const m of s1.matches) {
    if (!m.matched && !m.enumHit && !m.conditional) {
      mismatchSignals.push({ dimension: 'S1', element: m.element, evidence: `Figma 中未找到对应元素（最佳候选: ${m.matchedText || '无'}(${(m.score * 100).toFixed(0)}%)）` });
    }
    if (m.matched && m.score < 0.7 && m.matchedText) {
      mismatchSignals.push({ dimension: 'S1', element: m.element, evidence: `疑似误配: "${m.element}" ↔ "${m.matchedText}"(${(m.score * 100).toFixed(0)}%)，待裁决`, needsArbitration: true });
    }
  }
  for (const d of s2.detail.filter((x) => !x.hit)) {
    mismatchSignals.push({ dimension: 'S2', keyword: d.keyword, evidence: `文档关键词「${d.keyword}」在 Figma 文本中未出现` });
  }

  return {
    matchLevel,
    matchScore: Number(matchScore.toFixed(3)),
    signals: {
      s1: { score: Number(s1.score.toFixed(3)), hit: s1.hit, total: s1.total, matches: s1.matches },
      s2: { score: Number(s2.score.toFixed(3)), hit: s2.hit, total: s2.total, detail: s2.detail },
      s3: { score: Number(s3.score.toFixed(3)), docName: s3.docName, figmaName: s3.figmaName },
      s4: { score: s4Score },
    },
    mismatchSignals,
    figmaNodeName,
    visualTextCount: clean.length,
    droppedAnnotations: dropped,
  };
}

module.exports = { check, similarity, normalize, lcsLen, loadFigmaRoot, extractVisualTexts, enumerationEvidence, isConditionalElement, computeS1, WEIGHTS };
