"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvePrivateGroupId = resolvePrivateGroupId;
const mongoose_1 = require("mongoose");
async function resolvePrivateGroupId(dtoGroupId, userId, groupMemberModel) {
    if (dtoGroupId && dtoGroupId !== 'default-group')
        return dtoGroupId;
    if (!userId)
        return 'default-group';
    const member = await groupMemberModel
        .findOne({ userId: new mongoose_1.Types.ObjectId(userId) })
        .exec();
    return member?.groupId ? member.groupId.toString() : 'default-group';
}
//# sourceMappingURL=group-resolver.js.map