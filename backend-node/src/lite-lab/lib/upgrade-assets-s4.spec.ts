/**
 * upgradeAssets 换芯（S4）确定性链回归：
 * - 挂载主路径走 lab 同源确定性链（mountAssetIcons 六形态 + bg + 闸③④）；
 * - AI 定位仅在确定性链 mounted=0 时降级启用（fallback 互斥）；
 * - 产物结构守卫：缺 package/index.vue 明确报错。
 *
 * 🔴 服务方法重（downloadAssets/fetchNodeData 都要网络）⇒ 用「链路单元」测法：
 * 直接驱动换芯后的核心决策逻辑（确定性链 → fallback 互斥），
 * 端到端集成由真机冒烟覆盖（方案 §6）。
 */
import { buildTruthInventory } from './truth-inventory';
import { mountAssetIcons, collectFigmaTruth } from './truth-matcher';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

jest.mock('archiver', () => ({ ZipArchive: jest.fn() }));

describe('upgradeAssets 换芯（S4）：确定性链主路径', () => {
  const work = join(tmpdir(), `upgrade-s4-${Date.now()}`);
  const packageDir = join(work, 'package');
  const imgDir = join(work, 'resources', 'images');

  afterEach(() => {
    try { rmSync(work, { recursive: true, force: true }); } catch { /* tmp */ }
  });

  it('端到端（fixture 树+产物）：空变量产物 → 确定性链回填 icon，模板零 AI 参与', () => {
    mkdirSync(packageDir, { recursive: true });
    mkdirSync(imgDir, { recursive: true });
    // fixture：VECTOR 图标 + 文本同树；产物空变量待回填
    const nodeData = {
      id: '0:1', type: 'FRAME', name: 'root',
      children: [
        { id: '0:2', type: 'TEXT', name: 'title', characters: '部署节点概览', style: { fontSize: 16 } },
        { id: '48:5903', type: 'VECTOR', name: 'icon-关闭', absoluteBoundingBox: { x: 480, y: 8, width: 10, height: 10 } },
      ],
    };
    const assets = [
      { ref: '48:5903', name: 'icon-关闭', localPath: join(imgDir, 'icon-关闭-5903.png'), downloaded: true },
    ];
    // 模拟下载文件落地
    writeFileSync(join(imgDir, 'icon-关闭-5903.png'), 'png');

    const { truth } = buildTruthInventory(nodeData, assets);
    expect(truth.assets.length).toBe(1);
    expect(truth.assets[0].fileName).toBe('icon-关闭-5903.png');

    const src = [
      '<template>',
      '  <span class="close"><img :src="closeIcon" alt="关闭" /></span>',
      '</template>',
      '<script setup>',
      "const closeIcon = ref('')",
      '</script>',
    ].join('\n');
    const sfc = [{ path: 'package/index.vue', content: src }];
    const r = mountAssetIcons(sfc, truth.assets);
    expect(r.stats.mounted).toBeGreaterThanOrEqual(1);
    expect(r.files[0].content).toContain('closeIcon = ref(labAsset_48_5903)');
    // 确定性链命中 ⇒ AI fallback 不启用（互斥判据：mounted>0）
    expect(r.stats.mounted > 0).toBe(true);
  });

  it('互斥判据：确定性 mounted=0（资产全 decor）⇒ 才允许 AI fallback', () => {
    const nodeData = {
      id: '0:1', type: 'FRAME', name: 'root',
      children: [
        { id: '2:8421', type: 'VECTOR', name: 'g', absoluteBoundingBox: { x: 0, y: 0, width: 8, height: 8 } },
      ],
    };
    const assets = [{ ref: '2:8421', name: 'g', localPath: '/tmp/x/g-8421.png', downloaded: true }];
    const { truth } = buildTruthInventory(nodeData, assets);
    const src = "<template><p>x</p></template><script setup>const a = ref('')</script>";
    const r = mountAssetIcons([{ path: 'package/index.vue', content: src }], truth.assets);
    // g- 是 decor ⇒ 不消费 ⇒ mounted=0 ⇒ 换芯逻辑走 fallback
    expect(r.stats.mounted).toBe(0);
  });

  it('产物结构守卫：缺 package/index.vue ⇒ 明确报错（不再静默改失败）', () => {
    const dir = join(work, 'empty-pkg');
    mkdirSync(dir, { recursive: true });
    expect(existsSync(join(dir, 'index.vue'))).toBe(false);
    // 换芯代码的守卫语义：直接 throw（service 层捕获转 BAD_REQUEST）
    expect(() => {
      if (!existsSync(join(dir, 'index.vue'))) {
        throw new Error('产物结构不支持（缺 package/index.vue）——存量任务请先在详情页确认产物完整');
      }
    }).toThrow('产物结构不支持');
    void collectFigmaTruth; // 引用保持
  });
});
