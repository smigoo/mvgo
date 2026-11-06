/**
 * 屏蔽日志层：figma-unit-splitter → page-decomposer → logger/index → config/backend-root
 * 这条链在 jest(CJS) 下会因 backend-root.js 使用 import.meta.url 而无法加载。
 * 此处只桩掉与断言无关的 logger，**保留真实的 findCpComponents / parseFigmaUrl 逻辑**。
 */
jest.mock('../../../ai-engine/logger/index.js', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

// 注：曾被逼加过一条 `jest.mock('./unit-contract.js', …, { virtual: true })`——
// 那是因为源码里误写了 `.js` 后缀（本目录只有 unit-contract.ts）。源码改为无后缀后
// 该 mock 已无对应 specifier，删掉；若哪天 spec 报 Cannot find module './unit-contract'，
// 说明又有人给同目录 TS 互导加回了 `.js` 后缀。

import {
  figmaLinkAbsenceNote,
  splitFigmaUnits,
  readProjectFigmaUrl,
  type FigmaUnitSplitDeps,
} from './figma-unit-splitter';
import {
  UNIT_CONTRACT_VERSION,
  DEGRADED_NO_FIGMA_LINK,
  DEGRADED_NO_FIGMA_TOKEN,
  DEGRADED_BAD_FIGMA_URL,
  DEGRADED_NO_CP_COMPONENT,
  DEGRADED_FIGMA_FETCH_FAILED,
  UNIT_INPUT_KEY_NONE,
  unitInputKeyFigma,
} from './unit-contract';

/** 合法链接：fileKey=KEY123, nodeId=2:7952 */
const GOOD_URL = 'https://www.figma.com/file/KEY123/MyDesign?node-id=2:7952';
const BUILT_AT = '2026-11-06T00:00:00Z';

/**
 * 每个调用都要显式传 `inputKey`（`unit.v2` 起为必需字段）。
 *
 * 拆分层**不自己算**指纹——它只把调用方给的 key 原样落到 `source.inputKey`，
 * 因为指纹口径（figma:<url> / html:<sha1> / none:）的单一来源在 `unit-contract.ts`，
 * 而「这次输入到底是什么」只有服务层知道。所以：
 *   · 有 figmaUrl 的用例 → `unitInputKeyFigma(<同一个 url>)`，与真实调用形态一致；
 *   · figmaUrl 为空的降级用例 → `UNIT_INPUT_KEY_NONE`（拆分层根本不看它，只求形状合法）。
 */

function mkTree(children: any[]): any {
  return { id: 'root', name: 'page-root', children };
}

/** 造两个 cp- 节点（含 id / name / absoluteBoundingBox） */
function twoCpTree(): any {
  return mkTree([
    {
      id: '2:7952',
      name: 'cp-panel-guanxia',
      absoluteBoundingBox: { width: 375.6, height: 200.4 },
      children: [],
    },
    {
      id: '2:7953',
      name: 'cp-panel-alarm',
      absoluteBoundingBox: { width: 100, height: 50 },
      children: [],
    },
  ]);
}

/** 一个合法的 getNode 假实现（绝不联网） */
function okDeps(tree: any): { getNode: jest.Mock } & FigmaUnitSplitDeps {
  return { getNode: jest.fn().mockResolvedValue(tree) };
}

describe('figma-unit-splitter / readProjectFigmaUrl', () => {
  it('正常取到 links.figma 字符串', () => {
    const s0 = {
      projectJson: { content: { links: { figma: 'https://www.figma.com/file/a/B?node-id=1-2' } } },
    };
    expect(readProjectFigmaUrl(s0)).toBe('https://www.figma.com/file/a/B?node-id=1-2');
  });

  it('content 为 null → null', () => {
    expect(readProjectFigmaUrl({ projectJson: { content: null } })).toBeNull();
  });

  it('content.__parseError 为真 → null', () => {
    const s0 = {
      projectJson: { content: { __parseError: 'boom', links: { figma: 'https://x' } } },
    };
    expect(readProjectFigmaUrl(s0)).toBeNull();
  });

  it('links.figma 非字符串 → null', () => {
    expect(readProjectFigmaUrl({ projectJson: { content: { links: { figma: 123 } } } })).toBeNull();
    expect(readProjectFigmaUrl({ projectJson: { content: { links: {} } } })).toBeNull();
  });

  it('s0 缺失 / 空对象 → null', () => {
    expect(readProjectFigmaUrl(null)).toBeNull();
    expect(readProjectFigmaUrl({})).toBeNull();
  });
});

/**
 * `NO_FIGMA_LINK` 的**文案**必须能区分两种 null：
 * 「项目未声明画板」vs「清单没解析出来」。两者修复动作不同（改配置 vs 修 mvgo.project.json），
 * 文案混在一起会把排障方向带偏。
 */
describe('figma-unit-splitter / figmaLinkAbsenceNote（只补文案，不判有无）', () => {
  it('清单解析失败 → 说明里点名 mvgo.project.json（不是「未声明」）', () => {
    const s0 = {
      projectJson: { content: { __parseError: 'Unexpected token < in JSON', links: { figma: 'https://x' } } },
    };
    const note = figmaLinkAbsenceNote(s0);
    expect(note).toContain('mvgo.project.json');
    expect(note).toContain('Unexpected token');
    // 阳性对照：这条说明**不是**默认「未声明」文案
    expect(note).not.toContain('未声明');
  });

  it('正常声明 / 只是没声明 → 空串（调用方沿用默认文案）', () => {
    expect(
      figmaLinkAbsenceNote({
        projectJson: { content: { links: { figma: 'https://www.figma.com/file/a/B?node-id=1-2' } } },
      }),
    ).toBe('');
    expect(figmaLinkAbsenceNote({ projectJson: { content: { version: 1 } } })).toBe('');
    expect(figmaLinkAbsenceNote(null)).toBe('');
  });

  it('超长 parseError 被截断（别把日志撑爆）', () => {
    const s0 = { projectJson: { content: { __parseError: 'x'.repeat(5000) } } };
    expect(figmaLinkAbsenceNote(s0).length).toBeLessThan(300);
  });

  it('① figmaUrl 为空 + 带解析失败说明 → message 反映「解析失败」，不是默认文案', async () => {
    const withNote = await splitFigmaUnits(
      { runId: 'r', inputKey: UNIT_INPUT_KEY_NONE, figmaUrl: null, figmaUrlAbsenceNote: '项目清单（mvgo.project.json）解析失败：boom' },
      { getNode: jest.fn() },
    );
    const noNote = await splitFigmaUnits(
      { runId: 'r', inputKey: UNIT_INPUT_KEY_NONE, figmaUrl: null },
      { getNode: jest.fn() },
    );

    // 降级码**不因文案而变**（说明只影响 message）
    expect(withNote.degraded?.code).toBe(DEGRADED_NO_FIGMA_LINK);
    expect(noNote.degraded?.code).toBe(DEGRADED_NO_FIGMA_LINK);
    // 但 message 必须真的不一样 —— 否则这个参数等于没接
    expect(withNote.degraded?.message).toContain('解析失败');
    expect(withNote.degraded?.message).not.toBe(noNote.degraded?.message);
    expect(noNote.degraded?.message).toContain('未声明');
  });
});

describe('figma-unit-splitter / 降级链逐级点名', () => {
  it('① figmaUrl 为空 → NO_FIGMA_LINK', async () => {
    const r = await splitFigmaUnits(
      { runId: 'r', inputKey: UNIT_INPUT_KEY_NONE, figmaUrl: '' },
      { getNode: jest.fn() },
    );
    expect(r.degraded?.code).toBe(DEGRADED_NO_FIGMA_LINK);
    expect(r.units.length).toBe(0);
  });

  it('① figmaUrl 未声明（undefined）→ NO_FIGMA_LINK', async () => {
    const r = await splitFigmaUnits(
      { runId: 'r', inputKey: UNIT_INPUT_KEY_NONE },
      { getNode: jest.fn() },
    );
    expect(r.degraded?.code).toBe(DEGRADED_NO_FIGMA_LINK);
    expect(r.units.length).toBe(0);
  });

  it('② 非 figma 域名（parseFigmaUrl 抛）→ BAD_FIGMA_URL', async () => {
    const r = await splitFigmaUnits(
      { runId: 'r', inputKey: unitInputKeyFigma('https://example.com/x'), figmaUrl: 'https://example.com/x' },
      { getNode: jest.fn() },
    );
    expect(r.degraded?.code).toBe(DEGRADED_BAD_FIGMA_URL);
    expect(r.units.length).toBe(0);
  });

  it('③ figma 域名但缺 node-id → BAD_FIGMA_URL', async () => {
    const r = await splitFigmaUnits(
      {
        runId: 'r',
        inputKey: unitInputKeyFigma('https://www.figma.com/file/KEY123/MyDesign'),
        figmaUrl: 'https://www.figma.com/file/KEY123/MyDesign',
      },
      { getNode: jest.fn() },
    );
    expect(r.degraded?.code).toBe(DEGRADED_BAD_FIGMA_URL);
    expect(r.units.length).toBe(0);
  });

  it('🔴 ④ tokenAvailable=false 且链接合法 → NO_FIGMA_TOKEN，且 getNode 一次都没被调用', async () => {
    const getNode = jest.fn();
    const r = await splitFigmaUnits(
      { runId: 'r', inputKey: unitInputKeyFigma(GOOD_URL), figmaUrl: GOOD_URL, tokenAvailable: false },
      { getNode },
    );
    expect(r.degraded?.code).toBe(DEGRADED_NO_FIGMA_TOKEN);
    expect(r.units.length).toBe(0);
    expect(getNode).not.toHaveBeenCalled();
  });

  it('⑤ 链接合法、有 token，但 getNode reject → FIGMA_FETCH_FAILED', async () => {
    const getNode = jest.fn().mockRejectedValue(new Error('429 rate limited'));
    const r = await splitFigmaUnits({ runId: 'r', inputKey: unitInputKeyFigma(GOOD_URL), figmaUrl: GOOD_URL }, { getNode });
    expect(r.degraded?.code).toBe(DEGRADED_FIGMA_FETCH_FAILED);
    expect(r.units.length).toBe(0);
  });

  it('⑥ 树里没有任何 cp- 前缀节点 → NO_CP_COMPONENT', async () => {
    const tree = mkTree([{ id: '1:1', name: 'frame-a', children: [] }]);
    const r = await splitFigmaUnits(
      { runId: 'r', inputKey: unitInputKeyFigma(GOOD_URL), figmaUrl: GOOD_URL },
      okDeps(tree),
    );
    expect(r.degraded?.code).toBe(DEGRADED_NO_CP_COMPONENT);
    expect(r.units.length).toBe(0);
  });
});

describe('figma-unit-splitter / 成功路径', () => {
  it('两个 cp 节点 → 2 个单元，字段与锚点正确', async () => {
    const r = await splitFigmaUnits(
      { runId: 'r', inputKey: unitInputKeyFigma(GOOD_URL), figmaUrl: GOOD_URL, builtAt: BUILT_AT },
      okDeps(twoCpTree()),
    );

    expect(r.version).toBe(UNIT_CONTRACT_VERSION);
    expect(r.degraded).toBeNull();
    expect(r.units.length).toBe(2);

    for (const u of r.units) {
      expect(u.sourceType).toBe('figma');
      expect(u.tier).toBe('max');
      expect(u.status).toBe('pending');
      expect(u.anchor.figmaFileKey).toBe('KEY123');
    }

    // id 由锚点（nodeId）派生：folderName=c-guanxia / c-alarm 不再参与
    const guanxia = r.units.find((u) => u.componentId === 'u-figma-2-7952')!;
    expect(guanxia).toBeDefined();
    expect(guanxia.anchor.figmaNodeId).toBe('2:7952');
    expect(guanxia.box.width).toBe(376); // Math.round(375.6)
    expect(guanxia.box.height).toBe(200); // Math.round(200.4)

    const alarm = r.units.find((u) => u.componentId === 'u-figma-2-7953')!;
    expect(alarm).toBeDefined();
    expect(alarm.anchor.figmaNodeId).toBe('2:7953');
    expect(alarm.box.width).toBe(100);
    expect(alarm.box.height).toBe(50);
  });

  it('units 按 componentId 字典序升序', async () => {
    const r = await splitFigmaUnits(
      { runId: 'r', inputKey: unitInputKeyFigma(GOOD_URL), figmaUrl: GOOD_URL, builtAt: BUILT_AT },
      okDeps(twoCpTree()),
    );
    const ids = r.units.map((u) => u.componentId);
    expect(ids).toEqual(['u-figma-2-7952', 'u-figma-2-7953']);
    expect(ids).toEqual([...ids].sort());
  });

  /**
   * 拆分层**不自己算**指纹：它只把调用方给的 key 原样落到 `source.inputKey`。
   * 若哪天它开始「自己按 figmaUrl 拼一个」，服务层的缓存门（`unitsCacheMatchesInput`）
   * 就会拿两个不同规则算出的 key 比对 —— 同一份输入时而判等、时而判不等。
   * 故此处刻意传两个**与 figmaUrl 无关的自定义 key**，验证「回显而非重算」。
   */
  it('🔴 source.inputKey 回显调用方给的 key（不自己重算）', async () => {
    const keyA = 'figma:custom-key-A';
    const keyB = 'figma:custom-key-B';

    const a = await splitFigmaUnits(
      { runId: 'r', inputKey: keyA, figmaUrl: GOOD_URL, builtAt: BUILT_AT },
      okDeps(twoCpTree()),
    );
    const b = await splitFigmaUnits(
      { runId: 'r', inputKey: keyB, figmaUrl: GOOD_URL, builtAt: BUILT_AT },
      okDeps(twoCpTree()),
    );

    expect(a.source.inputKey).toBe(keyA);
    expect(b.source.inputKey).toBe(keyB);
    // 阳性对照：两者 figmaUrl 完全相同，但 key 必须跟着入参走 —— 否则就是重算了
    expect(a.source.inputKey).not.toBe(b.source.inputKey);
    expect(a.source.kind).toBe('figma');
  });
});

describe('figma-unit-splitter / 🔴 id 由锚点派生（中文目录名不得塌成 c）', () => {
  /**
   * 真实数据形态：8 个画板里 7 个的 folderName 是中文（`c-环境监测` / `c-设备监测`…）。
   * 旧实现 `slug(folderName) || idSlug(nodeId)` 让这些**全部塌成 `'c'`**，
   * 于是靠「重名加 -2/-3」去重 ⇒ 序号由遍历顺序决定 ⇒ 幂等失效。
   */
  function cnTree(): any {
    return mkTree([
      {
        id: '2:7952',
        name: 'cp-panel-环境监测',
        absoluteBoundingBox: { width: 100, height: 100 },
        children: [],
      },
      {
        id: '2:7953',
        name: 'cp-panel-设备监测',
        absoluteBoundingBox: { width: 100, height: 100 },
        children: [],
      },
    ]);
  }

  it('两个中文目录名 → 两个互不相同的 id，形态 = u-figma-<idSlug(nodeId)>', async () => {
    const r = await splitFigmaUnits(
      { runId: 'r', inputKey: unitInputKeyFigma(GOOD_URL), figmaUrl: GOOD_URL, builtAt: BUILT_AT },
      okDeps(cnTree()),
    );
    const ids = r.units.map((u) => u.componentId);
    expect(ids).toEqual(['u-figma-2-7952', 'u-figma-2-7953']);
    expect(new Set(ids).size).toBe(2);
    // folderName 仍是 c-环境监测 / c-设备监测（只影响 name/note，不再影响 id）
    expect(r.units.every((u) => u.note?.includes('cp-panel-'))).toBe(true);
  });

  it('🔴 打乱子节点顺序后「id→锚点」映射不变（旧实现此处会翻转）', async () => {
    const forward = await splitFigmaUnits(
      { runId: 'r', inputKey: unitInputKeyFigma(GOOD_URL), figmaUrl: GOOD_URL, builtAt: BUILT_AT },
      okDeps(cnTree()),
    );
    const rev = cnTree();
    rev.children = [...rev.children].reverse();
    const reversed = await splitFigmaUnits(
      { runId: 'r', inputKey: unitInputKeyFigma(GOOD_URL), figmaUrl: GOOD_URL, builtAt: BUILT_AT },
      okDeps(rev),
    );
    const pair = (c: typeof forward) =>
      c.units.map((u) => `${u.componentId}@${u.anchor.figmaNodeId}`).sort();
    expect(pair(reversed)).toEqual(pair(forward));
    expect(JSON.stringify(reversed.units)).toBe(JSON.stringify(forward.units));
  });
});

describe('figma-unit-splitter / 幂等与顺序无关', () => {
  it('🔴 同输入 + 固定 builtAt 两次运行逐字节一致', async () => {
    const a = await splitFigmaUnits(
      { runId: 'r', inputKey: unitInputKeyFigma(GOOD_URL), figmaUrl: GOOD_URL, builtAt: BUILT_AT },
      okDeps(twoCpTree()),
    );
    const b = await splitFigmaUnits(
      { runId: 'r', inputKey: unitInputKeyFigma(GOOD_URL), figmaUrl: GOOD_URL, builtAt: BUILT_AT },
      okDeps(twoCpTree()),
    );
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('🔴 打乱 Figma 子节点顺序（reverse）后 componentId 序列完全一致', async () => {
    const forward = await splitFigmaUnits(
      { runId: 'r', inputKey: unitInputKeyFigma(GOOD_URL), figmaUrl: GOOD_URL, builtAt: BUILT_AT },
      okDeps(twoCpTree()),
    );
    const reversedTree = twoCpTree();
    reversedTree.children = [...reversedTree.children].reverse();
    const reversed = await splitFigmaUnits(
      { runId: 'r', inputKey: unitInputKeyFigma(GOOD_URL), figmaUrl: GOOD_URL, builtAt: BUILT_AT },
      okDeps(reversedTree),
    );
    expect(reversed.units.map((u) => u.componentId)).toEqual(
      forward.units.map((u) => u.componentId),
    );
  });
});

describe('figma-unit-splitter / 功能点归属', () => {
  it('命中功能点填 feature，不相关的为 null 且计入 unmatched', async () => {
    const statsNode = {
      id: '2:8001',
      name: 'cp-panel-stats',
      absoluteBoundingBox: { width: 200, height: 100 },
      children: [
        {
          id: '2:8001-1',
          name: 'panel-header',
          children: [{ id: '2:8001-1-1', type: 'TEXT', characters: '车辆统计' }],
        },
      ],
    };
    const otherNode = {
      id: '2:8002',
      name: 'cp-panel-other',
      absoluteBoundingBox: { width: 10, height: 10 },
      children: [],
    };
    const r = await splitFigmaUnits(
      { runId: 'r', inputKey: unitInputKeyFigma(GOOD_URL), figmaUrl: GOOD_URL, builtAt: BUILT_AT, features: ['车辆统计'] },
      okDeps(mkTree([statsNode, otherNode])),
    );

    const matched = r.units.find((u) => u.anchor.figmaNodeId === '2:8001')!;
    expect(matched.feature).toBe('车辆统计');

    const unmatched = r.units.find((u) => u.anchor.figmaNodeId === '2:8002')!;
    expect(unmatched.feature).toBeNull();

    expect(r.stats.unmatched).toBe(1);
  });
});

describe('figma-unit-splitter / 无 id 的 cp 节点被丢弃', () => {
  it('缺 id 的节点不进 units，stats.total 同步', async () => {
    const noId = { name: 'cp-panel-nope', absoluteBoundingBox: { width: 5, height: 5 } };
    const withId = {
      id: '2:9000',
      name: 'cp-panel-yes',
      absoluteBoundingBox: { width: 5, height: 5 },
    };
    const r = await splitFigmaUnits(
      { runId: 'r', inputKey: unitInputKeyFigma(GOOD_URL), figmaUrl: GOOD_URL, builtAt: BUILT_AT },
      okDeps(mkTree([noId, withId])),
    );
    expect(r.units.length).toBe(1);
    expect(r.stats.total).toBe(1);
    expect(r.units[0].anchor.figmaNodeId).toBe('2:9000');
  });
});

describe('figma-unit-splitter / onLog 回调', () => {
  it('成功路径回调一次，mode=ok 且 units=2', async () => {
    const onLog = jest.fn();
    await splitFigmaUnits(
      { runId: 'r', inputKey: unitInputKeyFigma(GOOD_URL), figmaUrl: GOOD_URL, builtAt: BUILT_AT, onLog },
      okDeps(twoCpTree()),
    );
    expect(onLog).toHaveBeenCalledTimes(1);
    const payload = onLog.mock.calls[0][0];
    expect(payload.mode).toBe('ok');
    expect(payload.units).toBe(2);
  });

  it('降级路径回调 mode=degraded', async () => {
    const onLog = jest.fn();
    await splitFigmaUnits({ runId: 'r', inputKey: UNIT_INPUT_KEY_NONE, figmaUrl: '', onLog }, { getNode: jest.fn() });
    expect(onLog).toHaveBeenCalledTimes(1);
    expect(onLog.mock.calls[0][0].mode).toBe('degraded');
  });

  it('onLog 抛异常不会让 splitFigmaUnits 失败', async () => {
    const onLog = jest.fn(() => {
      throw new Error('logger down');
    });
    await expect(
      splitFigmaUnits(
        { runId: 'r', inputKey: unitInputKeyFigma(GOOD_URL), figmaUrl: GOOD_URL, builtAt: BUILT_AT, onLog },
        okDeps(twoCpTree()),
      ),
    ).resolves.toBeDefined();
  });
});
