package com.mvgo.data.entity;

import java.util.Date;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

/**
 * 群组文档（对应 groups 集合，与 Node 端同一 MongoDB 库）.
 *
 * @since 1.0.0
 */
@Document(collection = "groups")
public class GroupDocument {

    @Id
    private String id;

    @Field("name")
    private String name;

    @Field("description")
    private String description;

    /** 群组管理员 ID（ObjectId 字符串，关联 User） */
    @Field("adminId")
    private String adminId;

    @Field("createdAt")
    private Date createdAt;

    @Field("updatedAt")
    private Date updatedAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getAdminId() { return adminId; }
    public void setAdminId(String adminId) { this.adminId = adminId; }

    public Date getCreatedAt() { return createdAt; }
    public void setCreatedAt(Date createdAt) { this.createdAt = createdAt; }

    public Date getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Date updatedAt) { this.updatedAt = updatedAt; }
}