import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpStatus,
  HttpException,
  NotFoundException,
  Req,
  Logger,
  OnModuleInit,
  UseGuards,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Vue3Service } from './vue3.service';
import { GenerateVue3Dto } from './dto/generate-vue3.dto';
import { AnalyzeSlotsDto } from './dto/analyze-slots.dto';
import { AnalyzeFromDocDto } from './dto/analyze-from-doc.dto';
import { BindApiDto } from './dto/bind-api.dto';
import { SlotAnalyzerService } from './slot-analyzer.service';
import { DocAnalyzerService } from './doc-analyzer.service';
import { ApiBindingService } from './api-binding.service';
import { QuotaService } from '../quota/quota.service';
import { TaskQueueService } from '../queue/task-queue.service';
import { TasksService } from '../tasks/tasks.service';
import type { Task } from '../tasks/tasks.service';
import { SessionGuard } from '../auth/session.guard';

@Controller('vue3')
@UseGuards(SessionGuard)
export class Vue3Controller implements OnModuleInit {
  private readonly logger = new Logger(Vue3Controller.name);

  constructor(
    private readonly vue3Service: Vue3Service,
    private readonly slotAnalyzer: SlotAnalyzerService,
    private readonly docAnalyzer: DocAnalyzerService,
    private readonly apiBindingService: ApiBindingService,
    private readonly quotaService: QuotaService,
    private readonly queueService: TaskQueueService,
    private readonly tasksService: TasksService,
  ) {}

  /**
   * 服务启动时注册「恢复执行器」（仅处理 target === 'vue3' 的任务）：
   * 服务重启后，磁盘上残留的 queued 任务恢复入队时，按任务记录重建 dto 并重新启动生成。
   * 多个执行器可共存（Phase2Controller 也会注册），执行器返回 true 表示已处理。
   */
  onModuleInit(): void {
    this.queueService.registerRestoreExecutor(async (task: Task): Promise<boolean> => {
      if (task.target !== 'vue3') return false; // microcode 由 Phase2Controller 的执行器处理
      // 🐛 修复：fileKey/nodeId 为空的脏数据（如服务重启残留）恢复后走 Figma 会 404 失败，
      // 失败路径的槽位释放不可靠，导致幽灵槽位占满并发、新任务永久排队。
      // 空参数任务无法恢复执行，直接返回 false 交由队列标记失败，不占用槽位。
      if (!task.fileKey || !task.nodeId) {
        this.logger.warn(
          `跳过 vue3 任务恢复（fileKey/nodeId 为空）: ${task.sessionId} (fileKey=${task.fileKey}, nodeId=${task.nodeId})`,
        );
        return false;
      }
      try {
        const dto = new GenerateVue3Dto();
        dto.componentName = task.componentName || task.sessionId;
        dto.componentId = task.componentId || task.sessionId;
        dto.nodeId = task.nodeId;
        dto.fileKey = task.fileKey;
        dto.groupId = task.groupId || '';
        dto.panelType = task.panelKey || 'default-panel';
        if (task.configSnapshot) {
          dto.config = {
            outputPath: task.configSnapshot.outputPath,
            ...task.configSnapshot,
          };
        }
        await this.vue3Service.startGeneration(
          task.sessionId,
          dto,
          task.groupId || '',
          task.userId,
        );
        return true;
      } catch (error) {
        this.logger.error(`恢复 vue3 任务失败: ${task.sessionId}`, error);
        return false;
      }
    });
  }

  // ==================== 原有端点 ====================

  @Post('generate')
  async generate(@Body() dto: GenerateVue3Dto, @Req() req: any) {
    const { fileKey, nodeId, groupId } = dto;

    if (!fileKey || !nodeId) {
      throw new HttpException('参数不完整', HttpStatus.BAD_REQUEST);
    }

    const userId = req.session?.userId;

    // 🆕 配额检查：生成前验证用户配额，超限则入队等待
    let enqueueResult: any = null;
    if (userId) {
      try {
        const quotaStatus = await this.quotaService.checkQuotaStatus(userId);
        if (!quotaStatus.allowed) {
          // 配额不足，将任务加入等待队列
          const waitMinutes = Math.ceil(((quotaStatus.quotaResetAt || Date.now() + 60 * 60 * 1000) - Date.now()) / (60 * 1000));
          enqueueResult = {
            queued: true,
            reason: quotaStatus.reason,
            message: `配额不足，任务已加入等待队列。配额预计将在约 ${waitMinutes} 分钟后恢复，届时将自动开始执行。您可以在任务中心查看排队状态。`,
            quotaResetAt: quotaStatus.quotaResetAt,
            waitMinutes,
            used: quotaStatus.used,
            limit: quotaStatus.limit,
          };
        }
      } catch (error) {
        if (error instanceof HttpException) {
          throw error;
        }
        this.logger.error(`配额检查失败: ${error.message}`, error.stack);
        throw new HttpException('配额检查服务异常', HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }

    // 生成 sessionId（配额不足或充足都使用同一个）
    const sessionId = `mv-${Date.now()}-${randomBytes(4).toString('hex')}`;

    if (!dto.componentName) {
      dto.componentName = sessionId;
    }

    // 配额不足：创建 queued 任务记录，由队列调度器在配额恢复后自动启动
    if (enqueueResult?.queued) {
      const queuedTask = this.tasksService.createTask(sessionId, {
        componentId: sessionId,
        componentName: dto.componentName,
        nodeId: dto.nodeId,
        fileKey: dto.fileKey,
        target: 'vue3',
        groupId: groupId,
        panelKey: 'default-panel',
        taskType: 'component',
        userId,
        generationTier: 'max',
        sourceType: 'figma',
        enqueuedAt: Date.now(),
        quotaResetAt: enqueueResult.quotaResetAt,
        queuePriority: 0,
      }, 'queued');
      
      // 加入等待队列（绑定执行函数，队列调度时调用）
      await this.queueService.enqueue(queuedTask, 'quota_exceeded', async () => {
        await this.vue3Service.startGeneration(sessionId, dto, groupId, userId);
      });
      
      return {
        success: true,
        sessionId,
        queued: true,
        message: enqueueResult.message,
        queue: {
          position: this.queueService.getQueueStats().totalQueued,
          quotaResetAt: enqueueResult.quotaResetAt,
          waitMinutes: enqueueResult.waitMinutes,
        },
      };
    }

    // 检查并发槽位
    const availableSlots = await this.queueService.getAvailableSlots(userId);
    if (availableSlots <= 0) {
      this.logger.log(`[Vue3] 无可用并发槽位，任务进入等待队列: ${sessionId}`);
      const queuedTask = this.tasksService.createTask(sessionId, {
        componentId: sessionId,
        componentName: dto.componentName,
        nodeId: dto.nodeId,
        fileKey: dto.fileKey,
        target: 'vue3',
        groupId: groupId,
        panelKey: 'default-panel',
        taskType: 'component',
        userId,
        generationTier: 'max',
        sourceType: 'figma',
        enqueuedAt: Date.now(),
        queuePriority: 0,
      }, 'queued');
      
      await this.queueService.enqueue(queuedTask, 'concurrency_full', async () => {
        await this.vue3Service.startGeneration(sessionId, dto, groupId, userId);
      });
      
      return {
        success: true,
        sessionId,
        queued: true,
        message: '当前并发任务数已满，任务已加入等待队列，将自动排队执行',
        queue: {
          reason: 'concurrency_full',
        },
      };
    }
    
    // 注册任务为运行中
    await this.queueService.registerRunning(sessionId, userId);

    // 配额充足：正常启动任务
    const task = this.tasksService.createTask(sessionId, {
      componentId: sessionId,
      componentName: dto.componentName,
      nodeId: dto.nodeId,
      fileKey: dto.fileKey,
      target: 'vue3',
      groupId: groupId,
      panelKey: 'default-panel',
      taskType: 'component',
      userId,
      generationTier: 'max',
      sourceType: 'figma',
    });

    this.vue3Service.startGeneration(sessionId, dto, groupId, userId);

    return {
      success: true,
      sessionId,
      message: 'Vue3 生成任务已开始',
    };
  }

  // ==================== Phase 3: 数据槽分析 ====================

  /**
   * 模式A：自动分析组件数据槽（纯规则匹配）
   */
  @Post('analyze-slots')
  async analyzeSlots(@Body() dto: AnalyzeSlotsDto) {
    try {
      const result = await this.slotAnalyzer.analyzeSlots(dto.componentId, dto.groupId);
      return { success: true, ...result };
    } catch (error) {
      // 🛡️ SFC 未落盘（组件刚生成完尚未 copyToWorkspace / 跨 groupId 兜底均未命中）属合法时序，
      // 降级为空 slots + 友好提示，而非 500，前端可直接渲染「暂无可绑定数据槽」。
      if (error instanceof NotFoundException) {
        this.logger.warn(`[analyzeSlots] SFC 未找到，降级为空 slots: ${error.message}`);
        return {
          success: true,
          slots: [],
          notice: '组件源码尚未落盘，接口对接将在组件生成完成后可用',
        };
      }
      this.logger.error(`[analyzeSlots] ${error.message}`);
      throw new HttpException(
        { success: false, error: error.message, slots: [] },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 模式B：需求文档智能分析（LLM 语义理解）
   */
  @Post('analyze-from-doc')
  async analyzeFromDoc(@Body() dto: AnalyzeFromDocDto) {
    try {
      const result = await this.docAnalyzer.analyzeFromDoc(dto);
      return result;
    } catch (error) {
      this.logger.error(`[analyzeFromDoc] ${error.message}`);
      throw new HttpException(
        {
          success: false,
          error: error.message,
          bindings: [],
          summary: `分析失败: ${error.message}`,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ==================== Phase 4: 绑定 + 代码注入 ====================

  /**
   * 执行 API 绑定 + 代码注入
   */
  @Post('bind-api')
  async bindApi(@Body() dto: BindApiDto) {
    try {
      const result = await this.apiBindingService.bindApi(dto);
      return result;
    } catch (error) {
      this.logger.error(`[bindApi] ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 查询组件的绑定记录
   */
  @Get('bindings')
  getBindings(@Query('componentId') componentId: string) {
    if (!componentId) {
      return { success: false, error: '缺少 componentId 参数' };
    }
    const bindings = this.apiBindingService.getBindings(componentId);
    return { success: true, bindings };
  }

  /**
   * 获取单个绑定详情
   */
  @Get('bindings/:bindingId')
  getBinding(@Param('bindingId') bindingId: string) {
    const binding = this.apiBindingService.getBinding(bindingId);
    if (!binding) {
      return { success: false, error: '绑定记录不存在' };
    }
    return { success: true, binding };
  }

  /**
   * 解绑（还原 SFC）
   */
  @Post('bindings/:bindingId/delete')
  async unbind(@Param('bindingId') bindingId: string) {
    try {
      const result = await this.apiBindingService.unbind(bindingId);
      return result;
    } catch (error) {
      this.logger.error(`[unbind] ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
