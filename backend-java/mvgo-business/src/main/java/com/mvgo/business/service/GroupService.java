package com.mvgo.business.service;

import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.mvgo.common.BizException;
import com.mvgo.data.entity.ComponentDocument;
import com.mvgo.data.entity.GroupDocument;
import com.mvgo.data.entity.GroupMemberDocument;
import com.mvgo.data.entity.UserDocument;
import com.mvgo.data.repository.ComponentRepository;
import com.mvgo.data.repository.GroupMemberRepository;
import com.mvgo.data.repository.GroupRepository;
import com.mvgo.data.repository.UserRepository;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 群组管理服务（对齐 Node group.service）.
 *
 * @since 1.0.0
 */
@Service
public class GroupService {

    private final GroupRepository groupRepo;
    private final GroupMemberRepository memberRepo;
    private final UserRepository userRepo;
    private final ComponentRepository componentRepo;
    private final MongoTemplate mongoTemplate;

    private static final Logger logger = LoggerFactory.getLogger(GroupService.class);

    public GroupService(GroupRepository groupRepo, GroupMemberRepository memberRepo,
                        UserRepository userRepo, ComponentRepository componentRepo,
                        MongoTemplate mongoTemplate) {
        this.groupRepo = groupRepo;
        this.memberRepo = memberRepo;
        this.userRepo = userRepo;
        this.componentRepo = componentRepo;
        this.mongoTemplate = mongoTemplate;
    }

    /** 创建群组（同时添加创建者为管理员成员） */
    @Transactional
    public Map<String, Object> createGroup(String name, String description, String adminId) {
        GroupDocument group = new GroupDocument();
        group.setName(name);
        group.setDescription(description != null ? description : "");
        group.setAdminId(adminId);
        group.setCreatedAt(new Date());
        group.setUpdatedAt(new Date());
        group = groupRepo.save(group);

        GroupMemberDocument member = new GroupMemberDocument();
        member.setGroupId(group.getId());
        member.setUserId(adminId);
        member.setRole("admin");
        member.setPermissions(new ArrayList<>());
        member.setJoinedAt(new Date());
        memberRepo.save(member);

        Map<String, Object> result = new HashMap<>();
        result.put("_id", group.getId());
        result.put("name", group.getName());
        result.put("description", group.getDescription());
        result.put("adminId", group.getAdminId());
        result.put("createdAt", group.getCreatedAt());
        result.put("memberCount", 1);
        return result;
    }

    /**
     * 确保门户用户拥有一个私人默认工作空间（组）.
     *
     * <p>背景：门户/扫码用户首次登录时 MongoDB 里没有 User + GroupMember，
     * 导致 {@code AuthController.current} 返 401 "用户不存在"，
     * 触发前端 {@code isPermission(1)} → {@code reloadParentForReauth} 死循环。
     * 本方法等价 Node {@code AuthService.ensureUserPrivateGroup}，幂等 upsert。
     *
     * @param uid         门户用户唯一标识
     * @param adminUserId 本地 users._id（String hex）
     * @param displayName 门户返回的展示名（仅用于日志）
     * @return 私人工作空间文档（新建或已存在）
     */
    @Transactional
    public GroupDocument ensureUserPrivateGroup(String uid, String adminUserId, String displayName) {
        String name = "私人空间:" + uid;
        Date now = new Date();

        // 幂等 upsert 私人组（按 name 定位）
        Query gq = new Query(Criteria.where("name").is(name));
        Update gu = new Update()
                .setOnInsert("name", name)
                .setOnInsert("description", "系统自动创建的私人工作空间")
                .setOnInsert("adminId", adminUserId)
                .setOnInsert("createdAt", now)
                .set("updatedAt", now);
        GroupDocument group = mongoTemplate.findAndModify(
                gq, gu,
                FindAndModifyOptions.options().upsert(true).returnNew(true),
                GroupDocument.class);
        if (group == null) {
            // 极端并发 upsert 偶发返 null，回退 findOne
            group = mongoTemplate.findOne(gq, GroupDocument.class);
        }
        if (group == null) {
            GroupDocument g = new GroupDocument();
            g.setName(name);
            g.setDescription("系统自动创建的私人工作空间");
            g.setAdminId(adminUserId);
            g.setCreatedAt(now);
            g.setUpdatedAt(now);
            group = groupRepo.save(g);
        }

        // 幂等 upsert 管理员成员（groupId+userId 唯一），role=admin 供 AuthController.current 取角色
        Query mq = new Query(Criteria.where("groupId").is(group.getId()).and("userId").is(adminUserId));
        Update mu = new Update()
                .setOnInsert("role", "admin")
                .setOnInsert("joinedAt", now)
                .set("permissions", new ArrayList<String>());
        mongoTemplate.upsert(mq, mu, GroupMemberDocument.class);

        logger.info("✅ 已为门户用户 {} (uid={}) 确保私人工作空间 ({})", displayName, uid, group.getId());
        return group;
    }

    /** 获取用户所属群组列表（含成员数） */
    public List<Map<String, Object>> getUserGroups(String userId) {
        List<GroupMemberDocument> memberships = memberRepo.findByUserId(userId);
        List<Map<String, Object>> result = new ArrayList<>();
        for (GroupMemberDocument m : memberships) {
            groupRepo.findById(m.getGroupId()).ifPresent(group -> {
                long memberCount = memberRepo.findByGroupId(group.getId()).size();
                Map<String, Object> item = new HashMap<>();
                item.put("_id", group.getId());
                item.put("name", group.getName());
                item.put("description", group.getDescription());
                item.put("adminId", group.getAdminId());
                item.put("role", m.getRole());
                item.put("memberCount", (int) memberCount);
                item.put("createdAt", group.getCreatedAt());
                result.add(item);
            });
        }
        return result;
    }

    /** 获取群组详情（含所有成员信息） */
    public Map<String, Object> getGroupDetails(String groupId, String userId) {
        GroupDocument group = groupRepo.findById(groupId)
                .orElseThrow(() -> new BizException(404, "群组不存在"));

        // 校验用户是否成员
        GroupMemberDocument membership = memberRepo.findByGroupIdAndUserId(groupId, userId);
        if (membership == null) {
            throw new BizException(403, "无权访问此群组");
        }

        List<GroupMemberDocument> members = memberRepo.findByGroupId(groupId);
        List<Map<String, Object>> memberList = new ArrayList<>();
        for (GroupMemberDocument m : members) {
            Map<String, Object> mi = new HashMap<>();
            mi.put("_id", m.getId());
            mi.put("userId", m.getUserId());
            mi.put("role", m.getRole());
            mi.put("permissions", m.getPermissions());
            mi.put("joinedAt", m.getJoinedAt());
            userRepo.findById(m.getUserId()).ifPresent(user -> {
                mi.put("username", user.getUsername());
                mi.put("email", user.getEmail());
                mi.put("name", user.getUsername());
            });
            memberList.add(mi);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("_id", group.getId());
        result.put("name", group.getName());
        result.put("description", group.getDescription());
        result.put("adminId", group.getAdminId());
        result.put("createdAt", group.getCreatedAt());
        result.put("members", memberList);
        return result;
    }

    /** 邀请用户加入群组（通过 email 查找用户） */
    @Transactional
    public Map<String, Object> inviteUser(String groupId, String email, String inviterId) {
        GroupDocument group = groupRepo.findById(groupId)
                .orElseThrow(() -> new BizException(404, "群组不存在"));

        // 通过 email 查找用户
        Query query = new Query(Criteria.where("email").is(email));
        UserDocument targetUser = mongoTemplate.findOne(query, UserDocument.class);
        if (targetUser == null) {
            throw new BizException(404, "用户不存在: " + email);
        }

        // 检查是否已是成员
        GroupMemberDocument existing = memberRepo.findByGroupIdAndUserId(groupId, targetUser.getId());
        if (existing != null) {
            throw new BizException(400, "用户已是群组成员");
        }

        GroupMemberDocument member = new GroupMemberDocument();
        member.setGroupId(groupId);
        member.setUserId(targetUser.getId());
        member.setRole("member");
        member.setPermissions(new ArrayList<>());
        member.setJoinedAt(new Date());
        member = memberRepo.save(member);

        long memberCount = memberRepo.findByGroupId(groupId).size();

        Map<String, Object> result = new HashMap<>();
        result.put("member", Map.of(
                "_id", member.getId(),
                "userId", member.getUserId(),
                "role", member.getRole(),
                "joinedAt", member.getJoinedAt()
        ));
        result.put("memberCount", (int) memberCount);
        result.put("message", "用户已邀请");
        return result;
    }

    /** 移除成员 */
    @Transactional
    public void removeMember(String groupId, String memberUserId, String operatorId) {
        GroupDocument group = groupRepo.findById(groupId)
                .orElseThrow(() -> new BizException(404, "群组不存在"));

        // 仅管理员可移除
        GroupMemberDocument operator = memberRepo.findByGroupIdAndUserId(groupId, operatorId);
        if (operator == null || !"admin".equals(operator.getRole())) {
            throw new BizException(403, "仅群组管理员可移除成员");
        }

        GroupMemberDocument target = memberRepo.findByGroupIdAndUserId(groupId, memberUserId);
        if (target == null) {
            throw new BizException(404, "成员不存在");
        }

        memberRepo.delete(target);
    }

    /** 更新群组信息 */
    public GroupDocument updateGroup(String groupId, Map<String, Object> updates, String userId) {
        GroupDocument group = groupRepo.findById(groupId)
                .orElseThrow(() -> new BizException(404, "群组不存在"));

        // 仅管理员可更新
        GroupMemberDocument membership = memberRepo.findByGroupIdAndUserId(groupId, userId);
        if (membership == null || !"admin".equals(membership.getRole())) {
            throw new BizException(403, "仅群组管理员可修改");
        }

        if (updates.containsKey("name")) {
            group.setName((String) updates.get("name"));
        }
        if (updates.containsKey("description")) {
            group.setDescription((String) updates.get("description"));
        }
        group.setUpdatedAt(new Date());
        return groupRepo.save(group);
    }

    /** 删除群组（级联删除组件 + 成员） */
    @Transactional
    public void deleteGroup(String groupId, String userId) {
        GroupDocument group = groupRepo.findById(groupId)
                .orElseThrow(() -> new BizException(404, "群组不存在"));

        // 仅管理员可删除
        GroupMemberDocument membership = memberRepo.findByGroupIdAndUserId(groupId, userId);
        if (membership == null || !"admin".equals(membership.getRole())) {
            throw new BizException(403, "仅群组管理员可删除");
        }

        // 级联删除群组的组件
        List<ComponentDocument> components = componentRepo.findByGroupIdOrderByCreatedAtDesc(groupId);
        componentRepo.deleteAll(components);

        // 删除所有成员
        memberRepo.deleteByGroupId(groupId);

        // 删除群组
        groupRepo.delete(group);
    }

    /** 更新成员权限 */
    public Map<String, Object> updateMemberPermissions(String groupId, String memberUserId,
                                                        List<String> permissions, String operatorId) {
        GroupDocument group = groupRepo.findById(groupId)
                .orElseThrow(() -> new BizException(404, "群组不存在"));

        GroupMemberDocument operator = memberRepo.findByGroupIdAndUserId(groupId, operatorId);
        if (operator == null || !"admin".equals(operator.getRole())) {
            throw new BizException(403, "仅群组管理员可修改权限");
        }

        GroupMemberDocument target = memberRepo.findByGroupIdAndUserId(groupId, memberUserId);
        if (target == null) {
            throw new BizException(404, "成员不存在");
        }

        target.setPermissions(permissions != null ? permissions : new ArrayList<>());
        memberRepo.save(target);

        return Map.of("success", true, "permissions", target.getPermissions());
    }

    /** 获取成员权限 */
    public Map<String, Object> getMemberPermissions(String groupId, String memberUserId) {
        GroupMemberDocument member = memberRepo.findByGroupIdAndUserId(groupId, memberUserId);
        if (member == null) {
            throw new BizException(404, "成员不存在");
        }
        return Map.of("permissions", member.getPermissions() != null ? member.getPermissions() : List.of());
    }
}