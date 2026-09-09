import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { extname } from 'path';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionGuard } from '../auth/session.guard';
import { PageSkeletonService } from './page-skeleton.service';

@Controller('page-skeleton')
@UseGuards(SessionGuard)
export class PageSkeletonController {
  constructor(private readonly svc: PageSkeletonService) {}

  /** 创建：截图(multipart file) 或 figmaUrl + groupId */
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async create(
    @CurrentUser() userId: string,
    @UploadedFile() file: any,
    @Body() body: { groupId?: string; name?: string; figmaUrl?: string },
  ) {
    if (!body.groupId) {
      return { success: false, code: 400, message: '缺少 groupId', data: null, source: 'page-skeleton' };
    }
    return this.svc.create(
      userId,
      { groupId: body.groupId, name: body.name, figmaUrl: body.figmaUrl },
      file,
    );
  }

  /** 列表（当前用户，可选按 groupId 过滤） */
  @Get()
  async list(@CurrentUser() userId: string, @Query('groupId') groupId?: string) {
    return this.svc.list(userId, groupId);
  }

  /** 单个页面详情 */
  @Get(':groupId/:id')
  async getOne(
    @CurrentUser() userId: string,
    @Param('groupId') groupId: string,
    @Param('id') id: string,
  ) {
    return this.svc.getOne(userId, id, groupId);
  }

  /** 改名 / 改结构重渲染 */
  @Post(':groupId/:id/update')
  async update(
    @CurrentUser() userId: string,
    @Param('groupId') groupId: string,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.svc.update(userId, id, groupId, body);
  }

  /** 下载 ZIP */
  @Get(':groupId/:id/download')
  async download(
    @CurrentUser() userId: string,
    @Param('groupId') groupId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    try {
      const buf = await this.svc.downloadZip(userId, id, groupId);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${id}.zip"`);
      res.send(buf);
    } catch (e: any) {
      res.status(400).json({ success: false, code: 400, message: e.message || '下载失败', data: null });
    }
  }

  /** 删除：任务记录 + 磁盘目录 同删 */
  @Post(':groupId/:id/delete')
  async remove(
    @CurrentUser() userId: string,
    @Param('groupId') groupId: string,
    @Param('id') id: string,
  ) {
    return this.svc.remove(userId, id, groupId);
  }

  /** 失败重试：基于已保存截图重新生成（无需重新上传） */
  @Post(':groupId/:id/retry')
  async retry(
    @CurrentUser() userId: string,
    @Param('groupId') groupId: string,
    @Param('id') id: string,
  ) {
    return this.svc.retry(userId, id, groupId);
  }

  // ============================================================
  // 页面文件管理（Playground 编辑用）
  // ============================================================

  /** 文件树（目录列举） */
  @Get(':groupId/:id/files')
  async files(
    @CurrentUser() userId: string,
    @Param('groupId') groupId: string,
    @Param('id') id: string,
  ) {
    return this.svc.listPageFiles(groupId, id);
  }

  /** 读取文件内容（与组件 /file 接口一致：非 raw 返回 {success,content}；raw=1 直接回传二进制供 <img>） */
  @Get(':groupId/:id/file')
  async readFile(
    @Param('groupId') groupId: string,
    @Param('id') id: string,
    @Query('path') filePath: string,
    @Query('raw') raw: string,
    @Res() res: Response,
  ) {
    if (!filePath) {
      return { success: false, code: 400, message: '缺少 path', data: null, source: 'page-skeleton' };
    }
    const info = await this.svc.readPageFile(groupId, id, filePath);
    if (raw === '1' && info.isBinary) {
      const ext = extname(filePath).toLowerCase();
      const mimeMap: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml; charset=utf-8',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
        '.ico': 'image/x-icon',
      };
      res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'private, max-age=60');
      return res.sendFile(info.absPath);
    }
    return res.json({ success: true, content: info.content });
  }

  /** 写入文件内容 */
  @Post(':groupId/:id/file')
  async writeFile(
    @CurrentUser() userId: string,
    @Param('groupId') groupId: string,
    @Param('id') id: string,
    @Body() body: { path?: string; content?: string },
  ) {
    if (!body?.path) {
      return { success: false, code: 400, message: '缺少 path', data: null, source: 'page-skeleton' };
    }
    return this.svc.writePageFile(groupId, id, body.path, body.content ?? '');
  }

  /** 新建目录 */
  @Post(':groupId/:id/folder')
  async createFolder(
    @CurrentUser() userId: string,
    @Param('groupId') groupId: string,
    @Param('id') id: string,
    @Body() body: { path?: string },
  ) {
    if (!body?.path) {
      return { success: false, code: 400, message: '缺少 path', data: null, source: 'page-skeleton' };
    }
    return this.svc.createPageFolder(groupId, id, body.path);
  }

  /** 重命名 / 移动 */
  @Post(':groupId/:id/rename')
  async renameFile(
    @CurrentUser() userId: string,
    @Param('groupId') groupId: string,
    @Param('id') id: string,
    @Body() body: { oldPath?: string; newPath?: string },
  ) {
    if (!body?.oldPath || !body?.newPath) {
      return { success: false, code: 400, message: '缺少 oldPath/newPath', data: null, source: 'page-skeleton' };
    }
    return this.svc.renamePageFile(groupId, id, body.oldPath, body.newPath);
  }

  /** 删除文件 / 目录 */
  @Post(':groupId/:id/file/delete')
  async deleteFile(
    @CurrentUser() userId: string,
    @Param('groupId') groupId: string,
    @Param('id') id: string,
    @Query('path') filePath: string,
  ) {
    if (!filePath) {
      return { success: false, code: 400, message: '缺少 path', data: null, source: 'page-skeleton' };
    }
    return this.svc.deletePageFile(groupId, id, filePath);
  }
}
