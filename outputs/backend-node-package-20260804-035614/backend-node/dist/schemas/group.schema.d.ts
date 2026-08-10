import { Document, Types } from 'mongoose';
export type GroupDocument = Group & Document;
export declare class Group {
    name: string;
    description: string;
    adminId: Types.ObjectId;
    createdAt: Date;
}
export declare const GroupSchema: import("mongoose").Schema<Group, import("mongoose").Model<Group, any, any, any, any, any, Group>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Group, Document<unknown, {}, Group, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<Group & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & import("mongoose").HydratedDocumentOverrides<{
    id: string;
}>, {
    name?: import("mongoose").SchemaDefinitionProperty<string, Group, Document<unknown, {}, Group, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Group & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    description?: import("mongoose").SchemaDefinitionProperty<string, Group, Document<unknown, {}, Group, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Group & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    adminId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, Group, Document<unknown, {}, Group, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Group & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    createdAt?: import("mongoose").SchemaDefinitionProperty<Date, Group, Document<unknown, {}, Group, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Group & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
}, Group>;
