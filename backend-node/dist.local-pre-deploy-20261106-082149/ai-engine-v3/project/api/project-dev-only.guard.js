"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectDevOnlyGuard = void 0;
exports.isV3ProjectExposed = isV3ProjectExposed;
const common_1 = require("@nestjs/common");
function isV3ProjectExposed() {
    const flag = process.env.AI_ENGINE_V3_PROJECT_ENABLED?.trim().toLowerCase();
    if (flag === 'true' || flag === '1')
        return true;
    if (flag === 'false' || flag === '0')
        return false;
    return process.env.NODE_ENV !== 'production';
}
let ProjectDevOnlyGuard = class ProjectDevOnlyGuard {
    canActivate() {
        if (isV3ProjectExposed())
            return true;
        throw new common_1.NotFoundException('Cannot find endpoint');
    }
};
exports.ProjectDevOnlyGuard = ProjectDevOnlyGuard;
exports.ProjectDevOnlyGuard = ProjectDevOnlyGuard = __decorate([
    (0, common_1.Injectable)()
], ProjectDevOnlyGuard);
//# sourceMappingURL=project-dev-only.guard.js.map