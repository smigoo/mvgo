/**
 * 🧬 刀67：跨段文案归一比对（2026-11-06 · 7d3fc546 实锤）。
 *
 * 病灶链：LLM 把「共6个节点」拆成 `<span>共</span><span> </span><span>6</span>…` ⇒
 * `extractTemplateText` 剥标签边界退化为空格 ⇒ 抽取 `共  6  个节点`，真值无空白 ⇒
 * 原口径 `includes` 恒 false ⇒ 借据判据与 duplicateText 四比对点双双失明。
 *
 * 修法：4 处比对点走 `normalizeForMatch`（单一出口）；healing 对节点形态删不掉的
 * 跨 span 场景回退「容器级整块删除」（三重护栏：非组件根 / 非 data-section-id 载体 /
 * 纯文本容器），归一**恰等**定位（F1：纯数字/跨容器拼字不得按子串盲删）。
 */
import {
  checkSectionExclusiveEvidence,
  healBorrowedEvidence,
  healDuplicateTextIssues,
  removeBorrowedTextContainer,
} from './section-content-guard.js';
import { assignSectionComponentNames } from './section-tree.js';

jest.mock('../../config/backend-root.js', () => ({
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

function node(id: string, name: string, type: string, x: number, y: number, children: any[] = []) {
  return { id, name, type, absoluteBoundingBox: { x, y, width: 10, height: 10 }, children };
}
function text(id: string, name: string, x: number, y: number, characters?: string) {
  const n: any = node(id, name, 'TEXT', x, y);
  if (characters !== undefined) n.characters = characters;
  return n;
}

// 与 section-content-guard.spec.ts 借据 describe 同款树 + 7d3fc546 病灶文本（真值无空白）
const figmaRoot: any = {
  id: 'root', name: 'cp', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 400 },
  children: [
    {
      id: '2:3660', name: 'row', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 60 },
      children: [
        {
          id: '2:3680', name: 'card', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 52 },
          children: [
            text('2:3681', 't-江阴大桥', 0, 0, '江阴大桥'),
            text('2:3682', 'd-82,379', 0, 30, '82,379'),
          ],
        },
        {
          id: '2:3683', name: 'card', type: 'GROUP', absoluteBoundingBox: { x: 200, y: 0, width: 100, height: 52 },
          children: [
            text('2:3684', 't-江阴靖江长江隧道', 200, 0, '江阴靖江长江隧道'),
            text('2:3685', 'd-34,620', 200, 30, '34,620'),
          ],
        },
      ],
    },
    {
      id: '2:3438', name: 'row', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 100, width: 400, height: 120 },
      children: [
        {
          id: '2:3444', name: 'card', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 100, width: 100, height: 120 },
          children: [
            text('2:3450', 'bg', 0, 100),
            text('2:3445', 't-客车', 0, 100, '客车'),
            text('2:3446', 'd-22350', 0, 130, '22350'),
            // 🧬 7d3fc546 病灶：真值「共6个节点」（characters 无空白）
            text('2:3460', 'footer-text', 0, 160, '共6个节点'),
          ],
        },
      ],
    },
  ],
};

function makePlan(): any {
  return {
    effectiveSections: [
      {
        id: '2:3660', title: 'row', sourceNodeIds: ['2:3660'],
        isLayoutContainer: true,
        children: [
          { id: '2:3680', title: 'card', body: { layout: 'vertical' }, sourceNodeIds: ['2:3680'] },
          { id: '2:3683', title: 'card', body: { layout: 'vertical' }, sourceNodeIds: ['2:3683'] },
        ],
      },
      {
        id: '2:3438', title: 'row', sourceNodeIds: ['2:3438'],
        isLayoutContainer: true,
        children: [
          { id: '2:3444', title: 'card', body: { layout: 'vertical' }, sourceNodeIds: ['2:3444'] },
        ],
      },
    ],
  };
}

// 组件名由 assignSectionComponentNames 决定（与真机同口径）
function fileFor(sectionId: string, content: string) {
  const names = assignSectionComponentNames(makePlan().effectiveSections);
  return { path: `package/components/${names.get(sectionId)}.vue`, content };
}

// 7d3fc546 形态：LLM 把整句拆进多个 span（标签边界退化为空格）
const CROSS_SPAN_FOOTER =
  '<template><div class="node-card"><div class="node-footer">'
  + '<span>共</span><span> </span><span>6</span><span> 个节点</span>'
  + '</div></div></template>';

describe('刀67 · checkSectionExclusiveEvidence 归一比对口径', () => {
  it('阳性：跨 span 拆词借据命中 + normalizedOnly=1（原口径 includes 不中）', () => {
    const files = [fileFor('2:3680', CROSS_SPAN_FOOTER)];
    const r = checkSectionExclusiveEvidence({ files, plan: makePlan(), figmaRoot });
    const hit = r.borrowedTextIssues.find((i: any) => i.text === '共6个节点');
    expect(hit).toBeTruthy();
    expect(hit.ownerSection).toBe('2:3444');
    expect(r.caliber).toEqual({ normalizedOnly: 1 });
  });

  it('阴性：原口径可命中的整句借据，normalizedOnly=0（不虚增灰度计数）', () => {
    const files = [fileFor('2:3680', '<template><div class="node-card"><span>客车</span></div></template>')];
    const r = checkSectionExclusiveEvidence({ files, plan: makePlan(), figmaRoot });
    expect(r.borrowedTextIssues.map((i: any) => i.text)).toContain('客车');
    expect(r.caliber).toEqual({ normalizedOnly: 0 });
  });

  it('阴性：跨 span 但归属正确（自己渲染自己的真值）→ 不报', () => {
    const files = [fileFor('2:3444', CROSS_SPAN_FOOTER)];
    const r = checkSectionExclusiveEvidence({ files, plan: makePlan(), figmaRoot });
    expect(r.borrowedTextIssues).toEqual([]);
    expect(r.caliber).toEqual({ normalizedOnly: 0 });
  });

  it('fail-open：空文件 / plan 缺失 → 空结果且 caliber 归零', () => {
    expect(checkSectionExclusiveEvidence({ files: [], plan: makePlan(), figmaRoot }).caliber)
      .toEqual({ normalizedOnly: 0 });
    const r = checkSectionExclusiveEvidence({ files: [fileFor('2:3680', CROSS_SPAN_FOOTER)], plan: null, figmaRoot });
    expect(r.borrowedTextIssues).toEqual([]);
    expect(r.caliber).toEqual({ normalizedOnly: 0 });
  });
});

describe('刀67 · removeBorrowedTextContainer 容器级整块删除', () => {
  const okValidate = () => ({ valid: true, errors: [] });

  it('阳性：跨 span footer 容器整块删除；嵌套时取满足护栏的最外层纯文本容器', () => {
    // div.wrap 的直接子节点是 footer（非 inline 白名单）→ 护栏③挡掉 → 落到 footer 容器
    const content =
      '<template><div class="wrap"><div class="node-card"><footer class="node-footer">'
      + '<span>共</span><span> </span><span>6</span><span> 个节点</span>'
      + '</footer></div></div></template>';
    const r: any = removeBorrowedTextContainer(content, '共6个节点');
    expect(r).not.toBeNull();
    expect(r.container).toContain('footer');
    expect(r.content).not.toContain('node-footer');
    expect(r.content).toContain('wrap'); // 外层结构保留
  });

  it('阴性（F1④）：纯数字按「恰等」定位——span 内混排（接入设备22350台）→ 不删（不按子串盲删）', () => {
    // 归一化 includes 语义已从「整句」退化为「子串」⇒ healing 容器级二次定位必须恰等：
    // 混排 span 归一 ≠ 纯数字 → 无恰等节点 → 拒删
    const content =
      '<template><div class="node-card"><footer class="node-footer">'
      + '<span>接入设备22350台</span>'
      + '</footer></div></template>';
    expect(removeBorrowedTextContainer(content, '22350')).toBeNull();
  });

  it('对照：恰等单 span（数字独占节点）→ 只删该 span，footer 容器完整保留（非盲删）', () => {
    const content =
      '<template><div class="node-card"><footer class="node-footer">'
      + '<span>接入设备</span><span>22350</span><span>台</span>'
      + '</footer></div></template>';
    const r: any = removeBorrowedTextContainer(content, '22350');
    expect(r).not.toBeNull();
    expect(r.container).toBe('<span>');
    expect(r.content).toContain('node-footer'); // 容器不误伤
    expect(r.content).not.toContain('>22350<');
  });

  it('护栏①：目标容器是组件根元素（template 直接子级）→ 不删', () => {
    const content =
      '<template><footer class="node-footer">'
      + '<span>共</span><span> </span><span>6</span><span> 个节点</span>'
      + '</footer></template>';
    expect(removeBorrowedTextContainer(content, '共6个节点')).toBeNull();
  });

  it('护栏②：目标容器带 data-section-id（段身份载体）→ 不删', () => {
    const content =
      '<template><div><footer class="node-footer" data-section-id="2:3444">'
      + '<span>共</span><span> </span><span>6</span><span> 个节点</span>'
      + '</footer></div></template>';
    expect(removeBorrowedTextContainer(content, '共6个节点')).toBeNull();
  });

  it('护栏③：容器直接子节点含 img（非纯文本容器）→ 不删', () => {
    const content =
      '<template><div><footer class="node-footer">'
      + '<img :src="bg" /><span>共</span><span> </span><span>6</span><span> 个节点</span>'
      + '</footer></div></template>';
    expect(removeBorrowedTextContainer(content, '共6个节点')).toBeNull();
  });

  it('护栏③：容器含 {{ }} 插值 → 不删', () => {
    const content =
      '<template><div><footer class="node-footer">'
      + '<span>共</span><span>{{ n }}</span><span> 个节点</span>'
      + '</footer></div></template>';
    expect(removeBorrowedTextContainer(content, '共6个节点')).toBeNull();
  });

  it('护栏③：容器带 v-for 指令 → 不删', () => {
    const content =
      '<template><div><footer class="node-footer" v-for="n in list" :key="n">'
      + '<span>共</span><span> </span><span>6</span><span> 个节点</span>'
      + '</footer></div></template>';
    expect(removeBorrowedTextContainer(content, '共6个节点')).toBeNull();
  });

  it('无法唯一定位：两个位置都有恰等容器 → 不删（宁漏不误伤）', () => {
    const content =
      '<template><div>'
      + '<div class="a"><span>共</span><span> </span><span>6</span><span> 个节点</span></div>'
      + '<div class="b"><span>共</span><span> </span><span>6</span><span> 个节点</span></div>'
      + '</div></template>';
    expect(removeBorrowedTextContainer(content, '共6个节点')).toBeNull();
  });
});

describe('刀67 · healBorrowedEvidence 容器级兜底集成', () => {
  it('阳性：跨 span 借据经容器级删除落地，healed 带 viaContainer 留痕', () => {
    const rec = fileFor('2:3680', CROSS_SPAN_FOOTER);
    const r = healBorrowedEvidence({ files: [rec], plan: makePlan(), figmaRoot });
    expect(r.healed.text).toHaveLength(1);
    expect(r.healed.text[0].text).toBe('共6个节点');
    expect(r.healed.text[0].viaContainer).toBeTruthy();
    expect(r.healed.text[0].viaContainer).toContain('footer');
    expect(rec.content).not.toContain('node-footer');
    expect(r.skippedNoSafeContainer).toBe(0);
  });

  it('留痕：借据命中但三重护栏不满足（容器即根元素）→ 零删除 + skippedNoSafeContainer=1', () => {
    const rec = fileFor('2:3680',
      '<template><footer class="node-footer">'
      + '<span>共</span><span> </span><span>6</span><span> 个节点</span>'
      + '</footer></template>');
    const r = healBorrowedEvidence({ files: [rec], plan: makePlan(), figmaRoot });
    expect(r.healed.text).toHaveLength(0);
    expect(r.skippedNoSafeContainer).toBe(1);
    expect(rec.content).toContain('node-footer'); // 原样保留
  });

  it('validateSfc 回退：容器删除后不可编译 → 回滚不落地', () => {
    const rec = fileFor('2:3680', CROSS_SPAN_FOOTER);
    const brokenValidate = (c: string) =>
      c.includes('node-footer')
        ? { valid: true, errors: [] }
        : { valid: false, errors: ['broken after removal'] };
    const r = healBorrowedEvidence({ files: [rec], plan: makePlan(), figmaRoot, validateSfc: brokenValidate });
    expect(r.healed.text).toHaveLength(0);
    expect(rec.content).toContain('node-footer'); // 回滚
  });
});

describe('刀67 · healDuplicateTextIssues 容器级兜底集成', () => {
  it('阳性：错装文件跨 span 渲染 owner 真值 → 容器级删除 + viaContainer 留痕', () => {
    // owner（2:3444 组件）确实产出且渲染「共6个节点」（静态整句）；
    // 错装文件（2:3680 组件）跨 span 拆词渲染同一文本（MIN_DUP_LEN=4：文本须 ≥4 字才进 duplicate）
    const files = [
      fileFor('2:3444', '<template><div class="card"><div class="meta"><span>共6个节点</span></div></div></template>'),
      fileFor('2:3680', CROSS_SPAN_FOOTER),
    ];
    const r = healDuplicateTextIssues({
      files,
      plan: makePlan(),
      figmaRoot,
      validateSfc: () => ({ valid: true, errors: [] }),
    });
    expect(r.healed).toHaveLength(1);
    expect(r.healed[0].text).toBe('共6个节点');
    expect(r.healed[0].viaContainer).toBeTruthy();
    expect(files[1].content).not.toContain('node-footer');
    expect(files[0].content).toContain('共6个节点'); // owner 侧不受影响
  });
});
