import { Vue3Service } from './vue3.service';
import { GenerateVue3Dto } from './dto/generate-vue3.dto';
import { AnalyzeSlotsDto } from './dto/analyze-slots.dto';
import { AnalyzeFromDocDto } from './dto/analyze-from-doc.dto';
import { BindApiDto } from './dto/bind-api.dto';
import { SlotAnalyzerService } from './slot-analyzer.service';
import { DocAnalyzerService } from './doc-analyzer.service';
import { ApiBindingService } from './api-binding.service';
import { QuotaService } from '../quota/quota.service';
export declare class Vue3Controller {
    private readonly vue3Service;
    private readonly slotAnalyzer;
    private readonly docAnalyzer;
    private readonly apiBindingService;
    private readonly quotaService;
    private readonly logger;
    constructor(vue3Service: Vue3Service, slotAnalyzer: SlotAnalyzerService, docAnalyzer: DocAnalyzerService, apiBindingService: ApiBindingService, quotaService: QuotaService);
    generate(dto: GenerateVue3Dto, req: any): Promise<{
        success: boolean;
        sessionId: string;
        message: string;
    }>;
    analyzeSlots(dto: AnalyzeSlotsDto): Promise<{
        slots: import("./slot-analyzer.service").DataSlot[];
        success: boolean;
    }>;
    analyzeFromDoc(dto: AnalyzeFromDocDto): Promise<{
        success: boolean;
        bindings: import("./doc-analyzer.service").DocBindingSuggestion[];
        summary: string;
    }>;
    bindApi(dto: BindApiDto): Promise<{
        success: boolean;
        bindingId: string;
        modifiedFiles: string[];
        previewUrl: string;
    }>;
    getBindings(componentId: string): {
        success: boolean;
        error: string;
        bindings?: undefined;
    } | {
        success: boolean;
        bindings: import("./api-binding.service").BindingRecord[];
        error?: undefined;
    };
    getBinding(bindingId: string): {
        success: boolean;
        error: string;
        binding?: undefined;
    } | {
        success: boolean;
        binding: import("./api-binding.service").BindingRecord;
        error?: undefined;
    };
    unbind(bindingId: string): Promise<{
        success: boolean;
        message: string;
    }>;
}
