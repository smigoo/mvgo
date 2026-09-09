package com.mvgo.api.controller;

import com.mvgo.api.dto.req.BatchDeleteRequest;
import com.mvgo.api.dto.req.CreateComponentRequest;
import com.mvgo.api.dto.req.SetUserAdminReq;
import com.mvgo.business.dto.AdminComponentPage;
import com.mvgo.business.dto.AdminDeleteUserResult;
import com.mvgo.business.dto.AdminUserPage;
import com.mvgo.business.dto.AdminAiConfigVO;
import com.mvgo.business.dto.OperationLogCleanupReq;
import com.mvgo.business.service.AdminService;
import com.mvgo.business.service.ComponentService;
import com.mvgo.business.service.OperationLogService;
import com.mvgo.common.BizException;
import com.mvgo.common.Result;
import com.mvgo.data.entity.ComponentDocument;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 管理后台接口（迁自 Node AdminController）.
 *
 * <p>覆盖用户管理（列表 / 设置管理员 / 删除级联）、组件管理（列表 / 详情 / 创建 / 更新 / 删除 / 批量删除）
 * 与每用户 AI 配置只读列表（ai-configs，密钥脱敏），
 * 直接读写与 Node 同一 MongoDB 库的 users / components / user_ai_configs 集合。
 *
 * @since 1.0.0
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AdminService service;
    private final ComponentService componentService;
    private final OperationLogService operationLogService;

    public AdminController(AdminService service, ComponentService componentService,
                           OperationLogService operationLogService) {
        this.service = service;
        this.componentService = componentService;
        this.operationLogService = operationLogService;
    }

    /** 用户列表 */
    @GetMapping("users")
    public Result<AdminUserPage> listUsers() {
        return Result.success(service.listUsers());
    }

    /**
     * 所有用户的 AI/API 配置（密钥脱敏）——对齐 Node listUserConfigs 输出，
     * 供管理后台「每用户 AI 配置」视图 / 配置被覆盖溯源使用。
     */
    @GetMapping("ai-configs")
    public Result<List<AdminAiConfigVO>> listAiConfigs() {
        return Result.success(service.listUserConfigs());
    }

    /**
     * 删除操作日志：按 ids 批量删除（前端手动勾选）或按保留天数清理旧日志（二选一）.
     *
     * <p>路径落在 /api/admin/**，复用 SessionGuard 认证拦截（仅登录用户可调用，
     * 前端 role=admin 守卫保证只有管理员能看到删除入口）。删除条数以 deleted 返回。
     *
     * <p>⚠️ 生产网关（公司 nginx 容器）仅允许 GET/POST，故此处用 @PostMapping
     * 而非 @DeleteMapping，避免 405 Method Not Allowed。
     */
    @PostMapping("operation-log/delete")
    public Result<Map<String, Integer>> deleteOperationLogs(@RequestBody OperationLogCleanupReq req) {
        int deleted = operationLogService.delete(req);
        return Result.success(Map.of("deleted", deleted));
    }

    /** 设置用户管理员标志 */
    @PostMapping("users/{id}")
    public Result<Void> setUserAdmin(
            @PathVariable("id") String id,
            @RequestBody SetUserAdminReq req) {
        service.setUserAdmin(id, req.isAdmin());
        return Result.success(null);
    }

    /** 删除用户（级联清理） */
    @PostMapping("users/{id}/delete")
    public Result<AdminDeleteUserResult> deleteUser(@PathVariable("id") String id) {
        return Result.success(service.deleteUser(null, id));
    }

    /** 全量组件列表（支持 search / sortBy / page / pageSize） */
    @GetMapping("components")
    public Result<AdminComponentPage> listComponents(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String sortBy,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "12") int pageSize) {
        return Result.success(service.listComponents(search, sortBy, page, pageSize));
    }

    // ==================== 组件 CRUD ====================

    /** 组件详情 */
    @GetMapping("components/{id}")
    public Result<Map<String, Object>> getComponentDetail(@PathVariable("id") String id) {
        ComponentDocument c = componentService.getComponentById(id, null);
        HashMap<String, Object> m = new HashMap<>();
        safePut(m, "_id", c.getId());
        safePut(m, "componentId", c.getComponentId());
        safePut(m, "name", c.getName());
        safePut(m, "description", c.getDescription());
        safePut(m, "target", c.getTarget());
        safePut(m, "groupId", c.getGroupId());
        safePut(m, "creatorId", c.getCreatorId());
        safePut(m, "metadata", c.getMetadata() != null ? c.getMetadata() : Map.of());
        safePut(m, "createdAt", c.getCreatedAt());
        safePut(m, "updatedAt", c.getUpdatedAt());
        return Result.success(m);
    }

    /** 创建组件（管理员操作） */
    @PostMapping("components")
    public Result<Map<String, Object>> createComponent(@RequestBody CreateComponentRequest req) {
        if (req.getCreatorId() == null) throw new BizException(400, "creatorId 不能为空");
        if (req.getGroupId() == null) throw new BizException(400, "groupId 不能为空");
        ComponentDocument c = componentService.createComponent(
                req.getName(), req.getDescription(), req.getGroupId(),
                req.getCreatorId(), req.getMetadata());
        HashMap<String, Object> m = new HashMap<>();
        safePut(m, "_id", c.getId());
        safePut(m, "name", c.getName());
        safePut(m, "groupId", c.getGroupId());
        safePut(m, "creatorId", c.getCreatorId());
        safePut(m, "createdAt", c.getCreatedAt());
        return Result.success(m);
    }

    /** 更新组件 */
    @PostMapping("components/{id}")
    public Result<Map<String, Object>> updateComponent(
            @PathVariable("id") String id,
            @RequestBody Map<String, Object> updates) {
        ComponentDocument c = componentService.updateComponent(id, updates, null);
        HashMap<String, Object> m = new HashMap<>();
        safePut(m, "_id", c != null ? c.getId() : null);
        safePut(m, "name", c != null ? c.getName() : null);
        safePut(m, "updatedAt", c != null ? c.getUpdatedAt() : null);
        return Result.success(m);
    }

    /** 删除组件 */
    @PostMapping("components/{id}/delete")
    public Result<Map<String, Object>> deleteComponent(@PathVariable("id") String id) {
        componentService.deleteComponent(id, null);
        return Result.success(Map.of("deleted", true));
    }

    /** 批量删除组件 */
    @PostMapping("components/batch-delete")
    public Result<Map<String, Integer>> batchDeleteComponents(@RequestBody BatchDeleteRequest req) {
        Map<String, Integer> result = componentService.batchDeleteComponents(req.getComponentIds(), null);
        return Result.success(result);
    }

    private void safePut(HashMap<String, Object> map, String key, Object value) {
        if (value != null) map.put(key, value);
    }
}