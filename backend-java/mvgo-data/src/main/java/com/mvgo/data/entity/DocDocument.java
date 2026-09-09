package com.mvgo.data.entity;

import java.util.Date;
import java.util.List;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

/**
 * 文档实体（对应 documents 集合）.
 * 注意：类名不用 Document 以避免与 org.bson.Document 冲突.
 */
@org.springframework.data.mongodb.core.mapping.Document(collection = "documents")
public class DocDocument {

    @Id
    private String id;

    @Field("title")
    private String title;

    @Field("content")
    private String content;

    @Field("type")
    private String type;

    @Field("ownerId")
    private String ownerId;

    @Field("groupId")
    private String groupId;

    @Field("visibility")
    private String visibility;

    @Field("tags")
    private List<String> tags;

    @Field("status")
    private String status;

    @Field("lastEditedBy")
    private String lastEditedBy;

    @Field("createdAt")
    private Date createdAt;

    @Field("updatedAt")
    private Date updatedAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public String getOwnerId() { return ownerId; }
    public void setOwnerId(String ownerId) { this.ownerId = ownerId; }
    public String getGroupId() { return groupId; }
    public void setGroupId(String groupId) { this.groupId = groupId; }
    public String getVisibility() { return visibility; }
    public void setVisibility(String visibility) { this.visibility = visibility; }
    public List<String> getTags() { return tags; }
    public void setTags(List<String> tags) { this.tags = tags; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getLastEditedBy() { return lastEditedBy; }
    public void setLastEditedBy(String lastEditedBy) { this.lastEditedBy = lastEditedBy; }
    public Date getCreatedAt() { return createdAt; }
    public void setCreatedAt(Date createdAt) { this.createdAt = createdAt; }
    public Date getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Date updatedAt) { this.updatedAt = updatedAt; }
}