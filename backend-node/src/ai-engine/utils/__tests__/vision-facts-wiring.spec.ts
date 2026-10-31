/**
 * 🛡️ Phase B-3（2026-10-31 治理方案）：显式事实协议接线判据。
 *
 * 治理方案 §Phase B 交付物 3：扫源码断言每个结构语义判定类兜底的调用点
 * 都消费 vision-facts；新兜底不接线 ⇒ spec 红。同时防既有闸门被摘除回潮
 * （变异验证：摘除任一接线 ⇒ 本 spec 变红）。
 *
 * 适用边界（§Phase B 硬边界）：只约束「结构语义判定类」兜底；
 * 产物清洗类自愈（刀53h / 刀7）**不接线不减速**——本 spec 不得对它们提要求。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const AI_ENGINE = join(__dirname, '..', '..');
const readSrc = (rel) => readFileSync(join(AI_ENGINE, rel), 'utf8');

describe('Phase B 接线判据 · 结构语义判定类兜底必须消费 vision-facts', () => {
  it('header-geometry-fallback.js：消费 declaredHeaderRelation（4851eedd 第一闸门）', () => {
    const src = readSrc('utils/header-geometry-fallback.js');
    expect(src).toMatch(/import\s*\{[^}]*declaredHeaderRelation[^}]*\}\s*from\s*['"][^'"]*vision-facts\.js['"]/);
    // 语句级断言（^\s*if）：注释掉闸门不得算接线（防注释假绿）
    expect(src).toMatch(/^\s*if \(declaredHeaderRelation\(top\) === 'no-header'\) return null;/m);
    // 不得回潮为内联读取（绕过单一读取口径）
    expect(src).not.toMatch(/String\(\s*top\.headerRelation/);
  });

  it('header-geometry-fallback.js：消费 hasStatValueElement（4851eedd 第二闸门）', () => {
    const src = readSrc('utils/header-geometry-fallback.js');
    expect(src).toMatch(/import\s*\{[^}]*hasStatValueElement[^}]*\}\s*from\s*['"][^'"]*vision-facts\.js['"]/);
    expect(src).toMatch(/^\s*if \(hasStatValueElement\(top\)\) return null;/m);
    // 不得回潮为内联 elements 三态展开
    expect(src).not.toMatch(/top\?\.body\?\.items\?\.\[0\]\?\.content\?\.elements/);
  });

  it('subcomponent-planner.js#resolveFooterTextRowBox：消费 footerGeometryRecoveryAllowed', () => {
    const src = readSrc('roles/subcomponent-planner.js');
    expect(src).toMatch(
      /import\s*\{[^}]*footerGeometryRecoveryAllowed[^}]*\}\s*from\s*['"][^'"]*vision-facts\.js['"]/,
    );
    // 闸门必须在 resolveFooterTextRowBox 函数体内（语句级，注释不算——防注释假绿）
    const fn = src.match(/function resolveFooterTextRowBox\([^)]*\)\s*\{[\s\S]*?\n\}/);
    expect(fn).toBeTruthy();
    expect(fn![0]).toMatch(/^\s*if \(!footerGeometryRecoveryAllowed\(sec\)\) return null;/m);
  });

  it('subcomponent-planner.js#resolveVisionSectionBox：整表恢复路径消费 tableGeometryRecoveryAllowed', () => {
    const src = readSrc('roles/subcomponent-planner.js');
    expect(src).toMatch(
      /import\s*\{[^}]*tableGeometryRecoveryAllowed[^}]*\}\s*from\s*['"][^'"]*vision-facts\.js['"]/,
    );
    const fn = src.match(/function resolveVisionSectionBox\([^)]*\)\s*\{[\s\S]*?\n\}/);
    expect(fn).toBeTruthy();
    expect(fn![0]).toMatch(/^\s*tableGeometryRecoveryAllowed\(sec\) &&/m);
  });

  it('vision-facts.js 必须导出全部协议闸门（新兜底接线的前提）', () => {
    const src = readSrc('utils/vision-facts.js');
    for (const fn of [
      'declaredHeaderRelation',
      'declaredSectionType',
      'declaredRole',
      'declaredControl',
      'hasStatValueElement',
      'footerGeometryRecoveryAllowed',
      'tableGeometryRecoveryAllowed',
    ]) {
      expect(src).toMatch(new RegExp(`export function ${fn}\\(`));
    }
  });
});
