import { MicrocodeDocService } from './microcode-doc.service';
import { GenerateDocConfigsDto } from './dto/generate-doc-configs.dto';
export declare class MicrocodeDocController {
    private readonly docService;
    private readonly logger;
    constructor(docService: MicrocodeDocService);
    generateConfigs(dto: GenerateDocConfigsDto): Promise<{
        success: boolean;
        configs?: {
            businessEvents: string;
            businessStatuses: string;
            businessConfig: string;
            cssVariableConfig: string;
        };
        merged?: string;
        error?: string;
    }>;
}
