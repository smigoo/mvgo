import { Model } from 'mongoose';
export declare function resolvePrivateGroupId(dtoGroupId: string | undefined, userId: string | undefined, groupMemberModel: Model<any>): Promise<string>;
