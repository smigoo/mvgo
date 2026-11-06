import { AiSessionsService } from '../sessions/sessions.service';
import { AiDocumentsService } from '../documents/documents.service';
import { SaveMessageDto } from './dto/chat.dto';
export declare class AiChatService {
    private readonly sessionsService;
    private readonly documentsService;
    private readonly logger;
    constructor(sessionsService: AiSessionsService, documentsService: AiDocumentsService);
    save(userId: string, dto: SaveMessageDto): Promise<{
        sessionId: string;
        documentId: any;
        documentUpdated: boolean;
    }>;
}
