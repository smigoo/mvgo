export declare class BindingSlotChildDto {
    role?: string;
    refName?: string;
    label?: string;
    sourceKind?: string;
    sourceContext?: string;
}
export declare class BindingSlotDto {
    slotId: string;
    slotType: string;
    refName?: string;
    label?: string;
    role?: string;
    sourceKind?: string;
    bindable?: boolean;
    children?: BindingSlotChildDto[];
    moduleName?: string;
    functionName?: string;
    parameterValues?: Record<string, string | number | boolean | null>;
    status: 'bound' | 'stub' | 'skipped';
    stubReason?: string;
    skipReason?: string;
}
export declare class BindApiDto {
    catalogId: string;
    componentId: string;
    groupId: string;
    componentName?: string;
    bindings: BindingSlotDto[];
    aiConfig?: {
        textApiKey?: string;
        textBaseURL?: string;
        textModel?: string;
    };
}
