/**
 * 工作台 Tool 定义与执行器
 * 桥接现有 API，每个 Tool 对应一个用户意图
 */

import { Logger } from '@nestjs/common';
import { TasksService } from '../tasks/tasks.service';
import { ComponentService } from '../component/component.service';
import { TaskStatsService } from '../task-stats/task-stats.service';
import { DemoService } from '../demo/demo.service';
import { ApiBindingService } from '../vue3/api-binding.service';
import { SlotAnalyzerService } from '../vue3/slot-analyzer.service';
import { ApifoxService } from '../apifox/apifox.service';
import { WorkflowService } from '../workflow/workflow.service';
import { GitlabPushService } from '../component/gitlab-push.service';
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
import { ymdShanghai } from '../admin/usage-export';
import { ComponentAnalysisService } from '../component/component-analysis.service';
import { TaskCodeSnapshotService } from '../tasks/task-code-snapshot.service';

const logger = new Logger('WorkbenchTools');

/**
 * 平均耗时 ms → 可读文本
 */
function formatAvgDuration(ms: number): string {
  if (!ms || ms <= 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = sec / 60;
  if (min < 60) return `${min.toFixed(1)}min`;
  return `${(min / 60).toFixed(1)}h`;
}

/**
 * token 数量 → 可读文本
 */
function formatTokens(n: number): string {
  if (!n || n <= 0) return '0';
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/**
 * ─── API 绑定自动匹配（与前端 ApiBindingWizard.findBestMatch 同源） ───
 * 说明：工作台对话里无法让用户逐个选 slot→function，故内联前端向导的启发式
 * 匹配逻辑（关键词 + slotType + refName 相似度），行为与向导「自动推荐」一致。
 */

const SKIP_AUTO_BIND_ROLES = ['filter.tabs', 'component.config', 'table.columns', 'chart.legend', 'chart.threshold'];

function shouldSkipAutoBinding(slot: any): boolean {
  if (slot.bindable === false) return true;
  return SKIP_AUTO_BIND_ROLES.includes(slot.role);
}

function hasAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((k) => text.includes(k));
}

function functionText(fn: any): string {
  return [fn.name, fn.summary, fn.path, fn.responsePreview].filter(Boolean).join(' ').toLowerCase();
}

function findBestMatch(slot: any, catalog: any): { moduleName: string; functionName: string } | null {
  if (!catalog?.modules || shouldSkipAutoBinding(slot)) return null;

  const chartKeywords = ['统计', '趋势', '分析', '曲线', '图表', 'chart', 'trend', 'statistics', 'analysis'];
  const tableKeywords = ['列表', '分页', '明细', '记录', 'list', 'page', 'table', 'records'];
  const selectKeywords = ['选项', '下拉', '字典', '枚举', 'options', 'select', 'dict', 'enum'];
  const statKeywords = ['统计', '概览', '总量', '指标', 'summary', 'overview', 'total', 'metric'];

  for (const mod of catalog.modules) {
    for (const fn of mod.functions) {
      if (fn.method !== 'GET') continue;
      const text = functionText(fn);
      const preview = fn.responsePreview || '';

      if ((slot.slotType === 'table' || slot.slotType === 'list') &&
          (preview.includes('[{') || preview.includes('array') || hasAnyKeyword(text, tableKeywords))) {
        return { moduleName: mod.moduleName, functionName: fn.name };
      }
      if (slot.slotType === 'chart' && hasAnyKeyword(text, chartKeywords)) {
        return { moduleName: mod.moduleName, functionName: fn.name };
      }
      if (slot.slotType === 'select' && hasAnyKeyword(text, selectKeywords)) {
        return { moduleName: mod.moduleName, functionName: fn.name };
      }
      if (slot.slotType === 'stat' && hasAnyKeyword(text, statKeywords)) {
        return { moduleName: mod.moduleName, functionName: fn.name };
      }
    }
  }

  const refName = String(slot.refName || '').toLowerCase();
  if (!refName || slot.role === 'chart.composite') return null;
  for (const mod of catalog.modules) {
    for (const fn of mod.functions) {
      const fnName = fn.name.toLowerCase();
      if (fnName.includes(refName) || refName.includes(fnName)) {
        return { moduleName: mod.moduleName, functionName: fn.name };
      }
    }
  }
  return null;
}

/** 解析 "GET /operation/device/monitor" → { method, path } */
function parseApiPath(apiPath: string): { method: string; path: string } | null {
  const m = String(apiPath || '').trim().match(/^(GET|POST|PUT|DELETE)\s+(\/[^\s]*)/i);
  if (!m) return null;
  return { method: m[1].toUpperCase(), path: m[2] };
}

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
  {
    type: 'function',
    function: {
      name: 'analyze_component',
      description: '对组件做体检：真实预览运行时门禁 + 视觉相似度对比。用户要求"体检/检查/分析组件质量"时调用。',
      parameters: {
        type: 'object',
        properties: {
          componentId: { type: 'string', description: '组件 ID（sessionId 或 componentId）' },
        },
        required: ['componentId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_revisions',
      description: '列出组件的代码快照版本历史。用户要求"查看版本/历史版本/有哪些版本"时调用。',
      parameters: {
        type: 'object',
        properties: {
          componentId: { type: 'string', description: '组件 ID（sessionId）' },
        },
        required: ['componentId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rollback_component',
      description: '把组件回滚到指定历史版本。用户要求"回滚/回退/恢复到上一版/回到某版本"时调用。',
      parameters: {
        type: 'object',
        properties: {
          componentId: { type: 'string', description: '组件 ID（sessionId）' },
          revision: { type: 'string', description: '目标版本 revision（r-开头的 UUID）' },
        },
        required: ['componentId', 'revision'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'publish_component',
      description: '把组件发布到公共组件池（visibility=public）。用户要求"发布/交付/共享组件"时调用。',
      parameters: {
        type: 'object',
        properties: {
          componentId: { type: 'string', description: '组件 ID（sessionId 或 componentId）' },
        },
        required: ['componentId'],
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
  demoService: DemoService;
  apiBindingService: ApiBindingService;
  slotAnalyzer: SlotAnalyzerService;
  apifoxService: ApifoxService;
  workflowService: WorkflowService;
  gitlabPushService: GitlabPushService;
  phase2Service: Phase2Service;
  liteService: LiteService;
  queueService: TaskQueueService;
  progressService: ProgressService;
  /** 组件视觉/运行时体检（R19 analyze-visual 的 service） */
  componentAnalysisService: ComponentAnalysisService;
  /** 代码快照版本历史 + 一键回滚（R20 listRevisions/rollbackToRevision） */
  taskCodeSnapshotService: TaskCodeSnapshotService;
  /** 对话级/用户级 GitLab 凭据（真实值，供 push_to_gitlab 使用） */
  gitlabToken?: string;
  gitlabProjectUrl?: string;
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
   * 修改组件（桥接 DemoService.aiChat，Playground 自然语言修改器）
   */
  modify_component: async (args, ctx) => {
    try {
      const { componentId, modification } = args;

      if (!componentId || !modification) {
        return { success: false, error: '缺少 componentId 或 modification 参数' };
      }

      // 调 Playground 修改器：真读文件、真改代码、真写快照（可撤销）
      const result = await ctx.demoService.aiChat({
        message: modification,
        componentId,
      });

      const files = result.modifiedFiles || [];
      const toolErrors = result.toolErrors || [];

      return {
        success: result.success,
        data: {
          componentId,
          content: result.content,
          modifiedFiles: files,
          iterations: result.iterations,
          toolErrors,
        },
        card: {
          type: 'diff',
          data: {
            componentId,
            summary: {
              additions: files.length,
              deletions: 0,
            },
            changes: files.map((f: string) => ({ file: f, diff: '' })),
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
   * 绑定 API 到组件（桥接 SlotAnalyzerService + ApiBindingService，自动匹配 slot→接口）
   */
  bind_api_to_component: async (args, ctx) => {
    try {
      const { componentId, apiPath, slotName } = args;
      if (!componentId) {
        return { success: false, error: '缺少 componentId 参数' };
      }

      // 1. 反查 groupId（vue3 组件 sessionId === componentId，见 api-binding.service 注释）
      const task = ctx.tasksService.getTask(componentId);
      const groupId = task?.groupId;
      if (!groupId) {
        return {
          success: false,
          error: '无法定位组件的群组信息，请到任务详情页的「接口对接」向导完成绑定',
        };
      }

      // 2. 找最近的 API 目录（按 ownerId 隔离，杜绝越权用别人的目录）
      const catalogs = ctx.apifoxService.listCatalogs(ctx.userId);
      if (!catalogs || catalogs.length === 0) {
        return {
          success: false,
          error: '暂无可用 API 目录，请先在「接口生成」页从 Apifox 生成一份接口目录',
        };
      }
      const catalogId = catalogs[0].catalogId;
      const catalog = ctx.apifoxService.getCatalog(catalogId);

      // 3. 分析组件数据槽
      const { slots } = await ctx.slotAnalyzer.analyzeSlots(componentId, groupId);
      if (!slots || slots.length === 0) {
        return {
          success: false,
          error: '组件没有可绑定的数据槽，请确认组件含表格/图表/下拉等数据区域',
        };
      }

      // 4. 精确匹配用户指定接口（apiPath "GET /operation/device/monitor" → module.function）
      let exactFn: { moduleName: string; functionName: string } | null = null;
      const parsed = parseApiPath(apiPath);
      if (parsed) {
        outer: for (const mod of catalog.modules) {
          for (const fn of mod.functions) {
            if (String(fn.method || '').toUpperCase() === parsed.method && fn.path === parsed.path) {
              exactFn = { moduleName: mod.moduleName, functionName: fn.name };
              break outer;
            }
          }
        }
      }

      // 5. 构造 bindings（自动匹配；用户指定的接口优先绑到第一个可绑 slot）
      const bindings: any[] = [];
      let boundCount = 0;
      let usedExact = false;
      for (const slot of slots) {
        const base = {
          slotId: slot.slotId,
          slotType: slot.slotType,
          refName: slot.refName,
          label: slot.label,
          role: slot.role,
          bindable: slot.bindable,
          children: slot.children,
        };
        if (shouldSkipAutoBinding(slot)) {
          bindings.push({ ...base, status: 'skipped', skipReason: '筛选/配置子项不作为主接口绑定' });
          continue;
        }
        if (exactFn && !usedExact) {
          bindings.push({ ...base, ...exactFn, status: 'bound' });
          boundCount++;
          usedExact = true;
          continue;
        }
        const rec = findBestMatch(slot, catalog);
        if (rec) {
          bindings.push({ ...base, ...rec, status: 'bound' });
          boundCount++;
        } else {
          bindings.push({ ...base, status: 'stub', stubReason: '未找到匹配接口' });
        }
      }

      // 6. 无任何成功绑定 → 不落盘，友好提示
      if (boundCount === 0) {
        return {
          success: false,
          error: `未在 API 目录中找到可匹配的接口（${apiPath || '未指定'}）。请在「接口对接」向导中手动选择数据槽对应的接口。`,
        };
      }

      // 7. 执行绑定（含真实运行时预检，失败自动回滚）
      const result = await ctx.apiBindingService.bindApi({
        catalogId,
        componentId,
        groupId,
        componentName: task?.componentName || componentId,
        bindings,
      });

      return {
        success: true,
        data: {
          ...result,
          groupId,
          catalogId,
          boundSlots: bindings.filter((b) => b.status === 'bound').length,
          stubSlots: bindings.filter((b) => b.status === 'stub').length,
          skippedSlots: bindings.filter((b) => b.status === 'skipped').length,
        },
        card: {
          type: 'list',
          data: {
            title: `API 绑定完成（${bindings.filter((b) => b.status === 'bound').length} 绑定 / ${bindings.filter((b) => b.status === 'stub').length} 占位）`,
            items: bindings.map((b: any) => ({
              id: b.slotId,
              name: `${b.slotType} · ${b.label || b.refName || b.slotId}`,
              meta: b.status === 'bound'
                ? `已绑定 ${b.moduleName}.${b.functionName}`
                : b.status === 'stub'
                  ? '占位（无匹配接口）'
                  : '跳过（配置项）',
            })),
          },
        },
      };
    } catch (err) {
      logger.error('bind_api_to_component failed', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * 推送到 GitLab（桥接 GitlabPushService.pushComponent，凭据从对话配置读取）
   */
  push_to_gitlab: async (args, ctx) => {
    try {
      const { componentIds, branch = 'main', commitMessage } = args;
      if (!componentIds || componentIds.length === 0) {
        return { success: false, error: '缺少 componentIds 参数' };
      }

      // 凭据从「工作台对话凭据」（对话级 > 用户级）读取，不硬编码、不绕过鉴权
      if (!ctx.gitlabToken || !ctx.gitlabProjectUrl) {
        return {
          success: false,
          error: '未配置 GitLab 凭据，请点击对话右上角「工具凭据」配置 GitLab Token 和仓库地址',
        };
      }

      // 逐个推送（复用授权 + 产物定位 + GitLab API 提交）
      const results: any[] = [];
      for (const id of componentIds) {
        const r = await ctx.gitlabPushService.pushComponent({
          identifier: id,
          userId: ctx.userId,
          repoUrl: ctx.gitlabProjectUrl,
          branch,
          accessToken: ctx.gitlabToken,
          commitMessage,
        });
        results.push(r);
      }

      return {
        success: true,
        data: { results },
        card: {
          type: 'list',
          data: {
            title: `GitLab 推送完成（${results.length} 个组件）`,
            items: results.map((r: any) => ({
              id: r.data?.componentId || '',
              name: r.data?.componentId || '',
              meta: `${r.data?.branch || branch} · ${r.data?.files || 0} 个文件 · ${r.data?.commitId || ''}`,
            })),
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
   * 获取生成统计（桥接 TaskStatsService.myDashboard，用户视角真实统计）
   */
  get_generation_stats: async (args, ctx) => {
    try {
      const { timeRange = 'week' } = args;

      // timeRange → TaskStatsFilter（与 task-stats 的 resolveWindow 口径对齐）
      // 合法 preset：week / d30 / d60 / custom；「today/all」需用 custom + from/to 表达
      const today = ymdShanghai(Date.now());
      const filter: Record<string, any> = {
        today: { preset: 'custom', from: today, to: today },
        week: { preset: 'week' },
        month: { preset: 'd30' },
        all: { preset: 'custom', from: '1970-01-01', to: today },
      }[timeRange] || { preset: 'week' };

      const { overview, windowLabel } = await ctx.taskStatsService.myDashboard(ctx.userId, filter);

      const successRatePct = overview.successRate == null
        ? null
        : Math.round(overview.successRate * 100);

      const rangeTitle = {
        today: '今日统计',
        week: '本周统计',
        month: '近30天统计',
        all: '全部统计',
      }[timeRange] || '本周统计';

      return {
        success: true,
        data: {
          timeRange,
          windowLabel,
          total: overview.totalTasks,
          completed: overview.completedTasks,
          failed: overview.failedTasks,
          successRate: successRatePct,
          avgDurationMs: overview.avgDurationMs,
          totalTokens: overview.totalTokens,
          totalCost: overview.totalCost,
        },
        card: {
          type: 'stats',
          data: {
            title: `${rangeTitle} · ${windowLabel}`,
            metrics: [
              { label: '总生成数', value: overview.totalTasks },
              { label: '成功数', value: overview.completedTasks },
              { label: '失败数', value: overview.failedTasks },
              { label: '成功率', value: successRatePct == null ? '—' : `${successRatePct}%` },
              { label: '平均耗时', value: formatAvgDuration(overview.avgDurationMs) },
              { label: 'Token 消耗', value: formatTokens(overview.totalTokens) },
              { label: '总成本', value: `¥${overview.totalCost.toFixed(2)}` },
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
   * 批量生成（R6）
   * 循环复用真实生成执行器：Figma 链接 → create_component_from_figma，
   * 截图 → create_component_from_screenshot。每个 item 独立创建真实任务、排队，
   * 返回 batchId + 各 item 的 sessionId（进度可通过 query_tasks 按 sessionId 查询）。
   */
  batch_generate: async (args, ctx) => {
    try {
      const { items, target = 'microcode' } = args;
      if (!Array.isArray(items) || items.length === 0) {
        return { success: false, error: '缺少 items 参数（至少一个生成项）' };
      }

      const batchId = `batch-${Date.now()}`;
      const created: any[] = [];

      // 逐个复用真实生成执行器（fire-and-forget：内部建任务 + 启动生成 + 排队）
      for (const item of items) {
        const source = String(item?.source || '').trim();
        const name = String(item?.name || '').trim();
        if (!source) {
          created.push({ source: '', name, type: 'unknown', success: false, sessionId: null, error: '缺少 source' });
          continue;
        }

        // 判断来源：含 figma → Figma 生成；否则按截图生成
        const isFigma = /figma/i.test(source);
        const execName = isFigma ? 'create_component_from_figma' : 'create_component_from_screenshot';
        const exec = TOOL_EXECUTORS[execName];

        let r: ToolResult;
        try {
          if (isFigma) {
            r = await exec({ figmaUrl: source, componentName: name, target, tier: 'max' }, ctx);
          } else {
            r = await exec({ imageUrl: source, componentName: name, target }, ctx);
          }
        } catch (err) {
          r = { success: false, error: err?.message || '生成执行异常' };
        }

        created.push({
          source,
          name,
          type: isFigma ? 'figma' : 'screenshot',
          success: r.success,
          sessionId: r.data?.sessionId || null,
          error: r.error || null,
        });
      }

      const okCount = created.filter((c) => c.success).length;
      const sessionIds = created.filter((c) => c.success && c.sessionId).map((c) => c.sessionId);

      return {
        success: true,
        data: { batchId, items: created, sessionIds },
        card: {
          type: 'list',
          data: {
            title: `批量生成已提交（${okCount}/${created.length} 成功入队）`,
            items: created.map((c) => ({
              id: c.sessionId || c.source || '',
              name: c.name || c.sessionId || (c.source ? c.source.slice(0, 30) : '未知'),
              meta: c.success ? `${c.type === 'figma' ? 'Figma' : '截图'} · 排队中` : `失败：${c.error || '未知'}`,
            })),
          },
        },
      };
    } catch (err) {
      logger.error('batch_generate failed', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * 执行工作流（桥接 WorkflowService.run：受保护管线委托生产引擎，自定义管线走 dynamic 引擎）
   */
  execute_workflow: async (args, ctx) => {
    try {
      const { workflowId, params = {} } = args;
      if (!workflowId) {
        return { success: false, error: '缺少 workflowId 参数' };
      }

      // 桥接真实工作流执行服务（参数不完整时 run 会返回友好 error）
      const result = await ctx.workflowService.run(workflowId, params || {}, ctx.userId);

      if (!result.success) {
        return { success: false, error: result.error || '工作流执行失败' };
      }

      return {
        success: true,
        data: result,
        card: {
          type: 'progress',
          data: {
            sessionId: result.sessionId,
            workflowId,
            status: 'running',
            progress: 0,
            currentMessage: result.message || '工作流已启动',
          },
        },
      };
    } catch (err) {
      logger.error('execute_workflow failed', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * 组件体检（R19 analyze-visual）：真实预览运行时门禁 + 视觉相似度对比。
   * 桥接 ComponentAnalysisService.analyzeComponent；不传视觉模型配置时，
   * 运行时门禁 PASS 才要求视觉模型（缺则返回降级提示），运行时 FAIL 则直接给运行时问题。
   */
  analyze_component: async (args, ctx) => {
    try {
      const { componentId } = args;
      if (!componentId) {
        return { success: false, error: '缺少 componentId 参数' };
      }

      const report = await ctx.componentAnalysisService.analyzeComponent(componentId, ctx.userId);
      const runtime = report?.runtime || {};
      const visual = report?.visual || {};

      // 文本总结：运行时门禁 + 视觉相似度，缺视觉模型时给出降级说明
      const lines: string[] = [];
      lines.push(`运行时门禁：${runtime.status === 'PASS' ? '通过' : '未通过'}${runtime.summary ? ' —— ' + runtime.summary : ''}`);
      if (visual?.available) {
        const sim = typeof visual.overallSimilarity === 'number'
          ? `${Math.round(visual.overallSimilarity * 100)}%`
          : 'N/A';
        lines.push(`视觉相似度：${sim}${visual.summary ? ' —— ' + visual.summary : ''}`);
      } else if (visual?.summary) {
        lines.push(visual.summary);
      }

      const runtimePassText = runtime.status === 'PASS' ? '通过' : (runtime.status || '未执行');
      const simText = typeof visual?.overallSimilarity === 'number'
        ? `${Math.round(visual.overallSimilarity * 100)}%`
        : (visual?.available ? 'N/A' : '未执行');

      return {
        success: report?.success !== false,
        data: {
          componentId,
          content: lines.join('\n'),
          runtime: { status: runtime.status, pass: !!runtime.pass, summary: runtime.summary || '' },
          visual: {
            available: !!visual?.available,
            overallSimilarity: visual?.overallSimilarity ?? null,
            summary: visual?.summary || '',
          },
        },
        card: {
          type: 'stats',
          data: {
            title: '组件体检报告',
            metrics: [
              { label: '运行时门禁', value: runtimePassText },
              { label: '视觉相似度', value: simText },
            ],
          },
        },
      };
    } catch (err) {
      logger.error('analyze_component failed', err);
      return { success: false, error: err?.message || '体检失败' };
    }
  },

  /**
   * 列出组件代码快照版本历史（R20 listRevisions）。
   * 桥接 TaskCodeSnapshotService.listRevisions，只读磁盘 revisions，不触碰任何指针。
   */
  list_revisions: async (args, ctx) => {
    try {
      const { componentId } = args;
      if (!componentId) {
        return { success: false, error: '缺少 componentId 参数' };
      }

      const revisions = ctx.taskCodeSnapshotService.listRevisions(componentId);
      if (!revisions || revisions.length === 0) {
        return { success: false, error: '该组件没有可用的版本快照（可能未经完整生成链路）' };
      }
      const lastGood = ctx.taskCodeSnapshotService.getLastGoodManifest(componentId)?.revision || null;

      return {
        success: true,
        data: { componentId, revisions, current: lastGood },
        card: {
          type: 'list',
          data: {
            title: `版本历史（${revisions.length} 个版本）`,
            items: revisions.map((r) => ({
              id: r.revision,
              name: `${r.revision}${r.revision === lastGood ? ' · 当前' : ''}`,
              meta: `${r.status} · ${new Date(r.createdAt).toLocaleString('zh-CN')}`,
            })),
          },
        },
      };
    } catch (err) {
      logger.error('list_revisions failed', err);
      return { success: false, error: err?.message || '列版本失败' };
    }
  },

  /**
   * 一键回滚（R20 rollbackToRevision）：把 last-good 指针重定向到目标历史版本。
   * 未显式指定 revision 时，自动选「最新的、非当前 last-good、且可回滚」的历史版本
   * （即"回滚到上一版"的语义），使对话自然语言"回滚"即可用。
   */
  rollback_component: async (args, ctx) => {
    try {
      const { componentId, revision: requestedRevision } = args;
      if (!componentId) {
        return { success: false, error: '缺少 componentId 参数' };
      }

      let target = String(requestedRevision || '').trim();
      if (!target) {
        const all = ctx.taskCodeSnapshotService.listRevisions(componentId);
        const lastGood = ctx.taskCodeSnapshotService.getLastGoodManifest(componentId)?.revision;
        const rollable = all.find((r) =>
          r.revision !== lastGood &&
          ['candidate', 'validating', 'last-good', 'partial'].includes(r.status),
        );
        if (!rollable) {
          return { success: false, error: '没有可回滚的历史版本（可能只有一个版本，或历史版本均已拒绝）' };
        }
        target = rollable.revision;
      }

      const manifest = ctx.taskCodeSnapshotService.rollbackToRevision(componentId, target);
      return {
        success: true,
        data: {
          componentId,
          revision: manifest.revision,
          content: `已回滚到版本 ${manifest.revision}（${manifest.status}，${manifest.files?.length || 0} 个文件）`,
        },
        card: {
          type: 'list',
          data: {
            title: '回滚完成',
            items: [{
              id: manifest.revision,
              name: manifest.revision,
              meta: `${new Date(manifest.createdAt).toLocaleString('zh-CN')} · ${manifest.files?.length || 0} 个文件`,
            }],
          },
        },
      };
    } catch (err) {
      logger.error('rollback_component failed', err);
      return { success: false, error: err?.message || '回滚失败' };
    }
  },

  /**
   * 发布到公共组件池（R21 publishComponent）：visibility → public。
   * 发布接口严格要求 Mongo _id，先经 authorizeWorkspaceComponent 从 sessionId/componentId
   * 反查组件记录拿 _id；尚未入库的生成中组件给出友好提示（与前端交付弹窗行为一致）。
   */
  publish_component: async (args, ctx) => {
    try {
      const { componentId } = args;
      if (!componentId) {
        return { success: false, error: '缺少 componentId 参数' };
      }

      const authorized = await ctx.componentService.authorizeWorkspaceComponent(componentId, ctx.userId, 'read');
      const comp: any = (authorized as any)?.component;
      const mongoId = comp?._id?.toString?.() || comp?._id;
      if (!mongoId) {
        return { success: false, error: '组件尚未入库，无法发布到公共组件池（请先完成一次生成并保存）' };
      }

      const component = await ctx.componentService.publishComponent(String(mongoId), ctx.userId);
      const outId = (component as any)?.componentId || componentId;
      const visibility = (component as any)?.visibility;

      return {
        success: true,
        data: {
          componentId: outId,
          visibility,
          sharedAt: (component as any)?.sharedAt,
          content: `已发布到公共组件池（visibility=${visibility}）`,
        },
        card: {
          type: 'stats',
          data: {
            title: '发布完成',
            metrics: [
              { label: '组件', value: outId },
              { label: '可见性', value: visibility === 'public' ? '公共' : String(visibility) },
            ],
          },
        },
      };
    } catch (err) {
      logger.error('publish_component failed', err);
      return { success: false, error: err?.message || '发布失败' };
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
