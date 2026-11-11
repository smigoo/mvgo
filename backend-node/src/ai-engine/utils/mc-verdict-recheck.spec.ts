/**
 * 🛡️ 判决复核 spec（2026-11-11 · 根治③ · mc-max-1794405755148-1d77a3c5 实锤）
 *
 * 病灶：最后一轮写盘（22:05:50）产物已合格；后续重试轮在内存里再次产出坏文件、
 * 被语义门禁正确拦截、预算耗尽放弃（22:07:08）⇒ 任务判失败，而磁盘交付物是好的。
 * 修复：放弃前对磁盘当前产物复跑 validateVueScriptSemantics，通过 ⇒ 沿用交付物。
 */
jest.mock('../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: process.cwd() + '/logs',
  backendRoot: process.cwd(),
  projectRoot: process.cwd(),
  customComponentsDir: process.cwd(),
  vue3ComponentsDir: process.cwd(),
  tempComponentsDir: process.cwd(),
  dataDir: process.cwd(),
  configDir: process.cwd(),
  resolveFrontendWorkspacePath: () => process.cwd(),
}), { virtual: true });
jest.mock('archiver', () => ({ ZipArchive: jest.fn() }), { virtual: true });
// acorn-optional-loader 内部用 import.meta（ESM 形态），ts-jest CJS 下解析期即炸；
// 缺失时 sfc-semantics 自降级 null（自由变量检测关闭，不影响本 spec 的模板引用判据）
jest.mock('./acorn-optional-loader.js', () => ({ acornParser: null, acornWalker: null }));

import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { recheckDiskArtifactSemantics } from '../utils/verdict-recheck.js';

describe('recheckDiskArtifactSemantics（放弃前对磁盘产物复核语义门禁）', () => {
  let dir: string;

  afterEach(() => {
    if (dir) {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* noop */ }
    }
  });

  it('① 阳性：磁盘产物语义合格（chartRef 已声明形态）⇒ ok:true 沿用交付物', async () => {
    dir = mkdtempSync(join(tmpdir(), 'recheck-ok-'));
    const pkg = join(dir, 'package');
    mkdirSync(join(pkg, 'components'), { recursive: true });
    writeFileSync(
      join(pkg, 'components', 'ContentForecast.vue'),
      '<template><div ref="chartRef" @click="toggle(\'a\')"></div></template>\n' +
      "<script setup>\nimport { ref } from 'vue'\nconst chartRef = ref(null)\nconst toggle = (x) => x\n</script>\n",
      'utf8',
    );
    const r = await recheckDiskArtifactSemantics({ outputPath: dir });
    expect(r.ok).toBe(true);
    expect(r.checked).toBe(1);
  });

  it('② 阳性对照（病灶复刻）：磁盘产物引用未声明变量 ⇒ ok:false 附 issue', async () => {
    dir = mkdtempSync(join(tmpdir(), 'recheck-bad-'));
    const pkg = join(dir, 'package');
    mkdirSync(join(pkg, 'components'), { recursive: true });
    writeFileSync(
      join(pkg, 'components', 'Bad.vue'),
      "<template><div :class=\"cardClass\">x</div></template>\n<script setup>\nconst props = defineProps({})\n</script>\n",
      'utf8',
    );
    const r = await recheckDiskArtifactSemantics({ outputPath: dir });
    expect(r.ok).toBe(false);
    expect(r.issues.length).toBeGreaterThan(0);
  });

  it('③ 阴性边界：无 package 目录（产物未落盘）⇒ ok:false reason=no-artifact（维持放弃）', async () => {
    dir = mkdtempSync(join(tmpdir(), 'recheck-none-'));
    const r = await recheckDiskArtifactSemantics({ outputPath: dir });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no-artifact');
  });

  it('④ 阴性边界：outputPath 缺失 ⇒ ok:false（不抛异常）', async () => {
    const r = await recheckDiskArtifactSemantics({});
    expect(r.ok).toBe(false);
  });
});
