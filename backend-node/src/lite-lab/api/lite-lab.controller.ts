import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { OptionalSessionGuard } from '../../auth/optional-session.guard';
import { SessionGuard } from '../../auth/session.guard';
import { LiteLabDevOnlyGuard } from './lite-lab-dev-only.guard';
import { LiteLabService } from './lite-lab.service';
import { RunLabDto } from './dto/run-lab.dto';

/**
 * lite-lab 真值回填实验管线控制器（dev 专用）
 *
 * 端点（挂在 /api/lite-lab 下，生产 404）：
 *   POST run                 两阶段实验：Stage A lite 布局 → Stage B/C Figma node 真值匹配回填
 *   GET  report/:sessionId   拉取回填报告（stats + 逐文件 edits + 资源清单）
 *   GET  artifact/:sessionId 读取产物文件（白名单扩展 + 防目录穿越），用于预览图/回填后代码展示
 *
 * 与旧链路关系：Stage A 完整复用 LiteService（一条真实 lite 任务），
 * Stage B/C/D 为本模块自有逻辑；不改动 /api/lite 与 /api/phase2 任何行为。
 *
 * 守卫策略（2026-11-06 用户裁决「lab 生成任务也要 ownerId，每个人独立」后补齐）：
 *   · `LiteLabDevOnlyGuard` 全端点 404（生产默认不暴露，连路由都没有）；
 *   · `OptionalSessionGuard` 全类：**解析身份不阻断**（read 端点缺 token 匿名放行）；
 *   · `SessionGuard` 加在 `run` 上（消耗模型额度，必须确定归属，缺 token 抛 401）；
 *   · `report` / `artifact` 走 OptionalSession 解析出的身份 + **service 侧归属校验**
 *     （`assertLabAccess`，越权 404）。为什么只加在 service 侧而不改挂 SessionGuard：
 *     `artifact` 是 `<img src>` 加载的，浏览器带不了自定义 Header，前端只能把 token 拼进
 *     **query**（见 `frontend/src/api/lite-lab.ts#labArtifactUrl`）——`resolveSessionFromRequest`
 *     的 `query.token` 分支已覆盖该形态，故身份能拿到；若这里改挂 SessionGuard，
 *     那些**不经过前端拼 token** 的场景（新标签页直开图片、本地调试）会从 404 变 401，
 *     与「只读端点不阻断」的既有分工相悖。
 *   · 🔴 DevOnly 开关与归属是**两件事**：开关管「这个环境暴露不暴露」，归属管「暴露后谁能看
 *     谁的」。生产关掉开关只说明现在摸不到；一旦有人为上线打开开关，归属是唯一防线。
 */
@Controller('lite-lab')
@UseGuards(LiteLabDevOnlyGuard, OptionalSessionGuard)
export class LiteLabController {
  private readonly logger = new Logger(LiteLabController.name);

  constructor(private readonly service: LiteLabService) {}

  @Post('run')
  @UseGuards(SessionGuard)
  async run(@Body() dto: RunLabDto, @Req() req: any) {
    try {
      const result = await this.service.run(dto, req.session?.userId);
      return { success: true, ...result };
    } catch (e: any) {
      const status = e?.status === 400 ? HttpStatus.BAD_REQUEST : HttpStatus.INTERNAL_SERVER_ERROR;
      throw new HttpException(
        { code: 'LAB_RUN_FAILED', message: e?.message || '启动失败' },
        status,
      );
    }
  }

  @Get('report/:sessionId')
  async report(@Param('sessionId') sessionId: string, @Req() req: any) {
    try {
      const report = this.service.getReport(sessionId, req?.session?.userId ?? undefined);
      return { success: true, report };
    } catch (e: any) {
      const status = e?.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.INTERNAL_SERVER_ERROR;
      throw new HttpException({ code: 'LAB_REPORT_NOT_READY', message: e?.message }, status);
    }
  }

  @Get('artifact/:sessionId')
  async artifact(
    @Param('sessionId') sessionId: string,
    @Query('path') relPath: string,
    @Req() req: any,
    @Res() res: any,
  ) {
    try {
      const { buffer, ext } = this.service.getArtifact(
        sessionId,
        relPath || '',
        req?.session?.userId ?? undefined,
      );
      const mime =
        ext === '.png'
          ? 'image/png'
          : ext === '.jpg' || ext === '.jpeg'
            ? 'image/jpeg'
            : ext === '.svg'
              ? 'image/svg+xml'
              : ext === '.webp'
                ? 'image/webp'
                : ext === '.gif'
                  ? 'image/gif'
                  : ext === '.json'
                    ? 'application/json'
                    : 'text/plain; charset=utf-8';
      res.type(mime).send(buffer);
    } catch (e: any) {
      const status = e?.status === 404 ? HttpStatus.NOT_FOUND : e?.status === 400 ? HttpStatus.BAD_REQUEST : HttpStatus.INTERNAL_SERVER_ERROR;
      res.status(status).json({ success: false, code: 'LAB_ARTIFACT_FAILED', message: e?.message });
    }
  }
}
