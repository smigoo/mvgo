/**
 * 🛡️ 刀 8b（2026-09-13）· 装饰性随机尾段剥离 · 单测
 *
 * 真实事故（c-device-monitor-00g6b7vh-075b13a4）：
 *   safeGenerateDeclareJson 取不到 sessionId 时用 Math.random().toString(36).slice(2,10)
 *   兜底，产出 8 位 base36 随机段（含 g/v/h 等非 hex 字母）拼进 componentId。
 *   classPrefixOf 的 `-[0-9a-f]{8}$` 剥离失效 → 随机段滞留进 class 前缀 →
 *   与 LLM 的 c-device-monitor-* 失配 → CODE-003 全量误判 + autoFix 双前缀叠加
 *   → common.less ~半数规则死样式（CODE-003-HIT-RATE 48%）。
 *
 * 本 spec 锁定：正例命中、反例（语义词/纯 hex/纯数字）绝不误伤。
 */
import {
  isDecorSlugSegment,
  stripDecorSlugTail,
  classPrefixOf,
  semanticSegmentOf,
  buildComponentId,
  sanitizeComponentId,
} from '../component-naming.js';

describe('刀 8b: isDecorSlugSegment —— 随机段判据', () => {
  it('正例：真实事故中的 base36 随机段全部命中', () => {
    // 取自 workspace/custom-components 真实产物 componentId 尾段
    for (const s of [
      '00g6b7vh',
      '6ajwy8yn',
      'i3ej9whi',
      '1fduq67s',
      '25hce807',
      'vi4f6tl2',
      'yoyz6l2l',
    ]) {
      expect(isDecorSlugSegment(s)).toBe(true);
    }
  });

  it('反例：纯 hex 尾段不算随机段（交给既有 `-[0-9a-f]{8}$` 规则）', () => {
    for (const s of ['43e7fe45', 'a326cabd', '075b13a4', 'c9e4a435']) {
      expect(isDecorSlugSegment(s)).toBe(false);
    }
  });

  it('反例：纯数字（= 纯 hex）与纯字母语义词不误伤', () => {
    for (const s of ['20240913']) {
      expect(isDecorSlugSegment(s)).toBe(false);
    }
    // 纯字母但 8 位：无数字 → 不判随机段（overview/register/progress/monitorx）
    for (const s of ['overview', 'register', 'progress', 'monitorx']) {
      expect(isDecorSlugSegment(s)).toBe(false);
    }
  });

  it('反例：长度不符 / 含非法字符', () => {
    for (const s of ['', 'abc', '1234567', '123456789', 'ab-cdefg', 'AB12CDEF', '0000-000']) {
      expect(isDecorSlugSegment(s)).toBe(false);
    }
  });
});

describe('刀 8b: stripDecorSlugTail —— 单次剥离', () => {
  it('剥掉尾随机段；头部必须仍有字母', () => {
    expect(stripDecorSlugTail('c-device-monitor-00g6b7vh-075b13a4')).toBe(
      'c-device-monitor-075b13a4',
    );
    expect(stripDecorSlugTail('device-monitor-00g6b7vh')).toBe('device-monitor');
    expect(stripDecorSlugTail('c-env-monitor-002v6v4b-b81edc3b')).toBe(
      'c-env-monitor-b81edc3b',
    );
  });

  it('非随机尾段（纯 hex / 语义词）不剥', () => {
    expect(stripDecorSlugTail('c-monitor-43e7fe45')).toBe('c-monitor-43e7fe45');
    expect(stripDecorSlugTail('c-vehicle-overview-abcd1234')).toBe(
      'c-vehicle-overview-abcd1234',
    );
  });

  it('头部无字母时不动（防剥成空串/纯数字）', () => {
    expect(stripDecorSlugTail('12-00g6b7vh')).toBe('12-00g6b7vh');
  });
});

describe('刀 8b: classPrefixOf —— 前缀收敛到语义干', () => {
  it('真实事故 id：slug + hex 双尾段 → 语义干', () => {
    expect(classPrefixOf('c-device-monitor-00g6b7vh-075b13a4')).toBe(
      'c-device-monitor',
    );
    expect(classPrefixOf('c-env-monitor-002v6v4b-b81edc3b')).toBe('c-env-monitor');
    expect(classPrefixOf('c-device-monitor-yoyz6l2l-011998bb')).toBe(
      'c-device-monitor',
    );
  });

  it('只有 slug 尾段（无 hex 尾）也能收敛', () => {
    expect(classPrefixOf('c-device-monitor-00g6b7vh')).toBe('c-device-monitor');
    expect(classPrefixOf('c-device-monitor-pyb7ue1h')).toBe('c-device-monitor');
  });

  it('既有正常形态零回归', () => {
    expect(classPrefixOf('c-monitor-43e7fe45')).toBe('c-monitor');
    expect(classPrefixOf('c-device-monitor-075b13a4')).toBe('c-device-monitor');
    expect(classPrefixOf('c-env-monitor')).toBe('c-env-monitor');
    expect(classPrefixOf('c-vehicle-overview-abcd1234')).toBe(
      'c-vehicle-overview',
    );
    expect(classPrefixOf('monitor')).toBe('c-monitor');
  });

  it('历史实例形态（13 位时间戳）保持完整，不因新规则被误剥', () => {
    expect(classPrefixOf('c-mc-max-1789101384806-a326cabd')).toBe(
      'c-mc-max-1789101384806-a326cabd',
    );
  });
});

describe('刀 8b: semanticSegmentOf —— 语义段不继承随机段', () => {
  it('剥掉尾 slug（含前有 hex 尾的形态）', () => {
    expect(semanticSegmentOf('c-device-monitor-00g6b7vh-075b13a4')).toBe(
      'device-monitor',
    );
    expect(semanticSegmentOf('c-device-monitor-00g6b7vh')).toBe('device-monitor');
  });

  it('语义词与既有形态零回归', () => {
    expect(semanticSegmentOf('c-monitor-43e7fe45')).toBe('monitor');
    expect(semanticSegmentOf('c-env-monitor')).toBe('env-monitor');
    expect(semanticSegmentOf('c-env-monitor-24')).toBe('env-monitor');
    expect(semanticSegmentOf('c-vehicle-overview-abcd1234')).toBe(
      'vehicle-overview',
    );
  });
});

describe('刀 8b: 端到端 —— 事故 id 经 buildComponentId 重建后前缀自洽', () => {
  it('LLM 给的 id 带随机段 → 重建后 class 前缀 === LLM 使用的语义干', () => {
    // 复刻事故链路：LLM 输出 componentId c-device-monitor-00g6b7vh（随机兜底段）
    const seg = semanticSegmentOf('c-device-monitor-00g6b7vh');
    expect(seg).toBe('device-monitor');
    const rebuilt = buildComponentId(seg, 'mc-1789284222821-075b13a4');
    expect(rebuilt).toBe('c-device-monitor-075b13a4');
    // 关键断言：class 前缀必须等于 LLM 在模板/common.less 里写的语义干
    expect(classPrefixOf(rebuilt)).toBe('c-device-monitor');
  });
});

describe('刀 9: sanitizeComponentId —— 可剥离闸门（落盘前强制收敛）', () => {
  it('四段脏 id（随机中段+hex尾）收敛为 c-<语义>-<8hex>', () => {
    expect(
      sanitizeComponentId('c-device-monitor-00g6b7vh-075b13a4', {
        sessionId: 'mc-1789284222821-075b13a4',
        fallbackToken: 'device-monitor',
      }),
    ).toBe('c-device-monitor-075b13a4');
  });

  it('脏检查点 id（中段随机）原样清洗，尾段由 sessionId 决定', () => {
    expect(
      sanitizeComponentId('c-env-monitor-002v6v4b-b81edc3b', {
        sessionId: 'mc-1789284000000-b81edc3b',
      }),
    ).toBe('c-env-monitor-b81edc3b');
  });

  it('playground seg 来源含随机中段 → 先剥后派生', () => {
    // 模拟 playground 从编码型 current id 提取到 00g6b7vh 中段
    expect(
      sanitizeComponentId('c-traffic-monitor-6ajwy8yn', {
        sessionId: 'mc-1789284000000-a1b2c3d4',
      }),
    ).toBe('c-traffic-monitor-a1b2c3d4');
  });

  it('已是规范 id → 幂等返回', () => {
    expect(
      sanitizeComponentId('c-device-monitor-97e8f48e', {
        sessionId: 'mc-1789285935903-97e8f48e',
      }),
    ).toBe('c-device-monitor-97e8f48e');
  });

  it('无 sessionId 退化为 c-<语义>，绝不含随机段', () => {
    expect(sanitizeComponentId('c-device-monitor-00g6b7vh')).toBe(
      'c-device-monitor',
    );
  });

  it('收敛结果必可被 classPrefixOf 剥离（契约不变量）', () => {
    const sid = 'mc-1789284000000-9abce496';
    for (const dirty of [
      'c-device-monitor-00g6b7vh-9abce496',
      'c-env-monitor-002v6v4b-9abce496',
      'c-traffic-monitor-6ajwy8yn-9abce496',
    ]) {
      const clean = sanitizeComponentId(dirty, { sessionId: sid });
      expect(classPrefixOf(clean)).toBe('c-' + clean.split('-').slice(1, -1).join('-'));
    }
  });
});

describe('刀 9: 落盘前闸门不变量（防复发核心断言）', () => {
  // 复刻 microcode-engineer 检查点/非检查点两条分支的真实输入形态
  const cases = [
    'c-device-monitor-00g6b7vh-075b13a4',
    'c-env-monitor-6ajwy8yn-b81edc3b',
    'c-traffic-monitor-3pbs93n5-dda07860',
    'c-vehicle-monitor-i3ej9whi-9abce496',
  ];
  for (const dirty of cases) {
    const sid = dirty.split('-').pop();
    it(`门闸收敛脏 id ${dirty} → 无随机段 + classPrefixOf 可剥离`, () => {
      const clean = sanitizeComponentId(dirty, {
        sessionId: 'mc-1789284000000-' + sid,
        fallbackToken: dirty.split('-').slice(1, -1).join('-'),
      });
      expect(clean).not.toMatch(/[0-9a-z]{8}-[0-9a-f]{8}$/); // 不应保留「随机段-8hex」双尾
      expect(clean.endsWith(sid)).toBe(true);
      // 关键不变量：收敛后任一分段都不是装饰性随机段
      expect(clean.split('-').some((s) => isDecorSlugSegment(s))).toBe(false);
      // 关键不变量：sanitize 后再经 classPrefixOf 必须收敛到语义干（无随机残留）
      expect(classPrefixOf(clean)).toBe('c-' + clean.split('-').slice(1, -1).join('-'));
    });
  }

  it('中段随机 + 尾 hex 恰好等于 session 尾 → 仍强制收敛（核心回归）', () => {
    // 这是集成测试发现的真 bug：旧 _alreadyUnique 因尾 hex 匹配而绕过修复。
    // sanitize 作为独立闸门必须不依赖调用方判据，直接收敛中段。
    const dirty = 'c-env-monitor-6ajwy8yn-b81edc3b';
    const clean = sanitizeComponentId(dirty, {
      sessionId: 'mc-1789284000000-b81edc3b',
      fallbackToken: 'env-monitor',
    });
    expect(clean).toBe('c-env-monitor-b81edc3b');
    expect(clean).not.toContain('6ajwy8yn');
  });
});
