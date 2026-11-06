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

  // 🛡️ 2026-11-06 补守卫：原先仅 @OptionalUser ⇒ 匿名时 service 走 `userId ? 校验 : 放行`
  //   的跳过分支，任何人可按 sessionId 拉他人组件。调用方只有 api/component.ts(authAxios 带 Token)。
  @Get('by-session/:sessionId')
  @UseGuards(SessionGuard)
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
   * 🛡️ 2026-11-06 补守卫：三个 gitlab-* 端点原先零守卫，且 `accessToken` 由
   *   `@Body()` 由调用方自带、服务端无条件转发 —— 等于任何人（无需登录）
   *   都能把它当成访问公司 GitLab 的开放代理；`gitlab-projects-proxy` 更甚，
   *   `endpoint` 也是入参，可拼任意 GET 路径（SSRF/越权枚举）。
   *   调用方只有前端 GitLabPushModal.vue（http.post → 带 Token），补守卫安全。
   */
  @Post('gitlab-projects')
  @UseGuards(SessionGuard)
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
  @UseGuards(SessionGuard)
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
  @UseGuards(SessionGuard)
  async proxyGitLabProjects(
    @Body() body: { accessToken: string; endpoint: string },
  ) {
    return this.gitlabPushService.proxyGitLabGet(body.accessToken, body.endpoint);
  }

  // 🛡️ 2026-10-10 治本（生产「保存报未登录或无权限」）：以下 file 级写接口原先只挂
  //   @CurrentUser（仅读 session.userId，无 SessionGuard 的「header token→建 session」兜底）。
  //   生产门户 iframe 场景 session cookie（sameSite:lax）带不上 → session 恒空 →
  //   即使请求带有效 Token header 也 401。补 SessionGuard 后与同控制器其余写接口一致：
  //   Token header 先建 session，@CurrentUser 同请求内即可取到。
  @Post('push-to-gitlab')
  @UseGuards(SessionGuard)
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

  // 🛡️ 2026-11-06 补守卫：匿名可枚举读任意组件源码文件清单（越权读取）。
  //   调用方 DocComparePanel.vue / api/component.ts 均 http.get/authAxios 带 Token，零误伤。
  @Get(':componentId/files')
  @UseGuards(SessionGuard)
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

  // 🛡️ 2026-11-06 补守卫：同 files —— 匿名可读任意组件 declare 配置。
  //   调用方 demo/index.vue:2514 http.get 带 Token，零误伤。
  @Get(':componentId/declare')
  @UseGuards(SessionGuard)
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
  @UseGuards(SessionGuard)
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
        // 允许访问隐藏目录（如 .mc-gen/screenshots/）下的截图文件
        return res.sendFile(fullPath, { dotfiles: 'allow' });
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
  @UseGuards(SessionGuard)
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
  @UseGuards(SessionGuard)
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
  @UseGuards(SessionGuard)
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
  @UseGuards(SessionGuard)
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

  // 🛡️ 2026-11-06 补守卫：匿名可打包下载任意组件源码。调用方 TaskDetail.vue(downloadArtifact
  //   →fetch 带 Token) / RightPanel.vue(downloadByUrl→http.raw 带 Token)；
  //   2026-09-04 已实证原生 <a href> 裸链不带 Token 并全部改造完毕，此处补守卫零误伤。
  // ⚠️ 姊妹端点 GET :componentId/file 保持匿名 —— 质量面板 <img src="/file?…&raw=1">
  //   截图/预览图无法带 Token 头，raw=1 逃生舱即为此设计（方法内 session 有 userId 仍做归属校验）。
  @Get('download/:componentId')
  @UseGuards(SessionGuard)
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
