import { z } from 'zod';
declare const AI_CONFIG_SCHEMA: z.ZodObject<{
    figmaToken: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    apifoxToken: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    textApiKey: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    textBaseURL: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    textModel: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    visionApiKey: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    visionBaseURL: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    visionModel: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    unifiedApiKey: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    unifiedBaseURL: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    unifiedModel: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    modelMode: z.ZodPreprocess<z.ZodOptional<z.ZodEnum<{
        text: "text";
        vision: "vision";
        unified: "unified";
        separate: "separate";
    }>>>;
    outputPath: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    requestConcurrency: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
    requestQueueTimeoutMs: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
    requestTimeoutMs: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
    requestMaxRetries: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
}, z.core.$strict>;
export type AiConfig = z.infer<typeof AI_CONFIG_SCHEMA>;
export declare class AiConfigService {
    private readonly logger;
    getAiConfig(): Record<string, any>;
    saveAiConfig(input: Record<string, any>): Record<string, any>;
    buildTaskConfigSnapshot(input?: Record<string, any>): Record<string, any>;
    private readRawConfig;
    private normalizeConfigInput;
    private normalizeTaskSnapshotInput;
    private safeParseSchema;
    private applyDefaults;
    private atomicWrite;
}
export {};
