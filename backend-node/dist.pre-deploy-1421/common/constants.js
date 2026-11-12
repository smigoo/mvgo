"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUOTA = exports.PAGE = exports.PERMISSION_SOURCE = exports.USER_SOURCE = exports.ROLES = exports.MS = void 0;
exports.MS = {
    SEC: 1000,
    MIN: 60 * 1000,
    HOUR: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000,
};
exports.ROLES = {
    ADMIN: 'admin',
    MEMBER: 'member',
    USER: 'user',
    GUEST: 'guest',
};
exports.USER_SOURCE = {
    QS_PORTAL: 'qs',
    LOCAL: 'local',
};
exports.PERMISSION_SOURCE = {
    QS_PORTAL: 'qs',
    LOCAL: 'local',
};
exports.PAGE = {
    DEFAULT_SIZE: 20,
    MAX_SIZE: 60,
};
exports.QUOTA = {
    DEFAULT_WAIT_MINUTES: 60,
};
//# sourceMappingURL=constants.js.map