/**
 * R8-3 畸形「属性名拼接」声明自愈（2026-11-02 · mc-max-1793607686262-3a7d3fb3 实锤立项）
 *
 * 病灶：LLM 把 Figma effect（内发光 box-shadow）错误拼进 `background:` 的值位置——
 *   `background: box-shadow: inset 0px 0px 16px 0px rgba(25, 181, 186, 0.67);`
 *   既有写盘前自愈族（braces/parens/missing-paren/pseudo/deep）对「属性名拼接」
 *   形态全部 changed:false（假绿），终裁 scanStandaloneLessDefects 也不判 ⇒ 直接落盘
 *   ⇒ 落盘后异步 LessCompileGate 真编译 `Unrecognised input` ⇒ LESS_COMPILE_GATE_BLOCKED
 *   ⇒ 整单终态失败（3a7d3fb3 实锤）。
 *
 * R8-3 治本（两层，与既有修复族同构「能修的修、修不掉的判死」）：
 *   1. `healNestedPropertyDeclarations`：声明值位置出现「CSS 属性名 + 冒号 + 空白」
 *      ⇒ 抽出内层声明、弃外层壳（`background: box-shadow: X` → `box-shadow: X`）。
 *      误伤防线：内层冒号后**必须有空白**（`data:image/...` 等 URI scheme 形态
 *      冒号后紧跟路径 ⇒ 不命中）；只匹配声明起点（`;`/`{` 之后）；字符串/注释
 *      内容天然不匹配 `[-a-zA-Z]+:` 形态。
 *   2. `LESS-WRITE-006` 终裁兜底：heal 后仍残留的拼接形态 ⇒ 判坏跳过写盘
 *      （保 last-good），绝不带病落盘。
 *
 * 阳性对照：3a7d3fb3 common.less:341 逐字复刻（当前漏放，落盘后整单炸）。
 * 变异对照：摘 heal 接线 ⇒ ①② 红（落盘产物仍含畸形）。
 */
import {
  gateStandaloneLessWrite,
  scanStandaloneLessDefects,
  healNestedPropertyDeclarations,
} from './less-compile-gate.js';

/** 3a7d3fb3 病灶逐字复刻（common.less:341 上下文） */
const VENDOR_CARD_CSS = `.c-3a7d3f-vendor-highlight {
  flex: 1.485 1 0;
  min-height: 0;
  box-sizing: border-box;
  padding: 12px 16px;
  border-radius: 12px;
  background: box-shadow: inset 0px 0px 16px 0px rgba(25, 181, 186, 0.67);
  box-shadow: inset 0px 0px 16px 0px rgba(25, 181, 186, 0.67);
  overflow: hidden;
  display: grid;
}`;

describe('R8-3 畸形属性名拼接自愈（3a7d3fb3 实锤）', () => {
  it('① 阳性（3a7d3fb3 逐字复刻）：background: box-shadow: X ⇒ 抽出 box-shadow: X，写盘放行', () => {
    const r = gateStandaloneLessWrite(VENDOR_CARD_CSS, 'resources/styles/common.less');
    expect(r.ok).toBe(true);
    expect(r.content).toContain('box-shadow: inset 0px 0px 16px 0px rgba(25, 181, 186, 0.67)');
    expect(r.content).not.toContain('background: box-shadow:');
    expect(r.fixes.some((f) => f.includes('nested-prop'))).toBe(true);
  });

  it('② 阳性（另一属性对）：color: font-size: 12px ⇒ 抽出 font-size: 12px', () => {
    const r = healNestedPropertyDeclarations('.a {\n  color: font-size: 12px;\n}');
    expect(r.changed).toBe(true);
    expect(r.source).toContain('font-size: 12px');
    expect(r.source).not.toContain('color:');
    expect(r.count).toBe(1);
  });

  it('③ 阴性（回归保护）：正常声明逐字不动', () => {
    const css = `.b {
  background: rgba(25, 181, 186, 0.67);
  background-image: url(../resources/images/a.png);
  grid-template-columns: repeat(4, 1fr);
  transition: color 0.3s, background 0.3s;
}`;
    const r = gateStandaloneLessWrite(css, 'x.less');
    expect(r.ok).toBe(true);
    expect(r.fixes.some((f) => f.includes('nested-prop'))).toBe(false);
    expect(r.content).toBe(css);
  });

  it('④ 阴性：URI scheme（data:image 无空格冒号）不命中 —— 误伤防线', () => {
    const css = `.c {\n  background: data:image/png;base64,AAAA;\n}`;
    const r = healNestedPropertyDeclarations(css);
    // data: 后无空白 ⇒ 不抽（该形态本就非法，交 006 兜底而非臆修）
    expect(r.changed).toBe(false);
  });

  it('⑤ 字符串字面量内不命中（content: "a: b: c" 不被改写）', () => {
    const css = `.d {\n  content: "x: y: z";\n}`;
    const r = healNestedPropertyDeclarations(css);
    expect(r.changed).toBe(false);
  });

  it('⑥ 终裁兜底：heal 前的畸形喂 scanStandaloneLessDefects ⇒ LESS-WRITE-006 判死', () => {
    const defects = scanStandaloneLessDefects(
      '.e {\n  background: box-shadow: inset 0 0 0 red;\n}\n',
    );
    expect(defects.some((d) => d.id === 'LESS-WRITE-006')).toBe(true);
  });

  it('⑦ 多层拼接（≤3 层）迭代剥离', () => {
    const r = healNestedPropertyDeclarations('.f {\n  margin: padding: 4px 8px;\n}');
    expect(r.changed).toBe(true);
    expect(r.source).toContain('padding: 4px 8px');
    expect(r.source).not.toContain('margin:');
  });
});
