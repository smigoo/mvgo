import { Document as MongooseDocument, Types } from 'mongoose';
export declare class Document extends MongooseDocument {
    title: string;
    content: string;
    type: string;
    ownerId: Types.ObjectId;
    groupId: Types.ObjectId;
    visibility: string;
    tags: string[];
    status: string;
    lastEditedBy: Types.ObjectId;
}
export declare const DocumentSchema: import("mongoose").Schema<Document, import("mongoose").Model<Document, any, any, any, any, any, Document>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Document, MongooseDocument<unknown, {}, Document, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<Document & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, "id"> & import("mongoose").HydratedDocumentOverrides<{
    id: string;
}>, {
    _id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, Document, MongooseDocument<unknown, {}, Document, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Document & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    type?: import("mongoose").SchemaDefinitionProperty<string, Document, MongooseDocument<unknown, {}, Document, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Document & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    groupId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, Document, MongooseDocument<unknown, {}, Document, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Document & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    status?: import("mongoose").SchemaDefinitionProperty<string, Document, MongooseDocument<unknown, {}, Document, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Document & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    title?: import("mongoose").SchemaDefinitionProperty<string, Document, MongooseDocument<unknown, {}, Document, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Document & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    content?: import("mongoose").SchemaDefinitionProperty<string, Document, MongooseDocument<unknown, {}, Document, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Document & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    ownerId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, Document, MongooseDocument<unknown, {}, Document, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Document & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    visibility?: import("mongoose").SchemaDefinitionProperty<string, Document, MongooseDocument<unknown, {}, Document, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Document & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    tags?: import("mongoose").SchemaDefinitionProperty<string[], Document, MongooseDocument<unknown, {}, Document, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Document & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    lastEditedBy?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, Document, MongooseDocument<unknown, {}, Document, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Document & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
}, Document>;
