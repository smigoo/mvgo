import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

// backend-root.js 是 ESM（import.meta），jest CJS 下加载即炸（既有基线问题）。
// 这里整体 mock 掉，把所有 workspace 路径指向测试临时目录，
// 让 packageComponent → component-resolver 走真实文件系统做集成验证。
jest.mock('../config/backend-root', () => {
  const { mkdtempSync } = jest.requireActual('fs');
  const { join: pjoin } = jest.requireActual('path');
  const { tmpdir } = jest.requireActual('os');
  const root = mkdtempSync(pjoin(tmpdir(), 'mvgo-pkg-'));
  (global as any).__pkgTestRoot = root;
  const frontendWorkspace = pjoin(root, 'frontend', 'workspace');
  return {
    backendRoot: pjoin(root, 'backend-node'),
    projectRoot: root,
    workspaceRoot: pjoin(root, 'workspace'),
    customComponentsDir: pjoin(root, 'workspace', 'custom-components'),
    vue3ComponentsDir: pjoin(root, 'workspace', 'vue3-components'),
    tempComponentsDir: pjoin(root, 'temp-components'),
    resolveFrontendWorkspacePath: () => frontendWorkspace,
    frontendCustomComponentsDir: () => pjoin(frontendWorkspace, 'custom-components'),
    frontendVue3ComponentsDir: () => pjoin(frontendWorkspace, 'vue3-components'),
    dataDir: pjoin(root, 'data'),
    logsDir: pjoin(root, 'logs'),
    configDir: pjoin(root, 'config'),
    chatAttachmentsDir: pjoin(root, 'temp-chat-attachments'),
    apifoxZipsDir: pjoin(root, 'data', 'apifox-zips'),
    apiCatalogsDir: pjoin(root, 'data', 'api-catalogs'),
  };
});

// archiver 新版为纯 ESM，jest CJS 无法加载；且 zip 压缩是 archiver 自身职责。
// 本套件验证的是「组件目录解析」，用假 ZipArchive 记录传入目录并模拟出流。
const mockArchivedDirs: string[] = [];
jest.mock('archiver', () => ({
  ZipArchive: class {
    private handlers: Record<string, (...args: any[]) => void> = {};
    on(event: string, cb: (...args: any[]) => void) {
      this.handlers[event] = cb;
      return this;
    }
    directory(dir: string) {
      mockArchivedDirs.push(dir);
      return this;
    }
    finalize() {
      this.handlers['data']?.(Buffer.from('PK\x03\x04fake-zip'));
      this.handlers['end']?.();
    }
  },
}));

// 仅 dist 存在的运行时模块，与打包逻辑无关，整体 mock
jest.mock('../ai-engine/utils/workspace-preview-publisher.js', () => ({
  commitQualityPreviewTransaction: jest.fn(),
  publishQualityPreview: jest.fn(),
  rollbackQualityPreviewTransaction: jest.fn(),
}));

import { Phase2Service } from './phase2.service';

describe('Phase2Service packageComponent 路径解析', () => {
  const testRoot: string = (global as any).__pkgTestRoot;
  const frontendWorkspace = join(testRoot, 'frontend', 'workspace');

  beforeEach(() => {
    mockArchivedDirs.length = 0;
  });

  function createService(): Phase2Service {
    return new Phase2Service(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  afterAll(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it('vue3 组件仅存在于 frontend workspace 时也能打包下载', async () => {
    const componentDir = join(
      frontendWorkspace,
      'vue3-components',
      'group-a',
      'mv-vue3-only',
    );
    mkdirSync(componentDir, { recursive: true });
    writeFileSync(join(componentDir, 'index.vue'), '<template><div/></template>', 'utf-8');

    const service = createService();
    const zip = await service.packageComponent('mv-vue3-only', 'vue3', 'group-a');

    expect(Buffer.isBuffer(zip)).toBe(true);
    expect(zip.length).toBeGreaterThan(0);
    // 关键断言：打包的是 frontend workspace 下真实存在的目录
    expect(mockArchivedDirs).toEqual([componentDir]);
  });

  it('microcode 组件仅存在于 frontend workspace 时也能打包下载', async () => {
    const componentDir = join(
      frontendWorkspace,
      'custom-components',
      'mv-mc-only',
    );
    mkdirSync(join(componentDir, 'package'), { recursive: true });
    writeFileSync(join(componentDir, 'package', 'index.vue'), '<template><div/></template>', 'utf-8');

    const service = createService();
    const zip = await service.packageComponent('mv-mc-only', 'microcode', 'group-a');

    expect(Buffer.isBuffer(zip)).toBe(true);
    expect(zip.length).toBeGreaterThan(0);
    expect(mockArchivedDirs).toEqual([componentDir]);
  });

  it('组件在任何 workspace 都不存在时抛出「组件不存在」', async () => {
    const service = createService();
    await expect(
      service.packageComponent('mv-not-exist', 'vue3', 'group-a'),
    ).rejects.toThrow('组件不存在: mv-not-exist');
  });
});
