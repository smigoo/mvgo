/**
 * LAYOUT-FACTS-CONFLICT 方向仲裁单测（R4b-A，2026-11-02 ·
 * mc-max-1793601942419-d140fb11 实锤立项）
 *
 * 病灶：几何事实注入器 forceOverride 把 LLM **写对的**显式声明翻转——
 *   ① `.c-device-content-header` chunk 写 `flex-direction: row`（图片左/信息右，
 *      与 vision 真值 `801:3 layout="horizontal"` 一致），几何聚类按子盒 y 排序
 *      误判 column ⇒ 注入器强改 row→column ⇒ 头部竖直流；
 *   ② ROB004 pill chunk 写 `display: inline-flex`，被强改成块级 `flex` ⇒ 蓝条拉通整行。
 *   同型日志在 693e027c（05:37）同现 ⇒ 既有缺陷非本轮引入。
 *
 * R4b-A 仲裁纪律（与 FLEX-005 / VERT-004「宁可漏报不误杀」同源）：
 *   几何事实**只补缺失，不翻转**产物显式声明；
 *   冲突必留痕（code=LAYOUT-FACTS-CONFLICT，report-only，可真机计数）；
 *   纠错职责归 LAYOUT-001 门禁（WARN）+ review 循环，注入器不做无仲裁的翻转。
 *
 * 阳性对照：d140fb11 chunk 形态逐字复刻（下 fixtures）。
 * 变异对照：去掉仲裁分支（恢复 forceOverride 翻转）⇒ 用例 1/2 必红。
 */
import { injectLayoutFacts } from '../layout-facts-injector.js';

describe('injectLayoutFacts R4b-A 方向仲裁（显式声明不被几何事实翻转）', () => {
  it('① d140fb11 复刻：块内显式 row ≠ 几何事实 column → 保留 row，记 LAYOUT-FACTS-CONFLICT', () => {
    const css = `.c-device-content-header {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 16px;
}`;
    const mapping = {
      '.c-device-content-header': { display: 'flex', flexDirection: 'column' },
    };
    const r = injectLayoutFacts(css, mapping, { forceOverride: true });
    // 方向不得被翻转
    expect(r.content).toContain('flex-direction: row');
    expect(r.content).not.toContain('flex-direction: column');
    // 冲突必须留痕（可观测、可计数）
    const conflict = r.fixes.find((f) => f.code === 'LAYOUT-FACTS-CONFLICT');
    expect(conflict).toBeDefined();
    expect(conflict.detail).toContain('row');
    expect(conflict.detail).toContain('column');
    // 原有属性原样保留
    expect(r.content).toContain('align-items: flex-start');
    expect(r.content).toContain('gap: 16px');
  });

  it('② d140fb11 复刻：显式 inline-flex ≠ 几何事实 flex → 保留 inline-flex，记冲突', () => {
    const css = `.c-device-frame-2136639901 {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  border-radius: 4px;
}`;
    const mapping = {
      '.c-device-frame-2136639901': { display: 'flex', flexDirection: 'row' },
    };
    const r = injectLayoutFacts(css, mapping, { forceOverride: true });
    expect(r.content).toContain('display: inline-flex');
    expect(r.content).not.toContain('display: flex;\n');
    expect(r.fixes.some((f) => f.code === 'LAYOUT-FACTS-CONFLICT')).toBe(true);
    // padding 等原有属性不得被波及
    expect(r.content).toContain('padding: 2px 8px');
  });

  it('③ 回归保护（be31dcf3）：方向缺失时照常补几何事实方向', () => {
    const css = `.c-device-monitor-tabs-section {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 4px;
}`;
    const mapping = {
      '.c-device-monitor-tabs': { display: 'flex', flexDirection: 'column' },
    };
    const r = injectLayoutFacts(css, mapping, { forceOverride: true });
    expect(r.content).toContain('flex-direction: column');
    expect(r.fixes.some((f) => f.code === 'LAYOUT-FACTS-INJECT')).toBe(true);
  });

  it('④ 回归保护：display 缺失时照常补（display 缺补不受仲裁影响）', () => {
    const css = `.c-device-img {
  border-radius: 8px;
  overflow: hidden;
}`;
    const mapping = {
      '.c-device-img': { display: 'flex', flexDirection: 'column' },
    };
    const r = injectLayoutFacts(css, mapping, { forceOverride: true });
    expect(r.content).toContain('display: flex');
    expect(r.content).toContain('flex-direction: column');
  });

  it('⑤ display 冲突与方向缺失并存：只记 display 冲突，缺失方向照常补', () => {
    const css = `.c-device-code-group {
  display: inline-flex;
}`;
    const mapping = {
      '.c-device-code-group': { display: 'flex', flexDirection: 'column' },
    };
    const r = injectLayoutFacts(css, mapping, { forceOverride: true });
    // display 不翻转
    expect(r.content).toContain('display: inline-flex');
    // 方向缺失照常补
    expect(r.content).toContain('flex-direction: column');
    expect(r.fixes.some((f) => f.code === 'LAYOUT-FACTS-CONFLICT')).toBe(true);
  });

  it('⑥ 声明与事实一致时幂等零改动（现状不变）', () => {
    const css = `.c-device-content-header {
  display: flex;
  flex-direction: row;
}`;
    const mapping = {
      '.c-device-content-header': { display: 'flex', flexDirection: 'row' },
    };
    const r = injectLayoutFacts(css, mapping, { forceOverride: true });
    expect(r.fixes.length).toBe(0);
    expect(r.content).toBe(css);
  });

  it('⑦ 冲突留痕含 logger 输出（真机计数行挂点）', () => {
    const logs = [];
    const logger = { info: (msg) => logs.push(String(msg)) };
    const css = `.c-x { display: flex; flex-direction: row; }`;
    const mapping = { '.c-x': { display: 'flex', flexDirection: 'column' } };
    injectLayoutFacts(css, mapping, { forceOverride: true, logger });
    expect(logs.some((l) => l.includes('LAYOUT-FACTS-CONFLICT'))).toBe(true);
  });
});
