export declare class PreviewV2Dto {
    spec?: string;
    tier?: string;
    sourceType?: 'screenshot' | 'figma';
    specOverrides?: Record<string, any>;
    tierOverrides?: Record<string, any>;
    modelOverrides?: Record<string, string>;
    config?: Record<string, any>;
}
export declare class GenerateV2Dto extends PreviewV2Dto {
    imageBase64?: string;
    figmaUrl?: string;
    componentName?: string;
    groupId?: string;
    promptInjectionMode?: 'replace' | 'append';
}
