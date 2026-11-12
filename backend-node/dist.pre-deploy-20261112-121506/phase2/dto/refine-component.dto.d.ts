export declare class RefineComponentDto {
    componentId: string;
    refineType?: 'layout' | 'style' | 'both';
    target?: 'microcode' | 'vue3';
    generationTier?: 'max' | 'lite';
    visionRefine?: boolean;
    visualDiffGuidance?: string;
    overrideImage?: string;
}
