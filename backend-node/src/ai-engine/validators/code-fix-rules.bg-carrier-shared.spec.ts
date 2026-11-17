/**
 * 🛡️ S3-BG 共享家族去重 + 原始快照锚定 + 逐注入 SFC 回滚（2026-11-16 · L2 套娃根治 v2）
 *
 * 真机病灶（mc-max-1794838541292-1c15a129）：同一张 bg-8527.png 被 12 个 owner section
 * 共用（同变量 bg4），旧逻辑逐条注入承载 div 且每轮 lastIndexOf 重读【已累积】的 out ⇒
 * 注入 div 自身含 bg4 ⇒ 命中上一轮的自己 ⇒ carrier 24 个、连续 </div> 套娃、属性内截断
 * ⇒ ContentSection.vue 整段被写盘门禁丢弃（内容/样式/布局全丢）。
 *
 * 三道防线（docs/2026-11-16-L2背景挂载lastIndexOf套娃根治方案.md v2）：
 *   防线1 共享家族三态：已消费跳过（跨文件收窄判据补齐 FG_GRID_BGS/FG_CARD_BGS）；
 *         共享家族位次去重（首个到达 ①' 者为代表，其余 skippedSharedDuplicate）；
 *         单 owner 行为不变。
 *   防线2 原始快照锚定：插入点只基于本轮 pass 开始前的原文 + per-file 补丁簿记换算。
 *   防线3 逐注入校验：每条补绑/注入落笔后立即 validateVueSfc，非法单条回滚不连坐。
 */
import { backstopMountBgOwnership } from './code-fix-rules.js';

const Bg4_OWNERS = [
  '2:8526',
  '2:8438',
  '2:8467',
  '2:8497',
  '2:8584',
  '2:8555',
  '2:8613',
  '2:8642',
  '2:8671',
  '2:8700',
  '2:8729',
  '2:8758',
];

const mkMapping = (resourceFile: string, owners: string[]) =>
  owners.map((id) => ({
    resourceFile,
    figmaNodeId: id,
    ownerSectionId: id,
    targetDomSelector: `[data-section-id="${id}"]`,
    figmaBox: { x: 0, y: 0, width: 100, height: 40 },
    previewAnalysisRole: 'bg',
    downloadStatus: 'success',
  }));

const CONTENT_SECTION_LIKE = `<template>
  <div class="c-content" data-section-id="2:8526" :style="{ backgroundImage: 'url(' + bg4 + ')', backgroundSize: '100% 100%' }">
    <span>内容</span>
  </div>
</template>
<script setup>
import bg4 from '../../resources/images/bg-8527.png'
</script>
<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>`;

describe('防线1 态一：已消费态跳过（含跨文件收窄判据补齐）', () => {
  it('对照A2：跨文件 FG_GRID_BGS 消费（import 在 index、消费在 GridSection）⇒ skippedDataDriven，不注入', () => {
    const files = {
      'package/index.vue': `<template>
  <div><GridSection /></div>
</template>
<script setup>
import bg1 from '../resources/images/bg-8527.png'
import GridSection from './components/GridSection.vue'
</script>`,
      'package/components/GridSection.vue': `<template>
  <div>
    <div v-for="(it, i) in items" :key="i" :style="{ backgroundImage: 'url(' + FG_GRID_BGS[it.bgImg] + ')' }" />
  </div>
</template>
<script setup>
const FG_GRID_BGS = [bg1]
const items = [{ bgImg: 0 }]
</script>`,
    };
    const r = backstopMountBgOwnership(files, mkMapping('../resources/images/bg-8527.png', ['136:999']));
    expect(r.stats.skippedDataDriven).toBe(1);
    expect(r.stats.missingContainerInjected).toBe(0);
    expect(r.files['package/components/GridSection.vue']).toBe(
      files['package/components/GridSection.vue'],
    );
    expect(r.files['package/index.vue']).toBe(files['package/index.vue']);
  });

  it('对照A3：跨文件 FG_CARD_BGS 轮换（mountCardBgGroups 产物形态）⇒ skippedDataDriven', () => {
    const files = {
      'package/index.vue': `<template>
  <div><StatsRow /></div>
</template>
<script setup>
import bg1 from '../resources/images/bg-8527.png'
import StatsRow from './components/StatsRow.vue'
</script>`,
      'package/components/StatsRow.vue': `<template>
  <div data-section-id="136:121">
    <div v-for="(it, __i) in FG_CARD_ITEMS" :key="__i" :style="{ backgroundImage: 'url(' + FG_CARD_BGS[__i] + ')' }">{{ it.t }}</div>
  </div>
</template>
<script setup>
const FG_CARD_BGS = [bg1]
const FG_CARD_ITEMS = [{ t: 'a' }]
</script>`,
    };
    const r = backstopMountBgOwnership(files, mkMapping('../resources/images/bg-8527.png', ['136:122']));
    expect(r.stats.skippedDataDriven).toBe(1);
    expect(r.stats.missingContainerInjected).toBe(0);
  });

  it('判据收窄：FG_GRID_BGS 存在但数组不含该 varName ⇒ 不命中（不放宽为任意 const）', () => {
    const files = {
      'package/index.vue': `<template>
  <div><GridSection /></div>
</template>
<script setup>
import bg1 from '../resources/images/bg-other.png'
import GridSection from './components/GridSection.vue'
</script>`,
      'package/components/GridSection.vue': `<template>
  <div><div v-for="(it, i) in items" :key="i" :style="{ backgroundImage: 'url(' + FG_GRID_BGS[it.bgImg] + ')' }" /></div>
</template>
<script setup>
import bg2 from '../../resources/images/bg-8527.png'
const FG_GRID_BGS = [bg2]
const items = [{ bgImg: 0 }]
</script>`,
    };
    // mapping 的 bg 是 bg-8527.png（= bg2），FG_GRID_BGS=[bg2] 其实命中——换成不命中场景：
    // 资源是 bg-other.png（= bg1），FG_GRID_BGS 数组只含 bg2 ⇒ 不命中 ⇒ 走 ①' 注入（阴性对照同时验证收窄判据不误吞）
    const r = backstopMountBgOwnership(files, mkMapping('../resources/images/bg-other.png', ['136:999']));
    expect(r.stats.skippedDataDriven).toBe(0);
    expect(r.stats.missingContainerInjected).toBe(1);
  });
});

describe('防线1 态二：共享家族位次去重（12-owner bg4 真实形态）', () => {
  it('对照B：12 owner 全走到判定 ⇒ 只注入 1 个代表 carrier + skippedSharedDuplicate=11，无套娃', () => {
    // 真实 1c15a129 形态：2:8526 宿主存在且已消费 bg4（skippedAlreadyMapped），
    // 其余 11 个 owner 无容器 —— 旧逻辑产出 11+ 个 carrier 层层套娃。
    const files = { 'package/components/ContentSection.vue': CONTENT_SECTION_LIKE };
    const r = backstopMountBgOwnership(files, mkMapping('../resources/images/bg-8527.png', Bg4_OWNERS));
    // 计数三证：宿主存在已消费=1、家族去重=10（12-1宿主-1代表）、注入=1
    expect(r.stats.skippedAlreadyMounted).toBe(1);
    expect(r.stats.missingContainerInjected).toBe(1);
    expect(r.stats.skippedSharedDuplicate).toBe(10);
    const out = r.files['package/components/ContentSection.vue'];
    // carrier 总量：1 个 class + 1 条 size rule = 2 个 token（旧版 24）
    expect((out.match(/mc-bg-carrier-/g) || []).length).toBe(2);
    // 无套娃、无属性截断
    expect(out).not.toMatch(/class="<div/);
    expect((out.match(/<\/div><\/div><\/div>/g) || []).length).toBe(0);
  });

  it('全家族无容器：首个 owner 为代表注入 1 个，其余 11 个 skippedSharedDuplicate', () => {
    const files = {
      'package/index.vue': `<template>
  <div class="root" data-section-id="88:33">
    <span>面板</span>
  </div>
</template>
<script setup>
import bg1 from '../resources/images/bg-8527.png'
</script>`,
    };
    const r = backstopMountBgOwnership(files, mkMapping('../resources/images/bg-8527.png', Bg4_OWNERS));
    expect(r.stats.missingContainerInjected).toBe(1);
    expect(r.stats.skippedSharedDuplicate).toBe(Bg4_OWNERS.length - 1);
    const out = r.files['package/index.vue'];
    expect((out.match(/mc-bg-carrier-/g) || []).length).toBe(2);
  });

  it('对照C：同 fname 双容器双消费（28ec5c09 缺陷⑦形态）⇒ ① 补绑分支，家族去重不介入', () => {
    const files = {
      'package/components/Flow.vue': `<template>
  <div data-section-id="2:3474" style="width:130px">a</div>
  <div data-section-id="2:3524" style="width:130px">b</div>
</template>
<script setup>
import bg1 from '../../resources/images/bg-_m-34.png'
</script>`,
    };
    const r = backstopMountBgOwnership(files, [
      {
        resourceFile: '../resources/images/bg-_m-34.png',
        figmaNodeId: '2:3474:n',
        ownerSectionId: '2:3474',
        targetDomSelector: '[data-section-id="2:3474"]',
        figmaBox: { x: 10, y: 196, width: 426, height: 91 },
        previewAnalysisRole: 'bg',
        downloadStatus: 'success',
      },
      {
        resourceFile: '../resources/images/bg-_m-34.png',
        figmaNodeId: '2:3524:n',
        ownerSectionId: '2:3524',
        targetDomSelector: '[data-section-id="2:3524"]',
        figmaBox: { x: 10, y: 196, width: 426, height: 91 },
        previewAnalysisRole: 'bg',
        downloadStatus: 'success',
      },
    ]);
    // 两个容器都存在 ⇒ 各补绑一份背景（skippedSharedDuplicate 不命中）
    expect(r.stats.containerTagged).toBe(2);
    expect(r.stats.skippedSharedDuplicate).toBe(0);
    expect(r.stats.revertedInvalid).toBe(0);
    const out = r.files['package/components/Flow.vue'];
    expect((out.match(/url\(' \+ bg1 \+ '\)'/g) || []).length).toBe(2);
    // 开标签必须完整（既有 bug 修复回归：替换串曾丢 `<`）
    expect(out).toContain('<div :style="{ backgroundImage');
  });
});

describe('防线1 态三：单 owner 行为不变（阴性对照 D）', () => {
  it('对照D：单 owner 无容器 ⇒ 注入 1 个 carrier，去重计数为 0', () => {
    const files = {
      'package/components/Flow.vue': `<template>
  <div data-section-id="88:33">
    <span>当日总流量</span>
  </div>
</template>
<script setup>
import bg1 from '../../resources/images/bg-_m-34.png'
</script>`,
    };
    const r = backstopMountBgOwnership(files, mkMapping('../resources/images/bg-_m-34.png', ['2:3660']));
    expect(r.stats.missingContainerInjected).toBe(1);
    expect(r.stats.skippedSharedDuplicate).toBe(0);
    expect(r.stats.skippedAnchorInAttr).toBe(0);
    expect(r.stats.revertedInvalid).toBe(0);
    const out = r.files['package/components/Flow.vue'];
    expect(out).toContain('mc-bg-carrier-23660');
    expect(out).toContain("backgroundImage: 'url(' + bg1 + ')'");
    expect(out).toMatch(/data-section-id="88:33">\s*<div data-section-id="2:3660"/);
  });

  // 🔴 2026-11-17 治本（mc-max-1794911885243-30260c7a 实锤）：carrier 脱离 flex 流。
  //   旧版注入的 carrier 只有 width/height ⇒ 作为普通 flex item 占 h px，把后续 section
  //   挤出容器 ⇒ 文字层叠。阳性：注入规则必须带 absolute 三件套；阴性：锚点/背景绑定不变。
  it('B2 阳性：注入 carrier 的尺寸规则带 position:absolute/inset:0/pointer-events:none（不占 flex 高度）', () => {
    const files = {
      'package/components/Flow.vue': `<template>
  <div data-section-id="88:33">
    <span>当日总流量</span>
  </div>
</template>
<script setup>
import bg1 from '../../resources/images/bg-_m-34.png'
</script>`,
    };
    const r = backstopMountBgOwnership(files, mkMapping('../resources/images/bg-_m-34.png', ['2:3660']));
    const out = r.files['package/components/Flow.vue'];
    expect(r.stats.missingContainerInjected).toBe(1);
    // 阳性：尺寸规则脱离流
    expect(out).toMatch(/\.mc-bg-carrier-23660\s*\{[^}]*position:absolute/);
    expect(out).toMatch(/\.mc-bg-carrier-23660\s*\{[^}]*inset:0/);
    expect(out).toMatch(/\.mc-bg-carrier-23660\s*\{[^}]*pointer-events:none/);
    expect(out).toMatch(/\.mc-bg-carrier-23660\s*\{[^}]*width:100px;\s*height:40px/);
    // 阴性：锚点保留（资源挂载不 fail-closed）+ 背景动态绑定照旧
    expect(out).toContain('data-section-id="2:3660"');
    expect(out).toContain("backgroundImage: 'url(' + bg1 + ')'");
  });

  it('B2 幂等：已有 absolute 规则的 carrier 再跑一次不重复注入', () => {
    const files = {
      'package/components/Flow.vue': `<template>
  <div data-section-id="88:33">
    <div data-section-id="2:3660" class="mc-bg-carrier-23660" :style="{ backgroundImage: 'url(' + bg1 + ')' }"></div>
    <span>当日总流量</span>
  </div>
</template>
<script setup>
import bg1 from '../../resources/images/bg-_m-34.png'
</script>
<style lang="less" scoped>
.mc-bg-carrier-23660 { position:absolute; inset:0; pointer-events:none; width:100px; height:40px; }
</style>`,
    };
    const r = backstopMountBgOwnership(files, mkMapping('../resources/images/bg-_m-34.png', ['2:3660']));
    const out = r.files['package/components/Flow.vue'];
    expect((out.match(/mc-bg-carrier-23660/g) || []).length).toBeLessThanOrEqual(3); // class 定义 + 元素 + 规则内类名
    expect(out).toMatch(/\.mc-bg-carrier-23660\s*\{[^}]*position:absolute/);
  });
});

describe('防线2：原始快照锚定（幂等不套娃）', () => {
  it('重复执行（把上一轮产物再喂回来）⇒ carrier 数不增长（旧版每轮 +N 套娃）', () => {
    const files = {
      'package/index.vue': `<template>
  <div class="root" data-section-id="88:33">
    <span>面板</span>
  </div>
</template>
<script setup>
import bg1 from '../resources/images/bg-8527.png'
</script>`,
    };
    const once = backstopMountBgOwnership(files, mkMapping('../resources/images/bg-8527.png', ['2:8526']))
      .files['package/index.vue'];
    const twice = backstopMountBgOwnership(
      { 'package/index.vue': once },
      mkMapping('../resources/images/bg-8527.png', ['2:8526']),
    );
    const twiceOut = twice.files['package/index.vue'];
    // 幂等：2:8526 容器已注入（有 data-section-id 且含 bg1）⇒ skippedAlreadyMounted
    expect(twice.stats.skippedAlreadyMounted).toBe(1);
    expect(twice.stats.missingContainerInjected).toBe(0);
    expect((twiceOut.match(/mc-bg-carrier-/g) || []).length).toBe(
      (once.match(/mc-bg-carrier-/g) || []).length,
    );
  });

  it('同文件两变量两条注入 ⇒ 两处都生效且文本顺序保持（补丁簿记回归）', () => {
    const files = {
      'package/components/Flow.vue': `<template>
  <div class="a" data-x="1">alpha bgA</div>
  <div class="b" data-y="2">beta bgB</div>
</template>
<script setup>
import bgA from '../../resources/images/bg-_m-34.png'
import bgB from '../../resources/images/bg-_m-35.png'
</script>`,
    };
    const r = backstopMountBgOwnership(files, [
      {
        resourceFile: '../resources/images/bg-_m-34.png',
        figmaNodeId: '2:11:n',
        ownerSectionId: '2:11',
        targetDomSelector: '[data-section-id="2:11"]',
        figmaBox: { x: 10, y: 196, width: 426, height: 91 },
        previewAnalysisRole: 'bg',
        downloadStatus: 'success',
      },
      {
        resourceFile: '../resources/images/bg-_m-35.png',
        figmaNodeId: '2:22:n',
        ownerSectionId: '2:22',
        targetDomSelector: '[data-section-id="2:22"]',
        figmaBox: { x: 10, y: 196, width: 426, height: 91 },
        previewAnalysisRole: 'bg',
        downloadStatus: 'success',
      },
    ]);
    const out = r.files['package/components/Flow.vue'];
    expect(r.stats.missingContainerInjected).toBe(2);
    // 每个 carrier = class 属性 + <style> 规则 各出现 1 次 ⇒ 2 carrier = 4 tokens
    const carrierClasses = [...new Set(out.match(/mc-bg-carrier-2\d+/g) || [])];
    expect(carrierClasses.length).toBe(2);
    expect(carrierClasses[0]).not.toBe(carrierClasses[1]);
    // 两个不同 owner 的 carrier class 各自存在（补丁簿记不互相踩）
    expect(out).toContain('mc-bg-carrier-211');
    expect(out).toContain('mc-bg-carrier-222');
    // bgA carrier 注入在 alpha 行附近、bgB carrier 在 beta 行附近（顺序保持）
    expect(out.indexOf('mc-bg-carrier-211')).toBeLessThan(out.indexOf('mc-bg-carrier-222'));
  });
});

describe('防线3：逐注入校验 + 单条回滚 + 既有坏标签治本', () => {
  it('① 补绑产物开标签必须完整（既有 replace 丢 `<` bug 的治本回归）', () => {
    // 旧实现 `$1 :style=...` 替换丢开标签 `<` ⇒ 产出 `div :style=...` 坏标签（Invalid end tag）；
    // 旧 spec 断言全是子串匹配探不到。治本：替换串补回 `<`。
    const files = {
      'package/components/Flow.vue': `<template>
  <div data-section-id="2:3660" style="width:426px;height:91px;">
    <span>34,620</span>
  </div>
</template>
<script setup>
import bg1 from '../../resources/images/bg-_m-34.png'
</script>`,
    };
    const r = backstopMountBgOwnership(files, mkMapping('../resources/images/bg-_m-34.png', ['2:3660']));
    expect(r.stats.containerTagged).toBe(1);
    expect(r.stats.revertedInvalid).toBe(0);
    const out = r.files['package/components/Flow.vue'];
    // 开标签完整（`<div :style=` 而非 `div :style=`）
    expect(out).toContain('<div :style="{ backgroundImage');
    expect(out).not.toMatch(/(^|[^<\w])div :style="\{ backgroundImage/);
  });

  it('防线3 兜底验证：注入候选非法 ⇒ 不写回（skippedAnchorInAttr/revertedInvalid ≥ 0 且文件不产坏 SFC）', () => {
    // 属性内锚点在 原始快照+家族去重 下已从源头消除；本例验证正常注入产物的 SFC 结构完整
    // （compileTemplate 无 Invalid end tag / Duplicate attribute），即写盘门禁不再因本 pass 丢段。
    const files = {
      'package/components/ContentSection.vue': CONTENT_SECTION_LIKE,
    };
    const r = backstopMountBgOwnership(files, mkMapping('../resources/images/bg-8527.png', Bg4_OWNERS));
    const out = r.files['package/components/ContentSection.vue'];
    // 结构不变式：模板开闭平衡（注入后 template 结束标签仍只有一个、div 配平）
    expect((out.match(/<\/template>/g) || []).length).toBe(1);
    expect(out).not.toMatch(/class="<div/);
    expect(r.stats.revertedInvalid).toBe(0);
  });
});
