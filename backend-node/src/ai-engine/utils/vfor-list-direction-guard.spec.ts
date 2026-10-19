/**
 * 🛡️ T3 · `v-for` 列表方向守卫（2026-10-19 建立 · mc-max-1792373861220-5160a2ec 实锤）
 *
 * 事故：设计「6 卡纵向列表 + 卡内横排」，产物却是「6 卡横向溢出 + 卡内竖排」。
 *   布局分析四层**全对**（E1 / 折叠段 vertical / 卡模板 horizontal / 几何事实），
 *   但产物把 wrapper 与 item 的 class **贴反一级** ⇒ 两个方向整体互换。
 *   **既有 LAYOUT-001 实测 `judged:5 / mismatches:0` 零命中**——它只比
 *   「section 自身 layout vs 宿主根元素方向」，判据域 ≠ 事实落点。
 *
 * 本 spec 锁：
 *   ① 阳性对照：wrapper/item 互换必命中 2 条；
 *   ② 阴性对照：方向正确 / 集合段 / wrapper 非根 / 无折叠父 ⇒ **不误报**；
 *   ③ 自愈：确定性翻转后复检归零、幂等。
 */
import {
  detectVForListDirectionMismatch,
  healVForListDirection,
  findVForPairs,
  isCollapsedListSection,
  findSectionWithParent,
} from './vfor-list-direction-guard.js';

const P = 'c-x';

/** 折叠列表 section 树：`list-1` 折叠段（vertical）下挂原型 `card-1`（horizontal） */
const sectionsWithList = () => [
  {
    id: 'cards-list',
    type: 'container',
    layout: 'vertical',
    collapsed: true,
    children: [{ id: 'card-1', layout: 'horizontal' }],
  },
];

const vue = (rootCls: string, itemCls: string, secId = 'card-1') => `<template>
  <div data-section-id="${secId}" class="${rootCls}">
    <div v-for="(item, index) in list" :key="index" class="${itemCls}">
      <span class="${itemCls}-t">{{ item.name }}</span>
    </div>
  </div>
</template>
<script setup>
const list = [1, 2, 3]
</script>`;

const less = (map: Record<string, string>) =>
  Object.entries(map)
    .map(([cls, dir]) => `.${cls} { display: flex; flex-direction: ${dir}; }`)
    .join('\n');

describe('T3 · v-for 列表方向守卫（阳性对照：5160a2ec wrapper/item 互换）', () => {
  it('🔴 阳性对照：wrapper=row / item=column，真值是 column/row ⇒ 命中 2 条', () => {
    const files = [
      { path: 'package/components/ContentSection.vue', content: vue(`${P}-wrapper`, `${P}-card`) },
      { path: 'resources/styles/common.less', content: less({ [`${P}-wrapper`]: 'row', [`${P}-card`]: 'column' }) },
    ];
    const r = detectVForListDirectionMismatch(files, { layout: { sections: sectionsWithList() } });
    expect(r.issues.length).toBe(2);
    expect(r.stats.mismatches).toBe(2);
    const roles = r.issues.map((i: any) => i.hint.role).sort();
    expect(roles).toEqual(['item', 'wrapper']);
    const wrapper = r.issues.find((i: any) => i.hint.role === 'wrapper');
    const item = r.issues.find((i: any) => i.hint.role === 'item');
    expect(wrapper.hint).toMatchObject({ expected: 'column', actual: 'row', className: `${P}-wrapper` });
    expect(item.hint).toMatchObject({ expected: 'row', actual: 'column', className: `${P}-card` });
  });

  it('自愈：确定性翻转两个 class 的 flex-direction，复检归零', () => {
    const files = [
      { path: 'package/components/ContentSection.vue', content: vue(`${P}-wrapper`, `${P}-card`) },
      { path: 'resources/styles/common.less', content: less({ [`${P}-wrapper`]: 'row', [`${P}-card`]: 'column' }) },
    ];
    const structure = { layout: { sections: sectionsWithList() } };
    const r1 = detectVForListDirectionMismatch(files, structure);
    const h = healVForListDirection(files, r1.issues);
    expect(h.failed).toEqual([]);
    expect(h.healed.length).toBe(2);
    const healedLess = h.files.find((f: any) => f.path.endsWith('common.less')).content;
    expect(healedLess).toContain(`.${P}-wrapper { display: flex; flex-direction: column; }`);
    expect(healedLess).toContain(`.${P}-card { display: flex; flex-direction: row; }`);
    // 复检归零 + 幂等
    const r2 = detectVForListDirectionMismatch(h.files, structure);
    expect(r2.issues.length).toBe(0);
    const h2 = healVForListDirection(h.files, r2.issues);
    expect(h2.healed.length).toBe(0);
  });
});

describe('T3 · 阴性对照（不得误报）', () => {
  const structure = { layout: { sections: sectionsWithList() } };

  it('方向本来就对 ⇒ 0 issue（judged 正常计数）', () => {
    const files = [
      { path: 'package/components/ContentSection.vue', content: vue(`${P}-wrapper`, `${P}-card`) },
      { path: 'common.less', content: less({ [`${P}-wrapper`]: 'column', [`${P}-card`]: 'row' }) },
    ];
    const r = detectVForListDirectionMismatch(files, structure);
    expect(r.issues.length).toBe(0);
    expect(r.stats.judged).toBe(2);
  });

  it('根带**折叠段** id：段 layout=纵向 ⇒ 判为 wrapper 期望，不得当成 item 期望', () => {
    // c-vehicle-monitor-c6e8e295 实锤：卡内本就是 icon 上/文字下的 column，产物正确
    const files = [
      { path: 'ListSection.vue', content: vue(`${P}-list`, `${P}-card-item`, 'cards-list') },
      { path: 'common.less', content: less({ [`${P}-list`]: 'column', [`${P}-card-item`]: 'column' }) },
    ];
    const r = detectVForListDirectionMismatch(files, structure);
    // wrapper=column 符合真值；item 期望来自子段 card-1(horizontal)，实际 column ⇒ 仍会命中 item
    const roles = r.issues.map((i: any) => i.hint.role);
    expect(roles).not.toContain('wrapper');
  });

  it('段是「集合」本身（v-for 直接挂在段下、无折叠父）⇒ item 不判，只判 wrapper', () => {
    // c-component-2/3 StatsLeft 实锤：单项内部 icon+文字横排（row）本就正确
    const sections = [{ id: 'stats-1', layout: 'vertical' }];
    const files = [
      { path: 'StatsLeft.vue', content: vue(`${P}-stat-list`, `${P}-stat-item`, 'stats-1') },
      { path: 'common.less', content: less({ [`${P}-stat-list`]: 'column', [`${P}-stat-item`]: 'row' }) },
    ];
    const r = detectVForListDirectionMismatch(files, { layout: { sections } });
    expect(r.issues.length).toBe(0);
    expect(r.stats.skippedItemNotPrototype).toBe(1);
  });

  it('v-for 的 wrapper 只是段内**子容器**（非根）⇒ 交 LAYOUT-001，本守卫不判', () => {
    // c-vehicle-monitor-tabs 实锤：tabs 子容器在 header 段内，段 layout 不是它的真值
    const content = `<template>
  <div data-section-id="header-1" class="${P}-header">
    <div class="${P}-tabs" data-section-id="2:7954">
      <div v-for="t in tabs" :key="t" class="${P}-tab-item">{{ t }}</div>
    </div>
  </div>
</template>`;
    const sections = [
      {
        id: 'header-1',
        layout: 'horizontal',
        children: [{ id: '2:7954', layout: 'vertical' }],
      },
    ];
    const files = [
      { path: 'HeaderSection.vue', content },
      { path: 'common.less', content: less({ [`${P}-tabs`]: 'row' }) },
    ];
    const r = detectVForListDirectionMismatch(files, { layout: { sections } });
    expect(r.issues.length).toBe(0);
    expect(r.stats.skippedWrapperNotHost).toBe(1);
  });

  it('无 v-for / 无 section 真值 / 输入为空 ⇒ fail-open（0 issue）', () => {
    expect(
      detectVForListDirectionMismatch([{ path: 'a.vue', content: '<template><div class="x"/></template>' }], {
        layout: { sections: sectionsWithList() },
      }).issues.length,
    ).toBe(0);
    expect(detectVForListDirectionMismatch([], { layout: { sections: sectionsWithList() } }).issues.length).toBe(0);
    expect(detectVForListDirectionMismatch([{ path: 'a.vue', content: vue('a', 'b') }], {}).issues.length).toBe(0);
  });
});

describe('T4 · 多份同名规则聚合 + 全出现点自愈（2026-10-19 · 17750e31 实锤）', () => {
  const structure = { layout: { sections: sectionsWithList() } };

  /** 带 SFC scoped 样式的形态：wrapper/item 规则同时落在 <style> 与 common.less */
  const vueWithStyle = (rootCls: string, rootDir: string, itemCls: string, itemBlock: string) => `<template>
  <div data-section-id="card-1" class="${rootCls}">
    <div v-for="(item, index) in list" :key="index" class="${itemCls}"><span>{{ item.name }}</span></div>
  </div>
</template>
<script setup>
const list = [1, 2, 3]
</script>
<style scoped>
.${rootCls} { display: flex; flex-direction: ${rootDir}; width: 100%; }
.${itemCls} { ${itemBlock} }
</style>`;

  it('① SFC + common.less 同名 wrapper 规则同错（row/row，真值 column）⇒ 检出 + 两处全翻转 + 复检归零 + 幂等', () => {
    const files = [
      { path: 'package/components/ContentSection.vue', content: vueWithStyle(`${P}-wrap`, 'row', `${P}-card`, 'flex: 1;') },
      { path: 'resources/styles/common.less', content: less({ [`${P}-wrap`]: 'row' }) },
    ];
    const r = detectVForListDirectionMismatch(files, structure);
    expect(r.issues.map((i: any) => i.id)).toContain('VFOR-DIR-WRAPPER');
    const h = healVForListDirection(files, r.issues);
    expect(h.failed).toEqual([]);
    // 🔴 两处都必须翻（旧实现只改 common.less ⇒ SFC 残留 row 复检仍红）
    const healedVue = h.files.find((f: any) => f.path.endsWith('.vue')).content;
    const healedLess = h.files.find((f: any) => f.path.endsWith('common.less')).content;
    expect(healedVue).toContain(`.${P}-wrap { display: flex; flex-direction: column;`);
    expect(healedLess).toContain(`.${P}-wrap { display: flex; flex-direction: column; }`);
    expect(h.healed.filter((x: any) => x.class === `${P}-wrap`)).toHaveLength(2);
    // 复检归零 + 幂等
    expect(detectVForListDirectionMismatch(h.files, structure).issues).toHaveLength(0);
    expect(healVForListDirection(h.files, r.issues).healed).toHaveLength(0);
  });

  it('② 多份规则方向矛盾（SFC row / less column，真值 column）⇒ 判违规并统一为 column', () => {
    const files = [
      { path: 'package/components/ContentSection.vue', content: vueWithStyle(`${P}-wrap`, 'row', `${P}-card`, 'display: flex; flex-direction: row;') },
      { path: 'resources/styles/common.less', content: less({ [`${P}-wrap`]: 'column' }) },
    ];
    const r = detectVForListDirectionMismatch(files, structure);
    const wrapper = r.issues.find((i: any) => i.hint.role === 'wrapper');
    // 矛盾形态必须判出来（聚合后 wrapperKinds=[row, column]，含非真值方向）
    expect(wrapper).toBeTruthy();
    expect(wrapper.message).toContain('互相矛盾');
    const h = healVForListDirection(files, r.issues);
    const r2 = detectVForListDirectionMismatch(h.files, structure);
    expect(r2.issues).toHaveLength(0);
  });

  it('③ item 首份规则无方向声明、后份规则有 row（真值 horizontal）⇒ 聚合后判定通过不误报', () => {
    // 17750e31 实测形态：SFC `.card { min-height:0; background:… }`（无 flex-direction）
    // + common.less `.card { display:flex; flex-direction:row }` —— 旧实现取首块 ⇒
    // skippedNoActual 判据域落空；聚合后应解析出 row 并与真值一致（0 issue）。
    const files = [
      { path: 'package/components/ContentSection.vue', content: vueWithStyle(`${P}-wrap`, 'column', `${P}-card`, 'min-height: 0; background: #fff;') },
      { path: 'resources/styles/common.less', content: less({ [`${P}-wrap`]: 'column', [`${P}-card`]: 'row' }) },
    ];
    const r = detectVForListDirectionMismatch(files, structure);
    expect(r.issues).toHaveLength(0);
    expect(r.stats.judged).toBe(2);
  });

  it('④ 同名修饰符/伪类变体不受翻转波及（--active / :hover 块不动）', () => {
    const content = `<template>
  <div data-section-id="card-1" class="${P}-wrap">
    <div v-for="(item, index) in list" :key="index" class="${P}-card"><span>{{ item.name }}</span></div>
  </div>
</template>
<style scoped>
.${P}-wrap { display: flex; flex-direction: row; }
.${P}-wrap--dense { display: flex; flex-direction: row; }
.${P}-wrap:hover { display: flex; flex-direction: row; }
</style>`;
    const files = [{ path: 'List.vue', content }];
    const r = detectVForListDirectionMismatch(files, structure);
    expect(r.issues.map((i: any) => i.id)).toContain('VFOR-DIR-WRAPPER');
    const h = healVForListDirection(files, r.issues);
    const healedVue = h.files[0].content;
    expect(healedVue).toContain(`.${P}-wrap { display: flex; flex-direction: column; }`);
    // 变体块保持原样（精确选择器边界 (?!\\w-) 挡 .cls--x / .cls:hover）
    expect(healedVue).toContain(`.${P}-wrap--dense { display: flex; flex-direction: row; }`);
    expect(healedVue).toContain(`.${P}-wrap:hover { display: flex; flex-direction: row; }`);
  });
});

describe('T3 · 纯函数', () => {
  it('findVForPairs：识别 v-for 元素及其父元素，并标注 wrapper 是否根元素', () => {
    const content = `<template>
  <div class="root">
    <div v-for="i in list" :key="i" class="item"><span class="t"/></div>
  </div>
</template>`;
    const pairs = findVForPairs(content);
    expect(pairs.length).toBe(1);
    expect(/class="item"/.test(pairs[0].item.attrs)).toBe(true);
    expect(/class="root"/.test(pairs[0].parent?.attrs || '')).toBe(true);
    expect(pairs[0].wrapperIsHost).toBe(true);
  });

  it('isCollapsedListSection：`-list` / collapsed / renderHint=v-for', () => {
    expect(isCollapsedListSection({ id: '48:5798-list' })).toBe(true);
    expect(isCollapsedListSection({ collapsed: true })).toBe(true);
    expect(isCollapsedListSection({ renderHint: 'v-for' })).toBe(true);
    expect(isCollapsedListSection({ id: '48:5801' })).toBe(false);
  });

  it('findSectionWithParent：返回段及其父段', () => {
    const hit: any = findSectionWithParent(sectionsWithList(), 'card-1');
    expect(hit.sec.id).toBe('card-1');
    expect(hit.parent?.id).toBe('cards-list');
    expect(findSectionWithParent(sectionsWithList(), 'nope')).toBeNull();
  });
});
