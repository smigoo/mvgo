/**
 * 🔴 精简重试 prompt 必须携带段身份契约（2026-11-13 · 生产实锤 mc-max-1794462377352-3d6fa463）
 *
 * 病灶链：
 *   首轮 LLM 输出 JSON 解析失败（parse_failure）
 *     → 重试走 buildRetryPrompt（只有文件清单 + 其它文件片段 + 错误说明，实测 1972 字符）
 *     → 重试时 LLM **不知道本文件负责哪个 section、也不知道本段有哪些业务文案**
 *     → 输出最小合规产物 `<div ...><slot /></div>`（空壳组件）且静默落盘
 *     ⇒ 该任务「排查计划 6/7 + 车辆图标」整块从产物中消失（设计稿有、产物无）。
 *
 * 本 spec 锁三条不变量：
 *   ① 重试 prompt 含 `data-section-id` + 本段真值文案全集 + 禁跨段 + 禁空壳；
 *   ② 无 `_sectionScope` ⇒ 契约空串（零漂移边界，与抽离前逐字一致）；
 *   ③ 既有能力不回归（目标文件清单 / 错误类型说明 / 上下文契约片段）。
 */
import { buildRetryPrompt } from '../retry-prompt.js';

const mkChunk = (over = {}) => ({
  files: ['package/components/ContentSection.vue'],
  segmentType: 'component',
  contextFiles: [
    { path: 'package/index.vue', content: '<template><ContentSection /></template>' },
  ],
  scopedInput: {
    _sectionScope: {
      id: '1:762',
      title: '排查计划总览',
      componentName: 'ContentSection',
      truthTexts: ['排查计划', '6/7'],
    },
  },
  ...over,
});

describe('精简重试 prompt · 段身份契约（2026-11-13 治本）', () => {
  it('⭐ 重试 prompt 必须带 data-section-id 与本段真值文案全集', () => {
    const p = buildRetryPrompt(mkChunk(), 'parse_failure', 'JSON 解析失败');
    expect(p).toContain('data-section-id="1:762"');
    expect(p).toContain('排查计划');
    expect(p).toContain('6/7');
  });

  it('⭐ 重试 prompt 必须带「禁止跨段」与「禁止输出空壳」两条禁令', () => {
    const p = buildRetryPrompt(mkChunk(), 'parse_failure', 'JSON 解析失败');
    expect(p).toContain('禁止渲染目标段之外的任何内容');
    expect(p).toContain('禁止输出空壳');
  });

  it('⭐ 契约必须排在错误说明之前（避免 LLM 只顾修格式把正文清空）', () => {
    const p = buildRetryPrompt(mkChunk(), 'parse_failure', 'JSON 解析失败');
    expect(p.indexOf('段身份契约')).toBeGreaterThan(-1);
    expect(p.indexOf('段身份契约')).toBeLessThan(p.indexOf('上次输出不是合规的 JSON 结构'));
  });

  it('零漂移：无 _sectionScope ⇒ 不产出契约（index/template/style chunk 行为不变）', () => {
    const p = buildRetryPrompt(
      { files: ['package/index.vue'], segmentType: 'script', contextFiles: [] },
      'parse_failure',
      'x',
    );
    expect(p).not.toContain('段身份契约');
    expect(p).not.toContain('data-section-id');
  });

  it('回归：既有能力不丢（目标文件清单 / 错误类型说明 / 上下文契约片段）', () => {
    const p = buildRetryPrompt(mkChunk(), 'parse_failure', 'JSON 解析失败');
    expect(p).toContain('package/components/ContentSection.vue');
    expect(p).toContain('上次输出不是合规的 JSON 结构');
    expect(p).toContain('package/index.vue');
    // 分块类型说明仍在
    expect(p).toContain('// === path ===');
  });

  it('回归：max_tokens 类型的错误说明仍正确', () => {
    const p = buildRetryPrompt(mkChunk(), 'max_tokens', 'x');
    expect(p).toContain('max_tokens');
    expect(p).toContain('段身份契约');
  });
});
