/**
 * 🛡️ G1（2026-11-09 · 669d8bf8 实锤）：零样式容器布局真值注入 家族 spec
 *
 * 用例：阳性（669d8bf8 同构最小复现：零样式容器 + 真值横排 ⇒ 注入 row + 子项 flex 比）
 *   阴性1（class 有规则块 ⇒ 非零样式容器，零注入）
 *   阴性2（行内已有 display ⇒ 跳过）
 *   阴性3（:style 动态绑定含 display ⇒ 保守跳过）
 *   阴性4（子项已有 flex 声明 ⇒ 不覆盖）
 *   混合排布（子节点非同行同列 ⇒ mixedSkipped 不猜）
 *   幂等（已注入内容重跑 changed=false）
 *   B1 口径（`>` 子组合器规则块被识别；同构兄弟容器偏移替换不错位）
 */
import { injectContainerLayoutTruth } from './container-layout-truth.js';

/** 构造 669d8bf8 同构 fixture：外层零样式容器 + 两横排子卡 */
function buildFixture({ lessContent = '', containerExtra = '', childPre = '' } = {}) {
  const content = [
    '<template>',
    '  <base-panel panelKey="default-panel">',
    '    <div class="root-con" style="display:flex;flex-direction:column;height:100%">',
    `      <div class="c-test-1263-38-con" data-section-id="1263:38" style="${containerExtra}">`,
    `        <div class="c-test-2-3446-con" data-section-id="2:3446" style="${childPre}min-height:0">`,
    '          <span>左卡</span>',
    '        </div>',
    '        <div class="c-test-2-3496-con" data-section-id="2:3496" style="min-height:0">',
    '          <span>右卡</span>',
    '        </div>',
    '      </div>',
    '    </div>',
    '  </base-panel>',
    '</template>',
    '',
    '<script setup>',
    "import L from './components/L.vue'",
    '</script>',
    '',
    '<style lang="less" scoped>',
    "@import '../resources/styles/index.less';",
    '</style>',
  ].join('\n');
  const styleSources = [
    { path: 'resources/styles/common.less', content: lessContent || '.c-test-other-con { display: flex; }' },
  ];
  // 真值：两卡横排（同 y 异 x、各 192 宽）——669d8bf8 实测几何
  const childrenBoxesOf = (sid) => {
    if (sid === '1263:38') {
      return [
        { id: '2:3446', box: { x: 32.8, y: 601, width: 192, height: 114 } },
        { id: '2:3496', box: { x: 227.8, y: 601, width: 192, height: 114 } },
      ];
    }
    if (sid === '2:3446') {
      return [
        { id: '88:36', box: { x: 33.8, y: 632, width: 191, height: 80.3 } },
        { id: '2:3474', box: { x: 64.8, y: 603, width: 129.5, height: 24.8 } },
      ];
    }
    return null;
  };
  return { content, styleSources, childrenBoxesOf };
}

describe('G1 零样式容器布局真值注入', () => {
  test('阳性：零样式容器 + 真值横排 ⇒ 注入 row 方向 + 两子卡 flex 0.5', () => {
    const f = buildFixture();
    const r = injectContainerLayoutTruth(f.content, f.styleSources, { childrenBoxesOf: f.childrenBoxesOf });
    expect(r.changed).toBe(true);
    expect(r.stats.zeroStyle).toBe(3);
    expect(r.injected).toEqual([{ sid: '1263:38', dir: 'row', flexes: [0.5, 0.5] }]);
    const line = r.content.split('\n').find((l) => l.includes('1263:38'));
    expect(line).toContain('display: flex; flex-direction: row');
    expect(r.content).toContain('flex: 0.5');
  });

  test('阴性1：class 有规则块 ⇒ 非零样式容器零注入', () => {
    const f = buildFixture({ lessContent: '.c-test-1263-38-con { padding: 4px; }' });
    const r = injectContainerLayoutTruth(f.content, f.styleSources, { childrenBoxesOf: f.childrenBoxesOf });
    expect(r.stats.zeroStyle).toBe(2); // 两个子卡仍零样式，但 2:3446 混合排布会跳过
    expect(r.injected).toEqual([]);
    expect(r.changed).toBe(false);
  });

  test('B1 口径：`>` 子组合器规则块被识别为有样式', () => {
    const f = buildFixture({ lessContent: '.root > .c-test-1263-38-con { padding: 4px; }' });
    const r = injectContainerLayoutTruth(f.content, f.styleSources, { childrenBoxesOf: f.childrenBoxesOf });
    expect(r.injected.find((x) => x.sid === '1263:38')).toBeFalsy();
  });

  test('阴性2：行内已有 display ⇒ 跳过该容器', () => {
    const f = buildFixture({ containerExtra: 'display:grid;' });
    const r = injectContainerLayoutTruth(f.content, f.styleSources, { childrenBoxesOf: f.childrenBoxesOf });
    expect(r.injected.find((x) => x.sid === '1263:38')).toBeFalsy();
  });

  test('阴性3：:style 动态绑定含 display ⇒ 保守跳过', () => {
    let content = buildFixture().content;
    content = content.replace(
      /(<div class="c-test-1263-38-con"[^>]*)(>)/,
      '$1 :style="{ display: dd }"$2',
    );
    const f = { content, styleSources: buildFixture().styleSources, childrenBoxesOf: buildFixture().childrenBoxesOf };
    const r = injectContainerLayoutTruth(f.content, f.styleSources, { childrenBoxesOf: f.childrenBoxesOf });
    expect(r.injected.find((x) => x.sid === '1263:38')).toBeFalsy();
    expect(r.stats.dynamicStyleSkipped).toBe(1);
  });

  test('阴性4：子项已有 flex 声明 ⇒ 不覆盖', () => {
    const f = buildFixture({ childPre: 'flex:1 1 0;' });
    const r = injectContainerLayoutTruth(f.content, f.styleSources, { childrenBoxesOf: f.childrenBoxesOf });
    expect(r.content).toContain('flex:1 1 0');
    // 左卡行不含新注入 flex: 0.5；右卡无 flex 仍被注入
    const iLeft = r.content.indexOf('c-test-2-3446-con');
    const leftSeg = r.content.slice(iLeft, iLeft + 200);
    expect(leftSeg).toContain('flex:1 1 0');
    expect(leftSeg).not.toContain('flex: 0.5');
    expect(r.content).toContain('flex: 0.5');
  });

  test('混合排布：子节点非同行同列 ⇒ mixedSkipped 不猜', () => {
    const f = buildFixture();
    const mixedBoxes = () => [
      { id: 'a', box: { x: 0, y: 0, width: 10, height: 10 } },
      { id: 'b', box: { x: 20, y: 5, width: 10, height: 10 } },
    ];
    const r = injectContainerLayoutTruth(f.content, f.styleSources, { childrenBoxesOf: mixedBoxes });
    expect(r.stats.mixedSkipped).toBeGreaterThanOrEqual(1);
    expect(r.changed).toBe(false);
  });

  test('幂等：已注入内容重跑 changed=false', () => {
    const f = buildFixture();
    const r1 = injectContainerLayoutTruth(f.content, f.styleSources, { childrenBoxesOf: f.childrenBoxesOf });
    expect(r1.changed).toBe(true);
    const r2 = injectContainerLayoutTruth(r1.content, f.styleSources, { childrenBoxesOf: f.childrenBoxesOf });
    expect(r2.changed).toBe(false);
    expect(r2.stats.injected).toBe(0);
  });

  test('B1 口径：同构兄弟容器（相同 tag 文本）偏移替换不错位', () => {
    // 两个完全同构的零样式容器，真值方向不同（一横一竖）——验证替换不串
    const content = [
      '<template>',
      '  <div class="wrap">',
      '    <div class="con" data-section-id="1:1" style="min-height:0">',
      '      <div class="k" style="min-height:0">A1</div>',
      '      <div class="k" style="min-height:0">A2</div>',
      '    </div>',
      '    <div class="con" data-section-id="1:2" style="min-height:0">',
      '      <div class="k" style="min-height:0">B1</div>',
      '      <div class="k" style="min-height:0">B2</div>',
      '    </div>',
      '  </div>',
      '</template>',
    ].join('\n');
    const boxes = (sid) => {
      if (sid === '1:1') {
        return [
          { id: 'k1', box: { x: 0, y: 0, width: 100, height: 50 } },
          { id: 'k2', box: { x: 100, y: 0, width: 100, height: 50 } },
        ]; // row
      }
      if (sid === '1:2') {
        return [
          { id: 'k3', box: { x: 0, y: 0, width: 100, height: 50 } },
          { id: 'k4', box: { x: 0, y: 50, width: 100, height: 50 } },
        ]; // column
      }
      return null;
    };
    const r = injectContainerLayoutTruth(content, [{ path: 'a.less', content: '.noop{}' }], {
      childrenBoxesOf: boxes,
    });
    expect(r.changed).toBe(true);
    expect(r.injected).toEqual([
      { sid: '1:1', dir: 'row', flexes: [0.5, 0.5] },
      { sid: '1:2', dir: 'column', flexes: [0.5, 0.5] },
    ]);
    const sec1 = r.content.split('\n').find((l) => l.includes('data-section-id="1:1"'));
    const sec2 = r.content.split('\n').find((l) => l.includes('data-section-id="1:2"'));
    expect(sec1).toContain('flex-direction: row');
    expect(sec2).toContain('flex-direction: column');
  });
});
