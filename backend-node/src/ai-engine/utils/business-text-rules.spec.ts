/**
 * 🛡️ 业务术语规则引擎（2026-10-19）
 *
 * 需求来源：用户点单「不要货车卡车，只要小汽车」+ **管线侧根治** + **按组件可配、默认关闭**。
 * 关键事实：Figma 真值里**没有「小汽车」**（0/123），只有客车/货车 ⇒ 只能靠 rewrite + drop。
 *
 * ⚠️ 本 spec **只在 fixture 里出现业务词**（模块本身零硬编码，见模块头注释）。
 */
import {
  parseBusinessTextRules,
  applyBusinessTextRule,
  applyBusinessTextRules,
  isTextAllowedByRules,
  applyRulesToLine,
  applyRulesToFactsBlock,
  buildBusinessTextDirective,
  findForbiddenTexts,
} from './business-text-rules.js';

const RULES = { rewrite: { 客车: '小汽车' }, drop: ['货车', '卡车'] };

describe('parseBusinessTextRules · 规范化 + fail-open', () => {
  it('合法配置 → 规则对象', () => {
    const r = parseBusinessTextRules(RULES);
    expect(r?.rewrite.get('客车')).toBe('小汽车');
    expect(r?.drop.has('货车')).toBe(true);
    expect(r?.drop.has('卡车')).toBe(true);
  });

  it('null / 空 / 非法 ⇒ null（fail-open，绝不猜）', () => {
    expect(parseBusinessTextRules(null)).toBeNull();
    expect(parseBusinessTextRules({})).toBeNull();
    expect(parseBusinessTextRules([])).toBeNull();
    expect(parseBusinessTextRules('x' as any)).toBeNull();
    // 只有非法条目（空串 / 自映射）⇒ 等价于无规则
    expect(parseBusinessTextRules({ rewrite: { '': 'a', b: 'b' }, drop: ['  '] })).toBeNull();
  });
});

describe('applyBusinessTextRule · 先改名后过滤', () => {
  const r = parseBusinessTextRules(RULES)!;

  it('命中 rewrite ⇒ 改名（客车 → 小汽车）', () => {
    expect(applyBusinessTextRule('客车', r)).toMatchObject({
      text: '小汽车',
      rewrittenFrom: '客车',
      dropped: false,
      changed: true,
    });
  });

  it('命中 drop ⇒ 过滤（货车 / 卡车）', () => {
    expect(applyBusinessTextRule('货车', r)).toMatchObject({ dropped: true, text: '' });
    expect(applyBusinessTextRule('卡车', r)).toMatchObject({ dropped: true, text: '' });
  });

  it('未命中 ⇒ 原样返回', () => {
    expect(applyBusinessTextRule('危化品车', r)).toMatchObject({ text: '危化品车', changed: false });
  });

  it('无规则 ⇒ 原样返回（默认关闭时零影响）', () => {
    expect(applyBusinessTextRule('客车', null)).toMatchObject({ text: '客车', changed: false });
  });
});

describe('applyBusinessTextRules · 批量（保序）', () => {
  it('客车→小汽车、货车被删、顺序保持', () => {
    const r = applyBusinessTextRules(['客车', '货车', '客车'], RULES);
    expect(r.texts).toEqual(['小汽车', '小汽车']);
    expect(r.dropped).toEqual(['货车']);
    expect(r.rewritten.length).toBe(2);
  });

  it('无规则 ⇒ 原样不动（默认关闭不影响任何组件）', () => {
    const r = applyBusinessTextRules(['客车', '货车'], null);
    expect(r.texts).toEqual(['客车', '货车']);
    expect(r.dropped).toEqual([]);
  });
});

describe('isTextAllowedByRules · 解 TEXT-TRUTH 冲突（关键）', () => {
  const truth = new Set(['客车', '货车']);

  it('产物写「小汽车」而真值只有「客车」⇒ 判合法（否则 TEXT-TRUTH 会误判臆造而 BLOCK）', () => {
    expect(isTextAllowedByRules('小汽车', truth, RULES)).toBe(true);
  });

  it('产物写「客车」（真值原词）⇒ 仍合法', () => {
    expect(isTextAllowedByRules('客车', truth, RULES)).toBe(true);
  });

  it('产物写无关臆造词 ⇒ 不合法', () => {
    expect(isTextAllowedByRules('飞行器', truth, RULES)).toBe(false);
  });

  it('无规则时只认真值原词（退化到既有行为）', () => {
    expect(isTextAllowedByRules('小汽车', truth, null)).toBe(false);
    expect(isTextAllowedByRules('客车', truth, null)).toBe(true);
  });
});

describe('applyRulesToLine · 下发层行级改写（子串级，非整串精确）', () => {
  it('行内含别名 ⇒ 改名，附加信息（尺寸/颜色）保留', () => {
    const line = '  - 客车 → 文字「客车」 | font:14px | 尺寸:60×20';
    const r = applyRulesToLine(line, RULES);
    expect(r.dropped).toBe(false);
    expect(r.changed).toBe(true);
    expect(r.text).toContain('小汽车');
    expect(r.text).not.toContain('客车');
    // 几何/样式事实必须原样保留（规则只动术语，不动事实）
    expect(r.text).toContain('font:14px');
    expect(r.text).toContain('尺寸:60×20');
  });

  it('行内含禁用词 ⇒ 整行移除（不改名、不留空标签）', () => {
    const r = applyRulesToLine('  - 货车 → 文字「货车」 | font:14px', RULES);
    expect(r.dropped).toBe(true);
    expect(r.text).toBe('');
  });

  it('先 rewrite 再 drop：改名后的值不会被禁用词误删', () => {
    // 「客车」→「小汽车」，而 drop 里没有「小汽车」⇒ 保留
    const r = applyRulesToLine('客车', { rewrite: { 客车: '小汽车' }, drop: ['小汽车'] });
    expect(r.dropped).toBe(true); // 配置自洽性问题：明确列进 drop 就照删（如实执行）
  });

  it('无规则 ⇒ 原样返回（默认关闭零影响）', () => {
    const line = '  - 客车 → 文字「客车」';
    expect(applyRulesToLine(line, null).text).toBe(line);
    expect(applyRulesToLine(line, {}).text).toBe(line);
  });
});

describe('applyRulesToFactsBlock · 事实文本块逐行处理', () => {
  const block = [
    '## 语义化样式真值',
    '  - 客车 → 文字「客车」 | font:14px',
    '  - 货车 → 文字「货车」 | font:14px',
    '  - 卡片 → 背景:#fff | 尺寸:120×80',
  ].join('\n');

  it('改写命中行 + 移除禁用行 + 保留无关行', () => {
    const r = applyRulesToFactsBlock(block, RULES);
    expect(r.rewrittenLines).toBe(1);
    expect(r.droppedLines).toBe(1);
    expect(r.text).toContain('小汽车');
    expect(r.text).not.toContain('货车');
    expect(r.text).toContain('卡片 → 背景:#fff'); // 无关行不动
  });

  it('无规则 ⇒ 文本完全不变（零回归硬断言）', () => {
    expect(applyRulesToFactsBlock(block, null).text).toBe(block);
  });
});

describe('buildBusinessTextDirective · 业务口径指令', () => {
  it('有规则 ⇒ 含改写与禁用两条口径，且覆盖图表 series/legend', () => {
    const d = buildBusinessTextDirective(RULES);
    expect(d).toContain('小汽车');
    expect(d).toContain('货车');
    expect(d).toContain('series'); // 必须点名图表，否则 LLM 只改模板漏改图例
    expect(d).toContain('legend');
  });

  it('无规则 ⇒ 空串（不下发，零 token、零干扰）', () => {
    expect(buildBusinessTextDirective(null)).toBe('');
    expect(buildBusinessTextDirective({})).toBe('');
  });
});

describe('findForbiddenTexts · 产物禁用词扫描', () => {
  it('产物出现禁用词 ⇒ 命中', () => {
    expect(findForbiddenTexts(['客车', '货车流量', '总数'], RULES)).toEqual(['货车']);
  });

  it('rewrite 的目标值即使被列进 drop 也不算禁用（避免自相矛盾假红）', () => {
    // 反例：产物里合法的「小汽车」不应被判禁用
    expect(findForbiddenTexts(['小汽车'], { rewrite: { 客车: '小汽车' }, drop: ['小汽车'] })).toEqual([]);
  });

  it('无禁用词配置 ⇒ 空', () => {
    expect(findForbiddenTexts(['货车'], { rewrite: { 客车: '小汽车' } })).toEqual([]);
  });
});
