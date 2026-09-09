import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

jest.mock('archiver', () => ({
  ZipArchive: class ZipArchive {},
}));

import { Phase2Service } from './phase2.service';

describe('Phase2Service copyToWorkspace', () => {
  const originalCwd = process.cwd();
  const originalFrontendWorkspace = process.env.FRONTEND_WORKSPACE;
  let tempRoot: string;

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

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'mvgo-phase2-'));
    await mkdir(join(tempRoot, 'backend-node'), { recursive: true });
    await mkdir(join(tempRoot, 'frontend-workspace'), { recursive: true });
    process.chdir(join(tempRoot, 'backend-node'));
    process.env.FRONTEND_WORKSPACE = join(tempRoot, 'frontend-workspace');
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (originalFrontendWorkspace === undefined) {
      delete process.env.FRONTEND_WORKSPACE;
    } else {
      process.env.FRONTEND_WORKSPACE = originalFrontendWorkspace;
    }
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('copies Vue3 resources to both component root and package/resources in backend and frontend workspaces', async () => {
    const service = createService() as any;
    const outputPath = join(tempRoot, 'temp-components', 'group-a', 'mv-test');
    await mkdir(join(outputPath, 'package'), { recursive: true });
    await mkdir(join(outputPath, 'resources'), { recursive: true });
    await writeFile(join(outputPath, 'package', 'index.vue'), '<template><img src="./resources/logo.png" /></template>', 'utf-8');
    await writeFile(join(outputPath, 'resources', 'logo.png'), 'fake-image', 'utf-8');

    await service.copyToWorkspace(outputPath, 'mv-test', 'vue3', 'group-a');

    const backendComponent = join(tempRoot, 'backend-node', 'workspace', 'vue3-components', 'group-a', 'mv-test');
    const frontendComponent = join(tempRoot, 'frontend-workspace', 'vue3-components', 'group-a', 'mv-test');

    for (const componentPath of [backendComponent, frontendComponent]) {
      expect(existsSync(join(componentPath, 'index.vue'))).toBe(true);
      expect(await readFile(join(componentPath, 'resources', 'logo.png'), 'utf-8')).toBe('fake-image');
      expect(await readFile(join(componentPath, 'package', 'resources', 'logo.png'), 'utf-8')).toBe('fake-image');
    }
  });

  it('does not create package/resources when Vue3 output has no package directory', async () => {
    const service = createService() as any;
    const outputPath = join(tempRoot, 'temp-components', 'group-a', 'mv-no-package');
    await mkdir(join(outputPath, 'resources'), { recursive: true });
    await writeFile(join(outputPath, 'resources', 'logo.png'), 'fake-image', 'utf-8');

    await service.copyToWorkspace(outputPath, 'mv-no-package', 'vue3', 'group-a');

    const backendComponent = join(tempRoot, 'backend-node', 'workspace', 'vue3-components', 'group-a', 'mv-no-package');
    expect(await readFile(join(backendComponent, 'resources', 'logo.png'), 'utf-8')).toBe('fake-image');
    expect(existsSync(join(backendComponent, 'package', 'resources'))).toBe(false);
  });

  it('prefers normalized figma size metadata over the raw figma cache', async () => {
    const service = createService() as any;
    const outputPath = join(tempRoot, 'temp-components', 'group-a', 'mv-size');
    await mkdir(join(outputPath, 'package'), { recursive: true });
    await mkdir(join(outputPath, '.mc-gen', 'cache'), { recursive: true });
    await writeFile(join(outputPath, 'package', 'index.vue'), '<template><div /></template>', 'utf-8');
    await writeFile(
      join(outputPath, '_figma-size.json'),
      JSON.stringify({ document: { absoluteBoundingBox: { width: 320, height: 180 } } }),
      'utf-8',
    );
    await writeFile(
      join(outputPath, '.mc-gen', 'cache', 'figma-node-data.json'),
      JSON.stringify({ document: { absoluteBoundingBox: { width: 640, height: 360 } } }),
      'utf-8',
    );

    await service.copyToWorkspace(outputPath, 'mv-size', 'microcode', 'group-a');

    const targetSizePath = join(tempRoot, 'frontend-workspace', 'custom-components', 'mv-size', '_figma-size.json');
    expect(JSON.parse(await readFile(targetSizePath, 'utf-8'))).toEqual({
      document: { absoluteBoundingBox: { width: 320, height: 180 } },
    });
  });
});
