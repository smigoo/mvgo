import { Document, Types } from 'mongoose';
export type OperationLogDocument = OperationLog & Document;
export declare class OperationLog {
    userId?: Types.ObjectId | null;
    method: string;
    path: string;
    query?: Record<string, any>;
    body?: Record<string, any>;
    statusCode: number;
    ip?: string;
    durationMs: number;
    userAgent?: string;
    errorMessage?: string;
}
export declare const OperationLogSchema: import("mongoose").Schema<OperationLog, import("mongoose").Model<OperationLog, any, any, any, any, any, OperationLog>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, OperationLog, Document<unknown, {}, OperationLog, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<OperationLog & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & import("mongoose").HydratedDocumentOverrides<{
    id: string;
}>, {
    userId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId | null | undefined, OperationLog, Document<unknown, {}, OperationLog, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<OperationLog & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    method?: import("mongoose").SchemaDefinitionProperty<string, OperationLog, Document<unknown, {}, OperationLog, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<OperationLog & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    path?: import("mongoose").SchemaDefinitionProperty<string, OperationLog, Document<unknown, {}, OperationLog, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<OperationLog & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    query?: import("mongoose").SchemaDefinitionProperty<Record<string, any> | undefined, OperationLog, Document<unknown, {}, OperationLog, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<OperationLog & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    body?: import("mongoose").SchemaDefinitionProperty<Record<string, any> | undefined, OperationLog, Document<unknown, {}, OperationLog, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<OperationLog & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    statusCode?: import("mongoose").SchemaDefinitionProperty<number, OperationLog, Document<unknown, {}, OperationLog, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<OperationLog & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    ip?: import("mongoose").SchemaDefinitionProperty<string | undefined, OperationLog, Document<unknown, {}, OperationLog, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<OperationLog & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    durationMs?: import("mongoose").SchemaDefinitionProperty<number, OperationLog, Document<unknown, {}, OperationLog, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<OperationLog & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    userAgent?: import("mongoose").SchemaDefinitionProperty<string | undefined, OperationLog, Document<unknown, {}, OperationLog, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<OperationLog & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    errorMessage?: import("mongoose").SchemaDefinitionProperty<string | undefined, OperationLog, Document<unknown, {}, OperationLog, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<OperationLog & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
}, OperationLog>;
