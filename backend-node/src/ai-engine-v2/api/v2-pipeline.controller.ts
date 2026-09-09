import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { SessionGuard } from '../../auth/session.guard';
import { ProgressService } from '../../progress/progress.service';
import { TasksService } from '../../tasks/tasks.service';
import { DevOnlyGuard } from './dev-only.guard';
import { GenerateV2Dto, PreviewV2Dto } from './dto/v2-pipeline.dto';
import { V2PipelineService } from './v2-pipeline.service';

/**
 * v2 可配管线控制器（dev 专用）
 *
 * 端点（全部挂在 /api/v2/pipeline 下）：
 *   GET  catalog   配置页元数据：规范清单 / 档位清单 / 可换模型的节点
 *   GET  health    引擎自检：规范文档完整性 + 各档位凭证可用性
 *   POST preview   执行前预览：节点序列、模型表、LLM 次数（不调 LLM）
 *   POST generate  异步生成，返回 sessionId；进度走全局 SSE /api/progress/:sessionId
 *
 * 与旧接口的关系：完全并行，不复用也不影响 /api/lite 与 /api/phase2 的任何链路。
 *
 * 守卫策略：
 *   DevOnlyGuard 覆盖全部端点 —— 生产环境统一 404。
 *   SessionGuard 只加在 generate 上 —— 它会真实消耗模型额度并需要 userId 取用户配置；
 *   catalog/preview/health 是无副作用的元数据查询，免登录以便配置页首屏与 curl 自检。
 */
@Controller('v2/pipeline')
@UseGuards(DevOnlyGuard)
export class V2PipelineController {
  private readonly logger = new Logger(V2PipelineController.name);

  constructor(
    private readonly service: V2PipelineService,
    private readonly tasksService: TasksService,
    private readonly progressService: ProgressService,
  ) {}

  @Get('catalog')
  async catalog() {
    try {
      return { success: true, ...(await this.service.getCatalog()) };
    } catch (e: any) {
      throw new HttpException(
        { code: 'CATALOG_FAILED', message: e.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('health')
  async health(@Req() req: any) {
    try {
      return { success: true, ...(await this.service.health(req.session?.userId)) };
    } catch (e: any) {
      throw new HttpException(
        { code: 'HEALTH_FAILED', message: e.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('preview')
  async preview(@Body() dto: PreviewV2Dto, @Req() req: any) {
    try {
      return { success: true, preview: await this.service.preview(dto, req.session?.userId) };
    } catch (e: any) {
      // 未知规范 / 未知档位 / 拓扑不连通等配置错误都属于用户输入问题，
      // 引擎的报错信息已带「可用值列表」，原样透出比包装成通用错误更有用
      throw new HttpException(
        { code: 'INVALID_PIPELINE_CONFIG', message: e.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('generate')
  @UseGuards(SessionGuard)
  async generate(@Body() dto: GenerateV2Dto, @Req() req: any) {
    const userId = req.session?.userId;
    // 🆕 暂无分组概念时，按用户 uid 落到私人组（与 Lite/Phase2/Vue3 一致）
    const groupId = await this.service.resolveGroupId(dto.groupId, userId);
    const sourceType = dto.sourceType || 'screenshot';

    // 先做一次 preview：非法规范/档位、凭证缺失在启动任务前就拦掉，
    // 避免建了任务卡片再失败，前端出现「一闪而过的失败任务」
    let preview: any;
    try {
      preview = await this.service.preview(dto, userId);
    } catch (e: any) {
      throw new HttpException(
        { code: 'INVALID_PIPELINE_CONFIG', message: e.message },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!preview.credentialsOk) {
      const hints = preview.missingCredentials
        .map((m: any) => `${m.channel}.${m.field}（${m.hint}）`)
        .join('；');
      throw new HttpException(
        { code: 'MISSING_CREDENTIALS', message: `凭证缺失，无法生成：${hints}` },
        HttpStatus.BAD_REQUEST,
      );
    }

    const specTag = (dto.spec || 'microcode').replace(/[^a-z0-9]+/gi, '').slice(0, 8) || 'spec';
    const sessionId = `v2-${specTag}-${dto.tier || 'lite'}-${Date.now()}-${randomBytes(3).toString('hex')}`;

    this.tasksService.createTask(
      sessionId,
      this.service.buildTaskMetadata(sessionId, dto, groupId, userId),
      'running',
    );

    // fire-and-forget：真实终态由 service 内的 sendComplete / sendError 落地
    this.service
      .runGeneration(sessionId, dto, groupId, userId)
      .catch((e: any) => this.logger.error(`[v2] 任务 ${sessionId} 结束于异常: ${e.message}`));

    return {
      success: true,
      sessionId,
      spec: preview.spec,
      tier: preview.tier,
      sourceType,
      llmCallCount: preview.llmCallCount,
      steps: preview.steps,
      progressUrl: `/api/progress/${sessionId}`,
      message: 'v2 可配管线任务已启动',
    };
  }

  @Post('specs/upload')
  async uploadSpec(@Body() specDef: Record<string, any>) {
    try {
      const result = await this.service.uploadSpec(specDef);
      return { success: true, ...result, message: `自定义规范 "${result.id}" 已上传` };
    } catch (e: any) {
      throw new HttpException(
        { code: 'SPEC_UPLOAD_FAILED', message: e.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
