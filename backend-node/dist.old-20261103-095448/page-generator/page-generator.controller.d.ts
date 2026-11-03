import { PageGeneratorService } from './page-generator.service';
import { GeneratePageDto } from './dto/generate-page.dto';
export declare class PageGeneratorController {
    private readonly pageGeneratorService;
    private readonly logger;
    constructor(pageGeneratorService: PageGeneratorService);
    generate(dto: GeneratePageDto, req: any): Promise<{
        success: boolean;
        sessionId: string;
        executionMode: "serial" | "parallel";
        concurrency: number;
        message: string;
    }>;
    analyze(dto: GeneratePageDto): Promise<{
        success: boolean;
        components: any;
        total: any;
    }>;
    retryGeneration(sessionId: string, body: {
        config?: {
            model?: string;
            endpoint?: string;
            apiKey?: string;
        };
    }, req: any): Promise<{
        success: boolean;
        sessionId: string;
        originalSessionId: string;
        message: string;
    }>;
}
