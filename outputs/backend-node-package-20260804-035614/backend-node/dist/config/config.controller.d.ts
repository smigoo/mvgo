import { AiConfigService } from './config.service';
export declare class AiConfigController {
    private readonly svc;
    constructor(svc: AiConfigService);
    getAi(): {
        success: boolean;
        config: Record<string, any>;
    };
    saveAi(body: Record<string, any>): {
        success: boolean;
        config: Record<string, any>;
    };
}
