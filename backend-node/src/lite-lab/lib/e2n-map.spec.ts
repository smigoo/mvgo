import { buildE2nMap, findE2nEdge, mountBgByE2n } from './e2n-map';

/**
 * E2N 映射判据（2026-11-05）
 * 三条判据：①产物实例化（v-for 展开 + 插值取 script 字面量）②文本 seed 按值匹配
 * （禁按序——真机 12 卡 / 6 nav 顺序与 Figma 完全不同）③祖先传播（子树已 seed 集合相等且候选唯一）。
 * 🔴 阳性对照：每组「应建边」都配一条「结构相近但文本不等 → 不建边」的阴性样本，
 *   否则「全都返回空」也能让断言全绿。
 */

const STAT_ITEMS = [
  { label: '设备总数', value: '3740' },
  { label: '在线设备', value: '3562' },
  { label: '离线设备', value: '178' },
  { label: '异常设备', value: '23' },
  { label: '今日告警', value: '96' },
  { label: '待处理告警', value: '14' },
  { label: '巡检完成', value: '88' },
  { label: '巡检任务', value: '92' },
  { label: '数据接入', value: '6' },
  { label: '接口总数', value: '52' },
  { label: '平均响应', value: '120' },
  { label: '设备在线率', value: '95.2' },
];

/** 产物模板：nav 字面量顺序（设备管理/综合态势/告警中心）故意与 Figma（综合态势/告警中心/设备管理）不同 */
function vueCards(items: Array<{ label: string; value: string }>): string {
  const rows = items.map((x) => `  { label: '${x.label}', value: '${x.value}' },`).join('\n');
  return `<template>
  <div class="panel">
    <div class="panel-title">设备监测</div>
    <div class="nav">
      <span class="nav-c">设备管理</span>
      <span class="nav-a">综合态势</span>
      <span class="nav-b">告警中心</span>
    </div>
    <div class="cards">
      <div class="card" v-for="(item, i) in statItems" :key="i">
        <span class="card-label">{{ item.label }}</span>
        <span class="card-value">{{ item.value }}</span>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref } from 'vue';
const statItems = ref([
${rows}
]);
</script>
<style scoped>
.panel { position: relative; }
.nav { display: flex; }
.cards { display: grid; }
.card { display: flex; }
</style>`;
}

const t = (id: string, characters: string) => ({ id, type: 'TEXT', name: characters, characters });
const frame = (id: string, name: string, children: any[]) => ({ id, type: 'FRAME', name, children });

/** Figma 树：nav 顺序与产物字面量顺序相反；12 卡顺序与产物数组顺序也相反 */
function figmaPanel(items: Array<{ label: string; value: string }>) {
  const cards = items.map((it, i) =>
    frame(`2:81${String(i).padStart(2, '0')}`, `card-${i}`, [
      t(`2:82${String(i).padStart(2, '0')}a`, it.label),
      t(`2:82${String(i).padStart(2, '0')}b`, it.value),
    ]),
  );
  return frame('2:8000', '设备监测面板', [
    t('2:8001', '设备监测'),
    frame('2:8002', 'nav', [t('2:8003', '综合态势'), t('2:8004', '告警中心'), t('2:8005', '设备管理')]),
    frame('2:8010', 'cards', cards),
  ]);
}

const reversed = [...STAT_ITEMS].reverse();

describe('E2N 建图（实例化 + 文本 seed 按值 + 祖先传播）', () => {
  it('阳性：12 卡 v-for 单元建 12 条边，nav/卡片容器各建 1 条', () => {
    const e2n = buildE2nMap(figmaPanel(STAT_ITEMS), [
      { path: 'package/index.vue', content: vueCards(reversed) },
    ]);

    // 12 卡 × 2 + nav 3 + 标题 1 = 28 条 seed（顺序全反，仍全命中 ⇒ 按值不按序）
    expect(e2n.stats.seeds).toBe(28);
    expect(e2n.stats.ambiguousSeeds).toBe(0);

    // 卡片群容器 ↔ .cards
    const cardsEdge = findE2nEdge(e2n, '2:8010')!;
    expect(cardsEdge).toBeDefined();
    expect(cardsEdge.classes).toContain('cards');
    expect(cardsEdge.how).toBe('subtree-set-equal');
    expect(cardsEdge.matched).toBe(24);

    // 单卡 ↔ .card（v-for 单元）：12 条，instCount=12
    const unitEdges = e2n.nodes.filter((n) => n.how === 'vfor-unit');
    expect(unitEdges).toHaveLength(12);
    expect(unitEdges.every((e) => e.classes.includes('card'))).toBe(true);
    expect(unitEdges.every((e) => e.instCount === 12)).toBe(true);

    // nav ↔ .nav（3 条 seed 集合相等）
    const navEdge = findE2nEdge(e2n, '2:8002')!;
    expect(navEdge.classes).toContain('nav');

    // 根 ↔ .panel（最紧且唯一：.panel=28 条 vs .cards=24 条）
    const rootEdge = findE2nEdge(e2n, '2:8000')!;
    expect(rootEdge.classes).toContain('panel');
  });

  it('顺序无关：字面量倒序排列时，seed 仍按文本值配对（综合态势 → .nav-a，而非首个 nav 节点）', () => {
    const e2n = buildE2nMap(figmaPanel(STAT_ITEMS), [
      { path: 'package/index.vue', content: vueCards(reversed) },
    ]);
    const seed = e2n.seeds.find((s) => s.text === '综合态势')!;
    expect(seed).toBeDefined();
    const prod = e2n.prodNodes.find((p) => p.key === seed.prodKey)!;
    expect(prod.classes).toContain('nav-a');
    expect(prod.classes).not.toContain('nav-c');
  });

  it('阴性：产物少一项 → 该卡 2 条 seed 缺失，vfor-unit 只剩 11 条（不硬凑）', () => {
    const short = STAT_ITEMS.slice(0, 11);
    const e2n = buildE2nMap(figmaPanel(STAT_ITEMS), [
      { path: 'package/index.vue', content: vueCards(short) },
    ]);
    expect(e2n.stats.seeds).toBe(26);
    expect(e2n.stats.missSeeds).toBe(2);
    expect(e2n.nodes.filter((n) => n.how === 'vfor-unit')).toHaveLength(11);
  });

  it('阴性：滚动数字被截断（Figma「3/3740」vs 产物「3」）不产生 seed，也不落进 miss 之外的假阳性', () => {
    const figma = frame('2:9000', '面板', [
      t('2:9001', '总共'),
      t('2:9002', '3/3740'),
    ]);
    const vue = `<template>
  <div class="panel">
    <span class="lbl">总共</span>
    <span class="k">3</span>
  </div>
</template>`;
    const e2n = buildE2nMap(figma, [{ path: 'package/index.vue', content: vue }]);
    expect(e2n.seeds.map((s) => s.text)).toEqual(['总共']);
    expect(e2n.stats.missSeeds).toBe(1);
    expect(e2n.seeds.some((s) => s.text === '3/3740')).toBe(false);
  });

  it('阳性：单文本容器并列（.tabs-list > .tab 都只渲染「总数」）→ 取最外层建边，depthResolved 留痕', () => {
    const figma = frame('2:7000', 'tabs-list', [t('2:7001', '总数')]);
    const vue = `<template>
  <div class="panel">
    <div class="head">设备监测</div>
    <div class="tabs-list"><span class="tab tab-active">总数</span></div>
  </div>
</template>`;
    const e2n = buildE2nMap(figma, [{ path: 'package/index.vue', content: vue }]);
    const edge = findE2nEdge(e2n, '2:7000')!;
    expect(edge).toBeDefined();
    expect(edge.classes).toContain('tabs-list');
    expect(edge.classes).not.toContain('tab-active');
    expect(e2n.stats.depthResolved).toBeGreaterThanOrEqual(1);
  });

  it('阴性：产物同一文本出现两次 → seed 标 ambiguous，不建边（不按序消歧）', () => {
    const figma = frame('2:6000', '双卡', [t('2:6001', '状态'), t('2:6002', '开')]);
    const vue = `<template>
  <div class="wrap">
    <div class="left"><span class="s">状态</span><span class="v">开</span></div>
    <div class="right"><span class="s">状态</span><span class="v">开</span></div>
  </div>
</template>`;
    const e2n = buildE2nMap(figma, [{ path: 'package/index.vue', content: vue }]);
    expect(e2n.stats.seeds).toBe(0);
    expect(e2n.stats.ambiguousSeeds).toBe(2);
    expect(findE2nEdge(e2n, '2:6000')).toBeUndefined();
  });

  it('阳性：Figma 卡多一条产物没有的文本，仍按「槽位上界」建边（不要求两边 seed 数相等）', () => {
    // 83cfb20e 实锤：首卡多出的 "(2/484)" 在产物侧组合不出来 ⇒ 无 seed；按等式判定首卡永远无边，
    // 而它的 bg-8439 恰好挂在那个容器上 ⇒ 容器底图永远挂不上。
    const figma = frame('2:8000', 'cons', [
      frame('2:8001', 'card0', [t('2:8002', '摄像机'), t('2:8003', '主摄像机')]),
      frame('2:8011', 'card1', [t('2:8012', '风速风向仪'), t('2:8013', '主摄像机')]),
    ]);
    const vue = `<template>
  <div class="panel">
    <div class="panel-title">设备监测</div>
    <div class="cards">
      <div class="card" v-for="(item, i) in list" :key="i">
        <span class="card-name">{{ item.name }}</span>
        <span class="card-ratio">{{ item.ratio }}</span>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref } from 'vue';
const list = ref([
  { name: '摄像机', ratio: '2/484' },
  { name: '风速风向仪', ratio: '0/484' },
]);
</script>`;
    const e2n = buildE2nMap(figma, [{ path: 'package/index.vue', content: vue }]);
    const first = findE2nEdge(e2n, '2:8001')!;
    expect(first).toBeDefined();
    expect(first.classes).toContain('card');
    expect(first.matched).toBe(1); // 只有「摄像机」这一条能 seed
    expect(first.instCount).toBe(2);
  });

  it('阳性：具名插槽 template（#title-left）里的文本照常入图并 seed（83cfb20e「设备监测」整条 miss 实锤）', () => {
    const figma = frame('2:5000', 'cp-面板', [
      t('2:5001', '设备监测'),
      frame('2:5010', 'body', [t('2:5011', '总数'), t('2:5012', '异常数')]),
    ]);
    const vue = `<template>
  <base-panel panelKey="default-panel">
    <template #title-left>设备监测</template>
    <div class="content">
      <span class="k">总数</span>
      <span class="v">异常数</span>
    </div>
  </base-panel>
</template>`;
    const e2n = buildE2nMap(figma, [{ path: 'package/index.vue', content: vue }]);
    // 标题（具名插槽内）必须能被 seed，而不是整条 miss
    const seed = e2n.seeds.find((s) => s.text === '设备监测');
    expect(seed).toBeDefined();
    expect(e2n.stats.missSeeds).toBe(0);
  });

  it('阳性：无属性 template 包裹层被跳过，但层内文本上移给父容器（不丢文本）', () => {
    const figma = frame('2:5100', '卡片', [t('2:5101', '甲'), t('2:5102', '乙')]);
    const vue = `<template>
  <div class="card">
    <template v-if="show">
      <span class="a">甲</span>
      <span class="b">乙</span>
    </template>
  </div>
</template>
<script setup>
const show = true;
</script>`;
    const e2n = buildE2nMap(figma, [{ path: 'package/index.vue', content: vue }]);
    const edge = findE2nEdge(e2n, '2:5100')!;
    expect(edge).toBeDefined();
    expect(edge.classes).toContain('card');
    // 包裹层不产生节点（否则会与 .card 渲染集相等而抢容器位）
    expect(e2n.prodNodes.some((p) => p.tag === 'template' && p.classes.length === 0 && p.renderTexts.length === 2)).toBe(false);
  });

  it('阴性：整卡片容器（3 条文本 > 单元 1 个文本槽位）不认成重复单元，落点是容器本身', () => {
    const figma = frame('2:7000', 'items', [t('2:7001', '甲'), t('2:7002', '乙'), t('2:7003', '丙')]);
    const vue = `<template>
  <div class="panel">
    <div class="head">设备监测</div>
    <div class="items"><span class="item" v-for="(x, i) in list" :key="i">{{ x }}</span></div>
  </div>
</template>
<script setup>
import { ref } from 'vue';
const list = ref(['甲', '乙', '丙']);
</script>`;
    const e2n = buildE2nMap(figma, [{ path: 'package/index.vue', content: vue }]);
    const edge = findE2nEdge(e2n, '2:7000')!;
    expect(edge).toBeDefined();
    expect(edge.classes).toContain('items');
    expect(edge.classes).not.toContain('item');
    expect(edge.how).toBe('subtree-set-equal');
  });
});

describe('E2N 容器级 bg 挂载（四闸门 + 允许插入）', () => {
  const figma = () =>
    frame('2:7000', 'tabs-list', [t('2:7001', '总数'), t('2:7002', '异常数')]);
  const vue = (style: string) => `<template>
  <div class="panel">
    <div class="head">设备监测</div>
    <div class="tabs-list"><span class="tab">总数</span><span class="tab">异常数</span></div>
  </div>
</template>
<style scoped>
${style}
</style>`;
  const asset = (over: Record<string, any> = {}) => ({
    nodeId: '2:7010',
    fileName: 'bg-7890.png',
    parentId: '2:7000',
    containerLevel: true,
    ...over,
  });

  it('阳性：规则体无背景声明 → 插入 background（对照旧口径"只换已有键"必挂不上）', () => {
    const files = [{ path: 'package/index.vue', content: vue('.tabs-list { display: flex; }') }];
    const e2n = buildE2nMap(figma(), files);
    const r = mountBgByE2n(files, [asset()], e2n);
    expect(r.stats.candidates).toBe(1);
    expect(r.stats.anchored).toBe(1);
    expect(r.stats.inserted).toBe(1);
    expect(r.files[0].changed).toBe(true);
    expect(r.files[0].content).toContain(
      "background: url('../resources/images/bg-7890.png') center / 100% 100% no-repeat;",
    );
    expect(r.anchoredAssets[0]).toMatchObject({ fileName: 'bg-7890.png', cls: 'tabs-list', how: 'insert' });
  });

  it('阳性：规则体是 background-color → 整条改写为 background:url（丢弃臆造底色，且不产出非法声明）', () => {
    // 🔴 原实现输出 `background-color: #101820 url(...)` —— 该属性只接受颜色，
    //   浏览器会丢弃整条声明（= 背景图静默失效）。必须连属性名一起改写。
    const files = [{ path: 'package/index.vue', content: vue('.tabs-list { background-color: #101820; }') }];
    const e2n = buildE2nMap(figma(), files);
    const r = mountBgByE2n(files, [asset()], e2n);
    expect(r.stats.replacedColor).toBe(1);
    expect(r.files[0].content).toContain(
      "background: url('../resources/images/bg-7890.png') center / 100% 100% no-repeat;",
    );
    expect(r.files[0].content).not.toContain('background-color');
    expect(r.files[0].content).not.toContain('#101820');
    expect(r.anchoredAssets[0]).toMatchObject({ how: 'replace-color' });
  });

  it('阳性：规则体是 background + 纯色（真机设备卡 rgba(255,255,255,.6)）→ 整条替换，不留底色', () => {
    const files = [
      { path: 'package/index.vue', content: vue('.tabs-list { background: rgba(255, 255, 255, 0.6); }') },
    ];
    const e2n = buildE2nMap(figma(), files);
    const r = mountBgByE2n(files, [asset()], e2n);
    expect(r.stats.replacedColor).toBe(1);
    expect(r.files[0].content).toContain(
      "background: url('../resources/images/bg-7890.png') center / 100% 100% no-repeat;",
    );
    expect(r.files[0].content).not.toContain('rgba(255, 255, 255, 0.6)');
  });

  it('阳性：已有渐变 → 用资源图**替换**（资源图是 Figma 完整背景，叠加等于双重上色）', () => {
    // 🔴 2026-11-05 用户定性（1b5b72d0 截图：「背景被换上后原来背景应该删除」）：
    //   原实现输出 `url(...), linear-gradient(...)` ⇒ 图上再压一层渐变，蓝色卡左深右浅、
    //   右下角露出渐变直角，与设计稿不符。资源图本身就是完整背景，必须替换掉原背景。
    const files = [
      { path: 'package/index.vue', content: vue('.tabs-list { background: linear-gradient(90deg, #111, #222); }') },
    ];
    const e2n = buildE2nMap(figma(), files);
    const r = mountBgByE2n(files, [asset()], e2n);
    expect(r.stats.anchored).toBe(1);
    expect(r.stats.replacedGradient).toBe(1);
    expect(r.files[0].content).toContain(
      "background: url('../resources/images/bg-7890.png') center / 100% 100% no-repeat;",
    );
    expect(r.files[0].content).not.toContain('linear-gradient');
    expect(r.anchoredAssets[0]).toMatchObject({ how: 'replace-gradient' });
  });

  it('阴性：规则体已有 url → skipAlreadyUrl（不重复插入）', () => {
    const files = [
      { path: 'package/index.vue', content: vue(".tabs-list { background: url('a.png') no-repeat; }") },
    ];
    const e2n = buildE2nMap(figma(), files);
    const r = mountBgByE2n(files, [asset()], e2n);
    expect(r.stats.anchored).toBe(0);
    expect(r.stats.skipAlreadyUrl).toBe(1);
    expect(r.files[0].changed).toBe(false);
  });

  it('阴性：选择器多类（.a .b）→ skipMultiClass 否决', () => {
    const files = [
      { path: 'package/index.vue', content: vue('.panel .tabs-list { display: flex; }') },
    ];
    const e2n = buildE2nMap(figma(), files);
    const r = mountBgByE2n(files, [asset()], e2n);
    expect(r.stats.anchored).toBe(0);
    expect(r.stats.skipMultiClass).toBe(1);
  });

  it('阴性：资源非容器级 / 无 parentId → 不进候选（不做元素级底图替换）', () => {
    const files = [{ path: 'package/index.vue', content: vue('.tabs-list { display: flex; }') }];
    const e2n = buildE2nMap(figma(), files);
    const r = mountBgByE2n(files, [asset({ containerLevel: false })], e2n);
    expect(r.stats.candidates).toBe(0);
    expect(r.files[0].changed).toBe(false);
  });

  it('阴性：E2N 无对应边 → skipNoEdge（不靠类名猜落点）', () => {
    const files = [{ path: 'package/index.vue', content: vue('.tabs-list { display: flex; }') }];
    // Figma 换一套文本 ⇒ 建不成边
    const otherFigma = frame('2:7000', 'tabs-list', [t('2:7001', '甲'), t('2:7002', '乙')]);
    const e2n = buildE2nMap(otherFigma, files);
    const r = mountBgByE2n(files, [asset()], e2n);
    expect(r.stats.candidates).toBe(1);
    expect(r.stats.skipNoEdge).toBe(1);
    expect(r.files[0].changed).toBe(false);
  });

  it('阳性：预编译样式表（resources/styles/index.css）走 ../images/ 深度', () => {
    const css = [{ path: 'resources/styles/index.css', content: '.tabs-list{display:flex}' }];
    const e2n = buildE2nMap(figma(), [{ path: 'package/index.vue', content: vue('.tabs-list { display: flex; }') }]);
    const r = mountBgByE2n(css, [asset()], e2n);
    expect(r.stats.anchored).toBe(1);
    expect(r.files[0].content).toContain("url('../images/bg-7890.png')");
  });

  it('阳性：同一逻辑规则的 4 个投影（注释前缀 / .dark / .light / 预编译副本）都落到 url，不判歧义', () => {
    // 6e59a0d4 实锤：selNorm 形如 `/* Tab 切换栏 */\n.c-...-tabs`，与 `.dark .c-...-tabs`
    // 不剥噪声会比较成两个选择器 ⇒ skipRuleAmbiguous ⇒ 容器底图永远挂不上。
    const sfc = vue(`/* Tab 切换栏 */
.tabs-list { display: flex; }
.dark .tabs-list { display: flex; }
.light .tabs-list { display: flex; }`);
    const css = [{
      path: 'resources/styles/index.css',
      content: '/* Tab 切换栏 */\n.tabs-list{display:flex}\n.dark .tabs-list{display:flex}\n',
    }];
    const e2n = buildE2nMap(figma(), [{ path: 'package/index.vue', content: sfc }]);
    const r = mountBgByE2n([{ path: 'package/index.vue', content: sfc }, ...css], [asset()], e2n);
    expect(r.stats.skipRuleAmbiguous).toBe(0);
    expect(r.stats.anchored).toBe(1);
    expect(r.stats.inserted).toBe(5); // SFC 3 个投影 + css 2 个投影
    for (const f of r.files) {
      const n = (f.content.match(/url\('/g) ?? []).length;
      expect(n).toBe(f.path === 'package/index.vue' ? 3 : 2);
    }
  });

  // 🔴 2026-11-05 真机 1b5b72d0 实锤：预览真正生效的样式来自 SFC 内嵌 `<style lang="less">`
  //   （index.less → common.less → themes/*.less）的编译结果，index.css 只是预编译副本；
  //   二者同优先级时后注入者赢 ⇒ 只改 index.css 会被 less 投影原样压掉
  //   （症状：DOM 里 `.summary-card--blue` 有 bg url，肉眼却没有背景图）。
  //   故 less 源必须与 index.css 一样参与挂载，且深度按各自目录算。
  it('阳性：less 源 resources/styles/common.less 与 index.css 同深度 → ../images/', () => {
    const less = [{ path: 'resources/styles/common.less', content: '.tabs-list{background: linear-gradient(90deg,#111,#222);}' }];
    const e2n = buildE2nMap(figma(), [{ path: 'package/index.vue', content: vue('.tabs-list { display: flex; }') }]);
    const r = mountBgByE2n(less, [asset()], e2n);
    expect(r.stats.anchored).toBe(1);
    // 旧实现只特判 index.css，less 源会按 .vue 算成 ../../resources/images/ ⇒ 图裂
    expect(r.files[0].content).toContain("url('../images/bg-7890.png')");
    expect(r.files[0].content).not.toContain('../../resources/images');
  });

  it('阳性：themes 子目录（resources/styles/themes/*.less）→ ../../images/', () => {
    const less = [{ path: 'resources/styles/themes/dark.less', content: '.tabs-list{background: linear-gradient(90deg,#111,#222);}' }];
    const e2n = buildE2nMap(figma(), [{ path: 'package/index.vue', content: vue('.tabs-list { display: flex; }') }]);
    const r = mountBgByE2n(less, [asset()], e2n);
    expect(r.stats.anchored).toBe(1);
    expect(r.files[0].content).toContain("url('../../images/bg-7890.png')");
  });

  it('阳性：部分修复态（css 已有 url、less 没有）→ 只补缺的，不整体 skipAlreadyUrl', () => {
    // 幂等判据必须按 hit 逐个判：真机存在「index.css 已挂、common.less 未挂」的半修复态，
    // 旧的「任一投影有 url 就整体否决」会让这类资产永远补不齐且静默。
    const css = [{ path: 'resources/styles/index.css', content: ".tabs-list{background: url('../images/bg-7890.png') center / 100% 100% no-repeat}" }];
    const less = [{ path: 'resources/styles/common.less', content: '.tabs-list{background: linear-gradient(90deg,#111,#222);}' }];
    const e2n = buildE2nMap(figma(), [{ path: 'package/index.vue', content: vue('.tabs-list { display: flex; }') }]);
    const r = mountBgByE2n([...css, ...less], [asset()], e2n);
    expect(r.stats.skipAlreadyUrl).toBe(0);
    expect(r.stats.anchored).toBe(1);
    expect(r.files.find((f) => f.path.endsWith('index.css'))!.changed).toBe(false);
    expect(r.files.find((f) => f.path.endsWith('common.less'))!.changed).toBe(true);
    expect(r.files.find((f) => f.path.endsWith('common.less'))!.content).toContain("url('../images/bg-7890.png')");
  });

  it('阴性：全部投影都已有 url → skipAlreadyUrl（真幂等，重复执行不多挂）', () => {
    const css = [{ path: 'resources/styles/index.css', content: ".tabs-list{background: url('../images/bg-7890.png') no-repeat}" }];
    const less = [{ path: 'resources/styles/common.less', content: ".tabs-list{background: url('../images/bg-7890.png') no-repeat}" }];
    const e2n = buildE2nMap(figma(), [{ path: 'package/index.vue', content: vue('.tabs-list { display: flex; }') }]);
    const r = mountBgByE2n([...css, ...less], [asset()], e2n);
    expect(r.stats.anchored).toBe(0);
    expect(r.stats.skipAlreadyUrl).toBe(1);
    expect(r.files.every((f) => !f.changed)).toBe(true);
  });
});
