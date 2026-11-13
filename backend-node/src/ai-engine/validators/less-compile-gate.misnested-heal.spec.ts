/**
 * 🛡️ 2026-11-13 · 错误嵌套声明自愈（healMisnestedStyleDeclarations）阳性/阴性对照
 *
 * 事故背景（mc-max-1794546172891-8b9302bc 实锤）：
 *   ContentBridge.vue style 块被 LLM 写出「多余 `}` 过早闭合 + 孤儿声明」⇒ LESS 报
 *   `Unrecognised input. Possibly missing opening '{'` ⇒ SFC 写盘门禁判死整文件
 *   （坏文件不落盘）⇒ 宿主悬空引用 ⇒ CODE-023 BLOCK ⇒ 重试两轮同错耗尽 fail-closed。
 *   既有 healVueEmbeddedStyleBraces 只补「缺失 } / 缺失 ;」方向，本形是「多余 }」方向。
 *
 * 本 spec 钉住：
 *   ① 两变体病灶必须被确定性修好（阳性，含编译级证明）；
 *   ② 合法嵌套/合法连续声明/字符串值含 } 不得被误改（阴性）；
 *   ③ 接线：healVueEmbeddedStyleBraces 内先跑本修复器（顺序：错嵌套 → 补缺括号 → 补分号）。
 */
import {
  healMisnestedStyleDeclarations,
  gateStandaloneLessWrite,
} from './less-compile-gate.js';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('healMisnestedStyleDeclarations（错误嵌套声明自愈）', () => {
  it('阳性变体1：孤儿声明自带 `}` ⇒ 删除前面过早闭合的孤立 `}`，声明归位', () => {
    // 形态取自 ContentBridge.vue:44-46 真机日志（孤儿 `}` 接替过早闭合者的职责，总花括号恰多 1 个）
    const src = `.wrap {
  .c-traffic-monitor-bridge {
    align-items: center;
    }
      display: flex;}
}
`;
    const out = healMisnestedStyleDeclarations(src);
    expect(out.changed).toBe(true);
    expect(out.fixed).toBe(1);
    // 编译级证明：修复后可干净编译
    expect(gateStandaloneLessWrite(out.source).ok).toBe(true);
    // 声明保留（没被删掉）
    expect(out.source).toContain('display: flex;');
  });

  it('阳性变体2：孤儿声明无自带 `}` ⇒ 删除过早闭合，紧随孤立 `}` 接替闭合', () => {
    const src = `.a {
  color: red;
}
  display: flex;
}
.b {
  color: blue;
}
`;
    const out = healMisnestedStyleDeclarations(src);
    expect(out.changed).toBe(true);
    expect(out.fixed).toBe(1);
    expect(out.source).toContain('display: flex;');
    expect(out.source).toContain('.b');
  });

  it('阴性：合法连续声明（上一行是声明不是孤立 }）不误改', () => {
    const src = `.a {
  color: red;
  display: flex;
}
`;
    const out = healMisnestedStyleDeclarations(src);
    expect(out.changed).toBe(false);
    expect(out.source).toBe(src);
  });

  it('阴性：合法嵌套规则（孤立 } 后跟选择器行）不误改', () => {
    const src = `.outer {
  .inner {
    color: red;
  }
}
.hover {
  display: flex;
}
`;
    const out = healMisnestedStyleDeclarations(src);
    expect(out.changed).toBe(false);
  });

  it('阴性：值含花括号形态（data-uri / 内容串）不误改', () => {
    const src = `.a {
  background: url("data:image/svg+xml,%3Csvg%3E");
  content: "}";
}
`;
    const out = healMisnestedStyleDeclarations(src);
    expect(out.changed).toBe(false);
  });

  it('接线：healVueEmbeddedStyleBraces 已接入本修复器且顺序在补缺括号之前', () => {
    // code-healer.js 与 less-compile-gate.js 的 import 链在 jest 下可加载（先例：stray-heal.spec）
    const healerSrc = readFileSync(join(__dirname, '../roles/microcode/code-healer.js'), 'utf-8');
    expect(healerSrc).toMatch(/healMisnestedStyleDeclarations\(css\)/);
    const misAt = healerSrc.indexOf('healMisnestedStyleDeclarations(css)');
    const bracesAt = healerSrc.indexOf('healMissingLessBraces(misnested.source)');
    expect(bracesAt).toBeGreaterThan(misAt);
  });
});
