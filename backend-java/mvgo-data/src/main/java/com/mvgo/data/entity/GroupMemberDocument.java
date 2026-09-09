package com.mvgo.data.entity;

import java.util.Date;
import java.util.List;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

/**
 * 群组成员文档（对应 group_members 集合）.
 *
 * @since 1.0.0
 */
@Document(collection = "group_members")
public class GroupMemberDocument {

    @Id
    private String id;

    @Field("groupId")
    private String groupId;

    @Field("userId")
    private String userId;

    /** 角色：admin / member */
    @Field("role")
    private String role;

    @Field("permissions")
    private List<String> permissions;

    @Field("joinedAt")
    private Date joinedAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getGroupId() { return groupId; }
    public void setGroupId(String groupId) { this.groupId = groupId; }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public List<String> getPermissions() { return permissions; }
    public void setPermissions(List<String> permissions) { this.permissions = permissions; }

    public Date getJoinedAt() { return joinedAt; }
    public void setJoinedAt(Date joinedAt) { this.joinedAt = joinedAt; }
}