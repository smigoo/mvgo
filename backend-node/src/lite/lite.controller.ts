import {
  Controller,
  Post,
  Body,
  Param,
  Req,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
  Inject,
  UseGuards,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { join } from 'path';
import { tempComponentsDir } from '../config/backend-root';
import { LiteService } from './lite.service';
import { HtmlSplitService } from './html-split.service';
import { Phase2Service } from '../phase2/phase2.service';
import { GeneratePhase2Dto } from '../phase2/dto/generate-phase2.dto';
import { GenerateLiteDto } from './dto/generate-lite.dto';
import { SplitHtmlDto } from './dto/split-html.dto';
import { parseFigmaUrl } from '../ai-engine/utils/figma-url-parser.js';
import { TasksService, RateLimitReason } from '../tasks/tasks.service';
import { ProgressService } from '../progress/progress.service';
import { QuotaService } from '../quota/quota.service';
import { TaskQueueService } from '../queue/task-queue.service';
import { SessionGuard } from '../auth/session.guard';
import {
  LiteErrorCode,
  LITE_ERROR_MESSAGES,
  LITE_SCREENSHOT_TIER,
  LiteComponentType,
  LiteSourceType,
  LiteGenerationTier,
} from './lite.constants';

/**
 * 轻量生成控制器（Phase 4：截图/Figma → Vue3 / 微码）
 *
 * 端点：POST /lite/generate
 * 输入：JSON { imageBase64 | figmaUrl, componentName?, groupId?, componentType?, generationTier?, config?, ... }
 * 输出：{ success, sessionId, sourceType, componentType, generationTier }
 * 进度：通过全局 SSE（ProgressService）按 sessionId 推送
 *
 * 产品规则：
 * - 截图来源强制 Lite
 * - Figma 来源默认 Max，可降级为 Lite
 */
@Controller('lite')
@UseGuards(SessionGuard)
export class LiteController {
  private readonly logger = new Logger(LiteController.name);

  constructor(
    private readonly liteService: LiteService,
    private readonly htmlSplitService: HtmlSplitService,
    private readonly phase2Service: Phase2Service,
    private readonly tasksService: TasksService,
    private readonly progressService: ProgressService,
    @Optional() @Inject(QuotaService) private readonly quotaService?: QuotaService,
    @Optional() @Inject(TaskQueueService) private readonly queueService?: TaskQueueService,
  ) {}

  /**
   * POST /api/lite/retry/:sessionId
   * 从原图缓存重试 Lite 任务：读取组件目录 resources/images/source-screenshot.*，
   * 转 base64 后复用 generate 逻辑重新生成（无需用户重新上传截图）。
   */
  @Post('retry/:sessionId')
  async retryFromCache(
    @Param('sessionId') sessionId: string,
    @Body() body: { componentType?: 'vue3' | 'microcode'; config?: Record<string, any> },
    @Req() req: any,
  ) {
    try {
      const task = this.tasksService.getTask(sessionId);
      if (!task) {
        throw new HttpException('任务不存在', HttpStatus.NOT_FOUND);
      }

      // 定位原图缓存：优先任务记录的 outputPath，其次从 temp-components 推断
      let outputPath = task.outputPath;
      if (!outputPath && task.groupId) {
        outputPath = join(tempComponentsDir, task.groupId, sessionId);
      }
      if (!outputPath) {
        throw new HttpException('无法定位任务产物目录', HttpStatus.BAD_REQUEST);
      }

      // 读取原图缓存：优先正式产物区 resources/images/source-screenshot.*，
      // 其次回退 _upload/（服务重启导致 finally 未执行时原图仍在此处）
      const { readFileSync, existsSync, readdirSync } = await import('fs');
      let sourceFile: string | null = null;

      // 1️⃣ 正式缓存：resources/images/source-screenshot.*
      const imagesDir = join(outputPath, 'resources', 'images');
      if (existsSync(imagesDir)) {
        const candidates = readdirSync(imagesDir).filter((f) =>
          /^source-screenshot\.(png|jpe?g|webp)$/i.test(f),
        );
        if (candidates.length > 0) sourceFile = join(imagesDir, candidates[0]);
      }

      // 2️⃣ 兜底：_upload/screenshot.*（服务中断/重启时 finally 未执行的情况）
      if (!sourceFile) {
        const uploadDir = join(outputPath, '_upload');
        if (existsSync(uploadDir)) {
          const candidates = readdirSync(uploadDir).filter((f) =>
            /^screenshot\.(png|jpe?g|webp)$/i.test(f),
          );
          if (candidates.length > 0) {
            sourceFile = join(uploadDir, candidates[0]);
            this.logger.log(
              `📸 Lite 重试使用 _upload 兜底缓存: ${candidates[0]} (${Math.round(readFileSync(sourceFile).length / 1024)}KB)`,
            );
          }
        }
      }

      if (!sourceFile) {
        throw new HttpException(
          '未找到原图缓存（source-screenshot.* 或 _upload/screenshot.*），请在 Lite 生成页重新上传截图',
          HttpStatus.BAD_REQUEST,
        );
      }

      const buffer = readFileSync(sourceFile);
      const ext = sourceFile.split('.').pop()?.toLowerCase() || 'png';
      const mime = ext === 'jpg' ? 'jpeg' : ext;
      const imageBase64 = `data:image/${mime};base64,${buffer.toString('base64')}`;

      // 🆕 断点优先：若存在 .checkpoint/lite-state.json，直接从断点续跑（复用相同 sessionId）
      const { readFileSync: rf2, existsSync: ex2 } = await import('fs');
      const cpPath = join(outputPath, '.checkpoint', 'lite-state.json');
      if (ex2(cpPath)) {
        this.logger.log(`🔁 Lite 断点续跑: ${sessionId}`);
        const retryDto = new GenerateLiteDto();
        retryDto.componentName = task.componentName || sessionId;
        retryDto.groupId = task.groupId;
        retryDto.componentType = (body?.componentType || task.target || 'vue3') as 'vue3' | 'microcode';
        if (body?.config || task.configSnapshot) {
          retryDto.config = body?.config || task.configSnapshot;
        }

        return await this.liteService.resumeFromCheckpoint(sessionId, outputPath, retryDto);
      }

      // 无断点：全量重试（生成新 sessionId）
      const retryDto = new GenerateLiteDto();
      retryDto.imageBase64 = imageBase64;
      retryDto.componentName = task.componentName || sessionId;
      retryDto.groupId = task.groupId;
      retryDto.componentType = (body?.componentType || task.target || 'vue3') as 'vue3' | 'microcode';
      if (body?.config || task.configSnapshot) {
        retryDto.config = body?.config || task.configSnapshot;
      }

      // 复用 generate 完整流程（配额检查/队列/执行）
      return await this.generate(retryDto, req);
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      this.logger.error(`Lite 重试失败 ${sessionId}: ${e.message}`);
      throw new HttpException(
        { code: LiteErrorCode.INTERNAL_ERROR, message: `重试失败: ${e.message}` },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /api/lite/upgrade-assets/:sessionId
   * 素材升级：从原 Figma 下载 bg/img/icon 并应用到 Lite 组件对应位置
   * 仅适用于 sourceType=figma && generationTier=lite 的已完成组件
   * 可选 body: { figmaUrl? } — 历史任务未缓存 Figma 来源时需传入
   */
  @Post('upgrade-assets/:sessionId')
  async upgradeAssets(
    @Param('sessionId') sessionId: string,
    @Body() body?: { figmaUrl?: string },
  ) {
    try {
      const result = await this.liteService.upgradeAssets(sessionId, body?.figmaUrl);
      if (!result.success) {
        throw new HttpException(result.message, HttpStatus.BAD_REQUEST);
      }
      return result;
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      this.logger.error(`素材升级失败 ${sessionId}: ${e.message}`);
      throw new HttpException(
        { code: 'UPGRADE_ASSETS_FAILED', message: `素材升级失败: ${e.message}` },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /api/lite/split
   * HTML 大屏拆分：基于 DOM 分析 + 显式标记，将整页 HTML 拆分为多个独立组件，
   * 每个组件复用现有 Lite 生成链路（VisionAgent + 代码生成）。
   */
  /**
   * POST /api/lite/analyze
   * 只分析 HTML 中的组件列表，不触发任何生成。
   * 返回每个区块的 htmlContent、name、strategy，供前端选择后再生成。
   */
  @Post('analyze')
  async analyzeHtml(@Body() body: { htmlContent: string; htmlFileName?: string }) {
    if (!body?.htmlContent) {
      throw new HttpException('htmlContent 不能为空', HttpStatus.BAD_REQUEST);
    }

    const result = this.htmlSplitService.analyzeHtml({
      htmlContent: body.htmlContent,
      htmlFileName: body.htmlFileName,
    });

    if (!result.success || result.totalComponents === 0) {
      throw new HttpException(
        '未能从 HTML 中识别出组件区块。建议在 HTML 中为需要拆分的区块添加 data-component 属性作为显式标记。',
        HttpStatus.BAD_REQUEST,
      );
    }

    return result;
  }

  /**
   * POST /api/lite/generate-split
   * 根据用户选择的组件列表，逐个异步生成。
   * 每个选中项可单独指定 componentType（vue3 / microcode）。
   */
  @Post('generate-split')
  async generateSplit(
    @Body()
    body: {
      htmlContent: string;
      htmlFileName?: string;
      groupId?: string;
      config?: Record<string, any>;
      selections: Array<{
        index: number;
        componentType: 'vue3' | 'microcode';
        componentName?: string;
      }>;
    },
    @Req() req: any,
  ) {
    if (!body?.htmlContent) {
      throw new HttpException('htmlContent 不能为空', HttpStatus.BAD_REQUEST);
    }
    if (!body.selections || body.selections.length === 0) {
      throw new HttpException('至少选择一个组件', HttpStatus.BAD_REQUEST);
    }

    const userId = req.session?.userId;
    const result = await this.htmlSplitService.generateSelectedComponents({
      htmlContent: body.htmlContent,
      htmlFileName: body.htmlFileName,
      groupId: await this.liteService.resolvePrivateGroupId(body.groupId, userId),
      config: body.config,
      userId,
      selections: body.selections,
    });

    return result;
  }

  @Post('generate')
  async generate(@Body() dto: GenerateLiteDto, @Req() req: any) {
    if (!dto) {
      throw new HttpException('请求体不能为空', HttpStatus.BAD_REQUEST);
    }

    // imageBase64、figmaUrl、htmlContent 三选一
    const hasImage = !!dto.imageBase64 && dto.imageBase64.trim().length > 0;
    const hasFigma = !!dto.figmaUrl && dto.figmaUrl.trim().length > 0;
    const hasHtml = !!dto.htmlContent && dto.htmlContent.trim().length > 0;
    const inputCount = [hasImage, hasFigma, hasHtml].filter(Boolean).length;
    if (inputCount !== 1) {
      throw new HttpException(
        '输入数据必须且只能提供一种：imageBase64（截图）、figmaUrl（Figma 链接）或 htmlContent（HTML 文件）',
        HttpStatus.BAD_REQUEST,
      );
    }

    const userId = req.session?.userId;

    // 组件类型校验
    const componentType: LiteComponentType = dto.componentType || 'vue3';
    if (componentType !== 'vue3' && componentType !== 'microcode') {
      throw new HttpException(
        `不支持的组件类型: ${componentType}，仅支持 vue3 或 microcode`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // 动态判断 sourceType 和 generationTier
    const sourceType: LiteSourceType = hasFigma ? 'figma' : hasHtml ? 'html' : 'screenshot';
    let generationTier: LiteGenerationTier;
    if (dto.generationTier) {
      generationTier = dto.generationTier;
    } else {
      // 产品规则：截图/HTML → 强制 Lite；Figma → 默认 Max
      generationTier = sourceType === 'figma' ? 'max' : 'lite';
    }

    if (sourceType !== 'figma') {
      generationTier = LITE_SCREENSHOT_TIER;
    }

    const groupId = await this.liteService.resolvePrivateGroupId(dto.groupId, userId);
    // sessionId 编码规则：{类型前缀}-{档位}-{时间戳}-{随机hex}
    // mc = microcode, mv = vue3; lite = 布局还原, max = Phase2 完整生成
    const typePrefix = componentType === 'microcode' ? 'mc' : 'mv';
    const tierSuffix = generationTier === 'lite' ? 'lite' : 'max';
    const sessionId = `${typePrefix}-${tierSuffix}-${Date.now()}-${randomBytes(4).toString('hex')}`;

    if (generationTier === 'max') {
      const parsed = parseFigmaUrl(dto.figmaUrl!);
      if (!parsed.fileKey || !parsed.nodeId) {
        throw new HttpException(
          'Max 完整生成需要包含 node-id 的有效 Figma 链接',
          HttpStatus.BAD_REQUEST,
        );
      }

      const phase2Dto = new GeneratePhase2Dto();
      phase2Dto.componentName = dto.componentName || sessionId;
      phase2Dto.componentId = sessionId;
      phase2Dto.fileKey = parsed.fileKey;
      phase2Dto.nodeId = parsed.nodeId;
      phase2Dto.groupId = groupId;
      phase2Dto.target = componentType;
      phase2Dto.requirementDoc = dto.requirementDoc;
      phase2Dto.previewToken = dto.previewToken;
      phase2Dto.config = dto.config as GeneratePhase2Dto['config'];

      // Phase 7：队列门控 —— Max 也要经过并发检查
      this.tasksService.createTask(
        sessionId,
        {
          componentId: sessionId,
          componentName: dto.componentName || sessionId,
          target: componentType,
          groupId,
          panelKey: dto.panelType || 'default-panel',
          taskType: 'component',
          userId,
          generationTier: 'max',
          sourceType: 'figma',
          outputPath: join(tempComponentsDir, groupId, sessionId),
        },
        'queued',
      );

      // 构建执行函数（供队列调度或直接执行）
      //
      // ⚠️ 关键约束：Phase2Service.startGeneration() 是 fire-and-forget —— 它内部调用
      // this.executeGeneration(...) 时并没有 await，函数会在毫秒级返回，此时生成才刚开始。
      // 因此这里绝对不能在 startGeneration 返回后调用 markTaskCompleted 释放槽位，
      // 否则 runningTasks 会被瞬间清空，getAvailableSlots() 恒等于 MAX_CONCURRENT，
      // 队列门控形同虚设（表现为：提交再多任务也全是「运行中」，永远不排队）。
      //
      // 正确做法：与 phase2.controller 保持一致，真正的终态释放交给
      // ProgressService.sendComplete / sendError 统一处理（见 progress.service.ts）。
      const executeMaxGeneration = async () => {
        try {
          this.tasksService.updateTask(sessionId, { status: 'running' });

          await this.phase2Service.startGeneration(
            sessionId,
            phase2Dto,
            groupId,
            userId,
          );
          // Phase2Service.startGeneration 内部会用自己的 metadata 再次 createTask（整体覆盖），
          // 会把外层写入的档位/来源字段冲掉，这里补回，保证任务卡片仍显示 Max / Figma。
          // 时序安全：createTask 在 startGeneration 中是同步执行完的，await 返回时已生效。
          this.tasksService.updateTask(sessionId, {
            generationTier: 'max',
            sourceType: 'figma',
          });
          // 此处不释放槽位：生成仍在后台进行中
        } catch (err) {
          // 仅「启动阶段同步异常」才走到这里（如 Figma 参数校验失败）
          this.logger.error(`Max 任务启动失败 ${sessionId}: ${err?.message}`);
          const task = this.tasksService.getTask(sessionId);
          if (task?.status !== 'failed' && task?.status !== 'cancelled') {
            // sendError 内部已经会 markTaskFailed 释放槽位，不要重复释放
            await this.progressService.sendError(sessionId, {
              code: 'INTERNAL_ERROR',
              message: err?.message || 'Max 生成失败',
            });
          } else if (this.queueService) {
            await this.queueService.markTaskFailed(sessionId);
          }
        }
      };

      // 检查并发槽位
      if (this.queueService && this.queueService.getAvailableSlots() <= 0) {
        // 并发已满，入队等待
        const enqueueResult = await this.queueService.enqueue(
          {
            sessionId,
            componentId: sessionId,
            componentName: dto.componentName || sessionId,
            target: componentType,
            groupId,
            userId,
          },
          'concurrency_full',
          executeMaxGeneration,
        );

        return {
          success: true,
          sessionId,
          sourceType,
          componentType,
          generationTier,
          queued: true,
          queuePosition: enqueueResult.queuePosition,
          message: `并发已满，任务已加入等待队列（位置: ${enqueueResult.queuePosition}）`,
        };
      }

      // 有空槽位，直接执行
      if (this.queueService) {
        this.queueService.registerRunning(sessionId);
      }
      // 异步执行，不阻塞返回
      executeMaxGeneration();

      return {
        success: true,
        sessionId,
        sourceType,
        componentType,
        generationTier,
        queued: false,
        message: 'Max 完整生成任务已进入 Phase2 管线',
      };
    }

    // Phase 7：配额预检（仅在配额服务可用时）
    let rateLimitReason: RateLimitReason | undefined;
    let quotaInfo: { quotaResetAt?: number; waitMinutes?: number; message?: string } = {};

    if (this.quotaService && userId) {
      const quotaStatus = await this.quotaService.checkQuotaStatus(userId);
      if (!quotaStatus.allowed) {
        // 根据 QuotaService 的 reason 映射到 Phase 7 的 RateLimitReason
        rateLimitReason = quotaStatus.reason === 'QUOTA_HOURLY_EXCEEDED'
          ? 'USER_HOURLY_QUOTA'
          : 'USER_DAILY_QUOTA';
        quotaInfo = {
          quotaResetAt: quotaStatus.quotaResetAt,
          waitMinutes: quotaStatus.waitMinutes,
          message: quotaStatus.message,
        };
      }
    }

    // Phase 7：创建任务，初始状态为 queued（等待调度）
    this.tasksService.createTask(
      sessionId,
      {
        componentId: sessionId,
        componentName: dto.componentName || sessionId,
        target: componentType,
        groupId,
        panelKey: dto.panelType || 'default-panel',
        taskType: 'component',
        userId,
        rateLimitReason,
        // 🆕 生成档位与输入来源（任务列表/详情/监控展示用）
        generationTier,
        sourceType,
        // Figma 来源可提前从 dto 获取设计画布逻辑尺寸；
        // 截图/HTML 来源由 lite.service.ts 在 precheck 后写入 figmaDimensions。
        ...(sourceType === 'figma' && dto.previewWidth && dto.previewHeight
          ? {
              figmaDimensions: {
                width: Math.round(dto.previewWidth),
                height: Math.round(dto.previewHeight),
              },
            }
          : {}),
        // 🆕 记录产物输出目录（恢复/重试定位原图缓存用）
        outputPath: join(tempComponentsDir, groupId, sessionId),
      },
      'queued',
    );

    // 构建执行函数（供队列调度或直接执行）
    const executeGeneration = async () => {
      try {
        // 更新状态为运行中
        this.tasksService.updateTask(sessionId, { status: 'running' });

        const result = await this.liteService.startGeneration(sessionId, dto, groupId, userId, {
          sourceType,
          componentType,
          generationTier,
        });

        // startGeneration 返回 false 表示生成失败（内部已发 SSE error），不再记录配额
        if (result === false) {
          if (this.queueService) {
            await this.queueService.markTaskFailed(sessionId);
          }
          return;
        }

        // 成功后记录配额（Phase 7）
        if (this.quotaService && userId) {
          await this.quotaService.recordSuccess(userId, sessionId);
        }

        // 释放队列槽位（Phase 7）
        if (this.queueService) {
          await this.queueService.markTaskCompleted(sessionId);
        }
      } catch (err) {
        this.logger.error(`Lite 任务失败 ${sessionId}: ${err?.message}`);
        // 只有 service 没有自行发送 error 时才由控制器发送（避免重复）
        const task = this.tasksService.getTask(sessionId);
        if (task?.status !== 'failed' && task?.status !== 'cancelled') {
          this.progressService.sendError(sessionId, {
            code: LiteErrorCode.INTERNAL_ERROR,
            message:
              err?.message || LITE_ERROR_MESSAGES[LiteErrorCode.INTERNAL_ERROR],
          });
        }

        // 释放队列槽位（Phase 7）
        if (this.queueService) {
          await this.queueService.markTaskFailed(sessionId);
        }
      }
    };

    // Phase 7：根据配额和队列状态决定执行策略
    if (rateLimitReason) {
      // 配额不足，入队等待
      if (this.queueService) {
        const enqueueResult = await this.queueService.enqueue(
          {
            sessionId,
            componentId: sessionId,
            componentName: dto.componentName || sessionId,
            target: componentType,
            groupId,
            userId,
          },
          'quota_exceeded',
          executeGeneration,
        );

        return {
          success: true,
          sessionId,
          sourceType,
          componentType,
          generationTier,
          queued: true,
          queuePosition: enqueueResult.queuePosition,
          rateLimitReason,
          quotaResetAt: quotaInfo.quotaResetAt,
          waitMinutes: quotaInfo.waitMinutes,
          message: quotaInfo.message || '任务已加入等待队列',
        };
      } else {
        // 无队列服务，直接返回限流错误
        throw new HttpException(
          {
            code: rateLimitReason,
            message: quotaInfo.message,
            quotaResetAt: quotaInfo.quotaResetAt,
            waitMinutes: quotaInfo.waitMinutes,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // 配额充足，检查队列槽位
    if (this.queueService) {
      const availableSlots = this.queueService.getAvailableSlots();

      if (availableSlots > 0) {
        // 有槽位，直接执行
        this.queueService.registerRunning(sessionId);
        this.tasksService.updateTask(sessionId, { status: 'running' });

        // 异步执行
        executeGeneration().catch(() => {
          /* catch 已在 executeGeneration 内处理 */
        });

        return {
          success: true,
          sessionId,
          sourceType,
          componentType,
          generationTier,
          queued: false,
          message: hasFigma
            ? 'Figma 组件生成任务已开始'
            : hasHtml
              ? 'HTML 组件生成任务已开始'
              : 'Lite 生成任务已开始',
        };
      } else {
        // 无槽位，入队等待（平台并发限制）
        const enqueueResult = await this.queueService.enqueue(
          {
            sessionId,
            componentId: sessionId,
            componentName: dto.componentName || sessionId,
            target: componentType,
            groupId,
            userId,
          },
          'concurrency_full',
          executeGeneration,
        );

        // 更新 rateLimitReason 为平台队列
        this.tasksService.updateTask(sessionId, {
          rateLimitReason: 'PLATFORM_QUEUE',
        });

        return {
          success: true,
          sessionId,
          sourceType,
          componentType,
          generationTier,
          queued: true,
          queuePosition: enqueueResult.queuePosition,
          rateLimitReason: 'PLATFORM_QUEUE',
          message: enqueueResult.message,
        };
      }
    }

    // 无队列服务，直接执行（向后兼容）
    this.tasksService.updateTask(sessionId, { status: 'running' });
    executeGeneration().catch(() => {
      /* catch 已在 executeGeneration 内处理 */
    });

    return {
      success: true,
      sessionId,
      sourceType,
      componentType,
      generationTier,
      queued: false,
      message: hasFigma
        ? 'Figma 组件生成任务已开始'
        : hasHtml
          ? 'HTML 组件生成任务已开始'
          : 'Lite 生成任务已开始',
    };
  }
}
