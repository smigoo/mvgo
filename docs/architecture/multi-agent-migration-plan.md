# 多智能体并行改造方案

## 背景问题

当前 Phase2 生成链路存在**状态漂移**问题：
- 每阶段基于"上一步临时产物"继续工作，而非稳定基线
- 覆盖式写入导致前序阶段的正确内容被无意覆盖
- 单智能体串行执行，无法并行加速

## 改造目标

1. **稳定基线**：Figma JSON 作为唯一真值源，全程只读
2. **增量 Patch**：每阶段输出差异补丁，而非完整文件
3. **并行执行**：独立阶段并行运行，仲裁器解决冲突
4. **可追溯性**：每阶段有明确输入/输出快照

---

## 阶段一：状态快照机制（1-2 天）

### 1.1 核心思路

在现有串行链路中引入**不可变快照**，每阶段基于快照工作，而非临时产物。

### 1.2 实现方案

#### 新增：`SnapshotService`

```typescript
// backend-node/src/snapshot/snapshot.service.ts
import { Injectable } from '@nestjs/common';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';

export interface Snapshot {
  id: string;
  taskId: string;
  stage: 'vision' | 'layout' | 'style' | 'codegen';
  files: Map<string, string>; // filePath → content
  metadata: {
    createdAt: number;
    checksum: string;
    parentSnapshotId?: string;
  };
}

@Injectable()
export class SnapshotService {
  private readonly snapshots = new Map<string, Snapshot>();
  private readonly snapshotDir = join(backendRoot, 'data/snapshots');

  async createSnapshot(
    taskId: string,
    stage: string,
    files: Map<string, string>,
    parentSnapshotId?: string,
  ): Promise<Snapshot> {
    const snapshot: Snapshot = {
      id: `${taskId}-${stage}-${Date.now()}`,
      taskId,
      stage: stage as any,
      files,
      metadata: {
        createdAt: Date.now(),
        checksum: await this.computeChecksum(files),
        parentSnapshotId,
      },
    };

    // 内存 + 磁盘双写
    this.snapshots.set(snapshot.id, snapshot);
    await this.persistSnapshot(snapshot);

    return snapshot;
  }

  async getSnapshot(snapshotId: string): Promise<Snapshot | null> {
    return this.snapshots.get(snapshotId) || await this.loadSnapshot(snapshotId);
  }

  async getLatestSnapshot(taskId: string, stage?: string): Promise<Snapshot | null> {
    const taskSnapshots = Array.from(this.snapshots.values())
      .filter(s => s.taskId === taskId)
      .sort((a, b) => b.metadata.createdAt - a.metadata.createdAt);

    if (!stage) return taskSnapshots[0] || null;
    return taskSnapshots.find(s => s.stage === stage) || null;
  }

  private async computeChecksum(files: Map<string, string>): Promise<string> {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    for (const [path, content] of files.entries()) {
      hash.update(path + content);
    }
    return hash.digest('hex');
  }

  private async persistSnapshot(snapshot: Snapshot): Promise<void> {
    const snapshotPath = join(this.snapshotDir, `${snapshot.id}.json`);
    await mkdir(this.snapshotDir, { recursive: true });
    await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2));
  }

  private async loadSnapshot(snapshotId: string): Promise<Snapshot | null> {
    try {
      const snapshotPath = join(this.snapshotDir, `${snapshotId}.json`);
      const content = await readFile(snapshotPath, 'utf-8');
      const snapshot = JSON.parse(content);
      this.snapshots.set(snapshotId, snapshot);
      return snapshot;
    } catch {
      return null;
    }
  }
}
```

#### 改造：`Phase2Service` 使用快照

```typescript
// backend-node/src/phase2/phase2.service.ts
import { SnapshotService } from '../snapshot/snapshot.service';

export class Phase2Service {
  constructor(
    // ... 既有依赖
    private readonly snapshotService: SnapshotService,
  ) {}

  async startGeneration(sessionId: string, dto: GeneratePhase2Dto, ...) {
    // 步骤 1: 创建初始快照（Figma JSON 作为基线）
    const figmaJson = await this.fetchFigmaNode(dto.figmaUrl);
    const baseSnapshot = await this.snapshotService.createSnapshot(
      sessionId,
      'vision',
      new Map([['figma.json', JSON.stringify(figmaJson)]]),
    );

    // 步骤 2: Vision 阶段 → 创建 v1 快照
    const visionResult = await this.runVision(figmaJson);
    const v1Snapshot = await this.snapshotService.createSnapshot(
      sessionId,
      'layout',
      new Map([
        ['figma.json', JSON.stringify(figmaJson)], // 保持不变
        ['vision-result.json', JSON.stringify(visionResult)],
      ]),
      baseSnapshot.id, // 记录父快照
    );

    // 步骤 3: Layout 阶段 → 基于 v1 快照工作，创建 v2 快照
    const layoutResult = await this.runLayout(v1Snapshot);
    const v2Snapshot = await this.snapshotService.createSnapshot(
      sessionId,
      'style',
      new Map([
        ...v1Snapshot.files,
        ['layout-result.json', JSON.stringify(layoutResult)],
      ]),
      v1Snapshot.id,
    );

    // ... 后续阶段同理
  }
}
```

### 1.3 收益

- ✅ **基线稳定**：每阶段基于快照工作，不受前序临时状态影响
- ✅ **可追溯**：每个快照有 checksum，可追溯哪阶段引入问题
- ✅ **可回滚**：任意阶段失败可回滚到父快照重试

---

## 阶段二：Patch 机制（3-5 天）

### 2.1 核心思路

每阶段输出**差异补丁**而非完整文件，最后统一合并。

### 2.2 实现方案

#### 新增：`PatchService`

```typescript
// backend-node/src/patch/patch.service.ts
import { Injectable } from '@nestjs/common';
import { createTwoWayPatch, applyPatch } from 'fast-diff-patch';

export interface FilePatch {
  filePath: string;
  patch: string; // JSON Patch 格式
  operation: 'add' | 'modify' | 'delete';
}

export interface StagePatch {
  stage: string;
  patches: FilePatch[];
  metadata: {
    createdAt: number;
    baseSnapshotId: string;
  };
}

@Injectable()
export class PatchService {
  /**
   * 对比两个文件集合，生成差异补丁
   */
  generatePatch(baseFiles: Map<string, string>, newFiles: Map<string, string>): FilePatch[] {
    const patches: FilePatch[] = [];

    // 检测新增/修改的文件
    for (const [filePath, newContent] of newFiles.entries()) {
      const baseContent = baseFiles.get(filePath) || '';
      const patch = createTwoWayPatch(baseContent, newContent);

      patches.push({
        filePath,
        patch: JSON.stringify(patch),
        operation: baseContent ? 'modify' : 'add',
      });
    }

    // 检测删除的文件
    for (const [filePath] of baseFiles.entries()) {
      if (!newFiles.has(filePath)) {
        patches.push({
          filePath,
          patch: '[]',
          operation: 'delete',
        });
      }
    }

    return patches;
  }

  /**
   * 应用补丁到文件集合
   */
  applyPatch(baseFiles: Map<string, string>, patches: FilePatch[]): Map<string, string> {
    const result = new Map(baseFiles);

    for (const { filePath, patch, operation } of patches) {
      if (operation === 'delete') {
        result.delete(filePath);
        continue;
      }

      const baseContent = result.get(filePath) || '';
      const patchObj = JSON.parse(patch);
      const newContent = applyPatch(baseContent, patchObj);

      if (newContent !== null) {
        result.set(filePath, newContent);
      } else {
        throw new Error(`Patch application failed for ${filePath}`);
      }
    }

    return result;
  }
}
```

#### 改造：各阶段输出 Patch 而非完整文件

```typescript
// backend-node/src/ai-engine/layout-reviewer.js
export class LayoutReviewer {
  async review(ctx) {
    // 不再直接写文件，而是生成 Patch
    const baseFiles = await ctx.getBaseFiles(); // 从快照读取
    const newFiles = await this.generateLayoutFiles(ctx); // 生成新内容

    const patches = this.patchService.generatePatch(baseFiles, newFiles);

    return {
      stage: 'layout',
      patches, // 返回补丁列表
      metadata: {
        changedFiles: patches.map(p => p.filePath),
        baseSnapshotId: ctx.snapshotId,
      },
    };
  }
}
```

### 2.3 收益

- ✅ **增量更新**：只改变化的部分，保留未变部分
- ✅ **冲突检测**：合并时可检测多阶段是否修改同一文件
- ✅ **可逆操作**：Patch 可正向/反向应用，支持回滚

---

## 阶段三：多智能体并行（5-7 天）

### 3.1 核心思路

基于 LangGraph 构建**状态图**，多智能体并行执行，仲裁器解决冲突。

### 3.2 实现方案

#### 新增：`MultiAgentOrchestrator`

```typescript
// backend-node/src/orchestrator/multi-agent-orchestrator.ts
import { StateGraph, Annotation } from '@langchain/langgraph';

// 定义状态图
const GenerationState = Annotation.Root({
  taskId: Annotation<string>,
  baseSnapshot: Annotation<Snapshot>,
  patches: Annotation<StagePatch[]>({
    reducer: (state, update) => [...state, ...update],
    default: () => [],
  }),
  mergedFiles: Annotation<Map<string, string>>,
  conflicts: Annotation<Conflict[]>({
    reducer: (state, update) => [...state, ...update],
    default: () => [],
  }),
});

@Injectable()
export class MultiAgentOrchestrator {
  private graph: StateGraph<typeof GenerationState.State>;

  constructor(
    private visionAgent: VisionAgent,
    private layoutAgent: LayoutAgent,
    private styleAgent: StyleAgent,
    private codeGenAgent: CodeGenAgent,
    private arbitrator: ConflictArbitrator,
  ) {
    this.graph = this.buildGraph();
  }

  private buildGraph() {
    const workflow = new StateGraph(GenerationState)
      // 并行节点：Vision → Layout + Style + CodeGen
      .addNode('vision', async (state) => {
        const patches = await this.visionAgent.run(state.taskId);
        return { patches: [patches] };
      })
      .addNode('layout', async (state) => {
        const patches = await this.layoutAgent.run(state.baseSnapshot);
        return { patches: [patches] };
      })
      .addNode('style', async (state) => {
        const patches = await this.styleAgent.run(state.baseSnapshot);
        return { patches: [patches] };
      })
      .addNode('codegen', async (state) => {
        const patches = await this.codeGenAgent.run(state.baseSnapshot);
        return { patches: [patches] };
      })
      .addNode('arbitrate', async (state) => {
        const conflicts = await this.arbitrator.resolve(state.patches);
        return { conflicts };
      })
      .addNode('merge', async (state) => {
        const merged = await this.mergePatches(state.patches, state.conflicts);
        return { mergedFiles: merged };
      })

      // 边：定义执行顺序
      .addEdge('__start__', 'vision')
      .addEdge('vision', 'layout')
      .addConditionalEdges('layout', (state) => {
        // 并行分支
        return ['style', 'codegen'];
      })
      .addEdge('style', 'arbitrate')
      .addEdge('codegen', 'arbitrate')
      .addEdge('arbitrate', 'merge')
      .addEdge('merge', '__end__');

    return workflow.compile();
  }

  async execute(taskId: string, baseSnapshot: Snapshot): Promise<Map<string, string>> {
    const result = await this.graph.invoke({
      taskId,
      baseSnapshot,
      patches: [],
      conflicts: [],
    });

    return result.mergedFiles;
  }
}
```

#### 冲突仲裁器

```typescript
// backend-node/src/orchestrator/conflict-arbitrator.ts
@Injectable()
export class ConflictArbitrator {
  async resolve(patches: StagePatch[]): Promise<Conflict[]> {
    const conflicts: Conflict[] = [];

    // 检测同一文件被多阶段修改
    const fileModifications = new Map<string, StagePatch[]>();
    for (const stagePatch of patches) {
      for (const patch of stagePatch.patches) {
        const existing = fileModifications.get(patch.filePath) || [];
        existing.push(stagePatch);
        fileModifications.set(patch.filePath, existing);
      }
    }

    // 找出冲突
    for (const [filePath, stagePatches] of fileModifications.entries()) {
      if (stagePatches.length > 1) {
        conflicts.push({
          filePath,
          stages: stagePatches.map(p => p.stage),
          resolution: await this.arbitrate(filePath, stagePatches),
        });
      }
    }

    return conflicts;
  }

  private async arbitrate(filePath: string, stagePatches: StagePatch[]): Promise<string> {
    // 仲裁策略：
    // 1. 优先级：Layout > Style > CodeGen（布局优先）
    // 2. 3-way merge：尝试自动合并
    // 3. 无法合并 → 标记人工审核

    const priority = { layout: 3, style: 2, codegen: 1 };
    stagePatches.sort((a, b) => priority[b.stage] - priority[a.stage]);

    // 尝试合并最高优先级的 Patch
    return stagePatches[0].patches.find(p => p.filePath === filePath)?.patch || '';
  }
}
```

### 3.3 收益

- ✅ **并行加速**：Layout/Style/CodeGen 可并行执行
- ✅ **冲突解决**：仲裁器自动检测并解决多阶段冲突
- ✅ **可观测性**：状态图每步有明确输入/输出

---

## 实施路线图

| 阶段 | 时间 | 工作量 | 风险 | 收益 |
|-----||------|------|------|
| **阶段一：快照机制** | 1-2 天 | 低 | 低 | ✅ 基线稳定<br>✅ 可追溯 |
| **阶段二：Patch 机制** | 3-5 天 | 中 | 中 | ✅ 增量更新<br>✅ 冲突检测 |
| **阶段三：多智能体** | 5-7 天 | 高 | 高 | ✅ 并行加速<br>✅ 自动仲裁 |

---

## 立即可做的优化（不改架构）

如果暂时无法大规模重构，可先做以下**低成本优化**：

### 1. 写前读取基线

```javascript
// microcode-engineer.js:4828
async function writeStandardFiles(ctx) {
  // 写前读取当前文件内容
  const existingContent = await readFileIfExists(filePath);

  // 只在必要时覆盖
  if (shouldPreserveExisting(existingContent, newContent)) {
    const merged = mergeFiles(existingContent, newContent);
    await writeFile(filePath, merged);
  } else {
    await writeFile(filePath, newContent);
  }
}
```

### 2. 文件级锁

```javascript
// 防止并发写入同一文件
const fileLocks = new Map<string, Promise>();

async function writeWithLock(filePath, content) {
  await fileLocks.get(filePath); // 等待前一个写入完成

  const writePromise = (async () => {
    await writeFile(filePath, content);
    fileLocks.delete(filePath);
  })();

  fileLocks.set(filePath, writePromise);
  await writePromise;
}
```

### 3. 3-way merge 兜底

```javascript
// 当检测到文件已被前序阶段修改时
const merged = threeWayMerge({
  base: baseSnapshot.files.get(filePath),
  current: workspaceContent,
  incoming: newContent,
});

if (merged.conflicts.length > 0) {
  logger.warn('Merge conflicts detected', merged.conflicts);
  // 标记人工审核
} else {
  await writeFile(filePath, merged.result);
}
```

---

## 总结

**当前问题是单智能体串行架构的必然结果**，改造需要：

1. **短期**（1-2 天）：引入快照机制，稳定基线
2. **中期**（3-5 天）：实现 Patch 机制，增量更新
3. **长期**（5-7 天）：基于 LangGraph 实现多智能体并行

**立即可做**：在现有代码中加入写前读取、文件锁、3-way merge 等防御性编程实践。
