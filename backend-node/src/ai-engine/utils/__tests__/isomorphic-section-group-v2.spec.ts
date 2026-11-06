/**
 * 🧬 刀66 v2（2026-11-06）：同构段收敛判据兼容真机落点 + index 段级 v-for 改写。
 *
 * ## 本 spec 的存在理由（防假绿）
 * 刀66 v1 上线后真机 `groups=0`（mc-max-1793913218521-5d1eb324 日志实证），原因是判据
 * 只认 `body.children + role∈{label,tag} + header.styles 必填`，而真机三厂商段是
 * `body.items + role=stat-card + header 无 styles`。**v1 没有任何 fixture 覆盖该形态**，
 * 于是「同构收敛已实现」与「同构收敛从未命中」在测试上不可区分。
 * 本 spec 的第 1 组用例逐字取自该任务真值（6/12/15 条、grid/4、无 header.styles）。
 */
import {
  assessIsoEligibility,
  collectIsomorphicSectionGroups,
  normalizeSectionLayout,
  validateIsoTemplateProps,
} from '../isomorphic-section-group.js';
import {
  findComponentTagSpans,
  pruneRepeatMemberArtifacts,
  rewriteIndexRepeatGroups,
  rewriteOneRepeatGroup,
} from '../index-repeat-group-rewrite.js';

/** 真机 38:3137/3162/3206 形态：header 只有 title+controls，条目在 body.items(role=stat-card)。 */
const vendorSection = (id, title, names) => ({
  id,
  type: null,
  title,
  header: { title, controls: [] },
  body: {
    layout: 'grid',
    gridColumns: 4,
    bgPlaceholder: 'body-bg',
    items: names.map((n, i) => ({
      id: `${id}-item${i + 1}`,
      name: n,
      role: 'stat-card',
      value: `${i}台`,
      repeatedFill: '#ffffff',
    })),
  },
});

const VENDORS = [
  vendorSection('38:3137', '战略合作厂商', ['华为技术', '中兴通讯', '海康威视', '新华三集团', '浪潮信息', '天地伟业']),
  vendorSection('38:3162', '优质厂商', ['大华股份', '西门子', 'ABB中国', '深信服科技', '启明星辰', '安恒信息', '宇视科技', '施耐德电气', '中科曙光', '奇安信集团', '绿盟科技', '天融信']),
  vendorSection('38:3206', '普通厂商', ['特来电', '汉威科技', '锐捷网络', '东土科技', '厦门计讯', '有人物联网', '才茂通信', '鲁邦通', '金溢科技', '烽火通信', '迈普通信', '映翰通网络', '宏电科技', '四信通信', '安可信']),
];

/** 真机 38:3260 顶部统计卡（type=stats，坐标轴两列）——必须被排除。 */
const STATS_SEC = {
  id: '38:3260',
  type: 'stats',
  title: '顶部统计卡片',
  body: { layout: 'horizontal-2-columns', gridColumns: 2, children: [{ id: 'a', role: 'stat-card', name: '合作厂商' }] },
};

describe('刀66 v2 assessIsoEligibility —— 兼容真机落点', () => {
  it('⭐ 阳性：header 无 styles + body.items + role=stat-card ⇒ eligible', () => {
    expect(assessIsoEligibility(VENDORS[0])).toEqual({ eligible: true, reason: 'ok' });
  });

  it('⭐ 阳性：v1 形态（children + label + header.styles）仍 eligible（零回归）', () => {
    const legacy = {
      id: '38:1',
      type: null,
      header: { title: '厂商', styles: { fontSize: 14 }, controls: [] },
      body: {
        layout: 'grid',
        gridColumns: 4,
        children: [
          { role: 'label', name: '甲', styles: { fontSize: 12 } },
          { role: 'tag', name: '乙', styles: { fontSize: 12 } },
        ],
      },
    };
    expect(assessIsoEligibility(legacy)).toEqual({ eligible: true, reason: 'ok' });
  });

  it('反向：type=stats 特化段一票否决（顶部统计卡不得被并进厂商组）', () => {
    const r = assessIsoEligibility(STATS_SEC);
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('type:stats');
  });

  it('反向：无 header.title ⇒ no-header-title', () => {
    const r = assessIsoEligibility({ ...VENDORS[0], header: { controls: [] } });
    expect(r).toEqual({ eligible: false, reason: 'no-header-title' });
  });

  it('反向：条目带媒体字段 ⇒ entry-media（不收敛图文混排段）', () => {
    const sec = vendorSection('38:9', '图文', ['甲']);
    sec.body.items[0].icon = { resourceFile: 'a.png' };
    expect(assessIsoEligibility(sec)).toEqual({ eligible: false, reason: 'entry-media' });
  });

  it('反向：条目 role 命中结构禁忌（chart/容器）⇒ 拒绝', () => {
    const sec = vendorSection('38:9', '角色', ['甲']);
    sec.body.items[0].role = 'chart';
    expect(assessIsoEligibility(sec)).toEqual({ eligible: false, reason: 'entry-role-denied:chart' });
  });

  it('⭐ v3（245878e6 实锤）：条目 role 是**新措辞** `vendor-item` ⇒ 仍放行（黑名单不穷举措辞）', () => {
    const sec = vendorSection('38:9', '措辞', ['甲']);
    sec.body.items[0].role = 'vendor-item';
    expect(assessIsoEligibility(sec)).toEqual({ eligible: true, reason: 'ok' });
  });
});

describe('刀66 v2 collectIsomorphicSectionGroups —— 真机三厂商段成组', () => {
  const res = collectIsomorphicSectionGroups([STATS_SEC, ...VENDORS]);

  it('⭐ 阳性：evaluated=4 且恰好 1 组，成员=三个厂商段（6/12/15 条不影响同构）', () => {
    expect(res.evaluated).toBe(4);
    expect(res.groups).toHaveLength(1);
    expect(res.groups[0].sectionIds).toEqual(['38:3137', '38:3162', '38:3206']);
    expect(res.groups[0].representativeId).toBe('38:3137');
  });

  it('⭐ 阳性：成员数据带 title + items{name,value} 真值（单模板参数化的输入面）', () => {
    const m = res.groups[0].members;
    expect(m[0].title).toBe('战略合作厂商');
    expect(m[0].items).toHaveLength(6);
    expect(m[0].items[0]).toEqual({ name: '华为技术', value: '0台' });
    expect(m[1].items).toHaveLength(12);
    expect(m[2].items).toHaveLength(15);
  });

  it('反向：只剩一个厂商段时不成立（≥2 才有收敛价值）', () => {
    const one = collectIsomorphicSectionGroups([STATS_SEC, VENDORS[0]]);
    expect(one.groups).toHaveLength(0);
  });
});

describe('刀66-C index 段级 v-for 改写', () => {
  /** 真机 index.vue 模板段（四个标签相邻，flex 各不同）。 */
  const REAL_INDEX = `<template>
  <base-panel panelKey="default-panel">
    <div class="c-5d1eb3-slot-con" style="display:flex; flex-direction:column; height:100%; min-height:0">
      <StatsSection style="flex: 0.426 1 0;min-height:0;" />
      <ContentSection style="flex: 0.902 1 0;min-height:0;margin-top:33px;" />
      <ContentSection3 style="flex: 1.188 1 0;min-height:0;margin-top:20px;" />
      <ContentSection4 style="flex: 1.485 1 0;min-height:0;margin-top:20px;" />
    </div>
  </base-panel>
</template>

<script setup>
import StatsSection from './components/StatsSection.vue'
import ContentSection from './components/ContentSection.vue'
import ContentSection3 from './components/ContentSection3.vue'
import ContentSection4 from './components/ContentSection4.vue'
</script>
`;

  const PLAN = {
    repName: 'ContentSection',
    members: [
      { id: '38:3137', compName: 'ContentSection', title: '战略合作厂商', icon: '', items: [{ name: '华为技术', value: '8台' }] },
      { id: '38:3162', compName: 'ContentSection3', title: '优质厂商', icon: '', items: [{ name: '大华股份', value: '8台' }] },
      { id: '38:3206', compName: 'ContentSection4', title: '普通厂商', icon: '', items: [{ name: '特来电', value: '8台' }] },
    ],
  };

  it('⭐ 阳性：三个重复标签收成一个 v-for + 数据数组（flex/margin-top 逐项保留）', () => {
    const r = rewriteOneRepeatGroup(REAL_INDEX, PLAN);
    expect(r.ok).toBe(true);
    expect(r.removedTags).toBe(2);
    // 只剩一个代表标签，且带 v-for
    expect(findComponentTagSpans(r.content, 'ContentSection')).toHaveLength(1);
    expect(findComponentTagSpans(r.content, 'ContentSection3')).toHaveLength(0);
    expect(findComponentTagSpans(r.content, 'ContentSection4')).toHaveLength(0);
    expect(r.content).toContain('v-for="(isoItem, isoIndex) in ISO_REPEAT_CONTENT_SECTION"');
    // 布局比例逐项保留（不能被循环抹平成同一个 style）
    expect(r.content).toContain('flex: 0.902 1 0;min-height:0;margin-top:33px;');
    expect(r.content).toContain('flex: 1.188 1 0;min-height:0;margin-top:20px;');
    expect(r.content).toContain('flex: 1.485 1 0;min-height:0;margin-top:20px;');
    // 数据数组三成员、标题真值在
    expect(r.content).toContain('const ISO_REPEAT_CONTENT_SECTION = [');
    for (const t of ['战略合作厂商', '优质厂商', '普通厂商']) expect(r.content).toContain(t);
    // 数据段落在 script 内
    const scriptClose = r.content.lastIndexOf('</script>');
    expect(r.content.indexOf('const ISO_REPEAT_CONTENT_SECTION')).toBeLessThan(scriptClose);
  });

  it('反向：标签之间夹了别的元素（非相邻兄弟）⇒ 不改写，避免结构塌陷', () => {
    const broken = REAL_INDEX.replace(
      '      <ContentSection3',
      '      <div class="banner"></div>\n      <ContentSection3',
    );
    const r = rewriteOneRepeatGroup(broken, PLAN);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('not-adjacent');
  });

  it('反向：某成员标签缺失或重复 ⇒ tag-count 拒绝，不猜', () => {
    const missing = REAL_INDEX.replace(/\s*<ContentSection4[^>]*\/>/, '');
    expect(rewriteOneRepeatGroup(missing, PLAN).reason).toContain('tag-count:ContentSection4=0');
  });

  it('反向：没有 script 块 ⇒ no-script-block（不产出半成品）', () => {
    const noScript = REAL_INDEX.slice(0, REAL_INDEX.indexOf('<script setup>'));
    expect(rewriteOneRepeatGroup(noScript, PLAN)).toMatchObject({ ok: false, reason: 'no-script-block' });
  });

  it('批量接口：失败组进 skipped，其余组照常生效（互不影响）', () => {
    const res = rewriteIndexRepeatGroups(REAL_INDEX, [PLAN, { repName: 'Nope', members: [{ id: 'x' }, { id: 'y' }] }]);
    expect(res.applied).toHaveLength(1);
    expect(res.skipped).toHaveLength(1);
    expect(res.content).toContain('ISO_REPEAT_CONTENT_SECTION');
  });

  // ── 🛡️ 2026-11-06 评审修正（P0）：属性守恒 ────────────────────────────────
  //  旧实现只保留 `style`，`class` / `data-section-id` / `v-if` / `ref` 在改写时被静默丢弃。
  //  `data-section-id` 是资源挂载锚 + 评分选择器（25+ 消费点），丢它比样式错更严重。
  it('⭐ 属性守恒：各成员**逐字相同**的 class / v-if 原样下发一次', () => {
    const withAttrs = REAL_INDEX
      .replace('<ContentSection style=', '<ContentSection class="c-vendor" v-if="ready" style=')
      .replace('<ContentSection3 style=', '<ContentSection3 class="c-vendor" v-if="ready" style=')
      .replace('<ContentSection4 style=', '<ContentSection4 class="c-vendor" v-if="ready" style=');
    const r = rewriteOneRepeatGroup(withAttrs, PLAN);
    expect(r.ok).toBe(true);
    expect(r.content).toContain('class="c-vendor"');
    expect(r.content).toContain('v-if="ready"');
    // 只下一份（不是每个成员一份）
    expect((r.content.match(/class="c-vendor"/g) || []).length).toBe(1);
  });

  it('⭐ 属性守恒：data-section-id 逐成员不同且等于成员 id ⇒ 改绑数据字段', () => {
    const withIds = REAL_INDEX
      .replace('<ContentSection style=', '<ContentSection data-section-id="38:3137" style=')
      .replace('<ContentSection3 style=', '<ContentSection3 data-section-id="38:3162" style=')
      .replace('<ContentSection4 style=', '<ContentSection4 data-section-id="38:3206" style=');
    const r = rewriteOneRepeatGroup(withIds, PLAN);
    expect(r.ok).toBe(true);
    expect(r.content).toContain(':data-section-id="isoItem.id"');
    // 三个写死的 id 不得残留在循环标签上（数据数组里仍逐项保留，供覆盖门禁识别）
    expect(r.content).not.toContain('<ContentSection data-section-id="38:3137"');
    // 数据数组里逐项保留 id（JSON.stringify 口径 = 双引号），供覆盖门禁识别已物化
    expect(r.content).toContain('id: "38:3162"');
  });

  it('反向：属性逐成员不同且无法用数据字段表达 ⇒ 整组不改写（不猜）', () => {
    const divergent = REAL_INDEX
      .replace('<ContentSection style=', '<ContentSection ref="repA" style=')
      .replace('<ContentSection3 style=', '<ContentSection3 ref="repB" style=')
      .replace('<ContentSection4 style=', '<ContentSection4 ref="repC" style=');
    const r = rewriteOneRepeatGroup(divergent, PLAN);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('attr-diverges:ref');
  });
});

// ── 🧬 刀66-C 收尾（2026-11-06 评审修正 · P1）：包装文件与 import 原子清理 ──────
describe('刀66-C 收尾：pruneRepeatMemberArtifacts', () => {
  const WRAPPER = (name: string, repName: string) => `<template>
  <${repName} :title="'x'" :items="[]" data-section-id="1:1" v-bind="$attrs" />
</template>
<script setup>
import ${repName} from './${repName}.vue'
</script>
`;

  const makeFiles = () => ({
    'package/index.vue': `<template>
  <div>
    <ContentSection v-for="(isoItem, isoIndex) in ISO_REPEAT_CONTENT_SECTION" :key="isoItem.id" :title="isoItem.title" :items="isoItem.items" :style="isoItem.style" />
  </div>
</template>
<script setup>
import ContentSection from './components/ContentSection.vue'
import ContentSection3 from './components/ContentSection3.vue'
import ContentSection4 from './components/ContentSection4.vue'
const ISO_REPEAT_CONTENT_SECTION = [
  { id: '38:3137', title: '战略合作厂商', icon: '', items: [], style: 'flex: 0.902 1 0;' },
  { id: '38:3162', title: '优质厂商', icon: '', items: [], style: 'flex: 1.188 1 0;' },
  { id: '38:3206', title: '普通厂商', icon: '', items: [], style: 'flex: 1.485 1 0;' }
]
</script>`,
    'package/components/ContentSection.vue': '<template><div>rep</div></template>',
    'package/components/ContentSection3.vue': WRAPPER('ContentSection3', 'ContentSection'),
    'package/components/ContentSection4.vue': WRAPPER('ContentSection4', 'ContentSection'),
  });

  const APPLIED = [{
    repName: 'ContentSection',
    members: ['38:3137', '38:3162', '38:3206'],
    removedTags: 2,
    memberPlans: [
      { id: '38:3137', compName: 'ContentSection' },
      { id: '38:3162', compName: 'ContentSection3' },
      { id: '38:3206', compName: 'ContentSection4' },
    ],
  }];

  it('⭐ 阳性：兄弟薄包装文件与 import 一并删除（模板已无其标签）', () => {
    const files: any = makeFiles();
    const r = pruneRepeatMemberArtifacts(files['package/index.vue'], APPLIED, files);
    expect(r.removedFiles.sort()).toEqual([
      'package/components/ContentSection3.vue',
      'package/components/ContentSection4.vue',
    ]);
    expect(r.removedImports.sort()).toEqual(['ContentSection3', 'ContentSection4']);
    expect(files['package/components/ContentSection3.vue']).toBeUndefined();
    expect(files['package/components/ContentSection4.vue']).toBeUndefined();
    // 代表模板与数据数组不动（清理只返回新 index 文本，写回由调用方做）
    expect(files['package/components/ContentSection.vue']).toBeDefined();
    expect(r.content).toContain('ISO_REPEAT_CONTENT_SECTION');
    expect(r.content).toContain("import ContentSection from './components/ContentSection.vue'");
    expect(r.content).not.toContain('ContentSection3');
  });

  it('反向：模板里仍在用该组件 ⇒ 不删（复用处不得动）', () => {
    const files: any = makeFiles();
    files['package/index.vue'] = files['package/index.vue'].replace(
      '</div>\n</template>',
      '  <ContentSection3 style="flex:1" />\n  </div>\n</template>',
    );
    const r = pruneRepeatMemberArtifacts(files['package/index.vue'], APPLIED, files);
    expect(r.removedFiles).toEqual(['package/components/ContentSection4.vue']);
    expect(files['package/components/ContentSection3.vue']).toBeDefined();
    expect(r.kept).toContain('ContentSection3:tag-still-used');
  });

  it('反向：文件不是本刀产出的薄包装（无 $attrs 或未 import 代表模板）⇒ 不删', () => {
    const files: any = makeFiles();
    files['package/components/ContentSection3.vue'] = '<template><div>LLM 自己写的完整实现</div></template>';
    const r = pruneRepeatMemberArtifacts(files['package/index.vue'], APPLIED, files);
    expect(r.removedFiles).toEqual(['package/components/ContentSection4.vue']);
    expect(files['package/components/ContentSection3.vue']).toBeDefined();
    expect(r.kept).toContain('ContentSection3:not-thin-wrapper');
  });
});

describe('刀66 v2 代表模板契约校验（items 为对象数组）', () => {
  const good = `<template>
  <div v-bind="$attrs">
    <div v-for="(it, i) in items" :key="i">{{ it.name }}<span v-if="it.value">{{ it.value }}</span></div>
  </div>
</template>
<script setup>
const props = defineProps({ title: String, items: Array })
</script>`;

  it('⭐ 阳性：props 齐 + items v-for + 读字段 + $attrs 透传 ⇒ ok', () => {
    expect(validateIsoTemplateProps(good)).toEqual({ ok: true, reasons: [] });
  });

  it('反向：把对象条目当字符串渲染（不读 .name）⇒ items-field-unconsumed', () => {
    const bad = good.replace('{{ it.name }}', '{{ it }}');
    expect(validateIsoTemplateProps(bad).reasons).toContain('items-field-unconsumed');
  });

  it('反向（245878e6「华为技术8台」实锤）：名称与数值连排 ⇒ name-value-concat', () => {
    const concat = good.replace('{{ it.name }}', '{{ it.name }}{{ it.value }}');
    expect(validateIsoTemplateProps(concat).reasons).toContain('name-value-concat');
  });

  it('阴性：名称与数值在**不同元素**里（中间有标签）⇒ 不算连排', () => {
    const ok = good.replace('{{ it.name }}', '{{ it.name }}<span class="v">{{ it.value }}</span>');
    expect(validateIsoTemplateProps(ok).reasons).not.toContain('name-value-concat');
  });
});

/**
 * 🧬 刀66 v3（2026-11-06 · mc-max-1793918427218-245878e6 第三次形态实锤）
 *
 * 真机该单三段结构**完全一致**（同 keys / 同 styles / 同 layout），却仍然 `groups=0`：
 *  - `body.layout = "horizontal-4-columns"`（不是 `grid`）⇒ 旧 `body-layout:` 拒绝；
 *  - `body.gridColumns` **不存在**（列数在 layout 词里）⇒ 旧 `no-grid-columns` 拒绝；
 *  - 条目 role = `vendor-item`（第三种措辞）⇒ 旧白名单 `entry-role:` 拒绝；
 *  - 更隐蔽：`horizontal-4-columns` 里的 `column` 是**列数**不是 flex 方向 ——
 *    方向判定若先判 `column` 子串，三段会被误判纵排（本刀初版就踩了这个）。
 *
 * 结论：判据不能穷举 vision 措辞，只认结构。本组用例取自该单真值。
 */
describe('刀66 v3 normalizeSectionLayout —— 方向/列数归一（不押措辞）', () => {
  it('⭐ `horizontal-4-columns`（无 gridColumns）⇒ row + 4 列（column 是列数，不是纵排）', () => {
    expect(normalizeSectionLayout({ layout: 'horizontal-4-columns' })).toMatchObject({
      direction: 'row',
      columns: 4,
    });
  });

  it('⭐ 只有 `4-columns`（无 horizontal）⇒ 仍判 row + 4 列（多列即横排网格）', () => {
    expect(normalizeSectionLayout({ layout: '4-columns' })).toMatchObject({ direction: 'row', columns: 4 });
  });

  it('⭐ `grid` + gridColumns ⇒ row + 显式列数（真机 269cb2cf 形态，零回归）', () => {
    expect(normalizeSectionLayout({ layout: 'grid', gridColumns: 4 })).toMatchObject({
      direction: 'row',
      columns: 4,
    });
  });

  it('⭐ `vertical` ⇒ column（纵向列归刀53 list 域，本刀不收敛）', () => {
    expect(normalizeSectionLayout({ layout: 'vertical' })).toMatchObject({ direction: 'column' });
  });

  it('反向：无 layout 且无列数 ⇒ 方向空（不可判定，不猜）', () => {
    expect(normalizeSectionLayout({})).toMatchObject({ direction: '', columns: null });
  });
});

describe('刀66 v3 真机三段（245878e6）⇒ groups=1', () => {
  /** 真值：header 有 styles、body.layout=horizontal-4-columns、无 gridColumns、role=vendor-item */
  const realSection = (id: string, title: string, names: string[]) => ({
    id,
    title,
    header: { title, controls: [], styles: { fontSize: 13, color: '#333333' } },
    body: {
      layout: 'horizontal-4-columns',
      bgPlaceholder: 'body-bg',
      children: names.map((n, i) => ({
        id: `${id}-c${i + 1}`,
        name: n,
        text: n,
        value: `${i}台`,
        role: 'vendor-item',
        repeatedFill: '#ffffff',
        styles: { fontSize: 13, color: '#333333' },
      })),
    },
  });
  const STATS = {
    id: '38:3260',
    type: 'stats',
    title: '顶部统计卡片区',
    body: { layout: 'horizontal-2-items', gridColumns: 2, items: [{ role: 'stat-card', name: '合作厂商' }] },
  };
  const SECS = [
    STATS,
    realSection('38:3137', '战略合作厂商', ['华为技术', '中兴通讯']),
    realSection('38:3162', '优质厂商', ['大华股份', '西门子']),
    realSection('38:3206', '普通厂商', ['特来电', '汉威科技']),
  ];

  it('⭐ 阳性：三段结构一致（措辞不同也一样）⇒ 恰好 1 组、代表为首段、columns=4', () => {
    const res = collectIsomorphicSectionGroups(SECS);
    expect(res.evaluated).toBe(4);
    expect(res.groups).toHaveLength(1);
    expect(res.groups[0].sectionIds).toEqual(['38:3137', '38:3162', '38:3206']);
    expect(res.groups[0].representativeId).toBe('38:3137');
    expect(res.groups[0]).toMatchObject({ direction: 'row', columns: 4 });
  });

  it('⭐ 阳性：成员条目仍统一为 {name,value}（列数/台数随 items 走）', () => {
    const g = collectIsomorphicSectionGroups(SECS).groups[0];
    expect(g.members[0].items[0]).toEqual({ name: '华为技术', value: '0台' });
  });

  it('反向：type=stats 特化段仍被排除（不与厂商段并组）', () => {
    expect(assessIsoEligibility(STATS)).toEqual({ eligible: false, reason: 'type:stats' });
  });
});
