export declare class GeneratePageDto {
    fileKey: string;
    nodeId: string;
    groupId: string;
    executionMode?: 'serial' | 'parallel';
    concurrency?: number;
    config?: {
        outputPath?: string;
        figmaToken?: string;
        aiApiKey?: string;
        aiBaseURL?: string;
        aiModel?: string;
        visionApiKey?: string;
        visionBaseURL?: string;
        visionModel?: string;
        textApiKey?: string;
        textBaseURL?: string;
        textModel?: string;
    };
}
