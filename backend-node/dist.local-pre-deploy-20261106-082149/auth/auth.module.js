"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const auth_service_1 = require("./auth.service");
const user_schema_1 = require("../schemas/user.schema");
const group_schema_1 = require("../schemas/group.schema");
const group_member_schema_1 = require("../schemas/group-member.schema");
const session_guard_1 = require("./session.guard");
const optional_session_guard_1 = require("./optional-session.guard");
const permissions_guard_1 = require("./permissions.guard");
const permission_adapter_interface_1 = require("./permission-adapter.interface");
const node_permission_adapter_1 = require("./node-permission-adapter");
const qs_permission_adapter_1 = require("./qs-permission-adapter");
const permissionAdapterProvider = process.env.PERMISSION_SOURCE === 'qs'
    ? { provide: permission_adapter_interface_1.PermissionAdapter, useClass: qs_permission_adapter_1.QSPermissionAdapter }
    : { provide: permission_adapter_interface_1.PermissionAdapter, useClass: node_permission_adapter_1.NodePermissionAdapter };
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([
                { name: user_schema_1.User.name, schema: user_schema_1.UserSchema },
                { name: group_schema_1.Group.name, schema: group_schema_1.GroupSchema },
                { name: group_member_schema_1.GroupMember.name, schema: group_member_schema_1.GroupMemberSchema },
            ]),
        ],
        controllers: [],
        providers: [
            auth_service_1.AuthService,
            session_guard_1.SessionGuard,
            optional_session_guard_1.OptionalSessionGuard,
            permissions_guard_1.PermissionsGuard,
            permissionAdapterProvider,
        ],
        exports: [
            auth_service_1.AuthService,
            session_guard_1.SessionGuard,
            optional_session_guard_1.OptionalSessionGuard,
            permissions_guard_1.PermissionsGuard,
            permission_adapter_interface_1.PermissionAdapter,
        ],
    })
], AuthModule);
//# sourceMappingURL=auth.module.js.map