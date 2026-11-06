import { Document } from 'mongoose';
export type TokenUsageDocument = TokenUsage & Document;
export declare class TokenUsage {
    sessionId: string;
    nodeName: string;
    model: string;
    modelType: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    duration: number;
    timestamp: Date;
    componentName?: string;
    fileKey?: string;
    nodeId?: string;
    userId?: string;
    baseURL?: string;
}
export declare const TokenUsageSchema: import("mongoose").Schema<TokenUsage, import("mongoose").Model<TokenUsage, any, any, any, any, any, TokenUsage>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, TokenUsage, Document<unknown, {}, TokenUsage, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<TokenUsage & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & import("mongoose").HydratedDocumentOverrides<{
    id: string;
}>, {
    sessionId?: import("mongoose").SchemaDefinitionProperty<string, TokenUsage, Document<unknown, {}, TokenUsage, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TokenUsage & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    nodeName?: import("mongoose").SchemaDefinitionProperty<string, TokenUsage, Document<unknown, {}, TokenUsage, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TokenUsage & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    model?: import("mongoose").SchemaDefinitionProperty<string, TokenUsage, Document<unknown, {}, TokenUsage, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TokenUsage & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    modelType?: import("mongoose").SchemaDefinitionProperty<string, TokenUsage, Document<unknown, {}, TokenUsage, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TokenUsage & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    inputTokens?: import("mongoose").SchemaDefinitionProperty<number, TokenUsage, Document<unknown, {}, TokenUsage, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TokenUsage & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    outputTokens?: import("mongoose").SchemaDefinitionProperty<number, TokenUsage, Document<unknown, {}, TokenUsage, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TokenUsage & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    totalTokens?: import("mongoose").SchemaDefinitionProperty<number, TokenUsage, Document<unknown, {}, TokenUsage, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TokenUsage & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    duration?: import("mongoose").SchemaDefinitionProperty<number, TokenUsage, Document<unknown, {}, TokenUsage, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TokenUsage & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    timestamp?: import("mongoose").SchemaDefinitionProperty<Date, TokenUsage, Document<unknown, {}, TokenUsage, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TokenUsage & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    componentName?: import("mongoose").SchemaDefinitionProperty<string | undefined, TokenUsage, Document<unknown, {}, TokenUsage, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TokenUsage & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    fileKey?: import("mongoose").SchemaDefinitionProperty<string | undefined, TokenUsage, Document<unknown, {}, TokenUsage, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TokenUsage & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    nodeId?: import("mongoose").SchemaDefinitionProperty<string | undefined, TokenUsage, Document<unknown, {}, TokenUsage, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TokenUsage & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    userId?: import("mongoose").SchemaDefinitionProperty<string | undefined, TokenUsage, Document<unknown, {}, TokenUsage, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TokenUsage & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    baseURL?: import("mongoose").SchemaDefinitionProperty<string | undefined, TokenUsage, Document<unknown, {}, TokenUsage, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TokenUsage & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
}, TokenUsage>;
