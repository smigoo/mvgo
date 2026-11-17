/**
 * 🛡️ 2026-11-17 · `[vision-call]` 实发采样参数埋点（阴阳对照）
 *
 * 事故背景：同一张图（md5 全等）、同一 prompt（逐字节相同）三连跑，切段结果三样。
 * 要判「是不是温度在捣鬼」，却发现 mc/max 管线日志里**一条 temperature 都没有**
 * （`collectVisionAgentMeta` 只接了 lite.service）⇒ 实发温度只能靠读代码推导。
 *
 * 本 spec 钉住三件最容易被写错的事：
 *   ① `temperature=0` 必须原样输出（最典型的假绿：用 `||` 兜底把 0 吞成 '-' 或默认值）；
 *   ② 必须**单行**（换行/空格会把 grep -c 计数与 k=v 分词打散，与 `[lite-codegen]` 同口径）；
 *   ③ 端点只留 host（禁止把完整 URL/密钥写进日志）。
 */

import { describe, it, expect } from '@jest/globals';
import { formatVisionCallLog } from '../vision-call-log.js';

describe('[vision-call] 单行埋点', () => {
  it('temperature=0 原样保留（不被 || / ?? 兜底吞掉）', () => {
    const line = formatVisionCallLog({
      model: 'deepseek/deepseek-v4.1-flash',
      temperature: 0,
      maxTokens: 16000,
      providerId: '__primary_vision__',
      baseURL: 'https://api.token.microvideo.cn/v1',
      attempt: 1,
      selfHeal: 0,
      context: 'vision-agent.analyzeImage',
    });
    expect(line).toContain('temperature=0 ');
    expect(line).not.toContain('temperature=-');
    expect(line).toContain('maxTokens=16000');
    expect(line).toContain('provider=__primary_vision__');
    expect(line).toContain('endpoint=api.token.microvideo.cn');
    expect(line).toContain('attempt=1');
    expect(line).toContain('selfHeal=0');
    expect(line).toContain('context=vision-agent.analyzeImage');
    expect(line.startsWith('[vision-call] model=deepseek/deepseek-v4.1-flash')).toBe(true);
  });

  it('单行：值里含空格/换行一律压成下划线，整体不含 \\n', () => {
    const line = formatVisionCallLog({
      model: 'a model',
      temperature: undefined,
      maxTokens: undefined,
      context: 'ctx with\nnewline',
    });
    expect(line).not.toContain('\n');
    expect(line).toContain('model=a_model');
    expect(line).toContain('context=ctx_with_newline');
  });

  it('缺省值落 -，非法 baseURL 的 host 落 -', () => {
    const line = formatVisionCallLog({ model: 'm', temperature: 0 });
    expect(line).toContain('provider=-');
    expect(line).toContain('endpoint=-');
    expect(line).toContain('maxTokens=-');
    expect(formatVisionCallLog({ baseURL: 'not-a-url' })).toContain('endpoint=-');
  });

  it('protocol 默认 openai-compatible，可被 anthropic 覆盖', () => {
    expect(formatVisionCallLog({ model: 'm', temperature: 0 })).toContain(
      'protocol=openai-compatible',
    );
    expect(
      formatVisionCallLog({ model: 'm', temperature: 0, protocol: 'anthropic' }),
    ).toContain('protocol=anthropic');
  });

  it('截断升档后 maxTokens 必须反映升档值（不要用实例默认值冒充）', () => {
    const line = formatVisionCallLog({
      model: 'm',
      temperature: 0,
      maxTokens: 32000,
    });
    expect(line).toContain('maxTokens=32000');
    expect(line).not.toContain('maxTokens=16000');
  });

  it('outputKind 区分「这一次是什么调用」（brief/sfc/json），未声明落 -', () => {
    // 同一 session 里 VisionAgent.analyzeImage 会被复用于「看图」与「写码」两次性质不同的请求，
    // 温度本就分属不同旋钮 —— outputKind 是「哪条行属于哪次调用」的唯一判别依据。
    expect(
      formatVisionCallLog({ model: 'm', temperature: 0.7, outputKind: 'brief' }),
    ).toContain('outputKind=brief');
    expect(
      formatVisionCallLog({ model: 'm', temperature: 0, outputKind: 'sfc' }),
    ).toContain('outputKind=sfc');
    expect(
      formatVisionCallLog({ model: 'm', temperature: 0, outputKind: 'json' }),
    ).toContain('outputKind=json');
    // 未声明 ⇒ '-'（不猜、不默认成某个值）
    expect(formatVisionCallLog({ model: 'm', temperature: 0 })).toContain(
      'outputKind=-',
    );
    // 字段序：outputKind 紧邻 context 之前
    const line = formatVisionCallLog({
      model: 'm',
      temperature: 0,
      outputKind: 'brief',
      context: 'vision-agent.analyzeImage',
    });
    expect(line).toContain('outputKind=brief context=vision-agent.analyzeImage');
  });
});
