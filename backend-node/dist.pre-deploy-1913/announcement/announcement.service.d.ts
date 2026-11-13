import { Model } from 'mongoose';
import { Announcement, AnnouncementDocument } from './announcement.schema';
export declare class AnnouncementService {
    private announcementModel;
    private readonly logger;
    constructor(announcementModel: Model<AnnouncementDocument>);
    create(data: Partial<Announcement>): Promise<Announcement>;
    findAllForAdmin(query: {
        page?: number;
        pageSize?: number;
        active?: boolean;
        keyword?: string;
    }): Promise<{
        list: Announcement[];
        total: number;
    }>;
    findActiveForUser(): Promise<Announcement[]>;
    findById(id: string): Promise<Announcement>;
    update(id: string, data: Partial<Announcement>): Promise<Announcement>;
    delete(id: string): Promise<void>;
    toggleActive(id: string): Promise<Announcement>;
}
