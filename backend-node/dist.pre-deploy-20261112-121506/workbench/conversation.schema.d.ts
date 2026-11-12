import { Document, Types } from 'mongoose';
export type ConversationDocument = Conversation & Document;
export type CardType = 'progress' | 'preview' | 'confirm' | 'diff' | 'stats' | 'list' | 'action';
export type MessageRole = 'user' | 'assistant' | 'system';
export declare class MessageCard {
    type: CardType;
    data: Record<string, any>;
}
export declare const MessageCardSchema: import("mongoose").Schema<MessageCard, import("mongoose").Model<MessageCard, any, any, any, any, any, MessageCard>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, MessageCard, Document<unknown, {}, MessageCard, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<MessageCard & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & import("mongoose").HydratedDocumentOverrides<{
    id: string;
}>, {
    type?: import("mongoose").SchemaDefinitionProperty<CardType, MessageCard, Document<unknown, {}, MessageCard, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<MessageCard & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    data?: import("mongoose").SchemaDefinitionProperty<Record<string, any>, MessageCard, Document<unknown, {}, MessageCard, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<MessageCard & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
}, MessageCard>;
export declare class Message {
    id: string;
    role: MessageRole;
    content: string;
    cards: MessageCard[];
    createdAt: Date;
    toolCallId?: string;
    metadata?: Record<string, any>;
}
export declare const MessageSchema: import("mongoose").Schema<Message, import("mongoose").Model<Message, any, any, any, any, any, Message>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Message, Document<unknown, {}, Message, {}, import("mongoose").DefaultSchemaOptions> & Message & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, {
    id?: import("mongoose").SchemaDefinitionProperty<string, Message, Document<unknown, {}, Message, {}, import("mongoose").DefaultSchemaOptions> & Message & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }> | undefined;
    role?: import("mongoose").SchemaDefinitionProperty<MessageRole, Message, Document<unknown, {}, Message, {}, import("mongoose").DefaultSchemaOptions> & Message & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }> | undefined;
    content?: import("mongoose").SchemaDefinitionProperty<string, Message, Document<unknown, {}, Message, {}, import("mongoose").DefaultSchemaOptions> & Message & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }> | undefined;
    cards?: import("mongoose").SchemaDefinitionProperty<MessageCard[], Message, Document<unknown, {}, Message, {}, import("mongoose").DefaultSchemaOptions> & Message & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }> | undefined;
    createdAt?: import("mongoose").SchemaDefinitionProperty<Date, Message, Document<unknown, {}, Message, {}, import("mongoose").DefaultSchemaOptions> & Message & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }> | undefined;
    toolCallId?: import("mongoose").SchemaDefinitionProperty<string | undefined, Message, Document<unknown, {}, Message, {}, import("mongoose").DefaultSchemaOptions> & Message & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }> | undefined;
    metadata?: import("mongoose").SchemaDefinitionProperty<Record<string, any> | undefined, Message, Document<unknown, {}, Message, {}, import("mongoose").DefaultSchemaOptions> & Message & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }> | undefined;
}, Message>;
export declare class ConversationGroup {
    name: string;
    color?: string;
    order: number;
}
export declare const ConversationGroupSchema: import("mongoose").Schema<ConversationGroup, import("mongoose").Model<ConversationGroup, any, any, any, any, any, ConversationGroup>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, ConversationGroup, Document<unknown, {}, ConversationGroup, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<ConversationGroup & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & import("mongoose").HydratedDocumentOverrides<{
    id: string;
}>, {
    name?: import("mongoose").SchemaDefinitionProperty<string, ConversationGroup, Document<unknown, {}, ConversationGroup, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ConversationGroup & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    color?: import("mongoose").SchemaDefinitionProperty<string | undefined, ConversationGroup, Document<unknown, {}, ConversationGroup, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ConversationGroup & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    order?: import("mongoose").SchemaDefinitionProperty<number, ConversationGroup, Document<unknown, {}, ConversationGroup, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ConversationGroup & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
}, ConversationGroup>;
export declare class Conversation {
    conversationId: string;
    userId: Types.ObjectId;
    title: string;
    messages: Message[];
    currentComponentId?: string;
    context: Record<string, any>;
    lastActiveAt: Date;
    messageCount: number;
    group?: string;
    pinned?: boolean;
    toolCredentials?: {
        figmaToken?: string;
        apifoxToken?: string;
        gitlabToken?: string;
        gitlabProjectUrl?: string;
    };
    shared?: boolean;
    sharedWith?: Types.ObjectId[];
}
export declare const ConversationSchema: import("mongoose").Schema<Conversation, import("mongoose").Model<Conversation, any, any, any, any, any, Conversation>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Conversation, Document<unknown, {}, Conversation, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<Conversation & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & import("mongoose").HydratedDocumentOverrides<{
    id: string;
}>, {
    conversationId?: import("mongoose").SchemaDefinitionProperty<string, Conversation, Document<unknown, {}, Conversation, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Conversation & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    userId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, Conversation, Document<unknown, {}, Conversation, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Conversation & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    title?: import("mongoose").SchemaDefinitionProperty<string, Conversation, Document<unknown, {}, Conversation, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Conversation & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    messages?: import("mongoose").SchemaDefinitionProperty<Message[], Conversation, Document<unknown, {}, Conversation, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Conversation & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    currentComponentId?: import("mongoose").SchemaDefinitionProperty<string | undefined, Conversation, Document<unknown, {}, Conversation, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Conversation & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    context?: import("mongoose").SchemaDefinitionProperty<Record<string, any>, Conversation, Document<unknown, {}, Conversation, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Conversation & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    lastActiveAt?: import("mongoose").SchemaDefinitionProperty<Date, Conversation, Document<unknown, {}, Conversation, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Conversation & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    messageCount?: import("mongoose").SchemaDefinitionProperty<number, Conversation, Document<unknown, {}, Conversation, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Conversation & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    group?: import("mongoose").SchemaDefinitionProperty<string | undefined, Conversation, Document<unknown, {}, Conversation, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Conversation & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    pinned?: import("mongoose").SchemaDefinitionProperty<boolean | undefined, Conversation, Document<unknown, {}, Conversation, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Conversation & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    toolCredentials?: import("mongoose").SchemaDefinitionProperty<{
        figmaToken?: string;
        apifoxToken?: string;
        gitlabToken?: string;
        gitlabProjectUrl?: string;
    } | undefined, Conversation, Document<unknown, {}, Conversation, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Conversation & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    shared?: import("mongoose").SchemaDefinitionProperty<boolean | undefined, Conversation, Document<unknown, {}, Conversation, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Conversation & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    sharedWith?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId[] | undefined, Conversation, Document<unknown, {}, Conversation, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Conversation & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
}, Conversation>;
