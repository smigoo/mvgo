// backend-root.js 是 ESM（import.meta），jest CJS 下加载即炸（既有基线问题）。
// 整体 mock 到临时目录，避免真实文件系统依赖。
jest.mock('../config/backend-root', () => {
  const { mkdtempSync } = jest.requireActual('fs');
  const { join: pjoin } = jest.requireActual('path');
  const { tmpdir } = jest.requireActual('os');
  const root = mkdtempSync(pjoin(tmpdir(), 'mvgo-comp-svc-'));
  (global as any).__compSvcTestRoot = root;
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

// archiver 新版为纯 ESM，jest CJS 无法加载（tasks.service 引入链）
jest.mock('archiver', () => ({ ZipArchive: class {} }));

import { Types } from 'mongoose';
import { ComponentService } from './component.service';

const USER_A = new Types.ObjectId().toString();
const USER_B = new Types.ObjectId().toString();

/** 构造 listComponents 需要的链式查询 mock，返回捕获的 filter/sort/populate */
function makeListModel(listResult: any[] = [], total = 0) {
  const captured: any = {};
  const chain: any = {};
  for (const m of ['select', 'populate', 'sort', 'skip', 'limit', 'lean']) {
    chain[m] = jest.fn((...args: any[]) => {
      if (m === 'sort') captured.sort = args[0];
      if (m === 'populate') (captured.populates ||= []).push(args);
      return chain;
    });
  }
  chain.exec = jest.fn(() => Promise.resolve(listResult));
  const componentModel: any = {
    find: jest.fn((filter: any) => {
      captured.filter = filter;
      return chain;
    }),
    countDocuments: jest.fn(() => ({ exec: () => Promise.resolve(total) })),
  };
  return { componentModel, captured };
}

function createService(componentModel: any, groupMemberModel?: any, tasksService?: any) {
  return new ComponentService(
    componentModel,
    groupMemberModel ?? ({ findOne: jest.fn(() => null) } as any),
    tasksService ?? ({ getTask: jest.fn(), getTaskByComponentId: jest.fn() } as any),
  );
}

/** 构造一个组件文档 mock */
function makeComponentDoc(overrides: Record<string, any> = {}) {
  const doc: any = {
    _id: new Types.ObjectId(),
    componentId: 'mc-test-1',
    name: '测试组件',
    creatorId: new Types.ObjectId(USER_A),
    groupId: new Types.ObjectId(),
    visibility: undefined,
    sharedAt: undefined,
    sharedBy: undefined,
    ...overrides,
  };
  doc.save = jest.fn(async () => doc);
  return doc;
}

describe('ComponentService listComponents scope', () => {
  it("scope='mine'（缺省）只返回当前用户创建的组件", async () => {
    const { componentModel, captured } = makeListModel();
    const service = createService(componentModel);

    await service.listComponents({} as any, USER_A);

    expect(captured.filter.creatorId?.toString()).toBe(USER_A);
    expect(captured.filter.visibility).toBeUndefined();
    expect(captured.filter.$or).toBeUndefined();
  });

  it("scope='mine' 且携带 groupId：保留群组过滤", async () => {
    const groupId = new Types.ObjectId().toString();
    const { componentModel, captured } = makeListModel();
    const service = createService(componentModel);

    await service.listComponents({ scope: 'mine', groupId } as any, USER_A);

    expect(captured.filter.creatorId?.toString()).toBe(USER_A);
    expect(captured.filter.groupId?.toString()).toBe(groupId);
  });

  it("scope='public' 只按 visibility=public 过滤，不限制创建者", async () => {
    const { componentModel, captured } = makeListModel();
    const service = createService(componentModel);

    await service.listComponents({ scope: 'public' } as any, USER_A);

    expect(captured.filter.visibility).toBe('public');
    expect(captured.filter.creatorId).toBeUndefined();
  });

  it("scope='public' 携带 groupId：平台级范围，忽略群组过滤", async () => {
    const groupId = new Types.ObjectId().toString();
    const { componentModel, captured } = makeListModel();
    const service = createService(componentModel);

    await service.listComponents({ scope: 'public', groupId } as any, USER_A);

    expect(captured.filter.visibility).toBe('public');
    expect(captured.filter.groupId).toBeUndefined();
  });

  it("scope='all' 返回自己的 + 所有 public 的并集", async () => {
    const { componentModel, captured } = makeListModel();
    const service = createService(componentModel);

    await service.listComponents({ scope: 'all' } as any, USER_A);

    expect(captured.filter.$or).toBeDefined();
    expect(captured.filter.$or).toHaveLength(2);
    expect(captured.filter.$or[0].creatorId?.toString()).toBe(USER_A);
    expect(captured.filter.$or[1]).toEqual({ visibility: 'public' });
    expect(captured.filter.creatorId).toBeUndefined();
  });

  it("scope='all' 携带 groupId：并集范围，忽略群组过滤", async () => {
    const groupId = new Types.ObjectId().toString();
    const { componentModel, captured } = makeListModel();
    const service = createService(componentModel);

    await service.listComponents({ scope: 'all', groupId } as any, USER_A);

    expect(captured.filter.$or).toBeDefined();
    expect(captured.filter.groupId).toBeUndefined();
  });
});

describe('ComponentService publish/unpublish', () => {
  function modelWithDoc(doc: any) {
    return {
      findById: jest.fn(() => Promise.resolve(doc)),
    };
  }

  it('创建者发布：visibility=public 且记录 sharedAt/sharedBy', async () => {
    const doc = makeComponentDoc();
    const service = createService(modelWithDoc(doc));

    await service.publishComponent(doc._id.toString(), USER_A);

    expect(doc.visibility).toBe('public');
    expect(doc.sharedAt).toBeInstanceOf(Date);
    expect(doc.sharedBy?.toString()).toBe(USER_A);
    expect(doc.save).toHaveBeenCalled();
  });

  it('非创建者发布（即使是管理员）被拒绝', async () => {
    const doc = makeComponentDoc();
    const groupMemberModel = {
      findOne: jest.fn(() => Promise.resolve({ role: 'admin' })),
    };
    const service = createService(modelWithDoc(doc), groupMemberModel);

    await expect(
      service.publishComponent(doc._id.toString(), USER_B),
    ).rejects.toThrow('只有组件提供者可以发布');
    expect(doc.visibility).not.toBe('public');
  });

  it('创建者下架：visibility 回到 private，sharedAt 保留', async () => {
    const sharedAt = new Date('2026-09-01T00:00:00Z');
    const doc = makeComponentDoc({ visibility: 'public', sharedAt });
    const service = createService(modelWithDoc(doc));

    await service.unpublishComponent(doc._id.toString(), USER_A);

    expect(doc.visibility).toBe('private');
    expect(doc.sharedAt).toBe(sharedAt);
    expect(doc.save).toHaveBeenCalled();
  });

  it('非创建者下架被拒绝', async () => {
    const doc = makeComponentDoc({ visibility: 'public' });
    const service = createService(modelWithDoc(doc));

    await expect(
      service.unpublishComponent(doc._id.toString(), USER_B),
    ).rejects.toThrow('只有组件提供者可以操作');
  });

  it('无 componentId（未生成产物）的组件不可发布', async () => {
    const doc = makeComponentDoc({ componentId: undefined });
    const service = createService(modelWithDoc(doc));

    await expect(
      service.publishComponent(doc._id.toString(), USER_A),
    ).rejects.toThrow('尚未生成产物');
  });
});

describe('ComponentService 权限：public 读放行与删除严格化', () => {
  const noMembership = { findOne: jest.fn(() => Promise.resolve(null)) };
  const adminMembership = {
    findOne: jest.fn(() => Promise.resolve({ role: 'admin' })),
  };

  function deletableModel(doc: any) {
    return {
      findById: jest.fn(() => Promise.resolve(doc)),
      findByIdAndDelete: jest.fn(() => Promise.resolve(null)),
    };
  }
  const tasksServiceMock = () => ({
    getTask: jest.fn(),
    getTaskByComponentId: jest.fn(),
    removeComponentCascade: jest.fn(() => Promise.resolve()),
  });

  it('public 组件：非创建者非管理员也可读取详情', async () => {
    const doc = makeComponentDoc({ visibility: 'public' });
    const service = createService(deletableModel(doc), noMembership, tasksServiceMock());

    const result = await service.getComponentById(doc._id.toString(), USER_B);
    expect(result).toBe(doc);
  });

  it('private 组件：非创建者非管理员读取仍被拒绝', async () => {
    const doc = makeComponentDoc({ visibility: 'private' });
    const service = createService(deletableModel(doc), noMembership, tasksServiceMock());

    await expect(
      service.getComponentById(doc._id.toString(), USER_B),
    ).rejects.toThrow('无权访问此组件');
  });

  it('存量组件（无 visibility 字段）：非创建者读取仍被拒绝', async () => {
    const doc = makeComponentDoc();
    const service = createService(deletableModel(doc), noMembership, tasksServiceMock());

    await expect(
      service.getComponentById(doc._id.toString(), USER_B),
    ).rejects.toThrow('无权访问此组件');
  });

  it('public 组件：群组管理员但不是提供者，删除被拒绝', async () => {
    const doc = makeComponentDoc({ visibility: 'public' });
    const service = createService(deletableModel(doc), adminMembership, tasksServiceMock());

    await expect(
      service.deleteComponent(doc._id.toString(), USER_B),
    ).rejects.toThrow('公共组件仅提供者可以删除');
  });

  it('public 组件：提供者本人可删除', async () => {
    const doc = makeComponentDoc({ visibility: 'public' });
    const model = deletableModel(doc);
    const service = createService(model, noMembership, tasksServiceMock());

    await service.deleteComponent(doc._id.toString(), USER_A);
    expect(model.findByIdAndDelete).toHaveBeenCalled();
  });

  it('private 组件：群组管理员仍可删除（既有行为不变）', async () => {
    const doc = makeComponentDoc({ visibility: 'private' });
    const model = deletableModel(doc);
    const service = createService(model, adminMembership, tasksServiceMock());

    await service.deleteComponent(doc._id.toString(), USER_B);
    expect(model.findByIdAndDelete).toHaveBeenCalled();
  });
});

describe('ComponentService listComponents shared 排序与群组名', () => {
  it("sortBy='shared' 按 sharedAt 倒序（createdAt 次级）", async () => {
    const { componentModel, captured } = makeListModel();
    const service = createService(componentModel);

    await service.listComponents({ sortBy: 'shared' } as any, USER_A);

    expect(captured.sort).toEqual({ sharedAt: -1, createdAt: -1 });
  });

  it('列表查询 populate creatorId 与 groupId(name)', async () => {
    const { componentModel, captured } = makeListModel([
      {
        _id: new Types.ObjectId(),
        componentId: 'mc-g1',
        name: 'x',
        groupId: { _id: new Types.ObjectId(), name: '隧道一标' },
        creatorId: { _id: new Types.ObjectId(), username: 'alice' },
        metadata: {},
      },
    ]);
    const service = createService(componentModel);

    const res = await service.listComponents({ scope: 'public' } as any, USER_A);

    expect(captured.populates).toEqual([
      ['creatorId', 'username email'],
      ['groupId', 'name'],
    ]);
    // populate 后 groupId 归一为 string + 新增 groupName
    expect(res.components[0].groupId).toMatch(/^[0-9a-f]{24}$/);
    expect(res.components[0].groupName).toBe('隧道一标');
  });
});
