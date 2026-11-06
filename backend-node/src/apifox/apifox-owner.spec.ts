// backend-root.js 是 ESM 风格（import.meta.url / const __filename），ts-jest CJS 下与模块
// 包装器参数撞名会让整套件 0 运行 ⇒ 工厂 mock 绕过（同 tasks-config-snapshot 惯例）。
jest.mock(
  '../config/backend-root.js',
  () => {
    const cwd = process.cwd();
    return {
      backendRoot: cwd,
      projectRoot: cwd,
      workspaceRoot: cwd,
      customComponentsDir: cwd,
      vue3ComponentsDir: cwd,
      resolveFrontendWorkspacePath: () => cwd,
      frontendCustomComponentsDir: () => cwd,
      frontendVue3ComponentsDir: () => cwd,
      tempComponentsDir: cwd,
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

// archiver@8 是纯 ESM，apifox-generator.service 顶层 `require('archiver')` ⇒
// jest(CJS) 下必炸 SyntaxError。本 spec 只关心归属字段，不需真打包能力。
jest.mock('archiver', () => ({
  ZipArchive: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    directory: jest.fn(),
    finalize: jest.fn(),
  })),
}));

import { ValidationPipe } from '@nestjs/common';
import { RecordApifoxDto } from './dto/record-apifox.dto';
import { ApifoxController } from './apifox.controller';
import { ApifoxTask, mergeTaskRecord, normalizeOwnerId } from './apifox.service';

/** 形如 session.guard 写入的 `user._id.toString()` */
const OWNER = '507f1f77bcf86cd799439011';
const OTHER = '507f191e810c19729de860ea';

describe('apifox record 归属（ownerId）', () => {
  /**
   * 根因层：全局 ValidationPipe({ whitelist: true }) 会剥离「DTO 未声明」的字段。
   * 这里用真实 pipe（不 new 私有实例、不手写剥逻辑）复现 main.ts 的行为，
   * 所以「删掉 DTO 里的 ownerId/userId 声明」会让本组立刻红。
   */
  describe('根因：DTO 字段声明决定 whitelist 是否剥离', () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const transform = (body: Record<string, unknown>) =>
      pipe.transform(body, { type: 'body', metatype: RecordApifoxDto }) as Promise<any>;

    it('userId（SKILL.md 实际发送的字段名）不再被剥离', async () => {
      const out = await transform({ taskId: 'apifox-m-1', moduleName: 'm', userId: OWNER });
      expect(out.userId).toBe(OWNER);
    });

    it('ownerId 不再被剥离', async () => {
      const out = await transform({ taskId: 'apifox-m-1', moduleName: 'm', ownerId: OWNER });
      expect(out.ownerId).toBe(OWNER);
    });

    it('阳性对照：白名单仍然生效，未声明字段照旧被剥离', async () => {
      // 若有人为了「让 userId 通过」把 whitelist 改成 false，本断言会红
      const out = await transform({ taskId: 'apifox-m-1', moduleName: 'm', evil: 'x' });
      expect('evil' in out).toBe(false);
    });
  });

  /**
   * 归一层：只有形态上确实是平台用户 ID 的值才允许落库。
   * 动机：SKILL.md 的 `userId` 缺省值是 `default-user`，落进 ownerId 会让记录
   * 对**所有人（含作者）**不可见 —— 比「所有人可见」更坏的静默事故。
   */
  describe('normalizeOwnerId：非平台用户 ID 不落库', () => {
    it('接受 ObjectId 形态（session.guard 的唯一来源形态）', () => {
      expect(normalizeOwnerId(OWNER)).toBe(OWNER);
    });

    it('拒绝 SKILL.md 缺省值 default-user', () => {
      expect(normalizeOwnerId('default-user')).toBeUndefined();
    });

    it('拒绝空串 / 纯空白 / 非字符串', () => {
      expect(normalizeOwnerId('')).toBeUndefined();
      expect(normalizeOwnerId('   ')).toBeUndefined();
      expect(normalizeOwnerId(undefined)).toBeUndefined();
      expect(normalizeOwnerId(123 as any)).toBeUndefined();
    });
  });

  /**
   * 合并层：幂等登记的「不覆盖已有 ownerId」。
   * 若这里退化成 `{ ...old, ...next }`，一条私有记录会被一次无归属的重复登记
   * 瞬间打回「所有人可见」，且没有任何报错。
   */
  describe('mergeTaskRecord：更新分支不抹掉已有 ownerId', () => {
    const existing: ApifoxTask = {
      taskId: 'apifox-m-1',
      moduleName: 'm',
      ownerId: OWNER,
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    it('本次没算出归属时保留原 ownerId 与首次创建时间', () => {
      const merged = mergeTaskRecord(
        existing,
        { taskId: 'apifox-m-1', moduleName: 'm2', ownerId: undefined },
        '2026-02-02T00:00:00.000Z',
      );
      expect(merged.ownerId).toBe(OWNER);
      expect(merged.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(merged.moduleName).toBe('m2'); // 其他字段仍以本次为准
    });

    it('本次明确算出归属时才覆盖', () => {
      const merged = mergeTaskRecord(
        existing,
        { taskId: 'apifox-m-1', moduleName: 'm', ownerId: OTHER },
        '2026-02-02T00:00:00.000Z',
      );
      expect(merged.ownerId).toBe(OTHER);
    });

    it('新记录：无归属时不编造 ownerId，且补齐 downloadUrl', () => {
      const task = mergeTaskRecord(undefined, { taskId: 'apifox-m-2', moduleName: 'm' }, 'now');
      expect(task.ownerId).toBeUndefined();
      expect(task.downloadUrl).toBe('/api/apifox/download?taskId=apifox-m-2');
      expect(task.createdAt).toBe('now');
    });
  });

  /** 取值优先级：会话身份 > body.ownerId > body.userId（会话身份无法伪造） */
  describe('controller.record：归属解析优先级', () => {
    let captured: any[];
    let controller: ApifoxController;

    beforeEach(() => {
      captured = [];
      const serviceStub = {
        recordTask: (dto: any) => {
          captured.push(dto);
          return {
            taskId: dto.taskId,
            moduleName: dto.moduleName,
            downloadUrl: '/d',
            ownerId: normalizeOwnerId(dto.ownerId),
          };
        },
      };
      controller = new ApifoxController(serviceStub as any, {} as any, {} as any);
    });

    it('Skill 通路（无会话）落 body.userId', () => {
      const res = controller.record({ taskId: 't1', moduleName: 'm', userId: OWNER } as any, undefined, undefined);
      expect(captured[0].ownerId).toBe(OWNER);
      expect(res.ownerId).toBe(OWNER);
    });

    it('有会话时以会话身份为准，body 伪造无效', () => {
      controller.record({ taskId: 't2', moduleName: 'm', userId: OTHER, ownerId: OTHER } as any, OWNER, undefined);
      expect(captured[0].ownerId).toBe(OWNER);
    });

    it('无任何归属时显式回 null（不返回 undefined，便于调用方判断）', () => {
      const res = controller.record({ taskId: 't3', moduleName: 'm' } as any, undefined, undefined);
      expect(captured[0].ownerId).toBeUndefined();
      expect(res.ownerId).toBeNull();
    });

    it('设了 APIFOX_SKILL_KEY 时无 key 调用仍被拦（密钥语义未被本次改动破坏）', () => {
      const prev = process.env.APIFOX_SKILL_KEY;
      process.env.APIFOX_SKILL_KEY = 'k-123';
      try {
        expect(() => controller.record({ taskId: 't4', moduleName: 'm' } as any, undefined, undefined)).toThrow();
        expect(captured).toHaveLength(0);
        expect(() => controller.record({ taskId: 't4', moduleName: 'm' } as any, undefined, 'k-123')).not.toThrow();
        expect(captured).toHaveLength(1);
      } finally {
        if (prev === undefined) delete process.env.APIFOX_SKILL_KEY;
        else process.env.APIFOX_SKILL_KEY = prev;
      }
    });
  });
});
