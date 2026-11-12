export declare class SecondaryNodeDto {
    fileKey: string;
    nodeId: string;
}
export declare class ThemeNodeDto {
    fileKey: string;
    nodeId: string;
    name?: string;
    brightness?: 'light' | 'dark';
    panelType?: string;
    previewImageUrl?: string;
}
export declare class GeneratePhase2Dto {
    componentName?: string;
    fileKey: string;
    nodeId: string;
    themeNodes?: ThemeNodeDto[];
    secondaryNode?: SecondaryNodeDto;
    primaryRole?: 'first' | 'second';
    businessTextRules?: {
        rewrite?: Record<string, string>;
        drop?: string[];
    };
    groupId: string;
    componentId?: string;
    userComponentId?: string;
    extraPrompt?: string;
    requirementDocText?: string;
    previewToken?: string;
    panelType?: string;
    target?: string;
    requirementDoc?: string;
    reuseCache?: boolean;
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
    figmaCredentialFp?: string;
    figmaCredentialSlotId?: string;
    figmaCredentialSlotName?: string;
}
