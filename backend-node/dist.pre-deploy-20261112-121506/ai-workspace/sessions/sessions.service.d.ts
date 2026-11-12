import { Model } from 'mongoose';
import { AiSessionDocument } from '../schemas/ai-session.schema';
import { CreateSessionDto } from '../chat/dto/chat.dto';
import { UpdateSessionDto } from '../chat/dto/chat.dto';
export declare class AiSessionsService {
    private sessionModel;
    private readonly logger;
    constructor(sessionModel: Model<AiSessionDocument>);
    findByUser(userId: string, projectId?: string): Promise<AiSessionDocument[]>;
    findById(id: string, userId?: string): Promise<AiSessionDocument | null>;
    create(dto: CreateSessionDto, userId: string): Promise<AiSessionDocument>;
    updateTitle(id: string, dto: UpdateSessionDto, userId?: string): Promise<AiSessionDocument | null>;
    delete(id: string, userId: string): Promise<AiSessionDocument | null>;
    pushMessages(id: string, messages: Array<{
        role: string;
        content: string;
        createdAt?: Date;
    }>, userId?: string): Promise<void>;
}
