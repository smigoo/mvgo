/**
 * 🛡️ P0-A / P0-B 阴阳对照（2026-11-15）
 *
 * 取证底稿：mc-max-1794747509141-9fad7892 的 package/index.vue。
 * ⚠️ 防假绿纪律：归一与判据共用同一解析实现，故**不得只靠 audit() 返回 0 判定通过**。
 *    本 spec 全部用独立字面量断言（toContain / not.toContain / toBe）核对产物字符串。
 */
import {
  stripInlineGeometryDuplicates,
  normalizeInlineLengthPx,
  auditInlineGeometryDuplicates,
  collectLayoutTruthClasses,
  formatInlineGeomStats,
  formatInlinePxStats,
  INLINE_GEOM_DUP,
  INLINE_GEOM_PX,
  INLINE_GEOM_CONFLICT,
} from './inline-geom-dup-guard.js';
import { injectMissingTabUi } from '../roles/microcode/code-healer.js';

/** 真实产物（保留 template + style，script 与本判据无关故略去） */
const PRODUCT = `<template>
  <base-panel panelKey="default-panel" :style="{ backgroundImage: 'url(' + bgbg8788 + ')', backgroundPosition: '0px 0px' }">
    <div class="c-device-monitor-slot-con c-mc-max-1794747509141-9fad7892" style="display:flex;flex-direction:column;min-height:0;width:420px;height:425px;margin-left:auto;margin-right:auto;">
      <StatsMonitor class="c-device-monitor-sech-1" style="flex:0.072;min-height:0;" />
      <StatsSection class="c-device-monitor-sech-2" style="flex:0.157;min-height:0;margin-top:4px;" />
      <div @click="handleMcTabSwitch" :data-mc-tab-root="activeMcTab" class="c-device-monitor-antd-tab-con" data-section-id="89:37" style="flex:0.761;min-height:0;display:flex;flex-direction:row;align-items:stretch;">
        <TabsSection style="flex:0.111;min-width:0;" />
        <CardGrid style="flex:0.889;min-width:0;" />
      </div>
    </div>
  </base-panel>
</template>

<style lang="less" scoped>
@import '../resources/styles/index.less';

  /* mvgo-layout-truth：段高真值（px 由 postcss-pxtorem 转 rem，勿改为 inline） */
  .c-device-monitor-sech-1 { flex: 0 1 30px !important; min-height: 0;
  display: flex;}
  .c-device-monitor-sech-2 { flex: 0 1 65px !important; min-height: 0; margin-top: 4px !important;
  display: flex;}

.mc-bg-carrier-28787 { width:193px; height:65px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-auto-rows: 1fr;}

.mc-bg-carrier-28806 { width:193px; height:65px; }
</style>`;

describe('P0-A 终裁归一：段级几何只剩一个落点', () => {
  test('真值 class 提取只认「规则体含 flex」的方案 E 规则', () => {
    const cls = collectLayoutTruthClasses(PRODUCT);
    expect([...cls].sort()).toEqual([
      'c-device-monitor-sech-1',
      'c-device-monitor-sech-2',
    ]);
    // 真实产物在真值注释之后还跟 2 条背景/网格规则，不得算作段几何载体
    expect(cls.has('mc-bg-carrier-28787')).toBe(false);
    expect(cls.has('mc-bg-carrier-28806')).toBe(false);
  });

  test('离线回放实锤面：带背景 class 且有 inline flex 的元素不得被误剥/误判', () => {
    const clean = stripInlineGeometryDuplicates(PRODUCT).content;
    const withBg = clean.replace(
      '<TabsSection style="flex:0.111;min-width:0;" />',
      '<TabsSection class="mc-bg-carrier-28806" style="flex:0.111;min-width:0;" />',
    );
    const { content, stats } = stripInlineGeometryDuplicates(withBg);
    expect(content).toBe(withBg);
    expect(stats.truthClasses).toBe(2);
    expect(stats.strippedTags).toBe(0);
    // 本用例只证「背景 class 不误判为段几何载体」；根容器 px 由 P3-A 判据正确命中
    expect(auditInlineGeometryDuplicates(withBg).issues.map((i) => i.id)).not.toContain(INLINE_GEOM_DUP);
  });

  test('真实产物归一：sech 段的 inline 被整条移除（独立字面量断言）', () => {
    const { content, stats } = stripInlineGeometryDuplicates(PRODUCT);
    expect(content).toContain('<StatsMonitor class="c-device-monitor-sech-1" />');
    expect(content).toContain('<StatsSection class="c-device-monitor-sech-2" />');
    expect(content).not.toContain('class="c-device-monitor-sech-1" style=');
    expect(content).not.toContain('class="c-device-monitor-sech-2" style=');
    expect(content).not.toContain('flex:0.072');
    expect(content).not.toContain('flex:0.157');
    expect(stats.strippedTags).toBe(2);
    expect(stats.strippedDecls).toBe(5); // sech-1 两条 + sech-2 三条
  });

  test('零回归：非真值载体的 inline 与 :style 绑定逐字保留', () => {
    const { content } = stripInlineGeometryDuplicates(PRODUCT);
    expect(content).toContain('style="display:flex;flex-direction:column;min-height:0;width:420px;height:425px;margin-left:auto;margin-right:auto;"');
    expect(content).toContain('style="flex:0.761;min-height:0;display:flex;flex-direction:row;align-items:stretch;"');
    expect(content).toContain('<TabsSection style="flex:0.111;min-width:0;" />');
    expect(content).toContain('<CardGrid style="flex:0.889;min-width:0;" />');
    expect(content).toContain(`:style="{ backgroundImage: 'url(' + bgbg8788 + ')', backgroundPosition: '0px 0px' }"`);
    expect(content).toContain('.c-device-monitor-sech-2 { flex: 0 1 65px !important; min-height: 0; margin-top: 4px !important;');
  });

  test('幂等：连续归一两次逐字相同', () => {
    const once = stripInlineGeometryDuplicates(PRODUCT).content;
    expect(stripInlineGeometryDuplicates(once).content).toBe(once);
  });

  test('两层归一：P0 剥双写 + C 剥根容器长度 ⇒ audit 归零（装配出口时序）', () => {
    const { content } = stripInlineGeometryDuplicates(PRODUCT);
    const { issues, stats } = auditInlineGeometryDuplicates(content);
    expect(issues.map((i) => i.id)).toEqual([INLINE_GEOM_PX]);
    expect(stats.dupTags).toBe(0);
    expect(stats.pxTags).toBe(1);
    const final = normalizeInlineLengthPx(content);
    // PRODUCT 的唯一 px 在内容根容器上 ⇒ C 剥除（尺寸归 root-container-normalizer），不搬类
    expect(final.stats.rootKeepTags).toBe(1);
    expect(final.stats.strippedRootTags).toBe(0);
    expect(auditInlineGeometryDuplicates(final.content).issues).toEqual([]);
    // 观测行字段表「单一来源」：geom 组只报段级双写 + 残留 px，px 明细必须走 formatInlinePxStats。
    // （2026-11-16 真机实锤：旧版 geom 行手抄 px* 映射，子键改名后静默恒 0 ⇒ 误判「C 没生效」）
    expect(formatInlineGeomStats('x', { dupTags: 2, pxTags: 1, pxNoAnchorTags: 3 }))
      .toContain('"pxNoAnchorTags":3');
    expect(formatInlineGeomStats('x', { movedTags: 1, movedDecls: 2 })).not.toContain('pxMovedTags');
    expect(formatInlinePxStats('x', final.stats)).toContain('"rootKeepTags":1');
  });
});

describe('P0-B 阳性对照：真错必须命中', () => {
  // 🛡️ P0（2026-11-16）：severity 由 BLOCK 降 WARN（修复靠确定性归一、不靠 LLM 重试；
  //   产物能打开）。「判据仍检出 + 计数正确」是不放宽的锚点，不许改成「不报」。
  test('双载体：原始产物 ⇒ INLINE-GEOM-DUP 仍检出（WARN）', () => {
    const { issues, stats } = auditInlineGeometryDuplicates(PRODUCT);
    expect(issues.map((i) => i.id)).toContain(INLINE_GEOM_DUP);
    expect(issues.find((i) => i.id === INLINE_GEOM_DUP)?.severity).toBe('WARN');
    expect(stats.dupTags).toBe(2);
  });

  test('比例 + px 间距混排 ⇒ INLINE-GEOM-PX 仍检出（WARN，11-14 溢出 101px 形态）', () => {
    const bad = PRODUCT.replace(
      '<TabsSection style="flex:0.111;min-width:0;" />',
      '<TabsSection style="flex:0.111;min-width:0;margin-top:10px;" />',
    );
    const { issues } = auditInlineGeometryDuplicates(bad);
    expect(issues.map((i) => i.id)).toContain(INLINE_GEOM_PX);
    expect(issues.find((i) => i.id === INLINE_GEOM_PX)?.severity).toBe('WARN');
  });

  test('量纲混排不越权：本判据不重写 FLEX-004/005，交由既有门禁', () => {
    // 必须用 P0 + P3-A 两层归一后的干净样本，否则产物自身的 px 会正确触发 INLINE-GEOM-PX
    const clean = normalizeInlineLengthPx(stripInlineGeometryDuplicates(PRODUCT).content).content;
    const mixed = clean.replace('flex:0.111;min-width:0;', 'flex:131 1 0;min-width:0;');
    const { issues } = auditInlineGeometryDuplicates(mixed);
    expect(issues).toEqual([]); // 量纲混排由既有 FLEX-004/005 拦截，本判据不重复实现
    expect(mixed).toContain('flex:131 1 0');
  });
});

describe('P0-B 阴性对照：七类不命中逐字不变', () => {
  const truthStyle = (rule: string) =>
    `<style lang="less" scoped>/* mvgo-layout-truth：段高真值 */ ${rule}</style>`;
  const cases: Array<[string, string]> = [
    ['LLM 自由模板（无 mvgo-layout-truth）', '<template><div style="flex:0.5;min-height:0;margin-top:4px;"></div></template>'],
    ['单段容器（有真值规则但模板无对应 class）', `<template><div class="c-x-slot-con" style="display:flex;flex-direction:column;min-height:0;"><A style="flex:1;min-height:0;" /></div></template>${truthStyle('.c-x-sech-1 { flex: 0 1 30px !important; min-height: 0; }')}`],
    ['无 Figma 几何（flex:1 兜底）', `<template><A class="c-y-other" style="flex:1;min-height:0;" /></template>${truthStyle('.c-y-sech-9 { flex: 0 1 30px !important; }')}`],
    ['容器段（方案 E 跳过，无 sech class）', `<template><div style="flex:0.761;min-height:0;display:flex;flex-direction:row;"></div></template>${truthStyle('.c-z-sech-9 { flex: 0 1 30px !important; }')}`],
    ['横向行带（widths 比例）', `<template><A style="flex:0.111;min-width:0;" /><B style="flex:0.889;min-width:0;" /></template>${truthStyle('.c-w-sech-9 { flex: 0 1 30px !important; }')}`],
    ['takeover 快照（子组件文件）', '<template><div class="c-z-card">ok</div></template><style lang="less" scoped>.c-z-card{color:red}</style>'],
    [':style 动态绑定（base-panel 背景）', `<template><base-panel :style="{ backgroundPosition: '0px 0px', width: '420px' }"></base-panel></template>${truthStyle('.c-p-sech-9 { flex: 0 1 30px !important; }')}`],
  ];

  test.each(cases)('%s ⇒ P0/P3-A 两层归一都原样返回、audit 零 issue', (_name, src) => {
    const { content, stats } = stripInlineGeometryDuplicates(src);
    expect(content).toBe(src);
    expect(stats.strippedTags).toBe(0);
    expect(normalizeInlineLengthPx(src).content).toBe(src);
    expect(auditInlineGeometryDuplicates(src).issues).toEqual([]);
  });

  test('fail-closed：有 mark 但无真值 class 规则 ⇒ 不剥（段高不丢）', () => {
    const noRules = PRODUCT.replace(
      /\.c-device-monitor-sech-\d+\s*\{[^}]*\}/g,
      '',
    );
    const { content, stats } = stripInlineGeometryDuplicates(noRules);
    expect(content).toBe(noRules);
    expect(stats.truthClasses).toBe(0);
    expect(stats.strippedTags).toBe(0);
  });
});

/** mc-max-1794751473723-92612fc0 真实形态（用户 22:11 截图：P0 之后依旧有 inline px） */
const PRODUCT_B = `<template>
  <base-panel panelKey="default-panel">
      <template #header-right>
        <!-- 由生成器按 Figma headerSlots 确定性补齐（模型漏生成兜底） -->
        <span style="display:inline-flex;align-items:center;gap:4px;margin-left:16px;font-size: calc(var(--fontSize, 14px) * 0.9286);line-height:1;white-space:nowrap;">设备类型 28</span>
        <span style="display:inline-flex;align-items:center;gap:4px;margin-left:16px;font-size: calc(var(--fontSize, 14px) * 0.9286);line-height:1;white-space:nowrap;">设备总数 68562</span>
        <span style="display:inline-flex;align-items:center;gap:4px;margin-left:16px;font-size: calc(var(--fontSize, 14px) * 0.9286);line-height:1;white-space:nowrap;">完好率 98%</span>
      </template>
    <div class="c-device-monitor-slot-con c-mc-max-1794751473723-92612fc0" style="display:flex; flex-direction:column; min-height:0; width:420px; height:425px; margin-left:auto; margin-right:auto">
      <TabsTunnelCard class="c-device-monitor-sech-1" />
      <div class="c-device-monitor-cons-con" data-section-id="89:37" style="flex:0.829;min-height:0;display:flex;flex-direction:row;align-items:stretch;" :style="{  backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
        <TabsSection style="flex:0.113;min-width:0;" />
        <CardGrid style="flex:0.887;min-width:0;" />
      </div>
    </div>
  </base-panel>
</template>

<script setup>
const literal = 'style="width:20px"'
</script>

<style lang="less" scoped>
  /* mvgo-layout-truth：段高真值 */
  .c-device-monitor-sech-1 { flex: 0 1 30px !important; min-height: 0; }
</style>`;

describe('C · 终写前归一：inline 绝对长度 px 落到元素既有类（2026-11-16 治本）', () => {
  test('判据收紧阳性：归一前 4 处 px ⇒ INLINE-GEOM-PX 仍检出（WARN）', () => {
    const { issues, stats } = auditInlineGeometryDuplicates(PRODUCT_B);
    expect(issues.map((i) => i.id)).toEqual([INLINE_GEOM_PX]);
    expect(issues[0].severity).toBe('WARN');
    expect(stats.pxTags).toBe(4); // 3 个 T09 span + 1 个 F1 根容器
  });

  test('真实形态归一：3 span 合并进同一个 hdr-text-1（同声明复用）/ 根容器 fail-closed / 零 mvgo-is-*', () => {
    const { content, stats } = normalizeInlineLengthPx(PRODUCT_B);
    expect(stats).toMatchObject({
      eligible: 1,
      movedTags: 3,
      movedDecls: 6,
      syntheticTags: 1,
      syntheticReuseTags: 2,
      rootKeepTags: 1,
      strippedRootTags: 0,
      strippedRootDecls: 0,
      appendedClasses: 1,
      noAnchorTags: 0,
      skippedNoStyleTarget: 0,
    });
    expect(formatInlinePxStats('', stats)).toContain('"movedTags":3');
    // ⭐ C 的第一判据：不再出现 mvgo-is-* 语义层（P3-B 的老路，会被下游写者撕裂）
    expect(content).not.toContain('mvgo-is-');
    // span 用带组件前缀的类：prefix-fixer 不会给「已带正确前缀」的类改名
    expect((content.match(/class="c-device-monitor-hdr-text-1"/g) || []).length).toBe(3);
    // 声明落到类块，且同块按属性名去重（3 个 span 不得产生 3 份 gap）
    expect(content).toContain(
      '.c-device-monitor-hdr-text-1 { gap: 4px !important; margin-left: 16px !important; }',
    );
    expect((content.match(/gap: 4px !important/g) || []).length).toBe(1);
    // var()/calc() 留 inline（postcss-pxtorem 会改变量回退值语义）
    expect(content).toContain('font-size: calc(var(--fontSize, 14px) * 0.9286)');
    expect(content).not.toContain('gap:4px;margin-left:16px;');
    // 根容器：剥完无尺寸兜底 ⇒ S1 fail-closed 保留 inline + 打 root 标记（F1 契约）
    expect(content).toContain('data-mvgo-geom="root"');
    expect(content).toContain('width:420px');
    expect(content).toContain('height:425px');
  });

  test('零回归：:style 绑定 / 比例 inline / 方向 / script 字面量 / sech 段逐字保留', () => {
    const { content } = normalizeInlineLengthPx(PRODUCT_B);
    expect(content).toContain(`:style="{  backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }"`);
    expect(content).toContain('<TabsSection style="flex:0.113;min-width:0;" />');
    expect(content).toContain('<CardGrid style="flex:0.887;min-width:0;" />');
    expect(content).toContain('style="flex:0.829;min-height:0;display:flex;flex-direction:row;align-items:stretch;"');
    expect(content).toContain('<TabsTunnelCard class="c-device-monitor-sech-1" />');
    expect(content).toContain(`const literal = 'style="width:20px"'`); // 扫描域只在 <template> 内
    expect(content).toContain('.c-device-monitor-sech-1 { flex: 0 1 30px !important; min-height: 0; }');
  });

  test('归一后 audit 归零 + 幂等 + 计数行 0 也打', () => {
    const { content } = normalizeInlineLengthPx(PRODUCT_B);
    expect(auditInlineGeometryDuplicates(content).issues).toEqual([]);
    const second = normalizeInlineLengthPx(content);
    expect(second.content).toBe(content);
    expect(second.stats.movedTags).toBe(0);
    expect(formatInlinePxStats('', second.stats)).toContain('"movedTags":0');
  });

  test('真错仍 FAIL：归一后任何来源回灌 inline px ⇒ BLOCK（判据不依赖归一自身）', () => {
    const clean = normalizeInlineLengthPx(PRODUCT_B).content;
    const reintroduced = clean.replace(
      '<TabsSection style="flex:0.113;min-width:0;" />',
      '<TabsSection style="flex:0.113;min-width:0;margin-top:10px;" />',
    );
    expect(auditInlineGeometryDuplicates(reintroduced).issues.map((i) => i.id)).toContain(INLINE_GEOM_PX);
  });

  test('fail-closed：有锚类但拿不到 style 注入点 ⇒ 整份原样返回，不剥 inline', () => {
    const broken = `<template>\n<div class="c-x-sech-1 c-x-sech-2" style="width:20px;height:20px"></div>\n/* mvgo-layout-truth */\n`;
    const { content, stats } = normalizeInlineLengthPx(broken);
    expect(content).toBe(broken);
    expect(stats.skippedNoStyleTarget).toBe(1);
    expect(stats.movedTags).toBe(0);
    expect(auditInlineGeometryDuplicates(broken).issues.map((i) => i.id)).toContain(INLINE_GEOM_PX);
  });

  test('第三档：无任何类且推不出前缀 ⇒ 保留 inline + 打 no-anchor 溯源标记（判据降 WARN）', () => {
    const noClass = `<template>\n<div style="width:20px"></div>\n</template>\n<style lang="less" scoped>/* mvgo-layout-truth */ .c-x-sech-1 { flex: 0 1 30px !important; }</style>\n`;
    const { content, stats } = normalizeInlineLengthPx(noClass);
    expect(stats.noAnchorTags).toBe(1);
    expect(content).toContain('data-mvgo-geom="no-anchor"');
    expect(content).toContain('width:20px');
    const a = auditInlineGeometryDuplicates(content);
    expect(a.stats.pxTags).toBe(0);
    expect(a.stats.pxNoAnchorTags).toBe(1);
    expect(a.issues.length).toBe(1);
    expect(a.issues[0].severity).toBe('WARN');
  });
});

describe('P3-A 阴性对照：非长度 px 形态逐字不变', () => {
  const truth = '<style lang="less" scoped>/* mvgo-layout-truth */ .c-x-sech-1 { flex: 0 1 30px !important; }</style>';
  const cases: Array<[string, string]> = [
    ['img 标签 inline 尺寸（imgTagHasPxSize 判据消费）', `<template><img style="width:20px;height:20px" /></template>${truth}`],
    ['0 值 / auto / 百分比', `<template><div style="min-height:0;margin-left:auto;width:100%"></div></template>${truth}`],
    ['字号 calc 里的 px 回退值（font-size-normalizer 管）', `<template><span style="font-size: calc(var(--fontSize, 14px) * 0.9286)">x</span></template>${truth}`],
    [':style 动态绑定里的 px', `<template><base-panel :style="{ width: '420px', backgroundPosition: '0px 0px' }"></base-panel></template>${truth}`],
    ['无 mvgo-layout-truth（vue3 / LLM 自由模板）', '<template><div style="width:420px;gap:4px"></div></template>'],
    ['只有纯比例 inline', `<template><A style="flex:0.113;min-width:0;" /></template>${truth}`],
  ];

  test.each(cases)('%s ⇒ 归一原样返回、audit 零 issue', (_name, src) => {
    expect(normalizeInlineLengthPx(src).content).toBe(src);
    expect(auditInlineGeometryDuplicates(src).issues).toEqual([]);
  });
});

/** mc-max-1794755060583-69a238c6 真机形态（用户 23:08 截图：哈希 class 膨胀 + S4 tab 块 inline px） */
const PRODUCT_C = `<template>
  <base-panel panelKey="default-panel" :style="{ backgroundImage: 'url(' + bg8527 + ')', backgroundSize: '100% 100%' }">
      <template #header-right>
        <!-- 由生成器按 Figma headerSlots 确定性补齐（模型漏生成兜底） -->
        <span style="display:inline-flex;align-items:center;font-size: calc(var(--fontSize, 14px) * 0.9286);line-height:1;white-space:nowrap;gap:4px;margin-left:16px;">设备类型 28</span>
      </template>
    <div class="c-device-monitor-slot-con c-mc-max-1794755060583-69a238c6" style="display:flex;flex-direction:column;min-height:0;width:420px;height:425px;margin-left:auto;margin-right:auto">
    <div class="mc-s4-tabblock" data-section-id="89:39" style="display:flex;flex-direction:column;align-items:center;gap:0px;padding:4px 0;">
      <div class="mc-s4-tablist" data-section-id="2:8825" style="background:linear-gradient(90deg, rgba(49,138,255,1) 0%, rgba(112,191,255,1) 100%);border-radius:6px;width:100%;display:flex;flex-direction:row;align-items:center;gap:2px;">
        <div class="mc-s4-tab mc-s4-tab--active" style="font-size: var(--fontSize, 14px);line-height:1;white-space:nowrap;cursor:pointer;color:#3b82f6;">监控</div>
      </div>
      <span class="mc-s4-row-link" data-section-id="2:8437" style="font-size: var(--fontSize, 14px);line-height:1;white-space:nowrap;color:#3b82f6;cursor:pointer;">光照度变送器</span>
    </div>
      <ListSwitch class="c-device-monitor-sech-1" />
    </div>
  </base-panel>
</template>

<script setup>
const literal = 'style="width:20px"'
</script>

<style lang="less" scoped>
  /* mvgo-layout-truth：段高真值 */
  .c-device-monitor-sech-1 { flex: 0 1 99px !important; min-height: 0; }
</style>`;

describe('C · 声明落到元素已有类（替代 P3-B 的 mvgo-is-* 语义层）', () => {
  test('判据阳性：T09 span / 根容器 / S4 tabblock / tablist 的 inline px ⇒ BLOCK', () => {
    const { issues, stats } = auditInlineGeometryDuplicates(PRODUCT_C);
    expect(issues.map((i) => i.id)).toContain(INLINE_GEOM_PX);
    expect(stats.pxTags).toBeGreaterThanOrEqual(4);
    const onlyRadius = `<template><div style="border-radius:6px"></div></template><style lang="less" scoped>/* mvgo-layout-truth */ .c-x-sech-1 { flex: 0 1 30px !important; }</style>`;
    expect(auditInlineGeometryDuplicates(onlyRadius).issues.map((i) => i.id)).toContain(INLINE_GEOM_PX);
  });

  test('落点：span 合成带组件前缀的类；S4 块复用 mc-s4-* 已有类；零 mvgo-is-*', () => {
    const { content, stats } = normalizeInlineLengthPx(PRODUCT_C);
    expect(stats).toMatchObject({
      movedTags: 3,
      movedDecls: 5,
      syntheticTags: 1,
      appendedClasses: 3,
      rootKeepTags: 1,
      strippedRootTags: 0,
      strippedRootDecls: 0,
      noAnchorTags: 0,
    });
    expect(content).not.toContain('mvgo-is-');
    expect(content).toContain('class="c-device-monitor-hdr-text-1"');
    expect(content).toContain(
      '.c-device-monitor-hdr-text-1 { gap: 4px !important; margin-left: 16px !important; }',
    );
    // S4 块本身就有类 ⇒ 直接复用，不再派生任何新名
    expect(content).toContain('.mc-s4-tabblock { gap: 0px !important; }');
    expect(content).toContain('.mc-s4-tablist { border-radius: 6px !important; gap: 2px !important; }');
    // 无长度 px 的 S4 元素（tab / row-link）逐字不变
    expect(content).toContain('class="mc-s4-tab mc-s4-tab--active"');
    expect(content).toContain('class="mc-s4-row-link"');
  });

  test('根容器：无尺寸兜底 ⇒ fail-closed 保留；var()/calc()/url() 声明仍刻意留 inline', () => {
    const { content } = normalizeInlineLengthPx(PRODUCT_C);
    expect(content).toContain('class="c-device-monitor-slot-con c-mc-max-1794755060583-69a238c6"');
    expect(content).toContain('data-mvgo-geom="root"');
    expect(content).toContain('width:420px');
    expect(content).toContain('height:425px');
    expect(content).toContain('font-size: calc(var(--fontSize, 14px) * 0.9286)');
    expect(content).toContain('font-size: var(--fontSize, 14px)');
    expect(content).toContain(`:style="{ backgroundImage: 'url(' + bg8527 + ')', backgroundSize: '100% 100%' }"`);
  });

  test('归一后 audit 归零 + 幂等（两道归一互不重复注入）', () => {
    const { content } = normalizeInlineLengthPx(PRODUCT_C);
    expect(auditInlineGeometryDuplicates(content).issues).toEqual([]);
    const second = normalizeInlineLengthPx(content);
    expect(second.content).toBe(content);
    expect(second.stats.movedTags).toBe(0);
    expect(second.stats.appendedClasses).toBe(0);
  });

  test('零回归：script 字面量 / sech 段规则逐字保留', () => {
    const { content } = normalizeInlineLengthPx(PRODUCT_C);
    expect(content).toContain(`const literal = 'style="width:20px"'`);
    expect(content).toContain('<ListSwitch class="c-device-monitor-sech-1" />');
    expect(content).toContain('.c-device-monitor-sech-1 { flex: 0 1 99px !important; min-height: 0; }');
  });

  test('真错仍 FAIL：归一后回灌 border-radius / margin-top px ⇒ BLOCK', () => {
    const clean = normalizeInlineLengthPx(PRODUCT_C).content;
    const back = clean.replace(
      '<ListSwitch class="c-device-monitor-sech-1" />',
      '<ListSwitch class="c-device-monitor-sech-1" style="border-radius:8px;margin-top:10px;" />',
    );
    expect(auditInlineGeometryDuplicates(back).issues.map((i) => i.id)).toContain(INLINE_GEOM_PX);
  });
});

describe('S3 · 同落点类同属性冲突（2026-11-16 · 静默覆盖实锤）', () => {
  const truth =
    '<style lang="less" scoped>/* mvgo-layout-truth */ .c-x-sech-1 { flex: 0 1 30px !important; }</style>';

  test('不同值 ⇒ 首条优先 + 冲突注释 + INLINE-GEOM-CONFLICT WARN（不 BLOCK）', () => {
    const src =
      `<template><div class="c-x-sech-1">` +
      `<div class="mc-s4-tab" style="margin-left:4px"></div>` +
      `<div class="mc-s4-tab" style="margin-left:12px"></div>` +
      `</div></template>${truth}`;
    const { content, stats } = normalizeInlineLengthPx(src);
    expect(stats.conflictClasses).toBe(1);
    expect(stats.conflictDecls).toBe(1);
    expect(stats.keptConflictTags).toBe(1);
    // 类侧只有首条（4px），inline 两侧都已剥净 ⇒ 不存在「后写覆盖前写」
    expect(content).toContain('margin-left: 4px !important');
    expect(content).not.toContain('margin-left: 12px !important');
    expect(content).not.toContain('style="margin-left:4px"');
    expect(content).not.toContain('style="margin-left:12px"');
    expect(content).toContain('mvgo-inline-conflict:');
    const { issues, stats: aud } = auditInlineGeometryDuplicates(content);
    expect(aud.conflictNotes).toBe(1);
    expect(issues.map((i) => i.id)).toEqual([INLINE_GEOM_CONFLICT]);
    expect(issues[0].severity).toBe('WARN');
  });

  test('同值重复 ⇒ 不算冲突（幂等），不产生注释', () => {
    const src =
      `<template><div class="c-x-sech-1">` +
      `<div class="mc-s4-tab" style="margin-left:4px"></div>` +
      `<div class="mc-s4-tab" style="margin-left:4px"></div>` +
      `</div></template>${truth}`;
    const { content, stats } = normalizeInlineLengthPx(src);
    expect(stats.conflictDecls).toBe(0);
    expect(stats.conflictClasses).toBe(0);
    expect(content).not.toContain('mvgo-inline-conflict:');
  });
});

describe('S2 · 落点命名唯一化（2026-11-16 · 撞名/覆盖实锤）', () => {
  const truth =
    '<style lang="less" scoped>/* mvgo-layout-truth */ .c-x-sech-1 { flex: 0 1 30px !important; }</style>';

  test('同类别不同声明 ⇒ 两个不同类名（不共用同一块、不互相覆盖）', () => {
    const src =
      `<template><div class="c-x-sech-1"><div class="c-x-sech-2"></div>` +
      `<span style="margin-left:4px">a</span><span style="margin-left:12px">b</span>` +
      `</div></template>${truth}`;
    const { content, stats } = normalizeInlineLengthPx(src);
    expect(stats.syntheticTags).toBe(2);
    expect(stats.syntheticReuseTags).toBe(0);
    expect(content).toContain('.c-x-geom-1 { margin-left: 4px !important; }');
    expect(content).toContain('.c-x-geom-2 { margin-left: 12px !important; }');
  });

  test('同类别同声明 ⇒ 复用同一类名（避免拆出 N 份相同规则）', () => {
    const src =
      `<template><div class="c-x-sech-1"><div class="c-x-sech-2"></div>` +
      `<span style="margin-left:4px">a</span><span style="margin-left:4px">b</span>` +
      `</div></template>${truth}`;
    const { content, stats } = normalizeInlineLengthPx(src);
    expect(stats.syntheticTags).toBe(1);
    expect(stats.syntheticReuseTags).toBe(1);
    expect((content.match(/\.c-x-geom-1 \{/g) || []).length).toBe(1);
  });

  test('LCP 末段是结构词 ⇒ 退到组件名，不合成 sech-* 形态的假段类', () => {
    const src =
      `<template><div class="c-x-sech-1" style="gap:8px;"></div>` +
      `<div class="c-x-sech-2"></div><span style="margin-left:4px">a</span></template>${truth}`;
    const { content } = normalizeInlineLengthPx(src);
    expect(content).toContain('.c-x-geom-1 {');
    expect(content).not.toContain('.c-x-sech-geom');
  });

  test('非 scoped 产物 ⇒ 不合成（避免全局类污染），走 no-anchor 标记', () => {
    const unscoped =
      '<style lang="less">/* mvgo-layout-truth */ .c-x-sech-1 { flex: 0 1 30px !important; }</style>';
    const src = `<template><div class="c-x-sech-1"><span style="margin-left:4px">a</span></div></template>${unscoped}`;
    const { content, stats } = normalizeInlineLengthPx(src);
    expect(stats.syntheticTags).toBe(0);
    expect(stats.skippedNonScoped).toBe(1);
    expect(stats.noAnchorTags).toBe(1);
    expect(content).toContain('data-mvgo-geom="no-anchor"');
    expect(content).toContain('margin-left:4px');
  });
});

describe('S1 · 根容器 fail-closed（2026-11-16 · f5c9792c 实锤）', () => {
  const truth =
    '<style lang="less" scoped>/* mvgo-layout-truth */ .c-x-sech-1 { flex: 0 1 30px !important; }</style>';
  const PX_ROOT = `<template><div class="c-x-slot-con" style="display:flex;flex-direction:column;min-height:0;width:420px;height:425px;margin-left:auto;margin-right:auto;"></div></template>${truth}`;

  test('剥完无尺寸兜底 ⇒ 不剥 / 保留 inline / 打 root 标记 / 判据不计 BLOCK', () => {
    const { content, stats } = normalizeInlineLengthPx(PX_ROOT);
    expect(stats.rootKeepTags).toBe(1);
    expect(stats.strippedRootTags).toBe(0);
    expect(content).toContain('width:420px');
    expect(content).toContain('height:425px');
    expect(content).toContain('data-mvgo-geom="root"');
    const { issues, stats: aud } = auditInlineGeometryDuplicates(content);
    expect(issues).toEqual([]);
    expect(aud.pxRootKeepTags).toBe(1);
  });

  test('剥完仍有尺寸兜底（height:100%）⇒ 照剥，不打标记', () => {
    const src = `<template><div class="c-x-slot-con" style="display:flex;flex-direction:column;height:100%;width:420px;gap:8px;"></div></template>${truth}`;
    const { content, stats } = normalizeInlineLengthPx(src);
    expect(stats.strippedRootTags).toBe(1);
    expect(stats.rootKeepTags).toBe(0);
    expect(content).not.toContain('width:420px');
    expect(content).toContain('height:100%');
    expect(content).not.toContain('data-mvgo-geom="root"');
  });

  test('幂等：二次归一内容逐字不变、标记只加一次', () => {
    const once = normalizeInlineLengthPx(PX_ROOT).content;
    const twice = normalizeInlineLengthPx(once).content;
    expect(twice).toBe(once);
    expect((once.match(/data-mvgo-geom="root"/g) || []).length).toBe(1);
  });
});

describe('C 阴性对照：非长度 px 形态逐字不变', () => {
  const truth = '<style lang="less" scoped>/* mvgo-layout-truth */ .c-x-sech-1 { flex: 0 1 30px !important; }</style>';
  const cases: Array<[string, string]> = [
    ['普通 P6 根容器（无 px 尺寸，非 F1 弹窗类）', `<template><div class="c-x-slot-con" style="display:flex;flex-direction:column;min-height:0;"><A style="flex:1;min-height:0;" /></div></template>${truth}`],
    ['LLM 自由 div（无长度 px / 无类可落）', `<template><div style="color:#fff;cursor:pointer">x</div></template>${truth}`],
    ['无 mvgo-layout-truth（vue3 / mc-lite / LLM 自由模板）', '<template><span style="display:inline-flex;gap:4px;margin-left:16px">x</span></template>'],
    ['img 标签 inline 尺寸', `<template><img style="width:20px;height:20px" /></template>${truth}`],
    ['纯比例 inline（P1 量纲统一范畴，本轮不动）', `<template><A style="flex:0.113;min-width:0;" /></template>${truth}`],
    [':style 动态绑定', `<template><base-panel :style="{ width: '420px' }"></base-panel></template>${truth}`],
  ];

  test.each(cases)('%s ⇒ 归一原样返回、audit 零 issue', (_name, src) => {
    expect(normalizeInlineLengthPx(src).content).toBe(src);
    expect(auditInlineGeometryDuplicates(src).issues).toEqual([]);
  });

  test('url() 声明留 inline：剥根容器长度时不得把资源路径搬走', () => {
    const src = `<template><div class="c-x-slot-con c-x-sech-1" style="width:420px;height:100%;background:url(a.png);"></div></template>${truth}`;
    const { content } = normalizeInlineLengthPx(src);
    expect(content).toContain('background:url(a.png)');
    expect(content).not.toContain('width:420px');
    expect(auditInlineGeometryDuplicates(content).issues).toEqual([]);
  });
});

/**
 * 🛡️ 写盘出口归一（2026-11-15 · mc-max-1794756373942-3cacdefb 实锤）
 *
 * 病灶链（真机日志 + 产物双向取证）：
 *   ① microcode-engineer 终写前归一看到的是「Tab 骨架注入前」内存版
 *      （15:29:10.138 scannedTags=8 / movedTags=0 / 各类 skip 全 0）；
 *   ② file-writer.js:1412 injectMissingTabUi 在**写盘器内部**注入硬编码 inline px
 *      （`display:flex;gap:8px;margin-bottom:12px;` / `padding:4px 12px;border-radius:4px;…`）；
 *   ③ 磁盘落成「注入后」11 标签版 ⇒ phase2 [INLINE-GEOM-PX] ERROR ⇒ 禁止晋升 last-good。
 * 治本点＝落盘唯一出口（file-writer.js writeFileSync 前的最终定稿处）跑同一归一。
 * 本组用 injectMissingTabUi 真实注入 + 归一，锚住「注入就会产生 px」这一事实，
 * 防止日后有人把出口归一删掉而单测仍全绿。
 */
describe('C · 写盘出口归一：Tab 骨架注入的 inline px 落到元素已有类', () => {
  const SFC = `<template>
  <base-panel panelKey="default-panel">
    <div class="c-tm-slot-con">
      <ContentTunnel class="c-tm-sech-1" />
    </div>
  </base-panel>
</template>

<script setup>
import { ref } from 'vue'
const tabs = [{ label: '流量', value: 'flow' }, { label: '预测', value: 'forecast' }]
const activeTab = ref('flow')
function handleTabChange(v) { activeTab.value = v }
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
  /* mvgo-layout-truth：段高真值（px 由 postcss-pxtorem 转 rem，勿改为 inline） */
  .c-tm-sech-1 { flex: 0 1 129px !important; min-height: 0; }
</style>
`;

  test('注入前：产物本身零 inline px（阴性对照，证明 px 确实来自注入）', () => {
    expect(auditInlineGeometryDuplicates(SFC).issues).toEqual([]);
  });

  test('注入后：确实带 2 处 inline px ⇒ 归一前必 BLOCK（阳性对照）', () => {
    const injected = injectMissingTabUi(SFC);
    expect(injected).not.toBe(SFC);
    expect(injected).toContain('gap:8px');
    expect(injected).toContain('padding:4px 12px');
    expect(auditInlineGeometryDuplicates(injected).issues.map((i) => i.id)).toContain(INLINE_GEOM_PX);
  });

  test('归一后：0 处 inline px，声明落到 c-tm-slot-con-tabs / -tab-item 已有类', () => {
    const injected = injectMissingTabUi(SFC);
    const { content, stats } = normalizeInlineLengthPx(injected);
    expect(stats).toMatchObject({
      movedTags: 2,
      movedDecls: 4,
      appendedClasses: 2,
      syntheticTags: 0, // 注入的骨架自带类名 ⇒ 不需要合成
      noAnchorTags: 0,
    });
    // 只断言「标签区」不再带 px —— less 规则里本就该有这些声明
    const head = content.slice(0, content.search(/<style\b/i));
    expect(head).not.toContain('gap:8px');
    expect(head).not.toContain('padding:4px 12px');
    // ⭐ C 的核心：不新造 mvgo-is-* 语义层
    expect(content).not.toContain('mvgo-is-');
    expect(content).toContain(
      '.c-tm-slot-con-tabs { gap: 8px !important; margin-bottom: 12px !important; }',
    );
    expect(content).toContain(
      '.c-tm-slot-con-tab-item { padding: 4px 12px !important; border-radius: 4px !important; }',
    );
    expect(auditInlineGeometryDuplicates(content).issues).toEqual([]);
  });

  test('幂等：二次归一逐字不变（出口归一重复触发不得叠加规则）', () => {
    const once = normalizeInlineLengthPx(injectMissingTabUi(SFC)).content;
    const twice = normalizeInlineLengthPx(once);
    expect(twice.content).toBe(once);
    expect(twice.stats.movedTags).toBe(0);
  });

  test('无 mvgo-layout-truth 标记 ⇒ 出口归一原样返回（fail-closed，交 L0-B 拒收）', () => {
    const noMark = SFC.replace(/\s*\/\* mvgo-layout-truth[^*]*\*\//, '');
    const injected = injectMissingTabUi(noMark);
    const { content, stats } = normalizeInlineLengthPx(injected);
    expect(stats.eligible).toBe(0);
    expect(content).toBe(injected);
  });
});
