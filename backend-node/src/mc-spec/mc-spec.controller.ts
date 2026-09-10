import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { McSpecService } from './mc-spec.service';
import { AdminService } from '../admin/admin.service';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';

/**
 * 微码组件规范检查接口（2026-09-10）
 *
 * - POST /api/mc-spec/check     对单个组件执行检查（同步，约 1s）
 * - GET  /api/mc-spec/skills    可用 skill 列表
 * - GET  /api/mc-spec/report/:componentId/:stamp  检查报告 HTML（自包含，可直接预览）
 * - POST /api/mc-spec/skills    上传 zip 注册自定义 skill（**仅管理员**）
 * - DELETE /api/mc-spec/skills/:skillId  卸载自定义 skill（**仅管理员**，内置不可删）
 */
@Controller('mc-spec')
@UseGuards(SessionGuard)
export class McSpecController {
  constructor(
    private readonly svc: McSpecService,
    private readonly adminService: AdminService,
  ) {}

  @Get('skills')
  async listSkills() {
    return { success: true, skills: this.svc.listSkills() };
  }

  @Post('check')
  async check(
    @Body() body: Record<string, any>,
    @CurrentUser() userId: string,
  ) {
    const componentId = String(body?.componentId || '').trim();
    if (!componentId) {
      throw new HttpException('缺少 componentId', HttpStatus.BAD_REQUEST);
    }
    const skillId = String(body?.skillId || '').trim() || undefined;
    const result = await this.svc.checkComponent(componentId, skillId);
    return { success: true, userId, result };
  }

  /**
   * 上传 zip 注册自定义规范检查 skill（仅管理员）。
   *
   * 表单字段：
   *   file        zip 文件（必填，内存态，上限 10MB）
   *   skillId     可选，显式指定 skill 标识（留空取 zip 顶层目录名 / 文件名）
   *   overwrite   可选，'true' 时覆盖同名 skill
   */
  @Post('skills')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadSkill(
    @UploadedFile() file: any,
    @Body() body: Record<string, any>,
    @CurrentUser() userId: string,
  ) {
    await this.adminService.assertAdmin(userId);
    if (!file?.buffer?.length) {
      throw new HttpException('缺少上传文件 file（zip）', HttpStatus.BAD_REQUEST);
    }
    const overwrite = String(body?.overwrite ?? '') === 'true' || body?.overwrite === true;
    const skill = await this.svc.installSkillFromZip(file.buffer as Buffer, {
      skillId: String(body?.skillId || '').trim() || undefined,
      overwrite,
      fileName: file.originalname,
    });
    return { success: true, skill };
  }

  /** 卸载自定义 skill（仅管理员） */
  @Delete('skills/:skillId')
  async removeSkill(@Param('skillId') skillId: string, @CurrentUser() userId: string) {
    await this.adminService.assertAdmin(userId);
    return { success: true, ...this.svc.removeSkill(skillId) };
  }

  @Get('report/:componentId/:stamp')
  async report(
    @Param('componentId') componentId: string,
    @Param('stamp') stamp: string,
    @Res() res: Response,
  ) {
    const p = this.svc.resolveReportPath(componentId, stamp);
    if (!p) {
      throw new HttpException('报告不存在', HttpStatus.NOT_FOUND);
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.sendFile(p);
  }
}
