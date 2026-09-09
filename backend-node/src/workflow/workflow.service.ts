import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { randomBytes } from 'crypto';
import { configDir, tempComponentsDir } from '../config/backend-root';
import { HANDLER_REGISTRY, SKILL_REGISTRY, NODE_TYPES } from './workflow.constants';
import {
  TOPOLOGY_MAP,
  isProtectedWorkflow,
  getAllOriginalTopologies,
} from './graph-topology';
import { ProgressService } from '../progress/progress.service';
import { TasksService } from '../tasks/tasks.service';
import { Phase2Service } from '../phase2/phase2.service';

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);
  // 🆕 节点快照存储（sessionId → 节点执行快照数组），供前端调试查看；内存态，进程重启即清
  private readonly nodeSnapshotStore = new Map<string, any[]>();
  private readonly workflowsDir: string;

  constructor(
    private readonly progressService: ProgressService,
    private readonly tasksService: TasksService,
    private readonly phase2Service: Phase2Service,
  ) {
    // config/workflows目录
    this.workflowsDir = join(configDir, 'workflows');

    // 确保目录存在
    if (!existsSync(this.workflowsDir)) {
      mkdirSync(this.workflowsDir, { recursive: true });
    }
  }

  /**
   * 获取handlers注册表
   */
  /**
   * ⑥ 术语统一：返回 skills 注册表（兼容旧名 handlers）
   * 同时返回新旧两个 key，前端可逐步迁移
   */
  getHandlers() {
    return {
      skills: SKILL_REGISTRY,
      handlers: HANDLER_REGISTRY, // 兼容旧字段
    };
  }

  /**
   * 获取节点类型定义
   */
  getNodeTypes() {
    return NODE_TYPES;
  }

  /**
   * 获取原始图管线拓扑
   * @param type 'phase2' | 'vue3'
   */
  getGraphTopology(type: string) {
    // ② 真相漂移修复：phase2 和 vue3 类型动态获取真实拓扑
    if (type === 'phase2' || type === 'vue3') {
      try {
        // 必须用 require，与 phase2.service 保持一致，避免 CJS/ESM 混用触发 Node ERR_INTERNAL_ASSERTION
        const { getPhase2Topology } = require('../ai-engine/graphs/mc-component-graph-phase2.js');
        const topology = getPhase2Topology();

        // vue3 类型复用 phase2 拓扑但改名字
        if (type === 'vue3') {
          topology.name = 'original-vue3';
          topology.label = 'Vue3 组件生成管线';
          topology.description = 'Vue3 SFC 组件生成管线，拓扑与 Phase2 一致';
        }

        return { success: true, data: topology };
      } catch (error) {
        this.logger.error(`动态获取拓扑失败: ${error.message}`);
        // 降级到静态副本
      }
    }

    // 降级或其他类型：使用静态副本
    const topology = TOPOLOGY_MAP[type];
    if (!topology) {
      return {
        success: false,
        error: `未知的管线类型: ${type}，可选值: phase2, vue3`,
      };
    }
    return { success: true, data: topology };
  }

  /**
   * 列出所有workflow（含原始拓扑）
   */
  async list() {
    try {
      const files = await fs.readdir(this.workflowsDir);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));

      const workflows: any[] = [];
      for (const file of jsonFiles) {
        try {
          const content = await fs.readFile(
            join(this.workflowsDir, file),
            'utf-8',
          );
          const workflow = JSON.parse(content);
          workflows.push({
            name: workflow.name,
            label: workflow.label,
            description: workflow.description,
            nodeCount: workflow.nodes?.length || 0,
            edgeCount: workflow.edges?.length || 0,
            entryNode: workflow.entryNode,
            isOriginal: false,
          });
        } catch (err) {
          this.logger.error(`读取workflow文件失败: ${file}`, err.message);
        }
      }

      // 加入所有原始拓扑（始终可用，不可删除）
      for (const topology of getAllOriginalTopologies()) {
        workflows.push({
          name: topology.name,
          label: topology.label,
          description: topology.description,
          nodeCount: topology.nodes.length,
          edgeCount: topology.edges.length,
          entryNode: topology.entryNode,
          isOriginal: true,
        });
      }

      return { success: true, data: workflows };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取单个workflow详情（支持原始拓扑）
   */
  async get(name: string) {
    // 先检查是否是原始拓扑（从集中定义中查找）
    const originalTopology = getAllOriginalTopologies().find((t) => t.name === name);
    if (originalTopology) {
      return { success: true, data: originalTopology };
    }

    try {
      const filePath = join(this.workflowsDir, `${name}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      const workflow = JSON.parse(content);
      return { success: true, data: workflow };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 保存workflow（原始拓扑不可覆盖）
   */
  async save(workflow: any) {
    // 保护所有系统管线（集中检查）
    if (isProtectedWorkflow(workflow.name)) {
      return {
        success: false,
        error: `「${workflow.label || workflow.name}」是系统生产管线，不可覆盖。请使用"另存为"功能保存为新名称`,
      };
    }

    try {
      const filePath = join(this.workflowsDir, `${workflow.name}.json`);
      await fs.writeFile(filePath, JSON.stringify(workflow, null, 2), 'utf-8');
      return { success: true, message: '保存成功' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 删除workflow（原始拓扑不可删除）
   */
  async delete(name: string) {
    // 保护所有系统管线（集中检查）
    if (isProtectedWorkflow(name)) {
      return {
        success: false,
        error: '系统生产管线不可删除',
      };
    }

    try {
      const filePath = join(this.workflowsDir, `${name}.json`);
      await fs.unlink(filePath);
      return { success: true, message: '删除成功' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 运行工作流
   * 加载保存的 workflow JSON → 用 dynamic-workflow-graph 构建可执行 Graph → 异步执行
   * 前端通过 GET /api/progress/:sessionId 获取 SSE 进度
   */
  async run(name: string, params: {
    componentName: string;
    fileKey: string;
    nodeId: string;
    figmaUrl?: string;   // 🆕 只填链接也能启动：自动解析 fileKey/nodeId
    inputs?: Record<string, any>;  // 🆕 自定义管线入口参数：任意字段透传进 state（如 url 总结配方的 url）
    config?: Record<string, any>;
  }, userId?: string) {
    const { componentName, fileKey, nodeId, config = {}, inputs = {} } = params;
    let resolvedFileKey = fileKey;
    let resolvedNodeId = nodeId;

    // 🆕 figmaUrl 自动解析：fileKey/nodeId 缺失时，从 Figma 链接解析补齐
    // （任何管线都受益：下游 figma-connector 直接消费，不依赖管线里是否接 url-parser 节点）
    if ((!resolvedFileKey || !resolvedNodeId) && params.figmaUrl) {
      try {
        const { UrlParserAgent } = await import(
          '../ai-engine/roles/url-parser-agent.js'
        );
        const parsed = new UrlParserAgent({ skipLLM: true }).parseFigmaUrl(params.figmaUrl);
        if (parsed?.ok) {
          resolvedFileKey = resolvedFileKey || parsed.fileKey;
          resolvedNodeId = resolvedNodeId || parsed.nodeId;
          this.logger.log(
            `[${name}] figmaUrl 自动解析: fileKey=${parsed.fileKey} nodeId=${parsed.nodeId}`,
          );
        }
      } catch (e: any) {
        this.logger.warn(`figmaUrl 自动解析失败（降级为手动参数）: ${e.message}`);
      }
    }

    // 🆕 自定义入口参数放行：inputs 非空（如 URL 总结配方的 url）时，不强制 Figma 参数
    const hasCustomInputs = Object.keys(inputs || {}).length > 0;
    if (!hasCustomInputs && (!resolvedFileKey || !resolvedNodeId)) {
      return { success: false, error: '参数不完整: 请提供 fileKey + nodeId，或 Figma URL，或自定义 inputs' };
    }

    // 加载 workflow 定义
    const workflowResult = await this.get(name);
    if (!workflowResult.success) {
      return { success: false, error: `工作流不存在: ${name}` };
    }

    const workflow = workflowResult.data;

    // 修正 Vue3 语境锁死（硬伤⑤）：按管线名推导 target，
    // original-vue3 → 'vue3'，其余（含 original-phase2）→ 'microcode'。
    // 既驱动任务记录，也传入 initialState 供 visual-parser 等角色使用。
    const wfTarget = name === 'original-vue3' ? 'vue3' : 'microcode';

    // 生成 session ID
    const sessionId = `wf-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const finalComponentName = componentName || sessionId;

    // ============ 硬伤① 消除双引擎分裂 ============
    // 受保护的系统管线（original-phase2 / original-vue3）直接委托给真实的
    // 生产入口 phase2Service.startGeneration()，复用完整的质量环路、视觉反馈、
    // 校验门等生产逻辑，不再走 dynamic-workflow-graph 的简化引擎。
    // 只有用户「另存为」的自定义管线才走 dynamic 引擎。
    if (isProtectedWorkflow(name)) {
      this.logger.log(
        `[硬伤①] 受保护管线 ${name} 委托生产入口 phase2Service.startGeneration`,
      );
      const delegateDto = {
        resolvedFileKey,
        resolvedNodeId,
        groupId: 'workflow-delegate',
        componentName: finalComponentName,
        target: wfTarget,
        config: config || {},
      };
      // 异步委托，不阻塞返回
      this.phase2Service
        .startGeneration(
          sessionId,
          delegateDto as any,
          'workflow-delegate',
          userId,
        )
        .catch((error) => {
          this.logger.error(
            `受保护管线委托执行失败: ${error.message}`,
            error.stack,
          );
          this.progressService.sendError(sessionId, {
            message: error.message,
            stack: error.stack,
          });
        });
      return {
        success: true,
        sessionId,
        message: `管线 "${name}" 已启动（委托生产引擎）`,
      };
    }

    // 🆕 Phase2 变体管线（管线二可编辑）：另存为的管线若标记 engine:'phase2'，
    // 或节点集合与 phase2 拓扑高度重叠（自动识别，前端无需手动打标），
    // 仍委托生产引擎 phase2Service（完整质量环路），但按变体拓扑计算跳过节点。
    // 用户删除的节点 → skipNodes；新增节点本阶段不注入 phase2 引擎（需统一引擎 P2）。
    {
      const phase2Module = await import(
        '../ai-engine/graphs/mc-component-graph-phase2.js'
      );
      const registry = phase2Module.getPhase2NodeRegistry();
      const variantNodeIds = new Set((workflow.nodes || []).map((n: any) => n.id));
      // 自动识别：与 phase2 拓扑 id 重叠 ≥80% 且含核心节点 → 视为 phase2 变体
      const topoIds = new Set(Object.values(registry.realToTopo));
      const overlap = [...variantNodeIds].filter((id) => topoIds.has(id)).length;
      const isPhase2Like =
        (workflow as any).engine === 'phase2' ||
        (overlap >= Math.max(3, Math.ceil(topoIds.size * 0.8)) &&
          ['init', 'figma-connector', 'microcode-engineer', 'complete'].every(
            (id) => variantNodeIds.has(id),
          ));

      if (isPhase2Like) {
        try {
          // 真实节点注册表：拓扑视图是合并视图（parallel-analysis 含 layout-reviewer+style-mapper），
          // 必须用 realToTopo 映射把「用户删除的拓扑节点」展开成「要跳过的真实节点」。
          const keptTopoIds = new Set((workflow.nodes || []).map((n: any) => n.id));
          const skipNodes = registry.allRealNodes.filter((real: string) => {
            const topoId = registry.realToTopo[real] || real;
            return !keptTopoIds.has(topoId);
          });
          this.logger.log(
            `[phase2 变体] ${name} 委托生产引擎，跳过节点: ${JSON.stringify(skipNodes)}`,
          );

          const delegateDto = {
            resolvedFileKey,
            resolvedNodeId,
            groupId: 'workflow-delegate',
            componentName: finalComponentName,
            target: wfTarget,
            config: {
              ...(config || {}),
              ...(skipNodes.length > 0 ? { skipNodes } : {}),
            },
          };
          this.phase2Service
            .startGeneration(
              sessionId,
              delegateDto as any,
              'workflow-delegate',
              userId,
            )
            .catch((error) => {
              this.logger.error(
                `phase2 变体委托执行失败: ${error.message}`,
                error.stack,
              );
              this.progressService.sendError(sessionId, {
                message: error.message,
                stack: error.stack,
              });
            });
          return {
            success: true,
            sessionId,
            message: `管线 "${name}" 已启动（phase2 变体，跳过 ${skipNodes.length} 个节点）`,
          };
        } catch (error) {
          this.logger.error(`phase2 变体启动失败: ${error.message}`, error.stack);
          this.progressService.sendError(sessionId, {
            message: error.message,
            stack: error.stack,
          });
          return {
            success: false,
            error: `phase2 变体启动失败: ${error.message}`,
          };
        }
      }
    }

    // 自定义管线走 dynamic 引擎（保留原路径）
    // 输出路径
    const outputPath = join(tempComponentsDir, 'workflow-runs', sessionId);

    // 创建任务记录
    this.tasksService.createTask(sessionId, {
      componentName: finalComponentName,
      nodeId: resolvedNodeId,
      fileKey: resolvedFileKey,
      target: wfTarget,
      outputPath,
      checkpointStatus: 'none',
      taskType: 'workflow',
      userId,
      generationTier: 'max',
      sourceType: 'figma',
    });

    // 异步执行
    this.executeWorkflow(sessionId, workflow, {
      componentName: finalComponentName,
      fileKey: resolvedFileKey,
      nodeId: resolvedNodeId,
      inputs,
      outputPath,
      target: wfTarget,
      config,
    }).catch((error) => {
      this.logger.error(`工作流执行失败: ${error.message}`, error.stack);
      this.progressService.sendError(sessionId, {
        message: error.message,
        stack: error.stack,
      });
    });

    return {
      success: true,
      sessionId,
      message: `工作流 "${name}" 已启动`,
    };
  }

  /**
   * 异步执行工作流（内部方法）
   */
  private async executeWorkflow(
    sessionId: string,
    workflow: any,
    params: {
      componentName: string;
      fileKey: string;
      nodeId: string;
      inputs?: Record<string, any>;
      outputPath: string;
      target?: string;
      config: Record<string, any>;
    },
  ) {
    const { componentName, fileKey, nodeId, inputs = {}, outputPath, target, config } = params;

    // 设置日志上下文
    const { createLogger } = await import('../ai-engine/logger/index.js');
    const { Logger: CustomLogger } = await import('../ai-engine/logger/logger.js');
    CustomLogger.setSessionContext(sessionId, this.progressService);

    // 确保输出目录存在
    await fs.mkdir(outputPath, { recursive: true });

    // 构建 onProgress 回调
    const onProgress = (progress: any) => {
      this.progressService.sendProgress(sessionId, progress);
    };

    // 从 config 中提取 AI 配置
    const aiConfig = config.aiConfig || {};
    const visionAIConfig = config.visionAIConfig || aiConfig;
    const textAIConfig = config.textAIConfig || aiConfig;
    const figmaToken = config.figmaToken || process.env.FIGMA_ACCESS_TOKEN;

    // 动态导入图构建器
    const { runDynamicWorkflow } = await import(
      '../ai-engine/graphs/dynamic-workflow-graph.js'
    );

    this.logger.log(`[${sessionId}] 开始执行工作流: ${workflow.name}`);

    const initialState = {
      ...(inputs || {}),   // 先展开 inputs，允许自定义参数
      componentName,       // 核心参数后定义，会覆盖 inputs 中的同名 key
      fileKey,
      nodeId,
      outputPath,
      target,
      figmaToken,
      aiConfig,
      visionAIConfig,
      textAIConfig,
      onProgress,
      sessionId,
    };

    // 🆕 节点快照收集器（可观测性）：运行期间记录每个节点输入/输出，供前端调试查看
    const nodeSnapshots: any[] = [];
    this.nodeSnapshotStore.set(sessionId, nodeSnapshots);

    try {
      // 🔧 并发日志串台修复：用 runInSessionContext 包裹 runDynamicWorkflow（AsyncLocalStorage），
      // 使工作流图内的模块级 logger 正确关联到本 sessionId（而非被并发任务覆盖的全局变量）。
      const result = await CustomLogger.runInSessionContext(sessionId, this.progressService, () =>
        runDynamicWorkflow(workflow, initialState, {
          onNodeSnapshot: (snap: any) => {
            if (snap) nodeSnapshots.push({ ...snap, ts: Date.now() });
          },
        }),
      );

      this.logger.log(`[${sessionId}] 工作流执行完成`, {
        success: result?.success ?? !!result,
      });

      this.progressService.sendComplete(sessionId, {
        success: true,
        message: '工作流执行完成',
        outputPath,
        result,
      });
    } catch (error) {
      this.logger.error(`[${sessionId}] 工作流执行失败`, error.stack);
      this.progressService.sendError(sessionId, {
        message: error.message,
        stack: error.stack,
      });
    }
  }

  /** 🆕 节点快照查询（可观测性）：按 sessionId 返回运行期间各节点输入/输出 */
  getNodeSnapshots(sessionId: string): any[] {
    return this.nodeSnapshotStore.get(sessionId) || [];
  }
}
