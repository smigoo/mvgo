"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveAdminRole = resolveAdminRole;
const constants_1 = require("../common/constants");
function resolveAdminRole(params) {
    if (params.isAdminFlag === true)
        return constants_1.ROLES.ADMIN;
    const uids = params.defaultAdminUids || [];
    if (uids.length > 0 && params.userUid && uids.includes(params.userUid)) {
        return constants_1.ROLES.ADMIN;
    }
    if (params.permissionRole === constants_1.ROLES.ADMIN && (params.permissionSource || 'node') === 'qs') {
        return constants_1.ROLES.ADMIN;
    }
    return constants_1.ROLES.MEMBER;
}
//# sourceMappingURL=admin-role.util.js.map