import { Model, Types } from 'mongoose';
import { Document } from './schemas/document.schema';
import { CreateDocumentDto, UpdateDocumentDto } from './dto/document.dto';
export declare class DocumentService {
    private documentModel;
    constructor(documentModel: Model<Document>);
    create(userId: string, groupId: string, dto: CreateDocumentDto): Promise<import("mongoose").Document<unknown, {}, Document, {}, import("mongoose").DefaultSchemaOptions> & Document & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    } & {
        id: string;
    }>;
    findAll(groupId: string, userId?: string): Promise<(import("mongoose").Document<unknown, {}, Document, {}, import("mongoose").DefaultSchemaOptions> & Document & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    } & {
        id: string;
    })[]>;
    findOne(id: string): Promise<(import("mongoose").Document<unknown, {}, Document, {}, import("mongoose").DefaultSchemaOptions> & Document & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    } & {
        id: string;
    }) | null>;
    update(id: string, userId: string, dto: UpdateDocumentDto): Promise<(import("mongoose").Document<unknown, {}, Document, {}, import("mongoose").DefaultSchemaOptions> & Document & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    } & {
        id: string;
    }) | null>;
    remove(id: string): Promise<(import("mongoose").Document<unknown, {}, Document, {}, import("mongoose").DefaultSchemaOptions> & Document & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    } & {
        id: string;
    }) | null>;
}
