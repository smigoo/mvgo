import { Controller, Post, Body, Get, Param, Res, Req, Logger } from '@nestjs/common';
import type { Response, Request } from 'express';
import { randomBytes } from 'crypto';
import { ScreenLayoutService } from './screen-layout.service';
import { ProgressService } from '../progress/progress.service';

@Controller('screen-layout')
export class ScreenLayoutController {
  private readonly logger = new Logger(ScreenLayoutController.name);

  constructor(
    private readonly screenLayoutService: ScreenLayoutService,
    private readonly progressService: ProgressService,
  ) {}

  /**
   * 下载大屏布局 ZIP（原始网格模板）
   * POST /api/screen-layout/download
   */
  @Post('download')
  async download(@Body() body: { layout: any }, @Res() res: Response) {
    const layout = body.layout;
    if (!layout) {
      return res.status(400).json({ success: false, error: '缺少 layout 参数' });
    }

    try {
      this.logger.log(`下载请求: ${layout.name || layout.id}`);
      const zipBuffer = await this.screenLayoutService.generateZip(layout);

      const safeName = (layout.name || 'screen-layout').replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, '_');
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeName)}.zip"`);
      res.setHeader('Content-Length', zipBuffer.length);
      res.send(zipBuffer);
    } catch (err: any) {
      this.logger.error(`下载失败: ${err.message}`, err.stack);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * 空间分析 — 规则引擎预处理（同步）
   * POST /api/screen-layout/analyze-spatial
   * Body: { layout: ScreenLayout }
   * 返回空间分析报告（行/列检测、重叠分析、Zone 树、响应式建议）
   */
  @Post('analyze-spatial')
  async analyzeSpatial(@Body() body: { layout: any }) {
    const layout = body.layout;
    if (!layout) {
      return { success: false, error: '缺少 layout 参数' };
    }

    try {
      this.logger.log(`空间分析请求: ${layout.name || layout.id}`);
      const report = this.screenLayoutService.analyzeSpatial(layout);
      return { success: true, data: report };
    } catch (err: any) {
      this.logger.error(`空间分析失败: ${err.message}`, err.stack);
      return { success: false, error: err.message };
    }
  }

  /**
   * 启动 AI 响应式生成（异步）
   * POST /api/screen-layout/analyze-responsive
   * Body: { layout: ScreenLayout }
   * 立即返回 sessionId，前端通过 SSE 订阅进度
   */
  @Post('analyze-responsive')
  async analyzeResponsive(@Body() body: { layout: any }, @Req() req: any) {
    const layout = body.layout;
    if (!layout) {
      return { success: false, error: '缺少 layout 参数' };
    }

    try {
      const sessionId = `lr-${Date.now()}-${randomBytes(4).toString('hex')}`;
      const userId = req.session?.userId;
      this.logger.log(`响应式生成请求: ${layout.name || layout.id} → ${sessionId}`);

      // 异步启动工作流（不阻塞请求）
      this.screenLayoutService.startResponsiveGeneration(sessionId, layout, userId);

      return { success: true, sessionId };
    } catch (err: any) {
      this.logger.error(`响应式生成启动失败: ${err.message}`, err.stack);
      return { success: false, error: err.message };
    }
  }

  /**
   * SSE 进度订阅（复用 ProgressService）
   * GET /api/screen-layout/progress/:sessionId
   */
  @Get('progress/:sessionId')
  streamProgress(@Param('sessionId') sessionId: string, @Res() res: Response, @Req() req: Request) {
    // 确保 sessionId 已创建
    try {
      return this.progressService.register(sessionId, res);
    } catch (err: any) {
      this.logger.warn(`SSE 注册失败: ${sessionId}`, err.message);
      // 如果 session 不存在，返回 404
      res.status(404).json({ success: false, error: 'Session not found' });
    }
  }

  /**
   * 下载响应式生成结果 ZIP
   * GET /api/screen-layout/download-responsive/:sessionId
   */
  @Get('download-responsive/:sessionId')
  async downloadResponsive(@Param('sessionId') sessionId: string, @Res() res: Response) {
    try {
      this.logger.log(`下载响应式结果: ${sessionId}`);
      const zipBuffer = await this.screenLayoutService.getGeneratedZip(sessionId);

      if (!zipBuffer) {
        return res.status(404).json({ success: false, error: '生成结果不存在或已过期' });
      }

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="responsive-${sessionId}.zip"`);
      res.setHeader('Content-Length', zipBuffer.length);
      res.send(zipBuffer);
    } catch (err: any) {
      this.logger.error(`下载响应式结果失败: ${err.message}`, err.stack);
      res.status(500).json({ success: false, error: err.message });
    }
  }
}
