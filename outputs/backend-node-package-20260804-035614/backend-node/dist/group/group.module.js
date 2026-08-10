"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const group_controller_1 = require("./group.controller");
const join_request_controller_1 = require("./join-request.controller");
const group_service_1 = require("./group.service");
const join_request_service_1 = require("./join-request.service");
const group_schema_1 = require("../schemas/group.schema");
const group_member_schema_1 = require("../schemas/group-member.schema");
const join_request_schema_1 = require("../schemas/join-request.schema");
const auth_module_1 = require("../auth/auth.module");
let GroupModule = class GroupModule {
};
exports.GroupModule = GroupModule;
exports.GroupModule = GroupModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([
                { name: group_schema_1.Group.name, schema: group_schema_1.GroupSchema },
                { name: group_member_schema_1.GroupMember.name, schema: group_member_schema_1.GroupMemberSchema },
                { name: join_request_schema_1.JoinRequest.name, schema: join_request_schema_1.JoinRequestSchema },
            ]),
            auth_module_1.AuthModule,
        ],
        controllers: [group_controller_1.GroupController, join_request_controller_1.JoinRequestController],
        providers: [group_service_1.GroupService, join_request_service_1.JoinRequestService],
        exports: [group_service_1.GroupService, join_request_service_1.JoinRequestService],
    })
], GroupModule);
//# sourceMappingURL=group.module.js.map