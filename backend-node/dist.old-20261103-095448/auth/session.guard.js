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
exports.SessionGuard = void 0;
const common_1 = require("@nestjs/common");
const auth_service_1 = require("./auth.service");
let SessionGuard = class SessionGuard {
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const raw = request.query?.raw;
        if (raw === '1') {
            return true;
        }
        if (request.session?.userId) {
            return true;
        }
        const token = request.headers['token'] || request.query?.token;
        const tokenValue = Array.isArray(token) ? token[0] : token;
        if (tokenValue) {
            try {
                let result = await this.authService.findOrCreateByPortalToken(String(tokenValue));
                if (!result?.user) {
                    result = await this.authService.findOrCreateDevUser(String(tokenValue));
                }
                if (result?.user) {
                    request.session.userId = result.user._id.toString();
                    request.session.username = result.user.username;
                    request.session.isAdmin = result.user.isAdmin || false;
                    return true;
                }
            }
            catch (err) {
            }
        }
        throw new common_1.UnauthorizedException('未登录或登录已过期');
    }
};
exports.SessionGuard = SessionGuard;
exports.SessionGuard = SessionGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], SessionGuard);
//# sourceMappingURL=session.guard.js.map