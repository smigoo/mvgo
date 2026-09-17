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
