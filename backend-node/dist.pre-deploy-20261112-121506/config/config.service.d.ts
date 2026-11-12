import { UserAiConfigService } from './user-ai-config.service';
import { z } from 'zod';
export declare const AI_CONFIG_SCHEMA: z.ZodObject<{
    profiles: z.ZodPreprocess<z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
        config: z.ZodOptional<z.ZodObject<{
            figmaToken: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
            figmaTokens: z.ZodPreprocess<z.ZodOptional<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
                token: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
            }, z.core.$strip>>>>;
            activeFigmaTokenId: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
            apifoxToken: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
            gitlabToken: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
            textApiKey: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
            textBaseURL: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
            textModel: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
            visionApiKey: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
            visionBaseURL: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
            visionModel: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
            unifiedApiKey: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
            unifiedBaseURL: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
            unifiedModel: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
            visionTemperature: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
            textTemperature: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
            unifiedTemperature: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
            modelMode: z.ZodPreprocess<z.ZodOptional<z.ZodEnum<{
                text: "text";
                unified: "unified";
                vision: "vision";
                separate: "separate";
            }>>>;
            textProviderType: z.ZodPreprocess<z.ZodOptional<z.ZodEnum<{
                auto: "auto";
                "openai-compatible": "openai-compatible";
                anthropic: "anthropic";
            }>>>;
            visionProviderType: z.ZodPreprocess<z.ZodOptional<z.ZodEnum<{
                auto: "auto";
                "openai-compatible": "openai-compatible";
                anthropic: "anthropic";
            }>>>;
            unifiedProviderType: z.ZodPreprocess<z.ZodOptional<z.ZodEnum<{
                auto: "auto";
                "openai-compatible": "openai-compatible";
                anthropic: "anthropic";
            }>>>;
            outputPath: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
            requestConcurrency: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
            requestQueueTimeoutMs: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
            requestTimeoutMs: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
            requestMaxRetries: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
            providers: z.ZodPreprocess<z.ZodOptional<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                apiKey: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
                name: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
                baseURL: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
                model: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
                providerType: z.ZodPreprocess<z.ZodOptional<z.ZodEnum<{
                    auto: "auto";
                    "openai-compatible": "openai-compatible";
                    anthropic: "anthropic";
                }>>>;
                role: z.ZodPreprocess<z.ZodOptional<z.ZodEnum<{
                    text: "text";
                    both: "both";
                    vision: "vision";
                }>>>;
                rpm: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
                tpm: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
                weight: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
                temperature: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
            }, z.core.$strip>>>>;
            circuitBreaker: z.ZodOptional<z.ZodObject<{
                failureThreshold: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
                cooldownMs: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
            }, z.core.$strip>>;
            pickStrategy: z.ZodPreprocess<z.ZodOptional<z.ZodEnum<{
                "primary-first": "primary-first";
                "weighted-spread": "weighted-spread";
            }>>>;
            models: z.ZodPreprocess<z.ZodOptional<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
                apiKey: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
                baseURL: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
                model: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
                providerType: z.ZodPreprocess<z.ZodOptional<z.ZodEnum<{
                    auto: "auto";
                    "openai-compatible": "openai-compatible";
                    anthropic: "anthropic";
                }>>>;
                capability: z.ZodPreprocess<z.ZodOptional<z.ZodEnum<{
                    text: "text";
                    both: "both";
                    vision: "vision";
                }>>>;
                verified: z.ZodOptional<z.ZodBoolean>;
                temperature: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
                rpm: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
                tpm: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
                weight: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
            }, z.core.$strip>>>>;
            binding: z.ZodOptional<z.ZodObject<{
                unified: z.ZodOptional<z.ZodObject<{
                    primaryId: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
                    poolIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                }, z.core.$strip>>;
                text: z.ZodOptional<z.ZodObject<{
                    primaryId: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
                    poolIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                }, z.core.$strip>>;
                vision: z.ZodOptional<z.ZodObject<{
                    primaryId: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
                    poolIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                }, z.core.$strip>>;
            }, z.core.$strip>>;
        }, z.core.$loose>>;
    }, z.core.$strip>>>>;
    activeProfileId: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    lastModifiedBy: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    updatedAt: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    figmaToken: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    figmaTokens: z.ZodPreprocess<z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
        token: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    }, z.core.$strip>>>>;
    activeFigmaTokenId: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    apifoxToken: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    gitlabToken: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    textApiKey: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    textBaseURL: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    textModel: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    visionApiKey: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    visionBaseURL: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    visionModel: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    unifiedApiKey: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    unifiedBaseURL: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    unifiedModel: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    visionTemperature: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
    textTemperature: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
    unifiedTemperature: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
    modelMode: z.ZodPreprocess<z.ZodOptional<z.ZodEnum<{
        text: "text";
        unified: "unified";
        vision: "vision";
        separate: "separate";
    }>>>;
    textProviderType: z.ZodPreprocess<z.ZodOptional<z.ZodEnum<{
        auto: "auto";
        "openai-compatible": "openai-compatible";
        anthropic: "anthropic";
    }>>>;
    visionProviderType: z.ZodPreprocess<z.ZodOptional<z.ZodEnum<{
        auto: "auto";
        "openai-compatible": "openai-compatible";
        anthropic: "anthropic";
    }>>>;
    unifiedProviderType: z.ZodPreprocess<z.ZodOptional<z.ZodEnum<{
        auto: "auto";
        "openai-compatible": "openai-compatible";
        anthropic: "anthropic";
    }>>>;
    outputPath: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    requestConcurrency: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
    requestQueueTimeoutMs: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
    requestTimeoutMs: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
    requestMaxRetries: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
    providers: z.ZodPreprocess<z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        apiKey: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
        name: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
        baseURL: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
        model: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
        providerType: z.ZodPreprocess<z.ZodOptional<z.ZodEnum<{
            auto: "auto";
            "openai-compatible": "openai-compatible";
            anthropic: "anthropic";
        }>>>;
        role: z.ZodPreprocess<z.ZodOptional<z.ZodEnum<{
            text: "text";
            both: "both";
            vision: "vision";
        }>>>;
        rpm: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
        tpm: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
        weight: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
        temperature: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
    }, z.core.$strip>>>>;
    circuitBreaker: z.ZodOptional<z.ZodObject<{
        failureThreshold: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
        cooldownMs: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
    }, z.core.$strip>>;
    pickStrategy: z.ZodPreprocess<z.ZodOptional<z.ZodEnum<{
        "primary-first": "primary-first";
        "weighted-spread": "weighted-spread";
    }>>>;
    models: z.ZodPreprocess<z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
        apiKey: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
        baseURL: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
        model: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
        providerType: z.ZodPreprocess<z.ZodOptional<z.ZodEnum<{
            auto: "auto";
            "openai-compatible": "openai-compatible";
            anthropic: "anthropic";
        }>>>;
        capability: z.ZodPreprocess<z.ZodOptional<z.ZodEnum<{
            text: "text";
            both: "both";
            vision: "vision";
        }>>>;
        verified: z.ZodOptional<z.ZodBoolean>;
        temperature: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
        rpm: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
        tpm: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
        weight: z.ZodPreprocess<z.ZodOptional<z.ZodNumber>>;
    }, z.core.$strip>>>>;
    binding: z.ZodOptional<z.ZodObject<{
        unified: z.ZodOptional<z.ZodObject<{
            primaryId: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
            poolIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>;
        text: z.ZodOptional<z.ZodObject<{
            primaryId: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
            poolIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>;
        vision: z.ZodOptional<z.ZodObject<{
            primaryId: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
            poolIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strict>;
export type AiConfig = z.infer<typeof AI_CONFIG_SCHEMA>;
export declare class AiConfigService {
    private readonly userAiConfigService;
    private readonly logger;
    constructor(userAiConfigService: UserAiConfigService);
    getAiConfig(): Record<string, any>;
    private resolveProfiles;
    getMergedAiConfig(userId?: string): Promise<Record<string, any>>;
    getUserMergedConfig(userId?: string): Promise<Record<string, any>>;
    buildTaskConfigSnapshot(input?: Record<string, any>): Record<string, any>;
    private readRawConfig;
    private normalizeConfigInput;
    private normalizeTaskSnapshotInput;
    private safeParseSchema;
    private applyDefaults;
    private atomicWrite;
}
export declare function resolveBindingToLegacy<T extends Record<string, any>>(config: T): T;
export declare function migrateLegacyToModels<T extends Record<string, any>>(config: T): T;
