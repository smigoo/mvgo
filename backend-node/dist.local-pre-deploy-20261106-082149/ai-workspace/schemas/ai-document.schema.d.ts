import { Document, Types } from 'mongoose';
export type AiDocumentDocument = AiDocument & Document;
export declare class AiDocument {
    sessionId: Types.ObjectId;
    projectId: Types.ObjectId;
    userId: Types.ObjectId;
    title: string;
    content: string;
    sortOrder: number;
    status: string;
    visibility: string;
    sharedUsers: Array<{
        userId: Types.ObjectId;
        canView: boolean;
        canEdit: boolean;
    }>;
    sharedGroupIds: Types.ObjectId[];
    gitSynced: boolean;
    gitLastCommitSha: string;
}
export declare const AiDocumentSchema: import("mongoose").Schema<AiDocument, import("mongoose").Model<AiDocument, any, any, any, any, any, AiDocument>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, AiDocument, Document<unknown, {}, AiDocument, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<AiDocument & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & import("mongoose").HydratedDocumentOverrides<{
    id: string;
}>, {
    sessionId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, AiDocument, Document<unknown, {}, AiDocument, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiDocument & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    projectId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, AiDocument, Document<unknown, {}, AiDocument, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiDocument & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    userId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, AiDocument, Document<unknown, {}, AiDocument, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiDocument & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    title?: import("mongoose").SchemaDefinitionProperty<string, AiDocument, Document<unknown, {}, AiDocument, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiDocument & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    content?: import("mongoose").SchemaDefinitionProperty<string, AiDocument, Document<unknown, {}, AiDocument, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiDocument & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    sortOrder?: import("mongoose").SchemaDefinitionProperty<number, AiDocument, Document<unknown, {}, AiDocument, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiDocument & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    status?: import("mongoose").SchemaDefinitionProperty<string, AiDocument, Document<unknown, {}, AiDocument, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiDocument & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    visibility?: import("mongoose").SchemaDefinitionProperty<string, AiDocument, Document<unknown, {}, AiDocument, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiDocument & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    sharedUsers?: import("mongoose").SchemaDefinitionProperty<{
        userId: Types.ObjectId;
        canView: boolean;
        canEdit: boolean;
    }[], AiDocument, Document<unknown, {}, AiDocument, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiDocument & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    sharedGroupIds?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId[], AiDocument, Document<unknown, {}, AiDocument, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiDocument & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    gitSynced?: import("mongoose").SchemaDefinitionProperty<boolean, AiDocument, Document<unknown, {}, AiDocument, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiDocument & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    gitLastCommitSha?: import("mongoose").SchemaDefinitionProperty<string, AiDocument, Document<unknown, {}, AiDocument, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiDocument & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
}, AiDocument>;
