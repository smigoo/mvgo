package com.mvgo.business.dto;

import java.util.Date;
import java.util.Map;

/**
 * 管理后台「每用户 AI 配置」列表项（对齐 Node AdminService.listUserConfigs 输出）.
 *
 * <p>密钥类字段掩码后放 {@code config.secrets}，非密钥模型字段明文放 {@code config.plain}，
 * 结构：{@code config: { secrets: {...}, plain: {...} }}。
 *
 * @since 1.0.0
 */
public class AdminAiConfigVO {

    /** 用户 _id（hex） */
    private String userId;

    /** 登录用户名 */
    private String username;

    /** 展示名（portalInfo.name 优先，回退 username） */
    private String displayName;

    /** 门户 uid */
    private String uid;

    /** 最近一次保存时间 */
    private Date updatedAt;

    /** 脱敏后的配置视图：{@code { secrets: {...掩码}, plain: {...明文} }} */
    private Map<String, Object> config;

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public String getUid() {
        return uid;
    }

    public void setUid(String uid) {
        this.uid = uid;
    }

    public Date getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Date updatedAt) {
        this.updatedAt = updatedAt;
    }

    public Map<String, Object> getConfig() {
        return config;
    }

    public void setConfig(Map<String, Object> config) {
        this.config = config;
    }
}
