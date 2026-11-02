/**
 * R8-5 空壳对账·独立扫描（2026-11-02 · mc-max-1793611296269-ea3798f8 实锤立项）
 *
 * 病灶：R8-1 收敛逻辑被锁死在 `healDuplicateTextIssues` 的**重复文本剥离**前提里
 *   （`duplicateTextIssues.length === 0` 整函数早退）。ea3798f8 实锤（设备详情 36:1693 重投）：
 *   vision 切出 801:10 / 801:23 两个幻觉锚点段（日志：「锚点 801:10 不在 Figma 树中」，
 *   refs=[801:11..22] 全部 missingRefs），生成组件**从头就没有文本产出**
 *   （CardGrid.vue 模板空 div、ContentSection.vue 空 span/p）⇒ 无重复文本可剥 ⇒
 *   R8-1 永不触发（server.log 17:2x 后 R8 计数行 = 0）⇒ 两个空壳段各占 index.vue 的
 *   `flex:1` 高度直接落盘 ⇒ 用户实拍 2/3 大片空白。
 *
 * R8-5（评审定案）：写盘前对全部挂 data-section-id 的 section 组件**独立扫描**——
 *   判据① 幻觉段：isHallucinatedSection（(a) sourceNodeIds 空 / (b) 非空但 100% 不在
 *          Figma 真值树——判据单一来源，与 R8-1 共用）；
 *   判据② 空壳：extractRenderedText 空白归零；
 *   双判据同时成立 ⇒ 整段收敛（动作与 R8-1 完全同构：index.vue 挂载+import 移除、
 *   files 剔除，graph 层凭 collapsedSections 删盘上文件）。
 *   真锚段空壳 ⇒ 保护档 emptyShellSections 显式计数（不猜）。
 *   plan 无该 section id ⇒ 不归属本刀，跳过。
 *
 * 阳性对照：ea3798f8 801:10 / 801:23 逐字复刻（判据 (b) 命中）。
 * 变异对照：摘判据 (b)（isHallucinatedSection 退回只判空）⇒ ①② 必红。
 */
// 🚨 与 hallucinated-section-collapse.spec.ts 同口径：import 链经 logger → config/backend-root.js
//    ⇒ virtual mock。
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
  collapseHallucinatedEmptySections,
} from '../section-content-guard.js';
import { assignSectionComponentNames } from '../section-tree.js';

const TITLE = '设备详情';
const DESC = 'GD-Robot-04 太阳能供电一体化爆闪灯';

/** Figma 真值：只有 801:3 子树。801:10/801:11/801:12/801:23/801:24 全部不在树内
 *  （ea3798f8 实锤：vision 编造锚点，refs 100% missingRefs）。 */
function makeFigma() {
  return {
    id: '1:1', name: 'root', type: 'FRAME',
    children: [
      {
        id: '801:3', name: 'device-header', type: 'GROUP',
        absoluteBoundingBox: { x: 0, y: 0, width: 604, height: 260 },
        children: [
          { id: '801:31', name: 't1', type: 'TEXT', characters: TITLE, absoluteBoundingBox: { x: 8, y: 8, width: 100, height: 20 } },
          { id: '801:32', name: 't2', type: 'TEXT', characters: DESC, absoluteBoundingBox: { x: 8, y: 36, width: 580, height: 120 } },
        ],
      },
    ],
  };
}

/** plan：三段与 ea3798f8 产物同构——801:3 真段 + 801:10/801:23 幻觉锚点段（refs 全缺失） */
function makePlan() {
  return {
    effectiveSections: [
      { id: '801:3', name: '设备详情头部', sourceNodeIds: ['801:3'] },
      { id: '801:10', name: '设备属性网格', sourceNodeIds: ['801:11', '801:12'] },
      { id: '801:23', name: '产品描述', sourceNodeIds: ['801:24'] },
    ],
  };
}

function resolveNames(plan) {
  const nameOf = assignSectionComponentNames(plan.effectiveSections);
  return {
    headerName: nameOf.get('801:3'),
    gridName: nameOf.get('801:10'),
    descName: nameOf.get('801:23'),
  };
}

/** 产物与 ea3798f8 同构：CardGrid 空壳 div（无任何文本）、ContentSection 空 span/p */
function makeFiles(headerName, gridName, descName) {
  return [
    {
      path: 'package/index.vue',
      content: `<template>
  <div class="c-device-slot-con">
    <${headerName} style="flex:1.000;min-height:0;" />
    <${gridName} style="flex:1;min-height:0;" />
    <${descName} style="flex:1;min-height:0;" />
  </div>
</template>
<script setup>
import ${headerName} from './components/${headerName}.vue'
import ${gridName} from './components/${gridName}.vue'
import ${descName} from './components/${descName}.vue'
</script>`,
    },
    {
      path: `package/components/${headerName}.vue`,
      content: `<template>
  <div class="c-device-content-header" data-section-id="801:3">
    <span>${TITLE}</span>
    <p>${DESC}</p>
  </div>
</template>`,
    },
    {
      path: `package/components/${gridName}.vue`,
      content: `<template>
  <div class="c-device-card-grid" data-section-id="801:10"></div>
</template>
<script setup>
// 设备属性网格段：Figma 真值子树无文本节点，禁止自造文案
</script>`,
    },
    {
      path: `package/components/${descName}.vue`,
      content: `<template>
  <div class="c-device-content-section" data-section-id="801:23">
    <div class="c-device-content-section-header">
      <span class="c-device-content-section-title"></span>
    </div>
    <div class="c-device-content-section-body">
      <p class="c-device-content-section-desc"></p>
    </div>
  </div>
</template>`,
    },
  ];
}

const validSfc = () => ({ valid: true, errors: [] });

describe('R8-5 空壳对账·独立扫描（ea3798f8 实锤）', () => {
  it('① 阳性（801:10/801:23 逐字复刻）：判据(b) 全锚点不在真值树 + 空壳 ⇒ 两段整段收敛', () => {
    const plan = makePlan();
    const { headerName, gridName, descName } = resolveNames(plan);
    const files = makeFiles(headerName, gridName, descName);

    const r = collapseHallucinatedEmptySections({ files, plan, figmaRoot: makeFigma(), validateSfc: validSfc });
    expect(r.scanned).toBe(3);
    expect(r.collapsedSections).toHaveLength(2);
    expect(r.collapsedSections.map((c) => c.sectionId).sort()).toEqual(['801:10', '801:23']);
    // 空壳组件从 files 剔除
    expect(r.files.some((f) => f.path === `package/components/${gridName}.vue`)).toBe(false);
    expect(r.files.some((f) => f.path === `package/components/${descName}.vue`)).toBe(false);
    // 真段组件完整保留
    expect(r.files.some((f) => f.path === `package/components/${headerName}.vue`)).toBe(true);
    // index.vue 挂载与 import 只移除空壳两段
    const idx = r.files.find((f) => f.path === 'package/index.vue');
    expect(idx.content).not.toContain(gridName);
    expect(idx.content).not.toContain(descName);
    expect(idx.content).toContain(headerName);
  });

  it('② 核心差异：无重复文本问题（healDuplicateTextIssues 会早退的场景）R8-5 仍独立生效', () => {
    // files 只含空壳段 + index（无 801:3 真段组件）⇒ 全库无重复文本，R8-1 前提不成立
    const plan = makePlan();
    const { gridName, descName } = resolveNames(plan);
    const files = [makeFiles('HeaderX', gridName, descName)[0]];
    files.push({
      path: `package/components/${gridName}.vue`,
      content: `<template>\n  <div class="c-device-card-grid" data-section-id="801:10"></div>\n</template>`,
    });

    const r = collapseHallucinatedEmptySections({ files, plan, figmaRoot: makeFigma(), validateSfc: validSfc });
    expect(r.collapsedSections).toHaveLength(1);
    expect(r.collapsedSections[0]).toEqual(
      expect.objectContaining({ file: `package/components/${gridName}.vue`, sectionId: '801:10' }),
    );
  });

  it('③ 保护档：sourceNodeIds 指向真值树内节点 + 空壳 ⇒ 不收敛，emptyShellSections 显式计数', () => {
    const plan = {
      effectiveSections: [
        { id: '801:3', name: '设备详情头部', sourceNodeIds: ['801:3'] },
        { id: '801:40', name: '真实锚点空壳', sourceNodeIds: ['801:31'] }, // 801:31 在真值树
      ],
    };
    const nameOf = assignSectionComponentNames(plan.effectiveSections);
    const headerName = nameOf.get('801:3');
    const shellName = nameOf.get('801:40');
    const files = [
      {
        path: 'package/index.vue',
        content: `<template>\n  <div>\n    <${headerName} style="flex:1;" />\n    <${shellName} style="flex:1;" />\n  </div>\n</template>\n<script setup>\nimport ${headerName} from './components/${headerName}.vue'\nimport ${shellName} from './components/${shellName}.vue'\n</script>`,
      },
      {
        path: `package/components/${headerName}.vue`,
        content: `<template>\n  <div data-section-id="801:3"><span>${TITLE}</span></div>\n</template>`,
      },
      {
        path: `package/components/${shellName}.vue`,
        content: `<template>\n  <div data-section-id="801:40"></div>\n</template>`,
      },
    ];

    const r = collapseHallucinatedEmptySections({ files, plan, figmaRoot: makeFigma(), validateSfc: validSfc });
    expect(r.collapsedSections).toHaveLength(0);
    expect(r.emptyShellSections).toHaveLength(1);
    expect(r.emptyShellSections[0]).toEqual(
      expect.objectContaining({ file: `package/components/${shellName}.vue`, sectionId: '801:40' }),
    );
    expect(r.files.some((f) => f.path === `package/components/${shellName}.vue`)).toBe(true);
  });

  it('④ 差分 SFC 否决：收敛改坏 index.vue ⇒ 回滚（组件/挂载保留）+ rollback-sfc 留痕', () => {
    const plan = makePlan();
    const { headerName, gridName, descName } = resolveNames(plan);
    const files = makeFiles(headerName, gridName, descName);
    const strictSfc = (content, p) =>
      p === 'package/index.vue' && (!content.includes(gridName) || !content.includes(descName))
        ? { valid: false, errors: ['模拟：收敛后改坏'] }
        : { valid: true, errors: [] };

    const r = collapseHallucinatedEmptySections({ files, plan, figmaRoot: makeFigma(), validateSfc: strictSfc });
    expect(r.collapsedSections).toHaveLength(0);
    const rollback = r.emptyShellSections.filter((e) => e.reason === 'collapse-rollback-sfc');
    expect(rollback.length).toBeGreaterThanOrEqual(1);
    expect(r.files.some((f) => f.path === `package/components/${gridName}.vue`)).toBe(true);
    const idx = r.files.find((f) => f.path === 'package/index.vue');
    expect(idx.content).toContain(gridName);
  });

  it('⑤ fail-open：figmaRoot 缺失 ⇒ 判据(b) 停用（保守不猜），refs 非空的空壳段不收敛', () => {
    const plan = makePlan();
    const { headerName, gridName, descName } = resolveNames(plan);
    const files = makeFiles(headerName, gridName, descName);

    const r = collapseHallucinatedEmptySections({ files, plan, figmaRoot: undefined, validateSfc: validSfc });
    expect(r.collapsedSections).toHaveLength(0);
    expect(r.files.some((f) => f.path === `package/components/${gridName}.vue`)).toBe(true);
  });

  it('⑥ 阴性：有文本的段（非空壳）零处置', () => {
    const plan = makePlan();
    const { headerName } = resolveNames(plan);
    const files = [
      {
        path: 'package/index.vue',
        content: `<template>\n  <div>\n    <${headerName} style="flex:1;" />\n  </div>\n</template>\n<script setup>\nimport ${headerName} from './components/${headerName}.vue'\n</script>`,
      },
      {
        path: `package/components/${headerName}.vue`,
        content: `<template>\n  <div data-section-id="801:3"><span>${TITLE}</span><p>${DESC}</p></div>\n</template>`,
      },
    ];

    const r = collapseHallucinatedEmptySections({ files, plan, figmaRoot: makeFigma(), validateSfc: validSfc });
    expect(r.scanned).toBe(1);
    expect(r.collapsedSections).toHaveLength(0);
    expect(r.emptyShellSections).toHaveLength(0);
  });

  it('⑦ 幂等：收敛后重跑（组件已剔除）⇒ 零处置', () => {
    const plan = makePlan();
    const { headerName, gridName, descName } = resolveNames(plan);
    const files = makeFiles(headerName, gridName, descName);
    const first = collapseHallucinatedEmptySections({ files, plan, figmaRoot: makeFigma(), validateSfc: validSfc });
    expect(first.collapsedSections).toHaveLength(2);
    const second = collapseHallucinatedEmptySections({ files: first.files, plan, figmaRoot: makeFigma(), validateSfc: validSfc });
    expect(second.collapsedSections).toHaveLength(0);
    expect(second.emptyShellSections).toHaveLength(0);
  });
});
