/**
 * lite-lab 读路径归属（ownerId）判据。
 *
 * 背景（用户裁决 2026-11-06）：「lab 生成任务也要 ownerId，每个人独立」。
 * 改前 `getReport` / `getArtifact` **没有身份参数**，任何知道 sessionId 的人都能读到
 * 别人的回填报告与产物代码 ⇒ 本篇锁死这条回归。
 *
 * 断言分三层（缺一层就可能拿到假绿）：
 *   ① 阴性：他人 sessionId → 404 且**不暴露存在性**（message 为「不存在」而非「无权」）；
 *   ② 阳性对照 A：**同一 owner** → 通过归属闸，错误必须变成「暂无 lab 报告」
 *      （证明 ① 的拒绝来自归属判据本身，而不是「这个方法一律抛 404」这种假绿）；
 *   ③ 阳性对照 B：**无主任务**（`task.userId` 缺失）→ 放行（存量兼容，见 service 注释 ①）。
 *
 * 另附「控制器透传」断言：controller 必须把 `req.session.userId` 交给 service，
 * 否则 service 侧判据恒收到 `undefined` ⇒ 所有人被自己锁死（或全放行），两者都静默。
 */

// backend-root.js 是 ESM 风格（import.meta.url / const __filename），ts-jest CJS 下与模块
// 包装器参数撞名会让整套件 0 运行 ⇒ 工厂 mock 绕过（同 apifox-owner.spec 惯例）。
jest.mock(
  '../../config/backend-root.js',
  () => {
    const cwd = process.cwd();
    return {
      backendRoot: cwd,
      projectRoot: cwd,
      workspaceRoot: cwd,
      customComponentsDir: cwd,
      vue3ComponentsDir: cwd,
      // 刻意指向不存在目录：归属闸通过后再走 locateOutputPath 时立即落空，
      // 从而让「报告不存在」这条 404 与归属 404 可区分（见断言 ②）。
      tempComponentsDir: '/tmp/mvgo-lite-lab-owner-spec/__no_such_dir__',
      dataDir: cwd,
      logsDir: '/tmp/mvgo-test-logs',
      configDir: cwd,
      chatAttachmentsDir: cwd,
      apifoxZipsDir: cwd,
      apiCatalogsDir: cwd,
    };
  },
  { virtual: true },
);

// archiver@8 是纯 ESM，tasks.service 顶层 `require('archiver')` ⇒ jest(CJS) 下必炸 SyntaxError。
jest.mock('archiver', () => ({
  ZipArchive: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    directory: jest.fn(),
    finalize: jest.fn(),
  })),
}));

// 只关心归属判据，不拉真实任务/模型/进度依赖图（它们各自带 DB/ESM 依赖，与本案无关）。
jest.mock('../../tasks/tasks.service', () => ({ TasksService: class {} }));
jest.mock('../../tasks/task-code-snapshot.service', () => ({ TaskCodeSnapshotService: class {} }));
jest.mock('../../lite/lite.service', () => ({ LiteService: class {} }));
jest.mock('../../progress/progress.service', () => ({ ProgressService: class {} }));
jest.mock('../../config/config.service', () => ({ AiConfigService: class {} }));

import { LiteLabController } from './lite-lab.controller';
import { LiteLabService } from './lite-lab.service';

/** 形如 session.guard 写入的 `user._id.toString()`（24 hex） */
const OWNER = '507f1f77bcf86cd799439011';
const OTHER = '507f191e810c19729de860ea';

const SESSION = 'mc-lab-1793900000000-abcdef01';

function makeService(task: any) {
  const tasksService: any = { getTask: jest.fn(() => task) };
  const service = new LiteLabService(
    {} as any, // LiteService
    tasksService,
    {} as any, // ProgressService
    {} as any, // AiConfigService
    {} as any, // TaskCodeSnapshotService
  );
  // 断言只关归属闸，不产出噪声日志
  (service as any).logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
  return { service, tasksService };
}

describe('lite-lab 读路径归属闸（getReport / getArtifact）', () => {
  describe('getReport', () => {
    it('① 阴性：他人的 sessionId 被拒，且 404 不暴露存在性', () => {
      const { service } = makeService({ userId: OWNER });
      let err: any;
      try {
        service.getReport(SESSION, OTHER);
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.status).toBe(404);
      // 关键：不能说「无权访问」——那等于承认「这个 sessionId 存在」
      expect(err.message).toBe(`任务 ${SESSION} 不存在`);
      expect(err.message).not.toContain('无权');
    });

    it('① 阴性：匿名调用（无 userId）同样被拒', () => {
      const { service } = makeService({ userId: OWNER });
      let err: any;
      try {
        service.getReport(SESSION, undefined);
      } catch (e) {
        err = e;
      }
      expect(err?.status).toBe(404);
      expect(err?.message).toBe(`任务 ${SESSION} 不存在`);
    });

    it('① 阴性：跨 owner 时留 warn 痕迹（真机可 grep [owner]）', () => {
      const { service } = makeService({ userId: OWNER });
      try {
        service.getReport(SESSION, OTHER);
      } catch {
        /* 预期 */
      }
      const warn = (service as any).logger.warn as jest.Mock;
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('[lite-lab][owner]');
      expect(String(warn.mock.calls[0][0])).toContain(SESSION);
    });

    it('② 阳性对照 A：同一 owner 通过归属闸（错误变为「暂无 lab 报告」）', () => {
      const { service, tasksService } = makeService({ userId: OWNER });
      let err: any;
      try {
        service.getReport(SESSION, OWNER);
      } catch (e) {
        err = e;
      }
      expect(tasksService.getTask).toHaveBeenCalledWith(SESSION);
      // 归属闸未拦截 ⇒ 落到「报告不存在」这一层。若归属判据误把同人也拒了，
      // 这里会拿到「任务 ... 不存在」，断言即刻变红（这就是阳性对照的意义）。
      expect(err?.status).toBe(404);
      expect(String(err?.message)).toBe(`任务 ${SESSION} 暂无 lab 报告`);
    });

    it('③ 阳性对照 B：无主任务（无 userId）放行，避免历史任务对作者本人消失', () => {
      const { service } = makeService({ componentId: SESSION }); // 无 userId
      let err: any;
      try {
        service.getReport(SESSION, OTHER);
      } catch (e) {
        err = e;
      }
      expect(String(err?.message)).toBe(`任务 ${SESSION} 暂无 lab 报告`);
    });

    it('③ 阳性对照 B：getTask 返回 undefined（任务记录缺失）也不因归属报错', () => {
      const { service } = makeService(undefined);
      let err: any;
      try {
        service.getReport(SESSION, OTHER);
      } catch (e) {
        err = e;
      }
      expect(String(err?.message)).toBe(`任务 ${SESSION} 暂无 lab 报告`);
    });
  });

  describe('getArtifact', () => {
    it('① 阴性：他人的 sessionId 被拒，404 且不暴露存在性', () => {
      const { service } = makeService({ userId: OWNER });
      let err: any;
      try {
        service.getArtifact(SESSION, 'generated/index.vue', OTHER);
      } catch (e) {
        err = e;
      }
      expect(err?.status).toBe(404);
      expect(err?.message).toBe(`任务 ${SESSION} 不存在`);
    });

    it('② 阳性对照 A：同一 owner 通过归属闸（错误变为「产物目录不存在」）', () => {
      const { service } = makeService({ userId: OWNER });
      let err: any;
      try {
        service.getArtifact(SESSION, 'generated/index.vue', OWNER);
      } catch (e) {
        err = e;
      }
      expect(err?.status).toBe(404);
      expect(String(err?.message)).toBe(`任务 ${SESSION} 产物目录不存在`);
    });
  });
});

describe('lite-lab 控制器必须透传身份（否则 service 侧判据恒收 undefined）', () => {
  it('report 透传 req.session.userId', async () => {
    const fake: any = {
      getReport: jest.fn(() => ({ status: 'done', sessionId: SESSION })),
    };
    const controller = new LiteLabController(fake);
    await controller.report(SESSION, { session: { userId: OWNER } });
    expect(fake.getReport).toHaveBeenCalledWith(SESSION, OWNER);
  });

  it('report 在匿名请求下透传 undefined（不伪造身份）', async () => {
    const fake: any = {
      getReport: jest.fn(() => ({ status: 'done', sessionId: SESSION })),
    };
    const controller = new LiteLabController(fake);
    await controller.report(SESSION, {});
    expect(fake.getReport).toHaveBeenCalledWith(SESSION, undefined);
  });

  it('artifact 透传 req.session.userId（token 走 query 亦经 OptionalSessionGuard 解析）', async () => {
    const fake: any = {
      getArtifact: jest.fn(() => ({ buffer: Buffer.from('x'), ext: '.vue' })),
    };
    const res: any = { type: jest.fn(() => res), send: jest.fn(), status: jest.fn(() => res), json: jest.fn() };
    const controller = new LiteLabController(fake);
    await controller.artifact(SESSION, 'generated/index.vue', { session: { userId: OWNER } }, res);
    expect(fake.getArtifact).toHaveBeenCalledWith(SESSION, 'generated/index.vue', OWNER);
  });
});
