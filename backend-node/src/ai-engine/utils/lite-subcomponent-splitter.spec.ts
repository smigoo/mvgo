/**
 * Lite 单 SFC → 多子组件（Phase 2）判据。
 *
 * 判据口径（与 splitLiteSfcIntoSubcomponents 同一实现，禁止另写一份正则）：
 *  阳性：≥2 个「业务模块级纯静态块」→ 语义命名子组件、父 import 齐全、拼回逐字节一致、
 *        scoped 样式随块复制（覆盖率 100%）、compileStyle 真编译、I/O 幂等且清孤儿。
 *  阴性：单 section / 无法静态定位的 DOM 暴露 / 绑定块 / id|ref / 大写组件 / 已拆产物 /
 *        标签不配对 / 样式覆盖率不足 → 一律不拆，且 index.vue 与输入**字节级一致**。
 *  Phase 2 新增维度：根 class 语义命名、≥4 元素 + ≥200B 粒度门槛、静态块不下钻叶子、
 *        v-for 列表项内部不拆（真机 mv-lite-1794400275965-ea99d36f 的卡片图标）。
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  splitLiteSfcIntoSubcomponents,
  reassembleLiteSfc,
  applyLiteSubcomponentSplit,
  isLiteSplitStaticBlock,
  isLiteSplitSafeScript,
  isLiteSplitModuleBlock,
  collectScriptDomSelectors,
  blockMatchesDomSelector,
  hasHardUnsafeMarker,
  hasHardUnsafeTag,
  commonClassPrefix,
  semanticComponentName,
  rootClassToken,
  collectClassTokens,
  parseTopLevelStyleRules,
  selectScopedStyleForBlock,
  LITE_SPLIT_VERSION,
  __testing,
} from './lite-subcomponent-splitter.js';
import { compileIndexCssStrict } from './index-css-recompiler.js';

/** legend 加满 4 个 item ⇒ ≥4 元素 / ≥200B，代表一个完整业务模块（不是叶子碎片） */
const POSITIVE_SFC = `<template>
  <base-panel panelKey="default-panel">
    <div class="c-demo-content">
      <div class="c-demo-stats">
        <div class="c-demo-stat-card">
          <span class="c-demo-stat-label">总设备</span>
          <span class="c-demo-stat-value">8</span>
        </div>
        <div class="c-demo-stat-card">
          <span class="c-demo-stat-label">运行中</span>
          <span class="c-demo-stat-value">2</span>
        </div>
      </div>
      <div class="c-demo-table" :columns="columns">
        <span>{{ columns.length }}</span>
      </div>
      <div class="c-demo-footer">
        <div class="c-demo-legend">
          <span class="c-demo-legend-item">运行中</span>
          <span class="c-demo-legend-item">离线</span>
          <span class="c-demo-legend-item">告警</span>
          <span class="c-demo-legend-item">停用</span>
        </div>
        <a class="c-demo-link" @click="handleClose">详情</a>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref } from 'vue'
const columns = ref([])
const handleClose = () => {}
</script>

<style lang="less">
@import '../resources/styles/index.less';
.c-demo-stats { display: flex; }
</style>`;

/** Vue3 Lite：<style scoped> 两个块都有命中规则 ⇒ 可拆且各自带样式 */
const SCOPED_SFC = POSITIVE_SFC.replace(
  /<style lang="less">[\s\S]*?<\/style>/,
  `<style scoped>
.c-demo-stats { display: flex; }
.c-demo-stat-card { color: #fff; }
.c-demo-legend { display: flex; }
.c-demo-legend-item { padding: 2px 4px; }
</style>`,
);

/** 覆盖率不足：legend 块在父样式里没有任何规则 ⇒ 必须整体放弃拆分 */
const SCOPED_INCOMPLETE_SFC = POSITIVE_SFC.replace(
  /<style lang="less">[\s\S]*?<\/style>/,
  `<style scoped>
.c-demo-stats { display: flex; }
.c-demo-stat-card { color: #fff; }
</style>`,
);

const SINGLE_SFC = `<template>
  <div class="c-only">
    <span class="c-only-label">唯一的区块</span>
  </div>
</template>

<script setup>
const x = 1
</script>

<style lang="less">
@import '../resources/styles/index.less';
.c-only { display: flex; }
</style>`;

/** 真机 mc-lite-1794400267712-73394f4b 形态：header + 两张统计卡数据区 + 165B 徽标 */
const REALISTIC_MC_SFC = `<template>
  <base-panel panelKey="default-panel">
    <div class="c-equipment-monitoring-content">
      <div class="c-equipment-monitoring-header">
        <div class="c-equipment-monitoring-header-left">
          <span class="c-equipment-monitoring-header-icon"></span>
          <span class="c-equipment-monitoring-header-title">设备监测</span>
        </div>
        <div class="c-equipment-monitoring-header-right">
          <span class="c-equipment-monitoring-header-item">
            <span class="c-equipment-monitoring-header-label">设备类型</span>
            <span class="c-equipment-monitoring-header-value">28</span>
          </span>
          <span class="c-equipment-monitoring-header-item">
            <span class="c-equipment-monitoring-header-label">设备总数</span>
            <span class="c-equipment-monitoring-header-value">68562</span>
          </span>
        </div>
      </div>
      <div class="c-equipment-monitoring-stats">
        <div class="c-equipment-monitoring-stat-card">
          <div class="c-equipment-monitoring-stat-icon">
            <img :src="shieldIcon" class="c-equipment-monitoring-stat-icon-img" />
          </div>
          <div class="c-equipment-monitoring-stat-body">
            <div class="c-equipment-monitoring-stat-row">
              <span class="c-equipment-monitoring-stat-label">总 数:</span>
              <span class="c-equipment-monitoring-stat-num">56302</span>
            </div>
            <div class="c-equipment-monitoring-stat-row">
              <span class="c-equipment-monitoring-stat-sub">隧道设备</span>
              <span class="c-equipment-monitoring-stat-label">异常数:</span>
              <span class="c-equipment-monitoring-stat-abnormal">5</span>
            </div>
          </div>
        </div>
        <div class="c-equipment-monitoring-stat-card">
          <div class="c-equipment-monitoring-stat-icon">
            <img :src="shieldIcon" class="c-equipment-monitoring-stat-icon-img" />
          </div>
          <div class="c-equipment-monitoring-stat-body">
            <div class="c-equipment-monitoring-stat-row">
              <span class="c-equipment-monitoring-stat-label">总 数:</span>
              <span class="c-equipment-monitoring-stat-num">1280</span>
            </div>
            <div class="c-equipment-monitoring-stat-row">
              <span class="c-equipment-monitoring-stat-sub">南北接线设备</span>
              <span class="c-equipment-monitoring-stat-label">异常数:</span>
              <span class="c-equipment-monitoring-stat-abnormal">3</span>
            </div>
          </div>
        </div>
      </div>
      <div class="c-equipment-monitoring-main">
        <div class="c-equipment-monitoring-sidebar">
          <div class="c-equipment-monitoring-tab-badge-wrap">
            <span class="c-equipment-monitoring-tab-badge">3/3740</span>
          </div>
          <div v-for="tab in tabs" :key="tab.key" class="c-equipment-monitoring-tab">
            <span class="c-equipment-monitoring-tab-text">{{ tab.label }}</span>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref } from 'vue'
const shieldIcon = ''
const tabs = ref([])
</script>

<style lang="less">
@import '../resources/styles/index.less';
</style>`;

/** 真机 mv-lite-1794400275965-ea99d36f 形态：header + overview 整块 + v-for 卡片图标 */
const REALISTIC_VUE3_SFC = `<template>
  <div class="equipment-monitor">
    <div class="equipment-monitor-header">
      <div class="equipment-monitor-title">设备监测</div>
      <div class="equipment-monitor-header-stats">
        <span class="equipment-monitor-header-item">
          <span class="equipment-monitor-header-label">设备类型</span>
          <span class="equipment-monitor-header-num">28</span>
        </span>
        <span class="equipment-monitor-header-item">
          <span class="equipment-monitor-header-label">设备总数</span>
          <span class="equipment-monitor-header-num">68562</span>
        </span>
      </div>
    </div>
    <div class="equipment-monitor-overview">
      <div class="equipment-monitor-overview-card">
        <div class="equipment-monitor-overview-icon">
          <svg viewBox="0 0 24 24"><path d="M1 1L2 2" /></svg>
        </div>
        <div class="equipment-monitor-overview-content">
          <div class="equipment-monitor-overview-row">
            <span class="equipment-monitor-overview-label">总数:</span>
            <span class="equipment-monitor-overview-num">56302</span>
          </div>
          <div class="equipment-monitor-overview-row">
            <span class="equipment-monitor-overview-label">异常数:</span>
            <span class="equipment-monitor-overview-danger">5</span>
          </div>
        </div>
      </div>
    </div>
    <div class="equipment-monitor-grid">
      <div v-for="(device, index) in devices" :key="index" class="equipment-monitor-card">
        <div class="equipment-monitor-card-icon">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /></svg>
        </div>
        <div class="equipment-monitor-card-content">
          <div class="equipment-monitor-card-name">{{ device.name }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
const devices = ref([])
</script>

<style scoped>
.equipment-monitor { width: 100%; }
.equipment-monitor-header { display: flex; }
.equipment-monitor-title { font-size: 16px; }
.equipment-monitor-header-stats { display: flex; }
.equipment-monitor-header-item { display: inline-flex; }
.equipment-monitor-header-label { color: #666; }
.equipment-monitor-header-num { color: #2F80ED; }
.equipment-monitor-overview { display: flex; }
.equipment-monitor-overview-card { flex: 1; }
.equipment-monitor-overview-icon { width: 24px; }
.equipment-monitor-overview-content { flex: 1; }
.equipment-monitor-overview-row { display: flex; }
.equipment-monitor-overview-label { color: #666; }
.equipment-monitor-overview-num { font-weight: 700; }
.equipment-monitor-overview-danger { color: red; }
.equipment-monitor-grid { display: grid; }
.equipment-monitor-card { display: flex; }
.equipment-monitor-card-icon { width: 14px; }
.equipment-monitor-card-content { flex: 1; }
.equipment-monitor-card-name { font-size: 12px; }
</style>`;

describe('splitLiteSfcIntoSubcomponents（阳性：语义命名的业务模块）', () => {
  it('① 真实 Lite 形态：拆出语义名组件，父 import/标签齐全，拼回逐字节一致', () => {
    const r = splitLiteSfcIntoSubcomponents(POSITIVE_SFC);

    expect(r.version).toBe(LITE_SPLIT_VERSION);
    expect(r.changed).toBe(true);
    expect(r.reason).toBe('ok');
    expect(r.stats.split).toBe(2);
    expect(r.stats.staticBlocks).toBe(2);
    expect(r.stats.skipped).toBeGreaterThan(0);

    const rels = Object.keys(r.files).sort();
    expect(rels).toEqual([
      'package/components/LegendSection.vue',
      'package/components/StatsSection.vue',
      'package/index.vue',
    ]);

    const parent = r.files['package/index.vue'];
    expect(parent).toContain("import StatsSection from './components/StatsSection.vue'");
    expect(parent).toContain("import LegendSection from './components/LegendSection.vue'");
    expect(parent).toContain('<StatsSection />');
    expect(parent).toContain('<LegendSection />');
    expect(parent).toContain("@import '../resources/styles/index.less'");
    expect(parent).toContain('const columns = ref([])');
    expect(reassembleLiteSfc(r)).toBe(POSITIVE_SFC);
  });

  it('② 微码子组件仍是 template-only（样式由 resources/styles 全局注入）', () => {
    const r = splitLiteSfcIntoSubcomponents(POSITIVE_SFC);
    for (const [rel, content] of Object.entries(r.files)) {
      if (rel === 'package/index.vue') continue;
      expect(content).toMatch(/^<template>\n/);
      expect(content).not.toMatch(/<style[\s>]/i);
      expect(content).not.toMatch(/<script[\s>]/i);
      expect(content).toContain('c-demo-');
      expect((__testing as any).validateSplitFile(content, rel)).toEqual([]);
    }
    expect((__testing as any).validateSplitFile(r.files['package/index.vue'], 'package/index.vue')).toEqual([]);
  });

  it('③ 真机 mc 形态：3 个语义模块，165B 徽标不再成为组件', () => {
    const r = splitLiteSfcIntoSubcomponents(REALISTIC_MC_SFC);
    expect(r.changed).toBe(true);
    expect(Object.keys(r.files).filter((p) => p.includes('/components/')).sort()).toEqual([
      'package/components/HeaderSection.vue',
      'package/components/StatBodySection.vue',
      'package/components/StatBodySection2.vue',
    ]);
    // 徽标块既不在父模板（被原地保留），也没有任何 BadgeWrap 组件
    expect(JSON.stringify(r.files)).not.toContain('BadgeWrapSection');
    expect(r.files['package/index.vue']).toContain('c-equipment-monitoring-tab-badge-wrap');
    expect(reassembleLiteSfc(r)).toBe(REALISTIC_MC_SFC);
  });

  it('④ 嵌套 <template #slot> 用配对扫描，不被非贪婪正则截断', () => {
    const withSlot = POSITIVE_SFC.replace(
      '    <div class="c-demo-content">',
      '    <template #header-right>\n      <span class="c-demo-header-tag">实时</span>\n    </template>\n    <div class="c-demo-content">',
    );
    const tpl = (__testing as any).extractRootTemplate(withSlot);
    expect(tpl.body).toContain('c-demo-footer');
    const r = splitLiteSfcIntoSubcomponents(withSlot);
    expect(r.changed).toBe(true);
    expect(reassembleLiteSfc(r)).toBe(withSlot);
  });

  it('⑤ 资源相对路径按子组件层级归一（后端/前端同款判据）', () => {
    const withAsset = POSITIVE_SFC.replace(
      '<span class="c-demo-stat-value">8</span>',
      '<img class="c-demo-stat-icon" src="../resources/images/icon.png" />',
    );
    const r = splitLiteSfcIntoSubcomponents(withAsset);
    expect(r.changed).toBe(true);
    const all = Object.values(r.files).join('\n');
    expect(all === withAsset || all.includes('../../resources/images/icon.png')).toBe(true);
    expect(reassembleLiteSfc(r)).toBe(withAsset);
  });
});

describe('Vue3 Lite：<style scoped> 随块迁移（Phase 2）', () => {
  it('① 两个子组件各自带 <style scoped>，父规则原样保留，终验 0 错', () => {
    const r = splitLiteSfcIntoSubcomponents(SCOPED_SFC);
    expect(r.changed).toBe(true);
    expect(r.reason).toBe('ok');

    const stats = r.files['package/components/StatsSection.vue'];
    const legend = r.files['package/components/LegendSection.vue'];
    expect(stats).toContain('<style scoped>');
    expect(stats).toContain('.c-demo-stats');
    expect(stats).not.toContain('.c-demo-legend'); // 不是整份复制
    expect(legend).toContain('.c-demo-legend');
    expect(legend).toContain('.c-demo-legend-item');
    expect(legend).not.toContain('.c-demo-stats');
    // 父样式是叠加不是移动：四条规则都在
    for (const sel of ['.c-demo-stats', '.c-demo-stat-card', '.c-demo-legend', '.c-demo-legend-item']) {
      expect(r.files['package/index.vue']).toContain(sel);
    }
    for (const [rel, content] of Object.entries(r.files)) {
      expect((__testing as any).validateSplitFile(content, rel)).toEqual([]);
    }
    expect(reassembleLiteSfc(r)).toBe(SCOPED_SFC);
  });

  it('② 覆盖率判据：块内 class 在父样式里有规则却没被复制 ⇒ 整体放弃拆分', () => {
    const r = splitLiteSfcIntoSubcomponents(SCOPED_INCOMPLETE_SFC);
    expect(r.changed).toBe(false);
    expect(r.reason).toBe('style-migration-empty');
    expect(r.files['package/index.vue']).toBe(SCOPED_INCOMPLETE_SFC);
  });

  it('③ 真机 vue3 形态：header + overview 两个模块，v-for 卡片图标不拆', () => {
    const r = splitLiteSfcIntoSubcomponents(REALISTIC_VUE3_SFC);
    expect(r.changed).toBe(true);
    expect(Object.keys(r.files).filter((p) => p.includes('/components/')).sort()).toEqual([
      'package/components/HeaderSection.vue',
      'package/components/OverviewSection.vue',
    ]);
    expect(JSON.stringify(r.files)).not.toContain('CardIconSection');
    const header = r.files['package/components/HeaderSection.vue'];
    const overview = r.files['package/components/OverviewSection.vue'];
    expect(header).toContain('.equipment-monitor-header');
    expect(overview).toContain('.equipment-monitor-overview');
    // v-for 卡片仍在父模板里，没有被拆走
    expect(r.files['package/index.vue']).toContain('equipment-monitor-card-icon');
    for (const [rel, content] of Object.entries(r.files)) {
      expect((__testing as any).validateSplitFile(content, rel)).toEqual([]);
    }
    expect(reassembleLiteSfc(r)).toBe(REALISTIC_VUE3_SFC);
  });

  it('④ 复杂样式（@media 嵌套）整份复制，不按规则切分', () => {
    const complex = SCOPED_SFC.replace(
      '.c-demo-stats { display: flex; }',
      '@media (max-width: 600px) { .c-demo-stats { display: block; } }',
    );
    const parsed = parseTopLevelStyleRules(complex.match(/<style scoped>([\s\S]*?)<\/style>/)![1]);
    expect(parsed.complex).toBe(true);
    const r = splitLiteSfcIntoSubcomponents(complex);
    expect(r.changed).toBe(true);
    for (const [rel, content] of Object.entries(r.files)) {
      if (rel === 'package/index.vue') continue;
      expect(content).toContain('@media');
    }
    expect(reassembleLiteSfc(r)).toBe(complex);
  });
});

describe('splitLiteSfcIntoSubcomponents（阴性：不可拆必须原样返回，不假绿）', () => {
  const cases: Array<[string, string, string]> = [
    ['单 section 截图', SINGLE_SFC, 'single-section'],
    ['脚本用 $refs', POSITIVE_SFC.replace('const columns = ref([])', "const columns = ref([])\nconsole.log($refs.chart)"), 'script-dom-api'],
    ['脚本 defineExpose', POSITIVE_SFC.replace('const columns = ref([])', 'const columns = ref([])\ndefineExpose({ columns })'), 'script-dom-api'],
    ['变量选择器（无法静态定位）', POSITIVE_SFC.replace('const columns = ref([])', 'const columns = ref([])\nconst el = document.querySelector(sel)'), 'script-dom-api'],
    ['标签选择器（无法静态归一）', POSITIVE_SFC.replace('const columns = ref([])', 'const columns = ref([])\nconst el = document.querySelector("div")'), 'script-dom-api'],
    ['getElementsByTagName（全文档节点）', POSITIVE_SFC.replace('const columns = ref([])', "const columns = ref([])\nconst els = document.getElementsByTagName('div')"), 'script-dom-api'],
    ['块含 id= 锚点（DOM 查询风险）', POSITIVE_SFC.replace('class="c-demo-stats"', 'class="c-demo-stats" id="stats"'), 'insufficient-static-blocks'],
    ['块含模板 ref=', POSITIVE_SFC.replace('class="c-demo-stats"', 'class="c-demo-stats" ref="stats"'), 'insufficient-static-blocks'],
    ['标签不配对', POSITIVE_SFC.replace('</base-panel>', ''), 'unbalanced-template'],
  ];

  it.each(cases)('%s ⇒ 不拆且 index.vue 字节级一致', (_label, source, expectedReason) => {
    const r = splitLiteSfcIntoSubcomponents(source);
    expect(r.changed).toBe(false);
    expect(r.reason).toBe(expectedReason);
    expect(Object.keys(r.files)).toEqual(['package/index.vue']);
    expect(r.files['package/index.vue']).toBe(source);
    expect(reassembleLiteSfc(r)).toBe(source);
  });

  it('真机形态：脚本含 echarts.init + ResizeObserver 仍可拆（旧版会整份否决）', () => {
    const withCharts = POSITIVE_SFC.replace(
      'const columns = ref([])',
      `const columns = ref([])
const chartRef1 = ref(null)
onMounted(() => {
  const c = echarts.init(chartRef1.value)
  ro1 = new ResizeObserver(() => c.resize())
})`,
    );
    const r = splitLiteSfcIntoSubcomponents(withCharts);
    expect(r.changed).toBe(true);
    expect(r.reason).toBe('ok');
    expect(reassembleLiteSfc(r)).toBe(withCharts);
  });

  it('字面量 class 选择器：命中块连同子树跳过（不因下钻被绕过）', () => {
    const withQuery = POSITIVE_SFC.replace(
      'const columns = ref([])',
      `const columns = ref([])
const el = document.querySelector('.c-demo-stats')`,
    );
    const r = splitLiteSfcIntoSubcomponents(withQuery);
    for (const [rel, content] of Object.entries(r.files)) {
      if (rel === 'package/index.vue') continue;
      expect(content).not.toContain('c-demo-stat-card');
    }
    if (r.changed) expect(reassembleLiteSfc(r)).toBe(withQuery);
    else expect(r.files['package/index.vue']).toBe(withQuery);
  });

  it('已拆产物（续跑/二次发布）幂等，不再拆一次', () => {
    const r = splitLiteSfcIntoSubcomponents(POSITIVE_SFC);
    const again = splitLiteSfcIntoSubcomponents(r.files['package/index.vue']);
    expect(again.changed).toBe(false);
    expect(again.reason).toBe('already-split');
    expect(again.files['package/index.vue']).toBe(r.files['package/index.vue']);
  });

  it('v1 旧命名产物也被识别为 already-split（不重复拆、不报错）', () => {
    const v1 = POSITIVE_SFC.replace(
      '<script setup>',
      "<script setup>\nimport LiteSection1 from './components/LiteSection1.vue'",
    );
    const r = splitLiteSfcIntoSubcomponents(v1);
    expect(r.changed).toBe(false);
    expect(r.reason).toBe('already-split');
  });

  it('max 风格组件名（HeaderStats/MainContent）同样 already-split，scoped 放开也不二次拆', () => {
    const maxLike = SCOPED_SFC.replace(
      '<script setup>',
      "<script setup>\nimport HeaderStats from './components/HeaderStats.vue'\nimport MainContent from './components/MainContent.vue'",
    );
    const r = splitLiteSfcIntoSubcomponents(maxLike);
    expect(r.changed).toBe(false);
    expect(r.reason).toBe('already-split');
    expect(r.files['package/index.vue']).toBe(maxLike);
  });

  it('块内大写 Vue 组件标签：<MyChart /> 绝不外搬，纯静态兄弟块仍可拆', () => {
    const withComponent = POSITIVE_SFC.replace(
      '<div class="c-demo-stats">',
      '<div class="c-demo-stats">\n          <MyChart />',
    );
    const r = splitLiteSfcIntoSubcomponents(withComponent);
    for (const [rel, content] of Object.entries(r.files)) {
      if (rel === 'package/index.vue') continue;
      expect(content).not.toContain('<MyChart />');
    }
    if (r.changed) expect(reassembleLiteSfc(r)).toBe(withComponent);
    else expect(r.files['package/index.vue']).toBe(withComponent);
  });

  it('健康但不可拆产物：全量回放口径 —— 只含动态块（无静态子块）时不产生任何子组件', () => {
    const dynamicOnly = `<template>
  <base-panel panelKey="default-panel">
    <div class="c-demo-content">
      <div class="c-a">{{ a }}</div>
      <div class="c-b">{{ b }}</div>
    </div>
  </base-panel>
</template>

<script setup>
const a = 1
const b = 2
</script>

<style lang="less">
@import '../resources/styles/index.less';
.c-a { display: flex; }
</style>`;
    const r = splitLiteSfcIntoSubcomponents(dynamicOnly);
    expect(r.changed).toBe(false);
    expect(r.reason).toBe('insufficient-static-blocks');
    expect(r.files['package/index.vue']).toBe(dynamicOnly);
  });
});

describe('Phase 2 判据单一来源：命名 / 模块维度 / 样式切片', () => {
  it('公共前缀与语义名：对齐 max 的 HeaderSection / ContentSection 形态', () => {
    expect(commonClassPrefix(['c-equipment-monitoring-header', 'c-equipment-monitoring-stat-body'])).toBe('c-equipment-monitoring-');
    expect(commonClassPrefix(['equipment-monitor-header', 'equipment-monitor-overview'])).toBe('equipment-monitor-');
    const used = new Set<string>();
    expect(semanticComponentName('c-equipment-monitoring-header', 'c-equipment-monitoring-', used, 1)).toBe('HeaderSection');
    expect(semanticComponentName('c-equipment-monitoring-stat-body', 'c-equipment-monitoring-', used, 2)).toBe('StatBodySection');
    expect(semanticComponentName('c-equipment-monitoring-stat-body', 'c-equipment-monitoring-', used, 3)).toBe('StatBodySection2');
    expect(semanticComponentName('', '', new Set(), 4)).toBe('Section4');
  });

  it('模块门槛：165B 徽标（2 元素）、3 元素 svg 图标被挡；≥4 元素完整模块放行', () => {
    const badge = `<div class="c-equipment-monitoring-tab-badge-wrap">
            <span class="c-equipment-monitoring-tab-badge">3/3740</span>
          </div>`;
    const icon = `<div class="equipment-monitor-card-icon">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /></svg>
          </div>`;
    const module = `<div class="c-demo-legend">
          <span class="c-demo-legend-item">运行中</span>
          <span class="c-demo-legend-item">离线</span>
          <span class="c-demo-legend-item">告警</span>
          <span class="c-demo-legend-item">停用</span>
        </div>`;
    expect(isLiteSplitModuleBlock(badge)).toBe(false);
    expect(isLiteSplitModuleBlock(icon)).toBe(false);
    expect(isLiteSplitModuleBlock(module)).toBe(true);
    expect(rootClassToken(module)).toBe('c-demo-legend');
  });

  it('样式切片：顶层规则 / 注释与引号感知 / 组合选择器 class 提取', () => {
    const css = `/* 注释里有 { 不能算嵌套 */
.a { content: "{"; }
.b .c { color: red; }`;
    const parsed = parseTopLevelStyleRules(css);
    expect(parsed.complex).toBe(false);
    expect(parsed.rules).toHaveLength(2);
    expect(parsed.rules[0].classes).toEqual(['a']);
    expect(parsed.rules[1].classes).toEqual(['b', 'c']);
    const sel = selectScopedStyleForBlock(parsed, '<div class="a"><span class="c">x</span></div>');
    expect(sel.missing).toEqual([]);
    expect(sel.css).toContain('.a');
    expect(sel.css).toContain('.b .c');
    expect(collectClassTokens('<div class="a b"><i class="c"></i></div>')).toEqual(['a', 'b', 'c']);
  });

  it('嵌套 / @media 规则判 complex ⇒ 调用方整份复制，不做危险切分', () => {
    expect(parseTopLevelStyleRules('@media (max-width: 1px) { .a { color: red; } }').complex).toBe(true);
    expect(parseTopLevelStyleRules('.a { color: red;').complex).toBe(true);
  });
});

describe('isLiteSplitStaticBlock / isLiteSplitSafeScript（既有边界样本）', () => {
  it('阳性：纯静态多行块', () => {
    expect(isLiteSplitStaticBlock('<div class="a">\n  <span>文本</span>\n  <span>第二行文本补长度</span>\n</div>')).toBe(true);
  });

  it('阴性：插值 / 指令 / id / ref / 结构标签 / 组件标签 / 单行小片段', () => {
    const bad = [
      '<div class="a">\n  <span>{{ title }}</span>\n</div>',
      '<div class="a" v-for="x in list">\n  <span>文本</span>\n</div>',
      '<div class="a" :style="x">\n  <span>文本</span>\n</div>',
      '<div class="a" @click="go">\n  <span>文本</span>\n</div>',
      '<div class="a" id="x">\n  <span>文本</span>\n</div>',
      '<div class="a">\n  <template #x>文本</template>\n</div>',
      '<div class="a">\n  <MyChart />\n</div>',
      '<span>短</span>',
    ];
    for (const s of bad) expect(isLiteSplitStaticBlock(s)).toBe(false);
  });

  it('硬否决分两层：全块判候选、开标签判下钻（父容器不因子孙标记被整页否决）', () => {
    const parentOpen = '<div class="c-demo-content">';
    expect(hasHardUnsafeTag(parentOpen)).toBe(false);
    expect(hasHardUnsafeMarker('<div class="a" id="x">\n  <span>文本</span>\n</div>')).toBe(true);
    expect(hasHardUnsafeMarker('<div class="a">\n  <MyChart />\n</div>')).toBe(true);
    expect(hasHardUnsafeTag('<div class="a">\n  <MyChart />')).toBe(false);
  });

  it('脚本硬判据：普通 ref/computed 与可定位 DOM 查询放行，无法定位的暴露拒绝', () => {
    expect(isLiteSplitSafeScript('const x = ref([])\nconst y = computed(() => x.value)')).toBe(true);
    for (const s of [
      'document.querySelector(".a")',
      'getElementById("x")',
      'echarts.init(el)',
      'new ResizeObserver(() => {})',
    ]) {
      expect(isLiteSplitSafeScript(s)).toBe(true);
    }
    for (const s of ['$refs.chart', 'useTemplateRef("x")', 'defineExpose({ a })']) {
      expect(isLiteSplitSafeScript(s)).toBe(false);
    }
  });

  it('collectScriptDomSelectors：字面量 class/id 提取、变量/标签选择器判 opaque', () => {
    expect(collectScriptDomSelectors("document.querySelector('.c-demo-stats')")).toMatchObject({
      hardUnsafe: false,
      opaque: false,
      selectors: ['c-demo-stats'],
    });
    expect(collectScriptDomSelectors("getElementById('stats')").selectors).toEqual(['stats']);
    expect(collectScriptDomSelectors("getElementsByClassName('a b')").selectors).toEqual(['a', 'b']);
    expect(collectScriptDomSelectors('document.querySelector(sel)').opaque).toBe(true);
    expect(collectScriptDomSelectors('document.querySelector("div")').opaque).toBe(true);
    expect(collectScriptDomSelectors("document.getElementsByTagName('div')").opaque).toBe(true);
    expect(collectScriptDomSelectors('$refs.chart').hardUnsafe).toBe(true);
    expect(collectScriptDomSelectors('const x = ref([])')).toMatchObject({
      hardUnsafe: false,
      opaque: false,
      selectors: [],
    });
  });

  it('blockMatchesDomSelector：只按 class/id 属性的完整词命中（阴性不误杀）', () => {
    expect(blockMatchesDomSelector('<div class="c-demo-stats">\n  <span>x</span>\n</div>', ['c-demo-stats'])).toBe(true);
    expect(blockMatchesDomSelector('<div id="stats">\n  <span>x</span>\n</div>', ['stats'])).toBe(true);
    expect(blockMatchesDomSelector('<div class="c-demo-table">\n  <span>x</span>\n</div>', ['c-demo-stats'])).toBe(false);
  });
});

describe('applyLiteSubcomponentSplit（唯一写入点 + I/O 幂等）', () => {
  let root: string;
  let packageDir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'lite-split-'));
    packageDir = join(root, 'package');
    mkdirSync(packageDir, { recursive: true });
    mkdirSync(join(root, 'resources', 'styles'), { recursive: true });
    writeFileSync(join(root, 'resources', 'styles', 'theme-vars.less'), '.common() {}\n.theme-light() {}\n.theme-dark() {}\n');
    writeFileSync(join(root, 'resources', 'styles', 'index.less'), "@import './theme-vars.less';\n\n.common();\n\n@import (multiple) './common.less';\n");
    writeFileSync(join(root, 'resources', 'styles', 'common.less'), '.c-demo-stats { display: flex; }\n');
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('① 写盘后形成语义名组件目录，index.less 仍可真编译', async () => {
    writeFileSync(join(packageDir, 'index.vue'), POSITIVE_SFC, 'utf-8');
    const r = applyLiteSubcomponentSplit(packageDir);
    expect(r.changed).toBe(true);

    const names = readdirSync(join(packageDir, 'components')).sort();
    expect(names).toEqual(['LegendSection.vue', 'StatsSection.vue']);
    expect(readFileSync(join(packageDir, 'index.vue'), 'utf-8')).toContain("from './components/StatsSection.vue'");

    const css = await (compileIndexCssStrict as any)(root);
    expect(css.ok).toBe(true);
  });

  it('② 幂等：第二次不重复拆、不删自己的子组件；v1 孤儿被清理', () => {
    writeFileSync(join(packageDir, 'index.vue'), POSITIVE_SFC, 'utf-8');
    expect(applyLiteSubcomponentSplit(packageDir).changed).toBe(true);
    writeFileSync(join(packageDir, 'components', 'LiteSection9.vue'), '<template><div /></template>');

    const again = applyLiteSubcomponentSplit(packageDir);
    expect(again.changed).toBe(false);
    expect(again.reason).toBe('already-split');
    // 🔴 旧实现 changed=false 时 keep=[] 会把自己的子组件全删掉 ⇒ 父 import 悬空
    expect(existsSync(join(packageDir, 'components', 'StatsSection.vue'))).toBe(true);
    expect(existsSync(join(packageDir, 'components', 'LegendSection.vue'))).toBe(true);
    expect(existsSync(join(packageDir, 'components', 'LiteSection9.vue'))).toBe(false);
  });

  it('③ 阴性产物零副作用：不写 index.vue、不建 components/ 目录', () => {
    writeFileSync(join(packageDir, 'index.vue'), SINGLE_SFC, 'utf-8');
    const r = applyLiteSubcomponentSplit(packageDir);
    expect(r.changed).toBe(false);
    expect(r.reason).toBe('single-section');
    expect(readFileSync(join(packageDir, 'index.vue'), 'utf-8')).toBe(SINGLE_SFC);
    expect(existsSync(join(packageDir, 'components'))).toBe(false);
  });

  it('④ scoped 产物写盘：子组件自带 <style scoped>，父样式规则原样保留', () => {
    writeFileSync(join(packageDir, 'index.vue'), SCOPED_SFC, 'utf-8');
    const r = applyLiteSubcomponentSplit(packageDir);
    expect(r.changed).toBe(true);
    const sub = readFileSync(join(packageDir, 'components', 'LegendSection.vue'), 'utf-8');
    expect(sub).toContain('<style scoped>');
    expect(sub).toContain('.c-demo-legend');
    expect((__testing as any).validateSplitFile(sub, 'package/components/LegendSection.vue')).toEqual([]);
    const parent = readFileSync(join(packageDir, 'index.vue'), 'utf-8');
    expect(parent).toContain('.c-demo-stats { display: flex; }');
  });

  it('⑤ max 风格子组件（父未 import 本工具命名）绝不误删', () => {
    mkdirSync(join(packageDir, 'components'), { recursive: true });
    writeFileSync(join(packageDir, 'components', 'HeaderSection.vue'), '<template><div /></template>');
    writeFileSync(join(packageDir, 'index.vue'), SINGLE_SFC, 'utf-8');
    applyLiteSubcomponentSplit(packageDir);
    expect(existsSync(join(packageDir, 'components', 'HeaderSection.vue'))).toBe(true);
  });
});
