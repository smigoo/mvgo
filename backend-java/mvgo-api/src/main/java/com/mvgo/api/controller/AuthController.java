package com.mvgo.api.controller;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.mvgo.business.service.GroupService;
import com.mvgo.business.util.PasswordUtil;
import com.mvgo.common.BizException;
import com.mvgo.common.Result;
import com.mvgo.data.entity.GroupMemberDocument;
import com.mvgo.data.entity.UserDocument;
import com.mvgo.data.repository.GroupMemberRepository;
import com.mvgo.data.repository.GroupRepository;
import com.mvgo.data.repository.UserRepository;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.web.bind.annotation.*;

/**
 * 认证接口（迁自 Node AuthController）.
 *
 * <p>完整迁移：current / register / login / logout / change-password.
 * 密码使用 PBKDF2WithHmacSHA256（{java-pbkdf2} 前缀区分 Node bcrypt）.
 *
 * @since 1.0.0
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final List<String> DEFAULT_PERMISSIONS = List.of(
            "component:create", "component:read", "component:update", "component:delete",
            "project:create", "project:read", "project:update", "project:delete",
            "group:manage", "group:invite", "group:member.remove"
    );

    private final UserRepository userRepo;
    private final GroupMemberRepository memberRepo;
    private final GroupRepository groupRepo;
    private final GroupService groupService;
    private final MongoTemplate mongoTemplate;

    public AuthController(UserRepository userRepo, GroupMemberRepository memberRepo,
                          GroupRepository groupRepo, GroupService groupService,
                          MongoTemplate mongoTemplate) {
        this.userRepo = userRepo;
        this.memberRepo = memberRepo;
        this.groupRepo = groupRepo;
        this.groupService = groupService;
        this.mongoTemplate = mongoTemplate;
    }

    /** 获取当前登录用户信息（对齐 Node auth/current） */
    @GetMapping("current")
    public Result<Map<String, Object>> current(HttpServletRequest request) {
        String loginId = (String) request.getAttribute("userId"); // uid from SessionGuard
        if (loginId == null) {
            throw new BizException(401, "未登录或登录已过期");
        }

        // 按 uid 查找用户（SessionGuard 存的是门户 uid，不是 MongoDB _id）
        Query userQuery = new Query(new Criteria().orOperator(
                Criteria.where("uid").is(loginId),
                Criteria.where("username").is(loginId)
        ));
        UserDocument user = mongoTemplate.findOne(userQuery, UserDocument.class);
        if (user == null) {
            throw new BizException(401, "用户不存在");
        }
        String mongoUserId = user.getId();

        Map<String, Object> data = new HashMap<>();

        // 用户信息
        Map<String, Object> userInfo = new HashMap<>();
        userInfo.put("id", user.getId());
        userInfo.put("uid", user.getUid());
        userInfo.put("username", user.getUsername());
        userInfo.put("email", user.getEmail() != null ? user.getEmail() : "");
        userInfo.put("isAdmin", Boolean.TRUE.equals(user.getIsAdmin()));
        data.put("user", userInfo);

        // 用户群组（取第一个）
        List<GroupMemberDocument> memberships = memberRepo.findByUserId(mongoUserId);
        if (!memberships.isEmpty()) {
            String groupId = memberships.get(0).getGroupId();
            groupRepo.findById(groupId).ifPresent(group -> {
                Map<String, Object> groupInfo = new HashMap<>();
                groupInfo.put("id", group.getId());
                groupInfo.put("name", group.getName());
                data.put("group", groupInfo);
            });
        }

        // 角色口径（坑#13 收口）：系统管理员（user.isAdmin=true）才返回 admin；
        // 群组角色（含私人工作空间 owner/admin）仅用于组内权限，绝不晋升为系统角色，
        // 否则每个新建门户用户都会被错判为系统管理员（可见操作日志/用户管理）。
        if (Boolean.TRUE.equals(user.getIsAdmin())) {
            data.put("role", "admin");
        } else {
            data.put("role", "member");
        }

        data.put("permissions", DEFAULT_PERMISSIONS);
        return Result.success(data);
    }

    // ==================== 注册 / 登录 / 登出 / 改密 ====================

    @PostMapping("register")
    public Result<Map<String, Object>> register(@RequestBody Map<String, Object> body) {
        String username = (String) body.get("username");
        String password = (String) body.get("password");
        if (username == null || password == null) {
            throw new BizException(400, "用户名和密码不能为空");
        }

        UserDocument existing = userRepo.findByUsername(username);
        if (existing != null) throw new BizException(409, "用户名已存在");

        try {
            UserDocument user = new UserDocument();
            user.setUsername(username);
            user.setEmail((String) body.getOrDefault("email", ""));
            user.setPassword(PasswordUtil.hash(password));
            user.setCreatedAt(new java.util.Date());
            user.setUpdatedAt(new java.util.Date());
            user = userRepo.save(user);

            // 创建用户私有群组
            groupService.createGroup("私人空间:" + username, "自动创建的私人空间", user.getId());

            Map<String, Object> result = new HashMap<>();
            result.put("id", user.getId());
            result.put("username", user.getUsername());
            result.put("email", user.getEmail());
            return Result.success(result);
        } catch (BizException e) { throw e;
        } catch (Exception e) {
            throw new BizException(500, "注册失败: " + e.getMessage());
        }
    }

    @PostMapping("login")
    public Result<Map<String, Object>> login(@RequestBody Map<String, Object> body) {
        String username = (String) body.get("username");
        String password = (String) body.get("password");
        if (username == null || password == null) {
            throw new BizException(400, "用户名和密码不能为空");
        }

        UserDocument user = userRepo.findByUsername(username);
        if (user == null || user.getPassword() == null) {
            throw new BizException(401, "用户名或密码错误");
        }
        if (!PasswordUtil.verify(password, user.getPassword())) {
            throw new BizException(401, "用户名或密码错误");
        }

        Map<String, Object> result = new HashMap<>();
        result.put("id", user.getId());
        result.put("username", user.getUsername());
        result.put("email", user.getEmail());
        return Result.success(result);
    }

    @PostMapping("logout")
    public Result<Map<String, String>> logout() {
        return Result.success(Map.of("message", "登出成功"));
    }

    @PostMapping("change-password")
    public Result<Map<String, String>> changePassword(@RequestBody Map<String, Object> body) {
        String username = (String) body.get("username");
        String oldPassword = (String) body.get("oldPassword");
        String newPassword = (String) body.get("newPassword");
        if (username == null || oldPassword == null || newPassword == null) {
            throw new BizException(400, "参数不完整");
        }

        UserDocument user = userRepo.findByUsername(username);
        if (user == null) throw new BizException(401, "用户不存在");
        if (!PasswordUtil.verify(oldPassword, user.getPassword())) {
            throw new BizException(401, "原密码不正确");
        }

        try {
            user.setPassword(PasswordUtil.hash(newPassword));
            user.setUpdatedAt(new java.util.Date());
            userRepo.save(user);
            return Result.success(Map.of("message", "密码修改成功"));
        } catch (Exception e) {
            throw new BizException(500, "密码修改失败");
        }
    }
}