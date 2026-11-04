"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PageSkeletonModule = void 0;
const common_1 = require("@nestjs/common");
const config_module_1 = require("../config/config.module");
const page_skeleton_controller_1 = require("./page-skeleton.controller");
const page_skeleton_service_1 = require("./page-skeleton.service");
let PageSkeletonModule = class PageSkeletonModule {
};
exports.PageSkeletonModule = PageSkeletonModule;
exports.PageSkeletonModule = PageSkeletonModule = __decorate([
    (0, common_1.Module)({
        imports: [config_module_1.AiConfigModule],
        controllers: [page_skeleton_controller_1.PageSkeletonController],
        providers: [page_skeleton_service_1.PageSkeletonService],
    })
], PageSkeletonModule);
//# sourceMappingURL=page-skeleton.module.js.map