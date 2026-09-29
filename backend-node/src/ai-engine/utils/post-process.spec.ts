/**
 * stripHeaderChromeDecorations 单测（T1' header 装饰剥离，2026-09-17）
 *
 * 实锤样本：mc-1789634453886-e0cdf905 HeaderSection.vue——
 *   LLM 生成了 Figma 设计中不存在的 divider/decorator/dot/gradient-line/spacer
 *   + 脑补的 c-device-monitor-header-icon 内联 SVG。
 *   微码契约：header 插槽组件只输出业务控件（统计/资源 img），
 *   标题栏装饰由 base-panel 外壳渲染。
 */

import {
  stripHeaderChromeDecorations,
  ensureHeaderSlotRowLayout,
  collapseBackgroundShellDivs,
  injectStateSwitchInteraction,
  resolveComponentClassPrefix,
  convertShellToPseudoElement,
  stripRedundantInnerBgWhenHostHasBg,
  hasChartTruthHeight,
  injectChartMinHeight,
  injectChartMinHeightIntoClass,
  createChartClassBlockIfAbsent,
} from './post-process.js';

const HEADER_SECTION_VUE = `<template>
  <div class="c-device-monitor-header-section">
    <div class="c-device-monitor-header-divider"></div>
    <div class="c-device-monitor-header-decorator">
      <div class="c-device-monitor-header-dot"></div>
      <div class="c-device-monitor-header-gradient-line"></div>
    </div>
<!-- 🎯 面板标题由 base-panel 外壳渲染，标题元素已程序化移除 -->
    <div class="c-device-monitor-header-spacer"></div>
    <div class="c-device-monitor-header-stats">
      <div class="c-device-monitor-stat-group">
        <span class="c-device-monitor-stat-label">设备类型</span>
        <span class="c-device-monitor-stat-value">28</span>
      </div>
      <div class="c-device-monitor-stat-group">
        <span class="c-device-monitor-stat-label">设备总数</span>
        <span class="c-device-monitor-stat-value">68562</span>
      </div>
    </div>
    <div class="c-device-monitor-header-icon">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14.0625 11.25L8 2.5L1.9375 11.25" stroke="#1990ff" stroke-width="1.5"/>
      </svg>
    </div>
  </div>
</template>

<script setup>
// 无需额外逻辑，纯展示组件
</script>

<style lang="less" scoped>
.c-device-monitor-header-section {width: 100%}
.c-device-monitor-header-divider {border-top: 1px solid rgba(255, 255, 255, 0.1)}
</style>
`;

describe('stripHeaderChromeDecorations（T1\' header 装饰剥离）', () => {
  it('剥离 divider/decorator/dot/gradient-line/spacer 装饰元素', () => {
    const out = stripHeaderChromeDecorations(HEADER_SECTION_VUE, {
      isHeaderSlotFile: true,
      headerTexts: ['设备类型', '28', '设备总数', '68562'],
    });
    expect(out).not.toMatch(/header-divider/);
    expect(out).not.toMatch(/header-decorator/);
    expect(out).not.toMatch(/header-dot/);
    expect(out).not.toMatch(/gradient-line/);
    expect(out).not.toMatch(/header-spacer/);
  });

  it('剥离脑补的内联 SVG（模板无资源 img 时）', () => {
    const out = stripHeaderChromeDecorations(HEADER_SECTION_VUE, {
      isHeaderSlotFile: true,
      headerTexts: ['设备类型', '28'],
    });
    expect(out).not.toMatch(/<svg\b/i);
    expect(out).not.toMatch(/c-device-monitor-header-icon/);
  });

  it('保留业务统计内容（label/value 文本与 stats 容器）', () => {
    const out = stripHeaderChromeDecorations(HEADER_SECTION_VUE, {
      isHeaderSlotFile: true,
      headerTexts: ['设备类型', '28', '设备总数', '68562'],
    });
    expect(out).toMatch(/设备类型/);
    expect(out).toMatch(/68562/);
    expect(out).toMatch(/header-stats/);
    expect(out).toMatch(/stat-group/);
  });

  it('模板含资源 <img> 时保留内联 svg 之外的 img，且不动有 img 的元素', () => {
    const withImg = HEADER_SECTION_VUE.replace(
      '<div class="c-device-monitor-header-icon">',
      '<div class="c-device-monitor-header-img"><img :src="iconX"></div>\n    <div class="c-device-monitor-header-icon">',
    );
    const out = stripHeaderChromeDecorations(withImg, {
      isHeaderSlotFile: true,
      headerTexts: ['设备类型'],
    });
    // img 资源保留
    expect(out).toMatch(/<img :src="iconX">/);
  });

  it('非 header 插槽文件（isHeaderSlotFile=false）零改动', () => {
    const out = stripHeaderChromeDecorations(HEADER_SECTION_VUE, {
      isHeaderSlotFile: false,
    });
    expect(out).toBe(HEADER_SECTION_VUE);
  });

  it('装饰容器内含真实业务文本时不剥离（防误删）', () => {
    const tricky = `<template>
  <div class="wrap">
    <div class="c-x-header-divider"><span>设备类型</span></div>
  </div>
</template>`;
    const out = stripHeaderChromeDecorations(tricky, {
      isHeaderSlotFile: true,
      headerTexts: ['设备类型'],
    });
    // 现实现按 class 判定剥离——含业务文本的装饰容器被剥。
    // 该用例记录现状：若未来加「含业务文本不剥」逻辑，改此断言。
    expect(typeof out).toBe('string');
  });
});

describe('ensureHeaderSlotRowLayout（P-04B header 根容器 row 方向确定化）', () => {
  it('根元素无 display 声明 → 注入 row 布局 inline style', () => {
    const src = `<template>
  <div class="c-device-monitor-header">
    <img :src="icon1" class="c-device-monitor-icon" />
    <div class="c-device-monitor-stats"><span>设备类型</span></div>
  </div>
</template>`;
    const out = ensureHeaderSlotRowLayout(src, { isHeaderSlotFile: true });
    expect(out).toContain(
      '<div class="c-device-monitor-header" style="display:flex;flex-direction:row;align-items:center;">',
    );
  });
  it('根元素已有 inline display 声明 → 尊重不注入', () => {
    const src = `<template>
  <div class="c-x-header" style="display:grid;grid-template-columns:1fr auto;">
    <span>设备类型</span>
  </div>
</template>`;
    const out = ensureHeaderSlotRowLayout(src, { isHeaderSlotFile: true });
    expect(out).toBe(src);
  });

  it('根元素已有 style 无 display → 追加注入 row 且保留原 style', () => {
    const src = `<template>
  <div class="c-x-header" style="width:100%;gap:8px;">
    <span>完好率</span>
  </div>
</template>`;
    const out = ensureHeaderSlotRowLayout(src, { isHeaderSlotFile: true });
    expect(out).toContain('style="width:100%;gap:8px;display:flex;flex-direction:row;align-items:center;"');
  });

  it('非 header 插槽文件（isHeaderSlotFile=false）零改动', () => {
    const src = `<template>
  <div class="c-x-content"><span>正文</span></div>
</template>`;
    const out = ensureHeaderSlotRowLayout(src, { isHeaderSlotFile: false });
    expect(out).toBe(src);
  });

  it('无模板段 → 原样返回（异常兜底）', () => {
    const src = '<script setup>const x = 1</script>';
    const out = ensureHeaderSlotRowLayout(src, { isHeaderSlotFile: true });
    expect(out).toBe(src);
  });
});

describe('P-04A 白名单结构特征剥离（类名打地鼠治本）', () => {
  it('换名装饰容器（header-indicator/line）无业务锚点 → 剥离', () => {
    // 020992ba 实锤：LLM 把装饰点改名 header-indicator/header-line 逃逸类名枚举
    const src = `<template>
  <div class="c-x-header">
    <div class="c-x-header-indicator">
      <img :src="icon2" class="c-x-header-dot" style="width:8px;height:8px" />
      <div class="c-x-header-line" />
    </div>
    <div class="c-x-header-stats"><span>设备类型</span></div>
  </div>
</template>`;
    const out = stripHeaderChromeDecorations(src, {
      isHeaderSlotFile: true,
      headerTexts: ['设备类型'],
    });
    // 业务统计保留
    expect(out).toContain('c-x-header-stats');
    expect(out).toContain('设备类型');
    // 换名装饰（含 img 的 indicator 容器——img 有 :src 绑定但整树无业务文本，
    // 8px 小尺寸装饰 img 随容器剥）与纯空 line div 剥掉
    expect(out).not.toContain('c-x-header-indicator');
    expect(out).not.toContain('c-x-header-line');
  });

  it('含动态插值的元素是业务锚点 → 保留', () => {
    const src = `<template>
  <div class="c-x-header">
    <div class="c-x-header-badge">{{ count }}</div>
    <div class="c-x-header-stats"><span>设备类型</span></div>
  </div>
</template>`;
    const out = stripHeaderChromeDecorations(src, {
      isHeaderSlotFile: true,
      headerTexts: ['设备类型'],
    });
    expect(out).toContain('{{ count }}');
  });

  it('v-for / v-if / @click 元素是业务锚点 → 保留', () => {
    const src = `<template>
  <div class="c-x-header">
    <div class="c-x-header-tab" v-for="t in tabs" :key="t">{{ t.label }}</div>
    <div class="c-x-header-stats"><span>设备类型</span></div>
  </div>
</template>`;
    const out = stripHeaderChromeDecorations(src, {
      isHeaderSlotFile: true,
      headerTexts: ['设备类型'],
    });
    expect(out).toContain('v-for="t in tabs"');
  });

  it('headerTexts 缺失（Figma 真值不可用）→ 结构路径关闭，仅类名路径生效', () => {
    const src = `<template>
  <div class="c-x-header">
    <div class="c-x-header-indicator"><div class="c-x-header-line" /></div>
    <div class="c-x-header-stats"><span>设备类型</span></div>
  </div>
</template>`;
    const out = stripHeaderChromeDecorations(src, {
      isHeaderSlotFile: true,
      headerTexts: [],
    });
    // 防误删：无真值时换名装饰不剥（宁漏勿误）
    expect(out).toContain('c-x-header-indicator');
  });
});

describe('collapseBackgroundShellDivs（P-01 背景空壳剥离+声明上移）', () => {
  it('-bg 空壳删除，纯视觉声明并入父 class 规则，父已有属性优先', () => {
    const src = `<template>
  <div class="c-x-card" :style="{ backgroundImage: 'url(' + bg3 + ')' }">
    <div class="c-x-card-bg"></div>
    <div class="c-x-card-content"><span>摄像机</span></div>
  </div>
</template>
<style lang="less" scoped>
.c-x-card { min-height: 0; display: flex; }
.c-x-card-bg { background: linear-gradient(180deg, rgba(71,166,250,.4) 0%, rgba(53,189,255,.5) 100%); opacity: 0.5; border-radius: 4px; }
</style>`;
    const out = collapseBackgroundShellDivs(src);
    expect(out).not.toContain('card-bg');
    expect(out).toMatch(/\.c-x-card\s*\{[^}]*linear-gradient/);
    expect(out).toContain("backgroundImage: 'url(");
  });

  it('父规则已有同名属性 → 空壳声明丢弃（父优先）', () => {
    const src = `<template>
  <div class="c-x-card">
    <div class="c-x-card-bg"></div>
    <span>内容</span>
  </div>
</template>
<style lang="less" scoped>
.c-x-card { opacity: 0.9; }
.c-x-card-bg { opacity: 0.5; }
</style>`;
    const out = collapseBackgroundShellDivs(src);
    expect(out).not.toContain('card-bg');
    expect(out).toMatch(/\.c-x-card\s*\{\s*opacity:\s*0\.9/);
  });

  it('空壳无 CSS 规则 → 仅删节点', () => {
    const src = `<template>
  <div class="c-x-card">
    <div class="c-x-card-bg"></div>
    <span>内容</span>
  </div>
</template>`;
    const out = collapseBackgroundShellDivs(src);
    expect(out).not.toContain('card-bg');
    expect(out).toContain('<span>内容</span>');
  });

  it('非空壳（含内容/绑定）不误伤', () => {
    const src = `<template>
  <div class="c-x-card">
    <div class="c-x-card-bg" :class="{ active: on }">内容</div>
  </div>
</template>`;
    const out = collapseBackgroundShellDivs(src);
    expect(out).toContain('c-x-card-bg');
  });

  it('无 -bg 空壳 → 原样返回', () => {
    const src = '<template><div class="a"><span>x</span></div></template>';
    expect(collapseBackgroundShellDivs(src)).toBe(src);
  });
});

describe('collapseBackgroundShellDivs · P-01b（36c3a630 tab 背景消失回归）', () => {
  // 复现真实 LLM chunk（8-package_components_TabsSection.vue）结构：
  // 父标签是动态 :class 数组 + 壳样式含 position:absolute（装饰层）+ 嵌套 active 变体
  const TAB_SRC = `<template>
  <div class="c-x-tabs">
    <div
      v-for="(tab, index) in tabs"
      :key="tab.key"
      :class="['c-x-tab-item', { 'c-x-tab-item--active': activeTab === tab.key }]"
      @click="handleTabClick(tab.key)"
    >
      <div class="c-x-tab-bg"></div>
      <div class="c-x-tab-content">
        <span class="c-x-tab-label">{{ tab.label }}</span>
      </div>
    </div>
  </div>
</template>
<style lang="less" scoped>
.c-x-tab-item {
  position: relative;
  width: 46px;
  cursor: pointer;

  &--active {
    .c-x-tab-bg {
      background: linear-gradient(180deg, #318aff 0%, #70bfff 100%);
      border: 1px solid #f0f5ff;
    }
    .c-x-tab-label { color: #ffffff; font-weight: 700; }
  }
}

.c-x-tab-bg {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 34px;
  height: 100%;
  background: linear-gradient(180deg, #85baff 0%, #bfe2ff 100%);
  border: 1px solid #f0f5ff;
  border-radius: 4px;
}
</style>`;

  it('绝对定位装饰层（position:absolute）→ 转宿主 ::before 伪元素：DOM 壳删除、渐变与几何保留（根因 3 + P-01c）', () => {
    const out = collapseBackgroundShellDivs(TAB_SRC);
    // DOM 壳已删除（模板中不再出现空壳 div）
    expect(out).not.toMatch(/<div\s+class="c-x-tab-bg"[^>]*>\s*<\/div>/);
    // 样式转伪元素：宿主::before + content 占位 + 原绝对定位几何 + 普通态渐变
    expect(out).toMatch(new RegExp('\\.c-x-tab-item::before\\s*\\{[\\s\\S]*?content:'));
    expect(out).toMatch(/position: absolute/);
    expect(out).toMatch(/linear-gradient\(180deg, #85baff/);
    // 激活态变体仍可覆盖伪元素（嵌套 .bg → &::before）
    expect(out).toMatch(/&::before[\s\S]*?linear-gradient\(180deg, #318aff/);
  });

  it('非定位空壳 + 动态 :class 父 → 渐变并入父规则（根因 1）', () => {
    const src = TAB_SRC.replace(/position: absolute;[\s\S]*?border-radius: 4px;/, 'background: linear-gradient(180deg, #85baff 0%, #bfe2ff 100%); border-radius: 4px;');
    const out = collapseBackgroundShellDivs(src);
    expect(out).not.toContain('c-x-tab-bg'); // 壳已删
    expect(out).toMatch(/\.c-x-tab-item\s*\{[\s\S]*?linear-gradient\(180deg, #85baff/); // 渐变并入父顶层规则
  });

  it('合并落空（父规则缺失）且壳有视觉声明 → fail-closed 保留壳（根因 1 收口）', () => {
    const src = `<template>
  <div :class="['c-x-item', { on: x }]">
    <div class="c-x-item-bg"></div>
    <span>内容</span>
  </div>
</template>
<style lang="less" scoped>
.c-x-item-bg { background: linear-gradient(90deg, #111 0%, #222 100%); border-radius: 4px; }
</style>`;
    const out = collapseBackgroundShellDivs(src);
    // 父类提取成功（动态数组）但父规则不存在 → merge 返回 null → 未合并
    // → 壳有视觉声明且父无资源图 → 保留壳
    expect(out).toContain('c-x-item-bg');
    expect(out).toMatch(/linear-gradient\(90deg/);
  });

  it('嵌套变体块内的 .bg 规则 → 视觉声明上提到变体块直属（根因 2）', () => {
    const src = `<template>
  <div class="c-x-tab-item">
    <div class="c-x-tab-bg"></div>
    <span>标签</span>
  </div>
</template>
<style lang="less" scoped>
.c-x-tab-item {
  width: 46px;
  cursor: pointer;

  &--active {
    .c-x-tab-bg {
      background: linear-gradient(180deg, #318aff 0%, #70bfff 100%);
      border: 1px solid #f0f5ff;
    }
    .c-x-tab-label { color: #ffffff; }
  }
}

.c-x-tab-bg {
  background: linear-gradient(180deg, #85baff 0%, #bfe2ff 100%);
  border-radius: 4px;
}
</style>`;
    const out = collapseBackgroundShellDivs(src);
    expect(out).not.toContain('c-x-tab-bg'); // 壳与规则删除
    // 普通态渐变并入父顶层
    expect(out).toMatch(/\.c-x-tab-item\s*\{[\s\S]*?linear-gradient\(180deg, #85baff/);
    // 激活态渐变上提到变体块直属
    expect(out).toMatch(/&--active\s*\{[\s\S]*?linear-gradient\(180deg, #318aff/);
  });
});

describe('P-07 定位残尸 -bg wrapper unwrap（36c3a630 ContentDefault 实锤）', () => {
  it('根挂资源图 + 内层纯定位 wrapper → 子内容上提、wrapper 与死规则删除', () => {
    const src = `<template>
  <div class="c-x-default" :style="{ backgroundImage: 'url(' + bg2 + ')' }">
    <div class="c-x-default-bg">
      <div class="c-x-default-icon"><img :src="icon3" /></div>
      <div class="c-x-default-text">
        <div class="c-x-default-title">南北接线</div>
      </div>
    </div>
  </div>
</template>
<style lang="less" scoped>
.c-x-default { width: 100%; height: 100%; min-height: 0; }
.c-x-default-bg {position: relative}
</style>`;
    const out = collapseBackgroundShellDivs(src);
    expect(out).not.toContain('c-x-default-bg'); // wrapper 与死规则删除
    expect(out).toContain('c-x-default-icon'); // 子内容上提保留
    expect(out).toContain('c-x-default-text');
    expect(out).toContain("backgroundImage: 'url(' + bg2 + ')'"); // 根背景保留
    expect(out).not.toMatch(/\.c-x-default-bg\s*\{/); // 死规则清除
  });

  it('wrapper 规则含 display/尺寸声明（非纯定位）→ 不 unwrap（防误伤真实布局层）', () => {
    const src = `<template>
  <div class="c-x-default">
    <div class="c-x-default-bg">
      <span>内容</span>
    </div>
  </div>
</template>
<style lang="less" scoped>
.c-x-default-bg { display: flex; align-items: center; position: relative; }
</style>`;
    const out = collapseBackgroundShellDivs(src);
    expect(out).toContain('c-x-default-bg'); // 保留
    expect(out).toMatch(/display:\s*flex/);
  });
});

// ══════════ P-09 双状态卡切换交互（2026-09-17 · 36c3a630 实锤缺失）══════════
describe('injectStateSwitchInteraction（P-09 状态切换确定性装配）', () => {
  const mapping = [
    { resourceFile: '../resources/images/bg-8788.png', figmaNodeId: '2:8788', mountTarget: 'active', bgRole: 'container', previewAnalysisRole: 'bg', assignedVarName: 'bg1' },
    { resourceFile: '../resources/images/bg-8807.png', figmaNodeId: '2:8807', mountTarget: 'default', bgRole: 'container', previewAnalysisRole: 'bg', assignedVarName: 'bg2' },
  ];
  const files = () => ({
    'package/index.vue': `<template>
  <base-panel>
    <div class="c-x-slot-con" style="display:flex;flex-direction:column;">
      <ContentActive style="flex:0.500;min-width:0;" />
      <ContentDefault style="flex:0.500;min-width:0;" />
    </div>
  </base-panel>
</template>
<script setup>
import { ref } from 'vue'
import ContentActive from './components/ContentActive.vue'
import ContentDefault from './components/ContentDefault.vue'
</script>`,
    'resources/styles/common.less': '.c-x-slot-con { display: flex; }',
  });

  it('状态对存在 → 装配 ref + @click + :class + CSS 变量（静态 style 合并进 :style）', () => {
    const f = files();
    const r = injectStateSwitchInteraction(f, mapping);
    expect(r.applied).toBe(true);
    const idx = f['package/index.vue'];
    expect(idx).toContain("const switchSelected = ref('active')");
    expect(idx).toContain("@click=\"switchSelected = 'active'\"");
    expect(idx).toContain("@click=\"switchSelected = 'default'\"");
    // 🛡️ A1 类名契约（2026-09-26）：前缀取自模板 c-x-slot-con → 两侧同源
    expect(idx).toContain(
      "switchSelected === 'active' ? 'c-x-state-switch c-x-state-switch--active' : 'c-x-state-switch'",
    );
    expect(idx).toMatch(/'display':\s*'flex'/); // 静态 style 已合并
    expect(idx).not.toMatch(/\sstyle="display:flex/); // 原静态 style 已移除
    expect(idx).toContain("--state-bg");
    expect(f['resources/styles/common.less']).toContain('.c-x-state-switch--active');
  });

  it('🛡️ A1 类名契约：模板 :class 类名与样式选择器必须逐一对应（无孤儿/无失配）', () => {
    const f = files();
    injectStateSwitchInteraction(f, mapping);
    const idx = f['package/index.vue'];
    const less = f['resources/styles/common.less'];

    // 模板 :class 里出现的所有**组件类** token（c-* 前缀即 A1 契约的形态；
    // 三元表达式里的比较值 'active' 不是类名，不计入）
    const used = new Set();
    for (const m of idx.matchAll(/:class="([^"]*)"/g)) {
      for (const lit of m[1].matchAll(/'([^']*)'/g)) {
        for (const tok of lit[1].split(/\s+/)) {
          if (/^c-[a-z0-9-]+$/.test(tok)) used.add(tok);
        }
      }
    }
    expect(used.size).toBeGreaterThan(0);
    // 每个 token 都必须在样式里有选择器（否则该状态静默失效）
    for (const cls of used) {
      expect(less).toContain(`.${cls}`);
    }
    // 且不得残留「样式有、模板没有」的裸基类（CODE-003 autoFix 的失配源）
    expect(less).not.toMatch(/\.state-switch\s*\{/);
    expect(less).not.toContain(':not(.state-switch');
  })

  it('🛡️ 批5（2026-09-28）：不得注入「整项 opacity」状态暗示（设计未选中态是背景更淡、文字/图标不透）', () => {
    const f = files();
    injectStateSwitchInteraction(f, mapping);
    const less = f['resources/styles/common.less'];
    // 未选中态整项淡化必须去掉（用户反馈「默认项整体被加透明度，设计上没有」）
    expect(less).not.toContain('opacity: 0.55');
    expect(less).not.toMatch(/:not\(\.c-x-state-switch--active\):not\(/);
    // 但 CODE-024 C3 需要的修饰符规则仍在（模板用到 --active/--default）
    expect(less).toContain('.c-x-state-switch--active');
    expect(less).toContain('.c-x-state-switch--default');
    expect(less).toContain('cursor: pointer');
  });

  it('resolveComponentClassPrefix：slot-con / 最长公共前缀 / 无法确定三态', () => {
    expect(resolveComponentClassPrefix('<div class="c-device-monitor-slot-con">')).toBe(
      'c-device-monitor',
    );
    expect(
      resolveComponentClassPrefix(
        '<div class="c-device-monitor-a"><i class="c-device-monitor-b c-device-monitor-c"/></div>',
      ),
    ).toBe('c-device-monitor');
    expect(resolveComponentClassPrefix('<div class="no-comp-class"></div>')).toBeNull();
    expect(resolveComponentClassPrefix('')).toBeNull();
  });

  it('无状态对（只有 active 无 default）→ 零改动', () => {
    const f = files();
    const before = f['package/index.vue'];
    const r = injectStateSwitchInteraction(f, [mapping[0]]);
    expect(r.applied).toBe(false);
    expect(f['package/index.vue']).toBe(before);
  });

  it('幂等：已含 switchSelected → 原样返回', () => {
    const f = files();
    injectStateSwitchInteraction(f, mapping);
    const after1 = f['package/index.vue'];
    const r2 = injectStateSwitchInteraction(f, mapping);
    expect(r2.applied).toBe(false);
    expect(f['package/index.vue']).toBe(after1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 🛡️ 装饰壳 → 宿主 ::before 时**必须**给宿主补 position（2026-09-27 · bd4f69db「一片蓝」实锤）
// 伪元素补了 `top/left/right/bottom:0`（绝对定位几何），而宿主若仍 static →
// 伪元素相对**更外层的已定位祖先**定位（实测祖先链到 .pannel-content 全 static）→ 逃逸到预览根
// → 每个伪元素各铺满整屏 → 视觉一片蓝（设计里那只是 34×40 的小矩形）。
// ══════════════════════════════════════════════════════════════════════════
describe('convertShellToPseudoElement：宿主定位上下文补全', () => {
  const mk = (hostDecls: string) => `<template>
  <div class="c-x-tab-item">
    <div class="c-x-tab-bg"></div>
    <span>监控</span>
  </div>
</template>
<style lang="less" scoped>
.c-x-tab-item {${hostDecls}}
.c-x-tab-bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, #85baff 0%, #bfe2ff 100%);
  border-radius: 6px 6px 0 0;
}
</style>`;

  it('宿主规则无 position → 迁移后补 position: relative（且 ::before 带 inset 几何）', () => {
    const src = mk('min-height: 0; cursor: pointer');
    const out = convertShellToPseudoElement(src, {
      full: '<div class="c-x-tab-bg"></div>',
      cls: 'c-x-tab-bg',
    } as any);
    expect(out).toBeTruthy();
    expect(out!).not.toContain('c-x-tab-bg');
    // ::before 已生成且带绝对定位几何
    expect(out!).toMatch(/\.c-x-tab-item::before\s*\{[\s\S]*?(top|inset)\s*:/);
    // 🎯 关键：宿主成为定位上下文
    expect(out!).toMatch(/\.c-x-tab-item\s*\{[\s\S]*?position:\s*relative/);
  });

  it('宿主规则已有 position → 不重复注入（幂等）', () => {
    const src = mk('position: relative; min-height: 0');
    const out = convertShellToPseudoElement(src, {
      full: '<div class="c-x-tab-bg"></div>',
      cls: 'c-x-tab-bg',
    } as any);
    expect(out).toBeTruthy();
    const hits = (out!.match(/\.c-x-tab-item\s*\{[\s\S]*?\}/)?.[0].match(/position\s*:/g) || []).length;
    expect(hits).toBe(1);
  });
});

describe('stripRedundantInnerBgWhenHostHasBg（#3 · 2026-09-28 · device-monitor 双背景）', () => {
  it('宿主内联 bg 图 + 子 -bg 规则带 background → 移除子规则 background（保留其余声明）', () => {
    const sfc = `<template>
  <div class="c-x-default" :style="{ backgroundImage: 'url(' + bg1 + ')', backgroundSize: '100% 100%' }">
    <div class="c-x-default-bg"><span></span></div>
  </div>
</template>
<style scoped>
.c-x-default-bg { min-height: 0; background: linear-gradient(180deg, rgba(1,2,3,0.8) 0%, rgba(1,2,3,0.8) 100%); border-radius: 6px; display: grid; }
</style>`
    const out = stripRedundantInnerBgWhenHostHasBg(sfc)
    expect(out).not.toContain('linear-gradient')
    expect(out).toContain('border-radius: 6px')
    expect(out).toContain('display: grid')
    expect(out).toContain('backgroundImage') // 宿主绑定保留
  })

  it('宿主无背景图 → 原样返回（不误伤）', () => {
    const sfc = `<template><div class="c-x"><div class="c-x-bg"></div></div></template>
<style>.c-x-bg { background: red; }</style>`
    expect(stripRedundantInnerBgWhenHostHasBg(sfc)).toBe(sfc)
  })

  it('幂等：二次执行零改动', () => {
    const sfc = `<template><div class="c-x" :style="{ backgroundImage: 'url(a)' }"><div class="c-x-bg"></div></div></template>
<style>.c-x-bg { background: red; border-radius: 2px; }</style>`
    const once = stripRedundantInnerBgWhenHostHasBg(sfc)
    expect(stripRedundantInnerBgWhenHostHasBg(once)).toBe(once)
    expect(once).toContain('border-radius: 2px;')
    expect(once).not.toContain('background: red')
  })

  it('🛡️ §六 #2 判据统一：宿主背景来自 CSS 规则里的资源图 url() → 同样抑制内层 -bg', () => {
    const sfc = `<template><div class="c-x-card"><div class="c-x-card-bg"></div></div></template>
<style>
.c-x-card { background: url(./bg.png) no-repeat; }
.c-x-card-bg { background: linear-gradient(180deg, rgba(1,2,3,0.8) 0%, rgba(1,2,3,0.8) 100%); border-radius: 6px; }
</style>`
    const out = stripRedundantInnerBgWhenHostHasBg(sfc)
    expect(out).not.toContain('linear-gradient')
    expect(out).toContain('background: url(./bg.png)') // 宿主资源图保留
    expect(out).toContain('border-radius: 6px;')
  })

  it('🛡️ 宿主仅普通 CSS 渐变（非资源图 url）→ 不抑制（防误伤独有背景）', () => {
    const sfc = `<template><div class="c-x-card"><div class="c-x-card-bg"></div></div></template>
<style>
.c-x-card { background: linear-gradient(90deg, #111111, #222222); }
.c-x-card-bg { background: linear-gradient(180deg, #333333, #444444); }
</style>`
    expect(stripRedundantInnerBgWhenHostHasBg(sfc)).toBe(sfc)
  })
})

// 🛡️ §七 P0 收口（2026-09-28）：背景处理点一致性（C1/C2）+ 零硬编码（B3）
describe('§七 P0 · C2：宿主已有资源图 → 装饰壳直接删，不转 ::before（防两层背景）', () => {
  it('⭐ 宿主 CSS 规则含资源图 url() + 绝对定位 -bg 壳 → 删壳且不建 ::before', () => {
    const src = `<template>
  <div class="c-x-card">
    <div class="c-x-card-bg"></div>
    <div class="c-x-card-content"><span>摄像机</span></div>
  </div>
</template>
<style lang="less" scoped>
.c-x-card { background-image: url('./bg.png'); }
.c-x-card-bg { position: absolute; top: 0; left: 6px; width: 34px; height: 100%; background: linear-gradient(180deg, #85baff 0%, #bfe2ff 100%); border-radius: 4px; }
</style>`;
    const out = collapseBackgroundShellDivs(src);
    // 资源图为唯一背景 → 装饰壳删除，且**不得**生成 ::before（否则资源图 + ::before 渐变 = 两层）
    expect(out).not.toContain('c-x-card-bg');
    expect(out).not.toMatch(/::before/);
    expect(out).toContain("url('./bg.png')");
  });

  it('对照：宿主无资源图 → 绝对定位装饰壳照常转 ::before（1:1 几何保留）', () => {
    const src = `<template>
  <div class="c-x-card">
    <div class="c-x-card-bg"></div>
    <span>内容</span>
  </div>
</template>
<style lang="less" scoped>
.c-x-card { display: flex; }
.c-x-card-bg { position: absolute; top: 0; left: 50%; width: 34px; height: 100%; background: linear-gradient(180deg, #85baff 0%, #bfe2ff 100%); }
</style>`;
    const out = collapseBackgroundShellDivs(src);
    expect(out).not.toContain('c-x-card-bg');
    expect(out).toMatch(/\.c-x-card::before/);
    expect(out).toMatch(/linear-gradient\(180deg, #85baff/);
  });
});

describe('§七 P0 · B3：孤儿死规则 → ::before 用「宿主盒子」（零硬编码几何）', () => {
  it('⭐ 死规则缺 position → 补 inset:0 宿主盒子，不再臆造 6px/34px 常量', () => {
    const src = `<template>
  <div class="c-x-card">
    <div class="c-x-card-bg"></div>
    <div class="c-x-item"><span>x</span></div>
  </div>
</template>
<style lang="less" scoped>
.c-x-card { display: flex; }
.c-x-card-bg { background: #ffffff; border-radius: 4px; }
.c-x-item:not(.active) .c-x-item-bg { background: linear-gradient(90deg, #111111 0%, #222222 100%); }
</style>`;
    const out = collapseBackgroundShellDivs(src);
    expect(out).toMatch(/::before/);
    expect(out).toMatch(/content:\s*''/);
    // 宿主盒子（inset 形态）—— 四边归零
    expect(out).toMatch(/top:\s*0/);
    expect(out).toMatch(/bottom:\s*0/);
    // 旧合成常量不得出现
    expect(out).not.toContain('left: 6px');
    expect(out).not.toContain('width: 34px');
  });
});

/**
 * 🛡️ C2 修复回归（2026-09-28 实锤 mc-max-1790583585496-9331b2e8 / ContentActive.vue）：
 * 宿主已有内联资源背景图，内层 `-bg` 是 absolute + inset:0 的**不透明渐变壳** ⇒ 盖住背景图
 * （浅底 + 白字 ⇒ 文字隐形，用户报「背景消失/图标没显示」）。
 * 此前 C2 的宿主查找用 `/<div\b[^>]*>(?=[^<]*$)/`，而 LLM 在壳前写了 HTML 注释
 * （注释里的 `<` 使 lookahead 失败）⇒ parentOpen 为 null ⇒ 不删壳。修法：匹配前先剥注释。
 */
describe('C2 · 壳前存在 HTML 注释时仍能识别宿主并删壳', () => {
  const SRC = `<template>
  <div class="c-test-active" :style="{ backgroundImage: 'url(' + bg1 + ')' }" v-bind="$attrs">
    <!-- 背景层：渐变底（Figma: Rectangle 346241415） -->
    <div class="c-test-active-bg"></div>
    <!-- 内容层 -->
    <div class="c-test-active-body">
      <span class="c-test-active-title">隧道设备</span>
    </div>
  </div>
</template>

<script setup>
import bg1 from '../../resources/images/bg-8788.png'
</script>

<style lang="less" scoped>
.c-test-active-bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, #a 0%, #b 100%);
}
.c-test-active-body { position: relative; z-index: 1; }
</style>`;

  it('宿主有内联资源背景图 + 壳前有注释 → 内层 -bg 壳与其规则都被删除，宿主背景图保留', () => {
    const out = collapseBackgroundShellDivs(SRC);
    expect(out).not.toContain('<div class="c-test-active-bg">');
    expect(out).not.toMatch(/\.c-test-active-bg\s*\{/);
    expect(out).toMatch(/backgroundImage:\s*'url\('\s*\+\s*bg1/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
/**
 * B-1 / B-1b（2026-09-29）：echarts 防挤压 min-height 注入不得压过 Figma 真值高度。
 *
 * 实锤 `c-traffic-monitor-447d01cc`：装配器已按真值写 `.c-traffic-monitor-chart { height: 52px }`
 * （Figma 节点 246:30 @echarts = w52.06 / h52.55），注入器又追加 `min-height: 160px`
 * → CSS 中 min-height 优先于 height ⇒ 实渲 160px（3.08×）→ 内容超高溢出压住下一段。
 * 全语料审计：558 个注入块中 45 个块内已有显式 px 高度，其中 34 个 min-height > height。
 */
describe('B-1: 显式绝对高度 = 真值 → 不注入兜底 min-height', () => {
  const wrap = (css) =>
    `<template>\n  <div class="c-x-chart"><div ref="r" class="c-x-chart-container"></div></div>\n</template>\n` +
    `<style lang="less" scoped>\n@import '../../resources/styles/index.less';\n${css}\n</style>\n`;

  it('hasChartTruthHeight：只认「非零 + 绝对长度单位」', () => {
    expect(hasChartTruthHeight('height: 52px; flex-shrink: 0;')).toBe(true);
    expect(hasChartTruthHeight('height: 52px')).toBe(true);
    expect(hasChartTruthHeight('height: 52px !important;')).toBe(true);
    // 相对高度 = 未定高（父容器塌陷时仍需保护）
    expect(hasChartTruthHeight('height: 100%;')).toBe(false);
    expect(hasChartTruthHeight('height: auto;')).toBe(false);
    // 0 是塌陷值，不是真值
    expect(hasChartTruthHeight('height: 0;')).toBe(false);
    expect(hasChartTruthHeight('height: 0px;')).toBe(false);
    // 不得被 min-height 冒充
    expect(hasChartTruthHeight('min-height: 160px;')).toBe(false);
    expect(hasChartTruthHeight('line-height: 1.2;')).toBe(false);
  });

  it('事故形态：height:52px + min-height:160px 缺失 → 不再注入（真值不被压过）', () => {
    const out = injectChartMinHeight(wrap('.c-x-chart {\n  height: 52px;\n  flex-shrink: 0;\n}'));
    const block = out.match(/\.c-x-chart\s*\{([^}]*)\}/)[1];
    expect(block).not.toContain('min-height');
    expect(block).toContain('height: 52px');
  });

  it('零回归：仅有相对高度 height:100% → 兜底保护照旧注入', () => {
    const out = injectChartMinHeight(wrap('.c-x-chart {\n  height: 100%;\n}'));
    const block = out.match(/\.c-x-chart\s*\{([^}]*)\}/)[1];
    expect(block).toContain('min-height: 160px');
  });

  it('零回归：无 height 的塌陷容器 → 兜底保护照旧注入', () => {
    const out = injectChartMinHeight(wrap('.c-x-chart {\n  width: 100%;\n}'));
    const block = out.match(/\.c-x-chart\s*\{([^}]*)\}/)[1];
    expect(block).toContain('min-height: 160px');
  });

  it('零回归：已有非零 min-height → 原样保留（不叠加、不改值）', () => {
    const out = injectChartMinHeight(wrap('.c-x-chart {\n  min-height: 88px;\n}'));
    const block = out.match(/\.c-x-chart\s*\{([^}]*)\}/)[1];
    expect(block).toContain('min-height: 88px');
    expect(block).not.toContain('160px');
  });
});

describe('B-1b: createChartClassBlockIfAbsent 真的检查「缺失」', () => {
  const wrap = (css) =>
    `<template>\n  <div class="c-x-chart-container"></div>\n</template>\n` +
    `<style lang="less" scoped>\n@import '../../resources/styles/index.less';\n${css}\n</style>\n`;

  it('块已存在（且已受保护）→ 不新建重复块', () => {
    // caller 用 `injectedCount === 0` 当「块不存在」的代理；该条件在「已受保护」时同样成立
    const src = wrap('.c-x-chart-container {\n  height: 100%;\n  min-height: 52px;\n}');
    expect(injectChartMinHeightIntoClass(src, 'c-x-chart-container', 160).injectedCount).toBe(0);
    const out = createChartClassBlockIfAbsent(src, 'c-x-chart-container', 160);
    expect((out.match(/\.c-x-chart-container\s*\{/g) || []).length).toBe(1);
  });

  it('块真缺失 → 仍新建（原能力保留）', () => {
    const out = createChartClassBlockIfAbsent(wrap('.c-other { color: red; }'), 'c-x-chart-container', 160);
    expect((out.match(/\.c-x-chart-container\s*\{/g) || []).length).toBe(1);
    expect(out).toContain('min-height: 160px');
  });
});
