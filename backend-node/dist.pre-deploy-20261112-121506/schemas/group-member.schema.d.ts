import { Document, Types } from 'mongoose';
export type GroupMemberDocument = GroupMember & Document;
export declare class GroupMember {
    groupId: Types.ObjectId;
    userId: Types.ObjectId;
    role: string;
    permissions: string[];
    joinedAt: Date;
}
export declare const GroupMemberSchema: import("mongoose").Schema<GroupMember, import("mongoose").Model<GroupMember, any, any, any, any, any, GroupMember>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, GroupMember, Document<unknown, {}, GroupMember, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<GroupMember & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & import("mongoose").HydratedDocumentOverrides<{
    id: string;
}>, {
    groupId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, GroupMember, Document<unknown, {}, GroupMember, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GroupMember & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    userId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, GroupMember, Document<unknown, {}, GroupMember, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GroupMember & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    role?: import("mongoose").SchemaDefinitionProperty<string, GroupMember, Document<unknown, {}, GroupMember, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GroupMember & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    permissions?: import("mongoose").SchemaDefinitionProperty<string[], GroupMember, Document<unknown, {}, GroupMember, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GroupMember & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    joinedAt?: import("mongoose").SchemaDefinitionProperty<Date, GroupMember, Document<unknown, {}, GroupMember, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GroupMember & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
}, GroupMember>;
