/**
 * 🛡️ S1.1（2026-11-03）component-meta 写入契约测试
 *
 * 阳性对照（CR9-③）：模拟「graph 层先写 patchHitReport/runtimeVerified →
 * S10 saveComponentMeta 无条件覆写」的真实时序，断言字段不被抹除。
 */
jest.mock('../config/backend-root', () => {
  const { mkdtempSync } = jest.requireActual('fs');
  const { join: pjoin } = jest.requireActual('path');
  const { tmpdir } = jest.requireActual('os');
  const root = mkdtempSync(pjoin(tmpdir(), 'mvgo-meta-util-'));
  (global as any).__metaUtilRoot = root;
  return {
    backendRoot: pjoin(root, 'backend-node'),
    projectRoot: root,
    workspaceRoot: pjoin(root, 'workspace'),
    customComponentsDir: pjoin(root, 'workspace', 'custom-components'),
    vue3ComponentsDir: pjoin(root, 'workspace', 'vue3-components'),
    dataDir: pjoin(root, 'data'),
  };
});
jest.mock('../config/workspace.config', () => ({
  resolveFrontendWorkspace: () =>
    pjoinFrontend((global as any).__metaUtilRoot),
}));

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join as pjoin } from 'path';
import { saveComponentMeta } from './component-meta.util';

function pjoinFrontend(root: string) {
  return pjoin(root, 'frontend', 'workspace');
}

const backendVue3Dir = () =>
  pjoin((global as any).__metaUtilRoot, 'workspace', 'vue3-components', 'g1', 'c1');
const frontendVue3Dir = () =>
  pjoin((global as any).__metaUtilRoot, 'frontend', 'workspace', 'vue3-components', 'g1', 'c1');

function readMeta(dir: string) {
  return JSON.parse(readFileSync(pjoin(dir, 'component-meta.json'), 'utf-8'));
}

describe('saveComponentMeta（S1.1 merge-aware 写入契约）', () => {
  it('顺序链阳性对照：graph 先写的字段在 S10 无条件覆写后仍保留（双目标）', async () => {
    // 模拟 graph complete 节点先写（runtimeVerified + patchHitReport）
    for (const dir of [backendVue3Dir(), frontendVue3Dir()]) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        pjoin(dir, 'component-meta.json'),
        JSON.stringify({
          runtimeVerified: false,
          patchHitReport: { patchChainErrors: 3 },
          visualFidelity: 88,
        }),
        'utf-8',
      );
    }

    // S10 无条件调用（不传 patchHitReport）
    await saveComponentMeta('g1', 'c1', 'vue3', '需求文档X', { modules: [] } as any, {
      degraded: false,
    });

    for (const dir of [backendVue3Dir(), frontendVue3Dir()]) {
      const meta = readMeta(dir);
      // graph 层字段必须存活
      expect(meta.runtimeVerified).toBe(false);
      expect(meta.patchHitReport).toEqual({ patchChainErrors: 3 });
      expect(meta.visualFidelity).toBe(88);
      // 本函数权威字段必须覆盖/写入
      expect(meta.requirementDoc).toBe('需求文档X');
      expect(meta.docAnalysis).toEqual({ modules: [] });
      expect(typeof meta.generatedAt).toBe('string');
      expect(meta.quality).toEqual({ degraded: false });
    }
  });

  it('显式传入 patchHitReport ⇒ 覆盖既有值（含 0 也落盘）', async () => {
    await saveComponentMeta('g1', 'c1', 'vue3', '需求文档X', undefined, undefined, {
      patchChainErrors: 0,
      selfHealing: undefined,
    } as any);
    const meta = readMeta(backendVue3Dir());
    expect(meta.patchHitReport.patchChainErrors).toBe(0);
  });

  it('microcode 目标目录同样 merge（custom-components 双写）', async () => {
    await saveComponentMeta('', 'mc-1', 'microcode', '', undefined, undefined, {
      patchChainErrors: 1,
    });
    const backendDir = pjoin(
      (global as any).__metaUtilRoot,
      'workspace',
      'custom-components',
      'mc-1',
    );
    const frontendDir = pjoin(
      (global as any).__metaUtilRoot,
      'frontend',
      'workspace',
      'custom-components',
      'mc-1',
    );
    expect(existsSync(pjoin(backendDir, 'component-meta.json'))).toBe(true);
    expect(existsSync(pjoin(frontendDir, 'component-meta.json'))).toBe(true);
    expect(readMeta(backendDir).patchHitReport.patchChainErrors).toBe(1);
    expect(readMeta(frontendDir).patchHitReport.patchChainErrors).toBe(1);
  });

  it('旧 meta 损坏（非法 JSON）⇒ 重建不抛错', async () => {
    const dir = backendVue3Dir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(pjoin(dir, 'component-meta.json'), '{broken json', 'utf-8');
    await expect(
      saveComponentMeta('g1', 'c1', 'vue3', 'doc', undefined, undefined),
    ).resolves.toBeUndefined();
    expect(readMeta(dir).requirementDoc).toBe('doc');
  });
});
