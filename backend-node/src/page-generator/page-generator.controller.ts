import { Controller, Post, Body, HttpStatus, HttpException, Req, Logger, Param } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PageGeneratorService } from './page-generator.service';
import { GeneratePageDto } from './dto/generate-page.dto';

@Controller('page-generator')
export class PageGeneratorController {
  private readonly logger = new Logger(PageGeneratorController.name);

  constructor(private readonly pageGeneratorService: PageGeneratorService) {}

  @Post('generate')
  async generate(@Body() dto: GeneratePageDto, @Req() req: any) {
    const { fileKey, nodeId, groupId, executionMode, concurrency } = dto;

    if (!fileKey || !nodeId) {
      throw new HttpException('参数不完整: fileKey 和 nodeId 必须提供', HttpStatus.BAD_REQUEST);
    }

    // 创建页面级 sessionId
    const sessionId = `page-${Date.now()}-${randomBytes(4).toString('hex')}`;

    // 尝试从 session 获取 userId
    const userId = req.session?.userId;

    this.logger.log(
      `页面生成任务启动: sessionId=${sessionId}, mode=${executionMode || 'parallel'}, concurrency=${concurrency || 2}`,
    );

    // 启动异步生成任务
    this.pageGeneratorService.startPageGeneration(sessionId, dto, groupId, userId);

    return {
      success: true,
      sessionId,
      executionMode: executionMode || 'parallel',
      concurrency: concurrency || 2,
      message: '页面级生成任务已启动',
    };
  }

  @Post('analyze')
  async analyze(@Body() dto: GeneratePageDto) {
    const { fileKey, nodeId } = dto;

    if (!fileKey || !nodeId) {
      throw new HttpException('参数不完整: fileKey 和 nodeId 必须提供', HttpStatus.BAD_REQUEST);
    }

    // 只分析页面结构，不生成
    try {
      const components = await this.pageGeneratorService.analyzePage(fileKey, nodeId, dto.config);
      return {
        success: true,
        components,
        total: components.length,
      };
    } catch (error: any) {
      // 透传 Figma 真实错误（鉴权失败 / 节点不存在 / 无权限等），转为可读的 4xx 而非通用 500
      const figStatus = error?.figStatus ?? error?.response?.status;
      const figMsg =
        error?.response?.data?.message ||
        error?.response?.data?.err ||
        error?.message;
      const detail = figStatus
        ? figMsg
        : `页面分析失败：${figMsg}`;
      const httpStatus =
        figStatus === 401 || figStatus === 403
          ? HttpStatus.FORBIDDEN
          : figStatus
            ? HttpStatus.BAD_REQUEST
            : HttpStatus.INTERNAL_SERVER_ERROR;
      throw new HttpException(
        { success: false, message: detail, figmaStatus: figStatus ?? null },
        httpStatus,
      );
    }
  }

  /**
   * 🆕 POST /api/page-generator/retry/:sessionId
   * 断点续跑：重新配置后重试失败任务
   * Body: { config?: { model?, endpoint?, apiKey? } }
   */
  @Post('retry/:sessionId')
  async retryGeneration(
    @Param('sessionId') sessionId: string,
    @Body() body: { config?: { model?: string; endpoint?: string; apiKey?: string } },
    @Req() req: any,
  ) {
    if (!sessionId) {
      throw new HttpException('参数不完整: sessionId 必须提供', HttpStatus.BAD_REQUEST);
    }

    const userId = req.session?.userId;
    this.logger.log(`断点续跑请求: originalSessionId=${sessionId}, hasConfig=${!!body.config}`);

    try {
      const result = await this.pageGeneratorService.retryGeneration(sessionId, body.config, userId);
      return result;
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
