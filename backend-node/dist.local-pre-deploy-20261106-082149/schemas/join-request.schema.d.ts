import { HydratedDocument, Types } from 'mongoose';
export type JoinRequestDocument = HydratedDocument<JoinRequest>;
export declare class JoinRequest {
    _id: string;
    groupId: Types.ObjectId;
    userId: Types.ObjectId;
    status: string;
    message: string;
    createdAt: Date;
    processedAt: Date;
    processedBy: Types.ObjectId;
}
export declare const JoinRequestSchema: import("mongoose").Schema<JoinRequest, import("mongoose").Model<JoinRequest, any, any, any, any, any, JoinRequest>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, JoinRequest, import("mongoose").Document<unknown, {}, JoinRequest, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<JoinRequest & Required<{
    _id: string;
}> & {
    __v: number;
}, "id"> & import("mongoose").HydratedDocumentOverrides<{
    id: string;
}>, {
    _id?: import("mongoose").SchemaDefinitionProperty<string, JoinRequest, import("mongoose").Document<unknown, {}, JoinRequest, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<JoinRequest & Required<{
        _id: string;
    }> & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    groupId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, JoinRequest, import("mongoose").Document<unknown, {}, JoinRequest, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<JoinRequest & Required<{
        _id: string;
    }> & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    userId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, JoinRequest, import("mongoose").Document<unknown, {}, JoinRequest, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<JoinRequest & Required<{
        _id: string;
    }> & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    status?: import("mongoose").SchemaDefinitionProperty<string, JoinRequest, import("mongoose").Document<unknown, {}, JoinRequest, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<JoinRequest & Required<{
        _id: string;
    }> & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    message?: import("mongoose").SchemaDefinitionProperty<string, JoinRequest, import("mongoose").Document<unknown, {}, JoinRequest, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<JoinRequest & Required<{
        _id: string;
    }> & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    createdAt?: import("mongoose").SchemaDefinitionProperty<Date, JoinRequest, import("mongoose").Document<unknown, {}, JoinRequest, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<JoinRequest & Required<{
        _id: string;
    }> & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    processedAt?: import("mongoose").SchemaDefinitionProperty<Date, JoinRequest, import("mongoose").Document<unknown, {}, JoinRequest, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<JoinRequest & Required<{
        _id: string;
    }> & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    processedBy?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, JoinRequest, import("mongoose").Document<unknown, {}, JoinRequest, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<JoinRequest & Required<{
        _id: string;
    }> & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
}, JoinRequest>;
