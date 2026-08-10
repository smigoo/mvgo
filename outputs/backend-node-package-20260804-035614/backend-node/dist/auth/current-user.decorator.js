"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrentUser = void 0;
const common_1 = require("@nestjs/common");
exports.CurrentUser = (0, common_1.createParamDecorator)((_data, ctx) => {
    const request = ctx.switchToHttp().getRequest();
    const userId = request.session?.userId;
    if (!userId) {
        throw new common_1.UnauthorizedException('未登录或登录已过期');
    }
    return userId;
});
//# sourceMappingURL=current-user.decorator.js.map