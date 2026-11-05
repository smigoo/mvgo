import { ApifoxService } from '../apifox/apifox.service';
import { AnalyzeFromDocDto } from './dto/analyze-from-doc.dto';
import { SlotAnalyzerService } from './slot-analyzer.service';
export interface DocBindingSuggestion {
    refName: string;
    slotType: string;
    description: string;
    moduleName: string | null;
    functionName: string | null;
    confidence: 'high' | 'medium' | 'low' | 'none';
    reason: string;
}
export declare class DocAnalyzerService {
    private readonly apifoxService;
    private readonly slotAnalyzer;
    private readonly logger;
    constructor(apifoxService: ApifoxService, slotAnalyzer: SlotAnalyzerService);
    analyzeFromDoc(dto: AnalyzeFromDocDto): Promise<{
        success: boolean;
        bindings: DocBindingSuggestion[];
        summary: string;
    }>;
    private correctRefNames;
    private buildCatalogBrief;
    private buildPrompt;
    private callLLM;
    private parseLLMResponse;
}
