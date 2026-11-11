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
  collectVisionAgentMeta,
  formatLiteTelemetryLog,
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
});
