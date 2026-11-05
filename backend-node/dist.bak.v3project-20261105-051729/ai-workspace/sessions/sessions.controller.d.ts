import { AiSessionsService } from './sessions.service';
import { CreateSessionDto, UpdateSessionDto } from '../chat/dto/chat.dto';
export declare class AiSessionsController {
    private readonly sessionsService;
    constructor(sessionsService: AiSessionsService);
    findByUser(userId: string, projectId?: string): Promise<{
        data: import("../schemas/ai-session.schema").AiSessionDocument[];
    }>;
    findOne(id: string, userId: string): Promise<{
        data: import("../schemas/ai-session.schema").AiSessionDocument;
    }>;
    create(dto: CreateSessionDto, userId: string): Promise<{
        data: import("../schemas/ai-session.schema").AiSessionDocument;
    }>;
    updateTitle(id: string, dto: UpdateSessionDto, userId: string): Promise<{
        data: import("../schemas/ai-session.schema").AiSessionDocument;
    }>;
    delete(id: string, userId: string): Promise<{
        success: boolean;
    }>;
}
