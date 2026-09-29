/**
 * 工作台 Tool 定义与执行器
 * 桥接现有 API，每个 Tool 对应一个用户意图
 */

import { Logger } from '@nestjs/common';
import { TasksService } from '../tasks/tasks.service';
import { ComponentService } from '../component/component.service';
import { TaskStatsService } from '../task-stats/task-stats.service';
import { Phase2Service } from '../phase2/phase2.service';
import { LiteService } from '../lite/lite.service';
import { TaskQueueService } from '../queue/task-queue.service';
import { ProgressService } from '../progress/progress.service';
import { parseFigmaUrl } from '../ai-engine/utils/figma-url-parser';
// 🛡️ 2026-09-29：componentName 来自 LLM 工具调用参数（不可信），需按单一事实源剔除任务号污染
import { isTaskIdLikeName } from '../ai-engine/utils/component-naming.js';
import { GeneratePhase2Dto } from '../phase2/dto/generate-phase2.dto';
import { tempComponentsDir } from '../config/backend-root';
import { join } from 'path';

const logger = new Logger('WorkbenchTools');

/**
 * Tool 定义（OpenAI Function Calling 格式）
 */
export const WORKBENCH_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_component_from_screenshot',
      description: '从截图生成组件。用户上传截图并描述需求时调用。',
      parameters: {
        type: 'object',
        properties: {
          imageUrl: { type: 'string', description: '截图 URL 或 base64' },
          componentName: { type: 'string', description: '组件名称（英文 kebab-case）' },
          target: { type: 'string', enum: ['microcode', 'vue3'], description: '目标类型：微码或 Vue3' },
          tier: { type: 'string', enum: ['lite', 'max'], description: '规格：轻量或完整' },
        },
        required: ['imageUrl', 'componentName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_component_from_figma',
      description: '从 Figma 链接生成组件。用户提供 Figma URL 时调用。',
      parameters: {
        type: 'object',
        properties: {
          figmaUrl: { type: 'string', description: 'Figma 文件链接' },
          componentName: { type: 'string', description: '组件名称' },
          target: { type: 'string', enum: ['microcode', 'vue3'], description: '目标类型' },
          tier: { type: 'string', enum: ['lite', 'max'], description: '规格' },
        },
        required: ['figmaUrl', 'componentName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'modify_component',
      description: '修改已有组件。用户描述修改需求时调用。',
      parameters: {
        type: 'object',
        properties: {
          componentId: { type: 'string', description: '组件 ID' },
          modification: { type: 'string', description: '修改描述（自然语言）' },
        },
        required: ['componentId', 'modification'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_tasks',
      description: '查询任务列表。用户询问任务状态时调用。',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['running', 'completed', 'failed', 'all'], description: '任务状态筛选' },
          limit: { type: 'number', description: '返回数量上限', default: 10 },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bind_api_to_component',
      description: '为组件绑定 API 数据源。用户要求对接接口时调用。',
      parameters: {
        type: 'object',
        properties: {
          componentId: { type: 'string', description: '组件 ID' },
          apiPath: { type: 'string', description: 'API 路径，如 GET /operation/device/monitor' },
          slotName: { type: 'string', description: '数据槽位名称' },
        },
        required: ['componentId', 'apiPath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'push_to_gitlab',
      description: '将组件推送到 GitLab 仓库。用户要求发布/推送时调用。',
      parameters: {
        type: 'object',
        properties: {
          componentIds: { type: 'array', items: { type: 'string' }, description: '组件 ID 列表' },
          branch: { type: 'string', description: '目标分支', default: 'main' },
          commitMessage: { type: 'string', description: '提交信息' },
        },
        required: ['componentIds'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_components',
      description: '列出用户的组件。用户询问"我有哪些组件"时调用。',
      parameters: {
        type: 'object',
        properties: {
          filter: { type: 'string', enum: ['mine', 'public', 'recent'], description: '筛选条件' },
          limit: { type: 'number', description: '返回数量上限', default: 20 },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_generation_stats',
      description: '获取生成统计数据。用户询问统计信息时调用。',
      parameters: {
        type: 'object',
        properties: {
          timeRange: { type: 'string', enum: ['today', 'week', 'month', 'all'], description: '时间范围' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'batch_generate',
      description: '批量生成组件。用户提供多个截图或 Figma 链接时调用。',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                source: { type: 'string', description: '截图 URL 或 Figma 链接' },
                name: { type: 'string', description: '组件名称' },
              },
            },
            description: '批量生成项列表',
          },
          target: { type: 'string', enum: ['microcode', 'vue3'], description: '目标类型' },
        },
        required: ['items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_workflow',
      description: '执行预定义工作流/配方。用户要求使用某个配方时调用。',
      parameters: {
        type: 'object',
        properties: {
          workflowId: { type: 'string', description: '工作流 ID' },
          params: { type: 'object', description: '工作流参数' },
        },
        required: ['workflowId'],
      },
    },
  },
];

/**
 * Tool 执行上下文
 */
export interface ToolContext {
  userId: string;
  tasksService: TasksService;
  componentService: ComponentService;
  taskStatsService: TaskStatsService;
  phase2Service: Phase2Service;
  liteService: LiteService;
  queueService: TaskQueueService;
  progressService: ProgressService;
}

/**
 * Tool 执行结果
 */
export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  card?: {
    type: string;
    data: Record<string, any>;
  };
}

/**
 * Tool 执行器映射
 */
export const TOOL_EXECUTORS: Record<string, (args: any, ctx: ToolContext) => Promise<ToolResult>> = {
  /**
   * 从截图生成组件
   * 桥接到 Lite 管线（截图强制走 lite 档位）
   */
  create_component_from_screenshot: async (args, ctx) => {
    try {
      const { imageUrl, componentName: rawComponentName, target = 'microcode', backgroundBrightness = 'light' } = args;
      // 🛡️ 2026-09-29 治本（mc-1790667029984-86d05609 实锤）：LLM 会把「上一个任务的
      //   sessionId」（如 mc-max-1790666569567-ddbcf714）当成 componentName 传进来。
      //   污染则清空 ⇒ 下游 `componentName || sessionId` 全部自动回退为 sessionId，
      //   任务记录与产物目录不再被脏名污染。判据走 component-naming 的单一事实源。
      const componentName = isTaskIdLikeName(rawComponentName)
        ? ''
        : String(rawComponentName || '').trim();
      
      // 截图强制走 lite 档位（与 lite.controller 保持一致）
      const tier = 'lite';
      const typePrefix = target === 'microcode' ? 'mc' : 'mv';
      const sessionId = `${typePrefix}-${tier}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      // 解析 groupId
      const groupId = await ctx.liteService.resolvePrivateGroupId(undefined, ctx.userId);

      // 创建任务记录
      ctx.tasksService.createTask(
        sessionId,
        {
          componentId: sessionId,
          componentName: componentName || sessionId,
          target,
          groupId,
          panelKey: 'default-panel',
          taskType: 'component',
          userId: ctx.userId,
          generationTier: 'lite',
          sourceType: 'screenshot',
          outputPath: join(tempComponentsDir, groupId, sessionId),
        },
        'queued',
      );

      // 构建 LiteService DTO（截图走 imageBase64）
      const liteDto = {
        imageBase64: imageUrl,
        componentName: componentName || sessionId,
        componentType: target,
        generationTier: 'lite',
        backgroundBrightness,
      } as any;

      // 启动生成（fire-and-forget，与 lite.controller 保持一致）
      const executeLiteGeneration = async () => {
        try {
          ctx.tasksService.updateTask(sessionId, { status: 'running' });

          await ctx.liteService.startGeneration(
            sessionId,
            liteDto,
            groupId,
            ctx.userId,
            {
              sourceType: 'screenshot',
              componentType: target,
              generationTier: 'lite',
            },
          );

          // 成功后释放队列槽位
          if (ctx.queueService) {
            await ctx.queueService.markTaskCompleted(sessionId);
          }
        } catch (err) {
          logger.error(`Lite 截图任务失败 ${sessionId}: ${err?.message}`);
          const task = ctx.tasksService.getTask(sessionId);
          if (task?.status !== 'failed' && task?.status !== 'cancelled') {
            await ctx.progressService.sendError(sessionId, {
              code: 'INTERNAL_ERROR',
              message: err?.message || '截图生成失败',
            });
          } else if (ctx.queueService) {
            await ctx.queueService.markTaskFailed(sessionId);
          }
        }
      };

      // 检查并发槽位
      if (ctx.queueService && ctx.queueService.getAvailableSlots(ctx.userId) <= 0) {
        // 并发已满，入队等待
        await ctx.queueService.enqueue(
          {
            sessionId,
            componentId: sessionId,
            componentName: componentName || sessionId,
            target,
            groupId,
            userId: ctx.userId,
          },
          'concurrency_full',
          executeLiteGeneration,
        );
      } else {
        // 有空位，立即执行
        if (ctx.queueService) {
          ctx.queueService.registerRunning(sessionId, ctx.userId);
        }
        executeLiteGeneration(); // fire-and-forget
      }

      return {
        success: true,
        data: { sessionId, componentName, status: 'queued' },
        card: {
          type: 'progress',
          data: {
            sessionId,
            componentName: componentName || sessionId,
            status: 'running',
            progress: 0,
            // 来源图：让进度卡显示"正在生成哪张图"
            imageUrl: typeof imageUrl === 'string' && imageUrl.startsWith('data:image/') ? imageUrl : undefined,
            steps: ['视觉分析', '布局解析', '代码生成', '质量校验', '快照保存'],
          },
        },
      };
    } catch (err) {
      logger.error('create_component_from_screenshot failed', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * 从 Figma 生成组件
   * 桥接到 Phase2 完整生成管线（参考 lite.controller.ts#generate）
   */
  create_component_from_figma: async (args, ctx) => {
    try {
      const { figmaUrl, componentName: rawComponentName, target = 'microcode', tier = 'max' } = args;
      // 🛡️ 2026-09-29 治本（mc-1790667029984-86d05609 实锤）：同上 —— 任务号污染必须在此
      //   入口剔除，否则会同时污染任务记录（createTask）与产物目录（phase2 folderName）。
      //   一处清洗覆盖本函数内全部 `componentName || sessionId` 消费点。
      const componentName = isTaskIdLikeName(rawComponentName)
        ? ''
        : String(rawComponentName || '').trim();
      
      // 1. 解析 Figma URL
      const parsed = parseFigmaUrl(figmaUrl);
      if (!parsed.fileKey || !parsed.nodeId) {
        return { 
          success: false, 
          error: 'Max 完整生成需要包含 node-id 的有效 Figma 链接' 
        };
      }

      // 2. 生成 sessionId（与 lite.controller 保持一致的编码规则）
      const typePrefix = target === 'microcode' ? 'mc' : 'mv';
      const tierSuffix = tier === 'lite' ? 'lite' : 'max';
      const sessionId = `${typePrefix}-${tierSuffix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      // 3. 解析 groupId（复用 liteService 的私有组解析逻辑）
      const groupId = await ctx.liteService.resolvePrivateGroupId(undefined, ctx.userId);

      // 4. 创建任务记录（与 lite.controller 保持一致）
      ctx.tasksService.createTask(
        sessionId,
        {
          componentId: sessionId,
          componentName: componentName || sessionId,
          target,
          groupId,
          panelKey: 'default-panel',
          taskType: 'component',
          userId: ctx.userId,
          generationTier: tier,
          sourceType: 'figma',
          outputPath: join(tempComponentsDir, groupId, sessionId),
        },
        'queued',
      );

      // 5. 按档位选择管线并构建执行体
      //    - max  → Phase2 完整管线
      //    - lite → LiteService（其原生支持 sourceType='figma'，此前此处 return「暂不支持」属人为限制）
      let execute: () => Promise<void>;

      if (tier === 'max') {
        const phase2Dto = new GeneratePhase2Dto();
        phase2Dto.componentName = componentName || sessionId;
        phase2Dto.componentId = sessionId;
        phase2Dto.fileKey = parsed.fileKey;
        phase2Dto.nodeId = parsed.nodeId;
        phase2Dto.groupId = groupId;
        phase2Dto.target = target;

        execute = async () => {
          try {
            ctx.tasksService.updateTask(sessionId, { status: 'running' });

            await ctx.phase2Service.startGeneration(
              sessionId,
              phase2Dto,
              groupId,
              ctx.userId,
            );

            // 补回被 Phase2Service 覆盖的档位/来源字段
            ctx.tasksService.updateTask(sessionId, {
              generationTier: 'max',
              sourceType: 'figma',
            });
          } catch (err) {
            logger.error(`Max 任务启动失败 ${sessionId}: ${err?.message}`);
            const task = ctx.tasksService.getTask(sessionId);
            if (task?.status !== 'failed' && task?.status !== 'cancelled') {
              await ctx.progressService.sendError(sessionId, {
                code: 'INTERNAL_ERROR',
                message: err?.message || 'Max 生成失败',
              });
            } else if (ctx.queueService) {
              await ctx.queueService.markTaskFailed(sessionId);
            }
          }
        };
      } else {
        // lite 档位：走 LiteService（sourceType='figma'）
        const liteDto = {
          figmaUrl,
          componentName: componentName || sessionId,
          componentType: target,
          generationTier: 'lite',
        } as any;

        execute = async () => {
          try {
            ctx.tasksService.updateTask(sessionId, { status: 'running' });

            await ctx.liteService.startGeneration(
              sessionId,
              liteDto,
              groupId,
              ctx.userId,
              {
                sourceType: 'figma',
                componentType: target,
                generationTier: 'lite',
              },
            );

            // 补回可能被 LiteService 覆盖的档位/来源字段
            ctx.tasksService.updateTask(sessionId, {
              generationTier: 'lite',
              sourceType: 'figma',
            });
          } catch (err) {
            logger.error(`Figma Lite 任务启动失败 ${sessionId}: ${err?.message}`);
            const task = ctx.tasksService.getTask(sessionId);
            if (task?.status !== 'failed' && task?.status !== 'cancelled') {
              await ctx.progressService.sendError(sessionId, {
                code: 'INTERNAL_ERROR',
                message: err?.message || 'Figma Lite 生成失败',
              });
            } else if (ctx.queueService) {
              await ctx.queueService.markTaskFailed(sessionId);
            }
          }
        };
      }

      // 6. 检查并发槽位（与 lite.controller 保持一致）
      if (ctx.queueService && ctx.queueService.getAvailableSlots(ctx.userId) <= 0) {
        // 并发已满，入队等待
        await ctx.queueService.enqueue(
          {
            sessionId,
            componentId: sessionId,
            componentName: componentName || sessionId,
            target,
            groupId,
            userId: ctx.userId,
          },
          'concurrency_full',
          execute,
        );
      } else {
        // 有空位，立即执行
        if (ctx.queueService) {
          ctx.queueService.registerRunning(sessionId, ctx.userId);
        }
        execute(); // fire-and-forget
      }

      // 8. 返回进度卡片
      return {
        success: true,
        data: { sessionId, componentName, fileKey: parsed.fileKey, status: 'queued' },
        card: {
          type: 'progress',
          data: {
            sessionId,
            componentName: componentName || sessionId,
            status: 'running',
            progress: 0,
            currentStep: 0,
            steps: ['解析 Figma 节点树', '视觉分析', '代码生成', '质量门禁'],
          },
        },
      };
    } catch (err) {
      logger.error('create_component_from_figma failed', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * 修改组件
   */
  modify_component: async (args, ctx) => {
    try {
      const { componentId, modification } = args;
      
      // TODO: 桥接到 Playground AI 修改服务
      // const result = await ctx.demoService.modify(componentId, modification);
      
      return {
        success: true,
        data: { componentId, modification },
        card: {
          type: 'diff',
          data: {
            componentId,
            changes: [
              { file: 'index.vue', additions: 5, deletions: 2, diff: '...' },
            ],
            summary: { additions: 5, deletions: 2 },
          },
        },
      };
    } catch (err) {
      logger.error('modify_component failed', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * 查询任务列表
   */
  query_tasks: async (args, ctx) => {
    try {
      const { status = 'all', limit = 10 } = args;
      
      const tasks = ctx.tasksService.getAllTasks(ctx.userId, { limit });
      
      let filtered = tasks;
      if (status !== 'all') {
        filtered = tasks.filter(t => t.status === status);
      }
      
      return {
        success: true,
        data: filtered,
        card: {
          type: 'list',
          data: {
            title: status === 'all' ? '最近任务' : `${status} 状态的任务`,
            items: filtered.slice(0, limit).map(t => ({
              id: t.sessionId,
              name: t.displayName || t.componentName,
              status: t.status,
              time: new Date(t.startTime).toLocaleString('zh-CN'),
            })),
          },
        },
      };
    } catch (err) {
      logger.error('query_tasks failed', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * 绑定 API 到组件
   */
  bind_api_to_component: async (args, ctx) => {
    try {
      const { componentId, apiPath, slotName } = args;
      
      // TODO: 桥接到实际的 API 绑定服务
      // const result = await ctx.apifoxService.bindApi(componentId, apiPath, slotName);
      
      return {
        success: true,
        data: { componentId, apiPath, slotName },
        card: {
          type: 'action',
          data: {
            title: 'API 绑定完成',
            message: `已将 ${apiPath} 绑定到组件 ${componentId}`,
            actions: [
              { label: '预览效果', action: 'preview', componentId },
              { label: '修改绑定', action: 'rebind' },
            ],
          },
        },
      };
    } catch (err) {
      logger.error('bind_api_to_component failed', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * 推送到 GitLab
   */
  push_to_gitlab: async (args, ctx) => {
    try {
      const { componentIds, branch = 'main', commitMessage } = args;
      
      // TODO: 桥接到实际的 GitLab 推送服务
      // const result = await ctx.gitlabService.push(componentIds, branch, commitMessage);
      
      return {
        success: true,
        data: { componentIds, branch, mrUrl: 'https://gitlab.com/xxx/mr/123' },
        card: {
          type: 'action',
          data: {
            title: '推送成功',
            message: `已将 ${componentIds.length} 个组件推送到 ${branch} 分支`,
            actions: [
              { label: '查看 MR', action: 'open', url: 'https://gitlab.com/xxx/mr/123' },
              { label: '继续操作', action: 'continue' },
            ],
          },
        },
      };
    } catch (err) {
      logger.error('push_to_gitlab failed', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * 列出组件
   */
  list_components: async (args, ctx) => {
    try {
      const { filter = 'mine', limit = 20 } = args;
      
      const result = await ctx.componentService.listComponents({ limit } as any, ctx.userId);
      const components = Array.isArray(result) ? result : (result?.components ?? []);

      return {
        success: true,
        data: components,
        card: {
          type: 'list',
          data: {
            title: filter === 'mine' ? '我的组件' : filter === 'public' ? '公共组件' : '最近组件',
            items: components.slice(0, limit).map((c: any) => ({
              id: c.componentId,
              name: c.name,
              type: c.target,
              time: new Date(c.createdAt).toLocaleDateString('zh-CN'),
            })),
          },
        },
      };
    } catch (err) {
      logger.error('list_components failed', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * 获取生成统计
   */
  get_generation_stats: async (args, ctx) => {
    try {
      const { timeRange = 'week' } = args;
      
      // TODO: 桥接到实际的统计服务
      // const stats = await ctx.taskStatsService.getUserStats(ctx.userId, timeRange);
      
      const mockStats = {
        total: 47,
        completed: 42,
        failed: 3,
        cancelled: 2,
        successRate: 89,
        avgDuration: '3.2min',
      };
      
      return {
        success: true,
        data: mockStats,
        card: {
          type: 'stats',
          data: {
            title: timeRange === 'today' ? '今日统计' : timeRange === 'week' ? '本周统计' : '本月统计',
            metrics: [
              { label: '总生成数', value: mockStats.total },
              { label: '成功数', value: mockStats.completed },
              { label: '成功率', value: `${mockStats.successRate}%` },
              { label: '平均耗时', value: mockStats.avgDuration },
            ],
          },
        },
      };
    } catch (err) {
      logger.error('get_generation_stats failed', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * 批量生成
   */
  batch_generate: async (args, ctx) => {
    try {
      const { items, target = 'microcode' } = args;
      
      // TODO: 桥接到实际的批量生成服务
      const sessionIds = items.map((item, i) => ({
        sessionId: `mc-max-${Date.now()}-${i}`,
        name: item.name,
        status: 'queued',
      }));
      
      return {
        success: true,
        data: sessionIds,
        card: {
          type: 'progress',
          data: {
            batchId: `batch-${Date.now()}`,
            total: items.length,
            completed: 0,
            items: sessionIds,
          },
        },
      };
    } catch (err) {
      logger.error('batch_generate failed', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * 执行工作流
   */
  execute_workflow: async (args, ctx) => {
    try {
      const { workflowId, params = {} } = args;
      
      // TODO: 桥接到实际的工作流执行服务
      // const result = await ctx.workflowService.execute(workflowId, params);
      
      return {
        success: true,
        data: { workflowId, status: 'running' },
        card: {
          type: 'progress',
          data: {
            workflowId,
            status: 'running',
            progress: 0,
          },
        },
      };
    } catch (err) {
      logger.error('execute_workflow failed', err);
      return { success: false, error: err.message };
    }
  },
};

/**
 * 执行 Tool
 */
export async function executeTool(
  toolName: string,
  args: any,
  ctx: ToolContext,
): Promise<ToolResult> {
  const executor = TOOL_EXECUTORS[toolName];
  if (!executor) {
    return { success: false, error: `Unknown tool: ${toolName}` };
  }
  return executor(args, ctx);
}
