"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PageGeneratorModule = void 0;
const common_1 = require("@nestjs/common");
const page_generator_controller_1 = require("./page-generator.controller");
const admin_page_generator_controller_1 = require("./admin-page-generator.controller");
const page_generator_service_1 = require("./page-generator.service");
const admin_page_generator_service_1 = require("./admin-page-generator.service");
const tasks_module_1 = require("../tasks/tasks.module");
const progress_module_1 = require("../progress/progress.module");
const component_module_1 = require("../component/component.module");
const config_module_1 = require("../config/config.module");
let PageGeneratorModule = class PageGeneratorModule {
};
exports.PageGeneratorModule = PageGeneratorModule;
exports.PageGeneratorModule = PageGeneratorModule = __decorate([
    (0, common_1.Module)({
        imports: [tasks_module_1.TasksModule, progress_module_1.ProgressModule, component_module_1.ComponentModule, config_module_1.AiConfigModule],
        controllers: [page_generator_controller_1.PageGeneratorController, admin_page_generator_controller_1.AdminPageGeneratorController],
        providers: [page_generator_service_1.PageGeneratorService, admin_page_generator_service_1.AdminPageGeneratorService],
    })
], PageGeneratorModule);
//# sourceMappingURL=page-generator.module.js.map