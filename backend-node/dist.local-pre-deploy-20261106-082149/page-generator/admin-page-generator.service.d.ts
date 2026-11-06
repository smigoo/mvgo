import { AdminPageConfigDto } from './dto/admin-page.dto';
export declare class AdminPageGeneratorService {
    generateVueComponent(config: AdminPageConfigDto): string;
    generateApiService(config: AdminPageConfigDto): string;
    private buildHeader;
    private buildTemplate;
    private buildScript;
    private buildStyle;
    private buildFormField;
    private toPascalCase;
    private lightenHex;
    private darkenHex;
}
