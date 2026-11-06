export declare class ThemeNodeDto {
    fileKey: string;
    nodeId: string;
    name?: string;
    previewImageUrl?: string;
    brightness?: 'light' | 'dark';
    panelType?: string;
}
export declare class GenerateLiteDto {
    imageBase64?: string;
    figmaUrl?: string;
    htmlContent?: string;
    htmlFileName?: string;
    imageMime?: string;
    componentName?: string;
    groupId?: string;
    componentType?: 'vue3' | 'microcode';
    generationTier?: 'lite' | 'max';
    previewToken?: string;
    previewWidth?: number;
    previewHeight?: number;
    rasterScale?: number;
    config?: Record<string, any>;
    requirementDoc?: string;
    notes?: string;
    panelType?: 'default-panel' | 'model-panels' | 'aio-panel' | 'empty';
    backgroundBrightness?: 'light' | 'dark';
    themeNodes?: ThemeNodeDto[];
    userComponentId?: string;
    extraPrompt?: string;
    requirementDocText?: string;
}
