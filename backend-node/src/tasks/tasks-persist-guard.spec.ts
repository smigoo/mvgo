/**
 * 「历史记录列表记录无故消失」治本·判据单测（2026-11-04）
 *
 * 覆盖 team-lead spec 的 E 项：
 *  ① 双写场景「内存 3 / 文件 5」→ 断言文件**不被缩减**为 3（D 缩减护栏生效）；
 *  ② 存在有意删除时护栏放行 → 允许正常缩短（不误伤用户显式删除 / gc LRU）；
 *  ③ 护栏关闭（等价修复前）→ 内存小集合覆盖磁盘、缩为 3（复现 260→…→6 机理，作为阳性对照）；
 *  ④ B1 解耦 + C 原子写：静态断言 TaskManager 不再与 TasksService 共用同一落盘文件、且已改原子写。
 *
 * 说明：「修改前失败 / 修改后通过」通过 ① vs ③ 对照体现——
 *   修复前无护栏，① 的期望（文件=5）会失败（实际=3）；③ 即修复前真实行为。
 */

jest.mock('archiver', () => ({
  ZipArchive: jest.fn().mockImplementation(() => ({
    append: jest.fn(),
    finalize: jest.fn().mockResolvedValue(undefined),
    pipe: jest.fn(),
  })),
}));

// 独立临时 data 目录（变量名以 mock 前缀 → 允许在 jest.mock 工厂内引用）
const mockOs = require('os');
const mockPath = require('path');
const mockTestDataDir = mockPath.join(mockOs.tmpdir(), `mvgo-guard-${process.pid}`);

jest.mock('../config/backend-root', () => ({
  backendRoot: mockTestDataDir,
  projectRoot: mockTestDataDir,
  workspaceRoot: mockTestDataDir + '/workspace',
  customComponentsDir: mockTestDataDir + '/workspace/custom-components',
  vue3ComponentsDir: mockTestDataDir + '/workspace/vue3-components',
  tempComponentsDir: mockTestDataDir + '/temp-components',
  dataDir: mockTestDataDir,
  resolveFrontendWorkspacePath: () => mockTestDataDir + '/frontend/workspace',
  frontendCustomComponentsDir: () => mockTestDataDir + '/frontend/workspace/custom-components',
  frontendVue3ComponentsDir: () => mockTestDataDir + '/frontend/workspace/vue3-components',
}));

jest.mock('../config/workspace.config', () => ({
  resolveFrontendWorkspace: () => mockTestDataDir + '/frontend/workspace',
  isFrontendWorkspaceAvailable: () => false,
}));

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, promises as fsp } from 'fs';
import { join } from 'path';
import { TasksService, type Task } from './tasks.service';

const PERSIST_PATH = join(mockTestDataDir, 'tasks.json');

/** 造一个最小可用任务（护栏只依赖 sessionId / startTime）。 */
const mkTask = (sessionId: string, startTime: number, extra: Partial<Task> = {}): Task => ({
  sessionId,
  componentId: sessionId,
  status: 'completed',
  startTime,
  progress: [],
  progressCount: 0,
  result: null,
  buffer: [],
  target: 'microcode',
  componentName: sessionId,
  nodeId: 'node-1',
  fileKey: 'file-1',
  panelKey: 'default-panel',
  taskType: 'component',
  ...extra,
});

/** 直接向磁盘写一份「大集合」账本。 */
const writeDiskFixture = (tasks: Task[]) => {
  mkdirSync(mockTestDataDir, { recursive: true });
  writeFileSync(PERSIST_PATH, JSON.stringify(tasks, null, 2), 'utf-8');
};

const readDiskTasks = (): Task[] => JSON.parse(readFileSync(PERSIST_PATH, 'utf-8')) as Task[];

const buildService = (): TasksService => new TasksService();

describe('D：TasksService 落盘缩减护栏（双写互覆防复发）', () => {
  beforeEach(() => {
    rmSync(mockTestDataDir, { recursive: true, force: true });
    mkdirSync(mockTestDataDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(mockTestDataDir, { recursive: true, force: true });
  });

  it('① 内存 3 / 磁盘 5 且无有意删除 → 拒绝缩短，磁盘保持 5（合并 + 回灌；第二次不重复读盘）', async () => {
    const svc = buildService();

    // 磁盘：5 条（含 d4/d5 —— 模拟「另一写入方/更早快照」留下的条目）
    const disk = [
      mkTask('d1', 1000),
      mkTask('d2', 2000),
      mkTask('d3', 3000),
      mkTask('d4', 4000),
      mkTask('d5', 5000),
    ];
    writeDiskFixture(disk);

    // 内存：仅 3 条（d1~d3），且**未登记**任何有意删除
    (svc as any).tasks.clear();
    (svc as any).tasks.set('d1', mkTask('d1', 1000));
    (svc as any).tasks.set('d2', mkTask('d2', 2000));
    (svc as any).tasks.set('d3', mkTask('d3', 3000));
    (svc as any).lastKnownDiskCount = 5;
    (svc as any).pendingDeletedIds.clear();

    const readSpy = jest.spyOn(svc as any, 'readDiskTaskList');

    await (svc as any).flushPersistQueue();

    const persisted = readDiskTasks();
    // 🛡️ 核心断言：不得被内存的 3 条抹成 3（修复前无护栏 → 会失败，实际=3）
    expect(persisted.length).toBe(5);
    expect(persisted.map((t) => t.sessionId).sort()).toEqual(['d1', 'd2', 'd3', 'd4', 'd5']);
    expect(readSpy).toHaveBeenCalledTimes(1);

    // 🛡️ QA 复核点1：合并后磁盘独有项已回灌 this.tasks → 内存与落盘对齐（不再恒小于基线）
    expect((svc as any).tasks.size).toBe(5);
    expect([...(svc as any).tasks.keys()].sort()).toEqual(['d1', 'd2', 'd3', 'd4', 'd5']);

    // 第二次 flush：内存(5) == 基线(5) → 护栏短路，不再重复读整份文件 / 重复合并
    await (svc as any).flushPersistQueue();
    expect(readSpy).toHaveBeenCalledTimes(1); // 仍是 1 → 无重复读盘
    expect(readDiskTasks().length).toBe(5);

    readSpy.mockRestore();
  });

  it('② 存在有意删除 → 护栏放行，允许正常缩短（不误伤用户显式删除）', async () => {
    const svc = buildService();
    writeDiskFixture([
      mkTask('d1', 1000),
      mkTask('d2', 2000),
      mkTask('d3', 3000),
      mkTask('d4', 4000),
      mkTask('d5', 5000),
    ]);

    (svc as any).tasks.clear();
    (svc as any).tasks.set('d1', mkTask('d1', 1000));
    (svc as any).tasks.set('d2', mkTask('d2', 2000));
    (svc as any).tasks.set('d3', mkTask('d3', 3000));
    (svc as any).lastKnownDiskCount = 5;
    // 登记「d4/d5 被有意删除」→ 护栏应放行缩短
    (svc as any).pendingDeletedIds.add('d4');
    (svc as any).pendingDeletedIds.add('d5');

    await (svc as any).flushPersistQueue();

    const persisted = readDiskTasks();
    expect(persisted.length).toBe(3);
    expect(persisted.map((t) => t.sessionId).sort()).toEqual(['d1', 'd2', 'd3']);
    // 落盘成功后登记被清空
    expect((svc as any).pendingDeletedIds.size).toBe(0);
  });

  it('③ 阳性对照：护栏关闭（等价修复前）→ 内存 3 覆盖磁盘 5，缩为 3', async () => {
    const svc = buildService();
    writeDiskFixture([
      mkTask('d1', 1000),
      mkTask('d2', 2000),
      mkTask('d3', 3000),
      mkTask('d4', 4000),
      mkTask('d5', 5000),
    ]);

    (svc as any).tasks.clear();
    (svc as any).tasks.set('d1', mkTask('d1', 1000));
    (svc as any).tasks.set('d2', mkTask('d2', 2000));
    (svc as any).tasks.set('d3', mkTask('d3', 3000));
    // lastKnownDiskCount=0 ⇒ 护栏条件 (3 < 0)=false ⇒ 关闭护栏 = 修复前行为
    (svc as any).lastKnownDiskCount = 0;
    (svc as any).pendingDeletedIds.clear();

    await (svc as any).flushPersistQueue();

    const persisted = readDiskTasks();
    // 复现线上 260→…→6 的机理：小集合整表覆盖 → 静默丢 2 条
    expect(persisted.length).toBe(3);
  });

  it('④ 相等长度不触发护栏（强判据：护栏读盘与 WARN 均被短路）', async () => {
    const svc = buildService();
    writeDiskFixture([
      mkTask('d1', 1000),
      mkTask('d2', 2000),
      mkTask('d3', 3000),
      mkTask('d4', 4000),
      mkTask('d5', 5000),
    ]);

    (svc as any).tasks.clear();
    ['d1', 'd2', 'd3', 'd4', 'd5'].forEach((id, i) =>
      (svc as any).tasks.set(id, mkTask(id, 1000 * (i + 1))),
    );
    (svc as any).lastKnownDiskCount = 5; // 内存(5) == 基线(5) → 护栏条件 (5 < 5)=false
    (svc as any).pendingDeletedIds.clear();

    // ⚠️ 旧断言（仅 readDiskTasks().length===5）是弱判据：内存5==磁盘5 时，
    //    无论护栏是否触发（命中合并 5 或 短路直写 5）结果都 = 5，无法证伪「无谓读盘」。
    //    故此处加两个强判据：护栏读盘 spy 与 WARN spy 均须「零调用」。
    const readSpy = jest.spyOn(svc as any, 'readDiskTaskList');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    let guardWarns: string[] = [];
    try {
      await (svc as any).flushPersistQueue();
      guardWarns = warnSpy.mock.calls
        .map((c) => String(c[0]))
        .filter((s) => s.includes('[TasksService] 落盘护栏')); // 抓取须在 mockRestore 之前
    } finally {
      warnSpy.mockRestore();
      readSpy.mockRestore();
    }

    // 🛡️ 强判据1：护栏读盘从未发生（相等长度无需读整份文件）
    expect(readSpy).toHaveBeenCalledTimes(0);
    // 🛡️ 强判据2：护栏 WARN 从未打印（未误触发缩减护栏）
    expect(guardWarns.length).toBe(0);
    // 结果仍为 5（直写内存 5 条）
    expect(readDiskTasks().length).toBe(5);
  });
});

describe('B1 解耦 + C 原子写（静态断言源码契约）', () => {
  it('TaskManager 落盘目标改为独立 sidecar，不再与 TasksService 共用 data/tasks.json', () => {
    const tmSrc = readFileSync(join(__dirname, '../ai-engine/utils/task-manager.js'), 'utf-8');
    // 独立 sidecar
    expect(tmSrc).toMatch(/path\.join\(dataDir,\s*'task-manager\.json'\)/);
    // 不再把 tasks.json 作为本模块落盘目标
    expect(tmSrc).not.toMatch(/path\.join\(dataDir,\s*'tasks\.json'\)/);

    const svcSrc = readFileSync(join(__dirname, 'tasks.service.ts'), 'utf-8');
    // TasksService 仍是 data/tasks.json 唯一写入方
    expect(svcSrc).toMatch(/join\(dataDir,\s*'tasks\.json'\)/);
  });

  it('TaskManager.persist 已改原子写（tmp + renameWithCopyFallback + EPERM/EBUSY 降级）', () => {
    const tmSrc = readFileSync(join(__dirname, '../ai-engine/utils/task-manager.js'), 'utf-8');
    expect(tmSrc).toMatch(/import\s*\{[^}]*renameWithCopyFallback[^}]*\}/);
    expect(tmSrc).toMatch(/renameWithCopyFallback\(tmpFile,\s*PERSIST_FILE/);
    // 存在 EPERM/EBUSY 降级直写兜底
    expect(tmSrc).toMatch(/renameErr\?\.code\s*!==\s*'EPERM'/);
  });

  it('🛡️ 2026-11-09 熔断器接线：三大高频写入点均有 isRenameBroken 直写短路（tmp 泄漏根治）', () => {
    const utilSrc = readFileSync(join(__dirname, '../ai-engine/utils/rename-with-copy-fallback.js'), 'utf-8');
    // 熔断器本体：导出 isRenameBroken / markRenameBroken，且 EPERM/EBUSY 时置位
    expect(utilSrc).toMatch(/export\s+function\s+isRenameBroken\(\)/);
    expect(utilSrc).toMatch(/export\s+function\s+markRenameBroken\(/);
    expect(utilSrc).toMatch(/error\.code\s*===\s*'EPERM'\s*\|\|\s*error\.code\s*===\s*'EBUSY'/);

    // TasksService.persist：熔断态直写 + .prev 备份跳过 tmp
    const svcSrc = readFileSync(join(__dirname, 'tasks.service.ts'), 'utf-8');
    expect(svcSrc).toMatch(/if\s*\(!isRenameBroken\(\)\)/);
    expect(svcSrc).toMatch(/markRenameBroken\(`（TasksService\.persist/);

    // TaskManager.persist：熔断态直写
    const tmSrc = readFileSync(join(__dirname, '../ai-engine/utils/task-manager.js'), 'utf-8');
    expect(tmSrc).toMatch(/if\s*\(isRenameBroken\(\)\)/);

    // batch.service：熔断态直写
    const batchSrc = readFileSync(join(__dirname, '../lite/batch.service.ts'), 'utf-8');
    expect(batchSrc).toMatch(/if\s*\(isRenameBroken\(\)\)/);
  });

  it('护栏相关字段与落点齐备（pendingDeletedIds / lastKnownDiskCount）', () => {
    const svcSrc = readFileSync(join(__dirname, 'tasks.service.ts'), 'utf-8');
    expect(svcSrc).toMatch(/private\s+pendingDeletedIds:\s*Set<string>\s*=\s*new\s+Set\(\)/);
    expect(svcSrc).toMatch(/private\s+lastKnownDiskCount\s*=\s*0/);
    // 4 处删除点均已登记
    const registered = svcSrc.match(/this\.pendingDeletedIds\.add\(/g) || [];
    expect(registered.length).toBeGreaterThanOrEqual(4);
  });
});

describe('补强1：落盘证人日志（低噪声）', () => {
  beforeEach(() => {
    rmSync(mockTestDataDir, { recursive: true, force: true });
    mkdirSync(mockTestDataDir, { recursive: true });
  });
  afterAll(() => {
    rmSync(mockTestDataDir, { recursive: true, force: true });
  });

  const witnessLines = (spy: jest.SpyInstance): string[] =>
    spy.mock.calls
      .map((c) => String(c[0]))
      .filter((s) => s.includes('[TasksService] 落盘 '));

  it('落盘条数变化时打印证人日志（含旧基线 / 有意删除 / 合并独有）', async () => {
    const svc = buildService();
    // 磁盘 3 条，内存 5 条 → 本次落盘 5 ≠ 旧基线 3 → 应打印
    writeDiskFixture([mkTask('d1', 1000), mkTask('d2', 2000), mkTask('d3', 3000)]);
    (svc as any).tasks.clear();
    ['m1', 'm2', 'm3', 'm4', 'm5'].forEach((id, i) =>
      (svc as any).tasks.set(id, mkTask(id, 1000 * (i + 1))),
    );
    (svc as any).lastKnownDiskCount = 3;
    (svc as any).pendingDeletedIds.clear();

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    let witness: string[] = [];
    try {
      await (svc as any).flushPersistQueue();
      // ⚠️ 必须在 mockRestore 之前抓取：mockRestore 会重置已记录的调用
      witness = witnessLines(logSpy);
    } finally {
      logSpy.mockRestore();
    }

    expect(witness.length).toBe(1);
    expect(witness[0]).toContain('落盘 5 条');
    expect(witness[0]).toContain('磁盘基线 3');
    expect(witness[0]).toContain('合并磁盘独有 0'); // list 5 > baseline 3，护栏未触发合并
  });

  it('落盘条数不变时不打印（低噪声）', async () => {
    const svc = buildService();
    writeDiskFixture([
      mkTask('d1', 1000),
      mkTask('d2', 2000),
      mkTask('d3', 3000),
      mkTask('d4', 4000),
      mkTask('d5', 5000),
    ]);
    (svc as any).tasks.clear();
    ['d1', 'd2', 'd3', 'd4', 'd5'].forEach((id, i) =>
      (svc as any).tasks.set(id, mkTask(id, 1000 * (i + 1))),
    );
    (svc as any).lastKnownDiskCount = 5; // 与本次落盘 5 相同
    (svc as any).pendingDeletedIds.clear();

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    let witness: string[] = [];
    try {
      await (svc as any).flushPersistQueue();
      witness = witnessLines(logSpy); // 抓取须在 mockRestore 之前
    } finally {
      logSpy.mockRestore();
    }

    expect(witness.length).toBe(0);
  });
});

describe('补强2：EPERM 降级直写前落 tasks.json.prev', () => {
  beforeEach(() => {
    rmSync(mockTestDataDir, { recursive: true, force: true });
    mkdirSync(mockTestDataDir, { recursive: true });
  });
  afterAll(() => {
    rmSync(mockTestDataDir, { recursive: true, force: true });
  });

  it('直写前 .prev 存在，且内容 === 直写前的主文件（可回滚）', async () => {
    const svc = buildService();
    // 磁盘 5 条（直写前的主账本）
    writeDiskFixture([
      mkTask('d1', 1000),
      mkTask('d2', 2000),
      mkTask('d3', 3000),
      mkTask('d4', 4000),
      mkTask('d5', 5000),
    ]);
    const beforeRaw = readFileSync(PERSIST_PATH, 'utf-8');

    // 内存 3 条 + 登记有意删除（d4/d5）→ 护栏放行缩短，finalList=3
    (svc as any).tasks.clear();
    ['d1', 'd2', 'd3'].forEach((id, i) =>
      (svc as any).tasks.set(id, mkTask(id, 1000 * (i + 1))),
    );
    (svc as any).lastKnownDiskCount = 5;
    (svc as any).pendingDeletedIds.add('d4');
    (svc as any).pendingDeletedIds.add('d5');

    // 强制 rename 走 EPERM 降级路径
    const eperm = Object.assign(new Error('EPERM: operation not permitted, rename'), {
      code: 'EPERM',
    });
    const renameSpy = jest.spyOn(fsp, 'rename').mockRejectedValueOnce(eperm);
    try {
      await (svc as any).flushPersistQueue();
    } finally {
      renameSpy.mockRestore();
    }

    const prevPath = `${PERSIST_PATH}.prev`;
    // 🛡️ 核心断言：降级直写前已落 .prev，内容 = 直写前的主文件
    expect(existsSync(prevPath)).toBe(true);
    expect(readFileSync(prevPath, 'utf-8')).toBe(beforeRaw);
    // 主文件已被直写为缩短后的 3 条（护栏因有意删除而放行）
    expect(readDiskTasks().length).toBe(3);
  });

  it('主文件解析失败时 loadSync 回退 .prev 兜底', () => {
    // 主文件写坏（半写损毁模拟）；.prev 保留一份合法快照
    mkdirSync(mockTestDataDir, { recursive: true });
    writeFileSync(PERSIST_PATH, '[{"sessionId":"broken"', 'utf-8'); // 非法 JSON
    writeFileSync(
      `${PERSIST_PATH}.prev`,
      JSON.stringify([mkTask('p1', 1000), mkTask('p2', 2000)], null, 2),
      'utf-8',
    );

    const svc = buildService(); // 构造即 loadSync
    const ids = Array.from((svc as any).tasks.keys()).sort();
    expect(ids).toEqual(['p1', 'p2']);
  });
});
