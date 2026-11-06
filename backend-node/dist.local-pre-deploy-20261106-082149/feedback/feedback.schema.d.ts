import { Document } from 'mongoose';
export declare const FEEDBACK_STATUSES: readonly ["pending", "processing", "resolved", "rejected"];
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export declare const FEEDBACK_CATEGORIES: readonly ["bug", "quality", "suggestion", "other"];
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
export interface FeedbackSnapshot {
    taskStatus?: string;
    target?: string;
    componentId?: string;
    componentName?: string;
    taskError?: string;
    figmaUrl?: string;
    modelsUsed?: string[];
    logExcerpt?: string;
    logOriginalBytes?: number;
    logBytes?: number;
    logTruncated?: boolean;
    tokenFingerprint?: string;
    tokenFingerprintSource?: 'pipeline' | 'create';
    tokenFingerprintCurrent?: string;
    tokenFingerprintChanged?: boolean;
    included?: string[];
    pageUrl?: string;
    taskImages?: {
        input?: string;
        output?: string;
    };
}
export interface FeedbackAttachment {
    filename: string;
    storedName: string;
    relativePath: string;
    size: number;
    mimeType: string;
}
export declare class TaskFeedback {
    sessionId: string;
    userId: string;
    username?: string;
    category: FeedbackCategory;
    description: string;
    status: FeedbackStatus;
    snapshot: FeedbackSnapshot;
    attachment?: FeedbackAttachment | null;
    adminNote?: string;
    handledBy?: string;
    handledByName?: string;
    handledAt?: Date;
    source?: string;
    userAgent?: string;
}
export type TaskFeedbackDocument = TaskFeedback & Document;
export declare const TaskFeedbackSchema: import("mongoose").Schema<TaskFeedback, import("mongoose").Model<TaskFeedback, any, any, any, any, any, TaskFeedback>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, TaskFeedback, Document<unknown, {}, TaskFeedback, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<TaskFeedback & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & import("mongoose").HydratedDocumentOverrides<{
    id: string;
}>, {
    sessionId?: import("mongoose").SchemaDefinitionProperty<string, TaskFeedback, Document<unknown, {}, TaskFeedback, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TaskFeedback & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    userId?: import("mongoose").SchemaDefinitionProperty<string, TaskFeedback, Document<unknown, {}, TaskFeedback, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TaskFeedback & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    username?: import("mongoose").SchemaDefinitionProperty<string | undefined, TaskFeedback, Document<unknown, {}, TaskFeedback, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TaskFeedback & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    category?: import("mongoose").SchemaDefinitionProperty<"other" | "suggestion" | "quality" | "bug", TaskFeedback, Document<unknown, {}, TaskFeedback, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TaskFeedback & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    description?: import("mongoose").SchemaDefinitionProperty<string, TaskFeedback, Document<unknown, {}, TaskFeedback, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TaskFeedback & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    status?: import("mongoose").SchemaDefinitionProperty<"pending" | "rejected" | "processing" | "resolved", TaskFeedback, Document<unknown, {}, TaskFeedback, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TaskFeedback & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    snapshot?: import("mongoose").SchemaDefinitionProperty<FeedbackSnapshot, TaskFeedback, Document<unknown, {}, TaskFeedback, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TaskFeedback & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    attachment?: import("mongoose").SchemaDefinitionProperty<FeedbackAttachment | null | undefined, TaskFeedback, Document<unknown, {}, TaskFeedback, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TaskFeedback & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    adminNote?: import("mongoose").SchemaDefinitionProperty<string | undefined, TaskFeedback, Document<unknown, {}, TaskFeedback, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TaskFeedback & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    handledBy?: import("mongoose").SchemaDefinitionProperty<string | undefined, TaskFeedback, Document<unknown, {}, TaskFeedback, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TaskFeedback & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    handledByName?: import("mongoose").SchemaDefinitionProperty<string | undefined, TaskFeedback, Document<unknown, {}, TaskFeedback, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TaskFeedback & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    handledAt?: import("mongoose").SchemaDefinitionProperty<Date | undefined, TaskFeedback, Document<unknown, {}, TaskFeedback, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TaskFeedback & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    source?: import("mongoose").SchemaDefinitionProperty<string | undefined, TaskFeedback, Document<unknown, {}, TaskFeedback, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TaskFeedback & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    userAgent?: import("mongoose").SchemaDefinitionProperty<string | undefined, TaskFeedback, Document<unknown, {}, TaskFeedback, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TaskFeedback & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
}, TaskFeedback>;
