/**
 * 根治⑬ 确定性防叠布局引擎 spec（2026-11-13）
 * 钉子：mc-1794524809643-8a74b874 真实产物 ContentDailyTotalFlow.vue 病灶——
 *  cdtf-header/cdtf-compare 零规则、cdtf-compare__item 有规则无 display ⇒ inline 裸排交叠。
 */
import {
  parseAncChain,
  nearestCommonAncestor,
  extractOverlapAnchors,
  applyOverlapProofHeal,
} from './overlap-proof-layout.js';

// 8a74b874 真实产物节选（病灶原样：header/compare/compare__item 无 display 声明）
const REAL_CDTF_VUE = `<!-- package/components/ContentDailyTotalFlow.vue -->
<template>
  <div
    class="c-traffic-monitor-content-daily-total-flow"
    data-section-id="88:32"
    :style="componentProps.style"
   v-bind="$attrs">
    <div class="c-traffic-monitor-cdtf-header">
      <span class="c-traffic-monitor-cdtf-header__title">当日总流量</span>
      <span class="c-traffic-monitor-cdtf-header__tag">24小时</span>
    </div>
    <div class="c-traffic-monitor-cdtf-body">
      <div class="c-traffic-monitor-cdtf-total">34,620</div>
      <div class="c-traffic-monitor-cdtf-compare">
        <div class="c-traffic-monitor-cdtf-compare__item">
          <span class="c-traffic-monitor-cdtf-compare__name">82,379</span>
          <span class="c-traffic-monitor-cdtf-compare__value">江阴靖江长江隧道</span>
        </div>
        <div class="c-traffic-monitor-cdtf-compare__item">
          <span class="c-traffic-monitor-cdtf-compare__name">34,620</span>
          <span class="c-traffic-monitor-cdtf-compare__value">江阴大桥</span>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
const { componentProps } = $mcComponentBuilder()
</script>
<style scoped lang="less">@fontSize: var(--fontSize, 14px);

.c-traffic-monitor-content-daily-total-flow {  width: 100%;

  display: flex;
  flex-direction: column;
  padding: 0 12px;
  min-height: 0;
}

.c-traffic-monitor-cdtf-header__title {
  font-size: @fontSize;
}

.c-traffic-monitor-cdtf-total {
  font-size: calc(@fontSize * 1.8571);
}

.c-traffic-monitor-cdtf-compare__item {width: 100%;
height: 100%;

  font-size: calc(@fontSize * 0.7857);
}

.c-traffic-monitor-cdtf-compare__value {
  color: #5ad0ff;
}
</style>`;

// 8a74b874 真实 D2 重叠对（round1 日志原样，容器链截取至组件根）
const REAL_PAIR = {
  a: '当日总流量',
  b: '江阴靖江长江隧道',
  ratio: 0.75,
  aBox: [38.5, 42.75, 68.5625, 21],
  bBox: [14.5, 47.921875, 96, 22],
  aFs: 14,
  bFs: 12,
  aAnc: 'c-traffic-monitor-cdtf-header < c-traffic-monitor-content-daily-total-flow',
  bAnc: 'c-traffic-monitor-cdtf-compare__item < c-traffic-monitor-content-daily-total-flow',
};

describe('根治⑬ · parseAncChain / nearestCommonAncestor', () => {
  test('容器链解析（近→远）', () => {
    expect(parseAncChain('a < b < c')).toEqual(['a', 'b', 'c']);
    expect(parseAncChain('')).toEqual([]);
    expect(parseAncChain(null)).toEqual([]);
  });

  test('最近公共祖先：8a74b874 真实链 ⇒ 组件根类', () => {
    const a = parseAncChain(REAL_PAIR.aAnc);
    const b = parseAncChain(REAL_PAIR.bAnc);
    expect(nearestCommonAncestor(a, b)).toBe(
      'c-traffic-monitor-content-daily-total-flow',
    );
  });

  test('extractOverlapAnchors：类并集 + 公共祖先（根治⑮ 起异父对额外产 cross-parent 条目）', () => {
    const anchors = extractOverlapAnchors([REAL_PAIR]);
    const normal = anchors.filter((a: any) => a.type !== 'cross-parent');
    expect(normal).toHaveLength(1);
    expect(normal[0].anchorClasses.has('c-traffic-monitor-cdtf-header')).toBe(true);
    expect(normal[0].anchorClasses.has('c-traffic-monitor-cdtf-compare__item')).toBe(true);
    expect(normal[0].commonAncestor).toBe(
      'c-traffic-monitor-content-daily-total-flow',
    );
  });
});

describe('根治⑬ · applyOverlapProofHeal（8a74b874 真实病灶）', () => {
  const anchors = extractOverlapAnchors([REAL_PAIR]);
  const FILE = 'package/components/ContentDailyTotalFlow.vue';

  test('① 半缺失容器（有规则无 display）⇒ 规则体注入 flex column', () => {
    const { files, healed } = applyOverlapProofHeal(
      { [FILE]: REAL_CDTF_VUE },
      anchors,
    );
    const out = files[FILE];
    // cdtf-compare__item 规则体内有 display: flex 且带 op-heal 标记
    const m = /\.c-traffic-monitor-cdtf-compare__item\s*\{([^}]*)\}/.exec(out);
    expect(m).toBeTruthy();
    expect(m[1]).toContain('display: flex');
    expect(m[1]).toContain('op-heal');
    expect(healed).toHaveLength(1);
  });

  test('② 零规则容器（cdtf-header）⇒ 新建防叠规则', () => {
    const { files } = applyOverlapProofHeal({ [FILE]: REAL_CDTF_VUE }, anchors);
    const out = files[FILE];
    expect(out).toMatch(/\.c-traffic-monitor-cdtf-header\s*\{[^}]*display: flex/);
  });

  test('③ 字号钳制：公共祖先（组件根类）注入 --fontSize = 14×0.85 = 11.9px', () => {
    const { files } = applyOverlapProofHeal({ [FILE]: REAL_CDTF_VUE }, anchors);
    const out = files[FILE];
    expect(out).toContain('--fontSize: 11.9px;');
    // 根类原有 display: flex 保留（只插声明不破坏规则）
    const m = /\.c-traffic-monitor-content-daily-total-flow\s*\{([^}]*)\}/.exec(out);
    expect(m[1]).toContain('display: flex');
    expect(m[1]).toContain('flex-direction: column');
  });

  test('④ 幂等：连跑两遍第二遍零 healed', () => {
    const r1 = applyOverlapProofHeal({ [FILE]: REAL_CDTF_VUE }, anchors);
    const r2 = applyOverlapProofHeal(r1.files, anchors);
    expect(r2.healed).toHaveLength(0);
    expect(r2.files[FILE]).toBe(r1.files[FILE]);
  });

  test('⑤ 阴性·已有 display 的规则不动：根类（display:flex 已在）不被动作 A 触碰', () => {
    // 根类只在动作 B（font clamp）被改；动作 A 不应给它重复注入 flex column
    const { files } = applyOverlapProofHeal({ [FILE]: REAL_CDTF_VUE }, anchors);
    const out = files[FILE];
    const m = /\.c-traffic-monitor-content-daily-total-flow\s*\{([^}]*)\}/.exec(out);
    const flexCols = m[1].match(/flex-direction: column/g) || [];
    expect(flexCols.length).toBe(1); // 原有的那一份，无重复注入
  });

  test('⑥ 阴性·无 --fontSize 钩子的文件不 clamp（记 skipped）', () => {
    const noHook = REAL_CDTF_VUE.replace(
      '@fontSize: var(--fontSize, 14px);',
      '@fontSize: 14px;',
    );
    const { files, healed, skipped } = applyOverlapProofHeal(
      { [FILE]: noHook },
      anchors,
    );
    expect(files[FILE]).not.toContain('--fontSize:');
    // flex 配方仍生效，但 font-clamp 不在 healed 里
    const actions = healed.flatMap((h) => h.heals.map((x) => x.action));
    expect(actions).not.toContain('font-clamp');
    expect(skipped.some((s) => s.reason === 'no-fontsize-hook')).toBe(true);
  });

  test('⑦ 阴性·无锚点 ⇒ 全部文件零接触', () => {
    const { files, healed } = applyOverlapProofHeal({ [FILE]: REAL_CDTF_VUE }, []);
    expect(files[FILE]).toBe(REAL_CDTF_VUE);
    expect(healed).toHaveLength(0);
  });

  test('⑧ 阴性·未涉及锚点类的 .vue 文件零接触', () => {
    const other = '<template><div class="x-other"><span>a</span><span>b</span></div></template>';
    const { files } = applyOverlapProofHeal(
      { [FILE]: REAL_CDTF_VUE, 'package/components/Other.vue': other },
      anchors,
    );
    expect(files['package/components/Other.vue']).toBe(other);
  });

  test('⑨ 纯文本叶子宿主不注入 flex（防行内排版破坏）', () => {
    const leafOnly =
      '<template><div class="k-leaf"><span>solo</span></div></template>\n<style>.k-leaf-other { color: red; }</style>';
    const anchors2 = extractOverlapAnchors([
      { aAnc: 'k-ghost < k-root', bAnc: 'k-ghost2 < k-root' },
    ]);
    // k-root 在 fixture 中不存在 ⇒ skipped，不产出规则
    const { healed } = applyOverlapProofHeal(
      { 'package/L.vue': leafOnly },
      anchors2,
    );
    expect(healed).toHaveLength(0);
  });
});

// ═══ 根治⑮ · 异父同位错开（2026-11-13 · mc-1794532970423-0062020b 真实病灶钉）═══
// 病灶：产品描述区块（regions）× KV 网格（kvgrid）两个兄弟区块几乎同 top 的
// position:absolute 压盖（394.25 vs 393.59），容器内 flex column 治不了（真机三轮纹丝不动）。
const REGIONS_CLS = 'c-device-fg-regions-361693';
const KVGRID_CLS = 'c-device-fg-kvgrid-817';

const REAL_0062_PAIRS = [
  {
    a: '产品描述', b: '具身机器人', ratio: 0.56,
    aBox: [62.5, 394.25, 48, 16], bBox: [78.5, 393.59375, 60, 14], aFs: 12, bFs: 12,
    aAnc: `${REGIONS_CLS} < c-device-slot-con.c-mc-max-1794533281800-5286361e < pannel-content`,
    bAnc: `c-device-fg-kvgrid-817-cell < ${KVGRID_CLS} < c-device-slot-con.c-mc-max-1794533281800-5286361e`,
  },
  {
    a: '该设备为太阳能供电一体化爆闪灯，采用红蓝双色高壳', b: '192.168.245.123', ratio: 1,
    aBox: [62.5, 419.25, 496, 90], bBox: [78.5, 441.59375, 88.75, 14], aFs: 12, bFs: 12,
    aAnc: `${REGIONS_CLS} < c-device-slot-con.c-mc-max-1794533281800-5286361e < pannel-content`,
    bAnc: `c-device-fg-kvgrid-817-cell < ${KVGRID_CLS} < c-device-slot-con.c-mc-max-1794533281800-5286361e`,
  },
];

// 渲染时刻 index.vue 形态（两容器 absolute 定位）
const REAL_0062_VUE = `<template>
  <div class="c-device-slot-con c-mc-max-1794533281800-5286361e">
    <div class="${REGIONS_CLS}">
      <div class="c-device-fg-regions-title">产品描述</div>
      <div class="c-device-fg-regions-text">该设备为太阳能供电一体化爆闪灯</div>
    </div>
    <div class="${KVGRID_CLS}">
      <div class="c-device-fg-kvgrid-817-cell"><span>具身机器人</span></div>
      <div class="c-device-fg-kvgrid-817-cell"><span>192.168.245.123</span></div>
    </div>
  </div>
</template>
<script setup>
const { componentProps } = $mcComponentBuilder()
</script>
<style scoped lang="less">
.c-device-slot-con.c-mc-max-1794533281800-5286361e { position: relative; width: 100%; height: 100%; }
.${REGIONS_CLS} {
  position: absolute;
  top: 394.25px;
  left: 62.5px;
  width: 496px;
}
.${KVGRID_CLS} {
  position: absolute;
  top: 393.59px;
  left: 78.5px;
  width: 497px;
}
.c-device-fg-regions-title { font-size: 12px; }
.c-device-fg-kvgrid-817-cell { font-size: 12px; }
</style>`;

const IDX_FILE = 'package/index.vue';

describe('根治⑮ · extractOverlapAnchors 异父对聚合', () => {
  test('0062020b 真实 pairs ⇒ 1 个 cross-parent 条目，y 区间按容器聚合', () => {
    const anchors = extractOverlapAnchors(REAL_0062_PAIRS as any);
    const cross = anchors.filter((a: any) => a.type === 'cross-parent');
    expect(cross).toHaveLength(1);
    const cp: any = cross[0];
    expect(cp.containerA).toBe(REGIONS_CLS);
    // containerB = 链首段（文本直挂 cell）；定位祖先（kvgrid）由动作 C 沿链解析
    expect(cp.containerB).toBe('c-device-fg-kvgrid-817-cell');
    expect(cp.chainB).toContain(KVGRID_CLS);
    // regions：产品描述 394.25~410.25 ∪ 长文 419.25~509.25
    expect(cp.regionA.top).toBeCloseTo(394.25, 2);
    expect(cp.regionA.bottom).toBeCloseTo(509.25, 2);
    // kvgrid：具身机器人 393.59~407.59 ∪ 直连/IP 行 …~455.59
    expect(cp.regionB.top).toBeCloseTo(393.59, 2);
    expect(cp.regionB.bottom).toBeCloseTo(455.59, 2);
    expect(cp.overlapHeight).toBeGreaterThan(0);
  });

  test('同父对（链首段相同）不产 cross-parent；y 区间不交叠的异父对被过滤', () => {
    const sameParent = extractOverlapAnchors([
      { aAnc: 'wrap < root', bAnc: 'wrap < root', aBox: [0, 10, 10, 5], bBox: [0, 12, 10, 5] },
    ] as any);
    expect(sameParent.filter((a: any) => a.type === 'cross-parent')).toHaveLength(0);

    const disjoint = extractOverlapAnchors([
      { aAnc: 'qa < root', bAnc: 'qb < root', aBox: [0, 10, 10, 5], bBox: [0, 100, 10, 5] },
    ] as any);
    expect(disjoint.filter((a: any) => a.type === 'cross-parent')).toHaveLength(0);
  });
});

describe('根治⑮ · applyOverlapProofHeal 动作 C（异父同位错开）', () => {
  const anchors: any = extractOverlapAnchors(REAL_0062_PAIRS as any);

  test('① 同位实锤（top 差 < 交叠高度）⇒ 区间小者 top 修到区间大者底部+8', () => {
    const { files, healed } = applyOverlapProofHeal({ [IDX_FILE]: REAL_0062_VUE }, anchors);
    const out = files[IDX_FILE];
    // regions h=115 > kvgrid h=62 ⇒ keep regions、move kvgrid
    const mRegions = new RegExp(`\\.${REGIONS_CLS}[^{]*\\{([^}]*)\\}`).exec(out)!;
    expect(mRegions[1]).toContain('top: 394.25px'); // 保留者不动
    const mKv = new RegExp(`\\.${KVGRID_CLS}[^{]*\\{([^}]*)\\}`).exec(out)!;
    // newTop = 393.59 + (509.25 + 8 − 393.59375) = 517.24625 → 517.2
    expect(mKv[1]).toContain('top: 517.2px');
    expect(mKv[1]).toContain('op-heal-c');
    expect(healed.flatMap((h: any) => h.heals.map((x: any) => x.action)))
      .toContain('cross-parent-top-shift');
  });

  test('② 阴性·双链均无 absolute+top 定位祖先 ⇒ skipped，top 不动', () => {
    const notAbs = REAL_0062_VUE.replace(/position: absolute;\n\s*/g, '');
    const { files, healed, skipped } = applyOverlapProofHeal({ [IDX_FILE]: notAbs }, anchors);
    expect(files[IDX_FILE]).not.toContain('op-heal-c');
    expect(healed.flatMap((h: any) => h.heals.map((x: any) => x.action)))
      .not.toContain('cross-parent-top-shift');
    expect(skipped.some((s: any) => s.reason === 'cross-parent-no-pos-ancestor')).toBe(true);
  });

  test('③ 阴性·已错开（top 差 ≥ 交叠高度）⇒ 不动', () => {
    const separated = REAL_0062_VUE.replace('top: 393.59px', 'top: 700px');
    const { files } = applyOverlapProofHeal({ [IDX_FILE]: separated }, anchors);
    expect(files[IDX_FILE]).toContain('top: 700px');
    expect(files[IDX_FILE]).not.toContain('op-heal-c');
  });

  test('④ 阴性·定位祖先无 top 声明 ⇒ 沿链无解析结果，skipped', () => {
    const noTop = REAL_0062_VUE.replace('  top: 393.59px;\n', '');
    const { files, skipped } = applyOverlapProofHeal({ [IDX_FILE]: noTop }, anchors);
    expect(files[IDX_FILE]).not.toContain('op-heal-c');
    expect(skipped.some((s: any) => s.reason === 'cross-parent-no-pos-ancestor')).toBe(true);
  });

  test('⑤ 幂等：op-heal-c 已在 ⇒ 再跑零动作', () => {
    const r1 = applyOverlapProofHeal({ [IDX_FILE]: REAL_0062_VUE }, anchors);
    const r2 = applyOverlapProofHeal(r1.files, anchors);
    const topShifts = r2.healed.flatMap((h: any) =>
      h.heals.filter((x: any) => x.action === 'cross-parent-top-shift'),
    );
    expect(topShifts).toHaveLength(0);
    expect(r2.files[IDX_FILE]).toBe(r1.files[IDX_FILE]);
  });

  test('⑥ 对调：区间大者在 B ⇒ 挪 A', () => {
    const swapped = extractOverlapAnchors([
      {
        a: '短', b: '长内容区块', ratio: 0.9,
        aBox: [10, 100, 40, 14], bBox: [10, 101, 300, 80],
        aAnc: 'panel-a < root', bAnc: 'panel-b < root',
      },
    ] as any).filter((a: any) => a.type === 'cross-parent');
    const vueSwapped = REAL_0062_VUE
      .replace(new RegExp(REGIONS_CLS, 'g'), 'panel-a')
      .replace(new RegExp(KVGRID_CLS, 'g'), 'panel-b')
      .replace('top: 394.25px', 'top: 100px')
      .replace('top: 393.59px', 'top: 101px');
    const { files } = applyOverlapProofHeal({ [IDX_FILE]: vueSwapped }, swapped as any);
    const mA = /\.panel-a[^{]*\{([^}]*)\}/.exec(files[IDX_FILE])!;
    // keep B（h=80）⇒ A 新 top = 100 + (181 + 8 − 100) = 189
    expect(mA[1]).toContain('top: 189px');
    const mB = /\.panel-b[^{]*\{([^}]*)\}/.exec(files[IDX_FILE])!;
    expect(mB[1]).toContain('top: 101px'); // 保留者不动
  });
});
