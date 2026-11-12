/**
 * failure-analysis 访问控制回归锁（2026-11-12，R13）
 *
 * 🔴 背景（生产实锤）：`GET /api/task-stats/failure-analysis` 原为「仅 admin」，
 *   但前端 TaskDetail 对**任一失败任务**通用调用它 ⇒ 普通用户打开自己的失败任务
 *   必 403，且永久拿不到后端自愈建议。本套件锁死放宽后的口径：
 *   **任务所有者 或 管理员**可访问，其余逐字回落到原 assertAdmin。
 *
 * 本套件为**行为级**（直接实例化 TaskStatsService，注入 mock 依赖）+ **源码锁**
 * （controller 调用点必须走新方法、不得回退成裸 assertAdmin）。
 *
 * 依赖注入说明：TaskStatsService 只把 AdminService / TasksService / snapshot /
 * 两个 Mongoose Model 用于构造期类型标注，行为断言只需 assertAdmin 与 getTask 两个桩。
 */
// archiver@8 为纯 ESM（index.js 用 `import`），CJS 下 jest 加载 tasks.service 必炸
// （memory 记载的既定范式）。被测行为不涉及打包，给出最小 ZipArchive 桩即可。
jest.mock('archiver', () => ({ ZipArchive: class ZipArchive {} }));

// 绕开 config/backend-root.js 的 import.meta（CJS 下 ts-jest 无法编译该语法；
// memory 记载的既定范式）。✅ 必须补齐该模块的路径导出（尤其 logsDir），
// 否则链上的 ai-engine/logger 会拿到 undefined 并在 join() 处抛
// 「The "path" argument must be of type string」。
jest.mock(
  '../config/backend-root.js',
  () => {
    const p = require('path');
    const backendRoot = p.resolve(__dirname, '../..'); // src/task-stats → backend-node
    const projectRoot = p.resolve(backendRoot, '..');
    const workspaceRoot = p.join(backendRoot, 'workspace');
    const dataDir = p.join(backendRoot, 'data');
    return {
      backendRoot,
      projectRoot,
      workspaceRoot,
      customComponentsDir: p.join(workspaceRoot, 'custom-components'),
      vue3ComponentsDir: p.join(workspaceRoot, 'vue3-components'),
      resolveFrontendWorkspacePath: () =>
        p.join(projectRoot, 'frontend', 'workspace'),
      frontendCustomComponentsDir: () =>
        p.join(projectRoot, 'frontend', 'workspace', 'custom-components'),
      frontendVue3ComponentsDir: () =>
        p.join(projectRoot, 'frontend', 'workspace', 'vue3-components'),
      tempComponentsDir: p.join(projectRoot, 'temp-components'),
      dataDir,
      logsDir: p.join(backendRoot, 'logs'),
      configDir: p.join(backendRoot, 'config'),
      chatAttachmentsDir: p.join(backendRoot, 'temp-chat-attachments'),
      apifoxZipsDir: p.join(dataDir, 'apifox-zips'),
      apiCatalogsDir: p.join(dataDir, 'api-catalogs'),
    };
  },
  { virtual: true },
);

import { ForbiddenException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { TaskStatsService } from './task-stats.service';

const OWNER = 'user-owner-1';
const OTHER = 'user-other-2';

describe('TaskStatsService.assertFailureAnalysisAccess（所有者 or 管理员）', () => {
  let adminAssert: jest.Mock;
  let getTask: jest.Mock;
  let service: TaskStatsService;

  beforeEach(() => {
    adminAssert = jest.fn();
    getTask = jest.fn();
    service = new TaskStatsService(
      { assertAdmin: adminAssert } as any,
      { getTask } as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('✅ 阳性：任务所有者（task.userId === 调用者）放行，且不查 admin', async () => {
    getTask.mockReturnValue({ sessionId: 's1', userId: OWNER, status: 'failed' });

    await expect(
      service.assertFailureAnalysisAccess(OWNER, 's1'),
    ).resolves.toBeUndefined();

    // 证伪旧口径：若判据是「仅 admin」，这里必然调用 assertAdmin 并 403
    expect(adminAssert).not.toHaveBeenCalled();
  });

  it('✅ 阴性对照：同一任务、非所有者且非管理员 ⇒ 拒绝（403 仍来自 assertAdmin）', async () => {
    getTask.mockReturnValue({ sessionId: 's1', userId: OWNER, status: 'failed' });
    adminAssert.mockRejectedValue(
      new ForbiddenException('仅管理员可访问管理后台'),
    );

    await expect(
      service.assertFailureAnalysisAccess(OTHER, 's1'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(adminAssert).toHaveBeenCalledWith(OTHER);
  });

  it('✅ 管理员视角不受影响：非所有者的管理员 ⇒ 放行', async () => {
    getTask.mockReturnValue({ sessionId: 's1', userId: OWNER, status: 'failed' });
    adminAssert.mockResolvedValue(undefined);

    await expect(
      service.assertFailureAnalysisAccess(OTHER, 's1'),
    ).resolves.toBeUndefined();

    expect(adminAssert).toHaveBeenCalledWith(OTHER);
  });

  it('✅ 边界：任务不存在 ⇒ 回落 assertAdmin（普通用户仍 403，不因未知 sessionId 开新面）', async () => {
    getTask.mockReturnValue(undefined);
    adminAssert.mockRejectedValue(
      new ForbiddenException('仅管理员可访问管理后台'),
    );

    await expect(
      service.assertFailureAnalysisAccess(OWNER, 'nope'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(adminAssert).toHaveBeenCalledWith(OWNER);
  });

  it('✅ 边界：历史无主任务（task.userId 为空）⇒ 回落 assertAdmin', async () => {
    getTask.mockReturnValue({ sessionId: 's2', status: 'failed' });
    adminAssert.mockRejectedValue(
      new ForbiddenException('仅管理员可访问管理后台'),
    );

    await expect(
      service.assertFailureAnalysisAccess(OWNER, 's2'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(adminAssert).toHaveBeenCalledWith(OWNER);
  });

  it('✅ 边界：空 sessionId ⇒ 回落 assertAdmin（缺参不得跳过鉴权）', async () => {
    getTask.mockReturnValue(undefined);
    adminAssert.mockRejectedValue(
      new ForbiddenException('仅管理员可访问管理后台'),
    );

    await expect(
      service.assertFailureAnalysisAccess(OTHER, ''),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(adminAssert).toHaveBeenCalledWith(OTHER);
  });
});

describe('源码锁：controller 不得回退为裸 assertAdmin', () => {
  const controllerSrc = readFileSync(
    join(__dirname, 'task-stats.controller.ts'),
    'utf-8',
  );

  it('failureAnalysis 必须调用 assertFailureAnalysisAccess', () => {
    const method = controllerSrc.slice(
      controllerSrc.indexOf("async failureAnalysis("),
    );
    expect(method).toContain('assertFailureAnalysisAccess');
  });

  it('failureAnalysis 方法体内不得出现 assertAdmin', () => {
    const method = controllerSrc.slice(
      controllerSrc.indexOf("async failureAnalysis("),
    );
    // 截到方法结束（下一个 @Get / 类尾），确保只看该方法体
    const end = method.indexOf('\n  @Get', 1);
    const body = end > 0 ? method.slice(0, end) : method;
    expect(body).not.toContain('assertAdmin');
  });

  it('同一控制器其余端点保持「仅 admin」不变（防连坐式全删）', () => {
    const adminCalls = controllerSrc.match(/this\.taskStatsService\.assertAdmin\(/g) || [];
    // listAllTasks / modelCompare / backfillTokenBaseURLs / trends / dashboard
    expect(adminCalls.length).toBeGreaterThanOrEqual(5);
  });

  it('service 侧判据唯一来源：归属口径与 tasks.service 范式同源', () => {
    const serviceSrc = readFileSync(
      join(__dirname, 'task-stats.service.ts'),
      'utf-8',
    );
    expect(serviceSrc).toContain('async assertFailureAnalysisAccess(');
    expect(serviceSrc).toContain('task?.userId && task.userId === userId');
    expect(serviceSrc).toContain('await this.assertAdmin(userId)');
  });
});
