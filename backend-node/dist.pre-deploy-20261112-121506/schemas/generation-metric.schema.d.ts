import { Document } from 'mongoose';
export type GenerationMetricDocument = GenerationMetric & Document;
export type GenerationMetricStatus = 'completed' | 'failed' | 'cancelled';
export interface GenerationGateResult {
    rule: string;
    level: 'block' | 'warn';
    pass: boolean;
    blockCount: number;
    warnCount: number;
    issueCount: number;
    retry?: number;
    humanOverride?: boolean;
}
export declare class GenerationMetric {
    sessionId: string;
    userId?: string;
    username?: string;
    uid?: string;
    deptName?: string;
    orgName?: string;
    target?: 'microcode' | 'vue3';
    sourceType?: 'figma' | 'screenshot' | 'html';
    generationTier?: 'max' | 'lite';
    taskType?: string;
    status: GenerationMetricStatus;
    cancelReason?: string;
    componentId?: string;
    componentName?: string;
    startTime?: number;
    endTime?: number;
    duration?: number;
    error?: string;
    qualityGate?: 'passed' | 'warned';
    textModel?: string;
    visionModel?: string;
    textRootDomain?: string;
    visionRootDomain?: string;
    rootDomains: string[];
    gates: GenerationGateResult[];
    excluded: boolean;
    excludedReason?: string;
}
export declare const GenerationMetricSchema: import("mongoose").Schema<GenerationMetric, import("mongoose").Model<GenerationMetric, any, any, any, any, any, GenerationMetric>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, GenerationMetric, Document<unknown, {}, GenerationMetric, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<GenerationMetric & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & import("mongoose").HydratedDocumentOverrides<{
    id: string;
}>, {
    sessionId?: import("mongoose").SchemaDefinitionProperty<string, GenerationMetric, Document<unknown, {}, GenerationMetric, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GenerationMetric & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    userId?: import("mongoose").SchemaDefinitionProperty<string | undefined, GenerationMetric, Document<unknown, {}, GenerationMetric, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GenerationMetric & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    username?: import("mongoose").SchemaDefinitionProperty<string | undefined, GenerationMetric, Document<unknown, {}, GenerationMetric, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GenerationMetric & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    uid?: import("mongoose").SchemaDefinitionProperty<string | undefined, GenerationMetric, Document<unknown, {}, GenerationMetric, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GenerationMetric & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    deptName?: import("mongoose").SchemaDefinitionProperty<string | undefined, GenerationMetric, Document<unknown, {}, GenerationMetric, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GenerationMetric & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    orgName?: import("mongoose").SchemaDefinitionProperty<string | undefined, GenerationMetric, Document<unknown, {}, GenerationMetric, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GenerationMetric & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    target?: import("mongoose").SchemaDefinitionProperty<"microcode" | "vue3" | undefined, GenerationMetric, Document<unknown, {}, GenerationMetric, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GenerationMetric & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    sourceType?: import("mongoose").SchemaDefinitionProperty<"screenshot" | "figma" | "html" | undefined, GenerationMetric, Document<unknown, {}, GenerationMetric, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GenerationMetric & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    generationTier?: import("mongoose").SchemaDefinitionProperty<"max" | "lite" | undefined, GenerationMetric, Document<unknown, {}, GenerationMetric, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GenerationMetric & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    taskType?: import("mongoose").SchemaDefinitionProperty<string | undefined, GenerationMetric, Document<unknown, {}, GenerationMetric, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GenerationMetric & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    status?: import("mongoose").SchemaDefinitionProperty<GenerationMetricStatus, GenerationMetric, Document<unknown, {}, GenerationMetric, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GenerationMetric & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    cancelReason?: import("mongoose").SchemaDefinitionProperty<string | undefined, GenerationMetric, Document<unknown, {}, GenerationMetric, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GenerationMetric & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    componentId?: import("mongoose").SchemaDefinitionProperty<string | undefined, GenerationMetric, Document<unknown, {}, GenerationMetric, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GenerationMetric & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    componentName?: import("mongoose").SchemaDefinitionProperty<string | undefined, GenerationMetric, Document<unknown, {}, GenerationMetric, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GenerationMetric & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    startTime?: import("mongoose").SchemaDefinitionProperty<number | undefined, GenerationMetric, Document<unknown, {}, GenerationMetric, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GenerationMetric & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    endTime?: import("mongoose").SchemaDefinitionProperty<number | undefined, GenerationMetric, Document<unknown, {}, GenerationMetric, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GenerationMetric & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    duration?: import("mongoose").SchemaDefinitionProperty<number | undefined, GenerationMetric, Document<unknown, {}, GenerationMetric, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GenerationMetric & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    error?: import("mongoose").SchemaDefinitionProperty<string | undefined, GenerationMetric, Document<unknown, {}, GenerationMetric, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GenerationMetric & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    qualityGate?: import("mongoose").SchemaDefinitionProperty<"passed" | "warned" | undefined, GenerationMetric, Document<unknown, {}, GenerationMetric, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GenerationMetric & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    textModel?: import("mongoose").SchemaDefinitionProperty<string | undefined, GenerationMetric, Document<unknown, {}, GenerationMetric, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GenerationMetric & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    visionModel?: import("mongoose").SchemaDefinitionProperty<string | undefined, GenerationMetric, Document<unknown, {}, GenerationMetric, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GenerationMetric & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    textRootDomain?: import("mongoose").SchemaDefinitionProperty<string | undefined, GenerationMetric, Document<unknown, {}, GenerationMetric, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GenerationMetric & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    visionRootDomain?: import("mongoose").SchemaDefinitionProperty<string | undefined, GenerationMetric, Document<unknown, {}, GenerationMetric, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GenerationMetric & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    rootDomains?: import("mongoose").SchemaDefinitionProperty<string[], GenerationMetric, Document<unknown, {}, GenerationMetric, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GenerationMetric & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    gates?: import("mongoose").SchemaDefinitionProperty<GenerationGateResult[], GenerationMetric, Document<unknown, {}, GenerationMetric, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GenerationMetric & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    excluded?: import("mongoose").SchemaDefinitionProperty<boolean, GenerationMetric, Document<unknown, {}, GenerationMetric, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GenerationMetric & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
    excludedReason?: import("mongoose").SchemaDefinitionProperty<string | undefined, GenerationMetric, Document<unknown, {}, GenerationMetric, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GenerationMetric & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>> | undefined;
}, GenerationMetric>;
