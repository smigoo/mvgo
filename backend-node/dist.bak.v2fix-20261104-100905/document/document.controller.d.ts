import { DocumentService } from './document.service';
import { CreateDocumentDto, UpdateDocumentDto } from './dto/document.dto';
export declare class DocumentController {
    private readonly documentService;
    constructor(documentService: DocumentService);
    create(dto: CreateDocumentDto, session: Record<string, any>): Promise<import("mongoose").Document<unknown, {}, import("./schemas/document.schema").Document, {}, import("mongoose").DefaultSchemaOptions> & import("./schemas/document.schema").Document & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    } & {
        id: string;
    }>;
    findAll(myOnly: string, session: Record<string, any>): Promise<(import("mongoose").Document<unknown, {}, import("./schemas/document.schema").Document, {}, import("mongoose").DefaultSchemaOptions> & import("./schemas/document.schema").Document & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    } & {
        id: string;
    })[]>;
    findOne(id: string): Promise<(import("mongoose").Document<unknown, {}, import("./schemas/document.schema").Document, {}, import("mongoose").DefaultSchemaOptions> & import("./schemas/document.schema").Document & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    } & {
        id: string;
    }) | null>;
    update(id: string, dto: UpdateDocumentDto, session: Record<string, any>): Promise<(import("mongoose").Document<unknown, {}, import("./schemas/document.schema").Document, {}, import("mongoose").DefaultSchemaOptions> & import("./schemas/document.schema").Document & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    } & {
        id: string;
    }) | null>;
    remove(id: string): Promise<(import("mongoose").Document<unknown, {}, import("./schemas/document.schema").Document, {}, import("mongoose").DefaultSchemaOptions> & import("./schemas/document.schema").Document & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    } & {
        id: string;
    }) | null>;
}
