import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  Res,
  Headers,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApifoxService } from './apifox.service';
import { ApifoxGeneratorService } from './apifox-generator.service';
import { ApifoxMcpService } from './apifox-mcp.service';
import { RecordApifoxDto } from './dto/record-apifox.dto';
import { GenerateApifoxDto } from './dto/generate-apifox.dto';
import { GenerateFullApifoxDto } from './dto/generate-full-apifox.dto';
import { ListApifoxPathsDto } from './dto/list-apifox-paths.dto';
import { McpListApifoxDto } from './dto/mcp-list-apifox.dto';
import { McpAddApifoxDto } from './dto/mcp-add-apifox.dto';
import { SessionGuard } from '../auth/session.guard';
import { OptionalSessionGuard } from '../auth/optional-session.guard';
import { CurrentUser, OptionalUser } from '../auth/current-user.decorator';

@Controller('apifox')
export class ApifoxController {
  constructor(
    private readonly apifoxService: ApifoxService,
    private readonly generatorService: ApifoxGeneratorService,
    private readonly mcpService: ApifoxMcpService,
  ) {}

  // 单模块生成
  @Post('generate')
  @UseGuards(SessionGuard)
  async generate(@Body() dto: GenerateApifoxDto, @CurrentUser() userId: string) {
    try {
      const result = await this.generatorService.generate({ ...dto, ownerId: userId });
      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `生成失败: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // 列出项目里的所有 path（按首段分组），用于「自动探测模块」按钮
  @Post('list-paths')
  @UseGuards(SessionGuard)
  async listPaths(@Body() dto: ListApifoxPathsDto) {
    try {
      const result = await this.generatorService.listPaths(dto);
      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `探测失败: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // 全量生成（所有接口，按模块分组）
  @Post('generate-full')
  @UseGuards(SessionGuard)
  async generateFull(@Body() dto: GenerateFullApifoxDto, @CurrentUser() userId: string) {
    try {
      const result = await this.generatorService.generateFull({ ...dto, ownerId: userId });
      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `全量生成失败: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ─── Apifox MCP 通路（官方 apifox-mcp-server，stdio）────────
  // 探测：拉取项目 OAS 并列出接口，可选标注相对基准目录「新增」的接口
  @Post('mcp-list')
  @UseGuards(SessionGuard)
  async mcpList(@Body() dto: McpListApifoxDto) {
    try {
      return await this.mcpService.listMcpApis(dto);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `MCP 探测失败: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // 增量新增：只重建目标模块并替换回既有 ZIP / catalog，不整包重生成
  @Post('mcp-add')
  @UseGuards(SessionGuard)
  async mcpAdd(@Body() dto: McpAddApifoxDto, @CurrentUser() userId: string) {
    try {
      return await this.mcpService.addMcpApis({ ...dto, ownerId: userId });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `MCP 新增失败: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // 获取 API 目录（完整模块树 + 函数清单）
  // 🛡️ 2026-11-06 补守卫：本端点原先零守卫零鉴权，而 service.getCatalog 也不校验归属，
  //   等于任何人拿到/猜到 catalogId 就能匿名读出全量接口清单（含内网地址、字段、示例值）。
  //   调用方只有前端 ApiCatalogDetail.vue，走 http.get → 自动带 Token header，
  //   SessionGuard 可先用 header token 建 session，生产 iframe 场景不受影响。
  @Get('catalog/:catalogId')
  @UseGuards(SessionGuard)
  getCatalog(
    @Param('catalogId') catalogId: string,
    @CurrentUser() userId: string,
  ) {
    try {
      return this.apifoxService.getCatalog(catalogId, userId);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `获取目录失败: ${error.message}`,
        HttpStatus.NOT_FOUND,
      );
    }
  }

  // 列出当前用户的 API 目录（按 ownerId 隔离）
  @Get('catalogs')
  @UseGuards(SessionGuard)
  listCatalogs(@CurrentUser() userId: string) {
    return {
      success: true,
      items: this.apifoxService.listCatalogs(userId),
    };
  }

  /**
   * 登记产物元数据（技能模式 fallback）
   * 🔒 2026-11-06 定性：**不能挂 SessionGuard**。本端点是 apifox-api-generator
   *   Skill 的「唯一写入入口」（SKILL.md 步骤 5），Skill 是机器对机器调用、
   *   手里没有用户 session，挂守卫会直接打断「我的接口」链路 —— 与其余端点不同类。
   *   改为「可选共享密钥」：设了环境变量 APIFOX_SKILL_KEY 就要求头 x-skill-key 一致；
   *   未设时保持原行为（此时真实风险已由 service 侧收敛：taskId 防穿越 +
   *   zipPath 只允许落在 data/apifox-zips 内，本端点再也无法间接读任意文件）。
   *   ⚠️ 注意用 401 之外的语义：这里返回 401 是为了和 Skill「未授权」可读性一致，
   *   不是 SessionGuard 的 401（后者带「未登录或登录已过期」文案）。
   *
   * 🆔 2026-11-06 补 ownerId 写入（用户裁决「需要ownerId」）：
   *   原先本方法 `recordTask(dto)` 直传，而 `RecordApifoxDto` 没声明归属字段 ⇒
   *   全局 `ValidationPipe({whitelist:true})` 把 Skill 发的 `userId` 静默剥离 ⇒
   *   落库 task 永远无 owner ⇒ `listMine` 的 `|| !t.ownerId` 让记录对**所有登录用户**
   *   可见、`assertTaskOwner` 全程空转。修法分三处，缺一不可：
   *     ① 本 DTO 声明 ownerId / userId（否则继续被剥离）；
   *     ② 挂 `OptionalSessionGuard`（**永不阻断**，所以 Skill 调用零影响）：
   *        Skill 不带 Token ⇒ 匿名放行照旧；浏览器带 `Token` 头调用 ⇒ 顺手拿到
   *        **权威**会话身份，比 body 里自报的值可信；
   *     ③ 取值优先级：会话身份 > ownerId > userId；交由
   *        `ApifoxService.normalizeOwnerId` 判定形态（`default-user` 这类 Skill
   *        缺省值不落库，否则记录会对作者本人也不可见）。
   */
  @Post('record')
  @UseGuards(OptionalSessionGuard)
  record(
    @Body() dto: RecordApifoxDto,
    @OptionalUser() sessionUserId?: string,
    @Headers('x-skill-key') skillKey?: string,
  ) {
    const expected = process.env.APIFOX_SKILL_KEY;
    if (expected && skillKey !== expected) {
      throw new HttpException('缺少或错误的 x-skill-key', HttpStatus.UNAUTHORIZED);
    }
    // 会话身份优先（有 Token 头的调用方无法伪造成他人）；无会话才信 body（Skill 通路）
    const ownerId = sessionUserId || dto.ownerId || dto.userId;
    const task = this.apifoxService.recordTask({ ...dto, ownerId });
    return {
      success: true,
      taskId: task.taskId,
      downloadUrl: task.downloadUrl,
      ownerId: task.ownerId ?? null,
    };
  }

  // 列出当前用户的生成历史
  @Get('mine')
  @UseGuards(SessionGuard)
  mine(@CurrentUser() userId: string) {
    return {
      success: true,
      items: this.apifoxService.listMine(userId),
    };
  }

  // 删除指定任务（同时删 zip + catalog json）
  @Post('tasks/:taskId/delete')
  @UseGuards(SessionGuard)
  deleteTask(@Param('taskId') taskId: string, @CurrentUser() userId: string) {
    try {
      this.apifoxService.deleteTask(taskId, userId);
      return { success: true };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `删除失败: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // 🛡️ 2026-11-06 补守卫 + 传 userId：原先匿名可达（实测
  //   GET /api/apifox/download?taskId=xxx 直接进业务逻辑并 sendFile）。
  //   前端三个调用方（ApiCatalogDetail / MyApisView / GenerateApiView）都走
  //   downloadByUrl → http.raw()，带 Token，不受影响。
  @Get('download')
  @UseGuards(SessionGuard)
  async download(
    @Query('taskId') taskId: string,
    @CurrentUser() userId: string,
    @Res() res: Response,
  ) {
    if (!taskId) {
      throw new HttpException('缺少 taskId', HttpStatus.BAD_REQUEST);
    }
    try {
      const zipPath = this.apifoxService.getZipPath(taskId, userId);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${taskId}.zip"`,
      );
      res.sendFile(zipPath);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `下载失败: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
