package com.mvgo.data.repository;

import java.util.List;

import com.mvgo.data.entity.ComponentDocument;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

/**
 * 生成组件 Repository（对应 components 集合）.
 *
 * @since 1.0.0
 */
@Repository
public interface ComponentRepository extends MongoRepository<ComponentDocument, String> {

    /**
     * 按群组 ID 查询组件列表（降序，最新创建优先）。
     *
     * @param groupId 群组 ID
     * @return 组件列表
     */
    List<ComponentDocument> findByGroupIdOrderByCreatedAtDesc(String groupId);

    /**
     * 按创建者 ID 查询组件列表（降序，最新创建优先）。
     *
     * @param creatorId 创建者 ID
     * @return 组件列表
     */
    List<ComponentDocument> findByCreatorIdOrderByCreatedAtDesc(String creatorId);

    /**
     * 按群组和创建者查询组件列表（降序）。
     *
     * @param groupId   群组 ID
     * @param creatorId 创建者 ID
     * @return 组件列表
     */
    List<ComponentDocument> findByGroupIdAndCreatorIdOrderByCreatedAtDesc(String groupId, String creatorId);
}
