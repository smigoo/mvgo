import { AdminService } from './admin.service';
import { TaskStatsService } from '../task-stats/task-stats.service';
export declare class AdminStatsController {
    private readonly adminService;
    private readonly taskStatsService;
    private readonly logger;
    constructor(adminService: AdminService, taskStatsService: TaskStatsService);
    userStats(userId: string, preset?: string, from?: string, to?: string): Promise<{
        success: boolean;
        list: any[];
        count: number;
        windowLabel: string;
    }>;
    listUserStats(key?: string): Promise<{
        success: boolean;
        data: Record<string, import("./admin.service").UserStat>;
    }>;
    usageExport(key?: string, preset?: string, from?: string, to?: string, dept?: string, format?: string): Promise<{
        filename: string;
        contentType: string;
        body: string;
        success: boolean;
    }>;
}
