/**
 * layout-facts-injector 网格列数透传 + 非法 undefined 收口单测（2026-09-22 · c-device-monitor-e2ad7497 实锤）
 *
 * 根因1：buildNodeLayoutFactsReinforcement 构建 mapping 时曾漏传 gridColumns
 *   → 下游 fact.gridColumns>=2 恒 false → grid 节点落 flex 分支 → 写 undefined。
 * 根因2：flex 分支在 flexDirection 为 undefined（grid 容器本无 flex 方向）时仍注入 `flex-direction: undefined;`。
 *
 * 治本后断言：
 *  - buildLayoutMapping 必须把 grid 节点的 gridColumns 透传到 mapping；
 *  - display:'grid' 的节点走 grid 分支，注入 repeat(N,1fr) 而非 undefined；
 *  - 任何路径不得出现 `flex-direction: undefined`。
 */
import {
  injectLayoutFacts,
  buildLayoutMapping,
} from '../layout-facts-injector.js';
import { stripIllegalCssValues } from '../css-sanitizer.js';

const figmaNodeData = {
  document: {
    id: '2:8437',
    name: 'Cons',
    children: [{ id: '2:8437', name: 'Cons' }],
  },
};

describe('网格列数透传 + undefined 收口（e2ad7497 治本）', () => {
  it('buildLayoutMapping 必须透传 gridColumns', () => {
    const nodeLayoutFacts = {
      '2:8437': {
        display: 'grid',
        gridColumns: 3,
        flexDirection: undefined,
        source: 'geometric-grid-inference',
        confidence: 'high',
      },
    };
    const mapping = buildLayoutMapping(nodeLayoutFacts, figmaNodeData, 'device-monitor');
    expect(mapping['.c-device-monitor-cons']).toBeDefined();
    expect(mapping['.c-device-monitor-cons'].gridColumns).toBe(3);
  });

  it('grid 节点走 grid 分支，注入 3 列且不含 undefined', () => {
    const css = `.c-device-monitor-cons {
  display: flex;
  flex-direction: column;
}`;
    const mapping = {
      '.c-device-monitor-cons': { display: 'grid', gridColumns: 3 },
    };
    const r = injectLayoutFacts(css, mapping, { forceOverride: true });
    expect(r.content).toContain('display: grid');
    expect(r.content).toContain('repeat(3, 1fr)');
    expect(r.content).not.toContain('flex-direction: undefined');
    expect(r.content).not.toContain('flex-direction: column');
  });

  it('flex-direction: undefined 残留必须被 stripIllegalCssValues 清除', () => {
    const css = `.a {
  display: grid;
  flex-direction: undefined;
}`;
    const cleaned = stripIllegalCssValues(css);
    expect(cleaned).not.toContain('undefined');
    expect(cleaned).toContain('display: grid');
  });

  it('flex 分支面对 grid 容器（无有效 flexDirection 事实）不写 undefined', () => {
    const css = `.c-device-monitor-cons {
  display: flex;
  align-items: center;
}`;
    const mapping = {
      '.c-device-monitor-cons': {
        display: 'flex',
        flexDirection: undefined,
      },
    };
    const r = injectLayoutFacts(css, mapping, { forceOverride: true });
    expect(r.content).not.toContain('flex-direction: undefined');
  });

  it('grid 节点无列数真值时不把 LLM 已写的 3 列砸成 1 列', () => {
    const css = `.c-device-monitor-cons {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}`;
    const mapping = {
      '.c-device-monitor-cons': { display: 'grid' },
    };
    const r = injectLayoutFacts(css, mapping, { forceOverride: true });
    expect(r.content).toContain('repeat(3, 1fr)');
    expect(r.content).not.toContain('repeat(1, 1fr)');
  });
});
