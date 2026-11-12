/**
 * 🔴 component.js 样式入口（2026-11-12 · mc-max-1794417052536-b7fabcbc 实锤）：
 *   buildComponentJsFile 旧模板无 CSS import，被 buildMcPlatformFiles 以「一体化规范版
 *   优先级更高」覆盖到 standardFiles 的 import index.css 版之上 ⇒ 预编译 CSS 零消费
 *   ⇒ 组件样式全裸奔（kv 表格 4 列网格塌成纵列）。
 *   修：buildComponentJsFile 补 styleImport 三态（css 优先 → less 回落 → 无样式注释），
 *   与 phase2.service.ts copyToWorkspace 口径一致。
 */
import {
  buildComponentJsFile,
  buildMcPlatformFiles,
} from './file-writer.js';

// file-writer 传递 import logger → config/backend-root.js（.js 撞名坑，见 tasks-config-snapshot.spec 惯例）
jest.mock('../../../config/backend-root.js', () => ({ logsDir: '/tmp/logs' }), {
  virtual: true,
});

describe('component.js 样式入口（b7fabcbc kv 表格裸奔实锤）', () => {
  it('① 缺省（mc 一体化平台路径）：必须 import index.css（css 优先）', () => {
    const c = buildComponentJsFile();
    expect(c).toContain("import component from './package/index.vue'");
    expect(c).toContain("import './resources/styles/index.css'");
    expect(c).toContain('export default component');
  });

  it('② hasCss:false ⇒ 回落 import index.less', () => {
    const c = buildComponentJsFile({ hasCss: false });
    expect(c).toContain("import './resources/styles/index.less'");
    expect(c).not.toContain("import './resources/styles/index.css'");
  });

  it('③ 无样式产物 ⇒ 注释占位不报错', () => {
    const c = buildComponentJsFile({ hasCss: false, hasLess: false });
    expect(c).toContain('// No CSS/LESS file found');
  });

  it('④ buildMcPlatformFiles 产出的 component.js 一致带 CSS import（覆盖链源头修复）', () => {
    const files = buildMcPlatformFiles({ fontSize: '12' });
    expect(files['component.js']).toContain(
      "import './resources/styles/index.css'",
    );
  });
});
