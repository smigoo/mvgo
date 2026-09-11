import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  Res,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApifoxService } from './apifox.service';
import { ApifoxGeneratorService } from './apifox-generator.service';
import { RecordApifoxDto } from './dto/record-apifox.dto';
import { GenerateApifoxDto } from './dto/generate-apifox.dto';
import { GenerateFullApifoxDto } from './dto/generate-full-apifox.dto';
import { ListApifoxPathsDto } from './dto/list-apifox-paths.dto';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('apifox')
export class ApifoxController {
  constructor(
    private readonly apifoxService: ApifoxService,
    private readonly generatorService: ApifoxGeneratorService,
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

  // 获取 API 目录（完整模块树 + 函数清单）
  @Get('catalog/:catalogId')
  getCatalog(@Param('catalogId') catalogId: string) {
    try {
      return this.apifoxService.getCatalog(catalogId);
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

  // 登记产物元数据（技能模式 fallback）
  @Post('record')
  record(@Body() dto: RecordApifoxDto) {
    const task = this.apifoxService.recordTask(dto);
    return {
      success: true,
      taskId: task.taskId,
      downloadUrl: task.downloadUrl,
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

  @Get('download')
  async download(@Query('taskId') taskId: string, @Res() res: Response) {
    if (!taskId) {
      throw new HttpException('缺少 taskId', HttpStatus.BAD_REQUEST);
    }
    try {
      const zipPath = this.apifoxService.getZipPath(taskId);
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
