"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionsGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const permission_adapter_interface_1 = require("./permission-adapter.interface");
let PermissionsGuard = class PermissionsGuard {
    reflector;
    permissionAdapter;
    constructor(reflector, permissionAdapter) {
        this.reflector = reflector;
        this.permissionAdapter = permissionAdapter;
    }
    async canActivate(context) {
        const required = this.reflector.getAllAndOverride('permissions', [context.getHandler(), context.getClass()]);
        if (!required || required.length === 0) {
            return true;
        }
        const request = context.switchToHttp().getRequest();
        const userId = request.session?.userId;
        if (!userId) {
            throw new common_1.UnauthorizedException('未登录或登录已过期');
        }
        for (const permCode of required) {
            const hasPermission = await this.permissionAdapter.checkPermission(userId, permCode);
            if (!hasPermission) {
                throw new common_1.ForbiddenException(`权限不足，需要: ${permCode}`);
            }
        }
        return true;
    }
};
exports.PermissionsGuard = PermissionsGuard;
exports.PermissionsGuard = PermissionsGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector,
        permission_adapter_interface_1.PermissionAdapter])
], PermissionsGuard);
//# sourceMappingURL=permissions.guard.js.map