/**
 * R8-1 幻觉段整段收敛（2026-11-02 · mc-max-1793607696780-50d7793f 实锤立项）
 *
 * 病灶：vision 切段概率性把「产品描述」标题+全文**重复声明**给 801:3（真段，
 *   sourceNodeIds=['801:3']）与 431:47（**幻觉段**，sourceNodeIds=[]、anchorValid:false）。
 *   `healDuplicateTextIssues`（阶段 C）按「Figma 子树唯一归属」从非 owner 侧（431:47 的
 *   ContentSection.vue）确定性删除两文本 ⇒ 组件剥成**空壳**（空 span/p + 臆造卡壳）直接
 *   落盘 ⇒ 用户实拍第三张空白卡。同设计稿当日 3 单（07:03/07:52/08:24）必现。
 *
 * R8-1（评审定案）：删除后若同时满足——
 *   ① 被删组件对应 section 是**幻觉段**（plan 中 `sourceNodeIds` 空/缺失）；
 *   ② 剥后组件模板渲染文本为空（extractRenderedText 空白归零）；
 * ⇒ **整段收敛**：从 index.vue 移除挂载行 + import 行（差分 SFC 校验，失败回滚收敛）、
 *   从 files 剔除组件条目（后续 pass 不再看见）、返回 collapsedSections 供 graph 层删盘上文件。
 * 不满足（真锚段）⇒ 保护档：照旧删文本 + `emptyShellSections` 段级空壳计数行
 *   （R6-2 纪律：声明内容被显式计数放弃，禁止静默丢弃）。
 *
 * 阳性对照：50d7793f 431:47 幻觉段逐字复刻（当前只剥文本留空壳）。
 * 变异对照：摘收敛分支 ⇒ ①② 必红（空壳组件与 index 挂载残留）。
 */
// 🚨 与 pre-write-self-healing.spec.ts 同口径：import 链经 logger → config/backend-root.js
//    （import.meta.url，jest CJS 报 `Identifier '__filename' has already been declared`）⇒ virtual mock。
jest.mock('../../../config/backend-root.js', () => ({
  backendRoot: process.cwd(),
  projectRoot: process.cwd(),
  workspaceRoot: process.cwd() + '/workspace',
  customComponentsDir: process.cwd() + '/workspace/custom-components',
  vue3ComponentsDir: process.cwd() + '/workspace/vue3-components',
  tempComponentsDir: process.cwd() + '/temp-components',
  dataDir: process.cwd() + '/data',
  logsDir: process.cwd() + '/logs',
  configDir: process.cwd() + '/config',
  chatAttachmentsDir: process.cwd() + '/temp-chat-attachments',
  apifoxZipsDir: process.cwd() + '/data/apifox-zips',
  apiCatalogsDir: process.cwd() + '/data/api-catalogs',
  resolveFrontendWorkspacePath: () => process.cwd(),
  frontendCustomComponentsDir: () => process.cwd(),
  frontendVue3ComponentsDir: () => process.cwd(),
}), { virtual: true });
import {
  checkSectionContent,
  healDuplicateTextIssues,
} from '../section-content-guard.js';
import { assignSectionComponentNames } from '../section-tree.js';

const DESC = '该设备为太阳能供电一体化爆闪灯，采用红蓝双色高壳LED阵列，支持远程开关控制与闪烁频率调节';
const TITLE = '产品描述';

/** Figma 真值：801:3 子树含两文本；431:47 真值节点存在（R8-5 判据(b)：保护档用例的
 *  「真锚段」语义 = sourceNodeIds 指向**真值树内**节点）；431:48 为 vision 幻觉引用
 *  （不在树内，判据(b) 命中）。 */
function makeFigma() {
  return {
    id: '1:1', name: 'root', type: 'FRAME',
    children: [
      {
        id: '801:3', name: 'desc-section', type: 'GROUP',
        absoluteBoundingBox: { x: 0, y: 0, width: 604, height: 200 },
        children: [
          { id: '801:31', name: 't1', type: 'TEXT', characters: TITLE, absoluteBoundingBox: { x: 8, y: 8, width: 100, height: 20 } },
          { id: '801:32', name: 't2', type: 'TEXT', characters: DESC, absoluteBoundingBox: { x: 8, y: 36, width: 580, height: 120 } },
        ],
      },
      {
        id: '431:47', name: 'real-anchor-shell', type: 'GROUP',
        absoluteBoundingBox: { x: 0, y: 220, width: 604, height: 80 },
        children: [],
      },
    ],
  };
}

function makePlan(hallucinationSourceIds) {
  return {
    effectiveSections: [
      { id: '801:3', name: '产品描述区', sourceNodeIds: ['801:3'] },
      {
        id: '431:47', name: '产品描述', title: '产品描述',
        sourceNodeIds: hallucinationSourceIds,
        body: { children: [{ id: '431:48', text: DESC }] },
      },
    ],
  };
}

// 🔴 fixture 文件名与管线同构：owner/幻觉段组件名直接取 assignSectionComponentNames
//    的确定性输出（真实产物文件名就是它的输出，手推命名必错位——② 用例首跑实锤）。
function resolveNames(plan) {
  const nameOf = assignSectionComponentNames(plan.effectiveSections);
  return {
    ownerName: nameOf.get('801:3'),
    halluName: nameOf.get('431:47'),
  };
}

function makeFiles(ownerName, halluName) {
  return [
    {
      path: 'package/index.vue',
      content: `<template>
  <div class="c-device-slot-con">
    <${ownerName} style="flex:1.000;min-height:0;" />
    <${halluName} style="flex:1;min-height:0;" />
  </div>
</template>
<script setup>
import ${ownerName} from './components/${ownerName}.vue'
import ${halluName} from './components/${halluName}.vue'
</script>`,
    },
    {
      path: `package/components/${ownerName}.vue`,
      content: `<template>
  <div class="c-device-content-header" data-section-id="801:3">
    <span>${TITLE}</span>
    <p>${DESC}</p>
  </div>
</template>`,
    },
    {
      path: `package/components/${halluName}.vue`,
      content: `<template>
  <div class="c-device-content-section" data-section-id="431:47">
    <span>${TITLE}</span>
    <p>${DESC}</p>
  </div>
</template>`,
    },
  ];
}

const validSfc = () => ({ valid: true, errors: [] });

describe('R8-1 幻觉段整段收敛（50d7793f 实锤）', () => {
  it('① 阳性：幻觉段剥后空壳 ⇒ 组件从 files 剔除 + index.vue 挂载/import 一并移除', () => {
    const plan = makePlan([]);
    const { ownerName, halluName } = resolveNames(plan);
    const files = makeFiles(ownerName, halluName);
    // 前置：duplicate 判定本会命中（两文本唯一归属 801:3、渲染在 2 组件）
    const chk = checkSectionContent({ files, plan, figmaRoot: makeFigma() });
    expect(chk.duplicateTextIssues.length).toBeGreaterThanOrEqual(1);

    const r = healDuplicateTextIssues({ files, plan, figmaRoot: makeFigma(), validateSfc: validSfc });
    // 收敛记录
    expect(r.collapsedSections).toHaveLength(1);
    expect(r.collapsedSections[0]).toEqual(
      expect.objectContaining({ file: `package/components/${halluName}.vue`, sectionId: '431:47' }),
    );
    // 组件条目被剔除
    expect(r.files.some((f) => f.path === `package/components/${halluName}.vue`)).toBe(false);
    // index.vue 挂载与 import 移除，owner 组件完整保留
    const idx = r.files.find((f) => f.path === 'package/index.vue');
    expect(idx.content).not.toContain(halluName);
    expect(idx.content).toContain(ownerName);
    expect(idx.content).toContain(`<${ownerName} style="flex:1.000;min-height:0;" />`);
  });

  it('② 阳性：保护档（真锚段）只删文本不收敛 + emptyShellSections 计数', () => {
    // sourceNodeIds 非空 ⇒ 非幻觉段；figma 树内 431:47 无子树文本 ⇒ 仍会被判 duplicate
    const plan = makePlan(['431:47']);
    const { ownerName, halluName } = resolveNames(plan);
    const files = makeFiles(ownerName, halluName);
    const r = healDuplicateTextIssues({ files, plan, figmaRoot: makeFigma(), validateSfc: validSfc });
    expect(r.collapsedSections).toHaveLength(0);
    expect(r.emptyShellSections).toHaveLength(1);
    expect(r.emptyShellSections[0]).toEqual(
      expect.objectContaining({ file: `package/components/${halluName}.vue`, sectionId: '431:47' }),
    );
    // 组件保留（文本已删成空壳但结构在——保护档不猜）
    expect(r.files.some((f) => f.path === `package/components/${halluName}.vue`)).toBe(true);
    const idx = r.files.find((f) => f.path === 'package/index.vue');
    expect(idx.content).toContain(halluName);
  });

  it('③ 阴性（回归保护）：无重复渲染 ⇒ 零处置零计数', () => {
    const plan = makePlan([]);
    const { ownerName } = resolveNames(plan);
    const files = [
      {
        path: 'package/index.vue',
        content: `<template>
  <div class="c-device-slot-con">
    <${ownerName} style="flex:1;" />
  </div>
</template>
<script setup>
import ${ownerName} from './components/${ownerName}.vue'
</script>`,
      },
      {
        path: `package/components/${ownerName}.vue`,
        content: `<template>
  <div class="c-device-content-header" data-section-id="801:3">
    <span>${TITLE}</span>
    <p>${DESC}</p>
  </div>
</template>`,
      },
    ];
    const r = healDuplicateTextIssues({ files, plan, figmaRoot: makeFigma(), validateSfc: validSfc });
    expect(r.healed).toHaveLength(0);
    expect(r.collapsedSections).toHaveLength(0);
    expect(r.emptyShellSections).toHaveLength(0);
  });

  it('④ 阴性：index.vue 无该组件挂载行 ⇒ 放弃收敛（不猜），走保护档', () => {
    const plan = makePlan([]);
    const { ownerName, halluName } = resolveNames(plan);
    const files = makeFiles(ownerName, halluName);
    files[0].content = `<template>
  <div class="c-device-slot-con">
    <${ownerName} style="flex:1;" />
  </div>
</template>
<script setup>
import ${ownerName} from './components/${ownerName}.vue'
</script>`;
    const r = healDuplicateTextIssues({ files, plan, figmaRoot: makeFigma(), validateSfc: validSfc });
    expect(r.collapsedSections).toHaveLength(0);
    expect(r.emptyShellSections).toHaveLength(1); // 保护档：删文本留痕
    expect(r.files.some((f) => f.path === `package/components/${halluName}.vue`)).toBe(true);
  });

  it('⑤ 阴性：index.vue 收敛引入新 SFC 错误 ⇒ 回滚收敛（差分判据，走保护档）', () => {
    const plan = makePlan([]);
    const { ownerName, halluName } = resolveNames(plan);
    const files = makeFiles(ownerName, halluName);
    // 对 index.vue 严格（收敛即「改坏」）、对其余文件宽松 ⇒ 文本删除成功、收敛被差分否决
    const strictSfc = (content, p) =>
      p === 'package/index.vue' && !content.includes(halluName)
        ? { valid: false, errors: ['模拟：收敛后改坏'] }
        : { valid: true, errors: [] };
    const r = healDuplicateTextIssues({ files, plan, figmaRoot: makeFigma(), validateSfc: strictSfc });
    // 收敛被差分否决 ⇒ 回滚（组件保留、挂载保留），降级保护档
    expect(r.collapsedSections).toHaveLength(0);
    expect(r.files.some((f) => f.path === `package/components/${halluName}.vue`)).toBe(true);
    const idx = r.files.find((f) => f.path === 'package/index.vue');
    expect(idx.content).toContain(halluName);
  });

  it('⑥ 幂等：收敛后重跑（无重复）⇒ 零处置', () => {
    const plan = makePlan([]);
    const { ownerName, halluName } = resolveNames(plan);
    const files = makeFiles(ownerName, halluName);
    const first = healDuplicateTextIssues({ files, plan, figmaRoot: makeFigma(), validateSfc: validSfc });
    expect(first.collapsedSections).toHaveLength(1);
    const second = healDuplicateTextIssues({ files: first.files, plan, figmaRoot: makeFigma(), validateSfc: validSfc });
    expect(second.healed).toHaveLength(0);
    expect(second.collapsedSections).toHaveLength(0);
  });
});
