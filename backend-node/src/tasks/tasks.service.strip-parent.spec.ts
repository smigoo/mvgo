/**
 * 回归测试：GET /api/tasks/status/:sessionId 与 /api/tasks/tree/:sessionId 不再因
 * result.figmaNodeData 内的 __parent 循环引用抛 "Converting circular structure to JSON"（500）。
 *
 * 根因：figmaNodeData（含子组件内部容器树）在生成期被注入 __parent 反链供几何判定，
 *       但 __parent 与 children 形成循环引用；详情接口原样返回 result → JSON.stringify 失败 → 500。
 * 修复：getTaskStatus / getTaskTree 返回前用 stripParentRefs 递归剥离 __parent（前端从不消费它）。
 */

jest.mock('archiver', () => ({
  ZipArchive: jest.fn().mockImplementation(() => ({
    append: jest.fn(),
    finalize: jest.fn().mockResolvedValue(undefined),
    pipe: jest.fn(),
  })),
}));

jest.mock('../config/backend-root', () => ({
  backendRoot: '/tmp/mvgo-test/backend-node',
  projectRoot: '/tmp/mvgo-test',
  workspaceRoot: '/tmp/mvgo-test/workspace',
  customComponentsDir: '/tmp/mvgo-test/workspace/custom-components',
  vue3ComponentsDir: '/tmp/mvgo-test/workspace/vue3-components',
  tempComponentsDir: '/tmp/mvgo-test/temp-components',
  dataDir: '/tmp/mvgo-test/backend-node/data',
  resolveFrontendWorkspacePath: () => '/tmp/mvgo-test/frontend/workspace',
  frontendCustomComponentsDir: () => '/tmp/mvgo-test/frontend/workspace/custom-components',
  frontendVue3ComponentsDir: () => '/tmp/mvgo-test/frontend/workspace/vue3-components',
}));

jest.mock('../config/workspace.config', () => ({
  resolveFrontendWorkspace: () => '/tmp/mvgo-test/frontend/workspace',
  isFrontendWorkspaceAvailable: () => false,
}));

import { TasksService, type Task } from './tasks.service';

const buildService = (): TasksService => {
  const svc = new TasksService();
  (svc as any).persist = jest.fn();
  return svc;
};

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  sessionId: 'session-1',
  componentId: 'TestComp',
  groupId: 'g1',
  status: 'completed',
  startTime: Date.now() - 1000,
  progress: [],
  progressCount: 0,
  result: null,
  error: null,
  buffer: [],
  target: 'microcode',
  userId: 'user-A',
  componentName: 'TestComp',
  nodeId: 'node-1',
  fileKey: 'file-1',
  panelKey: 'default-panel',
  taskType: 'component',
  ...overrides,
});

// 构造一个带 __parent 循环引用的 figmaNodeData（模拟生成期注入的反链）
function makeCyclicFigmaNodeData() {
  const root: any = { id: '2:1', name: 'root', children: [] };
  const child: any = { id: '2:2', name: 'tabs-list', children: [] }
  const leaf: any = { id: '2:3', name: 'tab-item' }
  child.children.push(leaf)
  root.children.push(child)
  // 反链：形成 root -> children[0] -> __parent -> root 的环
  child.__parent = root
  leaf.__parent = child
  return root
}

function hasParentRef(obj: any, seen = new Set()): boolean {
  if (!obj || typeof obj !== 'object' || seen.has(obj)) return false
  seen.add(obj)
  if ('__parent' in obj) return true
  for (const k of Object.keys(obj)) {
    if (k === '__parent') continue
    if (hasParentRef(obj[k], seen)) return true
  }
  return false
}

describe('TasksService __parent 循环引用剥离（详情接口不再 500）', () => {
  let svc: TasksService

  beforeEach(() => {
    svc = buildService()
    ;(svc as any).tasks.clear()
  })

  it('getTaskStatus：figmaNodeData 含 __parent 环时仍返回 200 结构且响应可序列化、无 __parent', () => {
    const task = makeTask({
      sessionId: 'sess-cycle',
      result: { target: 'microcode', figmaNodeData: makeCyclicFigmaNodeData() } as any,
    })
    ;(svc as any).tasks.set('sess-cycle', task)

    const res = svc.getTaskStatus('sess-cycle', 'user-A')
    expect(res.success).toBe(true)
    // 响应整体可 JSON 序列化（旧代码此处抛 Converting circular structure to JSON）
    expect(() => JSON.stringify(res)).not.toThrow()
    // 返回的 result.figmaNodeData 已无 __parent
    const figmaNodeData = (res as any).task.result.figmaNodeData
    expect(hasParentRef(figmaNodeData)).toBe(false)
    // 数据未丢失：children 仍在
    expect(figmaNodeData.children[0].name).toBe('tabs-list')
    expect(figmaNodeData.children[0].children[0].name).toBe('tab-item')
  })

  it('getTaskStatus：无 __parent 的普通任务行为不变', () => {
    const task = makeTask({ sessionId: 'sess-plain', result: { target: 'microcode' } as any })
    ;(svc as any).tasks.set('sess-plain', task)
    const res = svc.getTaskStatus('sess-plain', 'user-A')
    expect(res.success).toBe(true)
    expect(() => JSON.stringify(res)).not.toThrow()
  })

  it('getTaskTree：父任务 + 子任务 result 均含 __parent 环时返回可序列化、无 __parent', () => {
    const parent = makeTask({
      sessionId: 'parent-1',
      childIds: ['child-1'],
      result: { target: 'microcode', figmaNodeData: makeCyclicFigmaNodeData() } as any,
    })
    const child = makeTask({
      sessionId: 'child-1',
      parentId: 'parent-1',
      result: { target: 'microcode', figmaNodeData: makeCyclicFigmaNodeData() } as any,
    })
    ;(svc as any).tasks.set('parent-1', parent)
    ;(svc as any).tasks.set('child-1', child)

    const tree = (svc as any).getTaskTree('parent-1', 'user-A')
    expect(tree).not.toBeNull()
    expect(() => JSON.stringify(tree)).not.toThrow()
    expect(hasParentRef(tree.result?.figmaNodeData)).toBe(false)
    expect(tree.children).toHaveLength(1)
    expect(hasParentRef(tree.children[0].result?.figmaNodeData)).toBe(false)
  })
})
