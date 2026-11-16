/**
 * 🎯 R-a（2026-11-16 · `mc-max-…-68783bf6` 真机实锤）：**同构段 index 改写失败 ⇒ 空壳**三刀阴阳 spec。
 *
 * ## 真机病灶（必现，非随机）
 * 同构段三兄弟在 index 上各挂段高锚 class `.c-68783b-sech-2/3/4` —— N 是该段在**顶层段序**中的
 * 位置，由 `microcode/code-generator.js:1486` 从 `__sectionGeometries` 派生（`c-${semantic}-sech-${i+1}`）
 * ⇒ **逐成员必然不同**。旧判据 ③b 把「class 逐成员不同」一律当「不可表达」⇒ 整组 fail-open：
 *   - 真机观测：`applied=0 reasons=[ContentSection:attr-diverges:class]`；
 *   - 三个挂载标签全部残留，其中**代表标签不传 `:title`/`:items`** ⇒ props 取默认 `''` / `[]`
 *     ⇒ 渲染成一片空白空壳。
 *
 * ## 本 spec 钉住四件事
 *   A. **段高锚改绑通道**（①）：`<prefix>-sech-<N>` 同前缀 + N 严格递增 ⇒ 类名逐成员进数据字段
 *      `sechCls`、标签改 `:class="isoItem.sechCls"`（逐字保真）；N 非递增 / 前缀不同 / 含动态 class
 *      ⇒ 仍与旧实现逐字同源地 fail-open（`attr-diverges:class`）。
 *   B. **零回归**：整组无 class 时行为逐字不变（不产出 `:class` 绑定）；改绑通道与 `data-section-id`
 *      通道**可共存**（两个 `:xxx` 绑定同时出现）。
 *   C. **fail-open 兜底内联刀**（③）：`inlineRepeatGroupData` 只补「自闭合 + 未绑定 items + 成员确有
 *      items」的标签（真机只命中代表标签），已传 `:items` 的兄弟标签原样不动；用常量引用而非内联
 *      JSON ⇒ 零引号转义风险。
 *   D. **契约 fail-open 条款**（②）：`buildIsoTemplateContractText` 必含第 6 条「items 为空禁止整段
 *      不渲染」，锁死 mc/max 与 vue3/max 唯一契约文本来源。
 */
import {
  rewriteOneRepeatGroup,
  rewriteIndexRepeatGroups,
  inlineRepeatGroupData,
} from '../index-repeat-group-rewrite.js';
import { buildIsoTemplateContractText } from '../iso-template-contract.js';

/** 造一份最小 index.vue：三个相邻兄弟标签 + 一个 script 块（`</script>` 注入点）。 */
function buildIndex(tags: string): string {
  return [
    '<template>',
    '  <div class="page">',
    ...tags.split('\n').map((l) => `    ${l}`),
    '  </div>',
    '</template>',
    '',
    '<script>',
    "import ContentSection from './components/ContentSection.vue'",
    "import ContentSection3 from './components/ContentSection3.vue'",
    "import ContentSection4 from './components/ContentSection4.vue'",
    "export default { name: 'IndexPage' }",
    '</script>',
    '',
  ].join('\n');
}

/** 68783bf6 同构三成员（repName=ContentSection 为**第一个文档序**标签，符合真实产物）。 */
function buildPlan() {
  return {
    repName: 'ContentSection',
    members: [
      { id: '2016:203', title: '优质厂商', items: [{ name: '华为', value: '8' }], compName: 'ContentSection' },
      { id: '2016:204', title: '普通厂商', items: [{ name: '新华三', value: '5' }], compName: 'ContentSection3' },
      { id: '2016:205', title: '战略厂商', items: [{ name: '浪潮', value: '3' }], compName: 'ContentSection4' },
    ],
  };
}

describe('R-a ① 段高锚 class 改绑通道（68783bf6 空壳根治）', () => {
  it('阳性①：sech-N 同前缀且 N 严格递增 ⇒ 改绑 :class + 类名逐字进 sechCls（文档序对齐）', () => {
    const index = buildIndex(
      [
        '<ContentSection class="c-68783b-sech-2" />',
        '<ContentSection3 class="c-68783b-sech-3" />',
        '<ContentSection4 class="c-68783b-sech-4" />',
      ].join('\n'),
    );
    const res = rewriteOneRepeatGroup(index, buildPlan());

    expect(res.ok).toBe(true);
    // 循环标签：一标签 + 一份数据数组
    expect(res.content).toContain('v-for="(isoItem, isoIndex) in ISO_REPEAT_CONTENT_SECTION"');
    // 段高锚改绑通道生效
    expect(res.content).toContain(':class="isoItem.sechCls"');
    // 类名逐字保真进数据字段
    expect(res.content).toContain('sechCls: "c-68783b-sech-2"');
    expect(res.content).toContain('sechCls: "c-68783b-sech-3"');
    expect(res.content).toContain('sechCls: "c-68783b-sech-4"');
    // 逐兄弟标签已合并（文档序 = 段序）
    expect(res.content).not.toContain('<ContentSection3');
    expect(res.content).not.toContain('<ContentSection4');
    // 数据常量按文档序排列 ⇒ sech-2 < sech-3 < sech-4
    const i2 = res.content.indexOf('sechCls: "c-68783b-sech-2"');
    const i3 = res.content.indexOf('sechCls: "c-68783b-sech-3"');
    const i4 = res.content.indexOf('sechCls: "c-68783b-sech-4"');
    expect(i2).toBeGreaterThan(-1);
    expect(i3).toBeGreaterThan(i2);
    expect(i4).toBeGreaterThan(i3);
  });

  it('阳性③：段高锚改绑与 data-section-id 通道共存（两个 :xxx 绑定同时出现）', () => {
    const index = buildIndex(
      [
        '<ContentSection class="c-68783b-sech-2" data-section-id="2016:203" />',
        '<ContentSection3 class="c-68783b-sech-3" data-section-id="2016:204" />',
        '<ContentSection4 class="c-68783b-sech-4" data-section-id="2016:205" />',
      ].join('\n'),
    );
    const res = rewriteOneRepeatGroup(index, buildPlan());

    expect(res.ok).toBe(true);
    expect(res.content).toContain(':class="isoItem.sechCls"');
    expect(res.content).toContain(':data-section-id="isoItem.id"');
    expect(res.content).toContain('sechCls: "c-68783b-sech-2"');
  });

  it('阴性①a：N 非严格递增（sech-3/2/4）⇒ 仍 fail-open attr-diverges:class', () => {
    const index = buildIndex(
      [
        '<ContentSection class="c-68783b-sech-3" />',
        '<ContentSection3 class="c-68783b-sech-2" />',
        '<ContentSection4 class="c-68783b-sech-4" />',
      ].join('\n'),
    );
    const res = rewriteOneRepeatGroup(index, buildPlan());

    expect(res.ok).toBe(false);
    expect(res.reason).toBe('attr-diverges:class');
    expect(res.content).toBe(index); // 原文逐字返回
  });

  it('阴性①b：前缀不同（跨语义组）⇒ 仍 fail-open attr-diverges:class', () => {
    const index = buildIndex(
      [
        '<ContentSection class="c-68783b-sech-2" />',
        '<ContentSection3 class="c-9a8b1c-sech-3" />',
        '<ContentSection4 class="c-68783b-sech-4" />',
      ].join('\n'),
    );
    const res = rewriteOneRepeatGroup(index, buildPlan());

    expect(res.ok).toBe(false);
    expect(res.reason).toBe('attr-diverges:class');
  });

  it('阴性①c：含动态 class（:class）⇒ 不进改绑通道，fail-open attr-diverges:class', () => {
    const index = buildIndex(
      [
        '<ContentSection class="c-68783b-sech-2" />',
        '<ContentSection3 :class="cls3" />',
        '<ContentSection4 class="c-68783b-sech-4" />',
      ].join('\n'),
    );
    const res = rewriteOneRepeatGroup(index, buildPlan());

    expect(res.ok).toBe(false);
    expect(res.reason).toBe('attr-diverges:class');
  });

  it('阴性①d：整组无 class ⇒ 零回归，不产出 :class 绑定（旧形态逐字不变）', () => {
    const index = buildIndex(
      ['<ContentSection />', '<ContentSection3 />', '<ContentSection4 />'].join('\n'),
    );
    const res = rewriteOneRepeatGroup(index, buildPlan());

    expect(res.ok).toBe(true);
    expect(res.content).not.toContain(':class="isoItem.sechCls"');
    expect(res.content).not.toContain('sechCls:');
  });
});

describe('R-a ③ fail-open 兜底内联刀（inlineRepeatGroupData）', () => {
  it('阳性②：代表标签自闭合未绑定 items ⇒ 补 :title/:items + 注入常量；已传 :items 的兄弟不动', () => {
    const index = buildIndex(
      [
        '<ContentSection class="c-68783b-sech-2" />',
        '<ContentSection3 class="c-68783b-sech-3" :items="items3" />',
        '<ContentSection4 class="c-68783b-sech-4" :items="items4" />',
      ].join('\n'),
    );
    const fb = inlineRepeatGroupData(index, buildPlan());

    expect(fb.ok).toBe(true);
    expect(fb.patched).toBe(1); // 仅代表标签命中
    // 常量注入 + 引用绑定（常量索引按标签文档序对齐）
    expect(fb.content).toContain('const ISO_INLINE_CONTENT_SECTION = [');
    expect(fb.content).toContain(':title="ISO_INLINE_CONTENT_SECTION[0].title"');
    expect(fb.content).toContain(':items="ISO_INLINE_CONTENT_SECTION[0].items"');
    // 兄弟标签（idx 1/2）未被引用
    expect(fb.content).not.toContain('ISO_INLINE_CONTENT_SECTION[1]');
    expect(fb.content).not.toContain('ISO_INLINE_CONTENT_SECTION[2]');
    // 成员 title 逐字进常量
    expect(fb.content).toContain('title: "优质厂商"');
    // 已传数据的兄弟标签原样不动
    expect(fb.content).toContain(':items="items3"');
    expect(fb.content).toContain(':items="items4"');
  });

  it('阴性②：三标签都已绑定 items ⇒ 零 patch（返回原文）', () => {
    const index = buildIndex(
      [
        '<ContentSection :items="items1" />',
        '<ContentSection3 :items="items2" />',
        '<ContentSection4 :items="items3" />',
      ].join('\n'),
    );
    const fb = inlineRepeatGroupData(index, buildPlan());

    expect(fb.ok).toBe(true);
    expect(fb.patched).toBe(0);
    expect(fb.content).toBe(index);
  });

  it('阴性②b：成对标签（含子内容）不被补属性（避免插错位置）', () => {
    const index = buildIndex(
      [
        '<ContentSection class="c-68783b-sech-2">',
        '  <span>占位</span>',
        '</ContentSection>',
        '<ContentSection3 class="c-68783b-sech-3" />',
        '<ContentSection4 class="c-68783b-sech-4" />',
      ].join('\n'),
    );
    const fb = inlineRepeatGroupData(index, buildPlan());

    expect(fb.ok).toBe(true);
    // 代表标签是成对形态 ⇒ 不补；两个兄弟自闭合 ⇒ 各补 1
    expect(fb.patched).toBe(2);
    expect(fb.content).not.toContain('ISO_INLINE_CONTENT_SECTION[0]');
    expect(fb.content).toContain(':items="ISO_INLINE_CONTENT_SECTION[1].items"');
    expect(fb.content).toContain(':items="ISO_INLINE_CONTENT_SECTION[2].items"');
  });

  it('改写失败时批量入口回落兜底内联（rewriteIndexRepeatGroups.inlined 记账）', () => {
    // 前缀不同 ⇒ ① fail-open；但代表标签未绑定 items ⇒ ③ 兜底出手
    const index = buildIndex(
      [
        '<ContentSection class="c-68783b-sech-2" />',
        '<ContentSection3 class="c-9a8b1c-sech-3" />',
        '<ContentSection4 class="c-68783b-sech-4" />',
      ].join('\n'),
    );
    const out = rewriteIndexRepeatGroups(index, [buildPlan()]);

    expect(out.applied).toHaveLength(0);
    expect(out.skipped).toHaveLength(1);
    expect(out.skipped[0].reason).toBe('attr-diverges:class');
    expect(out.inlined).toHaveLength(1);
    // 本 fixture 三标签均为自闭合且都未绑定 items ⇒ 三处全部补数据（各得其所）
    expect(out.inlined[0].patched).toBe(3);
    expect(out.inlined[0].reason).toBe('attr-diverges:class');
    // 兜底不删文件、不改 import（覆盖门禁按「每段一文件」记账逐字不变）
    expect(out.content).toContain("import ContentSection3 from './components/ContentSection3.vue'");
    expect(out.content).toContain("import ContentSection4 from './components/ContentSection4.vue'");
    // 常量索引按标签文档序逐个对齐
    expect(out.content).toContain(':items="ISO_INLINE_CONTENT_SECTION[0].items"');
    expect(out.content).toContain(':items="ISO_INLINE_CONTENT_SECTION[1].items"');
    expect(out.content).toContain(':items="ISO_INLINE_CONTENT_SECTION[2].items"');
  });
});

describe('R-a ② 契约 fail-open 条款（buildIsoTemplateContractText）', () => {
  it('阳性②：契约文本必含第 6 条 fail-open 兜底条款', () => {
    const text = buildIsoTemplateContractText({ groupSize: 3 }, 'ContentSection.vue');

    expect(text).toContain('6. **fail-open 兜底**');
    expect(text).toContain('不保证');
    expect(text).toContain('禁止整段不渲染');
    expect(text).toContain('v-else');
  });

  it('阴性②：无同构组（groupSize 空）⇒ 返回空串（不注入噪声契约）', () => {
    expect(buildIsoTemplateContractText({}, 'X.vue')).toBe('');
    expect(buildIsoTemplateContractText(null as any)).toBe('');
  });
});
