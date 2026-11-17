import { sanitizeEchartsSymbolLiterals } from '../echarts-symbol-sanitizer.js';

describe('sanitizeEchartsSymbolLiterals', () => {
  it('阳性对照：series.symbol=true/false 归一为合法字符串', () => {
    const src = `series: [{ name: '实际流量', type: 'line', smooth: true, symbol: true, symbolSize: 6, data: a },
      { name: '预测流量', type: 'line', symbol: false, data: b }]`;
    const out = sanitizeEchartsSymbolLiterals(src);
    expect(out.changed).toBe(true);
    expect(out.content).toContain("symbol: 'circle'");
    expect(out.content).toContain("symbol: 'none'");
    expect(out.content).not.toContain('symbol: true');
    expect(out.content).not.toContain('symbol: false');
    expect(out.replacements).toHaveLength(2);
  });

  it('阴性对照：合法 symbol 字符串/数组原样放过', () => {
    const src = `series: [{ symbol: 'circle' }, { symbol: 'none' }, { symbol: ['circle','rect'] }]`;
    const out = sanitizeEchartsSymbolLiterals(src);
    expect(out.changed).toBe(false);
    expect(out.content).toBe(src);
  });

  it('阴性对照：非 symbol 键的 true/false 不动（误伤面限定）', () => {
    const src = `series: [{ showSymbol: true, smooth: false }, { emphasis: { focus: true } }]`;
    const out = sanitizeEchartsSymbolLiterals(src);
    expect(out.changed).toBe(false);
    expect(out.content).toContain('showSymbol: true');
    expect(out.content).toContain('smooth: false');
  });

  it('阴性对照：带引号的字符串值 "true" 不动', () => {
    const src = `symbol: 'true'`;
    const out = sanitizeEchartsSymbolLiterals(src);
    expect(out.changed).toBe(false);
    expect(out.content).toBe(src);
  });

  it('幂等：归一后再跑一次不再变化', () => {
    const first = sanitizeEchartsSymbolLiterals(`symbol: true, symbol: false`);
    const second = sanitizeEchartsSymbolLiterals(first.content);
    expect(second.changed).toBe(false);
    expect(second.content).toBe(first.content);
  });

  it('真错仍 FAIL：布尔在非法上下文（非 symbol 键）不被吞', () => {
    // 确保门禁/测试仍能发现真正的坏值——sanitizer 只归一 symbol 字段
    const bad = `foo: true, bar: false`;
    expect(sanitizeEchartsSymbolLiterals(bad).changed).toBe(false);
  });
});
