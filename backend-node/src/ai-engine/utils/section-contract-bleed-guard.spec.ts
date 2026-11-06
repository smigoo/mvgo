/**
 * 🧬 刀70 T3 spec — section-contract-bleed-guard
 *
 * 阳性样本取自 c-a03fe-7a03fee9 直改前实锤形态（段契约下放深层子元素）；
 * 阴性样本取自同产物直改后保留的合法层（固定轨道 vendor-grid / 段根自身）。
 */
import {
  stripContractBleedInLess,
  stripSectionContractBleed,
} from './section-contract-bleed-guard.js';

// ── 阳性：c-a03fe 原始污染块形态 ────────────────────────────────────────────
const POLLUTED = `.c-7a03fe-content-section3 {
  width: 100%;
  flex: 0.902 1 0;
  min-height: 0;
}

.c-7a03fe-content-section3 .c-7a03fe-vendor-item {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  flex: 0.902 1 0;
  min-height: 0;
  background: #f6fff7;
  color: #333;
}
`;

// ── 阴性：合法段网格容器（Figma 真值固定轨道）───────────────────────────────
const LEGAL_FIXED_TRACK = `.c-7a03fe-content-section {
  width: 100%;
  flex: 0.902 1 0;
}

.c-7a03fe-content-section .c-7a03fe-vendor-grid {
  display: grid;
  grid-template-columns: repeat(4, 126px);
  grid-auto-rows: 30px;
  column-gap: 20px;
  row-gap: 20px;
  flex: 0.902 1 0;
  min-height: 0;
}
`;

describe('stripContractBleedInLess —— 段契约下放剥离（刀70 T3）', () => {
  it('阳性：深层子元素上的全 1fr repeat + 段 flex 复读 → 剥布局属性、留真值', () => {
    const r = stripContractBleedInLess(POLLUTED);
    expect(r.stripped).toBe(1);
    expect(r.evaluated).toBe(1);
    expect(r.content).not.toContain('repeat(4, 1fr)');
    expect(r.content).not.toContain('flex: 0.902 1 0;\n  min-height: 0;\n  background: #f6fff7');
    // 真值保留
    expect(r.content).toContain('background: #f6fff7');
    expect(r.content).toContain('color: #333');
    // 段根自身的契约不动
    expect(r.content).toContain('flex: 0.902 1 0'); // 段根块仍在（vendor-item 块的已剥）
  });

  it('阴性：固定轨道 repeat(4, 126px) 的合法网格容器不得被剥离', () => {
    const r = stripContractBleedInLess(LEGAL_FIXED_TRACK);
    expect(r.stripped).toBe(0);
    expect(r.content).toContain('repeat(4, 126px)');
    expect(r.content).toContain('flex: 0.902 1 0');
    expect(r.content).toContain('min-height: 0');
  });

  it('阴性：flex 值与段根不同（无复读证据）→ fail-open 不剥', () => {
    const src = `.c-7a03fe-section-root {
  flex: 0.902 1 0;
}

.c-7a03fe-section-root .c-7a03fe-something {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  flex: 1.485 1 0;
  min-height: 0;
  color: #fff;
}
`;
    const r = stripContractBleedInLess(src);
    expect(r.stripped).toBe(0);
    expect(r.content).toContain('repeat(4, 1fr)');
  });

  it('fail-open：文件内无段根块（无同值 flex）→ 全保留', () => {
    const src = `.c-x-a .c-x-b {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  flex: 0.5 1 0;
  color: #fff;
}
`;
    const r = stripContractBleedInLess(src);
    expect(r.stripped).toBe(0);
    expect(r.evaluated).toBe(1);
  });

  it('段根自身选择器（单类）写全 1fr repeat 不剥（段容器适用域合法）', () => {
    const src = `.c-x-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  flex: 0.902 1 0;
  min-height: 0;
}
`;
    const r = stripContractBleedInLess(src);
    expect(r.stripped).toBe(0);
    expect(r.content).toContain('repeat(4, 1fr)');
  });

  it('幂等：剥后重跑零变化', () => {
    const once = stripContractBleedInLess(POLLUTED);
    const twice = stripContractBleedInLess(once.content);
    expect(twice.stripped).toBe(0);
    expect(twice.content).toBe(once.content);
  });
});

describe('间距 Phase 1 下限钳制（刀70 同出口）', () => {
  it('纵向 flex 容器 gap 0<N<6 → 6px；gap:0 与横向不动', () => {
    const src = `.c-x-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.c-x-tight {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.c-x-row-tags {
  display: flex;
  flex-direction: row;
  gap: 4px;
}
`;
    const r = stripContractBleedInLess(src);
    expect(r.gapClamped).toBe(1);
    expect(r.content).toContain('gap: 6px');
    expect(r.content).toContain('gap: 0;');
    expect(r.content.match(/gap: 4px;/g) || []).toHaveLength(1); // 仅横向 row 容器保留
  });

  it('横向 tag 容器 gap:4px 保留（不误伤紧凑 tag 组）', () => {
    const src = `.c-x-tags {
  display: flex;
  flex-direction: row;
  gap: 4px;
}
`;
    const r = stripContractBleedInLess(src);
    expect(r.gapClamped).toBe(0);
    expect(r.content).toContain('gap: 4px');
  });

  it('title 块 margin-bottom 0<N<8 → 8px', () => {
    const src = `.c-x-title {
  font-size: 16px;
  margin-bottom: 4px;
}
`;
    const r = stripContractBleedInLess(src);
    expect(r.titleGapClamped).toBe(1);
    expect(r.content).toContain('margin-bottom: 8px');
  });

  it('title 块 margin-bottom ≥8 或 0 保留', () => {
    const src = `.c-x-title {
  margin-bottom: 12px;
}

.c-x-title2 {
  margin-bottom: 0;
}
`;
    const r = stripContractBleedInLess(src);
    expect(r.titleGapClamped).toBe(0);
    expect(r.content).toContain('margin-bottom: 12px');
    expect(r.content).toContain('margin-bottom: 0;');
  });
});

describe('stripSectionContractBleed —— writeFiles 循环外整体入口', () => {
  it('只扫 resources/styles/**.less，产物 map 只含变更文件', () => {
    const files = new Map([
      ['pkg/resources/styles/common.less', POLLUTED],
      ['pkg/resources/styles/index.less', '.c-x { color: red; }'],
      ['pkg/package/index.vue', '<template><div/></template>'],
      ['pkg/index.css', '.c-y .c-z { display: grid; grid-template-columns: repeat(4, 1fr); flex: 0.902 1 0; }'],
    ]);
    const { map, stats } = stripSectionContractBleed(files);
    expect(stats.scannedFiles).toBe(2); // common.less + index.less（.vue/.css 不扫）
    expect(stats.contractBleedStripped).toBe(1);
    expect(map.size).toBe(1);
    expect(map.has('pkg/resources/styles/common.less')).toBe(true);
  });

  it('恒打计数（无污染时 stripped=0 也返回 stats）', () => {
    const { map, stats } = stripSectionContractBleed(
      new Map([['pkg/resources/styles/common.less', '.c-x { color: red; }']]),
    );
    expect(stats.contractBleedStripped).toBe(0);
    expect(map.size).toBe(0);
  });

  it('接受普通 Object 形态入参', () => {
    const { stats } = stripSectionContractBleed({
      'pkg/resources/styles/common.less': POLLUTED,
    });
    expect(stats.contractBleedStripped).toBe(1);
  });
});
