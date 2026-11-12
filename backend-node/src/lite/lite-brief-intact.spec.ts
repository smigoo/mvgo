/**
 * 回归锁 + 行为级阳/阴对照：Lite 视觉分析（brief）输出完整性判据。
 *
 * 背景（2026-11-12 生产实锤 mv-lite-1794450313160-4d463e6d）：
 *   `vision-agent#_isAnalysisIntact` 默认 JSON 口径查的是 sections/charts/interactions
 *   （preview-analysis 产物键），而 Lite 分析输出 brief 的键是 layout/regions/colors/theme
 *   ⇒ 完整 brief 恒判「损坏」⇒ 每轮分析白烧一次 temperature 0→0.6 的高温自愈重试。
 *
 * 本 spec 锁三件事：
 *   ① 判据单一来源：isBriefAnalysisIntact 的键集合必须与 buildAnalysisPrompt 的 schema 同源
 *      （prompt 删键 ⇒ 本测试红，强制同步）；
 *   ② 调用链透传：lite.service 分析调用必须显式 outputKind:'brief'（否则退回默认口径再犯）；
 *   ③ 行为级阳/阴对照：完整 brief 判 true、截断/错位/无关 JSON 判 false。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  BRIEF_SCHEMA_KEYS,
  BRIEF_MIN_KEY_HITS,
  isBriefAnalysisIntact,
} from './lite-brief-intact.js';

const LITE_SERVICE_SRC = fs.readFileSync(
  path.join(__dirname, 'lite.service.ts'),
  'utf8',
);
const VISION_AGENT_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'ai-engine', 'agents', 'vision-agent.js'),
  'utf8',
);

/** 截取 buildAnalysisPrompt 的函数体源码（到下一个 private 成员为止） */
function extractBuildAnalysisPromptSrc(): string {
  const start = LITE_SERVICE_SRC.indexOf('private buildAnalysisPrompt(');
  expect(start).toBeGreaterThan(-1);
  const rest = LITE_SERVICE_SRC.slice(start + 10);
  const nextMember = rest.search(/\n  private (async )?[a-zA-Z_$]/);
  expect(nextMember).toBeGreaterThan(-1);
  return rest.slice(0, nextMember);
}

describe('brief 完整性判据：与 buildAnalysisPrompt schema 同源（源码锁）', () => {
  const promptSrc = extractBuildAnalysisPromptSrc();

  it('BRIEF_SCHEMA_KEYS 每个键都出现在 buildAnalysisPrompt 的 JSON schema 里', () => {
    const missing = BRIEF_SCHEMA_KEYS.filter(
      (k) => !promptSrc.includes(`"${k}":`),
    );
    expect(missing).toEqual([]);
  });

  it('buildAnalysisPrompt schema 顶层键不得多于判据集合（新增键必须同步常量）', () => {
    // 只抓顶格两个空格缩进的键（schema 顶层字段），子键（如 name.cn/en）缩进更深
    const topLevel = new Set<string>();
    const re = /^ {2}"([a-zA-Z]+)":/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(promptSrc)) !== null) topLevel.add(m[1]);
    expect(topLevel.size).toBeGreaterThan(0);
    const drift = [...topLevel].filter((k) => !BRIEF_SCHEMA_KEYS.includes(k));
    expect(drift).toEqual([]);
  });

  it('BRIEF_MIN_KEY_HITS 为 2（单键命中无法区分「无关 JSON」与「照 schema 输出」）', () => {
    expect(BRIEF_MIN_KEY_HITS).toBe(2);
  });
});

describe('brief 完整性判据：调用链透传（防退回默认 JSON 口径）', () => {
  it('lite.service 分析调用显式传 outputKind:\'brief\'', () => {
    // analyzeImage(...) 的第三个实参里必须带 outputKind: 'brief'
    const analysisCall = LITE_SERVICE_SRC.match(
      /const analysisText = await agent\.analyzeImage\([\s\S]{0,700}?outputKind: 'brief'/,
    );
    expect(analysisCall).toBeTruthy();
  });

  it('vision-agent 具名导入 isBriefAnalysisIntact 且 brief 分支调用它（不在 agent 内另写判据）', () => {
    expect(VISION_AGENT_SRC).toMatch(
      /import\s*\{\s*isBriefAnalysisIntact\s*\}\s*from\s*'\.\.\/\.\.\/lite\/lite-brief-intact\.js'/,
    );
    expect(VISION_AGENT_SRC).toContain("outputKind === 'brief'");
    expect(VISION_AGENT_SRC).toContain('return isBriefAnalysisIntact(content);');
  });
});

describe('isBriefAnalysisIntact 行为级阳性/阴性对照', () => {
  // 与 buildAnalysisPrompt prompt 里示例同形的完整 brief（静态稿：interactions 为空数组）
  const fullBrief = JSON.stringify({
    layout: '纵向：顶部统计条 + 中部网格',
    regions: [
      { name: '顶部统计条', description: '四个指标横向等分', position: 'top', size: '高约 56px' },
      { name: '网格区', description: '2×2 卡片', position: 'center', size: '占满剩余高度' },
    ],
    spacing: { outer: '12px', gap: '8px', padding: '10px' },
    theme: 'light',
    colors: { primary: '#2F7BFF', background: '#F5F8FC', surface: '#FFFFFF', text: '#1F2329', border: '#E5E8EF' },
    typography: { size: '标题16px/正文11px', weight: '标题600/正文400', lineHeight: '1.4' },
    components: ['卡片', '图标'],
    textContent: ['环境监测', '今日累计'],
    name: { cn: '环境监测', en: 'environment-monitor' },
    visualDetails: ['卡片圆角 6px'],
    interactions: [],
  });

  it('阳性：完整静态 brief（interactions=[]）判「完整」——旧 json 口径正因此恒判损坏', () => {
    expect(isBriefAnalysisIntact(fullBrief)).toBe(true);
  });

  it('阳性：带 ```json 围栏的完整 brief 同样判「完整」（模型常不听「不要代码块」）', () => {
    expect(isBriefAnalysisIntact('```json\n' + fullBrief + '\n```')).toBe(true);
  });

  it('阴性：截断 JSON 判「损坏」（触发一次自愈重试是预期行为）', () => {
    expect(isBriefAnalysisIntact(fullBrief.slice(0, fullBrief.length - 120))).toBe(false);
  });

  it('阴性：无关 JSON（键命中 < 2）判「损坏」，不因「能 parse」就放行', () => {
    expect(isBriefAnalysisIntact('{"error":"model unavailable"}')).toBe(false);
    expect(isBriefAnalysisIntact('{"raw":"..."}')).toBe(false);
  });

  it('阴性：非对象（数组/标量/空/非字符串）一律 false', () => {
    expect(isBriefAnalysisIntact('[1,2,3]')).toBe(false);
    expect(isBriefAnalysisIntact('"just a string"')).toBe(false);
    expect(isBriefAnalysisIntact('')).toBe(false);
    expect(isBriefAnalysisIntact(null as any)).toBe(false);
    expect(isBriefAnalysisIntact(undefined as any)).toBe(false);
  });

  it('阳性边界：恰好命中 BRIEF_MIN_KEY_HITS 个键即算完整（键存在性判据，不要求值非空）', () => {
    expect(isBriefAnalysisIntact('{"theme":"light","layout":""}')).toBe(true);
    // 只 1 个键不够
    expect(isBriefAnalysisIntact('{"theme":"light"}')).toBe(false);
  });
});
