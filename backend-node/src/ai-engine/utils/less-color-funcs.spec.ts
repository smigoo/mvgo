import {
  LESS_COLOR_FUNCS,
  NEUTRAL_LESS_COLOR,
  isColorEvaluable,
  isUsedByLessColorFn,
  collectColorFnVars,
  isColorFnConsumer,
} from './less-color-funcs.js';

/**
 * 刀 15 / 16b 单一事实源回归（2026-09-13）
 *
 * 背景：`@colorPrimary` 被 var 化 → `lighten(@colorPrimary, 30%)` 编译期不可求值 →
 * `<style>` 块编译失败 → P1-4 剔除子组件（事故 mc-1789311919345-edeb2177）。
 * 本组用例锁死「是否被颜色函数消费」这一判据，供三个消费方共用。
 */
describe('isColorEvaluable —— 只有真颜色能在 LESS 编译期求值', () => {
  it.each([
    ['#409EFF', true],
    ['#fff', true],
    ['#333333', true],
    ['rgba(25, 144, 255, 1)', true],
    ['rgb(25,144,255)', true],
    ['hsl(210, 100%, 55%)', true],
    // 以下全部是「编译期不可求值」——它们是 safeLessVarValue 名字分支/兜底的真实产出
    ['var(--colorPrimary, #409EFF)', false],
    ['var(--fontSize)', false],
    ['unset', false],
    ['inherit', false],
    ['0px', false],
    ['1', false],
    ['1.5', false],
    ['400', false],
    ['0.2s', false],
    ['', false],
    [null, false],
    [undefined, false],
  ])('%s → %s', (value, expected) => {
    expect(isColorEvaluable(value as any)).toBe(expected);
  });

  it('回归：纯字母关键词 unset 不能被 /^[a-z]+$/ 误判成颜色', () => {
    // 写首版时踩过这个坑：把具名色放行会连带放行 unset/inherit。
    expect(isColorEvaluable('unset')).toBe(false);
    expect(isColorEvaluable('inherit')).toBe(false);
  });
});

describe('isUsedByLessColorFn —— 变量是否出现在颜色函数实参位置', () => {
  it('lighten(@colorPrimary, 30%) → true', () => {
    expect(
      isUsedByLessColorFn('.x{background:lighten(@colorPrimary,30%)}', '@colorPrimary'),
    ).toBe(true);
  });

  it('不带 @ 前缀也识别', () => {
    expect(
      isUsedByLessColorFn('.x{color:darken(@primary,10%)}', 'primary'),
    ).toBe(true);
  });

  it('覆盖全部 13 个颜色函数', () => {
    for (const fn of LESS_COLOR_FUNCS) {
      expect(
        isUsedByLessColorFn(`.x{color:${fn}(@token,10%)}`, '@token'),
      ).toBe(true);
    }
  });

  it('同名但只被普通属性引用 → false（防过度命中）', () => {
    expect(isUsedByLessColorFn('.x{color:@colorPrimary}', '@colorPrimary')).toBe(false);
    expect(isUsedByLessColorFn('.x{background:@bgColor}', '@colorPrimary')).toBe(false);
  });

  it('前缀同名变量不误命中（@color vs @colorPrimary）', () => {
    expect(
      isUsedByLessColorFn('.x{color:lighten(@colorPrimaryLight,10%)}', '@colorPrimary'),
    ).toBe(false);
  });

  it('非字符串/空输入安全返回 false', () => {
    expect(isUsedByLessColorFn('' as any, '@a')).toBe(false);
    expect(isUsedByLessColorFn(null as any, '@a')).toBe(false);
    expect(isUsedByLessColorFn('.x{}', '' as any)).toBe(false);
  });
});

describe('collectColorFnVars —— 从样式文本批量收集颜色函数实参变量', () => {
  it('混合文本：只收颜色函数实参位置上的变量', () => {
    const text = `
      .a { color: @textColor; }
      .b { background: lighten(@colorPrimary, 30%); }
      .c { border-color: darken(@colorBorder, 10%); }
      .d { box-shadow: 0 2px 4px fade(@shadowColor, 50%); }
    `;
    const vars = collectColorFnVars(text);
    expect([...vars].sort()).toEqual(['colorBorder', 'colorPrimary', 'shadowColor']);
    expect(vars.has('textColor')).toBe(false);
  });

  it('同一函数多实参、多变量', () => {
    const vars = collectColorFnVars('.x{mix(@cA, @cB, 50%)}');
    expect([...vars].sort()).toEqual(['cA', 'cB']);
  });

  it('无颜色函数 → 空集合（不抛错）', () => {
    expect(collectColorFnVars('.x{color:#333}').size).toBe(0);
    expect(collectColorFnVars('').size).toBe(0);
    expect(collectColorFnVars(undefined as any).size).toBe(0);
  });
});

describe('isColorFnConsumer —— 消费端事实的两条供给路径等价', () => {
  const style = '.x{background:lighten(@colorPrimary,30%)}';

  it('styleText 现场推断 与 usedByColorFn 集合查表 结果一致', () => {
    expect(isColorFnConsumer('colorPrimary', { styleText: style })).toBe(true);
    expect(isColorFnConsumer('colorPrimary', { usedByColorFn: true })).toBe(true);
    expect(isColorFnConsumer('colorPrimary', { styleText: style, usedByColorFn: true })).toBe(true);
  });

  it('消费端事实缺失 → false（退化为不做颜色保障，与刀 16b 之前行为一致）', () => {
    expect(isColorFnConsumer('colorPrimary')).toBe(false);
    expect(isColorFnConsumer('colorPrimary', {})).toBe(false);
    expect(isColorFnConsumer('colorPrimary', { styleText: '' })).toBe(false);
  });

  it('中立兜底色本身必须可求值（防自相矛盾）', () => {
    expect(isColorEvaluable(NEUTRAL_LESS_COLOR)).toBe(true);
  });
});
