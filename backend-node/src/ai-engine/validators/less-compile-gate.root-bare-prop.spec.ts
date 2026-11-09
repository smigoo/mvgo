/**
 * 🛡️ R4（2026-11-09 · loop-verify R4 轮）：LESS 根级裸属性判据（LESS-WRITE-007）。
 *
 * 病灶（mc-1794186438485-3c9509f8 真机实锤）：common.less:176-178 混入三行
 * `font-size: calc();`（无选择器 + 空 calc() 双重非法）⇒ less
 * `Properties must be inside selector blocks. They cannot be in the root`
 * ⇒ 最终 LESS 编译门禁 BLOCK ⇒ 整单失败。既有 LESS-WRITE-001~006 均不认此形态。
 *
 * 阳性对照：3c9509f8 产物逐字复刻；阴性对照覆盖全部已知合法根级行
 * （@media / @import / LESS 变量声明 / 注释 / 选择器行 / 块内声明）。
 */
import {
  scanStandaloneLessDefects,
  gateStandaloneLessWrite,
} from './less-compile-gate.js';

/** 3c9509f8 病灶逐字复刻（common.less 完整上下文：含上一规则块的开括号） */
const TRAFFIC_MONITOR_CSS = `.c-traffic-monitor-tab-item {
  color: @color-text-base;
  line-height: 21px;
  white-space: nowrap;
  display: flex;}

/* ===== [样式补缺] 缺失类定向补齐（6 条 · 系统生成） ===== */
font-size: calc();
font-size: calc();
font-size: calc();

/* ===== [样式补缺] 缺失类定向补齐（8 条 · 系统生成） ===== */

.c-traffic-monitor-header-section {
  display: flex;
}`;

/** 阴性基线：全合法根级/块内结构（既有产物常态） */
const HEALTHY_CSS = `@import './variables.less';

@media (min-width: 768px) {
  .a { display: flex; }
}

/* 根级注释合法 */
@primary: #1990ff;

.c-card {
  color: @primary;
  .c-card-inner {
    padding: 8px;
  }
}

.c-card:hover {
  color: red;
}
`;

describe('R4 · LESS-WRITE-007 根级裸属性（3c9509f8 实锤）', () => {
  it('① 阳性（3c9509f8 逐字复刻）：三行根级 font-size: calc() 各判一条 007', () => {
    const d = scanStandaloneLessDefects(TRAFFIC_MONITOR_CSS);
    const hits = d.filter((x) => x.id === 'LESS-WRITE-007');
    expect(hits).toHaveLength(3);
    expect(hits[0].line).toBe(8); // 首条裸属性行号（fixture 含开括号行，:8 起）
    expect(hits[0].message).toContain('根级裸属性');
    expect(hits[0].message).toContain('font-size: calc()');
  });

  it('② 阴性：全合法根级/块内结构零命中（@media/@import/变量/注释/选择器/块内声明）', () => {
    const d = scanStandaloneLessDefects(HEALTHY_CSS);
    expect(d.filter((x) => x.id === 'LESS-WRITE-007')).toHaveLength(0);
    expect(d).toHaveLength(0);
  });

  it('③ 阴性·块内同名声明不受影响（深度 >0 不判）：病灶行移入块内即不命中', () => {
    const inBlock = `.c-x {\n  font-size: calc();\n}`;
    const d = scanStandaloneLessDefects(inBlock);
    expect(d.filter((x) => x.id === 'LESS-WRITE-007')).toHaveLength(0);
  });

  it('④ 出口接线：gateStandaloneLessWrite 对病灶判 ok=false（判死跳过写盘保 last-good）', () => {
    const r = gateStandaloneLessWrite(TRAFFIC_MONITOR_CSS, 'resources/styles/common.less');
    expect(r.ok).toBe(false);
    expect(r.fixes.length === 0 || !r.fixes.some((f) => f.includes('WRITE-007'))).toBe(true); // 007 是判死不是 heal
  });
});
