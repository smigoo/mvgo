import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Res,
  HttpException,
  HttpStatus,
  Logger,
  Req,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { DemoService } from './demo.service';
import { SessionGuard } from '../auth/session.guard';

@UseGuards(SessionGuard)
@Controller('demo')
export class DemoController {
  private readonly logger = new Logger(DemoController.name);

  constructor(private readonly demoService: DemoService) {}

  /**
   * AI 对话式修改组件代码
   * POST /api/demo/ai-chat
   */
  @Post('ai-chat')
  async aiChat(
    @Body()
    body: {
      message: string;
      componentId: string;
      selectedFiles?: any[];
      attachments?: any[];
      history?: any[];
    },
  ) {
    if (!body.message || !body.componentId) {
      throw new HttpException('message 和 componentId 为必填', HttpStatus.BAD_REQUEST);
    }
    try {
      const result = await this.demoService.aiChat(body);
      return result;
    } catch (error) {
      this.logger.error(`AI 对话失败: ${error.message}`, error.stack);
      throw new HttpException(
        `AI 对话失败: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * AI 修复预览渲染错误
   * POST /api/demo/ai-fix-render-error
   */
  @Post('ai-fix-render-error')
  @HttpCode(200)
  async aiFixRenderError(
    @Body()
    body: {
      componentId: string;
      groupId?: string;
      errorMessage: string;
      stack?: string;
      info?: string;
      llmConfig?: { apiKey?: string; baseURL?: string; model?: string };
    },
  ) {
    if (!body.componentId || !body.errorMessage) {
      throw new HttpException('componentId 和 errorMessage 为必填', HttpStatus.BAD_REQUEST);
    }

    try {
      return await this.demoService.aiFixRenderError(body);
    } catch (error) {
      this.logger.error(`AI 修复渲染错误失败: ${error.message}`, error.stack);
      throw new HttpException(
        `AI 修复渲染错误失败: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * AI 对话式修改组件代码（SSE 流式）
   * POST /api/demo/ai-chat/stream
   */
  @Post('ai-chat/stream')
  @HttpCode(200)
  async aiChatStream(
    @Body()
    body: {
      message: string;
      componentId: string;
      selectedFiles?: any[];
      attachments?: any[];
      history?: any[];
      llmConfig?: { apiKey?: string; baseURL?: string; model?: string };
    },
    @Res() res: Response,
  ) {
    if (!body.message || !body.componentId) {
      throw new HttpException('message 和 componentId 为必填', HttpStatus.BAD_REQUEST);
    }
    await this.demoService.aiChatStream(body, res);
  }

  /**
   * 拍摄初始快照（进入 Playground 时调用）
   * POST /api/demo/initialize/:componentId
   */
  @Post('initialize/:componentId')
  async initialize(@Param('componentId') componentId: string) {
    try {
      const result = await this.demoService.initializeSnapshot(componentId);
      return result;
    } catch (error) {
      this.logger.error(`初始快照失败: ${error.message}`);
      throw new HttpException(
        `初始快照失败: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 单步后退 — 撤销最近一次 AI 修改
   * POST /api/demo/undo/:componentId
   */
  @Post('undo/:componentId')
  async undo(@Param('componentId') componentId: string) {
    try {
      const result = await this.demoService.undoModification(componentId);
      return result;
    } catch (error) {
      this.logger.error(`后退失败: ${error.message}`);
      throw new HttpException(
        `后退失败: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 全量恢复 — 回到初始状态
   * POST /api/demo/restore/:componentId
   */
  @Post('restore/:componentId')
  async restore(@Param('componentId') componentId: string) {
    try {
      const result = await this.demoService.restoreInitial(componentId);
      return result;
    } catch (error) {
      this.logger.error(`恢复失败: ${error.message}`);
      throw new HttpException(
        `恢复失败: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取修改历史
   * GET /api/demo/modifications/:componentId
   */
  @Get('modifications/:componentId')
  async getModifications(@Param('componentId') componentId: string) {
    try {
      const result = await this.demoService.getModifications(componentId);
      return result;
    } catch (error) {
      this.logger.error(`获取历史失败: ${error.message}`);
      throw new HttpException(
        `获取历史失败: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 下载组件 ZIP
   * GET /api/demo/download/:componentId
   */
  @Get('download/:componentId')
  async download(
    @Param('componentId') componentId: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        throw new HttpException('未登录', HttpStatus.UNAUTHORIZED);
      }
      await this.demoService.downloadComponent(componentId, userId, res);
    } catch (error) {
      if (!res.headersSent) {
        const status = error instanceof HttpException
          ? error.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR;
        res.status(status).json({
          success: false,
          message: `下载失败: ${error.message}`,
        });
      }
    }
  }
}
