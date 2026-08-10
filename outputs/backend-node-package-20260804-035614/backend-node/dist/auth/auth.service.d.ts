import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import { Group, GroupDocument } from '../schemas/group.schema';
import { GroupMemberDocument } from '../schemas/group-member.schema';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
export declare class AuthService {
    private userModel;
    private groupModel;
    private groupMemberModel;
    constructor(userModel: Model<UserDocument>, groupModel: Model<GroupDocument>, groupMemberModel: Model<GroupMemberDocument>);
    register(registerDto: RegisterDto): Promise<User>;
    validateUser(loginDto: LoginDto): Promise<User>;
    findById(userId: string): Promise<User | null>;
    getUserGroup(userId: string): Promise<Group | null>;
    changePassword(username: string, oldPassword: string, newPassword: string): Promise<void>;
}
