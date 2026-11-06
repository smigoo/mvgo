import { Document, Types } from 'mongoose';
export type UserAiConfigDocument = UserAiConfig & Document;
export declare class UserAiConfig {
    userId: Types.ObjectId;
    configEnc?: string | null;
    verifiedModels?: Record<string, {
        text: boolean;
        vision: boolean;
        at: number;
    }>;
}
export declare const UserAiConfigSchema: import("mongoose").Schema<UserAiConfig, import("mongoose").Model<UserAiConfig, any, any, any, any, any, UserAiConfig>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, UserAiConfig, Document<unknown, {}, UserAiConfig, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<UserAiConfig & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & import("mongoose").HydratedDocumentOverrides<{
    id: string;
}>, {
    userId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, UserAiConfig, Document<unknown, {}, UserAiConfig, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserAiConfig & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    configEnc?: import("mongoose").SchemaDefinitionProperty<string | null | undefined, UserAiConfig, Document<unknown, {}, UserAiConfig, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserAiConfig & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    verifiedModels?: import("mongoose").SchemaDefinitionProperty<Record<string, {
        text: boolean;
        vision: boolean;
        at: number;
    }> | undefined, UserAiConfig, Document<unknown, {}, UserAiConfig, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserAiConfig & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
}, UserAiConfig>;
