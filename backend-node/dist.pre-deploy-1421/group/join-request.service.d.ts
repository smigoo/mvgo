import { Model } from 'mongoose';
import { JoinRequest, JoinRequestDocument } from '../schemas/join-request.schema';
import { GroupMemberDocument } from '../schemas/group-member.schema';
import { GroupDocument } from '../schemas/group.schema';
export declare class JoinRequestService {
    private joinRequestModel;
    private groupMemberModel;
    private groupModel;
    constructor(joinRequestModel: Model<JoinRequestDocument>, groupMemberModel: Model<GroupMemberDocument>, groupModel: Model<GroupDocument>);
    applyToJoin(groupId: string, userId: string, message: string): Promise<JoinRequest>;
    getPendingRequests(groupId: string, adminId: string): Promise<any[]>;
    approveRequest(groupId: string, requestId: string, adminId: string): Promise<void>;
    rejectRequest(groupId: string, requestId: string, adminId: string): Promise<void>;
    private checkAdminPermission;
}
