import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Session,
  UseGuards,
  Res,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { extname } from 'path';
import { ComponentService } from './component.service';
import { GitlabPushService } from './gitlab-push.service';
import { ComponentAnalysisService } from './component-analysis.service';
import { Phase2Service } from '../phase2/phase2.service';
import { SessionGuard } from '../auth/session.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PERMISSIONS } from '../auth/permission.constants';
import { CurrentUser, OptionalUser } from '../auth/current-user.decorator';
import { ListComponentsDto } from './dto/list-components.dto';

@Controller('component')
export class ComponentController {
  private readonly logger = new Logger(ComponentController.name);

  constructor(
    private readonly componentService: ComponentService,
    private readonly componentAnalysisService: ComponentAnalysisService,
    private readonly phase2Service: Phase2Service,
    private readonly gitlabPushService: GitlabPushService,
  ) {}

  @Post()
  @UseGuards(SessionGuard, PermissionsGuard)
  @Permissions(PERMISSIONS.COMPONENT_CREATE)
  async createComponent(
    @Body()
    body: {
      name: string;
      description?: string;
      groupId: string;
      metadata?: any;
    },
    @Session() session: Record<string, any>,
  ) {
    const component = await this.componentService.createComponent(
      body.name,
      body.description || '',
      body.groupId,
      session.userId,
      body.metadata || {},
    );

    return {
      success: true,
      message: '组件创建成功',
      component,
    };
  }

  @Get('list')
  @UseGuards(SessionGuard)
  async listComponents(
    @Query() query: ListComponentsDto,
    @CurrentUser() userId: string,
  ) {
    const result = await this.componentService.listComponents(
      query,
      userId,
    );

    return {
      success: true,
      data: result,
    };
  }

  @Get()
  @UseGuards(SessionGuard)
  async getGroupComponents(
    @Query('groupId') groupId: string,
    @CurrentUser() userId: string,
  ) {
    const components = await this.componentService.getGroupComponents(
      groupId,
      userId,
    );

    return {
      success: true,
      components,
    };
  }

  @Get('by-session/:sessionId')
  async getComponentBySessionId(
    @Param('sessionId') sessionId: string,
    @OptionalUser() userId: string | undefined,
  ) {
    const component = await this.componentService.getComponentBySessionId(
      sessionId,
      userId,
    );
    return {
      success: true,
      component,
    };
  }

  /**
   * 代理 GitLab API：列出当前 Token 用户参与的项目
   * 前端无法直连 GitLab（CORS），故由后端转发
   */
  @Post('gitlab-projects')
  async listGitLabProjects(
    @Body() body: { accessToken: string },
  ) {
    try {
      const projects = await this.gitlabPushService.listProjects(body.accessToken);
      return { success: true, data: projects };
    } catch (err: any) {
      return { success: false, message: err?.message || '加载项目失败', data: null };
    }
  }

  /**
   * 代理 GitLab API：列出指定项目的分支
   */
  @Post('gitlab-branches')
  async listGitLabBranches(
    @Body() body: { accessToken: string; repoUrl: string },
  ) {
    try {
      const branches = await this.gitlabPushService.listBranches(body.accessToken, body.repoUrl);
      return { success: true, data: branches };
    } catch (err: any) {
      return { success: false, message: err?.message || '加载分支失败', data: null };
    }
  }

  @Post('gitlab-projects-proxy')
  async proxyGitLabProjects(
    @Body() body: { accessToken: string; endpoint: string },
  ) {
    return this.gitlabPushService.proxyGitLabGet(body.accessToken, body.endpoint);
  }

  @Post('push-to-gitlab')
  async pushComponentToGitLab(
    @Body()
    body: {
      componentId: string;
      repoUrl: string;
      branch: string;
      accessToken: string;
      commitMessage?: string;
      commit?: {
        code: string;
        reqcode: string;
        type: 'feat' | 'fix' | 'refactor' | 'test' | 'word' | 'conf';
        note: string;
        aiCoding?: boolean;
      };
    },
    @CurrentUser() userId: string,
  ) {
    return this.gitlabPushService.pushComponent({
      identifier: body.componentId,
      userId,
      repoUrl: body.repoUrl,
      branch: body.branch,
      accessToken: body.accessToken,
      commitMessage: body.commitMessage,
      commit: body.commit,
    });
  }

  @Get(':componentId')
  @UseGuards(SessionGuard)
  async getComponentById(
    @Param('componentId') componentId: string,
    @CurrentUser() userId: string,
  ) {
    const component = await this.componentService.getComponentById(
      componentId,
      userId,
    );

    return {
      success: true,
      component,
    };
  }

  @Post(':componentId')
  @UseGuards(SessionGuard, PermissionsGuard)
  @Permissions(PERMISSIONS.COMPONENT_UPDATE)
  async updateComponent(
    @Param('componentId') componentId: string,
    @Body()
    body: {
      name: string;
      description?: string;
      metadata?: any;
    },
    @Session() session: Record<string, any>,
  ) {
    const component = await this.componentService.updateComponent(
      componentId,
      body.name,
      body.description || '',
      body.metadata || {},
      session.userId,
    );

    return {
      success: true,
      message: '组件更新成功',
      component,
    };
  }

  @Post(':componentId/delete')
  @UseGuards(SessionGuard, PermissionsGuard)
  @Permissions(PERMISSIONS.COMPONENT_DELETE)
  async deleteComponent(
    @Param('componentId') componentId: string,
    @Session() session: Record<string, any>,
  ) {
    await this.componentService.deleteComponent(componentId, session.userId);

    return {
      success: true,
      message: '组件已删除',
    };
  }

  /** 发布到公共组件池（严格仅提供者，service 层校验） */
  @Post(':componentId/publish')
  @UseGuards(SessionGuard, PermissionsGuard)
  @Permissions(PERMISSIONS.COMPONENT_UPDATE)
  async publishComponent(
    @Param('componentId') componentId: string,
    @Session() session: Record<string, any>,
  ) {
    const component = await this.componentService.publishComponent(
      componentId,
      session.userId,
    );

    return {
      success: true,
      message: '已发布到公共组件池',
      data: {
        _id: (component as any)._id?.toString?.() || (component as any)._id,
        visibility: component.visibility,
        sharedAt: component.sharedAt,
      },
    };
  }

  /** 从公共组件池下架（严格仅提供者，个人副本保留） */
  @Post(':componentId/unpublish')
  @UseGuards(SessionGuard, PermissionsGuard)
  @Permissions(PERMISSIONS.COMPONENT_UPDATE)
  async unpublishComponent(
    @Param('componentId') componentId: string,
    @Session() session: Record<string, any>,
  ) {
    const component = await this.componentService.unpublishComponent(
      componentId,
      session.userId,
    );

    return {
      success: true,
      message: '已从公共组件池下架',
      data: {
        _id: (component as any)._id?.toString?.() || (component as any)._id,
        visibility: component.visibility,
      },
    };
  }

  @Post('batch-delete')
  @UseGuards(SessionGuard, PermissionsGuard)
  @Permissions(PERMISSIONS.COMPONENT_DELETE)
  async batchDeleteComponents(
    @Body() body: { componentIds: string[] },
    @Session() session: Record<string, any>,
  ) {
    if (!body.componentIds || !Array.isArray(body.componentIds) || body.componentIds.length === 0) {
      throw new HttpException('请提供要删除的组件 ID 列表', HttpStatus.BAD_REQUEST);
    }

    const result = await this.componentService.batchDeleteComponents(body.componentIds, session.userId);

    return {
      success: true,
      message: `成功删除 ${result.deleted} 个组件` + (result.failed > 0 ? `，${result.failed} 个失败` : ''),
      ...result,
    };
  }

  @Get(':componentId/files')
  async getComponentFiles(
    @Param('componentId') componentId: string,
    @OptionalUser() userId: string | undefined,
  ) {
    try {
      const files = await this.componentService.getComponentFiles(componentId, userId);
      return {
        success: true,
        files,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Get(':componentId/declare')
  async getComponentDeclare(
    @Param('componentId') componentId: string,
    @OptionalUser() userId: string | undefined,
  ) {
    try {
      const declare = await this.componentService.getComponentDeclare(componentId, userId);
      return {
        success: true,
        declare,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post(':componentId/analyze-visual')
  async analyzeComponentVisual(
    @Param('componentId') componentId: string,
    @CurrentUser() userId: string,
    @Body()
    body: {
      visionApiKey?: string;
      visionBaseURL?: string;
      visionModel?: string;
    },
  ) {
    return this.componentAnalysisService.analyzeComponent(componentId, userId, body || {});
  }

  @Get(':componentId/file')
  async getFileContent(
    @Param('componentId') componentId: string,
    @Query('path') filePath: string,
    @Query('raw') raw: string,
    @Session() session: Record<string, any>,
    @Res() res: Response,
  ) {
    try {
      const userId = session?.userId;
      if (raw === '1') {
        const fullPath = await this.componentService.resolveComponentFilePath(
          componentId,
          filePath,
          userId,
        );
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
        return res.sendFile(fullPath);
      }

      const content = await this.componentService.getFileContent(
        componentId,
        filePath,
        userId,
      );
      return res.json({
        success: true,
        content,
      });
    } catch (error) {
      return res.json({
        success: false,
        error: error.message,
      });
    }
  }

  @Post(':componentId/file')
  async saveFileContent(
    @Param('componentId') componentId: string,
    @Query('path') filePath: string,
    @Body('content') content: string,
    @CurrentUser() userId: string,
  ) {
    try {
      await this.componentService.saveFileContent(
        componentId,
        filePath,
        content,
        userId,
      );
      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post(':componentId/file/delete')
  async deleteComponentFile(
    @Param('componentId') componentId: string,
    @Query('path') filePath: string,
    @CurrentUser() userId: string,
  ) {
    try {
      await this.componentService.deleteComponentPath(componentId, filePath, userId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @Post(':componentId/rename')
  async renameComponentFile(
    @Param('componentId') componentId: string,
    @Body('oldPath') oldPath: string,
    @Body('newPath') newPath: string,
    @CurrentUser() userId: string,
  ) {
    try {
      await this.componentService.renameComponentPath(componentId, oldPath, newPath, userId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @Post(':componentId/folder')
  async createComponentFolder(
    @Param('componentId') componentId: string,
    @Body('path') folderPath: string,
    @CurrentUser() userId: string,
  ) {
    try {
      await this.componentService.createComponentFolder(componentId, folderPath, userId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @Get('download/:componentId')
  async downloadComponent(
    @Param('componentId') componentId: string,
    @OptionalUser() userId: string | undefined,
    @Res() res: Response,
  ) {
    try {
      const authorized = await this.componentService.authorizeWorkspaceComponent(
        componentId,
        userId,
        'read',
      );

      const zipBuffer = await this.phase2Service.packageComponent(
        authorized.componentId,
        authorized.target,
        authorized.groupId,
      );

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${authorized.componentId}.zip"`,
      );

      res.send(zipBuffer);
    } catch (error) {
      this.logger.error(`下载组件失败: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `下载组件失败: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
