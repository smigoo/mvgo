import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Patch,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { WorkbenchService } from './workbench.service';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('workbench')
@UseGuards(SessionGuard)
export class WorkbenchController {
  constructor(private readonly workbenchService: WorkbenchService) {}

  /**
   * 创建新对话
   * POST /api/workbench/conversations
   */
  @Post('conversations')
  async createConversation(
    @CurrentUser() userId: string,
    @Body() body: { title?: string },
  ) {
    try {
      const conversation = await this.workbenchService.createConversation(userId, body.title);
      return {
        success: true,
        data: conversation,
      };
    } catch (err) {
      throw new HttpException(
        { success: false, error: err.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取对话列表
   * GET /api/workbench/conversations
   */
  @Get('conversations')
  async listConversations(
    @CurrentUser() userId: string,
    @Query('limit') limit?: string,
  ) {
    try {
      const conversations = await this.workbenchService.listConversations(
        userId,
        limit ? parseInt(limit, 10) : 20,
      );
      return {
        success: true,
        data: conversations,
        count: conversations.length,
      };
    } catch (err) {
      throw new HttpException(
        { success: false, error: err.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取单个对话详情
   * GET /api/workbench/conversations/:conversationId
   */
  @Get('conversations/:conversationId')
  async getConversation(
    @Param('conversationId') conversationId: string,
    @CurrentUser() userId: string,
  ) {
    try {
      const conversation = await this.workbenchService.getConversation(conversationId, userId);
      if (!conversation) {
        throw new HttpException(
          { success: false, error: '对话不存在' },
          HttpStatus.NOT_FOUND,
        );
      }
      return {
        success: true,
        data: conversation,
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        { success: false, error: err.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 发送消息
   * POST /api/workbench/conversations/:conversationId/messages
   */
  @Post('conversations/:conversationId/messages')
  async sendMessage(
    @Param('conversationId') conversationId: string,
    @CurrentUser() userId: string,
    @Body() body: { content: string; attachments?: any[]; pendingToolCall?: any },
  ) {
    try {
      if (!body.content || body.content.trim().length === 0) {
        throw new HttpException(
          { success: false, error: '消息内容不能为空' },
          HttpStatus.BAD_REQUEST,
        );
      }

      const result = await this.workbenchService.sendMessage(
        conversationId,
        userId,
        body.content,
        body.attachments,
        body.pendingToolCall,
      );

      return {
        success: true,
        data: {
          userMessage: result.userMessage,
          assistantMessage: result.assistantMessage,
          conversation: {
            conversationId: result.conversation.conversationId,
            title: result.conversation.title,
            messageCount: result.conversation.messageCount,
            lastActiveAt: result.conversation.lastActiveAt,
          },
        },
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        { success: false, error: err.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 删除对话
   * DELETE /api/workbench/conversations/:conversationId
   */
  @Delete('conversations/:conversationId')
  async deleteConversation(
    @Param('conversationId') conversationId: string,
    @CurrentUser() userId: string,
  ) {
    try {
      const deleted = await this.workbenchService.deleteConversation(conversationId, userId);
      if (!deleted) {
        throw new HttpException(
          { success: false, error: '对话不存在或无权删除' },
          HttpStatus.NOT_FOUND,
        );
      }
      return {
        success: true,
        message: '对话已删除',
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        { success: false, error: err.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 更新对话上下文
   * PATCH /api/workbench/conversations/:conversationId/context
   */
  @Post('conversations/:conversationId/context')
  async updateContext(
    @Param('conversationId') conversationId: string,
    @CurrentUser() userId: string,
    @Body() context: Record<string, any>,
  ) {
    try {
      const conversation = await this.workbenchService.updateContext(
        conversationId,
        userId,
        context,
      );
      if (!conversation) {
        throw new HttpException(
          { success: false, error: '对话不存在' },
          HttpStatus.NOT_FOUND,
        );
      }
      return {
        success: true,
        data: conversation,
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        { success: false, error: err.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 搜索对话
   * GET /api/workbench/conversations/search?q=keyword
   */
  @Get('conversations/search')
  async searchConversations(
    @CurrentUser() userId: string,
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ) {
    try {
      if (!query || query.trim().length === 0) {
        throw new HttpException(
          { success: false, error: '搜索关键词不能为空' },
          HttpStatus.BAD_REQUEST,
        );
      }

      const conversations = await this.workbenchService.searchConversations(
        userId,
        query,
        limit ? parseInt(limit, 10) : 10,
      );

      return {
        success: true,
        data: conversations,
        count: conversations.length,
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        { success: false, error: err.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取对话统计
   * GET /api/workbench/stats
   */
  @Get('stats')
  async getStats(@CurrentUser() userId: string) {
    try {
      const stats = await this.workbenchService.getConversationStats(userId);
      return {
        success: true,
        data: stats,
      };
    } catch (err) {
      throw new HttpException(
        { success: false, error: err.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 重命名对话
   * PATCH /api/workbench/conversations/:conversationId/rename
   */
  @Post('conversations/:conversationId/rename')
  async renameConversation(
    @Param('conversationId') conversationId: string,
    @CurrentUser() userId: string,
    @Body() body: { title: string },
  ) {
    try {
      if (!body.title || body.title.trim().length === 0) {
        throw new HttpException(
          { success: false, error: '标题不能为空' },
          HttpStatus.BAD_REQUEST,
        );
      }

      const conversation = await this.workbenchService.renameConversation(
        conversationId,
        userId,
        body.title.trim(),
      );

      if (!conversation) {
        throw new HttpException(
          { success: false, error: '对话不存在或无权访问' },
          HttpStatus.NOT_FOUND,
        );
      }

      return {
        success: true,
        data: conversation,
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        { success: false, error: err.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 批量删除对话
   * POST /api/workbench/conversations/batch-delete
   */
  @Post('conversations/batch-delete')
  async batchDeleteConversations(
    @CurrentUser() userId: string,
    @Body() body: { conversationIds: string[] },
  ) {
    try {
      if (!body.conversationIds || !Array.isArray(body.conversationIds) || body.conversationIds.length === 0) {
        throw new HttpException(
          { success: false, error: '请选择要删除的对话' },
          HttpStatus.BAD_REQUEST,
        );
      }

      const result = await this.workbenchService.batchDeleteConversations(
        body.conversationIds,
        userId,
      );

      return {
        success: true,
        data: result,
        message: `成功删除 ${result.deletedCount} 个对话`,
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        { success: false, error: err.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 移动对话到分组
   * POST /api/workbench/conversations/move-to-group
   */
  @Post('conversations/move-to-group')
  async moveToGroup(
    @CurrentUser() userId: string,
    @Body() body: { conversationIds: string[]; group: string | null },
  ) {
    try {
      if (!body.conversationIds || !Array.isArray(body.conversationIds) || body.conversationIds.length === 0) {
        throw new HttpException(
          { success: false, error: '请选择要移动的对话' },
          HttpStatus.BAD_REQUEST,
        );
      }

      const result = await this.workbenchService.moveToGroup(
        body.conversationIds,
        userId,
        body.group,
      );

      return {
        success: true,
        data: result,
        message: `成功移动 ${result.modifiedCount} 个对话到分组 "${body.group || '未分组'}"`,
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        { success: false, error: err.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取用户的所有分组
   * GET /api/workbench/groups
   */
  @Get('groups')
  async getGroups(@CurrentUser() userId: string) {
    try {
      const groups = await this.workbenchService.getGroups(userId);
      return {
        success: true,
        data: groups,
      };
    } catch (err) {
      throw new HttpException(
        { success: false, error: err.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 新建分组
   * POST /api/workbench/groups
   */
  @Post('groups')
  async createGroup(
    @CurrentUser() userId: string,
    @Body() body: { name: string },
  ) {
    try {
      if (!body?.name?.trim()) {
        throw new HttpException(
          { success: false, error: '分组名称不能为空' },
          HttpStatus.BAD_REQUEST,
        );
      }
      const group = await this.workbenchService.createGroup(userId, body.name);
      return {
        success: true,
        data: group,
        message: `已创建分组「${group.name}」`,
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        { success: false, error: err.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 重命名分组
   * PATCH /api/workbench/groups/:name
   */
  @Patch('groups/:name')
  async renameGroup(
    @CurrentUser() userId: string,
    @Param('name') name: string,
    @Body() body: { newName: string },
  ) {
    try {
      if (!body?.newName?.trim()) {
        throw new HttpException(
          { success: false, error: '分组名称不能为空' },
          HttpStatus.BAD_REQUEST,
        );
      }
      const result = await this.workbenchService.renameGroup(userId, name, body.newName);
      return {
        success: true,
        data: result,
        message: `已重命名为「${body.newName.trim()}」，同步更新 ${result.modifiedCount} 个对话`,
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        { success: false, error: err.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 删除分组（组内有对话时拒绝）
   * DELETE /api/workbench/groups/:name
   */
  @Delete('groups/:name')
  async deleteGroup(
    @CurrentUser() userId: string,
    @Param('name') name: string,
    @Query('force') force?: string,
  ) {
    try {
      const result = await this.workbenchService.deleteGroup(
        userId,
        name,
        force === 'true',
      );
      return {
        success: true,
        data: result,
        message: `已删除分组「${name}」`,
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        { success: false, error: err.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * 获取对话的工具凭据配置（Figma/Apifox/GitLab）
   * GET /api/workbench/conversations/:conversationId/credentials
   */
  @Get('conversations/:conversationId/credentials')
  async getToolCredentials(
    @Param('conversationId') conversationId: string,
    @CurrentUser() userId: string,
  ) {
    try {
      const credentials = await this.workbenchService.getToolCredentials(conversationId, userId);
      if (!credentials) {
        throw new HttpException(
          { success: false, error: '对话不存在或无权访问' },
          HttpStatus.NOT_FOUND,
        );
      }
      return {
        success: true,
        data: credentials,
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        { success: false, error: err.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 更新对话的工具凭据配置
   * PATCH /api/workbench/conversations/:conversationId/credentials
   */
  @Post('conversations/:conversationId/credentials')
  async updateToolCredentials(
    @Param('conversationId') conversationId: string,
    @CurrentUser() userId: string,
    @Body() body: {
      figmaToken?: string;
      apifoxToken?: string;
      gitlabToken?: string;
      gitlabProjectUrl?: string;
    },
  ) {
    try {
      const credentials = await this.workbenchService.updateToolCredentials(
        conversationId,
        userId,
        body,
      );
      if (!credentials) {
        throw new HttpException(
          { success: false, error: '对话不存在或无权访问' },
          HttpStatus.NOT_FOUND,
        );
      }
      return {
        success: true,
        data: credentials,
        message: '工具凭据已更新',
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        { success: false, error: err.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
