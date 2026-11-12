/**
 * Lite 生成画像 / 截断检测判据。
 *
 * 判据口径（禁止另写正则，与线上实现同源）：
 *  阳性：缺闭合标签 / 样式里混入横幅残片 / 悬空声明 ⇒ truncated=true；
 *  阴性：完整健康 SFC（含 @import、嵌套规则、插值、scoped）⇒ 一律 false、stray=0；
 *  边界：输出解析失败（vueCode 空/极短）≠ 截断，不得混进截断计数；
 *  行为不变：仅 missing-block 才 retryTriggered，stray 只观测 ⇒ 不新增模型调用。
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  missingSfcBlocks,
  extractSfcStyleSource,
  detectLiteCodegenTruncation,
  pickLessTruncatedAttempt,
  collectVisionAgentMeta,
  formatLiteTelemetryLog,
  LITE_CODEGEN_BASE_TEMPERATURE,
  stepUpCodegenTemperature,
} from './lite-truncation-telemetry.js';

// 🔴 阴性对照必须用**未过滤的原始 SFC 形态**（含插值/指令/嵌套规则/@import），
//    不能先洗掉边界样本再断言「零误报」——那是把旧实现洗白的假绿。
const HEALTHY_SFC = `<template>
  <div class="c-card">
    <span class="c-card__title">{{ title }}</span>
    <ul><li v-for="item in items" :key="item.id">{{ item.name }}</li></ul>
  </div>
</template>
<script setup>
import { ref } from 'vue'
const title = ref('设备监测')
const items = ref([{ id: 1, name: 'A' }])
</script>
<style lang="less">
@import '../resources/styles/common.less';
.c-card {
  color: #fff;
  font-size: 14px;
  .c-card__title { font-weight: 600; }
}
</style>`;

const wrap = (styleBody: string) => `<template>
  <div class="c-card"><span>{{ title }}</span></div>
</template>
<script setup>
import { ref } from 'vue'
const title = ref('设备监测')
</script>
<style lang="less">
${styleBody}
</style>`;

describe('missingSfcBlocks', () => {
  it('健康 SFC 零缺失', () => {
    expect(missingSfcBlocks(HEALTHY_SFC)).toEqual([]);
  });

  it('阳性：缺 </style> 时精确报出该闭合标签', () => {
    expect(missingSfcBlocks(HEALTHY_SFC.replace('</style>', ''))).toEqual(['</style>']);
  });
});

describe('detectLiteCodegenTruncation', () => {
  it('阴性（原始健康 SFC）：不误报、零残片、不触发重试', () => {
    const r = detectLiteCodegenTruncation({ vueCode: HEALTHY_SFC, genText: HEALTHY_SFC });
    expect(r.truncated).toBe(false);
    expect(r.strayArtifacts).toBe(0);
    expect(r.missingBlocks).toEqual([]);
    expect(r.retryTriggered).toBe(false);
    expect(r.codeLength).toBe(HEALTHY_SFC.length);
    expect(r.outputLength).toBe(HEALTHY_SFC.length);
  });

  it('阴性：<style scoped> 正常样式同样零误报', () => {
    const r = detectLiteCodegenTruncation({
      vueCode: HEALTHY_SFC.replace('<style lang="less">', '<style lang="less" scoped>'),
      genText: 'x',
    });
    expect(r.truncated).toBe(false);
    expect(r.strayArtifacts).toBe(0);
  });

  it('阳性①：缺闭合标签 ⇒ 强信号 + 触发重试', () => {
    const broken = HEALTHY_SFC.replace('</style>', '');
    const r = detectLiteCodegenTruncation({ vueCode: broken, genText: broken });
    expect(r.missingBlocks).toEqual(['</style>']);
    expect(r.signals).toContain('missing-block');
    expect(r.truncated).toBe(true);
    expect(r.retryTriggered).toBe(true);
  });

  it('阳性②：标签闭合但混入横幅残片 }====（上一轮 LESS 红卡真机形态）⇒ 只观测不重试', () => {
    const r = detectLiteCodegenTruncation({
      vueCode: wrap('.c-card {\n  color: #fff;\n}===============\n.c-card__title { font-size: 14px; }'),
      genText: 'model output',
    });
    expect(r.strayArtifacts).toBeGreaterThan(0);
    expect(r.signals).toContain('stray-artifact');
    expect(r.truncated).toBe(true);
    expect(r.retryTriggered).toBe(false);
  });

  it('阳性③：样式中间被切断的悬空声明 color: ⇒ 命中残片信号', () => {
    const r = detectLiteCodegenTruncation({
      vueCode: wrap('.c-card {\n  color: \n  font-size: 14px;\n}'),
      genText: 'model output',
    });
    expect(r.strayArtifacts).toBeGreaterThan(0);
    expect(r.truncated).toBe(true);
  });

  it('边界①：vueCode 为空 ⇒ parse-failed，不得混进截断计数（假绿防线）', () => {
    const r = detectLiteCodegenTruncation({ vueCode: '', genText: 'some output' });
    expect(r.parseFailed).toBe(true);
    expect(r.truncated).toBe(false);
    expect(r.signals).toContain('parse-failed');
    expect(r.retryTriggered).toBe(false);
  });

  it('边界②：输出正好断在样式中间（无 </style>）时仍能抽到样式内容', () => {
    const cut = HEALTHY_SFC.replace('</style>', '');
    const style = extractSfcStyleSource(cut);
    expect(style).toContain('.c-card');
    expect(detectLiteCodegenTruncation({ vueCode: cut, genText: cut }).truncated).toBe(true);
  });
});

describe('pickLessTruncatedAttempt（截断重试择优，唯一来源）', () => {
  const ev = (missingBlocks: string[], code: string) => ({
    missingBlocks,
    codeLength: code.length,
  });

  it('阳性：重试缺失块更少 ⇒ 采纳重试', () => {
    const first = ev(['</style>', '</script>'], 'a'.repeat(100));
    const retry = ev(['</style>'], 'a'.repeat(50));
    expect(pickLessTruncatedAttempt(retry, first)).toBe(true);
  });

  it('🔴 阴性：重试缺失块更多 ⇒ 拒绝（旧实现盲覆盖 ⇒ 「重试」变「劣化」）', () => {
    // 生产 mv-lite-1794451845045-33c30bf3 同类形态：首轮更完整，重试更碎
    const first = ev(['</style>'], 'a'.repeat(1780));
    const retry = ev(['</template>', '</script>', '</style>'], 'a'.repeat(575));
    expect(pickLessTruncatedAttempt(retry, first)).toBe(false);
    // 反向对照：更完整的重试才会被采纳
    expect(pickLessTruncatedAttempt(first, retry)).toBe(true);
  });

  it('打平（缺失块数相同）：取代码更长者；长度亦相同 ⇒ 不采纳（保留首轮）', () => {
    const short = ev([], 'a'.repeat(10));
    const long = ev([], 'a'.repeat(20));
    expect(pickLessTruncatedAttempt(long, short)).toBe(true);
    expect(pickLessTruncatedAttempt(short, long)).toBe(false);
    expect(pickLessTruncatedAttempt(ev([], 'a'.repeat(20)), ev([], 'b'.repeat(20)))).toBe(false);
  });

  it('防御：字段缺失不炸；缺失字段视为「更差」（Infinity）', () => {
    expect(pickLessTruncatedAttempt({}, {})).toBe(false);
    expect(pickLessTruncatedAttempt({ missingBlocks: [] }, {})).toBe(true);
    expect(pickLessTruncatedAttempt(undefined as any, undefined as any)).toBe(false);
  });
});

describe('collectVisionAgentMeta / formatLiteTelemetryLog', () => {
  const agent = {
    model: 'qwen3.7-plus',
    temperature: 0,
    maxTokens: 16384,
    baseURL: 'https://api.example.com/v1?key=SECRET_NOT_FOR_LOG',
    providerType: 'openai-compatible',
  };

  it('从 agent 实例读真实生效值；baseURL 只留 host，查询串/密钥绝不进日志', () => {
    const meta = collectVisionAgentMeta(agent, { userId: 'u-1', target: 'microcode' });
    expect(meta.temperature).toBe(0); // 0 不能被 ?? 回退成 (unset)
    expect(meta.maxTokens).toBe(16384);
    expect(meta.baseURLHost).toBe('api.example.com');
    const line = formatLiteTelemetryLog({
      tag: 'truncation-detected',
      sessionId: 'mc-lite-1',
      meta,
      event: detectLiteCodegenTruncation({ vueCode: HEALTHY_SFC, genText: HEALTHY_SFC }),
      attempt: 1,
      extra: { recovered: false },
    });
    expect(line.startsWith('[truncation-detected] ')).toBe(true);
    expect(line).toContain('temperature=0');
    expect(line).toContain('maxTokens=16384');
    expect(line).toContain('endpoint=api.example.com');
    expect(line).toContain('userId=u-1');
    expect(line).toContain('recovered=false');
    expect(line).not.toContain('SECRET_NOT_FOR_LOG');
    expect(line).not.toContain('\n');
  });

  it('非法/缺省 baseURL 不炸，字段退化为 (none)', () => {
    expect(collectVisionAgentMeta({}).baseURLHost).toBe('(none)');
    expect(collectVisionAgentMeta({ baseURL: 'not-a-url' }).baseURLHost).toBe('(none)');
  });

  it('含空格的字段被转义为单行，日志可 grep', () => {
    const line = formatLiteTelemetryLog({
      tag: 'lite-codegen',
      sessionId: 'mc lite 1',
      meta: collectVisionAgentMeta({ model: 'a model' }, {}),
      event: detectLiteCodegenTruncation({ vueCode: HEALTHY_SFC, genText: '' }),
    });
    expect(line).toContain('sessionId=mc_lite_1');
    expect(line).toContain('model=a_model');
    expect(line.split('\n')).toHaveLength(1);
  });

  // 🔴 2026-11-12 事故：日志打 `temperature=0`，而那一轮真正进请求 body 的采样温度是 0.5
  //    （自愈临时抬高后在 finally 还原）⇒ 事后读 `temperature` 恒得配置值，日志会谎报、
  //    「同图同模型不同果」无法归因。必须优先读 `_lastRequestTemperature`。
  it('🔴 优先读 _lastRequestTemperature（真实采样温度），并暴露 selfHeal 次数', () => {
    const meta = collectVisionAgentMeta(
      {
        model: 'qwen/qwen3.8-max',
        temperature: 0, // 配置值（finally 已还原）
        _lastRequestTemperature: 0.5, // 真正发出去的值
        _selfHealCount: 2,
      },
      {},
    );
    expect(meta.temperature).toBe(0.5);
    expect(meta.selfHeal).toBe(2);
    const line = formatLiteTelemetryLog({
      tag: 'truncation-detected',
      sessionId: 'mv-lite-1',
      meta,
      event: detectLiteCodegenTruncation({ vueCode: HEALTHY_SFC, genText: HEALTHY_SFC }),
      extra: { adopted: false },
    });
    expect(line).toContain('temperature=0.5');
    expect(line).toContain('selfHeal=2');
    expect(line).toContain('adopted=false');
  });

  it('旧实例（无 _lastRequestTemperature）退回 temperature；两者皆无 ⇒ (unset) 且 selfHeal=0', () => {
    // temperature=0 是有效值，绝不能被 ?? 回退成 (unset)
    expect(collectVisionAgentMeta({ temperature: 0 }).temperature).toBe(0);
    const meta = collectVisionAgentMeta({});
    expect(meta.temperature).toBe('(unset)');
    expect(meta.selfHeal).toBe(0);
    const line = formatLiteTelemetryLog({
      tag: 'lite-codegen',
      sessionId: 's',
      meta,
      event: detectLiteCodegenTruncation({ vueCode: HEALTHY_SFC, genText: '' }),
    });
    expect(line).toContain('temperature=(unset)');
    expect(line).toContain('selfHeal=0');
  });
});

describe('stepUpCodegenTemperature（codegen 温度解耦 + 修复轮阶梯，唯一来源）', () => {
  it('基线默认 0（与视觉温度解耦，不跟随 visionTemperature）', () => {
    expect(LITE_CODEGEN_BASE_TEMPERATURE).toBe(0);
  });

  it('首轮（round<=0）恒用基线，不抬温', () => {
    expect(stepUpCodegenTemperature(LITE_CODEGEN_BASE_TEMPERATURE, 0)).toBe(0);
    expect(stepUpCodegenTemperature(0.3, 0)).toBe(0.3);
    expect(stepUpCodegenTemperature(0, -1)).toBe(0);
  });

  it('修复轮阶梯 0.2/0.4/0.6，上限 0.6（照抄 microcode-engineer.js:8006 范式）', () => {
    expect(stepUpCodegenTemperature(0, 1)).toBeCloseTo(0.2, 10);
    expect(stepUpCodegenTemperature(0, 2)).toBeCloseTo(0.4, 10);
    expect(stepUpCodegenTemperature(0, 3)).toBeCloseTo(0.6, 10);
    // 封顶：再高轮次不继续抬（产物发散、格式崩坏）
    expect(stepUpCodegenTemperature(0, 4)).toBe(0.6);
    expect(stepUpCodegenTemperature(0, 99)).toBe(0.6);
  });

  it('非 0 基线在基线之上抬温且同样封顶 0.6；非法输入退化为基线', () => {
    expect(stepUpCodegenTemperature(0.3, 1)).toBeCloseTo(0.5, 10);
    expect(stepUpCodegenTemperature(0.3, 2)).toBeCloseTo(0.6, 10);
    expect(stepUpCodegenTemperature(0.3, 3)).toBe(0.6);
    expect(stepUpCodegenTemperature(undefined as any, undefined as any)).toBe(
      LITE_CODEGEN_BASE_TEMPERATURE,
    );
    // 字符串数字按数值解析（dto.config 是 Record<string,any>，可能传来字符串）：min(0.5+0.2, 0.6)=0.6
    expect(stepUpCodegenTemperature('0.5' as any, '1' as any)).toBe(0.6);
  });

  it('🔴 与 microcode-engineer 同阶：base=0 时逐值等于 min(0.2*round, 0.6)', () => {
    for (let round = 0; round <= 6; round++) {
      expect(stepUpCodegenTemperature(0, round)).toBeCloseTo(Math.min(0.2 * round, 0.6), 10);
    }
  });
});

describe('判据单一来源：codegen 温度与视觉温度解耦（2026-11-12）', () => {
  const service = readFileSync(join(__dirname, 'lite.service.ts'), 'utf-8');

  it('codegen 温度基线只认显式配置，函数体内绝不回退读 visionTemperature', () => {
    expect(service).toContain('private resolveCodegenTemperature(');
    expect(service).toContain('return LITE_CODEGEN_BASE_TEMPERATURE;');
    const body = service.slice(
      service.indexOf('private resolveCodegenTemperature('),
      service.indexOf('private applyCodegenTemperature('),
    );
    expect(body.length).toBeGreaterThan(0);
    // 🔴 解耦的核心断言：基线解析段落里不得出现视觉温度字段（否则又耦合回去了）
    expect(body).not.toContain('visionTemperature');
    expect(body).not.toContain('unifiedTemperature');
    // 阳性对照：该段落确实读了显式配置项（否则上一条断言可能因段落截错而假绿）
    expect(body).toContain('config?.codegenTemperature');
  });

  it('两个 codegen 调用点（主路径 + 断点续跑）都传入解耦后的基线', () => {
    const hits = service.match(/codegenTemperature: this\.resolveCodegenTemperature\(dto\)/g) || [];
    expect(hits.length).toBe(2);
  });

  it('修复轮经 setRequestTemperature 切换且 finally 还原（否则 Anthropic 白烧/泄漏）', () => {
    expect(service).toContain('stepUpCodegenTemperature(baseTemperature, round)');
    expect(service).toContain('retryRound + 1');
    expect(service).toContain('this.applyCodegenTemperature(agent,');
    expect(service).toMatch(
      /const restore = this\.applyCodegenTemperature\([\s\S]{0,200}?finally \{[\s\S]{0,80}?restore\(\);/,
    );
  });

  it('每轮重采 meta（修复轮抬温后日志不得谎报首轮温度）', () => {
    expect(service).toContain('const snapshotMeta = () =>');
    // 反证：入口一次性采集的旧形态已消失
    expect(service).not.toMatch(/const meta = collectVisionAgentMeta\(/);
  });

  it('vision-agent 提供「切换温度且真正生效」的出口（Anthropic 重建 + 重挂网关）', () => {
    const va = readFileSync(
      join(__dirname, '..', 'ai-engine', 'agents', 'vision-agent.js'),
      'utf-8',
    );
    expect(va).toContain('setRequestTemperature(temperature) {');
    // 从方法起点向后找结束标记（`_resolveProviderCompatibility` 首次出现在构造函数调用处，
    // 直接 indexOf 会截出空段 ⇒ 必须限定 start 之后再找）
    const start = va.indexOf('setRequestTemperature(temperature) {');
    const body = va.slice(start, va.indexOf('_resolveProviderCompatibility', start));
    expect(body.length).toBeGreaterThan(0);
    // Anthropic 分支：temperature 是构造快照 ⇒ 必须重建客户端才生效
    expect(body).toContain('this.llm = this._buildLLM(');
    expect(body).toContain('this._attachAnthropicInvoke();');
    // 必须返回还原闭包，供调用方 finally 还原（防泄漏）
    expect(body).toContain('return () => {');
  });
});

describe('判据单一来源钉回真值', () => {
  it('lite.service.ts 不再自带第二份 requiredBlocks 字面量，且方法转调共享实现', () => {
    const service = readFileSync(join(__dirname, 'lite.service.ts'), 'utf-8');
    expect(service).not.toContain("['<template', '</template>']");
    expect(service).toContain('return collectMissingSfcBlocks(vueCode);');
    // 阳性对照：共享实现里确实存在该字面量（否则上一条断言可能因文件读错而假绿）
    const telemetry = readFileSync(join(__dirname, 'lite-truncation-telemetry.js'), 'utf-8');
    expect(telemetry).toContain("['<template', '</template>']");
  });

  // 🔴 2026-11-12 根治：截断重试必须走共享择优判据，不得调用侧另写比较、更不得盲覆盖。
  it('🔴 lite.service 截断重试走 pickLessTruncatedAttempt 择优（不盲覆盖首轮）', () => {
    const service = readFileSync(join(__dirname, 'lite.service.ts'), 'utf-8');
    expect(service).toContain('pickLessTruncatedAttempt');
    expect(service).toContain('const adopted = pickLessTruncatedAttempt(second, first)');
    expect(service).toContain('if (adopted) {');
    expect(service).toContain('guarded = retryGuarded;');
    // 反证：旧实现形态 `guarded = retryGuarded;` 前不得缺少 adopted 门（存在 if (adopted) 即已保证）
    expect(service).toMatch(/if \(adopted\) \{[\s\S]{0,120}?guarded = retryGuarded;/);
  });

  // 🔴 遥测真值来源：`_lastRequestTemperature` 必须在「建客户端」与「axios body」两处刷新，
  //    否则日志只能读到配置值（自愈抬温不可见 ⇒ 无法归因）。
  it('🔴 vision-agent 初始化 selfHeal 计数并在两处请求点刷新真实温度', () => {
    const va = readFileSync(
      join(__dirname, '..', 'ai-engine', 'agents', 'vision-agent.js'),
      'utf-8',
    );
    expect(va).toContain('this._selfHealCount = 0;');
    const refreshes = va.match(/this\._lastRequestTemperature = temperature;/g) || [];
    expect(refreshes.length).toBeGreaterThanOrEqual(2);
    // 阳性对照：两次刷新的入参确实是归一化后的 temperature（而不是别的标量）
    expect((va.match(/normalizeRequestTemperature\([^)]*\)/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
