import {
  autoFixVerticalLayout,
  extractLeafBlocks,
  fixVerticalBody,
  isButtonNavSelector,
  VERTICAL_RULES,
} from './vertical-layout-guard.js';

/**
 * VERT-001/002/003 竖排反截断护栏回归（2026-09-04，mc-max-1788499007313-6ac539e0 实锤：
 * 竖排侧栏按钮只显示单字 / 断列 / 长标签被固定小高度裁切）
 */

describe('isButtonNavSelector —— 按钮/导航语义判定', () => {
  it('导航/按钮语义 selector 命中', () => {
    expect(isButtonNavSelector('.c-monitor-sidebar-tab')).toBe(true);
    expect(isButtonNavSelector('.c-monitor-sidebar-tab-text')).toBe(true);
    expect(isButtonNavSelector('.c-nav-item')).toBe(true);
    expect(isButtonNavSelector('.c-menu-item')).toBe(true);
    expect(isButtonNavSelector('.c-btn')).toBe(true);
    expect(isButtonNavSelector('.c-toolbar')).toBe(true);
  });

  it('普通文本/容器 selector 不命中（不误伤省略号设计）', () => {
    expect(isButtonNavSelector('.c-monitor-value-text')).toBe(false);
    expect(isButtonNavSelector('.c-monitor-title')).toBe(false);
    expect(isButtonNavSelector('.c-monitor-desc')).toBe(false);
    expect(isButtonNavSelector('.c-monitor-card')).toBe(false);
    expect(isButtonNavSelector('@media (max-width: 600px)')).toBe(false);
  });
});

describe('VERT-001 —— writing-mode 竖排缺 nowrap 补全', () => {
  it('竖排元素无 nowrap → 补 white-space: nowrap', () => {
    const css = `
.c-nav-vertical-item {
  writing-mode: vertical-rl;
  font-size: 12px;
  height: 24px;
}`;
    const { content, fixes } = autoFixVerticalLayout(css);
    expect(content).toMatch(/writing-mode\s*:\s*vertical-rl/);
    expect(content).toMatch(/white-space\s*:\s*nowrap/);
    expect(fixes.some((f) => f.code === VERTICAL_RULES.VERT_001)).toBe(true);
  });

  it('竖排元素已有 nowrap → 不重复注入', () => {
    const css = `
.c-nav-vertical-item {
  writing-mode: vertical-rl;
  white-space: nowrap;
}`;
    const { content, fixes } = autoFixVerticalLayout(css);
    expect(content.match(/white-space\s*:\s*nowrap/g)).toHaveLength(1);
    expect(fixes.filter((f) => f.code === VERTICAL_RULES.VERT_001)).toHaveLength(0);
  });

  it('横向文本块不触发 VERT-001', () => {
    const css = `.c-title { font-size: 14px; color: #333; }`;
    const { content, fixes } = autoFixVerticalLayout(css);
    expect(content).toBe(css);
    expect(fixes).toHaveLength(0);
  });
});

describe('VERT-002 —— 导航项截断三件套移除', () => {
  it('sidebar tab-text 的 ellipsis/overflow:hidden/min-width:0 全部移除', () => {
    const css = `.c-monitor-sidebar-tab-text {
  min-width: 0;
  overflow: hidden;
  color: #3b80e7;
  font-size: 12px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}`;
    const { content, fixes } = autoFixVerticalLayout(css);
    expect(content).not.toMatch(/text-overflow\s*:\s*ellipsis/);
    expect(content).not.toMatch(/overflow\s*:\s*hidden/);
    expect(content).not.toMatch(/min-width\s*:\s*0/);
    // 非截断声明保留
    expect(content).toMatch(/color\s*:\s*#3b80e7/);
    expect(content).toMatch(/white-space\s*:\s*nowrap/);
    expect(fixes.some((f) => f.code === VERTICAL_RULES.VERT_002)).toBe(true);
  });

  it('普通文本 .xxx-text 的省略号保留（不误伤）', () => {
    const css = `.c-monitor-value-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}`;
    const { content, fixes } = autoFixVerticalLayout(css);
    expect(content).toBe(css);
    expect(fixes).toHaveLength(0);
  });
});

describe('VERT-003 —— 导航块固定 height 降级 min-height', () => {
  it('nav 固定 height 无 min-height → height 变 min-height', () => {
    const css = `.c-sidebar-nav-item {
  display: flex;
  align-items: center;
  height: 20px;
  padding: 4px 8px;
}`;
    const { content, fixes } = autoFixVerticalLayout(css);
    expect(content).toMatch(/min-height\s*:\s*20px/);
    expect(content).not.toMatch(/(?<!min-)height\s*:\s*20px/);
    expect(fixes.some((f) => f.code === VERTICAL_RULES.VERT_003)).toBe(true);
  });

  it('已有 min-height 的规范写法不触碰（回归：真实产物 .sidebar-tab min-height:40px）', () => {
    const css = `.c-monitor-sidebar-tab {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 40px;
  padding: 8px 12px;
}`;
    const { content, fixes } = autoFixVerticalLayout(css);
    expect(content).toBe(css);
    expect(fixes).toHaveLength(0);
  });

  it('无固定 height 的导航块不触发', () => {
    const css = `.c-nav-item { display: flex; padding: 6px 10px; }`;
    const { content, fixes } = autoFixVerticalLayout(css);
    expect(content).toBe(css);
    expect(fixes).toHaveLength(0);
  });
});

describe('VERT-004 —— flex-direction: column 容器补 min-height:0', () => {
  it('column flex 容器缺 min-height → 补 min-height:0', () => {
    const css = `.equipment-monitoring-left {
  width: 140px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}`;
    const { content, fixes } = autoFixVerticalLayout(css);
    expect(content).toMatch(/min-height\s*:\s*0/);
    expect(fixes.some((f) => f.code === VERTICAL_RULES.VERT_004)).toBe(true);
  });

  it('已有 min-height 的 column 容器不重复注入', () => {
    const css = `.equipment-monitoring-left {
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 8px;
}`;
    const { content, fixes } = autoFixVerticalLayout(css);
    expect(content.match(/min-height\s*:\s*0/g)).toHaveLength(1);
    expect(fixes.filter((f) => f.code === VERTICAL_RULES.VERT_004)).toHaveLength(0);
  });

  it('横向 flex 容器不触发 VERT-004（不误伤）', () => {
    const css = `.equipment-monitoring-content {
  display: flex;
  flex-direction: row;
  gap: 16px;
}`;
    const { content, fixes } = autoFixVerticalLayout(css);
    expect(content).toBe(css);
    expect(fixes).toHaveLength(0);
  });

  it('无 flex-direction 的普通容器不触发', () => {
    const css = `.equipment-monitoring-card {
  display: flex;
  padding: 8px 10px;
}`;
    const { content, fixes } = autoFixVerticalLayout(css);
    expect(content).toBe(css);
    expect(fixes).toHaveLength(0);
  });
});

describe('extractLeafBlocks —— 块解析', () => {
  it('嵌套 LESS 能扫到内层叶子块', () => {
    const css = `.c-sidebar {
  display: flex;
  flex-direction: column;
  .c-sidebar-tab {
    height: 20px;
    &:hover { color: red; }
  }
}`;
    const blocks = extractLeafBlocks(css);
    // .c-sidebar 与 .c-sidebar-tab 均含子块 → 非叶子；最深叶子 &：hover 必须命中
    const sels = blocks.map((b) => b.selector);
    expect(sels.some((s) => s.includes(':hover'))).toBe(true);
  });

  it('含纯属性的内层块作为叶子命中（嵌套扫描不吞内层）', () => {
    const css = `.c-sidebar {
  display: flex;
  .c-sidebar-tab {
    height: 20px;
    padding: 4px;
  }
}`;
    const blocks = extractLeafBlocks(css);
    const sels = blocks.map((b) => b.selector);
    expect(sels.some((s) => s.includes('c-sidebar-tab'))).toBe(true);
    const tab = blocks.find((b) => b.selector.includes('c-sidebar-tab'));
    expect(tab?.body).toMatch(/height\s*:\s*20px/);
  });
});

describe('autoFixVerticalLayout —— 真实产物形态回归', () => {
  it('坏产物片段（双截断）被完整修复', () => {
    // 模拟坏产物：固定 20px 高的竖排导航项 + 文本截断三件套
    const css = `.c-nav-vertical-tab {
  writing-mode: vertical-rl;
  height: 20px;
}
.c-nav-vertical-tab-text {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
}`;
    const { content, fixes } = autoFixVerticalLayout(css);
    expect(content).toMatch(/white-space\s*:\s*nowrap/); // VERT-001
    expect(content).toMatch(/min-height\s*:\s*20px/); // VERT-003（height→min-height）
    expect(content).not.toMatch(/text-overflow\s*:\s*ellipsis/); // VERT-002
    expect(content).not.toMatch(/overflow\s*:\s*hidden/);
    expect(content).not.toMatch(/min-width\s*:\s*0/);
    const codes = fixes.map((f) => f.code);
    expect(codes).toContain(VERTICAL_RULES.VERT_001);
    expect(codes).toContain(VERTICAL_RULES.VERT_002);
    expect(codes).toContain(VERTICAL_RULES.VERT_003);
  });

  it('空输入 / 无块文本原样返回', () => {
    expect(autoFixVerticalLayout('').content).toBe('');
    expect(autoFixVerticalLayout('no braces here').content).toBe('no braces here');
    expect(autoFixVerticalLayout('@gap: 8px;').content).toBe('@gap: 8px;');
  });

  it('fixVerticalBody 单块直查（方便 L0-B 复用）', () => {
    const r = fixVerticalBody('writing-mode: vertical-rl; height: 18px;', '.c-tab');
    expect(r.newBody).toMatch(/white-space:\s*nowrap/);
    expect(r.newBody).toMatch(/min-height:\s*18px/);
    expect(r.fixes.length).toBeGreaterThanOrEqual(2);
  });
});
