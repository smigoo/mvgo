import { Document, Types } from 'mongoose';
export type AiProjectDocument = AiProject & Document;
export declare class AiProject {
    name: string;
    description: string;
    gitUrl: string;
    gitBranch: string;
    gitDefaultPath: string;
    adminUserIds: Types.ObjectId[];
    authorizedGroupIds: Types.ObjectId[];
    status: string;
}
export declare const AiProjectSchema: import("mongoose").Schema<AiProject, import("mongoose").Model<AiProject, any, any, any, any, any, AiProject>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, AiProject, Document<unknown, {}, AiProject, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<AiProject & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & import("mongoose").HydratedDocumentOverrides<{
    id: string;
}>, {
    name?: import("mongoose").SchemaDefinitionProperty<string, AiProject, Document<unknown, {}, AiProject, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiProject & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    description?: import("mongoose").SchemaDefinitionProperty<string, AiProject, Document<unknown, {}, AiProject, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiProject & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    gitUrl?: import("mongoose").SchemaDefinitionProperty<string, AiProject, Document<unknown, {}, AiProject, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiProject & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    gitBranch?: import("mongoose").SchemaDefinitionProperty<string, AiProject, Document<unknown, {}, AiProject, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiProject & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    gitDefaultPath?: import("mongoose").SchemaDefinitionProperty<string, AiProject, Document<unknown, {}, AiProject, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiProject & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    adminUserIds?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId[], AiProject, Document<unknown, {}, AiProject, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiProject & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    authorizedGroupIds?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId[], AiProject, Document<unknown, {}, AiProject, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiProject & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    status?: import("mongoose").SchemaDefinitionProperty<string, AiProject, Document<unknown, {}, AiProject, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiProject & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
}, AiProject>;
