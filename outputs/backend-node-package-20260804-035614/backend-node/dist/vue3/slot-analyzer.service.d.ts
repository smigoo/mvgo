export interface DataSlotChild {
    role: string;
    refName: string;
    label: string;
    sourceKind: 'template' | 'script' | 'echarts' | 'props' | 'computed';
    sourceLine?: number;
    sourceContext?: string;
}
export interface DataSlot {
    slotId: string;
    slotType: 'table' | 'chart' | 'select' | 'list' | 'stat' | 'form';
    label: string;
    refName: string;
    sourceLine: number;
    sourceContext: string;
    role?: string;
    sourceKind?: 'template' | 'script' | 'echarts' | 'props' | 'computed';
    confidence?: 'high' | 'medium' | 'low';
    reason?: string;
    bindable?: boolean;
    children?: DataSlotChild[];
}
export declare class SlotAnalyzerService {
    private readonly logger;
    analyzeSlots(componentId: string, groupId: string): Promise<{
        slots: DataSlot[];
    }>;
    private parseSfcParts;
    private analyzeTemplateSlots;
    private analyzeEChartsSlots;
    private analyzeScriptDataSlots;
    readSFC(componentId: string, groupId?: string): string;
    private isAlreadyAdded;
    private extractRefComments;
    private getTemplateContext;
    private isTabsLike;
    private extractChartRefs;
    private firstMatch;
    private cleanExpression;
    private getLineNumberForMatch;
    private inferChartLabel;
    private inferSlotKindFromName;
    private toSafeIdentifier;
    private inferLabel;
}
