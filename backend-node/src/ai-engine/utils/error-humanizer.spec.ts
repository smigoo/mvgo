import { humanizeGenerationError } from './error-humanizer.js';

/**
 * 🛡️ 2026-09-16 治本回归：错映射修复。
 *
 * 实锤（mc-max-1789490645947-e6f8687e）：真实报错是
 * 「禁止臆造校验未通过，禁止发布组件：DO-NOT-INVENT-CHART, DO-NOT-INVENT-CHART-MOUNT-MISSING」，
 * 但旧 regex `/视觉分析失败或降级|盲生成|臆造/` 因「臆造」二字误匹配到视觉降级分支，
 * 页面显示「视觉识别未完成」误导用户以为是视觉模型没跑完。治本：去掉「臆造」，
 * 把「禁止臆造」「DO-NOT-INVENT」归入代码质量门禁分支。
 */
describe('humanizeGenerationError 错映射修复', () => {
  it('「禁止臆造校验未通过」→ 代码质量门禁（不再是视觉降级）', () => {
    const msg =
      '禁止臆造校验未通过，禁止发布组件：DO-NOT-INVENT-CHART, DO-NOT-INVENT-CHART-MOUNT-MISSING';
    const out = humanizeGenerationError(msg);
    expect(out).toContain('质量检查');
    expect(out).not.toContain('视觉识别未完成');
  });

  it('DO-NOT-INVENT 关键字 → 代码质量门禁', () => {
    const out = humanizeGenerationError('图表类型缺失：DO-NOT-INVENT-CHART');
    expect(out).toContain('质量检查');
    expect(out).not.toContain('视觉识别未完成');
  });

  it('视觉分析失败/降级 → 仍是视觉降级分支（不误伤）', () => {
    const out = humanizeGenerationError('视觉分析失败或降级，中止生成');
    expect(out).toContain('视觉识别未完成');
  });

  it('盲生成 → 仍是视觉降级分支', () => {
    const out = humanizeGenerationError('盲生成保护触发');
    expect(out).toContain('视觉识别未完成');
  });
});

/**
 * 🛡️ 2026-11-12 治本回归：429 / 限流按来源分流 + 契约变更。
 *
 * 实锤（生产 tasks.json 全量）：error 含「模型额度已用尽」的任务共 7 单，
 * 100% 含 figma 节点、底层真错均为 figma-connector 的 getImageUrl 撞 api.figma.com 429，
 * 无一例来自模型侧。旧 regex `/429|quota|额度|rate.?limit|exhausted|余额不足/i`
 * 只因子串 `429` 就命中，把 Figma 限流的锅甩给「模型额度」，用户被误导去换模型。
 *
 * ⚠️ 2026-11-12 用户指令（契约变更）：**上游模型报错不做任何加工，统一输出
 *    `上游模型报错：<原始错误原文>`**。因此本组用例中「模型侧」的 429/额度形态
 *    不再断言人话文案（「模型额度已用尽」/「上游频率限制」已随契约删除），
 *    而断言原样透传 + 原文不丢。
 */
describe('humanizeGenerationError 429 按来源分流', () => {
  it('Figma 429（figma-connector 抛出的带标记错误）→ 归因 Figma，不再甩锅模型额度', () => {
    const out = humanizeGenerationError(
      'Figma 设计稿数据接口触发限流 (HTTP 429)，与模型额度无关，请稍后重试',
    );
    expect(out).toContain('Figma');
    expect(out).not.toContain('模型额度已用尽');
    expect(out).not.toContain('上游模型报错');
  });

  it('裸 429（无来源标记）→ 判为上游模型报错，原样透传（旧版译「上游频率限制」已删）', () => {
    const out = humanizeGenerationError('Request failed with status code 429');
    expect(out).toBe('上游模型报错：Request failed with status code 429');
    expect(out).not.toContain('模型额度已用尽');
  });

  it('真·模型额度耗尽（403 Insufficient user quota）→ 原样透传，保留原文与余额', () => {
    const raw = '403 new_api_error: Insufficient user quota, remaining quota: ¥-0.067344';
    const out = humanizeGenerationError(raw);
    expect(out).toBe(`上游模型报错：${raw}`);
    // 原文关键信息不得被加工掉（这正是旧版人话翻译丢失的部分）
    expect(out).toContain('Insufficient user quota');
    expect(out).toContain('-0.067344');
  });

  it('真·模型额度耗尽（中文余额不足）→ 原样透传', () => {
    const raw = '账户余额不足，请充值后重试';
    const out = humanizeGenerationError(raw);
    expect(out).toBe(`上游模型报错：${raw}`);
  });

  it('回归防护：Figma 认证失败(401/403) 不落入限流支、也不被误判为上游模型报错', () => {
    const out = humanizeGenerationError(
      'Figma Token 无效或已过期 (HTTP 403)，请前往 Figma → Settings → Personal Access Tokens 重新生成 Token',
    );
    expect(out).not.toContain('Figma 限流');
    expect(out).not.toContain('模型额度已用尽');
    expect(out).not.toContain('上游模型报错');
  });

  /**
   * 以下 2 例由「生产 tasks.json 全量新旧对照」探针回灌（2026-11-12）：
   * 逐条枚举所有含 429/quota/额度 语义的真错形态，比对新旧 humanizer 归属差异后补测。
   */
  it('回归防护：`预扣费额度失败`（provider 403 报文）→ 原样透传，不丢剩余额度原文', () => {
    // 生产原文：视觉分析失败: 403 {"error":{...message":"预扣费额度失败, 用户剩余额度: ¥0.163972,
    // 需要预扣费额度: ¥0.380770..."}}。旧版译「模型额度已用尽」（丢掉 ¥0.16/¥0.38 两个关键数字）；
    // 现契约要求原样透传 ⇒ 断言原文两处金额均在。
    const raw =
      '视觉分析失败: 403 {"error":{"type":"new_api_error","message":"预扣费额度失败, 用户剩余额度: ¥0.163972, 需要预扣费额度: ¥0.380770"}}';
    const out = humanizeGenerationError(raw);
    expect(out).toBe(`上游模型报错：${raw}`);
    expect(out).toContain('¥0.163972');
    expect(out).toContain('¥0.380770');
    expect(out).not.toContain('Figma');
  });

  it('回归防护：进度日志中的裸 429 子串（70429 / 4292s）不得被当成限流', () => {
    // 生产原文 1：Figma 节点逻辑尺寸: 414x158（scale=2 导出栅格 70429 bytes）
    // 生产原文 2：✅ 【子组件 …】完成（30.4s），累计 4292s，预估剩余 179s
    // 旧正则 `/429/`（无边界）会因 `70429`/`4292` 误命中并译成「模型额度已用尽」。
    const logA = humanizeGenerationError(
      'Figma 节点逻辑尺寸: 414x158（scale=2 导出栅格 70429 bytes）',
    );
    expect(logA).not.toContain('模型额度已用尽');
    expect(logA).not.toContain('上游频率限制');
    expect(logA).not.toContain('Figma 限流');

    const logB = humanizeGenerationError(
      '✅ 【子组件 package/components/ContentDesign12.vue】完成（30.4s），累计 4292s，预估剩余 179s',
    );
    expect(logB).not.toContain('模型额度已用尽');
    expect(logB).not.toContain('上游频率限制');
  });

  it('回归防护：带 Figma 限流标记（figma-connector 抛出）→ 归因 Figma', () => {
    const out = humanizeGenerationError(
      '🔴 Figma 触发限流冷却：60s（全局暂停请求，剩余 60s）',
    );
    expect(out).toContain('Figma');
    expect(out).not.toContain('模型额度已用尽');
  });

  it('回归防护：fetchNodeData 二次包装后的 429 文案 → 仍归因 Figma（figStatus 未丢）', () => {
    // figma-connector.fetchNodeData 的 catch 会按 figStatus 重新包装文案。
    // 若该处只读 error.response.status（裸 axios error 形态），则新抛的 `new Error`（无 .response）
    // 会被误判为「无 HTTP 状态码的网络层失败」并丢掉 figStatus。此处锁定包装后的形态仍可归因。
    const out = humanizeGenerationError(
      'Figma API 错误 (HTTP 429): Figma 设计稿数据接口触发限流 (HTTP 429)，与模型额度无关，请稍后重试',
    );
    expect(out).toContain('Figma');
    expect(out).not.toContain('模型额度已用尽');
    expect(out).not.toContain('网络层失败');
  });
});

/**
 * 🛡️ 2026-11-12 契约（用户指令）：上游模型报错不做处理，直接转给用户看。
 *
 * 输出格式固定为 `上游模型报错：<原始错误原文>`；原文必须逐字保留（不改写、不归因、不截断）。
 * 判定依据全部为 provider / HTTP 传输层特征；**平台自身管线错误仍走人话翻译**（见第二组）。
 */
describe('humanizeGenerationError 上游模型报错原样透传', () => {
  const UPSTREAM_CASES: Array<[string, string]> = [
    ['OpenAI 兼容错误体 {"error":{...}}', '{"error":{"message":"The model `gpt-x` does not exist"}}'],
    ['invalid_api_key', 'Error: 401 invalid_api_key provided'],
    ['context_length_exceeded', 'context_length_exceeded: This model\'s maximum context length is 65536 tokens'],
    ['model_not_found', 'model_not_found: model `deepseek-v4-flash` not found'],
    ['content_filter', 'content_filter: 请求被内容安全策略拦截'],
    ['axios HTTP 500 透传', 'Request failed with status code 500'],
    ['provider 主机名直出', 'connect ECONNREFUSED api.deepseek.com:443'],
    ['DashScope 主机名直出', 'getaddrinfo ENOTFOUND dashscope.aliyuncs.com'],
    ['中文频率限制', '触发频率限制，请稍后重试'],
    ['中文配额耗尽', '配额已耗尽，请充值'],
  ];

  it.each(UPSTREAM_CASES)('%s → 前缀 + 原文逐字保留', (_name, raw) => {
    const out = humanizeGenerationError(raw);
    expect(out).toBe(`上游模型报错：${raw}`);
  });

  it('纯文本模型与视觉模型的上游报错同规则（不因"视觉分析失败:"前缀而改写）', () => {
    const raw = '视觉分析失败: 403 {"error":{"type":"new_api_error","message":"Insufficient user quota"}}';
    expect(humanizeGenerationError(raw)).toBe(`上游模型报错：${raw}`);
  });

  it('平台自身管线错误仍走人话翻译（不得被上游模型分支误吞）', () => {
    // 质量门禁 / 分块拼装 / 语义门禁 / 低覆盖率 / 视觉降级 —— 均为平台侧，必须保留人话
    expect(humanizeGenerationError('FLEX-003 校验失败')).toContain('质量检查');
    expect(humanizeGenerationError('分段拼装后必然残缺')).toContain('分段拼装');
    expect(humanizeGenerationError('组件脚本语义不完整')).toContain('模型生成代码存在缺陷');
    expect(humanizeGenerationError('low-coverage 覆盖率严重不足 (12%)')).toContain('视觉模型');
    expect(humanizeGenerationError('视觉分析失败或降级，中止生成')).toContain('视觉识别未完成');
  });

  it('空错误仍返回通用兜底文案（不产生「上游模型报错：」空壳）', () => {
    expect(humanizeGenerationError('')).toBe('生成失败，请重试');
    expect(humanizeGenerationError(null)).toBe('生成失败，请重试');
    expect(humanizeGenerationError(undefined)).toBe('生成失败，请重试');
  });
});
