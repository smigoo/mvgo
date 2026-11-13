import { AnnouncementService } from './announcement.service';
export declare class AnnouncementController {
    private readonly announcementService;
    constructor(announcementService: AnnouncementService);
    create(body: {
        title: string;
        content: string;
        version?: string;
        type?: 'info' | 'warning' | 'success' | 'error';
        publishAt?: string;
        expireAt?: string;
        priority?: number;
    }, req: any): Promise<import("./announcement.schema").Announcement>;
    findAllForAdmin(page?: string, pageSize?: string, active?: string, keyword?: string): Promise<{
        list: import("./announcement.schema").Announcement[];
        total: number;
    }>;
    findActiveForUser(): Promise<import("./announcement.schema").Announcement[]>;
    findById(id: string): Promise<import("./announcement.schema").Announcement>;
    update(id: string, body: {
        title?: string;
        content?: string;
        version?: string;
        type?: 'info' | 'warning' | 'success' | 'error';
        active?: boolean;
        publishAt?: string;
        expireAt?: string;
        priority?: number;
    }): Promise<import("./announcement.schema").Announcement>;
    delete(id: string): Promise<void>;
    toggleActive(id: string): Promise<import("./announcement.schema").Announcement>;
}
