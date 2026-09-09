import { Injectable, Logger } from '@nestjs/common';
import { AiSessionsService } from '../sessions/sessions.service';
import { AiDocumentsService } from '../documents/documents.service';
import { SaveMessageDto } from './dto/chat.dto';

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  constructor(
    private readonly sessionsService: AiSessionsService,
    private readonly documentsService: AiDocumentsService,
  ) {}

  async save(userId: string, dto: SaveMessageDto) {
    const session = await this.sessionsService.findById(dto.sessionId);
    if (!session) {
      throw new Error('会话不存在');
    }

    // 保存消息到 session
    await this.sessionsService.pushMessages(dto.sessionId, dto.messages);

    // 确保文档存在（首次自动创建）
    let document: any;
    if (dto.documentId) {
      document = await this.documentsService.findById(dto.documentId);
    }
    if (!document) {
      document = await this.documentsService.ensureDocument({
        sessionId: dto.sessionId,
        projectId: session.projectId.toString(),
        userId,
        title: session.title || '未命名文档',
      });
    }

    // 增量追加本轮生成的内容
    await this.documentsService.appendContent(document._id.toString(), {
      content: '\n\n' + dto.generatedContent,
    });

    this.logger.log(
      `Chat saved: session=${dto.sessionId}, doc=${document._id}, msgs=${dto.messages.length}`,
    );

    return {
      sessionId: dto.sessionId,
      documentId: document._id.toString(),
      documentUpdated: true,
    };
  }
}
