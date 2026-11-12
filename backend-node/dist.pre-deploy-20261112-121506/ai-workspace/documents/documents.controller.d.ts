import { AiDocumentsService } from './documents.service';
import { UpdateDocumentDto, AppendDocumentDto } from './dto/document.dto';
export declare class AiDocumentsController {
    private readonly documentsService;
    constructor(documentsService: AiDocumentsService);
    findOne(id: string, userId: string): Promise<{
        data: import("../schemas/ai-document.schema").AiDocumentDocument;
    }>;
    update(id: string, dto: UpdateDocumentDto, userId: string): Promise<{
        data: import("../schemas/ai-document.schema").AiDocumentDocument;
    }>;
    append(id: string, dto: AppendDocumentDto, userId: string): Promise<{
        data: import("../schemas/ai-document.schema").AiDocumentDocument;
        updated: boolean;
    }>;
    delete(id: string, userId: string): Promise<{
        success: boolean;
    }>;
}
