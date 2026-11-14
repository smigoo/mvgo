/**
 * 🛡️ 2026-11-14（真机事故：同图五次运行产出 6 / 1 / 8 / 5 / 5 段）：视觉分析重跑判据。
 *
 * 病灶链：
 *   ① 同一张图、同一 prompt（sha1 完全相同）、temperature=0 强制确定性，仍产出不同段数
 *      ⇒ 非确定性来自服务端（api.token.microvideo.cn 代理的 deepseek-v4.1-flash）；
 *   ② 既有重试只看「覆盖率」，而"只切出 1 段"的那种退化覆盖率仍有 57% ⇒ 不触发；
 *   ③ 重试后**无条件**用第二次结果 ⇒ 第二次更差时反而劣化。
 *
 * 判据：覆盖率 LOW_COVERAGE 或 段数显著少于真值内容块，触发一次重跑；重跑后按
 *   （段数, 覆盖率）择优 —— 段数优先（结构性缺陷不可用覆盖率补）。
 */
import {
  shouldRetryVisionAnalysis,
  pickBetterVisionAnalysis,
} from '../../utils/vision-retry-gate.js';

describe('视觉分析重跑判据（段数契约）', () => {
  it('只切出 1 段、真值有 6 块 ⇒ 必须重跑（即使覆盖率不低）', () => {
    const r = shouldRetryVisionAnalysis({
      sections: 1,
      truthLeafSections: 6,
      lowCoverage: false,
    });
    expect(r.retry).toBe(true);
    expect(r.fewSections).toBe(true);
  });

  it('段数达标（5 ≥ 3）且覆盖率不低 ⇒ 不重跑（避免无谓多跑一次模型）', () => {
    const r = shouldRetryVisionAnalysis({
      sections: 5,
      truthLeafSections: 6,
      lowCoverage: false,
    });
    expect(r.retry).toBe(false);
  });

  it('覆盖率判 LOW_COVERAGE 即使段数够也重跑', () => {
    const r = shouldRetryVisionAnalysis({
      sections: 5,
      truthLeafSections: 6,
      lowCoverage: true,
    });
    expect(r.retry).toBe(true);
    expect(r.fewSections).toBe(false);
  });

  it('真值叶段本来就少（<3）⇒ 不因段数重跑（单块组件是合法的）', () => {
    const r = shouldRetryVisionAnalysis({
      sections: 1,
      truthLeafSections: 1,
      lowCoverage: false,
    });
    expect(r.retry).toBe(false);
  });

  it('择优：段数多者优先（结构性缺陷不能用覆盖率补）', () => {
    expect(
      pickBetterVisionAnalysis({ sections: 1, rate: 57 }, { sections: 6, rate: 55 }),
    ).toBe('retry');
    expect(
      pickBetterVisionAnalysis({ sections: 6, rate: 90 }, { sections: 1, rate: 95 }),
    ).toBe('first');
  });

  it('择优：段数相同则比覆盖率；完全相等时保留首次（不无谓替换）', () => {
    expect(
      pickBetterVisionAnalysis({ sections: 5, rate: 60 }, { sections: 5, rate: 75 }),
    ).toBe('retry');
    expect(
      pickBetterVisionAnalysis({ sections: 5, rate: 75 }, { sections: 5, rate: 75 }),
    ).toBe('retry'); // >= ⇒ 同分取重试（重试带定向指引，先验更可信）
  });

  it('缺字段（undefined）不抛，按 0 处理', () => {
    expect(() => pickBetterVisionAnalysis({}, {})).not.toThrow();
    expect(shouldRetryVisionAnalysis({}).retry).toBe(false);
  });
});
