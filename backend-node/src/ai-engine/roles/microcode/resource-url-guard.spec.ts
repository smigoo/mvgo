/**
 * 🛡️ 刀B·B1 资源 URL 白名单对账 —— 单元测试。
 *
 * 纪律：改者（resource-url-guard 声明正则）与验者（本 spec 断言）不得用同一正则 ——
 * 本文件断言只用字符串 includes / 相等 / 计数。
 */
import { healUndeclaredResourceUrls } from './resource-url-guard.js';

const RES_BG1 = {
  resourceFile: '../resources/images/bg-7890.png',
  downloadStatus: 'success',
  previewAnalysisRole: 'bg',
  mountTarget: 'tabs-list',
  hint: 'tabs-list → tabs-list区域',
  figmaPath: 'cp-环境监测/slot-con/sub-t/tabs-list/bg',
};
const RES_BG2 = {
  resourceFile: '../resources/images/bg-tab-active-7891.png',
  downloadStatus: 'success',
  previewAnalysisRole: 'bg',
  mountTarget: 'tabs-list',
  hint: 'tabs-list → tabs-list区域',
  figmaPath: 'cp-环境监测/slot-con/sub-t/tabs-list/bg-tab-active',
};
const RES_ICON = {
  resourceFile: '../resources/images/icon-7941.png',
  downloadStatus: 'success',
  previewAnalysisRole: 'icon',
  mountTarget: 'tabs-icon',
  hint: 'tabs-icon → tabs-icon区域',
  figmaPath: 'cp-环境监测/slot-con/sub-t/tabs-icon/icon',
};
const MAPPING = [RES_BG1, RES_BG2, RES_ICON];

describe('resource-url-guard · healUndeclaredResourceUrls (刀B·B1)', () => {
  test('阳性（真机形态）：mc-preview 幻觉按词集唯一命中 bg2 → 原位替换', () => {
    const files = {
      'MainSection.vue': `<template><div/></template>
<style scoped>
.c-env-monitor-tab-item.is-active {
  background-image: url('/workspace/mc-preview.png');
  background-size: 100% 100%;
}
</style>`,
    };
    const stats = healUndeclaredResourceUrls(files, MAPPING);
    expect(stats.undeclared).toBe(1);
    expect(stats.replaced).toBe(1);
    expect(stats.stripped).toBe(0);
    const style = files['MainSection.vue'];
    expect(style).not.toContain('mc-preview');
    expect(style).toContain('../resources/images/bg-tab-active-7891.png');
    // 非目标声明保留
    expect(style).toContain('background-size: 100% 100%');
  });

  test('mc-preview 无词集匹配 → 整条声明剥除（宁留白不出错图）', () => {
    const files = {
      'X.vue': `<style scoped>
.c-something-unrelated {
  background-image: url('/workspace/mc-preview.png');
}
</style>`,
    };
    const stats = healUndeclaredResourceUrls(files, MAPPING);
    expect(stats.stripped).toBe(1);
    expect(stats.replaced).toBe(0);
    expect(files['X.vue']).not.toContain('mc-preview');
    expect(files['X.vue']).not.toContain('background-image');
  });

  test('白名单内资源 URL 放行不动', () => {
    const url = "../resources/images/bg-7890.png";
    const files = {
      'Y.vue': `<style scoped>\n.c-xxx-tabs-list { background: url(${url}); }\n</style>`,
    };
    const stats = healUndeclaredResourceUrls(files, MAPPING);
    expect(stats.legal).toBe(1);
    expect(stats.undeclared).toBe(0);
    expect(files['Y.vue']).toContain(url);
  });

  test('变量引用 / data:URI / http 外链一律放行', () => {
    const files = {
      'Z.vue': `<style scoped>
.a { background-image: url(\${bg2}); }
.b { background-image: url(@bgTabActive); }
.c { background-image: url(--bg-var); }
.d { background-image: url(data:image/svg+xml;base64,AAA); }
.e { background-image: url(https://cdn.example.com/x.png); }
</style>`,
    };
    const stats = healUndeclaredResourceUrls(files, MAPPING);
    expect(stats.variableRefs).toBe(3);
    expect(stats.dataUris).toBe(1);
    expect(stats.external).toBe(1);
    expect(stats.undeclared).toBe(0);
    expect(files['Z.vue']).toContain('url(${bg2})');
  });

  test('模态二义（两条候选同分）→ 不猜，剥除', () => {
    const files = {
      'T.vue': `<style scoped>
.c-list { background-image: url('mc-preview.png'); }
</style>`,
    };
    // 🔴 计分按词出现次数：`list` 在 bg1 与 bg2 的 mountTarget/hint/figmaPath 各出现 3 次
    //   （`tab` 则 bg2 多一次 + active ⇒ 唯一胜出），只有 `list` 才构成真平票
    const stats = healUndeclaredResourceUrls(files, MAPPING);
    expect(stats.stripped).toBe(1);
    expect(stats.items[0].reason).toBe('ambiguous');
  });

  test('静态模板 src 幻觉：只计数告警不改', () => {
    const files = {
      'S.vue': `<template>
  <img src="/workspace/mc-preview.png" />
  <img :src="icon1" />
</template>
<style/>`,
    };
    const stats = healUndeclaredResourceUrls(files, MAPPING);
    expect(stats.templateWarns).toBe(1);
    // 未修改（warn-only）
    expect(files['S.vue']).toContain('src="/workspace/mc-preview.png"');
  });

  test('幂等：处理后的文件再跑一遍零改动', () => {
    const files = {
      'M.vue': `<style scoped>
.c-env-monitor-tab-item.is-active { background-image: url('/workspace/mc-preview.png'); }
</style>`,
    };
    healUndeclaredResourceUrls(files, MAPPING);
    const once = files['M.vue'];
    const stats2 = healUndeclaredResourceUrls(files, MAPPING);
    expect(stats2.undeclared).toBe(0);
    expect(stats2.replaced).toBe(0);
    expect(stats2.stripped).toBe(0);
    expect(files['M.vue']).toBe(once);
  });

  test('mapping 为空 → 整体 skip（防误杀无资源任务的合法留白）', () => {
    const files = {
      'N.vue': `<style scoped>.a { background-image: url('/workspace/mc-preview.png'); }</style>`,
    };
    const stats = healUndeclaredResourceUrls(files, []);
    expect(stats.skipped).toBe('no-mapping');
    expect(files['N.vue']).toContain('mc-preview');
  });

  test('.less 全文件即样式，.vue 多 style 块都能扫到', () => {
    const files = {
      'common.less': `.c-list { background: url('/workspace/mc-preview.png') no-repeat; }`,
      'Multi.vue': `<style>A { background-image: url('/workspace/mc-preview.png'); }</style><style scoped>B { background-image: url('/workspace/mc-preview.png'); }</style>`,
    };
    const stats = healUndeclaredResourceUrls(files, MAPPING);
    expect(stats.undeclared).toBe(3);
    expect(stats.stripped).toBe(3);
    expect(files['common.less']).not.toContain('mc-preview');
    expect(files['Multi.vue']).not.toContain('mc-preview');
  });
});
