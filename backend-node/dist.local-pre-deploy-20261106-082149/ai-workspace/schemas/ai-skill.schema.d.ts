import { Document, Types } from 'mongoose';
export type AiSkillDocument = AiSkill & Document;
export declare class AiSkill {
    name: string;
    description: string;
    promptTemplate: string;
    type: string;
    visibility: string;
    ownerUserId: Types.ObjectId;
    groupIds: Types.ObjectId[];
    status: string;
    sortOrder: number;
    reviewRequired: boolean;
    reviewedBy: Types.ObjectId;
}
export declare const AiSkillSchema: import("mongoose").Schema<AiSkill, import("mongoose").Model<AiSkill, any, any, any, any, any, AiSkill>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, AiSkill, Document<unknown, {}, AiSkill, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<AiSkill & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & import("mongoose").HydratedDocumentOverrides<{
    id: string;
}>, {
    name?: import("mongoose").SchemaDefinitionProperty<string, AiSkill, Document<unknown, {}, AiSkill, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiSkill & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    description?: import("mongoose").SchemaDefinitionProperty<string, AiSkill, Document<unknown, {}, AiSkill, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiSkill & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    promptTemplate?: import("mongoose").SchemaDefinitionProperty<string, AiSkill, Document<unknown, {}, AiSkill, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiSkill & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    type?: import("mongoose").SchemaDefinitionProperty<string, AiSkill, Document<unknown, {}, AiSkill, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiSkill & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    visibility?: import("mongoose").SchemaDefinitionProperty<string, AiSkill, Document<unknown, {}, AiSkill, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiSkill & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    ownerUserId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, AiSkill, Document<unknown, {}, AiSkill, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiSkill & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    groupIds?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId[], AiSkill, Document<unknown, {}, AiSkill, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiSkill & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    status?: import("mongoose").SchemaDefinitionProperty<string, AiSkill, Document<unknown, {}, AiSkill, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiSkill & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    sortOrder?: import("mongoose").SchemaDefinitionProperty<number, AiSkill, Document<unknown, {}, AiSkill, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiSkill & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    reviewRequired?: import("mongoose").SchemaDefinitionProperty<boolean, AiSkill, Document<unknown, {}, AiSkill, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiSkill & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    reviewedBy?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, AiSkill, Document<unknown, {}, AiSkill, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AiSkill & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
}, AiSkill>;
