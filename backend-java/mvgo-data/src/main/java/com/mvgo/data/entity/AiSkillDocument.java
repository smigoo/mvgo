package com.mvgo.data.entity;

import java.util.Date;
import java.util.List;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

@Document(collection = "ai_skills")
public class AiSkillDocument {

    @Id
    private String id;

    @Field("name")
    private String name;

    @Field("description")
    private String description;

    @Field("promptTemplate")
    private String promptTemplate;

    @Field("type")
    private String type;

    @Field("visibility")
    private String visibility;

    @Field("ownerUserId")
    private String ownerUserId;

    @Field("groupIds")
    private List<String> groupIds;

    @Field("status")
    private String status;

    @Field("sortOrder")
    private Integer sortOrder;

    @Field("reviewRequired")
    private Boolean reviewRequired;

    @Field("reviewedBy")
    private String reviewedBy;

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
    public String getPromptTemplate() { return promptTemplate; }
    public void setPromptTemplate(String promptTemplate) { this.promptTemplate = promptTemplate; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public String getVisibility() { return visibility; }
    public void setVisibility(String visibility) { this.visibility = visibility; }
    public String getOwnerUserId() { return ownerUserId; }
    public void setOwnerUserId(String ownerUserId) { this.ownerUserId = ownerUserId; }
    public List<String> getGroupIds() { return groupIds; }
    public void setGroupIds(List<String> groupIds) { this.groupIds = groupIds; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
    public Boolean getReviewRequired() { return reviewRequired; }
    public void setReviewRequired(Boolean reviewRequired) { this.reviewRequired = reviewRequired; }
    public String getReviewedBy() { return reviewedBy; }
    public void setReviewedBy(String reviewedBy) { this.reviewedBy = reviewedBy; }
    public Date getCreatedAt() { return createdAt; }
    public void setCreatedAt(Date createdAt) { this.createdAt = createdAt; }
    public Date getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Date updatedAt) { this.updatedAt = updatedAt; }
}