import { Model } from 'mongoose';
import { Group, GroupDocument } from '../schemas/group.schema';
import { GroupMemberDocument } from '../schemas/group-member.schema';
export declare class GroupService {
    private groupModel;
    private groupMemberModel;
    constructor(groupModel: Model<GroupDocument>, groupMemberModel: Model<GroupMemberDocument>);
    createGroup(name: string, description: string, adminId: string): Promise<Group>;
    getUserGroups(userId: string): Promise<any[]>;
    getGroupDetails(groupId: string, userId: string): Promise<any>;
    inviteUser(groupId: string, targetUserId: string, adminId: string): Promise<void>;
    removeMember(groupId: string, targetUserId: string, adminId: string): Promise<void>;
    updateGroup(groupId: string, name: string, description: string, adminId: string): Promise<Group>;
    deleteGroup(groupId: string, userId: string): Promise<void>;
    private checkAdminPermission;
    updateMemberPermissions(groupId: string, userId: string, permissions: string[]): Promise<void>;
    getMemberPermissions(groupId: string, userId: string): Promise<string[]>;
}
