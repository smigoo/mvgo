/**
 * R8-6 frame 类挂载族对账（2026-11-02 · c-d1be-99d1be1d 实锤立项）
 *
 * 病灶：LLM 对同一 Figma frame id 在模板上**概率性**挂两套类族之一——
 *   `c-component-frame-{id}`（复用基类，common.less 基类规则无尺寸）与
 *   `c-{sem}-frame-{id}`（组件前缀尺寸类：`flex: 1 1 calc(25% - 20px)` 4 列网格）。
 *   同单内 ContentSection4（普通厂商）挂尺寸类正常，ContentSection（战略合作厂商）
 *   只挂基类 ⇒ 6 厂商 item 无宽度约束挤一行互相压盖（用户实拍图2）。
 *   prompt/roles 对双类体系零约定 ⇒ 纯 LLM 自发行为。
 *
 * R8-6（评审定案）：写盘前三判据同时成立 ⇒ class 补挂尺寸类（双类并存不动基类）：
 *   ① 模板挂 `c-component-frame-{id}`；
 *   ② 产物 less/scoped 存在 `.{X}-frame-{id}` 且规则体含尺寸声明（flex/width/grid-template，
 *      排除 min-/max- 前缀）；
 *   ③ 该元素 class 尚不含 `{X}-frame-{id}`。
 * 阳性对照：99d1be1d 逐字复刻（`c-99d1be-frame-2136639903` 尺寸类已由 ContentSection4
 *   侧产出，ContentSection 补挂）。
 * 变异对照：摘补挂动作 ⇒ 阳性红。
 */
jest.mock('../../../config/backend-root.js', () => ({
  backendRoot: process.cwd(),
  projectRoot: process.cwd(),
  workspaceRoot: process.cwd() + '/workspace',
  customComponentsDir: process.cwd() + '/workspace/custom-components',
  vue3ComponentsDir: process.cwd() + '/workspace/vue3-components',
  tempComponentsDir: process.cwd() + '/temp-components',
  dataDir: process.cwd() + '/data',
  logsDir: process.cwd() + '/logs',
  configDir: process.cwd() + '/config',
  chatAttachmentsDir: process.cwd() + '/temp-chat-attachments',
  apifoxZipsDir: process.cwd() + '/data/apifox-zips',
  apiCatalogsDir: process.cwd() + '/data/api-catalogs',
  resolveFrontendWorkspacePath: () => process.cwd(),
  frontendCustomComponentsDir: () => process.cwd(),
  frontendVue3ComponentsDir: () => process.cwd(),
}), { virtual: true });
import { runPreWriteSelfHealing } from '../pre-write-self-healing.js';

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  log: () => {},
};

/** 99d1be1d 复刻：ContentSection 挂基类；common.less 同时有基类（无尺寸）与尺寸类 */
function makeFiles99d1be1d() {
  return {
    'package/components/ContentSection.vue':
      '<template>\n' +
      '  <div class="c-component-frame-2136639905 c-99d1be-vendor-grid">\n' +
      '    <div v-for="(item, index) in vendorList" :key="index" class="c-component-frame-2136639903 c-99d1be-vendor-item">\n' +
      '      <span class="c-99d1be-vendor-name">{{ item.name }}</span>\n' +
      '    </div>\n' +
      '  </div>\n' +
      '</template>',
    'package/components/ContentSection4.vue':
      '<template>\n' +
      '  <div class="c-99d1be-frame-2136639904">\n' +
      '    <div v-for="(item, index) in vendorList" :key="index" class="c-99d1be-frame-2136639903">\n' +
      '      <span>{{ item.name }}</span>\n' +
      '    </div>\n' +
      '  </div>\n' +
      '</template>',
    'resources/styles/common.less': [
      '/* === 组件复用基类（模板挂载的 c-component-* 类） === */',
      '.c-component-frame-2136639903 {',
      '  display: flex;',
      '  flex-direction: row;',
      '  align-items: center;',
      '  gap: 4px;',
      '  min-width: 0;',
      '}',
      '',
      '.c-component-frame-2136639905 {',
      '  display: flex;',
      '  flex-direction: row;',
      '  flex-wrap: wrap;',
      '  width: 100%;',
      '}',
      '',
      '.c-99d1be-frame-2136639903 {',
      '  display: flex;',
      '  flex-direction: row;',
      '  align-items: center;',
      '  gap: 4px;',
      '  flex: 1 1 calc(25% - 20px);',
      '  box-sizing: border-box;',
      '  min-width: 0;',
      '}',
    ].join('\n'),
  };
}

describe('R8-6 frame 类挂载族对账（99d1be1d 实锤）', () => {
  it('① 阳性：挂基类 + 同 id 尺寸类存在（带 flex 尺寸）⇒ class 补挂尺寸类', () => {
    const r = runPreWriteSelfHealing(makeFiles99d1be1d(), {}, { logger: noopLogger });
    const vue = r.files['package/components/ContentSection.vue'];
    expect(vue).toContain('c-component-frame-2136639903 c-99d1be-frame-2136639903');
    // 基类保留（双类并存，复用语义不动）
    expect(vue).toContain('c-component-frame-2136639903');
    expect(r.summary.frameClassAligned).toBeGreaterThanOrEqual(1);
    expect(r.summary.frameClassScanned).toBeGreaterThanOrEqual(1);
  });

  it('② 幂等：已挂尺寸类 ⇒ 不重复补挂', () => {
    const files = makeFiles99d1be1d();
    files['package/components/ContentSection.vue'] =
      '<template><div class="c-component-frame-2136639903 c-99d1be-frame-2136639903"><span/></div></template>';
    const r = runPreWriteSelfHealing(files, {}, { logger: noopLogger });
    const occurrences = (r.files['package/components/ContentSection.vue'].match(/c-99d1be-frame-2136639903/g) || []).length;
    expect(occurrences).toBe(1);
    expect(r.summary.frameClassAligned).toBe(0);
  });

  it('③ 阴性：同 id 无尺寸类 ⇒ 不猜不动', () => {
    const files = makeFiles99d1be1d();
    delete files['resources/styles/common.less'];
    files['resources/styles/common.less'] = [
      '.c-component-frame-2136639903 { display: flex; align-items: center; }',
    ].join('\n');
    const r = runPreWriteSelfHealing(files, {}, { logger: noopLogger });
    expect(r.files['package/components/ContentSection.vue']).not.toContain('c-99d1be-frame-2136639903');
    expect(r.summary.frameClassAligned).toBe(0);
  });

  it('④ 阴性：同 id 类存在但无尺寸声明（仅 color）⇒ 不动', () => {
    const files = makeFiles99d1be1d();
    files['resources/styles/common.less'] = [
      '.c-component-frame-2136639903 { display: flex; }',
      '.c-99d1be-frame-2136639903 { color: #333333; }',
    ].join('\n');
    const r = runPreWriteSelfHealing(files, {}, { logger: noopLogger });
    expect(r.files['package/components/ContentSection.vue']).not.toContain('c-99d1be-frame-2136639903');
  });

  it('⑤ 阳性：尺寸类定义在组件 scoped 块 ⇒ 同样对账', () => {
    const files = makeFiles99d1be1d();
    files['resources/styles/common.less'] = '.c-component-frame-2136639903 { display: flex; }';
    files['package/components/ContentSection4.vue'] =
      '<template><div class="c-99d1be-frame-2136639903"><span/></div></template>\n' +
      '<style lang="less" scoped>\n' +
      '.c-99d1be-frame-2136639903 { flex: 1 1 calc(25% - 20px); min-width: 0; }\n' +
      '</style>';
    const r = runPreWriteSelfHealing(files, {}, { logger: noopLogger });
    expect(r.files['package/components/ContentSection.vue']).toContain(
      'c-component-frame-2136639903 c-99d1be-frame-2136639903',
    );
  });

  it('⑥ 阴性：min-width 不算尺寸声明（排除前缀词）', () => {
    const files = makeFiles99d1be1d();
    files['resources/styles/common.less'] = [
      '.c-component-frame-2136639903 { display: flex; }',
      '.c-99d1be-frame-2136639903 { min-width: 0; max-width: 100px; }',
    ].join('\n');
    const r = runPreWriteSelfHealing(files, {}, { logger: noopLogger });
    expect(r.summary.frameClassAligned).toBe(0);
    expect(r.files['package/components/ContentSection.vue']).not.toContain('c-99d1be-frame-2136639903');
  });

  it('⑦ 计数行恒形状：零命中场景 scanned/aligned 恒出现', () => {
    const r = runPreWriteSelfHealing(
      { 'package/index.vue': '<template><div class="x"><span>hi</span></div></template>' },
      {},
      { logger: noopLogger },
    );
    expect(r.summary).toHaveProperty('frameClassScanned');
    expect(r.summary).toHaveProperty('frameClassAligned');
    expect(r.summary.frameClassAligned).toBe(0);
  });
});
