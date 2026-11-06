import { Model } from 'mongoose';
import { GroupMemberDocument } from '../schemas/group-member.schema';
import { PermissionAdapter } from './permission-adapter.interface';
export declare class NodePermissionAdapter extends PermissionAdapter {
    private groupMemberModel;
    constructor(groupMemberModel: Model<GroupMemberDocument>);
    checkPermission(userId: string, permCode: string): Promise<boolean>;
    getUserPermissions(userId: string): Promise<{
        role: string;
        permissions: string[];
    }>;
}
