import { AiChatService } from './chat.service';
import { SaveMessageDto } from './dto/chat.dto';
export declare class AiChatController {
    private readonly chatService;
    constructor(chatService: AiChatService);
    save(dto: SaveMessageDto, userId: string): Promise<{
        sessionId: string;
        documentId: any;
        documentUpdated: boolean;
    }>;
}
