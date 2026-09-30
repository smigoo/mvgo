/**
 * 🎯 ④ N3「锚点优先」+ 挂载点评分单一事实源 单测（2026-09-30）
 *
 * 覆盖 `utils/mount-target-scoring.js`：
 *  - `scoreMountTarget` 的**确定性锚短路**（DETERMINISTIC_ANCHOR_SCORE = 1000）与宿主外壳禁用；
 *  - 新增 `selectAnchorMountCandidate` 的**三态**语义（null=信息不足走既有 fallback /
 *    skip=锚点已定性禁止注入 / cand=锚点干净且资源未渲染 ⇒ 直接以它为准）。
 *
 * 为什么这些断言是「治本」而不是实现细节：N3 的旧实现是**锚点盲区**的私有词重叠评分，
 * 与 resource-mounter 用的 `scoreMountTarget` 形成「同一事实两处各自计算」——本单测把两侧的
 * 契约钉在同一个常数/同一份语义上，防止任一侧再次分叉。
 */
import {
  scoreMountTarget,
  selectAnchorMountCandidate,
  isResourceRendered,
  anchorOwnerRank,
  DETERMINISTIC_ANCHOR_SCORE,
} from './mount-target-scoring.js';

/** 造一个最小 mapping（只带本单测关心的字段） */
function bgMapping(extra = {}) {
  return {
    previewAnalysisRole: 'bg',
    bgRole: 'container',
    mountTarget: 'slot-当日总流量',
    name: 'bg-[m]',
    figmaPath: 'cp-流量监测/slot-当日总流量/Group 2136636802/bg-[m]',
    figmaBox: { width: 426, height: 91 },
    parentBox: { width: 426, height: 91 },
    ownerSectionId: '2:3660',
    assignedVarName: 'bg1',
    resourceFile: '../resources/images/bg-_m-34.png',
    ...extra,
  };
}

describe('scoreMountTarget · 确定性锚短路（与 N3 共用的同一事实源）', () => {
  it('dataSectionId === ownerSectionId ⇒ DETERMINISTIC_ANCHOR_SCORE（压过任何语义组合）', () => {
    const mapping = bgMapping();
    const anchorCand = {
      cls: 'c-traffic-monitor-group-2136636802-con', // 与 mountTarget token 覆盖率 = 0
      depth: 1,
      isHostShell: false,
      dataSectionId: '2:3660',
    };
    // 语义完全不相干的 class，靠锚点拿到哨兵分
    expect(scoreMountTarget(mapping, anchorCand)).toBe(DETERMINISTIC_ANCHOR_SCORE);
    // 语义高度相似但无锚点的「语义祖先」拿不到哨兵分
    const semanticAncestor = {
      cls: 'c-traffic-monitor-slot-当日总流量-con',
      depth: 0,
      isHostShell: false,
      dataSectionId: '88:33',
    };
    const s = scoreMountTarget(mapping, semanticAncestor);
    expect(s).toBeLessThan(DETERMINISTIC_ANCHOR_SCORE);
  });

  it('锚点任一为空 ⇒ 不短路（老产物无 ownerSectionId 时行为完全不变）', () => {
    const noOwner = bgMapping({ ownerSectionId: null });
    const cand = {
      cls: 'c-traffic-monitor-group-2136636802-con',
      depth: 1,
      isHostShell: false,
      dataSectionId: '2:3660',
    };
    expect(scoreMountTarget(noOwner, cand)).toBeLessThan(DETERMINISTIC_ANCHOR_SCORE);
    const noSid = { ...cand, dataSectionId: null };
    expect(scoreMountTarget(bgMapping(), noSid)).toBeLessThan(
      DETERMINISTIC_ANCHOR_SCORE,
    );
  });

  it('宿主外壳（base-panel / mc-panel）恒不可挂：-Infinity', () => {
    const mapping = bgMapping();
    const shell = {
      cls: 'c-traffic-monitor-container',
      depth: 0,
      isHostShell: true,
      dataSectionId: '2:3660', // 即便锚点命中也不能挂
    };
    expect(scoreMountTarget(mapping, shell)).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe('selectAnchorMountCandidate · 三态语义', () => {
  const F = (o) => o; // 语义化别名：本 describe 的入参就是「产物文件表」

  it('① 无 ownerSectionId ⇒ null（调用方保持既有词重叠评分，零回归）', () => {
    const files = F({
      'package/index.vue':
        '<template><div class="c-a-container" data-section-id="2:3660"></div></template>',
    });
    expect(selectAnchorMountCandidate(files, bgMapping({ ownerSectionId: null }))).toBe(
      null,
    );
  });

  it('② 产物里没有该 data-section-id 元素 ⇒ null（信息不足，不猜）', () => {
    const files = F({
      'package/index.vue':
        '<template><div class="c-a-container" data-section-id="2:9999"></div></template>',
    });
    expect(selectAnchorMountCandidate(files, bgMapping())).toBeNull();
  });

  it('③ 锚点元素干净 + 资源未被渲染 ⇒ cand（字段形状与 N3 既有候选逐字一致）', () => {
    const files = F({
      'package/index.vue':
        '<template>\n  <div class="c-a-slot-con" data-section-id="88:33">\n    <div class="c-a-group-2136636802-con" data-section-id="2:3660"></div>\n  </div>\n</template>',
    });
    const r = selectAnchorMountCandidate(files, bgMapping());
    expect(r).not.toBeNull();
    expect(r.skip).toBe(false);
    expect(r.anchor).toBe('2:3660');
    expect(r.cand.fpath).toBe('package/index.vue');
    expect(r.cand.tag).toBe('div');
    expect(r.cand.cls).toBe('c-a-group-2136636802-con');
    expect(r.cand.before).toBe(' ');
    // class 在 data-section-id 之前 ⇒ after = 其后的属性串（与 N3 既有正则的 lazy 分组同形）
    expect(r.cand.after).toBe(' data-section-id="2:3660"');
    expect(r.cand.score).toBe(DETERMINISTIC_ANCHOR_SCORE);
    // index 必须指向该标签起点（调用方按 index 切片替换）
    expect(files['package/index.vue'].slice(r.cand.index)).toContain(
      '<div class="c-a-group-2136636802-con"',
    );
    expect(r.cand.full).toBe(
      '<div class="c-a-group-2136636802-con" data-section-id="2:3660">',
    );
  });

  it('③b data-section-id 写在 class 之前 / 用单引号，同样能命中', () => {
    const files = F({
      'package/components/CardGrid.vue':
        "<template>\n  <div data-section-id='2:3660' class=\"c-a-card\" v-bind=\"$attrs\"></div>\n</template>",
    });
    const r = selectAnchorMountCandidate(files, bgMapping());
    expect(r && r.skip).toBe(false);
    expect(r.cand.fpath).toBe('package/components/CardGrid.vue');
    expect(r.cand.cls).toBe('c-a-card');
  });

  it('④ 锚点元素已有 background ⇒ skip:anchor-already-bg（幂等；**不得**退化到语义评分）', () => {
    const files = F({
      'package/index.vue':
        '<template><div class="c-a-group-2136636802-con" data-section-id="2:3660" :style="{ backgroundImage: `url(${bg1})` }"></div></template>',
    });
    const r = selectAnchorMountCandidate(files, bgMapping());
    expect(r).toEqual({
      skip: true,
      reason: 'anchor-already-bg',
      anchor: '2:3660',
      file: 'package/index.vue',
    });
  });

  it('⑤ 锚点是宿主外壳 ⇒ skip:anchor-host-shell（与 scoreMountTarget 的 isHostShell 同源）', () => {
    const files = F({
      'package/index.vue':
        '<template><base-panel class="c-a-panel" data-section-id="2:3660"></base-panel></template>',
    });
    const r = selectAnchorMountCandidate(files, bgMapping());
    expect(r && r.skip).toBe(true);
    expect(r.reason).toBe('anchor-host-shell');
  });

  it('⑥ 资源已在别处渲染（如透明度归属契约的 -bg 独立层）⇒ skip:var-already-referenced', () => {
    // 🛡️ 本用例是安全底线：硬性锚点优先会在此产生「容器 + 层各挂一次」，
    //    随后 fixPipeline 的 dedupe-bg-multi-refs（keep 规则同为锚点优先）会把**层**判为
    //    重复并剥掉其 :style ⇒ 透明度层语义丢失。已渲染即不再注入是唯一不误伤的判据。
    const files = F({
      'package/components/ContentSection5.vue':
        '<template>\n  <div class="c-a-激活" data-section-id="2:3660">\n    <div class="c-a-激活-bg" :style="{ backgroundImage: `url(${bg1})`, opacity: 0.5 }"></div>\n  </div>\n</template>',
    });
    const r = selectAnchorMountCandidate(files, bgMapping());
    expect(r).toEqual({
      skip: true,
      reason: 'var-already-referenced',
      anchor: '2:3660',
      file: 'package/components/ContentSection5.vue',
    });
  });

  it('⑥b 同一变量在**其它文件**被背景引用 ⇒ 同样 skip（跨文件统计，不只看命中文件）', () => {
    const files = F({
      'package/index.vue':
        '<template><div class="c-a-group-con" data-section-id="2:3660"></div></template>',
      'package/components/Other.vue':
        '<template><div class="c-a-other" :style="{ backgroundImage: `url(${bg1})` }"></div></template>',
    });
    const r = selectAnchorMountCandidate(files, bgMapping());
    expect(r && r.skip).toBe(true);
    expect(r.reason).toBe('var-already-referenced');
  });

  it('⑥c 变量名相同但非背景引用（如 script 数据）不算「已渲染」', () => {
    const files = F({
      'package/index.vue':
        '<template><div class="c-a-group-con" data-section-id="2:3660"></div></template>',
      'package/components/Other.vue':
        '<template><span class="c-a-label">{{ bg1 }}</span></template>',
    });
    const r = selectAnchorMountCandidate(files, bgMapping());
    expect(r && r.skip).toBe(false);
  });

  it('⑦ 跨文件命中：锚点在子组件里也能找到', () => {
    const files = F({
      'package/index.vue':
        '<template><div class="c-a-container" data-section-id="88:33"></div></template>',
      'package/components/CardGrid.vue':
        '<template><div class="c-a-card" data-section-id="2:3660" v-bind="$attrs"></div></template>',
    });
    const r = selectAnchorMountCandidate(files, bgMapping());
    expect(r && r.skip).toBe(false);
    expect(r.cand.fpath).toBe('package/components/CardGrid.vue');
  });

  it('⑧ 非 .vue 文件不参与（less/json 里的 data-section-id 不算锚点）', () => {
    const files = F({
      'package/index.vue': '<template><div class="c-a-x"></div></template>',
      'resources/styles/common.less': '/* [data-section-id="2:3660"] */',
    });
    expect(selectAnchorMountCandidate(files, bgMapping())).toBeNull();
  });

  it('⑨ 自闭合锚点元素：after 带 ` /`，交由调用方按自闭合分支产出正确形态', () => {
    const files = F({
      'package/index.vue':
        '<template><div class="c-a-group-con" data-section-id="2:3660" v-bind="$attrs" /></template>',
    });
    const r = selectAnchorMountCandidate(files, bgMapping());
    expect(r && r.skip).toBe(false);
    // N3 注入代码用 /\s\/\s*$/ 判自闭合 ⇒ after 必须保留尾随 ` /`，否则产出
    // `<X … / :style="{ … }">`（斜杠与 > 之间夹属性）⇒ compiler-sfc 报 Illegal '/' in tags.
    expect(r.cand.after).toMatch(/\s\/\s*$/);
  });

  it('⑩ 幂等：注入后再调用一次 ⇒ 变为 skip:anchor-already-bg（不重复挂载）', () => {
    const before =
      '<template><div class="c-a-group-con" data-section-id="2:3660"></div></template>';
    const r1 = selectAnchorMountCandidate(
      { 'package/index.vue': before },
      bgMapping(),
    );
    expect(r1 && r1.skip).toBe(false);
    // 模拟调用方注入（与 N3 的注入分支同形）
    const injected = before.replace(
      '<div class="c-a-group-con" data-section-id="2:3660">',
      '<div class="c-a-group-con" data-section-id="2:3660" :style="{ backgroundImage: `url(${bg1})` }">',
    );
    const r2 = selectAnchorMountCandidate(
      { 'package/index.vue': injected },
      bgMapping(),
    );
    expect(r2 && r2.skip).toBe(true);
    expect(r2.reason).toBe('anchor-already-bg');
  });

  it('⑪ 锚点元素无 class 属性 ⇒ null（与 N3 既有标签正则同口径，不擅自扩面）', () => {
    const files = F({
      'package/index.vue':
        '<template><div data-section-id="2:3660"></div></template>',
    });
    expect(selectAnchorMountCandidate(files, bgMapping())).toBeNull();
  });

  it('⑫ varName 可由 opts 显式覆盖（默认取 mapping.assignedVarName）', () => {
    const files = F({
      'package/index.vue':
        '<template><div class="c-a-group-con" data-section-id="2:3660"></div><div class="c-a-other" :style="{ backgroundImage: `url(${bg9})` }"></div></template>',
    });
    // 默认 varName=bg1，bg9 的引用不算 ⇒ 可挂
    expect(
      selectAnchorMountCandidate(files, bgMapping()).skip,
    ).toBe(false);
    // 显式指定 bg9 ⇒ 已渲染 ⇒ skip
    const r = selectAnchorMountCandidate(files, bgMapping(), { varName: 'bg9' });
    expect(r && r.skip).toBe(true);
    expect(r.reason).toBe('var-already-referenced');
  });

  it('⑬ 非 bg 语义条目也走同一判据（无 mountTarget 不影响锚点选择）', () => {
    const files = F({
      'package/index.vue':
        '<template><div class="c-a-group-con" data-section-id="2:3660"></div></template>',
    });
    const r = selectAnchorMountCandidate(files, bgMapping({ mountTarget: '' }));
    expect(r && r.skip).toBe(false);
  });

  it('⑭ 空/畸形输入 fail-closed（返回 null，让调用方走既有路径）', () => {
    expect(selectAnchorMountCandidate(null, bgMapping())).toBeNull();
    expect(selectAnchorMountCandidate({}, null)).toBeNull();
    expect(selectAnchorMountCandidate({}, bgMapping())).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ① N3 fallback 护栏（2026-09-30）：`isResourceRendered` = 「资源已渲染」单一判据
//    缺口：`selectAnchorMountCandidate` 的 `var-already-referenced` 只在「锚点命中」时被评估
//    ⇒ 锚点缺失 / 无 ownerSectionId 的 fallback 路径无护栏（实测 721 条重复注入，313 唯一产品）。
//    这些用例把「什么叫已渲染」钉死，防止护栏被后续改宽/改窄。
// ═══════════════════════════════════════════════════════════════════════════
describe('isResourceRendered · 「资源已渲染」单一判据（① fallback 护栏）', () => {
  const F = (o) => o;

  it('① 背景引用命中 ⇒ true（backgroundImage / background / background-image 三种写法）', () => {
    expect(
      isResourceRendered(
        F({
          'package/index.vue':
            '<template><div class="a" :style="{ backgroundImage: `url(${bg1})` }"></div></template>',
        }),
        'bg1',
      ),
    ).toBe(true);
    expect(
      isResourceRendered(
        F({
          'package/index.vue':
            '<template><div class="a" :style="{ background: \'url(\' + bg1 + \')\' }"></div></template>',
        }),
        'bg1',
      ),
    ).toBe(true);
  });

  it('② **无 class** 的元素同样算已渲染（宽正则 ANY_TAG_RE，比找候选的 N3_TAG_RE 更宽）', () => {
    expect(
      isResourceRendered(
        F({
          'package/index.vue': '<template><div :style="{ background: bg1 }"></div></template>',
        }),
        'bg1',
      ),
    ).toBe(true);
  });

  it('③ 非背景引用（:src 图片 / 仅 import）不算 ⇒ false（比已删的 findExistingResourceBinding 更严）', () => {
    expect(
      isResourceRendered(
        F({ 'package/index.vue': '<template><img class="a" :src="bg1" /></template>' }),
        'bg1',
      ),
    ).toBe(false);
    expect(
      isResourceRendered(
        F({ 'package/index.vue': "<script setup>import bg1 from './a.png'</script>" }),
        'bg1',
      ),
    ).toBe(false);
  });

  it('④ 跨文件命中 ⇒ true（子组件里挂了也算已渲染）', () => {
    expect(
      isResourceRendered(
        F({
          'package/index.vue': '<template><div class="a"></div></template>',
          'package/components/HeaderSection.vue':
            '<template><div class="b" :style="{ background: `url(${bg1})` }"></div></template>',
        }),
        'bg1',
      ),
    ).toBe(true);
  });

  it('⑤ 变量名词边界：bg1 不匹配 bg10 / bg12', () => {
    expect(
      isResourceRendered(
        F({
          'package/index.vue':
            '<template><div class="a" :style="{ background: `url(${bg10})` }"></div></template>',
        }),
        'bg1',
      ),
    ).toBe(false);
  });

  it('⑥ 无 varName / 畸形输入 ⇒ false（fail-open：不拦，交回既有路径）', () => {
    expect(isResourceRendered(F({ 'package/index.vue': '<template></template>' }), '')).toBe(false);
    expect(isResourceRendered(null, 'bg1')).toBe(false);
    expect(isResourceRendered({}, 'bg1')).toBe(false);
    expect(isResourceRendered(F({ 'package/index.vue': null }), 'bg1')).toBe(false);
  });

  it('⑦ 非 .vue 文件不参与（less/json 里出现同名变量不算已渲染）', () => {
    expect(
      isResourceRendered(
        F({ 'package/resources/styles/common.less': '.a { background: url(bg1); }' }),
        'bg1',
      ),
    ).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ 锚点 owner 优先级（2026-09-30）：修 96 个 sid 跨文件重复（sameFile 仅 2）
//    典型形态：`package/index.vue` 容器 与 `package/components/ChartSection.vue` 子组件根
//    **同带一个 sid**（后者是「纯搬运」兄弟副本）⇒ 不定义 owner 就是「谁先遍历到就是谁」。
// ═══════════════════════════════════════════════════════════════════════════
describe('锚点 owner 优先级（④ 跨文件重复 sid 的确定性归属）', () => {
  const F = (o) => o;

  it('① rank 表：package/index.vue(0) < 其它 index.vue(1) < 其它(2)', () => {
    expect(anchorOwnerRank('package/index.vue')).toBe(0);
    expect(anchorOwnerRank('package/foo/index.vue')).toBe(1);
    expect(anchorOwnerRank('package/components/A.vue')).toBe(2);
    expect(anchorOwnerRank('package/Index.vue')).toBe(0); // 大小写不敏感 ⇒ 归 rank 0
    expect(anchorOwnerRank('')).toBe(2); // 畸形输入归最低优先
  });

  it('② 同一 sid 跨文件重复 ⇒ 选 package/index.vue（即使子组件先被遍历到）', () => {
    const files = F({
      // 插入序刻意把子组件放前面（旧实现会选它）
      'package/components/ChartSection.vue':
        '<template><div class="c-x-chart-section" data-section-id="2:1289"></div></template>',
      'package/index.vue':
        '<template><div class="c-x-chart-con" data-section-id="2:1289"></div></template>',
    });
    const r = selectAnchorMountCandidate(files, bgMapping({ ownerSectionId: '2:1289' }), {
      varName: 'bg1',
    });
    expect(r && r.skip).toBe(false);
    if (r && !r.skip) {
      expect(r.cand.fpath).toBe('package/index.vue');
      expect(r.cand.cls).toBe('c-x-chart-con');
    }
  });

  it('③ 同文件多命中 ⇒ 取最外层（标签位置最小者）', () => {
    const files = F({
      'package/index.vue':
        '<template><div class="c-x-outer" data-section-id="2:1"><div class="c-x-inner" data-section-id="2:1"></div></div></template>',
    });
    const r = selectAnchorMountCandidate(files, bgMapping({ ownerSectionId: '2:1' }));
    expect(r && !r.skip && r.cand.cls).toBe('c-x-outer');
  });

  it('④ 只有子组件命中时也能选到（owner 规则不要求必须有 index.vue 命中）', () => {
    const files = F({
      'package/components/A.vue':
        '<template><div class="c-x-a" data-section-id="9:9"></div></template>',
    });
    const r = selectAnchorMountCandidate(files, bgMapping({ ownerSectionId: '9:9' }));
    expect(r && !r.skip && r.cand.fpath).toBe('package/components/A.vue');
  });

  it('⑤ 阻断判据与 owner 无关：任一命中元素已带背景 ⇒ 一律 skip（保持首版语义）', () => {
    const files = F({
      'package/index.vue':
        '<template><div class="c-x-clean" data-section-id="3:3"></div></template>',
      'package/components/B.vue':
        '<template><div class="c-x-b" data-section-id="3:3" :style="{ background: bg1 }"></div></template>',
    });
    const r = selectAnchorMountCandidate(files, bgMapping({ ownerSectionId: '3:3' }), {
      varName: 'bg1',
    });
    expect(r && r.skip).toBe(true);
    expect(r.reason).toBe('anchor-already-bg');
  });
});
