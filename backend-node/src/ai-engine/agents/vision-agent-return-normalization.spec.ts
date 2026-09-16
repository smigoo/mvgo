/**
 * 回归锁：vision-agent 的 Claude（anthropic 协议）分支必须把 AIMessage.content 归一化为字符串。
 *
 * 背景（2026-09-15 实测）：
 *   analyzeImage 的 OpenAI 兼容分支写的是 `content: coerceLLMText(response.data...)`，已归一化；
 *   但 Claude 分支（`this.isOpenAICompatible === false`）裸 `return response.content`。
 *   anthropic 协议下 LangChain AIMessage.content 可能是 [{type:'text',text:'...'}] 数组或 null，
 *   裸返回会让下游 lite.extractMicrocodeOutput 收到 object（`typeof null === 'object'`），
 *   类型防护判定失败 → 产物为空 → 整个 Lite 生成失败：
 *     WARN  extractMicrocodeOutput 收到非字符串输入: object
 *     ERROR Lite 生成失败 xxx: 生成的组件代码为空或无效
 *
 * 本 spec 用源码级断言（与 roles-request-context.spec.ts 同款做法）锁死两类返回点，
 * 防止后续重构再把归一化丢掉。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('vision-agent 返回归一化回归锁', () => {
  const src = fs.readFileSync(path.join(__dirname, 'vision-agent.js'), 'utf8');

  it('源码中不存在裸 `return response.content;`', () => {
    // 裸返回 = Claude 分支未归一化，正是 2026-09-15 事故的根因写法
    const bare = src.match(/^\s*return response\.content;\s*$/gm) || [];
    expect(bare).toHaveLength(0);
  });

  it('两处 Claude 分支 return 均已经 coerceLLMText 归一化（analyzeImage + compareImages）', () => {
    const normalized = src.match(/return coerceLLMText\(response\.content\)/g) || [];
    // analyzeImage 与 compareImages 两处 Claude 分支 return 必须都是归一化形态
    expect(normalized.length).toBeGreaterThanOrEqual(2);
  });

  it('_isAnalysisIntact 调用点同样归一化（否则数组恒判「损坏」触发无谓自愈重试）', () => {
    expect(src).toContain('this._isAnalysisIntact(coerceLLMText(response.content))');
  });
});
