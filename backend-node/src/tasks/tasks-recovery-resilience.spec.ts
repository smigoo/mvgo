/**
 * tasks-recovery-resilience.spec.ts
 *
 * 🛡️ P0-4 / P0-5 / P0-6（2026-11-14）三条"服务层不再把好产物判死"的不变量：
 *   P0-4 终态收口必须收尾 progress 里残留的 running 步骤 —— 否则 recover 恒判"仍在运行"，
 *        已是 cancelled 的假失败永远回不到 completed（mc-max-1794649936763-a9c2f958 实锤）。
 *   P0-5 交付前终态闸：cancelled / failed ⇒ 不发布、不登记（a9c2f958 cancel 10s 后仍落库实锤）。
 *   P0-6 恢复链路 EPERM 降级：整目录复制失败要退化为逐文件复制，单文件失败不得让恢复流产
 *        （mc-1794649780129-ef41c265 恢复期 `EPERM unlink declare.json` 实锤）。
 *
 * 说明：三个被测点都是私有方法，这里用 `Object.create(TasksService.prototype)` 直取原型，
 * 不跑构造函数（避免拉起 Redis/Mongo/磁盘任务加载）；行为与真机同一份实现。
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { TasksService } from './tasks.service';

// backend-root.js 在 jest CJS 下需要 mock（同仓已有 31 个套件同款惯例）。
// 目录在工厂内部现算：jest.mock 会被提升到 import 之前，引用外部 const 会落 TDZ。
jest.mock('../config/backend-root', () => {
  const os = require('os');
  const path = require('path');
  const dir = path.join(os.tmpdir(), `mvgo-recovery-${process.pid}`);
  return {
    backendRoot: dir,
    projectRoot: dir,
    workspaceRoot: dir + '/workspace',
    customComponentsDir: dir + '/workspace/custom-components',
    vue3ComponentsDir: dir + '/workspace/vue3-components',
    tempComponentsDir: dir + '/temp-components',
    dataDir: dir,
    resolveFrontendWorkspace: () => dir + '/frontend/workspace',
    resolveFrontendWorkspacePath: () => dir + '/frontend/workspace',
    frontendCustomComponentsDir: () => dir + '/frontend/workspace/custom-components',
    frontendVue3ComponentsDir: () => dir + '/frontend/workspace/vue3-components',
  };
});

// archiver 是 ESM-only（`import Archiver from ...`），jest CJS 下需 mock，
// 本套件只测文件复制与状态收口，不涉及 zip 归档。
jest.mock('archiver', () => ({ ZipArchive: class ZipArchive {} }));

function makeService(overrides: Record<string, any> = {}): any {
  const svc: any = Object.create(TasksService.prototype);
  svc.logger = { log: () => {}, warn: () => {}, error: () => {} };
  Object.assign(svc, overrides);
  return svc;
}

describe('P0-4 终态收口收尾 running 步骤', () => {
  it('cancelled：残留 running 步骤被置为 cancelled，并补中断说明与 endTime', () => {
    const svc = makeService();
    const task: any = {
      sessionId: 's1',
      status: 'running',
      startTime: Date.now() - 1000,
      progress: [
        { type: 'progress', stage: '视觉分析', status: 'completed' },
        { type: 'progress', stage: '代码生成', status: 'running' },
      ],
    };
    svc.finalizeTask(task, 'cancelled', { error: '用户主动终止', refreshEndTime: true });

    const running = task.progress.filter((p: any) => p.status === 'running');
    expect(running).toHaveLength(0);
    expect(task.progress[1].status).toBe('cancelled');
    expect(task.progress[1].message).toContain('中断');
    expect(task.progress[1].endTime).toBeDefined();
    // 已完成步骤不被改写
    expect(task.progress[0].status).toBe('completed');
  });

  it('completed：残留 running 步骤被置为 completed（不制造"完成但有步骤在转"）', () => {
    const svc = makeService();
    const task: any = {
      sessionId: 's2',
      status: 'running',
      startTime: Date.now() - 1000,
      progress: [{ type: 'progress', stage: '收尾', status: 'running' }],
    };
    svc.finalizeTask(task, 'completed', { refreshEndTime: true });
    expect(task.progress[0].status).toBe('completed');
  });

  it('幂等：没有 running 步骤时零改动', () => {
    const svc = makeService();
    const progress = [{ type: 'progress', stage: 'a', status: 'completed' }];
    const task: any = { sessionId: 's3', status: 'running', startTime: 1, progress };
    svc.finalizeTask(task, 'failed', { error: 'x' });
    expect(task.progress).toEqual(progress);
  });
});

describe('P0-4b recover 的「仍在运行」判据不得被终态任务误触发', () => {
  const src = readFileSync(join(__dirname, 'tasks.service.ts'), 'utf-8');

  it('三处 hasRunningStep 都以 task.status === running 为前提', () => {
    const sites = src.match(/const hasRunningStep =[\s\S]{0,220}?\);/g) || [];
    expect(sites.length).toBeGreaterThanOrEqual(3);
    for (const s of sites) {
      expect(s).toMatch(/task\.status === 'running'/);
    }
  });

  it('反向断言：不允许回退成「只看 progress 不看 status」的旧写法', () => {
    expect(src).not.toMatch(/const hasRunningStep = \(task\.progress \|\| \[\]\)\.some\(/);
  });
});

describe('P0-5 交付前终态闸（接线契约）', () => {
  // 判据本体在 Phase2Service 私有方法上（依赖 Injectable 全家桶，直接 new 会拉起 Mongo/Redis），
  // 故此处按本仓既有惯例做**接线契约断言**：定义存在 + 两个交付点都被闸住 + 失败安全方向正确。
  const readSrc = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

  it('终态闸定义存在，且只对 cancelled / failed 判流产', () => {
    const src = readSrc('../phase2/phase2.service.ts');
    expect(src).toMatch(/private isDeliveryAbortedInDelivery\(/);
    expect(src).toMatch(/status === 'cancelled' \|\| status === 'failed'/);
    // 失败安全：读不到就放行
    expect(src).toMatch(/return \{ aborted: false \}/);
  });

  it('候选预览发布点被闸住（aborted 时跳过发布并回滚事务）', () => {
    const src = readSrc('../phase2/phase2.service.ts');
    expect(src).toMatch(/const deliveryGate = this\.isDeliveryAbortedInDelivery\(sessionId\)/);
    expect(src).toMatch(/if \(hasPreviewEntry && !deliveryGate\.aborted\)/);
    // 反向断言：不允许回退成无条件发布
    expect(src).not.toMatch(/\n\s*if \(hasPreviewEntry\) \{/);
  });

  it('组件登记点被闸住（aborted 时 return，不落库/不扣配额）', () => {
    const src = readSrc('../phase2/phase2.service.ts');
    expect(src).toMatch(/const saveGate = this\.isDeliveryAbortedInDelivery\(sessionId\)/);
    expect(src).toMatch(/if \(saveGate\.aborted\) \{[\s\S]{0,200}return;/);
  });
});

describe('P0-6 恢复链路降级复制', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'mvgo-recover-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('目标已存在同名文件时仍能覆盖写入（模拟整目录 cp 失败后的降级路径）', () => {
    const src = join(root, 'src');
    const dest = join(root, 'dest');
    mkdirSync(join(src, 'package'), { recursive: true });
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(src, 'declare.json'), 'NEW');
    writeFileSync(join(src, 'package', 'index.vue'), '<template><div/></template>');
    // 目标预置同内容路径（真实 EPERM 场景就是"目标已存在"）
    writeFileSync(join(dest, 'declare.json'), 'OLD');

    const svc = makeService();
    const errors = svc.copyTreeResilientSync(src, dest);

    expect(errors).toEqual([]);
    expect(readFileSync(join(dest, 'declare.json'), 'utf-8')).toBe('NEW');
    expect(existsSync(join(dest, 'package', 'index.vue'))).toBe(true);
  });

  it('skip 谓词生效：index.html 不复制（与 fs.cp 的 filter 契约一致）', () => {
    const src = join(root, 's2');
    const dest = join(root, 'd2');
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, 'index.html'), '<html/>');
    writeFileSync(join(src, 'declare.json'), 'x');

    const svc = makeService();
    svc.copyTreeResilientSync(src, dest, (p: string) => p.endsWith('index.html'));

    expect(existsSync(join(dest, 'index.html'))).toBe(false);
    expect(existsSync(join(dest, 'declare.json'))).toBe(true);
  });

  it('单文件读写失败只记 errors，不抛出（恢复不得因一个文件流产）', () => {
    const src = join(root, 's3');
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, 'ok.txt'), 'ok');
    const svc = makeService();
    // 目标指向一个"父级是文件"的非法路径 ⇒ mkdir 失败，但函数仍返回 errors 而非 throw
    const badDest = join(root, 's3', 'ok.txt', 'nested');
    expect(() => svc.copyTreeResilientSync(src, badDest)).not.toThrow();
    expect(svc.copyTreeResilientSync(src, badDest).length).toBeGreaterThan(0);
  });
});
