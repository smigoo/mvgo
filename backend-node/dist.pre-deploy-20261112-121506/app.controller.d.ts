import { AppService } from './app.service';
export declare class AppController {
    private readonly appService;
    constructor(appService: AppService);
    getHello(): string;
    getWorkspaceInfo(): {
        defaultRoot: string;
        projectRoot: string;
        homeDir: string;
        frontendWorkspace: string;
    };
}
