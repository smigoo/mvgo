import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpStatus,
  HttpException,
  Req,
  Res,
  Logger,
  OnModuleInit,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { randomBytes } from 'crypto';
import { join } from 'path';
import { existsSync } from 'fs';
import { Phase2Service } from './phase2.service';
import { ComponentService } from '../component/component.service';
import { DocAnalyzerService } from './doc/doc-analyzer.service.js';
import type { AnalyzeDocDto } from './doc/doc-analyzer.service.js';
import { GeneratePhase2Dto } from './dto/generate-phase2.dto';
import { QuotaService } from '../quota/quota.service';
import { TaskQueueService } from '../queue/task-queue.service';
import { TasksService } from '../tasks/tasks.service';
import type { Task } from '../tasks/tasks.service';
import { SessionGuard } from '../auth/session.guard';
import { backendRoot } from '../config/backend-root';

@Controller('phase2')
@UseGuards(SessionGuard)
export class Phase2Controller implements OnModuleInit {
  private readonly logger = new Logger(Phase2Controller.name);

  constructor(
    private readonly phase2Service: Phase2Service,
    private readonly componentService: ComponentService,
    private readonly docAnalyzerService: DocAnalyzerService,
    private readonly quotaService: QuotaService,
    private readonly queueService: TaskQueueService,
    private readonly tasksService: TasksService,
  ) {}

  /**
   * Figma 预览图获取（生成前确认）
   * POST /phase2/figma-preview
   */
  @Post('figma-preview')
  async getFigmaPreview(@Body() body: { figmaUrl: string; figmaToken?: string; config?: any }) {
    try {
      const result = await this.phase2Service.getFigmaPreview(body.figmaUrl, body.figmaToken, body.config);
      return result;
    } catch (err: any) {
      this.logger.error(`figma-preview 失败: ${err.message}`);
      throw new HttpException({ success: false, error: err.message }, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * 预览图读取（供前端 <img src> 加载；raw=1 走 SessionGuard 静态资源放行，免登录不裂图）
   * GET /phase2/preview-image/:token
   */
  @Get('preview-image/:token')
  async getPreviewImage(@Param('token') token: string, @Res() res: Response) {
    // UUID 格式校验，防路径穿越（../../etc/passwd 之类）
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token || '')) {
      throw new HttpException('无效的预览 token', HttpStatus.BAD_REQUEST);
    }
    const filePath = join(backendRoot, 'temp-preview-images', `${token}.png`);
    if (!existsSync(filePath)) {
      throw new HttpException('预览图不存在或已过期', HttpStatus.NOT_FOUND);
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(filePath);
  }

  /**
   * 服务启动时注册「恢复执行器」（处理 microcode 任务）：
   * 服务重启后，磁盘上残留的 queued 任务由 TasksService 调 restoreQueuedTask 恢复入队，
   * 调度时通过此执行器按任务记录重建 dto 并重新启动生成。
   * 多个执行器可共存（Vue3Controller 也会注册），执行器返回 true 表示已处理。
   */
  onModuleInit(): void {
    this.queueService.registerRestoreExecutor(async (task: Task): Promise<boolean> => {
      if (task.target === 'vue3') return false; // vue3 由 Vue3Controller 的执行器处理
      // 🐛 修复：lite 档位任务（generationTier='lite' 或来源非 figma）不应由 phase2 恢复，
      // 否则会用空 fileKey/nodeId 调 Figma API 404（"Figma 数据获取失败"）。
      // lite 任务的恢复需要原始截图/HTML 输入（未持久化），此处返回 false 交由队列标记失败，
      // 至少不会误入 max 管线造成晦涩的 404。
      if (task.generationTier === 'lite' || (task.sourceType && task.sourceType !== 'figma')) {
        this.logger.warn(
          `跳过 lite 任务恢复（不应走 phase2）: ${task.sessionId} (tier=${task.generationTier}, source=${task.sourceType})`,
        );
        return false;
      }
      // 🐛 修复：fileKey/nodeId 为空的脏数据恢复后走 Figma 会 404 失败，
      // 失败路径槽位释放不可靠 → 幽灵槽位占满并发、新任务永久排队。
      if (!task.fileKey || !task.nodeId) {
        this.logger.warn(
          `跳过 microcode 任务恢复（fileKey/nodeId 为空）: ${task.sessionId} (fileKey=${task.fileKey}, nodeId=${task.nodeId})`,
        );
        return false;
      }
      try {
        const dto = new GeneratePhase2Dto();
        dto.componentName = task.componentName || task.sessionId;
        dto.componentId = task.componentId || task.sessionId;
        dto.nodeId = task.nodeId;
        dto.fileKey = task.fileKey;
        dto.groupId = task.groupId || '';
        dto.panelType = task.panelKey || 'default-panel';
        dto.target = 'microcode';
        if (task.configSnapshot) {
          dto.config = {
            outputPath: task.configSnapshot.outputPath,
            ...task.configSnapshot,
          };
        }
        await this.phase2Service.startGeneration(
          task.sessionId,
          dto,
          task.groupId || '',
          task.userId,
        );
        return true;
      } catch (error) {
        this.logger.error(`恢复 microcode 任务失败: ${task.sessionId}`, error);
        return false;
      }
    });
  }

  /**
   * 文档分析端点（S6）
   * 输入需求文档 → D0/D1 确定性 + D2 LLM(可选) → 六维 doc-analysis
   */
  @Post('analyze-doc')
  async analyzeDoc(@Body() dto: AnalyzeDocDto) {
    try {
      return await this.docAnalyzerService.analyzeDocument(dto);
    } catch (error) {
      this.logger.error(`文档分析失败: ${error.message}`, error.stack);
      throw new HttpException(
        `文档分析失败: ${error.message}`,
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 路径B 端点（S15）：存量组件补文档再生成
   * UI 缓存短路 figma/visual → 带文档重跑 engineer → 新目录输出（旧版保留供对比）
   */
  @Post('regenerate-with-doc')
  async regenerateWithDoc(@Body() dto: any, @Req() req: any) {
    const { componentId, groupId, requirementDoc, docAnalysis, config, panelType } = dto || {};
    if (!componentId || !groupId || !requirementDoc) {
      throw new HttpException('参数不完整（componentId/groupId/requirementDoc 必填）', HttpStatus.BAD_REQUEST);
    }
    const sessionId = `mc-doc-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const userId = req.session?.userId;
    try {
      // 🔴 必须 await：预检（组件目录/UI缓存/文档分析）在此完成，失败立即返回 400
      // 不 await 会导致预检抛错成为 unhandled rejection 直接崩掉服务（S15 fail 教训）
      await this.phase2Service.regenerateWithDoc(sessionId, {
        componentId,
        groupId,
        requirementDoc,
        docAnalysis,
        config: config || {},
        userId,
        panelType,
      });
      return { success: true, sessionId, message: '路径B 文档纠偏再生成已开始' };
    } catch (error) {
      this.logger.error(`路径B 发起失败: ${error.message}`, error.stack);
      throw new HttpException(
        `路径B 发起失败: ${error.message}`,
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }


  /**
   * 人工精修端点：生成完成（写完即停）后，用户可手动触发定向精修（布局/样式/两者）
   * POST /phase2/refine
   * body: { componentId, refineType?: 'layout' | 'style' | 'both' }
   */
  @Post('refine')
  async refine(@Body() body: { componentId: string; refineType?: string }, @Req() req: any) {
    const { componentId, refineType = 'both' } = body || {};
    if (!componentId) {
      throw new HttpException('componentId 必填', HttpStatus.BAD_REQUEST);
    }
    if (!['layout', 'style', 'both'].includes(refineType)) {
      throw new HttpException('refineType 仅支持 layout / style / both', HttpStatus.BAD_REQUEST);
    }
    const userId = req.session?.userId;
    const sessionId = `mc-refine-${Date.now()}-${randomBytes(4).toString('hex')}`;
    try {
      // 🔴 必须 await：预检（产物/checkpoint 存在性）在此完成，失败立即返回 400
      await this.phase2Service.refineComponent(sessionId, { componentId, refineType, userId });
      return { success: true, sessionId, message: '精修已开始' };
    } catch (error: any) {
      this.logger.error(`精修发起失败: ${error.message}`, error.stack);
      throw new HttpException(
        `精修发起失败: ${error.message}`,
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }


  /**
   * 获取当前用户的配额使用情况
   */
  @Get('quota')
  async getQuota(@Req() req: any) {
    const userId = req.session?.userId;
    if (!userId) {
      return {
        success: false,
        error: '未登录',
      };
    }

    const quota = await this.quotaService.getQuotaStatus(userId);
    return {
      success: true,
      data: quota,
    };
  }

  @Post('generate')
  async generate(@Body() dto: GeneratePhase2Dto, @Req() req: any) {
    const { fileKey, nodeId, groupId } = dto;

    if (!fileKey || !nodeId) {
      throw new HttpException('参数不完整', HttpStatus.BAD_REQUEST);
    }

    // 尝试从session获取userId（可选，用于保存组件记录）
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

    // 加 4 字节随机后缀，避免不同用户同一毫秒生成时时间戳碰撞导致 id 重复
    // 微码组件 mc- 前缀，Vue3 组件 mv- 前缀，便于从 ID 直观区分类型
    const idPrefix = dto.target === 'vue3' ? 'mv' : 'mc';
    const sessionId = `${idPrefix}-${Date.now()}-${randomBytes(4).toString('hex')}`;

    // 如果没有提供componentName，使用sessionId作为组件名称
    if (!dto.componentName) {
      dto.componentName = sessionId;
    }

    // 🔍 调试日志：查看session内容
    this.logger.debug(
      `[DEBUG] Session keys: ${req.session ? Object.keys(req.session).join(', ') : 'NO SESSION'}`,
    );
    this.logger.debug(`[DEBUG] userId from session: ${userId}`);
    this.logger.debug(`[DEBUG] groupId from DTO: ${groupId}`);

    // 配额不足：创建 queued 任务记录
    if (enqueueResult?.queued) {
      const queuedTask = this.tasksService.createTask(sessionId, {
        componentId: sessionId,
        componentName: dto.componentName,
        nodeId: dto.nodeId,
        fileKey: dto.fileKey,
        target: dto.target || 'microcode',
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
        await this.phase2Service.startGeneration(sessionId, dto, groupId, userId);
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

    // 检查并发槽位：如果已满，加入等待队列
    if (this.queueService.getRunningCount(userId) >= this.queueService.MAX_CONCURRENT) {
      this.logger.log(`并发槽位已满 (${this.queueService.getRunningCount(userId)}/${this.queueService.MAX_CONCURRENT})，任务加入等待队列`);
      
      const queuedTask = this.tasksService.createTask(sessionId, {
        componentId: sessionId,
        componentName: dto.componentName,
        nodeId: dto.nodeId,
        fileKey: dto.fileKey,
        target: dto.target || 'microcode',
        groupId: groupId,
        panelKey: 'default-panel',
        taskType: 'component',
        userId,
        generationTier: 'max',
        sourceType: 'figma',
        enqueuedAt: Date.now(),
        queuePriority: 0,
      }, 'queued');
      
      const queueResult = await this.queueService.enqueue(queuedTask, 'concurrency_full', async () => {
        await this.phase2Service.startGeneration(sessionId, dto, groupId, userId);
      });
      
      return {
        success: true,
        sessionId,
        queued: true,
        message: queueResult.message,
        queue: {
          position: queueResult.queuePosition,
          runningCount: this.queueService.getRunningCount(userId),
          maxConcurrent: this.queueService.MAX_CONCURRENT,
        },
      };
    }

    // 配额充足且有空闲槽位：正常启动任务
    const task = this.tasksService.createTask(sessionId, {
      componentId: sessionId,
      componentName: dto.componentName,
      nodeId: dto.nodeId,
      fileKey: dto.fileKey,
      target: dto.target || 'microcode',
      groupId: groupId,
      panelKey: 'default-panel',
      taskType: 'component',
      userId,
      generationTier: 'max',
      sourceType: 'figma',
    });

    // 注册为运行中
    this.queueService.registerRunning(sessionId, userId);

    // 启动异步生成任务，传入groupId和userId
    this.phase2Service.startGeneration(sessionId, dto, groupId, userId);

    return {
      success: true,
      sessionId,
      message: 'Phase 2 生成任务已开始',
      queue: {
        runningCount: this.queueService.getRunningCount(userId),
        maxConcurrent: this.queueService.MAX_CONCURRENT,
        availableSlots: this.queueService.getAvailableSlots(userId),
      },
    };
  }

  @Get('download/:componentId')
  async downloadComponent(
    @Param('componentId') componentId: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        throw new HttpException('未登录', HttpStatus.UNAUTHORIZED);
      }
      const authorized = await this.componentService.authorizeWorkspaceComponent(
        componentId,
        userId,
        'read',
      );
      const zipBuffer = await this.phase2Service.packageComponent(
        authorized.componentId,
        authorized.target,
        authorized.groupId,
      );

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${authorized.componentId}.zip"`,
      );

      res.send(zipBuffer);
    } catch (error) {
      this.logger.error(`下载组件失败: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `下载组件失败: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
