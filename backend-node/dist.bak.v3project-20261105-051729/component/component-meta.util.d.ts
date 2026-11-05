export type ComponentMetaType = 'vue3' | 'microcode';
export declare function saveComponentMeta(groupId: string, componentId: string, componentType: ComponentMetaType, requirementDoc?: string, docAnalysis?: Record<string, any>, quality?: {
    degraded?: boolean;
    layoutSource?: string;
    degradeReason?: string;
}, patchHitReport?: Record<string, any> | null): Promise<void>;
