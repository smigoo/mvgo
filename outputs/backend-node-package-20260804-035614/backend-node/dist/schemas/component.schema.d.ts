import { Document, Types } from 'mongoose';
export type ComponentDocument = Component & Document;
export declare class Component {
    componentId?: string;
    taskId?: string;
    target?: 'microcode' | 'vue3';
    name: string;
    description: string;
    creatorId: Types.ObjectId;
    groupId: Types.ObjectId;
    metadata: Record<string, any>;
    createdAt: Date;
}
export declare const ComponentSchema: import("mongoose").Schema<Component, import("mongoose").Model<Component, any, any, any, any, any, Component>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Component, Document<unknown, {}, Component, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<Component & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & import("mongoose").HydratedDocumentOverrides<{
    id: string;
}>, {
    componentId?: import("mongoose").SchemaDefinitionProperty<string | undefined, Component, Document<unknown, {}, Component, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Component & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    taskId?: import("mongoose").SchemaDefinitionProperty<string | undefined, Component, Document<unknown, {}, Component, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Component & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    target?: import("mongoose").SchemaDefinitionProperty<"microcode" | "vue3" | undefined, Component, Document<unknown, {}, Component, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Component & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    name?: import("mongoose").SchemaDefinitionProperty<string, Component, Document<unknown, {}, Component, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Component & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    description?: import("mongoose").SchemaDefinitionProperty<string, Component, Document<unknown, {}, Component, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Component & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    creatorId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, Component, Document<unknown, {}, Component, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Component & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    groupId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, Component, Document<unknown, {}, Component, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Component & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    metadata?: import("mongoose").SchemaDefinitionProperty<Record<string, any>, Component, Document<unknown, {}, Component, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Component & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    createdAt?: import("mongoose").SchemaDefinitionProperty<Date, Component, Document<unknown, {}, Component, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Component & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
}, Component>;
