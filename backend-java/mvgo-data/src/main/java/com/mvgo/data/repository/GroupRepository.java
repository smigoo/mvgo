package com.mvgo.data.repository;

import java.util.List;

import com.mvgo.data.entity.GroupDocument;

import org.springframework.data.mongodb.repository.MongoRepository;

public interface GroupRepository extends MongoRepository<GroupDocument, String> {

    /** 查找用户管理的群组 */
    List<GroupDocument> findByAdminId(String adminId);
}