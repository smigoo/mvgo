import { Document, Types } from 'mongoose';
export type AiSessionDocument = AiSession & Document;
export declare class AiSession {
    projectId: Types.ObjectId;
    userId: Types.ObjectId;
    title: string;
    modelProvider: string;
    modelName: string;
    messages: Array<{
        role: string;
        content: string;
        toolCalls?: any[];
        createdAt: Date;
    }>;
    messageCount: number;
}
export declare const AiSessionSchema: import("mongoose").Schema<AiSession, import("mongoose").Model<AiSession, any, any, any, any, any, AiSession>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, AiSession, Document<unknown, {}, AiSession, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<AiSession & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & import("mongoose").HydratedDocumentOverrides<{
    id: string;
}>, {
    projectId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, AiSession, Document<unknown, {}, AiSession, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiSession & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    userId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, AiSession, Document<unknown, {}, AiSession, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiSession & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    title?: import("mongoose").SchemaDefinitionProperty<string, AiSession, Document<unknown, {}, AiSession, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiSession & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    modelProvider?: import("mongoose").SchemaDefinitionProperty<string, AiSession, Document<unknown, {}, AiSession, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiSession & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    modelName?: import("mongoose").SchemaDefinitionProperty<string, AiSession, Document<unknown, {}, AiSession, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiSession & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    messages?: import("mongoose").SchemaDefinitionProperty<{
        role: string;
        content: string;
        toolCalls?: any[];
        createdAt: Date;
    }[], AiSession, Document<unknown, {}, AiSession, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiSession & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    messageCount?: import("mongoose").SchemaDefinitionProperty<number, AiSession, Document<unknown, {}, AiSession, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiSession & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
}, AiSession>;
