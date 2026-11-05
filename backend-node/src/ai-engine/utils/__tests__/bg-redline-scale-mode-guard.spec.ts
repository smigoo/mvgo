/**
 * 🛡️ F3（2026-11-05 · 刀53 三链治本 · A1 白名单）：精修「6 红线」不得推翻 scaleMode 真值。
 *
 * 问题：`layout-style-refiner#_applyRedLineFixes` 无条件把 `background-size: cover|contain`
 * 改写成 `100% 100%`，并删除 `center` / `no-repeat`；而 `sizeFromScaleMode` 的权威映射是
 * FILL→`cover`、FIT→`contain`、STRETCH→`100% 100%`、TILE→`repeat`。两者互逆、链尾者胜。
 *
 * 本 spec 锁三件事：
 *   ① 阴性对照：本轮**无** scaleMode 真值 ⇒ 改写行为**逐字等同**旧实现（零回归）；
 *   ② 阳性：有真值 ⇒ 该声明的 `cover`/`center`/`no-repeat` 全部保留；
 *   ③ 作用域隔离：同文件相邻规则/相邻元素不受别人真值庇护（不串味）。
 *
 * 说明：护栏逻辑下沉为纯函数（`utils/bg-redline-scale-mode-guard.js`），
 * 不 import `layout-style-refiner`（其依赖 `base-agent` 的 `import.meta.url`，jest CJS 下不可加载）。
 */
import {
  applyBackgroundRedLine,
  buildScaleModeIndex,
  declarationScopeAt,
  authScaleModeAt,
} from '../bg-redline-scale-mode-guard';
import { buildBgVarToResource } from '../background-size-inference';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MAPPING_FILL = [{ resourceFile: 'resources/images/bg-_m-36.png', imageScaleMode: 'FILL' }];
const MAPPING_NO_SCALE = [{ resourceFile: 'resources/images/bg-_m-36.png' }];

const LESS_WITH_TRUTH = `.card {
  background-image: url('../images/bg-_m-36.png');
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

.plain {
  background-size: cover;
}
`;

const cardBlock = (out: string) => out.slice(out.indexOf('.card'), out.indexOf('.plain'));
const plainBlock = (out: string) => out.slice(out.indexOf('.plain'));

describe('F3 背景红线 · scaleMode 白名单', () => {
  describe('buildScaleModeIndex', () => {
    it('只收有 scaleMode 的资源；无 scaleMode ⇒ 空索引', () => {
      expect(buildScaleModeIndex({ resourceDomMapping: MAPPING_FILL }).size).toBeGreaterThan(0);
      expect(buildScaleModeIndex({ resourceDomMapping: MAPPING_NO_SCALE }).size).toBe(0);
      expect(buildScaleModeIndex({}).size).toBe(0);
      expect(buildScaleModeIndex(null).size).toBe(0);
    });
  });

  describe('阴性对照：无真值 → 逐字等同旧实现', () => {
    it('无 params：cover → 100% 100%，center/no-repeat 被删', () => {
      const r = applyBackgroundRedLine(LESS_WITH_TRUTH, {});
      expect(r.content).toContain('background-size: 100% 100%');
      expect(r.content).not.toContain('background-size: cover');
      expect(r.content).not.toContain('background-position: center');
      expect(r.content).not.toContain('background-repeat: no-repeat');
      expect(r.kept).toBe(0);
      expect(r.rewritten).toBeGreaterThan(0);
    });

    it('有 mapping 但无 scaleMode：白名单为空，行为同样等同旧实现', () => {
      const r = applyBackgroundRedLine(LESS_WITH_TRUTH, {
        resourceDomMapping: MAPPING_NO_SCALE,
      });
      expect(r.content).toContain('background-size: 100% 100%');
      expect(r.content).not.toContain('background-size: cover');
      expect(r.whitelist).toBe(0);
    });

    it('无 background-size 的文件内容不变', () => {
      const plain = '.x { color: red; }\n';
      const r = applyBackgroundRedLine(plain, { resourceDomMapping: MAPPING_FILL });
      expect(r.content).toBe(plain);
      expect(r.rewritten).toBe(0);
    });
  });

  describe('阳性：有 scaleMode 真值 → 该声明不被改写', () => {
    it('FILL 资源的 cover / center / no-repeat 全部保留', () => {
      const r = applyBackgroundRedLine(LESS_WITH_TRUTH, { resourceDomMapping: MAPPING_FILL });
      const card = cardBlock(r.content);
      expect(card).toContain('background-size: cover');
      expect(card).toContain('background-position: center');
      expect(card).toContain('background-repeat: no-repeat');
      expect(r.kept).toBeGreaterThan(0);
    });

    it('作用域隔离：相邻规则无背景图，其 cover 照旧被改写（不串味）', () => {
      const r = applyBackgroundRedLine(LESS_WITH_TRUTH, { resourceDomMapping: MAPPING_FILL });
      const plain = plainBlock(r.content);
      expect(plain).toContain('background-size: 100% 100%');
      expect(plain).not.toContain('background-size: cover');
    });

    it('inline :style 形态：引用真值资源的受保护，未声明的照旧改写', () => {
      const src = [
        '<template>',
        '  <div :style="{ backgroundImage: `url(${bg4})`, backgroundSize: \'cover\' }">A</div>',
        "  <div :style=\"{ backgroundSize: 'cover' }\">B</div>",
        '</template>',
        '<script setup>',
        "import bg4 from '../../resources/images/bg-_m-36.png'",
        '</script>',
      ].join('\n');
      const varToRes = buildBgVarToResource(src);
      const scaleIndex = buildScaleModeIndex({ resourceDomMapping: MAPPING_FILL });
      const offsetA = src.indexOf("backgroundSize: 'cover'");
      const offsetB = src.lastIndexOf("backgroundSize: 'cover'");

      expect(authScaleModeAt(src, offsetA, varToRes, scaleIndex)).toMatchObject({
        inferredBy: 'scaleMode',
      });
      expect(authScaleModeAt(src, offsetB, varToRes, scaleIndex)).toBe(null);
    });

    it('STRETCH 真值（100% 100%）同样受保护，contain 不被改写', () => {
      const mapping = [
        { resourceFile: 'resources/images/bg-_m-34.png', imageScaleMode: 'STRETCH' },
      ];
      const less = `.x {\n  background-image: url('bg-_m-34.png');\n  background-size: contain;\n}\n`;
      const r = applyBackgroundRedLine(less, { resourceDomMapping: mapping });
      expect(r.content).toContain('background-size: contain');
      expect(r.kept).toBe(1);
    });
  });

  describe('declarationScopeAt', () => {
    it('取所在规则块，而不是整段前缀', () => {
      const src = '.a { color: red }\n.b { background-size: cover; }\n';
      const scope = declarationScopeAt(src, src.indexOf('background-size'));
      expect(scope).toContain('background-size: cover');
      expect(scope).not.toContain('.a');
      expect(scope).not.toContain('color: red');
    });

    it('模板插值 ${...} 的花括号不算块边界', () => {
      const src = '<div :style="{ backgroundImage: `url(${bg4})`, backgroundSize: \'cover\' }" />';
      const scope = declarationScopeAt(src, src.indexOf("backgroundSize"));
      expect(scope).toContain('backgroundImage');
    });
  });
});

/**
 * 🛡️ R3-legacy 接线契约（2026-11-06）
 *
 * 事故：F3 白名单只接进了「合并精修」（`layout-style-refiner`），而串行链
 * （`layout-refiner` → `style-refiner`，非 full 目标 / minimal/off 模式回退）
 * 仍是无条件改写 ⇒ 同一份 Figma 走两条链得到不同的 background-size。
 *
 * `layout-refiner` 继承 `BaseAgent`（依赖 `import.meta.url`），jest CJS 下不可 import，
 * 故取**源码契约**断言（先例：console-noise-classifier.spec.ts:74），锁两件事：
 *   ① 委托纯函数、旧的裸 replace 必须消失；
 *   ② 每个 `new LayoutRefiner` 的调用点都下传真值锚，否则护栏静默空转。
 */
describe('R3-legacy 接线契约', () => {
  const roleSrc = (f: string) =>
    readFileSync(join(__dirname, '../../roles', f), 'utf-8');
  const graphSrc = (f: string) =>
    readFileSync(join(__dirname, '../../graphs', f), 'utf-8');

  it('layout-refiner 委托 applyBackgroundRedLine，且无裸 replace 改写', () => {
    const src = roleSrc('layout-refiner.js');
    expect(src).toMatch(
      /import\s*\{[^}]*applyBackgroundRedLine[^}]*\}\s*from\s*'\.\.\/utils\/bg-redline-scale-mode-guard\.js'/,
    );
    expect(src).toMatch(/applyBackgroundRedLine\(/);
    // 旧的无条件改写（cover→100% 100%）必须已消失
    expect(src).not.toMatch(/replace\(\s*\/background-size\\s\*:\\s\*cover\/gi/);
    expect(src).not.toMatch(/replace\(\s*\/background-size\\s\*:\\s\*contain\/gi/);
  });

  it('layout-refiner 的每个调用点都下传 scaleMode 真值锚', () => {
    for (const f of [
      'mc-component-graph-vue3.js',
      'mc-component-graph-phase2.js',
    ]) {
      const src = graphSrc(f);
      let idx = src.indexOf('new LayoutRefiner');
      let hits = 0;
      while (idx >= 0) {
        // 调用点紧跟在构造之后（execute({ ... })），窗口取 900 字符足够覆盖入参块
        expect(src.slice(idx, idx + 900)).toContain('resourceDomMapping');
        hits += 1;
        idx = src.indexOf('new LayoutRefiner', idx + 1);
      }
      expect(hits).toBeGreaterThanOrEqual(2);
    }
  });
});
