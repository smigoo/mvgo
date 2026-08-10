import { Document, Types } from 'mongoose';
export type AiGitCredentialDocument = AiGitCredential & Document;
export declare class AiGitCredential {
    userId: Types.ObjectId;
    type: string;
    token: string;
    description: string;
}
export declare const AiGitCredentialSchema: import("mongoose").Schema<AiGitCredential, import("mongoose").Model<AiGitCredential, any, any, any, any, any, AiGitCredential>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, AiGitCredential, Document<unknown, {}, AiGitCredential, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<AiGitCredential & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & import("mongoose").HydratedDocumentOverrides<{
    id: string;
}>, {
    userId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, AiGitCredential, Document<unknown, {}, AiGitCredential, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiGitCredential & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    type?: import("mongoose").SchemaDefinitionProperty<string, AiGitCredential, Document<unknown, {}, AiGitCredential, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiGitCredential & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    token?: import("mongoose").SchemaDefinitionProperty<string, AiGitCredential, Document<unknown, {}, AiGitCredential, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiGitCredential & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    description?: import("mongoose").SchemaDefinitionProperty<string, AiGitCredential, Document<unknown, {}, AiGitCredential, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiGitCredential & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
}, AiGitCredential>;
