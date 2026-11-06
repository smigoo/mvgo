import { Document, Types } from 'mongoose';
export type WorkbenchGroupDocument = WorkbenchGroup & Document;
export declare class WorkbenchGroup {
    userId: Types.ObjectId;
    name: string;
    order: number;
}
export declare const WorkbenchGroupSchema: import("mongoose").Schema<WorkbenchGroup, import("mongoose").Model<WorkbenchGroup, any, any, any, any, any, WorkbenchGroup>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, WorkbenchGroup, Document<unknown, {}, WorkbenchGroup, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<WorkbenchGroup & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & import("mongoose").HydratedDocumentOverrides<{
    id: string;
}>, {
    userId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, WorkbenchGroup, Document<unknown, {}, WorkbenchGroup, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<WorkbenchGroup & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    name?: import("mongoose").SchemaDefinitionProperty<string, WorkbenchGroup, Document<unknown, {}, WorkbenchGroup, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<WorkbenchGroup & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    order?: import("mongoose").SchemaDefinitionProperty<number, WorkbenchGroup, Document<unknown, {}, WorkbenchGroup, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<WorkbenchGroup & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
}, WorkbenchGroup>;
