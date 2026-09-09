package com.mvgo.api.controller;

import java.util.List;
import java.util.Map;

import com.mvgo.business.service.GroupService;
import com.mvgo.common.Result;

import org.springframework.web.bind.annotation.*;

/**
 * 群组管理接口（迁自 Node GroupController）.
 *
 * @since 1.0.0
 */
@RestController
@RequestMapping("/api/group")
public class GroupController {

    private final GroupService groupService;

    public GroupController(GroupService groupService) {
        this.groupService = groupService;
    }

    /** 创建群组 */
    @PostMapping
    public Result<Map<String, Object>> createGroup(@RequestBody Map<String, Object> body) {
        String name = (String) body.get("name");
        String description = (String) body.get("description");
        String adminId = (String) body.get("adminId");
        return Result.success(groupService.createGroup(name, description, adminId));
    }

    /** 获取用户所属群组列表 */
    @GetMapping
    public Result<List<Map<String, Object>>> getUserGroups(@RequestParam("userId") String userId) {
        return Result.success(groupService.getUserGroups(userId));
    }

    /** 获取群组详情 */
    @GetMapping("{groupId}")
    public Result<Map<String, Object>> getGroupDetails(
            @PathVariable String groupId,
            @RequestParam("userId") String userId) {
        return Result.success(groupService.getGroupDetails(groupId, userId));
    }

    /** 邀请用户 */
    @PostMapping("{groupId}/invite")
    public Result<Map<String, Object>> inviteUser(
            @PathVariable String groupId,
            @RequestBody Map<String, Object> body) {
        String email = (String) body.get("email");
        String inviterId = (String) body.get("inviterId");
        return Result.success(groupService.inviteUser(groupId, email, inviterId));
    }

    /** 移除成员 */
    @PostMapping("{groupId}/members/{userId}/delete")
    public Result<Void> removeMember(
            @PathVariable String groupId,
            @PathVariable("userId") String memberUserId,
            @RequestParam("operatorId") String operatorId) {
        groupService.removeMember(groupId, memberUserId, operatorId);
        return Result.success(null);
    }

    /** 更新群组 */
    @PostMapping("{groupId}")
    public Result<Map<String, Object>> updateGroup(
            @PathVariable String groupId,
            @RequestBody Map<String, Object> updates,
            @RequestParam("userId") String userId) {
        var group = groupService.updateGroup(groupId, updates, userId);
        return Result.success(Map.of("_id", group.getId(), "name", group.getName(), "updatedAt", group.getUpdatedAt()));
    }

    /** 删除群组 */
    @PostMapping("{groupId}/delete")
    public Result<Void> deleteGroup(
            @PathVariable String groupId,
            @RequestParam("userId") String userId) {
        groupService.deleteGroup(groupId, userId);
        return Result.success(null);
    }

    /** 更新成员权限 */
    @PostMapping("{groupId}/members/{userId}/permissions")
    public Result<Map<String, Object>> updateMemberPermissions(
            @PathVariable String groupId,
            @PathVariable("userId") String memberUserId,
            @RequestBody Map<String, Object> body) {
        String operatorId = (String) body.get("operatorId");
        @SuppressWarnings("unchecked")
        List<String> permissions = (List<String>) body.get("permissions");
        return Result.success(groupService.updateMemberPermissions(groupId, memberUserId, permissions, operatorId));
    }

    /** 获取成员权限 */
    @GetMapping("{groupId}/members/{userId}/permissions")
    public Result<Map<String, Object>> getMemberPermissions(
            @PathVariable String groupId,
            @PathVariable("userId") String memberUserId) {
        return Result.success(groupService.getMemberPermissions(groupId, memberUserId));
    }
}