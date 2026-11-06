import { Model } from 'mongoose';
import { AiDocumentDocument } from '../schemas/ai-document.schema';
import { UpdateDocumentDto, AppendDocumentDto } from './dto/document.dto';
export declare class AiDocumentsService {
    private documentModel;
    private readonly logger;
    constructor(documentModel: Model<AiDocumentDocument>);
    findBySession(sessionId: string, userId?: string): Promise<AiDocumentDocument[]>;
    findById(id: string, userId?: string): Promise<AiDocumentDocument | null>;
    create(params: {
        sessionId: string;
        projectId: string;
        userId: string;
        title?: string;
        content?: string;
    }): Promise<AiDocumentDocument>;
    ensureDocument(params: {
        sessionId: string;
        projectId: string;
        userId: string;
        title?: string;
    }): Promise<AiDocumentDocument>;
    update(id: string, dto: UpdateDocumentDto, userId?: string): Promise<AiDocumentDocument | null>;
    appendContent(id: string, dto: AppendDocumentDto, userId?: string): Promise<AiDocumentDocument | null>;
    delete(id: string, userId: string): Promise<AiDocumentDocument | null>;
}
