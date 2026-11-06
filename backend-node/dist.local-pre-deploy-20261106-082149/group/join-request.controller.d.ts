import { JoinRequestService } from './join-request.service';
export declare class JoinRequestController {
    private readonly joinRequestService;
    constructor(joinRequestService: JoinRequestService);
    applyToJoin(groupId: string, body: {
        message?: string;
    }, session: Record<string, any>): Promise<{
        success: boolean;
        message: string;
        request: {
            id: string;
            status: string;
            createdAt: Date;
        };
    }>;
    getPendingRequests(groupId: string, session: Record<string, any>): Promise<{
        success: boolean;
        requests: any[];
    }>;
    approveRequest(groupId: string, requestId: string, session: Record<string, any>): Promise<{
        success: boolean;
        message: string;
    }>;
    rejectRequest(groupId: string, requestId: string, session: Record<string, any>): Promise<{
        success: boolean;
        message: string;
    }>;
}
