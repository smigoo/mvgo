export declare class GenerateVue3Dto {
    componentName?: string;
    fileKey: string;
    nodeId: string;
    groupId: string;
    componentId?: string;
    panelType?: string;
    requirementDoc?: string;
    docAnalysis?: Record<string, any>;
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
