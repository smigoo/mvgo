package com.mvgo.data.entity;

import java.util.Date;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

/**
 * 每用户 AI 配置（对齐 Node UserAiConfig schema，集合 user_ai_configs）.
 *
 * <p>明文不落库：{@link #configEnc} 为 AES-256-GCM 密文（{@code iv.tag.data} 三段 base64，
 * 由 Node 侧 {@code src/common/crypto/field-encryption.ts} 写入，密钥 {@code FIELD_ENCRYPTION_KEY}）。
 * Java 侧仅做只读展示（管理后台 ai-configs），解密见 mvgo-common FieldCipher。
 *
 * @since 1.0.0
 */
@Document(collection = "user_ai_configs")
public class UserAiConfigDocument {

    @Id
    private String id;

    /** 所属用户 _id（Mongo 中为 ObjectId，映射为 hex 字符串） */
    @Field("userId")
    private String userId;

    /** 加密配置载荷：base64(iv).base64(tag).base64(ciphertext) */
    @Field("configEnc")
    private String configEnc;

    @Field("createdAt")
    private Date createdAt;

    @Field("updatedAt")
    private Date updatedAt;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getConfigEnc() {
        return configEnc;
    }

    public void setConfigEnc(String configEnc) {
        this.configEnc = configEnc;
    }

    public Date getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Date createdAt) {
        this.createdAt = createdAt;
    }

    public Date getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Date updatedAt) {
        this.updatedAt = updatedAt;
    }
}
