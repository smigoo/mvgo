import {
  UNIT_CONTRACT_VERSION,
  UNIT_SOURCE_TYPES,
  UNIT_SOURCE_KINDS,
  UNIT_TIERS,
  UNIT_STATUSES,
  deriveUnitTier,
  validateUnitContract,
  computeUnitStats,
  isCacheableDegraded,
  CACHEABLE_DEGRADED_CODES,
  UNIT_INPUT_KEY_NONE,
  unitInputKeyFigma,
  unitInputKeyHtml,
  DEGRADED_NO_FIGMA_LINK,
  DEGRADED_NO_FIGMA_TOKEN,
  DEGRADED_BAD_FIGMA_URL,
  DEGRADED_NO_CP_COMPONENT,
  DEGRADED_FIGMA_FETCH_FAILED,
  type ProjectUnit,
  type UnitContract,
} from './unit-contract';

function validUnit(over: Partial<ProjectUnit> = {}): ProjectUnit {
  return {
    componentId: 'u-figma-c-guanxia',
    name: 'guanxia',
    sourceType: 'figma',
    anchor: { figmaFileKey: 'abc123', figmaNodeId: '2:7952' },
    box: { width: 100, height: null },
    tier: 'max',
    status: 'pending',
    feature: null,
    ...over,
  };
}

function validContract(over: Partial<UnitContract> = {}): UnitContract {
  return {
    version: UNIT_CONTRACT_VERSION,
    runId: 'run-1',
    builtAt: '2026-11-06T00:00:00Z',
    source: {
      kind: 'figma',
      figmaUrl: 'https://www.figma.com/file/abc123/X?node-id=2-7952',
      figmaFileKey: 'abc123',
      figmaNodeId: '2:7952',
      inputKey: unitInputKeyFigma('https://www.figma.com/file/abc123/X?node-id=2-7952'),
    },
    degraded: null,
    units: [validUnit()],
    stats: { total: 1, bySource: { figma: 1 }, byTier: { max: 1 }, unmatched: 0 },
    ...over,
  };
}

describe('unit-contract / 常量与枚举', () => {
  it('UNIT_CONTRACT_VERSION 固定为 unit.v2', () => {
    expect(UNIT_CONTRACT_VERSION).toBe('unit.v2');
  });

  it('枚举集合与实现一致', () => {
    expect(UNIT_SOURCE_TYPES).toEqual(['figma', 'screenshot', 'html']);
    expect(UNIT_TIERS).toEqual(['lite', 'max']);
    expect(UNIT_STATUSES).toEqual(['pending', 'running', 'done', 'failed']);
  });

  it('UNIT_SOURCE_KINDS 是 source.kind 的唯一合法集合', () => {
    expect(UNIT_SOURCE_KINDS).toEqual(['figma', 'html', 'screenshot', 'none']);
  });
});

describe('unit-contract / 输入指纹构造器（缓存门单一来源）', () => {
  it('figma 指纹 = `figma:<url>`', () => {
    expect(unitInputKeyFigma('u')).toBe('figma:u');
    expect(unitInputKeyFigma('https://x/y?node-id=1-2')).toBe('figma:https://x/y?node-id=1-2');
  });

  it('none 指纹是常量 `none:`', () => {
    expect(UNIT_INPUT_KEY_NONE).toBe('none:');
  });

  it('html 指纹与传入顺序无关（升序 + dedupe）', () => {
    const a = ['html/b.html', 'html/a.html', 'html/a.html'];
    const b = ['html/a.html', 'html/b.html'];
    expect(unitInputKeyHtml(a)).toBe(unitInputKeyHtml(b));
    expect(unitInputKeyHtml(a)).toMatch(/^html:[0-9a-f]{12}$/);
  });

  it('html 指纹：加/删一个页会变（这正是缓存门要抓的）', () => {
    const base = ['html/a.html', 'html/b.html'];
    expect(unitInputKeyHtml(base)).not.toBe(unitInputKeyHtml([...base, 'html/c.html']));
    expect(unitInputKeyHtml(base)).not.toBe(unitInputKeyHtml(['html/a.html']));
  });

  it('html 指纹：空白/空串被归一掉', () => {
    expect(unitInputKeyHtml(['  html/a.html  ', '', '   '])).toBe(unitInputKeyHtml(['html/a.html']));
  });
});

describe('unit-contract / deriveUnitTier 是档位唯一判据', () => {
  it("figma → max", () => {
    expect(deriveUnitTier('figma')).toBe('max');
  });

  it("screenshot → lite", () => {
    expect(deriveUnitTier('screenshot')).toBe('lite');
  });

  it("html → lite", () => {
    expect(deriveUnitTier('html')).toBe('lite');
  });
});

describe('unit-contract / isCacheableDegraded 确定性 与 偶发 的分界', () => {
  it('确定性降级码可缓存（true）', () => {
    expect(isCacheableDegraded(DEGRADED_NO_FIGMA_LINK)).toBe(true);
    expect(isCacheableDegraded(DEGRADED_NO_FIGMA_TOKEN)).toBe(true);
    expect(isCacheableDegraded(DEGRADED_BAD_FIGMA_URL)).toBe(true);
    expect(isCacheableDegraded(DEGRADED_NO_CP_COMPONENT)).toBe(true);
  });

  it('FIGMA_FETCH_FAILED 是偶发失败 → 不可缓存（false）', () => {
    expect(isCacheableDegraded(DEGRADED_FIGMA_FETCH_FAILED)).toBe(false);
  });

  it('空/未定义 → false', () => {
    expect(isCacheableDegraded('')).toBe(false);
    expect(isCacheableDegraded(null)).toBe(false);
    expect(isCacheableDegraded(undefined)).toBe(false);
  });

  it('反向断言：白名单不含 FIGMA_FETCH_FAILED', () => {
    expect(CACHEABLE_DEGRADED_CODES).not.toContain(DEGRADED_FIGMA_FETCH_FAILED);
    expect(CACHEABLE_DEGRADED_CODES).toEqual([
      DEGRADED_NO_FIGMA_LINK,
      DEGRADED_NO_FIGMA_TOKEN,
      DEGRADED_BAD_FIGMA_URL,
      DEGRADED_NO_CP_COMPONENT,
    ]);
  });
});

describe('unit-contract / validateUnitContract', () => {
  it('合法完整契约 → 返回空数组', () => {
    expect(validateUnitContract(validContract())).toEqual([]);
  });

  it('version 不匹配 → 报错', () => {
    const errs = validateUnitContract(validContract({ version: 'unit.v1' }));
    expect(errs.some((e) => e.includes('version'))).toBe(true);
  });

  it('units 非数组 → 报错并提前返回', () => {
    const errs = validateUnitContract(validContract({ units: 'nope' as any }));
    expect(errs).toContain('units 必须是数组');
  });

  it('source.kind 非法（psd）→ 报错且文案含新集合', () => {
    const c = validContract();
    (c as any).source = { ...c.source, kind: 'psd' };
    const errs = validateUnitContract(c);
    expect(errs.some((e) => e.includes('source.kind'))).toBe(true);
    // 文案用 UNIT_SOURCE_KINDS.join('|') —— 新集合必须出现，否则旧 figma|none 被抄回
    expect(errs.some((e) => e.includes('figma|html|screenshot|none'))).toBe(true);
  });

  it("source.kind='html' 合法 → 空数组", () => {
    const c = validContract();
    (c as any).source = { ...c.source, kind: 'html' };
    expect(validateUnitContract(c)).toEqual([]);
  });

  it('缺 source.inputKey → 报错（缓存一致性门的唯一判据）', () => {
    const c: any = validContract();
    c.source = { kind: 'figma', figmaUrl: null, figmaFileKey: null, figmaNodeId: null };
    const errs = validateUnitContract(c);
    expect(errs.some((e) => e.includes('inputKey'))).toBe(true);
  });

  it('source.inputKey 为空串 → 报错', () => {
    const c: any = validContract();
    c.source = { ...c.source, inputKey: '   ' };
    const errs = validateUnitContract(c);
    expect(errs.some((e) => e.includes('inputKey'))).toBe(true);
  });

  it('🔴 anchor 只有 pagePath → 合法（HTML 页级锚点，无 figmaNodeId/selector/shotPath 也不算无锚点）', () => {
    expect(
      validateUnitContract(
        validContract({
          units: [
            validUnit({
              componentId: 'u-html-x',
              sourceType: 'html',
              tier: 'lite',
              anchor: { pagePath: 'html/模块1/云资源监测.html' },
            }),
          ],
        }),
      ),
    ).toEqual([]);
  });

  it('🔴 档位篡改被拦：figma 单元手填 tier=lite', () => {
    const errs = validateUnitContract(
      validContract({ units: [validUnit({ sourceType: 'figma', tier: 'lite' })] }),
    );
    expect(errs.some((e) => e.includes('与 deriveUnitTier(figma)=max 不符'))).toBe(true);
  });

  it('🔴 无锚点单元被拦：anchor 为空对象', () => {
    const errs = validateUnitContract(validContract({ units: [validUnit({ anchor: {} })] }));
    expect(errs.some((e) => e.includes('至少要有一个锚点'))).toBe(true);
  });

  it('componentId 重复 → 报错', () => {
    const errs = validateUnitContract(validContract({ units: [validUnit(), validUnit()] }));
    expect(errs.some((e) => e.includes('重复'))).toBe(true);
  });

  it('box.width/height 为 null 合法', () => {
    expect(
      validateUnitContract(
        validContract({ units: [validUnit({ box: { width: null, height: null } })] }),
      ),
    ).toEqual([]);
  });

  it('box.width/height 为字符串 → 报错', () => {
    const errs = validateUnitContract(
      validContract({ units: [validUnit({ box: { width: '10' as any, height: 10 } })] }),
    );
    expect(errs.some((e) => e.includes('box.width/height 必须是数字或 null'))).toBe(true);
  });

  it('feature 为 null 合法', () => {
    expect(
      validateUnitContract(validContract({ units: [validUnit({ feature: null })] })),
    ).toEqual([]);
  });

  it('feature 为数字 → 报错', () => {
    const errs = validateUnitContract(
      validContract({ units: [validUnit({ feature: 123 as any })] }),
    );
    expect(errs.some((e) => e.includes('feature 必须是字符串或 null'))).toBe(true);
  });

  it('传 null / 非对象 → 返回 ["contract 必须是对象"]（不抛异常）', () => {
    expect(validateUnitContract(null)).toEqual(['contract 必须是对象']);
    expect(validateUnitContract(undefined)).toEqual(['contract 必须是对象']);
    expect(validateUnitContract('abc')).toEqual(['contract 必须是对象']);
    expect(validateUnitContract(42)).toEqual(['contract 必须是对象']);
  });
});

/**
 * 缓存门洞的判据：`readUnits` 只做「version / 形状 / 降级白名单」三重把关，
 * 所以**形状校验漏掉的字段 = 缓存也无条件信任**。以下每条都对应一个
 * 「一份坏文件被当合法缓存返回、前端拿到 undefined」的真实路径。
 */
describe('unit-contract / validateUnitContract · 形状必须挡住坏缓存', () => {
  it('builtAt 缺失 → 报错', () => {
    const c: any = validContract();
    delete c.builtAt;
    expect(validateUnitContract(c).some((e) => e.includes('builtAt'))).toBe(true);
  });

  it('builtAt 为空串 → 报错', () => {
    const errs = validateUnitContract(validContract({ builtAt: '   ' }));
    expect(errs.some((e) => e.includes('builtAt'))).toBe(true);
  });

  it('builtAt 不是可解析时间（"昨天"）→ 报错', () => {
    const errs = validateUnitContract(validContract({ builtAt: '昨天' }));
    expect(errs.some((e) => e.includes('builtAt'))).toBe(true);
  });

  it('builtAt 合法 ISO → 不报错', () => {
    expect(validateUnitContract(validContract({ builtAt: '2026-11-06T00:00:00Z' }))).toEqual([]);
  });

  it('stats 缺失 → 报错', () => {
    const c: any = validContract();
    delete c.stats;
    expect(validateUnitContract(c).some((e) => e.includes('stats 必须是对象'))).toBe(true);
  });

  it('🔴 stats.total 与 units.length 不一致 → 报错（数字自证不了自己）', () => {
    const errs = validateUnitContract(
      validContract({
        units: [validUnit(), validUnit({ componentId: 'u-figma-2-7953', anchor: { figmaNodeId: '2:7953' } })],
        stats: { total: 1, bySource: { figma: 1 }, byTier: { max: 1 }, unmatched: 0 },
      }),
    );
    expect(errs.some((e) => e.includes('stats.total=1') && e.includes('units.length=2'))).toBe(
      true,
    );
  });

  it('stats.total 非数字 → 报错', () => {
    const errs = validateUnitContract(
      validContract({ stats: { total: '1' as any, bySource: {}, byTier: {}, unmatched: 0 } }),
    );
    expect(errs.some((e) => e.includes('stats.total 必须是数字'))).toBe(true);
  });

  it('stats.bySource / byTier 缺失或非对象 → 报错', () => {
    const errs = validateUnitContract(
      validContract({
        stats: { total: 1, bySource: null as any, byTier: 5 as any, unmatched: 0 },
      }),
    );
    expect(errs.some((e) => e.includes('stats.bySource 必须是对象'))).toBe(true);
    expect(errs.some((e) => e.includes('stats.byTier 必须是对象'))).toBe(true);
  });

  it('degraded 为字符串（不是对象）→ 报错', () => {
    const errs = validateUnitContract(validContract({ degraded: 'NO_FIGMA_LINK' as any }));
    expect(errs.some((e) => e.includes('degraded 必须是 null 或对象'))).toBe(true);
  });

  it('degraded.code / message 为空 → 报错', () => {
    const errs = validateUnitContract(
      validContract({ degraded: { code: '', message: '' } as any, units: [], stats: { total: 0, bySource: {}, byTier: {}, unmatched: 0 } }),
    );
    expect(errs.some((e) => e.includes('degraded.code'))).toBe(true);
    expect(errs.some((e) => e.includes('degraded.message'))).toBe(true);
  });

  it('🔴 边界：不可缓存的降级码在本层**不报错**（策略归 readUnits，不在这里）', () => {
    // 若有人把 isCacheableDegraded 塞进 validateUnitContract，这条会 FAIL ——
    // readUnits 的降级白名单守卫就不再是独立判据（两层守卫 = 对照失效）。
    const errs = validateUnitContract(
      validContract({
        degraded: { code: DEGRADED_FIGMA_FETCH_FAILED, message: '429' },
        units: [],
        stats: { total: 0, bySource: {}, byTier: {}, unmatched: 0 },
      }),
    );
    expect(errs).toEqual([]);
  });
});

describe('unit-contract / computeUnitStats', () => {
  it('total / bySource / byTier 与输入一致', () => {
    const units = [
      validUnit({ componentId: 'a', sourceType: 'figma', tier: 'max', feature: 'f1' }),
      validUnit({ componentId: 'b', sourceType: 'screenshot', tier: 'lite', feature: null }),
      validUnit({ componentId: 'c', sourceType: 'html', tier: 'lite', feature: 'nope' }),
    ];
    const stats = computeUnitStats(units, ['f1']);
    expect(stats.total).toBe(3);
    expect(stats.bySource).toEqual({ figma: 1, screenshot: 1, html: 1 });
    expect(stats.byTier).toEqual({ max: 1, lite: 2 });
    expect(stats.unmatched).toBe(2);
  });

  it('feature 为 null 或不在 features 数组 → 计入 unmatched', () => {
    expect(computeUnitStats([validUnit({ feature: null })], ['f1']).unmatched).toBe(1);
    expect(computeUnitStats([validUnit({ feature: 'x' })], ['f1']).unmatched).toBe(1);
    expect(computeUnitStats([validUnit({ feature: 'f1' })], ['f1']).unmatched).toBe(0);
  });

  it('features 缺省为空数组时，不因 feature 非空而误计 unmatched', () => {
    expect(computeUnitStats([validUnit({ feature: 'whatever' })]).unmatched).toBe(0);
  });

  it('空 units → 全零', () => {
    expect(computeUnitStats([], ['f1'])).toEqual({
      total: 0,
      bySource: {},
      byTier: {},
      unmatched: 0,
    });
  });
});
