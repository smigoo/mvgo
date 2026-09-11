/**
 * 🛡️ 回归 spec（2026-09-11，mc-max-1789087823487-0ca84358 实锤）
 *
 * 事故链：index.vue 具名插槽（<template #header-right>）在主内容之前 →
 *   ① _unionTemplateTagSubComponents lazy `</template>` 截断 → 只 union 到 HeaderSection
 *     → SwitchSection/TabsSection/MainSection 子组件文件永不生成；
 *   ② pruneDeadSubComponentImports 同样截断 → 误判三个 import「模板未引用」→ 删除；
 *   → 悬空标签三件套（渲染空白无报错）。
 * 根因：lazy `</template>` 被具名插槽提前闭合 —— 共享边界法 sfc-template-extractor 根治。
 */
import { extractSfcTemplate, stripNamedSlotBlocks, extractSfcTemplateRegion } from '../sfc-template-extractor.js';
import { pruneDeadSubComponentImports } from '../../roles/microcode/resource-mounter.js';

/** 0ca84358 事故结构复刻：具名插槽在前、主内容标签在后 */
const SLOT_FIRST_INDEX_VUE = `<template>
  <base-panel class="c-device-monitor-nodvhsu2" panelKey="default-panel">
    <template #header-right>
      <HeaderSection />
    </template>
    <div class="c-device-monitor-nodvhsu2-c-device-monitor-slot-con">
      <SwitchSection />
      <TabsSection />
      <MainSection />
    </div>
  </base-panel>
</template>

<script setup>
import { onMounted } from 'vue'
import HeaderSection from './components/HeaderSection.vue'
import SwitchSection from './components/SwitchSection.vue'
import TabsSection from './components/TabsSection.vue'
import MainSection from './components/MainSection.vue'
</script>
`;

describe('extractSfcTemplate（共享边界法）', () => {
  it('具名插槽不截断：插槽后的主内容标签完整可见（0ca84358 回归）', () => {
    const tpl = extractSfcTemplate(SLOT_FIRST_INDEX_VUE)!;
    expect(tpl).toContain('<HeaderSection />');
    expect(tpl).toContain('<SwitchSection />');
    expect(tpl).toContain('<TabsSection />');
    expect(tpl).toContain('<MainSection />');
  });

  it('stripSlots 只在调用方明确要求时剥离插槽块', () => {
    const stripped = extractSfcTemplateRegion(SLOT_FIRST_INDEX_VUE, { stripSlots: true })!;
    expect(stripped).not.toContain('<HeaderSection />');
    expect(stripped).toContain('<MainSection />');
  });

  it('无 template 返回 null', () => {
    expect(extractSfcTemplate('<script setup></script>')).toBeNull();
  });

  it('HTML 注释被剥离（注释里的标签不参与引用判定）', () => {
    const tpl = extractSfcTemplate(
      '<template>\n<!-- <GhostSection /> -->\n<div class="x"><Real /></div>\n</template>',
    )!;
    expect(tpl).not.toContain('<GhostSection />');
    expect(tpl).toContain('<Real />');
  });
});

describe('pruneDeadSubComponentImports（0ca84358 回归）', () => {
  it('插槽在前 + 主内容标签在后：四个 import 全部保留，无一误删', () => {
    const out = pruneDeadSubComponentImports(SLOT_FIRST_INDEX_VUE);
    for (const name of ['HeaderSection', 'SwitchSection', 'TabsSection', 'MainSection']) {
      expect(out).toContain(`import ${name}`);
    }
  });

  it('真正的死 import（模板 0 引用）仍被确定性移除', () => {
    const content = `<template>
  <base-panel>
    <div class="x"><LiveSection /></div>
  </base-panel>
</template>
<script setup>
import LiveSection from './components/LiveSection.vue'
import DeadSection from './components/DeadSection.vue'
</script>`;
    const out = pruneDeadSubComponentImports(content);
    expect(out).toContain('import LiveSection');
    expect(out).not.toContain('DeadSection');
  });
});

describe('_unionTemplateTagSubComponents 同口径（模板区全标签可见）', () => {
  // ⚠️ 不能 import sfc-semantics.extractComponentTagNames（import.meta → jest 陷阱），
  // 此处用同口径正则内联验证「模板区可见性」这一关键性质。
  const tagNames = (tpl: string) =>
    [...tpl.matchAll(/<([A-Z][\w-]*)/g)].map((m) => m[1]);

  it('插槽后主内容标签全部可见（供 union 生成清单使用）', () => {
    const tpl = extractSfcTemplate(SLOT_FIRST_INDEX_VUE)!;
    const tags = tagNames(tpl).filter((t) => !/^(BasePanel|Template)$/.test(t));
    expect(tags).toContain('SwitchSection');
    expect(tags).toContain('TabsSection');
    expect(tags).toContain('MainSection');
    expect(tags).toContain('HeaderSection');
  });
});

describe('stripNamedSlotBlocks（根容器识别防误判专用）', () => {
  it('剥离插槽块后主内容仍在', () => {
    const stripped = stripNamedSlotBlocks(
      '<template><template #t><div class="diamond"></div></template><div class="root"></div></template>',
    );
    expect(stripped).not.toContain('diamond');
    expect(stripped).toContain('class="root"');
  });
});
