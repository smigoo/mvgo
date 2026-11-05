/**
 * R3-legacy 续补：`resourceDomMapping` 三源解析（state → _uiCache → 磁盘）契约。
 *
 * 背景见 `utils/resource-mapping-resolver.js` 头注：精修角色从 `execute(params)` 入参读该表，
 * 动态工作流图续跑时 state 里没有、但 `.mc-gen/resource-dom-mapping.json` 有 ⇒ 白名单静默为空。
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  resolveResourceDomMapping,
  RESOURCE_MAPPING_RELATIVE_PATH,
} from './resource-mapping-resolver.js';

const FIXTURE = [
  {
    sectionId: '1:1',
    resourceFile: 'resources/images/icon-8049.png',
    imageScaleMode: 'STRETCH',
    figmaBox: { x: 169.52, y: 1004, width: 47.52, height: 47.52 },
    parentBox: { x: 166, y: 984, width: 120, height: 74.195 },
  },
];

function makeOutputPathWithMapping(payload) {
  const dir = mkdtempSync(join(tmpdir(), 'rdm-resolver-'));
  mkdirSync(join(dir, '.mc-gen'), { recursive: true });
  writeFileSync(
    join(dir, RESOURCE_MAPPING_RELATIVE_PATH),
    typeof payload === 'string' ? payload : JSON.stringify(payload),
    'utf-8',
  );
  return dir;
}

const dirs = [];
function track(dir) {
  dirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const d of dirs) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* 清理失败不影响结论 */
    }
  }
});

describe('resolveResourceDomMapping · 三源优先级', () => {
  it('state 上已有非空映射 ⇒ 原样返回，不读盘', () => {
    const state = { resourceDomMapping: FIXTURE, outputPath: '/nonexistent-xyz' };
    expect(resolveResourceDomMapping(state)).toBe(FIXTURE);
  });

  it('state 是空数组 ⇒ 视为未命中，继续向下解析', () => {
    const state = { resourceDomMapping: [] };
    expect(resolveResourceDomMapping(state)).toBeNull();
  });

  it('空 state 的映射落到 _uiCache ⇒ 命中并写回 state（下游节点免重复解析）', () => {
    const state = { _uiCache: { resourceDomMapping: FIXTURE } };
    expect(resolveResourceDomMapping(state)).toBe(FIXTURE);
    expect(state.resourceDomMapping).toBe(FIXTURE);
  });

  it('_uiCache 为空数组 ⇒ 不命中（不得把空表写回 state）', () => {
    const state = { _uiCache: { resourceDomMapping: [] } };
    expect(resolveResourceDomMapping(state)).toBeNull();
    expect(state.resourceDomMapping).toBeUndefined();
  });

  it('续跑态：state 无映射但 outputPath 有落盘文件 ⇒ 命中的正是 figma-connector 写的那份', () => {
    const outputPath = track(makeOutputPathWithMapping(FIXTURE));
    const state = { outputPath };
    const got = resolveResourceDomMapping(state);
    expect(got).toEqual(FIXTURE);
    expect(state.resourceDomMapping).toBe(got); // 写回，避免逐节点读盘
  });

  it('落盘文件为空数组 ⇒ null（白名单为空，与改动前一致）', () => {
    const outputPath = track(makeOutputPathWithMapping([]));
    expect(resolveResourceDomMapping({ outputPath })).toBeNull();
  });

  it('落盘文件是坏 JSON ⇒ null 而非抛错（不能中断整条管线）', () => {
    const outputPath = track(makeOutputPathWithMapping('{ not json'));
    expect(() => resolveResourceDomMapping({ outputPath })).not.toThrow();
    expect(resolveResourceDomMapping({ outputPath })).toBeNull();
  });

  it('落盘文件是对象而非数组 ⇒ null', () => {
    const outputPath = track(makeOutputPathWithMapping({ a: 1 }));
    expect(resolveResourceDomMapping({ outputPath })).toBeNull();
  });

  it('无 outputPath / 文件不存在 / state 非法 ⇒ null', () => {
    expect(resolveResourceDomMapping({})).toBeNull();
    expect(resolveResourceDomMapping({ outputPath: '/nonexistent-xyz' })).toBeNull();
    expect(resolveResourceDomMapping(null)).toBeNull();
    expect(resolveResourceDomMapping(undefined)).toBeNull();
  });
});

describe('resolveResourceDomMapping · 解析失败即 no-op（零回归）', () => {
  it('无映射可解析 ⇒ 不向 state 写任何键', () => {
    const state = { outputPath: '/nonexistent-xyz', target: 'microcode' };
    expect(resolveResourceDomMapping(state)).toBeNull();
    expect(Object.keys(state).sort()).toEqual(['outputPath', 'target']);
  });

  it('二次解析直接命中已写回的 state（不重复读盘）', () => {
    const outputPath = track(makeOutputPathWithMapping(FIXTURE));
    const state = { outputPath };
    const first = resolveResourceDomMapping(state);
    rmSync(join(outputPath, RESOURCE_MAPPING_RELATIVE_PATH)); // 抹掉磁盘证据
    expect(resolveResourceDomMapping(state)).toBe(first); // 仍命中 ⇒ 证明走的是 state 而非磁盘
  });
});

/**
 * 接线契约（源码断言）：dynamic-workflow-graph.js 依赖 BaseAgent 等重链路，
 * jest CJS 下不可 import（与 `subcomponent-planner-structure-source.spec.ts` 同一先例），
 * 故断言「两个 execute 边界都先解析背景真值锚」。
 */
describe('dynamic-workflow-graph 接线契约（源码断言）', () => {
  const SRC = readFileSync(join(__dirname, '../graphs/dynamic-workflow-graph.js'), 'utf-8');

  it('import 了 resolveResourceDomMapping', () => {
    expect(SRC).toContain(
      "import { resolveResourceDomMapping } from '../utils/resource-mapping-resolver.js'",
    );
  });

  it('agent/skill 与 parallel 两个边界各解析一次（共 2 处调用）', () => {
    const hits = SRC.match(/resolveResourceDomMapping\(state\)/g) || [];
    expect(hits.length).toBe(2);
  });

  it.each([
    ['agent/skill', 'const result = await role.execute(state)'],
    ['parallel', 'const r = await role.execute(state)'],
  ])('%s 节点：解析在 execute 之前（顺序不可颠倒）', (_label, execLine) => {
    const execAt = SRC.indexOf(execLine);
    const resolveAt = SRC.lastIndexOf('resolveResourceDomMapping(state)', execAt);
    expect(execAt).toBeGreaterThan(-1);
    expect(resolveAt).toBeGreaterThan(-1);
    expect(resolveAt).toBeLessThan(execAt);
    // 两者之间不得隔着另一次 execute（防解析被前移/挪走）
    expect(execAt - resolveAt).toBeLessThan(400);
  });
});

